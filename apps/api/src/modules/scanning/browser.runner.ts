import type { BrowserContext } from 'playwright';
import { chromium } from './browser.runtime.js';
import type { ScanRunner, ScanRunResult } from './jobs.service.js';
import { safeFetch, newBudget } from './safe-fetch.js';
import {
  finding,
  dedupeFindings,
  type PageReport,
  type Finding,
} from './findings.js';
import {
  assessDocumentAccess,
  isAmbiguousResourceStatus,
  type AccessAssessment,
} from './access.js';
import { analyzeDom, type DomMeasurements } from './dom.rules.js';
import {
  createCheck,
  type CheckResult,
  type CheckRule,
  type CheckStatus,
} from './checks.js';
import { analyzeUx, pageOverflowMetrics } from './ux.rules.js';
import { collectSeo, type SeoPageData } from './seo.rules.js';
import { collectContrastSamples } from './contrast.rules.js';
import { injectAxe, markCovered, runAxe } from './accessibility.js';
import {
  evaluateAxe,
  evaluateContrastSamples,
  evaluateSeo,
  evaluateUx,
  type EngineOutcome,
} from './engines.js';
import {
  createEngineReport,
  type EngineId,
  type EngineReport,
  type EngineStatus,
} from './engine.js';
import type { ArtifactInput } from './artifacts.js';

const isTimeoutError = (error: unknown) =>
  error instanceof Error &&
  (error.name === 'TimeoutError' || /timeout/i.test(error.message));

/** Ekran görüntüsü ve öğe kanıtı için üst sınırlar. */
const MAX_ELEMENT_SHOTS = 4;
const BREAKPOINT_WIDTHS = [320, 375, 768, 1024, 1440];

interface PageSignals {
  pageErrors: string[];
  failedResources: { url: string; status: number }[];
  uncertainResources: { url: string; reason: string }[];
  linkFailures: { url: string; status: number }[];
  linkUncertain: { url: string; reason: string }[];
  linksChecked: number;
  /** Ana dokümanın yönlendirme zinciri (SEO kontrolü için). */
  redirectChain: string[];
}

interface EngineAccumulator {
  id: EngineId;
  statuses: EngineStatus[];
  checks: number;
  findings: number;
  notes: string[];
}

export class BrowserRunner implements ScanRunner {
  constructor(private readonly fetcher: typeof safeFetch = safeFetch) {}
  async run(
    urls: string[],
    signal: AbortSignal,
    progress: (value: number) => Promise<void>,
  ): Promise<ScanRunResult> {
    signal.throwIfAborted();
    const browser = await chromium.launch({
      headless: true,
      chromiumSandbox: true,
      timeout: 10000,
      ...(process.env['CHROMIUM_EXECUTABLE_PATH']
        ? { executablePath: process.env['CHROMIUM_EXECUTABLE_PATH'] }
        : {}),
      // Defense in depth only; OS egress isolation is still a release prerequisite.
      args: [
        '--disable-background-networking',
        '--disable-quic',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      ],
    });
    const abort = () => {
      void browser.close().catch(() => undefined);
    };
    signal.addEventListener('abort', abort, { once: true });
    const pages: PageReport[] = [];
    const checks: CheckResult[] = [];
    const captures: ArtifactInput[] = [];
    const budget = newBudget();
    const accumulators = new Map<EngineId, EngineAccumulator>();
    const accumulator = (id: EngineId) => {
      const existing = accumulators.get(id);
      if (existing) return existing;
      const created: EngineAccumulator = {
        id,
        statuses: [],
        checks: 0,
        findings: 0,
        notes: [],
      };
      accumulators.set(id, created);
      return created;
    };
    try {
      signal.throwIfAborted();
      for (const url of urls)
        for (const viewport of ['desktop', 'mobile'] as const) {
          signal.throwIfAborted();
          let context: BrowserContext | undefined;
          const signals: PageSignals = {
            pageErrors: [],
            failedResources: [],
            uncertainResources: [],
            linkFailures: [],
            linkUncertain: [],
            linksChecked: 0,
            redirectChain: [],
          };
          // The main document decides whether the page can be evaluated at all.
          let document: AccessAssessment = { access: 'ok' };
          let documentFailed = false;
          let documentTimedOut = false;
          const report: PageReport = {
            url,
            viewport,
            complete: true,
            findings: [],
            access: 'ok',
          };
          const add: typeof report.findings.push = (...items) => {
            if (report.findings.length >= 200) {
              report.complete = false;
              return report.findings.length;
            }
            return report.findings.push(...items);
          };
          const pageSignal = AbortSignal.any([
            signal,
            AbortSignal.timeout(25000),
          ]);
          try {
            context = await browser.newContext({
              viewport:
                viewport === 'mobile'
                  ? { width: 390, height: 844 }
                  : { width: 1440, height: 900 },
              serviceWorkers: 'block',
              acceptDownloads: false,
            });
            const page = await context.newPage();
            page.setDefaultTimeout(5000);
            page.setDefaultNavigationTimeout(20000);
            // axe-core betiği CSP'den bağımsız olarak sayfaya enjekte edilir.
            await injectAxe(page);
            context.on('page', (popup) => {
              if (popup !== page) void popup.close().catch(() => undefined);
            });
            await context.routeWebSocket('**/*', (socket) => {
              report.complete = false;
              socket.close();
            });
            await context.route('**/*', async (route) => {
              const request = route.request();
              let isDocument = false;
              try {
                isDocument =
                  request.isNavigationRequest() &&
                  request.frame() === page.mainFrame();
              } catch {
                isDocument = false;
              }
              try {
                if (request.method() !== 'GET')
                  throw new Error('METHOD_BLOCKED');
                const response = await this.fetcher(
                  request.url(),
                  pageSignal,
                  budget,
                );
                if (isDocument) {
                  const assessment = assessDocumentAccess(
                    response.status,
                    response.body.toString('utf8'),
                  );
                  document = assessment;
                  if (assessment.access !== 'ok') report.complete = false;
                  if (response.url !== request.url())
                    signals.redirectChain.push(
                      `${request.url()} → ${response.url}`,
                    );
                } else if (response.status >= 400) {
                  // Resources of a blocked page carry no quality signal.
                  if (document.access === 'ok') {
                    const ambiguous = isAmbiguousResourceStatus(
                      response.status,
                    );
                    if (ambiguous)
                      signals.uncertainResources.push({
                        url: request.url(),
                        reason: `HTTP ${response.status}`,
                      });
                    else
                      signals.failedResources.push({
                        url: request.url(),
                        status: response.status,
                      });
                    add(
                      finding(
                        'T02',
                        url,
                        '',
                        `${response.status} ${request.url()}`,
                        ambiguous,
                      ),
                    );
                  }
                }
                // Redirect flattening cannot preserve every site's navigation semantics.
                if (response.url !== request.url()) {
                  report.complete = false;
                }
                const allowedHeaders: Record<string, string> = {};
                for (const key of [
                  'content-type',
                  'content-encoding',
                  'access-control-allow-origin',
                  'content-security-policy',
                  'x-content-type-options',
                ])
                  if (response.headers[key])
                    allowedHeaders[key] = response.headers[key];
                await route.fulfill({
                  status: response.status,
                  headers: allowedHeaders,
                  body: response.body,
                });
              } catch (error) {
                if (isDocument) {
                  documentFailed = true;
                  documentTimedOut = isTimeoutError(error);
                  report.complete = false;
                } else {
                  report.complete = false;
                  signals.uncertainResources.push({
                    url: request.url(),
                    reason: isTimeoutError(error)
                      ? 'Zaman aşımı'
                      : 'Güvenlik veya aktarım sınırı',
                  });
                  add(
                    finding(
                      'T02',
                      url,
                      '',
                      `Güvenlik, süre veya aktarım sınırı nedeniyle doğrulanamadı: ${request.url()}`,
                      true,
                    ),
                  );
                }
                await route.abort('blockedbyclient').catch(() => undefined);
              }
            });
            page.on('pageerror', (error) => {
              signals.pageErrors.push(error.message);
              add(finding('T01', url, '', error.message));
            });
            // Console errors are evidence, not necessarily uncaught JavaScript failures.
            const consoleErrors: string[] = [];
            page.on('console', (message) => {
              if (message.type() === 'error' && consoleErrors.length < 20)
                consoleErrors.push(message.text().slice(0, 500));
            });
            page.on('requestfailed', (request) => {
              report.complete = false;
              signals.uncertainResources.push({
                url: request.url(),
                reason: 'İstek tamamlanamadı',
              });
              add(
                finding(
                  'T02',
                  url,
                  '',
                  `İstek tamamlanamadı: ${request.url()}`,
                  true,
                ),
              );
            });
            await page.goto(url, { waitUntil: 'load' });
            if (document.access === 'ok') {
              const technical = accumulator('technical');
              const ui = accumulator('ui');
              const accessibility = accumulator('accessibility');
              const seo = accumulator('seo');

              // axe-core önce çalışır: değerlendirdiği öğeler işaretlenir ve
              // kendi ölçümlerimizde tekrar raporlanmaz.
              const axe = await runAxe(page, 20000);
              await markCovered(page, [
                ...axe.contrastCovered,
                ...axe.labelCovered,
                ...axe.nameCovered,
                ...axe.targetSizeViolations.map((item) => item.target),
              ]);
              const axeOutcome = evaluateAxe(axe, { url, viewport });
              const axeAvailable = axe.available;

              const dom = await analyzeDom(page);
              report.complete &&= !dom.truncated;
              for (const item of dom.findings) {
                const f = finding(item.rule, url, item.selector, item.evidence);
                // A blocked network can explain an unloaded image; do not claim a broken file.
                if (
                  item.rule === 'T04' &&
                  (!report.complete || signals.uncertainResources.length > 0)
                ) {
                  f.status = 'uncertain';
                  f.confidence = 'low';
                  f.severity = 'info';
                }
                add(f);
              }

              const ux = await analyzeUx(page, viewport === 'mobile');
              const uxOutcome = evaluateUx(
                ux,
                { url, viewport },
                {
                  extraTouchTargets: axe.targetSizeViolations.map((item) => ({
                    selector: item.target,
                    evidence: item.evidence,
                  })),
                  extraUnnamedControls: axe.nameViolations,
                },
              );

              const samples = await collectContrastSamples(page);
              // axe-core kontrast kuralını çalıştırdıysa kontrol kaydı ondan
              // gelir; kendi ölçümümüz yalnızca ek kanıt üretir.
              const contrastOutcome = evaluateContrastSamples(
                samples,
                {
                  url,
                  viewport,
                },
                { emitChecks: !axeAvailable },
              );

              let seoOutcome: EngineOutcome = { checks: [], findings: [] };
              let seoData: SeoPageData | undefined;
              if (viewport === 'desktop') {
                seoData = await collectSeo(page);
                seoOutcome = evaluateSeo(
                  seoData,
                  {
                    redirected: signals.redirectChain.length > 0,
                    chain: signals.redirectChain,
                  },
                  { url, viewport },
                );
              }

              // Responsive kırılma taraması: birkaç genişlikte yatay taşma ölçülür.
              let breakpointOutcome: EngineOutcome = {
                checks: [],
                findings: [],
              };
              if (viewport === 'desktop') {
                breakpointOutcome = await measureBreakpoints(page, url);
              }

              const technicalOutcome = buildPageChecks({
                url,
                viewport,
                signals,
                measurements: dom.measurements,
                axeLabelViolations: axe.labelViolations,
              });

              const technicalFindings = report.findings;
              report.findings = [
                ...technicalFindings,
                ...uxOutcome.findings,
                ...axeOutcome.findings,
                ...contrastOutcome.findings,
                ...seoOutcome.findings,
                ...breakpointOutcome.findings,
              ];
              checks.push(
                ...technicalOutcome.checks,
                ...uxOutcome.checks,
                ...axeOutcome.checks,
                ...contrastOutcome.checks,
                ...seoOutcome.checks,
                ...breakpointOutcome.checks,
              );

              technical.checks += technicalOutcome.checks.length;
              technical.findings += technicalFindings.length;
              ui.checks +=
                uxOutcome.checks.length + breakpointOutcome.checks.length;
              ui.findings +=
                uxOutcome.findings.length + breakpointOutcome.findings.length;
              accessibility.checks += axeOutcome.checks.length;
              accessibility.findings += axeOutcome.findings.length;
              if (!axeAvailable)
                accessibility.notes.push(
                  'axe-core çalıştırılamadı; kontrast ölçümü kendi hesabımızla yapıldı.',
                );
              seo.checks += seoOutcome.checks.length;
              seo.findings += seoOutcome.findings.length;

              for (const link of dom.links) {
                pageSignal.throwIfAborted();
                signals.linksChecked++;
                try {
                  const response = await this.fetcher(link, pageSignal, budget);
                  if (response.status >= 400) {
                    signals.linkFailures.push({
                      url: link,
                      status: response.status,
                    });
                    add(
                      finding(
                        'T03',
                        url,
                        link,
                        `HTTP ${response.status}`,
                        isAmbiguousResourceStatus(response.status),
                      ),
                    );
                  }
                } catch (error) {
                  report.complete = false;
                  signals.linkUncertain.push({
                    url: link,
                    reason: isTimeoutError(error)
                      ? 'Zaman aşımı'
                      : 'Güvenlik veya ağ sınırı',
                  });
                  add(
                    finding(
                      'T03',
                      url,
                      link,
                      'Hedef güvenlik veya ağ sınırları nedeniyle doğrulanamadı.',
                      true,
                    ),
                  );
                }
              }
              // Bağlantı kontrolü teknik motora aittir; DOM bulguları da burada toplanır.
              const linkOutcome = buildLinkChecks({
                url,
                viewport,
                signals,
              });
              checks.push(...linkOutcome.checks);
              technical.checks += linkOutcome.checks.length;
              technical.findings += linkOutcome.findings.length;

              // Ekran görüntüleri: her başarılı sayfa için masaüstü ve mobil.
              const shot = await capturePage(page, viewport, url);
              if (shot) captures.push(shot);
              const elementShots = await captureElements(
                page,
                report.findings,
                viewport,
                url,
              );
              captures.push(...elementShots);
              if (consoleErrors.length) report.consoleErrors = consoleErrors;
            } else {
              // The document was blocked or unreadable: nothing on that page is
              // evidence about the site, so no finding is produced for it.
              report.complete = false;
              report.access = document.access;
              if (document.error) report.error = document.error;
              if (document.statusMessage)
                report.statusMessage = document.statusMessage;
              report.findings = [];
              for (const id of [
                'technical',
                'ui',
                'accessibility',
                'seo',
              ] as EngineId[])
                accumulator(id).statuses.push('blocked');
              checks.push(
                ...buildBlockedPageChecks({
                  url,
                  viewport,
                  message:
                    document.statusMessage ??
                    'Sayfaya erişilemediği için bu görünüm analiz edilemedi.',
                  error: document.error ?? null,
                }),
              );
            }
          } catch (error) {
            report.complete = false;
            if (document.access !== 'ok') {
              report.access = document.access;
              if (document.error) report.error = document.error;
              if (document.statusMessage)
                report.statusMessage = document.statusMessage;
            } else if (documentTimedOut) {
              report.error = 'TIMEOUT';
              report.statusMessage =
                'Sayfa yükleme zaman aşımına uğradı. Bu görünüm analiz edilemedi.';
            } else if (documentFailed) {
              report.error = 'PAGE_INCOMPLETE';
              report.statusMessage =
                'Ana sayfa güvenlik, süre veya aktarım sınırı nedeniyle yüklenemedi. Bu görünüm analiz edilemedi.';
            } else if (signal.aborted) {
              report.error = 'CANCELLED';
            } else if (isTimeoutError(error)) {
              report.error = 'TIMEOUT';
              report.statusMessage =
                'Sayfa yükleme zaman aşımına uğradı. Bu görünüm analiz edilemedi.';
            } else {
              report.error = 'PAGE_INCOMPLETE';
              report.statusMessage =
                'Sayfa tam olarak yüklenemedi; bu görünüm analizi eksik olabilir.';
            }
            report.findings = report.findings.filter(
              (item) => item.status === 'uncertain',
            );
            for (const id of [
              'technical',
              'ui',
              'accessibility',
              'seo',
            ] as EngineId[])
              accumulator(id).statuses.push('failed');
            checks.push(
              ...buildBlockedPageChecks({
                url,
                viewport,
                message:
                  report.statusMessage ??
                  'Bu görünüm analiz edilemedi; kontroller çalıştırılamadı.',
                error: report.error ?? null,
              }),
            );
          } finally {
            await context?.close().catch(() => undefined);
          }
          // Identical events are merged; separate resources retain their own evidence.
          report.findings = dedupeFindings([
            ...new Map(report.findings.map((f) => [f.id, f])).values(),
          ]);
          pages.push(report);
          await progress(Math.round((pages.length / (urls.length * 2)) * 100));
        }
    } finally {
      signal.removeEventListener('abort', abort);
      await browser.close();
    }
    signal.throwIfAborted();
    const engines = [...accumulators.values()].map((entry) =>
      buildEngineReport(entry),
    );
    return {
      pages,
      complete: pages.every((page) => page.complete),
      checks,
      engines,
      captures,
    };
  }
}

function buildEngineReport(entry: EngineAccumulator): EngineReport {
  const statuses = entry.statuses;
  let status: EngineStatus = 'completed';
  if (statuses.length) {
    if (statuses.every((value) => value === 'blocked')) status = 'blocked';
    else if (statuses.every((value) => value === 'failed')) status = 'failed';
    else if (
      statuses.some((value) => value === 'failed' || value === 'blocked')
    )
      status = 'partial';
  }
  const message =
    status === 'completed'
      ? 'Motor tamamlandı.'
      : status === 'partial'
        ? 'Motor kısmen tamamlandı; bazı görünümler analiz edilemedi.'
        : status === 'blocked'
          ? 'Sayfaya erişilemediği için motor çalıştırılamadı.'
          : status === 'failed'
            ? 'Motor çalıştırılamadı.'
            : 'Motor durumu bilinmiyor.';
  return {
    ...createEngineReport(entry.id, status, message, {
      findings: entry.findings,
      checks: entry.checks,
    }),
    notes: entry.notes,
  } as EngineReport;
}

// Kontrol kayıtları: her kural için çalıştı/geçti/sorunlu/doğrulanamadı/atalandı.
function buildPageChecks(input: {
  url: string;
  viewport: 'desktop' | 'mobile';
  signals: PageSignals;
  measurements: DomMeasurements;
  /** axe-core'un bulduğu etiketsiz alan sayısı. */
  axeLabelViolations?: number | undefined;
}): EngineOutcome {
  const { url, viewport, signals, measurements } = input;
  const axeLabelViolations = input.axeLabelViolations ?? 0;
  const checks: CheckResult[] = [];
  const findings: Finding[] = [];
  type CheckExtra = {
    measurement?: string | undefined;
    evidence?: string | undefined;
    reason?: string | undefined;
  };
  const push = (
    rule: CheckRule,
    status: CheckStatus,
    message: string,
    extra: CheckExtra = {},
  ) =>
    checks.push(
      createCheck({ rule, status, url, viewport, message, ...extra }),
    );

  push(
    'T01',
    signals.pageErrors.length ? 'failed' : 'passed',
    signals.pageErrors.length
      ? 'Yakalanmamış JavaScript hatası bulundu.'
      : 'Sayfa yüklenirken JavaScript hatası oluşmadı.',
    {
      measurement: `${signals.pageErrors.length} hata`,
      evidence: signals.pageErrors[0],
    },
  );

  if (signals.failedResources.length) {
    push('T02', 'failed', 'Bazı kaynak istekleri başarısız oldu.', {
      measurement: `${signals.failedResources.length} başarısız istek`,
      evidence: signals.failedResources
        .slice(0, 3)
        .map((item) => `${item.status} ${item.url}`)
        .join(' | '),
    });
  } else if (signals.uncertainResources.length) {
    push('T02', 'inconclusive', 'Bazı kaynak istekleri doğrulanamadı.', {
      measurement: `${signals.uncertainResources.length} doğrulanamayan istek`,
      reason: signals.uncertainResources
        .slice(0, 3)
        .map((item) => `${item.reason} (${item.url})`)
        .join(' | '),
    });
  } else {
    push('T02', 'passed', 'Tüm kaynak istekleri başarılı yanıt verdi.', {
      measurement: '0 başarısız istek',
    });
  }

  if (!measurements.imagesChecked) {
    push(
      'T04',
      'skipped',
      'Görsel bulunamadığı için kontrol çalıştırılamadı.',
      {
        measurement: '0 görsel',
        reason: 'Sayfada görünür görsel yok.',
      },
    );
  } else {
    push(
      'T04',
      measurements.imagesBroken ? 'failed' : 'passed',
      measurements.imagesBroken
        ? 'Yüklenemeyen görsel bulundu.'
        : 'Tüm görseller yüklendi.',
      {
        measurement: `${measurements.imagesChecked} görsel incelendi, ${measurements.imagesBroken} tanesi bozuk`,
      },
    );
  }

  if (!measurements.buttonsChecked) {
    push('U04', 'skipped', 'Karşılaştırılabilir buton bulunamadı.', {
      measurement: '0 buton',
      reason: 'Sayfada stil sınıfı olan buton yok.',
    });
  } else if (!measurements.buttonGroupsCompared) {
    push('U04', 'skipped', 'Karşılaştırılabilir buton grubu oluşmadı.', {
      measurement: `${measurements.buttonsChecked} buton, 0 karşılaştırılabilir grup`,
      reason: 'Benzer gruplar için en az üç buton gerekir.',
    });
  } else {
    const deviations = measurements.buttonDeviations;
    push(
      'U04',
      deviations ? 'failed' : 'passed',
      deviations
        ? 'Benzer butonlarda stil farkı bulundu.'
        : 'Benzer buton gruplarında stil farkı bulunmadı.',
      {
        measurement: `${measurements.buttonsChecked} buton, ${measurements.buttonGroupsCompared} grup karşılaştırıldı`,
      },
    );
  }

  if (!measurements.fieldsChecked && !axeLabelViolations) {
    push('X01', 'skipped', 'Etiketlenecek görünür form alanı yok.', {
      measurement: '0 form alanı',
      reason: 'Sayfada görünür input, select veya textarea bulunamadı.',
    });
  } else {
    push(
      'X01',
      measurements.fieldsUnlabeled || axeLabelViolations ? 'failed' : 'passed',
      measurements.fieldsUnlabeled || axeLabelViolations
        ? 'Erişilebilir etiketi olmayan form alanı bulundu.'
        : 'Tüm form alanlarının erişilebilir etiketi var.',
      {
        measurement: `${measurements.fieldsChecked} alan incelendi, ${measurements.fieldsUnlabeled + axeLabelViolations} tanesi etiketsiz${axeLabelViolations ? ` (axe-core ${axeLabelViolations} alanı işaretledi)` : ''}`,
      },
    );
  }

  return { checks, findings };
}

function buildLinkChecks(input: {
  url: string;
  viewport: 'desktop' | 'mobile';
  signals: PageSignals;
}): EngineOutcome {
  const { url, viewport, signals } = input;
  const checks: CheckResult[] = [];
  const push = (
    rule: CheckRule,
    status: CheckStatus,
    message: string,
    extra: {
      measurement?: string | undefined;
      evidence?: string | undefined;
      reason?: string | undefined;
    } = {},
  ) =>
    checks.push(
      createCheck({ rule, status, url, viewport, message, ...extra }),
    );

  if (signals.linkFailures.length) {
    push('T03', 'failed', 'Bazı iç bağlantılar başarısız oldu.', {
      measurement: `${signals.linksChecked} bağlantıdan ${signals.linkFailures.length} tanesi hatalı`,
      evidence: signals.linkFailures
        .slice(0, 3)
        .map((item) => `HTTP ${item.status} ${item.url}`)
        .join(' | '),
    });
  } else if (signals.linkUncertain.length) {
    push('T03', 'inconclusive', 'Bazı iç bağlantılar doğrulanamadı.', {
      measurement: `${signals.linksChecked} bağlantıdan ${signals.linkUncertain.length} tanesi doğrulanamadı`,
      reason: signals.linkUncertain
        .slice(0, 3)
        .map((item) => `${item.reason} (${item.url})`)
        .join(' | '),
    });
  } else {
    push(
      'T03',
      signals.linksChecked ? 'passed' : 'skipped',
      signals.linksChecked
        ? 'İç bağlantıların tamamı doğrulandı.'
        : 'Sayfada doğrulanabilir iç bağlantı bulunamadı.',
      { measurement: `${signals.linksChecked} bağlantı doğrulandı` },
    );
  }
  return { checks, findings: [] };
}

// Erişilemeyen sayfalar için kontroller "çalıştırılamadı" olarak işaretlenir.
function buildBlockedPageChecks(input: {
  url: string;
  viewport: 'desktop' | 'mobile';
  message: string;
  error?: string | null;
}): CheckResult[] {
  const { url, viewport, message, error } = input;
  const rules: CheckRule[] = [
    'T01',
    'T02',
    'T03',
    'T04',
    'U02',
    'U04',
    'U10',
    'U11',
    'U12',
    'U13',
    'U14',
    'U15',
    'U16',
    'U17',
    'X01',
    'A01',
    'A02',
    'A03',
    'A04',
    'A05',
    'A06',
    'A07',
    'A08',
    'S01',
    'S02',
    'S03',
    'S04',
    'S05',
    'S06',
    'S07',
    'S08',
    'S09',
    'S10',
    'S11',
    'S12',
    'S13',
    'S14',
  ];
  return rules.map((rule) =>
    createCheck({
      rule,
      status: 'skipped',
      url,
      viewport,
      message: 'Sayfa erişilemediği için kontrol çalıştırılamadı.',
      reason: error ? `${message} (${error})` : message,
    }),
  );
}

/** Birkaç genişlikte yatay taşma ölçerek kırılma noktası davranışını denetler. */
async function measureBreakpoints(
  page: import('playwright').Page,
  url: string,
): Promise<EngineOutcome> {
  const original = page.viewportSize() ?? { width: 1440, height: 900 };
  const results: { width: number; scrollWidth: number; clientWidth: number }[] =
    [];
  try {
    for (const width of BREAKPOINT_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(120);
      const metrics = await page.evaluate(pageOverflowMetrics);
      results.push({
        width,
        scrollWidth: metrics.scrollWidth,
        clientWidth: metrics.clientWidth,
      });
    }
  } catch {
    // Ölçüm tamamlanamazsa kontrol belirsiz olarak işaretlenir.
  } finally {
    await page.setViewportSize(original).catch(() => undefined);
  }
  const broken = results.filter(
    (item) => item.scrollWidth > item.clientWidth + 2,
  );
  const checks: CheckResult[] = [];
  const findings: Finding[] = [];
  if (!results.length) {
    checks.push(
      createCheck({
        rule: 'U17',
        status: 'inconclusive',
        url,
        viewport: 'desktop',
        message: 'Kırılma noktası ölçümü tamamlanamadı.',
        reason: 'Sayfa yeniden boyutlandırılamadı.',
      }),
    );
    return { checks, findings };
  }
  checks.push(
    createCheck({
      rule: 'U17',
      status: broken.length ? 'failed' : 'passed',
      url,
      viewport: 'desktop',
      message: broken.length
        ? 'Bazı ekran genişliklerinde düzen bozuldu.'
        : 'Ölçülen genişliklerde düzen bozulmadı.',
      measurement: `${results.length} genişlik ölçüldü, ${broken.length} tanesinde yatay taşma var`,
      ...(broken.length
        ? {
            evidence: broken
              .map((item) => `${item.width}px: ${item.scrollWidth}px`)
              .join(' | '),
          }
        : {}),
    }),
  );
  for (const item of broken) {
    findings.push(
      finding(
        'U17',
        url,
        '',
        `${item.width}px genişlikte sayfa ${item.scrollWidth}px, görünüm ${item.clientWidth}px; yatay taşma oluştu.`,
      ),
    );
  }
  return { checks, findings };
}

async function capturePage(
  page: import('playwright').Page,
  viewport: 'desktop' | 'mobile',
  url: string,
): Promise<ArtifactInput | undefined> {
  try {
    const data = await page.screenshot({
      type: 'png',
      fullPage: false,
      timeout: 8000,
    });
    return {
      kind: 'page',
      viewport,
      url,
      pageKey: `${url}|${viewport}`,
      label: `${viewport} görünümü`,
      data,
    };
  } catch {
    return undefined;
  }
}

/** Hatalı öğeler için öğe bazlı görsel kanıt üretir. */
async function captureElements(
  page: import('playwright').Page,
  findings: Finding[],
  viewport: 'desktop' | 'mobile',
  url: string,
): Promise<ArtifactInput[]> {
  const shots: ArtifactInput[] = [];
  const seen = new Set<string>();
  for (const item of findings) {
    if (shots.length >= MAX_ELEMENT_SHOTS) break;
    if (!item.selector) continue;
    if (seen.has(item.selector)) continue;
    seen.add(item.selector);
    try {
      const data = await page
        .locator(item.selector)
        .first()
        .screenshot({ type: 'png', timeout: 3000 });
      shots.push({
        kind: 'element',
        viewport,
        url,
        pageKey: `${url}|${viewport}`,
        selector: item.selector,
        label: `${item.rule} · ${item.message}`,
        data,
      });
    } catch {
      // Öğe görünür değilse veya ölçülemezse kanıt üretilmez.
    }
  }
  return shots;
}
