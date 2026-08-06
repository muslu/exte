// Yedekleme biçimleri: parola ile şifreli JSON + düz otpauth:// listesi (.txt).
"use strict";

import { anahtarTurte, sifrele, coz, rastgele, b64Kodla, b64Coz, PBKDF2_YINELEME } from "./kripto.js";
import { uriCoz, uriUret } from "./otp.js";
import { t } from "./metinler.js";

export const YEDEK_TIPI = "exte-yedek";

/** Hesapları parola ile şifreli yedek nesnesine çevirir. */
export async function sifreliYedekUret(hesaplar, parola) {
  if (!parola || parola.length < 6) throw new Error(t("yedekParolaKisa"));
  const tuz = rastgele(16);
  const anahtar = await anahtarTurte(parola, tuz);
  return {
    tip: YEDEK_TIPI,
    surum: 1,
    kdf: { ad: "PBKDF2", hash: "SHA-256", yineleme: PBKDF2_YINELEME, tuz: b64Kodla(tuz) },
    veri: await sifrele(anahtar, JSON.stringify({ hesaplar })),
  };
}

/** Şifreli yedek nesnesini çözer → hesap dizisi. */
export async function sifreliYedekCoz(nesne, parola) {
  if (!nesne || nesne.tip !== YEDEK_TIPI) throw new Error(t("yedekDegil"));
  if (!nesne.kdf?.tuz || !nesne.veri) throw new Error(t("yedekBozuk"));
  const anahtar = await anahtarTurte(parola, b64Coz(nesne.kdf.tuz), nesne.kdf.yineleme || PBKDF2_YINELEME);
  const duz = JSON.parse(await coz(anahtar, nesne.veri));
  if (!Array.isArray(duz.hesaplar)) throw new Error(t("yedekBicim"));
  return duz.hesaplar;
}

/** Hesaplar → satır satır otpauth:// metni. */
export function txtUret(hesaplar) {
  return hesaplar.map(uriUret).join("\n") + "\n";
}

/** otpauth:// listesi → {hesaplar, hatalar}. Bozuk satırlar atlanıp raporlanır. */
export function txtCoz(metin) {
  const hesaplar = [];
  const hatalar = [];
  const satirlar = String(metin).split(/\r?\n/);
  satirlar.forEach((satir, i) => {
    const s = satir.trim();
    if (!s || s.startsWith("#")) return;
    try {
      hesaplar.push(uriCoz(s));
    } catch (e) {
      hatalar.push(t("satirHatasi", i + 1, e.message));
    }
  });
  return { hesaplar, hatalar };
}

/** Tarayıcıda dosya indirir. */
export function dosyaIndir(adSonEki, icerik, mimeTuru) {
  const d = new Date();
  const damga = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const blob = new Blob([icerik], { type: mimeTuru });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `exte-yedek-${damga}.${adSonEki}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
