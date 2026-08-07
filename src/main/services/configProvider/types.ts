import { HanetConfig } from '../../../shared/types';

/**
 * Nguồn cấp accessToken + placeId cho mọi lời gọi Hanet. Hiện chỉ có LocalConfigProvider (đọc từ
 * .env/runtimeConfig, chạy hoàn toàn trên máy). Khi công ty triển khai token broker phía server (để
 * client_secret/refresh_token của tài khoản Hanet chung không nằm trên máy khách khi phát hành ra
 * ngoài công ty), chỉ cần thêm RemoteConfigProvider cùng implement interface này — mọi nơi gọi
 * getHanetConfig() ở usecases/ipc không phải sửa gì.
 */
export interface ConfigProvider {
  getHanetConfig(): Promise<HanetConfig>;
}
