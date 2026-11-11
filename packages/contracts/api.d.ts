export interface ApiResponse<T> {
  data: T;
}
export interface ApiErrorResponse {
  error: { code: string; message: string; requestId: string };
}
export interface Health {
  status: 'ok';
  service: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  configured: boolean;
  user: AuthUser | null;
  csrfToken: string | null;
}

export interface GoogleLoginChallenge {
  clientId: string;
  state: string;
  nonce: string;
}

export type ScanJobStatus =
  'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScanFinding {
  id: string;
  rule: string;
  category: 'technical' | 'ui' | 'ux' | 'accessibility' | 'seo';
  severity: 'error' | 'warning' | 'info';
  confidence: 'high' | 'medium' | 'low';
  url: string;
  selector: string;
  message: string;
  suggestion: string;
  evidence: string;
  status: 'confirmed' | 'uncertain';
  dedupeKey?: string;
}

/** Ekran görüntüsü kaydı; dosya API üzerinden servis edilir. */
export interface ScanArtifactRef {
  id: string;
  kind: 'page' | 'element';
  viewport: 'desktop' | 'mobile';
  url: string;
  label?: string;
  selector?: string;
  bytes: number;
  width?: number;
  height?: number;
}

export type ScanEngineStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial'
  | 'blocked'
  | 'failed'
  | 'unavailable';

export type ScanEngineId =
  'technical' | 'ui' | 'accessibility' | 'seo' | 'pagespeed';

export interface ScanEngineReport {
  id: ScanEngineId;
  status: ScanEngineStatus;
  message: string;
  findings: number;
  checks: number;
  notes?: string[];
}

export interface ScanPageReport {
  url: string;
  viewport: 'desktop' | 'mobile';
  complete: boolean;
  findings: ScanFinding[];
  error?: string;
  access?: 'ok' | 'blocked' | 'unavailable';
  statusMessage?: string;
  screenshot?: string;
  consoleErrors?: string[];
  artifacts?: ScanArtifactRef[];
}

export interface ScanResult {
  pages: ScanPageReport[];
  complete: boolean;
  /** Kural başına kontrol sonuçları. Eski kayıtlarda bulunmayabilir. */
  checks?: ScanCheck[];
  /** PageSpeed Insights sonuçları. Eski kayıtlarda bulunmayabilir. */
  pageSpeed?: PageSpeedResult[];
  /** Motor bazında durum. Eski kayıtlarda bulunmayabilir. */
  engines?: ScanEngineReport[];
}

export type CheckStatus = 'passed' | 'failed' | 'inconclusive' | 'skipped';

export type CheckRule =
  'T01' | 'T02' | 'T03' | 'T04' | 'U02' | 'U04' | 'X01' | 'PAGESPEED';

export type CheckCategory = 'technical' | 'ui' | 'ux' | 'performance';

export interface ScanCheck {
  id: string;
  rule: CheckRule;
  title: string;
  category: CheckCategory;
  status: CheckStatus;
  url: string;
  viewport: 'desktop' | 'mobile';
  message: string;
  measurement?: string;
  evidence?: string;
  reason?: string;
  checkedAt: string;
}

export interface PageSpeedScores {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
}

export interface PageSpeedMetrics {
  firstContentfulPaint?: string;
  largestContentfulPaint?: string;
  totalBlockingTime?: string;
  cumulativeLayoutShift?: string;
  speedIndex?: string;
  /** Etkileşim gecikmesi; API sürümü destekliyorsa dolar. */
  interactionToNextPaint?: string;
  /** İlk bayt süresi (sunucu yanıt süresi). */
  timeToFirstByte?: string;
}

/** CrUX saha verisi; laboratuvar (Lighthouse) ölçümlerinden ayrı tutulur. */
export interface PageSpeedFieldData {
  category: string | null;
  metrics: { name: string; value: string; percentile: string }[];
}

export type PageSpeedErrorCode =
  | 'PAGESPEED_QUOTA'
  | 'PAGESPEED_PERMISSION'
  | 'PAGESPEED_INVALID_KEY'
  | 'PAGESPEED_UNAVAILABLE'
  | 'PAGESPEED_TIMEOUT'
  | 'PAGESPEED_NETWORK'
  | 'PAGESPEED_INVALID_RESPONSE';

export interface PageSpeedResult {
  url: string;
  strategy: 'desktop' | 'mobile';
  ok: boolean;
  scores?: PageSpeedScores;
  metrics?: PageSpeedMetrics;
  /** CrUX saha verisi (sayfa düzeyi). */
  fieldData?: PageSpeedFieldData;
  /** CrUX saha verisi (kaynak düzeyi). */
  originFieldData?: PageSpeedFieldData;
  error?: string;
  /** Hata sınıfı; arayüzde hangi düzeltmenin gerektiğini gösterir. */
  errorCode?: PageSpeedErrorCode;
  /** API anahtarı yapılandırılmış mı. */
  apiKeyConfigured?: boolean;
  checkedAt: string;
}

export interface ScanJob {
  id: string;
  urls: string[];
  status: ScanJobStatus;
  progress: number;
  error: string | null;
  result: ScanResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScanCapabilities {
  enabled: boolean;
  maxUrls: number;
  hourlyLimit: number;
}

export interface ScanComparison {
  added: ScanFinding[];
  continuing: ScanFinding[];
  resolved: ScanFinding[];
  unverified: ScanFinding[];
}
