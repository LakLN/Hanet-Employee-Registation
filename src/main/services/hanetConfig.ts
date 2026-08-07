import { HanetConfig } from '../../shared/types';
import { getConfigProvider } from './configProvider';

// Nguồn thật của accessToken/placeId phụ thuộc HANET_CONFIG_MODE (xem configProvider/index.ts) —
// local (mặc định, công ty tự dùng) hoặc remote (khách tự cài, lấy qua token broker phía server).
export function getHanetConfig(): Promise<HanetConfig> {
  return getConfigProvider().getHanetConfig();
}
