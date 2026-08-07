import { ReactNode, useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { HanetConnectionSettingsForm } from './HanetConnectionSettingsForm';

/**
 * Chặn toàn bộ app cho tới khi máy có PLACE_ID + LICENSE_KEY (xem runtimeConfig.ts ở main) — chỉ xảy
 * ra trên bản đã đóng gói và chưa cấu hình gì, hoặc bản dev chưa có .env. Sau lần đầu, cấu hình này
 * có thể mở lại từ nút Cài đặt ở header (xem SettingsModal) — cùng dùng HanetConnectionSettingsForm.
 */
export function RuntimeConfigGate({ children }: { children: ReactNode }) {
  const [needsConfig, setNeedsConfig] = useState<boolean | null>(null);

  useEffect(() => {
    window.hanetImporter.getRuntimeConfigStatus().then((status) => setNeedsConfig(status.needsConfig));
  }, []);

  if (needsConfig === null) return null;
  if (!needsConfig) return <>{children}</>;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
            <KeyRound size={18} />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 leading-none">Kích hoạt & Kết nối tài khoản Hanet</h2>
            <p className="text-xs text-slate-400 mt-0.5">Nhập thông tin được cấp để bắt đầu sử dụng</p>
          </div>
        </div>

        <HanetConnectionSettingsForm onSaved={() => setNeedsConfig(false)} />
      </div>
    </div>
  );
}
