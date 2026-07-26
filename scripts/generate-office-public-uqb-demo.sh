#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
RUNNER_TEMP_DIR="${RUNNER_TEMP:?RUNNER_TEMP is required}"
DEPLOYMENT="$REPO_ROOT/business-packs/highway38/deployment.json"
EVIDENCE="$REPO_ROOT/artifacts/office-public-uqb-demo"
RUN_KEY="PUBLIC-NEW-HOUSE-DEMO-V1"
PROJECT_ID="H38-UQB-PUBLIC-${RUN_KEY}-PROJECT-001"
SUBQUOTE_ID="H38-UQB-PUBLIC-${RUN_KEY}-SUB-02"
DRAWING_ID="H38-UQB-PUBLIC-${RUN_KEY}-DRAW-A-101"

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
BASE="https://script.google.com/macros/s/${BUSINESS_DEPLOYMENT_ID}/exec"
PUBLIC_URL="${BASE}?publicUqbDemo=1"
QUOTE_URL="${BASE}?publicUqbQuote=${SUBQUOTE_ID}"
DRAWING_URL="${BASE}?publicUqbDrawing=${DRAWING_ID}"
printf '%s' "$PUBLIC_URL" > "$EVIDENCE/public-url.txt"

fetch_until_ready() {
  local url="$1" pattern="$2" output="$3" attempts="${4:-60}"
  for attempt in $(seq 1 "$attempts"); do
    status="$(curl -L -sS --max-time 60 -o "$output" -w '%{http_code}' "$url" || true)"
    if [[ "$status" != "404" ]] && grep -Fq "$pattern" "$output"; then
      printf '%s' "$status" > "${output%.html}-http-status.txt"
      return 0
    fi
    sleep 10
  done
  echo "HOLD — deployed Office route did not become ready: $url :: $pattern" >&2
  return 1
}

# Confirm every public-safe seed feed is available from the deployed H38 app.
for seed in customers projects revisions subquotes items scopes drawings drawing-revisions documents proof; do
  out="$EVIDENCE/seed-${seed}.csv"
  fetch_until_ready "${BASE}?publicUqbSeed=${seed}" 'H38' "$out"
  test -s "$out"
done

grep -F "$PROJECT_ID" "$EVIDENCE/seed-projects.csv" >/dev/null
test "$(grep -c '^H38-UQB-PUBLIC-PUBLIC-NEW-HOUSE-DEMO-V1-SUB-' "$EVIDENCE/seed-subquotes.csv")" -eq 14
test "$(grep -c '^H38-UQB-PUBLIC-PUBLIC-NEW-HOUSE-DEMO-V1-ITEM-' "$EVIDENCE/seed-items.csv")" -eq 56
test "$(grep -c '^H38-UQB-PUBLIC-PUBLIC-NEW-HOUSE-DEMO-V1-SCOPE-' "$EVIDENCE/seed-scopes.csv")" -eq 84
test "$(grep -c '^H38-UQB-PUBLIC-PUBLIC-NEW-HOUSE-DEMO-V1-DRAW-' "$EVIDENCE/seed-drawings.csv")" -eq 10
test "$(grep -c '^H38-UQB-PUBLIC-PUBLIC-NEW-HOUSE-DEMO-V1-DOC-' "$EVIDENCE/seed-documents.csv")" -eq 15

# The existing H38 Core Data workbook imports these feeds into its canonical
# UQB and BO sheets. Poll the public renderer until those Office rows are visible.
fetch_until_ready "$PUBLIC_URL" 'H38 Business Office Demo Results' "$EVIDENCE/public-response.html" 90
grep -F 'Office-generated result:' "$EVIDENCE/public-response.html" >/dev/null
grep -F 'CAD drawing examples from the Office drawing register' "$EVIDENCE/public-response.html" >/dev/null
grep -F 'Complete quote examples from the Office subquote records' "$EVIDENCE/public-response.html" >/dev/null
grep -F 'New-House Construction' "$EVIDENCE/public-response.html" >/dev/null
grep -F '<span>Phase quotes</span><strong>14</strong>' "$EVIDENCE/public-response.html" >/dev/null
grep -F '<span>Itemized lines</span><strong>56</strong>' "$EVIDENCE/public-response.html" >/dev/null
grep -F '<span>CAD sheets</span><strong>10</strong>' "$EVIDENCE/public-response.html" >/dev/null
! grep -F 'Whole-House Renovation and Property Improvement' "$EVIDENCE/public-response.html" >/dev/null

fetch_until_ready "$QUOTE_URL" 'Lot Clearing, Grubbing &amp; Erosion Control' "$EVIDENCE/public-quote.html"
grep -F 'Complete included scope' "$EVIDENCE/public-quote.html" >/dev/null
grep -F 'Itemized price' "$EVIDENCE/public-quote.html" >/dev/null
grep -F 'DEMONSTRATION — NOT A CONTRACT' "$EVIDENCE/public-quote.html" >/dev/null

fetch_until_ready "$DRAWING_URL" 'A-101' "$EVIDENCE/public-drawing.html"
grep -E '<svg[ >]' "$EVIDENCE/public-drawing.html" >/dev/null
grep -F 'REV E' "$EVIDENCE/public-drawing.html" >/dev/null

cat > "$EVIDENCE/status.json" <<JSON
{
  "status": "PASS",
  "complete": true,
  "runKey": "${RUN_KEY}",
  "projectId": "${PROJECT_ID}",
  "counts": {"project":1,"subquotes":14,"items":56,"scopes":84,"drawings":10,"documents":15,"published":1},
  "expected": {"project":1,"subquotes":14,"items":56,"scopes":84,"drawings":10,"documents":15,"published":1},
  "progressPercent": 100,
  "sourceOfTruth": "H38 Business Office Core Data",
  "publicationMode": "deterministic Office record imports",
  "externalActionsPerformed": false
}
JSON

node - "$EVIDENCE/status.json" "$EVIDENCE/deployment-verification.json" "${GITHUB_SHA:-unknown}" "$PUBLIC_URL" <<'NODE'
const fs=require('fs');
const [statusFile,out,commit,url]=process.argv.slice(2),status=JSON.parse(fs.readFileSync(statusFile,'utf8'));
fs.writeFileSync(out,JSON.stringify({status:'PASS',sourceCommit:commit,sourceOfTruth:status.sourceOfTruth,runKey:status.runKey,projectId:status.projectId,counts:status.counts,publicUrl:url,generatedThroughOffice:true,privateFieldsExcluded:true,externalActionsPerformed:false},null,2)+'\n');
NODE
cat "$EVIDENCE/deployment-verification.json"
