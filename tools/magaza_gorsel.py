#!/usr/bin/env python3.12
"""Chrome Web Store görsellerini GERÇEK arayüzden üretir.

Eklentinin kendi `popup.html` / `ayarlar.html` dosyaları geçici bir kopyada sahte bir
`chrome.*` API'siyle çalıştırılır (demo hesaplarla), 1280×800 vitrin sayfalarına iframe
olarak yerleştirilir ve headless Chrome ile ekran görüntüsü alınır. Böylece mağazadaki
görseller, kullanıcının göreceği arayüzün birebir aynısı olur — elle çizilmiş maket değil.

    python3.12 tools/magaza_gorsel.py

Çıktı: store/ekran/screenshot-*-1280x800.png + store/ekran/promo-tile-440x280.png
(Dosya adları ölçüyü taşır — mağaza formunda hangi alana ne gireceği isimden belli.)
"""
import http.server
import json
import pathlib
import shutil
import socketserver
import subprocess
import tempfile
import threading

KOK = pathlib.Path(__file__).resolve().parent.parent
HEDEF = KOK / "store" / "ekran"
KOPYALANACAK = ["manifest.json", "popup.html", "popup.js", "ayarlar.html", "ayarlar.js", "app.css", "src", "vendor", "icons"]

# Demo hesaplar — gerçek Base32 anahtarlar, ekranda gerçek kodlar görünsün diye.
DEMO_HESAPLAR = [
    {"id": "d1", "ad": "muslu@makdos.com", "issuer": "GitHub", "gizli": "JBSWY3DPEHPK3PXP", "tip": "totp", "algo": "SHA1", "hane": 6, "periyot": 30, "sayac": 0},
    {"id": "d2", "ad": "muslu@makdos.com", "issuer": "Google", "gizli": "GEZDGNBVGY3TQOJQ", "tip": "totp", "algo": "SHA1", "hane": 6, "periyot": 30, "sayac": 0},
    {"id": "d3", "ad": "yonetim", "issuer": "AWS", "gizli": "KRSXG5CTMVRXEZLU", "tip": "totp", "algo": "SHA1", "hane": 6, "periyot": 30, "sayac": 0},
    {"id": "d4", "ad": "makdos.biz", "issuer": "Cloudflare", "gizli": "MFRGGZDFMZTWQ2LK", "tip": "totp", "algo": "SHA1", "hane": 6, "periyot": 30, "sayac": 0},
]

# Sahte chrome API'sini kurup sayfanın kendi modülünü yükler. Parola kurulumu await
# edilebilsin diye klasik script değil, module olarak enjekte edilir.
STUB = """// Yalnızca mağaza görselleri için — eklentiye dâhil edilmez.
// Zamanı sabitle: periyodun 7. saniyesi → geri sayım çubuğu dolu ve mavi kalır.
// Aksi hâlde yakalama anına göre çubuk kırmızıya düşüp hata gibi görünüyor.
const SABIT = Math.floor(1770000000000 / 30000) * 30000 + 7000;
Date.now = () => SABIT;
const yerel = new Map(Object.entries(%(depo)s));
const oturum = new Map();
const alan = (harita) => ({
  async get(a) { const l = typeof a === "string" ? [a] : a; const o = {};
    for (const k of l) if (harita.has(k)) o[k] = structuredClone(harita.get(k)); return o; },
  async set(n) { for (const [k, v] of Object.entries(n)) harita.set(k, structuredClone(v)); },
  async remove(a) { for (const k of [].concat(a)) harita.delete(k); },
});
globalThis.chrome = {
  storage: { local: alan(yerel), session: alan(oturum) },
  runtime: { openOptionsPage() {} },
  tabs: { captureVisibleTab: async () => { throw new Error("demo"); } },
};

// PBKDF2'yi demo için 1000 iterasyona indir. Headless Chrome'un --virtual-time-budget'ı
// gerçek CPU işini beklemez: 310.000 iterasyon (~300 ms gerçek zaman) bitmeden sanal saat
// dolar ve ekran görüntüsü boş sayfayı yakalar. Yalnızca görsel üretimini etkiler.
const gercekDeriveKey = crypto.subtle.deriveKey.bind(crypto.subtle);
crypto.subtle.deriveKey = (algo, ...kalan) =>
  gercekDeriveKey(algo?.name === "PBKDF2" ? { ...algo, iterations: 1000 } : algo, ...kalan);

// Parola artık zorunlu: demo hesapları kasaya taşı ve oturumu açık bırak, böylece
// görsellerde kurulum/kilit ekranı değil gerçek liste görünür.
const depo = await import("./src/depo.js");
await depo.kilitKur("demo-parolasi");
await import("./%(sayfa)s");
"""

VITRIN = """<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>%(baslik)s</title><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1280px; height: 800px; overflow: hidden; display: flex; align-items: center;
    gap: 64px; padding: 0 80px; background: %(zemin)s;
    font-family: 'Segoe UI', system-ui, sans-serif; color: %(yazi)s; }
  .metin { flex: 1; }
  h1 { font-size: 46px; line-height: 1.15; letter-spacing: -.02em; margin-bottom: 20px; }
  p { font-size: 21px; line-height: 1.5; color: %(mute)s; max-width: 22em; }
  ul { font-size: 19px; line-height: 1.9; color: %(mute)s; margin-top: 22px; padding-left: 1.1em; }
  .cerceve { border-radius: 14px; overflow: hidden; background: %(cerceveZemin)s;
    box-shadow: 0 24px 70px rgba(0,0,0,.28); flex: 0 0 auto; }
  .cubuk { height: 34px; display: flex; align-items: center; gap: 7px; padding: 0 13px;
    background: %(cubukZemin)s; }
  .cubuk i { width: 11px; height: 11px; border-radius: 50%%; background: %(nokta)s; display: block; }
  iframe { display: block; border: 0; width: %(g)spx; height: %(y)spx; background: transparent; }
</style></head><body>
  <div class="metin"><h1>%(h1)s</h1><p>%(alt)s</p>%(liste)s</div>
  <div class="cerceve"><div class="cubuk"><i></i><i></i><i></i></div>
    <iframe id="cerceve" src="%(sayfa)s"></iframe></div>
  <script>
    const kare = document.getElementById("cerceve");
    kare.addEventListener("load", () => {
      const tik = %(tikla)s;
      if (tik) setTimeout(() => kare.contentDocument.querySelector(tik)?.click(), 350);
    });
  </script>
</body></html>
"""

TANITIM = """<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 440px; height: 280px; overflow: hidden; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 14px;
    background: linear-gradient(135deg, #1f6feb 0%, #0b4bb5 100%); color: #fff;
    font-family: 'Segoe UI', system-ui, sans-serif; }
  img { width: 82px; height: 82px; border-radius: 20px; box-shadow: 0 8px 26px rgba(0,0,0,.32); }
  h1 { font-size: 30px; letter-spacing: -.01em; }
  p { font-size: 15px; opacity: .93; }
</style></head><body>
  <img src="icons/128.png" alt="">
  <h1>exte — 2FA Authenticator</h1>
  <p>2FA codes · encrypted backup · nothing leaves your device</p>
</body></html>
"""

ACIK = {"zemin": "linear-gradient(135deg,#eef3fc 0%,#dbe6fb 100%)", "yazi": "#1a2233",
        "mute": "#4a5568", "cerceveZemin": "#ffffff", "cubukZemin": "#e7edf8", "nokta": "#c2ccdd"}
KOYU = {"zemin": "linear-gradient(135deg,#0d1117 0%,#16233b 100%)", "yazi": "#e6edf3",
        "mute": "#9aa4b2", "cerceveZemin": "#161b22", "cubukZemin": "#20262e", "nokta": "#3a434f"}

VITRINLER = [
    {"ad": "screenshot-1-codes-1280x800", "sayfa": "popup.html", "g": 360, "y": 540, "tema": ACIK, "tikla": "null",
     "h1": "Your 2FA codes,<br>one click away",
     "alt": "Click a code and it is copied. Every card shows how long it stays valid.", "liste": ""},
    {"ad": "screenshot-2-add-account-1280x800", "sayfa": "popup.html", "g": 360, "y": 540, "tema": ACIK, "tikla": '"#ekleAc"',
     "h1": "Four ways to add<br>an account",
     "alt": "", "liste": "<ul><li>Scan the QR code on your screen</li><li>Pick a QR image or paste one</li>"
                          "<li>Paste an <code>otpauth://</code> link</li><li>Enter it manually</li></ul>"},
    # Çengel, sekmeli ayarlar sayfasını doğrudan yedekleme bölümünde açar.
    {"ad": "screenshot-3-backup-1280x800", "sayfa": "ayarlar.html#yedekleme", "g": 620, "y": 620, "tema": ACIK, "tikla": "null",
     "h1": "Encrypted backup,<br>one-click restore",
     "alt": "", "liste": "<ul><li>Password-protected JSON (AES-256-GCM)</li>"
                          "<li><code>otpauth://</code> list (.txt)</li>"
                          "<li>Import straight from a Google Authenticator QR</li></ul>"},
    {"ad": "screenshot-4-dark-theme-1280x800", "sayfa": "popup.html", "g": 360, "y": 540, "tema": KOYU, "tikla": "null",
     "h1": "Dark theme, locked<br>with your password",
     "alt": "Your secrets are stored encrypted with AES-256-GCM and the password is asked for on every open. "
            "No server, no network permission.",
     "liste": ""},
]


def sunucu_baslat(dizin: pathlib.Path) -> tuple[socketserver.TCPServer, int]:
    """Geçici dizini localhost'ta yayınlar (ES module'ler file:// üzerinden yüklenemez)."""
    class Islemci(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(dizin), **kw)

        def log_message(self, *a):  # sessiz
            pass

    sunucu = socketserver.TCPServer(("127.0.0.1", 0), Islemci)
    threading.Thread(target=sunucu.serve_forever, daemon=True).start()
    return sunucu, sunucu.server_address[1]


def ortam_hazirla(gecici: pathlib.Path, tema: str) -> None:
    """Eklentiyi kopyalar, sahte chrome API'sini enjekte eder."""
    for ad in KOPYALANACAK:
        kaynak = KOK / ad
        hedef = gecici / ad
        if kaynak.is_dir():
            shutil.copytree(kaynak, hedef, dirs_exist_ok=True)
        else:
            shutil.copy2(kaynak, hedef)

    # otoKilitDk: 15 → görsel alınırken "her açılışta kilitle" devreye girmesin.
    depo = {"surum": 1, "kilit": {"acik": False}, "hesaplar": DEMO_HESAPLAR,
            "ayarlar": {"tema": tema, "otoKilitDk": 15, "dil": "en"}}

    for sayfa in ("popup", "ayarlar"):
        (gecici / f"demo-{sayfa}.js").write_text(
            STUB % {"depo": json.dumps(depo, ensure_ascii=False), "sayfa": f"{sayfa}.js"}, encoding="utf-8")
        yol = gecici / f"{sayfa}.html"
        metin = yol.read_text(encoding="utf-8")
        yol.write_text(metin.replace(f'<script type="module" src="{sayfa}.js"></script>',
                                     f'<script type="module" src="demo-{sayfa}.js"></script>'),
                       encoding="utf-8")


def goruntu_al(url: str, cikti: pathlib.Path, boyut: str) -> None:
    """Headless Chrome ile ekran görüntüsü alır."""
    subprocess.run(
        ["google-chrome", "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
         "--force-device-scale-factor=1", "--virtual-time-budget=4000",
         f"--window-size={boyut}", f"--screenshot={cikti}", url],
        check=True, capture_output=True, timeout=90,
    )
    print(f"yazıldı: {cikti}")


def main() -> None:
    HEDEF.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as gecici_ad:
        gecici = pathlib.Path(gecici_ad)
        ortam_hazirla(gecici, tema="light")
        sunucu, port = sunucu_baslat(gecici)
        try:
            for vitrin in VITRINLER:
                if vitrin["tema"] is KOYU:  # koyu tema için depoyu değiştir
                    ortam_hazirla(gecici, tema="dark")
                icerik = VITRIN % {**vitrin["tema"], **vitrin,
                                   "baslik": vitrin["ad"], "alt": vitrin["alt"] or ""}
                (gecici / f"{vitrin['ad']}.html").write_text(icerik, encoding="utf-8")
                goruntu_al(f"http://127.0.0.1:{port}/{vitrin['ad']}.html",
                           HEDEF / f"{vitrin['ad']}.png", "1280,800")

            (gecici / "promo.html").write_text(TANITIM, encoding="utf-8")
            goruntu_al(f"http://127.0.0.1:{port}/promo.html",
                       HEDEF / "promo-tile-440x280.png", "440,280")
        finally:
            sunucu.shutdown()


if __name__ == "__main__":
    main()
