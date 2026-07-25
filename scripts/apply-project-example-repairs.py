#!/usr/bin/env python3
from pathlib import Path
import json

root=Path(__file__).resolve().parents[1]
mapping={
    'flower-after-same-house.svg':'flower-after-same-house.webp',
    'irrigation-before-clean.svg':'irrigation-before-clean.webp',
    'irrigation-after-clean.svg':'irrigation-after-clean.webp',
    '20260724-same-house-v1':'20260724-raster-v3',
    '20260724-clean-labels-v1':'20260724-raster-v3',
}
for name in ('sample-library-now.html','flower-garden-quote-complete.html'):
    path=root/name
    text=path.read_text()
    for old,new in mapping.items():
        text=text.replace(old,new)
    path.write_text(text)

path=root/'contractor-quote-complete.html'
text=path.read_text()
text=text.replace("after:A+'flower-after.png'","after:A+'flower-after-same-house.webp?v=20260724-raster-v3'")
text=text.replace("before:D+'irrigation-before.webp?v=20260722-direct-v2'","before:D+'irrigation-before-clean.webp?v=20260724-raster-v3'")
text=text.replace("after:D+'irrigation-after.webp?v=20260722-direct-v2'","after:D+'irrigation-after-clean.webp?v=20260724-raster-v3'")
text=text.replace("flower:{n:'Q-DEMO-001',t:'Flower Garden Transformation',b:2850","flower:{n:'Q-DEMO-001',t:'Flower Garden Transformation',b:3950")
text=text.replace("inc:['Layout and mark bed edges','Remove sod and vegetation','Prepare planting bed','Install plants, edging, and mulch','Cleanup and edge restoration']","inc:['Layout and mark bed edges','Remove sod and vegetation','Prepare planting bed','Install plants and natural-stone edging','Mulch, cleanup, and edge restoration']")
text=text.replace("['Mulch and cleanup','Mulch, finish grading, cleanup',1,'LS',660]","['Stone edging','Natural-stone curved bed edge shown in concept',1,'LS',1100],['Mulch and cleanup','Mulch, finish grading, cleanup',1,'LS',660]")
text=text.replace("ups:[['Drip irrigation zone','Add one drip zone',850],['Natural-stone edging','Upgrade edging material',1100]]","ups:[['Drip irrigation zone','Add one drip zone',850],['Low-voltage garden lighting','Add garden lighting',575]]")
path.write_text(text)

manifest_path=root/'scripts/config/approved-public-image-placements.json'
manifest=json.loads(manifest_path.read_text())
manifest['policyVersion']='2026-07-24-direct-raster-visual-gate-v3'
manifest['placementChangePolicy']['requirements']=[
    'owner-directed-visual-change-or-objective-placement-defect',
    'one-controlled-branch-and-one-integrated-pull-request',
    'direct-raster-files-for-photographic-project-images',
    'record-page-section-old-placement-new-placement-and-reason',
    'update-page-manifest-verifier-browser-checks-and-live-checks-together',
    'capture-desktop-mobile-and-per-image-render-evidence',
]
if not any(item.get('reason','').startswith('Owner-directed repair after live Chrome review') for item in manifest['placementChanges']):
    manifest['placementChanges'].append({
        'date':'2026-07-24',
        'page':'sample-library-now.html, flower-garden-quote-complete.html, and contractor-quote-complete.html',
        'section':'Flower garden and four-zone irrigation before/after visuals',
        'oldPlacement':'SVG photo wrappers and a drawn flower concept that could pass path checks while rendering blank or visually incorrect',
        'newPlacement':'Direct WebP files with the same-house flower scene and label-free irrigation photographs',
        'reason':'Owner-directed repair after live Chrome review showed a cartoon flower concept and blank irrigation panels despite technical PASS',
        'binaryPolicy':'Raster derivatives were generated from repository source images. The flower preserves the existing-house upper scene; irrigation removes only the embedded label edge. Original sources remain for rollback.',
    })
for item in manifest['pages']['sample-library-now.html']:
    if item['role']=='example-01-after': item.update(src='assets/contractor-demo/flower-after-same-house.webp',alt='Flower garden after at the same house')
    if item['role']=='example-06-before': item['src']='assets/demo-workthroughs/irrigation-before-clean.webp'
    if item['role']=='example-06-after': item['src']='assets/demo-workthroughs/irrigation-after-clean.webp'
manifest['dynamicPages']['contractor-quote-complete.html']['examples']['flower']=['flower-before.png','flower-after-same-house.webp']
manifest['dynamicPages']['contractor-quote-complete.html']['examples']['irrigation']=['irrigation-before-clean.webp','irrigation-after-clean.webp']
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')

for name in ('scripts/config/approved-public-image-placement-overrides.json','scripts/apply-public-image-placement-overrides.py'):
    obsolete=root/name
    if obsolete.exists(): obsolete.unlink()

path=root/'scripts/verify-public-image-placements.js'
text=path.read_text()
for old,new in mapping.items(): text=text.replace(old,new)
anchor="check('same-house flower concept is the approved sample image',samplePage.includes('assets/contractor-demo/flower-after-same-house.webp')&&samplePage.includes('alt=\"Flower garden after at the same house\"'));"
if anchor in text and 'project photographs use direct raster files' not in text:
    text=text.replace(anchor,anchor+"\ncheck('project photographs use direct raster files',!/(flower-after-same-house|irrigation-before-clean|irrigation-after-clean)\\.svg/.test(samplePage+contractorPage)&&/(flower-after-same-house|irrigation-before-clean|irrigation-after-clean)\\.webp/.test(samplePage+contractorPage));")
path.write_text(text)

path=root/'scripts/browser-commercial-smoke.sh'
text=path.read_text().replace('irrigation-before.webp irrigation-after.webp','irrigation-before-clean.webp irrigation-after-clean.webp')
needle='"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=5000 --window-size=1440,1200 --screenshot="$OUT/examples-desktop.png" "http://127.0.0.1:8000/sample-library-now.html" > /dev/null 2>&1\n'
if needle in text and 'examples-mobile.png' not in text:
    text=text.replace(needle,needle+'"$CHROME" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --virtual-time-budget=5000 --window-size=390,844 --screenshot="$OUT/examples-mobile.png" "http://127.0.0.1:8000/sample-library-now.html" > /dev/null 2>&1\n')
path.write_text(text)

path=root/'scripts/verify-commercial-browser.js'
path.write_text(path.read_text().replace("'irrigation-before.webp','irrigation-after.webp'","'irrigation-before-clean.webp','irrigation-after-clean.webp'"))

path=root/'AGENTS.md'
text=path.read_text()
if '## Visual Change Release Gate' not in text:
    text+='''\n\n## Visual Change Release Gate\n\n- Follow `docs/public-website/VISUAL_RELEASE_STANDARD.md` for every visual, image, layout, or UI change.\n- Do not commit visual changes directly to `main`; use one controlled branch and one integrated pull request.\n- Photographic project images must be direct PNG, JPEG, or WebP files. SVG photo wrappers are prohibited.\n- PR and live checks capture desktop, mobile, and per-image screenshots and reject blank or mismatched pixels.\n- Automated deployment status is technical verification only. Never claim Rick accepted the visual result until he explicitly reviews and accepts it.\n'''
path.write_text(text)

path=root/'docs/architecture/WEBSITE_AND_WEB_APP_CHANGE_GOVERNANCE.md'
text=path.read_text()
if '## 12. Visual release gate' not in text:
    text+='''\n\n## 12. Visual release gate\n\nAll public visual changes use one controlled branch and one integrated pull request. Project photographs use direct raster files, not SVG wrappers. PR and production checks inspect rendered pixels at desktop and mobile sizes. A technical pass is not owner visual acceptance. See `docs/public-website/VISUAL_RELEASE_STANDARD.md`.\n'''
path.write_text(text)

path=root/'docs/architecture/PUBLIC_WEBSITE_CHANGE_RULES.md'
text=path.read_text()
if '## 10. Rendered visual acceptance' not in text:
    text+='''\n\n## 10. Rendered visual acceptance\n\n1. Visual changes use a branch and pull request; direct-main visual changes are prohibited.\n2. Project photographs use direct PNG, JPEG, or WebP files. SVG photo wrappers are prohibited.\n3. Verification inspects rendered pixels, not only paths, signatures, HTTP responses, or screenshot-file existence.\n4. Full-page desktop/mobile and per-image evidence are required before merge and after deployment.\n5. Automation records technical verification only. Rick explicit review is required before visual acceptance is claimed.\n'''
path.write_text(text)
