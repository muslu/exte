// PBKDF2 + AES-GCM sarmalayıcı — hem opsiyonel kilit hem şifreli yedek bunu kullanır.
// Saf WebCrypto: Node'da da çalışır (test edilebilir).
"use strict";

import { t } from "./metinler.js";

export const PBKDF2_YINELEME = 310_000;

export function b64Kodla(baytlar) {
  const a = baytlar instanceof Uint8Array ? baytlar : new Uint8Array(baytlar);
  let s = "";
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s);
}

export function b64Coz(metin) {
  const s = atob(String(metin).replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, ""));
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}

export function rastgele(uzunluk) {
  return crypto.getRandomValues(new Uint8Array(uzunluk));
}

/** Paroladan 256-bit AES-GCM anahtarı türetir. `tuz` Uint8Array (16 B). */
export async function anahtarTurte(parola, tuz, yineleme = PBKDF2_YINELEME) {
  if (!parola) throw new Error(t("parolaBos"));
  const ham = await crypto.subtle.importKey("raw", new TextEncoder().encode(parola), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: tuz, iterations: yineleme, hash: "SHA-256" },
    ham,
    { name: "AES-GCM", length: 256 },
    true, // oturum anahtarını dışa aktarabilmek için
    ["encrypt", "decrypt"],
  );
}

/** Metni şifreler → base64(iv ‖ şifreli). */
export async function sifrele(anahtar, metin) {
  const iv = rastgele(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, anahtar, new TextEncoder().encode(metin)),
  );
  const paket = new Uint8Array(iv.length + ct.length);
  paket.set(iv, 0);
  paket.set(ct, iv.length);
  return b64Kodla(paket);
}

/** base64(iv ‖ şifreli) → metin. Parola yanlışsa anlamlı hata fırlatır. */
export async function coz(anahtar, paketB64) {
  const paket = b64Coz(paketB64);
  if (paket.length < 13) throw new Error(t("veriBozuk"));
  try {
    const duz = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: paket.subarray(0, 12) },
      anahtar,
      paket.subarray(12),
    );
    return new TextDecoder().decode(duz);
  } catch {
    throw new Error(t("parolaYanlis"));
  }
}

export async function anahtarDisaAktar(anahtar) {
  return b64Kodla(new Uint8Array(await crypto.subtle.exportKey("raw", anahtar)));
}

export async function anahtarIceAktar(hamB64) {
  return crypto.subtle.importKey("raw", b64Coz(hamB64), { name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}
