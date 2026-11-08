# Nabız

**Web sitenin nabzını tut.**

[NABIZ-01 (#5)](https://github.com/cerennkurucuu/nabiz/issues/5) başlangıç mimarisi. OAuth, tarama ve raporlama bu kapsamda uygulanmaz.

## Teknolojiler ve yapı

- Angular 20 standalone, TypeScript strict, SCSS, HttpClient.
- Node.js 22 veya 24 LTS, Express 5, Helmet, dotenv.
- Prisma 6, SQLite; yalnızca teknik AppMetadata modeli.
- Vitest, Supertest; ESLint ve Prettier yapılandırmaları.
- npm workspaces ile apps/api ve apps/web.

```text
apps/api/
  prisma/schema.prisma
  prisma/migrations/       Sürüm kontrollü başlangıç migration
  src/config/              Ortam değişkeni doğrulama
  src/middleware/          Tutarlı hata yanıtları
  src/modules/health/      /api/health ve /health
  src/app.ts               HTTP uygulaması
  src/server.ts            Sunucu ve kontrollü kapanış
  tests/                   API ve ortam testleri
apps/web/
  src/app/core/api/        API servisi, adresi ve tip aktarımları
  src/environments/        Development ve production build ayarları
  tests/                   API servisi testleri
packages/contracts/
  api.d.ts                 Frontend/backend ortak TypeScript sözleşmeleri
```

## Kurulum

Node.js 22.12+ (22.x) veya 24.x ve npm 10+ kullanın. `.nvmrc` varsayılan olarak 22 seçer. Komutları depo kökünde çalıştırın.

```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env
npm run prisma:validate
npm run prisma:generate
npm run db:deploy
npm run dev
```

Frontend: http://127.0.0.1:4300 ; API: http://127.0.0.1:3100/api/health.

Migration komutu temiz bir SQLite dosyası oluşturur. Önceden db:push ile oluşturulmuş veritabanınız varsa silmeyin: tablo yapısının başlangıç migration ile eşleştiğini doğruladıktan sonra apps/api içinde `npx prisma migrate resolve --applied 20261108000000_init` ile başlangıç kaydını işaretleyin. Yeni şema değişikliklerinde `npm run db:migrate -- --name degisiklik_adi` yerine doğrudan `npm run db:migrate -w @nabiz/api -- --name degisiklik_adi` kullanın.

## Yapılandırma ve güvenlik

API, apps/api/.env dosyasını kaynakta ve derlenmiş çalıştırmada aynı konumdan okur. İşletim sistemi değişkenleri önceliklidir. PORT, HOST, NODE_ENV ve zorunlu SQLite DATABASE_URL başlangıçta doğrulanır. Eksik DATABASE_URL anlaşılır hatayla başlatmayı durdurur. Gerçek .env, veritabanları ve üretilen dosyalar Git tarafından dışlanır.

Angular environment dosyaları herkese açık build ayarlarıdır; gizli anahtar içermez. Varsayılan API adresi /api. Geliştirmede proxy.conf.json API isteklerini 3100 portuna iletir; port değişirse proxy hedefini de güncelleyin. Production'da statik frontend ve API aynı origin üzerinden reverse proxy ile sunulmalıdır; geliştirme proxy'si production sunucusu değildir.

Hata sözleşmesi: { error: { code, message, requestId } }. Stack, ham hata ve gizli değerler istemciye iletilmez. Health yalnızca HTTP sürecini kontrol eder, veritabanı readiness kontrolü değildir.

## Komutlar

```powershell
npm run build
npm run typecheck
npm run prisma:validate
npm run lint
npm run format:check
npm test
Invoke-RestMethod http://127.0.0.1:3100/api/health
```

Health yanıtı: { "data": { "status": "ok", "service": "nabiz-api" } }.

`npm run format` dosyaları biçimlendirir. Testler health, 404, bozuk JSON, gövde sınırı, eksik/geçersiz ortam değişkenleri ve frontend API adresi/hata iletimini kapsar.

## Production

```powershell
npm run prisma:generate
npm run db:deploy
npm run build
$env:NODE_ENV = 'production'
npm start -w @nabiz/api
```

API çıktısı apps/api/dist; frontend apps/web/dist/nabiz/browser. HTTPS reverse proxy ile /api yolunu backend'e yönlendirin. HOST varsayılan loopback; konteynerde gerekiyorsa 0.0.0.0 kullanın. SQLite kalıcı, yazılabilir diskte tutulmalıdır.

## Doğrulama durumu (8 Kasım 2026)

Kullanıcının kendi bilgisayarında doğruladığı sonuçlar:

- `npm run build`: başarılı.
- `npm run lint`: başarılı.
- `npm run format:check`: başarılı.
- `npm test`: 6 backend ve 2 frontend testi başarılı.
- `/api/health`: başarılı HTTP yanıtı.

Agent oturumunda ayrıca TypeScript kontrolü, production build, Prisma doğrulaması ve ayrı SQLite dosyasına başlangıç migration uygulaması başarılı oldu. Agent oturumundaki DNS ve loopback erişim kısıtları, kullanıcının yerel ortamda tamamladığı kontrollerden ayrı değerlendirilmiştir.

Gerçek `.env`, SQLite veritabanları ve `node_modules` sürüm kontrolüne dahil edilmez. OAuth, tarama motoru ve raporlama sonraki issue'ların kapsamındadır.

### Merge sonrası yeniden kontrol

`179438e` merge commit'inde eski sürüme dönen npm komutları, ortak API sözleşmesi kullanımı ve `/health` rotası NABIZ-01 kapsamı içinde tamamlandı. Mevcut migration ve stash korundu. Düzeltme güncel `main` commit'i temel alınarak hazırlanır.

Bu yeniden kontrolde bağımlılık kurulumu ve `npm ls --depth=0`, ESLint, Prettier, TypeScript, frontend/backend production build, Prisma doğrulaması ve ayrı SQLite dosyasına migration başarılı oldu. API süreci 3102 portunda başladı; gerçek HTTP isteği oturumun soket erişim kısıtı nedeniyle engellendi. Önceki kullanıcı doğrulaması bu yeniden kontrolün HTTP sonucu yerine kullanılmaz.

Yeniden çalıştırılan testlerde 2 frontend testi ve 1 backend ortam testi geçti; 5 Supertest HTTP testi `connect EACCES` nedeniyle başarısız oldu. Düzeltmenin HTTP testleri erişim kısıtı olmayan ortamda yeniden çalıştırılmalıdır.
