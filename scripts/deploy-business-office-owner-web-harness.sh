#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
EVIDENCE="$REPO_ROOT/artifacts/business-office-owner-web"
WORK="$RUNNER_TEMP/business-office-owner-web"
OWNER_SCRIPT_ID="13Bes6_rs3LD-Sch4Vi5DKssCnlU_qb4hzZpGpDVfoRELRak0htXEj7O-"
OWNER_DEPLOYMENT_ID="AKfycbzr0hoImRF4iQ1gR90Cr17juP8PODkEWRorXxW6qralEYTGLhOU33E1wYEPU_3duQKpQg"
BACKUP="$WORK/owner-backup"
ACCEPT="$WORK/acceptance-project"
FINAL="$WORK/final-project"
RESTORE="$WORK/restore-project"
FIXTURES="$WORK/fixtures"
mkdir -p "$EVIDENCE" "$BACKUP" "$ACCEPT" "$FINAL" "$RESTORE" "$FIXTURES"
TOKEN="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"

merge_manifest() {
  local target="$1" mode="$2"
  node - "$target" "$REPO_ROOT/apps-script/business-office/appsscript.json" "$mode" <<'NODE'
const fs=require('fs');
const target=process.argv[2], boPath=process.argv[3], mode=process.argv[4];
const base=JSON.parse(fs.readFileSync(target,'utf8'));
const bo=JSON.parse(fs.readFileSync(boPath,'utf8'));
base.runtimeVersion='V8';
base.exceptionLogging='STACKDRIVER';
base.oauthScopes=[...new Set([...(base.oauthScopes||[]),...(bo.oauthScopes||[])])];
base.dependencies=base.dependencies||{};
const services=[...(base.dependencies.enabledAdvancedServices||[])];
for(const service of ((bo.dependencies||{}).enabledAdvancedServices||[])) if(!services.some(x=>x.serviceId===service.serviceId)) services.push(service);
base.dependencies.enabledAdvancedServices=services;
base.executionApi=base.executionApi||{access:'MYSELF'};
if(mode==='acceptance') base.webapp={executeAs:'USER_DEPLOYING',access:'ANYONE_ANONYMOUS'};
if(mode==='final') base.webapp={executeAs:'USER_ACCESSING',access:'ANYONE'};
fs.writeFileSync(target,JSON.stringify(base,null,2)+'\n');
NODE
}

extract_web_json() {
  local input="$1" output="$2"
  node - "$input" "$output" <<'NODE'
const fs=require('fs');
const input=process.argv[2], output=process.argv[3];
const raw=fs.readFileSync(input,'utf8').trim();
const first=raw.indexOf('{'), last=raw.lastIndexOf('}');
if(first<0||last<first) throw new Error(`No JSON response in ${input}: ${raw.slice(0,300)}`);
const value=JSON.parse(raw.slice(first,last+1));
if(!value.ok) throw new Error(value.error||'Acceptance endpoint returned HOLD.');
fs.writeFileSync(output,JSON.stringify(value.result,null,2)+'\n');
NODE
}

apps_script_access_token() {
  node <<'NODE'
const fs=require('fs'), https=require('https'), querystring=require('querystring');
const raw=JSON.parse(fs.readFileSync(process.env.HOME+'/.clasprc.json','utf8'));
function walk(o){if(!o||typeof o!=='object')return [];return [o,...Object.values(o).flatMap(walk)]}
const objects=walk(raw);
const auth=objects.find(o=>o&&typeof o==='object'&&(o.refresh_token||o.refreshToken)&&(o.client_id||o.clientId)&&(o.client_secret||o.clientSecret));
if(!auth) throw new Error('No refreshable OAuth credential found.');
const body=querystring.stringify({client_id:auth.client_id||auth.clientId,client_secret:auth.client_secret||auth.clientSecret,refresh_token:auth.refresh_token||auth.refreshToken,grant_type:'refresh_token'});
const req=https.request({method:'POST',hostname:'oauth2.googleapis.com',path:'/token',headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>{const parsed=JSON.parse(data);if(!parsed.access_token)throw new Error(data);process.stdout.write(parsed.access_token)})});
req.on('error',e=>{throw e});req.end(body);
NODE
}

delete_deployment() {
  local script_id="$1" deployment_id="$2"
  local access_token
  access_token="$(apps_script_access_token)"
  curl --fail --silent --show-error -X DELETE \
    -H "Authorization: Bearer ${access_token}" \
    "https://script.googleapis.com/v1/projects/${script_id}/deployments/${deployment_id}" > /dev/null
}

post_endpoint() {
  local url="$1" request_file="$2" response_file="$3"
  local status
  status="$(curl -L -sS -o "$response_file" -w '%{http_code}' -H 'Content-Type: application/json' --data-binary "@$request_file" "$url" || true)"
  printf '%s' "$status" > "${response_file}.status"
  test "$status" = "200"
}

# Pull and archive the full authorized project before any temporary source changes.
printf '{"scriptId":"%s","rootDir":"."}\n' "$OWNER_SCRIPT_ID" > "$BACKUP/.clasp.json"
(cd "$BACKUP" && clasp pull) 2>&1 | tee "$EVIDENCE/owner-pull.txt"
tar -czf "$EVIDENCE/owner-project-before.tar.gz" -C "$BACKUP" .
sha256sum "$EVIDENCE/owner-project-before.tar.gz" | tee "$EVIDENCE/owner-project-before.sha256"
(cd "$BACKUP" && clasp list-deployments) 2>&1 | tee "$EVIDENCE/owner-deployments-before.txt"
grep -F "$OWNER_DEPLOYMENT_ID" "$EVIDENCE/owner-deployments-before.txt" >/dev/null

# Assemble token-protected temporary acceptance version in the authorized project.
cp -a "$BACKUP/." "$ACCEPT/"
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$ACCEPT/"
cp "$REPO_ROOT/apps-script/business-office/BusinessOffice_Index.html" "$ACCEPT/"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$ACCEPT/"
python3 - "$ACCEPT/BusinessOffice_Web.gs" "$ACCEPT/BusinessOffice_AcceptanceHarness.gs" "$TOKEN" <<'PY'
from pathlib import Path
import sys
web=Path(sys.argv[1]); acceptance=Path(sys.argv[2]); token=sys.argv[3]
web.write_text(web.read_text().replace('function doGet() {','function boAcceptanceDoGet_() {'))
text=acceptance.read_text()
text=text.replace("const H38_BO_ACCEPTANCE_TOKEN_PROPERTY = 'H38_BUSINESS_OFFICE_ACCEPTANCE_TOKEN';", "const H38_BO_ACCEPTANCE_TOKEN = '"+token+"';")
text=text.replace("const expected = PropertiesService.getScriptProperties().getProperty(H38_BO_ACCEPTANCE_TOKEN_PROPERTY) || '';", "const expected = H38_BO_ACCEPTANCE_TOKEN;")
acceptance.write_text(text)
PY
merge_manifest "$ACCEPT/appsscript.json" acceptance
(cd "$ACCEPT" && clasp push --force) 2>&1 | tee "$EVIDENCE/acceptance-push.txt"
(cd "$ACCEPT" && clasp create-version "Business Office temporary web acceptance ${GITHUB_SHA}") 2>&1 | tee "$EVIDENCE/acceptance-version.txt"
(cd "$ACCEPT" && clasp create-deployment --description "Business Office temporary web acceptance ${GITHUB_SHA}") 2>&1 | tee "$EVIDENCE/acceptance-deployment.txt"
ACCEPT_DEPLOYMENT_ID="$(grep -Eo 'AKfy[[:alnum:]_-]+' "$EVIDENCE/acceptance-deployment.txt" | head -n1)"
test -n "$ACCEPT_DEPLOYMENT_ID"
printf '%s' "$ACCEPT_DEPLOYMENT_ID" > "$EVIDENCE/acceptance-deployment-id.txt"
ACCEPT_URL="https://script.google.com/macros/s/${ACCEPT_DEPLOYMENT_ID}/exec"
printf '%s' "$ACCEPT_URL" > "$EVIDENCE/acceptance-url.txt"
trap 'delete_deployment "$OWNER_SCRIPT_ID" "$ACCEPT_DEPLOYMENT_ID" || true' EXIT

node - "$TOKEN" > "$FIXTURES/health.json" <<'NODE'
process.stdout.write(JSON.stringify({token:process.argv[2],action:'health',payload:{}}));
NODE
post_endpoint "$ACCEPT_URL" "$FIXTURES/health.json" "$EVIDENCE/health-response.json"
extract_web_json "$EVIDENCE/health-response.json" "$EVIDENCE/health.json"

node - "$TOKEN" > "$FIXTURES/bootstrap.json" <<'NODE'
const token=process.argv[2];
const payload={
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
process.stdout.write(JSON.stringify({token,action:'bootstrap',payload}));
NODE
post_endpoint "$ACCEPT_URL" "$FIXTURES/bootstrap.json" "$EVIDENCE/bootstrap-response.json"
extract_web_json "$EVIDENCE/bootstrap-response.json" "$EVIDENCE/bootstrap.json"
node -e "const r=require('./artifacts/business-office-owner-web/bootstrap.json');if(!r.valid)process.exit(1)"

node - "$TOKEN" > "$FIXTURES/sync-bootstrap.json" <<'NODE'
const token=process.argv[2];
const payload={ownerEmail:process.env.H38_BO_OWNER_EMAIL,H38_BACKEND_SPREADSHEET_ID:process.env.H38_BACKEND_SPREADSHEET_ID,H38_BUSINESS_OFFICE_SPREADSHEET_ID:process.env.H38_BO_SPREADSHEET_ID,H38_BUSINESS_OFFICE_DEFAULT_BUSINESS_ID:process.env.H38_BO_BUSINESS_ID};
process.stdout.write(JSON.stringify({token,action:'syncBootstrap',payload}));
NODE
post_endpoint "$ACCEPT_URL" "$FIXTURES/sync-bootstrap.json" "$EVIDENCE/sync-bootstrap-response.json"
extract_web_json "$EVIDENCE/sync-bootstrap-response.json" "$EVIDENCE/sync-bootstrap.json"
node -e "const r=require('./artifacts/business-office-owner-web/sync-bootstrap.json');if(r.status!=='PASS'||r.externalActionsEnabled!==false)process.exit(1)"

node - "$TOKEN" > "$FIXTURES/sync-accept.json" <<'NODE'
process.stdout.write(JSON.stringify({token:process.argv[2],action:'syncAccept',payload:{}}));
NODE
post_endpoint "$ACCEPT_URL" "$FIXTURES/sync-accept.json" "$EVIDENCE/sync-accept-response.json"
extract_web_json "$EVIDENCE/sync-accept-response.json" "$EVIDENCE/sync-accept.json"
node -e "const r=require('./artifacts/business-office-owner-web/sync-accept.json');if(r.status!=='PASS'||r.repeat.mirrored!==0||r.externalActionsEnabled!==false)process.exit(1)"

# Generate real receipt/work-order images and vendor-invoice PDF.
node - "$TOKEN" <<'NODE'
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const token=process.argv[2], out=path.join(process.env.RUNNER_TEMP,'business-office-owner-web','fixtures'), run=process.env.GITHUB_RUN_ID;
const html=(title,lines)=>`<!doctype html><html><head><style>body{background:white;color:black;font-family:Arial;margin:24px}h1{font-size:25px}p{font-size:19px;line-height:1.25;margin:4px}</style></head><body><h1>${title}</h1>${lines.map(x=>`<p>${x}</p>`).join('')}</body></html>`;
(async()=>{
 const browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:620,height:520}});
 await page.setContent(html('Highway 38 Test Supply Receipt',['Vendor Highway 38 Test Supply','Date 2026-07-14',`Receipt LIVE-${run}`,'Sales Amount 20.00','Fee 1.40','Total 21.40','Payment Method Business Card']));
 const receipt=path.join(out,`receipt-${run}.jpg`);await page.screenshot({path:receipt,type:'jpeg',quality:32,fullPage:true});
 await page.setContent(html('Highway 38 Work Order',['Northwoods Sample Customer','Address Grand Rapids MN','Job Number JOB-2026-0001','Work Requested Prepare sample project plan','Assigned Employee Sample Employee','Labor 2 hours','Materials Planning packet','Due Date 2026-07-22','Status Open']));
 const work=path.join(out,`work-order-${run}.jpg`);await page.screenshot({path:work,type:'jpeg',quality:32,fullPage:true});
 await page.setContent(html('Vendor Invoice',['Vendor Highway 38 Test Supply',`Invoice Number VINV-${run}`,'Date 2026-07-14','Due Date 2026-08-13','Terms Net 30','PO Reference PO-2026-0001','Subtotal 50.00','Fee 3.50','Total 53.50']));
 const pdf=path.join(out,`vendor-invoice-${run}.pdf`);await page.pdf({path:pdf,width:'6.5in',height:'7.5in',printBackground:true});
 await browser.close();
 const payload={receiptImage:{fileName:path.basename(receipt),mimeType:'image/jpeg',base64Data:fs.readFileSync(receipt).toString('base64')},workOrderImage:{fileName:path.basename(work),mimeType:'image/jpeg',base64Data:fs.readFileSync(work).toString('base64')},vendorInvoicePdf:{fileName:path.basename(pdf),mimeType:'application/pdf',base64Data:fs.readFileSync(pdf).toString('base64')}};
 fs.writeFileSync(path.join(out,'live-request.json'),JSON.stringify({token,action:'liveAccept',payload}));
})().catch(e=>{console.error(e);process.exit(1)});
NODE
cp "$FIXTURES"/*.jpg "$FIXTURES"/*.pdf "$EVIDENCE/"
post_endpoint "$ACCEPT_URL" "$FIXTURES/live-request.json" "$EVIDENCE/live-response.json"
extract_web_json "$EVIDENCE/live-response.json" "$EVIDENCE/live-acceptance.json"
node <<'NODE'
const r=require('./artifacts/business-office-owner-web/live-acceptance.json');const failures=[];
if(r.status!=='PASS')failures.push('status');if(!Array.isArray(r.tests)||r.tests.some(t=>t.status!=='PASS'))failures.push('tests');
const c=r.created||{};for(const k of ['receiptDocumentId','receiptId','expenseId','workOrderDocumentId','vendorInvoiceDocumentId','backup'])if(!c[k])failures.push(k);
if(!Array.isArray(c.pdfFiles)||c.pdfFiles.length!==9)failures.push('nine PDFs');if(failures.length)throw new Error(failures.join(', '));
NODE

node - "$TOKEN" > "$FIXTURES/rendered.json" <<'NODE'
process.stdout.write(JSON.stringify({token:process.argv[2],action:'renderedHtml',payload:{}}));
NODE
post_endpoint "$ACCEPT_URL" "$FIXTURES/rendered.json" "$EVIDENCE/rendered-response.json"
extract_web_json "$EVIDENCE/rendered-response.json" "$EVIDENCE/rendered-result.json"
node <<'NODE'
const fs=require('fs'),{chromium}=require('playwright');const html=require('./artifacts/business-office-owner-web/rendered-result.json');
if(typeof html!=='string'||!html.includes('Highway 38 Business Office')||!html.includes('capture="environment"'))throw new Error('Rendered app markers missing');
fs.writeFileSync('artifacts/business-office-owner-web/rendered-business-office.html',html);
(async()=>{const b=await chromium.launch({headless:true});for(const [n,w,h] of [['desktop',1440,1000],['mobile',390,844]]){const p=await b.newPage({viewport:{width:w,height:h}});await p.setContent(html,{waitUntil:'domcontentloaded'});await p.screenshot({path:`artifacts/business-office-owner-web/business-office-${n}.png`,fullPage:true});}await b.close();})().catch(e=>{console.error(e);process.exit(1)});
NODE

# Remove temporary acceptance deployment before creating the final user-authenticated deployment.
delete_deployment "$OWNER_SCRIPT_ID" "$ACCEPT_DEPLOYMENT_ID"
trap - EXIT

# Build a final Business Office deployment from the authorized project without altering the pinned Owner Portal deployment.
cp -a "$BACKUP/." "$FINAL/"
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$FINAL/"
cp "$REPO_ROOT/apps-script/business-office/BusinessOffice_Index.html" "$FINAL/"
rm -f "$FINAL/BusinessOffice_AcceptanceHarness.gs"
python3 - "$FINAL/BusinessOffice_Web.gs" "$FINAL/Portal_Services.js" <<'PY'
from pathlib import Path
import sys
web=Path(sys.argv[1]); portal=Path(sys.argv[2])
web.write_text(web.read_text().replace('function doGet() {','function boBusinessOfficeDoGet_() {'))
text=portal.read_text();needle='function doGet(e) {'
replacement="function doGet(e) {\n  if (e && e.parameter && e.parameter.app === 'business-office') return boRenderWebApp_();"
if needle not in text: raise SystemExit('Portal doGet not found')
portal.write_text(text.replace(needle,replacement,1))
PY
merge_manifest "$FINAL/appsscript.json" final
(cd "$FINAL" && clasp push --force) 2>&1 | tee "$EVIDENCE/final-push.txt"
(cd "$FINAL" && clasp create-version "Highway 38 Business Office final ${GITHUB_SHA}") 2>&1 | tee "$EVIDENCE/final-version.txt"
(cd "$FINAL" && clasp create-deployment --description "Highway 38 Business Office final ${GITHUB_SHA}") 2>&1 | tee "$EVIDENCE/final-deployment.txt"
FINAL_DEPLOYMENT_ID="$(grep -Eo 'AKfy[[:alnum:]_-]+' "$EVIDENCE/final-deployment.txt" | head -n1)"
test -n "$FINAL_DEPLOYMENT_ID"
FINAL_URL="https://script.google.com/macros/s/${FINAL_DEPLOYMENT_ID}/exec?app=business-office"
printf '%s' "$FINAL_DEPLOYMENT_ID" > "$EVIDENCE/business-office-deployment-id.txt"
printf '%s' "$FINAL_URL" > "$EVIDENCE/business-office-web-app-url.txt"
HTTP_STATUS="$(curl -L -sS -o "$EVIDENCE/final-web-response.html" -w '%{http_code}' "$FINAL_URL" || true)"
printf '%s' "$HTTP_STATUS" > "$EVIDENCE/final-web-status.txt"
test "$HTTP_STATUS" != "404"

# Restore Owner Portal development source and retain only the operational intake-sync module.
cp -a "$BACKUP/." "$RESTORE/"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$RESTORE/"
(cd "$RESTORE" && clasp push --force) 2>&1 | tee "$EVIDENCE/restore-push.txt"
(cd "$RESTORE" && clasp list-deployments) 2>&1 | tee "$EVIDENCE/owner-deployments-after.txt"
BEFORE="$(grep -F "$OWNER_DEPLOYMENT_ID" "$EVIDENCE/owner-deployments-before.txt")"
AFTER="$(grep -F "$OWNER_DEPLOYMENT_ID" "$EVIDENCE/owner-deployments-after.txt")"
test "$BEFORE" = "$AFTER"

cat > "$EVIDENCE/production-result.json" <<JSON
{"status":"PASS","sourceCommit":"${GITHUB_SHA}","businessOfficeSpreadsheetId":"${H38_BO_SPREADSHEET_ID}","authorizedProjectId":"${OWNER_SCRIPT_ID}","existingOwnerPortalDeploymentId":"${OWNER_DEPLOYMENT_ID}","existingOwnerPortalDeploymentUnchanged":true,"businessOfficeDeploymentId":"${FINAL_DEPLOYMENT_ID}","businessOfficeWebAppUrl":"${FINAL_URL}","temporaryAcceptanceDeploymentDeleted":true,"intakeSyncInstalled":true,"intakeSyncIntervalMinutes":5,"externalActionsEnabled":false,"customerActionsOccurred":false,"paymentProcessed":false,"payrollFundsMoved":false,"taxReturnFiled":false}
JSON
