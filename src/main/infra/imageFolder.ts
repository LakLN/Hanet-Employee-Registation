import fs from 'fs';
import path from 'path';

export const IMAGE_EXTENSIONS = /\.(jpe?g|png)$/i;

export interface ImageFileEntry {
  filePath: string;
  fileName: string;
}

/**
 * Tách khỏi usecases/pickFiles (file đó import `electron`) để worker_thread dùng lại được — worker
 * chạy trong môi trường Node thuần, require('electron') ở đó sẽ lỗi.
 */
export async function listImageFiles(folderPath: string): Promise<ImageFileEntry[]> {
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.test(entry.name))
    .map((entry) => ({ filePath: path.join(folderPath, entry.name), fileName: entry.name }));
}
