// Google Authenticator aktarım (protobuf) çözücüsü.
// Fixture Python ile bağımsız olarak kodlandı (tools/goc_fixture.py), base64 sabiti aşağıda.
// Çalıştır: node exte/tests/goc.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { gocCoz } from "../src/goc.js";
import { base32Coz, totp } from "../src/otp.js";

const VERI =
  "CjYKFDEyMzQ1Njc4OTAxMjM0NTY3ODkwEhBtdXNsdUBtYWtkb3MuY29tGgZNQUtET1MgASgBMAIK" +
  "LAoUAAECAwQFBgcICQoLDA0ODxAREhMSDEdpdEh1YjptdXNsdSACKAIwATgqEAEYAiAAKNIJ";
const URI = `otpauth-migration://offline?data=${encodeURIComponent(VERI)}`;

test("GA aktarımı — iki hesap + parça bilgisi", () => {
  const { hesaplar, parca } = gocCoz(URI);
  assert.equal(hesaplar.length, 2);

  assert.deepEqual(hesaplar[0], {
    gizli: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    ad: "muslu@makdos.com", issuer: "MAKDOS",
    tip: "totp", algo: "SHA1", hane: 6, periyot: 30, sayac: 0,
  });

  // issuer alanı boş: "GitHub:muslu" adı ayrıştırılmalı
  assert.deepEqual(hesaplar[1], {
    gizli: "AAAQEAYEAUDAOCAJBIFQYDIOB4IBCEQT",
    ad: "muslu", issuer: "GitHub",
    tip: "hotp", algo: "SHA256", hane: 8, periyot: 30, sayac: 42,
  });

  assert.deepEqual(parca, { indeks: 0, adet: 2, kimlik: 1234 });
});

test("GA aktarımından çıkan gizli anahtar gerçek kod üretiyor", async () => {
  const { hesaplar } = gocCoz(URI);
  // RFC 6238 tohumu ile aynı secret → bilinen vektör
  assert.equal(await totp(base32Coz(hesaplar[0].gizli), { hane: 8, zamanMs: 59_000 }), "94287082");
});

// base64'ünde '+' geçen fixture — URLSearchParams '+' karakterini boşluğa çevirip
// veriyi bozardı; gocCoz data'yı elle ayıklıyor.
const ARTI_B64 = "CikKFPv7+/v7+/v7+/v7+/v7+/v7+/v7EgVhcnTEsRoEVGVzdCABKAEwAhABGAEgACgH";

test("base64 içindeki '+' bozulmuyor (percent-encoded ve ham)", () => {
  for (const veri of [encodeURIComponent(ARTI_B64), ARTI_B64]) {
    const { hesaplar } = gocCoz(`otpauth-migration://offline?data=${veri}`);
    assert.equal(hesaplar.length, 1);
    assert.equal(hesaplar[0].gizli, "7P57X6737P57X6737P57X6737P57X673");
    assert.equal(hesaplar[0].ad, "artı"); // UTF-8 ad
    assert.equal(hesaplar[0].issuer, "Test");
  }
});

test("hatalı girdiler anlamlı hata veriyor", () => {
  assert.throws(() => gocCoz("otpauth://totp/x?secret=AAAA"), /otpauth-migration/);
  assert.throws(() => gocCoz("otpauth-migration://offline"), /data parameter/);
  assert.throws(() => gocCoz("otpauth-migration://offline?data=EAEYAg=="), /No accounts found/);
});
