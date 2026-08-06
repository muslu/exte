# Development notes

Architecture, deliberate decisions and the pitfalls that cost time. Read this before changing
anything; several of the odd-looking choices below are load-bearing.

## What it is

A Chrome MV3 extension that generates TOTP/HOTP codes, imports accounts from QR codes,
exports/imports encrypted backups and reads Google Authenticator transfer QR codes.
Serverless, with no network permission — all data stays in `chrome.storage`.

## Design decisions

| Decision | Why |
|---|---|
| **No build tool** | Plain ES modules + HTML/CSS. The folder loads directly via `chrome://extensions`; a bundler would add maintenance for no gain at this size. |
| **No network permission** | `host_permissions` and `fetch` are deliberately absent, so there is no path by which a secret could leave the device — enforced by the browser, not by discipline. |
| **No service worker** | Codes are generated while the popup is open; there is no background work. An MV3 service worker would be killed after 30 s anyway. |
| **Session key in `chrome.storage.session`** | The popup loses its memory on every close and the service worker's memory dies too. `session` storage is cleared when the browser closes and is not readable by content scripts (TRUSTED_CONTEXTS). |
| **Lock is optional** | Default off, so the extension works the moment it is installed. Turning it on moves the accounts into an encrypted `kasa` field and deletes the plain `hesaplar` field. |
| **jsQR is vendored** | MV3's CSP forbids remote code, so it cannot be loaded from a CDN. It is UMD, so it is loaded with a classic `<script>` tag and read from `globalThis.jsQR`. |
| **Hand-written protobuf decoder** | Bundling a protobuf library for one message schema is overkill; ~90 lines of varint + length-delimited parsing is enough. |
| **Options page is a full tab** | A popup can lose focus and close when a file picker opens. Backup and import live in `ayarlar.html`, where that cannot happen. |
| **Own i18n, not `chrome.i18n`** | The core modules are unit-tested in Node, where no `chrome` object exists. `src/metinler.js` is plain JS and works in both. `chrome.i18n` is used only for the manifest name/description (`_locales/`). |

## Pitfalls

- **`URLSearchParams` corrupts Google Authenticator imports.** It turns `+` into a space, which
  breaks the base64 payload. `goc.js` extracts the `data=` parameter with a regex and applies
  `decodeURIComponent` itself.
- **`--marka-metin` must be dark in the dark theme.** White text on the light blue accent drops
  to 2.5:1 contrast, failing WCAG AA. `app.css` redefines it inside the dark block.
- **`captureVisibleTab` fails** on `chrome://` pages, the Web Store and the PDF viewer. The error
  is caught and the user is offered the "read from image" path instead. `activeTab` is enough;
  never ask for `<all_urls>`.
- **The popup loses its state when it closes.** Every add step writes to storage immediately;
  there is no multi-step wizard.
- **Codes are recomputed per period window, not per second** (the `pencere` field in the `kartlar`
  map). Only the progress bar updates every second.
- **`hesaplariOku()` throws `KILITLI` while locked.** Callers must either check `kilitliMi()`
  first or catch it and show the unlock screen.
- **MV3 CSP:** no inline `<script>` and no `onclick=`. All handlers are bound with
  `addEventListener`.
- **QR rescan strategy:** on a miss, small images are retried at 2× and large screenshots are
  retried *scaled down* — jsQR gets slow and noisy on a 4K capture.

## Layout

```
manifest.json · popup.{html,js} · ayarlar.{html,js} · app.css
_locales/{en,tr}/messages.json   extension name + description (store listing)
src/otp.js       Base32 · HMAC (WebCrypto) · HOTP/TOTP · otpauth URI parse/build
src/kripto.js    PBKDF2 (310k, SHA-256) + AES-GCM · base64
src/depo.js      chrome.storage schema · account CRUD · lock and session key
src/yedek.js     encrypted JSON and .txt formats, file download
src/qr.js        captureVisibleTab / file / clipboard → OffscreenCanvas → jsQR
src/goc.js       otpauth-migration:// protobuf decoder
src/metinler.js  every user-facing string, English + Turkish
src/ui.js        $ · toast · announce · page translation · theme
vendor/jsQR.js   1.4.0, vendored · icons/ · tools/ · tests/ · store/
```

The storage schema and account record fields are documented at the top of `src/depo.js`.
Identifiers and comments are in Turkish; user-facing strings live in `src/metinler.js`.

## Tests

```bash
node --test tests/          # 26 tests — no npm, Node 20's built-in runner + crypto.subtle
```

- `otp.test.mjs` — every vector from RFC 4226 Appendix D and RFC 6238 Appendix B (SHA-1/256/512).
- `goc.test.mjs` — the Google Authenticator protobuf fixture is **encoded independently in
  Python** (`tools/goc_fixture.py`), so the decoder is not validating its own output.
- `yedek.test.mjs` — encrypted backup round-trip, wrong password, `.txt` parameter fidelity.
- `depo.test.mjs` — a fake `chrome.storage` drives lock setup/unlock/removal, auto-lock and the
  "no plaintext secret is left in storage" assertion.
- `qr.test.mjs` — the module matrix from `tools/qr_uret.py` is expanded to pixels and decoded by
  the **real vendored jsQR**, then fed through `uriCoz`/`gocCoz`. No image library needed.

**Chrome ignores `--load-extension`** by enterprise policy, so the extension cannot be loaded
headlessly for an automated end-to-end run; load it manually from `chrome://extensions`.

## Tooling

```bash
bash tools/paketle.sh               # builds the store zip and the shareable zip
python3.12 tools/ikon_uret.py       # regenerates icons/*.png (Pillow)
python3.12 tools/qr_uret.py         # test QR codes + the fixture used by qr.test.mjs
python3.12 tools/goc_fixture.py     # regenerates the GA protobuf fixture
python3.12 tools/magaza_gorsel.py   # store screenshots, rendered from the real UI
```

`tools/magaza_gorsel.py` copies the extension to a temp directory, injects a fake `chrome.*`
API with demo accounts, serves it over localhost (ES modules cannot load over `file://`) and
screenshots it with headless Chrome — so the store images are the real interface, not mockups.

To refresh the vendored QR library:

```bash
curl -o vendor/jsQR.js https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js
```

## Roadmap

- Manual end-to-end pass in Chrome with a real 2FA account
- Lighthouse accessibility audit for `popup.html` and `ayarlar.html`
- Editing an account (name/issuer); currently only add and delete
- Drag-to-reorder (today the order is fixed by name, with search)
- Autofill into a page's 2FA field — needs a content script, so weigh the added permission
  surface before doing it
- Firefox port (`browser.*` namespace, `storage.session` differences)

Deliberately **not** planned: cloud sync (would require the network permission that the whole
design avoids), clock-drift indicator, region-select QR scanning.
