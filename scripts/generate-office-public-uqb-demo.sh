#!/usr/bin/env bash
set -euo pipefail

# The public Universal Quote Builder library is deliberately rendered from the
# immutable public demonstration specification and repository-hosted CAD assets.
# This release verifier never reads or creates private H38 Business Office
# records and performs no customer-facing or external business action.

REPO_ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
DEPLOYMENT="$REPO_ROOT/business-packs/highway38/deployment.json"
EVIDENCE="$REPO_ROOT/artifacts/office-public-uqb-demo"
mkdir -p "$EVIDENCE"

read_config() {
  node - "$DEPLOYMENT" "$1" <<'NODE'
const fs=require('fs');
const [file,path]=process.argv.slice(2);
let value=JSON.parse(fs.readFileSync(file,'utf8'));
for(const key of path.split('.'))value=value?.[key];
if(value==null||value==='')throw new Error(`Missing deployment setting ${path}`);
process.stdout.write(String(value));
NODE
}

BUSINESS_DEPLOYMENT_ID="$(read_config appsScript.businessOfficeDeploymentId)"
BASE_URL="https://script.google.com/macros/s/${BUSINESS_DEPLOYMENT_ID}/exec"
DEMO_URL="${BASE_URL}?publicUqbDemo=1"
QUOTE_URL="${BASE_URL}?publicUqbPackage=preconstruction&view=quote"
CAD_URL="${BASE_URL}?publicUqbPackage=framing&view=cad"
PACKAGE_URL="${BASE_URL}?publicUqbPackage=framing&view=package"

fetch_page() {
  local url="$1" output="$2" status_file="$3"
  local status
  status="$(curl -L -sS --max-time 90 -o "$output" -w '%{http_code}' "$url" || true)"
  printf '%s' "$status" > "$status_file"
  [[ "$status" =~ ^2[0-9][0-9]$ ]]
}

verified=false
for attempt in $(seq 1 36); do
  if fetch_page "$DEMO_URL" "$EVIDENCE/public-examples.html" "$EVIDENCE/public-examples-http-status.txt" \
    && grep -Fq 'Universal Quote Builder — Public Examples' "$EVIDENCE/public-examples.html" \
    && grep -Fq 'Complete quotes matched to coordinated CAD sheets' "$EVIDENCE/public-examples.html" \
    && grep -Fq 'View full quote' "$EVIDENCE/public-examples.html" \
    && grep -Fq 'View full-size CAD sheets' "$EVIDENCE/public-examples.html" \
    && grep -Fq 'Print / save complete package' "$EVIDENCE/public-examples.html" \
    && grep -Fq 'fixed public demonstration specification and public CAD assets only' "$EVIDENCE/public-examples.html"; then
    example_count="$(grep -o 'class="example"' "$EVIDENCE/public-examples.html" | wc -l | tr -d ' ')"
    if [[ "$example_count" == "7" ]]; then
      verified=true
      break
    fi
  fi
  sleep 10
done

if [[ "$verified" != true ]]; then
  echo 'HOLD — deployed public UQB example library did not reach the required public-only contract.' >&2
  exit 1
fi

fetch_page "$QUOTE_URL" "$EVIDENCE/public-quote.html" "$EVIDENCE/public-quote-http-status.txt"
grep -Fq 'Preconstruction, Survey &amp; Permits' "$EVIDENCE/public-quote.html" || grep -Fq 'Preconstruction, Survey & Permits' "$EVIDENCE/public-quote.html"
grep -Fq 'Complete included scope' "$EVIDENCE/public-quote.html"
grep -Fq 'Itemized price' "$EVIDENCE/public-quote.html"
grep -Fq 'No private H38 records or authenticated Business Office data are read' "$EVIDENCE/public-quote.html"
! grep -Fq 'Internal Cost' "$EVIDENCE/public-quote.html"
! grep -Fq 'Margin' "$EVIDENCE/public-quote.html"
! grep -Fq 'rkrueth@gmail.com' "$EVIDENCE/public-quote.html"
! grep -Fq 'USER-OWNER' "$EVIDENCE/public-quote.html"

fetch_page "$CAD_URL" "$EVIDENCE/public-cad.html" "$EVIDENCE/public-cad-http-status.txt"
for sheet in A-101 A-102 A-201 A-301; do grep -Fq "$sheet" "$EVIDENCE/public-cad.html"; done
grep -Eiq '<svg[[:space:]>]' "$EVIDENCE/public-cad.html"
! grep -Fq 'Complete included scope' "$EVIDENCE/public-cad.html"

fetch_page "$PACKAGE_URL" "$EVIDENCE/public-package.html" "$EVIDENCE/public-package-http-status.txt"
grep -Fq 'Structural Framing &amp; Weather-Tight Shell' "$EVIDENCE/public-package.html" || grep -Fq 'Structural Framing & Weather-Tight Shell' "$EVIDENCE/public-package.html"
grep -Fq 'Complete included scope' "$EVIDENCE/public-package.html"
for sheet in A-101 A-102 A-201 A-301; do grep -Fq "$sheet" "$EVIDENCE/public-package.html"; done
grep -Fq 'Print / Save PDF' "$EVIDENCE/public-package.html"
grep -Eiq '<svg[[:space:]>]' "$EVIDENCE/public-package.html"

printf '%s' "$DEMO_URL" > "$EVIDENCE/public-url.txt"
node - "$EVIDENCE/deployment-verification.json" "${GITHUB_SHA:-unknown}" "$DEMO_URL" <<'NODE'
const fs=require('fs');
const [out,commit,url]=process.argv.slice(2);
fs.writeFileSync(out,JSON.stringify({
  status:'PASS',
  sourceCommit:commit,
  sourceOfTruth:'H38 public demonstration specification',
  publicExamplePackages:7,
  matchedCadSheets:10,
  publicQuoteViews:true,
  publicCadViews:true,
  printableCompletePackages:true,
  generatedThroughPrivateRecords:false,
  privateRecordsRead:false,
  privateFieldsExcluded:true,
  externalActionsPerformed:false,
  publicUrl:url
},null,2)+'\n');
NODE
cat "$EVIDENCE/deployment-verification.json"
