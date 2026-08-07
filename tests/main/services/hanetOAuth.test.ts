import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let userDataDir: string;
let safeStorageAvailable = true;

// Chỉ mock đúng ranh giới bên ngoài (Electron APIs, mạng) — fs dùng thật trên thư mục temp để
// test round-trip đọc/ghi file token sát với hành vi thật hơn là mock rời rạc từng lời gọi fs.
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => userDataDir) },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => safeStorageAvailable),
    encryptString: vi.fn((value: string) => Buffer.from(value, 'utf-8')),
    decryptString: vi.fn((value: Buffer) => value.toString('utf-8')),
  },
}));

vi.mock('../../../src/main/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const axiosPostMock = vi.fn();
vi.mock('axios', () => ({
  default: {
    post: axiosPostMock,
    isAxiosError: (err: unknown): boolean =>
      typeof err === 'object' && err !== null && (err as { isAxiosError?: boolean }).isAxiosError === true,
  },
}));

function tokenFilePath(): string {
  return path.join(userDataDir, 'hanet-token.json');
}

function writeStateFile(state: unknown, encrypted: boolean) {
  const content = encrypted
    ? { encrypted: true, data: Buffer.from(JSON.stringify(state), 'utf-8').toString('base64') }
    : state;
  fs.writeFileSync(tokenFilePath(), JSON.stringify(content), 'utf-8');
}

// hanetOAuth.ts giữ token trong biến module-level (cached/refreshInFlight) — phải reset module
// giữa các test để mỗi test có trạng thái sạch, tương tự việc app chỉ khởi động một lần.
async function loadOAuthModule() {
  vi.resetModules();
  return import('../../../src/main/services/hanetOAuth');
}

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hanet-oauth-test-'));
  safeStorageAvailable = true;
  axiosPostMock.mockReset();
  delete process.env.HANET_REFRESH_TOKEN;
  delete process.env.HANET_CLIENT_ID;
  delete process.env.HANET_CLIENT_SECRET;
});

afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

const FAR_FUTURE = () => Math.floor(Date.now() / 1000) + 3600 * 24 * 300;

describe('normalizeExpiresAt', () => {
  const now = 1_800_000_000; // epoch giây

  it('số nhỏ được hiểu là TTL (số giây còn lại)', async () => {
    const { normalizeExpiresAt } = await loadOAuthModule();
    expect(normalizeExpiresAt(31_536_000, now)).toBe(now + 31_536_000);
  });

  it('epoch giây giữ nguyên', async () => {
    const { normalizeExpiresAt } = await loadOAuthModule();
    expect(normalizeExpiresAt(now + 1000, now)).toBe(now + 1000);
  });

  it('epoch millisecond được đổi về giây', async () => {
    const { normalizeExpiresAt } = await loadOAuthModule();
    expect(normalizeExpiresAt((now + 1000) * 1000, now)).toBe(now + 1000);
  });

  it('giá trị không đọc được thì coi như đã hết hạn để lần sau chủ động làm mới', async () => {
    const { normalizeExpiresAt } = await loadOAuthModule();
    expect(normalizeExpiresAt(undefined, now)).toBe(now);
    expect(normalizeExpiresAt('không phải số', now)).toBe(now);
    expect(normalizeExpiresAt(-5, now)).toBe(now);
  });
});

describe('getAccessToken', () => {
  it('ném lỗi khi chưa cấu hình OAuth (chưa có file lưu, chưa có env)', async () => {
    const { getAccessToken } = await loadOAuthModule();
    await expect(getAccessToken()).rejects.toThrow('Chưa kết nối tài khoản Hanet');
  });

  it('lấy access token mới từ HANET_REFRESH_TOKEN trong .env khi chưa có gì lưu trước đó', async () => {
    process.env.HANET_REFRESH_TOKEN = 'seed-refresh-token';
    axiosPostMock.mockResolvedValueOnce({
      data: { access_token: 'token-1', refresh_token: 'refresh-1', expire: FAR_FUTURE() },
    });

    const { getAccessToken } = await loadOAuthModule();
    const token = await getAccessToken();

    expect(token).toBe('token-1');
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(fs.readFileSync(tokenFilePath(), 'utf-8'));
    expect(saved.encrypted).toBe(true);
  });

  it('dùng cache trong bộ nhớ cho lần gọi thứ hai trong cùng phiên, không gọi lại axios', async () => {
    process.env.HANET_REFRESH_TOKEN = 'seed-refresh-token';
    axiosPostMock.mockResolvedValueOnce({
      data: { access_token: 'token-once', refresh_token: 'refresh-once', expire: FAR_FUTURE() },
    });

    const { getAccessToken } = await loadOAuthModule();
    const first = await getAccessToken();
    const second = await getAccessToken();

    expect(first).toBe('token-once');
    expect(second).toBe('token-once');
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
  });

  it('đọc token đã lưu (mã hoá, còn hạn dài) mà không gọi refresh', async () => {
    writeStateFile({ accessToken: 'cached-token', refreshToken: 'refresh-x', expiresAt: FAR_FUTURE() }, true);

    const { getAccessToken } = await loadOAuthModule();
    const token = await getAccessToken();

    expect(token).toBe('cached-token');
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it('đọc được file token cũ dạng plaintext (trước khi có mã hoá) để không mất cấu hình đang chạy', async () => {
    writeStateFile({ accessToken: 'legacy-token', refreshToken: 'refresh-legacy', expiresAt: FAR_FUTURE() }, false);

    const { getAccessToken } = await loadOAuthModule();
    const token = await getAccessToken();

    expect(token).toBe('legacy-token');
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it('lưu token dạng plaintext khi safeStorage không khả dụng trên máy', async () => {
    safeStorageAvailable = false;
    process.env.HANET_REFRESH_TOKEN = 'seed-refresh-token';
    axiosPostMock.mockResolvedValueOnce({
      data: { access_token: 'token-plain', refresh_token: 'refresh-plain', expire: FAR_FUTURE() },
    });

    const { getAccessToken } = await loadOAuthModule();
    await getAccessToken();

    const saved = JSON.parse(fs.readFileSync(tokenFilePath(), 'utf-8'));
    expect(saved.accessToken).toBe('token-plain');
    expect(saved.encrypted).toBeUndefined();
  });

  it('làm mới token khi gần hết hạn (dưới 24h)', async () => {
    const almostExpired = Math.floor(Date.now() / 1000) + 60;
    writeStateFile({ accessToken: 'old-token', refreshToken: 'refresh-y', expiresAt: almostExpired }, true);
    axiosPostMock.mockResolvedValueOnce({
      data: { access_token: 'refreshed-token', refresh_token: 'refresh-y2', expire: FAR_FUTURE() },
    });

    const { getAccessToken } = await loadOAuthModule();
    const token = await getAccessToken();

    expect(token).toBe('refreshed-token');
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
  });
});
