// depo.js — hesap CRUD + parola kilidi akışı. chrome.storage sahte ile taklit edilir.
// Çalıştır: node exte/tests/depo.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

/* ---- sahte chrome.storage (import'tan ÖNCE kurulmalı) ---- */
function alan(harita) {
  return {
    async get(anahtarlar) {
      const liste = typeof anahtarlar === "string" ? [anahtarlar] : anahtarlar;
      const cikti = {};
      for (const k of liste) if (harita.has(k)) cikti[k] = structuredClone(harita.get(k));
      return cikti;
    },
    async set(nesne) {
      for (const [k, v] of Object.entries(nesne)) harita.set(k, structuredClone(v));
    },
    async remove(anahtarlar) {
      for (const k of [].concat(anahtarlar)) harita.delete(k);
    },
  };
}
const YEREL = new Map();
const OTURUM = new Map();
globalThis.chrome = { storage: { local: alan(YEREL), session: alan(OTURUM) } };

const depo = await import("../src/depo.js");

const GIZLI = "GEZDGNBVGY3TQOJQ";
const sifirla = async () => {
  YEREL.clear();
  OTURUM.clear();
};

test("hesap ekle / oku / güncelle / sil", async () => {
  await sifirla();
  const h = await depo.hesapEkle({ ad: "muslu", issuer: "GitHub", gizli: GIZLI });
  assert.equal(h.tip, "totp");
  assert.equal(h.hane, 6);
  assert.equal((await depo.hesaplariOku()).length, 1);

  await depo.hesapGuncelle(h.id, { sayac: 5 });
  assert.equal((await depo.hesaplariOku())[0].sayac, 5);

  await depo.hesapSil(h.id);
  assert.deepEqual(await depo.hesaplariOku(), []);
  await assert.rejects(() => depo.hesapGuncelle("yok", {}), /not found/);
});

test("birleştirme aynı hesabı iki kez eklemez", async () => {
  await sifirla();
  const gelen = [
    { ad: "muslu", issuer: "GitHub", gizli: GIZLI },
    { ad: "muslu", issuer: "GitHub", gizli: GIZLI }, // aynı → atlanmalı
    { ad: "muslu", issuer: "GitLab", gizli: GIZLI },
  ];
  assert.deepEqual(await depo.hesaplariBirlestir(gelen), { eklenen: 2, atlanan: 1 });
  assert.deepEqual(await depo.hesaplariBirlestir(gelen), { eklenen: 0, atlanan: 3 });
  assert.equal((await depo.hesaplariOku()).length, 2);
});

test("kilit kurulunca gizli anahtar depoda açık kalmıyor", async () => {
  await sifirla();
  await depo.hesapEkle({ ad: "muslu", issuer: "GitHub", gizli: GIZLI });
  await depo.kilitKur("cokgizli");

  assert.equal(YEREL.has("hesaplar"), false, "düz hesaplar silinmeli");
  assert.ok(YEREL.get("kasa"), "kasa yazılmalı");
  const hamDepo = JSON.stringify([...YEREL.entries()]);
  assert.ok(!hamDepo.includes(GIZLI), "gizli anahtar depoda açık metin görünmemeli");

  // kilit kurulduktan hemen sonra oturum açık → okunabilir
  assert.equal((await depo.hesaplariOku())[0].gizli, GIZLI);
  assert.equal(await depo.kilitliMi(), false);
});

test("kilitliyken okuma engelli, doğru parola açıyor", async () => {
  await sifirla();
  await depo.hesapEkle({ ad: "muslu", issuer: "GitHub", gizli: GIZLI });
  await depo.kilitKur("cokgizli");
  await depo.kilitle();

  assert.equal(await depo.kilitliMi(), true);
  await assert.rejects(() => depo.hesaplariOku(), /KILITLI/);
  await assert.rejects(() => depo.kilidiAc("yanlisparola"), /Wrong password/);
  assert.equal(await depo.kilitliMi(), true);

  await depo.kilidiAc("cokgizli");
  assert.equal(await depo.kilitliMi(), false);
  assert.equal((await depo.hesaplariOku())[0].gizli, GIZLI);
});

test("otomatik kilitlenme süresi dolunca oturum düşüyor", async () => {
  await sifirla();
  await depo.hesapEkle({ ad: "muslu", issuer: "GitHub", gizli: GIZLI });
  await depo.kilitKur("cokgizli");
  await depo.ayarlariYaz({ otoKilitDk: 15 });

  OTURUM.set("sonKullanim", Date.now() - 16 * 60_000); // 16 dk önce
  assert.equal(await depo.kilitliMi(), true);
  assert.equal(OTURUM.has("oturumAnahtari"), false, "süresi dolan anahtar silinmeli");
});

test("kilit kaldırma hesapları geri veriyor", async () => {
  await sifirla();
  await depo.hesapEkle({ ad: "muslu", issuer: "GitHub", gizli: GIZLI });
  await depo.kilitKur("cokgizli");
  await depo.kilitle();

  await assert.rejects(() => depo.kilidiKaldir("yanlis"), /Wrong password/);
  await depo.kilidiKaldir("cokgizli");

  assert.equal((await depo.kilitDurumu()).acik, false);
  assert.equal(YEREL.has("kasa"), false);
  assert.equal((await depo.hesaplariOku())[0].gizli, GIZLI);
});

test("parola değiştirme", async () => {
  await sifirla();
  await depo.hesapEkle({ ad: "muslu", issuer: "GitHub", gizli: GIZLI });
  await depo.kilitKur("eskiparola");
  await depo.parolaDegistir("eskiparola", "yeniparola");
  await depo.kilitle();

  await assert.rejects(() => depo.kilidiAc("eskiparola"), /Wrong password/);
  await depo.kilidiAc("yeniparola");
  assert.equal((await depo.hesaplariOku())[0].gizli, GIZLI);
});

test("kısa parola reddediliyor", async () => {
  await sifirla();
  await assert.rejects(() => depo.kilitKur("kisa"), /at least 6/);
});
