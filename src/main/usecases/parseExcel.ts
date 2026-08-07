import createExcelWorker from '../workers/excelWorker?nodeWorker';
import { runWorkerOnce } from '../infra/workerRunner';
import { filePolicy } from '../infra/filePolicy';
import { EmployeeRecord } from '@shared/types';
import { ParseExcelInput } from '@shared/ipc';

const PARSE_TIMEOUT_MS = 60_000;

export async function parseExcelFile(input: ParseExcelInput): Promise<EmployeeRecord[]> {
  // Đường dẫn do renderer gửi lên: chỉ chấp nhận file/thư mục người dùng đã chọn qua hộp thoại.
  filePolicy.assertAllowed(input.excelPath);
  if (input.imageFolderPath) filePolicy.assertAllowed(input.imageFolderPath);

  return runWorkerOnce<EmployeeRecord[]>(createExcelWorker, input, {
    timeoutMs: PARSE_TIMEOUT_MS,
    timeoutMessage: `Đọc file Excel quá ${PARSE_TIMEOUT_MS / 1000}s — file có thể quá lớn hoặc bị lỗi cấu trúc.`,
    pickResult: (message) => {
      const reply = message as { ok?: boolean; records?: EmployeeRecord[] } | null;
      return reply?.ok && reply.records ? reply.records : undefined;
    },
  });
}
