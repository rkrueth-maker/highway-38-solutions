#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
OUT_DIR="${1:-$REPO_ROOT/artifacts/quote-mobile-live}"
WORK="$RUNNER_TEMP/quote-mobile-authorized"
BACKUP="$WORK/backup"
HARNESS="$WORK/harness"
RESTORE="$WORK/restore"
FIXTURES="$WORK/fixtures"
CLASP="$REPO_ROOT/node_modules/.bin/clasp"
mkdir -p "$OUT_DIR" "$BACKUP" "$HARNESS" "$RESTORE" "$FIXTURES"

SCRIPT_ID="$(node - <<'NODE'
const data=require('./business-packs/highway38/deployment.json');
process.stdout.write(data.appsScript.productionProjectId);
NODE
)"
PRODUCTION_DEPLOYMENT_ID="$(node - <<'NODE'
const data=require('./business-packs/highway38/deployment.json');
process.stdout.write(data.appsScript.ownerPortalDeploymentId);
NODE
)"
TOKEN="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
TEMP_DEPLOYMENT_ID=""

apps_script_access_token() {
  node <<'NODE'
const fs=require('fs'),https=require('https'),querystring=require('querystring');
const raw=JSON.parse(fs.readFileSync(process.env.HOME+'/.clasprc.json','utf8'));
function walk(o){if(!o||typeof o!=='object')return [];return [o,...Object.values(o).flatMap(walk)]}
const auth=walk(raw).find(o=>o&&typeof o==='object'&&(o.refresh_token||o.refreshToken)&&(o.client_id||o.clientId)&&(o.client_secret||o.clientSecret));
if(!auth)throw new Error('No refreshable OAuth credential found.');
const body=querystring.stringify({client_id:auth.client_id||auth.clientId,client_secret:auth.client_secret||auth.clientSecret,refresh_token:auth.refresh_token||auth.refreshToken,grant_type:'refresh_token'});
const req=https.request({method:'POST',hostname:'oauth2.googleapis.com',path:'/token',headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>{const parsed=JSON.parse(data);if(!parsed.access_token)throw new Error(data);process.stdout.write(parsed.access_token)})});
req.on('error',e=>{throw e});req.end(body);
NODE
}

delete_temp_deployment() {
  [[ -z "$TEMP_DEPLOYMENT_ID" ]] && return 0
  local access_token
  access_token="$(apps_script_access_token)"
  curl --fail --silent --show-error -X DELETE \
    -H "Authorization: Bearer ${access_token}" \
    "https://script.googleapis.com/v1/projects/${SCRIPT_ID}/deployments/${TEMP_DEPLOYMENT_ID}" >/dev/null
  printf '%s\n' "$TEMP_DEPLOYMENT_ID" > "$OUT_DIR/deleted-temporary-deployment-id.txt"
  TEMP_DEPLOYMENT_ID=""
}

restore_source() {
  local exit_code=$?
  delete_temp_deployment || exit_code=1
  if [[ -f "$BACKUP/.clasp.json" ]]; then
    rm -rf "$RESTORE"
    mkdir -p "$RESTORE"
    cp -a "$BACKUP/." "$RESTORE/"
    (cd "$RESTORE" && "$CLASP" push --force) 2>&1 | tee "$OUT_DIR/restore-push.txt" || exit_code=1
    (cd "$RESTORE" && "$CLASP" list-deployments) 2>&1 | tee "$OUT_DIR/deployments-after.txt" || exit_code=1
    grep -F "$PRODUCTION_DEPLOYMENT_ID" "$OUT_DIR/deployments-before.txt" > "$OUT_DIR/accepted-deployment-before.txt" || exit_code=1
    grep -F "$PRODUCTION_DEPLOYMENT_ID" "$OUT_DIR/deployments-after.txt" > "$OUT_DIR/accepted-deployment-after.txt" || exit_code=1
    cmp -s "$OUT_DIR/accepted-deployment-before.txt" "$OUT_DIR/accepted-deployment-after.txt" || exit_code=1
  fi
  exit "$exit_code"
}
trap restore_source EXIT

merge_acceptance_manifest() {
  node - "$1" "$REPO_ROOT/apps-script/business-office/appsscript.json" <<'NODE'
const fs=require('fs');
const target=process.argv[2],source=process.argv[3];
const base=JSON.parse(fs.readFileSync(target,'utf8'));
const bo=JSON.parse(fs.readFileSync(source,'utf8'));
base.runtimeVersion='V8';
base.exceptionLogging='STACKDRIVER';
base.oauthScopes=[...new Set([...(base.oauthScopes||[]),...(bo.oauthScopes||[])])];
base.dependencies=base.dependencies||{};
const services=[...(base.dependencies.enabledAdvancedServices||[])];
for(const service of (((bo.dependencies||{}).enabledAdvancedServices)||[])) if(!services.some(x=>x.serviceId===service.serviceId)) services.push(service);
base.dependencies.enabledAdvancedServices=services;
base.executionApi=base.executionApi||{access:'MYSELF'};
base.webapp={executeAs:'USER_DEPLOYING',access:'ANYONE_ANONYMOUS'};
fs.writeFileSync(target,JSON.stringify(base,null,2)+'\n');
NODE
}

printf '{"scriptId":"%s","rootDir":"."}\n' "$SCRIPT_ID" > "$BACKUP/.clasp.json"
(cd "$BACKUP" && "$CLASP" pull) 2>&1 | tee "$OUT_DIR/project-pull.txt"
(cd "$BACKUP" && "$CLASP" list-deployments) 2>&1 | tee "$OUT_DIR/deployments-before.txt"
grep -F "$PRODUCTION_DEPLOYMENT_ID" "$OUT_DIR/deployments-before.txt" >/dev/null

cp -a "$BACKUP/." "$HARNESS/"
for source in "$REPO_ROOT"/apps-script/business-office/*.gs; do
  base="$(basename "$source" .gs)"
  rm -f "$HARNESS/$base.js" "$HARNESS/$base.gs"
  cp "$source" "$HARNESS/$base.gs"
done
rm -f "$HARNESS/BusinessOffice_00_Pack.js" "$HARNESS/BusinessOffice_00_Pack.gs"
rm -f "$HARNESS/BusinessOffice_Pack.js" "$HARNESS/BusinessOffice_Pack.gs"
cp "$REPO_ROOT/business-packs/highway38/apps-script/BusinessOffice_Pack.gs" "$HARNESS/BusinessOffice_Pack.gs"
rm -f "$HARNESS/BusinessOffice_Sync.js" "$HARNESS/BusinessOffice_Sync.gs"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$HARNESS/BusinessOffice_Sync.gs"
rm -f "$HARNESS/BusinessOffice_CabinAutoSeed.js" "$HARNESS/BusinessOffice_CabinAutoSeed.gs"
# The unified production project contains public-intake and old acceptance doPost handlers.
# Remove them from the temporary harness so the token-protected mobile acceptance endpoint is the only doPost.
rm -f "$HARNESS/Unified_PublicIntake.js" "$HARNESS/Unified_PublicIntake.gs"
rm -f "$HARNESS/BusinessOffice_Highway38AcceptanceHarness.js" "$HARNESS/BusinessOffice_Highway38AcceptanceHarness.gs"
rm -f "$HARNESS/BusinessOffice_AcceptanceHarness.js" "$HARNESS/BusinessOffice_AcceptanceHarness.gs"
cp "$REPO_ROOT/business-packs/highway38/apps-script/BusinessOffice_Highway38AcceptanceHarness.gs" "$HARNESS/BusinessOffice_AcceptanceHarness.gs"

python3 - "$HARNESS/BusinessOffice_Web.gs" "$HARNESS/BusinessOffice_Auth.gs" "$HARNESS/BusinessOffice_AcceptanceHarness.gs" "$TOKEN" <<'PY'
from pathlib import Path
import sys
web=Path(sys.argv[1]); auth=Path(sys.argv[2]); harness=Path(sys.argv[3]); token=sys.argv[4]
web.write_text(web.read_text().replace('function doGet() {','function boMobileAcceptanceDoGet_() {'))
auth_text=auth.read_text()
old="return boAuthText_(Session.getActiveUser().getEmail()).toLowerCase();"
new="return 'rkrueth@gmail.com';"
if old not in auth_text:
    raise SystemExit('Could not patch temporary owner identity.')
auth.write_text(auth_text.replace(old,new,1))
text=harness.read_text()
text=text.replace("const H38_BO_ACCEPTANCE_TOKEN_PROPERTY = 'H38_BUSINESS_OFFICE_ACCEPTANCE_TOKEN';", "const H38_BO_ACCEPTANCE_TOKEN = '"+token+"';")
text=text.replace("const expected = PropertiesService.getScriptProperties().getProperty(H38_BO_ACCEPTANCE_TOKEN_PROPERTY) || '';", "const expected = H38_BO_ACCEPTANCE_TOKEN;")
text=text.replace("if (action === 'health')", "if (action === 'mobileQuoteAcceptance') return boQuoteBuilderRunMobileProductionAcceptance();\n  if (action === 'health')")
harness.write_text(text)
PY
python3 - "$HARNESS/BusinessOffice_QuoteBuilder_Mobile_LiveAcceptance.gs" <<'PY2'
from pathlib import Path
import sys
path=Path(sys.argv[1])
text=path.read_text()
old="const access = boQuoteBuilderRequireAction_('Edit');"
new="const access = { user: { email: 'rkrueth@gmail.com' } };"
if old not in text:
    raise SystemExit('Temporary mobile acceptance authorization marker not found.')
path.write_text(text.replace(old,new,1))
PY2
python3 - "$HARNESS/BusinessOffice_QuoteBuilder_Direct.gs" <<'PY3'
from pathlib import Path
import re,sys
path=Path(sys.argv[1])
text=path.read_text()
pattern=r"function boQuoteBuilderRequireAction_\(action\) \{.*?\n\}"
replacement="""function boQuoteBuilderRequireAction_(action) {
  return {
    user: { id: 'USER-OWNER-001', email: 'rkrueth@gmail.com', displayName: 'Rick Krueth', role: 'Owner', owner: true },
    permissions: { view:true, create:true, edit:true, approve:true, customers:true, priceBook:true, templates:true, documents:true },
    branding: boBranding_(),
    boundaries: { customerReleaseRequiresOwnerApproval:true, externalActionsEnabled:false, aiCanApproveOrPrice:false }
  };
}"""
updated,count=re.subn(pattern,replacement,text,count=1,flags=re.S)
if count!=1:
    raise SystemExit('Shared Quote Builder authorization function not found in temporary harness.')
path.write_text(updated)
PY3
merge_acceptance_manifest "$HARNESS/appsscript.json"

(cd "$HARNESS" && "$CLASP" push --force) 2>&1 | tee "$OUT_DIR/harness-push.txt"
(cd "$HARNESS" && "$CLASP" create-version "Quote Builder mobile web acceptance ${GITHUB_SHA:-manual}") 2>&1 | tee "$OUT_DIR/harness-version.txt"
(cd "$HARNESS" && "$CLASP" create-deployment --description "Temporary Quote Builder mobile acceptance ${GITHUB_SHA:-manual}") 2>&1 | tee "$OUT_DIR/harness-deployment.txt"
TEMP_DEPLOYMENT_ID="$(grep -Eo 'AKfy[[:alnum:]_-]+' "$OUT_DIR/harness-deployment.txt" | head -n1)"
test -n "$TEMP_DEPLOYMENT_ID"
printf '%s\n' "$TEMP_DEPLOYMENT_ID" > "$OUT_DIR/temporary-deployment-id.txt"
TEMP_URL="https://script.google.com/macros/s/${TEMP_DEPLOYMENT_ID}/exec"
printf '%s\n' "$TEMP_URL" > "$OUT_DIR/temporary-url.txt"

node - "$TOKEN" > "$FIXTURES/request.json" <<'NODE'
process.stdout.write(JSON.stringify({token:process.argv[2],action:'mobileQuoteAcceptance',payload:{}}));
NODE
HTTP_STATUS="$(curl -L -sS -o "$OUT_DIR/raw.txt" -w '%{http_code}' -H 'Content-Type: application/json' --data-binary "@$FIXTURES/request.json" "$TEMP_URL" || true)"
printf '%s\n' "$HTTP_STATUS" > "$OUT_DIR/http-status.txt"
test "$HTTP_STATUS" = "200"

node - "$OUT_DIR/raw.txt" "$OUT_DIR/result.json" <<'NODE'
const fs=require('fs');
const raw=fs.readFileSync(process.argv[2],'utf8').trim();
const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
if(start<0||end<start)throw new Error('Web acceptance returned no JSON object: '+raw.slice(0,500));
const envelope=JSON.parse(raw.slice(start,end+1));
if(!envelope.ok)throw new Error(envelope.error||'Mobile acceptance endpoint returned HOLD.');
fs.writeFileSync(process.argv[3],JSON.stringify(envelope.result,null,2)+'\n');
NODE
cat "$OUT_DIR/result.json"

delete_temp_deployment
