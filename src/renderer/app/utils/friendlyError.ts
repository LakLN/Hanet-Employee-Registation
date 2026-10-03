// Lỗi ném từ ipcMain.handle tới renderer luôn bị Electron bọc thành
// "Error invoking remote method '<channel>': Error: <message>" — phần tiền tố này vô nghĩa với người
// dùng và đẩy nội dung thật ra cuối câu, nên bỏ đi trước khi hiển thị.
const IPC_PREFIX = /^Error invoking remote method '[^']*':\s*(?:[A-Za-z]*Error:\s*)?/;

export function stripIpcPrefix(raw: string): string {
  return raw.replace(IPC_PREFIX, '');
}

export function friendlyErrorMessage(error: unknown): string {
  const raw = stripIpcPrefix(error instanceof Error ? error.message : String(error));
  const lower = raw.toLowerCase();

  // Main process đã tự diễn giải lỗi (kèm "Chi tiết: <lỗi gốc>") — giữ nguyên, không để câu chung
  // chung bên dưới đè mất hướng dẫn cụ thể chỉ vì phần chi tiết có chữ "timeout"/"ENOTFOUND".
  if (raw.includes('Chi tiết:')) return raw;

  if (
    lower.includes('network error') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('eai_again') ||
    lower.includes('err_name_not_resolved') ||
    lower.includes('err_internet_disconnected')
  ) {
    return `Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối mạng (Internet/firewall/proxy). Chi tiết: ${raw}`;
  }
  if (lower.includes('timeout') || lower.includes('etimedout')) {
    return `Kết nối tới máy chủ quá thời gian chờ (mạng chậm hoặc bị firewall chặn). Chi tiết: ${raw}`;
  }
  if (lower.includes('econnreset') || lower.includes('socket hang up')) {
    return `Kết nối tới máy chủ bị ngắt giữa chừng. Vui lòng thử lại. Chi tiết: ${raw}`;
  }
  if (lower.includes('certificate') || lower.includes('self signed') || lower.includes('unable_to_verify')) {
    return `Chứng chỉ bảo mật (SSL) của máy chủ không hợp lệ — thường do proxy/firewall công ty chặn kiểm tra HTTPS. Chi tiết: ${raw}`;
  }
  if (lower.includes('status code 401') || lower.includes('status code 403')) {
    return `Máy chủ từ chối truy cập (token hết hạn hoặc sai Client ID/Secret). Vui lòng vào Cài đặt để kết nối lại. Chi tiết: ${raw}`;
  }
  if (lower.includes('ebusy')) {
    return 'File đang được mở ở chương trình khác (thường là Excel). Vui lòng đóng file rồi thử lại.';
  }
  if (lower.includes('enoent')) {
    return 'Không tìm thấy file. File có thể đã bị xóa hoặc di chuyển.';
  }
  if (lower.includes('eacces') || lower.includes('eperm')) {
    return 'Không có quyền truy cập file/thư mục này (thử chọn vị trí khác, ví dụ Desktop hoặc Documents).';
  }
  if (lower.includes('enospc')) {
    return 'Ổ đĩa đã hết dung lượng trống.';
  }

  return raw;
}
