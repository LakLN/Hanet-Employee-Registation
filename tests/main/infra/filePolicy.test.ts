import { describe, expect, it } from 'vitest';
import path from 'path';
import { FilePolicy } from '../../../src/main/infra/filePolicy';

const root = path.resolve('C:/du-lieu/nhan-su');

describe('FilePolicy', () => {
  it('chặn mọi đường dẫn khi chưa có thư mục nào được người dùng chọn', () => {
    const policy = new FilePolicy();

    expect(policy.isAllowed(path.join(root, 'anh1.jpg'))).toBe(false);
    expect(() => policy.assertAllowed(path.join(root, 'anh1.jpg'))).toThrow('không hợp lệ');
  });

  it('cho phép file nằm trong thư mục đã chọn, kể cả thư mục con', () => {
    const policy = new FilePolicy();
    policy.allowFolder(root);

    expect(policy.isAllowed(path.join(root, 'anh1.jpg'))).toBe(true);
    expect(policy.isAllowed(path.join(root, 'thang-01', 'anh1.jpg'))).toBe(true);
  });

  it('chọn một file thì chỉ mở quyền cho thư mục chứa nó', () => {
    const policy = new FilePolicy();
    policy.allowFileParent(path.join(root, 'danh-sach.xlsx'));

    expect(policy.isAllowed(path.join(root, 'anh1.jpg'))).toBe(true);
    expect(policy.isAllowed(path.resolve('C:/du-lieu/khac/anh1.jpg'))).toBe(false);
  });

  // Thư mục anh chị em có tên bắt đầu bằng cùng tiền tố ("nhan-su-cu" so với "nhan-su") không được
  // coi là nằm trong thư mục đã cho phép — đây là lỗi kinh điển của việc chỉ so sánh startsWith.
  it('không cho phép thư mục chỉ trùng tiền tố tên', () => {
    const policy = new FilePolicy();
    policy.allowFolder(root);

    expect(policy.isAllowed(path.resolve('C:/du-lieu/nhan-su-cu/anh1.jpg'))).toBe(false);
  });

  it('chặn đường dẫn dùng .. để leo ra ngoài thư mục đã chọn', () => {
    const policy = new FilePolicy();
    policy.allowFolder(root);

    expect(policy.isAllowed(path.join(root, '..', 'khac', 'anh1.jpg'))).toBe(false);
  });

  it('assertAllAllowed bỏ qua giá trị rỗng nhưng chặn đường dẫn ngoài phạm vi', () => {
    const policy = new FilePolicy();
    policy.allowFolder(root);

    expect(() => policy.assertAllAllowed([null, undefined, path.join(root, 'a.jpg')])).not.toThrow();
    expect(() => policy.assertAllAllowed([path.resolve('C:/Windows/System32/config/SAM')])).toThrow();
  });
});
