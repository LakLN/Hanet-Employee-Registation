import { beforeEach, describe, expect, it, vi } from 'vitest';

const axiosGetMock = vi.fn();
const axiosPatchMock = vi.fn();
vi.mock('axios', () => ({
  default: {
    get: axiosGetMock,
    patch: axiosPatchMock,
  },
}));

vi.mock('electron', () => ({}));

vi.mock('../../../src/main/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

async function loadModule() {
  vi.resetModules();
  return import('../../../src/main/services/licenseActivation');
}

beforeEach(() => {
  axiosGetMock.mockReset();
  axiosPatchMock.mockReset();
  process.env.LICENSE_BASE_URL = 'https://example.firebaseio.com/licenses';
});

describe('activateLicenseOnline', () => {
  // LICENSE_BASE_URL có giá trị mặc định hardcode (licenseConfig.ts) — không set biến môi trường
  // này vẫn phải gọi đúng Firebase project mặc định của Maxcom, không được bỏ qua kiểm tra.
  it('dùng URL Firebase mặc định khi không set LICENSE_BASE_URL', async () => {
    delete process.env.LICENSE_BASE_URL;
    axiosGetMock.mockResolvedValueOnce({ data: { valid: true, is_used: false } });
    axiosPatchMock.mockResolvedValueOnce({ data: {} });
    const { activateLicenseOnline } = await loadModule();

    await expect(activateLicenseOnline('MAY-01')).resolves.toBeUndefined();
    expect(axiosGetMock.mock.calls[0]?.[0]).toContain('firebasedatabase.app/licenses/MAY-01.json');
  });

  it('từ chối khi mã license không tồn tại (Firebase trả null)', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: null });
    const { activateLicenseOnline } = await loadModule();

    await expect(activateLicenseOnline('MAY-01')).rejects.toThrow(/không hợp lệ|chưa được cấp/);
    expect(axiosPatchMock).not.toHaveBeenCalled();
  });

  it('từ chối khi license bị vô hiệu hoá (valid=false)', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { valid: false, message: 'Đã khoá' } });
    const { activateLicenseOnline } = await loadModule();

    await expect(activateLicenseOnline('MAY-01')).rejects.toThrow('Đã khoá');
    expect(axiosPatchMock).not.toHaveBeenCalled();
  });

  // Hồi quy quan trọng nhất của tính năng: mã đã kích hoạt (is_used=true) không được dùng lại lần
  // 2, dù trên máy khác hay cùng máy sau khi xoá cấu hình local.
  it('từ chối khi mã license đã được kích hoạt trước đó (is_used=true)', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { valid: true, is_used: true } });
    const { activateLicenseOnline } = await loadModule();

    await expect(activateLicenseOnline('MAY-01')).rejects.toThrow(/đã được kích hoạt/);
    expect(axiosPatchMock).not.toHaveBeenCalled();
  });

  it('kích hoạt thành công khi mã hợp lệ và chưa dùng — ghi is_used=true lên Firebase', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { valid: true, is_used: false } });
    axiosPatchMock.mockResolvedValueOnce({ data: {} });
    const { activateLicenseOnline } = await loadModule();

    await expect(activateLicenseOnline('MAY-01')).resolves.toBeUndefined();

    expect(axiosPatchMock).toHaveBeenCalledTimes(1);
    const call = axiosPatchMock.mock.calls[0] as [string, Record<string, unknown>];
    const [url, body] = call;
    expect(url).toBe('https://example.firebaseio.com/licenses/MAY-01.json');
    expect(body).toMatchObject({ is_used: true });
    expect(typeof body.activated_at).toBe('string');
    expect(typeof body.device_fingerprint).toBe('string');
  });

  it('báo lỗi kết nối khi không đọc được node license', async () => {
    axiosGetMock.mockRejectedValueOnce(new Error('ENOTFOUND'));
    const { activateLicenseOnline } = await loadModule();

    await expect(activateLicenseOnline('MAY-01')).rejects.toThrow(/kết nối/);
    expect(axiosPatchMock).not.toHaveBeenCalled();
  });

  it('báo lỗi khi ghi trạng thái kích hoạt lên Firebase thất bại', async () => {
    axiosGetMock.mockResolvedValueOnce({ data: { valid: true, is_used: false } });
    axiosPatchMock.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    const { activateLicenseOnline } = await loadModule();

    await expect(activateLicenseOnline('MAY-01')).rejects.toThrow(/xác nhận kích hoạt/);
  });
});
