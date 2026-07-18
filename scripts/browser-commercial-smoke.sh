#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT="browser-artifacts"
rm -rf "$OUT"
mkdir -p "$OUT"
REPORT="$OUT/browser-smoke-report.txt"

CHROME="$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser || true)"
if [[ -z "$CHROME" ]]; then
  echo "FAIL: no supported Chrome or Chromium binary found" | tee "$REPORT"
  exit 1
fi

python -m http.server 8000 --bind 127.0.0.1 > "$OUT/http-server.log" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
sleep 2

pass() { echo "PASS: $1" | tee -a "$REPORT"; }
fail() { echo "FAIL: $1" | tee -a "$REPORT"; exit 1; }
count_class() {
  python3 - "$1" "$2" <<'PY'
import re, sys
name, file = sys.argv[1], sys.argv[2]
text = open(file, encoding='utf-8').read()
count = 0
for value in re.findall(r'class="([^"]*)"', text):
    if name in value.split():
        count += 1
print(count)
PY
}

active_pages=(index.html solutions.html products.html pricing.html sample-library-now.html how-it-works.html faq.html start-request.html ai-workflow.html shop-automation.html)
for page in "${active_pages[@]}"; do
  curl -fsS "http://127.0.0.1:8000/$page" -o "$OUT/source-$page" || fail "$page did not return successfully"
  grep -q '<h1' "$OUT/source-$page" || fail "$page is missing an h1"
  grep -Eq 'aria-label="(Main|Primary) navigation"' "$OUT/source-$page" || fail "$page is missing main navigation semantics"
  grep -q 'class="skip-link"' "$OUT/source-$page" || fail "$page is missing a skip link"
  pass "$page source and basic accessibility structure load"
done

chrome_dump() {
  local page="$1"
  local output="$2"
  "$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --virtual-time-budget=4000 --dump-dom "http://127.0.0.1:8000/$page" > "$output" 2> "$OUT/chrome-$page.log"
}

chrome_dump products.html "$OUT/rendered-products.html"
chrome_dump sample-library-now.html "$OUT/rendered-samples.html"
chrome_dump start-request.html "$OUT/rendered-start-request.html"
chrome_dump shop-automation.html "$OUT/rendered-manufacturing.html"

product_count="$(count_class detail-product "$OUT/rendered-products.html")"
bundle_count="$(count_class bundle-card "$OUT/rendered-products.html")"
sample_count="$(count_class sample-card "$OUT/rendered-samples.html")"
sample_bundle_count="$(count_class bundle-card "$OUT/rendered-samples.html")"
manufacturing_count="$(count_class product-card "$OUT/rendered-manufacturing.html")"

[[ "$product_count" == "15" ]] || fail "rendered Products page expected 15 product details and found $product_count"
pass "rendered Products page contains 15 product details"
[[ "$bundle_count" == "9" ]] || fail "rendered Products page expected 9 bundles and found $bundle_count"
pass "rendered Products page contains 9 bundles"
[[ "$sample_count" == "15" ]] || fail "rendered Samples hub expected 15 samples and found $sample_count"
pass "rendered Samples hub contains 15 product samples"
[[ "$sample_bundle_count" == "9" ]] || fail "rendered Samples hub expected 9 bundle cards and found $sample_bundle_count"
pass "rendered Samples hub contains 9 bundle cards"
[[ "$manufacturing_count" == "6" ]] || fail "rendered manufacturing page expected 6 product cards and found $manufacturing_count"
pass "rendered manufacturing page contains 6 specialized products"

grep -q 'Owner Portal' "$OUT/rendered-samples.html" || fail "rendered Samples hub is missing the approved Owner Portal link"
pass "rendered Samples hub preserves Owner Portal link"
grep -q 'What would you like to have when this is finished?' "$OUT/rendered-start-request.html" || fail "rendered request page is missing outcome-first question"
pass "rendered request page contains outcome-first question"
grep -q 'H38-B009' "$OUT/rendered-start-request.html" || fail "rendered request page did not load controlled bundle options"
pass "rendered request page loads bundle preselection data"
grep -q 'Every deliverable is personally reviewed before it is sent.' "$OUT/rendered-products.html" || fail "public quality statement is missing from rendered footer"
pass "rendered pages include the public quality statement"

"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --virtual-time-budget=4000 --window-size=1440,1200 \
  --screenshot="$OUT/home-desktop.png" "http://127.0.0.1:8000/index.html" > /dev/null 2>&1
"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --virtual-time-budget=4000 --window-size=390,844 \
  --screenshot="$OUT/home-mobile.png" "http://127.0.0.1:8000/index.html" > /dev/null 2>&1
"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --virtual-time-budget=4000 --window-size=1440,1200 \
  --screenshot="$OUT/products-desktop.png" "http://127.0.0.1:8000/products.html" > /dev/null 2>&1
"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --virtual-time-budget=4000 --window-size=1440,1200 \
  --screenshot="$OUT/samples-desktop.png" "http://127.0.0.1:8000/sample-library-now.html" > /dev/null 2>&1
"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
  --virtual-time-budget=4000 --window-size=390,844 \
  --screenshot="$OUT/request-mobile.png" "http://127.0.0.1:8000/start-request.html" > /dev/null 2>&1

for image in "$OUT"/*.png; do
  [[ -s "$image" ]] || fail "screenshot $(basename "$image") is empty"
done
pass "desktop and mobile screenshots were generated"

cat >> "$REPORT" <<EOF

Rendered counts:
- Product details: $product_count
- Product-page bundles: $bundle_count
- Samples: $sample_count
- Sample-page bundles: $sample_bundle_count
- Manufacturing products: $manufacturing_count
- Chrome binary: $CHROME
EOF

echo "Browser commercial smoke verification passed." | tee -a "$REPORT"
