import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react-swc';

// Alias dùng chung cho cả 3 target — trước đây mọi import xuyên tầng đều là '../../../shared/types',
// vừa khó đọc vừa vỡ hàng loạt mỗi lần di chuyển file.
const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@main': resolve(__dirname, 'src/main'),
  '@renderer': resolve(__dirname, 'src/renderer/app'),
};

export default defineConfig({
  // externalizeDepsPlugin giữ `dependencies` ở dạng require() từ node_modules thay vì bundle vào
  // main. Cần thiết cho jimp/exceljs (có dynamic require nội bộ) và cho worker_threads.
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      // Tắt sourcemap ở bản release: file .map đi kèm vào asar làm phình installer và phát tán
      // nguyên văn source. Dev vẫn có sourcemap qua chế độ `electron-vite dev`.
      sourcemap: false,
      minify: true,
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: { sourcemap: false, minify: true },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: { alias },
    build: {
      // electron-vite KHÔNG bật minify mặc định (khác với vite build thuần) — không set tường minh
      // thì bundle renderer ra ~1.5MB code chưa nén.
      minify: 'esbuild',
      sourcemap: false,
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
        output: {
          // Tách React ra chunk riêng: phần này gần như không đổi giữa các bản build nên tách ra
          // giúp chunk app nhỏ lại và parse nhanh hơn khi mở app.
          manualChunks: (id) => (id.includes('node_modules/react') ? 'react-vendor' : undefined),
        },
      },
    },
  },
});
