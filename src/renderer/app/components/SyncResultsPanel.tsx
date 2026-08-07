import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Eye, Loader2, Trash2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { SyncResultItem } from '@shared/types';
import { resolveStatusMeta, StatusMeta } from '@shared/hanetStatus';
import { DuplicatePersonModal } from './DuplicatePersonModal';

interface Props {
  open: boolean;
  onClose: () => void;
  results: SyncResultItem[];
  progress: { current: number; total: number };
  current?: Array<{ employeeId: string; name: string }>;
  removingIds?: Set<string>;
  onRemovePerson?: (item: SyncResultItem) => void;
  onRemoveAllSuccess?: () => void;
  /** Thứ tự Mã NV trong Data Grid — dùng để sắp lại `results` theo cùng thứ tự đó, thay vì thứ tự
   *  hoàn tất thực tế (vốn phụ thuộc thời gian xử lý song song từng người, không cố định). */
  gridOrder?: string[];
}

// Mỗi tone có một "vai": màu dải trái + nền icon tròn + icon riêng, dùng xuyên suốt panel để mắt
// quét nhanh trạng thái mà không cần đọc chữ trước.
const toneStyle: Record<
  StatusMeta['tone'],
  { bar: string; iconBg: string; iconColor: string; icon: typeof CheckCircle2 }
> = {
  success: { bar: 'bg-emerald-500', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600', icon: CheckCircle2 },
  warning: { bar: 'bg-amber-500', iconBg: 'bg-amber-50', iconColor: 'text-amber-600', icon: AlertTriangle },
  error: { bar: 'bg-rose-500', iconBg: 'bg-rose-50', iconColor: 'text-rose-600', icon: XCircle },
};

// Cùng bảng màu nền/viền với StatCard ở App.tsx (emerald/amber/rose) để 2 hàng thống kê — thẻ tổng
// quan ngoài màn hình chính và bảng tóm tắt trong nhật ký — đọc như cùng một hệ thống màu.
const summaryToneStyle: Record<StatusMeta['tone'], { bg: string; text: string; border: string }> = {
  success: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200/80' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200/80' },
  error: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200/80' },
};

export function SyncResultsPanel({
  open,
  onClose,
  results,
  progress,
  current = [],
  removingIds,
  onRemovePerson,
  onRemoveAllSuccess,
  gridOrder,
}: Props) {
  const [activeItem, setActiveItem] = useState<SyncResultItem | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) listEndRef.current?.scrollIntoView({ block: 'end' });
  }, [results.length, open, current.length]);

  // Kết quả hoàn tất theo thứ tự xử lý song song (không cố định giữa các lần chạy) — sắp lại theo
  // đúng thứ tự Mã NV trong Data Grid để dễ đối chiếu qua lại giữa hai nơi. Record không có trong
  // gridOrder (hiếm, chỉ khi Data Grid đã đổi bộ dữ liệu khác) rơi xuống cuối theo thứ tự gốc.
  const orderedResults = useMemo(() => {
    if (!gridOrder || gridOrder.length === 0) return results;
    const rank = new Map(gridOrder.map((id, idx) => [id, idx]));
    return results
      .map((item, idx) => ({ item, idx }))
      .sort((a, b) => {
        const rankA = rank.get(a.item.employeeId) ?? Number.MAX_SAFE_INTEGER;
        const rankB = rank.get(b.item.employeeId) ?? Number.MAX_SAFE_INTEGER;
        return rankA !== rankB ? rankA - rankB : a.idx - b.idx;
      })
      .map(({ item }) => item);
  }, [results, gridOrder]);

  const metaByItem = useMemo(
    () =>
      new Map<SyncResultItem, StatusMeta>(
        orderedResults.map((item) => [item, resolveStatusMeta(item.returnCode, item.message)]),
      ),
    [orderedResults],
  );

  const tally = results.reduce(
    (acc, item) => {
      const tone = metaByItem.get(item)!.tone;
      if (tone === 'success') acc.success += 1;
      else if (tone === 'warning') acc.duplicate += 1;
      else acc.failed += 1;
      return acc;
    },
    { success: 0, duplicate: 0, failed: 0 },
  );

  // Chỉ tính tone success: handleRemoveAllSuccess (useBulkSync.ts) chỉ xoá đúng nhóm này — "Đã tồn
  // tại" (warning) có thể là person đã có sẵn trên Hanet từ trước, không phải do lần đăng ký này
  // tạo ra, nên không gộp vào để số hiển thị trên nút khớp với số thực sự bị xoá.
  const successCount = tally.success;
  const isProcessing = progress.total > 0 && progress.current !== progress.total;

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <aside
        className={`fixed top-0 right-0 h-full w-[440px] bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="font-semibold text-slate-800">Kết quả đăng ký</h3>
            {progress.total > 0 && (
              <p className="text-xs text-slate-400 mt-0.5">
                {isProcessing
                  ? `Đang xử lý ${progress.current}/${progress.total}`
                  : `Hoàn tất ${progress.total} nhân viên`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">
            <X size={18} />
          </button>
        </div>

        {progress.total > 0 && (
          <div className="px-5 pt-3 pb-2 border-b border-slate-100 shrink-0">
            {isProcessing && (
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-3">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <SummaryPill count={tally.success} label="Thành công" tone="success" />
              <SummaryPill count={tally.duplicate} label="Đã tồn tại" tone="warning" />
              <SummaryPill count={tally.failed} label="Thất bại" tone="error" />
            </div>
          </div>
        )}

        {onRemoveAllSuccess && successCount > 0 && (
          <div className="px-5 py-2.5 border-b border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onRemoveAllSuccess}
              title="Xoá tất cả nhân viên đã đăng ký thành công khỏi Hanet"
              className="flex items-center justify-center gap-1.5 w-full rounded-lg border border-rose-200 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <Trash2 size={13} />
              Xoá {successCount} người đã đăng ký thành công
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {orderedResults.length === 0 && current.length === 0 ? (
            <div className="px-5 py-14 text-center text-sm text-slate-400">Chưa có kết quả nào.</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {current.map((item) => (
                <ResultRow key={`current-${item.employeeId}`} pending name={item.name} employeeId={item.employeeId} />
              ))}
              {orderedResults.map((item, idx) => {
                const meta = metaByItem.get(item)!;
                const isRemoving = removingIds?.has(item.employeeId) ?? false;
                return (
                  <ResultRow
                    key={`${item.employeeId}-${idx}`}
                    name={item.name}
                    employeeId={item.employeeId}
                    meta={meta}
                    note={meta.tone !== 'success' ? meta.label : undefined}
                    durationMs={item.durationMs}
                    hasExisting={!!item.existingPerson}
                    onViewExisting={() => setActiveItem(item)}
                    isRemoving={isRemoving}
                    onRemove={item.personID && onRemovePerson ? () => onRemovePerson(item) : undefined}
                  />
                );
              })}
            </div>
          )}
          <div ref={listEndRef} />
        </div>
      </aside>

      {activeItem?.existingPerson && (
        <DuplicatePersonModal
          open={!!activeItem}
          onClose={() => setActiveItem(null)}
          employeeName={activeItem.name}
          existingPerson={activeItem.existingPerson}
        />
      )}
    </>
  );
}

function SummaryPill({ count, label, tone }: { count: number; label: string; tone: StatusMeta['tone'] }) {
  const style = summaryToneStyle[tone];
  return (
    <div className={`flex flex-col items-center rounded-lg border py-1.5 ${style.bg} ${style.border}`}>
      <span className={`text-base font-semibold ${style.text}`}>{count}</span>
      <span className="text-[11px] opacity-80">{label}</span>
    </div>
  );
}

interface ResultRowProps {
  name: string;
  employeeId: string;
  pending?: boolean;
  meta?: StatusMeta;
  note?: string;
  durationMs?: number;
  hasExisting?: boolean;
  onViewExisting?: () => void;
  isRemoving?: boolean;
  onRemove?: () => void;
}

// Một dòng = một "vai": dải màu bên trái + icon tròn cho biết trạng thái ngay từ xa, tên/mã NV làm
// trọng tâm, ghi chú lỗi (nếu có) đặt ngay dưới tên để không phải hover/mở gì thêm mới biết lý do.
function ResultRow({
  name,
  employeeId,
  pending,
  meta,
  note,
  durationMs,
  hasExisting,
  onViewExisting,
  isRemoving,
  onRemove,
}: ResultRowProps) {
  const style = pending
    ? { bar: 'bg-blue-500', iconBg: 'bg-blue-50', iconColor: 'text-blue-600', icon: Loader2 }
    : toneStyle[meta!.tone];
  const Icon = style.icon;

  return (
    <div className="group flex gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
      <div className={`w-1 self-stretch rounded-full ${style.bar} shrink-0`} />
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${style.iconBg}`}>
        <Icon size={15} className={`${style.iconColor} ${pending ? 'animate-spin' : ''}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-800 truncate">{name}</div>
            <div className="text-xs text-slate-400">{employeeId}</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {pending ? (
              <span className="text-xs text-blue-500">Đang xử lý...</span>
            ) : (
              <>
                {typeof durationMs === 'number' && (
                  <span className="text-xs text-slate-300">{(durationMs / 1000).toFixed(1)}s</span>
                )}
                {hasExisting && (
                  <button
                    type="button"
                    onClick={onViewExisting}
                    title="Xem FaceID trùng"
                    className="flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                  >
                    <Eye size={14} />
                  </button>
                )}
                {onRemove && (
                  <button
                    type="button"
                    onClick={onRemove}
                    disabled={isRemoving}
                    title="Xoá khỏi Hanet"
                    className="flex items-center gap-1 rounded-md border border-rose-200 px-1.5 py-1 text-rose-500 hover:bg-rose-100 hover:text-rose-600 transition-colors disabled:opacity-50"
                  >
                    {isRemoving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {!pending && note && <div className="text-xs text-slate-500 mt-1 line-clamp-2">{note}</div>}
      </div>
    </div>
  );
}
