#!/usr/bin/env bash
set -euo pipefail

ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
SOURCE="$ROOT/scripts/deploy-clean-business-office-installation-v2.sh"
PATCHED="${RUNNER_TEMP:?RUNNER_TEMP is required}/deploy-clean-business-office-installation-v3-runtime.sh"
cp "$SOURCE" "$PATCHED"

python3 - "$PATCHED" <<'PY'
from pathlib import Path
import sys
path=Path(sys.argv[1])
text=path.read_text()
old='''run_action() {
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
fs.writeFileSync(result,JSON.stringify(response.result,null,2)+'\\n');
NODE
}
'''
new='''run_action() {
  local action="$1" payload_file="$2" raw_file="$3" result_file="$4" status="" attempt
  node - "$TOKEN" "$action" "$payload_file" > "$FIXTURES/request-${action}.json" <<'NODE'
const fs=require('fs');
const token=process.argv[2],action=process.argv[3],payloadPath=process.argv[4];
const payload=payloadPath&&fs.existsSync(payloadPath)?JSON.parse(fs.readFileSync(payloadPath,'utf8')):{};
process.stdout.write(JSON.stringify({token,action,payload}));
NODE
  for attempt in $(seq 1 36); do
    status="$(curl -L -sS --max-time 45 -o "$raw_file" -w '%{http_code}' \\
      -H 'Content-Type: application/json' \\
      --data-binary "@$FIXTURES/request-${action}.json" \\
      "$ACCEPT_URL" || true)"
    printf '%s' "$status" > "${raw_file}.status"
    if [[ "$status" = "200" ]] && node - "$raw_file" >/dev/null 2>&1 <<'NODE'
const fs=require('fs');
const raw=fs.readFileSync(process.argv[2],'utf8').trim();
const first=raw.indexOf('{'),last=raw.lastIndexOf('}');
if(first<0||last<first)process.exit(1);
const value=JSON.parse(raw.slice(first,last+1));
if(value.ok!==true)process.exit(1);
NODE
    then
      break
    fi
    if [[ "$attempt" = "36" ]]; then
      echo "HOLD — temporary acceptance endpoint did not become callable for ${action}; HTTP ${status}." >&2
      cat "$raw_file" >&2 || true
      return 1
    fi
    sleep 5
  done
  node - "$raw_file" "$result_file" <<'NODE'
const fs=require('fs');
const [raw,result]=process.argv.slice(2);
const text=fs.readFileSync(raw,'utf8').trim();
const first=text.indexOf('{'),last=text.lastIndexOf('}');
if(first<0||last<first)throw new Error('Clean-install web execution returned no JSON.');
const response=JSON.parse(text.slice(first,last+1));
if(response.ok!==true)throw new Error(response.error||'Clean-install web execution returned HOLD.');
fs.writeFileSync(result,JSON.stringify(response.result,null,2)+'\\n');
NODE
}
'''
if old not in text:
    raise SystemExit('HOLD — expected v2 run_action block was not found.')
text=text.replace(old,new,1)
old_manifest="m.webapp={executeAs:'USER_ACCESSING',access:'ANYONE'};\nm.executionApi={access:'MYSELF'};"
new_manifest="m.webapp={executeAs:'USER_DEPLOYING',access:'ANYONE_ANONYMOUS'};\ndelete m.executionApi;"
if old_manifest not in text:
    raise SystemExit('HOLD — expected temporary manifest block was not found.')
text=text.replace(old_manifest,new_manifest,1)
needle='''printf '%s' "$ACCEPT_DEPLOYMENT_ID" > "$EVIDENCE/acceptance-deployment-id.txt"
trap 'delete_deployment "$SCRIPT_ID" "$ACCEPT_DEPLOYMENT_ID" || true' EXIT'''
replacement='''printf '%s' "$ACCEPT_DEPLOYMENT_ID" > "$EVIDENCE/acceptance-deployment-id.txt"
ACCEPT_URL="https://script.google.com/macros/s/${ACCEPT_DEPLOYMENT_ID}/exec"
printf '%s' "$ACCEPT_URL" > "$EVIDENCE/acceptance-url.txt"
trap 'delete_deployment "$SCRIPT_ID" "$ACCEPT_DEPLOYMENT_ID" || true' EXIT'''
if needle not in text:
    raise SystemExit('HOLD — expected acceptance deployment block was not found.')
text=text.replace(needle,replacement,1)
path.write_text(text)
PY

chmod +x "$PATCHED"
bash "$PATCHED"
