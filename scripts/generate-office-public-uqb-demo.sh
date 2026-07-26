#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
RUNNER_TEMP_DIR="${RUNNER_TEMP:?RUNNER_TEMP is required}"
DEPLOYMENT="$REPO_ROOT/business-packs/highway38/deployment.json"
WORK="$RUNNER_TEMP_DIR/h38-uqb-public-demo"
EVIDENCE="$REPO_ROOT/artifacts/office-public-uqb-demo"
RUN_KEY="PUBLIC-NEW-HOUSE-DEMO-V1"
MAX_STEPS=32

rm -rf "$WORK" "$EVIDENCE"
mkdir -p "$WORK" "$EVIDENCE"

read_config() {
  node - "$DEPLOYMENT" "$1" <<'NODE'
const fs=require('fs');
const [file,path]=process.argv.slice(2);
let value=JSON.parse(fs.readFileSync(file,'utf8'));
for(const key of path.split('.'))value=value?.[key];
if(value==null||value==='')throw new Error(`Missing deployment setting ${path}`);
process.stdout.write(String(value));
NODE
}

parse_result() {
  local input="$1" output="$2"
  node - "$input" "$output" <<'NODE'
const fs=require('fs');
const [input,output]=process.argv.slice(2);
const raw=fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'');
const candidates=[];
for(let start=raw.indexOf('{');start>=0;start=raw.indexOf('{',start+1)){
  for(let end=raw.lastIndexOf('}');end>start;end=raw.lastIndexOf('}',end-1)){
    try{candidates.push(JSON.parse(raw.slice(start,end+1)));break;}catch(error){}
  }
}
if(!candidates.length)throw new Error(`No JSON result found in ${input}: ${raw.slice(0,1200)}`);
let value=candidates.find(item=>item&&typeof item==='object'&&('response' in item||'complete' in item||'status' in item))||candidates[0];
if(value&&typeof value==='object'&&Object.prototype.hasOwnProperty.call(value,'error')&&value.error){
  throw new Error(`Apps Script execution error: ${JSON.stringify(value.error)}`);
}
if(value&&typeof value==='object'&&Object.prototype.hasOwnProperty.call(value,'response'))value=value.response;
if(typeof value==='string'){
  try{value=JSON.parse(value);}catch(error){}
}
if(!value||typeof value!=='object')throw new Error(`Apps Script returned an invalid result: ${JSON.stringify(value)}`);
fs.writeFileSync(output,JSON.stringify(value,null,2)+'\n');
NODE
}

run_function() {
  local function_name="$1" params="$2" output="$3"
  set +e
  (cd "$WORK" && clasp run-function "$function_name" --params "$params" --nondev --json) >"$output" 2>&1
  local status=$?
  set -e
  cat "$output"
  if [[ $status -ne 0 ]]; then
    echo "HOLD — clasp run-function ${function_name} failed with status ${status}." >&2
    exit "$status"
  fi
}

SCRIPT_ID="$(read_config appsScript.productionProjectId)"
BUSINESS_DEPLOYMENT_ID="$(read_config appsScript.businessOfficeDeploymentId)"
printf '{"scriptId":"%s","rootDir":"."}\n' "$SCRIPT_ID" > "$WORK/.clasp.json"

# Pull the actual authorized project before using the Execution API. A bare
# .clasp.json is not sufficient because clasp also needs the deployed manifest
# and executionApi configuration.
set +e
(cd "$WORK" && clasp pull) >"$EVIDENCE/project-pull.txt" 2>&1
PULL_STATUS=$?
set -e
cat "$EVIDENCE/project-pull.txt"
if [[ $PULL_STATUS -ne 0 ]]; then
  echo "HOLD — could not pull the existing authorized H38 Apps Script project." >&2
  exit "$PULL_STATUS"
fi

test -f "$WORK/appsscript.json"
node - "$WORK/appsscript.json" "$SCRIPT_ID" <<'NODE'
const fs=require('fs');
const [manifestPath,expectedScriptId]=process.argv.slice(2);
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(!manifest.executionApi||!manifest.executionApi.access)throw new Error('Pulled Apps Script manifest does not expose the Execution API.');
const clasp=JSON.parse(fs.readFileSync(require('path').join(require('path').dirname(manifestPath),'.clasp.json'),'utf8'));
if(clasp.scriptId!==expectedScriptId)throw new Error('Pulled project does not match the configured H38 production project.');
console.log(`PASS — pulled authorized H38 project; executionApi=${manifest.executionApi.access}.`);
NODE
(cd "$WORK" && clasp show-authorized-user --json) >"$EVIDENCE/authorized-user.json" 2>&1 || true
(cd "$WORK" && clasp list-deployments --json) >"$EVIDENCE/deployments.json" 2>&1 || true
grep -F "$BUSINESS_DEPLOYMENT_ID" "$EVIDENCE/deployments.json" >/dev/null

PARAMS="[\"$RUN_KEY\"]"
complete=false
for step in $(seq 1 "$MAX_STEPS"); do
  txt="$EVIDENCE/step-$(printf '%02d' "$step").txt"
  json="$EVIDENCE/step-$(printf '%02d' "$step").json"
  run_function boUniversalPublicDemoStep "$PARAMS" "$txt"
  parse_result "$txt" "$json"
  node - "$json" <<'NODE'
const r=require(process.argv[2]);
if(r.externalActionsPerformed!==false)throw new Error('Public demo generation reported an external action.');
if(!r.counts||!r.expected)throw new Error('Public demo generation did not return count evidence.');
console.log(`Office demo ${r.progressPercent}% — phase ${r.phase} — ${JSON.stringify(r.counts)}`);
NODE
  if node - "$json" <<'NODE'
const r=require(process.argv[2]);process.exit(r.complete===true?0:1);
NODE
  then complete=true; cp "$json" "$EVIDENCE/final-generation.json"; break; fi
done

if [[ "$complete" != true ]]; then
  echo "HOLD — Office public demo did not complete in $MAX_STEPS controlled calls." >&2
  exit 1
fi

STATUS_TXT="$EVIDENCE/status.txt"
STATUS_JSON="$EVIDENCE/status.json"
run_function boUniversalPublicDemoStatus "$PARAMS" "$STATUS_TXT"
parse_result "$STATUS_TXT" "$STATUS_JSON"
node - "$STATUS_JSON" <<'NODE'
const r=require(process.argv[2]);
const expected={project:1,subquotes:14,items:56,scopes:84,drawings:10,documents:15,published:1};
const failures=[];
if(r.status!=='PASS'||r.complete!==true)failures.push('completion status');
if(r.externalActionsPerformed!==false)failures.push('external action boundary');
for(const [key,value] of Object.entries(expected))if(!r.counts||Number(r.counts[key])!==value)failures.push(`${key}=${r.counts&&r.counts[key]} expected ${value}`);
if(failures.length)throw new Error('Office public demo verification HOLD: '+failures.join(', '));
console.log('PASS — Office contains one published demo project, 14 quotes, 56 items, 84 scope sections, 10 attached CAD drawings, and 15 generated documents.');
NODE

PUBLIC_URL="https://script.google.com/macros/s/${BUSINESS_DEPLOYMENT_ID}/exec?publicUqbDemo=1"
printf '%s' "$PUBLIC_URL" > "$EVIDENCE/public-url.txt"
PUBLIC_STATUS="$(curl -L -sS --max-time 60 -o "$EVIDENCE/public-response.html" -w '%{http_code}' "$PUBLIC_URL" || true)"
printf '%s' "$PUBLIC_STATUS" > "$EVIDENCE/public-http-status.txt"
test "$PUBLIC_STATUS" != "404"
grep -F 'H38 Business Office Demo Results' "$EVIDENCE/public-response.html" >/dev/null
grep -F 'Office-generated result:' "$EVIDENCE/public-response.html" >/dev/null
grep -F 'CAD drawing examples from the Office drawing register' "$EVIDENCE/public-response.html" >/dev/null
grep -F 'Complete quote examples from the Office subquote records' "$EVIDENCE/public-response.html" >/dev/null
grep -F 'New-House Construction' "$EVIDENCE/public-response.html" >/dev/null
! grep -F 'Whole-House Renovation and Property Improvement' "$EVIDENCE/public-response.html" >/dev/null

node - "$STATUS_JSON" "$EVIDENCE/deployment-verification.json" "${GITHUB_SHA:-unknown}" "$PUBLIC_URL" <<'NODE'
const fs=require('fs');
const [statusFile,out,commit,url]=process.argv.slice(2),status=JSON.parse(fs.readFileSync(statusFile,'utf8'));
fs.writeFileSync(out,JSON.stringify({status:'PASS',sourceCommit:commit,sourceOfTruth:'H38 Business Office',runKey:status.runKey,projectId:status.projectId,counts:status.counts,publicUrl:url,generatedThroughOffice:true,privateFieldsExcluded:true,externalActionsPerformed:false},null,2)+'\n');
NODE
cat "$EVIDENCE/deployment-verification.json"
