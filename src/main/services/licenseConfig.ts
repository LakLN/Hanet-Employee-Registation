// URL gốc của Firebase Realtime Database dùng để cấp phép license — cố định cho MỌI bản cài đặt
// của Maxcom, không phải bí mật riêng từng máy (khác với Client ID/Secret của Hanet), nên hardcode
// thẳng ở đây thay vì bắt mỗi máy phải có file .env riêng chỉ để chứa đúng URL này.
// LICENSE_BASE_URL trong .env (nếu có) vẫn override được — chỉ dành cho máy dev muốn test với một
// Firebase project khác, không dùng trên bản đóng gói cho khách.
const DEFAULT_LICENSE_BASE_URL =
  'https://hanet-employee-registation-default-rtdb.asia-southeast1.firebasedatabase.app/licenses';

export const LICENSE_BASE_URL = process.env.LICENSE_BASE_URL || DEFAULT_LICENSE_BASE_URL;

// Public key (Ed25519, SPKI DER base64) để xác thực license offline (xem licenseOffline.ts). Khoá
// riêng tương ứng chỉ nằm ở máy Maxcom (scripts/license-private.pem, không commit) — public key thì
// công khai được, nhúng thẳng vào bản đóng gói.
export const LICENSE_PUBLIC_KEY_B64 = 'MCowBQYDK2VwAyEAOtspJOTY9I9DjLKfjZ8i+J419qwpQQgxKW0LPDJ5ih8=';

// License cố định cấp cho khách PVEP Cửu Long (bản cài dùng chung cho mọi máy của khách): khách nhập đúng mã này thì kích hoạt được, không cần
// mạng. Nhúng thẳng trong bản đóng gói nên ai mở app ra đều lấy được — chỉ ngăn nhập bừa.
export const BUILTIN_LICENSE_KEY = 'XE3YX-P3BRD-9WTJB-Q9AXB';
