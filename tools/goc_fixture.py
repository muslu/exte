#!/usr/bin/env python3.12
"""Google Authenticator aktarım payload'ını elle kodlar (tests/goc.test.mjs fixture'ı).

Çözücüden bağımsız bir uygulama olsun diye protobuf elle yazıldı — böylece test
"kendi kendini doğrulama" tuzağına düşmez.

    python3.12 tools/goc_fixture.py
"""
import base64
import urllib.parse


def varint(sayi: int) -> bytes:
    """Protobuf değişken uzunluklu tamsayı kodlaması."""
    cikti = bytearray()
    while True:
        bayt = sayi & 0x7F
        sayi >>= 7
        cikti.append(bayt | (0x80 if sayi else 0))
        if not sayi:
            return bytes(cikti)


def uzunluklu(alan: int, veri: bytes) -> bytes:
    """Wire type 2 — uzunluk önekli alan."""
    return varint(alan << 3 | 2) + varint(len(veri)) + veri


def tamsayi(alan: int, sayi: int) -> bytes:
    """Wire type 0 — varint alan."""
    return varint(alan << 3) + varint(sayi)


def parametre(gizli: bytes, ad: str, issuer: str, algo: int, hane: int, tip: int, sayac: int = 0) -> bytes:
    """Tek bir OtpParameters mesajı. algo: 1=SHA1 2=SHA256, hane: 1=6 2=8, tip: 1=HOTP 2=TOTP."""
    govde = uzunluklu(1, gizli) + uzunluklu(2, ad.encode())
    if issuer:
        govde += uzunluklu(3, issuer.encode())
    govde += tamsayi(4, algo) + tamsayi(5, hane) + tamsayi(6, tip)
    if sayac:
        govde += tamsayi(7, sayac)
    return govde


def payload_uret(parametreler: list[bytes], adet: int, indeks: int, kimlik: int) -> bytes:
    """MigrationPayload: hesaplar + parça bilgisi."""
    govde = b"".join(uzunluklu(1, p) for p in parametreler)
    return govde + tamsayi(2, 1) + tamsayi(3, adet) + tamsayi(4, indeks) + tamsayi(5, kimlik)


def main() -> None:
    iki_hesap = payload_uret(
        [
            parametre(b"12345678901234567890", "muslu@makdos.com", "MAKDOS", 1, 1, 2),
            parametre(bytes(range(20)), "GitHub:muslu", "", 2, 2, 1, sayac=42),
        ],
        adet=2, indeks=0, kimlik=1234,
    )
    # base64'ünde '+' geçen bir örnek: URLSearchParams tuzağını sınamak için
    arti = payload_uret([parametre(bytes([0xFB] * 20), "artı", "Test", 1, 1, 2)], adet=1, indeks=0, kimlik=7)

    for ad, veri in (("IKI_HESAP", iki_hesap), ("ARTI_ICEREN", arti)):
        b64 = base64.b64encode(veri).decode()
        print(f"{ad} base64 : {b64}")
        print(f"{ad} uri    : otpauth-migration://offline?data={urllib.parse.quote(b64, safe='')}")
        print(f"{ad} base32 : {base64.b32encode(bytes(range(20))).decode() if ad == 'IKI_HESAP' else ''}")
        print()


if __name__ == "__main__":
    main()
