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
const raw=fs.readFileSync(input,'utf8');
const candidates=[];
for(let start=raw.indexOf('{');start>=0;start=raw.indexOf('{',start+1)){
  for(let end=raw.lastIndexOf('}');end>start;end=raw.lastIndexOf('}',end-1)){
    try{candidates.push(JSON.parse(raw.slice(start,end+1)));break;}catch(error){}
  }
}
if(!candidates.length)throw new Error(`No JSON result found in ${input}: ${raw.slice(0,800)}`);
const value=candidates.find(item=>item&&typeof item==='object'&&('complete' in item||item.status))||candidates[0];
fs.writeFileSync(output,JSON.stringify(value,null,2)+'\n');
NODE
}

SCRIPT_ID="$(read_config appsScript.productionProjectId)"
BUSINESS_DEPLOYMENT_ID="$(read_config appsScript.businessOfficeDeploymentId)"
printf '{"scriptId":"%s","rootDir":"."}\n' "$SCRIPT_ID" > "$WORK/.clasp.json"

PARAMS="[\"$RUN_KEY\"]"
complete=false
for step in $(seq 1 "$MAX_STEPS"); do
  txt="$EVIDENCE/step-$(printf '%02d' "$step").txt"
  json="$EVIDENCE/step-$(printf '%02d' "$step").json"
  (cd "$WORK" && clasp run-function boUniversalPublicDemoStep --params "$PARAMS") 2>&1 | tee "$txt"
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
(cd "$WORK" && clasp run-function boUniversalPublicDemoStatus --params "$PARAMS") 2>&1 | tee "$STATUS_TXT"
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
