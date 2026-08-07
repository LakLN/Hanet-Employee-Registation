import { describe, expect, it } from 'vitest';
import { HANET_QUOTA_EXCEEDED_CODE, isQuotaExceeded, resolveStatusMeta } from '../../src/shared/hanetStatus';

describe('isQuotaExceeded', () => {
  it('nhận diện đúng mã hết giới hạn khuôn mặt', () => {
    expect(isQuotaExceeded(HANET_QUOTA_EXCEEDED_CODE)).toBe(true);
  });

  it('trả về false với các mã khác hoặc undefined', () => {
    expect(isQuotaExceeded(1)).toBe(false);
    expect(isQuotaExceeded(undefined)).toBe(false);
  });
});

describe('resolveStatusMeta', () => {
  it('map đúng các mã Hanet đã biết sang label/tone', () => {
    expect(resolveStatusMeta(1, 'ignored')).toEqual({ label: 'Đã đăng ký', tone: 'success' });
    expect(resolveStatusMeta(-9007, 'ignored')).toEqual({ label: 'Đã tồn tại trong hệ thống', tone: 'warning' });
    expect(resolveStatusMeta(-9005, 'ignored')).toEqual({ label: 'Trùng mã nhân viên (Alias ID)', tone: 'warning' });
    expect(resolveStatusMeta(HANET_QUOTA_EXCEEDED_CODE, 'ignored')).toEqual({
      label: 'Hết giới hạn khuôn mặt (gói Hanet)',
      tone: 'error',
    });
  });

  it('fallback về message gốc với tone error khi mã không xác định', () => {
    expect(resolveStatusMeta(-1, 'Lỗi lạ')).toEqual({ label: 'Lỗi lạ', tone: 'error' });
  });

  it('fallback về "Thất bại" khi không có mã lẫn message', () => {
    expect(resolveStatusMeta(undefined, '')).toEqual({ label: 'Thất bại', tone: 'error' });
  });
});
