import axios from 'axios';
import logger from '../logger';
import { HanetPlace } from '../../shared/types';

// POST /place/getPlaces: lấy danh sách địa điểm (place) của account đã cấp accessToken — chỉ trả
// place do chính user tạo, không trả place được người khác chia sẻ. Dùng ở màn hình Kích hoạt để
// chọn placeID từ danh sách thật thay vì tự gõ tay (dễ nhầm với place khác của cùng account).
function placesUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/place/getPlaces`;
}

interface RawPlace {
  id: number;
  name: string;
  address?: string;
  userID?: number;
}

interface RawPlacesResponse {
  returnCode?: number;
  returnMessage?: string;
  data?: RawPlace[];
}

export async function listPlaces(baseUrl: string, accessToken: string): Promise<HanetPlace[]> {
  const body = new URLSearchParams({ token: accessToken });

  const response = await axios.post<RawPlacesResponse>(placesUrl(baseUrl), body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });

  const data = response.data;
  if (data?.returnCode !== 1 || !Array.isArray(data.data)) {
    logger.warn('[HanetPlaces] Phản hồi không hợp lệ:', data);
    throw new Error(data?.returnMessage || 'Không lấy được danh sách địa điểm (place) từ Hanet.');
  }

  return data.data.map((place) => ({
    placeID: String(place.id),
    name: place.name || '(Không có tên)',
  }));
}
