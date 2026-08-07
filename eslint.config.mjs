import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

const commonRules = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
};

export default tseslint.config(
  { ignores: ['out', 'dist', 'release', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // main process + preload (Node/Electron) + code dùng chung + config chạy bằng Node
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      'src/shared/**/*.ts',
      'tests/main/**/*.ts',
      'tests/shared/**/*.ts',
      '*.config.ts',
      'electron.vite.config.ts',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: commonRules,
  },
  {
    // renderer (React chạy trong Chromium)
    files: ['src/renderer/app/**/*.{ts,tsx}', 'tests/renderer/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Chỉ bật 2 rule kinh điển, đồng thuận rộng rãi (bắt gọi hook sai chỗ / thiếu dependency).
      // eslint-plugin-react-hooks v7 "recommended" kèm cả loạt rule mới hướng tới React Compiler
      // (set-state-in-effect, purity, immutability...) — khá gắt và sẽ đòi refactor kiến trúc
      // component ngoài phạm vi việc thêm lint/CI hôm nay, nên không bật.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      ...commonRules,
    },
  },
  {
    // Config chạy bằng Node thuần (CommonJS), không qua bundler — cũng áp dụng cho scripts/ (công
    // cụ nội bộ chạy tay bằng `node`, không đóng gói vào app, xem package.json build.files).
    files: ['*.config.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettierConfig,
);
