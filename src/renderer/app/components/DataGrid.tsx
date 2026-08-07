import { memo } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { CheckCircle2, ImageOff, AlertTriangle, UserCheck, ScanFace, LucideIcon } from 'lucide-react';
import { EmployeeRecord } from '@shared/types';
import { toSafeFileUrl } from '@shared/safeFile';

const statusConfig: Record<EmployeeRecord['status'], { label: string; className: string; icon: LucideIcon }> = {
  VALID: { label: 'Hợp lệ', className: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  MISSING_IMAGE: { label: 'Thiếu ảnh', className: 'bg-amber-100 text-amber-700', icon: ImageOff },
  INVALID: { label: 'Sai dữ liệu', className: 'bg-rose-100 text-rose-700', icon: AlertTriangle },
};

// Kết quả đăng ký lên Hanet ghi đè hiển thị trạng thái Excel gốc (VALID) một khi đã có: dòng vẫn ở
// lại Data Grid (không xoá) để người dùng đối chiếu lại ảnh/thông tin nếu lỡ chọn nhầm.
const registeredConfig: Record<
  NonNullable<EmployeeRecord['registeredStatus']>,
  { label: string; className: string; icon: LucideIcon }
> = {
  REGISTERED: { label: 'Đã đăng ký', className: 'bg-blue-100 text-blue-700', icon: UserCheck },
  ALREADY_EXISTS_FACE: { label: 'Trùng FaceID', className: 'bg-amber-100 text-amber-700', icon: ScanFace },
  ALREADY_EXISTS_ALIAS: { label: 'Trùng Mã NV', className: 'bg-amber-100 text-amber-700', icon: UserCheck },
  REGISTERED_IMAGE_INVALID: { label: 'Cần đổi ảnh', className: 'bg-rose-100 text-rose-700', icon: ImageOff },
};

const ROW_HEIGHT = 60;
const LIST_HEIGHT = 360;

const COL_ID = 'w-32';
const COL_NAME = 'w-48';
const COL_TITLE = 'w-40';
const COL_SEX = 'w-24';
const COL_DEPT = 'w-32';
const COL_IMAGE = 'w-20';
const COL_STATUS = 'flex-1';

const columns = [
  { label: 'Mã NV', className: COL_ID },
  { label: 'Họ tên', className: COL_NAME },
  { label: 'Chức vụ', className: COL_TITLE },
  { label: 'Giới tính', className: COL_SEX },
  { label: 'ID Phòng ban', className: COL_DEPT },
  { label: 'Ảnh', className: COL_IMAGE },
  { label: 'Trạng thái', className: COL_STATUS },
];

interface DataGridProps {
  records: EmployeeRecord[];
  isLoading: boolean;
  /** Đổi khi có bộ dữ liệu mới (chọn lại Excel/thư mục) để reset phân trang. */
  resetKey?: number;
}

// Hàng được memo hoá: chỉ re-render khi chính dữ liệu của hàng đó đổi, không bị kéo theo khi các
// hàng khác trong danh sách ảo thay đổi.
const Row = memo(function Row({ index, style, data }: ListChildComponentProps<EmployeeRecord[]>) {
  // react-window chỉ gọi Row với index trong [0, itemCount) nên data[index] luôn tồn tại.
  const item = data[index]!;
  const cfg = item.registeredStatus ? registeredConfig[item.registeredStatus] : statusConfig[item.status];
  const StatusIcon = cfg.icon;
  // duplicateId/duplicateImage là chi tiết lý do INVALID — ưu tiên hiển thị lý do cụ thể hơn nhãn
  // chung "Sai dữ liệu", trừ khi đã có kết quả đăng ký thật (registeredStatus) đè lên.
  const duplicateLabel = item.duplicateId ? 'Trùng Mã NV' : item.duplicateImage ? 'Trùng ảnh' : null;

  return (
    <div style={style} className="flex items-center border-b border-slate-100 px-4 hover:bg-slate-50 text-sm">
      <div className={`${COL_ID} font-medium text-slate-800 truncate pr-2`}>{item.employeeId}</div>
      <div className={`${COL_NAME} text-slate-700 truncate pr-2`}>
        <div className="truncate">{item.name}</div>
      </div>
      <div className={`${COL_TITLE} text-slate-500 truncate pr-2`}>{item.title || '—'}</div>
      <div className={`${COL_SEX} text-slate-500 pr-2`}>{item.sex === '0' ? 'Nam' : item.sex === '1' ? 'Nữ' : '—'}</div>
      <div className={`${COL_DEPT} text-slate-500 pr-2`}>{item.departmentID ?? '—'}</div>
      <div className={`${COL_IMAGE} py-2 pr-2`}>
        {item.imagePath ? (
          // loading="lazy": chỉ tải ảnh khi dòng thực sự vào vùng nhìn thấy.
          <img
            src={toSafeFileUrl(item.imagePath)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-12 w-12 rounded-lg object-cover border border-slate-200 bg-slate-50"
          />
        ) : (
          <span className="text-xs text-slate-400">Không có</span>
        )}
      </div>
      <div className={COL_STATUS}>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            !item.registeredStatus && duplicateLabel ? 'bg-rose-100 text-rose-700' : cfg.className
          }`}
        >
          <StatusIcon size={13} />
          {!item.registeredStatus && duplicateLabel ? duplicateLabel : cfg.label}
        </span>
      </div>
    </div>
  );
});

export function DataGrid({ records, isLoading, resetKey }: DataGridProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex bg-slate-50 text-slate-500 text-xs uppercase tracking-wide px-4 py-3 border-b border-slate-200">
        {columns.map((col) => (
          <div key={col.label} className={`${col.className} font-medium`}>
            {col.label}
          </div>
        ))}
      </div>
      {records.length === 0 ? (
        <div
          style={{ height: LIST_HEIGHT }}
          className="flex items-center justify-center px-4 text-center text-slate-400"
        >
          {isLoading ? 'Đang đọc dữ liệu...' : 'Chưa có dữ liệu. Hãy chọn file Excel và thư mục ảnh.'}
        </div>
      ) : (
        <FixedSizeList
          key={resetKey}
          height={LIST_HEIGHT}
          width="100%"
          itemCount={records.length}
          itemSize={ROW_HEIGHT}
          itemData={records}
          itemKey={(index, data) => `${data[index]!.employeeId}-${index}`}
        >
          {Row}
        </FixedSizeList>
      )}
    </div>
  );
}
