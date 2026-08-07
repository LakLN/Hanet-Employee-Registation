/// <reference types="vite/client" />

import { HanetImporterBridge } from '@shared/ipc';

declare global {
  interface Window {
    // Kiểu được SUY RA từ hợp đồng dùng chung, không khai báo lại — preload và renderer không thể
    // lệch nhau nữa (trước đây đây là bản sao thứ ba của danh sách API, chép tay).
    hanetImporter: HanetImporterBridge;
  }
}

export {};
