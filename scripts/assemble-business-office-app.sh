#!/usr/bin/env bash
set -euo pipefail

DESTINATION="${1:?destination directory is required}"
PACK_SOURCE="${2:?business pack Apps Script file is required}"
REPO_ROOT="${3:-${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}}"
PACK_DIR="$(cd "$(dirname "$PACK_SOURCE")" && pwd)"
PACK_BASENAME="$(basename "$PACK_SOURCE")"

[[ -f "$PACK_SOURCE" ]] || { echo "HOLD — business pack not found: $PACK_SOURCE"; exit 2; }
mkdir -p "$DESTINATION"
find "$DESTINATION" -maxdepth 1 -type f \( -name 'BusinessOffice_*' -o -name 'BusinessOffice_Index.html' \) -delete
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$DESTINATION/"
rm -f "$DESTINATION/BusinessOffice_00_Pack.gs" "$DESTINATION/BusinessOffice_Pack.gs"
cp "$PACK_SOURCE" "$DESTINATION/BusinessOffice_00_Pack.gs"

# A pack may contain business-specific integrations and acceptance tests. They
# are added beside the neutral core and may not replace a reusable core module.
shopt -s nullglob
for pack_file in "$PACK_DIR"/*.gs; do
  [[ "$(basename "$pack_file")" = "$PACK_BASENAME" ]] && continue
  target="$DESTINATION/$(basename "$pack_file")"
  [[ ! -e "$target" ]] || { echo "HOLD — business pack file collides with core source: $(basename "$pack_file")"; exit 4; }
  cp "$pack_file" "$target"
done
shopt -u nullglob

cp "$REPO_ROOT/apps-script/business-office/BusinessOffice_Index.html" "$DESTINATION/"
cp "$REPO_ROOT/apps-script/business-office/appsscript.json" "$DESTINATION/"

[[ -f "$DESTINATION/BusinessOffice_00_Pack.gs" ]] || { echo "HOLD — generated business pack is missing"; exit 3; }
PACK_DECLARATIONS="$(grep -R -l 'var BO_EMBEDDED_BUSINESS_PACK\|const BO_EMBEDDED_BUSINESS_PACK' "$DESTINATION"/BusinessOffice_*.gs | wc -l | tr -d ' ')"
[[ "$PACK_DECLARATIONS" = "1" ]] || { echo "HOLD — assembled source must declare exactly one embedded business pack, found $PACK_DECLARATIONS"; exit 3; }
grep -F 'BO_EMBEDDED_BUSINESS_PACK' "$DESTINATION/BusinessOffice_00_Pack.gs" >/dev/null

if grep -F "packId:'template-business'" "$DESTINATION/BusinessOffice_00_Pack.gs" >/dev/null; then
  test ! -e "$DESTINATION/BusinessOffice_Highway38Acceptance.gs"
  test ! -e "$DESTINATION/BusinessOffice_Highway38AcceptanceHarness.gs"
  ! grep -R -E 'Highway 38 Solutions|rkrueth|AKfyc|1kDDKW|1Vq8Uj|11ak4Q|1Jn2vW5|1rjl_m8u' \
    "$DESTINATION"/BusinessOffice_*.gs "$DESTINATION/BusinessOffice_Index.html"
fi

printf 'Assembled Business Office with pack %s in %s\n' "$PACK_SOURCE" "$DESTINATION"
