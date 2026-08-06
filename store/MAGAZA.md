# Chrome Web Store — "Yeni öğe ekle" formunun tüm alanları

Panel: <https://chrome.google.com/webstore/devconsole> → **Add new item** → `exte-1.1.0.zip` yükle.
**Mağaza dili: İngilizce.** Aşağıdaki kutulardaki metinler doğrudan kopyalanıp yapıştırılacak
şekilde İngilizce hazırlandı; tablolardaki açıklamalar senin için Türkçe.

> Ad ve açıklama artık `_locales/{en,tr}/messages.json` içinden gelir; mağazada
> İngilizce görünür, tarayıcı dili Türkçe olan kullanıcıda eklenti adı Türkçe olur.
>
> Yüklenecek paket: `exte-<sürüm>.zip` (mağaza paketi — `manifest.json` zip'in **kökünde**).
> `bash tools/paketle.sh` ile üretilir. `-paylas.zip` mağazaya **yüklenmez**, o elden dağıtım içindir.

---

## 0. Yüklemeden önce — hesap ön koşulları

| Gereklilik | Not |
|---|---|
| Geliştirici hesabı kaydı | **Tek seferlik 5 USD** — ödenmeden öğe yayınlanamaz |
| Google hesabında 2FA | Zorunlu |
| E-posta doğrulaması | Panelde "Contact email" doğrulanmış olmalı |
| Yayıncı adı | Mağazada görünen ad (ör. `MAKDOS`) |
| Gizlilik politikası URL'i | **Zorunlu.** Kullan: `https://muslu.github.io/exte/privacy.html` (yayında) |

---

## 1. Store listing

### Product details

| Alan (panelde) | Sınır | Yapıştırılacak değer |
|---|---|---|
| **Item name** | 75 | `exte — 2FA Authenticator with encrypted backup` |
| **Summary** (kısa açıklama) | 132 | `Get your two-factor codes right in Chrome. Import your Google Authenticator accounts, scan QR codes, keep an encrypted backup.` *(126 karakter)* |
| **Category** | 1 seçim | `Tools` |
| **Language** | 1 seçim | `English` |

### Description (16.000 karakter sınırı) — kopyala

```
exte generates your two-factor authentication (2FA) codes directly in your browser.
No reaching for your phone: click a code, it is copied, you are in.

FEATURES

• TOTP and HOTP — SHA-1 / SHA-256 / SHA-512, 6-8 digits, 30 or 60 second periods
• Click a code to copy it; every card shows the remaining time as a bar
• Four ways to add an account:
   - Scan a QR code shown on screen
   - Pick a QR image file or paste one from the clipboard
   - Paste an otpauth:// link
   - Enter it manually (name, secret, algorithm, digits, period)
• Search box for quick access in a long list
• Light and dark theme, or follow your system setting

BACKUP AND MIGRATION

• Password-protected ENCRYPTED backup file (PBKDF2-SHA256 + AES-256-GCM)
• otpauth:// list (.txt) - compatible with other authenticator apps
• Direct import from Google Authenticator's "Transfer accounts" QR code
• Importing never deletes your existing accounts and never creates duplicates

PRIVACY BY DESIGN

• The extension has NO NETWORK PERMISSION. It cannot contact any server.
• No account, no sign-in, no telemetry, no analytics, no ads.
• Your secrets stay in your own browser storage.
• A password is required: you set it on first run and exte asks for it every time you
  open it — or after an idle period you choose. Your secrets are stored encrypted with
  AES-256-GCM and never leave the device.

WHY IT IS SIMPLE

Installation is one step and needs no configuration. There is no background service
and no tab monitoring; codes are generated only while the popup is open.

IMPORTANT

There is no password recovery: nobody can reset the password you set on first run.
If you forget it, or delete your browser profile without a backup, your accounts
cannot be recovered. Right after installing, open the options page and save an
encrypted backup somewhere safe.
```

### Graphic assets — hangi dosya hangi alana

| Panel alanı | Gereken ölçü | Seçilecek dosya | Boyut |
|---|---|---|---|
| **Store icon** | 128×128 PNG | `icons/128.png` | 128×128 · 5 KB |
| **Screenshot 1** (kartta öne çıkan) | 1280×800 | `store/ekran/screenshot-1-codes-1280x800.png` | 1280×800 · 284 KB |
| **Screenshot 2** | 1280×800 | `store/ekran/screenshot-2-add-account-1280x800.png` | 1280×800 · 283 KB |
| **Screenshot 3** | 1280×800 | `store/ekran/screenshot-3-backup-1280x800.png` | 1280×800 · 275 KB |
| **Screenshot 4** | 1280×800 | `store/ekran/screenshot-4-dark-theme-1280x800.png` | 1280×800 · 243 KB |
| **Small promo tile** | 440×280 PNG | `store/ekran/promo-tile-440x280.png` | 440×280 · 49 KB |
| **Marquee promo tile** | 1400×560 | — (yok, isteğe bağlı) | — |
| **YouTube video** | URL | — (yok) | — |

**Dosya adları ölçüyü taşır** — panelde hangi alana ne yükleneceği isimden belli.
Ekran görüntülerini yukarıdaki sırayla yükle; ilki mağaza kartında öne çıkar.
Boyutlar `tools/magaza_gorsel.py` her çalıştığında birkaç KB oynar, ölçüler sabit kalır.

### Additional fields

| Alan | Değer |
|---|---|
| Homepage URL | `https://github.com/muslu/exte` |
| Support URL | `https://github.com/muslu/exte/issues` |
| Mature content | **No** |

---

## 2. Privacy practices

### Single purpose — kopyala

```
The sole purpose of this extension is to generate one-time verification codes for the
user's own two-factor authentication accounts, following the TOTP (RFC 6238) and HOTP
(RFC 4226) standards, and to let the user back up and restore those accounts.
```

### Permission justifications — her izin ayrı kutu, kopyala

| İzin | Justification |
|---|---|
| `storage` | `The 2FA accounts the user adds (name, issuer, secret, algorithm, digits, period) and the user's theme and lock preferences are stored only in the user's own browser. This data is never sent anywhere; the extension has no network permission.` |
| `activeTab` | `When the user clicks "Scan from screen", a screenshot of the active tab is taken so the QR code visible on screen can be decoded. The image is processed in memory only - it is never stored or transmitted. The permission applies only after the user clicks the extension icon.` |
| `clipboardWrite` | `When the user clicks a verification code, the code is copied to the clipboard. The clipboard is used for writing only.` |
| Host permissions | **Yok** — talep edilmiyor |
| **Remote code** | **No.** `All code ships inside the extension package. The jsQR library (MIT) used for QR decoding is bundled as vendor/jsQR.js; no external script is ever loaded.` |

### Data usage

| Kategori | İşaret |
|---|---|
| **Authentication information** | **☑** — aşağıdaki nota bak |
| Personally identifiable information | ☐ |
| Health information | ☐ |
| Financial and payment information | ☐ |
| Personal communications | ☐ |
| Location | ☐ |
| Web history | ☐ |
| User activity | ☐ |
| Website content | ☐ |

> **Neden ☑:** Google'ın "collect" tanımı, verinin cihazdan çıkıp çıkmadığı konusunda net
> değildir. Eklenti hiçbir veri **aktarmaz** (ağ izni yok), ama kullanıcıdan 2FA gizli
> anahtarı **alır** — bu da "authentication information" kategorisine girer. Eksik beyan
> reddedilme sebebidir, fazla beyanın cezası yoktur; ihtiyatlı olan işaretlenir.
> Bu kutu işaretlendiğinde gizlilik politikası URL'i **zorunlu** olur (zaten hazır).

**Üç sertifikasyon onay kutusu** — üçü de işaretlenir (hepsi doğru):

- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:**

```
https://muslu.github.io/exte/privacy.html
```

> Sayfa `PRIVACY.md`'den üretilir (`tools/sayfa_uret.py`) ve `docs/` değişince
> `.github/workflows/pages.yml` ile kendiliğinden yayınlanır. Bir aksilik olursa aynı metin
> `https://github.com/muslu/exte/blob/main/PRIVACY.md` adresinde de duruyor.

---

## 3. Distribution

| Alan | Değer |
|---|---|
| Visibility | `Public` (yalnızca ekiple paylaşılacaksa `Unlisted`) |
| Distribution regions | Tüm bölgeler |
| Pricing | Free |

---

## İnceleme sürecine dair notlar

- İlk inceleme genelde **birkaç gün** sürer. İzin gerekçeleri boş bırakılırsa doğrudan reddedilir.
- **Ekran görüntülerindeki servis adları** (GitHub, Google, AWS, Cloudflare) demo hesap adlarıdır;
  logo/marka görseli kullanılmadı. İnceleme takılırsa `tools/magaza_gorsel.py` içindeki
  `DEMO_HESAPLAR` listesini genel adlarla (`example.com`, `Server`) değiştirip görselleri yenile.
- Sürüm yükseltirken `manifest.json` içindeki `version` **artırılmalı**; aynı sürüm iki kez yüklenemez.
- Paket boyutu ~92 KB (sınır 2 GB) — sorun değil.

## Yükleme öncesi son kontrol

```bash
node --test tests/                  # 26/26 geçmeli
bash tools/paketle.sh               # exte-<surum>.zip üretir
python3.12 tools/magaza_gorsel.py   # görselleri tazeler
```
