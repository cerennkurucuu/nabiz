import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

describe('API foundation', () => {
  it('returns health without exposing server information', async () => {
    const result = await request(createApp()).get('/api/health').expect(200);
    expect(result.body).toEqual({ data: { status: 'ok', service: 'nabiz-api' } });
    expect(result.headers['x-powered-by']).toBeUndefined();
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('supports the health alias', async () => {
    await request(createApp()).get('/health').expect(200);
  });
  it('returns a structured 404 with a request identifier', async () => {
    const result = await request(createApp()).get('/api/unknown').expect(404);
    expect(result.body.error.code).toBe('NOT_FOUND');
    expect(result.body.error.requestId).toBe(result.headers['x-request-id']);
  });
  it('handles invalid JSON without leaking parser details', async () => {
    const result = await request(createApp()).post('/api/unknown')
      .set('Content-Type', 'application/json').send('{broken').expect(400);
    expect(result.body.error.code).toBe('INVALID_REQUEST');
    expect(result.body.error.stack).toBeUndefined();
  });
  it('rejects oversized request bodies', async () => {
    const result = await request(createApp()).post('/api/unknown')
      .send({ value: 'x'.repeat(17 * 1024) }).expect(413);
    expect(result.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
  it('rejects invalid environment configuration', () => {
    for (const port of ['0', '65536', 'abc', '3.5']) {
      expect(() => loadConfig({ PORT: port, DATABASE_URL: 'file:./test.db' })).toThrow();
    }
    expect(() => loadConfig({})).toThrow('DATABASE_URL');
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://localhost/db' })).toThrow();
    expect(loadConfig({ DATABASE_URL: 'file:./test.db' }).port).toBe(3100);
  });
});
