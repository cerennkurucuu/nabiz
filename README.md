# Nabız

**Web sitenin nabzını tut.**

[NABIZ-01 (#5)](https://github.com/cerennkurucuu/nabiz/issues/5) başlangıç mimarisi. OAuth, tarama ve raporlama bu kapsamda uygulanmaz.

## Teknolojiler ve yapı

- Angular 20 standalone, TypeScript strict, SCSS, HttpClient.
- Node.js 22, Express 5, Helmet, dotenv.
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

Node.js 22.12+ (22.x) ve npm 10+ kullanın. Komutları depo kökünde çalıştırın.

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

- Node 22.23.4 ile API derlemesi ve frontend production build başarılı.
- Prisma validate ve client generate başarılı.
- Başlangıç migration ayrı migration-check.db üzerinde başarılı; mevcut veritabanı değiştirilmedi.
- Bu oturumda npm registry DNS erişimi ENOTFOUND veriyor. ESLint/Prettier paketleri yüklenemedi; lint ve format doğrulaması tamamlanamadı. package-lock.json bu yeni araçları henüz içermez: ağ erişimi olan terminalde npm install çalıştırıp güncel kilit dosyasını kaydedin. Ardından temiz kurulumlarda npm ci kullanın.
- Supertest HTTP testleri oturumun loopback bağlantı kısıtı nedeniyle EACCES veriyor; başarılı sayılmadı. Kullanıcı terminalinde npm test ve canlı health kontrolü tekrar çalıştırılmalıdır.
- PR taslak tutulmalı; tüm kontroller geçmeden issue kapatılmamalıdır.
