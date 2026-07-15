#!/usr/bin/env bash
set -euo pipefail

ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
SOURCE="$ROOT/scripts/deploy-clean-business-office-installation-v2.sh"
PATCHED="${RUNNER_TEMP:?RUNNER_TEMP is required}/deploy-clean-business-office-installation-v4-runtime.sh"
cp "$SOURCE" "$PATCHED"

python3 - "$PATCHED" <<'PY'
from pathlib import Path
import re,sys
path=Path(sys.argv[1])
text=path.read_text()

run_action=r'''run_action() {
  local action="$1" payload_file="$2" raw_file="$3" result_file="$4" status=""
  node - "$TOKEN" "$action" "$payload_file" > "$FIXTURES/request-${action}.json" <<'NODE'
const fs=require('fs');
const token=process.argv[2],action=process.argv[3],payloadPath=process.argv[4];
const payload=payloadPath&&fs.existsSync(payloadPath)?JSON.parse(fs.readFileSync(payloadPath,'utf8')):{};
process.stdout.write(JSON.stringify({token,action,payload}));
NODE
  : > "$raw_file"
  for attempt in $(seq 1 36); do
    status="$(curl -L -sS --max-time 45 -o "$raw_file" -w '%{http_code}' -H 'Content-Type: application/json' --data-binary "@$FIXTURES/request-${action}.json" "$ACCEPT_URL" || true)"
    printf '%s' "$status" > "${raw_file}.status"
    if [[ "$status" = "200" ]] && grep -q '"ok"' "$raw_file"; then break; fi
    sleep 5
  done
  test "$status" = "200"
  node - "$raw_file" "$result_file" <<'NODE'
const fs=require('fs');
const [raw,result]=process.argv.slice(2);
const text=fs.readFileSync(raw,'utf8').trim();
const first=text.indexOf('{'),last=text.lastIndexOf('}');
if(first<0||last<first) throw new Error(`No JSON response: ${text.slice(0,400)}`);
const value=JSON.parse(text.slice(first,last+1));
if(!value.ok) throw new Error(value.error||'Clean-install endpoint returned HOLD.');
fs.writeFileSync(result,JSON.stringify(value.result,null,2)+'\n');
NODE
}

'''
text,count=re.subn(r'run_action\(\) \{.*?\n\}\n\n(?=apps_script_access_token\(\))',run_action,text,count=1,flags=re.S)
if count!=1: raise SystemExit('HOLD — v2 run_action block was not found.')

text=text.replace("m.webapp={executeAs:'USER_ACCESSING',access:'ANYONE'};\nm.executionApi={access:'MYSELF'};", "m.webapp={executeAs:'USER_DEPLOYING',access:'ANYONE_ANONYMOUS'};\nm.executionApi={access:'MYSELF'};")

needle='''node "$REPO_ROOT/scripts/build-business-office-installation.js" --pack "$BUSINESS_PACK" --mode standalone --out "$PROJECT" \\
  | tee "$EVIDENCE/build-manifest-output.json"
'''
insert='''if [[ -z "${CLEAN_SCRIPT_ID:-}" ]]; then
  SCRIPT_CREATE_DIR="$WORK/script-create"
  mkdir -p "$SCRIPT_CREATE_DIR"
  (cd "$SCRIPT_CREATE_DIR" && clasp create-script --type standalone --title "${CLEAN_TEMPLATE_TITLE} — ${CLEAN_INSTALLATION_ID}" --rootDir . --json) > "$EVIDENCE/script-create.json"
  export CLEAN_SCRIPT_ID="$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).scriptId||'')" "$SCRIPT_CREATE_DIR/.clasp.json")"
fi
test -n "$CLEAN_SCRIPT_ID"
printf '%s' "$CLEAN_SCRIPT_ID" > "$EVIDENCE/requested-apps-script-project-id.txt"

'''+needle
if needle not in text: raise SystemExit('HOLD — build marker missing.')
text=text.replace(needle,insert,1)

needle='''cp "$REPO_ROOT/tests/business-office-clean-installation/BusinessOffice_NeutralProvisioning.gs" "$PROJECT/BusinessOffice_NeutralProvisioning.gs"
'''
insert=needle+'''cp "$PROJECT/BusinessOffice_Auth.gs" "$WORK/final-auth.gs"
cp "$PROJECT/BusinessOffice_Installer.gs" "$WORK/final-installer.gs"
sed -i 's/Session.getActiveUser()/Session.getEffectiveUser()/g' "$PROJECT/BusinessOffice_Auth.gs" "$PROJECT/BusinessOffice_Installer.gs"
'''
if needle not in text: raise SystemExit('HOLD — acceptance copy marker missing.')
text=text.replace(needle,insert,1)

needle='''printf '%s' "$ACCEPT_DEPLOYMENT_ID" > "$EVIDENCE/acceptance-deployment-id.txt"
'''
insert=needle+'''ACCEPT_URL="https://script.google.com/macros/s/${ACCEPT_DEPLOYMENT_ID}/exec"
printf '%s' "$ACCEPT_URL" > "$EVIDENCE/acceptance-url.txt"
'''
if needle not in text: raise SystemExit('HOLD — acceptance deployment marker missing.')
text=text.replace(needle,insert,1)

needle='''cp "$WORK/final-appsscript.json" "$PROJECT/appsscript.json"
'''
insert=needle+'''cp "$WORK/final-auth.gs" "$PROJECT/BusinessOffice_Auth.gs"
cp "$WORK/final-installer.gs" "$PROJECT/BusinessOffice_Installer.gs"
'''
if needle not in text: raise SystemExit('HOLD — final source restore marker missing.')
text=text.replace(needle,insert,1)

path.write_text(text)
PY

chmod +x "$PATCHED"
bash "$PATCHED"
