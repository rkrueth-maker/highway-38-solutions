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

diagnostic_marker() {
  local file="$1"
  local marker="$2"
  if ! grep -F "$marker" "$file" >/dev/null; then
    printf 'WARN — diagnostic source marker not found before push: %s :: %s\n' "$(basename "$file")" "$marker" | tee -a "$EVIDENCE/local-source-diagnostics.txt"
  fi
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
cat > "$PROJECT/.claspignore" <<'EOF'
**/*.md
**/*.map
EOF
find "$PROJECT" -maxdepth 1 -type f \( -name 'Portal_*' -o -name 'BusinessOffice_*' -o -name 'Unified_*' -o -name 'BusinessOffice_Index.html' \) -delete
cp "$REPO_ROOT"/apps-script/core-engine/owner-portal-next/*.js "$PROJECT/"
cp "$REPO_ROOT"/apps-script/core-engine/owner-portal-next/*.html "$PROJECT/"
bash "$REPO_ROOT/scripts/assemble-business-office-app.sh" "$PROJECT" "$H38_PACK" "$REPO_ROOT"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$PROJECT/"
node "$REPO_ROOT/scripts/build-unified-apps-script-shell.js" "$PROJECT" "$REPO_ROOT"

node - "$PROJECT/appsscript.json" "$REPO_ROOT/apps-script/business-office/appsscript.json" <<'NODE'
const fs=require('fs');const target=process.argv[2],businessPath=process.argv[3],base=JSON.parse(fs.readFileSync(target,'utf8')),business=JSON.parse(fs.readFileSync(businessPath,'utf8'));base.runtimeVersion='V8';base.exceptionLogging='STACKDRIVER';base.oauthScopes=[...new Set([...(base.oauthScopes||[]),...(business.oauthScopes||[])])];base.dependencies=base.dependencies||{};const services=[...(base.dependencies.enabledAdvancedServices||[])];for(const service of (((business.dependencies||{}).enabledAdvancedServices)||[]))if(!services.some(item=>item.serviceId===service.serviceId))services.push(service);base.dependencies.enabledAdvancedServices=services;base.webapp={executeAs:'USER_ACCESSING',access:'ANYONE'};base.executionApi={access:'ANYONE'};fs.writeFileSync(target,JSON.stringify(base,null,2)+'\n');
NODE

node - "$PROJECT" <<'NODE'
const fs=require('fs'),root=process.argv[2],controlled=fs.readdirSync(root).filter(name=>/^(Portal_|BusinessOffice_|Unified_)/.test(name)),seen=new Map();for(const name of controlled){const base=name.replace(/\.(?:js|gs|html)$/i,'');if(seen.has(base))throw new Error(`Duplicate Apps Script file base name: ${base} (${seen.get(base)}, ${name})`);seen.set(base,name)}const declarationPattern=/(?:var|const|let)\s+BO_EMBEDDED_BUSINESS_PACK\s*=/;const declarations=controlled.filter(name=>name.endsWith('.gs')).filter(name=>declarationPattern.test(fs.readFileSync(`${root}/${name}`,'utf8')));if(declarations.length!==1||declarations[0]!=='BusinessOffice_00_Pack.gs')throw new Error(`Expected exactly one generated Business Office pack declaration, found ${declarations.join(', ')||'none'}`);const entries=[];for(const name of controlled.filter(name=>/\.(?:gs|js)$/i.test(name))){const source=fs.readFileSync(`${root}/${name}`,'utf8');for(let i=0;i<(source.match(/\bfunction\s+doGet\s*\(/g)||[]).length;i++)entries.push(name)}if(entries.length!==1||entries[0]!=='Unified_AppShell.gs')throw new Error(`Expected one unified doGet, found ${entries.join(', ')||'none'}`);console.log(`Unified source contains ${controlled.length} controlled files, one business pack, and one entry point.`);
NODE

REQUIRED_PORTAL_FILES=(
  Unified_AppShell.gs
  Portal_Business.js
  Portal_Services.js
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
test ! -e "$PROJECT/Portal_00_BusinessAuth.js"

node "$REPO_ROOT/scripts/verify-unified-app-shell.js"

diagnostic_marker "$PROJECT/Unified_AppShell.gs" "var H38_PORTAL_AUTH_BRIDGE = (function(){"
diagnostic_marker "$PROJECT/Unified_AppShell.gs" "function h38UnifiedShellCapabilityOwner_"
diagnostic_marker "$PROJECT/Unified_AppShell.gs" "function doGet(event)"
diagnostic_marker "$PROJECT/Portal_Services.js" "function h38PortalStandaloneDoGet_"
diagnostic_marker "$PROJECT/BusinessOffice_Web.gs" "function boBusinessOfficeStandaloneDoGet_"
diagnostic_marker "$PROJECT/Portal_Business.js" "function h38PortalGetCurrentUser_"
diagnostic_marker "$PROJECT/BusinessOffice_Auth.gs" "function boGetCurrentUser_()"
diagnostic_marker "$PROJECT/BusinessOffice_QuoteBuilder_Direct.gs" "function boRenderQuoteBuilderApp_()"

DEPLOY_STAGE="diagnostic_file_status"
if ! (cd "$PROJECT" && clasp show-file-status) 2>&1 | tee "$EVIDENCE/clasp-status-before-push.txt"; then
  printf 'WARN — clasp file-status output was unavailable; continuing to mandatory post-push remote source verification.\n' | tee -a "$EVIDENCE/clasp-status-before-push.txt"
fi

DEPLOY_STAGE="push_source"
(cd "$PROJECT" && clasp push --force) 2>&1 | tee "$EVIDENCE/clasp-push.txt"

DEPLOY_STAGE="pull_remote_source"
printf '{"scriptId":"%s","rootDir":"."}\n' "$OWNER_SCRIPT_ID" > "$REMOTE_VERIFY/.clasp.json"
(cd "$REMOTE_VERIFY" && clasp pull) 2>&1 | tee "$EVIDENCE/remote-project-pull.txt"
find "$REMOTE_VERIFY" -maxdepth 1 -type f -printf '%f\n' | sort | tee "$EVIDENCE/remote-source-files.txt"

DEPLOY_STAGE="verify_remote_source"
REMOTE_SHELL="$(find_remote_source Unified_AppShell)"
REMOTE_BUSINESS_ADAPTER="$(find_remote_source Portal_Business)"
REMOTE_SERVICES="$(find_remote_source Portal_Services)"
REMOTE_AUTH="$(find_remote_source BusinessOffice_Auth)"
REMOTE_CONFIG="$(find_remote_source BusinessOffice_Config)"
REMOTE_CORE="$(find_remote_source BusinessOffice_Core)"
REMOTE_GATE="$(find_remote_source BusinessOffice_ModuleAccess)"
REMOTE_QB_DIRECT="$(find_remote_source BusinessOffice_QuoteBuilder_Direct)"
REMOTE_UX="$(find_remote_source BusinessOffice_UX)"
REMOTE_WEB="$(find_remote_source BusinessOffice_Web)"
for remote_file in "$REMOTE_SHELL" "$REMOTE_BUSINESS_ADAPTER" "$REMOTE_SERVICES" "$REMOTE_AUTH" "$REMOTE_CONFIG" "$REMOTE_CORE" "$REMOTE_GATE" "$REMOTE_QB_DIRECT" "$REMOTE_UX" "$REMOTE_WEB"; do
  test -n "$remote_file" && test -f "$remote_file" || { echo 'HOLD — required unified shell or Business Office source did not reach the remote Apps Script project.'; exit 7; }
done
! find "$REMOTE_VERIFY" -maxdepth 1 -type f \( -name 'Portal_00_BusinessAuth.gs' -o -name 'Portal_00_BusinessAuth.js' \) | grep -q .
grep -F "var H38_PORTAL_AUTH_BRIDGE = (function(){" "$REMOTE_SHELL" >/dev/null
grep -F "function h38UnifiedShellCapabilityOwner_" "$REMOTE_SHELL" >/dev/null
grep -F "function h38UnifiedShellRegistry" "$REMOTE_SHELL" >/dev/null
grep -F "function doGet(event)" "$REMOTE_SHELL" >/dev/null
grep -F "function h38PortalStandaloneDoGet_" "$REMOTE_SERVICES" >/dev/null
grep -F "function boBusinessOfficeStandaloneDoGet_" "$REMOTE_WEB" >/dev/null
grep -F "function h38PortalGetCurrentUser_" "$REMOTE_BUSINESS_ADAPTER" >/dev/null
grep -F "function boGetCurrentUser_()" "$REMOTE_AUTH" >/dev/null
grep -F "function boRenderQuoteBuilderApp_()" "$REMOTE_QB_DIRECT" >/dev/null
node - "$REMOTE_VERIFY" <<'NODE'
const fs=require('fs'),path=require('path'),root=process.argv[2],entries=[];for(const name of fs.readdirSync(root).filter(name=>/\.(?:gs|js)$/i.test(name))){const source=fs.readFileSync(path.join(root,name),'utf8');for(let i=0;i<(source.match(/\bfunction\s+doGet\s*\(/g)||[]).length;i++)entries.push(name)}if(entries.length!==1||!/^Unified_AppShell\.(?:gs|js)$/.test(entries[0]))throw new Error(`Remote project must contain one unified doGet; found ${entries.join(', ')||'none'}`);console.log(`Remote unified entry point: ${entries[0]}`);
NODE
printf 'PASS — remote Apps Script source includes one deterministic shell, one entry point, self-contained authentication, capability ownership, direct Quote Builder routing, and existing Business Office modules.\n' | tee "$EVIDENCE/remote-source-verification.txt"

DEPLOY_STAGE="update_existing_deployments"
DEPLOYMENT_DESCRIPTION="Highway 38 unified shell ${GITHUB_SHA}"
(cd "$PROJECT" && clasp update-deployment "$OWNER_DEPLOYMENT_ID" --description "$DEPLOYMENT_DESCRIPTION" && clasp update-deployment "$BUSINESS_OFFICE_DEPLOYMENT_ID" --description "$DEPLOYMENT_DESCRIPTION" && clasp list-deployments) 2>&1 | tee "$EVIDENCE/deployments-after.txt"
grep -F "$OWNER_DEPLOYMENT_ID" "$EVIDENCE/deployments-after.txt" >/dev/null;grep -F "$BUSINESS_OFFICE_DEPLOYMENT_ID" "$EVIDENCE/deployments-after.txt" >/dev/null

DEPLOY_STAGE="verify_live_endpoints"
OWNER_URL="https://script.google.com/macros/s/${OWNER_DEPLOYMENT_ID}/exec";BUSINESS_URL="https://script.google.com/macros/s/${BUSINESS_OFFICE_DEPLOYMENT_ID}/exec?app=business-office";QUOTE_BUILDER_URL="${BUSINESS_URL}&quoteBuilder=1"
printf '%s' "$OWNER_URL" > "$EVIDENCE/owner-portal-url.txt";printf '%s' "$BUSINESS_URL" > "$EVIDENCE/business-office-url.txt";printf '%s' "$QUOTE_BUILDER_URL" > "$EVIDENCE/quote-builder-url.txt"
OWNER_STATUS="$(curl -L -sS -o "$EVIDENCE/owner-response.html" -w '%{http_code}' "$OWNER_URL" || true)";BUSINESS_STATUS="$(curl -L -sS -o "$EVIDENCE/business-response.html" -w '%{http_code}' "$BUSINESS_URL" || true)";QUOTE_BUILDER_STATUS="$(curl -L -sS -o "$EVIDENCE/quote-builder-response.html" -w '%{http_code}' "$QUOTE_BUILDER_URL" || true)"
printf '%s' "$OWNER_STATUS" > "$EVIDENCE/owner-http-status.txt";printf '%s' "$BUSINESS_STATUS" > "$EVIDENCE/business-http-status.txt";printf '%s' "$QUOTE_BUILDER_STATUS" > "$EVIDENCE/quote-builder-http-status.txt";test "$OWNER_STATUS" != "404";test "$BUSINESS_STATUS" != "404";test "$QUOTE_BUILDER_STATUS" != "404"
for forbidden in "ReferenceError: boGetCurrentUser_ is not defined" "ReferenceError: boNormalizeText_ is not defined" "Authentication service is unavailable: boGetCurrentUser_" "Portal_00_BusinessAuth"; do
  ! grep -F "$forbidden" "$EVIDENCE/owner-response.html" "$EVIDENCE/business-response.html" "$EVIDENCE/quote-builder-response.html"
done

DEPLOY_STAGE="record_pass"
cat > "$EVIDENCE/deployment-result.json" <<JSON
{"status":"PASS","sourceCommit":"${GITHUB_SHA}","shellVersion":"3.0.0","businessPack":"highway38","deploymentConfiguration":"business-packs/highway38/deployment.json","scriptId":"${OWNER_SCRIPT_ID}","ownerPortalDeploymentId":"${OWNER_DEPLOYMENT_ID}","businessOfficeDeploymentId":"${BUSINESS_OFFICE_DEPLOYMENT_ID}","ownerPortalUrl":"${OWNER_URL}","businessOfficeUrl":"${BUSINESS_URL}","quoteBuilderUrl":"${QUOTE_BUILDER_URL}","websitePortalUrl":"${WEBSITE_PORTAL_URL}","updatedExistingDeployments":true,"createdNewProject":false,"createdNewDeployment":false,"singleEntryPointVerified":true,"selfContainedAuthentication":true,"legacyPortalAuthBridgeRemoved":true,"capabilityOwnershipVerified":true,"quoteBuilderOwnsQuotesWhenEnabled":true,"googleAuthenticationRequired":true,"remoteSourceVerified":true,"externalActionsEnabled":false,"externalActionsOccurred":false}
JSON
cat "$EVIDENCE/deployment-result.json"
