#!/usr/bin/env python3.12
"""exte eklenti ikonlarını üretir (icons/16,32,48,128.png).

Marka mavisi zemin üstünde beyaz asma kilit. 8× büyük çizilip LANCZOS ile
küçültülür — 16 px'te kenarlar kırılmasın diye.

    python3.12 tools/ikon_uret.py
"""
import pathlib

from PIL import Image, ImageDraw

MARKA = (31, 111, 235, 255)  # --marka #1f6feb
BEYAZ = (255, 255, 255, 255)
BOYUTLAR = (16, 32, 48, 128)
OLCEK = 8


def ikon_ciz(kenar: int) -> Image.Image:
    """Tek bir ikonu `kenar` px olarak üretir."""
    b = kenar * OLCEK
    resim = Image.new("RGBA", (b, b), (0, 0, 0, 0))
    ciz = ImageDraw.Draw(resim)

    # zemin: yuvarlatılmış kare
    ciz.rounded_rectangle([0, 0, b - 1, b - 1], radius=int(b * 0.22), fill=MARKA)

    # kilit halkası (üst yay) — açık kalınlıkta çember parçası
    halka_kalinlik = int(b * 0.09)
    halka_kutu = [b * 0.32, b * 0.20, b * 0.68, b * 0.56]
    ciz.arc(halka_kutu, start=180, end=360, fill=BEYAZ, width=halka_kalinlik)

    # kilit gövdesi
    ciz.rounded_rectangle(
        [b * 0.24, b * 0.45, b * 0.76, b * 0.80],
        radius=int(b * 0.07),
        fill=BEYAZ,
    )

    # anahtar deliği
    delik = b * 0.055
    orta_x, orta_y = b * 0.50, b * 0.585
    ciz.ellipse([orta_x - delik, orta_y - delik, orta_x + delik, orta_y + delik], fill=MARKA)
    ciz.rectangle([orta_x - delik * 0.45, orta_y, orta_x + delik * 0.45, b * 0.72], fill=MARKA)

    return resim.resize((kenar, kenar), Image.LANCZOS)


def main() -> None:
    hedef = pathlib.Path(__file__).resolve().parent.parent / "icons"
    hedef.mkdir(exist_ok=True)
    for kenar in BOYUTLAR:
        yol = hedef / f"{kenar}.png"
        ikon_ciz(kenar).save(yol)
        print(f"yazıldı: {yol}")


if __name__ == "__main__":
    main()
