import https from 'https';
import logger from '../logger';

// Server Hanet chính thức (cloud) luôn kiểm tra chứng chỉ SSL đầy đủ. Server KHÁC (máy chủ Hanet
// đặt trong mạng nội bộ của khách, thường truy cập bằng IP LAN) hay dùng chứng chỉ tự ký — nếu vẫn
// kiểm tra chặt, mọi request đều lỗi "self signed certificate" và không đăng ký được ai. Vì vậy chỉ
// nới kiểm tra chứng chỉ cho server ngoài tên miền Hanet; server http:// thì không liên quan.
const OFFICIAL_HANET_HOST = /(^|\.)hanet\.(ai|com)$/i;

const strictAgent = new https.Agent({ keepAlive: true, maxSockets: 8, timeout: 30000 });
const internalServerAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 8,
  timeout: 30000,
  rejectUnauthorized: false,
});

const warnedHosts = new Set<string>();

export function isOfficialHanetUrl(url: string): boolean {
  try {
    return OFFICIAL_HANET_HOST.test(new URL(url).hostname);
  } catch {
    return true;
  }
}

/** Agent HTTPS dùng cho request tới `url` — xem chú thích đầu file. */
export function httpsAgentFor(url: string): https.Agent {
  if (isOfficialHanetUrl(url)) return strictAgent;
  const host = new URL(url).host;
  if (!warnedHosts.has(host)) {
    warnedHosts.add(host);
    logger.warn(`[HanetHttp] Server nội bộ ${host}: chấp nhận chứng chỉ SSL tự ký.`);
  }
  return internalServerAgent;
}
