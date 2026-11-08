# Nabız

**Web sitenin nabzını tut.**

Web sitelerinin teknik kalite, UI tutarlılığı ve temel UX/erişilebilirlik analizleri için başlangıç mimarisi. Bu çalışma yalnızca [NABIZ-01 (#5)](https://github.com/cerennkurucuu/nabiz/issues/5) kapsamındadır.

## Gereksinimler

- Node.js 22.12 veya üzeri 22.x sürümü (`.nvmrc`: 22)
- npm 10 veya üzeri
- Yerel SQLite dosyasını yazabilecek bir çalışma dizini

## Kurulum ve geliştirme

Komutları depo kökünde çalıştırın:

```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env
npm run prisma:validate
npm run prisma:generate
npm run db:push
npm run dev
```

Frontend: http://127.0.0.1:4300. Backend: http://127.0.0.1:3100/api/health.
Frontend geliştirme sunucusu `/api/**` isteklerini backend'e yönlendirir. Backend portunu değiştirirseniz `apps/web/proxy.conf.json` hedefini de değiştirin.

`db:push` yalnızca yerel başlangıç veritabanını oluşturur; production migration stratejisi değildir. `AppMetadata`, Prisma'nın model içeren geçerli bir başlangıç şeması ve client üretebilmesi için tutulan tek teknik modeldir. Kullanıcı, tarama ve rapor modelleri henüz yoktur. SQLite yolu Prisma şemasının bulunduğu dizine göredir. Veritabanı dosyaları Git tarafından dışlanır.

Başarılı kurulumdan sonra oluşan `package-lock.json` sürüm kontrolüne eklenmelidir. Sonraki temiz kurulumlarda `npm ci` kullanın. Ağ erişimi olmadan kilit dosyası üretilemediği için şu an tekrarlanabilir bağımlılık çözümlemesi henüz doğrulanmamıştır.

## Proje yapısı

```text
apps/
  api/
    prisma/schema.prisma
    src/
      config/             Ortam doğrulaması
      middleware/         Ortak API hata yönetimi
      modules/health/     Health rotası
      app.ts              HTTP uygulaması; testte port açmaz
      server.ts           Başlatma ve kontrollü kapanış
    tests/                API ve yapılandırma testleri
  web/
    src/
      app/core/api/       API adresi, servis ve yanıt tipleri
      app/                Sade başlangıç ekranı
      environments/       Herkese açık build ayarları
    tests/                API servis testleri
```

Backend: Express 5, TypeScript strict, Helmet, dotenv. Frontend: Angular 20 standalone, zoneless change detection, SCSS, HttpClient. Veri altyapısı: Prisma 6 ve SQLite. Testler: Vitest ve Supertest. npm workspaces ortak paket yönetimini sağlar.

## Ortam yönetimi

API `.env` dosyasını geliştirme ve derlenmiş çalıştırmada `apps/api/.env` konumundan okur. İşletim sistemindeki değişkenler dosyanın önüne geçer. `PORT`, `HOST`, `NODE_ENV` ve SQLite `DATABASE_URL` başlangıçta doğrulanır. Gerçek `.env` dosyaları sürüm kontrolüne eklenmez.

Angular `environment.ts` production; `environment.development.ts` geliştirme ayarıdır. Bunlar build sırasında pakete giren **herkese açık** değerlerdir; çalışma anında Node ortam değişkenlerini okumaz. API varsayılan olarak aynı origin üzerindeki `/api` yolundadır. Başka bir adres gerekiyorsa ilgili environment dosyasını build öncesinde düzenleyin. Frontend'e hiçbir gizli anahtar koymayın.

## Doğrulama

```powershell
npm run build
npm run typecheck
npm run prisma:validate
npm test
Invoke-RestMethod http://127.0.0.1:3100/api/health
```

Son komut için API çalışıyor olmalıdır. Beklenen yanıt:

```json
{ "data": { "status": "ok", "service": "nabiz-api" } }
```

Health endpoint'i yalnızca HTTP sürecinin çalıştığını bildirir; veritabanı readiness kontrolü değildir. Testler health yanıtını, 404/bozuk JSON/büyük gövde hata sözleşmesini, ortam doğrulamasını ve frontend API adresi/hata iletimini kapsar. Hata yanıtı `{ "error": { "code", "message", "requestId" } }` biçimindedir; stack ve gizli bilgiler istemciye gönderilmez.

## Production derlemesi

```powershell
npm run prisma:generate
npm run build
$env:NODE_ENV = 'production'
npm start -w @nabiz/api
```

API çıktısı `apps/api/dist`; statik frontend çıktısı `apps/web/dist/nabiz/browser` dizinindedir. Frontend'i statik sunucuda sunun; HTTPS reverse proxy üzerinden `/api` isteklerini API'ye iletin. API varsayılan olarak loopback arayüzünde dinler. Konteyner gibi ortamlarda gerekiyorsa `HOST=0.0.0.0` tanımlayın. SQLite dosyasını kalıcı ve yazılabilir bir diskte tutun; dışarıya sunmayın. Geliştirme proxy'si production sunucusu değildir. CORS bilerek açılmamıştır; varsayılan dağıtım aynı origin kullanır.

## Sınırlar

Google OAuth, kullanıcı izolasyonu, URL kabulü, Playwright worker'ları, SSRF koruması, kota, analiz kuralları, raporlar ve geçmiş bu Issue kapsamında uygulanmaz. Playwright henüz kurulmaz. Modüller sonraki Issue'larda `api/src/modules` ve frontend özellik dizinleri altında eklenecektir. Tarama kodu eklendiğinde ayrı worker izolasyonu ve kaynak sınırları gerekecektir; mevcut HTTP süreci güvenli tarayıcı izolasyonu sağlamaz. Herkese açık tarama yayını güvenlik kontrolleri doğrulanana kadar yapılmamalıdır.

## Bu ortamda doğrulama durumu

Kurulum ortamında Node 18.19.1 mevcut, gereken Node 22 mevcut değil. npm registry ve GitHub DNS erişimi başarısız. Bağımlılıklar yüklenemedi; build, otomatik testler, Prisma doğrulaması ve canlı health testi henüz doğrulanamadı. `.git` yazma kısıtı nedeniyle feature branch, commit ve PR oluşturulamadı. Dosyalar yerelde hazırlanmıştır; başarılı doğrulama raporu veya tamamlanmış Issue olarak değerlendirilmemelidir.
