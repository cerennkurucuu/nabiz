/**
 * Full stack smoke test: Angular frontend -> API -> Chromium scan engine ->
 * SQLite -> result screen. Uses a loopback fixture server, so no public
 * network and no Google account are involved. The session is seeded directly
 * in the test database; this is not a Google login.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { chromium, type Browser, type Page } from 'playwright';
import { loadAuthConfig } from '../apps/api/src/modules/auth/auth.config.js';
import { AuthService } from '../apps/api/src/modules/auth/auth.service.js';
import {
  hashToken,
  randomToken,
} from '../apps/api/src/modules/auth/auth.security.js';
import type { IdentityProvider } from '../apps/api/src/modules/auth/google.provider.js';
import { createApp } from '../apps/api/src/app.js';
import { JobsService } from '../apps/api/src/modules/scanning/jobs.service.js';
import { BrowserRunner } from '../apps/api/src/modules/scanning/browser.runner.js';
import { ArtifactStore } from '../apps/api/src/modules/scanning/artifacts.js';
import { fixtureServer } from '../apps/api/tests/helpers/fixture-server.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const apiPort = 3199;
const webPort = 4399;
const origin = `http://127.0.0.1:${webPort}`;
const target = 'https://fixture.nabiz.test/broken';
const blockedTarget = 'https://fixture.nabiz.test/blocked';
const mixedTarget = 'https://fixture.nabiz.test/mixed';

const step = (message: string) => console.log(`[e2e] ${message}`);
const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) step(`PASS ${message}`);
  else {
    failures.push(message);
    step(`FAIL ${message}`);
  }
}

async function waitForHttp(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // The server is not listening yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function stopProcess(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === 'win32')
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
  else child.kill('SIGTERM');
}

const gotoView = async (page: Page, label: string, id: string) => {
  await page.locator('.nav-item', { hasText: label }).click();
  await page.waitForFunction(
    (expected) =>
      document.querySelector('.scans')?.getAttribute('data-view') === expected,
    id,
    { timeout: 15000 },
  );
};

async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'nabiz-e2e-'));
  const databaseUrl = `file:${join(directory, 'e2e.db').replaceAll('\\', '/')}`;
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let browser: Browser | undefined;
  let webServer: ChildProcess | undefined;
  let apiServer: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  let jobs: JobsService | undefined;
  let artifactStore: ArtifactStore | undefined;

  try {
    for (const migration of [
      '20261108010000_auth',
      '20261109000000_scan_jobs',
      '20261111090000_scan_artifacts',
    ]) {
      const sql = readFileSync(
        join(root, 'apps/api/prisma/migrations', migration, 'migration.sql'),
        'utf8',
      );
      for (const statement of sql.split(';').filter((s) => s.trim()))
        await db.$executeRawUnsafe(statement);
    }
    step('Test veritabanı migration ile hazırlandı');

    const provider: IdentityProvider = {
      verify: async () => {
        throw new Error('Google akışı bu testte kullanılmaz');
      },
    };
    const config = loadAuthConfig({
      NODE_ENV: 'test',
      GOOGLE_CLIENT_ID: 'e2e.apps.googleusercontent.com',
      APP_ORIGIN: origin,
    });
    const auth = new AuthService(config, db, provider);

    const user = await db.user.create({
      data: {
        googleSub: 'e2e-local-user',
        email: 'e2e@example.test',
        name: 'Uçtan Uca Kullanıcı',
      },
    });
    const token = randomToken();
    await db.session.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    step('Test oturumu veritabanına yazıldı (Google girişi değil)');

    const fixture = await fixtureServer();
    // PageSpeed testte sahte uygulanır: ağ çağrısı yapılmaz, sonuç yapısı
    // gerçek API ile aynıdır.
    const pageSpeed = {
      collect: async (urls: string[]) =>
        urls.flatMap((url) =>
          (['mobile', 'desktop'] as const).map((strategy) => ({
            url,
            strategy,
            ok: true,
            scores: {
              performance: 82,
              accessibility: 91,
              bestPractices: 88,
              seo: 76,
            },
            metrics: {
              firstContentfulPaint: '1,1 sn',
              largestContentfulPaint: '2,3 sn',
            },
            checkedAt: new Date().toISOString(),
          })),
        ),
    };
    artifactStore = new ArtifactStore(db, join(directory, 'artifacts'), {
      maxBytes: 2 * 1024 * 1024,
      maxPerScan: 24,
      retentionDays: 1,
    });
    jobs = new JobsService(
      db,
      new BrowserRunner(fixture.fetcher),
      { enabled: true },
      pageSpeed,
      artifactStore,
    );
    await jobs.start();
    apiServer = createApp(auth, jobs, artifactStore).listen(
      apiPort,
      '127.0.0.1',
    );
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`, 15000);
    step(`API ${apiPort} portunda ayakta`);

    const proxy = join(directory, 'proxy.conf.json');
    writeFileSync(
      proxy,
      JSON.stringify({
        '/api/**': {
          target: `http://127.0.0.1:${apiPort}`,
          secure: false,
          changeOrigin: false,
        },
      }),
    );
    webServer = spawn(
      process.execPath,
      [
        join(root, 'node_modules/@angular/cli/bin/ng.js'),
        'serve',
        '--host',
        '127.0.0.1',
        '--port',
        String(webPort),
        '--proxy-config',
        proxy,
      ],
      { cwd: join(root, 'apps/web'), stdio: 'ignore', shell: false },
    );
    const ready = await waitForHttp(origin, 180000);
    check(ready, 'Angular geliştirme sunucusu yanıt verdi');
    if (!ready) return;

    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 950 },
    });
    await context.addCookies([
      {
        name: 'nabiz-session',
        value: token,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
      },
    ]);
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: 'networkidle' });
    check(
      (await page.textContent('body'))?.includes('Uçtan Uca Kullanıcı') ??
        false,
      'Frontend oturumu tanıdı ve kullanıcıyı gösterdi',
    );

    // Sol menüden yeni tarama görünümü
    await gotoView(page, 'Yeni Tarama', 'new-scan');
    await page
      .getByLabel('Taranacak adresler')
      .fill(`${target}\n${mixedTarget}`);
    await page.getByRole('button', { name: 'Taramayı başlat' }).click();

    const reported = await page
      .waitForFunction(
        () =>
          document.body.textContent?.includes(
            'JavaScript çalışma zamanı hatası',
          ) ?? false,
        undefined,
        { timeout: 60000 },
      )
      .then(() => true)
      .catch(() => false);
    check(reported, 'Rapor görünümü bulguyu gösterdi');

    const backVisible = await page
      .getByRole('button', { name: 'Geçmişe dön' })
      .isVisible()
      .catch(() => false);
    check(backVisible, 'Rapor görünümünde geri dönme yolu var');

    // Rapor bölümleri accordion olarak gelir
    const sections = page.locator('details.section:visible');
    const sectionCount = await sections.count();
    check(
      sectionCount >= 3,
      `Rapor bölümleri ayrı ayrı gösteriliyor (${sectionCount})`,
    );
    const openByDefault = await page
      .locator('details.section:visible[open]')
      .count();
    check(
      openByDefault === 1,
      `Rapor bölümleri varsayılan kapalı geliyor (${openByDefault}/${sectionCount})`,
    );

    // Tümünü aç / Tümünü kapat
    await page.getByRole('button', { name: 'Tümünü aç' }).first().click();
    const expanded = await page
      .locator('details.section:visible[open]')
      .count();
    check(expanded === sectionCount, `Tümünü aç bölümleri açtı (${expanded})`);
    await page.getByRole('button', { name: 'Tümünü kapat' }).first().click();
    const collapsed = await page
      .locator('details.section:visible[open]')
      .count();
    check(collapsed === 0, `Tümünü kapat bölümleri kapattı (${collapsed})`);
    await page.getByRole('button', { name: 'Tümünü aç' }).first().click();

    // Filtre
    const countBefore = await page.textContent('.count');
    await page.locator('mat-select:visible').first().click();
    await page.getByRole('option', { name: 'Hata', exact: true }).click();
    await page.waitForTimeout(300);
    const countAfter = await page.textContent('.count');
    check(
      countBefore !== countAfter,
      `Önem derecesi filtresi sonuçları daralttı (${countBefore?.trim()} -> ${countAfter?.trim()})`,
    );
    await page.getByRole('button', { name: 'Filtreleri temizle' }).click();

    // Adres filtresi (NABIZ-10: önem, URL ve kural bazında filtreleme)
    const filterSelects = page.locator('.filters mat-select:visible');
    await filterSelects.nth(5).click();
    const urlFilterOption = page
      .getByRole('option')
      .filter({ hasText: target });
    const urlFilterCount = await urlFilterOption.count();
    check(urlFilterCount > 0, 'Adres filtresi seçilebiliyor');
    if (urlFilterCount > 0) {
      await urlFilterOption.first().click();
      await page.waitForTimeout(300);
      const urlFiltered = await page.textContent('.count');
      const visible = Number.parseInt(
        (urlFiltered ?? '').split('/')[0] ?? '0',
        10,
      );
      const total = Number.parseInt(
        ((urlFiltered ?? '').split('/')[1] ?? '0').replace(/[^0-9]/g, ''),
        10,
      );
      check(
        visible > 0 && visible <= total,
        `Adres filtresi sonuçları daralttı (${urlFiltered?.trim()})`,
      );
      await page.getByRole('button', { name: 'Filtreleri temizle' }).click();
    }

    // Sticky başlık: içerik kaydırıldığında başlık üst çubuğun altında kalır
    await page
      .locator('.mat-drawer-content')
      .evaluate((element) => element.scrollTo(0, 1400));
    await page.waitForTimeout(400);
    const headBox = await page.locator('.report-head:visible').boundingBox();
    const topbarBox = await page.locator('.topbar').boundingBox();
    check(
      Boolean(headBox) &&
        Boolean(topbarBox) &&
        headBox.y >= topbarBox.y &&
        headBox.y < topbarBox.y + topbarBox.height + 12,
      'Rapor başlığı kaydırmada üst çubuğun altında kaldı',
    );
    await page
      .locator('.mat-drawer-content')
      .evaluate((element) => element.scrollTo(0, 0));

    // Çalıştırılan kontroller rapor bölümlerinde listelenir
    const checkTotals = (
      await page.locator('.check-totals .stat-value').allTextContents()
    ).map((value) => value.trim());
    check(
      checkTotals.length > 0 &&
        Number.parseInt(checkTotals[checkTotals.length - 1] ?? '0', 10) > 28,
      `Toplam kontrol sayısı raporda görünüyor (${checkTotals.join('/')})`,
    );
    const failedChecks = await page
      .locator('.check[data-status="failed"]')
      .count();
    check(
      failedChecks > 0,
      'Hatalı fixture için sorunlu kontroller gösteriliyor',
    );
    const skippedChecks = await page
      .locator('.check[data-status="skipped"]')
      .count();
    check(
      skippedChecks > 0,
      'Çalıştırılamayan kontroller "çalıştırılmadı" olarak gösteriliyor',
    );

    // Motor durumları raporda listelenir
    const engineCount = await page.locator('.engine').count();
    check(
      engineCount >= 4,
      `Motor durumları raporda görünüyor (${engineCount})`,
    );

    // Öncelikli düzeltme önerileri
    const recommendationCount = await page.locator('.recommendation').count();
    check(
      recommendationCount > 0,
      `Öncelikli düzeltme önerileri raporda görünüyor (${recommendationCount})`,
    );

    // Ekran görüntüleri: küçük önizleme ve büyütme
    const artifactCount = await page.locator('.artifact img').count();
    check(
      artifactCount > 0,
      `Ekran görüntüleri raporda görünüyor (${artifactCount})`,
    );
    const artifactLoaded = await page
      .locator('.artifact img')
      .first()
      .evaluate(async (image: HTMLImageElement) => {
        image.scrollIntoView();
        try {
          await image.decode();
        } catch {
          return false;
        }
        return image.naturalWidth > 0;
      })
      .catch(() => false);
    check(artifactLoaded, 'Ekran görüntüsü gerçekten yüklendi');
    await page.locator('.artifact-button').first().click();
    const lightboxVisible = await page
      .locator('.lightbox')
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    check(lightboxVisible, 'Ekran görüntüsü büyütülebildi');
    if (lightboxVisible)
      await page.getByRole('button', { name: 'Görseli kapat' }).click();

    // PageSpeed sonuçları raporda yer alır
    const pageSpeedSection = page.locator('.pagespeed');
    check(
      (await pageSpeedSection.count()) > 0,
      'PageSpeed Insights bölümü raporda gösteriliyor',
    );
    const scoreText = (await pageSpeedSection.textContent()) ?? '';
    check(
      scoreText.includes('Performans') && scoreText.includes('82'),
      'PageSpeed puanları raporda görünüyor',
    );

    // Geçmiş görünümü
    await gotoView(page, 'Geçmiş', 'history');
    const historyText = (await page.textContent('body')) ?? '';
    check(
      historyText.includes(target),
      'Tarama geçmişi taranan adresi listeledi',
    );

    await page.locator('.job-main', { hasText: target }).first().click();
    await page.waitForFunction(
      () =>
        document.querySelector('.scans')?.getAttribute('data-view') ===
        'report',
      undefined,
      { timeout: 15000 },
    );
    const reopened = await page
      .getByRole('button', { name: 'Geçmişe dön' })
      .isVisible()
      .catch(() => false);
    check(reopened, 'Geçmişten rapor açılabiliyor');

    await page.screenshot({
      path: join(directory, 'report-desktop.png'),
      fullPage: false,
    });

    // Aynı adresle ikinci tarama: karşılaştırma gerçek veriyle çalışmalı
    await gotoView(page, 'Yeni Tarama', 'new-scan');
    await page.getByLabel('Taranacak adresler').fill(target);
    await page.getByRole('button', { name: 'Taramayı başlat' }).click();
    const secondReport = await page
      .waitForFunction(
        () =>
          document.body.textContent?.includes(
            'JavaScript çalışma zamanı hatası',
          ) ?? false,
        undefined,
        { timeout: 60000 },
      )
      .then(() => true)
      .catch(() => false);
    check(secondReport, 'İkinci tarama da rapor görünümüne ulaştı');

    // Karşılaştırma görünümü
    await gotoView(page, 'Karşılaştırma', 'compare');
    const compareVisible = await page
      .waitForFunction(
        () =>
          document.body.textContent?.includes('İki taramayı karşılaştır') ??
          false,
        undefined,
        { timeout: 15000 },
      )
      .then(() => true)
      .catch(() => false);
    check(compareVisible, 'Karşılaştırma görünümü menüden açılıyor');
    const selects = page.locator('.compare mat-select:visible');
    await selects.nth(0).click();
    await page.getByRole('option').nth(1).click();
    await selects.nth(1).click();
    await page.getByRole('option').nth(1).click();
    await selects.nth(2).click();
    const urlOption = page.getByRole('option').filter({ hasText: target });
    const urlOptionCount = await urlOption.count();
    check(urlOptionCount > 0, 'Karşılaştırma için ortak adres seçilebiliyor');
    if (urlOptionCount > 0) {
      await urlOption.first().click();
      await page.locator('.compare button', { hasText: 'Karşılaştır' }).click();
      const compared = await page
        .waitForFunction(
          () =>
            document.body.textContent?.includes('Karşılaştırma sonucu') ??
            false,
          undefined,
          { timeout: 20000 },
        )
        .then(() => true)
        .catch(() => false);
      check(compared, 'Karşılaştırma sonucu karşılaştırma görünümünde çıktı');
      const compareText = (await page.textContent('body')) ?? '';
      check(
        compareText.includes('devam eden'),
        'Karşılaştırma yeni/devam eden/çözülen sayılarını gösteriyor',
      );
    }
    // Engellenen sayfa: eksik tarama açıklaması
    await gotoView(page, 'Yeni Tarama', 'new-scan');
    await page.getByLabel('Taranacak adresler').fill(blockedTarget);
    await page.getByRole('button', { name: 'Taramayı başlat' }).click();
    const explained = await page
      .waitForFunction(
        () => document.body.textContent?.includes('Eksik tarama') ?? false,
        undefined,
        { timeout: 60000 },
      )
      .then(() => true)
      .catch(() => false);
    check(explained, 'Engellenen sayfa "Eksik tarama" olarak bildirildi');
    const blockedBody = (await page.textContent('body')) ?? '';
    check(
      blockedBody.includes('Bot koruması'),
      'Rapor görünümünde erişim engeli açıklaması var',
    );
    check(
      !blockedBody.includes('bulgu bulundu'),
      'Engellenen sayfa için bulgu sayısı gösterilmedi',
    );
    check(
      blockedBody.includes('değerlendirme yok'),
      'Analiz edilmeyen raporda sıfır sayaç yerine değerlendirme yok gösteriliyor',
    );
    check(
      blockedBody.includes('analiz tamamlanamadı'),
      'Analiz tamamlanamayan taramada yeşil başarı mesajı gösterilmiyor',
    );
    const blockedJob = await db.scanJob.findFirst({
      where: { result: { contains: 'BOT_PROTECTION' } },
    });
    check(
      Boolean(blockedJob) && blockedJob?.status === 'completed',
      'Engellenen tarama eksik olarak kaydedildi',
    );

    // Veritabanı doğrulaması
    const stored = await db.scanJob.findMany({ orderBy: { createdAt: 'asc' } });
    check(stored.length === 3, `Üç tarama kaydı oluştu (${stored.length})`);
    check(
      stored[0]?.status === 'completed',
      'Veritabanındaki tarama tamamlandı',
    );
    check(
      (stored[0]?.result ?? '').includes('X01'),
      'Bulgu sonucu veritabanına yazıldı',
    );
    check(
      stored.every((job) => job.userId === user.id),
      'Tüm tarama kayıtları doğru kullanıcıya bağlı',
    );
    const other = await db.scanJob.findMany({
      where: { userId: { not: user.id } },
    });
    check(other.length === 0, 'Başka kullanıcıya ait tarama kaydı yok');

    // Masaüstü 1440: sol menü kalıcı görünür
    const desktopNav = await page
      .locator('.nav:visible')
      .isVisible()
      .catch(() => false);
    check(desktopNav, 'Masaüstünde sol menü görünür');

    // Tablet 768: menü daraltılmış, içerik sığar
    const tablet = await browser.newContext({
      viewport: { width: 768, height: 1024 },
    });
    await tablet.addCookies([
      {
        name: 'nabiz-session',
        value: token,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
      },
    ]);
    const tabletPage = await tablet.newPage();
    await tabletPage.goto(origin, { waitUntil: 'networkidle' });
    const tabletOverflow = await tabletPage.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const tabletWidth = await tabletPage.evaluate(
      () => document.documentElement.clientWidth,
    );
    check(
      tabletOverflow <= tabletWidth + 1,
      `Tablet 768 px'te yatay taşma yok (${tabletOverflow} <= ${tabletWidth})`,
    );
    await tabletPage.screenshot({
      path: join(directory, 'report-tablet.png'),
      fullPage: false,
    });

    // Mobil görünüm: menü düğmesi açıp kapatabilir
    const mobile = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    await mobile.addCookies([
      {
        name: 'nabiz-session',
        value: token,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
      },
    ]);
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(origin, { waitUntil: 'networkidle' });
    const navHidden = await mobilePage
      .locator('.nav:visible')
      .isVisible()
      .catch(() => false);
    check(!navHidden, 'Mobilde sol menü varsayılan olarak kapalı');
    await mobilePage.getByRole('button', { name: 'Menüyü aç' }).click();
    await mobilePage.waitForTimeout(500);
    const navOpened = await mobilePage
      .locator('.nav:visible')
      .isVisible()
      .catch(() => false);
    check(navOpened, 'Mobilde menü düğmesi menüyü açıyor');
    await gotoView(mobilePage, 'Geçmiş', 'history');
    await mobilePage.waitForTimeout(500);
    const navClosed = await mobilePage
      .locator('.nav:visible')
      .isVisible()
      .catch(() => false);
    check(!navClosed, 'Menüden bir görünüm seçince menü kapanıyor');
    const mobileOverflow = await mobilePage.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const mobileWidth = await mobilePage.evaluate(
      () => document.documentElement.clientWidth,
    );
    check(
      mobileOverflow <= mobileWidth + 1,
      `Mobil 375 px'te yatay taşma yok (${mobileOverflow} <= ${mobileWidth})`,
    );
    await mobilePage.screenshot({
      path: join(directory, 'report-mobile.png'),
      fullPage: false,
    });

    // 320 px genişlik
    const narrow = await browser.newContext({
      viewport: { width: 320, height: 720 },
    });
    await narrow.addCookies([
      {
        name: 'nabiz-session',
        value: token,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
      },
    ]);
    const narrowPage = await narrow.newPage();
    await narrowPage.goto(origin, { waitUntil: 'networkidle' });
    const narrowOverflow = await narrowPage.evaluate(
      () => document.documentElement.scrollWidth,
    );
    const narrowWidth = await narrowPage.evaluate(
      () => document.documentElement.clientWidth,
    );
    check(
      narrowOverflow <= narrowWidth + 1,
      `320 px genişlikte yatay taşma yok (${narrowOverflow} <= ${narrowWidth})`,
    );

    step(
      `Ekran görüntüleri: ${join(directory, 'report-desktop.png')}, ${join(
        directory,
        'report-mobile.png',
      )}`,
    );
    await fixture.close();
  } finally {
    await browser?.close();
    if (webServer) stopProcess(webServer);
    apiServer?.close();
    await jobs?.stop();
    await db.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error(`[e2e] ${failures.length} kontrol başarısız:`);
    for (const failure of failures) console.error(`[e2e] - ${failure}`);
    process.exitCode = 1;
    return;
  }
  step('Tüm uçtan uca kontroller başarılı');
}

await main();
