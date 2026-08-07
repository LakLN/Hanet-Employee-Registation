import { Dispatch, SetStateAction, useEffect, useMemo, useState } from 'react';
import { EmployeeRecord, SyncResultItem } from '@shared/types';
import {
  HANET_DUPLICATE_ALIAS_CODE,
  HANET_DUPLICATE_FACE_CODE,
  HANET_INVALID_IMAGE_CODE,
  resolveStatusMeta,
} from '@shared/hanetStatus';
import { friendlyErrorMessage } from '../utils/friendlyError';
import { ToastType } from './useToast';

type CurrentProcessingItem = { employeeId: string; name: string };
type Notify = (type: ToastType, message: string) => void;

export function useBulkSync(
  records: EmployeeRecord[],
  setRecords: Dispatch<SetStateAction<EmployeeRecord[]>>,
  notify: Notify,
) {
  const [syncResults, setSyncResults] = useState<SyncResultItem[]>([]);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [currentProcessing, setCurrentProcessing] = useState<CurrentProcessingItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribeResult = window.hanetImporter.onSyncResult((item: SyncResultItem) => {
      // Chạy lại cùng một mã NV (bấm "Đăng ký hàng loạt" nhiều lần cho tới khi hết lỗi) thì cập
      // nhật đè lên kết quả cũ thay vì cộng dồn thêm dòng mới — tránh danh sách phình to và đếm
      // sai số lỗi qua nhiều lần thử.
      setSyncResults((prev) => {
        const index = prev.findIndex((existing) => existing.employeeId === item.employeeId);
        if (index === -1) return [...prev, item];
        const next = prev.slice();
        next[index] = item;
        return next;
      });

      // Đã đăng ký thành công (hoặc đã tồn tại sẵn trên Hanet) -> đánh dấu registeredStatus thay vì
      // xoá khỏi Data Grid: người dùng cần thấy lại dòng này để đối chiếu ảnh/thông tin (lỡ chọn
      // nhầm ảnh thì vẫn còn dòng để sửa và đăng ký lại), chỉ không còn được tính vào "sẵn sàng
      // đăng ký" nữa (xem handleSync bên dưới).
      // Trùng FaceID (-9007, ảnh khớp với person đã có) và trùng Mã NV (-9005, aliasID trùng) là
      // hai nguyên nhân khác hẳn nhau — báo riêng để người dùng biết hướng xử lý đúng.
      const tone = resolveStatusMeta(item.returnCode, item.message).tone;
      if (tone !== 'error') {
        const registeredStatus =
          item.returnCode === HANET_DUPLICATE_FACE_CODE
            ? 'ALREADY_EXISTS_FACE'
            : item.returnCode === HANET_DUPLICATE_ALIAS_CODE
              ? 'ALREADY_EXISTS_ALIAS'
              : 'REGISTERED';
        setRecords((prev) =>
          prev.map((r) =>
            r.employeeId === item.employeeId ? { ...r, registeredStatus, registeredNote: item.message } : r,
          ),
        );
      } else if (item.returnCode === HANET_INVALID_IMAGE_CODE) {
        // Nếu Hanet trả lỗi ảnh không hợp, lưu trạng thái và một ghi chú bằng tiếng Việt
        const vnNote =
          'Ảnh không hợp lệ. Vui lòng đảm bảo ảnh rõ nét, chỉ có 1 người, hiển thị đầy đủ mắt, mũi và miệng, nhìn thẳng vào camera, không đội mũ và không đeo khẩu trang.';
        setRecords((prev) =>
          prev.map((r) =>
            r.employeeId === item.employeeId
              ? { ...r, registeredStatus: 'REGISTERED_IMAGE_INVALID', registeredNote: vnNote }
              : r,
          ),
        );
      }
    });
    const unsubscribeProgress = window.hanetImporter.onSyncProgress((progress) => setSyncProgress(progress));
    const unsubscribeCurrent = window.hanetImporter.onSyncCurrent((info) => setCurrentProcessing(info));
    return () => {
      unsubscribeResult?.();
      unsubscribeProgress?.();
      unsubscribeCurrent?.();
    };
  }, [setRecords]);

  const runBulkSync = async (recordsToSync: EmployeeRecord[]) => {
    if (recordsToSync.length === 0) {
      notify('error', 'Không có bản ghi hợp lệ để đăng ký.');
      return;
    }
    // Luôn cộng dồn vào syncResults hiện có: record đã đăng ký thành công/đã bị filter khỏi Data
    // Grid rồi, nên "Đăng ký hàng loạt" chỉ còn gửi đúng người chưa xong/lỗi/chưa xử lý — bấm lại
    // nhiều lần cho tới khi hết lỗi giờ là cách duy nhất để thử lại, không cần nút riêng nữa.
    setSyncProgress({ current: 0, total: recordsToSync.length });
    setCurrentProcessing([]);
    setIsSyncing(true);
    setIsLogOpen(true);

    try {
      const summary = await window.hanetImporter.bulkRegisterPersons(recordsToSync);
      const parts = [`${summary.success} thành công`];
      if (summary.duplicate > 0) parts.push(`${summary.duplicate} đã tồn tại`);
      if (summary.failed > 0) parts.push(`${summary.failed} thất bại`);
      if (summary.cancelledCount > 0) parts.push(`${summary.cancelledCount} chưa xử lý`);

      if (summary.quotaExceeded) {
        notify(
          'error',
          `Đã dừng sớm: hệ thống Hanet báo đã hết giới hạn khuôn mặt của gói tại địa điểm này. Vui lòng liên hệ Hanet để tăng dung lượng trước khi đăng ký thêm. (${parts.join(', ')})`,
        );
      } else {
        notify(summary.failed > 0 ? 'error' : 'success', `Hoàn tất: ${parts.join(', ')}.`);
      }
    } catch (error) {
      notify('error', `Lỗi đăng ký: ${friendlyErrorMessage(error)}`);
    } finally {
      setIsSyncing(false);
      setCurrentProcessing([]);
    }
  };

  const handleSync = () => {
    const validRecords = records.filter((item) => item.status === 'VALID' && !item.registeredStatus);
    runBulkSync(validRecords);
  };

  const handleCancel = async () => {
    const confirmed = window.confirm('Bạn có chắc muốn hủy? Các nhân viên chưa được xử lý sẽ không được đăng ký.');
    if (!confirmed) return;
    await window.hanetImporter.cancelBulkRegister();
  };

  const handleExport = async () => {
    if (records.length === 0) {
      notify('error', 'Chưa có dữ liệu để xuất.');
      return;
    }
    try {
      // Xuất TOÀN BỘ Data Grid, không chỉ những người đã đăng ký — giữ đúng bộ cột như file import
      // để có thể chỉnh sửa (vd. ai thiếu ảnh) rồi import lại.
      const filePath = await window.hanetImporter.exportSyncResults({ records, syncResults });
      if (filePath) notify('success', `Đã xuất file: ${filePath}`);
    } catch (error) {
      notify('error', `Lỗi xuất Excel: ${friendlyErrorMessage(error)}`);
    }
  };

  const handleRemovePerson = async (item: SyncResultItem) => {
    if (!item.personID) return;
    const confirmed = window.confirm(
      `Xoá "${item.name}" (${item.employeeId}) khỏi hệ thống Hanet? Hành động này không thể hoàn tác.`,
    );
    if (!confirmed) return;

    setRemovingIds((prev) => new Set(prev).add(item.employeeId));
    try {
      const result = await window.hanetImporter.removePerson({ personID: item.personID });
      if (result.success) {
        setSyncResults((prev) => prev.filter((r) => r.employeeId !== item.employeeId));
        // Đã xoá khỏi Hanet -> gỡ luôn registeredStatus trên Data Grid, để dòng này được tính lại
        // vào "sẵn sàng đăng ký" và có thể gửi lại nếu cần (khớp thực tế: không còn trên Hanet nữa).
        setRecords((prev) =>
          prev.map((r) =>
            r.employeeId === item.employeeId ? { ...r, registeredStatus: undefined, registeredNote: undefined } : r,
          ),
        );
        notify('success', `Đã xoá "${item.name}" khỏi Hanet.`);
      } else {
        notify('error', `Không xoá được "${item.name}": ${result.message}`);
      }
    } catch (error) {
      notify('error', `Lỗi khi xoá: ${friendlyErrorMessage(error)}`);
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.employeeId);
        return next;
      });
    }
  };

  const handleRemoveAllSuccess = async () => {
    const successItems = syncResults.filter(
      (item) => item.personID && resolveStatusMeta(item.returnCode, item.message).tone === 'success',
    );
    if (successItems.length === 0) return;

    const confirmed = window.confirm(
      `Xoá toàn bộ ${successItems.length} nhân viên đã đăng ký thành công khỏi hệ thống Hanet? Hành động này không thể hoàn tác.`,
    );
    if (!confirmed) return;

    setRemovingIds((prev) => {
      const next = new Set(prev);
      successItems.forEach((item) => next.add(item.employeeId));
      return next;
    });

    let removedCount = 0;
    let failedCount = 0;
    // Xoá tuần tự từng người (không song song): giữ đúng cách phản hồi từng lỗi riêng lẻ như
    // handleRemovePerson, và tránh dội cùng lúc nhiều request xoá lên Hanet.
    for (const item of successItems) {
      try {
        const result = await window.hanetImporter.removePerson({ personID: item.personID! });
        if (result.success) {
          removedCount += 1;
          setSyncResults((prev) => prev.filter((r) => r.employeeId !== item.employeeId));
          setRecords((prev) =>
            prev.map((r) =>
              r.employeeId === item.employeeId ? { ...r, registeredStatus: undefined, registeredNote: undefined } : r,
            ),
          );
        } else {
          failedCount += 1;
        }
      } catch {
        failedCount += 1;
      } finally {
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.employeeId);
          return next;
        });
      }
    }

    if (failedCount === 0) {
      notify('success', `Đã xoá ${removedCount} nhân viên khỏi Hanet.`);
    } else {
      notify('error', `Đã xoá ${removedCount} nhân viên, ${failedCount} nhân viên xoá thất bại.`);
    }
  };

  const syncTally = useMemo(
    () =>
      syncResults.reduce(
        (acc, item) => {
          const tone = resolveStatusMeta(item.returnCode, item.message).tone;
          if (tone === 'success') acc.success += 1;
          else if (tone === 'warning') acc.duplicate += 1;
          else acc.failed += 1;
          return acc;
        },
        { success: 0, duplicate: 0, failed: 0 },
      ),
    [syncResults],
  );

  return {
    syncResults,
    syncProgress,
    currentProcessing,
    isSyncing,
    isLogOpen,
    setIsLogOpen,
    syncTally,
    removingIds,
    handleSync,
    handleCancel,
    handleExport,
    handleRemovePerson,
    handleRemoveAllSuccess,
  };
}
