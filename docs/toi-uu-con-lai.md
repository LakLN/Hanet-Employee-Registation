# Tối ưu còn lại (chưa làm)

Ghi lại từ đợt rà soát kiến trúc ngày 2026-07-29. Phần **đã làm** nằm ở cuối file để đối chiếu.

Ước lượng công sức là cho một người đã quen codebase. Thứ tự trong mỗi nhóm là thứ tự nên làm.

---

## 1. Hiệu suất (lợi ích rõ nhất, làm trước)

### 1.1 Bỏ resize khi ảnh đã đủ nhỏ — ~1h, lợi ích/công sức tốt nhất

`src/main/services/imageWorker.ts` hiện **luôn** decode + re-encode JPEG q90, kể cả ảnh đã 800×600/150KB.
Với thư mục ảnh đã được chuẩn hoá sẵn thì gần như toàn bộ chi phí xử lý ảnh là vô ích.

Cách làm: đọc kích thước từ header (thư viện `image-size`, không decode toàn ảnh); nếu ảnh đã
`≤ 1280×738` và dung lượng dưới ngưỡng Hanet chấp nhận → trả thẳng buffer gốc, không cần vào worker.

### 1.2 Worker pool cho resize — ~3h

`src/main/services/imageProcessor.ts` tạo `new Worker()` **cho mỗi ảnh**: mỗi lần là một V8 isolate mới
cộng với `require('jimp')` (thư viện rất nặng) từ đầu, rồi `terminate()`. Với 500 nhân viên là 500 lần
khởi tạo — chi phí cố định này thường ngang hoặc lớn hơn thời gian resize thật.

Cách làm: giữ `N = min(4, cpus-1)` worker sống, gửi job qua `postMessage`, chỉ terminate khi app thoát.
Giữ nguyên timeout 30s nhưng đổi thành **recycle** worker treo thay vì kill cả pool.
`src/main/infra/workerRunner.ts` (one-shot, đang dùng cho Excel) là tham chiếu tốt cho phần timeout/exit.

### 1.3 Nâng jimp 0.22 → jimp 1.x hoặc sharp — ~2-4h

`jimp@0.22` + `@types/jimp@0.2` đã lỗi thời (jimp 1.x đổi hẳn API, và là ESM). `sharp` (libvips native)
nhanh hơn nhiều lần vì jimp là JS thuần, nhưng cần `asarUnpack` cho binary theo kiến trúc.

Nên làm **sau** 1.1 và 1.2 và làm riêng một nhánh: cần mắt người kiểm tra chất lượng ảnh đầu ra, không
có test tự động nào thay được việc đó.

---

## 2. Kiến trúc / bảo trì

### 2.1 Bỏ `.env` cạnh exe → config store mã hoá + màn hình Cấu hình — ~4h

`src/main/index.ts` nạp `.env` từ **cạnh file exe**. Nghĩa là mỗi máy nhân viên đều có một file text chứa
`HANET_CLIENT_ID`, `HANET_CLIENT_SECRET`, `HANET_REFRESH_TOKEN` — credential cấp đối tác của cả công ty,
quyền ghi dữ liệu sinh trắc học. Ai copy file đó ra là có toàn quyền với tài khoản Hanet của Maxcom,
độc lập với license check (mà license cũng chỉ là cảnh báo mềm).

Cách làm: màn hình Cấu hình trong app, lưu vào `userData` mã hoá bằng `safeStorage` — cơ chế đã có sẵn và
chạy tốt trong `src/main/services/hanetOAuth.ts`, chỉ cần mở rộng cho client id/secret/placeId. `.env` giữ
lại làm nguồn seed cho dev và cho các máy đã cài (đọc `.env` nếu chưa có config đã lưu) để không phá
các bản đang chạy.

**Đây là rào cản cứng nếu muốn phát app ra ngoài phạm vi nội bộ.** Xem thêm 5.1.

### 2.2 `records` bất biến — ~3h

`src/renderer/app/hooks/useBulkSync.ts` nhận `setRecords` của `App` rồi **xoá** record khỏi danh sách khi
đăng ký xong. Hệ quả: hook con điều khiển state của cha (khó lần theo), dữ liệu nguồn từ Excel bị phá huỷ
nên không xuất được báo cáo đầy đủ, không xem lại được cả lô, và `handleRetryFailed` lọc từ một danh sách
đã co lại.

Cách làm: giữ `records` bất biến, thêm `Map<employeeId, SyncResultItem>`, và **suy ra** danh sách chờ:

```ts
const pending = useMemo(
  () => records.filter((r) => r.status === 'VALID' && !isDone(resultsById.get(r.employeeId))),
  [records, resultsById],
);
```

Đây cũng là bước dọn đường bắt buộc nếu sau này cần "tiếp tục lô bị ngắt" hoặc lưu lịch sử.

### 2.3 Cấu trúc feature-based cho renderer — ~2h

Hiện là type-based (`components/`, `hooks/`) — ổn ở 8 file, nhưng thêm 2-3 module nữa sẽ thành thư mục
`components/` 40 file phẳng.

```
src/renderer/app/
  features/{bulk-import,single-import,license,settings}/
  shared/ui/      StatCard, StatusBadge, Button, Modal
  shared/lib/     friendlyError, format
  app/            App.tsx, ErrorBoundary.tsx
```

### 2.4 Adapter `ipcClient.ts` — ~1h

Renderer gọi `window.hanetImporter` trực tiếp ở khắp nơi (`App.tsx`, `useBulkSync`, `SingleImportForm`).
Bọc lại thành một adapter để mock một chỗ trong test — điều kiện để làm được mục 3.1.

### 2.5 Việc nhỏ

- `FilePolicy.allowedRoots` chỉ tăng, không bao giờ xoá trong suốt phiên (~15ph).
- `App.tsx` có 5 `useMemo` đều iterate `records` → gộp thành 1 `reduce` (~15ph).

---

## 3. Kiểm thử

### 3.1 vitest jsdom cho component/hook — ~4h

`vitest.config.ts` đang là `environment: 'node'` nên **0%** component/hook được test. Cần project thứ hai
với `environment: 'jsdom'` + `@testing-library/react` cho `tests/renderer/**`, sau khi có 2.4.

### 3.2 Test còn thiếu ở main — ~1h

- `usecases/parseExcel.ts`: timeout, worker trả lỗi.
- `infra/safeFileProtocol.ts`: phải trả 403 khi đường dẫn ngoài thư mục đã chọn hoặc không phải file ảnh.

### 3.3 Ngưỡng coverage — ~1h

Thêm `@vitest/coverage-v8`, đặt mốc mềm (vd 60%) rồi tăng dần. Chạy trong CI.

---

## 4. Phát hành

### 4.1 Auto-update chưa hoạt động — ~4h (cần chốt nơi host feed trước)

`release/latest.yml` đang được sinh ra, nhưng `electron-updater` **không có trong dependencies** và không
có code check update. Mỗi lần sửa bug là phải đi từng máy cài lại — chi phí vận hành lớn nhất về lâu dài.

Cần: `electron-updater` + `build.publish` (GitHub Releases private, hoặc `generic` trỏ vào file share/S3
nội bộ) + job release trong CI (`tag v*` → build → upload). **Việc bị chặn ở quyết định hạ tầng: host feed
ở đâu.**

### 4.2 CI còn thiếu — ~30ph

`npm audit --audit-level=high`, upload installer làm artifact.

### 4.3 Code signing

Không có certificate thì Windows SmartScreen sẽ cảnh báo khi cài. Chấp nhận được cho nội bộ, nhưng cần
biết trước khi phát rộng hơn.

---

## 5. Dài hạn

### 5.1 Backend proxy (BFF) — dự án riêng

Client secret chỉ nằm trên server; app desktop đăng nhập bằng tài khoản người dùng và gọi
`POST /api/persons` của server, server mới gọi Hanet. Khi đó license check, phân quyền, audit log tập
trung, rate limit và **thu hồi quyền tức thì** mới khả thi — cả 4 thứ hiện đều không làm được.

Việc tách `usecases/` khỏi Electron (đã làm) chính là bước dọn đường cho hướng này: `BulkRegistrationRunner`
không biết gì về Electron nên tái dùng được ở phía server.

---

## Đã làm trong đợt này

Bốn commit, mỗi commit đều xanh (typecheck + lint + 63 test + build + app boot thật với Electron 43).

**Sửa lỗi**

- `bulk-register`: nhả `AbortController` trong `finally`. Trước đây một lỗi mạng lúc làm mới token là đủ
  để mọi lần đăng ký hàng loạt sau đó bị chặn bởi "đang có tiến trình khác" cho tới khi restart app.
- `bulk-register`: gửi sự kiện qua `safeSend` có kiểm tra `isDestroyed()`. Đóng cửa sổ giữa lô làm
  `.send()` throw → reject `Promise.all` → **mất audit log** của những người đã đăng ký thành công.
- `licenseCheck`: Firebase trả HTTP 200 + body `null` cho node chưa cấp; việc quy đổi `null` thành `{}`
  khiến mã license sai vẫn được coi là hợp lệ (nhánh kiểm tra là dead code).
- Thêm `ErrorBoundary`: lỗi render trước đây cho ra màn hình trắng không thông báo.
- `parseEmployeeExcel`: file Excel không có sheet nào giờ báo lỗi rõ ràng thay vì crash ở tầng dưới.
- Renderer không còn `types: ["node"]` — trước đây TypeScript vẫn cho phép viết `fs.readFile` trong
  renderer mà không báo lỗi dù chắc chắn crash lúc chạy.
- `hanetOAuth`: suy ra đơn vị của field `expire` theo độ lớn thay vì giả định là epoch giây. Đoán sai thì
  app hoặc làm mới token ở mọi lời gọi, hoặc không bao giờ làm mới rồi lỗi 401 sau khoảng một năm.

**Cấu trúc**

- `src/shared/ipc.ts` là nguồn chân lý duy nhất cho IPC. Tên channel + kiểu arg/result khai báo một lần;
  bản đồ handler ở main là mapped type nên **thiếu handler là lỗi typecheck**. Trước đây danh sách API bị
  chép tay ở 3 nơi (`ipc.ts`, `preload.ts`, `global.d.ts`).
- Validate mọi payload IPC bằng zod ở đúng đường biên (`src/main/ipc/schemas.ts`), có giới hạn số lượng
  bản ghi và độ dài chuỗi.
- Tách `ipc.ts` (292 dòng, 5 trách nhiệm, 0 test) thành `ipc/` + `usecases/` + `infra/`.
  `BulkRegistrationRunner` không biết gì về Electron → **8 test** cho luồng hủy/quota/đếm/audit.
- `FilePolicy`: đường dẫn ảnh trong bản ghi đăng ký giờ cũng được kiểm tra (trước chỉ `read-file` được
  kiểm tra, còn `imagePath` từ renderer thì main tin thẳng).
- Alias `@shared`/`@main`/`@renderer` thay cho `'../../../shared/types'`.

**Hiệu suất**

- Parse Excel chuyển sang main + `worker_thread`: UI không còn đóng băng khi đọc file lớn, và
  **bundle renderer giảm 1116 kB → 177 kB** (exceljs ra khỏi renderer).
- Preview ảnh qua custom protocol `safe-file://` thay vì đọc nguyên file qua IPC → Blob → object URL.
  Trước đây 50 dòng × ảnh 4MB ≈ 200MB RAM renderer; giờ Chromium tự stream/cache, và xoá được ~40 dòng
  state phức tạp trong `DataGrid`.
- Lô đăng ký gối đầu CPU/mạng: ảnh người kế tiếp được resize **trong lúc** người hiện tại đang upload,
  giới hạn RAM bằng `gate = upload + prefetch`.
- `electron-vite` thay `tsc -w + vite + concurrently + wait-on`: build dọn `out/` trước (trước đây file
  test compile từ lần build cũ vẫn nằm trong asar), tắt sourcemap release, bật minify renderer
  (electron-vite không minify mặc định — thiếu cấu hình này bundle ra 1.5MB code thô).

**Bảo mật**

- Electron 27 (hết hỗ trợ bảo mật từ giữa 2024) → 43.
- CSP trong `index.html`: `default-src 'none'`, script chỉ `'self'`.
- `setWindowOpenHandler` + `will-navigate` chặn điều hướng ra khỏi app; tắt webview; ẩn menu ở bản đóng gói.
- Logo nhúng vào bundle thay vì tải từ `maxcom.com.vn` (app mạng nội bộ có thể không ra internet).
- Log che một phần số điện thoại/email; giới hạn file log 5MB; audit log tự dọn sau 90 ngày.
