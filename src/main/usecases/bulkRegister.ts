import pLimit from 'p-limit';
import logger from '../logger';
import { EmployeeRecord, HanetConfig, SyncResultItem } from '@shared/types';
import { BulkRegisterSummary, InFlightRecord, SyncProgress } from '@shared/ipc';
import { isQuotaExceeded, resolveStatusMeta } from '@shared/hanetStatus';
import { PreparedImage, RegisterResult } from '../services/hanetClient';

/**
 * Kênh báo tiến trình ra ngoài. Usecase KHÔNG biết gì về Electron/IpcMainInvokeEvent — nhờ vậy toàn
 * bộ luồng điều phối lô (hủy giữa lô, dừng sớm khi hết quota, đếm kết quả) test được bằng vitest
 * thuần, và tái dùng được nếu sau này chuyển sang backend/CLI.
 */
export interface BulkRegisterPort {
  onProgress(progress: SyncProgress): void;
  onCurrent(inFlight: InFlightRecord[]): void;
  onResult(item: SyncResultItem): void;
}

export interface BulkConcurrency {
  /** Số request đăng ký gửi song song lên Hanet. */
  upload: number;
  /** Số ảnh được xử lý song song (CPU). */
  resize: number;
  /** Số ảnh được chuẩn bị SẴN trước khi tới lượt upload — chính là phần gối đầu CPU/mạng. */
  prefetch: number;
}

export interface BulkRegisterDeps {
  getConfig(): Promise<HanetConfig>;
  /** Đọc + resize ảnh. Trả về failure (không ném lỗi) khi thiếu ảnh/ảnh hỏng — không retry. */
  prepareImage(record: EmployeeRecord): Promise<PreparedImage>;
  upload(record: EmployeeRecord, image: Buffer, config: HanetConfig, signal: AbortSignal): Promise<RegisterResult>;
  concurrency: BulkConcurrency;
}

export function buildSyncResultItem(record: EmployeeRecord, result: RegisterResult): SyncResultItem {
  const raw = result.raw;
  const item: SyncResultItem = {
    employeeId: record.employeeId,
    name: record.name,
    success: result.success,
    returnCode: raw?.returnCode,
    message: raw?.returnMessage ?? result.message,
    durationMs: result.durationMs,
    personID: result.success ? raw?.data?.personID : undefined,
  };

  if (!result.success && raw?.data && (raw.returnCode === -9007 || raw.returnCode === -9005)) {
    item.existingPerson = {
      name: raw.data.name ?? '',
      title: raw.data.title || 'Nhân viên',
      placeName: raw.data.placeName ?? '',
      avatarUrl: raw.data.file,
    };
  }

  return item;
}

export class BulkRegistrationAlreadyRunningError extends Error {
  constructor() {
    super('Đang có một tiến trình đăng ký hàng loạt khác đang chạy. Vui lòng đợi hoàn tất hoặc hủy trước.');
    this.name = 'BulkRegistrationAlreadyRunningError';
  }
}

export class BulkRegistrationRunner {
  private active: AbortController | null = null;

  constructor(private readonly deps: BulkRegisterDeps) {}

  get isRunning(): boolean {
    return this.active !== null;
  }

  // Người dùng chủ động bấm "Hủy" thì cắt ngay cả request đang bay (đã gửi lên Hanet, đang chờ
  // response) — đây là ý muốn rõ ràng của họ. Set cả hai: stopGate để chặn record chưa gửi, và
  // hardAbort để cắt cả request đang bay qua axios signal.
  private hardAbort: AbortController | null = null;

  cancel(): boolean {
    this.active?.abort();
    this.hardAbort?.abort();
    return true;
  }

  async run(records: EmployeeRecord[], port: BulkRegisterPort): Promise<BulkRegisterSummary> {
    if (this.active) throw new BulkRegistrationAlreadyRunningError();

    const total = records.length;
    const startedAt = Date.now();
    // stopGate: chặn record CHƯA bắt đầu gửi (còn trong gate/uploadLimit queue). Không truyền
    // xuống axios — hết quota (-9008) không nên cắt ngang request ĐANG BAY, vì Hanet có thể đã xử
    // lý xong phía server; cắt ngang biến một đăng ký thành công thành "đã hủy" giả, mất luôn kết
    // quả thật (xem hardAbort bên dưới cho trường hợp người dùng chủ động muốn cắt ngay).
    const abort = new AbortController();
    this.active = abort;
    const hardAbort = new AbortController();
    this.hardAbort = hardAbort;

    // Thu kết quả vào mảng dùng chung thay vì lấy giá trị trả về của Promise.all: nếu có lỗi ngoài
    // dự kiến ở giữa lô, phần đã hoàn thành vẫn được ghi audit trong finally.
    const finished: RegisterResult[] = [];
    const inFlight = new Map<string, InFlightRecord>();
    let completed = 0;
    let quotaExceeded = false;

    const emitCurrent = () => port.onCurrent(Array.from(inFlight.values()));

    try {
      // Lấy config một lần cho cả lô — token có hạn dùng ~1 năm nên không cần refresh giữa chừng.
      const config = await this.deps.getConfig();
      const { upload: uploadConcurrency, resize, prefetch } = this.deps.concurrency;

      logger.info(
        `[Hanet] Bắt đầu đăng ký ${total} nhân viên (upload=${uploadConcurrency}, resize=${resize}, prefetch=${prefetch})`,
      );

      // 3 hàng rào tách biệt để CPU (resize) và mạng (upload) gối đầu nhau thay vì chạy tuần tự
      // trong cùng một slot:
      // - gate giới hạn SỐ ẢNH ĐANG GIỮ TRONG BỘ NHỚ (uploading + đã resize xong đang chờ), nên
      //   prefetch không làm phình RAM khi lô có hàng trăm người.
      // - resizeLimit giới hạn số ảnh decode song song theo số lõi CPU.
      // - uploadLimit giữ đúng mức song song mà Hanet chịu được cho cùng một placeID.
      const gate = pLimit(uploadConcurrency + prefetch);
      const resizeLimit = pLimit(resize);
      const uploadLimit = pLimit(uploadConcurrency);

      // Lý do hủy chỉ được biết CHẮC CHẮN sau khi cả lô chạy xong (quotaExceeded chỉ trở thành true
      // giữa chừng) — nên các SyncResultItem của bản ghi bị hủy được build và emit ở CUỐI, khi lý do
      // đã chốt, thay vì đoán ngay lúc phát hiện signal bị abort.
      const cancelledRecords: EmployeeRecord[] = [];

      await Promise.all(
        records.map((record) =>
          gate(async () => {
            if (abort.signal.aborted) {
              cancelledRecords.push(record);
              return;
            }

            inFlight.set(record.employeeId, { employeeId: record.employeeId, name: record.name });
            emitCurrent();

            try {
              const result = await this.processRecord(record, config, abort, hardAbort, resizeLimit, uploadLimit);
              if (!result) return;
              if (result.cancelled) {
                cancelledRecords.push(record);
                return;
              }

              finished.push(result);
              completed += 1;
              port.onProgress({ current: completed, total });
              port.onResult(buildSyncResultItem(record, result));

              // Khi Hanet báo hết giới hạn khuôn mặt của gói tại địa điểm này, MỌI bản ghi còn lại
              // chắc chắn cũng thất bại với cùng lý do — hủy sớm để không mất thời gian thử từng
              // người (mỗi lần thử có thể treo tới khi hết timeout trước khi lộ ra lỗi thật).
              if (isQuotaExceeded(result.raw?.returnCode)) {
                quotaExceeded = true;
                abort.abort();
              }
            } finally {
              inFlight.delete(record.employeeId);
              emitCurrent();
            }
          }),
        ),
      );

      // Báo cáo cho renderer + Excel xuất ra biết CHÍNH XÁC ai bị bỏ lại và vì sao — trước đây các
      // bản ghi này không emit onResult gì cả, khiến chúng biến mất khỏi bảng kết quả/Excel dù vẫn
      // còn trong audit log JSON.
      const cancelReason = quotaExceeded
        ? 'Chưa xử lý — dừng sớm do hết giới hạn khuôn mặt của gói Hanet tại địa điểm này.'
        : 'Chưa xử lý — đã hủy giữa chừng.';
      for (const record of cancelledRecords) {
        port.onResult(
          buildSyncResultItem(record, { success: false, message: cancelReason, employeeId: record.employeeId }),
        );
      }

      // completed chỉ tăng cho bản ghi HOÀN THÀNH thật (không tính cancelledRecords) — nếu batch
      // dừng sớm, progress dừng lại ở "5/7" mãi mãi dù đã emit đủ onResult cho cả 7 người, khiến UI
      // hiển thị "Đang xử lý" vô thời hạn. Báo progress = total ở đây để chốt "đã xong" rõ ràng.
      port.onProgress({ current: total, total });

      const summary = this.summarize(total, finished, quotaExceeded);
      const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      const cancelledNote =
        cancelledRecords.length > 0
          ? `, ${cancelledRecords.length} chưa xử lý (${quotaExceeded ? 'dừng sớm do hết giới hạn khuôn mặt' : 'đã hủy'})`
          : '';
      logger.info(
        `[Hanet] Hoàn tất đăng ký: ${summary.success} thành công, ${summary.duplicate} đã tồn tại, ${summary.failed} thất bại${cancelledNote}, tổng thời gian ${totalSec}s`,
      );
      return summary;
    } finally {
      // BẮT BUỘC trong finally: nếu getConfig() lỗi (mất mạng lúc làm mới token) mà controller không
      // được nhả, mọi lần bấm "Đăng ký hàng loạt" sau đó sẽ bị chặn cho tới khi khởi động lại app.
      this.active = null;
      this.hardAbort = null;
    }
  }

  private async processRecord(
    record: EmployeeRecord,
    config: HanetConfig,
    abort: AbortController,
    hardAbort: AbortController,
    resizeLimit: <T>(fn: () => Promise<T>) => Promise<T>,
    uploadLimit: <T>(fn: () => Promise<T>) => Promise<T>,
  ): Promise<RegisterResult | null> {
    const prepared = await resizeLimit(() => this.deps.prepareImage(record));
    if (!prepared.ok) return prepared.failure;

    if (abort.signal.aborted) {
      return { success: false, message: 'Đã hủy', employeeId: record.employeeId, cancelled: true };
    }

    // hardAbort (không phải abort) được truyền xuống request thật: chỉ người dùng chủ động bấm Hủy
    // mới cắt ngang request đang bay, còn dừng sớm do hết quota để nó hoàn tất bình thường.
    return uploadLimit(() => this.deps.upload(record, prepared.buffer, config, hardAbort.signal));
  }

  private summarize(total: number, finished: RegisterResult[], quotaExceeded: boolean): BulkRegisterSummary {
    const tone = (r: RegisterResult) => resolveStatusMeta(r.raw?.returnCode, r.message).tone;
    const success = finished.filter((r) => tone(r) === 'success').length;
    const duplicate = finished.filter((r) => tone(r) === 'warning').length;
    return {
      total,
      success,
      duplicate,
      failed: finished.length - success - duplicate,
      cancelledCount: total - finished.length,
      quotaExceeded,
    };
  }
}
