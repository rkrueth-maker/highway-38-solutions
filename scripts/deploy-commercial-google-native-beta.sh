#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/.." && pwd)}"
SOURCE="$REPO_ROOT/apps-script/commercial-office-beta"
REQUEST="$REPO_ROOT/commercial-beta/deploy-request.json"
STATE="$REPO_ROOT/commercial-beta/deployment-state.json"
EVIDENCE="$REPO_ROOT/artifacts/commercial-google-native-beta"
WORK="${RUNNER_TEMP:-/tmp}/commercial-google-native-beta-${GITHUB_RUN_ID:-local}"
PROJECT="$WORK/project"
EXPECTED_SCRIPT_ID="1nNYrjaH4kwCWQ2SGWMbXGxpkDgLWXXEa_vGSec9N1DjSVLzAl1Z1fxhf"
EXPECTED_DEPLOYMENT_ID="AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow"
EXPECTED_MODE="UPDATE_EXISTING_BETA_ONLY"

rm -rf "$WORK"
mkdir -p "$PROJECT" "$EVIDENCE" "$(dirname "$STATE")"
cp -R "$SOURCE"/. "$PROJECT"/

read_request() {
  node - "$REQUEST" "$1" <<'NODE'
const fs=require('fs');
const file=process.argv[2], key=process.argv[3];
if(!fs.existsSync(file)) throw new Error(`Missing deployment request: ${file}`);
const data=JSON.parse(fs.readFileSync(file,'utf8'));
const value=data[key];
process.stdout.write(value===undefined||value===null?'':String(value));
NODE
}

PROJECT_TITLE="$(read_request projectTitle)"
SCRIPT_ID="$(read_request scriptId)"
DEPLOYMENT_ID="$(read_request deploymentId)"
MODE="$(read_request mode)"
SOURCE_BRANCH="$(read_request sourceBranch)"
CREATE_PROJECT_ALLOWED="$(read_request createAppsScriptProjectAllowed)"
CREATE_DEPLOYMENT_ALLOWED="$(read_request createAppsScriptDeploymentAllowed)"
PROJECT_TITLE="${PROJECT_TITLE:-Highway 38 Commercial Office Beta}"

[[ "$MODE" == "$EXPECTED_MODE" ]] || { echo "HOLD — deployment request mode must be $EXPECTED_MODE." >&2; exit 78; }
[[ "$SOURCE_BRANCH" == "main" ]] || { echo "HOLD — commercial beta releases must deploy accepted main." >&2; exit 78; }
[[ "$SCRIPT_ID" == "$EXPECTED_SCRIPT_ID" ]] || { echo "HOLD — existing Apps Script project ID is missing or changed." >&2; exit 78; }
[[ "$DEPLOYMENT_ID" == "$EXPECTED_DEPLOYMENT_ID" ]] || { echo "HOLD — existing Apps Script deployment ID is missing or changed." >&2; exit 78; }
[[ "$CREATE_PROJECT_ALLOWED" == "false" ]] || { echo "HOLD — creating another Apps Script project is not authorized." >&2; exit 78; }
[[ "$CREATE_DEPLOYMENT_ALLOWED" == "false" ]] || { echo "HOLD — creating another Apps Script deployment is not authorized." >&2; exit 78; }

printf '{"scriptId":"%s","rootDir":"."}\n' "$SCRIPT_ID" > "$PROJECT/.clasp.json"
(cd "$PROJECT" && clasp push --force) 2>&1 | tee "$EVIDENCE/clasp-push.txt"
(cd "$PROJECT" && clasp deploy -i "$DEPLOYMENT_ID" -d "Commercial Google-native beta ${GITHUB_SHA:-local}") 2>&1 | tee "$EVIDENCE/deployment.txt"
(cd "$PROJECT" && clasp deployments) 2>&1 | tee "$EVIDENCE/deployments-after.txt"
grep -Fq "$DEPLOYMENT_ID" "$EVIDENCE/deployments-after.txt" || { echo "Existing deployment ID was not returned after update." >&2; exit 1; }

URL="https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec"
HTTP_STATUS="000"
ATTEMPT=0
for ATTEMPT in $(seq 1 18); do
  HTTP_STATUS="$(curl -L -sS -o "$EVIDENCE/response.html" -w '%{http_code}' "$URL" || true)"
  printf '%s' "$HTTP_STATUS" > "$EVIDENCE/http-status.txt"
  printf '%s\n' "attempt=${ATTEMPT} status=${HTTP_STATUS}" >> "$EVIDENCE/http-attempts.txt"
  if [[ "$HTTP_STATUS" != "404" && "$HTTP_STATUS" != "000" ]]; then break; fi
  sleep 5
done

DEPLOY_STATUS="DEPLOYED"
if [[ "$HTTP_STATUS" == "404" || "$HTTP_STATUS" == "000" ]]; then DEPLOY_STATUS="DEPLOYED_PENDING_PROPAGATION"; fi

cat > "$STATE" <<JSON
{
  "status": "${DEPLOY_STATUS}",
  "environment": "commercial-google-native-beta",
  "sourceCommit": "${GITHUB_SHA:-local}",
  "branch": "${GITHUB_REF_NAME:-main}",
  "projectTitle": "${PROJECT_TITLE}",
  "scriptId": "${SCRIPT_ID}",
  "deploymentId": "${DEPLOYMENT_ID}",
  "url": "${URL}",
  "httpStatus": "${HTTP_STATUS}",
  "httpAttempts": "${ATTEMPT}",
  "existingAppsScriptProjectUpdated": true,
  "existingDeploymentUpdated": true,
  "newAppsScriptProjectCreated": false,
  "newAppsScriptDeploymentCreated": false,
  "productionDeploymentIdsChanged": false,
  "productionDataMigrated": false,
  "externalActionsEnabled": false,
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSON

cp "$STATE" "$EVIDENCE/deployment-state.json"
cat "$STATE"
[[ "$HTTP_STATUS" != "000" ]]
