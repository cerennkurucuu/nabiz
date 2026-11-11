import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { AuthError } from '../auth/auth.security.js';
const deny = () =>
  new AuthError(
    400,
    'UNSAFE_TARGET',
    'Bu tarama hedefi güvenlik politikası tarafından engellendi.',
  );
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number) as [number, number];
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || b === 2)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0)
    );
  }
  if (isIP(address) !== 6) return false;
  const first = Number.parseInt(address.split(':')[0]!, 16);
  const second = Number.parseInt(address.split(':')[1] || '0', 16);
  return (
    first >= 0x2000 &&
    first <= 0x3fff &&
    first !== 0x2002 &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) &&
    !(first === 0x3fff && second < 0x1000)
  );
}
export function normalizeScanUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw deny();
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port)) ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.') ||
    (isIP(host) && !isPublicAddress(host))
  )
    throw deny();
  url.hash = '';
  return url;
}
export async function resolveScanTarget(input: string, resolver = lookup) {
  const url = normalizeScanUrl(input);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: { address: string; family: number }[];
  try {
    addresses = await resolver(hostname, { all: true, verbatim: true });
  } catch {
    throw deny();
  }
  if (!addresses.length || addresses.some((x) => !isPublicAddress(x.address)))
    throw deny();
  // Connections must be pinned to these addresses. Revalidate every redirect.
  return { url, addresses };
}
