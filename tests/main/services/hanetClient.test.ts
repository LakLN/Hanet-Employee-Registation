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

describe('registerPersonToHanet — kiểm chứng trùng Mã NV (-9005)', () => {
  const dupAlias = { status: 200, data: { returnCode: -9005, returnMessage: 'Alias id already exist' } };
  const ok = { status: 200, data: { returnCode: 1, returnMessage: 'OK', data: { personID: 'p-1' } } };
  const lookup = (persons: unknown[]) => ({ status: 200, data: { returnCode: 1, data: persons } });

  // Phân luồng mock theo URL: đăng ký (/person/register) và tra alias (/getListByAliasIDAllPlace).
  function routeAxios(registerResponses: unknown[], lookupResponses: unknown[]) {
    axiosPostMock.mockImplementation(async (url: string) => {
      const queue = url.includes('getListByAliasIDAllPlace') ? lookupResponses : registerResponses;
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  async function run() {
    const promise = registerPersonToHanet(baseRecord, config);
    await vi.runAllTimersAsync();
    return promise;
  }

  it('giữ kết quả trùng khi tra thấy có hồ sơ đang giữ mã, không gửi lại', async () => {
    routeAxios([dupAlias], [lookup([{ personID: 'old', name: 'Người cũ', placeID: 'place-2' }])]);

    const result = await run();

    expect(result.raw?.returnCode).toBe(-9005);
    const registerCalls = axiosPostMock.mock.calls.filter(([url]) => String(url).endsWith('/person/register'));
    expect(registerCalls).toHaveLength(1);
  });

  it('âm thầm gửi lại khi không ai giữ mã, và thành công ở lần sau', async () => {
    routeAxios([dupAlias, ok], [lookup([])]);

    const result = await run();

    expect(result.success).toBe(true);
    expect(result.raw?.returnCode).toBe(1);
  });

  it('chuyển thành lỗi (không còn mã -9005) khi gửi lại vẫn báo trùng mà vẫn không ai giữ mã', async () => {
    routeAxios([dupAlias, dupAlias], [lookup([]), lookup([])]);

    const result = await run();

    expect(result.success).toBe(false);
    expect(result.raw?.returnCode).toBeUndefined();
    expect(result.message).toContain('không tìm thấy hồ sơ nào');
  });

  it('không tra được thì vẫn gửi lại 1 lần, rồi giữ nguyên kết quả trùng của Hanet', async () => {
    routeAxios([dupAlias, dupAlias], [fakeAxiosError({ message: 'boom', status: 500, data: {} })]);

    const result = await run();

    expect(result.raw?.returnCode).toBe(-9005);
    const registerCalls = axiosPostMock.mock.calls.filter(([url]) => String(url).endsWith('/person/register'));
    expect(registerCalls).toHaveLength(2);
  });
});
