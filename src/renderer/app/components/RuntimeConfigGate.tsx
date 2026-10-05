import { ReactNode, useEffect, useState } from 'react';
import { KeyRound, Link2 } from 'lucide-react';
import { HanetConnectionSettingsForm } from './HanetConnectionSettingsForm';
import { LicenseActivationForm } from './LicenseActivationForm';

type Step = 'loading' | 'license' | 'connect' | 'done';

/**
 * Chặn toàn bộ app cho tới khi máy đã kích hoạt license (xem runtimeConfig.ts ở main) — chỉ xảy ra
 * trên bản đã đóng gói và chưa cấu hình gì, hoặc bản dev chưa có .env. Gồm 2 bước tách riêng:
 * (1) kích hoạt license online, (2) kết nối tài khoản Hanet (bỏ qua được, vì sau đó vẫn mở lại được
 * từ nút Cài đặt ở header — xem SettingsModal).
 */
export function RuntimeConfigGate({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<Step>('loading');

  useEffect(() => {
    window.hanetImporter.getRuntimeConfigStatus().then((status) => setStep(status.needsConfig ? 'license' : 'done'));
  }, []);

  if (step === 'loading') return null;
  if (step === 'done') return <>{children}</>;

  const isLicenseStep = step === 'license';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
            {isLicenseStep ? <KeyRound size={18} /> : <Link2 size={18} />}
          </div>
          <div>
            <h2 className="font-semibold text-slate-800 leading-none">
              {isLicenseStep ? 'Kích hoạt license' : 'Kết nối tài khoản Hanet'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isLicenseStep ? 'Bước 1/2 — Nhập mã license được cấp' : 'Bước 2/2 — Nhập thông tin kết nối được cấp'}
            </p>
          </div>
        </div>

        {isLicenseStep ? (
          <LicenseActivationForm onActivated={() => setStep('connect')} />
        ) : (
          <>
            <HanetConnectionSettingsForm onConnected={() => setStep('done')} />
            <button
              type="button"
              onClick={() => setStep('done')}
              className="mt-4 text-xs text-slate-500 hover:underline"
            >
              Bỏ qua, cấu hình sau trong Cài đặt
            </button>
          </>
        )}
      </div>
    </div>
  );
}
