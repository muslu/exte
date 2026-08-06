// RFC 4226 / RFC 6238 resmi test vektörleri. Çalıştır: node exte/tests/otp.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { base32Coz, base32Uret, hotp, totp, uriCoz, uriUret, kalanSaniye } from "../src/otp.js";

const b32 = (metin) => base32Uret(new TextEncoder().encode(metin));

const TOHUM = {
  SHA1: b32("12345678901234567890"),
  SHA256: b32("12345678901234567890123456789012"),
  SHA512: b32("1234567890123456789012345678901234567890123456789012345678901234"),
};

test("base32 gidiş-dönüş ve tolerans", () => {
  assert.equal(TOHUM.SHA1, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.deepEqual(base32Coz("gezd gnbv-gy3t qojq="), base32Coz("GEZDGNBVGY3TQOJQ"));
  assert.throws(() => base32Coz("ABC1"), /Invalid Base32/);
  assert.throws(() => base32Coz(""), /empty/);
});

// RFC 4226 Ek D — secret "12345678901234567890", 6 hane, sayaç 0..9
test("HOTP — RFC 4226 Ek D", async () => {
  const beklenen = ["755224", "287082", "359152", "969429", "338314",
                    "254676", "287922", "162583", "399871", "520489"];
  const anahtar = base32Coz(TOHUM.SHA1);
  for (let sayac = 0; sayac < beklenen.length; sayac++) {
    assert.equal(await hotp(anahtar, sayac), beklenen[sayac], `sayaç ${sayac}`);
  }
});

// RFC 6238 Ek B — 8 hane, 30 sn periyot
test("TOTP — RFC 6238 Ek B (SHA1/SHA256/SHA512)", async () => {
  const tablo = [
    [59,          "94287082", "46119246", "90693936"],
    [1111111109,  "07081804", "68084774", "25091201"],
    [1111111111,  "14050471", "67062674", "99943326"],
    [1234567890,  "89005924", "91819424", "93441116"],
    [2000000000,  "69279037", "90698825", "38618901"],
    [20000000000, "65353130", "77737706", "47863826"],
  ];
  for (const [t, s1, s256, s512] of tablo) {
    const opt = { hane: 8, periyot: 30, zamanMs: t * 1000 };
    assert.equal(await totp(base32Coz(TOHUM.SHA1), { ...opt, algo: "SHA1" }), s1, `SHA1 T=${t}`);
    assert.equal(await totp(base32Coz(TOHUM.SHA256), { ...opt, algo: "SHA256" }), s256, `SHA256 T=${t}`);
    assert.equal(await totp(base32Coz(TOHUM.SHA512), { ...opt, algo: "SHA512" }), s512, `SHA512 T=${t}`);
  }
});

test("otpauth URI çözme", () => {
  const h = uriCoz("otpauth://totp/MAKDOS:muslu%40makdos.com?secret=GEZDGNBVGY3TQOJQ&issuer=MAKDOS&digits=8&period=60&algorithm=SHA256");
  assert.deepEqual(h, {
    ad: "muslu@makdos.com", issuer: "MAKDOS", gizli: "GEZDGNBVGY3TQOJQ",
    tip: "totp", algo: "SHA256", hane: 8, periyot: 60, sayac: 0,
  });

  const varsayilan = uriCoz("otpauth://totp/GitHub:muslu?secret=gezdgnbvgy3tqojq");
  assert.equal(varsayilan.algo, "SHA1");
  assert.equal(varsayilan.hane, 6);
  assert.equal(varsayilan.periyot, 30);
  assert.equal(varsayilan.gizli, "GEZDGNBVGY3TQOJQ");

  // issuer prefix'i yoksa etiket doğrudan ad olur
  assert.equal(uriCoz("otpauth://totp/sadece-ad?secret=GEZDGNBVGY3TQOJQ").ad, "sadece-ad");
  // hotp counter
  assert.equal(uriCoz("otpauth://hotp/x?secret=GEZDGNBVGY3TQOJQ&counter=7").sayac, 7);

  assert.throws(() => uriCoz("https://ornek.com"), /otpauth/);
  assert.throws(() => uriCoz("otpauth://totp/x"), /secret/);
  assert.throws(() => uriCoz("otpauth://foo/x?secret=GEZDGNBVGY3TQOJQ"), /Unsupported type/);
});

test("otpauth URI üretme — gidiş-dönüş", () => {
  for (const uri of [
    "otpauth://totp/MAKDOS:muslu%40makdos.com?secret=GEZDGNBVGY3TQOJQ&issuer=MAKDOS&digits=8&period=60&algorithm=SHA256",
    "otpauth://hotp/GitHub:muslu?secret=GEZDGNBVGY3TQOJQ&issuer=GitHub&counter=42",
    "otpauth://totp/tekbasina?secret=GEZDGNBVGY3TQOJQ",
  ]) {
    assert.deepEqual(uriCoz(uriUret(uriCoz(uri))), uriCoz(uri), uri);
  }
});

test("kalan saniye", () => {
  assert.equal(kalanSaniye(30, 0), 30);
  assert.equal(kalanSaniye(30, 1_000), 29);
  assert.equal(kalanSaniye(30, 29_000), 1);
  assert.equal(kalanSaniye(30, 30_000), 30);
  assert.equal(kalanSaniye(60, 61_000), 59);
});
