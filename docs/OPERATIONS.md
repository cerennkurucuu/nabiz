# Operasyon ve Yayın Rehberi

Bu belge, Nabız'ın yayına alma sürecindeki güvenlik kararlarını, migration
sürecini ve izolasyon kurallarını tanımlar. NabIZ-13 (CI/CD ve güvenli yayın)
kapsamında hazırlanmıştır.

## 1. Otomatik kontroller (CI)

`.github/workflows/ci.yml` her pull request ve `main` push'unda iki iş çalıştırır:

| İş       | Adımlar                                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kalite` | gizli bilgi taraması → `npm audit --omit=dev --audit-level=critical` → `prisma validate` → `prisma generate` → geçici SQLite'a `prisma migrate deploy` → lint → format:check → typecheck → test → build |
| `e2e`    | `npm ci` → `prisma generate` → `npm run browser:install` → `npm run e2e`                                                                                                                                |

Hiçbir adım gerçek bir Google hesabı veya ücretli servis gerektirmez: Google
girişi tarama testlerinde kullanılmaz, test oturumu geçici SQLite veritabanına
doğrudan yazılır ve tarama hedefleri loopback fixture sunucusundan gelir.

Başarısız bir kontrol, birleştirme öncesi GitHub'da görünür olur.

## 2. Gizli bilgiler

- Depoda **hiçbir** gizli bilgi tutulmaz. `.env` dosyaları `.gitignore` ile
  dışlanmıştır; CI, izlenen dosyalarda `GOOGLE_CLIENT_SECRET`, `AIza…` API
  anahtarları ve özel anahtar bloklarını arar ve eşleşme bulursa işi
  durdurur.
- Üretimde gereken tek gizli değer yoktur: Google Identity Services akışında
  istemci sırrı kullanılmaz, yalnızca `GOOGLE_CLIENT_ID` gerekir (herkese
  açık istemci kimliği).
- `GOOGLE_CLIENT_ID`, `APP_ORIGIN`, `DATABASE_URL` ve `SCANNING_ENABLED`
  ortam değişkenleridir; üretimde CI/CD platformunun secret deposunda tutulur.
- `SCANNING_ENABLED` üretimde **kapalı** başlar. Açık internet taraması, ağ
  çıkış izolasyonu doğrulanmadan açılmaz.

## 3. Migration süreci

```bash
npm run prisma:validate          # şema geçerli mi
npm run prisma:generate           # Prisma istemcisi üret
npm run db:deploy                 # bekleyen migration'ları uygula
```

- Migration'lar `apps/api/prisma/migrations/` altında, zaman damgalı klasörler
  hâlinde tutulur; CI'da her migration boş bir SQLite dosyasına uygulanarak
  doğrulanır.
- Yeni şema değişikliği: `npm run db:migrate -w @nabiz/api -- --name degisiklik_adi`
  ile migration üretilir, çıktısı `schema.prisma` ile birlikte gözden geçirilir
  ve commitlenir. Üretimde `migrate deploy` (yani `db:deploy`) çalıştırılır;
  `migrate dev` üretimde çalıştırılmaz.
- Veritabanı SQLite'tır ve `apps/api/prisma/nabiz.db` dosyasında tutulur.
  Kalıcı diskte, yazılabilir bir dizinde olmalıdır.

## 4. Tarayıcı izolasyonu ve ağ çıkış kuralları

- Her tarama, izole bir Chromium bağlamında (`serviceWorkers: block`,
  `acceptDownloads: false`) çalışır; indirmeler engellenir, WebSocket'ler
  kapatılır, açılır pencereler kapanır.
- Chromium `--no-sandbox` **kullanmaz** (`chromiumSandbox: true`), yalnızca
  gerekli ağ kısıtlaması bayraklarıyla çalışır.
- Yalnızca `http`/`https` hedefleri kabul edilir. `localhost`, `*.local`,
  özel IP aralıkları, loopback, link-local ve metadata adresleri reddedilir
  (IPv4 ve IPv6).
- DNS sonucu her istekte doğrulanır ve bağlantı doğrulanmış IP'ye sabitlenir;
  yönlendirmenin her adımı yeniden denetlenir. Alt kaynak istekleri de aynı
  politikadan geçer.
- Aktarım limitleri: istek başına 150 istek, yanıt başına 2 MB, toplam 10 MB,
  sayfa başına 25 sn, tarama başına 90 sn, kuyrukta 5 dk.
- **İşletim sistemi seviyesinde ağ çıkış izolasyonu** (egress firewall) hâlâ
  uygulanmalıdır. Uygulama içi kontroller derinlik savunmasıdır; tek başına
  yeterli kabul edilmez.

## 5. Kaynak kotası ve zaman aşımı

| Kural                             | Değer                                     |
| --------------------------------- | ----------------------------------------- |
| Kullanıcı başına eşzamanlı tarama | 1                                         |
| Tek taramada adres sayısı         | en fazla 3                                |
| Kullanıcı başına saatlik tarama   | 10                                        |
| Kuyruk uzunluğu                   | en fazla 100 bekleyen iş                  |
| Tarama zaman aşımı                | 90 sn                                     |
| Kuyruk zaman aşımı                | 5 dk                                      |
| Sayfa yükleme zaman aşımı         | 20 sn (Chromium), 25 sn (güvenli getirme) |

İş iptal edildiğinde tarayıcı bağlamı kapanır ve kaynaklar serbest bırakılır.
Sunucu yeniden başladığında "çalışıyor" durumundaki işler güvenli biçimde
"başarısız" olarak işaretlenir.

## 6. Log ve hata takibi

- API, beklenmeyen hatalarda yalnızca `requestId`, metod ve olay adı loglar;
  gövde, sorgu dizesi, kimlik bilgileri veya ham hata nesnesi loglanmaz.
  (`apps/api/src/middleware/error-handler.ts`)
- İstemciye yalnızca `{ error: { code, message, requestId } }` döner; yığın izi
  veya iç hata ayrıntısı sızmaz.
- Hata ayıklama için `requestId` değeri loglarla eşleştirilir. Üretimde
  merkezî hata takibi (Sentry vb.) eklenirse yalnızca istek kimliği, yön, durum
  ve süre gönderilir; tarama içerikleri veya çerezler gönderilmez.

## 7. Tarama güvenliği doğrulanmadan açık tarama açılmaz

`SCANNING_ENABLED=false` (varsayılan) iken `POST /api/scans` isteği
`503 SCANNING_DISABLED` ile reddedilir ve arayüz tarama panelini "kapalı"
olarak gösterir. Açık internet taraması ancak aşağıdakiler sağlandıktan sonra
açılmalıdır:

1. Ağ çıkış izolasyonu işletim sistemi seviyesinde doğrulandı.
2. Kota ve zaman aşımı limitleri üretim yüküne göre gözden geçirildi.
3. Kullanıcı izolasyonu ve oturum güvenliği testleri geçti.
4. `npm run e2e` ve CI işleri yeşil.

## 8. Güvenli demo alternatifi

Ücretli altyapı veya açık internet erişimi olmadan demo vermek için:

- `SCANNING_ENABLED=false` ile çalıştırın: uygulama açılır, Google girişi ve
  panel görünür, tarama başlatma düğmesi kapalı durumdadır.
- Tarama davranışını göstermek için `npm run e2e` betiğini kullanın: bu betik
  loopback fixture sunucusu, geçici SQLite veritabanı ve gerçek Chromium ile
  tam akışı çalıştırır, `docs/images/` altındaki görseller bu akışın
  çıktısıdır.
- `docs/EXAMPLE-REPORT.md` içindeki örnek rapor da aynı fixture taramasının
  gerçek çıktısıdır; gerçek bir siteye ait değildir.

## 9. Bilinen bağımlılık uyarıları

`npm audit --omit=dev` çalışma zamanında Prisma 6 CLI zincirinden gelen 4
"high" uyarı bildirir (`@prisma/config` → `deepmerge-ts`, `effect`). Düzeltme
Prisma 7'ye ana sürüm yükseltmesi gerektirir; bu, migration ve şema
değişikliklerini de etkiler. CI, üretim bağımlılıkları için **critical**
seviyesini kapı olarak kullanır. Geliştirme bağımlılıklarındaki (vitest /
tinypool) uyarılar yayın kapısına dahil değildir.

## 10. Yayın kontrol listesi

- [ ] `npm run typecheck`, `npm test`, `npm run lint`, `npm run format:check`,
      `npm run build` ve `npm run e2e` yeşil.
- [ ] CI işleri yeşil.
- [ ] `npm run db:deploy` çalıştırıldı, migration dosyaları gözden geçirildi.
- [ ] `APP_ORIGIN` üretimde HTTPS ve gerçek origin ile eşleşiyor.
- [ ] `GOOGLE_CLIENT_ID` üretim istemci kimliğiyle eşleşiyor ve origin
      Google Console'da kayıtlı.
- [ ] `SCANNING_ENABLED` kapalı; açılacaksa ağ çıkış izolasyonu doğrulandı.
- [ ] SQLite dosyası kalıcı ve yazılabilir diskte.
- [ ] Frontend statik dosyaları HTTPS reverse proxy arkasında sunuluyor,
      `/api` yolu API'ye yönlendiriliyor.
