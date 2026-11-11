import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const browsersPath =
  process.env.PLAYWRIGHT_BROWSERS_PATH ||
  fileURLToPath(new URL('../.cache/ms-playwright', import.meta.url));

// The playwright package exports no './cli' subpath, so the CLI is reached
// through the package bin entry (cli.js) that npm links into node_modules/.bin.
const playwrightRoot = path.dirname(require.resolve('playwright/package.json'));
const cli = path.join(playwrightRoot, 'cli.js');
if (!existsSync(cli)) {
  console.error('Playwright CLI bulunamadı. Önce npm install çalıştırın.');
  process.exitCode = 1;
  process.exit();
}

const layout = {
  win32: {
    chromium: 'chrome-win64/chrome.exe',
    shell: 'chrome-headless-shell-win64/chrome-headless-shell.exe',
  },
  linux: {
    chromium: 'chrome-linux/chrome',
    shell: 'chrome-headless-shell-linux64/chrome-headless-shell',
  },
  darwin: {
    chromium: 'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    shell: 'chrome-headless-shell-mac/headless_shell',
  },
}[process.platform];

const registry = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(require.resolve('playwright-core/package.json')),
      'browsers.json',
    ),
    'utf8',
  ),
).browsers;
const revision = (name) =>
  registry.find((browser) => browser.name === name)?.revision ?? '';

const installed = [
  path.join(browsersPath, `chromium-${revision('chromium')}`, layout.chromium),
  path.join(
    browsersPath,
    `chromium_headless_shell-${revision('chromium-headless-shell')}`,
    layout.shell,
  ),
].every((executable) => existsSync(executable));

if (installed) {
  console.log(
    `Chromium zaten kurulu: ${browsersPath}. Tekrar indirme yapılmıyor.`,
  );
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [cli, 'install', 'chromium', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath },
  },
);
if (result.status !== 0) {
  console.error('Chromium kurulumu başarısız oldu.');
}
process.exitCode = result.status ?? 1;
