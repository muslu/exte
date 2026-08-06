#!/usr/bin/env python3.12
"""Elle test için QR resimleri + otomatik test için modül matrisi üretir.

Üretilenler (tests/qr-ornek/):
  otpauth.png      — tek hesap (RFC 6238 tohumu; kodu bilinen)
  migration.png    — Google Authenticator "hesapları aktar" QR'ı (2 hesap)
  moduller.json    — aynı QR'ların siyah/beyaz modül matrisi; qr.test.mjs bunu
                     piksele açıp vendor/jsQR.js ile çözer (resim kütüphanesi gerekmeden)

Kullanım:
    python3.12 tools/qr_uret.py
Sonra PNG'yi bir sekmede açıp popup → Ekle → QR → "Ekrandan tara"yı, ya da
"Resimden oku"yu deneyin.
"""
import base64
import json
import pathlib
import urllib.parse

import qrcode

from goc_fixture import parametre, payload_uret

HEDEF = pathlib.Path(__file__).resolve().parent.parent / "tests" / "qr-ornek"

OTPAUTH = (
    "otpauth://totp/MAKDOS:muslu%40makdos.com"
    "?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=MAKDOS"
)


def yaz(ad: str, veri: str) -> list[str]:
    """Veriyi QR olarak PNG'ye yazar; modül matrisini '01' satırları olarak döner."""
    HEDEF.mkdir(parents=True, exist_ok=True)
    kod = qrcode.QRCode(box_size=8, border=3)
    kod.add_data(veri)
    kod.make(fit=True)
    yol = HEDEF / ad
    kod.make_image(fill_color="black", back_color="white").save(yol)
    print(f"yazıldı: {yol}  ({len(veri)} karakter)")
    return ["".join("1" if hucre else "0" for hucre in satir) for satir in kod.modules]


def main() -> None:
    matrisler = {"otpauth": {"veri": OTPAUTH, "matris": yaz("otpauth.png", OTPAUTH)}}

    payload = payload_uret(
        [
            parametre(b"12345678901234567890", "muslu@makdos.com", "MAKDOS", 1, 1, 2),
            parametre(bytes(range(20)), "GitHub:muslu", "", 2, 2, 1, sayac=42),
        ],
        adet=1, indeks=0, kimlik=1234,
    )
    b64 = base64.b64encode(payload).decode()
    goc_uri = "otpauth-migration://offline?data=" + urllib.parse.quote(b64, safe="")
    matrisler["migration"] = {"veri": goc_uri, "matris": yaz("migration.png", goc_uri)}

    yol = HEDEF / "moduller.json"
    yol.write_text(json.dumps(matrisler, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"yazıldı: {yol}")


if __name__ == "__main__":
    main()
