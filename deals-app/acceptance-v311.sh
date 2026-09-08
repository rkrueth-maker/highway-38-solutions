#!/usr/bin/env bash
set -euo pipefail

: "${SB_URL:?SB_URL required}"
: "${SB_KEY:?SB_KEY required}"
: "${SCOUT_EMAIL:?SCOUT_EMAIL required}"
: "${SCOUT_PASSWORD:?SCOUT_PASSWORD required}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT="$ROOT/artifacts/v311"
mkdir -p "$REPORT/web-js"

MAIN="$ROOT/native/h38-site-scanner/android-app/reseller/src/main/java/com/highway38/resellerscout/MainActivity.java"
TRANSPORT="$ROOT/native/h38-site-scanner/android-app/reseller/src/main/java/com/highway38/resellerscout/HostedHtmlWebViewClient.java"
GRADLE="$ROOT/native/h38-site-scanner/android-app/reseller/build.gradle"
MANIFEST="$ROOT/native/h38-site-scanner/android-app/reseller/src/main/AndroidManifest.xml"

# 1. Native architecture: thin shell + explicit hosted HTML transport.
grep -Fq "versionCode 341" "$GRADLE"
grep -Fq "versionName '3.1.1'" "$GRADLE"
grep -Fq 'android:label="H38 Deals"' "$MANIFEST"
grep -Fq 'H38_DEALS_THIN_SHELL_V311' "$MAIN"
grep -Fq 'HostedHtmlWebViewClient' "$MAIN"
grep -Fq 'H38DealsAndroid/3.1.1' "$MAIN"
grep -Fq 'H38_HOSTED_HTML_TRANSPORT_V311' "$TRANSPORT"
grep -Fq 'H38_RAW_SOURCE_GUARD_V311' "$TRANSPORT"
for page in h38-deals-shell h38-penny-web h38-resale-web h38-coupon-web; do grep -Fq "/functions/v1/$page" "$TRANSPORT"; done
grep -Fq 'request.isForMainFrame()' "$TRANSPORT"
grep -Fq '"text/html"' "$TRANSPORT"
grep -Fq 'startsWith("<!doctype html")' "$TRANSPORT"
grep -Fq 'document.contentType===\x27text/html\x27' <(sed "s/'/\\x27/g" "$TRANSPORT") || grep -Fq "document.contentType==='text/html'" "$TRANSPORT"
grep -Fq 'AndroidH38Deals' "$MAIN"
grep -Fq 'speakList' "$MAIN"
! grep -Fq 'bundledPage' "$MAIN"
! grep -Fq 'FacebookMarketplaceActivity' "$MANIFEST"
grep -Fq 'Product 1 — Penny Deals' "$ROOT/deals-app/ARCHITECTURE.md"
grep -Fq 'Product 2 — Resale' "$ROOT/deals-app/ARCHITECTURE.md"
grep -Fq 'Product 3 — Couponing' "$ROOT/deals-app/ARCHITECTURE.md"
echo HOSTED_HTML_TRANSPORT_AND_ISOLATION_PASS | tee "$REPORT/source-status.txt"

# 2. Hosted documents must be real HTML at the backend and valid JavaScript.
for app in deals-shell penny-web resale-web coupon-web; do
  curl --retry 3 --max-time 30 -fsSL -D "$REPORT/$app.headers" "$SB_URL/functions/v1/h38-$app" -o "$REPORT/$app.html"
  grep -Eiq '^content-type:[[:space:]]*text/html' "$REPORT/$app.headers"
  python3 - "$REPORT/$app.html" <<'PY'
import pathlib,sys
p=pathlib.Path(sys.argv[1]); t=p.read_text(encoding='utf-8').lstrip().lower()
assert t.startswith('<!doctype html') or t.startswith('<html'), t[:80]
PY
done
grep -Fq 'Choose your shopping tool.' "$REPORT/deals-shell.html"
grep -Fq 'Penny Deals' "$REPORT/penny-web.html"
grep -Fq '>Resale<' "$REPORT/resale-web.html"
grep -Fq 'Savings Copilot' "$REPORT/coupon-web.html"
for word in SHOP SAVE SCAN DEALS RECEIPTS; do grep -Fq "$word" "$REPORT/coupon-web.html"; done
grep -Fq 'h38-penny-api' "$REPORT/penny-web.html"
! grep -Fq 'h38-resale-api' "$REPORT/penny-web.html"
! grep -Fq 'h38-coupon-api' "$REPORT/penny-web.html"
grep -Fq 'h38-resale-api' "$REPORT/resale-web.html"
! grep -Fq 'h38-penny-api' "$REPORT/resale-web.html"
! grep -Fq 'h38-coupon-api' "$REPORT/resale-web.html"
grep -Fq 'h38-coupon-api' "$REPORT/coupon-web.html"
! grep -Fq 'h38-penny-api' "$REPORT/coupon-web.html"
! grep -Fq 'h38-resale-api' "$REPORT/coupon-web.html"
python3 - "$REPORT" <<'PY'
import pathlib,re,sys
root=pathlib.Path(sys.argv[1]); out=root/'web-js'
for name in ['deals-shell','penny-web','resale-web','coupon-web']:
    text=(root/f'{name}.html').read_text(encoding='utf-8')
    scripts=re.findall(r'<script(?:\s[^>]*)?>([\s\S]*?)</script>',text,re.I)
    for i,script in enumerate(scripts):
        if script.strip(): (out/f'{name}-{i}.js').write_text(script,encoding='utf-8')
PY
for f in "$REPORT"/web-js/*.js; do node --check "$f"; done
echo HOSTED_HTML_BACKEND_AND_JS_PASS | tee "$REPORT/web-status.txt"

# 3. Auth and entitlements.
auth="$(curl --max-time 30 -fsS -X POST "$SB_URL/auth/v1/token?grant_type=password" -H "apikey: $SB_KEY" -H 'Content-Type: application/json' --data "$(jq -nc --arg e "$SCOUT_EMAIL" --arg p "$SCOUT_PASSWORD" '{email:$e,password:$p}')")"
token="$(printf '%s' "$auth" | jq -r '.access_token // empty')"
test -n "$token"
printf '%s' "$token" > "$REPORT/access-token.tmp"
curl --max-time 30 -fsS "$SB_URL/rest/v1/h38_product_entitlements?select=product_key,active&active=eq.true" -H "apikey: $SB_KEY" -H "Authorization: Bearer $token" | tee "$REPORT/entitlements.json"
jq -e '([.[].product_key]|unique|sort)==["coupon","penny","resale"]' "$REPORT/entitlements.json"
noauth_code="$(curl -sS -o "$REPORT/noauth.txt" -w '%{http_code}' -X POST "$SB_URL/functions/v1/h38-coupon-api" -H "apikey: $SB_KEY" -H 'Content-Type: application/json' --data '{"action":"assistant","text":"test"}')"
test "$noauth_code" = 401
echo ENTITLEMENT_AUTH_PASS | tee "$REPORT/auth-status.txt"

# 4. Couponing data CRUD + assistant + stack math + optimizer.
list_id=''; item_id=''; price_id=''; receipt_id=''; watch_id=''
cleanup_coupon_ci(){
  set +e
  for pair in "coupon_watch_rules:$watch_id" "coupon_receipts:$receipt_id" "coupon_price_observations:$price_id" "coupon_list_items:$item_id" "coupon_shopping_lists:$list_id"; do
    table="${pair%%:*}"; id="${pair#*:}"
    if [ -n "$id" ]; then curl -sS -X DELETE "$SB_URL/rest/v1/$table?id=eq.$id" -H "apikey: $SB_KEY" -H "Authorization: Bearer $token" >/dev/null; fi
  done
}
trap cleanup_coupon_ci EXIT
headers=(-H "apikey: $SB_KEY" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' -H 'Prefer: return=representation')
marker="h38-ci-${GITHUB_RUN_ID:-local}-$(date +%s)"
list_id="$(curl -fsS -X POST "$SB_URL/rest/v1/coupon_shopping_lists" "${headers[@]}" --data "$(jq -nc --arg n "$marker" '{name:$n,max_stores:2,optimize_mode:"practical"}')" | jq -r '.[0].id')"; test -n "$list_id"
item_id="$(curl -fsS -X POST "$SB_URL/rest/v1/coupon_list_items" "${headers[@]}" --data "$(jq -nc --arg l "$list_id" '{list_id:$l,item_name:"Tide detergent",quantity:1}')" | jq -r '.[0].id')"; test -n "$item_id"
price_id="$(curl -fsS -X POST "$SB_URL/rest/v1/coupon_price_observations" "${headers[@]}" --data '{"item_name":"Tide detergent","barcode":"012345678905","store":"Walmart","shelf_price":15.99,"sale_discount":3,"manufacturer_coupon":3,"rebate":2,"loyalty_value":1,"package_qty":92,"unit_label":"oz","distance_miles":2,"confidence":"high","source_note":"CI verified sample"}' | jq -r '.[0].id')"; test -n "$price_id"
receipt_id="$(curl -fsS -X POST "$SB_URL/rest/v1/coupon_receipts" "${headers[@]}" --data '{"store":"Walmart","total":42.17,"items":[{"name":"Tide detergent","price":6.99}],"notes":"CI sample"}' | jq -r '.[0].id')"; test -n "$receipt_id"
watch_id="$(curl -fsS -X POST "$SB_URL/rest/v1/coupon_watch_rules" "${headers[@]}" --data '{"item_name":"Tide detergent","target_effective_price":7.00}' | jq -r '.[0].id')"; test -n "$watch_id"
call_coupon(){ local name="$1" body="$2"; curl --max-time 45 -fsS -X POST "$SB_URL/functions/v1/h38-coupon-api" -H "apikey: $SB_KEY" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data "$body" | tee "$REPORT/coupon-$name.json"; }
call_coupon assistant '{"action":"assistant","text":"keep this under $80 and no more than two stores"}'
jq -e '.ok==true and .intent.max_stores==2 and .intent.budget==80' "$REPORT/coupon-assistant.json"
call_coupon stack '{"action":"stack","price":{"shelf_price":15.99,"sale_discount":3,"manufacturer_coupon":3,"rebate":2,"loyalty_value":1}}'
jq -e '.ok==true and (.stack.effective>6.98 and .stack.effective<7.00)' "$REPORT/coupon-stack.json"
call_coupon optimize '{"action":"optimize","max_stores":2,"travel_cost_per_mile":0.25,"items":[{"item_name":"milk","quantity":1},{"item_name":"eggs","quantity":1}],"prices":[{"item_name":"milk","store":"Walmart","shelf_price":3.29,"distance_miles":2},{"item_name":"eggs","store":"Walmart","shelf_price":2.69,"distance_miles":2},{"item_name":"milk","store":"Target","shelf_price":2.99,"distance_miles":7},{"item_name":"eggs","store":"Target","shelf_price":2.99,"distance_miles":7}]}'
jq -e '.ok==true and .best!=null and (.best.stores|length)>=1' "$REPORT/coupon-optimize.json"
echo COUPONING_DATA_AND_OPTIMIZER_PASS | tee "$REPORT/coupon-status.txt"

# 5. Every Penny and Resale lane must answer successfully.
call_lane(){
  local product="$1" action="$2" timeout="$3" out="$REPORT/$product-$action.json"
  curl --max-time "$timeout" -fsS -X POST "$SB_URL/functions/v1/h38-$product-api" -H "apikey: $SB_KEY" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' --data "{\"action\":\"$action\",\"payload\":{\"postal\":\"55744\",\"zip\":\"55744\",\"radius\":50,\"radius_miles\":50,\"terms\":[\"tools\",\"electronics\"]}}" | tee "$out"
  jq -e '.ok==true' "$out"
}
call_lane penny stores 90
call_lane penny hunt 150
call_lane penny remodel 120
call_lane resale deals 120
call_lane resale facebook 120
call_lane resale auctions 120
call_lane resale stores 120
call_lane resale garage 120
echo PENNY_AND_RESALE_ALL_LANES_PASS | tee "$REPORT/source-lanes-status.txt"

cleanup_coupon_ci
trap - EXIT
rm -f "$REPORT/access-token.tmp"
echo H38_DEALS_V311_LIVE_ACCEPTANCE_PASS | tee "$REPORT/live-acceptance.txt"
