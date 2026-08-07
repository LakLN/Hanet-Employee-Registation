import ExcelJS from 'exceljs';
import { dialog } from 'electron';
import { EmployeeRecord, SyncResultItem } from '@shared/types';

const excelStatusConfig: Record<EmployeeRecord['status'], string> = {
  VALID: 'Hợp lệ',
  MISSING_IMAGE: 'Thiếu ảnh',
  INVALID: 'Sai dữ liệu',
};

const registeredStatusConfig: Record<NonNullable<EmployeeRecord['registeredStatus']>, string> = {
  REGISTERED: 'Đã đăng ký',
  ALREADY_EXISTS_FACE: 'Trùng FaceID',
  ALREADY_EXISTS_ALIAS: 'Trùng Mã NV',
  REGISTERED_IMAGE_INVALID: 'Cần đổi ảnh',
};

function resolveGridStatusLabel(record: EmployeeRecord): string {
  if (record.registeredStatus) return registeredStatusConfig[record.registeredStatus];
  if (record.duplicateId) return 'Trùng Mã NV';
  if (record.duplicateImage) return 'Trùng ảnh';
  return excelStatusConfig[record.status];
}

/**
 * Xuất TOÀN BỘ Data Grid hiện tại (không chỉ những người đã đăng ký) — giữ đúng bộ cột như file
 * Excel import để người dùng có thể chỉnh sửa rồi import lại, chỉ chèn thêm 2 cột trạng thái/ghi
 * chú ở cuối. syncResults dùng để tra "Ghi chú" (message chi tiết của lần đăng ký gần nhất) theo
 * employeeId — không phải nguồn dữ liệu chính.
 */
export async function exportSyncResults(
  records: EmployeeRecord[],
  syncResults: SyncResultItem[],
): Promise<string | null> {
  const saveResult = await dialog.showSaveDialog({
    title: 'Xuất danh sách nhân viên',
    defaultPath: `danh-sach-nhan-vien-${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return null;

  const messageByEmployeeId = new Map(syncResults.map((r) => [r.employeeId, r.message]));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Danh sách nhân viên');
  sheet.columns = [
    { header: 'Mã NV', key: 'employeeId', width: 15 },
    { header: 'Họ tên', key: 'name', width: 25 },
    { header: 'Chức vụ', key: 'title', width: 20 },
    { header: 'Tên file ảnh', key: 'imageFileName', width: 20 },
    { header: 'ID Phòng ban', key: 'departmentID', width: 14 },
    { header: 'Giới tính', key: 'sex', width: 12 },
    // { header: 'Email', key: 'email', width: 25 },
    // { header: 'Số điện thoại', key: 'phone', width: 16 },
    // { header: 'Ngày sinh', key: 'dob', width: 14 },
    // { header: 'Tuổi', key: 'age', width: 10 },
    { header: 'Trạng thái', key: 'status', width: 20 },
    { header: 'Ghi chú', key: 'note', width: 40 },
  ];
  records.forEach((record) => {
    sheet.addRow({
      employeeId: record.employeeId,
      name: record.name,
      title: record.title,
      imageFileName: record.imageFileName,
      departmentID: record.departmentID ?? '',
      sex: record.sex === '0' ? 'Nam' : record.sex === '1' ? 'Nữ' : '',
      // email: record.email ?? '',
      // phone: record.phone,
      // dob: record.dob ?? '',
      // age: record.age ?? '',
      status: resolveGridStatusLabel(record),
      note: record.registeredNote ?? messageByEmployeeId.get(record.employeeId) ?? '',
    });
  });

  await workbook.xlsx.writeFile(saveResult.filePath);
  return saveResult.filePath;
}
