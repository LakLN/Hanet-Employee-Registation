import { useEffect, useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { HanetAliasMatch } from '@shared/types';
import { friendlyErrorMessage } from '../utils/friendlyError';

interface Props {
  employeeName: string;
  employeeId: string;
  aliasID: string;
  /** false khi đang chạy một lô đăng ký khác — không cho xoá vì sẽ không đăng ký lại được ngay. */
  canReplace: boolean;
  onClose: () => void;
  /** Xoá các person đã chọn rồi đăng ký lại. Trả về true khi đã xoá xong và bắt đầu đăng ký lại. */
  onReplace: (personIDs: string[]) => Promise<boolean>;
}

// Hanet báo trùng Mã NV ở phạm vi cả tài khoản, nên bản trùng có thể nằm ở địa điểm khác với địa
// điểm đang chọn — modal này tra trên tất cả địa điểm để chỉ ra nó nằm đâu và cho xoá để đăng ký lại.
export function AliasLookupModal({ employeeName, employeeId, aliasID, canReplace, onClose, onReplace }: Props) {
  const [matches, setMatches] = useState<HanetAliasMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.hanetImporter
      .findPersonsByAlias({ aliasID })
      .then((result) => !cancelled && setMatches(result))
      .catch((err) => !cancelled && setError(friendlyErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [aliasID]);

  const handleReplace = async () => {
    if (!matches || matches.length === 0) return;
    const places = matches.map((m) => `"${m.name}" ở ${m.placeName}`).join(', ');
    const confirmed = window.confirm(
      `Xoá ${places} khỏi Hanet rồi đăng ký lại "${employeeName}" (${employeeId}) với ảnh hiện tại? Hành động xoá không thể hoàn tác.`,
    );
    if (!confirmed) return;
    setIsReplacing(true);
    const ok = await onReplace(matches.map((m) => m.personID));
    setIsReplacing(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <h3 className="font-semibold text-slate-800 text-lg">Mã NV đã được dùng</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Mã <strong>{aliasID}</strong> của <strong>{employeeName}</strong> đang được gán cho hồ sơ dưới đây trên
          Hanet (tra trên tất cả địa điểm của tài khoản).
        </p>

        <div className="mt-4">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              Không tra cứu được: {error}
            </div>
          ) : matches === null ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
              <Loader2 size={16} className="animate-spin" /> Đang tra cứu...
            </div>
          ) : matches.length === 0 ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
              Không tìm thấy hồ sơ nào đang giữ mã này — có thể đã được xoá sau lần đăng ký vừa rồi. Hãy bấm "Thử
              lại" để đăng ký lại.
            </div>
          ) : (
            <div className="space-y-2">
              {matches.map((m) => (
                <div
                  key={m.personID}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3"
                >
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} className="h-12 w-12 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-slate-200" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800 text-sm truncate">{m.name || '(Không có tên)'}</div>
                    {m.title && <div className="text-xs text-slate-400 truncate">{m.title}</div>}
                    <div
                      className={`mt-0.5 flex items-center gap-1 text-xs ${m.isActivePlace ? 'text-slate-500' : 'text-amber-600 font-medium'}`}
                    >
                      <MapPin size={12} />
                      {m.placeName}
                      {!m.isActivePlace && ' (địa điểm khác)'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            Đóng
          </button>
          {matches && matches.length > 0 && (
            <button
              onClick={handleReplace}
              disabled={isReplacing || !canReplace}
              title={canReplace ? undefined : 'Đang chạy đăng ký, vui lòng đợi xong'}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {isReplacing && <Loader2 size={14} className="animate-spin" />}
              Xoá bản cũ & đăng ký lại
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
