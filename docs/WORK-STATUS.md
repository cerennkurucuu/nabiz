# Devam kaydı — 10 Kasım 2026

Gerçek çalışma ortamı Windows; proje C:\Github\nabiz. Yerel main ve GitHub main
6bc4c0689c0cd94f09a279863dfa0bdffdeb0543. Commit/push/PR/Issue kapatma yasak.
Yalnızca doğrulanmış ilerleme yorumları gönderilebilir.

## Bu oturumda yapılanlar

Uçtan uca çalışan bir tarama akışı kuruldu ve doğrulandı.

- Taramayı açmak için `SCANNING_ENABLED` ortam değişkeni eklendi
  (varsayılan kapalı; `apps/api/.env.example` ve `.env` güncellendi).
- `packages/contracts/api.d.ts` içine tarama sözleşmeleri (ScanJob, ScanResult,
  ScanFinding, ScanCapabilities, ScanComparison) eklendi; `/api/scans`
  yanıtları artık ham JSON yerine ayrıştırılmış DTO döndürüyor.
- Frontend'e tarama paneli eklendi: `apps/web/src/app/core/scans/`
  (ScanService, ScanComponent, şablon, stiller). Adres girişi, ilerleme,
  sonuç ekranı, hesap bazlı geçmiş, iptal ve karşılaştırma çalışıyor.
- `apps/api/tests/scan.e2e.test.ts`: gerçek HTTP + gerçek SQLite + gerçek
  Chromium + loopback fixture sunucusu ile uçtan uca test ve kullanıcı izolasyonu.
- `apps/api/tests/dom.rules.test.ts`: sayfa içi kodun adlandırılmış fonksiyon
  bağı içermediğini denetleyen regresyon testi.
- `apps/web/tests/scan.service.test.ts`: ScanService birim testleri.
- `scripts/e2e-web.mts` (`npm run e2e`): Angular arayüzü -> API -> tarama
  motoru -> SQLite -> sonuç ekranı akışını gerçek tarayıcıyla doğrular.

## Düzeltilen hata

`npm run dev` (tsx) altında tarama motoru DOM kurallarını atlayıp yalnızca T01
ve T02 bulgularını üretiyordu. Neden: tsx, esbuild'in `keepNames` dönüşümüyle
sayfa içi fonksiyonlara `__name` yardımcısı ekliyor; Playwright fonksiyonu
sayfaya metin olarak taşıdığı için tarayıcıda `__name is not defined` hatası
oluşuyor ve `analyzeDom` sessizce başarısız oluyordu. Sayfa içi kod artık
adlandırılmış fonksiyon bağı içermiyor (yalnızca satır içi geri çağrılar ve
IIFE); kural `apps/api/tests/dom.rules.test.ts` ile korunuyor.

Ayrıca `APP_ORIGIN` ile tarayıcı adresi uyuşmazlığı düzeltildi: API artık
`http://localhost:4300` origin'ini bekliyor ve README buna göre güncellendi.

## Doğrulama (bu ortamda çalıştırıldı)

- `npm run typecheck`: başarılı.
- `npm test`: 111 backend + 7 frontend testi geçti (12 + 2 dosya).
- `npm run lint`: hata yok.
- `npm run format:check`: uyarı yok.
- `npm run build`: API ve frontend production build başarılı.
- `npm run prisma:validate` ve `npm run db:deploy`: şema geçerli, bekleyen
  migration yok.
- `npm run e2e`: 11 kontrolün tamamı geçti.
- Gerçek `npm run dev`: API health 200, dev proxy üzerinden /api/health 200,
  frontend sayfası 200, tarayıcıda "API bağlantısı hazır." görüntüleniyor.
  Sunucular düzgün kapatıldı, portlar serbest kaldı.

## Eksik yapılandırma (gerçek Google girişi doğrulanmadı)

`.env` içindeki `GOOGLE_CLIENT_ID` dolu, ancak Google Console'da frontend
origin'i "Authorized JavaScript origins" listesine eklenmemiş: tarayıcı
`[GSI_LOGGER]: The given origin is not allowed for the given client ID` uyarısı
veriyor. `http://localhost:4300` (veya kullanılacak adres) eklenmeden gerçek
Google girişi çalışmaz. Test ortamındaki oturum doğrudan test veritabanına
yazılmıştır; Google girişi başarısı olarak sunulmamıştır.

## 10 Kasım 2026 (gece) — Sol menü, ayrı rapor görünümü ve doğruluk düzeltmeleri

Arayüz mimarisi sekme düzeninden sol menü + ayrı görünümlere geçirildi.

- Sol menü (248 px, masaüstünde kalıcı): **Panel**, **Yeni Tarama**, **Geçmiş**,
  **Karşılaştırma**. 1024 px altında `mode="over"` ile açılıp kapanır; görünüm
  seçilince kapanır. Yeni router bağımlılığı eklenmedi; görünüm durumu
  `scan.view.ts` içinde sinyal ile tutuluyor.
- **Rapor** ayrı bir görünüm: "← Geçmişe dön" ve "Panele dön" yolları, üst
  çubukta görünüm başlığı, rapor görünümünde menüde "Geçmiş" etkin görünür.
- **Panel** görünümü yalnızca gerçek veri gösterir: son tarama, toplam ve
  tamamlanan tarama sayıları, adres ve saatlik kota, çalışma adımları. Uydurma
  kalite puanı yoktur.
- Durum doğruluğu: analiz edilmeyen taramada yeşil "Tarama tamamlandı" yerine
  "Tarama sona erdi — analiz tamamlanamadı" uyarısı; raporda sıfır bulgu sayacı
  yerine "değerlendirme yok" durumu; görsel kanıt yoksa bölüm gizlenir.
- Yerelleştirme: `LOCALE_ID=tr` + `registerLocaleData`, sayfalayıcı etiketleri
  `TurkishPaginatorIntl` ile Türkçe; tarih ve saatler Türkçe biçimde.
- Bulgu grupları varsayılan **kapalı**; "Tümünü aç / Tümünü kapat", filtreler ve
  yapışkan rapor başlığı korundu.
- Layout hatası giderildi: sidenav konteynerine yükseklik verilmediği için
  içerik kabuğu büyüyor ve hiçbir şey kaydırılmıyordu (yapışkan başlık da
  çalışmıyordu).

Doğrulama: 125 backend + 24 frontend testi, typecheck, lint, format:check ve
production build başarılı; `npm run e2e` 35 kontrolün tamamını geçti (sol menü,
görünüm geçişi, geri dönme, varsayılan kapalı gruplar, tümünü aç/kapat, filtre,
yapışkan başlık, karşılaştırma, engellenen sayfa açıklaması, 1440/768/375/320 px
yatay taşma kontrolü, mobil menü açma-kapama).

## 10 Kasım 2026 (son) — EPIC doğrulaması, CI ve dokümantasyon

### EPIC doğrulaması

- **EPIC-02 (Tarama ve Analiz Motoru)** ve **EPIC-03 (Raporlama ve Arayüz)** için
  bütün kabul kriterleri mevcut kod ve testlerle doğrulandı; kapatılmaya hazır.
  Kanıt: `npm test` (149 test), `npm run e2e` (37 kontrol) ve
  `apps/api/tests/*` ile `apps/web/tests/*` dosyalarındaki eşleme.
- **EPIC-01** "Google ile giriş çalışır" kriteri Google Console kaydı
  tamamlanana kadar doğrulanamaz (aşağıdaki bulgu).
- **EPIC-04**: NABIZ-12 (testler) ve NABIZ-13 (CI) tamamlandı; NABIZ-14
  dokümantasyonu güncellendi.

### NABIZ-13 — CI/CD ve güvenli yayın

- `.github/workflows/ci.yml`: iki iş. `kalite` (gizli bilgi taraması →
  `npm audit --omit=dev --audit-level=critical` → Prisma doğrulama/üretim →
  geçici SQLite'a migration → lint → format:check → typecheck → test → build) ve
  `e2e` (Chromium kurulumu + `npm run e2e`). Hiçbir adım gerçek Google hesabı
  veya ücretli servis gerektirmez.
- `docs/OPERATIONS.md`: migration süreci, gizli bilgi yönetimi, tarayıcı
  izolasyonu ve ağ çıkış kuralları, kota/zaman aşımı değerleri, log ve hata
  takibi ilkeleri, tarama güvenliği doğrulanmadan açık tarama açılmaması,
  güvenli demo alternatifi ve yayın kontrol listesi.

### NABIZ-14 — Dokümantasyon

- README yeniden yazıldı: amaç ve hedef kitle, özellikler, teknolojiler,
  mimari ve klasör yapısı, kurulum, ortam değişkenleri, Google OAuth kurulumu
  (Authorized JavaScript origins adımı dahil), yedi analiz kuralı örnekleriyle,
  API endpoint'leri ve veri modelleri, tarama güvenliği, erişim durumları,
  arayüz/tasarım sistemi, komutlar, production, bilinen sınırlamalar.
- `docs/EXAMPLE-REPORT.md`: gerçek fixture çıktısına dayalı örnek rapor.
  Gerçek bir siteye ait olmayan bulgular gerçekmiş gibi gösterilmemiştir;
  metinde bunun fixture taraması olduğu açıkça belirtilmiştir.
- `docs/ROADMAP.md`: bilinen sınırlamalar ve v1.1 planı.
- `CONTRIBUTING.md`: kurulum, kontroller, kod düzeni, migration ve test kuralları.
- `docs/images/`: gerçek arayüz görselleri (`npm run e2e` çıktısı).
- Lisans dosyası eklenmedi; tercih proje sahibinin kararına bırakıldı.

### Google OAuth doğrulaması (bulgu)

Google Console'a origin eklendikten sonra ölçüm yapıldı:

- Uygulama tarafı sağlam: `POST /api/auth/google/challenge` 200 döner,
  `GET /api/auth/session` doğru yapılandırmayı bildirir, `GET /api/auth/me`
  oturumsuz istekte 401 döner, açılır pencere `accounts.google.com`
  hesap seçim ekranını açıyor.
- Google tarafı: `accounts.google.com/gsi/button` isteği 403 dönüyor ve
  konsolda "[GSI_LOGGER]: The given origin is not allowed for the given client ID"
  görünüyor. Ölçümler Google'ın farklı kenar sunucularında farklı sonuç verdi
  (bir ölçümde 127.0.0.1 kabul edilirken localhost reddedildi). Bu, kaydın
  henüz tüm kenar sunucularına yayılmadığına işaret eder.

Yapılması gereken: origin'in **.env içindeki istemci kimliğine**
(`1098982044075-…apps.googleusercontent.com`) ait istemciye eklenmesi, iki
adresin de (`http://127.0.0.1:4300` ve `http://localhost:4300`) kaydedilmesi ve
yayılım sonrası sayfayı zorla yenilemek. `APP_ORIGIN` ile tarayıcı adresi
birebir eşleşmelidir.

## 10 Kasım 2026 (gece 2) — Origin / CSRF hatasının düzeltilmesi

### Belirti

Tarayıcıda http://localhost:4300 adresi açıkken "Yeni Tarama" ekranında
**"İstek güvenlik kontrolünden geçemedi."** (CSRF_REJECTED) hatası alınıyordu.

### Kök neden

Önceki görevde `APP_ORIGIN` http://127.0.0.1:4300 yapılmıştı. Tarayıcı
http://localhost:4300 adresini açtığında `Origin: http://localhost:4300` başlığını
gönderiyor; API'nin same-origin/CSRF kontrolü bunu `APP_ORIGIN` ile karşılaştırıp
403 döndürüyordu. Dev proxy `changeOrigin: false` kullandığı için tarayıcının
origin'i olduğu gibi API'ye ulaşır ve uyuşmazlık görünür hâle gelir.

Ölçüm (çalışan API'ye karşı): `Origin: http://localhost:4300` → 200,
`Origin: http://127.0.0.1:4300` → 403 CSRF_REJECTED. Sorun oturum veya çerez
değil, origin uyuşmazlığıydı.

### Düzeltme

- Kanonik geliştirme adresi **http://localhost:4300** olarak belirlendi.
- `apps/api/.env`, `apps/api/.env.example`, README ve CONTRIBUTING bu adresle
  hizalandı.
- Origin ve CSRF kontrolleri **devre dışı bırakılmadı**; başka bir origin hâlâ
  403 alır (`apps/api/tests/origin.security.test.ts` bunu doğrular).
- Çerez host'a bağlı olduğu için 127.0.0.1'de açılan oturum localhost'ta
  gönderilmez; yeni adreste yeniden giriş yapıldığında yeni bir oturum güvenle
  oluşturulur (eski satırlar süresi dolunca temizlenir).

### Regresyon testleri

- `apps/api/tests/origin.config.test.ts`: `.env`/örnek dosya/README/dev proxy
  ve frontend adresinin kanonik origin ile tutarlılığı (5 test).
- `apps/api/tests/origin.security.test.ts`: challenge ve tarama isteklerinde
  yalnızca yapılandırılmış origin'in kabul edildiği, CSRF belirteci eksikken veya
  `Sec-Fetch-Site: cross-site` iken reddedildiği (4 test).

### Doğrulama

Çalışan uygulamada (http://localhost:4300, gerçek tarayıcı, gerçek oturum):
oturum tanındı → /api/auth/me 200 → iki adresli tarama başlatıldı ve tamamlandı
(403 yok) → geçmişte listelendi → başka kullanıcının taraması listede yok ve
404 döndü → sayfa yenilendiğinde oturum korundu → çıkış sonrası /api/auth/me 401. Geçici test kayıtları silindi; kullanıcının verisi korundu.

## 11 Kasım 2026 — Boş rapor sorunu ve kontrol sonuçları

### Belirti

krcyazilim.net taramasında "Tarama tamamlandı · 2/2 görünüm analiz edildi"
görünüyordu ancak rapor boştu: 0 bulgu ve hiçbir kontrol detayı yoktu.

### Kök neden

DOM kuralları **çalışıyordu**. Canlı ölçümde sayfa 222 element, 37 bağlantı ve
4 görsel yükleniyor; kural adayları (2 görsel, 0 görünür form alanı, 1 buton)
doğru tespit ediliyor ve site gerçekten temiz. Sorun, rapor modelinin yalnızca
_bulguları_ saklamasıydı: hangi kontrolün çalıştığı, geçip geçmediği veya
çalıştırılamadığı bilgisi hiçbir yerde tutulmadığı için "bulgu yok" ile
"kural çalışmadı" ayırt edilemiyordu. Ayrıca engellenen sayfalarda DOM analizi
yine de çalışıyor ve koruma sayfasının içeriğini analiz ediyordu.

### Düzeltmeler

- `apps/api/src/modules/scanning/checks.ts`: kontrol sonucu modeli
  (passed/failed/inconclusive/skipped, kural, adres, görünüm, ölçüm, kanıt,
  neden, kontrol zamanı).
- `browser.runner.ts`: her kural için kontrol kaydı üretir; engellenen
  sayfalarda DOM analizi çalıştırılmaz, kontroller "çalıştırılmadı" olur.
- `dom.rules.ts`: kural başına ölçümler (kaç öğe incelendi, kaçı sorunlu).
- `jobs.service.ts`: kontrol sonuçları iş sonucuna yazılır.
- `apps/api/src/modules/scanning/pagespeed.ts` ve `pagespeed.service.ts`:
  Google PageSpeed Insights entegrasyonu; Chromium taramasından bağımsız,
  paralel çalışır, hata nedenini saklar.
- Frontend raporu: "Çalıştırılan kontroller" bölümü (kategori grupları, varsayılan
  kapalı, tümünü aç/kapat), kontrol sayaçları ve PageSpeed bölümü.

### Doğrulama

- Gerçek site (krcyazilim.net, tek tarama): 14 kontrol → 9 geçti, 5 çalıştırılmadı
  (nedenleriyle), 0 bulgu. Artık "temiz" ile "çalışmadı" ayrılıyor.
- Hatalı fixture: 14 kontrolun tamamı başarısız/atalandı, gerçek bulgular üretildi.
- Sağlıklı fixture: 0 sorunlu kontrol, geçen ve çalıştırılmadı kontroller
  ayrı sayıldı.
- PageSpeed: gerçek çağrı Google'a ulaşıyor; anonim kota dolu olduğu için hata
  nedeni raporda gösteriliyor. Gerçek puanlar için PAGESPEED_API_KEY gerekir.

## Tamamlanmamış işler

- Gerçek Google hesabıyla uçtan uca giriş doğrulaması (yukarıdaki console
  kaydı gerekiyor).
- Dağıtım egress izolasyonu doğrulanmadığı için `SCANNING_ENABLED`
  varsayılan olarak kapalı kalmalıdır.
- Screenshot'lar sonuç verisine base64 olarak gömülüyor; ayrı bir dosya
  deposuna taşıma kararı verilmedi.

## 10 Kasım 2026 — Erişim durumlarının doğruluğu

n11.com taramasında ana sayfanın HTTP 403 yanıtı, alt kaynak hatası gibi
"Başarısız kaynak isteği" bulgusu olarak raporlanıyordu. Artık ana doküman ile
alt kaynaklar ayrılır ve erişim engelleri kalite kusuru sayılmaz.

- `apps/api/src/modules/scanning/access.ts`: 401/403/429/5xx ve bot koruması
  işaretleri için sınıflandırma; her durum için Türkçe açıklama üretir.
- `browser.runner.ts`: ana doküman isteği diğer kaynaklardan ayrılır. Ana
  doküman engellendiğinde sayfa analiz edilmez, bulgu üretilmez, durum
  `blocked`/`unavailable` ve açıklamayla kaydedilir. Zaman aşımı ve iptal
  ayrı kodlarla raporlanır.
- Alt kaynaklarda 401/403/429 "belirsiz" (uncertain) bulgu olarak işaretlenir;
  404 gibi net hatalar doğrulanmış kalır. Engellenen bir görsel "bozuk dosya"
  olarak raporlanmaz.
- `packages/contracts/api.d.ts`: `ScanPageReport` için `access` ve
  `statusMessage` alanları eklendi.
- Frontend: engellenen görünümde "N bulgu bulundu" yazmaz, "Eksik tarama"
  başlığı ve erişim açıklaması gösterir; engellenmeyen görünümlerin bulgu
  sayısı ayrı hesaplanır.
- Geçmiş ve karşılaştırma bozulmadı: karşılaştırma, doğrulanamayan kaybolan
  bulguları zaten "unverified" kovasında tutuyor.

Doğrulama:

- `apps/api/tests/access.test.ts` (7 test): sınıflandırma birim testleri.
- `apps/api/tests/scan.access.test.ts` (7 test): gerçek Chromium ile loopback
  fixture sunucusunda 403, 429+CAPTCHA, 401, 500, 200+içinde koruma sayfası ve
  alt kaynak ayrımı senaryoları.
- `apps/web/tests/scan.service.test.ts`: erişim durumu metinleri testleri.
- `scripts/e2e-web.mts`: engellenen sayfanın arayüzde "Eksik tarama" olarak
  açıklandığını ve bulgu sayısı gösterilmediğini doğrular.
- Tek gerçek site taraması (n11.com, bir kez) sonucu: her iki görünümde
  `access=blocked`, `error=BOT_PROTECTION`, 0 bulgu, `complete=false`.
- `npm test`: 125 backend + 11 frontend test geçti; typecheck, lint,
  format:check ve `npm run e2e` başarılı.

## 10 Kasım 2026 (akşam) — Tasarım sistemi, UX ve EPIC değerlendirmesi

Angular Material 3 teması, merkezi tasarım token'ları ve yeniden yazılan
arayüz tamamlandı. `docs/DESIGN-SYSTEM.md` tasarım kurallarını belgeler.

- Bağımlılık: `@angular/material`, `@angular/cdk` 20.2.14,
  `@angular/forms` ve `@angular/animations` 20.3.35 (Material peer gereksinimi).
- Token'lar: `apps/web/src/styles/_tokens.scss`, tipografi
  `_typography.scss`, tema `styles.scss` (Inter, sistem fontu yedeği).
- Arayüz: app bar + hesap menüsü, üç sekme (Yeni tarama / Geçmiş / Rapor),
  kategori accordion'lu rapor, önem/kural/görünüm filtreleri, sayfalı geçmiş,
  kronolojik karşılaştırma seçimi, görsel kanıt bölümü.
- UX: sekme gövdesi kendi içinde kaydırılır (yapışkan rapor başlığı çalışır),
  25 bulgudan sonra "Daha fazla göster", 320 px'te yatay taşma yok,
  engellenen sayfada bulgu sayısı gösterilmez.
- `MatExpansionPanel` yerine yerel `<details>` kullanıldı: Material panelinin
  `expanded` girdisi çalışma zamanında tepki vermiyordu; `<details>` açma/
  kapatma, klavye ve ekran okuyucu davranışını tarayıcı semantiğinden verir.
- Bundle bütçesi Material ile birlikte güncellendi (uyarı 750 kB, hata 900 kB;
  sıkıştırılmış ilk yük 146 kB).

EPIC değerlendirmesi (kabul kriterlerine göre):

- **EPIC-02 (Tarama ve Analiz Motoru)**: tüm kabul kriterleri karşılanıyor —
  en fazla 3 URL, sayfa/kural bazında kayıt, önem derecesi + açıklama + öneri,
  ekran görüntüsü ve teknik kanıt, yanlış pozitif azaltma (belirsiz durumlar,
  erişim sınıflandırması), yedi kural otomatik testlerle doğrulanıyor.
  Tamamlanmaya hazır.
- **EPIC-03 (Raporlama ve Arayüz)**: tüm kabul kriterleri karşılanıyor —
  3 URL, ilerleme/hata durumları, anlaşılır ve filtrelenebilir bulgular,
  kanıtların bulguyla ilişkilendirilmesi, iki tarama karşılaştırmasında
  yeni/devam eden/çözülen ayrımı, yalnızca kendi raporları, masaüstü ve mobil
  kullanılabilirlik. Tamamlanmaya hazır.
- **EPIC-01**: "Google ile giriş çalışır" kriteri Google Console origin kaydı
  olmadan doğrulanamaz; kapatma kararı için eksik bilgi: `http://localhost:4300`
  istemci kimliğine "Authorized JavaScript origins" olarak eklenmelidir.
- **EPIC-04**: NABIZ-12 (testler) tamam; NABIZ-13 (CI) ve NABIZ-14 (dokümantasyon)
  için alt görevler bu oturumda kapsam dışı bırakıldı.

## Tamamlanmamış işler

- Google Console origin kaydı ve gerçek hesapla uçtan uca giriş doğrulaması.
- CI/CD workflow (NABIZ-13) ve örnek rapor görselleri ile v1.1 yol haritası
  (NABIZ-14).
- Dağıtım egress izolasyonu doğrulanmadığı için `SCANNING_ENABLED` kapalı
  kalmalıdır.

## 11 Kasım 2026 — PageSpeed Insights API anahtarı doğrulaması

`apps/api/.env` içine `PAGESPEED_API_KEY` eklendi. Anahtar tanımlı, 39 karakter
ve uygulamanın kendi doğrulamasına (`^[A-Za-z0-9_-]{10,120}$`) uygun; değer
hiçbir log, rapor veya çıktıda görünmedi.

### Gerçek API yanıtı ve kök neden

Mobil ve masaüstü stratejileri için birer kez gerçek çağrı yapıldı:

| Çağrı                | HTTP | Google yanıtı                                                                                                                                          |
| -------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anahtarsız (anonim)  | 429  | `RESOURCE_EXHAUSTED` — "Quota exceeded for quota metric 'Queries' and limit 'Queries per day'" (tüketici `project_number:583797351490`, kota sınırı 0) |
| Anahtarlı (mobil)    | 403  | `PERMISSION_DENIED` — "Requests from referer `<empty>` are blocked."                                                                                   |
| Anahtarlı (masaüstü) | 403  | `PERMISSION_DENIED` — "Permission denied on the service."                                                                                              |

Kök neden: anahtar **"Web siteleri" (HTTP yönlendirici) kısıtlamasıyla**
sınırlandırılmış. Çağrı sunucu tarafından yapıldığı için `Referer` başlığı
yok ve Google isteği reddediyor. Düzeltme: anahtarın kısıtlaması "API'ler" veya
"Hiçbiri" yapılmalı (ve PageSpeed Insights API projede etkin olmalı).

### Kod değişiklikleri

- `apps/api/src/modules/scanning/pagespeed.ts`: hata sınıflandırması
  (`PAGESPEED_QUOTA`, `PAGESPEED_PERMISSION`, `PAGESPEED_INVALID_KEY`,
  `PAGESPEED_UNAVAILABLE`, `PAGESPEED_TIMEOUT`, `PAGESPEED_NETWORK`,
  `PAGESPEED_INVALID_RESPONSE`), `apiKeyConfigured` işareti, INP ölçümü
  (`interaction-to-next-paint`), anahtar yoksa yapılandırma notu. Google'ın ham
  mesajı her hata metninde korunur; puan uydurulmaz.
- `packages/contracts/api.d.ts`: `PageSpeedResult.errorCode`,
  `PageSpeedResult.apiKeyConfigured`, `PageSpeedMetrics.interactionToNextPaint`.
- `apps/web/src/app/core/scans/scan-report.component.*`: hata sınıfı rozeti
  ("Yetkilendirme reddi", "Kota doldu"), INP ölçümü, anahtar yapılandırma
  uyarısı, mobil/masaüstü strateji etiketleri.
- `README.md` ve `apps/api/.env.example`: anahtar kısıtlaması uyarısı.

### Doğrulama

- `npm run typecheck`, `npm test` (155 backend + 30 frontend), `npm run lint`,
  `npm run format:check`, `npm run build`, `npm run e2e` (37 kontrol),
  `npm run prisma:validate`: hepsi başarılı.
- Gerçek tarama (example.com): Chromium taraması tamamlandı, 14 kontrol
  kaydedildi, PageSpeed hataları SQLite'a yazıldı ve Angular raporunda
  "Yetkilendirme reddi" rozetiyle göründü.
- API yeniden başlatıldı; `http://localhost:4300` uygulaması açık bırakıldı.
- Doğrulama betiğinin oluşturduğu 3 geçici oturum silindi; kullanıcının
  oturumu, 1 kullanıcı ve 17 tarama kaydı korundu.

## 11 Kasım 2026 (öğleden sonra) — Beş analiz motoru, görsel kanıt ve GitHub yönetimi

Bu tur iki işi birleştirdi: analiz motorlarının genişletilmesi ve projenin
denetlenip commitlenmesi. Commit'ler Git'e gönderilmedi; push sahibine bırakıldı.

### Yeni motorlar

- **Teknik, UI/UX, erişilebilirlik, SEO ve PageSpeed** motorları birbirinden
  bağımsız çalışır; her biri `queued|running|completed|partial|blocked|failed|
unavailable` durumu üretir (`apps/api/src/modules/scanning/engine.ts`).
- **UI/UX ve responsive**: U10 viewport dışı içerik, U11 kırpılan içerik, U12
  dokunma hedefi, U13 yakın etkileşim öğeleri, U14 yazı boyutu, U15 erişilebilir
  isim, U16 odak göstergesi, U17 kırılma noktası bozulması.
- **Erişilebilirlik**: axe-core CSP'den bağımsız enjekte edilir (WCAG 2.2 AA
  etiketleriyle); kontrast oranı `contrast.ts` içinde hesaplanır ve ön plan/arka
  plan renkleri kanıtta yazılır.
- **SEO**: S01–S14 (title, meta açıklama, H1, başlık hiyerarşisi, canonical,
  robots, lang, viewport, Open Graph, Twitter Card, görsel alt metni, iç bağlantı,
  yönlendirme, JSON-LD).
- **Görsel kanıt**: ekran görüntüleri JSON'a gömülmez; `ScanArtifact` modeli ve
  dosya deposu (boyut, adet ve saklama sınırı) ile yalnızca sahibine servis
  edilir. Öğe bazlı görsel kanıt en fazla 4 adet üretir.
- **PageSpeed**: hata sınıflandırması (kota, yetki, geçersiz anahtar, zaman aşımı,
  ağ), TTFB, INP ve CrUX saha verisi laboratuvar verisinden ayrı tutulur.

### Rapor arayüzü

Sekiz bölüm (özet, teknik, UI/UX, erişilebilirlik, SEO, PageSpeed, görseller,
öncelikli öneriler), motor durumları, filtreler, arama, yapışkan başlık, kademeli
liste ve büyütülebilir görsel galerisi eklendi. Mavi Angular Material tasarımı
korundu.

### Doğrulama

- `npm run typecheck`, `npm test` (169 backend + 30 frontend), `npm run lint`,
  `npm run format:check`, `npm run build`, `npm run e2e` (49 kontrol),
  `npm run prisma:validate`: hepsi sıfır çıkış koduyla başarılı.
- Yedi fixture senaryosu (sağlıklı, düşük kontrast, eksik SEO, mobil taşma, küçük
  dokunma hedefleri, erişilebilirlik hataları, teknik hatalar) gerçek Chromium
  ile doğrulandı.
- Gerçek tarama (example.com): 59 kontrol, 8 SEO bulgusu, 2 ekran görüntüsü;
  SQLite'a yazıldı ve Angular raporunda göründü.

### GitHub

- 12 alt issue doğrulama yorumuyla kapatıldı, EPIC-02/03/04 kapatıldı.
  EPIC-01 ve NABIZ-02, gerçek Google girişi doğrulanamadığı için açık bırakıldı.
- EPIC 5 (#21) ve EPIC 6 (#22) açıldı; 16 + 12 alt issue bağlantılarla eklendi.
  GitHub alt-issue yazma API'si kullanılamadığından ilişki gövde bağlantısıyla
  kuruldu.
- Üç commit: `bc16bd5` (motorlar), `f785342` (arayüz, CI, doküman),
  `4e8e153` (README). Push yapılmadı.
