import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Yerel geliştirmede tek kanonik adres kullanılır. Tarayıcı bu adresi açarsa
// gönderdiği Origin başlığı API'deki APP_ORIGIN ile birebir eşleşmelidir;
// aksi halde yazma istekleri 403 (CSRF_REJECTED) ile reddedilir.
const CANONICAL_ORIGIN = 'http://localhost:4300';

const repoRoot = resolve(import.meta.dirname, '..', '..', '..');
const readRepoFile = (relative: string) =>
  readFileSync(resolve(repoRoot, relative), 'utf8');

const parseEnv = (content: string) => {
  const values = new Map<string, string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    values.set(trimmed.slice(0, index), trimmed.slice(index + 1));
  }
  return values;
};

describe('Canonical development origin', () => {
  it('uses one canonical origin in the environment template', () => {
    const env = parseEnv(readRepoFile('apps/api/.env.example'));
    expect(env.get('APP_ORIGIN')).toBe(CANONICAL_ORIGIN);
  });

  it('keeps the local environment on the canonical origin', () => {
    let content: string;
    try {
      content = readFileSync(resolve(repoRoot, 'apps/api/.env'), 'utf8');
    } catch {
      // Ortam dosyası yoksa test örnek dosyasına dayanır.
      return;
    }
    expect(parseEnv(content).get('APP_ORIGIN')).toBe(CANONICAL_ORIGIN);
  });

  it('does not rewrite the browser origin in the development proxy', () => {
    const proxy = JSON.parse(
      readRepoFile('apps/web/proxy.conf.json'),
    ) as Record<
      string,
      { target: string; changeOrigin?: boolean; secure?: boolean }
    >;
    const api = proxy['/api/**'];
    expect(api).toBeDefined();
    // changeOrigin true olsaydı Origin başlığı 127.0.0.1:3100 olarak değişir
    // ve API'deki same-origin kontrolü tarayıcının adresini göremezdi.
    expect(api?.changeOrigin ?? false).toBe(false);
    expect(api?.target).toBe('http://127.0.0.1:3100');
  });

  it('documents the canonical address consistently', () => {
    const readme = readRepoFile('README.md');
    expect(readme).toContain(CANONICAL_ORIGIN);
    expect(readme).toContain('APP_ORIGIN=http://localhost:4300');
  });

  it('serves the frontend on an address that resolves to the canonical origin', () => {
    const pkg = JSON.parse(readRepoFile('apps/web/package.json')) as {
      scripts: Record<string, string>;
    };
    // ng serve 127.0.0.1 üzerinde dinler; localhost aynı döngüsel adrese
    // çözümlenir, bu yüzden tarayıcı kanonik adresi açabilir.
    expect(pkg.scripts['dev']).toContain('--port 4300');
    expect(pkg.scripts['dev']).toContain('--host 127.0.0.1');
  });
});
