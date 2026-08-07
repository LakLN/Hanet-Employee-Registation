import path from 'path';
import { dialog } from 'electron';
import { filePolicy } from '../infra/filePolicy';
import { listImageFiles } from '../infra/imageFolder';
import { SelectedExcelFile, SelectedFolder, SelectedImage } from '@shared/ipc';

export async function pickExcelFile(): Promise<SelectedExcelFile | null> {
  const result = await dialog.showOpenDialog({
    title: 'Chọn file Excel danh sách nhân viên',
    properties: ['openFile'],
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
  });

  const [filePath] = result.filePaths;
  if (result.canceled || !filePath) return null;

  filePolicy.allowFileParent(filePath);
  return { filePath, name: path.basename(filePath) };
}

export async function pickImageFolder(): Promise<SelectedFolder | null> {
  const result = await dialog.showOpenDialog({
    title: 'Chọn thư mục chứa ảnh chân dung',
    properties: ['openDirectory'],
  });

  const [folderPath] = result.filePaths;
  if (result.canceled || !folderPath) return null;

  filePolicy.allowFolder(folderPath);
  // Chỉ trả về số lượng: renderer không cần danh sách đường dẫn ảnh (main ghép sẵn vào từng bản ghi
  // khi parse Excel), nên không phải chuyển hàng trăm chuỗi qua IPC.
  return { folderPath, imageCount: (await listImageFiles(folderPath)).length };
}

export async function pickSingleImage(): Promise<SelectedImage | null> {
  const result = await dialog.showOpenDialog({
    title: 'Chọn ảnh',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }],
  });

  const [filePath] = result.filePaths;
  if (result.canceled || !filePath) return null;

  filePolicy.allowFileParent(filePath);
  return { filePath, fileName: path.basename(filePath) };
}
