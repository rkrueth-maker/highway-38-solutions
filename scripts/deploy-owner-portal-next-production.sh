#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/rkrueth-maker/highway-38-solutions.git"
WORK_ROOT="${HOME}/h38-owner-portal-next-production-runtime"
SOURCE_DIR="${WORK_ROOT}/repo/apps-script/core-engine/owner-portal-next"
PROJECT_DIR="${WORK_ROOT}/apps-script-project"
TITLE="Highway 38 Owner Portal Next - PRODUCTION - $(date +%Y-%m-%d)"

: "${H38_PRODUCTION_SPREADSHEET_ID:?Set H38_PRODUCTION_SPREADSHEET_ID to the live Owner Review Portal spreadsheet ID.}"

if ! command -v clasp >/dev/null 2>&1; then
  echo "STOP — clasp is not installed."
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "STOP — git is not installed."
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "STOP — Node.js is not installed."
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "STOP — python3 is not installed."
  exit 1
fi

if [[ ! "${H38_PRODUCTION_SPREADSHEET_ID}" =~ ^[A-Za-z0-9_-]{20,}$ ]]; then
  echo "STOP — H38_PRODUCTION_SPREADSHEET_ID is not a valid spreadsheet ID."
  exit 1
fi

rm -rf "${WORK_ROOT}"
mkdir -p "${WORK_ROOT}"
git clone --depth 1 "${REPO_URL}" "${WORK_ROOT}/repo"

cd "${WORK_ROOT}/repo"
git checkout main
git pull --ff-only origin main
node scripts/verify-owner-portal-next.js

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
**/PRODUCTION_INSTALL.md
EOF

clasp push --force

DEPLOY_OUTPUT="$(clasp deploy --description "Owner Portal Next PRODUCTION owner-only runtime")"
printf '%s\n' "${DEPLOY_OUTPUT}"
DEPLOYMENT_ID="$(printf '%s\n' "${DEPLOY_OUTPUT}" | sed -nE 's/.*- ([A-Za-z0-9_-]+) @.*/\1/p' | tail -1)"

CONFIG_PARAMS="$(python3 - <<PY
import json
print(json.dumps([{
  "confirmation": "CONFIGURE OWNER-ONLY PRODUCTION ENVIRONMENT",
  "environment": "PRODUCTION",
  "spreadsheetId": "${H38_PRODUCTION_SPREADSHEET_ID}"
}]))
PY
)"

clasp run h38PortalConfigureProductionEnvironment --params "${CONFIG_PARAMS}" | tee "${WORK_ROOT}/environment-config.json"
clasp run h38PortalEnvironmentStatus | tee "${WORK_ROOT}/environment-status.json"

INSTALL_PARAMS='[{"confirmation":"INSTALL OWNER-ONLY PRODUCTION PORTAL"}]'
clasp run h38PortalInstallProduction --params "${INSTALL_PARAMS}" | tee "${WORK_ROOT}/install-output.json"

CATALOG_PARAMS="$(cd "${WORK_ROOT}/repo" && node - <<'NODE'
const fs = require('fs');
const vm = require('vm');
const cp = require('child_process');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync('catalog-data.js','utf8'), context, {filename:'catalog-data.js'});
const c = context.window.H38_CATALOG;
if (!c || !Array.isArray(c.products) || !Array.isArray(c.bundles)) throw new Error('Controlled catalog object is incomplete.');
const sourceHash = cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const classification = payment => /milestone/i.test(payment || '') ? 'Deposit and milestone balance' : /50%|deposit/i.test(payment || '') ? 'Deposit required' : /full payment/i.test(payment || '') ? 'Full payment before fulfillment' : 'Controlled payment rule';
const products = c.products.map(p => ({
  id:p.id,
  name:p.name,
  familyLabel:p.familyLabel || p.family || '',
  price:p.price,
  payment:p.payment || '',
  paymentClassification:classification(p.payment),
  turnaround:p.turnaround || '',
  revisions:p.revisions || '',
  scope:p.scope || [],
  sopReference:'H38-PROD-SOP-' + p.id.slice(-3),
  customerTemplateIds:'H38-CT-001 through H38-CT-022 as applicable',
  url:'products.html#' + (p.slug || p.id.toLowerCase()),
  sampleUrl:'sample-library-now.html#sample-' + (p.slug || p.id.toLowerCase()),
  summary:p.summary || '',
  sourceHash:sourceHash
}));
const bundles = c.bundles.map(b => {
  const components = b.products || b.productIds || b.components || [];
  return {
    id:b.id,
    name:b.name,
    familyLabel:b.familyLabel || b.family || 'Outcome Bundles',
    price:b.price,
    payment:b.payment || '',
    paymentClassification:classification(b.payment),
    turnaround:b.turnaround || 'Controlled by component products',
    revisions:b.revisions || b.revisionAllowance || 'Controlled by bundle SOP',
    products:components,
    sopReference:'H38-BUNDLE-SOP-' + b.id.slice(-3),
    customerTemplateIds:'H38-CT-001 through H38-CT-022 as applicable',
    url:'products.html#' + (b.slug || b.id.toLowerCase()),
    summary:b.summary || b.outcome || '',
    sourceHash:sourceHash
  };
});
process.stdout.write(JSON.stringify([{products,bundles,sourceHash},'IMPORT APPROVED CATALOG SNAPSHOT']));
NODE
)"

clasp run h38PortalImportCatalogPayload --params "${CATALOG_PARAMS}" | tee "${WORK_ROOT}/catalog-import.json"
clasp run h38PortalProductionReadiness | tee "${WORK_ROOT}/production-readiness.json"
clasp run h38PortalSelfTest | tee "${WORK_ROOT}/self-test-output.json"

if [[ -n "${DEPLOYMENT_ID}" ]]; then
  WEB_APP_URL="https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec"
  printf '%s\n' "${WEB_APP_URL}" | tee "${WORK_ROOT}/web-app-url.txt"
  echo "OWNER-ONLY PRODUCTION WEB APP: ${WEB_APP_URL}"
else
  echo "Production deployment created, but the deployment ID was not parsed automatically."
  echo "Run: clasp deployments"
fi

echo "Production runtime source directory: ${PROJECT_DIR}"
echo "Environment evidence: ${WORK_ROOT}/environment-status.json"
echo "Install evidence: ${WORK_ROOT}/install-output.json"
echo "Catalog evidence: ${WORK_ROOT}/catalog-import.json"
echo "Readiness evidence: ${WORK_ROOT}/production-readiness.json"
echo "Self-test evidence: ${WORK_ROOT}/self-test-output.json"
echo "Production portal installed owner-only. External sends, payment requests, publishing, ad spend, final delivery, triggers, bulk execution, and website deployment remain disabled until separately released."
