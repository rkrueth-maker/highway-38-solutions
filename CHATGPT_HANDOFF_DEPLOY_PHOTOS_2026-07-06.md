# CHATGPT_HANDOFF_DEPLOY_PHOTOS_2026-07-06

## Mandatory verification rule

Always separate every deploy/photo finding by scope:

```text
LOCAL
ORIGIN_MAIN
LIVE_PAGES
```

Print both SHAs first:

```bash
git rev-parse --short HEAD
git rev-parse --short origin/main
```

Use remote git object reads for ORIGIN_MAIN checks. Do not rely on local file existence.

```bash
git show origin/main:path/to/file
git ls-tree -r --name-only origin/main
```

Use cache-busted LIVE_PAGES checks and include HTTP status evidence.

```bash
curl -I 'https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html?v=VERIFY_TIMESTAMP'
curl -I 'https://rkrueth-maker.github.io/highway-38-solutions/report-fixes.css?v=VERIFY_TIMESTAMP'
curl -I 'https://rkrueth-maker.github.io/highway-38-solutions/assets/path-to-image.png?v=VERIFY_TIMESTAMP'
curl -L -s -o /dev/null -w 'HTTP %{http_code} | %{url_effective}\n' 'https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html?v=VERIFY_TIMESTAMP'
```

Required report format:

```text
LOCAL
- HEAD SHA:
- Local files checked:
- Local result:

ORIGIN_MAIN
- origin/main SHA:
- git show checks:
- git ls-tree checks:
- Origin result:

LIVE_PAGES
- Page URL checked:
- CSS URL checked:
- Asset URL(s) checked:
- HTTP status evidence:
- Live result:

VERDICT: PASS/BLOCKED/UNKNOWN | Scope Verified: LOCAL/ORIGIN_MAIN/LIVE_PAGES/ORIGIN_MAIN+LIVE_PAGES
```

Rules:

```text
Never say live is fixed based only on local files.
Never say live is fixed based only on origin/main.
Never say an image is live based only on file existence.
Do not compare live against an older local file.
Compare live against origin/main.
If local and origin/main differ, report that before checking live.
If origin/main and live differ, report GitHub Pages deploy/cache lag.
If direct asset URL is updated but page is stale, report HTML/CSS reference cache issue.
If page source is updated but browser still shows old visual, report browser/session cache issue.
```
