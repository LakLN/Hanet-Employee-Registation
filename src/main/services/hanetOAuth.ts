import fs from 'fs';
import path from 'path';
import { app, safeStorage } from 'electron';
import axios from 'axios';
import logger from '../logger';
import { getRuntimeConfig } from './runtimeConfig';

const AUTHORIZE_URL = 'https://oauth.hanet.com/oauth2/authorize';
const TOKEN_URL = 'https://oauth.hanet.com/token';
const REFRESH_MARGIN_SEC = 24 * 60 * 60;

export function buildAuthorizeUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'full',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface TokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch giây
}

let cached: TokenState | null = null;
let refreshInFlight: Promise<TokenState> | null = null;

function getStateFilePath(): string {
  return path.join(app.getPath('userData'), 'hanet-token.json');
}

// Token lưu mã hoá bằng safeStorage (DPAPI/Keychain của OS) vì refresh token có hiệu lực dài
// hạn và cấp quyền đăng ký khuôn mặt vĩnh viễn — không nên nằm dạng plaintext trên đĩa. Các file
// cũ đã lưu plaintext (trước khi có mã hoá) vẫn đọc được để không làm mất cấu hình đang chạy.
function loadPersistedState(): TokenState | null {
  try {
    const raw = fs.readFileSync(getStateFilePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.encrypted && typeof parsed.data === 'string') {
      if (!safeStorage.isEncryptionAvailable()) {
        logger.error('[HanetOAuth] safeStorage không khả dụng trên máy này, không thể giải mã token đã lưu.');
        return null;
      }
      const decrypted = safeStorage.decryptString(Buffer.from(parsed.data, 'base64'));
      return JSON.parse(decrypted) as TokenState;
    }
    return parsed as TokenState;
  } catch {
    return null;
  }
}

function persistState(state: TokenState) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(JSON.stringify(state));
      fs.writeFileSync(
        getStateFilePath(),
        JSON.stringify({ encrypted: true, data: encrypted.toString('base64') }),
        'utf-8',
      );
    } else {
      logger.warn('[HanetOAuth] safeStorage không khả dụng, lưu token dạng plaintext.');
      fs.writeFileSync(getStateFilePath(), JSON.stringify(state, null, 2), 'utf-8');
    }
  } catch (err) {
    logger.error('[HanetOAuth] Không thể lưu token vào userData:', err);
  }
}

// Chỉ dùng cho máy dev/máy đã cài theo cách cũ (đặt sẵn HANET_REFRESH_TOKEN trong .env). Sau khi đã
// đăng nhập qua popup OAuth (xem exchangeCodeForToken), refresh token nằm trong hanet-token.json và
// không cần biến này nữa.
function seedFromEnv(): TokenState | null {
  const refreshToken = process.env.HANET_REFRESH_TOKEN;
  if (!refreshToken) return null;
  return { accessToken: '', refreshToken, expiresAt: 0 };
}

/**
 * Hanet trả field `expire` mà không nói rõ đơn vị. Nếu đoán sai, hậu quả rất khó chẩn đoán và xảy ra
 * muộn: coi TTL (vd 31536000) là epoch giây -> app refresh token ở MỌI lời gọi; coi epoch
 * millisecond là epoch giây -> app KHÔNG BAO GIỜ refresh và bắt đầu lỗi 401 sau khoảng một năm.
 * Vì vậy suy ra đơn vị theo độ lớn thay vì tin vào một giả định.
 */
export function normalizeExpiresAt(expire: unknown, nowSec: number): number {
  const value = Number(expire);
  if (!Number.isFinite(value) || value <= 0) {
    // Không đọc được hạn dùng -> coi như hết hạn để lần gọi sau chủ động làm mới, thay vì giữ mãi
    // một access token có thể đã chết.
    return nowSec;
  }
  // Ngưỡng 1e9 giây = năm 2001, nên mọi mốc thời gian thật hiện nay đều lớn hơn; còn TTL dưới 1e9
  // giây là 31 năm — không có token nào sống lâu vậy. Hai dải giá trị không thể lẫn nhau.
  if (value < 1e9) return nowSec + value; // TTL: số giây còn lại
  if (value > 1e12) return Math.floor(value / 1000); // epoch millisecond
  return value; // epoch giây
}

async function requestToken(
  body: URLSearchParams,
  grantType: 'refresh_token' | 'authorization_code',
): Promise<TokenState> {
  const response = await axios.post(`${TOKEN_URL}?grant_type=${grantType}`, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });

  const data = response.data;
  const state: TokenState = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: normalizeExpiresAt(data.expire, Math.floor(Date.now() / 1000)),
  };
  logger.info(
    `[HanetOAuth] Lấy access token (${grantType}), expire=${data.expire} -> hạn dùng tới ${new Date(state.expiresAt * 1000).toISOString()}`,
  );
  return state;
}

function requestNewToken(refreshToken: string): Promise<TokenState> {
  const clientId = getRuntimeConfig()?.clientId ?? '';
  const clientSecret = getRuntimeConfig()?.clientSecret ?? '';
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  return requestToken(body, 'refresh_token');
}

/**
 * Dùng cho màn hình Kết nối tài khoản: đổi authorization code (lấy được từ popup OAuth) thành
 * access_token + refresh_token lần đầu. Sau bước này, các lần chạy sau chỉ cần refresh_token đã lưu
 * (xem getAccessToken) — không cần lặp lại luồng đăng nhập popup.
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string; email: string | null }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const state = await requestToken(body, 'authorization_code');
  cached = state;
  persistState(state);
  return { accessToken: state.accessToken, refreshToken: state.refreshToken, email: decodeJwtEmail(state.accessToken) };
}

// Access token của Hanet là JWT (xem log thực tế: header {"alg":"HS256","typ":"JWT"}, payload có
// field "email"). Chỉ đọc phần payload để HIỂN THỊ tài khoản đang kết nối — không verify signature,
// vì token này do chính Hanet cấp cho mình dùng, không phải input cần xác thực an toàn ở đây.
function decodeJwtEmail(token: string): string | null {
  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) return null;
    const json = Buffer.from(payloadPart, 'base64url').toString('utf-8');
    const payload = JSON.parse(json);
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

// Cho renderer hiện "Đã kết nối: email@..." mà không cần gọi mạng — đọc thẳng từ access token đã
// lưu (không refresh dù đã gần hết hạn, vì đây chỉ để hiển thị, không phải để gọi API thật).
export function getConnectedEmail(): string | null {
  if (!cached) cached = loadPersistedState() ?? seedFromEnv();
  if (!cached?.accessToken) return null;
  return decodeJwtEmail(cached.accessToken);
}

function requestNewTokenShared(refreshToken: string): Promise<TokenState> {
  if (!refreshInFlight) {
    refreshInFlight = requestNewToken(refreshToken).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Chỉ dùng cho lần khởi động đầu tiên (chưa có access token cũ để fallback) — một lỗi mạng
// thoáng qua lúc đó không nên làm hỏng toàn bộ phiên làm việc ngay từ đầu.
async function requestNewTokenWithRetry(refreshToken: string, attempts = 3): Promise<TokenState> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await requestNewTokenShared(refreshToken);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(1500);
    }
  }
  throw lastErr;
}

// Cho renderer biết đã kết nối tài khoản Hanet chưa (để hiện "Đăng nhập lại" thay vì bắt kết nối
// lại từ đầu) mà không cần gọi getAccessToken() — tránh gọi mạng chỉ để kiểm tra trạng thái hiển thị.
export function hasStoredToken(): boolean {
  if (!cached) cached = loadPersistedState() ?? seedFromEnv();
  return cached !== null;
}

export async function getAccessToken(): Promise<string> {
  if (!cached) {
    cached = loadPersistedState() ?? seedFromEnv();
  }
  if (!cached) {
    throw new Error('Chưa kết nối tài khoản Hanet. Vui lòng vào màn hình Kết nối tài khoản để đăng nhập.');
  }

  const now = Math.floor(Date.now() / 1000);
  const needsRefresh = !cached.accessToken || cached.expiresAt - now < REFRESH_MARGIN_SEC;

  if (needsRefresh) {
    try {
      cached = cached.accessToken
        ? await requestNewTokenShared(cached.refreshToken)
        : await requestNewTokenWithRetry(cached.refreshToken);
      persistState(cached);
    } catch (err: unknown) {
      const detail = axios.isAxiosError(err)
        ? (err.response?.data ?? err.message)
        : err instanceof Error
          ? err.message
          : err;
      logger.error('[HanetOAuth] Lỗi làm mới access token:', detail);
      if (!cached.accessToken) throw err;
    }
  }

  return cached.accessToken;
}
