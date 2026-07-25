#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
EVIDENCE="$REPO_ROOT/artifacts/business-office-authorized"
OWNER_SCRIPT_ID="13Bes6_rs3LD-Sch4Vi5DKssCnIU_qb4hzZpGpDVfoRELRAk0HtXEJ7o"
OWNER_DEPLOYMENT_ID="AKfycbzr0hoImRF4iQ1gR90Cr17juP8PODkEWRorXxW6qralEYTGLhOU33E1wYEPU_3duQKpQg"
BO_APP_SCRIPT_ID="1_-Ula8N34xZ92ypPPtBC7wG6iukFWtMojCPG_MPY8TalMLRCDgzSrf8S"
BO_APP_DEPLOYMENT_ID="AKfycbz-CFhhc4RNpJJpsfG1SGgzANxW-_JaiZrl2zjwiUhLF_HjgORo6Z41aXhUXKhy2wZuVg"
WORK="$RUNNER_TEMP/business-office-authorized"
OWNER_BACKUP="$WORK/owner-backup"
OWNER_HARNESS="$WORK/owner-harness"
OWNER_RESTORE="$WORK/owner-restore"
APP_BACKUP="$WORK/app-backup"
APP_PROJECT="$WORK/app-project"
FIXTURES="$WORK/fixtures"
mkdir -p "$EVIDENCE" "$OWNER_BACKUP" "$OWNER_HARNESS" "$OWNER_RESTORE" "$APP_BACKUP" "$APP_PROJECT" "$FIXTURES"

parse_json_output() {
  local input_file="$1"
  local output_file="$2"
  node - "$input_file" "$output_file" <<'NODE'
const fs=require('fs');
const input=process.argv[2], output=process.argv[3];
const raw=fs.readFileSync(input,'utf8');
const start=raw.indexOf('{'), end=raw.lastIndexOf('}');
if(start<0||end<start) throw new Error(`No JSON object in ${input}`);
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

run_harness_function() {
  local function_name="$1"
  local params="${2:-[]}"
  local output_file="$3"
  (cd "$OWNER_HARNESS" && clasp run-function "$function_name" --params "$params") 2>&1 | tee "$output_file"
  parse_json_output "$output_file" "${output_file%.txt}.json"
}

# 1. Back up the authorized Owner Portal development project and deployment inventory.
printf '{"scriptId":"%s","rootDir":"."}\n' "$OWNER_SCRIPT_ID" > "$OWNER_BACKUP/.clasp.json"
(cd "$OWNER_BACKUP" && clasp pull) 2>&1 | tee "$EVIDENCE/owner-pull.txt"
tar -czf "$EVIDENCE/owner-project-before.tar.gz" -C "$OWNER_BACKUP" .
sha256sum "$EVIDENCE/owner-project-before.tar.gz" | tee "$EVIDENCE/owner-project-before.sha256"
(cd "$OWNER_BACKUP" && clasp list-deployments) 2>&1 | tee "$EVIDENCE/owner-deployments-before.txt"
grep -F "$OWNER_DEPLOYMENT_ID" "$EVIDENCE/owner-deployments-before.txt" >/dev/null

# 2. Assemble a temporary acceptance harness while preserving every existing source file.
cp -a "$OWNER_BACKUP/." "$OWNER_HARNESS/"
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$OWNER_HARNESS/"
cp "$REPO_ROOT/apps-script/business-office/BusinessOffice_Index.html" "$OWNER_HARNESS/"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$OWNER_HARNESS/"
# The controlled harness executes generation explicitly; do not schedule the production auto-seed trigger here.
rm -f "$OWNER_HARNESS/BusinessOffice_CabinAutoSeed.gs"
# The existing portal owns doGet. Rename only the harness copy; all other web API functions remain testable.
python3 - "$OWNER_HARNESS/BusinessOffice_Web.gs" <<'PY'
from pathlib import Path
path=Path(__import__('sys').argv[1])
text=path.read_text()
text=text.replace('function doGet() {','function boHarnessDoGet_() {')
path.write_text(text)
PY
merge_harness_manifest "$OWNER_HARNESS/appsscript.json"
(cd "$OWNER_HARNESS" && clasp push --force) 2>&1 | tee "$EVIDENCE/owner-harness-push.txt"
(cd "$OWNER_HARNESS" && clasp create-version "Business Office authorized acceptance ${GITHUB_SHA}") 2>&1 | tee "$EVIDENCE/owner-harness-version.txt"

# 3. Configure Business Office and the additive sync in the already-authorized runtime.
BO_PARAMS="$(node - <<'NODE'
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
process.stdout.write(JSON.stringify([config]));
NODE
)"
(cd "$OWNER_HARNESS" && clasp run-function boBootstrapInstall --params "$BO_PARAMS") 2>&1 | tee "$EVIDENCE/business-office-bootstrap.txt"
parse_json_output "$EVIDENCE/business-office-bootstrap.txt" "$EVIDENCE/business-office-bootstrap.json"
node -e "const r=require('./artifacts/business-office-authorized/business-office-bootstrap.json'); if(!r.valid) process.exit(1)"

SYNC_PARAMS="$(node - <<'NODE'
const config={
  ownerEmail:process.env.H38_BO_OWNER_EMAIL,
  H38_BACKEND_SPREADSHEET_ID:process.env.H38_BACKEND_SPREADSHEET_ID,
  H38_BUSINESS_OFFICE_SPREADSHEET_ID:process.env.H38_BO_SPREADSHEET_ID,
  H38_BUSINESS_OFFICE_DEFAULT_BUSINESS_ID:process.env.H38_BO_BUSINESS_ID
};
process.stdout.write(JSON.stringify([config]));
NODE
)"
(cd "$OWNER_HARNESS" && clasp run-function h38BusinessOfficeBootstrapSync --params "$SYNC_PARAMS") 2>&1 | tee "$EVIDENCE/intake-sync-bootstrap.txt"
parse_json_output "$EVIDENCE/intake-sync-bootstrap.txt" "$EVIDENCE/intake-sync-bootstrap.json"
node -e "const r=require('./artifacts/business-office-authorized/intake-sync-bootstrap.json'); if(r.status!=='PASS'||r.externalActionsEnabled!==false) process.exit(1)"
(cd "$OWNER_HARNESS" && clasp run-function h38BusinessOfficeSyncAcceptance) 2>&1 | tee "$EVIDENCE/intake-sync-acceptance.txt"
parse_json_output "$EVIDENCE/intake-sync-acceptance.txt" "$EVIDENCE/intake-sync-acceptance.json"
node -e "const r=require('./artifacts/business-office-authorized/intake-sync-acceptance.json'); if(r.status!=='PASS'||r.repeat.mirrored!==0||r.externalActionsEnabled!==false) process.exit(1)"

# 4. Generate compact but legible real image and PDF fixtures.
node <<'NODE'
const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const out=path.join(process.env.RUNNER_TEMP,'business-office-authorized','fixtures');
const run=process.env.GITHUB_RUN_ID;
const pageHtml=(title,lines)=>`<!doctype html><html><head><meta charset="utf-8"><style>body{background:#fff;color:#000;font-family:Arial,sans-serif;margin:24px}h1{font-size:26px;margin:0 0 14px}p{font-size:19px;line-height:1.25;margin:4px 0}</style></head><body><h1>${title}</h1>${lines.map(x=>`<p>${x}</p>`).join('')}</body></html>`;
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:620,height:520},deviceScaleFactor:1});
  await page.setContent(pageHtml('Highway 38 Test Supply Receipt',['Vendor Highway 38 Test Supply','Date 2026-07-14',`Receipt LIVE-${run}`,'Sales Amount 20.00','Fee 1.40','Total 21.40','Payment Method Business Card']));
  await page.screenshot({path:path.join(out,`receipt-${run}.jpg`),type:'jpeg',quality:30,fullPage:true});
  await page.setContent(pageHtml('Highway 38 Work Order',['Northwoods Sample Customer','Address Grand Rapids MN','Job Number JOB-2026-0001','Work Requested Prepare sample project plan','Assigned Employee Sample Employee','Labor 2 hours','Materials Planning packet','Due Date 2026-07-22','Status Open']));
  await page.screenshot({path:path.join(out,`work-order-${run}.jpg`),type:'jpeg',quality:30,fullPage:true});
  await page.setContent(pageHtml('Vendor Invoice',['Vendor Highway 38 Test Supply',`Invoice Number VINV-${run}`,'Date 2026-07-14','Due Date 2026-08-13','Terms Net 30','PO Reference PO-2026-0001','Subtotal 50.00','Fee 3.50','Total 53.50']));
  await page.pdf({path:path.join(out,`vendor-invoice-${run}.pdf`),width:'6.5in',height:'7.5in',printBackground:true});
  await browser.close();
  const payload={
    receiptImage:{fileName:`receipt-${run}.jpg`,mimeType:'image/jpeg',base64Data:fs.readFileSync(path.join(out,`receipt-${run}.jpg`)).toString('base64')},
    workOrderImage:{fileName:`work-order-${run}.jpg`,mimeType:'image/jpeg',base64Data:fs.readFileSync(path.join(out,`work-order-${run}.jpg`)).toString('base64')},
    vendorInvoicePdf:{fileName:`vendor-invoice-${run}.pdf`,mimeType:'application/pdf',base64Data:fs.readFileSync(path.join(out,`vendor-invoice-${run}.pdf`)).toString('base64')}
  };
  const params=JSON.stringify([payload]);
  if(Buffer.byteLength(params)>110000) throw new Error(`Live fixture argument remains too large: ${Buffer.byteLength(params)}`);
  fs.writeFileSync(path.join(out,'live-params.json'),params);
  fs.writeFileSync(path.join(out,'live-params-size.txt'),String(Buffer.byteLength(params)));
})().catch(error=>{console.error(error);process.exit(1)});
NODE
cp "$FIXTURES"/* "$EVIDENCE/"

# 5. Execute the required live receipt, camera, OCR, PDF, accounting, payroll, tax, role, proof, error, and rollback suite.
LIVE_PARAMS="$(cat "$FIXTURES/live-params.json")"
(cd "$OWNER_HARNESS" && clasp run-function boRunLiveAcceptance --params "$LIVE_PARAMS") 2>&1 | tee "$EVIDENCE/live-acceptance.txt"
parse_json_output "$EVIDENCE/live-acceptance.txt" "$EVIDENCE/live-acceptance.json"
node <<'NODE'
const r=require('./artifacts/business-office-authorized/live-acceptance.json');
const failures=[];
if(r.status!=='PASS') failures.push('overall status');
if(!Array.isArray(r.tests)||!r.tests.length||r.tests.some(t=>t.status!=='PASS')) failures.push('test results');
const c=r.created||{};
for(const key of ['receiptDocumentId','receiptId','expenseId','workOrderDocumentId','vendorInvoiceDocumentId','backup']) if(!c[key]) failures.push(key);
if(!Array.isArray(c.pdfFiles)||c.pdfFiles.length!==9) failures.push('nine generated PDFs');
if(failures.length) throw new Error('LIVE ACCEPTANCE HOLD: '+failures.join(', '));
NODE

# 6. Generate Cabin Demo 08 through the same authenticated Business Office runtime.
run_harness_function boPrepareCabinDemo08Generation '[]' "$EVIDENCE/cabin-demo08-prepare.txt"
node -e "const r=require('./artifacts/business-office-authorized/cabin-demo08-prepare.json');if(r.status!=='PASS'||r.packageCount!==21)throw new Error('Cabin Demo preparation failed.')"
for start in 0 3 6 9 12 15 18; do
  run_harness_function boGeneratePreparedCabinBatch "[$start,3]" "$EVIDENCE/cabin-demo08-batch-${start}.txt"
  node - "$EVIDENCE/cabin-demo08-batch-${start}.json" <<'NODE'
const r=require(process.argv[2]);
if(r.status!=='PASS'||r.processed<1||r.processed>3||r.externalActionsPerformed!==false)throw new Error('Cabin Demo batch failed: '+JSON.stringify(r));
NODE
done
run_harness_function boFinalizeCabinDemo08Generation '[]' "$EVIDENCE/cabin-demo08-finalize.txt"
node <<'NODE'
const fs=require('fs');
const result=require('./artifacts/business-office-authorized/cabin-demo08-finalize.json');
const expected={customers:1,contacts:1,addresses:1,requests:1,quotes:22,quoteLines:42,approvals:22,jobs:1,workOrders:21,vendors:21,purchaseOrders:21,poLines:21,documents:25,proof:21,activity:21,backup:1};
const failures=[];
if(result.status!=='PASS'||result.externalActionsPerformed!==false)failures.push('result status');
if(result.subquoteCount!==21||result.pdfCount!==21||result.totalPdfCount!==22)failures.push('quote/PDF totals');
const coverage=result.coverage||{};
if(coverage.status!=='PASS')failures.push('coverage status');
for(const [key,value] of Object.entries(expected))if(!coverage.counts||coverage.counts[key]!==value)failures.push(`${key}:${coverage.counts&&coverage.counts[key]}/${value}`);
if(coverage.masterPdfCount!==1||coverage.packagePdfCount!==21)failures.push('Drive PDFs');
const report={status:failures.length?'HOLD':'PASS',sourceCommit:process.env.GITHUB_SHA,marker:'H38-DEMO8-CABIN',expected,counts:coverage.counts||{},masterPdfCount:coverage.masterPdfCount||0,packagePdfCount:coverage.packagePdfCount||0,totalPdfCount:coverage.totalPdfCount||0,externalActionsPerformed:false,failures};
fs.writeFileSync('artifacts/business-office-authorized/cabin-demo08-verification.json',JSON.stringify(report,null,2)+'\n');
if(failures.length)throw new Error('CABIN DEMO 08 HOLD: '+failures.join(', '));
console.log(JSON.stringify(report,null,2));
NODE

(cd "$OWNER_HARNESS" && clasp run-function boGetRenderedWebAppHtml) 2>&1 | tee "$EVIDENCE/rendered-web-app-output.txt"
node <<'NODE'
const fs=require('fs');
const {chromium}=require('playwright');
const raw=fs.readFileSync('artifacts/business-office-authorized/rendered-web-app-output.txt','utf8').trim();
const start=raw.indexOf('"'),end=raw.lastIndexOf('"');
if(start<0||end<=start) throw new Error('No rendered Business Office HTML returned.');
const html=JSON.parse(raw.slice(start,end+1));
if(!html.includes('Highway 38 Business Office')||!html.includes('capture="environment"')||!html.includes('@media (max-width:800px)')) throw new Error('Required responsive UI markers are missing.');
fs.writeFileSync('artifacts/business-office-authorized/rendered-business-office.html',html);
(async()=>{
  const browser=await chromium.launch({headless:true});
  for(const [name,width,height] of [['business-office-desktop',1440,1000],['business-office-mobile',390,844]]){
    const page=await browser.newPage({viewport:{width,height}});
    await page.setContent(html,{waitUntil:'domcontentloaded'});
    await page.screenshot({path:`artifacts/business-office-authorized/${name}.png`,fullPage:true});
  }
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
NODE

# 7. Update the separate Business Office Web App project and existing deployment in place.
printf '{"scriptId":"%s","rootDir":"."}\n' "$BO_APP_SCRIPT_ID" > "$APP_BACKUP/.clasp.json"
(cd "$APP_BACKUP" && clasp pull) 2>&1 | tee "$EVIDENCE/business-office-app-pull.txt"
tar -czf "$EVIDENCE/business-office-app-before.tar.gz" -C "$APP_BACKUP" .
sha256sum "$EVIDENCE/business-office-app-before.tar.gz" | tee "$EVIDENCE/business-office-app-before.sha256"
printf '{"scriptId":"%s","rootDir":"."}\n' "$BO_APP_SCRIPT_ID" > "$APP_PROJECT/.clasp.json"
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$APP_PROJECT/"
cp "$REPO_ROOT/apps-script/business-office/BusinessOffice_Index.html" "$APP_PROJECT/"
cp "$REPO_ROOT/apps-script/business-office/appsscript.json" "$APP_PROJECT/"
(cd "$APP_PROJECT" && clasp list-deployments) 2>&1 | tee "$EVIDENCE/business-office-app-deployments-before.txt"
grep -F "$BO_APP_DEPLOYMENT_ID" "$EVIDENCE/business-office-app-deployments-before.txt" >/dev/null
(cd "$APP_PROJECT" && clasp push --force) 2>&1 | tee "$EVIDENCE/business-office-app-push.txt"
(cd "$APP_PROJECT" && clasp create-version "Highway 38 Business Office production ${GITHUB_SHA}") 2>&1 | tee "$EVIDENCE/business-office-app-version.txt"
APP_VERSION="$(awk '/Created version/ {print $3; exit}' "$EVIDENCE/business-office-app-version.txt")"
test -n "$APP_VERSION"
(cd "$APP_PROJECT" && clasp update-deployment "$BO_APP_DEPLOYMENT_ID" --versionNumber "$APP_VERSION" --description "Highway 38 Business Office production ${GITHUB_SHA}") 2>&1 | tee "$EVIDENCE/business-office-app-update-deployment.txt"
(cd "$APP_PROJECT" && clasp list-deployments) 2>&1 | tee "$EVIDENCE/business-office-app-deployments-after.txt"
grep -F "$BO_APP_DEPLOYMENT_ID @$APP_VERSION" "$EVIDENCE/business-office-app-deployments-after.txt" >/dev/null
BO_WEB_APP_URL="https://script.google.com/macros/s/${BO_APP_DEPLOYMENT_ID}/exec"
printf '%s' "$BO_WEB_APP_URL" > "$EVIDENCE/business-office-web-app-url.txt"
HTTP_STATUS="$(curl -L -sS -o "$EVIDENCE/business-office-web-response.html" -w '%{http_code}' "$BO_WEB_APP_URL" || true)"
printf '%s' "$HTTP_STATUS" > "$EVIDENCE/business-office-web-http-status.txt"
test "$HTTP_STATUS" != "404"

# 8. Restore the Owner Portal development source and retain only the additive sync runtime.
cp -a "$OWNER_BACKUP/." "$OWNER_RESTORE/"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$OWNER_RESTORE/"
(cd "$OWNER_RESTORE" && clasp push --force) 2>&1 | tee "$EVIDENCE/owner-restore-push.txt"
(cd "$OWNER_RESTORE" && clasp list-deployments) 2>&1 | tee "$EVIDENCE/owner-deployments-after.txt"
grep -F "$OWNER_DEPLOYMENT_ID" "$EVIDENCE/owner-deployments-after.txt" >/dev/null
BEFORE_LINE="$(grep -F "$OWNER_DEPLOYMENT_ID" "$EVIDENCE/owner-deployments-before.txt")"
AFTER_LINE="$(grep -F "$OWNER_DEPLOYMENT_ID" "$EVIDENCE/owner-deployments-after.txt")"
test "$BEFORE_LINE" = "$AFTER_LINE"

cat > "$EVIDENCE/authorized-production-result.json" <<JSON
{
  "status": "PASS",
  "sourceCommit": "${GITHUB_SHA}",
  "businessOfficeSpreadsheetId": "${H38_BO_SPREADSHEET_ID}",
  "businessOfficeScriptId": "${BO_APP_SCRIPT_ID}",
  "businessOfficeDeploymentId": "${BO_APP_DEPLOYMENT_ID}",
  "businessOfficeWebAppUrl": "${BO_WEB_APP_URL}",
  "ownerPortalHarnessScriptId": "${OWNER_SCRIPT_ID}",
  "ownerPortalDeploymentId": "${OWNER_DEPLOYMENT_ID}",
  "ownerPortalDeploymentUnchanged": true,
  "intakeSyncInstalled": true,
  "intakeSyncIntervalMinutes": 5,
  "liveAcceptance": "PASS",
  "cabinDemo08AllTableCoverage": "PASS",
  "cabinDemo08MasterQuotes": 1,
  "cabinDemo08Subquotes": 21,
  "cabinDemo08TotalPdfs": 22,
  "externalActionsEnabled": false,
  "customerActionsOccurred": false,
  "paymentProcessed": false,
  "payrollFundsMoved": false,
  "taxReturnFiled": false
}
JSON
