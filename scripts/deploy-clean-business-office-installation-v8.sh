#!/usr/bin/env bash
set -euo pipefail

ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
SOURCE="$ROOT/scripts/deploy-clean-business-office-installation-v2.sh"
PATCHED="${RUNNER_TEMP:?RUNNER_TEMP is required}/deploy-clean-business-office-installation-v8-runtime.sh"
cp "$SOURCE" "$PATCHED"

python3 - "$PATCHED" <<'PY'
from pathlib import Path
import re,sys
path=Path(sys.argv[1])
text=path.read_text()
run_action=r'''run_action() {
  local action="$1" payload_file="$2" raw_file="$3" result_file="$4" access_token status
  node - "$TOKEN" "$action" "$payload_file" > "$FIXTURES/request-${action}.json" <<'NODE'
const fs=require('fs');
const token=process.argv[2],action=process.argv[3],payloadPath=process.argv[4];
const payload=payloadPath&&fs.existsSync(payloadPath)?JSON.parse(fs.readFileSync(payloadPath,'utf8')):{};
process.stdout.write(JSON.stringify({token,action,payload}));
NODE
  access_token="$(apps_script_access_token)"
  status="$(curl -sS -L --location-trusted --max-time 60 -o "$raw_file" -w '%{http_code}' \
    -H "Authorization: Bearer ${access_token}" \
    -H 'Content-Type: application/json' \
    --data-binary "@$FIXTURES/request-${action}.json" \
    "$ACCEPT_URL" || true)"
  printf '%s' "$status" > "${raw_file}.status"
  if grep -qi 'Authorization needed\|Review Permissions' "$raw_file"; then
    printf '%s' "$ACCEPT_URL" > "$EVIDENCE/authorization-required-url.txt"
    echo "HOLD — one-time Google authorization is required at ${ACCEPT_URL}" >&2
    return 78
  fi
  if [[ "$status" != "200" ]]; then
    echo "HOLD — authenticated web execution returned HTTP ${status} for ${action}." >&2
    return 79
  fi
  python3 - "$raw_file" "$result_file" <<'PYRESP'
import json,sys
raw,result=sys.argv[1:3]
text=open(raw,encoding='utf-8-sig').read().strip()
first=text.find('{'); last=text.rfind('}')
if first < 0 or last < first:
    raise SystemExit('Authenticated web execution returned no JSON: '+text[:400])
response=json.loads(text[first:last+1])
if response.get('ok') is not True:
    raise SystemExit(str(response.get('error') or 'Authenticated web execution returned HOLD.'))
with open(result,'w',encoding='utf-8') as out:
    json.dump(response.get('result'),out,indent=2)
    out.write('\n')
PYRESP
  test -s "$result_file"
}

'''
text,count=re.subn(r'run_action\(\) \{.*?\n\}\n\n(?=apps_script_access_token\(\))',run_action,text,count=1,flags=re.S)
if count!=1: raise SystemExit('HOLD — v2 run_action block was not found.')
text=text.replace("m.webapp={executeAs:'USER_ACCESSING',access:'ANYONE'};\nm.executionApi={access:'MYSELF'};", "m.webapp={executeAs:'USER_ACCESSING',access:'ANYONE'};\ndelete m.executionApi;")
needle='''printf '%s' "$ACCEPT_DEPLOYMENT_ID" > "$EVIDENCE/acceptance-deployment-id.txt"
trap 'delete_deployment "$SCRIPT_ID" "$ACCEPT_DEPLOYMENT_ID" || true' EXIT'''
replacement='''printf '%s' "$ACCEPT_DEPLOYMENT_ID" > "$EVIDENCE/acceptance-deployment-id.txt"
ACCEPT_URL="https://script.google.com/macros/s/${ACCEPT_DEPLOYMENT_ID}/exec"
printf '%s' "$ACCEPT_URL" > "$EVIDENCE/acceptance-url.txt"
printf '%s' "$ACCEPT_URL" > "$EVIDENCE/authorization-required-url.txt"'''
if needle not in text: raise SystemExit('HOLD — acceptance deployment marker missing.')
text=text.replace(needle,replacement,1)
text=text.replace('''delete_deployment "$SCRIPT_ID" "$ACCEPT_DEPLOYMENT_ID"
trap - EXIT''','''delete_deployment "$SCRIPT_ID" "$ACCEPT_DEPLOYMENT_ID"
rm -f "$EVIDENCE/authorization-required-url.txt"''',1)
path.write_text(text)
PY

chmod +x "$PATCHED"
bash "$PATCHED"
