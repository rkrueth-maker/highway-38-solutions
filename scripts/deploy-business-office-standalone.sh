#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}"
WORK="${RUNNER_TEMP:-/tmp}/business-office-standalone-${GITHUB_RUN_ID:-local}"
PROJECT="$WORK/project"
EVIDENCE="${BO_EVIDENCE_DIR:-$REPO_ROOT/artifacts/business-office-standalone}"
PACK_SOURCE="${BO_PACK_PATH:-$REPO_ROOT/business-packs/template-business/apps-script/BusinessOffice_Pack.gs}"
TITLE="${BO_PROJECT_TITLE:-Business Office}"

rm -rf "$WORK" "$EVIDENCE"
mkdir -p "$PROJECT" "$EVIDENCE"

bash "$REPO_ROOT/scripts/assemble-business-office-app.sh" "$PROJECT" "$PACK_SOURCE" "$REPO_ROOT"
rm -f "$PROJECT/BusinessOffice_AcceptanceHarness.gs" "$PROJECT/BusinessOffice_LiveAcceptance.gs" "$PROJECT/BusinessOffice_Test.gs"

if [[ -n "${BO_SCRIPT_ID:-}" ]]; then
  printf '{"scriptId":"%s","rootDir":"."}\n' "$BO_SCRIPT_ID" > "$PROJECT/.clasp.json"
else
  (cd "$PROJECT" && clasp create --type standalone --title "$TITLE" --rootDir .) 2>&1 | tee "$EVIDENCE/clasp-create.txt"
  BO_SCRIPT_ID="$(node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync('$PROJECT/.clasp.json','utf8'));process.stdout.write(x.scriptId)")"
fi

(cd "$PROJECT" && clasp push --force) 2>&1 | tee "$EVIDENCE/clasp-push.txt"
if [[ -n "${BO_DEPLOYMENT_ID:-}" ]]; then
  (cd "$PROJECT" && clasp deploy -i "$BO_DEPLOYMENT_ID" -d "Business Office standalone ${GITHUB_SHA:-local}") 2>&1 | tee "$EVIDENCE/deployment.txt"
else
  (cd "$PROJECT" && clasp create-version "Business Office standalone ${GITHUB_SHA:-local}" && clasp create-deployment --description "Business Office standalone ${GITHUB_SHA:-local}") 2>&1 | tee "$EVIDENCE/deployment.txt"
  BO_DEPLOYMENT_ID="$(grep -Eo 'AKfy[[:alnum:]_-]+' "$EVIDENCE/deployment.txt" | head -n1)"
fi

test -n "$BO_SCRIPT_ID"
test -n "$BO_DEPLOYMENT_ID"
URL="https://script.google.com/macros/s/${BO_DEPLOYMENT_ID}/exec"
STATUS="$(curl -L -sS -o "$EVIDENCE/response.html" -w '%{http_code}' "$URL" || true)"
printf '%s' "$STATUS" > "$EVIDENCE/http-status.txt"
test "$STATUS" != "404"
cat > "$EVIDENCE/deployment-result.json" <<JSON
{"status":"PASS","sourceCommit":"${GITHUB_SHA:-local}","mode":"standalone","scriptId":"${BO_SCRIPT_ID}","deploymentId":"${BO_DEPLOYMENT_ID}","url":"${URL}","packSource":"${PACK_SOURCE#$REPO_ROOT/}","dedicatedProject":true,"dedicatedDeployment":true,"externalActionsEnabled":false,"directPaymentProcessing":false,"directPayrollFunding":false,"directTaxFiling":false}
JSON
cat "$EVIDENCE/deployment-result.json"
