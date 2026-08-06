// exte ayarlar sayfası — yedekleme, GA aktarımı, parola kilidi, tema, dil.
"use strict";

import * as depo from "./src/depo.js";
import { sifreliYedekUret, sifreliYedekCoz, txtUret, txtCoz, dosyaIndir, YEDEK_TIPI } from "./src/yedek.js";
import { resimdenCoz } from "./src/qr.js";
import { gocCoz } from "./src/goc.js";
import { $, toast, duyur, temayiUygula, t, diliBaslat, sayfayiCevir } from "./src/ui.js";

const durum = (secici, mesaj, tur = "") => {
  const el = $(secici);
  el.textContent = mesaj;
  el.className = `durum ${tur === "hata" ? "hata-metin" : tur === "ok" ? "ok-metin" : ""}`;
  duyur(mesaj);
};

/** Hazır seçenekler; bunların dışındaki her süre "özel" sayılır. */
const SABIT_SURELER = [depo.HER_ACILIS, 0, 5, 15, 60];

/** Dakikayı okunur süreye çevirir: 480 → "8 saat", 2880 → "2 gün". */
const sureMetni = (dk) =>
  dk % 1440 === 0 ? t("sureGun", dk / 1440) : dk % 60 === 0 ? t("sureSaat", dk / 60) : t("sureDk", dk);

/** Parola sorma sıklığı kutusundaki seçenek metinlerini diline göre yazar. */
function otoKilitSecenekleri(ozelDk = null) {
  for (const secenek of $("#otoKilit").options) {
    if (secenek.value === "ozel") {
      secenek.textContent = ozelDk === null ? t("otoOzel") : t("otoOzelSecili", sureMetni(ozelDk));
      continue;
    }
    const dk = Number(secenek.value);
    secenek.textContent =
      dk === depo.HER_ACILIS ? t("otoAcilis") : dk === 0 ? t("otoKapali") : dk === 60 ? t("otoSaat") : t("otoDk", dk);
  }
  for (const secenek of $("#ozelBirim").options) {
    secenek.textContent = { 1: t("birimDk"), 60: t("birimSaat"), 1440: t("birimGun") }[secenek.value];
  }
}

/** Özel süre alanını dakikadan doldurur: en büyük tam bölen birimi seçer. */
function ozelSureyiGoster(dk) {
  const birim = dk % 1440 === 0 ? 1440 : dk % 60 === 0 ? 60 : 1;
  $("#ozelBirim").value = String(birim);
  $("#ozelSayi").value = String(dk / birim);
  ozelSiniriGuncelle();
}

/** Seçili birime göre üst sınırı yazar — 30 gün = 720 saat = 43200 dakika. */
function ozelSiniriGuncelle() {
  $("#ozelSayi").max = String(depo.OTO_KILIT_MAKS_DK / Number($("#ozelBirim").value));
}

/* ---------------- ekran tazeleme ---------------- */

async function tazele() {
  const kurulum = await depo.kurulumGerekliMi();
  const kilitli = !kurulum && (await depo.kilitliMi());
  $("#kurulumKart").hidden = !kurulum;
  $("#kilitKart").hidden = !kilitli;
  $("#anaIcerik").hidden = kurulum || kilitli;
  if (kurulum) {
    $("#ozet").textContent = t("kurulumOzet");
    $("#kurulumParola").focus();
    return;
  }
  if (kilitli) {
    $("#ozet").textContent = t("kilitliOzet");
    $("#kilitParola").focus();
    return;
  }

  const hesaplar = await depo.hesaplariOku();
  const ayarlar = await depo.ayarlariOku();

  $("#ozet").textContent = t("ozet", hesaplar.length);

  const ozel = !SABIT_SURELER.includes(ayarlar.otoKilitDk);
  otoKilitSecenekleri(ozel ? ayarlar.otoKilitDk : null);
  $("#otoKilit").value = ozel ? "ozel" : String(ayarlar.otoKilitDk);
  $("#ozelSureAlan").hidden = !ozel;
  ozelSureyiGoster(ozel ? ayarlar.otoKilitDk : 30);

  $("#tema").value = ayarlar.tema;
  $("#dil").value = ayarlar.dil;

  const govde = $("#hesapTablo tbody");
  govde.replaceChildren(
    ...hesaplar.map((h) => {
      const tr = document.createElement("tr");
      for (const metin of [h.issuer || "—", h.ad, (h.tip || "totp").toUpperCase()]) {
        const td = document.createElement("td");
        td.textContent = metin;
        tr.append(td);
      }
      const td = document.createElement("td");
      const sil = document.createElement("button");
      sil.type = "button";
      sil.className = "duz tehlike";
      sil.textContent = t("sil");
      const etiket = `${h.issuer ? h.issuer + " · " : ""}${h.ad}`;
      sil.setAttribute("aria-label", t("silAria", etiket));
      sil.addEventListener("click", async () => {
        if (!confirm(t("silOnay", etiket))) return;
        await depo.hesapSil(h.id);
        toast(t("hesapSilindi"));
        await tazele();
      });
      td.append(sil);
      tr.append(td);
      return tr;
    }),
  );
  $("#hesapTablo").hidden = hesaplar.length === 0;
  $("#hesapBos").hidden = hesaplar.length > 0;
}

/* ---------------- içe aktarma ortak ---------------- */

async function birlestirVeBildir(gelen, secici) {
  const { eklenen, atlanan } = await depo.hesaplariBirlestir(gelen);
  durum(secici, t("iceAktarildi", eklenen, atlanan ? t("iceAktarildiAtlanan", atlanan) : ""), "ok");
  await tazele();
}

/* ---------------- olaylar ---------------- */

$("#kilitForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#kilitHata").textContent = "";
  try {
    await depo.kilidiAc($("#kilitParola").value);
    $("#kilitParola").value = "";
    await tazele();
  } catch (err) {
    $("#kilitHata").textContent = err.message;
  }
});

// --- ilk kurulum (parola hiç belirlenmemişse) ---
$("#kurulumForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#kurulumHata").textContent = "";
  try {
    if ($("#kurulumParola").value !== $("#kurulumParola2").value) throw new Error(t("parolalarEslesmiyor"));
    await depo.kilitKur($("#kurulumParola").value);
    $("#kurulumParola").value = $("#kurulumParola2").value = "";
    toast(t("kilitKuruldu"));
    await tazele();
  } catch (err) {
    $("#kurulumHata").textContent = err.message;
  }
});

// --- dışa aktar ---
$("#disaForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const hesaplar = await depo.hesaplariOku();
    if (!hesaplar.length) throw new Error(t("disaAktarilacakYok"));
    const yedek = await sifreliYedekUret(hesaplar, $("#disaParola").value);
    dosyaIndir("json", JSON.stringify(yedek, null, 2), "application/json");
    $("#disaParola").value = "";
    durum("#disaDurum", t("sifreliIndirildi", hesaplar.length), "ok");
  } catch (err) {
    durum("#disaDurum", err.message, "hata");
  }
});

$("#disaTxt").addEventListener("click", async () => {
  try {
    const hesaplar = await depo.hesaplariOku();
    if (!hesaplar.length) throw new Error(t("disaAktarilacakYok"));
    if (!confirm(t("txtOnay"))) return;
    dosyaIndir("txt", txtUret(hesaplar), "text/plain");
    durum("#disaDurum", t("sifresizIndirildi", hesaplar.length), "ok");
  } catch (err) {
    durum("#disaDurum", err.message, "hata");
  }
});

// --- içe aktar ---
$("#iceDosyaAc").addEventListener("click", () => $("#iceDosya").click());
$("#iceDosya").addEventListener("change", async (e) => {
  const dosya = e.target.files?.[0];
  e.target.value = "";
  if (!dosya) return;
  try {
    const icerik = await dosya.text();
    let gelen;
    if (icerik.trim().startsWith("{")) {
      const nesne = JSON.parse(icerik);
      if (nesne.tip !== YEDEK_TIPI) throw new Error(t("yedekDegil"));
      if (!$("#iceParola").value) throw new Error(t("sifreliIcinParola"));
      gelen = await sifreliYedekCoz(nesne, $("#iceParola").value);
    } else {
      const { hesaplar, hatalar } = txtCoz(icerik);
      if (hatalar.length) toast(t("satirOkunamadi", hatalar.length), "hata");
      gelen = hesaplar;
    }
    if (!gelen.length) throw new Error(t("dosyadaHesapYok"));
    $("#iceParola").value = "";
    await birlestirVeBildir(gelen, "#iceDurum");
  } catch (err) {
    durum("#iceDurum", err.message, "hata");
  }
});

// --- Google Authenticator aktarımı ---
$("#gocDosyaAc").addEventListener("click", () => $("#gocDosya").click());
$("#gocDosya").addEventListener("change", async (e) => {
  const dosya = e.target.files?.[0];
  e.target.value = "";
  if (!dosya) return;
  try {
    durum("#gocDurum", t("qrOkunuyor"));
    const metin = await resimdenCoz(dosya);
    if (!metin) throw new Error(t("qrResimdeYok"));
    await gocIsle(metin);
  } catch (err) {
    durum("#gocDurum", err.message, "hata");
  }
});

$("#gocEkle").addEventListener("click", async () => {
  try {
    await gocIsle($("#gocMetin").value.trim());
    $("#gocMetin").value = "";
  } catch (err) {
    durum("#gocDurum", err.message, "hata");
  }
});

async function gocIsle(metin) {
  const { hesaplar, parca } = gocCoz(metin);
  await birlestirVeBildir(hesaplar, "#gocDurum");
  if (parca.adet > 1) {
    durum("#gocDurum", $("#gocDurum").textContent + t("gocParca", parca.adet, parca.indeks + 1), "ok");
  }
}

// --- parola değiştirme ---
$("#degistirForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    if ($("#degistirYeni").value !== $("#degistirYeni2").value) throw new Error(t("parolalarEslesmiyor"));
    await depo.parolaDegistir($("#degistirEski").value, $("#degistirYeni").value);
    $("#degistirEski").value = $("#degistirYeni").value = $("#degistirYeni2").value = "";
    durum("#kilitAyarDurum", t("parolaDegistirildi"), "ok");
    await tazele();
  } catch (err) {
    durum("#kilitAyarDurum", err.message, "hata");
  }
});

$("#otoKilit").addEventListener("change", async (e) => {
  // "Özel" yalnızca alanı açar; süre Kaydet'e basılınca yazılır.
  if (e.target.value === "ozel") {
    $("#ozelSureAlan").hidden = false;
    $("#ozelSayi").focus();
    return;
  }
  $("#ozelSureAlan").hidden = true;
  await depo.otoKilitYaz(Number(e.target.value));
  durum("#kilitAyarDurum", t("otoGuncellendi"), "ok");
});

$("#ozelBirim").addEventListener("change", ozelSiniriGuncelle);

$("#ozelSayi").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("#ozelKaydet").click();
  }
});

$("#ozelKaydet").addEventListener("click", async () => {
  try {
    const dk = Number($("#ozelSayi").value) * Number($("#ozelBirim").value);
    await depo.otoKilitYaz(dk);
    durum("#kilitAyarDurum", t("otoOzelKaydedildi", sureMetni(dk)), "ok");
    await tazele();
  } catch (err) {
    durum("#kilitAyarDurum", err.message, "hata");
  }
});

// Popup kilitlerse (ya da süre dolarsa) açık duran bu sekme de kilitlensin.
chrome.storage.session.onChanged?.addListener(async (degisim) => {
  if (depo.OTURUM_ANAHTAR in degisim && !degisim[depo.OTURUM_ANAHTAR].newValue) await tazele();
});

$("#tema").addEventListener("change", async (e) => {
  await depo.ayarlariYaz({ tema: e.target.value });
  await temayiUygula();
});

$("#dil").addEventListener("change", async (e) => {
  await depo.ayarlariYaz({ dil: e.target.value });
  await diliBaslat();
  sayfayiCevir();
  otoKilitSecenekleri();
  await tazele();
});

/* ---------------- başlangıç ---------------- */

await diliBaslat();
sayfayiCevir();
otoKilitSecenekleri();
await temayiUygula();
await tazele();
