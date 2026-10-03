import { HanetPlace } from '@shared/types';
import { useEffect, useState } from 'react';
import { PlaceDropdown } from './PlaceDropdown';
import { friendlyErrorMessage } from '../utils/friendlyError';

/**
 * Dropdown đổi Place ID nhanh, đặt ngay hàng với tab chính — đổi giá trị là lưu xuống máy ngay
 * (dùng cho lần đăng ký kế tiếp), không cần mở màn Cài đặt. placeId lưu tách hẳn khỏi license/OAuth
 * creds (xem saveActivePlaceId ở main/services/runtimeConfig.ts) — Settings không còn liên quan gì
 * tới place nữa. Chỉ hiện khi máy đã kết nối tài khoản Hanet và có ít nhất 1 place; nếu chưa kết
 * nối, đây không phải chỗ để bắt đăng nhập (đã có RuntimeConfigGate lo việc đó), nên ẩn hẳn cho gọn.
 */
export function ActivePlaceSwitcher({ onPlaceChange }: { onPlaceChange?: (placeId: string) => void } = {}) {
  const [places, setPlaces] = useState<HanetPlace[]>([]);
  const [placeId, setPlaceId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    window.hanetImporter.getRuntimeConfigStatus().then((status) => {
      if (!status.isConnected) return;
      const currentPlaceId = status.current?.activePlaceId || '';
      setPlaceId(currentPlaceId);
      if (currentPlaceId) onPlaceChange?.(currentPlaceId);
      window.hanetImporter
        .listSavedPlaces()
        .then((result) => {
          setPlaces(result.places);
          const firstPlace = result.places[0];
          if (firstPlace && !status.current?.activePlaceId) {
            setPlaceId(firstPlace.placeID);
            onPlaceChange?.(firstPlace.placeID);
            void window.hanetImporter.saveActivePlaceId(firstPlace.placeID);
          }
        })
        .catch((err) => {
          // Không chặn UI chính, nhưng phải hiện ra: nếu im lặng, khách không biết vì sao không có
          // dropdown địa điểm (token hết hạn, mất mạng...).
          setLoadError(friendlyErrorMessage(err));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (newPlaceId: string) => {
    setPlaceId(newPlaceId);
    onPlaceChange?.(newPlaceId);
    window.hanetImporter
      .saveActivePlaceId(newPlaceId)
      .catch((err) => setLoadError(`Không lưu được địa điểm đã chọn: ${friendlyErrorMessage(err)}`));
  };

  if (loadError && places.length === 0) {
    return (
      <p className="max-w-xs text-xs text-rose-600 break-words" title={loadError}>
        Không tải được danh sách địa điểm: {loadError}
      </p>
    );
  }
  if (places.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 w-65">
      {/* <MapPin size={14} className="text-slate-400 shrink-0" /> */}
      <PlaceDropdown places={places} value={placeId} onChange={handleChange} />
    </div>
  );
}
