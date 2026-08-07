export type EmployeeRecord = {
  employeeId: string;
  name: string;
  title: string;
  phone: string;
  aliasID?: string;
  email?: string;
  dob?: string;
  sex?: '0' | '1';
  age?: number;
  type?: number;
  imageFileName: string;
  imagePath: string | null;
  departmentID?: number;
  status: 'VALID' | 'MISSING_IMAGE' | 'INVALID';
  duplicateId?: boolean;
  /**
   * true khi cùng một file ảnh (theo đường dẫn đã ghép) được gán cho từ 2 nhân viên trở lên. Không
   * dựa vào TÊN file người dùng đặt — chỉ cần trỏ tới cùng một ảnh vật lý là coi như trùng, vì tên
   * file chỉ là quy ước để tra cứu, không phải quy tắc bắt buộc. Hanet nhận diện theo khuôn mặt nên
   * gửi cùng 1 ảnh cho 2 mã NV khác nhau gần như chắc chắn là gõ nhầm/copy nhầm dòng.
   */
  duplicateImage?: boolean;
  /**
   * Kết quả đăng ký lên Hanet của LẦN GẦN NHẤT — độc lập với `status` (vốn chỉ phản ánh dữ liệu
   * Excel có hợp lệ để gửi hay không). Vẫn giữ record trong Data Grid khi đã đăng ký/đã tồn tại,
   * thay vì xoá khỏi danh sách: người dùng có thể lỡ chọn sai ảnh nên cần thấy lại để đối chiếu.
   * ALREADY_EXISTS_FACE (-9007): ảnh khuôn mặt trùng với person đã có trên Hanet — thường do chọn
   * nhầm ảnh của người khác. ALREADY_EXISTS_ALIAS (-9005): trùng Mã NV (aliasID), không liên quan
   * tới ảnh.
   */
  registeredStatus?: 'REGISTERED' | 'ALREADY_EXISTS_FACE' | 'ALREADY_EXISTS_ALIAS' | 'REGISTERED_IMAGE_INVALID';
  /** Ghi chú (message) từ lần đăng ký gần nhất — hiển thị trong Data Grid để người dùng biết hành động cần làm. */
  registeredNote?: string;
};

export type HanetConfig = {
  accessToken: string;
  placeId: string;
};

// Phản hồi thô từ endpoint person/register của Hanet — chỉ khai báo các field code thực sự đọc,
// không cố mô hình hoá toàn bộ response (Hanet có thể trả thêm field khác tuỳ trường hợp).
export interface HanetApiResponse {
  returnCode?: number;
  returnMessage?: string;
  status?: string;
  data?: {
    name?: string;
    title?: string;
    placeName?: string;
    file?: string;
    personID?: string;
  };
}

export interface HanetExistingPerson {
  name: string;
  title: string;
  placeName: string;
  avatarUrl?: string;
}

export interface SyncResultItem {
  employeeId: string;
  name: string;
  success: boolean;
  returnCode?: number;
  message: string;
  existingPerson?: HanetExistingPerson | null;
  durationMs?: number;
  /** Chỉ có khi đăng ký thành công — dùng để gọi xoá person trên Hanet nếu cần. */
  personID?: string;
}

export interface RuntimeConfigStatus {
  needsConfig: boolean;
  /** Đã có access/refresh token lưu sẵn chưa — cho renderer biết hiện "Đăng nhập lại" (phụ) hay
   *  bắt buộc phải kết nối để tiếp tục, không cần gọi mạng để biết trạng thái này. */
  isConnected: boolean;
  /** Email tài khoản Hanet đang kết nối (giải mã từ access token đã lưu), null nếu chưa kết nối
   *  hoặc token không đọc được email. */
  connectedEmail: string | null;
  /** Cấu hình đã lưu — không có clientSecret (không trả bí mật ra renderer). clientSecretLength là
   *  ĐỘ DÀI (không phải giá trị) để form hiện đúng số dấu che, 0 nghĩa là chưa có secret. */
  current: {
    licenseKey: string;
    apiBaseUrl?: string;
    clientId?: string;
    clientSecretLength: number;
    activePlaceId?: string;
    savedApiBaseUrls: string[];
  } | null;
}

export interface HanetPlace {
  placeID: string;
  name: string;
}

export interface ConnectHanetAccountInput {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface ConnectHanetAccountResult {
  places: HanetPlace[];
  email: string | null;
}

export interface ListSavedPlacesResult {
  places: HanetPlace[];
}

export interface ActivateLicenseInput {
  licenseKey: string;
}

export interface HanetDepartment {
  id: number;
  placeId: string;
  name: string;
  desc: string;
  numEmployee: string;
  enable: number;
  status: number;
}

export interface SingleEmployeeInput {
  employeeId: string;
  name: string;
  title?: string;
  phone?: string;
  aliasID?: string;
  email?: string;
  dob?: string;
  sex?: '0' | '1';
  age?: number;
  type?: number;
  departmentID?: number;
  imagePath: string | null;
}
