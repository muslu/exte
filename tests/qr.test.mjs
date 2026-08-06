// vendor/jsQR.js + QR → hesap yolu. Fixture'lar Python ile üretildi (tools/qr_uret.py):
// modül matrisi piksele açılıp gerçek jsQR'a veriliyor — resim kütüphanesi gerekmiyor.
// Çalıştır: node exte/tests/qr.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { uriCoz, base32Coz, totp } from "../src/otp.js";
import { gocCoz } from "../src/goc.js";

const require = createRequire(import.meta.url);
const jsQR = require("../vendor/jsQR.js"); // UMD → CommonJS dışa aktarımı
const FIXTURE = JSON.parse(readFileSync(new URL("./qr-ornek/moduller.json", import.meta.url), "utf8"));

/** '01' satırlarını RGBA piksel dizisine açar (modül başına `blok` piksel). */
function pikselAc(matris, blok = 4) {
  const n = matris.length;
  const kenar = n * blok;
  const veri = new Uint8ClampedArray(kenar * kenar * 4).fill(255);
  for (let sy = 0; sy < n; sy++) {
    for (let sx = 0; sx < n; sx++) {
      if (matris[sy][sx] !== "1") continue;
      for (let y = sy * blok; y < (sy + 1) * blok; y++) {
        for (let x = sx * blok; x < (sx + 1) * blok; x++) {
          const i = (y * kenar + x) * 4;
          veri[i] = veri[i + 1] = veri[i + 2] = 0;
        }
      }
    }
  }
  return { veri, kenar };
}

const coz = (ad, blok) => {
  const { veri, kenar } = pikselAc(FIXTURE[ad].matris, blok);
  return jsQR(veri, kenar, kenar, { inversionAttempts: "attemptBoth" })?.data ?? null;
};

test("jsQR paketlenmiş ve çalışıyor", () => {
  assert.equal(typeof jsQR, "function");
});

test("otpauth QR'ı çözülüp hesaba dönüşüyor", async () => {
  const metin = coz("otpauth", 4);
  assert.equal(metin, FIXTURE.otpauth.veri);

  const hesap = uriCoz(metin);
  assert.equal(hesap.issuer, "MAKDOS");
  assert.equal(hesap.ad, "muslu@makdos.com");
  // RFC 6238 tohumu → bilinen vektör
  assert.equal(await totp(base32Coz(hesap.gizli), { hane: 8, zamanMs: 59_000 }), "94287082");
});

test("Google Authenticator aktarım QR'ı çözülüp hesaplara dönüşüyor", () => {
  const metin = coz("migration", 4);
  assert.equal(metin, FIXTURE.migration.veri);

  const { hesaplar } = gocCoz(metin);
  assert.equal(hesaplar.length, 2);
  assert.equal(hesaplar[0].issuer, "MAKDOS");
  assert.equal(hesaplar[1].tip, "hotp");
});

test("küçük modül boyutunda da okunuyor (düşük çözünürlüklü QR)", () => {
  assert.equal(coz("otpauth", 2), FIXTURE.otpauth.veri);
});
