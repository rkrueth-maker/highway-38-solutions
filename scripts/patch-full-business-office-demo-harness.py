#!/usr/bin/env python3
"""Patch the established authorized acceptance harness for the controlled full demo."""
from pathlib import Path
import sys
import textwrap

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-full-business-office-demo-harness.py <harness-path>")

path = Path(sys.argv[1])
text = path.read_text()

wrong_id = "13Bes6_rs3LD-Sch4Vi5DKssCnIU_qb4hzZpGpDVfoRELRAk0HtXEJ7o"
correct_id = "13Bes6_rs3LD-Sch4Vi5DKssCnlU_qb4hzZpGpDVfoRELRak0htXEj7O-"
if wrong_id not in text:
    raise SystemExit("authorized Owner Portal project identifier marker was not found")
text = text.replace(wrong_id, correct_id, 1)

old_assembly = textwrap.dedent('''
cp -a "$OWNER_BACKUP/." "$OWNER_HARNESS/"
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$OWNER_HARNESS/"
cp "$REPO_ROOT/apps-script/business-office/BusinessOffice_Index.html" "$OWNER_HARNESS/"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$OWNER_HARNESS/"
''').strip()
new_assembly = textwrap.dedent('''
cp -a "$OWNER_BACKUP/." "$OWNER_HARNESS/"
# clasp pull writes Apps Script source as .js. Remove every pulled Business Office
# file, including ZZ_/ZZZ_ compatibility names, before copying canonical source.
find "$OWNER_HARNESS" -maxdepth 1 -type f \\
  \( -name '*BusinessOffice_*.js' -o -name '*BusinessOffice_*.gs' -o -name '*BusinessOffice_*.html' \) \\
  -delete
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$OWNER_HARNESS/"
cp "$REPO_ROOT"/apps-script/business-office/*.html "$OWNER_HARNESS/"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$OWNER_HARNESS/"
''').strip()
if old_assembly not in text:
    raise SystemExit("authorized harness source-assembly block was not found")
text = text.replace(old_assembly, new_assembly, 1)

old_rename = textwrap.dedent('''
from pathlib import Path
path=Path(__import__('sys').argv[1])
text=path.read_text()
text=text.replace('function doGet() {','function boHarnessDoGet_() {')
path.write_text(text)
''').strip()
new_rename = textwrap.dedent('''
from pathlib import Path
import re
path=Path(__import__('sys').argv[1])
text=path.read_text()
text,count=re.subn(r'function\s+doGet\s*\(', 'function boHarnessDoGet_(', text, count=1)
if count != 1:
    raise SystemExit('Business Office doGet rename failed.')
path.write_text(text)
''').strip()
if old_rename not in text:
    raise SystemExit("authorized harness doGet rename block was not found")
text = text.replace(old_rename, new_rename, 1)

marker = "# 4. Generate compact but legible real image and PDF fixtures."
if marker not in text:
    raise SystemExit("authorized harness demo insertion marker was not found")

block = textwrap.dedent(r'''
# Controlled full Business Office demo through the already-authorized runtime.
FULL_DEMO_EVIDENCE="$REPO_ROOT/artifacts/full-business-office-demo"
mkdir -p "$FULL_DEMO_EVIDENCE"
run_harness_function boPrepareFullApprovedBusinessOfficeDemo '[]' "$FULL_DEMO_EVIDENCE/prepare.txt"
node -e "const r=require('./artifacts/full-business-office-demo/prepare.json');if(r.status!=='PASS'||r.projectCount!==7)throw new Error('Full demo preparation failed.')"

for start in 0 2 4 6; do
  run_harness_function boRunFullApprovedBusinessOfficeDemoAgentBatch "[$start,2]" "$FULL_DEMO_EVIDENCE/agents-${start}.txt"
  node - "$FULL_DEMO_EVIDENCE/agents-${start}.json" <<'NODE'
const r=require(process.argv[2]);
if(r.status!=='PASS'||r.processed<1||r.processed>2)throw new Error('Agent batch failed: '+JSON.stringify(r));
NODE
done

for start in 0 3 6; do
  run_harness_function boRunFullApprovedBusinessOfficeDemoEmailBatch "[$start,3]" "$FULL_DEMO_EVIDENCE/emails-${start}.txt"
  node - "$FULL_DEMO_EVIDENCE/emails-${start}.json" <<'NODE'
const r=require(process.argv[2]);
if(r.status!=='PASS'||r.processed<1||r.processed>3)throw new Error('Email batch failed: '+JSON.stringify(r));
NODE
done

run_harness_function boFinalizeFullApprovedBusinessOfficeDemo '[]' "$FULL_DEMO_EVIDENCE/finalize.txt"
cp "$FULL_DEMO_EVIDENCE/finalize.json" "$FULL_DEMO_EVIDENCE/result.json"
node - "$FULL_DEMO_EVIDENCE/result.json" <<'NODE'
const fs=require('fs');
const r=require(process.argv[2]);
const failures=[];
if(r.status!=='PASS')failures.push('status');
if(r.projectCount!==7)failures.push('projectCount');
if(r.agentCount!==8)failures.push('agentCount');
if(r.approvedEmailCount!==8)failures.push('approvedEmailCount');
if(!(r.approvedRecipients||[]).includes('rkrueth@gmail.com'))failures.push('owner recipient');
if(!(r.approvedRecipients||[]).includes('highway38solutions@gmail.com'))failures.push('H38 recipient');
for(const key of ['financialExternalActions','moneyMoved','payrollFunded','taxesFiled','supplierOrdersTransmitted','publicPublishingPerformed'])if(r[key]!==false)failures.push(key);
const report={status:failures.length?'HOLD':'PASS',sourceCommit:process.env.GITHUB_SHA||'',result:r,failures};
fs.writeFileSync('artifacts/full-business-office-demo/verification.json',JSON.stringify(report,null,2)+'\n');
if(failures.length)throw new Error('Full demo verification failed: '+failures.join(', '));
console.log(JSON.stringify(report,null,2));
NODE

# Restore the authorized Owner Portal development source immediately after the demo.
cp -a "$OWNER_BACKUP/." "$OWNER_RESTORE/"
rm -f "$OWNER_RESTORE/BusinessOffice_Sync.js" "$OWNER_RESTORE/BusinessOffice_Sync.gs"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$OWNER_RESTORE/"
(cd "$OWNER_RESTORE" && clasp push --force) 2>&1 | tee "$FULL_DEMO_EVIDENCE/owner-restore-push.txt"
(cd "$OWNER_RESTORE" && clasp list-deployments) 2>&1 | tee "$FULL_DEMO_EVIDENCE/owner-deployments-after.txt"
grep -F "$OWNER_DEPLOYMENT_ID" "$FULL_DEMO_EVIDENCE/owner-deployments-after.txt" >/dev/null
BEFORE_LINE="$(grep -F "$OWNER_DEPLOYMENT_ID" "$EVIDENCE/owner-deployments-before.txt")"
AFTER_LINE="$(grep -F "$OWNER_DEPLOYMENT_ID" "$FULL_DEMO_EVIDENCE/owner-deployments-after.txt")"
test "$BEFORE_LINE" = "$AFTER_LINE"
exit 0
''').strip()

text = text.replace(marker, block + "\n\n" + marker, 1)
path.write_text(text)
print(f"Patched authorized full demo harness: {path}")
