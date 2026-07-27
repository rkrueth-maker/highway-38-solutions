#!/usr/bin/env python3
"""Safely patch the established authorized Business Office acceptance harness."""
from pathlib import Path
import sys
import textwrap

if len(sys.argv) != 2:
    raise SystemExit("usage: patch-business-office-authorized-harness-base.py <harness-path>")

path = Path(sys.argv[1])
text = path.read_text()

authorized_id = 'OWNER_SCRIPT_ID="13Bes6_rs3LD-Sch4Vi5DKssCnIU_qb4hzZpGpDVfoRELRAk0HtXEJ7o"'
if authorized_id not in text:
    raise SystemExit("established authorized Owner Portal execution project was not found")

old_assembly = textwrap.dedent('''
cp -a "$OWNER_BACKUP/." "$OWNER_HARNESS/"
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$OWNER_HARNESS/"
cp "$REPO_ROOT/apps-script/business-office/BusinessOffice_Index.html" "$OWNER_HARNESS/"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$OWNER_HARNESS/"
''').strip()
new_assembly = textwrap.dedent('''
cp -a "$OWNER_BACKUP/." "$OWNER_HARNESS/"
# clasp pull writes Apps Script sources as .js. Remove all pulled Business Office
# names, including ZZ_/ZZZ_ compatibility files, before copying canonical source.
find "$OWNER_HARNESS" -maxdepth 1 -type f \\
  \( -name '*BusinessOffice_*.js' -o -name '*BusinessOffice_*.gs' -o -name '*BusinessOffice_*.html' \) \\
  -delete
cp "$REPO_ROOT"/apps-script/business-office/*.gs "$OWNER_HARNESS/"
cp "$REPO_ROOT"/apps-script/business-office/*.html "$OWNER_HARNESS/"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$OWNER_HARNESS/"
''').strip()
if old_assembly not in text:
    raise SystemExit("authorized harness source assembly block was not found")
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

old_restore = textwrap.dedent('''
cp -a "$OWNER_BACKUP/." "$OWNER_RESTORE/"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$OWNER_RESTORE/"
''').strip()
new_restore = textwrap.dedent('''
cp -a "$OWNER_BACKUP/." "$OWNER_RESTORE/"
rm -f "$OWNER_RESTORE/BusinessOffice_Sync.js" "$OWNER_RESTORE/BusinessOffice_Sync.gs"
cp "$REPO_ROOT/apps-script/business-office-sync/BusinessOffice_Sync.gs" "$OWNER_RESTORE/"
''').strip()
if old_restore not in text:
    raise SystemExit("authorized harness restore block was not found")
text = text.replace(old_restore, new_restore, 1)

path.write_text(text)
print(f"Patched authorized Business Office acceptance harness: {path}")
