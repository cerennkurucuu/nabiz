import http from 'node:http';
import https from 'node:https';
import { resolveScanTarget } from './url-policy.js';

export interface FetchResult {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}
export interface NetworkBudget {
  requests: number;
  bytes: number;
}
export const newBudget = (): NetworkBudget => ({ requests: 0, bytes: 0 });

// Resolve once, reject every unsafe answer, then pin the connection to a validated IP.
// No browser/request cookies, credentials, custom headers or ambient proxy are forwarded.
export async function safeFetch(
  input: string,
  signal: AbortSignal,
  budget = newBudget(),
  redirects = 5,
): Promise<FetchResult> {
  signal.throwIfAborted();
  if (++budget.requests > 150) throw new Error('REQUEST_LIMIT');
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
  const target = await abortable(resolveScanTarget(input), deadline);
  deadline.throwIfAborted();
  const address = target.addresses[0]!;
  const result = await new Promise<FetchResult>((resolve, reject) => {
    const transport = target.url.protocol === 'https:' ? https : http;
    const req = transport.request(
      target.url,
      {
        method: 'GET',
        signal: deadline,
        agent: false,
        headers: { 'User-Agent': 'Nabiz/0.1', 'Accept-Encoding': 'identity' },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          budget.bytes += chunk.length;
          if (bytes > 2 * 1024 * 1024 || budget.bytes > 10 * 1024 * 1024) {
            res.destroy(new Error('TRANSFER_LIMIT'));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers))
            if (value !== undefined)
              headers[key] = Array.isArray(value) ? value.join(', ') : value;
          resolve({
            url: target.url.href,
            status: res.statusCode ?? 502,
            headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
  if (
    [301, 302, 303, 307, 308].includes(result.status) &&
    result.headers['location']
  ) {
    if (redirects <= 0) throw new Error('REDIRECT_LIMIT');
    return safeFetch(
      new URL(result.headers['location'], target.url).href,
      signal,
      budget,
      redirects - 1,
    );
  }
  return result;
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('NETWORK_TIMEOUT_OR_CANCELLED'));
    if (signal.aborted) {
      reject(new Error('NETWORK_TIMEOUT_OR_CANCELLED'));
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}
