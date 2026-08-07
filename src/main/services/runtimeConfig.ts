import fs from 'fs';
import path from 'path';
import { app, safeStorage } from 'electron';
import logger from '../logger';
import { activateLicenseOnline } from './licenseActivation';

export interface RuntimeConfig {
  /** Mã license — chỉ nhập một lần (xem activateLicense), không có luồng đổi lại trong app. */
  licenseKey: string;
  apiBaseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  /**
   * Place đang dùng để gọi API đăng ký — tách hẳn khỏi license/OAuth creds: đổi qua
   * ActivePlaceSwitcher ở header không nên đụng tới các field kia, và ngược lại kết nối
   * lại/xác thực license không nên vô tình xoá place đang chọn.
   */
  activePlaceId?: string;
  /** Các Server API đã từng kết nối thành công — cho dropdown chọn lại (kiểu "Servers" của Swagger),
   *  không giới hạn chỉ 1 giá trị như apiBaseUrl hiện tại. */
  savedApiBaseUrls?: string[];
}

function getStateFilePath(): string {
  return path.join(app.getPath('userData'), 'runtime-config.json');
}

// Cùng cơ chế mã hoá với hanet-token.json (xem hanetOAuth.ts): các field ở đây không phải bí mật
// nghiêm trọng như refresh token, nhưng vẫn là dữ liệu cấu hình riêng của từng máy, không nên nằm
// dạng plaintext trên đĩa nếu safeStorage khả dụng.
function loadPersisted(): RuntimeConfig | null {
  try {
    const raw = fs.readFileSync(getStateFilePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.encrypted && typeof parsed.data === 'string') {
      if (!safeStorage.isEncryptionAvailable()) {
        logger.error('[RuntimeConfig] safeStorage không khả dụng trên máy này, không thể giải mã cấu hình đã lưu.');
        return null;
      }
      const decrypted = safeStorage.decryptString(Buffer.from(parsed.data, 'base64'));
      return JSON.parse(decrypted) as RuntimeConfig;
    }
    return parsed as RuntimeConfig;
  } catch {
    return null;
  }
}

function persist(config: RuntimeConfig): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(JSON.stringify(config));
    fs.writeFileSync(
      getStateFilePath(),
      JSON.stringify({ encrypted: true, data: encrypted.toString('base64') }),
      'utf-8',
    );
  } else {
    logger.warn('[RuntimeConfig] safeStorage không khả dụng, lưu cấu hình dạng plaintext.');
    fs.writeFileSync(getStateFilePath(), JSON.stringify(config, null, 2), 'utf-8');
  }
}

let cached: RuntimeConfig | null | undefined;

// .env luôn thắng nếu có giá trị — đây là đường cho máy dev (chạy `npm run dev`, sửa .env để đổi
// PLACE_ID lúc test) và cho máy đã cài kèm .env cạnh exe theo cách cũ. Chỉ khi .env không có giá trị
// mới rơi về cấu hình đã lưu qua màn hình Kết nối tài khoản.
//
// activePlaceId là NGOẠI LỆ: một khi người dùng đã chọn qua ActivePlaceSwitcher (saveActivePlaceId),
// lựa chọn đó phải thắng HANET_PLACE_ID trong .env — nếu không, đổi place trên UI sẽ không có tác
// dụng gì với máy dev có sẵn .env (place luôn dính cứng vào giá trị .env, gây nhầm lẫn khó phát hiện).
// .env chỉ còn vai trò seed giá trị mặc định cho lần chạy đầu tiên khi chưa từng lưu gì.
export function getRuntimeConfig(): RuntimeConfig | null {
  const envLicenseKey = process.env.LICENSE_KEY;
  const envApiBaseUrl = process.env.HANET_API_BASE_URL;
  const envClientId = process.env.HANET_CLIENT_ID;
  const envClientSecret = process.env.HANET_CLIENT_SECRET;
  const envPlaceId = process.env.HANET_PLACE_ID;

  if (cached === undefined) cached = loadPersisted();

  if (envLicenseKey) {
    return {
      licenseKey: envLicenseKey,
      apiBaseUrl: envApiBaseUrl || cached?.apiBaseUrl,
      clientId: envClientId || cached?.clientId,
      clientSecret: envClientSecret || cached?.clientSecret,
      activePlaceId: cached?.activePlaceId || envPlaceId,
    };
  }

  if (cached) {
    return {
      licenseKey: cached.licenseKey,
      apiBaseUrl: envApiBaseUrl || cached.apiBaseUrl,
      clientId: envClientId || cached.clientId,
      clientSecret: envClientSecret || cached.clientSecret,
      activePlaceId: cached.activePlaceId || envPlaceId,
    };
  }

  if (envApiBaseUrl || envClientId || envClientSecret || envPlaceId) {
    return {
      licenseKey: '',
      apiBaseUrl: envApiBaseUrl,
      clientId: envClientId,
      clientSecret: envClientSecret,
      activePlaceId: envPlaceId,
    };
  }

  return null;
}

// Gate lần đầu chỉ còn cần license — placeId chọn ở ActivePlaceSwitcher sau khi đã vào được app,
// không còn là điều kiện chặn màn hình chính (xem RuntimeConfigGate).
export function needsRuntimeConfig(): boolean {
  const config = getRuntimeConfig();
  return !config || !config.licenseKey;
}

/**
 * Cập nhật apiBaseUrl/clientId/clientSecret sau khi kết nối tài khoản Hanet thành công — không đụng
 * licenseKey/activePlaceId đã lưu (xem activateLicense/saveActivePlaceId cho 2 field đó). Ghi luôn
 * apiBaseUrl vào savedApiBaseUrls (nếu chưa có) để dropdown Server API nhớ lại cho lần sau.
 */
export function saveConnectionConfig(config: { apiBaseUrl: string; clientId: string; clientSecret: string }): void {
  const previous = getRuntimeConfig();
  const savedApiBaseUrls = previous?.savedApiBaseUrls ?? [];
  const next: RuntimeConfig = {
    licenseKey: previous?.licenseKey ?? '',
    activePlaceId: previous?.activePlaceId,
    ...config,
    savedApiBaseUrls: savedApiBaseUrls.includes(config.apiBaseUrl)
      ? savedApiBaseUrls
      : [...savedApiBaseUrls, config.apiBaseUrl],
  };
  persist(next);
  cached = next;
}

/**
 * Kích hoạt license — chỉ ghi được MỘT LẦN. Nếu đã có licenseKey rồi thì bỏ qua, không cho ghi đè:
 * đây là license "dùng một lần" theo thiết kế, không có luồng đổi lại trong app.
 *
 * Trước khi lưu xuống máy, xác nhận với hệ thống cấp phép (Firebase) rằng mã CHƯA được dùng ở đâu
 * khác — mỗi installer chỉ kích hoạt được đúng một lần trên đúng một máy. Nếu bước xác nhận online
 * thất bại (mạng lỗi, mã đã dùng, mã không hợp lệ), không ghi gì xuống local — người dùng phải thử
 * lại, tránh tình trạng máy tưởng đã kích hoạt trong khi Firebase chưa ghi nhận.
 */
export async function activateLicense(licenseKey: string): Promise<void> {
  const previous = getRuntimeConfig();
  if (previous?.licenseKey) return;

  await activateLicenseOnline(licenseKey);

  const next: RuntimeConfig = { ...previous, licenseKey };
  persist(next);
  cached = next;
}

export function saveActivePlaceId(placeId: string): void {
  const previous = getRuntimeConfig();
  const next: RuntimeConfig = { licenseKey: previous?.licenseKey ?? '', ...previous, activePlaceId: placeId };
  persist(next);
  cached = next;
}
