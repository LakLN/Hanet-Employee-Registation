import { BrowserWindow, screen } from 'electron';
import { buildAuthorizeUrl } from './hanetOAuth';
import windowIcon from '../../../resources/maxcom_favicon.png?asset';

// redirect_uri không cần là server thật — Hanet chỉ điều hướng popup tới URL này kèm ?code=..., ta
// chặn ngay điều hướng đó và đọc code từ query string, không để popup thực sự tải trang này.
const REDIRECT_URI = 'https://localhost/hanet-oauth-callback';

export { REDIRECT_URI };

/**
 * Mở popup đăng nhập Hanet, trả về authorization code khi user approve. Không dùng local HTTP
 * server: bắt sự kiện điều hướng của popup ngay khi nó CHUẨN BỊ chuyển tới redirect_uri (Hanet
 * không cần gọi thật tới đó), đọc `code` từ query string rồi đóng popup — đơn giản hơn và không cần
 * mở cổng mạng nào trên máy người dùng.
 */
export function runOAuthLogin(clientId: string, parent: BrowserWindow): Promise<string> {
  return new Promise((resolve, reject) => {
    // To gần hết màn hình (như popup đăng nhập Google/Facebook thật) để không gây cảm giác gò bó,
    // nhưng vẫn co theo màn hình thật của người dùng — tránh tràn ra ngoài trên laptop nhỏ.
    const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize;
    const popup = new BrowserWindow({
      width: Math.min(1100, Math.round(workAreaWidth * 0.9)),
      height: Math.min(850, Math.round(workAreaHeight * 0.9)),
      parent,
      modal: true,
      show: false,
      title: 'Đăng nhập Hanet',
      icon: windowIcon,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });

    // Trang đăng nhập của Hanet tự đặt title riêng khi tải xong — chặn lại để popup luôn hiển thị
    // cùng thương hiệu với cửa sổ chính, thay vì lộ ra domain/tên trang bên thứ ba.
    popup.on('page-title-updated', (event) => event.preventDefault());

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      if (!popup.isDestroyed()) popup.destroy();
    };

    const tryExtractCode = (url: string) => {
      if (!url.startsWith(REDIRECT_URI)) return;
      const code = new URL(url).searchParams.get('code');
      const error = new URL(url).searchParams.get('error');
      if (code) {
        finish(() => resolve(code));
      } else {
        finish(() => reject(new Error(error || 'Hanet không trả về authorization code.')));
      }
    };

    popup.webContents.on('will-navigate', (_event, url) => tryExtractCode(url));
    popup.webContents.on('will-redirect', (_event, url) => tryExtractCode(url));
    popup.on('closed', () => finish(() => reject(new Error('Đã đóng cửa sổ đăng nhập trước khi hoàn tất.'))));
    // Không tải được trang đăng nhập (mất mạng, firewall chặn oauth.hanet.com...) — popup sẽ không bao
    // giờ hiện lên và nút "Đang kết nối..." treo mãi nếu không bắt sự kiện này. Bỏ qua lỗi của chính
    // redirect_uri (localhost) vì đó là điều hướng ta chủ động chặn ở trên.
    popup.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3 || validatedURL.startsWith(REDIRECT_URI)) return;
      finish(() =>
        reject(
          new Error(
            `Không mở được trang đăng nhập Hanet — kiểm tra kết nối Internet/firewall (${errorDescription} ${errorCode}).`,
          ),
        ),
      );
    });

    popup.once('ready-to-show', () => popup.show());
    void popup.loadURL(buildAuthorizeUrl(clientId, REDIRECT_URI));
  });
}
