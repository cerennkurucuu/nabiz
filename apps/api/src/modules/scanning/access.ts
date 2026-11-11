/**
 * Access classification for scanned documents.
 *
 * A blocked or unavailable page is not a quality defect of the site. The
 * scanner reports it as an access state with an explanation and never produces
 * confirmed findings for content it could not read. No protection is bypassed
 * and no challenge is solved.
 */

export type AccessErrorCode =
  | 'AUTH_REQUIRED'
  | 'ACCESS_DENIED'
  | 'RATE_LIMITED'
  | 'BOT_PROTECTION'
  | 'SERVER_ERROR';

export type PageAccess = 'ok' | 'blocked' | 'unavailable';

export interface AccessAssessment {
  access: PageAccess;
  error?: AccessErrorCode;
  statusMessage?: string;
}

// Markers of a bot protection interstitial. They are specific enough to be
// checked on any successful response without false positives.
const challengeMarkers = [
  'cf-chl-',
  '__cf_chl',
  'cf_chl_opt',
  'checking your browser before accessing',
  'enable javascript and cookies to continue',
  'pardon our interruption',
  'attention required! | cloudflare',
  'ddos protection by cloudflare',
  'unusual traffic from your computer network',
  'robot or human',
  'please verify you are a human',
  'access denied | cloudflare',
];

// Weaker markers. They only count when the response already failed.
const captchaMarkers = ['captcha', 'recaptcha', 'hcaptcha', 'turnstile'];

const containsAny = (body: string, markers: string[]) => {
  const text = body.toLowerCase();
  return markers.some((marker) => text.includes(marker));
};

export function assessDocumentAccess(
  status: number,
  body: string,
): AccessAssessment {
  const challenged = containsAny(body, challengeMarkers);
  const captcha = containsAny(body, captchaMarkers);
  if (status >= 200 && status < 300) {
    // A protection page may still answer with 200.
    if (challenged) return botProtection(status);
    return { access: 'ok' };
  }
  if (status === 401) {
    return {
      access: 'blocked',
      error: 'AUTH_REQUIRED',
      statusMessage:
        'Sunucu 401 döndü: sayfa oturum açmayı gerektiriyor. Bu sayfa kalite kusuru olarak değerlendirilmedi.',
    };
  }
  if (status === 429) {
    if (challenged || captcha) return botProtection(status);
    return {
      access: 'blocked',
      error: 'RATE_LIMITED',
      statusMessage:
        'Sunucu 429 döndü: istek sınırı aşıldı. Sayfa analiz edilmedi ve bu sayfa kalite kusuru olarak değerlendirilmedi.',
    };
  }
  if (status === 403) {
    if (challenged || captcha) return botProtection(status);
    return {
      access: 'blocked',
      error: 'ACCESS_DENIED',
      statusMessage:
        'Sunucu 403 döndü: sayfaya erişim kapalı. Bu sayfa kalite kusuru olarak değerlendirilmedi.',
    };
  }
  return {
    access: 'unavailable',
    error: 'SERVER_ERROR',
    statusMessage: `Sunucu ${status} döndü: sayfa içeriği alınamadı. Bu sayfa kalite kusuru olarak değerlendirilmedi ve bu görünüm analiz edilemedi.`,
  };
}

function botProtection(status: number): AccessAssessment {
  return {
    access: 'blocked',
    error: 'BOT_PROTECTION',
    statusMessage: `Bot koruması veya doğrulama sayfası erişimi engelledi (HTTP ${status}). Bu sayfa kalite kusuru olarak değerlendirilmedi ve korumayı aşma denemesi yapılmadı.`,
  };
}

// Sub-resources that fail with these codes may be blocked by a protection layer
// rather than broken, so they are reported as uncertain instead of confirmed.
export function isAmbiguousResourceStatus(status: number) {
  return status === 401 || status === 403 || status === 429;
}
