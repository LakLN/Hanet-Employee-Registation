import log from 'electron-log/main';

log.initialize();
log.transports.file.level = 'info';
// File log nằm trên máy người dùng vô thời hạn và có ghi dữ liệu nhân sự (dù đã che một phần) —
// giới hạn 5MB; electron-log tự đổi tên file cũ khi vượt ngưỡng nên tối đa còn ~2 file.
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';

export default log;
