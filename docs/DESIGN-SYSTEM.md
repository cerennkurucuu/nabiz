# Nabız Tasarım Sistemi

Bu belge, arayüzde kullanılan renk, tipografi, boşluk, radius ve yükseklik
değerlerinin tek kaynağını tanımlar. Tüm değerler
`apps/web/src/styles/_tokens.scss` dosyasındaki CSS değişkenlerinden gelir;
bileşenler kendi renk veya boşluk değerlerini yazmaz.

## 1. Görsel kimlik

| Öğe            | Değer                 | Kullanım                                   |
| -------------- | --------------------- | ------------------------------------------ |
| Ana mavi       | `#2563EB`             | Birincil eylem, odak halkası, seçili durum |
| Koyu lacivert  | `#14213D`             | Başlıklar ve ana metin                     |
| Açık arka plan | `#F7F9FC`             | Sayfa yüzeyi                               |
| Yüzey          | `#FFFFFF`             | Kart, panel, tablo satırı                  |
| İnce kenarlık  | `#DDE4EE` / `#E9EEF5` | Kart ve ayırıcı                            |
| Başarı         | `#0F7B3E`             | Tamamlandı, doğrulanmış bulgu              |
| Uyarı          | `#B45309`             | Belirsiz bulgu, kısmi tarama               |
| Hata           | `#C02626`             | Hata bulgusu, engellenen erişim            |

İlkeler: durum renkleri yalnızca anlamlı durumlarda kullanılır; ağır gradient,
cam efekti, neon ve aşırı yuvarlatılmış kart kullanılmaz; ikon yalnızca
işlevi olmadığıda eklenmez.

## 2. Token dosyaları

| Dosya                                  | İçerik                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/web/src/styles/_tokens.scss`     | Renk, boşluk, radius, yükseklik ve font değişkenleri                                                 |
| `apps/web/src/styles/_typography.scss` | Başlık ve metin sınıfları (`nabiz-display`, `nabiz-title`, `nabiz-body`, `nabiz-meta`, `nabiz-mono`) |
| `apps/web/src/styles.scss`             | Material 3 teması, global sıfırlama, odak halkası, kaydırma çubuğu                                   |

Yeni bir bileşen eklenirken renk, boşluk ve radius değerleri bu değişkenlerden
seçilir; bileşene özel yeni renk tanımlanmaz.

## 3. Material 3 teması

Tema, `apps/web/src/styles.scss` içinde `mat.theme()` ile üretilir. Palet
`mat.$azure-palette` üzerine kurulur, marka renkleri ise `mat.theme()` ikinci
parametresindeki token geçersiz kılmalarıyla tanımlanır
(`primary`, `surface`, `background`, `on-surface`, `outline`, `error` …).

Tipografi Material'ın `plain-family` ve `brand-family` değerleri Inter ile
tanımlanır. Inter Google Fonts üzerinden `display=swap` ile yüklenir; yüklenemezse
sistem fontuna düşülür (`--nabiz-font` yığını).

## 4. Tipografi

| Sınıf            | Boyut         | Kullanım                       |
| ---------------- | ------------- | ------------------------------ |
| `nabiz-display`  | 1,75–2,25 rem | Sayfa başlığı, karşılama metni |
| `nabiz-title`    | 1,125 rem     | Bölüm ve kart başlıkları       |
| `nabiz-subtitle` | 0,9375 rem    | Bulgu ve form başlıkları       |
| `nabiz-body`     | 0,9375 rem    | Açıklama metni                 |
| `nabiz-meta`     | 0,8125 rem    | Yardımcı bilgi, tarih, sayaç   |
| `nabiz-mono`     | 0,8125 rem    | Kanıt metni, DOM seçici        |
| `nabiz-eyebrow`  | 0,75 rem      | Üst etiket                     |

## 5. Boşluk, radius ve yükseklik

- Boşluklar 8 px tabanlıdır: `--nabiz-space-1` (4 px) ile
  `--nabiz-space-8` (48 px) arası.
- Radius: `--nabiz-radius-sm` (6 px), `--nabiz-radius-md` (10 px),
  `--nabiz-radius-lg` (14 px), `--nabiz-radius-pill` (etiketler).
- Yükseklik: `--nabiz-shadow-1` (kart), `--nabiz-shadow-2` (yükseltilmiş yüzey).
- Uygulama çubuğu yüksekliği `--nabiz-header-height` (64 px). Rapor başlığı bu
  değere göre konumlanır.

## 6. Sayfa yapısı

```
sol menü (masaüstü)        üst çubuk                    içerik (78 rem)
┌────────────────┐  ┌──────────────────────────┐  ┌────────────────────────┐
│ N Nabız        │  │ ☰  Tarama Raporu         │  │ görünüme göre değişen   │
│ Panel          │  │    alt başlık   ● API    │  │ içerik (panel / yeni    │
│ Yeni Tarama    │  └──────────────────────────┘  │ tarama / geçmiş /        │
│ Geçmiş         │                                  │ karşılaştırma / rapor)   │
│ Karşılaştırma  │                                  │                          │
│ ───────────    │                                  │                          │
│ hesap · çıkış  │                                  │                          │
└────────────────┘                                  └────────────────────────┘
```

- **Sol menü** (248 px) masaüstünde kalıcıdır ve dört görünümü açar:
  Panel, Yeni Tarama, Geçmiş, Karşılaştırma. Etkin öğe mavi sol şerit ve açık
  mavi zeminle belirtilir. 1024 px altında menü açılıp kapanan bir panel
  (`mode="over"`) olur ve üst çubuktaki menü düğmesiyle açılır; bir görünüm
  seçilince kendiliğinden kapanır.
- **Üst çubuk** yapışkandır: görünüm başlığı, kısa açıklama ve API durumu.
  640 px altında durum metni gizlenir, yalnızca durum noktası kalır.
- **İçerik** 78 rem ile sınırlıdır; kartlar `auto-fit` ızgarasıyla dizilir.
- **Rapor** ayrı bir görünümdür: sol üstte "Geçmişe dön" ve "Panele dön"
  yolları bulunur, rapor başlığı (özet + sayaçlar) kaydırmada üst çubuğun
  altında yapışkan kalır.
- Görünüm durumu `apps/web/src/app/core/scans/scan.view.ts` içinde tanımlıdır;
  yeni router bağımlılığı eklenmeden gezinme sinyallerle yürütülür.

## 7. Uzun içerik kuralları

- Bulgu listeleri kategoriye göre `<details>` gruplarına ayrılır. Yerel
  `<details>` öğesi kullanılır çünkü açma/kapatma, klavye (Enter/Space) ve ekran
  okuyucu davranışı tarayıcının yerel semantiğinden gelir.
- Grup başlığında bulgu sayısı ve hata/uyarı/bilgi dağılımı yer alır.
- Gruplar varsayılan olarak **kapalıdır**; "Tümünü aç" ve "Tümünü kapat"
  kontrolleri bulunur.
- Bir grupta en fazla 25 bulgu gösterilir, kalanlar "Daha fazla göster" ile
  açılır.
- Geçmiş listesi istemci tarafında sayfalanır (sayfa başına 10/25/50 kayıt) ve
  durum ile adres metnine göre filtrelenir. Sayfalayıcı etiketleri Türkçedir.
- Rapor başlığı (özet + sayaçlar) içerik kabuğuna yapışkandır.

## 8. Durumlar

| Durum           | Görünüm                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| Yükleniyor      | `role="status"` metni; istekte bulunan durumda iskelet yerine sade metin |
| Boş             | Kesikli çerçeveli kart, açıklayıcı metin ve sonraki adım                 |
| Hata            | Kenarlıklı uyarı bloğu, `role="alert"`                                   |
| Engelli / kısmi | "Eksik tarama" başlığı, sayfa bazlı açıklama, bulgu sayısı gösterilmez   |
| Başarılı        | Durum etiketi, sayaçlar, gruplanmış bulgular                             |

Hiçbir görünüm analiz edilemediğinde sıfır bulgu sayacı kalite başarısı gibi
gösterilmez; bunun yerine "değerlendirme yok" durumu ve erişim açıklaması
yazılır. Tarama bittiğinde en az bir görünüm analiz edilmemişse yeşil başarı
mesajı yerine "Tarama sona erdi — analiz tamamlanamadı" uyarısı gösterilir.

### Kontrol sonuçları

Her analiz kuralı için dört durum vardır; renkleri durum paletinden gelir:

| Durum                          | Anlam                                    | Renk    |
| ------------------------------ | ---------------------------------------- | ------- |
| `passed` (Geçti)               | Kontrol çalıştı ve sorun bulunmadı       | yeşil   |
| `failed` (Sorun bulundu)       | Kontrol çalıştı ve doğrulanmış sorun var | kırmızı |
| `inconclusive` (Doğrulanamadı) | Kontrol çalıştı ancak sonuç kesinleşmedi | turuncu |
| `skipped` (Çalıştırılmadı)     | Kural bu sayfada uygulanabilir değildi   | gri     |

Kontrol kayıtları kategori (teknik / UI / erişilebilirlik) bazında açılır-kapanır
gruplarda gösterilir; grup başlığında kontrol sayısı ve durum dağılımı yer alır.
Hiç çalışmayan bir kontrol "geçti" olarak işaretlenmez.

## 9. Tarih, saat ve yerelleştirme

- Uygulama `tr` yerel ayarıyla çalışır (`LOCALE_ID`), `registerLocaleData` ile
  Türkçe tarih biçimleri yüklenir.
- Sayfalayıcı etiketleri `TurkishPaginatorIntl` ile Türkçeye çevrilir.
- Tarih ve saatler `date: 'medium'` / `date: 'short'` biçimleriyle gösterilir.

## 10. Erişilebilirlik

- Odak halkası tüm etkileşimli öğelerde görünür (`:focus-visible`).
- Form alanlarında `mat-label` ile etiketleme, hatalar `mat-error` ile.
- Durum değişimleri `role="status"` / `role="alert"` ile duyurulur.
- Accordion başlıkları yerel `<summary>` davranışı ile Enter/Space ile açılır.
- Metin kontrastı WCAG 2.2 AA hedefini karşılar (gövde metni `#4B5B71`).
- 320 px genişlikte yatay taşma olmaz; E2E testi bunu doğrular.
