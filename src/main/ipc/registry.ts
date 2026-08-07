import { ipcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import type { ZodType } from 'zod';
import logger from '../logger';
import { IpcApi, IpcEventPayload } from '@shared/ipc';

export interface IpcHandlerDefinition<K extends keyof IpcApi> {
  schema: ZodType<IpcApi[K]['arg']>;
  handle: (arg: IpcApi[K]['arg'], event: IpcMainInvokeEvent) => Promise<IpcApi[K]['result']> | IpcApi[K]['result'];
}

/**
 * Bản đồ handler cho TOÀN BỘ channel trong IpcApi. Kiểu mapped type ở đây là mắt lưới quan trọng
 * nhất của lớp IPC: thêm channel vào hợp đồng mà quên viết handler ở main là lỗi typecheck ngay,
 * thay vì biểu hiện thành "bấm nút không có gì xảy ra" lúc chạy.
 */
export type IpcHandlerMap = { [K in keyof IpcApi]: IpcHandlerDefinition<K> };

// Chỉ dùng nội bộ trong vòng lặp đăng ký: khi đã lặp qua nhiều channel, TypeScript không thể giữ
// liên kết giữa key và kiểu arg/result tương ứng nữa. Ép kiểu một lần ở đây, ngay dưới lớp API đã
// được kiểu hoá đầy đủ bên trên.
type LooseHandler = {
  schema: ZodType<unknown>;
  handle: (arg: unknown, event: IpcMainInvokeEvent) => unknown;
};

export function registerIpcHandlers(handlers: IpcHandlerMap): void {
  for (const channel of Object.keys(handlers) as Array<keyof IpcApi>) {
    const definition = handlers[channel] as unknown as LooseHandler;

    ipcMain.handle(channel, async (event, rawArg: unknown) => {
      const parsed = definition.schema.safeParse(rawArg);
      if (!parsed.success) {
        logger.error(`[IPC] "${channel}" nhận dữ liệu không hợp lệ:`, parsed.error.issues);
        throw new Error('Dữ liệu gửi lên không hợp lệ. Vui lòng thử lại hoặc liên hệ bộ phận kỹ thuật.');
      }

      try {
        return await definition.handle(parsed.data, event);
      } catch (err: unknown) {
        // Log nguyên văn (kèm stack) ở main, còn renderer chỉ nhận thông báo đã được chuẩn hoá —
        // stack trace của main process không có ý nghĩa gì với người dùng nội bộ.
        logger.error(`[IPC] "${channel}" lỗi:`, err);
        throw err instanceof Error ? new Error(err.message) : new Error('Đã xảy ra lỗi không xác định.');
      }
    });
  }
}

/**
 * Gửi sự kiện tới renderer một cách an toàn. Người dùng có thể đóng cửa sổ giữa lúc lô đang chạy;
 * khi đó WebContents đã bị destroy và .send() sẽ ném lỗi — nếu để lỗi đó lọt ra, nó sẽ làm hỏng
 * chính tiến trình đang chạy (mất audit log của những người đã đăng ký thành công).
 */
export function createEventSender(sender: WebContents) {
  return function send<K extends keyof IpcEventPayload>(channel: K, payload: IpcEventPayload[K]): void {
    if (sender.isDestroyed()) return;
    try {
      sender.send(channel, payload);
    } catch (err) {
      logger.warn(`[IPC] Không gửi được sự kiện "${channel}" tới renderer:`, err);
    }
  };
}
