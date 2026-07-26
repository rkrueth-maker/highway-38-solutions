#!/usr/bin/env bash
set -euo pipefail

# The public Universal Quote Builder library is rendered from the published
# demonstration records in the existing H38 Business Office Core Data workbook.
# The public routes expose only approved customer-facing demonstration fields.

REPO_ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
DEPLOYMENT="$REPO_ROOT/business-packs/highway38/deployment.json"
EVIDENCE="$REPO_ROOT/artifacts/office-public-uqb-demo"
rm -rf "$EVIDENCE"
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
STATUS_URL="${BASE_URL}?publicUqbStatus=1"
DEMO_URL="${BASE_URL}?publicUqbDemo=1"
QUOTE_URL="${BASE_URL}?publicUqbPackage=preconstruction&view=quote"
CAD_URL="${BASE_URL}?publicUqbPackage=framing&view=cad"
PACKAGE_URL="${BASE_URL}?publicUqbPackage=framing&view=package"
DRAWING_URL="${BASE_URL}?publicUqbDrawing=H38-UQB-PUBLIC-PUBLIC-NEW-HOUSE-DEMO-V1-DRAW-A-101"

fetch_page() {
  local url="$1" output="$2" status_file="$3"
  local status
  status="$(curl -L -sS --max-time 90 -o "$output" -w '%{http_code}' "$url" || true)"
  printf '%s' "$status" > "$status_file"
  [[ "$status" =~ ^2[0-9][0-9]$ ]]
}

verified=false
for attempt in $(seq 1 60); do
  if fetch_page "$STATUS_URL" "$EVIDENCE/office-status.json" "$EVIDENCE/office-status-http-status.txt" \
    && node - "$EVIDENCE/office-status.json" <<'NODE'
const fs=require('fs');
const file=process.argv[2];
const raw=fs.readFileSync(file,'utf8');
const first=raw.indexOf('{'),last=raw.lastIndexOf('}');
if(first<0||last<first)process.exit(1);
const value=JSON.parse(raw.slice(first,last+1));
const expected={project:1,subquotes:14,items:56,scopes:84,drawings:10,documents:15,published:1};
if(value.status!=='PASS'||value.complete!==true||value.sourceOfTruth!=='H38 Business Office Core Data'||value.publicFieldsOnly!==true||value.externalActionsPerformed!==false)process.exit(1);
for(const [name,count] of Object.entries(expected))if(Number(value.counts&&value.counts[name])!==count)process.exit(1);
fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
NODE
  then
    verified=true
    break
  fi
  sleep 10
done

if [[ "$verified" != true ]]; then
  echo 'HOLD — deployed H38 Office demonstration records did not reach the exact published count contract.' >&2
  exit 1
fi

verified=false
for attempt in $(seq 1 36); do
  if fetch_page "$DEMO_URL" "$EVIDENCE/public-examples.html" "$EVIDENCE/public-examples-http-status.txt" \
    && grep -Fq 'Universal Quote Builder — Public Examples' "$EVIDENCE/public-examples.html" \
    && grep -Fq 'Complete quotes matched to coordinated CAD sheets' "$EVIDENCE/public-examples.html" \
    && grep -Fq 'Generated through H38 Office:' "$EVIDENCE/public-examples.html" \
    && grep -Fq 'View full quote' "$EVIDENCE/public-examples.html" \
    && grep -Fq 'View full-size CAD sheets' "$EVIDENCE/public-examples.html" \
    && grep -Fq 'Print / save complete package' "$EVIDENCE/public-examples.html"; then
    example_count="$(grep -o 'class="example"' "$EVIDENCE/public-examples.html" | wc -l | tr -d ' ')"
    if [[ "$example_count" == "7" ]]; then verified=true; break; fi
  fi
  sleep 10
done
[[ "$verified" == true ]] || { echo 'HOLD — deployed Office-backed matched example library did not reach the required contract.' >&2; exit 1; }

fetch_page "$QUOTE_URL" "$EVIDENCE/public-quote.html" "$EVIDENCE/public-quote-http-status.txt"
grep -Fq 'Preconstruction, Survey &amp; Permits' "$EVIDENCE/public-quote.html" || grep -Fq 'Preconstruction, Survey & Permits' "$EVIDENCE/public-quote.html"
grep -Fq 'Complete included scope' "$EVIDENCE/public-quote.html"
grep -Fq 'Itemized price' "$EVIDENCE/public-quote.html"
grep -Fq '4–8 weeks' "$EVIDENCE/public-quote.html"
grep -Fq '30% at authorization' "$EVIDENCE/public-quote.html"
grep -Fq 'Office-generated public example:' "$EVIDENCE/public-quote.html"
for private in 'Internal Cost' 'Margin' 'rkrueth@gmail.com' 'USER-OWNER' 'CUST-H38'; do ! grep -Fq "$private" "$EVIDENCE/public-quote.html"; done

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

fetch_page "$DRAWING_URL" "$EVIDENCE/public-a101.html" "$EVIDENCE/public-a101-http-status.txt"
grep -Fq 'A-101' "$EVIDENCE/public-a101.html"
grep -Eiq '<svg[[:space:]>]' "$EVIDENCE/public-a101.html"
grep -Fq 'REV E' "$EVIDENCE/public-a101.html"

printf '%s' "$DEMO_URL" > "$EVIDENCE/public-url.txt"
node - "$EVIDENCE/office-status.json" "$EVIDENCE/deployment-verification.json" "${GITHUB_SHA:-unknown}" "$DEMO_URL" <<'NODE'
const fs=require('fs');
const [statusFile,out,commit,url]=process.argv.slice(2),status=JSON.parse(fs.readFileSync(statusFile,'utf8'));
fs.writeFileSync(out,JSON.stringify({
  status:'PASS',sourceCommit:commit,sourceOfTruth:'H38 Business Office Core Data',
  counts:status.counts,publicExamplePackages:7,matchedCadSheets:10,
  publicQuoteViews:true,publicCadViews:true,printableCompletePackages:true,
  generatedThroughOffice:true,privateFieldsExcluded:true,externalActionsPerformed:false,publicUrl:url
},null,2)+'\n');
NODE
cat "$EVIDENCE/deployment-verification.json"
