// QR okuma: görünen sekmeden yakalama, resim dosyası, panodan yapıştırma.
// jsQR klasik <script> ile yüklenir (UMD, ES module değil) → globalThis.jsQR.
"use strict";

import { t } from "./metinler.js";

function jsqr() {
  if (typeof globalThis.jsQR !== "function") throw new Error(t("jsqrYok"));
  return globalThis.jsQR;
}

/** Tek geçiş: bitmap'i verilen ölçekte canvas'a çizip QR arar. */
function tekGecis(bitmap, olcek) {
  const g = Math.max(1, Math.round(bitmap.width * olcek));
  const y = Math.max(1, Math.round(bitmap.height * olcek));
  const ctx = new OffscreenCanvas(g, y).getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, g, y);
  const veri = ctx.getImageData(0, 0, g, y);
  return jsqr()(veri.data, veri.width, veri.height, { inversionAttempts: "attemptBoth" })?.data || null;
}

/**
 * Önce özgün boyutta arar. Bulamazsa:
 *  - küçük görüntüde (<1.5 MP) 2× büyütüp dener — düşük çözünürlüklü QR'lar için,
 *  - büyük görüntüde küçültüp dener — jsQR 4K ekran görüntüsünde yavaşlar ve gürültüde takılır.
 */
function bitmaptenCoz(bitmap) {
  const piksel = bitmap.width * bitmap.height;
  const ilk = tekGecis(bitmap, 1);
  if (ilk) return ilk;
  if (piksel < 1.5e6) return tekGecis(bitmap, 2);
  return tekGecis(bitmap, Math.sqrt(1.5e6 / piksel));
}

/** data: URL'ini Blob'a çevirir. fetch() kullanmıyoruz — MV3 CSP'sine takılmasın. */
function dataUrlBlob(dataUrl) {
  const [bas, govde] = dataUrl.split(",", 2);
  const tur = /data:([^;,]+)/.exec(bas)?.[1] || "image/png";
  const ikili = atob(govde);
  const baytlar = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i++) baytlar[i] = ikili.charCodeAt(i);
  return new Blob([baytlar], { type: tur });
}

/** Blob / File / data-URL → QR metni (bulunamazsa null). */
export async function resimdenCoz(kaynak) {
  const blob = typeof kaynak === "string" ? dataUrlBlob(kaynak) : kaynak;
  const bitmap = await createImageBitmap(blob);
  try {
    return bitmaptenCoz(bitmap);
  } finally {
    bitmap.close?.();
  }
}

/** Görünen sekmenin ekran görüntüsünü alıp QR arar. */
export async function ekrandanTara() {
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(undefined, { format: "png" });
  } catch {
    throw new Error(t("yakalanamiyor"));
  }
  if (!dataUrl) throw new Error(t("goruntuAlinamadi"));
  return resimdenCoz(dataUrl);
}

/** paste olayındaki ilk resmi çözer (yoksa null). */
export async function panodanCoz(olay) {
  const ogeler = [...(olay.clipboardData?.items || [])];
  const resim = ogeler.find((o) => o.type.startsWith("image/"));
  if (!resim) return null;
  return resimdenCoz(resim.getAsFile());
}
