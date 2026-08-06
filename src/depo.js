// chrome.storage katmanı — hesap CRUD + opsiyonel parola kilidi.
//
// Şema (chrome.storage.local):
//   surum:    1
//   kilit:    {acik:false} | {acik:true, tuz:b64, yineleme:n, kontrol:b64(iv+ct)}
//   hesaplar: [...]        ← kilit KAPALIYKEN
//   kasa:     b64(iv+ct)   ← kilit AÇIKKEN (hesaplar JSON'u şifreli)
//   ayarlar:  {tema, otoKilitDk}
//
// Oturum anahtarı chrome.storage.session'da tutulur: tarayıcı kapanınca silinir,
// content script'ler göremez (TRUSTED_CONTEXTS). Service worker belleği MV3'te
// 30 sn'de öldüğü için bellekte tutmak işe yaramaz.
"use strict";

import { anahtarTurte, anahtarDisaAktar, anahtarIceAktar, sifrele, coz, rastgele, b64Kodla, b64Coz, PBKDF2_YINELEME } from "./kripto.js";

import { t } from "./metinler.js";

const SURUM = 1;
const OTURUM_ANAHTAR = "oturumAnahtari";
const OTURUM_DAMGA = "sonKullanim";
export const VARSAYILAN_AYARLAR = { tema: "auto", otoKilitDk: 15, dil: "auto" };

const yerel = {
  oku: (anahtarlar) => chrome.storage.local.get(anahtarlar),
  yaz: (nesne) => chrome.storage.local.set(nesne),
  sil: (anahtarlar) => chrome.storage.local.remove(anahtarlar),
};

/* ---------- ayarlar ---------- */

export async function ayarlariOku() {
  const { ayarlar } = await yerel.oku("ayarlar");
  return { ...VARSAYILAN_AYARLAR, ...(ayarlar || {}) };
}

export async function ayarlariYaz(yama) {
  const yeni = { ...(await ayarlariOku()), ...yama };
  await yerel.yaz({ ayarlar: yeni });
  return yeni;
}

/* ---------- kilit durumu ---------- */

export async function kilitDurumu() {
  const { kilit } = await yerel.oku("kilit");
  return kilit && kilit.acik ? kilit : { acik: false };
}

/** Kilit açıksa ve oturum anahtarı yoksa/süresi dolduysa true. */
export async function kilitliMi() {
  const kilit = await kilitDurumu();
  if (!kilit.acik) return false;
  return (await oturumAnahtari()) === null;
}

async function oturumAnahtari() {
  const veri = await chrome.storage.session.get([OTURUM_ANAHTAR, OTURUM_DAMGA]);
  if (!veri[OTURUM_ANAHTAR]) return null;

  const { otoKilitDk } = await ayarlariOku();
  const gecen = Date.now() - (veri[OTURUM_DAMGA] || 0);
  if (otoKilitDk > 0 && gecen > otoKilitDk * 60_000) {
    await kilitle();
    return null;
  }
  await chrome.storage.session.set({ [OTURUM_DAMGA]: Date.now() });
  return anahtarIceAktar(veri[OTURUM_ANAHTAR]);
}

/** Parolayı doğrular ve oturum anahtarını açar. Yanlışsa hata fırlatır. */
export async function kilidiAc(parola) {
  const kilit = await kilitDurumu();
  if (!kilit.acik) return;
  const anahtar = await anahtarTurte(parola, b64Coz(kilit.tuz), kilit.yineleme || PBKDF2_YINELEME);
  await coz(anahtar, kilit.kontrol); // parola yanlışsa burada patlar
  await chrome.storage.session.set({
    [OTURUM_ANAHTAR]: await anahtarDisaAktar(anahtar),
    [OTURUM_DAMGA]: Date.now(),
  });
}

export async function kilitle() {
  await chrome.storage.session.remove([OTURUM_ANAHTAR, OTURUM_DAMGA]);
}

/** Kilidi kurar: mevcut hesaplar şifrelenip `kasa`ya taşınır. */
export async function kilitKur(parola) {
  if (!parola || parola.length < 6) throw new Error(t("parolaKisa"));
  if ((await kilitDurumu()).acik) throw new Error(t("kilitZatenAcik"));

  const hesaplar = await hesaplariOku();
  const tuz = rastgele(16);
  const anahtar = await anahtarTurte(parola, tuz);
  await yerel.yaz({
    surum: SURUM,
    kilit: { acik: true, tuz: b64Kodla(tuz), yineleme: PBKDF2_YINELEME, kontrol: await sifrele(anahtar, "exte") },
    kasa: await sifrele(anahtar, JSON.stringify(hesaplar)),
  });
  await yerel.sil("hesaplar");
  await chrome.storage.session.set({
    [OTURUM_ANAHTAR]: await anahtarDisaAktar(anahtar),
    [OTURUM_DAMGA]: Date.now(),
  });
}

/** Kilidi kaldırır: hesaplar düz olarak geri yazılır. Parola doğrulaması ister. */
export async function kilidiKaldir(parola) {
  const kilit = await kilitDurumu();
  if (!kilit.acik) return;
  const anahtar = await anahtarTurte(parola, b64Coz(kilit.tuz), kilit.yineleme || PBKDF2_YINELEME);
  await coz(anahtar, kilit.kontrol);
  const { kasa } = await yerel.oku("kasa");
  const hesaplar = kasa ? JSON.parse(await coz(anahtar, kasa)) : [];
  await yerel.yaz({ surum: SURUM, kilit: { acik: false }, hesaplar });
  await yerel.sil("kasa");
  await kilitle();
}

export async function parolaDegistir(eski, yeni) {
  await kilidiKaldir(eski);
  await kilitKur(yeni);
}

/* ---------- hesap CRUD ---------- */

export async function hesaplariOku() {
  const kilit = await kilitDurumu();
  if (!kilit.acik) {
    const { hesaplar } = await yerel.oku("hesaplar");
    return Array.isArray(hesaplar) ? hesaplar : [];
  }
  const anahtar = await oturumAnahtari();
  if (!anahtar) throw new Error("KILITLI");
  const { kasa } = await yerel.oku("kasa");
  if (!kasa) return [];
  return JSON.parse(await coz(anahtar, kasa));
}

export async function hesaplariYaz(hesaplar) {
  const liste = hesaplar.map((h, i) => ({ ...h, sira: i }));
  const kilit = await kilitDurumu();
  if (!kilit.acik) {
    await yerel.yaz({ surum: SURUM, hesaplar: liste });
    return liste;
  }
  const anahtar = await oturumAnahtari();
  if (!anahtar) throw new Error("KILITLI");
  await yerel.yaz({ surum: SURUM, kasa: await sifrele(anahtar, JSON.stringify(liste)) });
  return liste;
}

export function yeniKimlik() {
  return b64Kodla(rastgele(9)).replace(/[+/=]/g, "").slice(0, 12);
}

export async function hesapEkle(hesap) {
  const liste = await hesaplariOku();
  const kayit = { id: yeniKimlik(), sayac: 0, algo: "SHA1", hane: 6, periyot: 30, tip: "totp", ...hesap };
  liste.push(kayit);
  await hesaplariYaz(liste);
  return kayit;
}

export async function hesapGuncelle(id, yama) {
  const liste = await hesaplariOku();
  const i = liste.findIndex((h) => h.id === id);
  if (i < 0) throw new Error(t("hesapYok"));
  liste[i] = { ...liste[i], ...yama };
  await hesaplariYaz(liste);
  return liste[i];
}

export async function hesapSil(id) {
  const liste = await hesaplariOku();
  await hesaplariYaz(liste.filter((h) => h.id !== id));
}

/** Aynı hesap zaten var mı? (issuer+ad+gizli üçlüsü) */
export function ayniMi(a, b) {
  const n = (s) => String(s || "").trim().toLowerCase();
  return n(a.issuer) === n(b.issuer) && n(a.ad) === n(b.ad) && n(a.gizli) === n(b.gizli);
}

/** Gelen hesapları mevcutlarla birleştirir. → {eklenen, atlanan} */
export async function hesaplariBirlestir(gelen) {
  const mevcut = await hesaplariOku();
  const eklenecek = [];
  let atlanan = 0;
  for (const h of gelen) {
    if (mevcut.some((m) => ayniMi(m, h)) || eklenecek.some((m) => ayniMi(m, h))) {
      atlanan++;
      continue;
    }
    eklenecek.push({ id: yeniKimlik(), sayac: 0, algo: "SHA1", hane: 6, periyot: 30, tip: "totp", ...h });
  }
  if (eklenecek.length) await hesaplariYaz([...mevcut, ...eklenecek]);
  return { eklenen: eklenecek.length, atlanan };
}
