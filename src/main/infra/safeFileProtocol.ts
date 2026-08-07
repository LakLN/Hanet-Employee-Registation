import { pathToFileURL } from 'url';
import { net, protocol } from 'electron';
import logger from '../logger';
import { filePolicy } from './filePolicy';
import { IMAGE_EXTENSIONS } from './imageFolder';
import { parseSafeFileUrl, SAFE_FILE_SCHEME } from '@shared/safeFile';

/**
 * Phải gọi TRƯỚC app.whenReady(): Chromium cần biết đặc tính của scheme ngay từ lúc khởi tạo, nếu
 * không `<img src="safe-file://...">` sẽ bị coi là scheme lạ và chặn thẳng.
 */
export function registerSafeFileScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SAFE_FILE_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        // stream: true để ảnh lớn được truyền theo luồng thay vì nạp hết vào bộ nhớ.
        stream: true,
      },
    },
  ]);
}

/** Gọi sau khi app ready. */
export function handleSafeFileProtocol(): void {
  protocol.handle(SAFE_FILE_SCHEME, async (request) => {
    const filePath = parseSafeFileUrl(request.url);

    // Protocol này chỉ để xem trước ảnh. Ràng buộc kép: đúng đuôi ảnh VÀ nằm trong thư mục người
    // dùng đã chọn — nếu chỉ dựa vào renderer thì một lỗi ở renderer sẽ đọc được file tuỳ ý qua đây.
    if (!filePath || !IMAGE_EXTENSIONS.test(filePath) || !filePolicy.isAllowed(filePath)) {
      logger.warn(`[safe-file] Từ chối truy cập: ${request.url}`);
      return new Response('Forbidden', { status: 403 });
    }

    try {
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      logger.warn(`[safe-file] Không đọc được ${filePath}:`, err);
      return new Response('Not found', { status: 404 });
    }
  });
}
