#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
EVIDENCE="$REPO_ROOT/artifacts/cabin-demo08"
AUTHORIZED_SCRIPT_ID="13Bes6_rs3LD-Sch4Vi5DKssCnlU_qb4hzZpGpDVfoRELRak0htXEj7O-"
WORK="${RUNNER_TEMP:-/tmp}/h38-cabin-demo08-authorized"
BACKUP="$WORK/owner-project-backup"
HARNESS="$WORK/cabin-generator-harness"
CLASP_BIN="${H38_CLASP_DIR:-}/node_modules/.bin/clasp"
RESTORED=0

if [[ ! -x "$CLASP_BIN" ]]; then
  CLASP_BIN="$(command -v clasp || true)"
fi
if [[ -z "$CLASP_BIN" || ! -x "$CLASP_BIN" ]]; then
  echo 'HOLD — clasp executable is unavailable.' >&2
  exit 78
fi

rm -rf "$WORK"
mkdir -p "$EVIDENCE" "$BACKUP" "$HARNESS"

parse_json_output() {
  local input_file="$1"
  local output_file="$2"
  node - "$input_file" "$output_file" <<'NODE'
const fs=require('fs');
const input=process.argv[2],output=process.argv[3],raw=fs.readFileSync(input,'utf8');
const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
if(start<0||end<start)throw new Error(`No JSON object in ${input}`);
const value=JSON.parse(raw.slice(start,end+1));
fs.writeFileSync(output,JSON.stringify(value,null,2)+'\n');
NODE
}

restore_authorized_project() {
  if [[ "$RESTORED" == "1" ]]; then return 0; fi
  if [[ -f "$BACKUP/.clasp.json" && -f "$BACKUP/appsscript.json" ]]; then
    echo 'Restoring authorized Owner Portal development source.' | tee -a "$EVIDENCE/restore.txt"
    (cd "$BACKUP" && "$CLASP_BIN" push --force) 2>&1 | tee -a "$EVIDENCE/restore.txt" || true
  fi
  RESTORED=1
}
trap restore_authorized_project EXIT

merge_harness_manifest() {
  node - "$1" "$REPO_ROOT/apps-script/business-office/appsscript.json" <<'NODE'
const fs=require('fs');
const target=process.argv[2],boPath=process.argv[3];
const base=JSON.parse(fs.readFileSync(target,'utf8'));
const bo=JSON.parse(fs.readFileSync(boPath,'utf8'));
base.runtimeVersion='V8';
base.exceptionLogging=base.exceptionLogging||'STACKDRIVER';
base.oauthScopes=[...new Set([...(base.oauthScopes||[]),...(bo.oauthScopes||[])])];
base.dependencies=base.dependencies||{};
const services=[...(base.dependencies.enabledAdvancedServices||[])];
for(const service of (bo.dependencies&&bo.dependencies.enabledAdvancedServices||[])){
  if(!services.some(existing=>existing.serviceId===service.serviceId))services.push(service);
}
base.dependencies.enabledAdvancedServices=services;
base.executionApi=base.executionApi||bo.executionApi||{access:'ANYONE'};
fs.writeFileSync(target,JSON.stringify(base,null,2)+'\n');
NODE
}

run_function() {
  local function_name="$1"
  local params="$2"
  local output_file="$3"
  (cd "$HARNESS" && "$CLASP_BIN" run "$function_name" --params "$params") 2>&1 | tee "$output_file"
}

# Back up the already-authorized development project. Its live deployment is not changed.
printf '{"scriptId":"%s","rootDir":"."}\n' "$AUTHORIZED_SCRIPT_ID" > "$BACKUP/.clasp.json"
(cd "$BACKUP" && "$CLASP_BIN" pull) 2>&1 | tee "$EVIDENCE/authorized-project-pull.txt"
tar -czf "$EVIDENCE/authorized-project-before.tar.gz" -C "$BACKUP" .
sha256sum "$EVIDENCE/authorized-project-before.tar.gz" | tee "$EVIDENCE/authorized-project-before.sha256"

# Build a temporary execution harness from the accepted Business Office source.
cp -a "$BACKUP/." "$HARNESS/"
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$HARNESS/"
cp "$REPO_ROOT/apps-script/business-office/BusinessOffice_Index.html" "$HARNESS/"
rm -f "$HARNESS/BusinessOffice_CabinAutoSeed.gs"
python3 - "$HARNESS/BusinessOffice_Web.gs" <<'PY'
from pathlib import Path
import sys
path=Path(sys.argv[1])
text=path.read_text()
text=text.replace('function doGet() {','function boCabinHarnessDoGet_() {')
path.write_text(text)
PY
merge_harness_manifest "$HARNESS/appsscript.json"
(cd "$HARNESS" && "$CLASP_BIN" push --force) 2>&1 | tee "$EVIDENCE/authorized-harness-push.txt"
(cd "$HARNESS" && "$CLASP_BIN" create-version "Cabin Demo 08 all-table generation ${GITHUB_SHA:-manual}") 2>&1 | tee "$EVIDENCE/authorized-harness-version.txt"

CONFIG_PARAMS="$(node - <<'NODE'
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
for(const [key,value] of Object.entries(config))if(!value)throw new Error(`Missing ${key}`);
process.stdout.write(JSON.stringify([config]));
NODE
)"
run_function boBootstrapInstall "$CONFIG_PARAMS" "$EVIDENCE/bootstrap.txt"
parse_json_output "$EVIDENCE/bootstrap.txt" "$EVIDENCE/bootstrap.json"
node -e "const r=require('./artifacts/cabin-demo08/bootstrap.json');if(!r.valid)throw new Error('Business Office bootstrap did not return valid=true.')"

run_function boPrepareCabinDemo08Generation '[]' "$EVIDENCE/prepare.txt"
parse_json_output "$EVIDENCE/prepare.txt" "$EVIDENCE/prepare.json"
node -e "const r=require('./artifacts/cabin-demo08/prepare.json');if(r.status!=='PASS'||r.packageCount!==21)throw new Error('Cabin preparation failed.')"

for start in 0 3 6 9 12 15 18; do
  output="$EVIDENCE/batch-${start}.txt"
  run_function boGeneratePreparedCabinBatch "[$start,3]" "$output"
  parse_json_output "$output" "$EVIDENCE/batch-${start}.json"
  node - "$EVIDENCE/batch-${start}.json" <<'NODE'
const result=require(process.argv[2]);
if(result.status!=='PASS'||result.processed<1||result.processed>3||result.externalActionsPerformed!==false)throw new Error('Cabin package batch failed: '+JSON.stringify(result));
NODE
done

run_function boFinalizeCabinDemo08Generation '[]' "$EVIDENCE/finalize.txt"
parse_json_output "$EVIDENCE/finalize.txt" "$EVIDENCE/finalize.json"
node - <<'NODE'
const fs=require('fs');
const result=require('./artifacts/cabin-demo08/finalize.json');
const expected={customers:1,contacts:1,addresses:1,requests:1,quotes:22,quoteLines:42,approvals:22,jobs:1,workOrders:21,vendors:21,purchaseOrders:21,poLines:21,documents:25,proof:21,activity:21,backup:1};
const failures=[];
if(result.status!=='PASS')failures.push('status');
if(result.subquoteCount!==21)failures.push('21 subquotes');
if(result.pdfCount!==21||result.totalPdfCount!==22)failures.push('22 PDFs');
if(result.externalActionsPerformed!==false)failures.push('external actions');
const coverage=result.coverage||{};
if(coverage.status!=='PASS')failures.push('coverage status');
for(const [key,value] of Object.entries(expected))if(!coverage.counts||coverage.counts[key]!==value)failures.push(`${key} ${coverage.counts&&coverage.counts[key]}/${value}`);
if(coverage.masterPdfCount!==1||coverage.packagePdfCount!==21)failures.push('Drive PDF coverage');
const report={status:failures.length?'HOLD':'PASS',sourceCommit:process.env.GITHUB_SHA||'',marker:coverage.marker||'H38-DEMO8-CABIN',expected,counts:coverage.counts||{},masterPdfCount:coverage.masterPdfCount||0,packagePdfCount:coverage.packagePdfCount||0,totalPdfCount:coverage.totalPdfCount||0,externalActionsPerformed:false,failures};
fs.writeFileSync('artifacts/cabin-demo08/verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(failures.length)throw new Error('Cabin Demo 08 all-table generation incomplete: '+failures.join(', '));
NODE

restore_authorized_project
trap - EXIT
echo 'PASS — Cabin Demo 08 is present in every relevant Business Office table with one master PDF and 21 package PDFs.'
