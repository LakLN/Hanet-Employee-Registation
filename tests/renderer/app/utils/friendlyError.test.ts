import { describe, expect, it } from 'vitest';
import { friendlyErrorMessage } from '../../../../src/renderer/app/utils/friendlyError';

describe('friendlyErrorMessage', () => {
  it('nhận diện lỗi mạng', () => {
    expect(friendlyErrorMessage(new Error('Network Error'))).toContain('kết nối mạng');
    expect(friendlyErrorMessage(new Error('connect ECONNREFUSED 1.2.3.4:443'))).toContain('kết nối mạng');
    expect(friendlyErrorMessage(new Error('getaddrinfo ENOTFOUND partner.hanet.ai'))).toContain('kết nối mạng');
  });

  it('nhận diện timeout', () => {
    expect(friendlyErrorMessage(new Error('timeout of 45000ms exceeded'))).toContain('quá thời gian chờ');
  });

  it('nhận diện file không tồn tại', () => {
    expect(friendlyErrorMessage(new Error('ENOENT: no such file or directory'))).toContain('Không tìm thấy file');
  });

  it('nhận diện lỗi quyền truy cập', () => {
    expect(friendlyErrorMessage(new Error('EACCES: permission denied'))).toContain('quyền truy cập');
    expect(friendlyErrorMessage(new Error('EPERM: operation not permitted'))).toContain('quyền truy cập');
  });

  it('trả về nguyên văn message khi không khớp pattern nào', () => {
    expect(friendlyErrorMessage(new Error('Lỗi lạ không xác định'))).toBe('Lỗi lạ không xác định');
  });

  it('xử lý được giá trị không phải Error', () => {
    expect(friendlyErrorMessage('chuỗi lỗi thô')).toBe('chuỗi lỗi thô');
  });

  it('bỏ tiền tố lỗi IPC của Electron', () => {
    const err = new Error("Error invoking remote method 'excel:parse': Error: Không tìm thấy cột bắt buộc");
    expect(friendlyErrorMessage(err)).toBe('Không tìm thấy cột bắt buộc');
  });

  it('giữ nguyên thông báo main đã diễn giải sẵn', () => {
    const msg = 'Không lấy được phiên đăng nhập Hanet. Chi tiết: timeout of 15000ms exceeded';
    expect(friendlyErrorMessage(new Error(`Error invoking remote method 'x': Error: ${msg}`))).toBe(msg);
  });
});
