import { dialog } from 'electron';
import ExcelJS from 'exceljs';

/**
 * File mẫu dùng đúng bộ cột mà excelParser.ts nhận diện được (xem findCol trong services/excelParser.ts)
 * và đúng thứ tự cột như exportResults.ts xuất ra — để người dùng có thể tải mẫu, điền, rồi import
 * thẳng mà không cần đoán tên cột hay đối chiếu ngược từ file kết quả.
 */
export async function generateExcelTemplate(): Promise<string | null> {
  const saveResult = await dialog.showSaveDialog({
    title: 'Tải file Excel mẫu',
    defaultPath: 'mau-danh-sach-nhan-vien.xlsx',
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
  });
  if (saveResult.canceled || !saveResult.filePath) return null;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Danh sách nhân viên');
  sheet.columns = [
    { header: 'STT', key: 'stt', width: 8 },
    { header: 'Mã NV(*)', key: 'employeeId', width: 15 },
    { header: 'Họ tên(*)', key: 'name', width: 25 },
    { header: 'Chức vụ', key: 'title', width: 20 },
    { header: 'Giới tính', key: 'sex', width: 12 },
    { header: 'ID Phòng ban', key: 'departmentID', width: 14 },
    { header: 'Tên file ảnh(*)', key: 'imageFileName', width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    stt: 1,
    employeeId: 'NV001',
    name: 'Nguyễn Văn A',
    title: 'Nhân viên',
    sex: 'Nam',
    departmentID: 1,
    imageFileName: 'NV001.jpg',
  });

  for (let r = 2; r <= 500; r += 1) {
    sheet.getCell(`E${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Nam,Nữ"'],
    };
  }

  await workbook.xlsx.writeFile(saveResult.filePath);
  return saveResult.filePath;
}
