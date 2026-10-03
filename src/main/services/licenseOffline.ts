import os from 'os';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { LICENSE_PUBLIC_KEY_B64 } from './licenseConfig';

// License offline: `MXL1.<payload>.<chữ ký>` (base64url). Payload là JSON {fp, customer, exp?}, ký
// Ed25519 bằng khoá riêng của Maxcom; app chỉ có public key nên không tự cấp được license. `fp` là
// mã máy (getMachineCode) nên license chỉ dùng được đúng trên máy đã gửi mã máy cho Maxcom.
export const OFFLINE_LICENSE_PREFIX = 'MXL1.';

interface OfflineLicensePayload {
  fp: string;
  customer?: string;
  /** Hạn dùng ISO date, bỏ trống = vĩnh viễn. */
  exp?: string;
}

function readMachineGuid(): string | null {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { encoding: 'utf-8', timeout: 5000, windowsHide: true },
    );
    return /MachineGuid\s+REG_SZ\s+(\S+)/.exec(out)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Mã máy dạng XXXX-XXXX-XXXX-XXXX — người dùng đọc/gửi cho Maxcom để nhận license. */
export function getMachineCode(): string {
  // MachineGuid ổn định qua đổi tên máy/đổi phần cứng nhỏ; không có (non-Windows, lỗi reg) thì rơi về
  // thông tin hệ điều hành.
  const raw = readMachineGuid() ?? `${os.hostname()}|${os.platform()}|${os.arch()}|${os.cpus()[0]?.model ?? ''}`;
  const hex = crypto.createHash('sha256').update(`maxcom-hanet|${raw}`).digest('hex').slice(0, 16).toUpperCase();
  return hex.match(/.{4}/g)!.join('-');
}

export function isOfflineLicense(key: string): boolean {
  return key.startsWith(OFFLINE_LICENSE_PREFIX);
}

/** Ném Error (thông báo tiếng Việt) nếu license sai chữ ký, sai máy hoặc hết hạn. */
export function verifyOfflineLicense(
  key: string,
  machineCode: string = getMachineCode(),
  now: Date = new Date(),
  publicKeyB64: string = LICENSE_PUBLIC_KEY_B64,
): OfflineLicensePayload {
  const invalid = new Error('Mã license không hợp lệ. Vui lòng kiểm tra lại hoặc liên hệ Maxcom.');
  const parts = key.trim().split('.');
  const [head, payloadPart, sigPart] = parts;
  if (parts.length !== 3 || `${head}.` !== OFFLINE_LICENSE_PREFIX || !payloadPart || !sigPart) throw invalid;

  let verified: boolean;
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    verified = crypto.verify(null, Buffer.from(payloadPart, 'utf-8'), publicKey, Buffer.from(sigPart, 'base64url'));
  } catch {
    verified = false;
  }
  if (!verified) throw invalid;

  let payload: OfflineLicensePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf-8'));
  } catch {
    throw invalid;
  }

  if (payload.fp !== machineCode) {
    throw new Error('License này được cấp cho máy khác, không dùng được trên máy này.');
  }
  if (payload.exp && now.getTime() > new Date(payload.exp).getTime()) {
    throw new Error('License đã hết hạn. Vui lòng liên hệ Maxcom để gia hạn.');
  }
  return payload;
}
