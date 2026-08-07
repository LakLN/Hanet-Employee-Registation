import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkRegistrationRunner, BulkRegisterPort } from '../../../src/main/usecases/bulkRegister';
import { PreparedImage, RegisterResult } from '../../../src/main/services/hanetClient';
import { EmployeeRecord, HanetConfig } from '../../../src/shared/types';

vi.mock('../../../src/main/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const config: HanetConfig = { accessToken: 'token', placeId: 'place-1' };

function record(id: string, imagePath: string | null = `C:/anh/${id}.jpg`): EmployeeRecord {
  return {
    employeeId: id,
    name: `Nhân viên ${id}`,
    title: '',
    phone: '',
    imageFileName: `${id}.jpg`,
    imagePath,
    status: 'VALID',
  };
}

function ok(id: string, returnCode = 1): RegisterResult {
  return { success: true, message: 'Đăng ký thành công', employeeId: id, raw: { returnCode } };
}

function failed(id: string, returnCode = -1, message = 'Lỗi'): RegisterResult {
  return { success: false, message, employeeId: id, raw: { returnCode, returnMessage: message } };
}

function collectPort() {
  const progress: Array<{ current: number; total: number }> = [];
  const results: string[] = [];
  const resultItems: Array<{ employeeId: string; message: string }> = [];
  const currentSnapshots: string[][] = [];
  const port: BulkRegisterPort = {
    onProgress: (p) => progress.push(p),
    onResult: (item) => {
      results.push(item.employeeId);
      resultItems.push({ employeeId: item.employeeId, message: item.message });
    },
    onCurrent: (items) => currentSnapshots.push(items.map((i) => i.employeeId)),
  };
  return { port, progress, results, resultItems, currentSnapshots };
}

interface DepOverrides {
  getConfig?: () => Promise<HanetConfig>;
  prepareImage?: (record: EmployeeRecord) => Promise<PreparedImage>;
  upload?: (record: EmployeeRecord, image: Buffer, cfg: HanetConfig, signal: AbortSignal) => Promise<RegisterResult>;
  concurrency?: { upload: number; resize: number; prefetch: number };
}

function makeRunner(overrides: DepOverrides = {}) {
  const runner = new BulkRegistrationRunner({
    getConfig: overrides.getConfig ?? (async () => config),
    prepareImage: overrides.prepareImage ?? (async () => ({ ok: true, buffer: Buffer.from('img') })),
    upload: overrides.upload ?? (async (r) => ok(r.employeeId)),
    concurrency: overrides.concurrency ?? { upload: 2, resize: 2, prefetch: 2 },
  });
  return { runner };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BulkRegistrationRunner', () => {
  it('đăng ký hết danh sách và tổng hợp đúng số thành công/đã tồn tại/thất bại', async () => {
    const { runner } = makeRunner({
      upload: async (r) => {
        if (r.employeeId === 'NV002') return failed('NV002', -9007, 'Đã tồn tại'); // tone = warning
        if (r.employeeId === 'NV003') return failed('NV003', -1, 'Lỗi máy chủ');
        return ok(r.employeeId);
      },
    });
    const { port, progress, results } = collectPort();

    const summary = await runner.run([record('NV001'), record('NV002'), record('NV003')], port);

    expect(summary).toEqual({
      total: 3,
      success: 1,
      duplicate: 1,
      failed: 1,
      cancelledCount: 0,
      quotaExceeded: false,
    });
    expect(results.sort()).toEqual(['NV001', 'NV002', 'NV003']);
    expect(progress.at(-1)).toEqual({ current: 3, total: 3 });
  });

  it('thiếu ảnh/ảnh hỏng thì tính là thất bại và KHÔNG gọi upload', async () => {
    const upload = vi.fn(async (r: EmployeeRecord) => ok(r.employeeId));
    const { runner } = makeRunner({
      prepareImage: async (r) =>
        r.employeeId === 'NV002'
          ? { ok: false, failure: failed('NV002', undefined, 'Lỗi xử lý ảnh: ảnh hỏng') }
          : { ok: true, buffer: Buffer.from('img') },
      upload,
    });
    const { port } = collectPort();

    const summary = await runner.run([record('NV001'), record('NV002')], port);

    expect(summary.success).toBe(1);
    expect(summary.failed).toBe(1);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  // Hết giới hạn khuôn mặt của gói: mọi bản ghi còn lại chắc chắn cũng thất bại với cùng lý do.
  it('dừng sớm cả lô khi Hanet báo hết giới hạn khuôn mặt (-9008)', async () => {
    const uploaded: string[] = [];
    const { runner } = makeRunner({
      concurrency: { upload: 1, resize: 1, prefetch: 0 },
      upload: async (r) => {
        uploaded.push(r.employeeId);
        return r.employeeId === 'NV001' ? failed('NV001', -9008, 'Hết giới hạn') : ok(r.employeeId);
      },
    });
    const { port, resultItems, progress } = collectPort();

    const records = ['NV001', 'NV002', 'NV003', 'NV004'].map((id) => record(id));
    const summary = await runner.run(records, port);

    expect(summary.quotaExceeded).toBe(true);
    expect(summary.cancelledCount).toBe(3);
    expect(uploaded).toEqual(['NV001']);

    // Các bản ghi chưa xử lý PHẢI xuất hiện trong kết quả (bảng UI + Excel xuất ra), không được
    // biến mất âm thầm — trước đây chỉ audit log JSON mới có, khiến người dùng tưởng bị mất dữ liệu.
    const cancelledItems = resultItems.filter((r) => ['NV002', 'NV003', 'NV004'].includes(r.employeeId));
    expect(cancelledItems).toHaveLength(3);
    cancelledItems.forEach((item) => expect(item.message).toMatch(/hết giới hạn khuôn mặt/));

    // Hồi quy: completed chỉ tăng cho bản ghi hoàn thành thật (1/4) — nếu không chốt progress =
    // total ở cuối, UI sẽ hiển thị "Đang xử lý 1/4" mãi mãi dù đã dừng hẳn.
    expect(progress.at(-1)).toEqual({ current: 4, total: 4 });
  });

  // Hồi quy: trước đây signal bị abort ngay khi 1 record báo -9008, cắt ngang cả request ĐANG BAY
  // của record khác (đã gửi lên Hanet, đang chờ response) — khiến một đăng ký THẬT SỰ THÀNH CÔNG bị
  // báo nhầm là "cancelled" và biến mất khỏi kết quả.
  it('request đang bay không bị cắt khi 1 record khác báo hết quota (-9008)', async () => {
    let releaseSlowUpload: (() => void) | null = null;
    const { runner } = makeRunner({
      concurrency: { upload: 2, resize: 2, prefetch: 2 },
      upload: async (r, _image, _cfg, signal) => {
        if (r.employeeId === 'SLOW') {
          // Request "đang bay": giả lập đang chờ HTTP response khi record khác báo hết quota.
          await new Promise<void>((resolve) => {
            releaseSlowUpload = resolve;
          });
          if (signal?.aborted) return { success: false, message: 'Đã hủy', employeeId: r.employeeId, cancelled: true };
          return ok(r.employeeId);
        }
        return failed('QUOTA', -9008, 'Hết giới hạn');
      },
    });
    const { port, resultItems } = collectPort();

    const running = runner.run([record('SLOW'), record('QUOTA')], port);
    await vi.waitFor(() => expect(releaseSlowUpload).not.toBeNull());

    // QUOTA đã báo -9008 lúc này (uploadLimit=2 nên cả hai chạy song song ngay từ đầu). SLOW vẫn
    // đang "chờ response" — resolve nó XONG một khoảng sau khi biết chắc quota đã vượt.
    releaseSlowUpload!();
    const summary = await running;

    expect(summary.quotaExceeded).toBe(true);
    const slowResult = resultItems.find((r) => r.employeeId === 'SLOW');
    expect(slowResult).toBeDefined();
    expect(slowResult!.message).not.toMatch(/hủy/);
  });

  it('người dùng bấm Hủy thì cắt ngay cả request đang bay', async () => {
    const { runner } = makeRunner({
      concurrency: { upload: 1, resize: 1, prefetch: 0 },
      upload: async (r, _image, _cfg, signal) => {
        runner.cancel();
        // Sau khi cancel(), signal của request ĐANG BAY này phải đã bị abort.
        return signal?.aborted
          ? { success: false, message: 'Đã hủy', employeeId: r.employeeId, cancelled: true }
          : ok(r.employeeId);
      },
    });
    const { port, resultItems } = collectPort();

    const summary = await runner.run([record('NV001'), record('NV002')], port);

    expect(summary.success).toBe(0);
    expect(summary.cancelledCount).toBe(2);
    const nv001 = resultItems.find((r) => r.employeeId === 'NV001');
    expect(nv001?.message).toMatch(/hủy/);
  });

  it('hủy giữa lô: những bản ghi chưa xử lý được tính là cancelled', async () => {
    let started = 0;
    const { runner } = makeRunner({
      concurrency: { upload: 1, resize: 1, prefetch: 0 },
      upload: async (r) => {
        started += 1;
        if (started === 1) runner.cancel();
        return ok(r.employeeId);
      },
    });
    const { port, resultItems } = collectPort();

    const summary = await runner.run(
      ['A', 'B', 'C'].map((id) => record(id)),
      port,
    );

    expect(summary.success).toBe(1);
    expect(summary.cancelledCount).toBe(2);

    const cancelledItems = resultItems.filter((r) => ['B', 'C'].includes(r.employeeId));
    expect(cancelledItems).toHaveLength(2);
    cancelledItems.forEach((item) => expect(item.message).toMatch(/đã hủy giữa chừng/));
  });

  it('không cho chạy hai lô cùng lúc', async () => {
    let release: (() => void) | null = null;
    const { runner } = makeRunner({
      upload: async (r) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return ok(r.employeeId);
      },
    });
    const { port } = collectPort();

    const first = runner.run([record('NV001')], port);
    await vi.waitFor(() => expect(release).not.toBeNull());

    await expect(runner.run([record('NV002')], port)).rejects.toThrow('Đang có một tiến trình');

    release!();
    await first;
  });

  // Hồi quy cho lỗi từng làm khoá vĩnh viễn tính năng: getConfig lỗi (mất mạng lúc làm mới token)
  // khiến AbortController không được nhả, mọi lần bấm sau đó đều bị chặn tới khi restart app.
  it('nhả trạng thái khi lấy config thất bại', async () => {
    let attempt = 0;
    const { runner } = makeRunner({
      getConfig: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('Không làm mới được token');
        return config;
      },
    });
    const { port } = collectPort();

    await expect(runner.run([record('NV001')], port)).rejects.toThrow('Không làm mới được token');

    expect(runner.isRunning).toBe(false);

    // Lần chạy tiếp theo phải hoạt động bình thường, không bị "đang có tiến trình khác".
    const summary = await runner.run([record('NV001')], collectPort().port);
    expect(summary.total).toBe(1);
  });

  it('báo danh sách đang xử lý rồi xoá khỏi danh sách khi xong', async () => {
    const { runner } = makeRunner({ concurrency: { upload: 1, resize: 1, prefetch: 0 } });
    const { port, currentSnapshots } = collectPort();

    await runner.run([record('NV001')], port);

    expect(currentSnapshots).toContainEqual(['NV001']);
    expect(currentSnapshots.at(-1)).toEqual([]);
  });

  // Điểm cốt lõi của việc gối đầu CPU/mạng: ảnh của người kế tiếp được chuẩn bị TRONG LÚC người
  // hiện tại đang upload, thay vì chờ upload xong mới bắt đầu resize.
  it('chuẩn bị ảnh của bản ghi kế tiếp trong lúc bản ghi trước đang upload', async () => {
    const events: string[] = [];
    let releaseFirstUpload: (() => void) | null = null;

    const { runner } = makeRunner({
      concurrency: { upload: 1, resize: 2, prefetch: 2 },
      prepareImage: async (r) => {
        events.push(`prepare:${r.employeeId}`);
        return { ok: true, buffer: Buffer.from('img') };
      },
      upload: async (r) => {
        events.push(`upload:${r.employeeId}`);
        if (r.employeeId === 'NV001') {
          await new Promise<void>((resolve) => {
            releaseFirstUpload = resolve;
          });
        }
        return ok(r.employeeId);
      },
    });
    const { port } = collectPort();

    const running = runner.run([record('NV001'), record('NV002')], port);
    await vi.waitFor(() => expect(events).toContain('prepare:NV002'));

    // Ảnh NV002 đã được chuẩn bị xong TRONG LÚC upload NV001 vẫn đang treo, và chưa tới lượt upload
    // (uploadConcurrency = 1). Đây chính là phần CPU/mạng gối đầu nhau.
    expect(events).toContain('upload:NV001');
    expect(events).not.toContain('upload:NV002');

    releaseFirstUpload!();
    await running;
  });
});
