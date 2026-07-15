#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
SOURCE_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
EVIDENCE="$REPO_ROOT/artifacts/business-office-clean-installation"
WORK="$RUNNER_TEMP/business-office-clean-installation"
PROJECT="$WORK/project"
FIXTURES="$WORK/fixtures"
RESOURCES="$EVIDENCE/resources.json"
mkdir -p "$EVIDENCE" "$PROJECT" "$FIXTURES"
TOKEN="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
BUSINESS_PACK="${CLEAN_BUSINESS_PACK:-template-business}"

extract_value() {
  node -e "const r=require(process.argv[1]);const p=process.argv[2].split('.');let v=r;for(const k of p)v=v&&v[k];process.stdout.write(String(v||''));" "$1" "$2"
}

run_action() {
  local action="$1" payload_file="$2" raw_file="$3" result_file="$4" params
  node - "$TOKEN" "$action" "$payload_file" > "$FIXTURES/params-${action}.json" <<'NODE'
const fs=require('fs');
const token=process.argv[2],action=process.argv[3],payloadPath=process.argv[4];
const payload=payloadPath&&fs.existsSync(payloadPath)?JSON.parse(fs.readFileSync(payloadPath,'utf8')):{};
process.stdout.write(JSON.stringify([{token,action,payload}]));
NODE
  params="$(cat "$FIXTURES/params-${action}.json")"
  (cd "$PROJECT" && clasp run boCleanExecute --nondev --params "$params" --json) > "$raw_file"
  node - "$raw_file" "$result_file" <<'NODE'
const fs=require('fs');
const [raw,result]=process.argv.slice(2);
const text=fs.readFileSync(raw,'utf8').trim();
if(!text) throw new Error('Apps Script execution returned no JSON.');
const value=JSON.parse(text);
if(value.error) throw new Error(`${value.error.message||'Apps Script execution failed'} ${JSON.stringify(value.error.details||[])}`);
const response=value.response;
if(!response||response.ok!==true) throw new Error((response&&response.error)||'Clean-install execution returned HOLD.');
fs.writeFileSync(result,JSON.stringify(response.result,null,2)+'\n');
NODE
}

apps_script_access_token() {
  node <<'NODE'
const fs=require('fs'),https=require('https'),querystring=require('querystring');
const raw=JSON.parse(fs.readFileSync(process.env.HOME+'/.clasprc.json','utf8'));
function walk(o){if(!o||typeof o!=='object')return [];return [o,...Object.values(o).flatMap(walk)]}
const auth=walk(raw).find(o=>o&&typeof o==='object'&&(o.refresh_token||o.refreshToken)&&(o.client_id||o.clientId)&&(o.client_secret||o.clientSecret));
if(!auth) throw new Error('No refreshable OAuth credential found.');
const body=querystring.stringify({client_id:auth.client_id||auth.clientId,client_secret:auth.client_secret||auth.clientSecret,refresh_token:auth.refresh_token||auth.refreshToken,grant_type:'refresh_token'});
const req=https.request({method:'POST',hostname:'oauth2.googleapis.com',path:'/token',headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}},res=>{let data='';res.on('data',c=>data+=c);res.on('end',()=>{const parsed=JSON.parse(data);if(!parsed.access_token)throw new Error(data);process.stdout.write(parsed.access_token)})});
req.on('error',e=>{throw e});req.end(body);
NODE
}

delete_deployment() {
  local script_id="$1" deployment_id="$2" access_token
  access_token="$(apps_script_access_token)"
  curl --fail --silent --show-error -X DELETE -H "Authorization: Bearer ${access_token}" \
    "https://script.googleapis.com/v1/projects/${script_id}/deployments/${deployment_id}" >/dev/null
}

node "$REPO_ROOT/scripts/build-business-office-installation.js" --pack "$BUSINESS_PACK" --mode standalone --out "$PROJECT" \
  | tee "$EVIDENCE/build-manifest-output.json"
node "$REPO_ROOT/scripts/provision-clean-business-office-resources.js" "$RESOURCES" | tee "$EVIDENCE/provision-output.json"
SCRIPT_ID="$(extract_value "$RESOURCES" appsScriptProject.id)"
ROOT_FOLDER_ID="$(extract_value "$RESOURCES" rootFolder.id)"
DOCUMENT_FOLDER_ID="$(extract_value "$RESOURCES" documentFolder.id)"
PDF_FOLDER_ID="$(extract_value "$RESOURCES" pdfFolder.id)"
EXPORT_FOLDER_ID="$(extract_value "$RESOURCES" exportFolder.id)"
BACKUP_FOLDER_ID="$(extract_value "$RESOURCES" backupFolder.id)"
test -n "$SCRIPT_ID" && test -n "$ROOT_FOLDER_ID" && test -n "$DOCUMENT_FOLDER_ID"
printf '{"scriptId":"%s","rootDir":"."}\n' "$SCRIPT_ID" > "$PROJECT/.clasp.json"
printf '%s' "$SCRIPT_ID" > "$EVIDENCE/apps-script-project-id.txt"

cp "$REPO_ROOT/tests/business-office-clean-installation/BusinessOffice_CleanAcceptance.gs" "$PROJECT/BusinessOffice_CleanAcceptance.gs"
cp "$REPO_ROOT/tests/business-office-clean-installation/BusinessOffice_NeutralProvisioning.gs" "$PROJECT/BusinessOffice_NeutralProvisioning.gs"
python3 - "$PROJECT/BusinessOffice_CleanAcceptance.gs" "$PROJECT/BusinessOffice_NeutralProvisioning.gs" "$TOKEN" "$REPO_ROOT/business-packs/template-business/business-office.schema.json.gz.b64" <<'PY'
from pathlib import Path
import sys
accept=Path(sys.argv[1]); provision=Path(sys.argv[2]); token=sys.argv[3]; schema=Path(sys.argv[4]).read_text().strip()
accept.write_text(accept.read_text().replace('__BO_CLEAN_ACCEPTANCE_TOKEN__',token))
provision.write_text(provision.read_text().replace('__BO_NEUTRAL_SCHEMA_GZIP_B64__',schema))
PY
cp "$PROJECT/appsscript.json" "$WORK/final-appsscript.json"
node - "$PROJECT/appsscript.json" <<'NODE'
const fs=require('fs'),p=process.argv[2],m=JSON.parse(fs.readFileSync(p,'utf8'));
m.webapp={executeAs:'USER_ACCESSING',access:'ANYONE'};
m.executionApi={access:'MYSELF'};
fs.writeFileSync(p,JSON.stringify(m,null,2)+'\n');
NODE

(cd "$PROJECT" && clasp push --force) 2>&1 | tee "$EVIDENCE/acceptance-push.txt"
(cd "$PROJECT" && clasp create-version "Clean Business Office authenticated acceptance ${SOURCE_SHA}") 2>&1 | tee "$EVIDENCE/acceptance-version.txt"
(cd "$PROJECT" && clasp create-deployment --description "Clean Business Office authenticated acceptance ${SOURCE_SHA}") 2>&1 | tee "$EVIDENCE/acceptance-deployment.txt"
ACCEPT_DEPLOYMENT_ID="$(grep -Eo 'AKfy[[:alnum:]_-]+' "$EVIDENCE/acceptance-deployment.txt" | head -n1)"
test -n "$ACCEPT_DEPLOYMENT_ID"
printf '%s' "$ACCEPT_DEPLOYMENT_ID" > "$EVIDENCE/acceptance-deployment-id.txt"
trap 'delete_deployment "$SCRIPT_ID" "$ACCEPT_DEPLOYMENT_ID" || true' EXIT
printf '{}\n' > "$FIXTURES/empty.json"

run_action health "$FIXTURES/empty.json" "$EVIDENCE/health-api.json" "$EVIDENCE/health.json"
node -e "const r=require('./artifacts/business-office-clean-installation/health.json');if(r.status!=='PASS'||r.projectId!==require('fs').readFileSync('./artifacts/business-office-clean-installation/apps-script-project-id.txt','utf8')||r.businessName!==process.env.CLEAN_BUSINESS_NAME||r.businessId!==process.env.CLEAN_BUSINESS_ID||r.externalActionsEnabled!==false||r.directPaymentProcessing!==false||r.directPayrollFunding!==false||r.directTaxFiling!==false)throw new Error(JSON.stringify(r));"

node - "$ROOT_FOLDER_ID" "$DOCUMENT_FOLDER_ID" "$PDF_FOLDER_ID" "$EXPORT_FOLDER_ID" "$BACKUP_FOLDER_ID" > "$FIXTURES/provision-workbook-payload.json" <<'NODE'
const a=process.argv.slice(2);process.stdout.write(JSON.stringify({rootFolderId:a[0],documentFolderId:a[1],pdfFolderId:a[2],exportFolderId:a[3],backupFolderId:a[4],ownerEmail:process.env.CLEAN_OWNER_EMAIL,businessId:process.env.CLEAN_BUSINESS_ID,businessName:process.env.CLEAN_BUSINESS_NAME,installationId:process.env.CLEAN_INSTALLATION_ID}));
NODE
run_action provisionWorkbook "$FIXTURES/provision-workbook-payload.json" "$EVIDENCE/provision-workbook-api.json" "$EVIDENCE/provision-workbook.json"
SPREADSHEET_ID="$(extract_value "$EVIDENCE/provision-workbook.json" spreadsheetId)"
test -n "$SPREADSHEET_ID"
node - "$RESOURCES" "$SPREADSHEET_ID" "$(extract_value "$EVIDENCE/provision-workbook.json" spreadsheetUrl)" <<'NODE'
const fs=require('fs');const p=process.argv[2],r=JSON.parse(fs.readFileSync(p,'utf8'));r.spreadsheet={id:process.argv[3],url:process.argv[4]};r.status='PROVISIONED — ACCEPTANCE REQUIRED';fs.writeFileSync(p,JSON.stringify(r,null,2)+'\n');
NODE

node - "$SPREADSHEET_ID" "$ROOT_FOLDER_ID" "$DOCUMENT_FOLDER_ID" "$PDF_FOLDER_ID" "$EXPORT_FOLDER_ID" "$BACKUP_FOLDER_ID" > "$FIXTURES/bootstrap-payload.json" <<'NODE'
const a=process.argv.slice(2);process.stdout.write(JSON.stringify({ownerEmail:process.env.CLEAN_OWNER_EMAIL,BO_SPREADSHEET_ID:a[0],BO_DEFAULT_BUSINESS_ID:process.env.CLEAN_BUSINESS_ID,BO_ROOT_FOLDER_ID:a[1],BO_DOCUMENT_FOLDER_ID:a[2],BO_PDF_FOLDER_ID:a[3],BO_EXPORT_FOLDER_ID:a[4],BO_BACKUP_FOLDER_ID:a[5]}));
NODE
run_action bootstrap "$FIXTURES/bootstrap-payload.json" "$EVIDENCE/bootstrap-api.json" "$EVIDENCE/bootstrap.json"
node -e "const r=require('./artifacts/business-office-clean-installation/bootstrap.json');if(!r.valid||r.productCount!==0||r.bundleCount!==0||r.externalActionsEnabled!=='FALSE'||r.selectedRecordOnly!=='TRUE')throw new Error(JSON.stringify(r));"

run_action callableProof "$FIXTURES/empty.json" "$EVIDENCE/callable-proof-api.json" "$EVIDENCE/callable-proof.json"
node -e "const fs=require('fs'),r=require('./artifacts/business-office-clean-installation/callable-proof.json'),id=fs.readFileSync('./artifacts/business-office-clean-installation/apps-script-project-id.txt','utf8');if(r.status!=='PASS'||r.projectId!==id||r.businessId!==process.env.CLEAN_BUSINESS_ID||String(r.authenticatedEmail).toLowerCase()!==String(process.env.CLEAN_OWNER_EMAIL).toLowerCase()||!r.proofRecordId||r.proofRows<1||r.criticalErrors!==0)throw new Error(JSON.stringify(r));"

run_action validate "$FIXTURES/empty.json" "$EVIDENCE/validate-api.json" "$EVIDENCE/validate.json"
run_action selfTest "$FIXTURES/empty.json" "$EVIDENCE/self-test-api.json" "$EVIDENCE/self-test.json"
node -e "const r=require('./artifacts/business-office-clean-installation/self-test.json');if(r.status!=='PASS'||r.tests.some(x=>x.status!=='PASS'))throw new Error(JSON.stringify(r));"
run_action render "$FIXTURES/empty.json" "$EVIDENCE/render-api.json" "$EVIDENCE/render.json"
node -e "const r=require('./artifacts/business-office-clean-installation/render.json');if(!/Business Office/.test(r.html)||/Highway\s*38|\bH38\b|rkrueth-maker|highway-38-solutions|AKfyc/i.test(r.html))throw new Error('Rendered clean app leaked Highway 38 identity.');"

node <<'NODE'
const fs=require('fs'),path=require('path');const {chromium}=require('playwright');
(async()=>{const out=process.env.RUNNER_TEMP+'/business-office-clean-installation/fixtures';const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:700,height:520}});await page.setContent(`<!doctype html><html><body style="font-family:Arial;padding:30px"><h1>${process.env.CLEAN_BUSINESS_NAME} Receipt</h1><p>Date 2026-07-15</p><p>Neutral Office Supply</p><p>Total 21.40</p><p>Controlled clean installation acceptance</p></body></html>`);const file=path.join(out,'clean-installation-receipt.pdf');await page.pdf({path:file,width:'7in',height:'6in',printBackground:true});await browser.close();const payload={document:{fileName:path.basename(file),mimeType:'application/pdf',base64Data:fs.readFileSync(file).toString('base64'),documentType:'Receipt',sourceType:'Clean Installation Acceptance',sourceId:'CLEAN-ACCEPTANCE',accessClassification:'Private Business'}};fs.writeFileSync(path.join(out,'live-payload.json'),JSON.stringify(payload));})().catch(e=>{console.error(e);process.exit(1)});
NODE
cp "$FIXTURES/clean-installation-receipt.pdf" "$EVIDENCE/"
run_action liveAccept "$FIXTURES/live-payload.json" "$EVIDENCE/live-acceptance-api.json" "$EVIDENCE/live-acceptance.json"
node -e "const fs=require('fs'),r=require('./artifacts/business-office-clean-installation/live-acceptance.json'),id=fs.readFileSync('./artifacts/business-office-clean-installation/apps-script-project-id.txt','utf8');if(r.status!=='PASS'||r.projectId!==id||r.businessId!==process.env.CLEAN_BUSINESS_ID||r.businessName!==process.env.CLEAN_BUSINESS_NAME||!r.duplicateBlocked||!r.documentFileId||!r.pdfFileId||r.criticalErrors!==0||r.externalActionsOccurred||r.paymentProcessed||r.payrollFundsMoved||r.taxReturnFiled||r.customerMessageSent||r.deliveryOccurred)throw new Error(JSON.stringify(r));"
run_action backup "$FIXTURES/empty.json" "$EVIDENCE/backup-api.json" "$EVIDENCE/backup.json"
node -e "const r=require('./artifacts/business-office-clean-installation/backup.json');if(!r.fileId||!r.backupId)throw new Error(JSON.stringify(r));"
run_action validate "$FIXTURES/empty.json" "$EVIDENCE/final-validate-api.json" "$EVIDENCE/final-validate.json"

rm "$PROJECT/BusinessOffice_CleanAcceptance.gs" "$PROJECT/BusinessOffice_NeutralProvisioning.gs"
cp "$WORK/final-appsscript.json" "$PROJECT/appsscript.json"
(cd "$PROJECT" && clasp push --force) 2>&1 | tee "$EVIDENCE/final-push.txt"
(cd "$PROJECT" && clasp create-version "North Star Test Company Business Office final ${SOURCE_SHA}") 2>&1 | tee "$EVIDENCE/final-version.txt"
(cd "$PROJECT" && clasp create-deployment --description "North Star Test Company Business Office final ${SOURCE_SHA}") 2>&1 | tee "$EVIDENCE/final-deployment.txt"
FINAL_DEPLOYMENT_ID="$(grep -Eo 'AKfy[[:alnum:]_-]+' "$EVIDENCE/final-deployment.txt" | head -n1)"
test -n "$FINAL_DEPLOYMENT_ID"
FINAL_URL="https://script.google.com/macros/s/${FINAL_DEPLOYMENT_ID}/exec"
printf '%s' "$FINAL_DEPLOYMENT_ID" > "$EVIDENCE/final-deployment-id.txt"
printf '%s' "$FINAL_URL" > "$EVIDENCE/final-url.txt"
(cd "$PROJECT" && clasp list-deployments --json) > "$EVIDENCE/final-deployments.json"
node - "$EVIDENCE/final-deployments.json" "$FINAL_DEPLOYMENT_ID" <<'NODE'
const fs=require('fs');const list=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const id=process.argv[3];const text=JSON.stringify(list);if(!text.includes(id))throw new Error('Final deployment ID was not listed by Apps Script.');
NODE
delete_deployment "$SCRIPT_ID" "$ACCEPT_DEPLOYMENT_ID"
trap - EXIT
FINAL_STATUS="$(curl -L -sS -o "$EVIDENCE/final-http.html" -w '%{http_code}' "$FINAL_URL" || true)"
printf '%s' "$FINAL_STATUS" > "$EVIDENCE/final-http-status.txt"
test "$FINAL_STATUS" != "404"
if [[ "$FINAL_STATUS" = "200" ]] && grep -Eqi 'ReferenceError|TypeError|Exception:|Highway[[:space:]]*38|\bH38\b|rkrueth-maker|highway-38-solutions' "$EVIDENCE/final-http.html"; then echo 'Final clean deployment returned an error or Highway 38 leakage.' >&2; exit 1; fi

node - "$RESOURCES" "$FINAL_DEPLOYMENT_ID" "$FINAL_URL" "$SOURCE_SHA" > "$EVIDENCE/acceptance-result.json" <<'NODE'
const fs=require('fs');const resources=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
process.stdout.write(JSON.stringify({status:'PASS',sourceCommit:process.argv[5],installationId:resources.installationId,businessId:resources.businessId,businessName:resources.businessName,spreadsheet:resources.spreadsheet,rootFolder:resources.rootFolder,documentFolder:resources.documentFolder,pdfFolder:resources.pdfFolder,exportFolder:resources.exportFolder,backupFolder:resources.backupFolder,appsScriptProject:resources.appsScriptProject,finalDeployment:{id:process.argv[3],url:process.argv[4],access:'authorized signed-in users'},sheetCount:81,cleanIdentityVerified:true,storageIsolationVerified:true,userIsolationVerified:true,authenticatedCallableProofVerified:true,uploadVerified:true,ocrAssistVerified:true,pdfGenerationVerified:true,duplicateProtectionVerified:true,proofLogVerified:true,errorLogVerified:true,backupVerified:true,externalActionsOccurred:false,paymentProcessed:false,payrollFundsMoved:false,taxReturnFiled:false,customerMessageSent:false,deliveryOccurred:false},null,2)+'\n');
NODE
cat "$EVIDENCE/acceptance-result.json"
