import type {
  Exhibit,
  Content,
  ContentVersion,
  ExhibitsResponse,
  ContentsResponse,
  VersionsResponse,
  ContentPackage,
} from '../types/api';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

interface RetryOptions {
  retries?: number;
  backoff?: number;
  timeout?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  retries: 3,
  backoff: 1000,
  timeout: 30000,
};

async function request<T>(path: string, opts?: RequestInit, retryOpts: RetryOptions = {}): Promise<T> {
  const { retries, backoff, timeout } = { ...DEFAULT_OPTIONS, ...retryOpts };

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(`${BASE}${path}`, {
        ...opts,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (res.status === 429) {
        throw Object.assign(new Error('请求过于频繁，请稍后再试'), { status: 429 });
      }

      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error('权限不足或登录已过期'), { status: res.status });
      }

      if (res.status === 404) {
        throw Object.assign(new Error('请求的资源不存在'), { status: 404 });
      }

      if (!res.ok && attempt < retries) {
        const delay = backoff * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        let msg = `请求失败 (${res.status})`;
        try {
          const errBody = await res.json();
          if (errBody.detail) msg = String(errBody.detail);
          else if (errBody.message) msg = String(errBody.message);
        } catch { /* ignore parse errors */ }
        throw Object.assign(new Error(msg), { status: res.status });
      }

      return res.json() as Promise<T>;
    } catch (e) {
      clearTimeout(timer);

      if (attempt < retries && !(e as Record<string, unknown>).status) {
        const delay = backoff * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw e;
    }
  }

  throw new Error('Unexpected retry loop exit');
}

// ─────────────────────────────────────────────────────────────────
// Exhibits
// ─────────────────────────────────────────────────────────────────

export async function listExhibits(category = ''): Promise<ExhibitsResponse> {
  const q = category ? `?category=${encodeURIComponent(category)}` : '';
  return request<ExhibitsResponse>(`/cms/exhibits${q}`);
}

export async function createExhibit(data: {
  name: string;
  code?: string;
  description?: string;
  category?: string;
  digital_human_model?: string;
  default_language?: string;
  exhibit_video_filename?: string;
}): Promise<{ ok: boolean; exhibit: Exhibit }> {
  return request('/cms/exhibits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function getExhibit(id: string): Promise<Exhibit> {
  return request<Exhibit>(`/cms/exhibits/${id}`);
}

export async function updateExhibit(id: string, data: Partial<Exhibit>): Promise<{ ok: boolean }> {
  return request(`/cms/exhibits/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteExhibit(id: string): Promise<{ ok: boolean }> {
  return request(`/cms/exhibits/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────
// Contents
// ─────────────────────────────────────────────────────────────────

export async function listContents(params?: {
  exhibit_id?: string;
  language?: string;
  status?: string;
  category?: string;
  page?: number;
  size?: number;
}): Promise<ContentsResponse> {
  const p = new URLSearchParams();
  if (params?.exhibit_id) p.set('exhibit_id', params.exhibit_id);
  if (params?.language) p.set('language', params.language);
  if (params?.status) p.set('status', params.status);
  if (params?.category) p.set('category', params.category);
  if (params?.page) p.set('page', String(params.page));
  if (params?.size) p.set('size', String(params.size));
  const q = p.toString();
  return request<ContentsResponse>(`/cms/contents${q ? `?${q}` : ''}`);
}

export async function createContent(data: {
  title: string;
  body: string;
  exhibit_id?: string;
  language?: string;
  category?: string;
  tags?: string[];
  duration_sec?: number;
  status?: string;
  video_filename?: string;
}): Promise<{ ok: boolean; content: Content }> {
  return request('/cms/contents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function getContent(id: string): Promise<Content> {
  return request<Content>(`/cms/contents/${id}`);
}

export async function updateContent(id: string, data: Partial<Content>): Promise<{ ok: boolean }> {
  return request(`/cms/contents/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteContent(id: string): Promise<{ ok: boolean }> {
  return request(`/cms/contents/${id}`, { method: 'DELETE' });
}

export async function publishContent(
  id: string,
  change_summary = '',
): Promise<{ ok: boolean }> {
  return request(`/cms/contents/${id}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ change_summary }),
  });
}

export async function archiveContent(id: string): Promise<{ ok: boolean }> {
  return request(`/cms/contents/${id}/archive`, { method: 'POST' });
}

// ─────────────────────────────────────────────────────────────────
// Versions
// ─────────────────────────────────────────────────────────────────

export async function getContentVersions(contentId: string): Promise<VersionsResponse> {
  return request<VersionsResponse>(`/cms/contents/${contentId}/versions`);
}

export async function restoreContentVersion(
  contentId: string,
  version: number,
): Promise<{ ok: boolean }> {
  return request(`/cms/contents/${contentId}/restore/${version}`, { method: 'POST' });
}

// ─────────────────────────────────────────────────────────────────
// Batch Operations
// ─────────────────────────────────────────────────────────────────

export async function batchImport(data: {
  exhibits?: Array<{
    name: string;
    code?: string;
    description?: string;
    category?: string;
    digital_human_model?: string;
    default_language?: string;
  }>;
  contents?: Array<{
    title: string;
    body: string;
    exhibit_id?: string;
    language?: string;
    category?: string;
    tags?: string[];
    duration_sec?: number;
    status?: string;
  }>;
}): Promise<{ ok: boolean; imported_exhibits: number; imported_contents: number }> {
  return request('/cms/contents/batch-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function batchPublish(
  contentIds: string[],
): Promise<{ ok: boolean; published: number }> {
  return request('/cms/contents/batch-publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_ids: contentIds }),
  });
}

// ─────────────────────────────────────────────────────────────────
// Content Package Export
// ─────────────────────────────────────────────────────────────────

export async function exportContentPackage(
  exhibitIds?: string[],
): Promise<ContentPackage> {
  const p = new URLSearchParams();
  if (exhibitIds?.length) {
    exhibitIds.forEach((id) => p.append('exhibit_ids', id));
  }
  const q = p.toString();
  return request<ContentPackage>(`/cms/contents/export${q ? `?${q}` : ''}`);
}

// ─────────────────────────────────────────────────────────────────
// Demo / Sample data
// ─────────────────────────────────────────────────────────────────

export async function createDemo(): Promise<{ ok: boolean; message: string; exhibit_count: number; content_count: number }> {
  return request('/cms/demo', { method: 'POST' });
}

// ─────────────────────────────────────────────────────────────────
// Sync
// ─────────────────────────────────────────────────────────────────

export async function checkUpdates(since = 0): Promise<{
  exhibits: Exhibit[];
  contents: Content[];
  sync_timestamp: number;
}> {
  return request(`/cms/sync/check-updates?since=${since}`);
}

// ─────────────────────────────────────────────────────────────────
// File Uploads
// ─────────────────────────────────────────────────────────────────

export async function uploadExhibitImage(file: File, signal?: AbortSignal): Promise<{ filename: string; size: number }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/cms/upload/exhibit-image`, { method: 'POST', body: fd, signal });
  if (!res.ok) {
    let msg = `上传失败 (${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) msg = err.detail;
    } catch { /* use default */ }
    throw new Error(msg);
  }
  return res.json();
}

export async function uploadDigitalHuman(file: File, signal?: AbortSignal): Promise<{ filename: string; size: number }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/cms/upload/digital-human`, { method: 'POST', body: fd, signal });
  if (!res.ok) {
    let msg = `上传失败 (${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) msg = err.detail;
    } catch { /* use default */ }
    throw new Error(msg);
  }
  return res.json();
}

export async function uploadContentVideo(file: File, signal?: AbortSignal): Promise<{ filename: string; size: number }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/cms/upload/content-video`, { method: 'POST', body: fd, signal });
  if (!res.ok) {
    let msg = `上传失败 (${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) msg = err.detail;
    } catch { /* use default */ }
    throw new Error(msg);
  }
  return res.json();
}

export async function uploadExhibitVideo(file: File, signal?: AbortSignal): Promise<{ filename: string; size: number }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/cms/upload/exhibit-video`, { method: 'POST', body: fd, signal });
  if (!res.ok) {
    let msg = `上传失败 (${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) msg = err.detail;
    } catch { /* use default */ }
    throw new Error(msg);
  }
  return res.json();
}
