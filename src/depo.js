// chrome.storage katmanı — hesap CRUD + zorunlu parola kilidi.
//
// Parola ZORUNLUDUR: ilk kurulumda kullanıcı belirler, sonra her açılışta sorulur.
// Parola kurtarma YOKTUR — parola yalnızca PBKDF2 türetiminde kullanılır, hiçbir
// yerde saklanmaz; unutulursa `kasa` çözülemez.
//
// Şema (chrome.storage.local):
//   surum:    1
//   kilit:    {acik:false} | {acik:true, tuz:b64, yineleme:n, kontrol:b64(iv+ct)}
//   hesaplar: [...]        ← yalnızca kurulum ÖNCESİ (1.0.0'dan yükseltmede)
//   kasa:     b64(iv+ct)   ← kurulum SONRASI (hesaplar JSON'u şifreli)
//   ayarlar:  {tema, otoKilitDk, dil}
//
// Oturum anahtarı chrome.storage.session'da tutulur: tarayıcı kapanınca silinir,
// content script'ler göremez (TRUSTED_CONTEXTS). Service worker belleği MV3'te
// 30 sn'de öldüğü için bellekte tutmak işe yaramaz.
"use strict";

import { anahtarTurte, anahtarDisaAktar, anahtarIceAktar, sifrele, coz, rastgele, b64Kodla, b64Coz, PBKDF2_YINELEME } from "./kripto.js";

import { t } from "./metinler.js";

const SURUM = 1;
export const OTURUM_ANAHTAR = "oturumAnahtari";
const OTURUM_DAMGA = "sonKullanim";

/** otoKilitDk için özel değer: uzantı her açıldığında parola sorulur. */
export const HER_ACILIS = -1;

/** Kullanıcının girebileceği en uzun süre: 30 gün. */
export const OTO_KILIT_MAKS_DK = 43_200;

export const VARSAYILAN_AYARLAR = { tema: "auto", otoKilitDk: HER_ACILIS, dil: "auto" };

const yerel = {
  oku: (anahtarlar) => chrome.storage.local.get(anahtarlar),
  yaz: (nesne) => chrome.storage.local.set(nesne),
  sil: (anahtarlar) => chrome.storage.local.remove(anahtarlar),
};

/* ---------- ayarlar ---------- */

export async function ayarlariOku() {
  const { ayarlar } = await yerel.oku("ayarlar");
  const birlesik = { ...VARSAYILAN_AYARLAR, ...(ayarlar || {}) };
  // Bozuk/elle düzenlenmiş bir süre kilidi sonsuza kadar açık bırakmasın:
  // geçersiz değer en katı varsayılana (her açılışta sor) düşer.
  if (!otoKilitGecerliMi(birlesik.otoKilitDk)) birlesik.otoKilitDk = VARSAYILAN_AYARLAR.otoKilitDk;
  return birlesik;
}

export async function ayarlariYaz(yama) {
  const yeni = { ...(await ayarlariOku()), ...yama };
  await yerel.yaz({ ayarlar: yeni });
  return yeni;
}

/** Geçerli süreler: HER_ACILIS (-1), 0 (tarayıcı oturumu boyunca) veya 1…43200 tam dakika. */
export function otoKilitGecerliMi(dk) {
  return Number.isInteger(dk) && dk >= HER_ACILIS && dk <= OTO_KILIT_MAKS_DK;
}

/** Parola sorma sıklığını yazar. Kullanıcının girdiği özel süre buradan doğrulanır. */
export async function otoKilitYaz(dk) {
  if (!otoKilitGecerliMi(dk)) throw new Error(t("otoSureGecersiz", OTO_KILIT_MAKS_DK / 1440));
  return ayarlariYaz({ otoKilitDk: dk });
}

/* ---------- kilit durumu ---------- */

export async function kilitDurumu() {
  const { kilit } = await yerel.oku("kilit");
  return kilit && kilit.acik ? kilit : { acik: false };
}

/** Parola henüz belirlenmediyse true — arayüz kurulum ekranını gösterir. */
export async function kurulumGerekliMi() {
  return !(await kilitDurumu()).acik;
}

/** Kilit kuruluysa ve oturum anahtarı yoksa/süresi dolduysa true. */
export async function kilitliMi() {
  const kilit = await kilitDurumu();
  if (!kilit.acik) return false;
  return (await oturumAnahtari()) === null;
}

/** Popup her açıldığında çağrılır: "her açılışta sor" seçiliyse oturumu düşürür. */
export async function acilistaKilitle() {
  const { otoKilitDk } = await ayarlariOku();
  if (otoKilitDk === HER_ACILIS) await kilitle();
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

/** İlk kurulum: parolayı belirler, varsa mevcut hesaplar şifrelenip `kasa`ya taşınır. */
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

/**
 * Parolayı değiştirir: kasa eski parolayla çözülüp yeni anahtarla yeniden şifrelenir.
 * Gizli anahtarlar hiçbir adımda diske düz yazılmaz. Eski parola yanlışsa hata fırlatır.
 */
export async function parolaDegistir(eski, yeni) {
  if (!yeni || yeni.length < 6) throw new Error(t("parolaKisa"));
  const kilit = await kilitDurumu();
  if (!kilit.acik) throw new Error(t("kilitYok"));

  const eskiAnahtar = await anahtarTurte(eski, b64Coz(kilit.tuz), kilit.yineleme || PBKDF2_YINELEME);
  await coz(eskiAnahtar, kilit.kontrol); // eski parola yanlışsa burada patlar
  const { kasa } = await yerel.oku("kasa");
  const hesaplar = kasa ? JSON.parse(await coz(eskiAnahtar, kasa)) : [];

  const tuz = rastgele(16);
  const yeniAnahtar = await anahtarTurte(yeni, tuz);
  await yerel.yaz({
    surum: SURUM,
    kilit: { acik: true, tuz: b64Kodla(tuz), yineleme: PBKDF2_YINELEME, kontrol: await sifrele(yeniAnahtar, "exte") },
    kasa: await sifrele(yeniAnahtar, JSON.stringify(hesaplar)),
  });
  await chrome.storage.session.set({
    [OTURUM_ANAHTAR]: await anahtarDisaAktar(yeniAnahtar),
    [OTURUM_DAMGA]: Date.now(),
  });
}

/* ---------- hesap CRUD ---------- */

export async function hesaplariOku() {
  const kilit = await kilitDurumu();
  // Kurulum öncesi (yalnızca 1.0.0'dan yükseltmede) hesaplar düz alanda durur;
  // kilitKur() ilk parolada bu listeyi kasaya taşır.
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
