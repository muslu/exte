// Google Authenticator "hesapları aktar" QR'ı: otpauth-migration://offline?data=<base64>
// Payload protobuf'tur; bağımlılık eklememek için minimal bir çözücü yazıldı.
//
// MigrationPayload
//   1 repeated OtpParameters { 1 secret(bytes) 2 name 3 issuer 4 algorithm 5 digits 6 type 7 counter }
//   2 version · 3 batch_size · 4 batch_index · 5 batch_id
"use strict";

import { b64Coz } from "./kripto.js";
import { base32Uret } from "./otp.js";
import { t } from "./metinler.js";

const ALGO = { 0: "SHA1", 1: "SHA1", 2: "SHA256", 3: "SHA512" }; // 4 = MD5, desteklenmiyor
const HANE = { 0: 6, 1: 6, 2: 8 };
const TIP = { 0: "totp", 1: "hotp", 2: "totp" };

class Okuyucu {
  constructor(baytlar) {
    this.b = baytlar;
    this.i = 0;
  }
  varint() {
    let sonuc = 0n, kaydir = 0n;
    for (;;) {
      if (this.i >= this.b.length) throw new Error(t("protobufBitti"));
      const bayt = this.b[this.i++];
      sonuc |= BigInt(bayt & 0x7f) << kaydir;
      if (!(bayt & 0x80)) return sonuc;
      kaydir += 7n;
      if (kaydir > 70n) throw new Error(t("protobufUzun"));
    }
  }
  bitti() {
    return this.i >= this.b.length;
  }
}

/** Bir protobuf mesajını [alanNo, deger] çiftlerine ayırır; bilinmeyen türleri atlar. */
function alanlar(baytlar) {
  const o = new Okuyucu(baytlar);
  const cikti = [];
  while (!o.bitti()) {
    const etiket = Number(o.varint());
    const alan = etiket >>> 3;
    const tur = etiket & 7;
    if (tur === 0) cikti.push([alan, o.varint()]);
    else if (tur === 2) {
      const n = Number(o.varint());
      if (o.i + n > baytlar.length) throw new Error(t("protobufTasma"));
      cikti.push([alan, baytlar.subarray(o.i, o.i + n)]);
      o.i += n;
    } else if (tur === 5) {
      o.i += 4;
    } else if (tur === 1) {
      o.i += 8;
    } else {
      throw new Error(t("protobufTur", tur));
    }
  }
  return cikti;
}

const metin = (baytlar) => new TextDecoder().decode(baytlar);

function parametreCoz(baytlar) {
  const h = { tip: "totp", algo: "SHA1", hane: 6, periyot: 30, sayac: 0, ad: "", issuer: "", gizli: "" };
  for (const [alan, deger] of alanlar(baytlar)) {
    switch (alan) {
      case 1: h.gizli = base32Uret(deger); break;
      case 2: h.ad = metin(deger); break;
      case 3: h.issuer = metin(deger); break;
      case 4: h.algo = ALGO[Number(deger)] || null; break;
      case 5: h.hane = HANE[Number(deger)] || 6; break;
      case 6: h.tip = TIP[Number(deger)] || "totp"; break;
      case 7: h.sayac = Number(deger); break;
    }
  }
  // "Issuer:ad" biçimindeki adı ayıkla
  const ayrac = h.ad.indexOf(":");
  if (ayrac > -1 && !h.issuer) {
    h.issuer = h.ad.slice(0, ayrac).trim();
    h.ad = h.ad.slice(ayrac + 1).trim();
  }
  if (!h.ad) h.ad = h.issuer || "(adsız)";
  return h;
}

/**
 * otpauth-migration:// bağlantısını çözer.
 * → { hesaplar, parca: {indeks, adet, kimlik} }  (desteklenmeyen algoritmalar atlanır)
 */
export function gocCoz(uri) {
  const ham = String(uri ?? "").trim();
  if (!/^otpauth-migration:\/\//i.test(ham)) throw new Error(t("gocOnek"));

  // URLSearchParams '+' karakterini boşluğa çevirir → base64'ü bozar. Elle ayıklıyoruz.
  const eslesme = /[?&]data=([^&]+)/.exec(ham);
  if (!eslesme) throw new Error(t("gocDataYok"));
  const baytlar = b64Coz(decodeURIComponent(eslesme[1]));

  const hesaplar = [];
  const parca = { indeks: 0, adet: 1, kimlik: 0 };
  for (const [alan, deger] of alanlar(baytlar)) {
    switch (alan) {
      case 1: {
        const h = parametreCoz(deger);
        if (h.algo && h.gizli) hesaplar.push(h);
        break;
      }
      case 3: parca.adet = Number(deger) || 1; break;
      case 4: parca.indeks = Number(deger); break;
      case 5: parca.kimlik = Number(deger); break;
    }
  }
  if (!hesaplar.length) throw new Error(t("gocHesapYok"));
  return { hesaplar, parca };
}
