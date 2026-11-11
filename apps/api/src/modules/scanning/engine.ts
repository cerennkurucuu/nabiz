/**
 * Analiz motorlarının durum modeli.
 *
 * Motorlar birbirinden bağımsızdır: biri başarısız olduğunda diğerlerinin
 * sonuçları korunur. Durum, rapor arayüzünde "çalıştı/geçti" ayrımını
 * açıkça gösterir.
 */

export type EngineId =
  'technical' | 'ui' | 'accessibility' | 'seo' | 'pagespeed';

export type EngineStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial'
  | 'blocked'
  | 'failed'
  | 'unavailable';

export interface EngineReport {
  id: EngineId;
  status: EngineStatus;
  /** Durumu açıklayan Türkçe metin. */
  message: string;
  findings: number;
  checks: number;
  startedAt?: string | undefined;
  finishedAt?: string | undefined;
}

export const ENGINE_LABELS: Record<EngineId, string> = {
  technical: 'Teknik analiz',
  ui: 'UI/UX ve responsive',
  accessibility: 'Erişilebilirlik ve kontrast',
  seo: 'SEO',
  pagespeed: 'PageSpeed Insights',
};

export const ENGINE_STATUS_LABELS: Record<EngineStatus, string> = {
  queued: 'Sırada',
  running: 'Çalışıyor',
  completed: 'Tamamlandı',
  partial: 'Kısmen tamamlandı',
  blocked: 'Engellendi',
  failed: 'Başarısız',
  unavailable: 'Veri alınamadı',
};

export function createEngineReport(
  id: EngineId,
  status: EngineStatus,
  message: string,
  extra: { findings?: number; checks?: number } = {},
): EngineReport {
  return {
    id,
    status,
    message,
    findings: extra.findings ?? 0,
    checks: extra.checks ?? 0,
  };
}
