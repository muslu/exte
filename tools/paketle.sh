#!/usr/bin/env bash
# exte'yi dağıtıma paketler. İki zip üretir:
#   exte-<surum>.zip         → Chrome Web Store yüklemesi (manifest.json zip KÖKÜNDE olmalı)
#   exte-<surum>-paylas.zip  → başkasına göndermek için (içinde exte/ klasörü çıkar)
#
# Testler, araçlar, geliştirici notları ve git verisi paketlere GİRMEZ.
set -euo pipefail

KOK="$(cd "$(dirname "$0")/.." && pwd)"
cd "$KOK"

SURUM="$(python3.12 -c "import json;print(json.load(open('manifest.json'))['version'])")"
MAGAZA="$KOK/exte-$SURUM.zip"
PAYLAS="$KOK/exte-$SURUM-paylas.zip"

# Eklentinin çalışması için gereken her şey — ve fazlası değil.
DOSYALAR=(manifest.json popup.html popup.js ayarlar.html ayarlar.js app.css README.md LICENSE _locales src vendor icons)

for yol in "${DOSYALAR[@]}"; do
  [[ -e "$yol" ]] || { echo "eksik dosya: $yol" >&2; exit 1; }
done

rm -f "$MAGAZA" "$PAYLAS"

# 1) Mağaza paketi — dosyalar zip kökünde
zip -r -q -X "$MAGAZA" "${DOSYALAR[@]}" -x '*/.*' '*__pycache__*'

# 2) Paylaşım paketi — geçici exte/ klasörü altında
GECICI="$(mktemp -d)"
trap 'rm -rf "$GECICI"' EXIT
mkdir -p "$GECICI/exte"
cp -r "${DOSYALAR[@]}" "$GECICI/exte/"
(cd "$GECICI" && zip -r -q -X "$PAYLAS" exte -x '*/.*' '*__pycache__*')

boyut() { numfmt --to=iec --suffix=B "$(stat -c %s "$1")"; }
echo "Mağaza paketi  : $MAGAZA ($(boyut "$MAGAZA"))"
echo "Paylaşım paketi: $PAYLAS ($(boyut "$PAYLAS"))"
echo
echo "Paket içeriği:"
unzip -l "$MAGAZA" | tail -n +4 | head -n -2 | awk '{print "  " $4}'
