# ChatGPT Handoff and Photo Deploy Checklist (2026-07-06)

## Update (2026-07-07): Direct Photo Repair Status

- Confirmed commit context:
  - Local HEAD observed during verification: `62309a0`
  - `origin/main`: `876c2d6`
- Clean worktree verification from `origin/main` confirms:
  - Main proof-board image in `sample-library-now.html` is direct:
    - `assets/h38-demo-overview-chat-photo-v2.jpg?v=direct-photo-v2`
  - Inline page safeguards keep the direct image visible (`.approved-proof-dashboard-img`) and disable dashboard pseudo replacement in the page.
- Live HTML also resolves to:
  - `assets/h38-demo-overview-chat-photo-v2.jpg?v=direct-photo-v2`

### ChatGPT Rule Update

- Do not schedule or perform a new deploy when both `ORIGIN_MAIN` and `LIVE_PAGES` already show the direct-photo-v2 path.
- Only deploy when there is a proven mismatch in clean `origin/main` vs `LIVE_PAGES`, and use a clean worktree for the change.

## Update (2026-07-07): ChatGPT Workspace Cleanup Prompt

Use this prompt when asking ChatGPT to clean a dirty workspace safely.

```text
You are helping me safely clean a dirty Git workspace.

Hard rules:
1. Non-destructive by default.
2. Do not run git reset --hard or git checkout -- unless explicitly approved.
3. Preserve unrelated local edits.
4. Separate findings by scope: LOCAL, ORIGIN_MAIN, CLEAN_WORKTREE.

Required workflow:
1) cd /workspaces/highway-38-solutions
2) git status --short --branch
3) git rev-parse --short HEAD
4) git rev-parse --short origin/main
5) git diff --name-only > /tmp/local-changed-files.txt
6) git stash push -u -m "workspace-cleanup-safety-<timestamp>"
7) git stash list
8) git stash show --stat --include-untracked 'stash@{0}'
9) git stash show --name-status --include-untracked 'stash@{0}'
10) git fetch origin
11) git switch -c clean-origin-main-<date> origin/main
12) restore only approved file groups from stash via git restore --source='stash@{0}' -- <path>

If terminal reports "Unable to read current working directory", re-anchor with:
cd /workspaces/highway-38-solutions

End with:
VERDICT: <PASS|BLOCKED>
Scope Verified: <LOCAL|ORIGIN_MAIN|CLEAN_WORKTREE|combined>
```

## Verified Findings

- Local branch state: main may be behind origin/main; always verify current SHAs before review.
- Local page currently references assets/sample-ai-proof.svg in sample-library-now.html.
- origin/main and the live site currently reference assets/final-sample-garage-flow-render.svg?v=proof-strip-workflow for the workflow opportunity output.
- Live URL check confirms sample-library-now.html is loading and approval gate language is present.
- Asset URL checks show both files return HTTP 200:
  - assets/final-sample-garage-flow-render.svg
  - assets/demo-workflow-opportunity-output.svg

## Why It Looks Like the Wrong Page

The local workspace is behind remote by multiple commits and has many modified files. Local preview and live GitHub Pages are not rendering the same file version.

## Root Cause Pattern (What Broke Verification)

- A verification pass mixed local on-disk checks with claims about origin/main and live Pages.
- Result: files that existed in remote history were reported as missing locally.
- This is a process error, not a deploy-content error.

## Required Verification Protocol (Always Use)

Use three separate sources of truth and keep them separate in the report:

1) Local workspace truth (working tree)
- Use this only for local edits and uncommitted files.
- Commands:
  - `git status --short --branch`
  - `ls assets/`

2) Remote branch truth (origin/main or specific commit)
- Use this for what is actually committed upstream.
- Commands:
  - `git fetch origin`
  - `git rev-parse --short HEAD && git rev-parse --short origin/main`
  - `git --no-pager show origin/main:report-fixes.css | grep -n "rick-review-.*-v2\.svg\|rick-review-v2"`
  - `git ls-tree -r --name-only origin/main | grep "assets/rick-review-"`

3) Live Pages truth (deployed site)
- Use cache-busted URLs to verify deployment state.
- Commands:
  - `curl -I "https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html?v=<new-tag>"`
  - `curl -I "https://rkrueth-maker.github.io/highway-38-solutions/report-fixes.css?v=<new-tag>"`
  - `curl -I "https://rkrueth-maker.github.io/highway-38-solutions/assets/<asset-name>?v=<new-tag>"`

## Reporting Rules (No More False Alarms)

- Never say "missing" unless you specify the scope: local, origin/main, or live.
- If `HEAD != origin/main`, do not use local file absence as evidence against remote or live.
- Always include both SHAs in every verification summary.
- If any check is inconclusive, mark it as `UNKNOWN` and list the exact command needed.
- Include one final line: `Verified scope: LOCAL only` or `Verified scope: ORIGIN+LIVE`.

## Deployment Procedure for Updating Photos (GitHub Pages)

1) Confirm the intended photo path in sample-library-now.html and any related pages.
2) Update file names with cache-busting query values (for example, ?v=20260706-photo-refresh).
3) Ensure the image file exists in assets/ with the exact same case-sensitive name.
4) Commit photo and HTML updates together in one commit.
5) Push to origin/main.
6) Wait for GitHub Pages deployment to complete.
7) Verify live URLs:
   - /sample-library-now.html
   - /assets/<photo-file-name>
8) Hard refresh browser and test in private window.
9) If image still appears old, bump the query version again and redeploy.

## Safe Local-to-Live Alignment Steps

Because there are many local edits, do not hard reset.

Option A (recommended): use a clean branch/worktree for verification
- git fetch origin
- git switch -c verify-live origin/main
- run local preview from this clean branch

Option B: stash then pull in current branch
- git stash push -u -m "temp-local-before-live-verify"
- git pull --ff-only origin main
- verify page
- git stash pop

## ChatGPT Prompt You Can Use

Please use this deployment truth as source-of-record:
- Live page should match origin/main, not my local modified workspace.
- My local branch may be behind origin/main by multiple commits and has many uncommitted edits (always re-check exact SHAs before conclusions).
- For workflow opportunity visuals, origin/main and live currently use assets/final-sample-garage-flow-render.svg?v=proof-strip-workflow.
- Approval gate language must remain: Rick Review Required / Owner Approval Required.

Now provide:
1) A minimal-risk photo update plan for GitHub Pages.
2) A file-level checklist for sample-library-now.html and assets/.
3) A post-deploy verification checklist using live URL checks and cache-busting.

## ChatGPT Operating Instructions (Copy/Paste)

Use this exactly when asking ChatGPT to verify or deploy visual changes:

```
You are performing deploy verification for a repo where local and remote can differ.

Hard requirements:
1) Separate findings by scope: LOCAL, ORIGIN_MAIN, LIVE_PAGES.
2) Print commit IDs: local HEAD and origin/main before any conclusions.
3) If local HEAD differs from origin/main, do not treat local missing files as remote/live failures.
4) For remote checks, use git object reads (git show / git ls-tree), not local file existence.
5) For live checks, use cache-busted URLs and show HTTP status.
6) End with a one-line verdict in this format:
  VERDICT: <PASS|BLOCKED|UNKNOWN> | Scope Verified: <LOCAL|ORIGIN_MAIN|LIVE_PAGES|ORIGIN_MAIN+LIVE_PAGES>

Run these checks and report exact command outputs (trimmed to relevant lines):
- git fetch origin
- git rev-parse --short HEAD
- git rev-parse --short origin/main
- git --no-pager show origin/main:report-fixes.css | grep -n "rick-review-.*-v2\.svg\|rick-review-v2"
- git ls-tree -r --name-only origin/main | grep "assets/rick-review-"
- curl -I "https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html?v=verify-<timestamp>"
- curl -I "https://rkrueth-maker.github.io/highway-38-solutions/report-fixes.css?v=verify-<timestamp>"

Do not claim success or failure without citing which scope produced the evidence.
```
