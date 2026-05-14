import type {
  Speaker,
  Language,
  FileInfo,
  Job,
  HealthStatus,
  HistoryResponse,
  HistoryStats,
  FilesResponse,
  UploadResult,
  JobResponse,
  SpeakersResponse,
  LanguagesResponse,
  SystemModelsResponse,
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

async function request<T>(
  path: string,
  opts?: RequestInit,
  retryOpts: RetryOptions = {},
): Promise<T> {
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

      if (res.status === 404 && path.includes('/cms/')) {
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

      if (attempt < retries && !(e as any).status) {
        const delay = backoff * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw e;
    }
  }

  throw new Error('Unexpected retry loop exit');
}

// ── Health ────────────────────────────────────────────────────
export async function healthCheck(): Promise<HealthStatus> {
  return request<HealthStatus>('/health');
}

// ── Files ────────────────────────────────────────────────────
export function uploadFile(
  endpoint: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<UploadResult> & { _abort: () => void } {
  let xhr: XMLHttpRequest | null = null;

  const promise = new Promise<UploadResult>((resolve, reject) => {
    xhr = new XMLHttpRequest();
    xhr.timeout = 60000;
    const fd = new FormData();
    fd.append('file', file);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener('load', () => {
      if (xhr!.status >= 200 && xhr!.status < 300) {
        try { resolve(JSON.parse(xhr!.responseText) as UploadResult); }
        catch { reject(new Error('Invalid server response')); }
      } else {
        let msg = `Upload failed: ${xhr!.status}`;
        try {
          const err = JSON.parse(xhr!.responseText);
          if (err.detail) msg = err.detail;
        } catch { /* use default msg */ }
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('timeout', () => { xhr!.abort(); reject(new Error('Upload timeout (60s)')); });
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.open('POST', `${BASE}/files/upload/${endpoint}`);
    xhr.send(fd);
  });

  const abort = () => { if (xhr) xhr.abort(); };
  return Object.assign(promise, { _abort: abort });
}

export async function listFiles(): Promise<FilesResponse> {
  return request<FilesResponse>('/files');
}

// ── TTS ─────────────────────────────────────────────────────
export async function listSpeakers(): Promise<SpeakersResponse> {
  return request<SpeakersResponse>('/tts/speakers');
}

export async function listLanguages(): Promise<LanguagesResponse> {
  return request<LanguagesResponse>('/tts/languages');
}

export async function ttsCustomVoice(data: {
  text: string;
  speaker: string;
  language: string;
  instruct: string;
  speed: number;
  pitch: number;
  volume: number;
}): Promise<JobResponse> {
  return request<JobResponse>(
    '/tts/custom-voice',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
  );
}

export async function ttsVoiceClone(data: {
  text: string;
  ref_audio_filename: string;
  ref_text: string;
  language: string;
  speed: number;
  pitch: number;
  volume: number;
}): Promise<JobResponse> {
  return request<JobResponse>(
    '/tts/voice-clone',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
  );
}

export async function ttsVoiceDesign(data: {
  text: string;
  language: string;
  instruct: string;
  speed: number;
  pitch: number;
  volume: number;
}): Promise<JobResponse> {
  return request<JobResponse>(
    '/tts/voice-design',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
  );
}

export async function getJobStatus(jobId: string): Promise<Job> {
  return request<Job>(`/tts/status/${jobId}`, {}, { retries: 5, backoff: 2000, timeout: 10000 });
}

// ── Pipeline ──────────────────────────────────────────────────
export async function runPipeline(data: Record<string, unknown>): Promise<JobResponse> {
  return request<JobResponse>(
    '/pipeline/run',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
  );
}

export async function getPipelineStatus(jobId: string): Promise<Job> {
  return request<Job>(`/pipeline/status/${jobId}`, {}, { retries: 5, backoff: 2000, timeout: 10000 });
}

// ── Lip Sync ──────────────────────────────────────────────────
export async function runLipSync(data: Record<string, unknown>): Promise<JobResponse> {
  return request<JobResponse>(
    '/lipsync/process',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
  );
}

export async function getLipSyncStatus(jobId: string): Promise<Job> {
  return request<Job>(`/lipsync/status/${jobId}`, {}, { retries: 5, backoff: 2000, timeout: 10000 });
}

// ── History ─────────────────────────────────────────────────────
export async function getHistory(params?: {
  page?: number;
  size?: number;
  status?: string;
  search?: string;
  job_type?: string;
}): Promise<HistoryResponse> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.size) qs.set('size', String(params.size));
  if (params?.status) qs.set('status', params.status);
  if (params?.search) qs.set('search', params.search);
  if (params?.job_type) qs.set('job_type', params.job_type);
  const q = qs.toString();
  return request<HistoryResponse>(`/history${q ? `?${q}` : ''}`);
}

export async function getHistoryStats(): Promise<HistoryStats> {
  return request<HistoryStats>('/history/stats');
}

export async function getHistoryDetail(jobId: string): Promise<Job> {
  return request<Job>(`/history/${jobId}`);
}

export async function renameHistory(jobId: string, name: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/history/${jobId}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) },
  );
}

export async function deleteHistory(jobId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/history/${jobId}`, { method: 'DELETE' });
}

export async function clearHistory(jobType?: string): Promise<{ ok: boolean; deleted: number }> {
  const q = jobType ? `?job_type=${jobType}` : '';
  return request<{ ok: boolean; deleted: number }>(`/history${q}`, { method: 'DELETE' });
}

// ── System ─────────────────────────────────────────────────────
export async function getSystemModels(): Promise<SystemModelsResponse> {
  return request<SystemModelsResponse>('/system/models');
}

export async function getSystemResources(): Promise<{
  cpu: { percent: number; count: number; count_logical: number };
  memory: { total_gb: number; used_gb: number; percent: number };
  disk: { total_gb: number; used_gb: number; percent: number };
  gpu: Array<{
    index: number; name: string; memory_used_mb: number;
    memory_total_mb: number; utilization_pct: number; temperature_c: number;
  }>;
}> {
  return request('/system/resources');
}

export async function deleteFile(filename: string): Promise<{ ok: boolean; deleted: string }> {
  return request<{ ok: boolean; deleted: string }>(`/files/${filename}`, { method: 'DELETE' });
}

export async function getNetworkStatus(): Promise<{
  online: boolean; mode: string; last_check: number; last_online: number;
}> {
  return request('/system/network-status');
}
