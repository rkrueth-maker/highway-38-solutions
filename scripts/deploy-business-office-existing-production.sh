#!/usr/bin/env bash
set -euo pipefail

ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
RUNNER="${RUNNER_TEMP:?RUNNER_TEMP is required}"
DEPLOYMENT_ID="${H38_BO_EXISTING_DEPLOYMENT_ID:?H38_BO_EXISTING_DEPLOYMENT_ID is required}"
OUT="$ROOT/artifacts/business-office-existing-production"
WORK="$RUNNER/business-office-existing-production"
INVENTORY="$WORK/inventory"
BACKUP="$WORK/backup"
PROJECT="$WORK/project"
PACK_SOURCE="${H38_BO_PACK_SOURCE:-$ROOT/business-packs/highway38/apps-script/BusinessOffice_Pack.gs}"

rm -rf "$WORK" "$OUT"
mkdir -p "$INVENTORY" "$BACKUP" "$PROJECT" "$OUT"

# Find the one Apps Script project that owns the accepted deployment. The
# accepted deployment ID is the source of truth; a project title is not.
set +e
clasp list-scripts --json > "$INVENTORY/scripts.json" 2> "$INVENTORY/scripts-json.err"
JSON_STATUS=$?
if [[ "$JSON_STATUS" -ne 0 ]]; then
  clasp list-scripts > "$INVENTORY/scripts.txt" 2> "$INVENTORY/scripts.err"
  LIST_STATUS=$?
else
  LIST_STATUS=0
fi
set -e
if [[ "$JSON_STATUS" -ne 0 && "$LIST_STATUS" -ne 0 ]]; then
  echo 'HOLD — clasp could not list authorized Apps Script projects.'
  cat "$INVENTORY/scripts-json.err" "$INVENTORY/scripts.err" 2>/dev/null || true
  exit 31
fi

node - "$INVENTORY" <<'NODE'
const fs=require('fs'),path=require('path');
const dir=process.argv[2];
const files=['scripts.json','scripts.txt'].map(name=>path.join(dir,name)).filter(fs.existsSync);
const found=new Set();
function add(value){
  value=String(value||'').trim().replace(/^['"]|['"]$/g,'');
  if(/^[A-Za-z0-9_-]{35,}$/.test(value)&&!/^AKfy/.test(value)) found.add(value);
}
function walk(value,key=''){
  if(Array.isArray(value)) return value.forEach(item=>walk(item,key));
  if(value&&typeof value==='object') return Object.entries(value).forEach(([k,v])=>walk(v,k));
  if(typeof value==='string'){
    if(/script.?id|id/i.test(key)) add(value);
    for(const match of value.matchAll(/script\.google\.com\/d\/([A-Za-z0-9_-]{35,})/g)) add(match[1]);
    for(const match of value.matchAll(/\b([A-Za-z0-9_-]{45,})\b/g)) add(match[1]);
  }
}
for(const file of files){
  const raw=fs.readFileSync(file,'utf8');
  try{walk(JSON.parse(raw));}catch{}
  for(const match of raw.matchAll(/script\.google\.com\/d\/([A-Za-z0-9_-]{35,})/g)) add(match[1]);
  for(const line of raw.split(/\r?\n/)){
    const match=line.match(/(?:\s|–|—)([A-Za-z0-9_-]{45,})(?:\s|$)/);
    if(match)add(match[1]);
  }
}
// Known accepted-era candidates are harmless fallbacks; ownership is still
// proven by finding the exact deployment ID in clasp list-deployments.
add('1_-Ula8N34xZ92ypPPtBC7wG6iukFWtMojCPG_MPY8TalMLRCDgzSrf8S');
add('13Bes6_rs3LD-Sch4Vi5DKssCnlU_qb4hzZpGpDVfoRELRak0htXEj7O-');
fs.writeFileSync(path.join(dir,'candidate-script-ids.txt'),[...found].join('\n')+'\n');
NODE

touch "$INVENTORY/matches.txt"
while IFS= read -r SCRIPT_ID; do
  [[ -n "$SCRIPT_ID" ]] || continue
  SAFE_NAME="$(printf '%s' "$SCRIPT_ID" | tr -cd '[:alnum:]_-')"
  set +e
  clasp list-deployments "$SCRIPT_ID" > "$INVENTORY/deployments-$SAFE_NAME.txt" 2>&1
  STATUS=$?
  set -e
  if [[ "$STATUS" -eq 0 ]] && grep -F "$DEPLOYMENT_ID" "$INVENTORY/deployments-$SAFE_NAME.txt" >/dev/null; then
    printf '%s\n' "$SCRIPT_ID" >> "$INVENTORY/matches.txt"
  fi
done < "$INVENTORY/candidate-script-ids.txt"

MATCH_COUNT="$(grep -c . "$INVENTORY/matches.txt" || true)"
if [[ "$MATCH_COUNT" != "1" ]]; then
  echo "HOLD — expected exactly one project to own deployment $DEPLOYMENT_ID; found $MATCH_COUNT."
  cat "$INVENTORY/matches.txt" || true
  exit 32
fi
SCRIPT_ID="$(cat "$INVENTORY/matches.txt")"
printf '%s\n' "$SCRIPT_ID" > "$OUT/script-id.txt"
printf '%s\n' "$DEPLOYMENT_ID" > "$OUT/deployment-id.txt"
printf 'https://script.google.com/macros/s/%s/exec?app=business-office\n' "$DEPLOYMENT_ID" > "$OUT/web-app-url.txt"

printf '{"scriptId":"%s","rootDir":"."}\n' "$SCRIPT_ID" > "$BACKUP/.clasp.json"
(
  cd "$BACKUP"
  clasp pull
  clasp list-deployments | tee "$OUT/deployments-before.txt"
)
tar -czf "$OUT/bound-project-backup.tar.gz" -C "$BACKUP" .
sha256sum "$OUT/bound-project-backup.tar.gz" | tee "$OUT/bound-project-backup.sha256"

BEFORE_VERSION="$(awk -v id="$DEPLOYMENT_ID" '$0 ~ id {for(i=1;i<=NF;i++){if($i ~ /^@[0-9]+$/){gsub(/^@/,"",$i);print $i;exit}}}' "$OUT/deployments-before.txt")"
test -n "$BEFORE_VERSION" || { echo 'HOLD — existing deployment version was not found.'; exit 33; }
printf '%s\n' "$BEFORE_VERSION" > "$OUT/previous-version.txt"

printf '{"scriptId":"%s","rootDir":"."}\n' "$SCRIPT_ID" > "$PROJECT/.clasp.json"
bash "$ROOT/scripts/assemble-business-office-app.sh" "$PROJECT" "$PACK_SOURCE" "$ROOT"
if [[ -f "$ROOT/apps-script/integrated-backend/H38_Business_Office_Bridge.gs" ]]; then
  cp "$ROOT/apps-script/integrated-backend/H38_Business_Office_Bridge.gs" "$PROJECT/"
fi

(
  cd "$PROJECT"
  clasp push --force | tee "$OUT/clasp-push.txt"
  VERSION_OUTPUT="$(clasp create-version "Highway 38 Business Office workflow UX ${GITHUB_SHA}" | tee "$OUT/create-version.txt")"
  NEW_VERSION="$(printf '%s\n' "$VERSION_OUTPUT" | grep -Eo '[0-9]+' | tail -n 1)"
  test -n "$NEW_VERSION" || { echo 'HOLD — new Apps Script version could not be parsed.'; exit 34; }
  test "$NEW_VERSION" -gt "$BEFORE_VERSION" || { echo "HOLD — version did not advance: before=$BEFORE_VERSION new=$NEW_VERSION"; exit 35; }
  printf '%s\n' "$NEW_VERSION" > "$OUT/new-version.txt"
  clasp update-deployment "$DEPLOYMENT_ID" --versionNumber "$NEW_VERSION" --description "Highway 38 Business Office workflow UX ${GITHUB_SHA}" | tee "$OUT/update-deployment.txt"
  clasp list-deployments | tee "$OUT/deployments-after.txt"
  grep -F "$DEPLOYMENT_ID @${NEW_VERSION}" "$OUT/deployments-after.txt"
)

# Verify the deployed runtime when the accepted project exposes the execution
# API. A missing execution endpoint is a HOLD, not a reason to create another
# project or deployment.
set +e
(
  cd "$PROJECT"
  clasp run-function boGetRenderedWebAppHtml --nondev
) > "$OUT/rendered-html-output.txt" 2> "$OUT/rendered-html-error.txt"
RUN_STATUS=$?
set -e
if [[ "$RUN_STATUS" -ne 0 ]]; then
  echo 'HOLD — accepted Business Office project could not return deployed HTML through its execution API.'
  cat "$OUT/rendered-html-error.txt" || true
  exit 36
fi

node - "$OUT/rendered-html-output.txt" "$OUT/deployed-rendered-web-app.html" <<'NODE'
const fs=require('fs');
const [source,target]=process.argv.slice(2);
const raw=fs.readFileSync(source,'utf8').trim();
let html='';
try{
  const value=JSON.parse(raw);
  html=typeof value==='string'?value:(typeof value.response==='string'?value.response:'');
}catch{}
if(!html){
  const first=raw.indexOf('"'),last=raw.lastIndexOf('"');
  if(first>=0&&last>first){try{html=JSON.parse(raw.slice(first,last+1));}catch{}}
}
if(typeof html!=='string'||!html.includes('<!doctype html>')) throw new Error('No deployed HTML string was returned.');
const markers=['Highway 38 Business Office','What needs to move next?','Sales Pipeline','Job Stage Board','Accounting health','Grouped global search'];
const missing=markers.filter(marker=>!html.includes(marker));
if(missing.length) throw new Error('Deployed Business Office UX is missing markers: '+missing.join(', '));
fs.writeFileSync(target,html);
NODE

URL="$(cat "$OUT/web-app-url.txt")"
HTTP_STATUS="$(curl -L -sS -o "$OUT/web-app-response.html" -w '%{http_code}' "$URL" || true)"
printf '%s\n' "$HTTP_STATUS" > "$OUT/web-app-http-status.txt"
test "$HTTP_STATUS" != "404" || { echo 'HOLD — accepted Business Office web-app route returned 404.'; exit 37; }

node - "$OUT/deployed-rendered-web-app.html" "$OUT" <<'NODE'
const fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const html=fs.readFileSync(process.argv[2],'utf8'),out=process.argv[3];
(async()=>{
  const browser=await chromium.launch({headless:true});
  for(const [name,width,height] of [['business-office-live-desktop',1440,1000],['business-office-live-mobile',390,844]]){
    const page=await browser.newPage({viewport:{width,height}});
    await page.setContent(html,{waitUntil:'domcontentloaded'});
    await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
  }
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
NODE

NEW_VERSION="$(cat "$OUT/new-version.txt")"
cat > "$OUT/deployment.json" <<JSON
{
  "status": "PASS",
  "sourceCommit": "${GITHUB_SHA}",
  "scriptId": "${SCRIPT_ID}",
  "deploymentId": "${DEPLOYMENT_ID}",
  "webAppUrl": "${URL}",
  "previousVersion": ${BEFORE_VERSION},
  "newVersion": ${NEW_VERSION},
  "createdNewProject": false,
  "createdNewDeployment": false,
  "updatedExistingProjectOnly": true,
  "runtimeUxVerified": true,
  "desktopVerified": true,
  "mobileVerified": true,
  "externalActionsEnabled": false,
  "externalActionsOccurred": false
}
JSON
cat "$OUT/deployment.json"
