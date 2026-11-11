import { describe, expect, it, vi } from 'vitest';
import {
  isPublicAddress,
  normalizeScanUrl,
  resolveScanTarget,
} from '../src/modules/scanning/url-policy.js';

describe('SSRF target policy', () => {
  it.each([
    '0.0.0.0',
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.0.1',
    '169.254.169.254',
    '100.64.1.1',
    '192.0.2.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '2002:7f00:1::',
    '64:ff9b::7f00:1',
  ])('rejects non-public %s', (address) =>
    expect(isPublicAddress(address)).toBe(false),
  );
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'accepts public %s',
    (address) => expect(isPublicAddress(address)).toBe(true),
  );
  it.each([
    'file:///etc/passwd',
    'ftp://example.com',
    'http://localhost',
    'http://127.1',
    'http://2130706433',
    'http://0x7f000001',
    'http://[::1]',
    'http://[::ffff:127.0.0.1]',
    'http://host.local',
    'http://user:password@example.com',
    'https://example.com:8080',
    'http://localhost.',
  ])('rejects URL %s', (url) => expect(() => normalizeScanUrl(url)).toThrow());
  it('normalizes host, default port and fragment for duplicate matching', () =>
    expect(normalizeScanUrl('HTTPS://EXAMPLE.COM:443/a#fragment').href).toBe(
      'https://example.com/a',
    ));
  it('rejects mixed public/private DNS answers and empty results', async () => {
    for (const answers of [
      [],
      [
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ],
    ]) {
      await expect(
        resolveScanTarget(
          'https://example.com',
          vi.fn().mockResolvedValue(answers),
        ),
      ).rejects.toMatchObject({ code: 'UNSAFE_TARGET' });
    }
  });
  it('returns only checked addresses for connection pinning', async () => {
    const resolve = vi
      .fn()
      .mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
    expect(
      (await resolveScanTarget('https://example.com', resolve)).addresses,
    ).toEqual([{ address: '8.8.8.8', family: 4 }]);
    expect(resolve).toHaveBeenCalledWith('example.com', {
      all: true,
      verbatim: true,
    });
  });
});
