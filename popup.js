// exte popup — hesap listesi, kod üretimi, hesap ekleme.
"use strict";

import { kodUret, kalanSaniye, uriCoz, base32Coz } from "./src/otp.js";
import * as depo from "./src/depo.js";
import { ekrandanTara, resimdenCoz, panodanCoz } from "./src/qr.js";
import { gocCoz } from "./src/goc.js";
import { $, $$, toast, duyur, temayiUygula, panoyaKopyala, t, diliBaslat, sayfayiCevir } from "./src/ui.js";
import { etkinDil } from "./src/metinler.js";

let hesaplar = [];
const kartlar = new Map(); // id → {kod, cubuk, pencere}

/* ---------------- görünüm yönetimi ---------------- */

function gorunum(ad) {
  $("#gorunumKurulum").hidden = ad !== "kurulum";
  $("#gorunumKilit").hidden = ad !== "kilit";
  $("#gorunumListe").hidden = ad !== "liste";
  $("#gorunumEkle").hidden = ad !== "ekle";
  $("#ara").disabled = ad !== "liste";
  // Kilit/kurulum ekranında üst çubuğun tamamı kapalı: hesaplara erişim yok.
  $("#ustCubuk").hidden = ad !== "liste" && ad !== "ekle";
}

/* ---------------- liste ---------------- */

function kartYap(h) {
  const kart = document.createElement("article");
  kart.className = "hesap";
  kart.dataset.id = h.id;

  const baslik = document.createElement("div");
  baslik.className = "baslik";
  baslik.textContent = h.issuer ? `${h.issuer} · ${h.ad}` : h.ad;
  baslik.title = baslik.textContent;

  const kod = document.createElement("button");
  kod.type = "button";
  kod.className = "kod";
  kod.textContent = "······";
  kod.setAttribute("aria-label", t("kopyalaAria", baslik.textContent));
  kod.addEventListener("click", () => kodKopyala(h.id, kod));

  const araclar = document.createElement("div");
  araclar.className = "araclar";

  if (h.tip === "hotp") {
    const yenile = document.createElement("button");
    yenile.type = "button";
    yenile.className = "duz";
    yenile.textContent = "⟳";
    yenile.title = t("sonrakiKod");
    yenile.setAttribute("aria-label", t("sonrakiKodAria", baslik.textContent));
    yenile.addEventListener("click", async () => {
      await depo.hesapGuncelle(h.id, { sayac: (h.sayac || 0) + 1 });
      await yukle();
    });
    araclar.append(yenile);
  }

  const sil = document.createElement("button");
  sil.type = "button";
  sil.className = "duz";
  sil.textContent = "🗑";
  sil.title = t("silAria", baslik.textContent);
  sil.setAttribute("aria-label", t("silAria", baslik.textContent));
  sil.addEventListener("click", async () => {
    if (!confirm(t("silOnay", baslik.textContent))) return;
    await depo.hesapSil(h.id);
    toast(t("hesapSilindi"));
    await yukle();
  });
  araclar.append(sil);

  kart.append(baslik, kod, araclar);

  if (h.tip !== "hotp") {
    const cubuk = document.createElement("div");
    cubuk.className = "cubuk";
    const dolgu = document.createElement("i");
    cubuk.append(dolgu);
    kart.append(cubuk);
    kartlar.set(h.id, { kod, cubuk: dolgu, kart, pencere: null });
  } else {
    kartlar.set(h.id, { kod, cubuk: null, kart, pencere: null });
  }
  return kart;
}

function listeCiz() {
  const q = $("#ara").value.trim().toLowerCase();
  const gorunen = hesaplar.filter((h) => !q || `${h.issuer} ${h.ad}`.toLowerCase().includes(q));
  kartlar.clear();
  $("#liste").replaceChildren(...gorunen.map(kartYap));
  $("#bos").hidden = hesaplar.length > 0;
  kodlariGuncelle(true);
}

async function kodlariGuncelle(zorla = false) {
  const simdi = Date.now();
  for (const h of hesaplar) {
    const k = kartlar.get(h.id);
    if (!k) continue;

    if (h.tip === "hotp") {
      if (zorla) k.kod.textContent = grupla(await kodUret(h, simdi));
      continue;
    }
    const periyot = h.periyot || 30;
    const pencere = Math.floor(simdi / 1000 / periyot);
    if (zorla || pencere !== k.pencere) {
      k.pencere = pencere;
      try {
        k.kod.textContent = grupla(await kodUret(h, simdi));
      } catch {
        k.kod.textContent = t("hataliAnahtar");
        k.kod.classList.add("hata-metin");
      }
    }
    const kalan = kalanSaniye(periyot, simdi);
    k.cubuk.style.width = `${(kalan / periyot) * 100}%`;
    k.kart.classList.toggle("bitiyor", kalan <= 5);
  }
}

const grupla = (kod) => (kod.length % 2 === 0 ? `${kod.slice(0, kod.length / 2)} ${kod.slice(kod.length / 2)}` : kod);

async function kodKopyala(id, dugme) {
  try {
    await panoyaKopyala(dugme.textContent.replace(/\s/g, ""));
    toast(t("kodKopyalandi"));
  } catch {
    toast(t("kopyalanamadi"), "hata");
  }
}

/* ---------------- yükleme / kilit ---------------- */

async function yukle() {
  if (await depo.kurulumGerekliMi()) {
    gorunum("kurulum");
    $("#kurParola").focus();
    return;
  }
  if (await depo.kilitliMi()) {
    hesaplar = [];
    kartlar.clear();
    $("#liste").replaceChildren();
    gorunum("kilit");
    $("#kilitParola").focus();
    return;
  }
  hesaplar = (await depo.hesaplariOku()).sort((a, b) =>
    `${a.issuer} ${a.ad}`.localeCompare(`${b.issuer} ${b.ad}`, etkinDil()),
  );
  gorunum("liste");
  listeCiz();
}

/* ---------------- hesap ekleme ---------------- */

async function hesaplariEkle(gelen) {
  const { eklenen, atlanan } = await depo.hesaplariBirlestir(gelen);
  toast(atlanan ? t("hesapEklendiAtlandi", eklenen, atlanan) : t("hesapEklendi", eklenen));
  gorunum("liste");
  await yukle();
}

/** QR'dan çıkan metni işler: otpauth:// veya otpauth-migration:// */
async function qrMetniIsle(metin) {
  if (!metin) throw new Error(t("qrBulunamadi"));
  if (/^otpauth-migration:\/\//i.test(metin)) {
    const { hesaplar: gelen, parca } = gocCoz(metin);
    await hesaplariEkle(gelen);
    if (parca.adet > 1) {
      toast(t("parcaUyari", parca.indeks + 1, parca.adet));
    }
    return;
  }
  await hesaplariEkle([uriCoz(metin)]);
}

function hataGoster(secici, e) {
  $(secici).textContent = e?.message || String(e);
  duyur($(secici).textContent);
}

/* ---------------- olaylar ---------------- */

function olaylariBagla() {
  $("#ara").addEventListener("input", listeCiz);
  $("#ayarlarAc").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("#ekleAc").addEventListener("click", () => {
    $("#ekleHata").textContent = "";
    gorunum("ekle");
  });
  $("#bosEkle").addEventListener("click", () => gorunum("ekle"));
  $("#ekleKapat").addEventListener("click", () => gorunum("liste"));

  // sekmeler
  const sekmeler = [["#sekQr", "#panelQr"], ["#sekUri", "#panelUri"], ["#sekEl", "#panelEl"]];
  for (const [sek, panel] of sekmeler) {
    $(sek).addEventListener("click", () => {
      for (const [s, p] of sekmeler) {
        $(s).setAttribute("aria-selected", String(s === sek));
        $(p).hidden = p !== panel;
      }
    });
  }

  // ilk kurulum — parola belirleme
  $("#kurForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#kurHata").textContent = "";
    try {
      if ($("#kurParola").value !== $("#kurParola2").value) throw new Error(t("parolalarEslesmiyor"));
      await depo.kilitKur($("#kurParola").value);
      $("#kurParola").value = $("#kurParola2").value = "";
      toast(t("kilitKuruldu"));
      await yukle();
    } catch (err) {
      hataGoster("#kurHata", err);
    }
  });

  // elle kilitleme
  $("#kilitleAc").addEventListener("click", async () => {
    await depo.kilitle();
    duyur(t("kilitlendi"));
    await yukle();
  });

  // kilit
  $("#kilitForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#kilitHata").textContent = "";
    try {
      await depo.kilidiAc($("#kilitParola").value);
      $("#kilitParola").value = "";
      await yukle();
    } catch (err) {
      hataGoster("#kilitHata", err);
    }
  });

  // QR
  $("#qrEkran").addEventListener("click", async () => {
    $("#qrDurum").textContent = t("ekranTaraniyor");
    $("#ekleHata").textContent = "";
    try {
      await qrMetniIsle(await ekrandanTara());
    } catch (e) {
      hataGoster("#ekleHata", e);
    } finally {
      $("#qrDurum").textContent = "";
    }
  });
  $("#qrDosyaAc").addEventListener("click", () => $("#qrDosya").click());
  $("#qrDosya").addEventListener("change", async (e) => {
    const dosya = e.target.files?.[0];
    e.target.value = "";
    if (!dosya) return;
    $("#ekleHata").textContent = "";
    try {
      await qrMetniIsle(await resimdenCoz(dosya));
    } catch (err) {
      hataGoster("#ekleHata", err);
    }
  });
  document.addEventListener("paste", async (e) => {
    if ($("#gorunumEkle").hidden) return;
    try {
      const metin = (await panodanCoz(e)) || e.clipboardData.getData("text");
      await qrMetniIsle(metin);
    } catch (err) {
      hataGoster("#ekleHata", err);
    }
  });

  // bağlantıdan ekle
  $("#uriForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#ekleHata").textContent = "";
    try {
      await qrMetniIsle($("#uriMetin").value.trim());
      $("#uriMetin").value = "";
    } catch (err) {
      hataGoster("#ekleHata", err);
    }
  });

  // elle ekle
  $("#elForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#ekleHata").textContent = "";
    try {
      base32Coz($("#elGizli").value); // geçersiz anahtarı listeye almadan yakala
      await hesaplariEkle([
        {
          ad: $("#elAd").value.trim(),
          issuer: $("#elIssuer").value.trim(),
          gizli: $("#elGizli").value.trim().toUpperCase().replace(/\s/g, ""),
          tip: $("#elTip").value,
          algo: $("#elAlgo").value,
          hane: Number($("#elHane").value),
          periyot: Number($("#elPeriyot").value) || 30,
        },
      ]);
      $$("#elForm input").forEach((i) => (i.value = i.id === "elPeriyot" ? "30" : ""));
    } catch (err) {
      hataGoster("#ekleHata", err);
    }
  });
}

/* ---------------- başlangıç ---------------- */

await diliBaslat();
sayfayiCevir();
await temayiUygula();
olaylariBagla();
await depo.acilistaKilitle(); // "her açılışta sor" seçiliyse önceki oturumu düşür
await yukle();
setInterval(() => {
  if (!$("#gorunumListe").hidden) kodlariGuncelle();
}, 1000);
