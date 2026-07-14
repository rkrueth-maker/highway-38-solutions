#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
EVIDENCE="$REPO_ROOT/artifacts/business-office-production-v2"
BO_PROJECT="$RUNNER_TEMP/h38-business-office"
SYNC_PROJECT="$RUNNER_TEMP/h38-business-office-sync"
FIXTURES="$RUNNER_TEMP/business-office-fixtures"
mkdir -p "$EVIDENCE" "$FIXTURES"

create_project() {
  local project_dir="$1"
  local title="$2"
  local source_dir="$3"
  local prefix="$4"
  rm -rf "$project_dir"
  mkdir -p "$project_dir"
  (
    cd "$project_dir"
    clasp create-script --type standalone --title "$title" --rootDir . 2>&1 | tee "$EVIDENCE/${prefix}-create.txt"
    test -s .clasp.json
    cp "$source_dir"/*.gs .
    if compgen -G "$source_dir/*.html" >/dev/null; then cp "$source_dir"/*.html .; fi
    cp "$source_dir/appsscript.json" .
    local script_id
    script_id="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.clasp.json','utf8')).scriptId)")"
    test -n "$script_id"
    printf '%s' "$script_id" > "$EVIDENCE/${prefix}-script-id.txt"
    clasp push --force 2>&1 | tee "$EVIDENCE/${prefix}-push.txt"
    clasp create-version "$title ${GITHUB_SHA}" 2>&1 | tee "$EVIDENCE/${prefix}-version.txt"
    clasp create-deployment --description "$title ${GITHUB_SHA}" 2>&1 | tee "$EVIDENCE/${prefix}-deployment.txt"
    clasp list-deployments 2>&1 | tee "$EVIDENCE/${prefix}-deployments.txt"
    local deployment_id
    deployment_id="$(cat "$EVIDENCE/${prefix}-deployment.txt" "$EVIDENCE/${prefix}-deployments.txt" | grep -Eo 'AKfy[[:alnum:]_-]+' | head -n 1)"
    test -n "$deployment_id"
    printf '%s' "$deployment_id" > "$EVIDENCE/${prefix}-deployment-id.txt"
  )
}

create_project "$BO_PROJECT" "Highway 38 Business Office" "$REPO_ROOT/apps-script/business-office" "business-office"
printf 'https://script.google.com/macros/s/%s/exec' "$(cat "$EVIDENCE/business-office-deployment-id.txt")" > "$EVIDENCE/business-office-web-app-url.txt"

BO_BOOTSTRAP_PARAMS="$(node - <<'NODE'
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
(cd "$BO_PROJECT" && clasp run-function boBootstrapInstall --params "$BO_BOOTSTRAP_PARAMS") 2>&1 | tee "$EVIDENCE/business-office-bootstrap.txt"

create_project "$SYNC_PROJECT" "Highway 38 Business Office Intake Sync" "$REPO_ROOT/apps-script/business-office-sync" "intake-sync"
SYNC_BOOTSTRAP_PARAMS="$(node - <<'NODE'
const config={
  ownerEmail:process.env.H38_BO_OWNER_EMAIL,
  H38_BACKEND_SPREADSHEET_ID:process.env.H38_BACKEND_SPREADSHEET_ID,
  H38_BUSINESS_OFFICE_SPREADSHEET_ID:process.env.H38_BO_SPREADSHEET_ID,
  H38_BUSINESS_OFFICE_DEFAULT_BUSINESS_ID:process.env.H38_BO_BUSINESS_ID
};
process.stdout.write(JSON.stringify([config]));
NODE
)"
(cd "$SYNC_PROJECT" && clasp run-function h38BusinessOfficeBootstrapSync --params "$SYNC_BOOTSTRAP_PARAMS") 2>&1 | tee "$EVIDENCE/intake-sync-bootstrap.txt"
(cd "$SYNC_PROJECT" && clasp run-function h38BusinessOfficeSyncAcceptance --nondev) 2>&1 | tee "$EVIDENCE/intake-sync-acceptance.txt"

node <<'NODE'
const fs=require('fs');
const path=require('path');
const {chromium}=require('playwright');
const out=path.join(process.env.RUNNER_TEMP,'business-office-fixtures');
const run=process.env.GITHUB_RUN_ID;
const shell=(title,lines)=>`<!doctype html><html><head><meta charset="utf-8"><style>body{background:#fff;color:#000;font-family:Arial,sans-serif;margin:45px}h1{font-size:38px;margin:0 0 28px}p{font-size:28px;line-height:1.55;margin:8px 0;border-bottom:1px solid #ddd;padding-bottom:5px}</style></head><body><h1>${title}</h1>${lines.map(x=>`<p>${x}</p>`).join('')}</body></html>`;
(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1000,height:900},deviceScaleFactor:1});
  await page.setContent(shell('Highway 38 Test Supply Receipt',[
    'Vendor Highway 38 Test Supply','Date 2026-07-14',`Receipt LIVE-${run}`,
    'Sales Amount 20.00','Fee 1.40','Total 21.40','Payment Method Business Card'
  ]));
  await page.screenshot({path:path.join(out,`receipt-${run}.png`),fullPage:true});
  await page.setContent(shell('Highway 38 Work Order',[
    'Northwoods Sample Customer','Address Grand Rapids MN','Job Number JOB-2026-0001',
    'Work Requested Prepare sample project plan','Assigned Employee Sample Employee',
    'Labor 2 hours','Materials Planning packet','Due Date 2026-07-22','Status Open'
  ]));
  await page.screenshot({path:path.join(out,`work-order-${run}.png`),fullPage:true});
  await page.setContent(shell('Vendor Invoice',[
    'Vendor Highway 38 Test Supply',`Invoice Number VINV-${run}`,'Date 2026-07-14',
    'Due Date 2026-08-13','Terms Net 30','PO Reference PO-2026-0001',
    'Subtotal 50.00','Fee 3.50','Total 53.50'
  ]));
  await page.pdf({path:path.join(out,`vendor-invoice-${run}.pdf`),format:'Letter',printBackground:true});
  await browser.close();
  const payload={
    receiptImage:{fileName:`receipt-${run}.png`,mimeType:'image/png',base64Data:fs.readFileSync(path.join(out,`receipt-${run}.png`)).toString('base64')},
    workOrderImage:{fileName:`work-order-${run}.png`,mimeType:'image/png',base64Data:fs.readFileSync(path.join(out,`work-order-${run}.png`)).toString('base64')},
    vendorInvoicePdf:{fileName:`vendor-invoice-${run}.pdf`,mimeType:'application/pdf',base64Data:fs.readFileSync(path.join(out,`vendor-invoice-${run}.pdf`)).toString('base64')}
  };
  fs.writeFileSync(path.join(out,'live-acceptance-params.json'),JSON.stringify([payload]));
})().catch(error=>{console.error(error);process.exit(1)});
NODE
cp "$FIXTURES"/* "$EVIDENCE/"

LIVE_PARAMS="$(cat "$FIXTURES/live-acceptance-params.json")"
(cd "$BO_PROJECT" && clasp run-function boRunLiveAcceptance --params "$LIVE_PARAMS" --nondev) 2>&1 | tee "$EVIDENCE/business-office-live-acceptance.txt"
node <<'NODE'
const fs=require('fs');
const raw=fs.readFileSync('artifacts/business-office-production-v2/business-office-live-acceptance.txt','utf8');
const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
if(start<0||end<start) throw new Error('No structured live acceptance result was returned.');
const result=JSON.parse(raw.slice(start,end+1));
fs.writeFileSync('artifacts/business-office-production-v2/business-office-live-acceptance.json',JSON.stringify(result,null,2)+'\n');
const failures=[];
if(result.status!=='PASS') failures.push('overall status');
if(!Array.isArray(result.tests)||!result.tests.length||result.tests.some(test=>test.status!=='PASS')) failures.push('test results');
const created=result.created||{};
for(const key of ['receiptDocumentId','receiptId','expenseId','workOrderDocumentId','vendorInvoiceDocumentId','backup']) if(!created[key]) failures.push(key);
if(!Array.isArray(created.pdfFiles)||created.pdfFiles.length!==9) failures.push('nine generated PDFs');
if(failures.length) throw new Error('LIVE ACCEPTANCE HOLD: '+failures.join(', '));
NODE

WEB_APP_URL="$(cat "$EVIDENCE/business-office-web-app-url.txt")"
STATUS="$(curl -L -sS -o "$EVIDENCE/web-app-response.html" -w '%{http_code}' "$WEB_APP_URL" || true)"
printf '%s' "$STATUS" > "$EVIDENCE/web-app-http-status.txt"
test "$STATUS" != "404"
(cd "$BO_PROJECT" && clasp run-function boGetRenderedWebAppHtml --nondev) 2>&1 | tee "$EVIDENCE/rendered-web-app-output.txt"
node <<'NODE'
const fs=require('fs');
const {chromium}=require('playwright');
const raw=fs.readFileSync('artifacts/business-office-production-v2/rendered-web-app-output.txt','utf8').trim();
const start=raw.indexOf('"'),end=raw.lastIndexOf('"');
if(start<0||end<=start) throw new Error('No rendered HTML string returned.');
const html=JSON.parse(raw.slice(start,end+1));
if(!html.includes('Highway 38 Business Office')||!html.includes('capture="environment"')||!html.includes('@media (max-width:800px)')) throw new Error('Rendered web app is missing required UI markers.');
fs.writeFileSync('artifacts/business-office-production-v2/deployed-business-office.html',html);
(async()=>{
  const browser=await chromium.launch({headless:true});
  for(const [name,width,height] of [['business-office-desktop',1440,1000],['business-office-mobile',390,844]]){
    const page=await browser.newPage({viewport:{width,height}});
    await page.setContent(html,{waitUntil:'domcontentloaded'});
    await page.screenshot({path:`artifacts/business-office-production-v2/${name}.png`,fullPage:true});
  }
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
NODE

cat > "$EVIDENCE/production-deployment.json" <<JSON
{
  "status": "PASS",
  "sourceCommit": "${GITHUB_SHA}",
  "businessOfficeScriptId": "$(cat "$EVIDENCE/business-office-script-id.txt")",
  "businessOfficeDeploymentId": "$(cat "$EVIDENCE/business-office-deployment-id.txt")",
  "businessOfficeWebAppUrl": "$(cat "$EVIDENCE/business-office-web-app-url.txt")",
  "intakeSyncScriptId": "$(cat "$EVIDENCE/intake-sync-script-id.txt")",
  "intakeSyncDeploymentId": "$(cat "$EVIDENCE/intake-sync-deployment-id.txt")",
  "spreadsheetId": "${H38_BO_SPREADSHEET_ID}",
  "separateProjects": true,
  "externalActionsEnabled": false,
  "customerActionsOccurred": false,
  "paymentProcessed": false,
  "payrollFundsMoved": false,
  "taxReturnFiled": false
}
JSON
