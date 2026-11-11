# Katkı Rehberi

Nabız'a katkıda bulunmadan önce bu rehberi ve
[docs/OPERATIONS.md](docs/OPERATIONS.md) belgesini okuyun.

## Geliştirme Ortamı

| Gereksinim      | Sürüm                     |
| --------------- | ------------------------- |
| Node.js         | 22.12+ (22.x) veya 24.x   |
| npm             | 10+                       |
| İşletim sistemi | Windows, macOS veya Linux |

```bash
npm install
Copy-Item apps/api/.env.example apps/api/.env   # Windows (macOS/Linux: cp)
npm run prisma:generate
npm run db:deploy
npm run browser:install     # Chromium; tarama testleri ve E2E bunu kullanır
npm run dev
```

- Frontend: http://localhost:4300 (ya da `APP_ORIGIN` içindeki adres)
- API: http://127.0.0.1:3100/api/health

## Kontroller

| Komut                     | Ne yapar                                                                         |
| ------------------------- | -------------------------------------------------------------------------------- |
| `npm run typecheck`       | TypeScript hata denetimi (API)                                                   |
| `npm test`                | Birim + entegrasyon testleri (Vitest, Supertest, gerçek Chromium)                |
| `npm run lint`            | ESLint                                                                           |
| `npm run format:check`    | Prettier denetimi (`npm run format` düzeltir)                                    |
| `npm run build`           | API ve frontend production build                                                 |
| `npm run e2e`             | Gerçek tarayıcıyla uçtan uca akış (geçici veritabanı, loopback fixture sunucusu) |
| `npm run prisma:validate` | Prisma şema doğrulaması                                                          |
| `npm run db:deploy`       | Bekleyen migration'ları uygular                                                  |

CI, pull request ve `main` push'unda aynı kontrolleri çalıştırır
(`.github/workflows/ci.yml`). Testlerin hiçbiri gerçek bir Google hesabı veya
ücretli servis gerektirmez.

## Kod düzeni

```
apps/api/src/
  config/         ortam değişkeni doğrulama
  middleware/     tutarlı hata yanıtları
  modules/auth/   oturum, CSRF, Google Identity Services
  modules/scanning/ kuyruk, tarama motoru, kurallar, erişim sınıflandırma
  modules/health/ sağlık ucu
apps/web/src/app/
  core/api/       API servisi ve ortak sözleşmeler
  core/auth/      oturum durumu ve Google giriş bileşeni
  core/scans/     panel, tarama, geçmiş, karşılaştırma ve rapor görünümleri
  styles/         tasarım token'ları ve tipografi
packages/contracts/  frontend/backend ortak TypeScript sözleşmeleri
```

Kurallar:

- Sayfa içi (tarayıcıda çalışan) kodda adlandırılmış fonksiyon bağı kullanmayın;
  `page.evaluate` ile serileştirilen fonksiyonlarda `__name` gibi dönüşüm
  yardımcıları bulunmaz ve tarayıcıda hata verir
  (`apps/api/src/modules/scanning/dom.rules.ts` bu kuralı uygular ve
  `apps/api/tests/dom.rules.test.ts` regresyon testi içerir).
- Tasarım değerlerini bileşen içinde yazmayın; renk, boşluk, radius ve tipografi
  `apps/web/src/styles/_tokens.scss` içinden gelir
  (`docs/DESIGN-SYSTEM.md`).
- API sözleşmesi değişiklikleri `packages/contracts/api.d.ts` üzerinden yapılır;
  frontend ve backend birlikte güncellenir.
- Gizli bilgi, gerçek site adresi veya kişisel veri commit edilmez.

## Migration

```bash
npm run db:migrate -w @nabiz/api -- --name degisiklik_adi
```

Üretilen `migration.sql` dosyasını ve `schema.prisma` değişikliğini gözden
geçirip birlikte commitleyin. CI her migration'ı boş bir SQLite dosyasına
uygulayarak doğrular.

## Test yazarken

- Ağ kullanan testler loopback fixture sunucusu üzerinden çalışsın
  (`apps/api/tests/helpers/fixture-server.ts`); gerçek siteye istek atmayın.
- Chromium gerektiren testler `npm run browser:install` sonrasında çalışır.
- Her yeni kural için pozitif (kusur bulunur) ve negatif (sağlıklı sayfa hata
  üretmez) senaryo yazın.
- Erişim engeli (401/403/429/CAPTCHA) senaryoları kalite kusuru üretmemeli;
  `apps/api/tests/access.test.ts` ve `apps/api/tests/scan.access.test.ts`
  bu davranışı korur.

## Commit ve pull request

- Küçük, odaklı commit'ler; mesaj repo dilinde (Türkçe) ve değişikliği
  özetleyen biçimde olsun.
- Pull request açıklamasında neyin değiştiği, nasıl doğrulandığı ve varsa
  bilinen sınırlamalar belirtilir.
- İlgili issue'ya referans verin; issue'ları kendiniz kapatmayın.
