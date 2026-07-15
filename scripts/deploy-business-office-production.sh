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

# Adapt the proven owner-project acceptance harness to the separated architecture.
# Temporary acceptance and final deployment both assemble the neutral core with
# exactly one Highway 38 business pack. The live owner deployment remains pinned.
python3 - <<'PY'
from pathlib import Path
path = Path('scripts/deploy-business-office-owner-web-harness.sh')
text = path.read_text()

replacements = {
'''cp -a "$BACKUP/." "$ACCEPT/"
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$ACCEPT/"''': '''cp -a "$BACKUP/." "$ACCEPT/"
find "$ACCEPT" -maxdepth 1 -type f \\( -name 'BusinessOffice_*' -o -name 'BusinessOffice_Index.html' \\) -delete
bash "$REPO_ROOT/scripts/assemble-business-office-app.sh" "$ACCEPT" "$REPO_ROOT/business-packs/highway38/apps-script/BusinessOffice_Pack.gs" "$REPO_ROOT"''',
'''cp -a "$BACKUP/." "$FINAL/"
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$FINAL/"''': '''cp -a "$BACKUP/." "$FINAL/"
find "$FINAL" -maxdepth 1 -type f \\( -name 'BusinessOffice_*' -o -name 'BusinessOffice_Index.html' \\) -delete
bash "$REPO_ROOT/scripts/assemble-business-office-app.sh" "$FINAL" "$REPO_ROOT/business-packs/highway38/apps-script/BusinessOffice_Pack.gs" "$REPO_ROOT"''',
'''cp -a "$BACKUP/." "$RESTORE/"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$RESTORE/"''': '''cp -a "$BACKUP/." "$RESTORE/"
find "$RESTORE" -maxdepth 1 -type f \\( -name 'BusinessOffice_*' -o -name 'BusinessOffice_Index.html' \\) -delete
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$RESTORE/"''',
'''rm -f "$FINAL/BusinessOffice_AcceptanceHarness.gs"''': '''rm -f "$FINAL/BusinessOffice_Highway38AcceptanceHarness.gs" "$FINAL/BusinessOffice_Highway38Acceptance.gs"'''
}
for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f'Expected harness block not found: {old.splitlines()[0]}')
    text = text.replace(old, new, 1)

old_acceptance_setup = """python3 - \"$ACCEPT/BusinessOffice_Web.gs\" \"$ACCEPT/BusinessOffice_AcceptanceHarness.gs\" \"$TOKEN\" <<'PY'
from pathlib import Path
import sys
web=Path(sys.argv[1]); acceptance=Path(sys.argv[2]); token=sys.argv[3]
web.write_text(web.read_text().replace('function doGet() {','function boAcceptanceDoGet_() {'))
text=acceptance.read_text()
text=text.replace(\"const H38_BO_ACCEPTANCE_TOKEN_PROPERTY = 'H38_BUSINESS_OFFICE_ACCEPTANCE_TOKEN';\", \"const H38_BO_ACCEPTANCE_TOKEN = '\"+token+\"';\")
text=text.replace(\"const expected = PropertiesService.getScriptProperties().getProperty(H38_BO_ACCEPTANCE_TOKEN_PROPERTY) || '';\", \"const expected = H38_BO_ACCEPTANCE_TOKEN;\")
acceptance.write_text(text)
PY"""
new_acceptance_setup = """python3 - \"$ACCEPT/BusinessOffice_Web.gs\" \"$ACCEPT/BusinessOffice_Highway38AcceptanceHarness.gs\" \"$ACCEPT/BusinessOffice_Installer.gs\" \"$ACCEPT/BusinessOffice_Auth.gs\" \"$ACCEPT/BusinessOffice_Sync.gs\" \"$TOKEN\" <<'PY'
from pathlib import Path
import sys
web=Path(sys.argv[1]); acceptance=Path(sys.argv[2]); installer=Path(sys.argv[3]); auth=Path(sys.argv[4]); sync=Path(sys.argv[5]); token=sys.argv[6]
web.write_text(web.read_text().replace('function doGet() {','function boAcceptanceDoGet_() {'))
text=acceptance.read_text()
text=text.replace(\"const H38_BO_ACCEPTANCE_TOKEN_PROPERTY = 'H38_BUSINESS_OFFICE_ACCEPTANCE_TOKEN';\", \"const H38_BO_ACCEPTANCE_TOKEN = '\"+token+\"';\")
text=text.replace(\"const expected = PropertiesService.getScriptProperties().getProperty(H38_BO_ACCEPTANCE_TOKEN_PROPERTY) || '';\", \"const expected = H38_BO_ACCEPTANCE_TOKEN;\")
acceptance.write_text(text)
installer_text=installer.read_text()
installer_needle=\"const activeEmail=boNormalizeText_(Session.getActiveUser().getEmail()).toLowerCase()\"
installer_replacement=\"const activeEmail=boNormalizeText_(Session.getEffectiveUser().getEmail()).toLowerCase()\"
if installer_needle not in installer_text: raise SystemExit('Installer owner identity check not found')
installer.write_text(installer_text.replace(installer_needle,installer_replacement,1))
auth_text=auth.read_text()
auth_needle=\"return boNormalizeText_(Session.getActiveUser().getEmail()).toLowerCase();\"
auth_replacement=\"return boNormalizeText_(Session.getEffectiveUser().getEmail()).toLowerCase();\"
if auth_needle not in auth_text: raise SystemExit('Auth active-email function not found')
auth.write_text(auth_text.replace(auth_needle,auth_replacement,1))
sync_text=sync.read_text()
sync_needle=\"const activeEmail = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();\"
sync_replacement=\"const activeEmail = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();\"
if sync_needle not in sync_text: raise SystemExit('Sync owner identity check not found')
sync.write_text(sync_text.replace(sync_needle,sync_replacement,1))
PY"""
if old_acceptance_setup not in text:
    raise SystemExit('Expected acceptance identity setup block not found')
text = text.replace(old_acceptance_setup, new_acceptance_setup, 1)

old_work_order_fixture = "await page.setContent(html('Highway 38 Work Order',['Northwoods Sample Customer','Address Grand Rapids MN','Job Number JOB-2026-0001','Work Requested Prepare sample project plan','Assigned Employee Sample Employee','Labor 2 hours','Materials Planning packet','Due Date 2026-07-22','Status Open']));"
new_work_order_fixture = "await page.setContent(html('Highway 38 Work Order',['Northwoods Sample Customer','Address Grand Rapids MN','Job Number JOB-2026-0001',`Acceptance Run ${run}`,'Work Requested Prepare sample project plan','Assigned Employee Sample Employee','Labor 2 hours','Materials Planning packet','Due Date 2026-07-22','Status Open']));"
if old_work_order_fixture not in text:
    raise SystemExit('Expected work-order fixture block not found')
text = text.replace(old_work_order_fixture, new_work_order_fixture, 1)

path.write_text(text)
PY

bash "${GITHUB_WORKSPACE:?}/scripts/deploy-business-office-owner-web-harness.sh"
copy_evidence
trap - EXIT
