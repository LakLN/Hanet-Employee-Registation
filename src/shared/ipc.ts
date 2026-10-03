import {
  ActivateLicenseInput,
  ConnectHanetAccountInput,
  ConnectHanetAccountResult,
  ConnectWithTokenInput,
  EmployeeRecord,
  HanetApiResponse,
  HanetDepartment,
  ListSavedPlacesResult,
  RuntimeConfigStatus,
  SingleEmployeeInput,
  SyncResultItem,
} from './types';

/**
 * NGUỒN CHÂN LÝ DUY NHẤT cho toàn bộ giao tiếp main <-> renderer.
 *
 * Trước đây tên channel và chữ ký hàm được viết lại độc lập ở 3 nơi (ipc.ts, preload.ts,
 * global.d.ts). Sửa một nơi mà quên hai nơi kia không gây lỗi biên dịch — nó biểu hiện thành "bấm
 * nút không thấy gì xảy ra" lúc chạy. Giờ mọi phía đều tham chiếu về đây, và bản đồ handler ở main
 * được kiểu hoá theo IpcApi nên thiếu handler hay lệch kiểu là lỗi typecheck.
 */
export const IPC = {
  selectExcel: 'dialog:select-excel',
  selectFolder: 'dialog:select-folder',
  selectSingleImage: 'dialog:select-single-image',
  parseExcel: 'excel:parse',
  exportSyncResults: 'excel:export-sync-results',
  downloadExcelTemplate: 'excel:download-template',
  bulkRegister: 'hanet:bulk-register',
  cancelBulkRegister: 'hanet:cancel-bulk-register',
  registerSingle: 'hanet:register-single',
  removePerson: 'hanet:remove-person',
  getRuntimeConfigStatus: 'config:get-runtime-status',
  activateLicense: 'config:activate-license',
  connectHanetAccount: 'config:connect-hanet-account',
  connectWithToken: 'config:connect-with-token',
  listSavedPlaces: 'config:list-saved-places',
  saveActivePlaceId: 'config:save-active-place-id',
  listDepartments: 'hanet:list-departments',
  createDepartment: 'hanet:create-department',
} as const;

/** Sự kiện main -> renderer (một chiều, không có phản hồi). */
export const IPC_EVENT = {
  syncProgress: 'sync:progress',
  syncCurrent: 'sync:current',
  syncResult: 'sync:result',
} as const;

export interface SelectedExcelFile {
  filePath: string;
  name: string;
}

export interface SelectedFolder {
  folderPath: string;
  /**
   * Chỉ trả về SỐ LƯỢNG ảnh, không trả danh sách: renderer chỉ cần con số để hiển thị. Đường dẫn
   * ảnh của từng nhân viên đã nằm trong EmployeeRecord.imagePath do main ghép sẵn khi parse Excel.
   */
  imageCount: number;
}

export interface SelectedImage {
  filePath: string;
  fileName: string;
}

export interface ParseExcelInput {
  excelPath: string;
  imageFolderPath: string | null;
}

export interface BulkRegisterSummary {
  total: number;
  success: number;
  duplicate: number;
  failed: number;
  cancelledCount: number;
  quotaExceeded: boolean;
}

export interface SingleRegisterResult {
  success: boolean;
  message: string;
  raw?: HanetApiResponse;
}

export interface RemovePersonInput {
  personID: string;
}

export interface ExportResultsInput {
  /** Toàn bộ Data Grid hiện tại — file xuất ra giữ đúng bộ cột như Excel import, không chỉ người
   *  đã đăng ký, để có thể chỉnh sửa rồi import lại. */
  records: EmployeeRecord[];
  /** Dùng để lấy message chi tiết (cột "Ghi chú") theo employeeId, không phải nguồn dữ liệu chính. */
  syncResults: SyncResultItem[];
}

export interface RemovePersonResult {
  success: boolean;
  message: string;
}

export interface SyncProgress {
  current: number;
  total: number;
}

export interface InFlightRecord {
  employeeId: string;
  name: string;
}

export interface ListDepartmentsInput {
  keyword?: string;
  page?: number;
  size?: number;
}

export interface ListDepartmentsResult {
  departments: HanetDepartment[];
  total: number;
}

export interface CreateDepartmentInput {
  name: string;
  desc?: string;
}

/** Kiểu của từng channel invoke/handle: `arg` là dữ liệu renderer gửi lên, `result` là phản hồi. */
export type IpcApi = {
  [IPC.selectExcel]: { arg: void; result: SelectedExcelFile | null };
  [IPC.selectFolder]: { arg: void; result: SelectedFolder | null };
  [IPC.selectSingleImage]: { arg: void; result: SelectedImage | null };
  [IPC.parseExcel]: { arg: ParseExcelInput; result: EmployeeRecord[] };
  [IPC.exportSyncResults]: { arg: ExportResultsInput; result: string | null };
  [IPC.downloadExcelTemplate]: { arg: void; result: string | null };
  [IPC.bulkRegister]: { arg: EmployeeRecord[]; result: BulkRegisterSummary };
  [IPC.cancelBulkRegister]: { arg: void; result: boolean };
  [IPC.registerSingle]: { arg: SingleEmployeeInput; result: SingleRegisterResult };
  [IPC.removePerson]: { arg: RemovePersonInput; result: RemovePersonResult };
  [IPC.getRuntimeConfigStatus]: { arg: void; result: RuntimeConfigStatus };
  [IPC.activateLicense]: { arg: ActivateLicenseInput; result: void };
  [IPC.connectHanetAccount]: { arg: ConnectHanetAccountInput; result: ConnectHanetAccountResult };
  [IPC.connectWithToken]: { arg: ConnectWithTokenInput; result: void };
  [IPC.listSavedPlaces]: { arg: void; result: ListSavedPlacesResult };
  [IPC.saveActivePlaceId]: { arg: string; result: void };
  [IPC.listDepartments]: { arg: ListDepartmentsInput; result: ListDepartmentsResult };
  [IPC.createDepartment]: { arg: CreateDepartmentInput; result: HanetDepartment };
};

/** Kiểu payload của từng sự kiện main -> renderer. */
export type IpcEventPayload = {
  [IPC_EVENT.syncProgress]: SyncProgress;
  [IPC_EVENT.syncCurrent]: InFlightRecord[];
  [IPC_EVENT.syncResult]: SyncResultItem;
};

type Unsubscribe = () => void;

/**
 * API mà preload expose ra renderer. Mọi kiểu ở đây đều SUY RA từ IpcApi/IpcEventPayload — không
 * khai báo lại, nên không thể lệch với phía main.
 */
export interface HanetImporterBridge {
  selectExcel: () => Promise<IpcApi[typeof IPC.selectExcel]['result']>;
  selectFolder: () => Promise<IpcApi[typeof IPC.selectFolder]['result']>;
  selectSingleImage: () => Promise<IpcApi[typeof IPC.selectSingleImage]['result']>;
  parseExcel: (input: ParseExcelInput) => Promise<IpcApi[typeof IPC.parseExcel]['result']>;
  exportSyncResults: (input: ExportResultsInput) => Promise<IpcApi[typeof IPC.exportSyncResults]['result']>;
  downloadExcelTemplate: () => Promise<IpcApi[typeof IPC.downloadExcelTemplate]['result']>;
  bulkRegisterPersons: (records: EmployeeRecord[]) => Promise<IpcApi[typeof IPC.bulkRegister]['result']>;
  cancelBulkRegister: () => Promise<IpcApi[typeof IPC.cancelBulkRegister]['result']>;
  registerSinglePerson: (record: SingleEmployeeInput) => Promise<IpcApi[typeof IPC.registerSingle]['result']>;
  removePerson: (input: RemovePersonInput) => Promise<IpcApi[typeof IPC.removePerson]['result']>;
  getRuntimeConfigStatus: () => Promise<IpcApi[typeof IPC.getRuntimeConfigStatus]['result']>;
  activateLicense: (input: ActivateLicenseInput) => Promise<IpcApi[typeof IPC.activateLicense]['result']>;
  connectHanetAccount: (input: ConnectHanetAccountInput) => Promise<IpcApi[typeof IPC.connectHanetAccount]['result']>;
  connectWithToken: (input: ConnectWithTokenInput) => Promise<IpcApi[typeof IPC.connectWithToken]['result']>;
  listSavedPlaces: () => Promise<IpcApi[typeof IPC.listSavedPlaces]['result']>;
  saveActivePlaceId: (placeId: string) => Promise<IpcApi[typeof IPC.saveActivePlaceId]['result']>;
  listDepartments: (input: ListDepartmentsInput) => Promise<IpcApi[typeof IPC.listDepartments]['result']>;
  createDepartment: (input: CreateDepartmentInput) => Promise<IpcApi[typeof IPC.createDepartment]['result']>;

  onSyncProgress: (cb: (payload: IpcEventPayload[typeof IPC_EVENT.syncProgress]) => void) => Unsubscribe;
  onSyncCurrent: (cb: (payload: IpcEventPayload[typeof IPC_EVENT.syncCurrent]) => void) => Unsubscribe;
  onSyncResult: (cb: (payload: IpcEventPayload[typeof IPC_EVENT.syncResult]) => void) => Unsubscribe;
}
