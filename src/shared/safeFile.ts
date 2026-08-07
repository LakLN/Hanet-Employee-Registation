export const SAFE_FILE_SCHEME = 'safe-file';

// Host cố định, không mang ý nghĩa: scheme được đăng ký dạng "standard" nên URL bắt buộc có host.
const SAFE_FILE_HOST = 'local';

/**
 * Đường dẫn ảnh cục bộ -> URL để `<img src>` dùng trực tiếp.
 *
 * Trước đây renderer phải gọi IPC đọc NGUYÊN file ảnh (3-6MB/ảnh với ảnh điện thoại), copy qua
 * structured clone, tạo Blob rồi createObjectURL — chỉ để hiển thị một ô 48x48. Với 50 dòng/trang là
 * hàng trăm MB RAM và phải tự quản lý việc thu hồi blob URL. Qua protocol riêng, Chromium tự stream,
 * tự cache và tự giải phóng ảnh như mọi resource khác.
 *
 * Cả đường dẫn được encode thành MỘT segment để dấu ':' của ổ đĩa Windows, khoảng trắng, '#', '?'
 * và dấu tiếng Việt trong tên file không phá vỡ cấu trúc URL.
 */
export function toSafeFileUrl(absolutePath: string): string {
  return `${SAFE_FILE_SCHEME}://${SAFE_FILE_HOST}/${encodeURIComponent(absolutePath)}`;
}

/**
 * Giải mã ngược URL safe-file thành đường dẫn tuyệt đối, hoặc null nếu URL không đúng dạng.
 *
 * Chấp nhận cả trường hợp Chromium đã tự giải mã sẵn các ký tự escape trong pathname (hành vi
 * canonicalize khác nhau giữa các phiên bản), nên không phụ thuộc vào chi tiết đó.
 */
export function parseSafeFileUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${SAFE_FILE_SCHEME}:`) return null;
    const raw = parsed.pathname.replace(/^\/+/, '');
    if (!raw) return null;
    const decoded = decodeURIComponent(raw);
    return decoded || null;
  } catch {
    return null;
  }
}
