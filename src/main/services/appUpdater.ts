import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import logger from '../logger';
import type { UpdateCheckResult } from '@shared/ipc';

// Cập nhật chỉ chạy khi người dùng bấm trong Cài đặt — app không tự kiểm tra lúc mở, để khỏi hiện
// thông báo phiên bản mới mỗi lần khởi động. feedURL lấy theo cấu hình "publish" trong package.json
// (electron-builder ghi sẵn vào app-update.yml lúc build), không cần setFeedURL().
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

export function getAppVersion(): string {
  return app.getVersion();
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();

  // Bản dev (chưa đóng gói) không có app-update.yml, electron-updater sẽ ném lỗi khó hiểu.
  if (!app.isPackaged) {
    return { status: 'unavailable', currentVersion };
  }

  try {
    const result = await autoUpdater.checkForUpdates();
    if (result?.isUpdateAvailable) {
      return { status: 'available', currentVersion, latestVersion: result.updateInfo.version };
    }
    return { status: 'up-to-date', currentVersion };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[AppUpdater] Không kiểm tra được bản cập nhật: ${message}`);
    throw new Error('Không kiểm tra được bản cập nhật. Vui lòng kiểm tra kết nối mạng và thử lại.', { cause: err });
  }
}

/** Tải bản mới (phải gọi sau khi checkForUpdate báo `available`) rồi khởi động lại để cài. */
export async function downloadAndInstallUpdate(): Promise<void> {
  try {
    await autoUpdater.downloadUpdate();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[AppUpdater] Không tải được bản cập nhật: ${message}`);
    throw new Error('Không tải được bản cập nhật. Vui lòng thử lại sau.', { cause: err });
  }
  autoUpdater.quitAndInstall();
}
