import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { friendlyErrorMessage } from '../utils/friendlyError';

/**
 * Form kích hoạt license — bước đầu tiên của RuntimeConfigGate, tách riêng khỏi bước kết nối tài
 * khoản Hanet. Kích hoạt luôn qua mạng (Firebase, xem licenseActivation.ts ở main): mỗi mã chỉ
 * kích hoạt được một lần, sau đó không có luồng đổi lại trong app.
 */
export function LicenseActivationForm({ onActivated }: { onActivated: () => void }) {
  const [licenseKey, setLicenseKey] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      setError('Vui lòng nhập mã license.');
      return;
    }
    setIsActivating(true);
    setError(null);
    try {
      await window.hanetImporter.activateLicense({ licenseKey: licenseKey.trim() });
      onActivated();
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleActivate();
      }}
    >
      <label className="block text-sm font-medium text-slate-700 mb-1">Mã license</label>
      <input
        value={licenseKey}
        onChange={(e) => setLicenseKey(e.target.value)}
        disabled={isActivating}
        autoFocus
        placeholder="Mã license được cấp"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <button
        type="submit"
        disabled={isActivating}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium px-4 py-3 hover:bg-blue-700 transition-colors"
      >
        {isActivating && <Loader2 size={16} className="animate-spin" />}
        {isActivating ? 'Đang kích hoạt...' : 'Kích hoạt license'}
      </button>

      {error && <p className="text-xs text-rose-600 mt-3">{error}</p>}
      <p className="text-xs text-slate-400 mt-3">Cần kết nối mạng để kích hoạt. Mỗi mã chỉ kích hoạt được một lần.</p>
    </form>
  );
}
