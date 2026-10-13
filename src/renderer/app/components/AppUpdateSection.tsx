import { Download, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UpdateCheckResult } from '@shared/ipc';
import { friendlyErrorMessage } from '../utils/friendlyError';

/**
 * Mục "Cập nhật phần mềm" trong Cài đặt. App không tự kiểm tra bản mới khi mở — chỉ kiểm tra khi
 * người dùng bấm nút, và chỉ tải/cài khi họ đồng ý.
 */
export function AppUpdateSection() {
  const [currentVersion, setCurrentVersion] = useState('');
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.hanetImporter
      .getAppVersion()
      .then(setCurrentVersion)
      .catch(() => {});
  }, []);

  const handleCheck = async () => {
    setIsChecking(true);
    setError(null);
    setResult(null);
    try {
      setResult(await window.hanetImporter.checkForUpdate());
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setIsChecking(false);
    }
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    setError(null);
    try {
      await window.hanetImporter.installUpdate();
    } catch (err) {
      setError(friendlyErrorMessage(err));
      setIsInstalling(false);
    }
  };

  const busy = isChecking || isInstalling;

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-slate-700">Cập nhật phần mềm</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {currentVersion ? `Phiên bản hiện tại: ${currentVersion}` : 'Phiên bản hiện tại'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleCheck()}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {isChecking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {isChecking ? 'Đang kiểm tra...' : 'Kiểm tra cập nhật'}
        </button>
      </div>

      {result?.status === 'up-to-date' && (
        <p className="text-xs text-emerald-600 mt-3">Bạn đang dùng phiên bản mới nhất.</p>
      )}
      {result?.status === 'unavailable' && (
        <p className="text-xs text-slate-500 mt-3">Bản đang chạy không hỗ trợ cập nhật tự động.</p>
      )}
      {result?.status === 'available' && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-700">Đã có bản mới: {result.latestVersion}</p>
          <button
            type="button"
            onClick={() => void handleInstall()}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400"
          >
            {isInstalling ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {isInstalling ? 'Đang tải...' : 'Tải về và cài đặt'}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-rose-600 mt-3">{error}</p>}
    </div>
  );
}
