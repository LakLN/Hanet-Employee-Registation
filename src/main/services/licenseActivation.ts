import os from 'os';
import crypto from 'crypto';
import axios from 'axios';
import logger from '../logger';
import { LICENSE_BASE_URL } from './licenseConfig';

interface LicenseNode {
  valid?: boolean;
  message?: string;
  is_used?: boolean;
  activated_at?: string;
  device_fingerprint?: string;
}

// Định danh máy chỉ để LƯU VẾT (biết mã đã kích hoạt trên máy nào, phục vụ tra soát khi có tranh
// chấp) — không dùng để tự chặn chạy trên máy khác, vì client-side không thể enforce việc đó một
// cách đáng tin cậy. Sinh ổn định từ few thông tin phần cứng/hệ điều hành có sẵn, không cần thêm
// dependency ngoài.
function getDeviceFingerprint(): string {
  const raw = `${os.hostname()}|${os.platform()}|${os.arch()}|${os.cpus()[0]?.model ?? ''}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
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
export async function activateLicenseOnline(licenseKey: string): Promise<void> {
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

  if (node.is_used) {
    throw new Error('Mã license này đã được kích hoạt trước đó và không thể dùng lại trên máy khác.');
  }

  try {
    await axios.patch(
      url,
      {
        is_used: true,
        activated_at: new Date().toISOString(),
        device_fingerprint: getDeviceFingerprint(),
      },
      { timeout: 8000 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[LicenseActivation] Không ghi được trạng thái kích hoạt lên hệ thống: ${message}`);
    throw new Error('Không thể xác nhận kích hoạt với hệ thống cấp phép. Vui lòng thử lại.', { cause: err });
  }

  logger.info('[LicenseActivation] Kích hoạt license thành công.');
}
