import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { app } from 'electron';
import axios from 'axios';
import logger from '../logger';
import { LICENSE_BASE_URL } from './licenseConfig';

const execFileAsync = promisify(execFile);

interface LicenseNode {
  valid?: boolean;
  message?: string;
  is_used?: boolean;
  activated_at?: string;
  device_fingerprint?: string;
  /** Hạn dùng: ngày "2026-12-31" (hết hạn cuối ngày đó, giờ máy) hoặc ISO đầy đủ. Trống/không có = vĩnh viễn. */
  expires_at?: string;
}

/**
 * Đổi `expires_at` của node thành mốc thời gian (ms). null = vĩnh viễn (trống/không có field).
 * Giá trị có nhưng không đọc được thì ném lỗi thay vì coi như vĩnh viễn — nhập sai ngày không được
 * vô tình thành license không hết hạn.
 */
export function parseLicenseExpiry(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  // Chỉ có ngày → hết hạn vào cuối ngày đó, để "2026-12-31" còn dùng được hết 31/12.
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T23:59:59.999`).getTime()
    : new Date(text).getTime();
  if (Number.isNaN(ms)) throw new Error('Hạn dùng của mã license không hợp lệ. Vui lòng liên hệ Maxcom.');
  return ms;
}

export function isExpired(expiresAt: string | null | undefined, now = Date.now()): boolean {
  const ms = parseLicenseExpiry(expiresAt);
  return ms !== null && now > ms;
}

/** Đọc lại hạn dùng mới nhất từ Firebase — để gia hạn/đổi hạn phía server có hiệu lực. Trả
 *  `undefined` nếu không kết nối được (giữ giá trị đã lưu), `null` nếu mã không còn hạn (vĩnh viễn). */
export async function fetchLicenseExpiry(licenseKey: string): Promise<string | null | undefined> {
  try {
    const response = await axios.get<LicenseNode | null>(licenseNodeUrl(LICENSE_BASE_URL, licenseKey), {
      timeout: 5000,
    });
    const node = response.data;
    if (!node) return undefined;
    return node.expires_at?.trim() || null;
  } catch {
    return undefined;
  }
}

// Đọc MachineGuid của Windows — định danh riêng từng máy, không đổi khi đổi tên máy/đổi CPU.
// Trả null nếu không đọc được (không phải Windows, hoặc bị chặn registry).
async function readWindowsMachineGuid(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  try {
    const { stdout } = await execFileAsync('reg', [
      'query',
      'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
      '/v',
      'MachineGuid',
    ]);
    return /MachineGuid\s+REG_SZ\s+(\S+)/i.exec(stdout)?.[1] ?? null;
  } catch {
    return null;
  }
}

// Định danh máy chỉ để LƯU VẾT (biết mã đã kích hoạt trên máy nào, phục vụ tra soát khi có tranh
// chấp) — không dùng để tự chặn chạy trên máy khác, vì client-side không thể enforce việc đó một
// cách đáng tin cậy. Ưu tiên MachineGuid (ổn định, phân biệt từng máy); không đọc được thì rơi về
// hash thông tin phần cứng/hệ điều hành. Luôn hash để không đẩy GUID gốc lên Firebase.
async function getDeviceFingerprint(): Promise<string> {
  const machineGuid = await readWindowsMachineGuid();
  const raw = machineGuid
    ? `guid|${machineGuid}`
    : `${os.hostname()}|${os.platform()}|${os.arch()}|${os.cpus()[0]?.model ?? ''}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

// os.userInfo() có thể ném lỗi nếu tài khoản không tra được trong hệ thống — thông tin này chỉ để
// debug nên không được làm hỏng việc kích hoạt.
function getOsUsername(): string {
  try {
    return os.userInfo().username;
  } catch {
    return '';
  }
}

function licenseNodeUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(key)}.json`;
}

/**
 * Kích hoạt license trên Firebase: mỗi mã chỉ được đánh dấu `is_used=true` một lần. Nếu mã đã
 * được dùng trước đó (trên máy này hoặc máy khác), từ chối kích hoạt — đúng mô hình "1 key/1 lần"
 * đã chọn. Yêu cầu Firebase Rules cho phép PATCH field `is_used` khi node chưa có `is_used=true`
 * (validate rule dạng `data.child('is_used').val() !== true`), tránh máy khác ghi đè lại sau khi
 * đã dùng.
 */
export async function activateLicenseOnline(licenseKey: string): Promise<{ expiresAt: string | null }> {
  const url = licenseNodeUrl(LICENSE_BASE_URL, licenseKey);

  let node: LicenseNode | null;
  try {
    const response = await axios.get<LicenseNode | null>(url, { timeout: 8000 });
    node = response.data ?? null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[LicenseActivation] Không đọc được node license để kích hoạt: ${message}`);
    throw new Error('Không thể kết nối tới hệ thống cấp phép. Vui lòng kiểm tra kết nối mạng và thử lại.', {
      cause: err,
    });
  }

  if (node === null) {
    throw new Error('Mã license không hợp lệ hoặc chưa được cấp. Vui lòng liên hệ Maxcom.');
  }

  if (node.valid === false) {
    throw new Error(node.message || 'Mã license đã bị vô hiệu hoá. Vui lòng liên hệ Maxcom.');
  }

  if (isExpired(node.expires_at)) {
    throw new Error('Mã license đã hết hạn. Vui lòng liên hệ Maxcom để gia hạn.');
  }

  if (node.is_used) {
    throw new Error('Mã license này đã được kích hoạt trước đó và không thể dùng lại trên máy khác.');
  }

  try {
    await axios.patch(
      url,
      {
        is_used: true,
        activated_at: new Date().toISOString(),
        device_fingerprint: await getDeviceFingerprint(),
        app_version: app.getVersion(),
        hostname: os.hostname(),
        os_user: getOsUsername(),
        os_version: `${os.type()} ${os.release()} (${os.version()})`,
      },
      { timeout: 8000 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[LicenseActivation] Không ghi được trạng thái kích hoạt lên hệ thống: ${message}`);
    throw new Error('Không thể xác nhận kích hoạt với hệ thống cấp phép. Vui lòng thử lại.', { cause: err });
  }

  logger.info('[LicenseActivation] Kích hoạt license thành công.');
  return { expiresAt: node.expires_at?.trim() || null };
}
