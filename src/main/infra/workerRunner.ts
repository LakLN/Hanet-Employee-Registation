import type { Worker, WorkerOptions } from 'worker_threads';

export type WorkerFactory = (options: WorkerOptions) => Worker;

export interface WorkerReply<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * Chạy một worker cho MỘT công việc rồi kết thúc, có timeout.
 *
 * Timeout là bắt buộc: dữ liệu dị dạng (ảnh hỏng, xlsx lỗi cấu trúc) hiếm khi ném lỗi ngay mà có thể
 * khiến worker treo trong vòng lặp decode/parse. Không có timeout thì một file lỗi sẽ giữ vĩnh viễn
 * một slot xử lý và cả lô không bao giờ báo hoàn tất.
 */
export function runWorkerOnce<TResult>(
  createWorker: WorkerFactory,
  workerData: unknown,
  options: { timeoutMs: number; timeoutMessage: string; pickResult: (message: unknown) => TResult | undefined },
): Promise<TResult> {
  return new Promise<TResult>((resolve, reject) => {
    const worker = createWorker({ workerData });
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      fn();
    };

    const timer = setTimeout(() => finish(() => reject(new Error(options.timeoutMessage))), options.timeoutMs);

    worker.once('message', (message: unknown) => {
      const result = options.pickResult(message);
      const failure = (message as { error?: string } | null)?.error;
      finish(() =>
        result !== undefined ? resolve(result) : reject(new Error(failure || 'Worker không trả về dữ liệu')),
      );
    });

    worker.once('error', (err: Error) => finish(() => reject(err)));

    worker.once('exit', (code: number) => {
      // Worker thoát mà chưa gửi message (OOM, process bị kill) — nếu không xử lý, promise treo vĩnh viễn.
      finish(() => reject(new Error(`Worker kết thúc bất thường (exit code ${code})`)));
    });
  });
}
