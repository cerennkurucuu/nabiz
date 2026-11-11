# Yol Haritası

## v1.0.0 — MVP (mevcut kapsam)

- Google Identity Services ile giriş, oturum yönetimi ve kullanıcı izolasyonu
- Güvenli URL politikası (SSRF koruması, DNS sabitleme, kota ve zaman aşımı)
- Playwright tarama motoru: masaüstü + mobil, yedi analiz kuralı, ekran görüntüsü
- Raporlama arayüzü: kategori grupları, filtreler, kanıt, geçmiş, karşılaştırma
- Otomatik test paketi (149 test) ve gerçek tarayıcıyla uçtan uca test
- CI iş akışı ve yayın güvenliği rehberi

## v1.1 — Planlanan

| Alan                  | İçerik                                                   | Not                                          |
| --------------------- | -------------------------------------------------------- | -------------------------------------------- |
| Rapor dışa aktarma    | PDF ve paylaşılabilir HTML rapor                         | NABIZ-10 kapsam dışı olarak ertelenmişti     |
| Zamanlanmış taramalar | Kullanıcı tanımlı sıklıkta tekrarlı tarama               | E-posta bildirimi olmadan; teslim kanalı yok |
| Erişim denetimi       | Tarama hedeflerine izin listesi (kendi siteleriniz)      | Güvenlik sınırını gevşetmez, daraltır        |
| Toplu karşılaştırma   | Üç ve daha fazla tarama arasında trend grafiği           | Gerçek veriye dayanır, puan uydurmaz         |
| Kural yapılandırması  | Hangi kuralın hangi önem derecesinde raporlanacağı       | Varsayılanlar korunur                        |
| Sürümlenmiş raporlar  | "Bu adres 10 Kasım 2026 durumunda şuydu" karşılaştırması | Mevcut geçmiş veriden türetilir              |

## Bilinen sınırlamalar (v1.0.0)

- **Açık internet taraması varsayılan olarak kapalıdır.** `SCANNING_ENABLED=true`
  yalnızca ağ çıkış izolasyonu doğrulanmış ortamlarda önerilir
  (`docs/OPERATIONS.md`).
- Koruma katmanı olan sitelerde (CAPTCHA, bot koruması) erişim engeli olarak
  raporlanır; koruma aşılmaya çalışılmaz ve sayfa kalite kusuru sayılmaz.
- Ekran görüntüleri sonuç JSON'unda base64 olarak taşınır; büyük raporlarda
  veri boyutu hızlı büyür.
- Tek işçi kuyruğu kullanılır; yüksek trafikte işlem süresi artar.
- Google girişi, istemci kimliğine kayıtlı origin'e bağlıdır; `APP_ORIGIN`
  değişirse Google Console kaydı da güncellenmelidir.
- Kalite puanı hesaplanmaz; yalnızca kural bazlı bulgular, kanıtlar ve
  karşılaştırmalar sunulur.

## Lisans

Lisans tercihi proje sahibinin kararı bekliyor; bu depoda izinsiz bir lisans
dosyası eklenmemiştir.
