// TOTP/HOTP çekirdeği — RFC 4226 + RFC 6238.
// Saf fonksiyonlar: chrome API'sine dokunmaz, Node'da da çalışır (globalThis.crypto.subtle).
"use strict";

import { t } from "./metinler.js";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ALGO_HARITA = { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" };

/** Base32 (RFC 4648) metnini bayta çevirir; boşluk/tire/küçük harf/eksik dolgu toleranslı. */
export function base32Coz(metin) {
  const s = String(metin ?? "").toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (!s) throw new Error(t("gizliBos"));
  let bit = 0, deger = 0;
  const cikti = [];
  for (const ch of s) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error(t("base32Gecersiz", ch));
    deger = (deger << 5) | i;
    bit += 5;
    if (bit >= 8) {
      cikti.push((deger >>> (bit - 8)) & 0xff);
      bit -= 8;
    }
  }
  if (!cikti.length) throw new Error(t("gizliKisa"));
  return new Uint8Array(cikti);
}

/** Baytları Base32'ye çevirir (GA aktarımındaki ham secret'ı saklamak için). */
export function base32Uret(baytlar) {
  let bit = 0, deger = 0, cikti = "";
  for (const b of baytlar) {
    deger = (deger << 8) | b;
    bit += 8;
    while (bit >= 5) {
      cikti += B32[(deger >>> (bit - 5)) & 31];
      bit -= 5;
    }
  }
  if (bit > 0) cikti += B32[(deger << (5 - bit)) & 31];
  return cikti;
}

/** RFC 4226 HOTP. `gizliBaytlar` Uint8Array, `sayac` sayı veya BigInt. */
export async function hotp(gizliBaytlar, sayac, { algo = "SHA1", hane = 6 } = {}) {
  const hash = ALGO_HARITA[String(algo).toUpperCase().replace("-", "")];
  if (!hash) throw new Error(t("algoDesteklenmiyor", algo));
  if (!(hane >= 6 && hane <= 10)) throw new Error(t("haneDesteklenmiyor", hane));

  const mesaj = new Uint8Array(8);
  let n = BigInt(sayac);
  for (let i = 7; i >= 0; i--) {
    mesaj[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  const anahtar = await crypto.subtle.importKey("raw", gizliBaytlar, { name: "HMAC", hash }, false, ["sign"]);
  const imza = new Uint8Array(await crypto.subtle.sign("HMAC", anahtar, mesaj));

  // Dinamik kesme — RFC 4226 §5.4
  const ofset = imza[imza.length - 1] & 0x0f;
  const kod =
    (((imza[ofset] & 0x7f) << 24) | (imza[ofset + 1] << 16) | (imza[ofset + 2] << 8) | imza[ofset + 3]) >>> 0;
  return String(kod % 10 ** hane).padStart(hane, "0");
}

/** RFC 6238 TOTP. `zamanMs` verilmezse şimdiki zaman. */
export async function totp(gizliBaytlar, { algo = "SHA1", hane = 6, periyot = 30, zamanMs = Date.now() } = {}) {
  if (!(periyot > 0)) throw new Error(t("periyotGecersiz", periyot));
  return hotp(gizliBaytlar, Math.floor(zamanMs / 1000 / periyot), { algo, hane });
}

/** Hesap kaydından kod üretir (tip'e göre TOTP/HOTP seçer). */
export async function kodUret(hesap, zamanMs = Date.now()) {
  const baytlar = base32Coz(hesap.gizli);
  const secenek = { algo: hesap.algo || "SHA1", hane: hesap.hane || 6 };
  if (hesap.tip === "hotp") return hotp(baytlar, hesap.sayac || 0, secenek);
  return totp(baytlar, { ...secenek, periyot: hesap.periyot || 30, zamanMs });
}

/** TOTP periyodunda kalan saniye. */
export function kalanSaniye(periyot = 30, zamanMs = Date.now()) {
  const p = periyot > 0 ? periyot : 30;
  return p - (Math.floor(zamanMs / 1000) % p);
}

/** `otpauth://totp/Issuer:ad?secret=...` → hesap nesnesi. */
export function uriCoz(uri) {
  const ham = String(uri ?? "").trim();
  if (!/^otpauth:\/\//i.test(ham)) throw new Error(t("uriOnek"));

  let u;
  try {
    u = new URL(ham);
  } catch {
    throw new Error(t("uriCozulemedi"));
  }

  const tip = u.host.toLowerCase();
  if (tip !== "totp" && tip !== "hotp") throw new Error(t("turDesteklenmiyor", tip || "?"));

  let etiket = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
  let issuer = u.searchParams.get("issuer") || "";
  let ad = etiket;
  const ayrac = etiket.indexOf(":");
  if (ayrac > -1) {
    if (!issuer) issuer = etiket.slice(0, ayrac).trim();
    ad = etiket.slice(ayrac + 1).trim();
  }

  const gizli = (u.searchParams.get("secret") || "").replace(/\s/g, "");
  if (!gizli) throw new Error(t("secretYok"));
  base32Coz(gizli); // erken doğrulama

  const hane = Number(u.searchParams.get("digits") || 6);
  const periyot = Number(u.searchParams.get("period") || 30);
  const algo = String(u.searchParams.get("algorithm") || "SHA1").toUpperCase().replace("-", "");
  if (!ALGO_HARITA[algo]) throw new Error(t("algoDesteklenmiyor", algo));

  return {
    ad: ad || issuer || "(adsız)",
    issuer,
    gizli: gizli.toUpperCase().replace(/=+$/, ""),
    tip,
    algo,
    hane: Number.isFinite(hane) && hane >= 6 && hane <= 10 ? hane : 6,
    periyot: Number.isFinite(periyot) && periyot > 0 ? periyot : 30,
    sayac: tip === "hotp" ? Number(u.searchParams.get("counter") || 0) : 0,
  };
}

/** Hesap nesnesi → `otpauth://` bağlantısı (dışa aktarma için). */
export function uriUret(hesap) {
  const etiket = hesap.issuer
    ? `${encodeURIComponent(hesap.issuer)}:${encodeURIComponent(hesap.ad)}`
    : encodeURIComponent(hesap.ad);
  const p = new URLSearchParams();
  p.set("secret", hesap.gizli);
  if (hesap.issuer) p.set("issuer", hesap.issuer);
  if ((hesap.algo || "SHA1") !== "SHA1") p.set("algorithm", hesap.algo);
  if ((hesap.hane || 6) !== 6) p.set("digits", String(hesap.hane));
  if (hesap.tip === "hotp") p.set("counter", String(hesap.sayac || 0));
  else if ((hesap.periyot || 30) !== 30) p.set("period", String(hesap.periyot));
  return `otpauth://${hesap.tip || "totp"}/${etiket}?${p.toString()}`;
}
