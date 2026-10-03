import os from 'os';
import { BrowserWindow } from 'electron';
import { IPC, IPC_EVENT } from '@shared/ipc';
import { getHanetConfig } from '../services/hanetConfig';
import { prepareImage, registerPersonToHanet, removePersonById, uploadPersonToHanet } from '../services/hanetClient';
import {
  activateLicense,
  getRuntimeConfig,
  needsRuntimeConfig,
  saveActivePlaceId,
  saveConnectionConfig,
  saveManualConnection,
} from '../services/runtimeConfig';
import { getMachineCode } from '../services/licenseOffline';
import { exchangeCodeForToken, getAccessToken, getConnectedEmail, hasStoredToken } from '../services/hanetOAuth';
import { REDIRECT_URI, runOAuthLogin } from '../services/hanetOAuthWindow';
import { listPlaces } from '../services/hanetPlaces';
import { createDepartment, listDepartments } from '../services/hanetDepartments';
import { filePolicy } from '../infra/filePolicy';
import { BulkRegistrationRunner } from '../usecases/bulkRegister';
import { pickExcelFile, pickImageFolder, pickSingleImage } from '../usecases/pickFiles';
import { parseExcelFile } from '../usecases/parseExcel';
import { exportSyncResults } from '../usecases/exportResults';
import { generateExcelTemplate } from '../usecases/generateExcelTemplate';
import { createEventSender, IpcHandlerMap, registerIpcHandlers } from './registry';
import {
  activateLicenseInputSchema,
  activePlaceIdInputSchema,
  connectHanetAccountInputSchema,
  connectWithTokenInputSchema,
  createDepartmentInputSchema,
  employeeRecordsSchema,
  exportResultsInputSchema,
  listDepartmentsInputSchema,
  noArgSchema,
  parseExcelInputSchema,
  removePersonInputSchema,
  singleEmployeeInputSchema,
} from './schemas';

// Hanet xử lý các request đăng ký khuôn mặt cùng một placeID có tính chất tuần tự/khóa ở phía server
// (khớp khuôn mặt với gallery hiện có) — chạy quá nhiều request cùng lúc lên cùng địa điểm khiến một
// số request bị xếp hàng và vượt timeout dù bản thân request không lỗi. 2 là mức cân bằng giữa tốc độ
// và rủi ro nghẽn; chỉnh qua HANET_CONCURRENCY nếu cần.
const UPLOAD_CONCURRENCY = Math.max(1, Number(process.env.HANET_CONCURRENCY) || 2);
// Resize là việc CPU-bound và chạy trong worker pool, nên bám theo số lõi thật của máy.
const RESIZE_CONCURRENCY = Math.max(1, Math.min(4, os.cpus().length - 1));
// Số ảnh được chuẩn bị sẵn vượt trước số đang upload. Đây là toàn bộ phần "gối đầu" CPU/mạng, và
// cũng là giới hạn RAM: tối đa (upload + prefetch) ảnh nằm trong bộ nhớ cùng lúc.
const IMAGE_PREFETCH = 2;

const bulkRunner = new BulkRegistrationRunner({
  getConfig: getHanetConfig,
  prepareImage,
  upload: (record, image, config, signal) => uploadPersonToHanet(record, image, config, 2, signal),
  concurrency: { upload: UPLOAD_CONCURRENCY, resize: RESIZE_CONCURRENCY, prefetch: IMAGE_PREFETCH },
});

/**
 * Lớp IPC chỉ làm 3 việc: kiểm tra dữ liệu vào (schema + quyền truy cập file), gọi usecase, và bơm
 * sự kiện ra renderer. Toàn bộ logic nghiệp vụ nằm trong usecases/ nên test được không cần Electron.
 */
const handlers: IpcHandlerMap = {
  [IPC.selectExcel]: { schema: noArgSchema, handle: () => pickExcelFile() },
  [IPC.selectFolder]: { schema: noArgSchema, handle: () => pickImageFolder() },
  [IPC.selectSingleImage]: { schema: noArgSchema, handle: () => pickSingleImage() },

  [IPC.parseExcel]: { schema: parseExcelInputSchema, handle: (input) => parseExcelFile(input) },

  [IPC.exportSyncResults]: {
    schema: exportResultsInputSchema,
    handle: (input) => exportSyncResults(input.records, input.syncResults),
  },

  [IPC.downloadExcelTemplate]: { schema: noArgSchema, handle: () => generateExcelTemplate() },

  [IPC.bulkRegister]: {
    schema: employeeRecordsSchema,
    handle: (records, event) => {
      // Ảnh phải nằm trong thư mục người dùng đã chọn. Trước đây `read-file` được kiểm tra nhưng
      // đường dẫn ảnh trong bản ghi đăng ký thì không — main tin thẳng vào dữ liệu từ renderer.
      filePolicy.assertAllAllowed(records.map((record) => record.imagePath));

      const send = createEventSender(event.sender);
      return bulkRunner.run(records, {
        onProgress: (progress) => send(IPC_EVENT.syncProgress, progress),
        onCurrent: (inFlight) => send(IPC_EVENT.syncCurrent, inFlight),
        onResult: (item) => send(IPC_EVENT.syncResult, item),
      });
    },
  },

  [IPC.cancelBulkRegister]: { schema: noArgSchema, handle: () => bulkRunner.cancel() },

  [IPC.registerSingle]: {
    schema: singleEmployeeInputSchema,
    handle: async (record) => {
      if (record.imagePath) filePolicy.assertAllowed(record.imagePath);
      const config = await getHanetConfig();
      const result = await registerPersonToHanet(record, config);
      return { success: result.success, message: result.message, raw: result.raw };
    },
  },

  [IPC.removePerson]: {
    schema: removePersonInputSchema,
    handle: async ({ personID }) => {
      const config = await getHanetConfig();
      return removePersonById(personID, config);
    },
  },

  [IPC.getRuntimeConfigStatus]: {
    schema: noArgSchema,
    handle: () => {
      const config = getRuntimeConfig();
      return {
        needsConfig: needsRuntimeConfig(),
        isConnected: hasStoredToken(),
        connectedEmail: getConnectedEmail(),
        current: config
          ? {
              licenseKey: config.licenseKey,
              apiBaseUrl: config.apiBaseUrl,
              clientId: config.clientId,
              clientSecretLength: config.clientSecret?.length ?? 0,
              activePlaceId: config.activePlaceId,
              savedApiBaseUrls: config.savedApiBaseUrls ?? [],
              usesManualToken: !!config.manualAccessToken,
            }
          : null,
      };
    },
  },

  [IPC.activateLicense]: {
    schema: activateLicenseInputSchema,
    handle: async (input) => {
      await activateLicense(input.licenseKey);
    },
  },

  [IPC.connectHanetAccount]: {
    schema: connectHanetAccountInputSchema,
    handle: async (input, event) => {
      const parent = BrowserWindow.fromWebContents(event.sender);
      if (!parent) throw new Error('Không tìm thấy cửa sổ chính để mở popup đăng nhập.');

      // Renderer gửi clientSecret rỗng khi người dùng không đổi ô Secret (giữ nguyên placeholder ẩn
      // giá trị đã lưu) — lấy lại secret thật từ config đã lưu trong trường hợp đó.
      const clientSecret = input.clientSecret || getRuntimeConfig()?.clientSecret || '';
      if (!clientSecret) throw new Error('Vui lòng nhập Client Secret.');

      const code = await runOAuthLogin(input.clientId, parent);
      const { accessToken, email } = await exchangeCodeForToken(code, input.clientId, clientSecret, REDIRECT_URI);
      saveConnectionConfig({ apiBaseUrl: input.apiBaseUrl, clientId: input.clientId, clientSecret });
      const places = await listPlaces(input.apiBaseUrl, accessToken);
      return { places, email };
    },
  },

  [IPC.connectWithToken]: {
    schema: connectWithTokenInputSchema,
    handle: (input) => {
      saveManualConnection({
        apiBaseUrl: input.apiBaseUrl.trim(),
        accessToken: input.accessToken.trim(),
        placeId: input.placeId.trim(),
      });
    },
  },

  [IPC.getMachineCode]: {
    schema: noArgSchema,
    handle: () => getMachineCode(),
  },

  [IPC.listSavedPlaces]: {
    schema: noArgSchema,
    handle: async () => {
      const apiBaseUrl = getRuntimeConfig()?.apiBaseUrl || 'https://partner.hanet.ai';
      const accessToken = await getAccessToken();
      const places = await listPlaces(apiBaseUrl, accessToken);
      return { places };
    },
  },

  [IPC.saveActivePlaceId]: {
    schema: activePlaceIdInputSchema,
    handle: (placeId) => {
      saveActivePlaceId(placeId);
    },
  },

  [IPC.listDepartments]: {
    schema: listDepartmentsInputSchema,
    handle: async (input) => {
      const apiBaseUrl = getRuntimeConfig()?.apiBaseUrl || 'https://partner.hanet.ai';
      const placeID = getRuntimeConfig()?.activePlaceId;
      if (!placeID) throw new Error('Chưa chọn địa điểm (place). Vui lòng chọn địa điểm trước.');
      const accessToken = await getAccessToken();
      return listDepartments(apiBaseUrl, accessToken, placeID, input);
    },
  },

  [IPC.createDepartment]: {
    schema: createDepartmentInputSchema,
    handle: async (input) => {
      const apiBaseUrl = getRuntimeConfig()?.apiBaseUrl || 'https://partner.hanet.ai';
      const placeID = getRuntimeConfig()?.activePlaceId;
      if (!placeID) throw new Error('Chưa chọn địa điểm (place). Vui lòng chọn địa điểm trước.');
      const accessToken = await getAccessToken();
      return createDepartment(apiBaseUrl, accessToken, placeID, input.name, input.desc);
    },
  },
};

export function registerAllIpcHandlers(): void {
  registerIpcHandlers(handlers);
}
