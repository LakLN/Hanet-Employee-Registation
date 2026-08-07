import fs from 'fs';
import { parentPort, workerData } from 'worker_threads';
import { parseEmployeeExcel } from '../services/excelParser';
import { listImageFiles } from '../infra/imageFolder';

export interface ExcelWorkerInput {
  excelPath: string;
  imageFolderPath: string | null;
}

/**
 * Parse Excel chạy trong worker_thread: file vài nghìn dòng mất hàng giây CPU. Trước đây việc này
 * chạy trong renderer nên UI đóng băng hoàn toàn trong lúc đọc; chạy ở main process (single thread)
 * cũng sẽ chặn luôn cả IPC/tiến trình đăng ký.
 */
async function run() {
  const { excelPath, imageFolderPath } = workerData as ExcelWorkerInput;

  const [fileBuffer, imageFiles] = await Promise.all([
    fs.promises.readFile(excelPath),
    imageFolderPath ? listImageFiles(imageFolderPath) : Promise.resolve([]),
  ]);

  const records = await parseEmployeeExcel(
    fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength) as ArrayBuffer,
    imageFiles,
  );

  parentPort!.postMessage({ ok: true, records });
}

run().catch((err) => {
  parentPort!.postMessage({ ok: false, error: err?.message ?? String(err) });
});
