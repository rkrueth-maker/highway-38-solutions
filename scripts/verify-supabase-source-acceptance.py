#!/usr/bin/env python3
from __future__ import annotations
import json, os, re, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PROJECT_REF='jqukmwtsgcsaruucnqja'
CONFIG=ROOT/'commercial-app'/'supabase-config.js'
POLICY=ROOT/'supabase'/'acceptance'/'production-policy.json'
FAIL=[]; PASS=[]
def check(label, ok, detail=''):
    (PASS if ok else FAIL).append(label if ok or not detail else f'{label}: {detail}')
    print(f"{'PASS' if ok else 'FAIL'}  {label}"+(f' — {detail}' if detail else ''))
def sha():
    if os.getenv('GITHUB_SHA'): return os.environ['GITHUB_SHA']
    try: return subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True,stderr=subprocess.DEVNULL).strip()
    except Exception: return 'unknown'
def runtime_files():
    exts={'.js','.mjs','.cjs','.ts','.tsx','.jsx','.html','.json','.toml','.kt','.java','.gradle','.xml'}
    for root in (ROOT/'commercial-app',ROOT/'supabase'/'functions',ROOT/'native'):
        if root.exists():
            for p in root.rglob('*'):
                if p.is_file() and p.suffix.lower() in exts: yield p
print(f'H38 SUPABASE SOURCE ACCEPTANCE — SHA {sha()}')
check('production Supabase config exists',CONFIG.is_file())
check('acceptance policy exists',POLICY.is_file())
ct=CONFIG.read_text('utf-8') if CONFIG.is_file() else ''
check('production project ref is pinned',f"projectRef: '{PROJECT_REF}'" in ct)
check('production URL matches project ref',f'https://{PROJECT_REF}.supabase.co' in ct)
check('Supabase-only production stage is enforced','supabase-production-only' in ct)
check('legacy Office runtime remains disabled','legacyOfficeEnabled: false' in ct)
policy={}
try:
    policy=json.loads(POLICY.read_text('utf-8')); check('acceptance policy JSON parses',True)
except Exception as e: check('acceptance policy JSON parses',False,str(e))
check('policy project ref matches production',policy.get('project_ref')==PROJECT_REF)
fb=[re.compile(x,re.I) for x in (r'\bfirebase\b',r'\bfirestore\b',r'\binitializeApp\s*\(',r'com\.google\.firebase',r'google-services\.json')]
secrets=[re.compile(x) for x in (r'SUPABASE_SERVICE_ROLE_KEY',r'SUPABASE_SECRET_KEY',r'\bsb_secret_[A-Za-z0-9_-]+')]
fbhits=[]; shits=[]
for p in runtime_files():
    text=p.read_text('utf-8',errors='ignore'); rel=p.relative_to(ROOT).as_posix()
    if any(x.search(text) for x in fb): fbhits.append(rel)
    if (rel.startswith('commercial-app/') or rel.startswith('native/')) and any(x.search(text) for x in secrets): shits.append(rel)
check('runtime contains no Firebase/Firestore dependency',not fbhits,', '.join(sorted(set(fbhits))[:12]))
check('browser/mobile source contains no Supabase server secret',not shits,', '.join(sorted(set(shits))[:12]))
froot=ROOT/'supabase'/'functions'; tracked={p.name for p in froot.iterdir() if p.is_dir()} if froot.is_dir() else set()
for slug in policy.get('forbidden_active_functions',[]): check(f'forbidden recovery function is not source-controlled: {slug}',slug not in tracked)
for slug in policy.get('required_functions',[]): check(f'required Edge Function source exists: {slug}',(froot/slug/'index.ts').is_file())
for name in ('multitenant_foundation.test.sql','security_invariants.test.sql'): check(f'database acceptance exists: {name}',(ROOT/'supabase/tests/database'/name).is_file())
check('browser config contains only publishable key','sb_publishable_' in ct)
check('browser config has no secret/service-role key',not any(x.search(ct) for x in secrets))
print(f"\nRESULT: {'FAIL' if FAIL else 'PASS'} — {len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    for x in FAIL: print('  - '+x)
    sys.exit(1)
