#!/usr/bin/env python3.12
"""GitHub Pages sitesini (docs/) markdown kaynaklarından üretir.

    python3.12 tools/sayfa_uret.py

Çıktı:
  docs/index.html    → README.md
  docs/privacy.html  → PRIVACY.md   (Web Store'un istediği gizlilik politikası URL'i)

Tek kaynak markdown dosyalarıdır; HTML elle düzenlenmez, bu script yeniden çalıştırılır.
"""
import pathlib
import re

import markdown

KOK = pathlib.Path(__file__).resolve().parent.parent
DOCS = KOK / "docs"

KABUK = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{baslik}</title>
<meta name="description" content="{aciklama}">
<link rel="icon" href="icons/128.png">
<style>
  :root {{ color-scheme: light dark;
    --bg:#ffffff; --metin:#1a2233; --mute:#5a6478; --kenar:#d3d9e6; --marka:#1f6feb;
    --kod-bg:#f4f6fb; }}
  @media (prefers-color-scheme: dark) {{
    :root {{ --bg:#0d1117; --metin:#e6edf3; --mute:#9aa4b2; --kenar:#2a323d; --marka:#4d90fe;
      --kod-bg:#161b22; }}
  }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0 auto; max-width:44rem; padding:2.5rem 1.25rem 5rem;
    font-family:'Segoe UI',system-ui,-apple-system,sans-serif; line-height:1.65;
    background:var(--bg); color:var(--metin); }}
  h1,h2,h3 {{ line-height:1.25; margin:2rem 0 .75rem; }}
  h1 {{ margin-top:0; font-size:2rem; letter-spacing:-.02em; }}
  h2 {{ font-size:1.3rem; border-bottom:1px solid var(--kenar); padding-bottom:.3rem; }}
  a {{ color:var(--marka); }}
  a:focus-visible {{ outline:3px solid var(--marka); outline-offset:2px; }}
  code {{ background:var(--kod-bg); padding:.12em .35em; border-radius:4px; font-size:.92em; }}
  pre {{ background:var(--kod-bg); padding:.9rem 1rem; border-radius:10px; overflow-x:auto; }}
  pre code {{ background:none; padding:0; }}
  table {{ width:100%; border-collapse:collapse; margin:1rem 0; display:block; overflow-x:auto; }}
  th,td {{ text-align:left; padding:.45rem .6rem; border-bottom:1px solid var(--kenar); }}
  th {{ color:var(--mute); }}
  img {{ max-width:100%; height:auto; border-radius:10px; }}
  blockquote {{ margin:1rem 0; padding:.6rem 1rem; border-left:4px solid var(--marka);
    background:var(--kod-bg); border-radius:0 8px 8px 0; }}
  nav {{ margin-bottom:2rem; font-size:.92rem; }}
  nav a {{ margin-right:1rem; }}
  footer {{ margin-top:3.5rem; padding-top:1rem; border-top:1px solid var(--kenar);
    color:var(--mute); font-size:.88rem; }}
</style>
</head>
<body>
<nav><a href="index.html">Home</a><a href="privacy.html">Privacy</a>
<a href="https://github.com/muslu/exte">GitHub</a></nav>
{govde}
<footer>exte — 2FA Authenticator · <a href="https://github.com/muslu/exte">source on GitHub</a> · MIT</footer>
</body>
</html>
"""

SAYFALAR = [
    ("README.md", "index.html", "exte — 2FA Authenticator for Chrome",
     "Two-factor authentication codes in your browser. No account, no server, no network permission."),
    ("PRIVACY.md", "privacy.html", "Privacy Policy — exte",
     "exte collects, stores and transmits no data. The extension has no network permission."),
]


def govde_uret(markdown_yolu: pathlib.Path) -> str:
    """Markdown'ı HTML'e çevirir; depo içi bağlantıları sayfa/GitHub bağlantısına dönüştürür."""
    metin = markdown_yolu.read_text(encoding="utf-8")
    govde = markdown.markdown(metin, extensions=["tables", "fenced_code", "sane_lists"])
    govde = govde.replace('href="PRIVACY.md"', 'href="privacy.html"')
    govde = govde.replace('href="README.md"', 'href="index.html"')
    # Depoda kalan dosyalara (LICENSE, DEVELOPMENT.md, store/) GitHub üzerinden bağlan
    govde = re.sub(r'href="((?:LICENSE|DEVELOPMENT\.md|store/[^"]+))"',
                   r'href="https://github.com/muslu/exte/blob/main/\1"', govde)
    # Ekran görüntüsü depo yolundan geliyor → docs/ içine kopyaladığımız yola çevir
    govde = govde.replace('src="store/ekran/', 'src="ekran/')
    return govde


def main() -> None:
    DOCS.mkdir(exist_ok=True)
    (DOCS / ".nojekyll").write_text("", encoding="utf-8")

    hedef_ikon = DOCS / "icons"
    hedef_ikon.mkdir(exist_ok=True)
    for ad in ("128.png", "48.png"):
        (hedef_ikon / ad).write_bytes((KOK / "icons" / ad).read_bytes())

    hedef_ekran = DOCS / "ekran"
    hedef_ekran.mkdir(exist_ok=True)
    for png in sorted((KOK / "store" / "ekran").glob("*.png")):
        (hedef_ekran / png.name).write_bytes(png.read_bytes())

    for kaynak, cikti, baslik, aciklama in SAYFALAR:
        html = KABUK.format(baslik=baslik, aciklama=aciklama, govde=govde_uret(KOK / kaynak))
        (DOCS / cikti).write_text(html, encoding="utf-8")
        print(f"yazıldı: {DOCS / cikti}")


if __name__ == "__main__":
    main()
