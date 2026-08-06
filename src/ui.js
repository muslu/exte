// Küçük DOM yardımcıları + sayfa çevirisi — popup ve ayarlar sayfası ortak kullanır.
"use strict";

import { ayarlariOku } from "./depo.js";
import { t, diliAyarla, etkinDil } from "./metinler.js";

export { t } from "./metinler.js";

export const $ = (secici, kok = document) => kok.querySelector(secici);
export const $$ = (secici, kok = document) => [...kok.querySelectorAll(secici)];

/** Kısa bildirim. Ekran okuyucular için aria-live bölgesine de yazar. */
export function toast(mesaj, tur = "bilgi") {
  $("#toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.id = "toast";
  el.textContent = mesaj;
  if (tur === "hata") el.style.background = "var(--hata)";
  document.body.append(el);
  duyur(mesaj);
  setTimeout(() => el.remove(), tur === "hata" ? 4500 : 2000);
}

/** Sadece ekran okuyucuya duyurur (görsel geri bildirim ayrı). */
export function duyur(mesaj) {
  const canli = $("#canliDurum");
  if (canli) canli.textContent = mesaj;
}

/** Kayıtlı dil tercihini yükler ve etkinleştirir. */
export async function diliBaslat() {
  const { dil } = await ayarlariOku();
  diliAyarla(dil);
  document.documentElement.lang = etkinDil();
}

/**
 * `data-i18n*` işaretli her düğümü etkin dile çevirir.
 *   data-i18n         → textContent
 *   data-i18n-html    → innerHTML (yalnızca kendi metinlerimiz; kullanıcı verisi geçmez)
 *   data-i18n-ph      → placeholder
 *   data-i18n-title   → title
 *   data-i18n-aria    → aria-label
 *   data-i18n-baslik  → document.title
 */
export function sayfayiCevir(kok = document) {
  const uygula = (nitelik, islev) => {
    for (const el of kok.querySelectorAll(`[${nitelik}]`)) {
      islev(el, t(el.getAttribute(nitelik)));
    }
  };
  uygula("data-i18n", (el, metin) => (el.textContent = metin));
  uygula("data-i18n-html", (el, metin) => (el.innerHTML = metin));
  uygula("data-i18n-ph", (el, metin) => (el.placeholder = metin));
  uygula("data-i18n-title", (el, metin) => (el.title = metin));
  uygula("data-i18n-aria", (el, metin) => el.setAttribute("aria-label", metin));

  const baslik = kok.querySelector("[data-i18n-baslik]");
  if (baslik) document.title = t(baslik.getAttribute("data-i18n-baslik"));
}

export async function temayiUygula() {
  const { tema } = await ayarlariOku();
  if (tema === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = tema;
}

/** Metni panoya kopyalar. */
export async function panoyaKopyala(metin) {
  await navigator.clipboard.writeText(metin);
}
