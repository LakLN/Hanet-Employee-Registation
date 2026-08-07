export function friendlyErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (lower.includes('network error') || lower.includes('econnrefused') || lower.includes('enotfound')) {
    return 'Không thể kết nối tới máy chủ Hanet. Vui lòng kiểm tra kết nối mạng và thử lại.';
  }
  if (lower.includes('timeout')) {
    return 'Kết nối tới máy chủ Hanet quá thời gian chờ. Vui lòng thử lại.';
  }
  if (lower.includes('enoent')) {
    return 'Không tìm thấy file. File có thể đã bị xóa hoặc di chuyển.';
  }
  if (lower.includes('eacces') || lower.includes('eperm')) {
    return 'Không có quyền truy cập file này.';
  }

  return raw;
}
