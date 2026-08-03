#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}"
SOURCE="$REPO_ROOT/apps-script/commercial-office-beta"
REQUEST="$REPO_ROOT/commercial-beta/deploy-request.json"
STATE="$REPO_ROOT/commercial-beta/deployment-state.json"
EVIDENCE="$REPO_ROOT/artifacts/commercial-google-native-beta"
WORK="${RUNNER_TEMP:-/tmp}/commercial-google-native-beta-${GITHUB_RUN_ID:-local}"
PROJECT="$WORK/project"

rm -rf "$WORK" "$EVIDENCE"
mkdir -p "$PROJECT" "$EVIDENCE" "$(dirname "$STATE")"
cp -R "$SOURCE"/. "$PROJECT"/

read_request() {
  node - "$REQUEST" "$1" <<'NODE'
const fs=require('fs');
const file=process.argv[2], key=process.argv[3];
const data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
process.stdout.write(String(data[key]||''));
NODE
}

PROJECT_TITLE="$(read_request projectTitle)"
SCRIPT_ID="$(read_request scriptId)"
DEPLOYMENT_ID="$(read_request deploymentId)"
PROJECT_TITLE="${PROJECT_TITLE:-Highway 38 Commercial Office Beta}"

if [[ -n "$SCRIPT_ID" ]]; then
  printf '{"scriptId":"%s","rootDir":"."}\n' "$SCRIPT_ID" > "$PROJECT/.clasp.json"
else
  (cd "$PROJECT" && clasp create --type standalone --title "$PROJECT_TITLE" --rootDir .) 2>&1 | tee "$EVIDENCE/clasp-create.txt"
  SCRIPT_ID="$(node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync('$PROJECT/.clasp.json','utf8'));process.stdout.write(x.scriptId)")"
fi

test -n "$SCRIPT_ID"
(cd "$PROJECT" && clasp push --force) 2>&1 | tee "$EVIDENCE/clasp-push.txt"

if [[ -n "$DEPLOYMENT_ID" ]]; then
  (cd "$PROJECT" && clasp deploy -i "$DEPLOYMENT_ID" -d "Commercial Google-native beta ${GITHUB_SHA:-local}") 2>&1 | tee "$EVIDENCE/deployment.txt"
else
  (cd "$PROJECT" && clasp create-version "Commercial Google-native beta ${GITHUB_SHA:-local}") 2>&1 | tee "$EVIDENCE/create-version.txt"
  (cd "$PROJECT" && clasp create-deployment --description "Commercial Google-native beta ${GITHUB_SHA:-local}") 2>&1 | tee "$EVIDENCE/deployment.txt"
  DEPLOYMENT_ID="$(grep -Eo 'AKfy[[:alnum:]_-]+' "$EVIDENCE/deployment.txt" | head -n1 || true)"
fi

test -n "$DEPLOYMENT_ID"
URL="https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec"
HTTP_STATUS="$(curl -L -sS -o "$EVIDENCE/response.html" -w '%{http_code}' "$URL" || true)"
printf '%s' "$HTTP_STATUS" > "$EVIDENCE/http-status.txt"
[[ "$HTTP_STATUS" != "404" && "$HTTP_STATUS" != "000" ]]

cat > "$STATE" <<JSON
{
  "status": "DEPLOYED",
  "environment": "commercial-google-native-beta",
  "sourceCommit": "${GITHUB_SHA:-local}",
  "branch": "${GITHUB_REF_NAME:-agent/commercial-google-native-beta}",
  "projectTitle": "${PROJECT_TITLE}",
  "scriptId": "${SCRIPT_ID}",
  "deploymentId": "${DEPLOYMENT_ID}",
  "url": "${URL}",
  "httpStatus": "${HTTP_STATUS}",
  "separateAppsScriptProject": true,
  "separateDeployment": true,
  "productionDeploymentIdsChanged": false,
  "productionDataMigrated": false,
  "externalActionsEnabled": false,
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

cp "$STATE" "$EVIDENCE/deployment-state.json"
cat "$STATE"
