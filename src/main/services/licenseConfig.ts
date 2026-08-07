// URL gốc của Firebase Realtime Database dùng để cấp phép license — cố định cho MỌI bản cài đặt
// của Maxcom, không phải bí mật riêng từng máy (khác với Client ID/Secret của Hanet), nên hardcode
// thẳng ở đây thay vì bắt mỗi máy phải có file .env riêng chỉ để chứa đúng URL này.
// LICENSE_BASE_URL trong .env (nếu có) vẫn override được — chỉ dành cho máy dev muốn test với một
// Firebase project khác, không dùng trên bản đóng gói cho khách.
const DEFAULT_LICENSE_BASE_URL =
  'https://hanet-employee-registation-default-rtdb.asia-southeast1.firebasedatabase.app/licenses';

export const LICENSE_BASE_URL = process.env.LICENSE_BASE_URL || DEFAULT_LICENSE_BASE_URL;
