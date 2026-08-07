// electron-vite biên dịch worker thành chunk riêng và trả về factory tạo Worker — nhờ vậy đường dẫn
// tới file worker đúng cả khi chạy dev và khi đã đóng gói vào asar, không cần tự ghép __dirname.
import createImageWorker from '../workers/imageWorker?nodeWorker';

// Ảnh dị dạng/quá lớn hiếm khi throw ngay mà có thể khiến Jimp xử lý treo trong worker (GC
// thrash, vòng lặp decode bất thường) — không có timeout thì 1 ảnh lỗi có thể chiếm vĩnh viễn 1
// slot concurrency của bulk-register, khiến cả batch không bao giờ báo hoàn tất.
const RESIZE_TIMEOUT_MS = 30000;

/**
 * Resize chạy trong worker_thread riêng để không chặn main process (main process còn phải
 * bơm sự kiện IPC tiến trình đăng ký trong lúc resize hàng trăm ảnh).
 */
export function resizeForHanet(imagePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const worker = createImageWorker({ workerData: { imagePath } });

    let settled = false;
    const timeoutTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      worker.terminate();
      reject(new Error(`Xử lý ảnh quá ${RESIZE_TIMEOUT_MS / 1000}s, có thể ảnh bị hỏng hoặc quá lớn`));
    }, RESIZE_TIMEOUT_MS);

    worker.once('message', (msg: { ok: boolean; buffer?: Buffer; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      worker.terminate();
      if (msg.ok && msg.buffer) {
        resolve(Buffer.from(msg.buffer));
      } else {
        reject(new Error(msg.error || 'Lỗi xử lý ảnh không xác định'));
      }
    });

    worker.once('error', (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      worker.terminate();
      reject(err);
    });
  });
}
