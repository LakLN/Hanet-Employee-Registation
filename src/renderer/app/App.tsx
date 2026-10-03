import { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Building2,
  FileSpreadsheet,
  FolderOpen,
  PlayCircle,
  XCircle,
  Download,
  FileDown,
  ScrollText,
  Settings,
  LucideIcon,
} from 'lucide-react';
import { EmployeeRecord } from '@shared/types';
import maxcomLogo from './assets/maxcom-logo.svg';
import { friendlyErrorMessage } from './utils/friendlyError';
import { useToast } from './hooks/useToast';
import { useBulkSync } from './hooks/useBulkSync';
import { StatCard } from './components/StatCard';
import { DataGrid } from './components/DataGrid';
import { SyncResultsPanel } from './components/SyncResultsPanel';
import { DepartmentManager } from './components/DepartmentManager';
import { SettingsModal } from './components/SettingsModal';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { ActivePlaceSwitcher } from './components/ActivePlaceSwitcher';

type TabKey = 'bulk' | 'departments';

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('bulk');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPrivacyPolicyOpen, setIsPrivacyPolicyOpen] = useState(false);
  const [activePlaceId, setActivePlaceId] = useState('');
  // Tăng mỗi khi đóng Cài đặt để ActivePlaceSwitcher mount lại và tải danh sách địa điểm theo kết
  // nối vừa lưu — nếu không, phải khởi động lại app mới thấy dropdown địa điểm.
  const [placeSwitcherKey, setPlaceSwitcherKey] = useState(0);
  const [excelFile, setExcelFile] = useState<{ filePath: string; name: string } | null>(null);
  const [imageFolder, setImageFolder] = useState<{ folderPath: string; imageCount: number } | null>(null);
  const [records, setRecords] = useState<EmployeeRecord[]>([]);
  // Tăng mỗi khi thực sự có một bộ dữ liệu mới từ Excel/thư mục (không tăng khi chỉ bớt dần các
  // NV đã đăng ký xong) — DataGrid dùng giá trị này để biết khi nào cần xoá cache ảnh preview và
  // reset phân trang, thay vì làm việc đó mỗi lần records thay đổi (kể cả khi chỉ co lại 1 dòng).
  const [datasetVersion, setDatasetVersion] = useState(0);
  const [isReading, setIsReading] = useState(false);

  const { toast, notify, dismiss } = useToast();
  const {
    syncResults,
    syncProgress,
    currentProcessing,
    isSyncing,
    isLogOpen,
    setIsLogOpen,
    syncTally,
    removingIds,
    handleSync,
    handleRetryPerson,
    handleRetryFailed,
    handleCancel,
    handleExport,
    handleRemovePerson,
    handleRemoveAllSuccess,
  } = useBulkSync(records, setRecords, notify);

  // Đọc Excel và ghép ảnh do MAIN process làm (trong worker_thread): file vài nghìn dòng mất hàng
  // giây CPU, làm trong renderer sẽ đóng băng UI, và cũng không cần chuyển cả file qua IPC nữa.
  const parseData = async (excelPath: string, imageFolderPath: string | null) => {
    setIsReading(true);
    try {
      const parsed = await window.hanetImporter.parseExcel({ excelPath, imageFolderPath });
      setRecords(parsed);
      setDatasetVersion((v) => v + 1);
      if (parsed.length === 0) {
        notify('error', 'File Excel không có dòng dữ liệu nào bên dưới dòng tiêu đề (sheet đầu tiên).');
      }
    } catch (error) {
      notify('error', `Lỗi đọc Excel: ${friendlyErrorMessage(error)}`);
      setRecords([]);
    } finally {
      setIsReading(false);
    }
  };

  const handleSelectExcel = async () => {
    const result = await window.hanetImporter.selectExcel();
    if (!result) return;
    setExcelFile(result);
    if (imageFolder) await parseData(result.filePath, imageFolder.folderPath);
  };

  const handleSelectFolder = async () => {
    const result = await window.hanetImporter.selectFolder();
    if (!result) return;
    setImageFolder(result);
    if (excelFile) await parseData(excelFile.filePath, result.folderPath);
  };

  const handleDownloadTemplate = async () => {
    try {
      const savedPath = await window.hanetImporter.downloadExcelTemplate();
      if (savedPath) notify('success', `Đã lưu file mẫu tại: ${savedPath}`);
    } catch (error) {
      notify('error', `Lỗi tải file mẫu: ${friendlyErrorMessage(error)}`);
    }
  };

  const folderName = imageFolder ? imageFolder.folderPath.split(/[\\/]/).filter(Boolean).pop() : null;

  const validCount = useMemo(
    () => records.filter((r) => r.status === 'VALID' && !r.registeredStatus).length,
    [records],
  );
  const missingCount = useMemo(() => records.filter((r) => r.status === 'MISSING_IMAGE').length, [records]);
  const invalidCount = useMemo(
    () => records.filter((r) => r.status === 'INVALID' || r.registeredStatus === 'REGISTERED_IMAGE_INVALID').length,
    [records],
  );
  const duplicateCount = useMemo(() => records.filter((r) => r.duplicateId).length, [records]);
  // Thứ tự Mã NV trong Data Grid — cho SyncResultsPanel sắp lại nhật ký theo cùng thứ tự này để dễ
  // đối chiếu qua lại, thay vì thứ tự hoàn tất thực tế (phụ thuộc xử lý song song, không cố định).
  const gridOrder = useMemo(() => records.map((r) => r.employeeId), [records]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Logo nhúng vào bundle, không tải từ maxcom.com.vn: app dùng trong mạng nội bộ có thể
              không ra được internet, và một request ngoài chỉ để lấy logo là thứ CSP nên chặn. */}
          <img src={maxcomLogo} alt="Maxcom Logo" className="h-5 w-auto object-contain" />
          <div>
            <h1 className="font-semibold text-slate-800 leading-none">Hanet Employee Registration</h1>
            <p className="text-xs text-slate-400 mt-0.5">Đăng ký nhân viên lên hệ thống camera AI Hanet</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPrivacyPolicyOpen(true)}
            className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
          >
            Chính sách bảo mật dữ liệu
          </button>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            title="Cài đặt kết nối Hanet"
            className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <TabButton
              icon={Users}
              label="Thêm hàng loạt"
              active={activeTab === 'bulk'}
              onClick={() => setActiveTab('bulk')}
            />
            <TabButton
              icon={Building2}
              label="Phòng ban"
              active={activeTab === 'departments'}
              onClick={() => setActiveTab('departments')}
            />
          </div>
          <ActivePlaceSwitcher key={placeSwitcherKey} onPlaceChange={setActivePlaceId} />
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className={`flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 ${
              activeTab === 'bulk' ? '' : 'invisible'
            }`}
          >
            <FileDown size={14} />
            Tải file Excel mẫu
          </button>
        </div>

        {activeTab === 'bulk' ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <PickerCard
                icon={FileSpreadsheet}
                title="File Excel"
                subtitle={excelFile?.name ?? 'Chưa chọn file'}
                actionLabel={excelFile ? 'Đổi file' : 'Chọn file'}
                onClick={handleSelectExcel}
                tone="blue"
              />
              <PickerCard
                icon={FolderOpen}
                title="Thư mục ảnh"
                subtitle={imageFolder ? `${folderName} • ${imageFolder.imageCount} ảnh tìm thấy` : 'Chưa chọn thư mục'}
                actionLabel={imageFolder ? 'Đổi thư mục' : 'Chọn thư mục'}
                onClick={handleSelectFolder}
                tone="emerald"
              />
            </div>

            <div className="grid grid-cols-4 gap-3">
              <StatCard label="Tổng số" value={records.length} icon={Users} tone="slate" />
              <StatCard label="Hợp lệ" value={validCount} icon={Users} tone="emerald" />
              <StatCard label="Thiếu ảnh" value={missingCount} icon={Users} tone="amber" />
              <StatCard label="Không hợp lệ" value={invalidCount + duplicateCount} icon={Users} tone="rose" />
            </div>

            {records.some((r) => r.registeredStatus === 'REGISTERED_IMAGE_INVALID') && (
              <p className="text-xs text-rose-500 text-right mb-1">
                (*) Vui lòng đảm bảo ảnh rõ nét, chỉ có 1 người, hiển thị đầy đủ mắt, mũi và miệng, nhìn thẳng vào
                camera, không đội mũ và không đeo khẩu trang.
              </p>
            )}

            <DataGrid records={records} isLoading={isReading} resetKey={datasetVersion} />

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-4">
              <div className="text-sm text-slate-500">
                {isSyncing ? (
                  <span className="flex items-center gap-2">
                    <span>
                      Đang đăng ký {syncProgress.current}/{syncProgress.total}... <ElapsedTimer isSyncing={isSyncing} />
                    </span>
                    <span className="text-emerald-600 font-medium">{syncTally.success} OK</span>
                    {syncTally.duplicate > 0 && (
                      <span className="text-amber-600 font-medium">{syncTally.duplicate} đã tồn tại</span>
                    )}
                    <span className="text-rose-600 font-medium">{syncTally.failed} lỗi</span>
                  </span>
                ) : (
                  `${validCount} nhân viên sẵn sàng đăng ký`
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isSyncing && syncResults.length > 0 && !isLogOpen && (
                  <button
                    type="button"
                    onClick={() => setIsLogOpen(true)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 text-slate-600 font-medium px-4 py-2.5 hover:bg-slate-50 transition-colors"
                  >
                    <ScrollText size={16} />
                    Xem nhật ký
                  </button>
                )}
                {!isSyncing && records.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExport}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 text-slate-600 font-medium px-4 py-2.5 hover:bg-slate-50 transition-colors"
                  >
                    <Download size={16} />
                    Xuất Excel kết quả
                  </button>
                )}
                {isSyncing ? (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="flex items-center gap-2 rounded-xl bg-rose-600 text-white font-medium px-5 py-2.5 hover:bg-rose-700 transition-colors"
                  >
                    <XCircle size={18} />
                    Hủy
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={validCount === 0}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium px-5 py-2.5 hover:bg-blue-700 transition-colors"
                  >
                    <PlayCircle size={18} />
                    Đăng ký hàng loạt
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <DepartmentManager onNotify={notify} activePlaceId={activePlaceId} />
        )}
      </main>

      {toast && (
        <div
          onClick={dismiss}
          title="Bấm để đóng"
          className="fixed right-6 bottom-6 z-50 w-[380px] cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-900/10"
        >
          <div className={`flex items-start gap-3 ${toast.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>
            <div
              className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}
            />
            <div className="min-w-0">
              <div className="font-semibold text-sm">{toast.type === 'success' ? 'Thành công' : 'Lỗi'}</div>
              <div className="text-sm text-slate-600 mt-1 break-words select-text">{toast.message}</div>
            </div>
          </div>
        </div>
      )}
      <SyncResultsPanel
        open={isLogOpen}
        onClose={() => setIsLogOpen(false)}
        results={syncResults}
        progress={syncProgress}
        current={isSyncing ? currentProcessing : []}
        isSyncing={isSyncing}
        onRetryPerson={handleRetryPerson}
        onRetryFailed={handleRetryFailed}
        removingIds={removingIds}
        onRemovePerson={handleRemovePerson}
        onRemoveAllSuccess={handleRemoveAllSuccess}
        gridOrder={gridOrder}
      />
      {isSettingsOpen && (
        <SettingsModal
          onClose={() => {
            setIsSettingsOpen(false);
            setPlaceSwitcherKey((k) => k + 1);
          }}
        />
      )}
      {isPrivacyPolicyOpen && <PrivacyPolicyModal onClose={() => setIsPrivacyPolicyOpen(false)} />}
    </div>
  );
}

// Đếm giây tách riêng khỏi App để chỉ component này re-render mỗi giây, thay vì kéo theo toàn bộ
// cây (bảng dữ liệu, các số liệu tổng hợp...) re-render theo trong suốt quá trình đăng ký hàng loạt.
function ElapsedTimer({ isSyncing }: { isSyncing: boolean }) {
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!isSyncing) return;
    setElapsedSec(0);
    const timer = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isSyncing]);

  if (!isSyncing) return null;
  return <>({elapsedSec}s)</>;
}

function TabButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function PickerCard({
  icon: Icon,
  title,
  subtitle,
  actionLabel,
  onClick,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actionLabel: string;
  onClick: () => void;
  tone: 'blue' | 'emerald';
}) {
  const toneClass = tone === 'blue' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600';
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${toneClass}`}>
          <Icon size={18} />
        </div>
        <div>
          <div className="text-sm font-medium text-slate-800">{title}</div>
          <div className="text-xs text-slate-400 mt-0.5">{subtitle}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="text-sm font-medium text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50"
      >
        {actionLabel}
      </button>
    </div>
  );
}

export default App;
