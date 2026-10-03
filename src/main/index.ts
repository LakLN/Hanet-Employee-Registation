import path from 'path';
import { app, BrowserWindow, Menu, screen, shell, dialog } from 'electron';
import { autoUpdater, type UpdateInfo } from 'electron-updater';
import dotenv from 'dotenv';
import windowIcon from '../../resources/maxcom_favicon.png?asset';
import './logger';
import { registerAllIpcHandlers } from './ipc';
import { handleSafeFileProtocol, registerSafeFileScheme } from './infra/safeFileProtocol';

// Khi đóng gói thành exe, process.cwd() không cố định (phụ thuộc cách người dùng mở app), nên .env
// phải được nạp từ đường dẫn tường minh: cạnh file exe khi đã đóng gói, hoặc thư mục gốc dự án khi
// chạy dev (__dirname lúc này là <root>/out/main).
const envPath = app.isPackaged
  ? path.join(path.dirname(app.getPath('exe')), '.env')
  : path.join(__dirname, '..', '..', '.env');
dotenv.config({ path: envPath, quiet: true });

// Không khóa single-instance thì một phiên bản cũ có thể còn chạy ẩn (tray/background) trong lúc
// installer/updater ghi đè file exe — NSIS gặp "file đang được sử dụng" và phải retry. Phiên thứ hai
// tự thoát ngay, phiên đầu focus lại cửa sổ có sẵn.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// Một số driver GPU (thường gặp trên card đồ hoạ tích hợp Intel/AMD hoặc máy ảo/RDP) khiến GPU
// process của Chromium bị crash ngẫu nhiên, biểu hiện rõ nhất là màn hình trắng sau khi chuyển
// sang app khác rồi quay lại. App này chỉ hiển thị form/bảng dữ liệu, không cần tăng tốc phần
// cứng, nên tắt hẳn để tránh crash thay vì chờ vá driver máy người dùng.
app.disableHardwareAcceleration();

// Bắt buộc gọi trước app ready (xem safeFileProtocol.ts).
registerSafeFileScheme();

const rendererDevUrl = process.env.ELECTRON_RENDERER_URL;

/**
 * Chặn mọi hình thức điều hướng ra khỏi trang của app. App có hiển thị ảnh/URL do Hanet trả về, nên
 * một response bất thường (hoặc link nằm trong dữ liệu) không được phép biến cửa sổ app — nơi có
 * sẵn bridge preload — thành một browser tổng quát. Link hợp lệ thì mở bằng browser của máy.
 */
function hardenWebContents(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const isDevServer = Boolean(rendererDevUrl && url.startsWith(rendererDevUrl));
    if (!isDevServer && !url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  // Không dùng webview ở đâu cả — chặn luôn để tránh bị chèn qua nội dung động.
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
}

function createWindow(): BrowserWindow {
  // Vùng làm việc thật (đã trừ taskbar) có thể nhỏ hơn 1100x930 trên các màn hình phổ biến như
  // laptop 1366x768 — co kích thước khởi tạo theo màn hình để cửa sổ không tràn ra ngoài.
  const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: Math.min(1100, workAreaWidth),
    height: Math.min(940, workAreaHeight),
    minWidth: 900,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
    icon: windowIcon,
  });

  win.once('ready-to-show', () => win.show());
  hardenWebContents(win);

  if (rendererDevUrl) {
    void win.loadURL(rendererDevUrl);
  } else {
    void win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  return win;
}

function configureAutoUpdater(win: BrowserWindow) {
  if (!app.isPackaged) return;

  // feedURL lấy theo cấu hình "publish" trong package.json (provider: github) — electron-builder
  // ghi sẵn vào app-update.yml lúc build, không cần gọi setFeedURL().
  autoUpdater.autoDownload = false;

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    const response = dialog.showMessageBoxSync(win, {
      type: 'info',
      title: 'Cập nhật mới',
      message: `Đã có bản mới hơn: ${info.version}. Bạn có muốn tải về cập nhật không?`,
      buttons: ['Tải về', 'Để sau'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      autoUpdater.downloadUpdate();
    }
  });

  autoUpdater.on('update-downloaded', () => {
    const response = dialog.showMessageBoxSync(win, {
      type: 'question',
      title: 'Cập nhật đã sẵn sàng',
      message: 'Bản cập nhật đã tải xong. Bạn có muốn khởi động lại để cài đặt ngay không?',
      buttons: ['Khởi động lại', 'Để sau'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (error: Error) => {
    console.error('Auto-update error:', error);
  });

  void autoUpdater.checkForUpdates();
}

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  // Menu mặc định của Electron cho phép mở DevTools và reload — không cần với app nội bộ, và là
  // một bề mặt để người dùng vô tình can thiệp vào trạng thái đang chạy. Ẩn cả khi chạy dev.
  Menu.setApplicationMenu(null);

  // Đăng ký handler SAU khi app ready (thay vì như một side effect lúc import): thứ tự khởi tạo trở
  // nên tường minh và lớp IPC không còn tự chạy chỉ vì có ai đó import vào.
  registerAllIpcHandlers();
  handleSafeFileProtocol();

  const win = createWindow();
  configureAutoUpdater(win);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
