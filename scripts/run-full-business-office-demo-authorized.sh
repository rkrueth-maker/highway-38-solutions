#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
EVIDENCE="$REPO_ROOT/artifacts/full-business-office-demo"
WORK="${RUNNER_TEMP:-/tmp}/h38-full-business-office-demo"
CLASP_BIN="${H38_CLASP_DIR:-}/node_modules/.bin/clasp"

if [[ ! -x "$CLASP_BIN" ]]; then CLASP_BIN="$(command -v clasp || true)"; fi
if [[ -z "$CLASP_BIN" || ! -x "$CLASP_BIN" ]]; then echo 'HOLD — clasp executable is unavailable.' >&2; exit 78; fi

rm -rf "$WORK"
mkdir -p "$WORK" "$EVIDENCE"
SCRIPT_ID="$(node -e "const d=require('./business-packs/highway38/deployment.json');process.stdout.write(d.appsScript.productionProjectId)")"
printf '{"scriptId":"%s","rootDir":"."}\n' "$SCRIPT_ID" > "$WORK/.clasp.json"

(
  cd "$WORK"
  "$CLASP_BIN" run boRunFullApprovedBusinessOfficeDemo --params '[]'
) 2>&1 | tee "$EVIDENCE/run.txt"

node - "$EVIDENCE/run.txt" "$EVIDENCE/result.json" <<'NODE'
const fs=require('fs');
const input=process.argv[2],output=process.argv[3],raw=fs.readFileSync(input,'utf8');
const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
if(start<0||end<start)throw new Error('No JSON object returned by full Business Office demo.');
const result=JSON.parse(raw.slice(start,end+1));
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
const failures=[];
if(result.status!=='PASS')failures.push('status');
if(result.projectCount!==7)failures.push('projectCount=7');
if(result.agentCount!==8)failures.push('agentCount=8');
if(result.approvedEmailCount!==8)failures.push('approvedEmailCount=8');
const recipients=result.approvedRecipients||[];
if(!recipients.includes('rkrueth@gmail.com'))failures.push('owner recipient');
if(!recipients.includes('highway38solutions@gmail.com'))failures.push('H38 recipient');
if(result.financialExternalActions!==false)failures.push('financialExternalActions=false');
if(result.moneyMoved!==false)failures.push('moneyMoved=false');
if(result.payrollFunded!==false)failures.push('payrollFunded=false');
if(result.taxesFiled!==false)failures.push('taxesFiled=false');
if(result.supplierOrdersTransmitted===true)failures.push('supplierOrdersTransmitted=false');
if(result.publicPublishingPerformed===true)failures.push('publicPublishingPerformed=false');
const verification={status:failures.length?'HOLD':'PASS',sourceCommit:process.env.GITHUB_SHA||'',marker:result.marker||'',result,failures};
fs.writeFileSync('artifacts/full-business-office-demo/verification.json',JSON.stringify(verification,null,2)+'\n');
console.log(JSON.stringify(verification,null,2));
if(failures.length)throw new Error('Full Business Office demo verification failed: '+failures.join(', '));
NODE

echo 'PASS — Full Business Office demo completed with seven projects, eight agents, and eight owner-approved internal emails.'
