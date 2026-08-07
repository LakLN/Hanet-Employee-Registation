import { z } from 'zod';
import {
  ActivateLicenseInput,
  ConnectHanetAccountInput,
  EmployeeRecord,
  SingleEmployeeInput,
  SyncResultItem,
} from '@shared/types';
import {
  CreateDepartmentInput,
  ExportResultsInput,
  ListDepartmentsInput,
  ParseExcelInput,
  RemovePersonInput,
} from '@shared/ipc';

/**
 * Kiểu TypeScript KHÔNG tồn tại lúc chạy: mọi thứ renderer gửi qua IPC đều có thể là undefined, sai
 * kiểu, hoặc một mảng 100.000 phần tử. Nếu không kiểm tra ở đúng đường biên này, dữ liệu rác sẽ đi
 * sâu vào hệ thống rồi nổ ở tầng thấp với thông báo lỗi vô nghĩa (hoặc làm treo cả tiến trình lô).
 *
 * Mỗi schema được gán kiểu `z.ZodType<T>` để TypeScript đối chiếu schema với kiểu dùng chung — schema
 * thiếu field hoặc lệch kiểu là lỗi typecheck, không phải lỗi phát hiện lúc chạy.
 */

// Giới hạn trên cho một lô: file Excel nhân sự nội bộ thực tế cỡ vài trăm tới vài nghìn dòng. Con số
// này để chặn dữ liệu bất thường làm cạn RAM, không phải để giới hạn nghiệp vụ.
const MAX_RECORDS_PER_BATCH = 20_000;
const MAX_PATH_LENGTH = 4096;

const pathString = z.string().min(1).max(MAX_PATH_LENGTH);
const sexSchema = z.union([z.literal('0'), z.literal('1')]);

export const employeeRecordSchema: z.ZodType<EmployeeRecord> = z.object({
  employeeId: z.string().max(200),
  name: z.string().max(500),
  title: z.string().max(500),
  phone: z.string().max(50),
  aliasID: z.string().max(200).optional(),
  email: z.string().max(320).optional(),
  dob: z.string().max(50).optional(),
  sex: sexSchema.optional(),
  age: z.number().int().min(0).max(200).optional(),
  type: z.number().int().optional(),
  imageFileName: z.string().max(500),
  imagePath: pathString.nullable(),
  departmentID: z.number().int().optional(),
  status: z.union([z.literal('VALID'), z.literal('MISSING_IMAGE'), z.literal('INVALID')]),
  duplicateId: z.boolean().optional(),
  duplicateImage: z.boolean().optional(),
  registeredStatus: z
    .union([
      z.literal('REGISTERED'),
      z.literal('ALREADY_EXISTS_FACE'),
      z.literal('ALREADY_EXISTS_ALIAS'),
      z.literal('REGISTERED_IMAGE_INVALID'),
    ])
    .optional(),
  registeredNote: z.string().max(4000).optional(),
});

export const singleEmployeeInputSchema: z.ZodType<SingleEmployeeInput> = z.object({
  employeeId: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
  title: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  aliasID: z.string().max(200).optional(),
  email: z.string().max(320).optional(),
  dob: z.string().max(50).optional(),
  sex: sexSchema.optional(),
  age: z.number().int().min(0).max(200).optional(),
  type: z.number().int().optional(),
  departmentID: z.number().int().optional(),
  imagePath: pathString.nullable(),
});

export const syncResultItemSchema: z.ZodType<SyncResultItem> = z.object({
  employeeId: z.string().max(200),
  name: z.string().max(500),
  success: z.boolean(),
  returnCode: z.number().optional(),
  message: z.string().max(4000),
  durationMs: z.number().optional(),
  existingPerson: z
    .object({
      name: z.string().max(500),
      title: z.string().max(500),
      placeName: z.string().max(500),
      avatarUrl: z.string().max(MAX_PATH_LENGTH).optional(),
    })
    .nullable()
    .optional(),
  personID: z.string().max(200).optional(),
});

export const parseExcelInputSchema: z.ZodType<ParseExcelInput> = z.object({
  excelPath: pathString,
  imageFolderPath: pathString.nullable(),
});

export const removePersonInputSchema: z.ZodType<RemovePersonInput> = z.object({
  personID: z.string().min(1).max(200),
});

export const employeeRecordsSchema = z.array(employeeRecordSchema).max(MAX_RECORDS_PER_BATCH);
export const syncResultItemsSchema = z.array(syncResultItemSchema).max(MAX_RECORDS_PER_BATCH);

export const exportResultsInputSchema: z.ZodType<ExportResultsInput> = z.object({
  records: employeeRecordsSchema,
  syncResults: syncResultItemsSchema,
});

export const activateLicenseInputSchema: z.ZodType<ActivateLicenseInput> = z.object({
  licenseKey: z.string().min(1).max(200),
});

// clientSecret cho phép rỗng: nếu người dùng không đổi ô Secret (giữ placeholder ẩn), renderer gửi
// chuỗi rỗng và main tự lấy lại secret đã lưu trước đó (xem handler connectHanetAccount).
export const connectHanetAccountInputSchema: z.ZodType<ConnectHanetAccountInput> = z.object({
  apiBaseUrl: z.string().min(1).max(500),
  clientId: z.string().min(1).max(500),
  clientSecret: z.string().max(500),
});

export const activePlaceIdInputSchema: z.ZodType<string> = z.string().min(1).max(200);

export const listDepartmentsInputSchema: z.ZodType<ListDepartmentsInput> = z.object({
  keyword: z.string().max(500).optional(),
  page: z.number().int().min(1).optional(),
  size: z.number().int().min(1).max(200).optional(),
});

export const createDepartmentInputSchema: z.ZodType<CreateDepartmentInput> = z.object({
  name: z.string().min(1).max(500),
  desc: z.string().max(2000).optional(),
});

export const noArgSchema = z.void();
