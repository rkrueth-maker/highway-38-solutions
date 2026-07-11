#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/rkrueth-maker/highway-38-solutions.git"
WORK_ROOT="${HOME}/h38-owner-portal-next-test-runtime"
SOURCE_DIR="${WORK_ROOT}/repo/apps-script/core-engine/owner-portal-next"
PROJECT_DIR="${WORK_ROOT}/apps-script-project"
TITLE="Highway 38 Owner Portal Next - TEST - $(date +%Y-%m-%d)"

: "${H38_TEST_SPREADSHEET_ID:?Set H38_TEST_SPREADSHEET_ID to the private copied Owner Portal spreadsheet ID.}"

if ! command -v clasp >/dev/null 2>&1; then
  echo "STOP — clasp is not installed."
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "STOP — git is not installed."
  exit 1
fi

rm -rf "${WORK_ROOT}"
mkdir -p "${WORK_ROOT}"
git clone --depth 1 "${REPO_URL}" "${WORK_ROOT}/repo"

node "${WORK_ROOT}/repo/scripts/verify-owner-portal-next.js"

mkdir -p "${PROJECT_DIR}"
cd "${PROJECT_DIR}"
clasp create --type standalone --title "${TITLE}" --rootDir .

if [[ ! -f .clasp.json ]]; then
  echo "STOP — clasp did not create .clasp.json. No project source or deployment was created."
  exit 1
fi

echo "Apps Script project created:"
cat .clasp.json

rm -f Code.js
cp "${SOURCE_DIR}"/*.js .
cp "${SOURCE_DIR}"/*.html .
cp "${SOURCE_DIR}/appsscript.json" .

cat > .claspignore <<'EOF'
**/*.md
**/TEST_EVIDENCE.md
EOF

clasp push --force

DEPLOY_OUTPUT="$(clasp deploy --description "Owner Portal Next TEST owner-only runtime")"
printf '%s\n' "${DEPLOY_OUTPUT}"
DEPLOYMENT_ID="$(printf '%s\n' "${DEPLOY_OUTPUT}" | sed -nE 's/.*- ([A-Za-z0-9_-]+) @.*/\1/p' | tail -1)"

CONFIG_PARAMS="$(python3 - <<PY
import json
print(json.dumps([{
  "confirmation": "CONFIGURE NON-DEPLOYED TEST ENVIRONMENT",
  "environment": "TEST",
  "spreadsheetId": "${H38_TEST_SPREADSHEET_ID}"
}]))
PY
)"

clasp run h38PortalConfigureEnvironment --params "${CONFIG_PARAMS}"
clasp run h38PortalEnvironmentStatus
clasp run h38PortalSelfTest | tee "${WORK_ROOT}/self-test-output.json"

if [[ -n "${DEPLOYMENT_ID}" ]]; then
  WEB_APP_URL="https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec"
  printf '%s\n' "${WEB_APP_URL}" | tee "${WORK_ROOT}/web-app-url.txt"
  echo "OWNER-ONLY TEST WEB APP: ${WEB_APP_URL}"
else
  echo "Deployment created, but the deployment ID was not parsed automatically."
  echo "Run: clasp deployments"
fi

echo "TEST runtime source directory: ${PROJECT_DIR}"
echo "Self-test evidence: ${WORK_ROOT}/self-test-output.json"
echo "No production spreadsheet, live workflow, trigger, customer send, payment processing, publishing, ad spend, or website deployment was enabled."
