import path from 'path';

/**
 * Renderer là phía KHÔNG được tin cậy (đó là toàn bộ lý do tồn tại của contextIsolation). Mọi đường
 * dẫn do renderer gửi lên đều phải nằm trong thư mục mà chính người dùng đã chọn qua hộp thoại của
 * hệ điều hành — nếu không, một lỗi/lỗ hổng ở renderer sẽ đọc được file tuỳ ý trên máy.
 *
 * Tách khỏi tầng IPC để dùng được ở mọi nơi cần kiểm tra (đọc ảnh preview, đọc file Excel, và cả
 * đường dẫn ảnh trong bản ghi đăng ký) và để test được mà không cần Electron.
 */
export class FilePolicy {
  private readonly allowedRoots = new Set<string>();

  /** Cho phép thư mục CHỨA file vừa được chọn (ảnh preview nằm cùng thư mục với file). */
  allowFileParent(filePath: string): void {
    this.allowedRoots.add(path.resolve(path.dirname(filePath)));
  }

  allowFolder(folderPath: string): void {
    this.allowedRoots.add(path.resolve(folderPath));
  }

  isAllowed(filePath: string): boolean {
    if (!filePath) return false;
    const resolved = path.resolve(filePath);
    for (const root of this.allowedRoots) {
      if (resolved === root || resolved.startsWith(root + path.sep)) return true;
    }
    return false;
  }

  /** Ném lỗi có thông báo cho người dùng thay vì để lỗi ENOENT/EACCES thô lọt lên UI. */
  assertAllowed(filePath: string): void {
    if (!this.isAllowed(filePath)) {
      throw new Error('Truy cập file không hợp lệ: đường dẫn nằm ngoài thư mục bạn đã chọn.');
    }
  }

  /** Dùng cho lô đăng ký: mọi ảnh trong lô phải thuộc thư mục đã chọn. */
  assertAllAllowed(filePaths: Array<string | null | undefined>): void {
    for (const filePath of filePaths) {
      if (filePath) this.assertAllowed(filePath);
    }
  }
}

export const filePolicy = new FilePolicy();
