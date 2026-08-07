import axios from 'axios';
import { HanetConfig } from '../../../shared/types';
import { ConfigProvider } from './types';

/**
 * Dành cho khi app được phát hành ra ngoài công ty (khách tự cài) — client_id/secret/refresh_token
 * của tài khoản Hanet chung (Support@...) không thể nằm trên máy khách. Máy khách chỉ giữ một
 * ACTIVATION_KEY (cấp khi khách liên hệ công ty), và mọi lần cần accessToken đều hỏi qua server nội
 * bộ; server đó mới là nơi giữ client_secret/refresh_token thật và biết map activationKey -> placeId.
 *
 * CHƯA CÓ SERVER THẬT — implementation này chỉ định hình đúng interface (URL + activationKey ->
 * HanetConfig) để phần app không cần sửa gì khi server sẵn sàng, ngoài việc đổi HANET_CONFIG_MODE
 * sang "remote" và điền HANET_BROKER_URL/ACTIVATION_KEY.
 */
export class RemoteConfigProvider implements ConfigProvider {
  constructor(
    private readonly brokerUrl: string,
    private readonly activationKey: string,
  ) {}

  async getHanetConfig(): Promise<HanetConfig> {
    const response = await axios.post<{ accessToken: string; placeId: string }>(
      `${this.brokerUrl.replace(/\/+$/, '')}/hanet-config`,
      { activationKey: this.activationKey },
      { timeout: 15000 },
    );
    return { accessToken: response.data.accessToken, placeId: response.data.placeId };
  }
}
