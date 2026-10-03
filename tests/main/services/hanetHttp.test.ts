import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/main/logger', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { httpsAgentFor, isOfficialHanetUrl } = await import('../../../src/main/services/hanetHttp');

describe('hanetHttp', () => {
  it('nhận diện server Hanet chính thức', () => {
    expect(isOfficialHanetUrl('https://partner.hanet.ai')).toBe(true);
    expect(isOfficialHanetUrl('https://oauth.hanet.com/token')).toBe(true);
    expect(isOfficialHanetUrl('https://192.168.1.10:8443')).toBe(false);
    expect(isOfficialHanetUrl('https://hanet.ai.evil.com')).toBe(false);
  });

  it('chỉ nới kiểm tra chứng chỉ cho server nội bộ', () => {
    expect(httpsAgentFor('https://partner.hanet.ai/person/register').options.rejectUnauthorized).not.toBe(false);
    expect(httpsAgentFor('https://192.168.1.10:8443/person/register').options.rejectUnauthorized).toBe(false);
  });
});
