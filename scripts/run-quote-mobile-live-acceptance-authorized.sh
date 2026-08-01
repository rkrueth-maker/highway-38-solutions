#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
OUT_DIR="${1:-$REPO_ROOT/artifacts/quote-mobile-live}"
WORK="$RUNNER_TEMP/quote-mobile-authorized"
BACKUP="$WORK/backup"
HARNESS="$WORK/harness"
RESTORE="$WORK/restore"
mkdir -p "$OUT_DIR" "$BACKUP" "$HARNESS" "$RESTORE"

SCRIPT_ID="$(node - <<'NODE'
const data=require('./business-packs/highway38/deployment.json');
process.stdout.write(data.appsScript.productionProjectId);
NODE
)"
DEPLOYMENT_ID="$(node - <<'NODE'
const data=require('./business-packs/highway38/deployment.json');
process.stdout.write(data.appsScript.ownerPortalDeploymentId);
NODE
)"

restore_source() {
  local exit_code=$?
  if [[ -f "$BACKUP/.clasp.json" ]]; then
    rm -rf "$RESTORE"
    mkdir -p "$RESTORE"
    cp -a "$BACKUP/." "$RESTORE/"
    (cd "$RESTORE" && "$REPO_ROOT/node_modules/.bin/clasp" push --force) 2>&1 | tee "$OUT_DIR/restore-push.txt" || exit_code=1
    (cd "$RESTORE" && "$REPO_ROOT/node_modules/.bin/clasp" list-deployments) 2>&1 | tee "$OUT_DIR/deployments-after.txt" || exit_code=1
    if [[ -f "$OUT_DIR/deployments-before.txt" ]]; then
      grep -F "$DEPLOYMENT_ID" "$OUT_DIR/deployments-before.txt" > "$OUT_DIR/accepted-deployment-before.txt" || exit_code=1
      grep -F "$DEPLOYMENT_ID" "$OUT_DIR/deployments-after.txt" > "$OUT_DIR/accepted-deployment-after.txt" || exit_code=1
      cmp -s "$OUT_DIR/accepted-deployment-before.txt" "$OUT_DIR/accepted-deployment-after.txt" || exit_code=1
    fi
  fi
  exit "$exit_code"
}
trap restore_source EXIT

printf '{"scriptId":"%s","rootDir":"."}\n' "$SCRIPT_ID" > "$BACKUP/.clasp.json"
(cd "$BACKUP" && "$REPO_ROOT/node_modules/.bin/clasp" pull) 2>&1 | tee "$OUT_DIR/project-pull.txt"
(cd "$BACKUP" && "$REPO_ROOT/node_modules/.bin/clasp" list-deployments) 2>&1 | tee "$OUT_DIR/deployments-before.txt"
grep -F "$DEPLOYMENT_ID" "$OUT_DIR/deployments-before.txt" >/dev/null

cp -a "$BACKUP/." "$HARNESS/"
for source in "$REPO_ROOT"/apps-script/business-office/*.gs; do
  base="$(basename "$source" .gs)"
  rm -f "$HARNESS/$base.js" "$HARNESS/$base.gs"
  cp "$source" "$HARNESS/$base.gs"
done
rm -f "$HARNESS/BusinessOffice_Sync.js" "$HARNESS/BusinessOffice_Sync.gs"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$HARNESS/BusinessOffice_Sync.gs"
rm -f "$HARNESS/BusinessOffice_CabinAutoSeed.js" "$HARNESS/BusinessOffice_CabinAutoSeed.gs"

python3 - "$HARNESS/BusinessOffice_Web.gs" <<'PY'
from pathlib import Path
import sys
path=Path(sys.argv[1])
text=path.read_text()
text=text.replace('function doGet() {','function boMobileAcceptanceDoGet_() {')
path.write_text(text)
PY

node - "$HARNESS/appsscript.json" "$REPO_ROOT/apps-script/business-office/appsscript.json" <<'NODE'
const fs=require('fs');
const target=process.argv[2], boPath=process.argv[3];
const base=JSON.parse(fs.readFileSync(target,'utf8'));
const bo=JSON.parse(fs.readFileSync(boPath,'utf8'));
base.runtimeVersion='V8';
base.exceptionLogging=base.exceptionLogging||'STACKDRIVER';
base.oauthScopes=[...new Set([...(base.oauthScopes||[]),...(bo.oauthScopes||[])])];
base.dependencies=base.dependencies||{};
const services=[...(base.dependencies.enabledAdvancedServices||[])];
for(const service of (((bo.dependencies||{}).enabledAdvancedServices)||[])){
  if(!services.some(existing=>existing.serviceId===service.serviceId)) services.push(service);
}
base.dependencies.enabledAdvancedServices=services;
base.executionApi=base.executionApi||bo.executionApi||{access:'MYSELF'};
fs.writeFileSync(target,JSON.stringify(base,null,2)+'\n');
NODE

(cd "$HARNESS" && "$REPO_ROOT/node_modules/.bin/clasp" push --force) 2>&1 | tee "$OUT_DIR/harness-push.txt"
(cd "$HARNESS" && "$REPO_ROOT/node_modules/.bin/clasp" create-version "Quote Builder mobile live acceptance ${GITHUB_SHA:-manual}") 2>&1 | tee "$OUT_DIR/harness-version.txt"
(cd "$HARNESS" && "$REPO_ROOT/node_modules/.bin/clasp" run-function boQuoteBuilderRunMobileProductionAcceptance) 2>&1 | tee "$OUT_DIR/raw.txt"

node - "$OUT_DIR/raw.txt" "$OUT_DIR/result.json" <<'NODE'
const fs=require('fs');
const input=process.argv[2],output=process.argv[3];
const raw=fs.readFileSync(input,'utf8');
const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
if(start<0||end<start)throw new Error('Authorized mobile acceptance returned no JSON object: '+raw.slice(0,500));
const result=JSON.parse(raw.slice(start,end+1));
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
NODE

cat "$OUT_DIR/result.json"
