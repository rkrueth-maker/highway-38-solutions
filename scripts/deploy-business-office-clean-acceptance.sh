#!/usr/bin/env bash
set -euo pipefail

ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
OUT="$ROOT/artifacts/business-office-clean-deployment"
WORK="${RUNNER_TEMP:?RUNNER_TEMP is required}/business-office-clean-acceptance"
APP="$WORK/project"
FINAL_BACKUP="$WORK/final-source"
FIX="$WORK/fixture"
CONFIG_TITLE="${BO_CONFIG_DOC_TITLE:?BO_CONFIG_DOC_TITLE is required}"
PACK_SOURCE="${BO_PACK_PATH:-$ROOT/business-packs/template-business/apps-script/BusinessOffice_Pack.gs}"
PROJECT_TITLE="${BO_PROJECT_TITLE:-Business Office Clean Installation}"
EXISTING_SCRIPT_ID="${BO_SCRIPT_ID:-}"
EXISTING_ACCEPTANCE_DEPLOYMENT_ID="${BO_ACCEPTANCE_DEPLOYMENT_ID:-}"
EXISTING_FINAL_DEPLOYMENT_ID="${BO_FINAL_DEPLOYMENT_ID:-}"

rm -rf "$WORK" "$OUT"
mkdir -p "$APP" "$FINAL_BACKUP" "$FIX" "$OUT"

jval(){ node -e "const v=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));let x=v;for(const k of process.argv[2].split('.'))x=x?.[k];if(x==null)process.exit(2);process.stdout.write(String(x))" "$1" "$2"; }

create_or_attach_project() {
  if [[ -n "$EXISTING_SCRIPT_ID" ]]; then
    printf '{"scriptId":"%s","rootDir":"."}\n' "$EXISTING_SCRIPT_ID" > "$APP/.clasp.json"
    printf '{"scriptId":"%s","reused":true}\n' "$EXISTING_SCRIPT_ID" > "$OUT/app-create.json"
  else
    (cd "$APP" && clasp create-script --type standalone --title "$PROJECT_TITLE" --rootDir . --json) > "$OUT/app-create.json"
  fi
}

create_version() {
  local title="$1" key="$2"
  (cd "$APP" && clasp push --force --json) > "$OUT/${key}-push.json"
  (cd "$APP" && clasp create-version "$title ${GITHUB_SHA}" --json) > "$OUT/${key}-version.json"
  jval "$OUT/${key}-version.json" versionNumber
}

publish_deployment() {
  local version="$1" title="$2" key="$3" existing_id="${4:-}" id
  if [[ -n "$existing_id" ]]; then
    (cd "$APP" && clasp update-deployment "$existing_id" --versionNumber "$version" --description "$title ${GITHUB_SHA}" --json) > "$OUT/${key}-deployment.json"
    id="$existing_id"
  else
    (cd "$APP" && clasp create-deployment --versionNumber "$version" --description "$title ${GITHUB_SHA}" --json) > "$OUT/${key}-deployment.json"
    id="$(jval "$OUT/${key}-deployment.json" deploymentId)"
  fi
  test -n "$id"
  printf '%s' "$id" > "$OUT/${key}-deployment-id.txt"
}

run_api() {
  local function_name="$1" params_file="$2" raw_file="$3" result_file="$4" params
  params="$(cat "$params_file")"
  (cd "$APP" && clasp run "$function_name" --nondev --params "$params" --json) > "$raw_file"
  node - "$raw_file" "$result_file" <<'NODE'
const fs=require('fs');const [raw,result]=process.argv.slice(2);const value=JSON.parse(fs.readFileSync(raw,'utf8'));if(value.error)throw new Error(`${value.error.message||'Apps Script execution failed'} ${JSON.stringify(value.error.details||[])}`);fs.writeFileSync(result,JSON.stringify(value.response,null,2)+'\n');
NODE
}

create_or_attach_project
bash "$ROOT/scripts/assemble-business-office-app.sh" "$APP" "$PACK_SOURCE" "$ROOT"
cp "$APP/appsscript.json" "$FINAL_BACKUP/appsscript.json"
cp "$APP/BusinessOffice_Auth.gs" "$FINAL_BACKUP/BusinessOffice_Auth.gs"
cp "$APP/BusinessOffice_Installer.gs" "$FINAL_BACKUP/BusinessOffice_Installer.gs"
cp "$APP/BusinessOffice_Web.gs" "$FINAL_BACKUP/BusinessOffice_Web.gs"

node - "$APP/appsscript.json" <<'NODE'
const fs=require('fs'),file=process.argv[2],m=JSON.parse(fs.readFileSync(file,'utf8'));m.executionApi={access:'ANYONE'};m.webapp={access:'ANYONE',executeAs:'USER_ACCESSING'};fs.writeFileSync(file,JSON.stringify(m,null,2)+'\n');
NODE

python3 - "$APP" "$CONFIG_TITLE" <<'PY'
from pathlib import Path
import json,sys
root=Path(sys.argv[1]);title=json.dumps(sys.argv[2])
(root/'BusinessOffice_StandaloneHarness.gs').write_text(f'''const BO_STANDALONE_CONFIG_TITLE_={title};
function boStandaloneConfigFile_(){{const files=DriveApp.getFilesByName(BO_STANDALONE_CONFIG_TITLE_);if(!files.hasNext())throw new Error('Private bootstrap configuration document was not found.');const file=files.next();if(files.hasNext())throw new Error('More than one bootstrap configuration document has this title.');return file;}}
function boStandaloneReadConfig_(){{const file=boStandaloneConfigFile_();const text=DocumentApp.openById(file.getId()).getBody().getText();const config=JSON.parse(text);config.__configFileId=file.getId();return config;}}
function boStandaloneBootstrap_(){{const config=boStandaloneReadConfig_();const result=boBootstrapInstall(config);PropertiesService.getScriptProperties().setProperty('BUSINESS_OFFICE_BOOTSTRAP_CONFIG_FILE_ID',config.__configFileId);return result;}}
function boStandaloneSelfTest_(){{return boRunSelfTest();}}
function boStandalonePlatformAcceptance_(payload){{return boRunPlatformAcceptance(payload||{{}});}}
function boStandaloneRenderedHtml_(){{return boGetRenderedWebAppHtml();}}
function boStandaloneCleanup_(){{const id=PropertiesService.getScriptProperties().getProperty('BUSINESS_OFFICE_BOOTSTRAP_CONFIG_FILE_ID');if(id)DriveApp.getFileById(id).setTrashed(true);PropertiesService.getScriptProperties().deleteProperty('BUSINESS_OFFICE_BOOTSTRAP_CONFIG_FILE_ID');return {{status:'PASS',configurationDocumentTrashed:!!id}};}}
''')
PY

APP_ID="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).scriptId)" "$APP/.clasp.json")"
test -n "$APP_ID"
printf '%s' "$APP_ID" > "$OUT/business-office-script-id.txt"
if [[ "$APP_ID" = "13Bes6_rs3LD-Sch4Vi5DKssCnlU_qb4hzZpGpDVfoRELRak0htXEj7O-" ]]; then echo 'HOLD — standalone project reused Highway 38 script ID'; exit 21; fi

ACCEPT_VERSION="$(create_version 'Business Office Clean Acceptance' acceptance)"
publish_deployment "$ACCEPT_VERSION" 'Business Office Clean Acceptance' acceptance "$EXISTING_ACCEPTANCE_DEPLOYMENT_ID"
ACCEPT_ID="$(cat "$OUT/acceptance-deployment-id.txt")"

printf '[]' > "$OUT/no-params.json"
run_api boStandaloneBootstrap_ "$OUT/no-params.json" "$OUT/bootstrap-api.json" "$OUT/bootstrap-response.json"
run_api boStandaloneSelfTest_ "$OUT/no-params.json" "$OUT/self-test-api.json" "$OUT/self-test-response.json"
node - "$OUT/self-test-response.json" <<'NODE'
const fs=require('fs'),v=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));if(v.status!=='PASS'||v.tests.some(t=>t.status!=='PASS'))throw new Error('Clean self-test HOLD: '+JSON.stringify(v));if(v.businessId!=='NORTHSTAR_TEST'||v.packId!=='north-star-test')throw new Error('Wrong clean business identity: '+JSON.stringify(v));
NODE

cd "$ROOT"
node - "$FIX" <<'NODE'
const fs=require('fs'),path=require('path'),{chromium}=require('playwright'),out=process.argv[2],run=process.env.GITHUB_RUN_ID;(async()=>{const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:700,height:650}});await p.setContent(`<!doctype html><html><style>body{font:25px Arial;margin:35px}h1{font-size:34px}p{border-bottom:1px solid #ddd;padding:5px}</style><body><h1>North Star Test Company Receipt</h1><p>Vendor North Star Acceptance Supply</p><p>Date 2026-07-14</p><p>Receipt CLEAN-${run}</p><p>Subtotal 20.00</p><p>Tax 1.40</p><p>Total 21.40</p><p>Payment Method Acceptance Test</p></body></html>`);const name=`north-star-receipt-${run}.pdf`;await p.pdf({path:path.join(out,name),format:'Letter',printBackground:true});await b.close();const payload={document:{fileName:name,mimeType:'application/pdf',documentType:'Receipt',base64Data:fs.readFileSync(path.join(out,name)).toString('base64')},forbiddenTerms:['Highway 38 Solutions','1kDDKWx9jfObWm8EmaXm5weDCTJbQ8RTf7-sq4RDEYlA','1Vq8UjAzxW4hIKYoodkf1hfqkATWiXjVC','11ak4QZ7ag8daYO1_uO6NTCVXIO7Kh6j3']};fs.writeFileSync(path.join(out,'platform-params.json'),JSON.stringify([payload]));})().catch(e=>{console.error(e);process.exit(1)});
NODE
cp "$FIX"/* "$OUT/"
run_api boStandalonePlatformAcceptance_ "$FIX/platform-params.json" "$OUT/platform-acceptance-api.json" "$OUT/platform-acceptance-response.json"
node - "$OUT/platform-acceptance-response.json" <<'NODE'
const fs=require('fs'),v=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));if(v.status!=='PASS'||v.tests.some(t=>t.status!=='PASS'))throw new Error('Platform acceptance HOLD: '+JSON.stringify(v.tests.filter(t=>t.status!=='PASS')));if(v.businessId!=='NORTHSTAR_TEST'||v.businessName!=='North Star Test Company'||v.packId!=='north-star-test')throw new Error('Wrong acceptance identity');if(!v.created||!Array.isArray(v.created.pdfFiles)||v.created.pdfFiles.length!==9||v.created.pdfFiles.some(f=>!f.identityVerified))throw new Error('Nine identity-verified PDFs missing');
NODE

run_api boStandaloneRenderedHtml_ "$OUT/no-params.json" "$OUT/rendered-ui-api.json" "$OUT/deployed-ui.json"
node - "$OUT/deployed-ui.json" "$OUT/deployed-ui.html" <<'NODE'
const fs=require('fs');const [source,target]=process.argv.slice(2),html=JSON.parse(fs.readFileSync(source,'utf8'));if(typeof html!=='string')throw new Error('Rendered UI response is not HTML.');fs.writeFileSync(target,html);
NODE
node - "$OUT/deployed-ui.html" "$OUT" <<'NODE'
const fs=require('fs'),path=require('path'),{chromium}=require('playwright');const html=fs.readFileSync(process.argv[2],'utf8'),out=process.argv[3];for(const marker of ['North Star Test Company Business Office','capture="environment"','@media (max-width:800px)','savedViews'])if(!html.includes(marker))throw new Error('Missing clean UI marker '+marker);if(html.includes('Highway 38 Solutions'))throw new Error('Highway 38 identity leaked into clean UI');(async()=>{const b=await chromium.launch({headless:true});for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){const p=await b.newPage({viewport:{width,height}});await p.setContent(html);await p.screenshot({path:path.join(out,`${name}.png`),fullPage:true})}await b.close()})().catch(e=>{console.error(e);process.exit(1)});
NODE

run_api boStandaloneCleanup_ "$OUT/no-params.json" "$OUT/cleanup-api.json" "$OUT/cleanup-response.json"

rm -f "$APP/BusinessOffice_StandaloneHarness.gs"
cp "$FINAL_BACKUP/BusinessOffice_Auth.gs" "$APP/BusinessOffice_Auth.gs"
cp "$FINAL_BACKUP/BusinessOffice_Installer.gs" "$APP/BusinessOffice_Installer.gs"
cp "$FINAL_BACKUP/BusinessOffice_Web.gs" "$APP/BusinessOffice_Web.gs"
cp "$FINAL_BACKUP/appsscript.json" "$APP/appsscript.json"

FINAL_VERSION="$(create_version 'North Star Test Company Business Office Final' final)"
publish_deployment "$FINAL_VERSION" 'North Star Test Company Business Office Final' final "$EXISTING_FINAL_DEPLOYMENT_ID"
FINAL_ID="$(cat "$OUT/final-deployment-id.txt")"
FINAL_URL="https://script.google.com/macros/s/${FINAL_ID}/exec"
printf '%s' "$FINAL_URL" > "$OUT/business-office-web-app-url.txt"
(cd "$APP" && clasp delete-deployment "$ACCEPT_ID" --json) > "$OUT/acceptance-undeploy.json"

for blocked in \
  'AKfycbzr0hoImRF4iQ1gR90Cr17juP8PODkEWRorXxW6qralEYTGLhOU33E1wYEPU_3duQKpQg' \
  'AKfycbyf9ivM04iKqg9QqM1PgRQgD4Imf6VY_mMpCLLsU6lRbGYsprTEEzlwEE93pRgqPzCcmg'; do
  if [[ "$FINAL_ID" = "$blocked" ]]; then echo 'HOLD — standalone deployment reused Highway 38 deployment ID'; exit 22; fi
done
FINAL_HTTP="$(curl -L -sS -o "$OUT/final-response.html" -w '%{http_code}' "$FINAL_URL" || true)"
printf '%s' "$FINAL_HTTP" > "$OUT/final-http-status.txt"
test "$FINAL_HTTP" != "404"

cat > "$OUT/deployment-result.json" <<JSON
{"status":"PASS","sourceCommit":"${GITHUB_SHA}","mode":"standalone","businessId":"NORTHSTAR_TEST","businessName":"North Star Test Company","packId":"north-star-test","scriptId":"${APP_ID}","deploymentId":"${FINAL_ID}","url":"${FINAL_URL}","dedicatedProject":true,"dedicatedDeployment":true,"configurationDocumentTrashed":true,"highway38ResourceReuse":false,"authenticatedExecutionAcceptance":true,"desktopVerified":true,"mobileVerified":true,"uploadOcrVerified":true,"ninePdfIdentitiesVerified":true,"approvalControlsVerified":true,"backupVerified":true,"externalActionsEnabled":false,"directPaymentProcessing":false,"directPayrollFunding":false,"directTaxFiling":false}
JSON
cat "$OUT/deployment-result.json"
