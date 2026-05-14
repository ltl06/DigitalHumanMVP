import type { AnalyticsSummary } from '../types/api';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api';

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status} ${err}`);
  }
  return res.json() as Promise<T>;
}

export async function getAnalyticsSummary(params?: {
  since?: number;
  until?: number;
}): Promise<AnalyticsSummary> {
  const p = new URLSearchParams();
  if (params?.since) p.set('since', String(params.since));
  if (params?.until) p.set('until', String(params.until));
  const q = p.toString();
  return request<AnalyticsSummary>(`/cms/analytics/dashboard${q ? `?${q}` : ''}`);
}

export async function exportAnalyticsReport(params?: {
  since?: number;
  until?: number;
  fmt?: 'json' | 'csv';
}): Promise<{ format: string; data: string }> {
  const p = new URLSearchParams();
  if (params?.since) p.set('since', String(params.since));
  if (params?.until) p.set('until', String(params.until));
  if (params?.fmt) p.set('fmt', params.fmt);
  const q = p.toString();
  return request(`/cms/analytics/export${q ? `?${q}` : ''}`);
}

export async function getLiveVisitors(minutes = 5): Promise<{ live_visitors: number }> {
  return request(`/cms/analytics/live-visitors?minutes=${minutes}`);
}

export async function getDailyTrends(days = 7): Promise<{ trends: Array<{ date: string; count: number }> }> {
  return request(`/cms/analytics/trends?days=${days}`);
}

export async function getHourlyDistribution(since = 0): Promise<{ hourly: Array<{ hour: number; count: number }> }> {
  return request(`/cms/analytics/hourly?since=${since}`);
}

export async function getExhibitQRCode(exhibitId: string): Promise<{
  exhibit_id: string;
  exhibit_name: string;
  qr_url: string;
  image: string | null;
  fallback?: string;
}> {
  return request(`/cms/exhibits/${exhibitId}/qrcode`);
}

export async function listInteractions(params?: {
  page?: number;
  size?: number;
  exhibit_id?: string;
  event_type?: string;
  since?: number;
  until?: number;
}): Promise<{
  interactions: any[];
  total: number;
  total_pages: number;
}> {
  const p = new URLSearchParams();
  if (params?.page) p.set('page', String(params.page));
  if (params?.size) p.set('size', String(params.size));
  if (params?.exhibit_id) p.set('exhibit_id', params.exhibit_id);
  if (params?.event_type) p.set('event_type', params.event_type);
  if (params?.since) p.set('since', String(params.since));
  if (params?.until) p.set('until', String(params.until));
  const q = p.toString();
  return request(`/cms/analytics/interactions${q ? `?${q}` : ''}`);
}
