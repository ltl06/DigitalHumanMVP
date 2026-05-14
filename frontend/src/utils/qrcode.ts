export interface QRCodeData {
  exhibitId: string;
  language?: string;
  contentId?: string;
}

export function encodeQRData(data: QRCodeData): string {
  const params = new URLSearchParams();
  params.set('eid', data.exhibitId);
  if (data.language) params.set('lang', data.language);
  if (data.contentId) params.set('cid', data.contentId);
  return params.toString();
}

export function decodeQRData(query: string): QRCodeData | null {
  try {
    const params = new URLSearchParams(query);
    const exhibitId = params.get('eid');
    if (!exhibitId) return null;
    return {
      exhibitId,
      language: params.get('lang') || undefined,
      contentId: params.get('cid') || undefined,
    };
  } catch {
    return null;
  }
}

export function buildExhibitQRUrl(baseUrl: string, exhibitId: string, language = 'zh-CN'): string {
  const data = encodeQRData({ exhibitId, language });
  return `${baseUrl}/terminal?${data}`;
}

export function formatQRUrl(url: string): string {
  return url;
}
