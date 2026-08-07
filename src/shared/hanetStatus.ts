export interface StatusMeta {
  label: string;
  tone: 'success' | 'warning' | 'error';
}

export const HANET_QUOTA_EXCEEDED_CODE = -9008;
export const HANET_DUPLICATE_FACE_CODE = -9007;
export const HANET_DUPLICATE_ALIAS_CODE = -9005;
export const HANET_INVALID_IMAGE_CODE = -9006;

// Mã lỗi và thông điệp gốc theo tài liệu API Hanet (person/register, person/remove...). Khi Hanet
// trả về một returnCode không nằm trong bảng này, resolveStatusMeta rơi về message gốc (thường là
// tiếng Anh) — bổ sung dần vào đây khi gặp mã mới trong thực tế thay vì đoán trước toàn bộ.
export const HANET_STATUS_MAP: Record<number, StatusMeta> = {
  1: { label: 'Đã đăng ký', tone: 'success' },
  [-101]: { label: 'Tất cả thiết bị tại địa điểm đang offline', tone: 'error' },
  [-909]: { label: 'Lỗi tải ảnh khuôn mặt lên (Upload face error)', tone: 'error' },
  [-9002]: { label: 'Sai định dạng file ảnh', tone: 'error' },
  [-9003]: { label: 'Lỗi máy chủ khi tạo nhân viên', tone: 'error' },
  [-9004]: { label: 'Lỗi xoá nhân viên', tone: 'error' },
  [-9005]: { label: 'Trùng mã nhân viên (Alias ID)', tone: 'warning' },
  [-9006]: {
    label: 'Ảnh không hợp lệ (chỉ 1 người, rõ mặt, đủ mắt/mũi/miệng, nhìn thẳng, không đội mũ/đeo khẩu trang)',
    tone: 'error',
  },
  [-9007]: { label: 'Đã tồn tại trong hệ thống', tone: 'warning' },
  [HANET_QUOTA_EXCEEDED_CODE]: {
    label: 'Hết giới hạn khuôn mặt (gói Hanet)',
    tone: 'error',
  },
};

export function isQuotaExceeded(returnCode: number | undefined): boolean {
  return returnCode === HANET_QUOTA_EXCEEDED_CODE;
}

export function resolveStatusMeta(returnCode: number | undefined, fallbackMessage: string): StatusMeta {
  if (returnCode !== undefined && HANET_STATUS_MAP[returnCode]) {
    return HANET_STATUS_MAP[returnCode];
  }
  return { label: fallbackMessage || 'Thất bại', tone: 'error' };
}
