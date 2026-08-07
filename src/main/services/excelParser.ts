import ExcelJS from 'exceljs';
import { EmployeeRecord } from '@shared/types';

// ExcelJS trả cell công thức/rich text/hyperlink dạng object thay vì giá trị thô — nếu không xử
// lý riêng, String(cell) sẽ ra "[object Object]" và làm sai lệch dữ liệu mà không có cảnh báo.
const normalizeCell = (cell: ExcelJS.CellValue): string => {
  if (cell === null || cell === undefined) return '';
  if (typeof cell !== 'object') return String(cell).trim();
  if (cell instanceof Date) return cell.toISOString();
  if ('richText' in cell) {
    return cell.richText
      .map((t) => t.text)
      .join('')
      .trim();
  }
  if ('result' in cell) {
    return cell.result !== undefined ? normalizeCell(cell.result) : '';
  }
  if ('text' in cell) {
    return cell.text.trim();
  }
  if ('error' in cell) {
    return '';
  }
  return String(cell).trim();
};

const rowHasData = (row: ExcelJS.Row): boolean => {
  const vals: ExcelJS.CellValue[] = Array.isArray(row.values)
    ? row.values
    : row.values
      ? Object.values(row.values)
      : [];
  return vals.some((v) => v !== null && v !== undefined && String(v).trim() !== '');
};

const toIntOrUndefined = (raw: string): number | undefined => (raw && /^\d+$/.test(raw) ? Number(raw) : undefined);

export const parseEmployeeExcel = async (
  fileBuffer: ArrayBuffer,
  imageFiles: Array<{ filePath: string; fileName: string }>,
): Promise<EmployeeRecord[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const [worksheet] = workbook.worksheets;
  if (!worksheet) {
    throw new Error('File Excel không có sheet nào để đọc.');
  }
  // Hai map tra cứu: theo tên file ĐẦY ĐỦ (kèm đuôi) và theo tên KHÔNG đuôi. Khi cột Excel ghi rõ
  // đuôi (VD: "NV001.jpg"), map đầy đủ cho phép định vị chính xác 1 file dù thư mục có nhiều ảnh
  // trùng tên khác đuôi. Map không đuôi chỉ dùng khi cột Excel không ghi đuôi — lúc đó nếu thư mục
  // có nhiều ảnh trùng tên khác đuôi, ảnh liệt kê sau sẽ ghi đè ảnh trước (không xác định thứ tự).
  const imageMapByFullName = new Map<string, string>();
  const imageMapByNameWithoutExt = new Map<string, string>();
  imageFiles.forEach((image) => {
    imageMapByFullName.set(image.fileName.toUpperCase(), image.filePath);
    const nameWithoutExt = image.fileName.replace(/\.[^/.]+$/, '').toUpperCase();
    imageMapByNameWithoutExt.set(nameWithoutExt, image.filePath);
  });

  // Find header row (use first non-empty row if row 1 is empty)
  let headerRow = worksheet.getRow(1);
  const maxHeaderSearch = Math.min(5, worksheet.rowCount);
  for (let r = 1; r <= maxHeaderSearch; r += 1) {
    const row = worksheet.getRow(r);
    if (rowHasData(row)) {
      headerRow = row;
      break;
    }
  }

  // Build header -> column index map
  const headerMap = new Map<string, number>();
  for (let c = 1; c <= worksheet.columnCount; c += 1) {
    const raw = headerRow.getCell(c).value;
    const h = normalizeCell(raw).toLowerCase();
    if (h) headerMap.set(h, c);
  }

  const findCol = (variants: string[]): number | undefined => {
    // exact match first
    for (const v of variants) {
      for (const [h, idx] of headerMap) {
        if (h === v) return idx;
      }
    }
    // contains match
    for (const v of variants) {
      for (const [h, idx] of headerMap) {
        if (h.includes(v)) return idx;
      }
    }
    return undefined;
  };

  const columnIndex: Record<string, number | undefined> = {};
  columnIndex.employeeId = findCol([
    'employeeid',
    'mã nv',
    'mã_nv',
    'mã nhân viên',
    'mã nhân viên (*)',
    'mã nhân viên(*)',
  ]);
  columnIndex.name = findCol(['name', 'họ tên', 'ho va ten', 'họ và tên']);
  columnIndex.title = findCol(['title', 'chức vụ', 'chuc vu', 'chức danh']);
  columnIndex.phone = findCol(['phone', 'sđt', 'sdt', 'điện thoại', 'dien thoai']);
  columnIndex.imageFileName = findCol(['ảnh', 'anh', 'tên file', 'ten file', 'tên file ảnh', 'file']);
  columnIndex.departmentID = findCol([
    'department',
    'id phòng ban',
    'id phong ban',
    'phòng ban',
    'id phòng',
    'id phòng ban (*)',
    'id phong',
  ]);
  columnIndex.sex = findCol(['sex', 'giới tính', 'gioi tinh']);
  columnIndex.email = findCol(['email', 'e-mail']);
  columnIndex.dob = findCol(['dob', 'ngày sinh', 'ngay sinh']);
  columnIndex.age = findCol(['age', 'tuổi', 'tuoi']);
  // Required columns check
  if (!columnIndex.employeeId || !columnIndex.name) {
    throw new Error('Không tìm thấy cột bắt buộc: Mã NV hoặc Họ tên trong file Excel. Vui lòng kiểm tra header.');
  }

  const results: EmployeeRecord[] = [];

  // Iterate rows after headerRow number
  const startRow = headerRow.number + 1;
  for (let r = startRow; r <= worksheet.rowCount; r += 1) {
    const row = worksheet.getRow(r);
    if (!rowHasData(row)) continue;

    const readCell = (col?: number) => normalizeCell(col ? (row.getCell(col).value ?? '') : '');

    const employeeId = readCell(columnIndex.employeeId);
    const name = readCell(columnIndex.name);
    const title = readCell(columnIndex.title);
    const phone = readCell(columnIndex.phone);
    const sex = readCell(columnIndex.sex);
    const email = readCell(columnIndex.email);
    const dob = readCell(columnIndex.dob);
    const ageRaw = readCell(columnIndex.age);
    const age = toIntOrUndefined(ageRaw);
    const imageFileName = readCell(columnIndex.imageFileName);
    const deptRaw = readCell(columnIndex.departmentID);
    const departmentID = toIntOrUndefined(deptRaw);

    // Hanet quy ước thực tế (đã kiểm chứng bằng test API trực tiếp): 0 = Nam, 1 = Nữ — ngược với
    // mô tả trong tài liệu API của Hanet (tài liệu ghi sai).
    const normalizedSex = sex.toLowerCase();
    let sexValue: EmployeeRecord['sex'] = undefined;
    if (normalizedSex === 'nam') {
      sexValue = '0';
    } else if (normalizedSex === 'nữ' || normalizedSex === 'nu') {
      sexValue = '1';
    }

    const hasExtension = /\.[^/.]+$/.test(imageFileName);
    const imagePath = !imageFileName
      ? null
      : hasExtension
        ? (imageMapByFullName.get(imageFileName.toUpperCase()) ?? null)
        : (imageMapByNameWithoutExt.get(imageFileName.toUpperCase()) ?? null);
    const isValid = employeeId !== '' && name !== '';

    const status: EmployeeRecord['status'] = !isValid ? 'INVALID' : imagePath ? 'VALID' : 'MISSING_IMAGE';

    results.push({
      employeeId,
      name,
      title,
      phone,
      sex: sexValue,
      email: email || undefined,
      dob: dob || undefined,
      age,
      imageFileName,
      imagePath,
      departmentID,
      status,
    });
  }

  // Mark duplicate employee IDs as invalid
  const idCounts = results.reduce<Record<string, number>>((acc, item) => {
    const normalizedId = item.employeeId.trim().toUpperCase();
    if (!normalizedId) return acc;
    acc[normalizedId] = (acc[normalizedId] ?? 0) + 1;
    return acc;
  }, {});

  // Trùng ẢNH giữa 2 nhân viên khác nhau: so theo imagePath đã ghép (ảnh vật lý thật), không theo
  // tên file trong cột Excel — tên file chỉ là quy ước để tra cứu, người dùng có thể đặt bất kỳ tên
  // gì miễn quản lý được, nên không đáng để cảnh báo riêng. Nhưng 2 mã NV cùng trỏ tới 1 ảnh thì gần
  // như chắc chắn là gõ nhầm/copy nhầm dòng — Hanet nhận diện theo khuôn mặt nên phải chặn trước khi gửi.
  const imagePathCounts = results.reduce<Record<string, number>>((acc, item) => {
    if (!item.imagePath) return acc;
    acc[item.imagePath] = (acc[item.imagePath] ?? 0) + 1;
    return acc;
  }, {});

  return results.map((item) => {
    const normalizedId = item.employeeId.trim().toUpperCase();
    const duplicateId = normalizedId !== '' && (idCounts[normalizedId] ?? 0) > 1;
    const duplicateImage = !!item.imagePath && (imagePathCounts[item.imagePath] ?? 0) > 1;
    if (!duplicateId && !duplicateImage) return item;
    return {
      ...item,
      status: 'INVALID',
      ...(duplicateId ? { duplicateId: true } : {}),
      ...(duplicateImage ? { duplicateImage: true } : {}),
    };
  });
};
