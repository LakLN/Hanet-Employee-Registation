import logger from '../../logger';
import { LocalConfigProvider } from './localConfigProvider';
import { RemoteConfigProvider } from './remoteConfigProvider';
import { ConfigProvider } from './types';

export type { ConfigProvider } from './types';

let cached: ConfigProvider | null = null;

// HANET_CONFIG_MODE mặc định "local" -> hành vi hiện tại (chỉ công ty tự dùng) không đổi gì. Chuyển
// sang "remote" là bước cần làm khi app được phát hành cho khách tự cài (xem remoteConfigProvider.ts).
export function getConfigProvider(): ConfigProvider {
  if (cached) return cached;

  const mode = process.env.HANET_CONFIG_MODE ?? 'local';

  if (mode === 'remote') {
    const brokerUrl = process.env.HANET_BROKER_URL;
    const activationKey = process.env.ACTIVATION_KEY;
    if (!brokerUrl || !activationKey) {
      throw new Error('HANET_CONFIG_MODE=remote nhưng thiếu HANET_BROKER_URL hoặc ACTIVATION_KEY trong .env');
    }
    logger.info(`[ConfigProvider] Dùng RemoteConfigProvider tại ${brokerUrl}`);
    cached = new RemoteConfigProvider(brokerUrl, activationKey);
  } else {
    cached = new LocalConfigProvider();
  }

  return cached;
}
