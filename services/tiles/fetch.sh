#!/bin/sh
# Cuts Mauritius out of the global Protomaps basemap and downloads the label fonts.
# Source: PMTILES_SOURCE if given, else the newest build listed in Protomaps' builds.json,
# else the last 30 days of dated builds. Each candidate is tested with a real range read.
set -u
mkdir -p /out/fonts
SRC="${PMTILES_SOURCE:-}"
ok() { pmtiles show "$1" >/dev/null 2>&1; }

if [ -z "$SRC" ]; then
  echo "Looking up the newest Protomaps build..."
  keys=$(wget -qO- https://build-metadata.protomaps.dev/builds.json 2>/dev/null \
    | grep -o '"key" *: *"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/' | sort -r)
  for k in $keys; do
    case "$k" in *.pmtiles) url="https://build.protomaps.com/$k" ;; *) url="https://build.protomaps.com/$k.pmtiles" ;; esac
    if ok "$url"; then SRC="$url"; break; fi
  done
fi
if [ -z "$SRC" ]; then
  echo "builds.json unavailable; trying dated builds from the last 30 days..."
  now=$(date +%s); i=0
  while [ $i -lt 30 ]; do
    url="https://build.protomaps.com/$(date -u -d "@$((now - i * 86400))" +%Y%m%d).pmtiles"
    if ok "$url"; then SRC="$url"; break; fi
    i=$((i + 1))
  done
fi
if [ -z "$SRC" ]; then
  echo "ERROR: no Protomaps build reachable from this machine." >&2
  echo "Pick one at https://maps.protomaps.com/builds/ and rebuild with:" >&2
  echo "  docker compose build --build-arg PMTILES_SOURCE=https://build.protomaps.com/YYYYMMDD.pmtiles tiles" >&2
  exit 1
fi

echo "Extracting Mauritius from $SRC (bbox $BBOX, maxzoom $MAXZOOM)"
pmtiles extract "$SRC" /out/mauritius.pmtiles --bbox="$BBOX" --maxzoom="$MAXZOOM" || { echo "ERROR: extract failed" >&2; exit 1; }
pmtiles show /out/mauritius.pmtiles | head -12
ls -l /out/mauritius.pmtiles

# Glyphs for map labels (Latin + extended Latin, enough for English/French/Creole place names)
ASSETS=https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts
for font in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do
  dir="/out/fonts/$font"; mkdir -p "$dir"; enc=$(echo "$font" | sed 's/ /%20/g')
  for r in 0-255 256-511 512-767 768-1023 7936-8191 8192-8447; do
    wget -q -O "$dir/$r.pbf" "$ASSETS/$enc/$r.pbf" || rm -f "$dir/$r.pbf"
  done
done
n=$(find /out/fonts -name '*.pbf' | wc -l)
echo "fonts: $n files"
[ "$n" -gt 0 ] || { echo "ERROR: no fonts downloaded (labels would be missing)" >&2; exit 1; }
`