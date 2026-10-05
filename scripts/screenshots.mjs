// Chụp nhanh các màn hình kích hoạt license / kết nối Hanet để cập nhật tài liệu hướng dẫn.
//
// Chạy renderer đã build (out/renderer) trong Chromium qua playwright-core, với window.hanetImporter
// được giả lập (không cần Electron, không gọi mạng thật, không đụng userData của máy).
//
//   npm run screenshots          (luôn build lại renderer trước khi chụp)
//
// Ảnh ra thư mục scripts/screenshots/. Đặt CHROME_PATH nếu Chromium không nằm ở %LOCALAPPDATA%\ms-playwright.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '..');
const rendererDir = path.join(root, 'out', 'renderer');
const outDir = path.join(import.meta.dirname, 'screenshots');

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => d.startsWith('chromium-')).sort().reverse() : [];
  for (const d of dirs) {
    const exe = path.join(base, d, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(exe)) return exe;
  }
  throw new Error('Không tìm thấy Chromium. Đặt biến CHROME_PATH trỏ tới chrome.exe.');
}

function serve(dir) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const file = path.join(dir, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(dir) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Giả lập bridge của preload. Trạng thái nằm trong window.__e2e để từng kịch bản chỉnh được.
function installBridgeStub() {
  const state = { licensed: false, connected: false, activateError: null };
  window.__e2e = state;
  const status = () => ({
    needsConfig: !state.licensed,
    isConnected: state.connected,
    connectedEmail: state.connected ? 'nhanvien@pvep.com.vn' : null,
    current: state.licensed
      ? { licenseKey: 'ABCDE-FGHJK-LMNPQ-RSTUV', apiBaseUrl: 'https://partner.hanet.ai', clientSecretLength: 0, savedApiBaseUrls: [], usesManualToken: false }
      : null,
  });
  const none = () => () => () => {};
  window.hanetImporter = new Proxy(
    {
      getRuntimeConfigStatus: async () => status(),
      activateLicense: async () => {
        await new Promise((r) => setTimeout(r, 150));
        if (state.activateError) throw new Error(state.activateError);
        state.licensed = true;
      },
      connectWithToken: async () => {
        state.connected = true;
      },
      connectHanetAccount: async () => {
        state.connected = true;
        return { places: [{ placeID: '1', name: 'PVEP Cửu Long' }], email: 'nhanvien@pvep.com.vn' };
      },
      listSavedPlaces: async () => ({ places: [{ placeID: '1', name: 'PVEP Cửu Long' }] }),
      onSyncProgress: none(),
      onSyncCurrent: none(),
      onSyncResult: none(),
    },
    { get: (target, prop) => (prop in target ? target[prop] : async () => undefined) },
  );
}

async function main() {
  console.log('Đang build renderer...');
  execSync('npx electron-vite build', { cwd: root, stdio: 'inherit' });
  fs.mkdirSync(outDir, { recursive: true });

  const server = await serve(rendererDir);
  const url = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await chromium.launch({ executablePath: findChrome() });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 2 })).newPage();
  await page.addInitScript(installBridgeStub);

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const card = page.locator('div.max-w-xl').first();
  const shot = async (name, target = card) => {
    await target.screenshot({ path: path.join(outDir, `${name}.png`) });
    console.log(`  ✓ ${name}.png`);
  };
  const settle = () => page.waitForTimeout(350);
  // Khoanh đỏ các ô cần điền, giống ảnh trong tài liệu hướng dẫn.
  const circle = (...locators) =>
    Promise.all(
      locators.map((l) => l.evaluate((el) => {
        el.style.outline = '3px solid #e11d48';
        el.style.outlineOffset = '3px';
        el.style.borderRadius = '10px';
      })),
    );
  const expectText = async (text) => page.getByText(text, { exact: false }).first().waitFor({ timeout: 5000 });

  await page.goto(url);

  // 1. Bước 1/2 — kích hoạt license
  await expectText('Bước 1/2');
  await circle(page.getByPlaceholder('Mã license được cấp'), page.getByRole('button', { name: 'Kích hoạt license' }));
  await settle();
  await shot('01-kich-hoat-license');

  // 2. Mã đã dùng (không nằm trong tài liệu, chụp để kiểm tra thông báo lỗi)
  await page.evaluate(() => (window.__e2e.activateError = 'Mã license này đã được kích hoạt trước đó và không thể dùng lại trên máy khác.'));
  await page.getByPlaceholder('Mã license được cấp').fill('ABCDE-FGHJK-LMNPQ-RSTUV');
  await page.getByRole('button', { name: 'Kích hoạt license' }).click();
  await expectText('đã được kích hoạt trước đó');
  await shot('02-license-loi');

  // 3. Kích hoạt thành công -> Bước 2/2
  await page.evaluate(() => (window.__e2e.activateError = null));
  await page.getByRole('button', { name: 'Kích hoạt license' }).click();
  await expectText('Bước 2/2');
  await shot('03-ket-noi-hanet');

  // 4. Nhập Access Token thủ công
  await page.getByRole('button', { name: 'Nhập Access Token thủ công' }).click();
  await page.getByPlaceholder('Dán Access Token').fill('eyJhbGciOiJIUzI1NiJ9.demo.token');
  await page.locator('input').nth(1).waitFor();
  const inputs = page.locator('input');
  await inputs.nth(2).fill('1');
  await circle(
    page.getByRole('button', { name: 'Nhập Access Token thủ công' }),
    page.getByPlaceholder('Dán Access Token'),
    inputs.nth(2),
    page.getByRole('button', { name: 'Lưu kết nối' }),
  );
  await settle();
  await shot('04-ket-noi-thu-cong');

  // 5. Lưu kết nối -> vào màn hình chính
  await page.getByRole('button', { name: 'Lưu kết nối' }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Bước 2/2'), null, { timeout: 5000 });
  await page.waitForTimeout(500);
  await shot('05-man-hinh-chinh', page);

  await browser.close();
  server.close();

  if (errors.length) {
    console.error(['Lỗi JS trong trang:', ...errors].join(String.fromCharCode(10)));
    process.exitCode = 1;
  } else {
    console.log(`Xong — ảnh nằm ở ${outDir}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
