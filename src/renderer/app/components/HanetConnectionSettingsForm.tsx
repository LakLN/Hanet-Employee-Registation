import { CheckCircle2, Loader2 } from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { friendlyErrorMessage } from '../utils/friendlyError';
import { ServerUrlCombobox } from './ServerUrlCombobox';

const DEFAULT_API_BASE_URL = 'https://partner.hanet.ai';

function secretPlaceholder(length: number): string {
  return '•'.repeat(length);
}

/**
 * Form cấu hình kết nối Hanet + license, dùng chung ở 2 nơi: màn hình chặn lần đầu
 * (RuntimeConfigGate) và modal Cài đặt mở lại từ header (SettingsModal). Nút "Kết nối tài khoản
 * Hanet" mở popup đăng nhập OAuth thật ở main process (xem hanetOAuthWindow.ts) — sau khi kết nối
 * xong, apiBaseUrl/clientId/clientSecret tự lưu luôn, không có nút Lưu riêng.
 *
 * Place ID KHÔNG nằm ở đây — chọn/đổi place là việc của ActivePlaceSwitcher ở header, độc lập với
 * kết nối tài khoản. License chỉ nhập/xác thực được MỘT LẦN — sau khi lưu, ô license khoá vĩnh viễn,
 * không có luồng đổi lại trong app.
 */
export function HanetConnectionSettingsForm({ onSaved }: { onSaved: () => void }) {
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [savedApiBaseUrls, setSavedApiBaseUrls] = useState<string[]>([]);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [savedSecretPlaceholder, setSavedSecretPlaceholder] = useState('');

  const [licenseKey, setLicenseKey] = useState('');
  const [isLicenseActivated, setIsLicenseActivated] = useState(false);
  const [isActivatingLicense, setIsActivatingLicense] = useState(false);
  const [licenseError, setLicenseError] = useState<string | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Kết nối nhập tay (không OAuth): dùng khi tài khoản chỉ được chia sẻ hoặc server Hanet đặt cục bộ.
  // Hai cách kết nối ngang hàng: đăng nhập OAuth (cần Internet tới oauth.hanet.com) hoặc dán token
  // thủ công (dùng cho máy không có Internet / server Hanet nội bộ) — chọn trực tiếp, không giấu sau
  // một đường link "không đăng nhập được".
  const [connectMode, setConnectMode] = useState<'oauth' | 'manual'>('oauth');
  const [manualToken, setManualToken] = useState('');
  const [manualPlaceId, setManualPlaceId] = useState('');
  const [usesManualToken, setUsesManualToken] = useState(false);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  useEffect(() => {
    window.hanetImporter.getRuntimeConfigStatus().then((status) => {
      if (status.current) {
        setApiBaseUrl(status.current.apiBaseUrl || DEFAULT_API_BASE_URL);
        setSavedApiBaseUrls(status.current.savedApiBaseUrls);
        setClientId(status.current.clientId || '');
        if (status.current.clientSecretLength > 0) {
          const placeholder = secretPlaceholder(status.current.clientSecretLength);
          setSavedSecretPlaceholder(placeholder);
          setClientSecret(placeholder);
        }
        setManualPlaceId(status.current.activePlaceId || '');
        if (status.current.usesManualToken) {
          setUsesManualToken(true);
          setConnectMode('manual');
        }
        if (status.current.licenseKey) {
          setLicenseKey(status.current.licenseKey);
          setIsLicenseActivated(true);
        }
      }
      setIsConnected(status.isConnected);
      setConnectedEmail(status.connectedEmail);
    });
  }, []);

  const handleConnect = async () => {
    // Còn giữ nguyên placeholder (không sửa gì) -> gửi rỗng, main tự dùng lại secret đã lưu (xem
    // connectHanetAccount ở main/ipc/index.ts).
    const secretToSend = clientSecret === savedSecretPlaceholder ? '' : clientSecret;
    if (!apiBaseUrl.trim() || !clientId.trim() || (!secretToSend.trim() && !savedSecretPlaceholder)) {
      setConnectError('Vui lòng nhập đầy đủ Server API, Client ID và Client Secret.');
      return;
    }
    setIsConnecting(true);
    setConnectError(null);
    try {
      const result = await window.hanetImporter.connectHanetAccount({
        apiBaseUrl: apiBaseUrl.trim(),
        clientId: clientId.trim(),
        clientSecret: secretToSend.trim(),
      });
      setIsConnected(true);
      setConnectedEmail(result.email);
      const newPlaceholder = secretPlaceholder(secretToSend.trim() ? secretToSend.trim().length : clientSecret.length);
      setSavedSecretPlaceholder(newPlaceholder);
      setClientSecret(newPlaceholder);
      setSavedApiBaseUrls((prev) => (prev.includes(apiBaseUrl.trim()) ? prev : [...prev, apiBaseUrl.trim()]));
      if (result.places.length === 0) {
        setConnectError('Kết nối thành công nhưng tài khoản này chưa có địa điểm (place) nào.');
      }
    } catch (err) {
      setConnectError(friendlyErrorMessage(err));
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSaveManual = async () => {
    if (!apiBaseUrl.trim() || !manualToken.trim() || !manualPlaceId.trim()) {
      setManualError('Vui lòng nhập đủ Server API, Access Token và Place ID.');
      return;
    }
    setIsSavingManual(true);
    setManualError(null);
    try {
      await window.hanetImporter.connectWithToken({
        apiBaseUrl: apiBaseUrl.trim(),
        accessToken: manualToken.trim(),
        placeId: manualPlaceId.trim(),
      });
      setUsesManualToken(true);
      setIsConnected(true);
      setManualToken('');
      setSavedApiBaseUrls((prev) => (prev.includes(apiBaseUrl.trim()) ? prev : [...prev, apiBaseUrl.trim()]));
    } catch (err) {
      setManualError(friendlyErrorMessage(err));
    } finally {
      setIsSavingManual(false);
    }
  };

  const handleActivateLicense = async () => {
    if (!licenseKey.trim()) {
      setLicenseError('Vui lòng nhập mã license.');
      return;
    }
    setIsActivatingLicense(true);
    setLicenseError(null);
    try {
      await window.hanetImporter.activateLicense({ licenseKey: licenseKey.trim() });
      setIsLicenseActivated(true);
      onSaved();
    } catch (err) {
      setLicenseError(friendlyErrorMessage(err));
    } finally {
      setIsActivatingLicense(false);
    }
  };

  return (
    <div>
      {isConnected && (
        <div className="flex items-center justify-between gap-2 mb-5">
          <span className="flex items-center gap-2 text-sm text-slate-500">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            Đã kết nối
          </span>
          {connectedEmail && <span className="text-base font-semibold text-slate-800">{connectedEmail}</span>}
        </div>
      )}

      <label className="block text-sm font-medium text-slate-700 mb-1">Server API</label>
      <div className="mb-3">
        <ServerUrlCombobox
          value={apiBaseUrl}
          onChange={setApiBaseUrl}
          savedUrls={
            savedApiBaseUrls.includes(DEFAULT_API_BASE_URL)
              ? savedApiBaseUrls
              : [DEFAULT_API_BASE_URL, ...savedApiBaseUrls]
          }
          placeholder={DEFAULT_API_BASE_URL}
        />
      </div>

      <label className="block text-sm font-medium text-slate-700 mb-1">Cách kết nối</label>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 mb-3">
        <ModeButton active={connectMode === 'oauth'} onClick={() => setConnectMode('oauth')}>
          Đăng nhập tài khoản Hanet
        </ModeButton>
        <ModeButton active={connectMode === 'manual'} onClick={() => setConnectMode('manual')}>
          Nhập Access Token thủ công
        </ModeButton>
      </div>

      {connectMode === 'oauth' && (
        <>
          <p className="text-xs text-slate-400 mb-3">Cần Internet để mở trang đăng nhập Hanet.</p>
          <label className="block text-sm font-medium text-slate-700 mb-1">Client ID</label>
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <label className="block text-sm font-medium text-slate-700 mb-1">Client Secret</label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            type="button"
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium px-4 py-3 mb-3 hover:bg-blue-700 transition-colors"
          >
            {isConnecting && <Loader2 size={16} className="animate-spin" />}
            {isConnecting ? 'Đang kết nối...' : 'Kết nối tài khoản Hanet'}
          </button>

          {connectError && <p className="text-xs text-rose-600 mb-3">{connectError}</p>}
        </>
      )}

      {connectMode === 'manual' && (
        <div className="mb-3">
          <p className="text-xs text-slate-400 mb-3">
            Dùng khi máy không có Internet hoặc kết nối tới server Hanet nội bộ (nhập địa chỉ ở ô Server API).
          </p>
          {usesManualToken && (
            <p className="text-xs text-emerald-600 mb-2">Đang dùng token nhập thủ công (dùng Server API ở trên).</p>
          )}
          <label className="block text-sm font-medium text-slate-700 mb-1">Access Token</label>
          <input
            type="password"
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            placeholder={usesManualToken ? 'Đã lưu — nhập token mới để thay' : 'Dán Access Token'}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="block text-sm font-medium text-slate-700 mb-1">Place ID</label>
          <input
            value={manualPlaceId}
            onChange={(e) => setManualPlaceId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={handleSaveManual}
            disabled={isSavingManual}
            className="w-full rounded-xl bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium px-4 py-3 hover:bg-blue-700 transition-colors"
          >
            {isSavingManual ? 'Đang lưu...' : 'Lưu kết nối'}
          </button>
          {manualError && <p className="text-xs text-rose-600 mt-2">{manualError}</p>}
          <p className="text-xs text-slate-400 mt-2">Token có hạn: hết hạn thì dán lại token mới.</p>
        </div>
      )}

      <div className="border-t border-slate-100 pt-4 mt-5">
        <label className="block text-sm font-medium text-slate-700 mb-1">Mã license</label>
        <div className="flex items-center rounded-lg border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500 mb-1">
          <input
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            disabled={isLicenseActivated}
            className="w-full rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none"
            placeholder="Mã license được cấp"
          />
          {isLicenseActivated ? (
            <span className="flex items-center gap-1 pr-3 text-xs text-emerald-600 font-medium whitespace-nowrap">
              <CheckCircle2 size={14} /> Đã kích hoạt
            </span>
          ) : (
            <button
              type="button"
              onClick={handleActivateLicense}
              disabled={isActivatingLicense}
              className="rounded-r-lg bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium px-4 py-2 hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              {isActivatingLicense ? 'Đang xác thực...' : 'Xác thực'}
            </button>
          )}
        </div>
        {licenseError && <p className="text-xs text-rose-600">{licenseError}</p>}
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}
