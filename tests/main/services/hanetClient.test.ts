import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPersonToHanet } from '../../../src/main/services/hanetClient';
import { EmployeeRecord, HanetConfig } from '../../../src/shared/types';

// vi.mock bị hoist lên đầu file (trước cả import/const bên dưới) — các mock function tham chiếu
// trong factory phải khai báo qua vi.hoisted để tránh lỗi truy cập biến trước khi khởi tạo.
const { resizeMock, axiosPostMock } = vi.hoisted(() => ({
  resizeMock: vi.fn(async () => Buffer.from('fake-image-bytes')),
  axiosPostMock: vi.fn(),
}));

vi.mock('../../../src/main/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../src/main/services/imageProcessor', () => ({
  resizeForHanet: resizeMock,
}));

vi.mock('axios', () => ({
  default: {
    post: axiosPostMock,
    isAxiosError: (err: unknown): boolean =>
      typeof err === 'object' && err !== null && (err as { isAxiosError?: boolean }).isAxiosError === true,
    isCancel: (err: unknown): boolean =>
      typeof err === 'object' && err !== null && (err as { __cancel?: boolean }).__cancel === true,
  },
}));

function fakeAxiosError(opts: { message: string; code?: string; status?: number; data?: unknown }) {
  return Object.assign(new Error(opts.message), {
    isAxiosError: true,
    code: opts.code,
    response: opts.status !== undefined ? { status: opts.status, data: opts.data } : undefined,
  });
}

const baseRecord: EmployeeRecord = {
  employeeId: 'NV001',
  name: 'Nguyễn Văn A',
  title: 'Nhân viên',
  phone: '0901234567',
  imageFileName: 'anh1.jpg',
  imagePath: 'C:/anh/anh1.jpg',
  status: 'VALID',
};
const config: HanetConfig = { accessToken: 'token-x', placeId: 'place-1' };

beforeEach(() => {
  axiosPostMock.mockReset();
  resizeMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('registerPersonToHanet', () => {
  it('đăng ký thành công khi Hanet trả returnCode=1', async () => {
    axiosPostMock.mockResolvedValueOnce({ status: 200, data: { returnCode: 1, returnMessage: 'OK' } });

    const result = await registerPersonToHanet(baseRecord, config);

    expect(result.success).toBe(true);
    expect(result.raw?.returnCode).toBe(1);
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
  });

  it('bỏ qua và báo lỗi ngay khi thiếu ảnh, không gọi API', async () => {
    const result = await registerPersonToHanet({ ...baseRecord, imagePath: null }, config);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Thiếu ảnh');
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(resizeMock).not.toHaveBeenCalled();
  });

  it('trả lỗi xử lý ảnh khi resize thất bại, không gọi API', async () => {
    resizeMock.mockRejectedValueOnce(new Error('ảnh hỏng'));

    const result = await registerPersonToHanet(baseRecord, config);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Lỗi xử lý ảnh');
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it('trả về thất bại kèm dữ liệu người đã tồn tại khi returnCode=-9007', async () => {
    axiosPostMock.mockResolvedValueOnce({
      status: 200,
      data: {
        returnCode: -9007,
        returnMessage: 'Alias đã tồn tại',
        data: { name: 'A', title: 'NV', placeName: 'HCM', file: 'url' },
      },
    });

    const result = await registerPersonToHanet(baseRecord, config);

    expect(result.success).toBe(false);
    expect(result.raw?.returnCode).toBe(-9007);
    expect(result.message).toBe('Alias đã tồn tại');
  });

  it('không retry khi lỗi HTTP không thuộc diện retryable (400)', async () => {
    axiosPostMock.mockRejectedValueOnce(fakeAxiosError({ message: 'Bad request', status: 400 }));

    const result = await registerPersonToHanet(baseRecord, config, 2);

    expect(result.success).toBe(false);
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
  });

  it('retry khi lỗi 500 rồi thành công ở lần thử sau', async () => {
    vi.useFakeTimers();
    axiosPostMock
      .mockRejectedValueOnce(fakeAxiosError({ message: 'Server error', status: 500 }))
      .mockResolvedValueOnce({ status: 200, data: { returnCode: 1 } });

    const resultPromise = registerPersonToHanet(baseRecord, config, 2);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(axiosPostMock).toHaveBeenCalledTimes(2);
  });

  it('tính là thành công khi lần thử trước timeout nhưng Hanet đã xử lý xong (báo alias đã tồn tại ở lần sau)', async () => {
    vi.useFakeTimers();
    axiosPostMock
      .mockRejectedValueOnce(fakeAxiosError({ message: 'timeout of 45000ms exceeded', code: 'ECONNABORTED' }))
      .mockResolvedValueOnce({ status: 200, data: { returnCode: -9007, returnMessage: 'Alias đã tồn tại' } });

    const resultPromise = registerPersonToHanet(baseRecord, config, 2);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.raw?.returnCode).toBe(1);
  });

  it('trả về cancelled khi signal đã bị abort trước khi gửi request', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await registerPersonToHanet(baseRecord, config, 2, controller.signal);

    expect(result.cancelled).toBe(true);
    expect(axiosPostMock).not.toHaveBeenCalled();
  });
});
