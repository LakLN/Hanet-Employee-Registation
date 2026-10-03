import crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { getMachineCode, isOfflineLicense, verifyOfflineLicense } from '../../../src/main/services/licenseOffline';

vi.mock('electron', () => ({}));

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const FP = 'ABCD-1234-ABCD-1234';

function sign(payload: object, key = privateKey): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `MXL1.${body}.${crypto.sign(null, Buffer.from(body), key).toString('base64url')}`;
}

describe('verifyOfflineLicense', () => {
  it('chấp nhận license đúng máy, chữ ký hợp lệ', () => {
    expect(verifyOfflineLicense(sign({ fp: FP, customer: 'A' }), FP, new Date(), pub).customer).toBe('A');
  });

  it('từ chối license cấp cho máy khác', () => {
    expect(() => verifyOfflineLicense(sign({ fp: 'XXXX-XXXX-XXXX-XXXX' }), FP, new Date(), pub)).toThrow(/máy khác/);
  });

  it('từ chối license ký bằng khoá khác', () => {
    const other = crypto.generateKeyPairSync('ed25519').privateKey;
    expect(() => verifyOfflineLicense(sign({ fp: FP }, other), FP, new Date(), pub)).toThrow(/không hợp lệ/);
  });

  it('từ chối payload bị sửa sau khi ký', () => {
    const [h, , s] = sign({ fp: FP, exp: '2020-01-01' }).split('.');
    const forged = Buffer.from(JSON.stringify({ fp: FP })).toString('base64url');
    expect(() => verifyOfflineLicense(`${h}.${forged}.${s}`, FP, new Date(), pub)).toThrow(/không hợp lệ/);
  });

  it('từ chối license hết hạn', () => {
    expect(() => verifyOfflineLicense(sign({ fp: FP, exp: '2020-01-01' }), FP, new Date(), pub)).toThrow(/hết hạn/);
  });

  it('từ chối rác', () => {
    expect(() => verifyOfflineLicense('MXL1.abc', FP, new Date(), pub)).toThrow(/không hợp lệ/);
  });
});

describe('machine code', () => {
  it('đúng định dạng và ổn định', () => {
    expect(getMachineCode()).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    expect(getMachineCode()).toBe(getMachineCode());
  });
  it('nhận diện tiền tố license offline', () => {
    expect(isOfflineLicense('MXL1.x.y')).toBe(true);
    expect(isOfflineLicense('ABCDE-FGHJK')).toBe(false);
  });
});
