import { HanetConfig } from '../../../shared/types';
import { getAccessToken } from '../hanetOAuth';
import { getRuntimeConfig } from '../runtimeConfig';
import { ConfigProvider } from './types';

// Toàn bộ hành vi hiện tại (client_id/secret/refresh_token trong .env, placeId từ .env hoặc màn
// hình cấu hình lần đầu) — dùng khi app chạy trong nội bộ công ty, máy tự giữ credential.
export class LocalConfigProvider implements ConfigProvider {
  async getHanetConfig(): Promise<HanetConfig> {
    const accessToken = await getAccessToken();
    return {
      accessToken,
      placeId: getRuntimeConfig()?.activePlaceId ?? '',
    };
  }
}
