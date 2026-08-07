import https from 'https';
import axios from 'axios';
import FormData from 'form-data';
import { resizeForHanet } from './imageProcessor';
import logger from '../logger';
import { getRuntimeConfig } from './runtimeConfig';
import { EmployeeRecord, HanetApiResponse, HanetConfig, SingleEmployeeInput } from '@shared/types';

export type HanetRegisterInput = EmployeeRecord | SingleEmployeeInput;

const DEFAULT_API_BASE_URL = 'https://partner.hanet.ai';

// Base URL người dùng có thể đổi ở màn hình Kích hoạt (vd môi trường staging riêng) — mặc định vẫn
// là partner.hanet.ai như trước, không ảnh hưởng máy chưa cấu hình gì thêm.
function apiBaseUrl(): string {
  return getRuntimeConfig()?.apiBaseUrl || DEFAULT_API_BASE_URL;
}

function registerUrl(): string {
  return `${apiBaseUrl().replace(/\/+$/, '')}/person/register`;
}

function removePersonUrl(): string {
  return `${apiBaseUrl().replace(/\/+$/, '')}/person/removePersonByID`;
}

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 8, timeout: 30000 });

function agentStats() {
  const count = (dict: NodeJS.ReadOnlyDict<unknown[]>) =>
    Object.values(dict).reduce((sum: number, arr) => sum + (arr?.length ?? 0), 0);
  return {
    sockets: count(httpsAgent.sockets),
    freeSockets: count(httpsAgent.freeSockets),
    pendingRequests: count(httpsAgent.requests),
  };
}

export interface RegisterResult {
  success: boolean;
  message: string;
  employeeId: string;
  raw?: HanetApiResponse;
  durationMs?: number;
  cancelled?: boolean;
}

export type PreparedImage = { ok: true; buffer: Buffer } | { ok: false; failure: RegisterResult };

function tagOf(record: HanetRegisterInput): string {
  return `[Hanet] ${record.employeeId} (${record.name || 'no-name'})`;
}

// File log nằm lâu dài trên máy người dùng, nên số điện thoại/email chỉ ghi dạng che một phần: vẫn
// đủ để đối chiếu "đã gửi đúng người/đúng trường chưa" mà không lưu nguyên văn dữ liệu cá nhân.
function maskPhone(value: string): string {
  if (value.length <= 5) return '***';
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) return '***';
  const name = value.slice(0, at);
  const head = name.slice(0, 1);
  return `${head}***${value.slice(at)}`;
}

/**
 * Đọc + resize ảnh, trả về thất bại có thông báo cho người dùng thay vì ném lỗi.
 *
 * Tách khỏi bước upload để lô hàng loạt có thể chuẩn bị ảnh của người kế tiếp TRONG LÚC đang upload
 * người hiện tại (xem BulkRegistrationRunner) — CPU và mạng gối đầu nhau thay vì chạy tuần tự.
 * Đồng thời đảm bảo ảnh chỉ được resize MỘT LẦN cho cả các lần retry: ảnh không đổi giữa các lần
 * thử, resize lại vừa tốn CPU vừa cộng dồn vào thời gian trước khi request thực sự được gửi.
 */
export async function prepareImage(record: HanetRegisterInput): Promise<PreparedImage> {
  const tag = tagOf(record);

  if (!record.imagePath) {
    logger.warn(`${tag} -> bỏ qua: thiếu ảnh`);
    return {
      ok: false,
      failure: { success: false, message: 'Thiếu ảnh, không thể đăng ký', employeeId: record.employeeId },
    };
  }

  try {
    const startedAt = Date.now();
    const buffer = await resizeForHanet(record.imagePath);
    logger.info(`${tag} -> ảnh sẵn sàng: ${(buffer.length / 1024).toFixed(0)}KB trong ${Date.now() - startedAt}ms`);
    return { ok: true, buffer };
  } catch (err: unknown) {
    // Lỗi xử lý ảnh (ảnh hỏng/định dạng lạ) KHÔNG được retry như lỗi mạng — thử lại không giúp gì.
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`${tag} -> lỗi xử lý ảnh: ${message}`);
    return {
      ok: false,
      failure: {
        success: false,
        message: `Lỗi xử lý ảnh: ${message || 'không xác định'}`,
        employeeId: record.employeeId,
      },
    };
  }
}

/** Gửi ảnh đã chuẩn bị lên Hanet, có retry cho lỗi mạng/5xx/429. */
export async function uploadPersonToHanet(
  record: HanetRegisterInput,
  imageBuffer: Buffer,
  config: HanetConfig,
  maxRetry = 2,
  signal?: AbortSignal,
): Promise<RegisterResult> {
  const tag = tagOf(record);

  let lastError: Error | null = null;
  let lastResponseData: HanetApiResponse | undefined;
  // Nếu lần thử trước bị timeout (client không nhận được response kịp), nhiều khả năng Hanet vẫn
  // đã xử lý xong phía server (ảnh vẫn được lưu, người vẫn được tạo) — client chỉ đơn giản là bỏ
  // cuộc chờ quá sớm. Khi đó, lần thử lại sẽ bị Hanet báo "alias đã tồn tại", nhưng đây thực chất
  // là do CHÍNH lần thử trước của mình gây ra, không phải nhân viên bị trùng mã thật.
  let previousAttemptTimedOut = false;

  for (let attempt = 0; attempt <= maxRetry; attempt += 1) {
    if (signal?.aborted) {
      return { success: false, message: 'Đã hủy', employeeId: record.employeeId, cancelled: true };
    }
    const wasTimeoutBefore = previousAttemptTimedOut;
    const startedAt = Date.now();
    try {
      const form = new FormData();
      form.append('token', config.accessToken);
      form.append('placeID', config.placeId);
      form.append('name', record.name || '');
      form.append('aliasID', record.aliasID || record.employeeId || '');
      form.append('title', record.title || '');
      form.append('type', typeof record.type !== 'undefined' ? String(record.type) : '0');
      if (typeof record.sex !== 'undefined') form.append('sex', String(record.sex));
      if (record.departmentID) form.append('departmentID', String(record.departmentID));
      if (record.phone) form.append('phone', record.phone);
      if (record.email) form.append('email', record.email);
      if (record.dob) form.append('dob', record.dob);
      if (typeof record.age !== 'undefined') form.append('age', String(record.age));
      form.append('file', imageBuffer, {
        filename: `${record.employeeId}.jpg`,
        contentType: 'image/jpeg',
      });
      // Log lại đúng giá trị đã gửi lên Hanet (trừ file ảnh) để đối chiếu khi dữ liệu lưu trên
      // Hanet không khớp với dữ liệu nguồn. Điện thoại/email được che một phần — xem maskPhone.
      // Lưu ý: quy ước sex thực tế của Hanet là 0=Nam, 1=Nữ — ngược với mô tả trong tài liệu API
      // của họ (đã kiểm chứng bằng test API trực tiếp).
      logger.info(`${tag} -> field gửi lên Hanet:`, {
        placeID: config.placeId,
        name: record.name || '',
        aliasID: record.aliasID || record.employeeId || '',
        title: record.title || '',
        type: typeof record.type !== 'undefined' ? String(record.type) : '0',
        sex: typeof record.sex !== 'undefined' ? String(record.sex) : '(không gửi)',
        departmentID: record.departmentID ? String(record.departmentID) : '(không gửi)',
        phone: record.phone ? maskPhone(record.phone) : '(không gửi)',
        email: record.email ? maskEmail(record.email) : '(không gửi)',
        dob: record.dob || '(không gửi)',
        age: typeof record.age !== 'undefined' ? String(record.age) : '(không gửi)',
      });
      const response = await axios.post<HanetApiResponse>(registerUrl(), form, {
        headers: form.getHeaders(),
        // Theo log thực tế, request thành công chỉ mất 30ms-4.5s. 45s khiến một request bị Hanet
        // treo (server-side, không phải lỗi mạng bình thường) làm chậm cả batch — 20s đủ dư cho ảnh
        // lớn/mạng chậm nhất từng thấy, nhưng cắt sớm hơn nhiều khi thực sự bị treo.
        timeout: 20000,
        signal,
        httpsAgent,
      });

      const durationMs = Date.now() - startedAt;
      const data = response.data;

      if (data?.returnCode === 1 || data?.status === 'success') {
        logger.info(
          `${tag} -> HTTP ${response.status} | returnCode=${data?.returnCode} | ${durationMs}ms | response:`,
          data,
        );
        return {
          success: true,
          message: 'Đăng ký thành công',
          employeeId: record.employeeId,
          raw: data,
          durationMs,
        };
      }

      if (wasTimeoutBefore && (data?.returnCode === -9005 || data?.returnCode === -9007)) {
        logger.info(
          `${tag} -> lần thử trước bị timeout nhưng thực ra đã đăng ký thành công (Hanet báo alias đã tồn tại ngay sau đó) -> tính là thành công.`,
        );
        return {
          success: true,
          message: 'Đăng ký thành công (yêu cầu trước bị timeout nhưng máy chủ đã xử lý xong).',
          employeeId: record.employeeId,
          raw: { ...data, returnCode: 1, returnMessage: 'Success (recovered after client timeout)' },
          durationMs,
        };
      }

      logger.warn(
        `${tag} -> HTTP ${response.status} | returnCode=${data?.returnCode} | ${data?.returnMessage} | ${durationMs}ms | response:`,
        data,
      );
      return {
        success: false,
        message: data?.returnMessage || 'Hanet trả về lỗi không xác định',
        employeeId: record.employeeId,
        raw: data,
        durationMs,
      };
    } catch (err: unknown) {
      if (axios.isCancel(err) || signal?.aborted) {
        return { success: false, message: 'Đã hủy', employeeId: record.employeeId, cancelled: true };
      }
      const durationMs = Date.now() - startedAt;
      const axiosErr = axios.isAxiosError<HanetApiResponse>(err) ? err : null;
      lastError = axiosErr ?? (err instanceof Error ? err : new Error(String(err)));
      lastResponseData = axiosErr?.response?.data;
      const status = axiosErr?.response?.status;
      const code = axiosErr?.code;
      const message = lastError.message;
      // errno/syscall chỉ xuất hiện ở lỗi socket cấp hệ thống (không thuộc kiểu chuẩn của
      // AxiosError) — đọc qua kiểu lỗi gốc của Node thay vì any.
      const { errno, syscall } = err as NodeJS.ErrnoException;
      // Log chi tiết để phân biệt lỗi do mạng/socket (code/errno/syscall) với lỗi HTTP thực sự từ
      // Hanet, và so sánh số socket đang mở/rảnh trong pool tại thời điểm lỗi — nếu nghẽn xảy ra
      // ngay sau khi có socket "rảnh" từ request trước đó, nhiều khả năng là socket keep-alive bị
      // tái sử dụng trong khi đã "chết" phía server (request test riêng lẻ, không dùng keep-alive
      // pool dùng chung, sẽ không gặp vấn đề này dù cùng ảnh/cùng payload).
      logger.error(
        `${tag} -> lỗi request (attempt ${attempt + 1}/${maxRetry + 1}) | HTTP ${status ?? 'n/a'} | ${durationMs}ms | code=${code ?? 'n/a'} errno=${errno ?? 'n/a'} syscall=${syscall ?? 'n/a'} | ${message} | agent: ${JSON.stringify(agentStats())}`,
        axiosErr?.response?.data ?? '',
      );
      const isTimeout = code === 'ECONNABORTED' || /timeout/i.test(message || '');
      const isRetryable = !status || status === 429 || status >= 500;
      if (!isRetryable || attempt === maxRetry) break;
      previousAttemptTimedOut = isTimeout;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  return {
    success: false,
    message: lastResponseData?.returnMessage || lastError?.message || 'Lỗi không xác định',
    employeeId: record.employeeId,
    raw: lastResponseData,
  };
}

/**
 * Xoá một person khỏi Hanet theo personID (không phải employeeId/aliasID — personID chỉ có sau khi
 * đăng ký thành công, xem SyncResultItem.personID). Đây là hành động phá huỷ trên hệ thống camera
 * thật, không thể hoàn tác — không retry mù cho lỗi 4xx (khác lỗi mạng/5xx của đăng ký) vì personID
 * sai hoặc đã bị xoá trước đó thử lại cũng không giúp gì.
 */
export async function removePersonById(
  personID: string,
  config: HanetConfig,
): Promise<{ success: boolean; message: string }> {
  const body = new URLSearchParams({ token: config.accessToken, personID });

  try {
    const response = await axios.post<HanetApiResponse>(removePersonUrl(), body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15000,
    });
    const data = response.data;
    if (data?.returnCode === 1) {
      logger.info(`[Hanet] Đã xoá person ${personID}`);
      return { success: true, message: data.returnMessage || 'Đã xoá' };
    }
    logger.warn(`[Hanet] Xoá person ${personID} thất bại | returnCode=${data?.returnCode} | ${data?.returnMessage}`);
    return { success: false, message: data?.returnMessage || 'Hanet trả về lỗi không xác định' };
  } catch (err: unknown) {
    const detail = axios.isAxiosError<HanetApiResponse>(err)
      ? (err.response?.data?.returnMessage ?? err.message)
      : err instanceof Error
        ? err.message
        : String(err);
    logger.error(`[Hanet] Lỗi khi xoá person ${personID}:`, detail);
    return { success: false, message: typeof detail === 'string' ? detail : 'Lỗi không xác định' };
  }
}

/** Đăng ký một người: chuẩn bị ảnh rồi upload. Dùng cho luồng thêm lẻ một nhân viên. */
export async function registerPersonToHanet(
  record: HanetRegisterInput,
  config: HanetConfig,
  maxRetry = 2,
  signal?: AbortSignal,
): Promise<RegisterResult> {
  const prepared = await prepareImage(record);
  if (!prepared.ok) return prepared.failure;
  return uploadPersonToHanet(record, prepared.buffer, config, maxRetry, signal);
}

export default registerPersonToHanet;
