import { describe, expect, it } from 'vitest';
import { parseSafeFileUrl, toSafeFileUrl } from '../../src/shared/safeFile';

describe('safe-file URL', () => {
  it('mã hoá rồi giải mã lại đúng đường dẫn Windows', () => {
    const original = 'C:\\du lieu\\nhan su\\anh1.jpg';
    expect(parseSafeFileUrl(toSafeFileUrl(original))).toBe(original);
  });

  it('giữ nguyên tên file có dấu tiếng Việt và ký tự đặc biệt', () => {
    const original = 'D:/ảnh nhân viên/Nguyễn Văn A #1 (bản chính)?.jpg';
    expect(parseSafeFileUrl(toSafeFileUrl(original))).toBe(original);
  });

  it('trả về null với URL sai scheme', () => {
    expect(parseSafeFileUrl('file:///C:/anh/anh1.jpg')).toBeNull();
    expect(parseSafeFileUrl('https://example.com/anh1.jpg')).toBeNull();
    expect(parseSafeFileUrl('không phải url')).toBeNull();
  });

  it('trả về null khi không có đường dẫn', () => {
    expect(parseSafeFileUrl('safe-file://local/')).toBeNull();
  });

  // Chromium có thể canonicalize sẵn một phần escape trong pathname tuỳ phiên bản — hàm giải mã
  // không được phụ thuộc vào chi tiết đó.
  it('đọc được cả URL đã được giải mã sẵn', () => {
    expect(parseSafeFileUrl('safe-file://local/C:/anh/anh1.jpg')).toBe('C:/anh/anh1.jpg');
  });
});
