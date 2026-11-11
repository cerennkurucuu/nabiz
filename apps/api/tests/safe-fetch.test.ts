import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import https from 'node:https';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeFetch } from '../src/modules/scanning/safe-fetch.js';
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '8.8.8.8', family: 4 }]),
}));

describe('Pinned transport and redirect policy', () => {
  beforeEach(() => vi.restoreAllMocks());
  function transport(status = 200, headers: Record<string, string> = {}) {
    return vi.spyOn(https, 'request').mockImplementation(((
      url: URL,
      options: https.RequestOptions,
      callback: (res: unknown) => void,
    ) => {
      const req = new EventEmitter() as EventEmitter & {
        end: () => void;
        destroy: () => void;
      };
      req.destroy = () => {};
      req.end = () =>
        queueMicrotask(() => {
          const response = Object.assign(new PassThrough(), {
            statusCode: status,
            headers,
          });
          callback(response);
          response.end('fixture');
        });
      expect(url.hostname).toBe('example.com');
      expect(options.agent).toBe(false);
      const selected = vi.fn();
      (options.lookup as CallableFunction)(
        'example.com',
        { all: true },
        selected,
      );
      expect(selected).toHaveBeenCalledWith(null, [
        { address: '8.8.8.8', family: 4 },
      ]);
      return req;
    }) as typeof https.request);
  }
  it('uses the validated address instead of resolving again', async () => {
    const spy = transport();
    const result = await safeFetch(
      'https://example.com/',
      new AbortController().signal,
    );
    expect(result.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('rejects private redirect before opening another socket', async () => {
    const spy = transport(302, {
      location: 'http://169.254.169.254/latest/meta-data/',
    });
    await expect(
      safeFetch('https://example.com/', new AbortController().signal),
    ).rejects.toMatchObject({ code: 'UNSAFE_TARGET' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('bounds redirect loops and request budgets', async () => {
    const spy = transport(302, { location: '/loop' });
    await expect(
      safeFetch(
        'https://example.com/',
        new AbortController().signal,
        undefined,
        1,
      ),
    ).rejects.toThrow('REDIRECT_LIMIT');
    expect(spy).toHaveBeenCalledTimes(2);
    await expect(
      safeFetch('https://example.com/', new AbortController().signal, {
        requests: 150,
        bytes: 0,
      }),
    ).rejects.toThrow('REQUEST_LIMIT');
  });
});
