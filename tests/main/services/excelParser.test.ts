import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseEmployeeExcel } from '../../../src/main/services/excelParser';

async function toArrayBuffer(workbook: ExcelJS.Workbook): Promise<ArrayBuffer> {
  // Mô phỏng đúng dữ liệu mà ipc.ts trả về cho renderer qua IPC ('read-file'): một ArrayBuffer
  // thuần, không phải Node Buffer.
  const nodeBuffer = (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array;
  return nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength) as ArrayBuffer;
}

const IMAGE_FILES = [{ filePath: 'C:/anh/anh1.jpg', fileName: 'anh1.jpg' }];

describe('parseEmployeeExcel', () => {
  it('parse đúng các cột tiếng Việt, chuẩn hoá giới tính, gán ảnh theo tên file', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('NV');
    sheet.addRow([
      'Mã NV',
      'Họ tên',
      'Chức vụ',
      'SĐT',
      'Tên file ảnh',
      'Giới tính',
      'Email',
      'Ngày sinh',
      'Tuổi',
      'ID phòng ban',
    ]);
    sheet.addRow(['NV001', 'Nguyễn Văn A', 'Nhân viên', '0901234567', 'anh1', 'Nam', 'a@x.com', '1990-01-01', 34, 10]);
    sheet.addRow([
      'NV002',
      'Trần Thị B',
      'Nhân viên',
      '0901234568',
      'khong-ton-tai',
      'Nữ',
      'b@x.com',
      '1992-02-02',
      32,
      10,
    ]);

    const results = await parseEmployeeExcel(await toArrayBuffer(workbook), IMAGE_FILES);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      employeeId: 'NV001',
      name: 'Nguyễn Văn A',
      sex: '0',
      status: 'VALID',
      imagePath: 'C:/anh/anh1.jpg',
      age: 34,
      departmentID: 10,
    });
    expect(results[1]).toMatchObject({
      employeeId: 'NV002',
      sex: '1',
      status: 'MISSING_IMAGE',
      imagePath: null,
    });
  });

  it('đánh dấu INVALID + duplicateId khi trùng Mã NV', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('NV');
    sheet.addRow(['Mã NV', 'Họ tên', 'Tên file ảnh']);
    sheet.addRow(['NV001', 'Người thứ nhất', 'anh1']);
    sheet.addRow(['NV001', 'Người thứ hai', 'anh1']);

    const results = await parseEmployeeExcel(await toArrayBuffer(workbook), IMAGE_FILES);

    expect(results).toHaveLength(2);
    for (const item of results) {
      expect(item.status).toBe('INVALID');
      expect(item.duplicateId).toBe(true);
    }
  });

  it('đánh dấu INVALID + duplicateImage khi 2 mã NV khác nhau cùng trỏ tới 1 ảnh, dù tên file trong Excel khác nhau', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('NV');
    sheet.addRow(['Mã NV', 'Họ tên', 'Tên file ảnh']);
    // Tên file trong cột Excel khác nhau ("anh1" / "anh1-copy") nhưng cả hai đều map về cùng một
    // ảnh vật lý qua imageFiles bên dưới — đây chính là trường hợp tên file chỉ là quy ước, phải so
    // theo đường dẫn ảnh thật chứ không so theo tên NV đặt.
    sheet.addRow(['NV001', 'Người thứ nhất', 'anh1']);
    sheet.addRow(['NV002', 'Người thứ hai', 'anh1-copy']);

    const results = await parseEmployeeExcel(await toArrayBuffer(workbook), [
      { filePath: 'C:/anh/chung.jpg', fileName: 'anh1.jpg' },
      { filePath: 'C:/anh/chung.jpg', fileName: 'anh1-copy.jpg' },
    ]);

    expect(results).toHaveLength(2);
    for (const item of results) {
      expect(item.status).toBe('INVALID');
      expect(item.duplicateImage).toBe(true);
      expect(item.duplicateId).toBeUndefined();
    }
  });

  it('không đánh dấu duplicateImage khi ảnh khác nhau', async () => {
    const results = await parseEmployeeExcel(
      await toArrayBuffer(
        (() => {
          const workbook = new ExcelJS.Workbook();
          const sheet = workbook.addWorksheet('NV');
          sheet.addRow(['Mã NV', 'Họ tên', 'Tên file ảnh']);
          sheet.addRow(['NV001', 'Người thứ nhất', 'anh1']);
          sheet.addRow(['NV002', 'Người thứ hai', 'anh2']);
          return workbook;
        })(),
      ),
      [
        { filePath: 'C:/anh/anh1.jpg', fileName: 'anh1.jpg' },
        { filePath: 'C:/anh/anh2.jpg', fileName: 'anh2.jpg' },
      ],
    );

    expect(results.every((item) => item.status === 'VALID' && !item.duplicateImage)).toBe(true);
  });

  it('đánh dấu INVALID khi thiếu Họ tên dù có Mã NV', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('NV');
    sheet.addRow(['Mã NV', 'Họ tên', 'Tên file ảnh']);
    sheet.addRow(['NV003', '']);

    const results = await parseEmployeeExcel(await toArrayBuffer(workbook), []);

    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('INVALID');
  });

  it('tìm đúng header khi các dòng đầu bị bỏ trống', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('NV');
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow(['Mã NV', 'Họ tên', 'Tên file ảnh']);
    sheet.addRow(['NV001', 'Nguyễn Văn A']);

    const results = await parseEmployeeExcel(await toArrayBuffer(workbook), []);

    expect(results).toHaveLength(1);
    expect(results[0]?.employeeId).toBe('NV001');
  });

  it('đọc được ô rich text (không trả về "[object Object]")', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('NV');
    sheet.addRow(['Mã NV', 'Họ tên', 'Tên file ảnh']);
    const row = sheet.addRow(['NV001']);
    row.getCell(2).value = { richText: [{ text: 'Nguyễn' }, { text: ' Văn A' }] };

    const results = await parseEmployeeExcel(await toArrayBuffer(workbook), []);

    expect(results[0]?.name).toBe('Nguyễn Văn A');
  });

  it('ném lỗi khi thiếu cột bắt buộc (Mã NV hoặc Họ tên)', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('NV');
    sheet.addRow(['Chức vụ', 'SĐT']);
    sheet.addRow(['Nhân viên', '0901234567']);

    await expect(parseEmployeeExcel(await toArrayBuffer(workbook), [])).rejects.toThrow('Không tìm thấy cột bắt buộc');
  });

  it('ném lỗi khi thiếu cột Tên file ảnh', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('NV');
    sheet.addRow(['Mã NV', 'Họ tên']);
    sheet.addRow(['NV001', 'Nguyễn Văn A']);

    await expect(parseEmployeeExcel(await toArrayBuffer(workbook), [])).rejects.toThrow('Tên file ảnh');
  });
});
