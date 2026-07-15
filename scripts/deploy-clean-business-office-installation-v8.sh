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
  status="$(curl -sS -L --location-trusted --max-time 300 -o "$raw_file" -w '%{http_code}' \
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
  if [[ -n "$status" && "$status" != "200" ]]; then
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
pattern=r'run_action\(\) \{.*?\n\}\n\n(?=apps_script_access_token\(\))'
text,count=re.subn(pattern,lambda match: run_action,text,count=1,flags=re.S)
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

prune_needle='''(cd "$PROJECT" && clasp create-version "Clean Business Office authenticated acceptance ${SOURCE_SHA}") 2>&1 | tee "$EVIDENCE/acceptance-version.txt"'''
prune_replacement=r'''prune_stale_deployments() {
  local access_token inventory plan preserve_id
  access_token="$(apps_script_access_token)"
  inventory="$EVIDENCE/deployment-inventory-before-prune.json"
  plan="$EVIDENCE/deployment-prune-plan.json"
  preserve_id="${CLEAN_PRESERVE_DEPLOYMENT_ID:-AKfycbzBrvPgmRN0ov_35wkKS2Jv798kYSndGBdLbSTsoM5NtSDtFZG6R8KlBYVekOZkZHi5}"
  curl --fail --silent --show-error \
    -H "Authorization: Bearer ${access_token}" \
    "https://script.googleapis.com/v1/projects/${SCRIPT_ID}/deployments?pageSize=200" > "$inventory"
  node - "$inventory" "$preserve_id" "$plan" <<'NODE'
const fs=require('fs');
const [inventoryPath,preserveId,planPath]=process.argv.slice(2);
const data=JSON.parse(fs.readFileSync(inventoryPath,'utf8'));
const deployments=Array.isArray(data.deployments)?data.deployments:[];
const versioned=deployments.filter(item=>Number(item.deploymentConfig&&item.deploymentConfig.versionNumber||0)>0);
const ordered=[...versioned].sort((a,b)=>String(a.updateTime||'').localeCompare(String(b.updateTime||'')));
const selected=[];
const selectedIds=new Set();
function add(item,reason){
  if(!item||!item.deploymentId||item.deploymentId===preserveId||selectedIds.has(item.deploymentId))return;
  selectedIds.add(item.deploymentId);
  selected.push({deploymentId:item.deploymentId,description:String(item.deploymentConfig&&item.deploymentConfig.description||''),versionNumber:Number(item.deploymentConfig&&item.deploymentConfig.versionNumber||0),updateTime:item.updateTime||'',reason});
}
for(const item of ordered){
  const description=String(item.deploymentConfig&&item.deploymentConfig.description||'');
  if(description.startsWith('Clean Business Office authenticated acceptance '))add(item,'stale acceptance deployment');
}
let remaining=versioned.length-selected.length;
for(const item of ordered){
  if(remaining<=17)break;
  const description=String(item.deploymentConfig&&item.deploymentConfig.description||'');
  if(description.startsWith('North Star Test Company Business Office final ')){
    const before=selected.length;
    add(item,'obsolete final deployment; accepted final preserved');
    if(selected.length>before)remaining--;
  }
}
const plan={status:'INVENTORIED',preserveDeploymentId:preserveId,beforeVersionedDeploymentCount:versioned.length,targetMaximumBeforeRun:17,deleteCount:selected.length,delete:selected,retained:versioned.filter(item=>!selectedIds.has(item.deploymentId)).map(item=>({deploymentId:item.deploymentId,description:String(item.deploymentConfig&&item.deploymentConfig.description||''),versionNumber:Number(item.deploymentConfig&&item.deploymentConfig.versionNumber||0),updateTime:item.updateTime||'',preserved:item.deploymentId===preserveId}))};
fs.writeFileSync(planPath,JSON.stringify(plan,null,2)+'\n');
if(versioned.length-selected.length>17)throw new Error('Unable to free enough versioned deployment slots without deleting an unclassified deployment.');
NODE
  node - "$plan" <<'NODE' | while IFS= read -r deployment_id; do
const plan=require(process.argv[2]);
for(const item of plan.delete||[])console.log(item.deploymentId);
NODE
    [[ -n "$deployment_id" ]] || continue
    delete_deployment "$SCRIPT_ID" "$deployment_id"
  done
  curl --fail --silent --show-error \
    -H "Authorization: Bearer ${access_token}" \
    "https://script.googleapis.com/v1/projects/${SCRIPT_ID}/deployments?pageSize=200" > "$EVIDENCE/deployment-inventory-after-prune.json"
}

prune_stale_deployments
(cd "$PROJECT" && clasp create-version "Clean Business Office authenticated acceptance ${SOURCE_SHA}") 2>&1 | tee "$EVIDENCE/acceptance-version.txt"'''
if prune_needle not in text: raise SystemExit('HOLD — acceptance version marker missing.')
text=text.replace(prune_needle,prune_replacement,1)

final_check=r'''if [[ "$FINAL_STATUS" = "200" ]] && grep -Eqi 'ReferenceError|TypeError|Exception:|Highway[[:space:]]*38|\bH38\b|rkrueth-maker|highway-38-solutions' "$EVIDENCE/final-http.html"; then echo 'Final clean deployment returned an error or Highway 38 leakage.' >&2; exit 1; fi'''
final_replacement=r'''if [[ "$FINAL_STATUS" = "200" ]]; then
  if grep -Eqi 'accounts\.google\.com/(v3/)?signin|Google Accounts|identifierId' "$EVIDENCE/final-http.html"; then
    printf '%s\n' 'AUTHORIZED_SIGN_IN_REQUIRED' > "$EVIDENCE/final-http-classification.txt"
  elif grep -Eqi 'ReferenceError|TypeError|Exception:|Highway[[:space:]]*38|\bH38\b|rkrueth-maker|highway-38-solutions' "$EVIDENCE/final-http.html"; then
    echo 'Final clean deployment returned an error or Highway 38 leakage.' >&2
    exit 1
  else
    printf '%s\n' 'APPLICATION_RESPONSE' > "$EVIDENCE/final-http-classification.txt"
  fi
fi'''
if final_check not in text: raise SystemExit('HOLD — final deployment response check missing.')
text=text.replace(final_check,final_replacement,1)
path.write_text(text)
PY

chmod +x "$PATCHED"
bash "$PATCHED"
