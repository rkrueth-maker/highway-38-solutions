#!/usr/bin/env bash
set -euo pipefail

copy_evidence() {
  local source="$GITHUB_WORKSPACE/artifacts/business-office-owner-web"
  local target="$GITHUB_WORKSPACE/artifacts/business-office-production-v2"
  rm -rf "$target"
  mkdir -p "$target"
  if [[ -d "$source" ]]; then cp -a "$source/." "$target/"; fi
  if [[ -f "$target/production-result.json" ]]; then
    node <<'NODE'
const fs=require('fs');
const dir='artifacts/business-office-production-v2';
const result=JSON.parse(fs.readFileSync(`${dir}/production-result.json`,'utf8'));
fs.writeFileSync(`${dir}/business-office-script-id.txt`,result.authorizedProjectId);
fs.writeFileSync(`${dir}/business-office-deployment-id.txt`,result.businessOfficeDeploymentId);
fs.writeFileSync(`${dir}/business-office-web-app-url.txt`,result.businessOfficeWebAppUrl);
fs.writeFileSync(`${dir}/intake-sync-script-id.txt`,result.authorizedProjectId);
fs.writeFileSync(`${dir}/intake-sync-deployment-id.txt`,'TIME-TRIGGER-5-MINUTES');
NODE
  fi
}

finish_production_run() {
  local rc=$?
  local target="$GITHUB_WORKSPACE/artifacts/business-office-production-v2"
  trap - EXIT
  copy_evidence || true
  if [[ "$rc" -ne 0 ]]; then
    echo "HOLD — Business Office production harness failed with exit code ${rc}."
    while IFS= read -r status_file; do
      printf '%s: ' "${status_file#$target/}"
      cat "$status_file"
      printf '\n'
    done < <(find "$target" -maxdepth 1 -type f -name '*.status' -print | sort)
    for response_file in "$target"/*-response.json; do
      [[ -f "$response_file" ]] || continue
      echo "--- ${response_file#$target/} (first 1200 bytes) ---"
      head -c 1200 "$response_file" || true
      printf '\n'
    done
  fi
  exit "$rc"
}
trap finish_production_run EXIT

# clasp pulls server-side .gs files as .js. Remove any previously pulled
# BusinessOffice_* modules from each temporary project before copying the
# current source, so two extensions never represent the same Apps Script file.
python3 - <<'PY'
from pathlib import Path
path = Path('scripts/deploy-business-office-owner-web-harness.sh')
text = path.read_text()
replacements = {
'''cp -a "$BACKUP/." "$ACCEPT/"
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$ACCEPT/"''': '''cp -a "$BACKUP/." "$ACCEPT/"
find "$ACCEPT" -maxdepth 1 -type f \( -name 'BusinessOffice_*' -o -name 'BusinessOffice_Index.html' \) -delete
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$ACCEPT/"''',
'''cp -a "$BACKUP/." "$FINAL/"
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$FINAL/"''': '''cp -a "$BACKUP/." "$FINAL/"
find "$FINAL" -maxdepth 1 -type f \( -name 'BusinessOffice_*' -o -name 'BusinessOffice_Index.html' \) -delete
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$FINAL/"''',
'''cp -a "$BACKUP/." "$RESTORE/"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$RESTORE/"''': '''cp -a "$BACKUP/." "$RESTORE/"
find "$RESTORE" -maxdepth 1 -type f \( -name 'BusinessOffice_*' -o -name 'BusinessOffice_Index.html' \) -delete
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$RESTORE/"'''
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f'Expected harness block not found: {old.splitlines()[0]}')
    text = text.replace(old, new, 1)
path.write_text(text)
PY

bash "${GITHUB_WORKSPACE:?}/scripts/deploy-business-office-owner-web-harness.sh"
copy_evidence
trap - EXIT
