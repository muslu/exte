// Şifreli yedek + .txt gidiş-dönüşü. Çalıştır: node exte/tests/yedek.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { sifreliYedekUret, sifreliYedekCoz, txtUret, txtCoz } from "../src/yedek.js";
import { sifrele, coz, anahtarTurte, rastgele } from "../src/kripto.js";

const HESAPLAR = [
  { id: "a1", ad: "muslu@makdos.com", issuer: "MAKDOS", gizli: "GEZDGNBVGY3TQOJQ", tip: "totp", algo: "SHA256", hane: 8, periyot: 60, sayac: 0 },
  { id: "a2", ad: "muslu", issuer: "GitHub", gizli: "JBSWY3DPEHPK3PXP", tip: "hotp", algo: "SHA1", hane: 6, periyot: 30, sayac: 42 },
];

test("AES-GCM şifrele/çöz", async () => {
  const anahtar = await anahtarTurte("parola123", rastgele(16), 1000);
  const paket = await sifrele(anahtar, "gizli metin");
  assert.equal(await coz(anahtar, paket), "gizli metin");

  const baska = await anahtarTurte("yanlisparola", rastgele(16), 1000);
  await assert.rejects(() => coz(baska, paket), /Wrong password/);
});

test("şifreli yedek gidiş-dönüş", async () => {
  const yedek = await sifreliYedekUret(HESAPLAR, "cokgizli");
  assert.equal(yedek.tip, "exte-yedek");
  assert.ok(!JSON.stringify(yedek).includes("GEZDGNBVGY3TQOJQ"), "gizli anahtar dosyada açık görünmemeli");

  assert.deepEqual(await sifreliYedekCoz(yedek, "cokgizli"), HESAPLAR);
  await assert.rejects(() => sifreliYedekCoz(yedek, "yanlis"), /Wrong password/);
  await assert.rejects(() => sifreliYedekUret(HESAPLAR, "kisa"), /at least 6/);
  await assert.rejects(() => sifreliYedekCoz({ tip: "baska" }, "cokgizli"), /not an exte backup/);
});

test(".txt gidiş-dönüş — tüm parametreler korunuyor", () => {
  const { hesaplar, hatalar } = txtCoz(txtUret(HESAPLAR));
  assert.deepEqual(hatalar, []);
  assert.equal(hesaplar.length, 2);
  for (const [beklenen, gelen] of HESAPLAR.map((h, i) => [h, hesaplar[i]])) {
    for (const alan of ["ad", "issuer", "gizli", "tip", "algo", "hane", "periyot", "sayac"]) {
      assert.equal(gelen[alan], beklenen[alan], `${beklenen.ad} → ${alan}`);
    }
  }
});

test(".txt bozuk satırları raporlar, iyileri alır", () => {
  const { hesaplar, hatalar } = txtCoz(
    "# yorum\n\notpauth://totp/x?secret=GEZDGNBVGY3TQOJQ\nbozuk satır\nhttps://ornek.com\n",
  );
  assert.equal(hesaplar.length, 1);
  assert.equal(hatalar.length, 2);
  assert.match(hatalar[0], /line 4/);
});
