import { Settings, X } from 'lucide-react';
import { HanetConnectionSettingsForm } from './HanetConnectionSettingsForm';

/**
 * Overlay mở từ nút Cài đặt ở header — cho sửa lại kết nối Hanet bất cứ lúc nào, không chỉ
 * lần đầu như RuntimeConfigGate. Đóng bằng nút X hoặc bấm ra ngoài, không mất dữ liệu (Excel/ảnh)
 * đang có trong App vì overlay nằm trên, không unmount phần nội dung chính.
 */
export function SettingsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
              <Settings size={18} />
            </div>
            <h2 className="font-semibold text-slate-800 leading-none">Cài đặt kết nối</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50"
          >
            <X size={18} />
          </button>
        </div>

        <HanetConnectionSettingsForm />
      </div>
    </div>
  );
}
