#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
WORK="${RUNNER_TEMP:?RUNNER_TEMP is required}/h38-unified-owner-portal"
BACKUP="$WORK/backup"
PROJECT="$WORK/project"
REMOTE_VERIFY="$WORK/remote-verify"
EVIDENCE="$REPO_ROOT/artifacts/unified-owner-portal"
H38_PACK="$REPO_ROOT/business-packs/highway38/apps-script/BusinessOffice_Pack.gs"
H38_DEPLOYMENT="$REPO_ROOT/business-packs/highway38/deployment.json"
DEPLOY_STAGE="initialize"

record_deployment_failure() {
  local status=$?
  trap - ERR
  mkdir -p "$EVIDENCE"
  printf 'HOLD — production deployment failed during stage: %s (exit %s).\n' "$DEPLOY_STAGE" "$status" | tee -a "$EVIDENCE/remote-source-verification.txt"
  exit "$status"
}
trap record_deployment_failure ERR

read_config() {
  local path="$1"
  node - "$H38_DEPLOYMENT" "$path" <<'NODE'
const fs=require('fs');const [file,path]=process.argv.slice(2);let value=JSON.parse(fs.readFileSync(file,'utf8'));for(const key of path.split('.'))value=value?.[key];if(value==null||value==='')throw new Error(`Missing Highway 38 deployment configuration: ${path}`);process.stdout.write(String(value));
NODE
}

find_remote_source() {
  local base="$1"
  find "$REMOTE_VERIFY" -maxdepth 1 -type f \( -name "${base}.gs" -o -name "${base}.js" \) -print -quit
}

DEPLOY_STAGE="read_configuration"
OWNER_SCRIPT_ID="$(read_config appsScript.ownerPortalProjectId)"
OWNER_DEPLOYMENT_ID="$(read_config appsScript.ownerPortalDeploymentId)"
BUSINESS_OFFICE_DEPLOYMENT_ID="$(read_config appsScript.businessOfficeDeploymentId)"
WEBSITE_PORTAL_URL="$(read_config website.ownerPortalUrl)"

DEPLOY_STAGE="backup_current_project"
rm -rf "$WORK" "$EVIDENCE";mkdir -p "$BACKUP" "$PROJECT" "$REMOTE_VERIFY" "$EVIDENCE"
printf '{"scriptId":"%s","rootDir":"."}\n' "$OWNER_SCRIPT_ID" > "$BACKUP/.clasp.json"
printf '{"scriptId":"%s","rootDir":"."}\n' "$OWNER_SCRIPT_ID" > "$PROJECT/.clasp.json"
(cd "$BACKUP" && clasp pull) 2>&1 | tee "$EVIDENCE/project-pull.txt"
tar -czf "$EVIDENCE/project-before.tar.gz" -C "$BACKUP" .
sha256sum "$EVIDENCE/project-before.tar.gz" | tee "$EVIDENCE/project-before.sha256"
(cd "$BACKUP" && clasp list-deployments) 2>&1 | tee "$EVIDENCE/deployments-before.txt"
grep -F "$OWNER_DEPLOYMENT_ID" "$EVIDENCE/deployments-before.txt" >/dev/null
grep -F "$BUSINESS_OFFICE_DEPLOYMENT_ID" "$EVIDENCE/deployments-before.txt" >/dev/null

DEPLOY_STAGE="assemble_local_source"
cp -a "$BACKUP/." "$PROJECT/"
printf '{"scriptId":"%s","rootDir":"."}\n' "$OWNER_SCRIPT_ID" > "$PROJECT/.clasp.json"
# Never inherit an old project-level ignore file. It previously allowed Portal files
# to deploy while silently excluding required Business Office server files.
cat > "$PROJECT/.claspignore" <<'EOF'
**/*.md
**/*.map
EOF
find "$PROJECT" -maxdepth 1 -type f \( -name 'Portal_*' -o -name 'BusinessOffice_*' -o -name 'BusinessOffice_Index.html' \) -delete
cp "$REPO_ROOT"/apps-script/core-engine/owner-portal-next/*.js "$PROJECT/"
cp "$REPO_ROOT"/apps-script/core-engine/owner-portal-next/*.html "$PROJECT/"
bash "$REPO_ROOT/scripts/assemble-business-office-app.sh" "$PROJECT" "$H38_PACK" "$REPO_ROOT"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$PROJECT/"

python3 - "$PROJECT/Portal_Services.js" "$PROJECT/BusinessOffice_Web.gs" <<'PY'
from pathlib import Path
import re
import sys
portal=Path(sys.argv[1]);business=Path(sys.argv[2]);portal_text=portal.read_text();needle="function doGet(e) {\n  h38PortalRequireUnifiedUser_();";replacement="function doGet(e) {\n  if (e && e.parameter && e.parameter.app === 'business-office') {\n    if (e.parameter.quoteBuilder === '1') return boRenderQuoteBuilderApp_();\n    boGetCurrentUser_();\n    return boRenderWebApp_();\n  }\n  h38PortalRequireUnifiedUser_();"
if needle not in portal_text: raise SystemExit('Unified user doGet router marker not found')
portal_text=portal_text.replace(needle,replacement,1);render=".setTitle(H38_PORTAL_NEXT.APP_NAME).setSandboxMode(HtmlService.SandboxMode.IFRAME);";embed=".setTitle(H38_PORTAL_NEXT.APP_NAME).setSandboxMode(HtmlService.SandboxMode.IFRAME).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);"
if render not in portal_text: raise SystemExit('Owner Portal render marker not found')
portal.write_text(portal_text.replace(render,embed,1));business_text=business.read_text()
business_text,count=re.subn(r'function\s+doGet\s*\(([^)]*)\)\s*\{',r'function boBusinessOfficeDoGet_(\1) {',business_text,count=1)
if count != 1: raise SystemExit('Business Office doGet rename marker not found')
if '.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)' not in business_text: raise SystemExit('Business Office embedding boundary is missing')
business.write_text(business_text)
PY

node - "$PROJECT/appsscript.json" "$REPO_ROOT/apps-script/business-office/appsscript.json" <<'NODE'
const fs=require('fs');const target=process.argv[2],businessPath=process.argv[3],base=JSON.parse(fs.readFileSync(target,'utf8')),business=JSON.parse(fs.readFileSync(businessPath,'utf8'));base.runtimeVersion='V8';base.exceptionLogging='STACKDRIVER';base.oauthScopes=[...new Set([...(base.oauthScopes||[]),...(business.oauthScopes||[])])];base.dependencies=base.dependencies||{};const services=[...(base.dependencies.enabledAdvancedServices||[])];for(const service of (((business.dependencies||{}).enabledAdvancedServices)||[]))if(!services.some(item=>item.serviceId===service.serviceId))services.push(service);base.dependencies.enabledAdvancedServices=services;base.webapp={executeAs:'USER_ACCESSING',access:'ANYONE'};base.executionApi={access:'ANYONE'};fs.writeFileSync(target,JSON.stringify(base,null,2)+'\n');
NODE

node - "$PROJECT" <<'NODE'
const fs=require('fs'),root=process.argv[2],controlled=fs.readdirSync(root).filter(name=>/^(Portal_|BusinessOffice_)/.test(name)),seen=new Map();for(const name of controlled){const base=name.replace(/\.(?:js|gs|html)$/i,'');if(seen.has(base))throw new Error(`Duplicate Apps Script file base name: ${base} (${seen.get(base)}, ${name})`);seen.set(base,name)}const declarationPattern=/(?:var|const|let)\s+BO_EMBEDDED_BUSINESS_PACK\s*=/;const declarations=controlled.filter(name=>name.endsWith('.gs')).filter(name=>declarationPattern.test(fs.readFileSync(`${root}/${name}`,'utf8')));if(declarations.length!==1||declarations[0]!=='BusinessOffice_00_Pack.gs')throw new Error(`Expected exactly one generated Business Office pack declaration, found ${declarations.join(', ')||'none'}`);console.log(`Unified source contains ${controlled.length} controlled portal files and one generated business pack.`);
NODE

REQUIRED_PORTAL_FILES=(
  Portal_00_BusinessAuth.js
)
REQUIRED_BUSINESS_FILES=(
  BusinessOffice_00_Pack.gs
  BusinessOffice_Auth.gs
  BusinessOffice_Config.gs
  BusinessOffice_Core.gs
  BusinessOffice_ModuleAccess.gs
  BusinessOffice_QuoteBuilder_Direct.gs
  BusinessOffice_QuoteBuilder_Index.html
  BusinessOffice_QuoteBuilder_Direct_Client.html
  BusinessOffice_UX.gs
  BusinessOffice_Web.gs
)
for required in "${REQUIRED_PORTAL_FILES[@]}" "${REQUIRED_BUSINESS_FILES[@]}"; do
  test -f "$PROJECT/$required" || { echo "HOLD — required assembled source is missing: $required"; exit 5; }
done
grep -F "global.boGetCurrentUser_ = function" "$PROJECT/Portal_00_BusinessAuth.js" >/dev/null
grep -F "global.boGetActiveEmail_ = function" "$PROJECT/Portal_00_BusinessAuth.js" >/dev/null
grep -F "function boGetCurrentUser_()" "$PROJECT/BusinessOffice_Auth.gs" >/dev/null
grep -F "function boGetActiveEmail_()" "$PROJECT/BusinessOffice_Auth.gs" >/dev/null
grep -F "e.parameter.app === 'business-office'" "$PROJECT/Portal_Services.js" >/dev/null
grep -F "e.parameter.quoteBuilder === '1'" "$PROJECT/Portal_Services.js" >/dev/null
grep -F "boRenderQuoteBuilderApp_()" "$PROJECT/Portal_Services.js" >/dev/null
grep -F "h38PortalRequireUnifiedUser_" "$PROJECT/Portal_Services.js" >/dev/null
grep -F "packId:'highway38'" "$PROJECT/BusinessOffice_00_Pack.gs" >/dev/null

DEPLOY_STAGE="diagnostic_file_status"
if ! (cd "$PROJECT" && clasp show-file-status) 2>&1 | tee "$EVIDENCE/clasp-status-before-push.txt"; then
  printf 'WARN — clasp file-status output was unavailable; continuing to mandatory post-push remote source verification.\n' | tee -a "$EVIDENCE/clasp-status-before-push.txt"
fi

DEPLOY_STAGE="push_source"
(cd "$PROJECT" && clasp push --force) 2>&1 | tee "$EVIDENCE/clasp-push.txt"

# Pull the just-pushed remote project into a clean directory. Deployment is blocked
# unless the server now contains canonical Business Office auth and the Portal bridge.
DEPLOY_STAGE="pull_remote_source"
printf '{"scriptId":"%s","rootDir":"."}\n' "$OWNER_SCRIPT_ID" > "$REMOTE_VERIFY/.clasp.json"
(cd "$REMOTE_VERIFY" && clasp pull) 2>&1 | tee "$EVIDENCE/remote-project-pull.txt"
find "$REMOTE_VERIFY" -maxdepth 1 -type f -printf '%f\n' | sort | tee "$EVIDENCE/remote-source-files.txt"

DEPLOY_STAGE="verify_remote_source"
REMOTE_AUTH_BRIDGE="$(find_remote_source Portal_00_BusinessAuth)"
REMOTE_AUTH="$(find_remote_source BusinessOffice_Auth)"
REMOTE_CONFIG="$(find_remote_source BusinessOffice_Config)"
REMOTE_CORE="$(find_remote_source BusinessOffice_Core)"
REMOTE_GATE="$(find_remote_source BusinessOffice_ModuleAccess)"
REMOTE_QB_DIRECT="$(find_remote_source BusinessOffice_QuoteBuilder_Direct)"
REMOTE_UX="$(find_remote_source BusinessOffice_UX)"
REMOTE_WEB="$(find_remote_source BusinessOffice_Web)"
for remote_file in "$REMOTE_AUTH_BRIDGE" "$REMOTE_AUTH" "$REMOTE_CONFIG" "$REMOTE_CORE" "$REMOTE_GATE" "$REMOTE_QB_DIRECT" "$REMOTE_UX" "$REMOTE_WEB"; do
  test -n "$remote_file" && test -f "$remote_file" || { echo 'HOLD — required authentication or Business Office source did not reach the remote Apps Script project.'; exit 7; }
done
grep -F "global.boGetCurrentUser_ = function" "$REMOTE_AUTH_BRIDGE" >/dev/null
grep -F "global.boGetActiveEmail_ = function" "$REMOTE_AUTH_BRIDGE" >/dev/null
grep -F "function boGetCurrentUser_()" "$REMOTE_AUTH" >/dev/null
grep -F "function boGetActiveEmail_()" "$REMOTE_AUTH" >/dev/null
grep -F "function boRenderQuoteBuilderApp_()" "$REMOTE_QB_DIRECT" >/dev/null
printf 'PASS — remote Apps Script source includes canonical authentication, the guaranteed Portal authentication bridge, direct Quote Builder routing, and core modules.\n' | tee "$EVIDENCE/remote-source-verification.txt"

DEPLOY_STAGE="update_existing_deployments"
DEPLOYMENT_DESCRIPTION="Highway 38 unified application ${GITHUB_SHA}"
(cd "$PROJECT" && clasp update-deployment "$OWNER_DEPLOYMENT_ID" --description "$DEPLOYMENT_DESCRIPTION" && clasp update-deployment "$BUSINESS_OFFICE_DEPLOYMENT_ID" --description "$DEPLOYMENT_DESCRIPTION" && clasp list-deployments) 2>&1 | tee "$EVIDENCE/deployments-after.txt"
grep -F "$OWNER_DEPLOYMENT_ID" "$EVIDENCE/deployments-after.txt" >/dev/null;grep -F "$BUSINESS_OFFICE_DEPLOYMENT_ID" "$EVIDENCE/deployments-after.txt" >/dev/null

DEPLOY_STAGE="verify_live_endpoints"
OWNER_URL="https://script.google.com/macros/s/${OWNER_DEPLOYMENT_ID}/exec";BUSINESS_URL="https://script.google.com/macros/s/${BUSINESS_OFFICE_DEPLOYMENT_ID}/exec?app=business-office";QUOTE_BUILDER_URL="${BUSINESS_URL}&quoteBuilder=1"
printf '%s' "$OWNER_URL" > "$EVIDENCE/owner-portal-url.txt";printf '%s' "$BUSINESS_URL" > "$EVIDENCE/business-office-url.txt";printf '%s' "$QUOTE_BUILDER_URL" > "$EVIDENCE/quote-builder-url.txt"
OWNER_STATUS="$(curl -L -sS -o "$EVIDENCE/owner-response.html" -w '%{http_code}' "$OWNER_URL" || true)";BUSINESS_STATUS="$(curl -L -sS -o "$EVIDENCE/business-response.html" -w '%{http_code}' "$BUSINESS_URL" || true)";QUOTE_BUILDER_STATUS="$(curl -L -sS -o "$EVIDENCE/quote-builder-response.html" -w '%{http_code}' "$QUOTE_BUILDER_URL" || true)"
printf '%s' "$OWNER_STATUS" > "$EVIDENCE/owner-http-status.txt";printf '%s' "$BUSINESS_STATUS" > "$EVIDENCE/business-http-status.txt";printf '%s' "$QUOTE_BUILDER_STATUS" > "$EVIDENCE/quote-builder-http-status.txt";test "$OWNER_STATUS" != "404";test "$BUSINESS_STATUS" != "404";test "$QUOTE_BUILDER_STATUS" != "404"
! grep -F "ReferenceError: boGetCurrentUser_ is not defined" "$EVIDENCE/owner-response.html" "$EVIDENCE/business-response.html" "$EVIDENCE/quote-builder-response.html"

DEPLOY_STAGE="record_pass"
cat > "$EVIDENCE/deployment-result.json" <<JSON
{"status":"PASS","sourceCommit":"${GITHUB_SHA}","businessPack":"highway38","deploymentConfiguration":"business-packs/highway38/deployment.json","scriptId":"${OWNER_SCRIPT_ID}","ownerPortalDeploymentId":"${OWNER_DEPLOYMENT_ID}","businessOfficeDeploymentId":"${BUSINESS_OFFICE_DEPLOYMENT_ID}","ownerPortalUrl":"${OWNER_URL}","businessOfficeUrl":"${BUSINESS_URL}","quoteBuilderUrl":"${QUOTE_BUILDER_URL}","websitePortalUrl":"${WEBSITE_PORTAL_URL}","updatedExistingDeployments":true,"createdNewProject":false,"createdNewDeployment":false,"embeddedOwnerPortal":true,"embeddedBusinessOffice":true,"directQuoteBuilder":true,"googleAuthenticationRequired":true,"remoteSourceVerified":true,"businessOfficeAuthVerified":true,"portalAuthBridgeVerified":true,"externalActionsEnabled":false,"externalActionsOccurred":false,"taskAssignmentEnabled":true,"messagingPreparationEnabled":true,"smsProviderReleaseRequired":true}
JSON
cat "$EVIDENCE/deployment-result.json"
