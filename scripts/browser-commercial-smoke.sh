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
print(sum(1 for value in re.findall(r'class="([^"]*)"', text) if name in value.split()))
PY
}

active_pages=(index.html sample-library-now.html solutions.html pricing.html about.html contact.html start-request.html portal.html)
for page in "${active_pages[@]}"; do
  curl -fsS "http://127.0.0.1:8000/$page" -o "$OUT/source-$page" || fail "$page did not return successfully"
  if [[ "$page" != "portal.html" ]]; then
    grep -q '<h1' "$OUT/source-$page" || fail "$page is missing an h1"
    grep -q 'class="skip-link"' "$OUT/source-$page" || fail "$page is missing a skip link"
    grep -Eq 'class="pi-nav"|class="site-nav"' "$OUT/source-$page" || fail "$page is missing a canonical navigation host"
    grep -Eq 'class="pi-footer"|class="site-footer"' "$OUT/source-$page" || fail "$page is missing a canonical footer host"
    grep -q 'assets/js/h38-site-v2.js' "$OUT/source-$page" || fail "$page is missing the canonical public shell"
  fi
  pass "$page source and current shell contract load"
done
curl -fsS "http://127.0.0.1:8000/cabin-project-complete.html" -o "$OUT/source-cabin.html" || fail "cabin package did not return successfully"

chrome_dump() {
  local page="$1"
  local output="$2"
  "$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --virtual-time-budget=5000 --dump-dom "http://127.0.0.1:8000/$page" > "$output" 2> "$OUT/chrome-$page.log"
}

chrome_dump index.html "$OUT/rendered-home.html"
chrome_dump solutions.html "$OUT/rendered-solutions.html"
chrome_dump pricing.html "$OUT/rendered-pricing.html"
chrome_dump sample-library-now.html "$OUT/rendered-samples.html"
chrome_dump start-request.html "$OUT/rendered-start-request.html"
chrome_dump cabin-project-complete.html "$OUT/rendered-cabin.html"

capability_count="$(grep -o 'data-capability="' "$OUT/rendered-solutions.html" | wc -l | tr -d ' ')"
project_count="$(count_class project-card "$OUT/rendered-samples.html")"
figure_count="$(count_class project-visual "$OUT/rendered-samples.html")"
pricing_card_count="$(count_class price-card "$OUT/rendered-pricing.html")"
cabin_quote_count="$(grep -o '<details class="quote-package" id="quote-[0-9][0-9]-' "$OUT/rendered-cabin.html" | wc -l | tr -d ' ')"

[[ "$capability_count" == "5" ]] || fail "rendered What We Do page expected 5 capabilities and found $capability_count"
pass "rendered What We Do page contains five capabilities"
[[ "$project_count" == "8" ]] || fail "rendered Project Examples expected 8 project cards and found $project_count"
pass "rendered Project Examples contains eight complete projects"
[[ "$figure_count" == "8" ]] || fail "rendered Project Examples expected 8 paired visual groups and found $figure_count"
pass "rendered Project Examples contains eight paired visual groups"
[[ "$pricing_card_count" == "3" ]] || fail "rendered pricing page expected 3 software cards and found $pricing_card_count"
pass "rendered pricing page contains exactly three software products"
[[ "$cabin_quote_count" == "21" ]] || fail "rendered cabin package expected 21 detailed quotes and found $cabin_quote_count"
pass "rendered cabin package contains all 21 detailed quotes"

grep -q 'Bring us the problem.' "$OUT/rendered-home.html" || fail "rendered homepage is missing the project-first promise"
grep -q 'Three software products' "$OUT/rendered-pricing.html" || fail "rendered pricing page is missing the three-product structure"
grep -q '\$299 one-time' "$OUT/rendered-pricing.html" || fail "rendered pricing page is missing the separate Business Snapshot"
grep -q 'Most Popular' "$OUT/rendered-pricing.html" || fail "rendered pricing page is missing the Business Office badge"
grep -q 'id="offer"' "$OUT/rendered-start-request.html" || fail "rendered request page is missing the approved offer selector"
grep -q 'data-request-step="3"' "$OUT/rendered-start-request.html" || fail "rendered request page is missing the review step"
grep -q 'Open All 21 Quotes' "$OUT/rendered-cabin.html" || fail "rendered cabin package is missing the open-all control"
grep -q 'Business Office system coverage' "$OUT/rendered-cabin.html" || fail "rendered cabin package is missing system table coverage"
for name in deck-existing-condition.webp deck-finished-concept.webp irrigation-before-clean.webp irrigation-after-clean.webp kitchen-existing-condition.webp kitchen-remodel-concept.webp; do
  grep -q "assets/demo-workthroughs/$name" "$OUT/rendered-samples.html" || fail "rendered Project Examples is missing $name"
done
pass "rendered Project Examples uses the six controlled deck irrigation and kitchen images"

grep -q 'aria-label="Main navigation"' "$OUT/rendered-home.html" || fail "rendered canonical navigation lacks semantics"
grep -q 'href="portal.html"' "$OUT/rendered-home.html" || fail "rendered canonical navigation is missing Owner Access"
pass "rendered canonical navigation and Owner gateway are present"

"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=5000 --window-size=1440,1200 --screenshot="$OUT/home-desktop.png" "http://127.0.0.1:8000/index.html" > /dev/null 2>&1
"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=5000 --window-size=390,844 --screenshot="$OUT/home-mobile.png" "http://127.0.0.1:8000/index.html" > /dev/null 2>&1
"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=5000 --window-size=1440,1200 --screenshot="$OUT/examples-desktop.png" "http://127.0.0.1:8000/sample-library-now.html" > /dev/null 2>&1
"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=5000 --window-size=390,844 --screenshot="$OUT/examples-mobile.png" "http://127.0.0.1:8000/sample-library-now.html" > /dev/null 2>&1
"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=5000 --window-size=1440,1200 --screenshot="$OUT/pricing-desktop.png" "http://127.0.0.1:8000/pricing.html" > /dev/null 2>&1
"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=5000 --window-size=390,844 --screenshot="$OUT/pricing-mobile.png" "http://127.0.0.1:8000/pricing.html" > /dev/null 2>&1
"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=5000 --window-size=390,844 --screenshot="$OUT/request-mobile.png" "http://127.0.0.1:8000/start-request.html" > /dev/null 2>&1
"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=5000 --window-size=1440,1200 --screenshot="$OUT/cabin-desktop.png" "http://127.0.0.1:8000/cabin-project-complete.html" > /dev/null 2>&1
"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=5000 --window-size=390,844 --screenshot="$OUT/cabin-mobile.png" "http://127.0.0.1:8000/cabin-project-complete.html" > /dev/null 2>&1

for image in "$OUT"/*.png; do
  [[ -s "$image" ]] || fail "screenshot $(basename "$image") is empty"
done
pass "desktop and mobile screenshots were generated"

cat >> "$REPORT" <<EOF

Rendered counts:
- What We Do capabilities: $capability_count
- Project examples: $project_count
- Paired visual groups: $figure_count
- Pricing software cards: $pricing_card_count
- Cabin detailed quotes: $cabin_quote_count
- Chrome binary: $CHROME
EOF

echo "Public browser smoke verification passed." | tee -a "$REPORT"
