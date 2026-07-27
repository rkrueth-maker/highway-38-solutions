#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
EVIDENCE="$REPO_ROOT/artifacts/email-communications-backfill"
WORK="${RUNNER_TEMP:-/tmp}/h38-email-communications-backfill"
OWNER_SCRIPT_ID="13Bes6_rs3LD-Sch4Vi5DKssCnIU_qb4hzZpGpDVfoRELRAk0HtXEJ7o"
OWNER_DEPLOYMENT_ID="AKfycbzr0hoImRF4iQ1gR90Cr17juP8PODkEWRorXxW6qralEYTGLhOU33E1wYEPU_3duQKpQg"
BACKUP="$WORK/owner-backup"
HARNESS="$WORK/owner-harness"
RESTORED=0

rm -rf "$WORK"
mkdir -p "$EVIDENCE" "$BACKUP" "$HARNESS"

parse_json_output() {
  local input_file="$1"
  local output_file="$2"
  node - "$input_file" "$output_file" <<'NODE'
const fs=require('fs');
const input=process.argv[2], output=process.argv[3];
const raw=fs.readFileSync(input,'utf8');
const start=raw.indexOf('{'), end=raw.lastIndexOf('}');
if(start<0||end<start) throw new Error(`No JSON object returned in ${input}`);
const value=JSON.parse(raw.slice(start,end+1));
fs.writeFileSync(output,JSON.stringify(value,null,2)+'\n');
NODE
}

merge_harness_manifest() {
  node - "$1" "$REPO_ROOT/apps-script/business-office/appsscript.json" <<'NODE'
const fs=require('fs');
const target=process.argv[2], boPath=process.argv[3];
const base=JSON.parse(fs.readFileSync(target,'utf8'));
const bo=JSON.parse(fs.readFileSync(boPath,'utf8'));
base.runtimeVersion='V8';
base.exceptionLogging=base.exceptionLogging||'STACKDRIVER';
base.oauthScopes=[...new Set([...(base.oauthScopes||[]),...(bo.oauthScopes||[])])];
base.dependencies=base.dependencies||{};
const services=[...(base.dependencies.enabledAdvancedServices||[])];
for(const service of (bo.dependencies&&bo.dependencies.enabledAdvancedServices||[])){
  if(!services.some(existing=>existing.serviceId===service.serviceId)) services.push(service);
}
base.dependencies.enabledAdvancedServices=services;
base.executionApi=base.executionApi||bo.executionApi||{access:'ANYONE'};
fs.writeFileSync(target,JSON.stringify(base,null,2)+'\n');
NODE
}

restore_authorized_project() {
  if [[ "$RESTORED" == "1" ]]; then return 0; fi
  if [[ -f "$BACKUP/.clasp.json" && -f "$BACKUP/appsscript.json" ]]; then
    (cd "$BACKUP" && clasp push --force) 2>&1 | tee -a "$EVIDENCE/owner-restore.txt" || true
    (cd "$BACKUP" && clasp list-deployments) 2>&1 | tee -a "$EVIDENCE/owner-deployments-after.txt" || true
  fi
  RESTORED=1
}
trap restore_authorized_project EXIT

run_function() {
  local function_name="$1"
  local params="${2:-[]}"
  local output_file="$3"
  (cd "$HARNESS" && clasp run-function "$function_name" --params "$params") 2>&1 | tee "$output_file"
  parse_json_output "$output_file" "${output_file%.txt}.json"
}

# Back up the already-authorized Owner Portal execution project.
printf '{"scriptId":"%s","rootDir":"."}\n' "$OWNER_SCRIPT_ID" > "$BACKUP/.clasp.json"
(cd "$BACKUP" && clasp pull) 2>&1 | tee "$EVIDENCE/owner-pull.txt"
tar -czf "$EVIDENCE/owner-project-before.tar.gz" -C "$BACKUP" .
sha256sum "$EVIDENCE/owner-project-before.tar.gz" | tee "$EVIDENCE/owner-project-before.sha256"
(cd "$BACKUP" && clasp list-deployments) 2>&1 | tee "$EVIDENCE/owner-deployments-before.txt"
grep -F "$OWNER_DEPLOYMENT_ID" "$EVIDENCE/owner-deployments-before.txt" >/dev/null

# Assemble only a temporary execution harness. The authorized project is restored afterward.
cp -a "$BACKUP/." "$HARNESS/"
find "$HARNESS" -maxdepth 1 -type f \
  \( -name '*BusinessOffice_*.js' -o -name '*BusinessOffice_*.gs' -o -name '*BusinessOffice_*.html' \) \
  -delete
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$HARNESS/"
cp "$REPO_ROOT"/apps-script/business-office/*.html "$HARNESS/"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$HARNESS/"
rm -f "$HARNESS/BusinessOffice_CabinAutoSeed.gs"
python3 - "$HARNESS/BusinessOffice_Web.gs" <<'PY'
from pathlib import Path
import re,sys
path=Path(sys.argv[1])
text=path.read_text()
text,count=re.subn(r'function\s+doGet\s*\(', 'function boEmailBackfillHarnessDoGet_(', text, count=1)
if count != 1:
    raise SystemExit('Business Office doGet rename failed.')
path.write_text(text)
PY
merge_harness_manifest "$HARNESS/appsscript.json"
(cd "$HARNESS" && clasp push --force) 2>&1 | tee "$EVIDENCE/owner-harness-push.txt"
(cd "$HARNESS" && clasp create-version "Gmail Communications backfill ${GITHUB_SHA:-manual}") 2>&1 | tee "$EVIDENCE/owner-harness-version.txt"

BOOTSTRAP_PARAMS="$(node - <<'NODE'
const config={
  ownerEmail:process.env.H38_BO_OWNER_EMAIL,
  H38_BUSINESS_OFFICE_SPREADSHEET_ID:process.env.H38_BO_SPREADSHEET_ID,
  H38_BUSINESS_OFFICE_DEFAULT_BUSINESS_ID:process.env.H38_BO_BUSINESS_ID,
  H38_BUSINESS_OFFICE_ROOT_FOLDER_ID:process.env.H38_BO_ROOT_FOLDER_ID,
  H38_BUSINESS_OFFICE_DOCUMENT_FOLDER_ID:process.env.H38_BO_DOCUMENT_FOLDER_ID,
  H38_BUSINESS_OFFICE_PDF_FOLDER_ID:process.env.H38_BO_PDF_FOLDER_ID,
  H38_BUSINESS_OFFICE_EXPORT_FOLDER_ID:process.env.H38_BO_EXPORT_FOLDER_ID,
  H38_BUSINESS_OFFICE_BACKUP_FOLDER_ID:process.env.H38_BO_BACKUP_FOLDER_ID,
  H38_BACKEND_SPREADSHEET_ID:process.env.H38_BACKEND_SPREADSHEET_ID
};
for(const [key,value] of Object.entries(config)) if(!value) throw new Error(`Missing ${key}`);
process.stdout.write(JSON.stringify([config]));
NODE
)"
run_function boBootstrapInstall "$BOOTSTRAP_PARAMS" "$EVIDENCE/bootstrap.txt"
node -e "const r=require('./artifacts/email-communications-backfill/bootstrap.json');if(!r.valid)throw new Error('Business Office bootstrap failed.')"

# Execute the real owner-authorized Gmail backfill against the live Office data.
run_function boEmailSyncDemoEvidence_ '[]' "$EVIDENCE/backfill.txt"
node - <<'NODE'
const r=require('./artifacts/email-communications-backfill/backfill.json');
if(r.status!=='PASS') throw new Error('Gmail demo evidence backfill did not pass.');
if(Number(r.captured)<10) throw new Error(`Expected at least 10 captured/reconciled Gmail messages, received ${r.captured}.`);
NODE

run_function boEmailSyncStatus_ '[]' "$EVIDENCE/status.txt"
node - <<'NODE'
const fs=require('fs');
const status=require('./artifacts/email-communications-backfill/status.json');
const backfill=require('./artifacts/email-communications-backfill/backfill.json');
const failures=[];
if(status.status!=='PASS') failures.push('status');
if(Number(status.emailMessages)<10) failures.push('emailMessages>=10');
if(Number(status.demoMessages)<10) failures.push('demoMessages>=10');
if(status.evidenceFilesRequired!==true) failures.push('evidenceFilesRequired');
const result={status:failures.length?'HOLD':'PASS',sourceCommit:process.env.GITHUB_SHA||'',backfill,status,failures,externalBusinessActionsOccurred:false};
fs.writeFileSync('artifacts/email-communications-backfill/verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
if(failures.length) throw new Error('Gmail Communications verification failed: '+failures.join(', '));
NODE

restore_authorized_project
trap - EXIT

BEFORE_LINE="$(grep -F "$OWNER_DEPLOYMENT_ID" "$EVIDENCE/owner-deployments-before.txt")"
AFTER_LINE="$(grep -F "$OWNER_DEPLOYMENT_ID" "$EVIDENCE/owner-deployments-after.txt")"
test "$BEFORE_LINE" = "$AFTER_LINE"
echo 'PASS — Gmail evidence is present in live Business Office Communications with linked evidence files.'
