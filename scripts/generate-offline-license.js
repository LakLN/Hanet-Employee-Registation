#!/usr/bin/env node
/**
 * CÔNG CỤ NỘI BỘ CỦA MAXCOM — cấp license OFFLINE gắn với một máy cụ thể. Không phân phối cho khách.
 *
 * Cách dùng:
 *   node scripts/generate-offline-license.js <MÃ-MÁY> "Tên khách hàng" [hạn dùng YYYY-MM-DD]
 *
 * <MÃ-MÁY> là mã khách đọc từ màn hình Cài đặt của app (dạng XXXX-XXXX-XXXX-XXXX). Ký bằng khoá riêng
 * scripts/license-private.pem (KHÔNG commit, KHÔNG gửi cho khách); public key tương ứng nằm trong
 * src/main/services/licenseConfig.ts. Mất khoá riêng = không cấp được license mới, nhớ sao lưu.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [machineCode, customer, exp] = process.argv.slice(2);
if (!machineCode || !customer) {
  console.error('Cách dùng: node scripts/generate-offline-license.js <MÃ-MÁY> "Tên khách hàng" [YYYY-MM-DD]');
  process.exit(1);
}
if (!/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/.test(machineCode)) {
  console.error('Mã máy không đúng định dạng XXXX-XXXX-XXXX-XXXX.');
  process.exit(1);
}
if (exp && Number.isNaN(new Date(exp).getTime())) {
  console.error('Hạn dùng không hợp lệ, cần dạng YYYY-MM-DD.');
  process.exit(1);
}

const privateKey = crypto.createPrivateKey(fs.readFileSync(path.join(__dirname, 'license-private.pem')));
const payload = Buffer.from(JSON.stringify({ fp: machineCode, customer, ...(exp ? { exp } : {}) })).toString('base64url');
const sig = crypto.sign(null, Buffer.from(payload, 'utf-8'), privateKey).toString('base64url');

console.log(`Khách hàng : ${customer}`);
console.log(`Mã máy     : ${machineCode}`);
console.log(`Hạn dùng   : ${exp || 'vĩnh viễn'}`);
console.log(`License    :\nMXL1.${payload}.${sig}`);
