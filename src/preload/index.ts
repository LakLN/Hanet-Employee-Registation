import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { HanetImporterBridge, IPC, IPC_EVENT, IpcApi, IpcEventPayload } from '@shared/ipc';

/**
 * Hai helper dưới đây là toàn bộ chỗ tiếp xúc với ipcRenderer. Nhờ hợp đồng dùng chung (@shared/ipc),
 * sai tên channel hoặc lệch kiểu payload là lỗi typecheck — trước đây tên channel được viết lại bằng
 * chuỗi ở cả preload, main và global.d.ts nên chỉ phát hiện được lúc chạy.
 */
function invoke<K extends keyof IpcApi>(channel: K, arg?: IpcApi[K]['arg']): Promise<IpcApi[K]['result']> {
  return ipcRenderer.invoke(channel, arg) as Promise<IpcApi[K]['result']>;
}

function subscribe<K extends keyof IpcEventPayload>(
  channel: K,
  callback: (payload: IpcEventPayload[K]) => void,
): () => void {
  const listener = (_event: IpcRendererEvent, payload: IpcEventPayload[K]) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const bridge: HanetImporterBridge = {
  selectExcel: () => invoke(IPC.selectExcel),
  selectFolder: () => invoke(IPC.selectFolder),
  selectSingleImage: () => invoke(IPC.selectSingleImage),
  parseExcel: (input) => invoke(IPC.parseExcel, input),
  exportSyncResults: (input) => invoke(IPC.exportSyncResults, input),
  downloadExcelTemplate: () => invoke(IPC.downloadExcelTemplate),
  bulkRegisterPersons: (records) => invoke(IPC.bulkRegister, records),
  cancelBulkRegister: () => invoke(IPC.cancelBulkRegister),
  registerSinglePerson: (record) => invoke(IPC.registerSingle, record),
  removePerson: (input) => invoke(IPC.removePerson, input),
  getRuntimeConfigStatus: () => invoke(IPC.getRuntimeConfigStatus),
  activateLicense: (input) => invoke(IPC.activateLicense, input),
  connectHanetAccount: (input) => invoke(IPC.connectHanetAccount, input),
  listSavedPlaces: () => invoke(IPC.listSavedPlaces),
  saveActivePlaceId: (placeId) => invoke(IPC.saveActivePlaceId, placeId),
  listDepartments: (input) => invoke(IPC.listDepartments, input),
  createDepartment: (input) => invoke(IPC.createDepartment, input),

  onSyncProgress: (cb) => subscribe(IPC_EVENT.syncProgress, cb),
  onSyncCurrent: (cb) => subscribe(IPC_EVENT.syncCurrent, cb),
  onSyncResult: (cb) => subscribe(IPC_EVENT.syncResult, cb),
};

contextBridge.exposeInMainWorld('hanetImporter', bridge);
