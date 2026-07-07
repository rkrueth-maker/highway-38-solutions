# ChatGPT Live Deploy Instructions (2026-07-06)

## Update (2026-07-07): Urgent Repair Verification

- Suspected breaking commit confirmed: `876c2d6` (Direct photo page update).
- Clean verification run was executed from a temporary worktree at `origin/main` (`/tmp/highway38-deploy`).
- `origin/main:sample-library-now.html` currently includes direct image usage:
   - `assets/h38-demo-overview-chat-photo-v2.jpg?v=direct-photo-v2`
- Live HTML check currently resolves to the same direct image path.
- Live cache-busted HEAD checks returned HTTP 200 for:
   - `sample-library-now.html?v=direct-photo-v2`
   - `report-fixes.css?v=direct-photo-v2`
   - `assets/h38-demo-overview-chat-photo-v2.jpg?v=direct-photo-v2`

### Decision For Future ChatGPT Runs

- If clean `origin/main` and `LIVE_PAGES` both show `h38-demo-overview-chat-photo-v2.jpg?v=direct-photo-v2`, do **not** push a duplicate deploy.
- If local differs but `origin/main` and live match, treat local as stale and do not deploy from local.
- If a future fix is required, perform it from a clean worktree based on `origin/main` only.

## Update (2026-07-07): Workspace Cleanup Mode For ChatGPT

Use this when local workspace hygiene is needed without losing edits.

### Cleanup Guardrails

- Non-destructive by default. Do not use `git reset --hard` or `git checkout --` unless explicitly approved.
- Preserve all local edits first with stash including untracked files.
- If a temporary worktree was removed, do not run follow-up commands from that deleted path.

### Required Cleanup Sequence

1. Re-anchor shell:
   - `cd /workspaces/highway-38-solutions`
2. Baseline:
   - `git status --short --branch`
   - `git rev-parse --short HEAD`
   - `git rev-parse --short origin/main`
3. Safety snapshot:
   - `git diff --name-only > /tmp/local-changed-files.txt`
4. Safety stash:
   - `git stash push -u -m "workspace-cleanup-safety-<timestamp>"`
   - `git stash list`
5. Inspect stash including untracked files:
   - `git stash show --stat --include-untracked 'stash@{0}'`
   - `git stash show --name-status --include-untracked 'stash@{0}'`
6. Create clean branch from remote:
   - `git fetch origin`
   - `git switch -c clean-origin-main-<date> origin/main`
7. Restore approved groups only (file-by-file):
   - `git restore --source='stash@{0}' -- <path>`

### Terminal CWD Fix

If command output shows `Unable to read current working directory` after worktree removal, first run:

- `cd /workspaces/highway-38-solutions`

Then rerun the command.

## Current Live Truth

- Live page: `https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html`
- Live page currently serves the repeatable demo-product system version.
- Live main dashboard image currently resolves to:
  - `assets/h38-demo-overview-chat-photo-v2.jpg?v=direct-photo-v2`
- Live checks on 2026-07-06 returned HTTP 200 for:
  - `sample-library-now.html`
  - `assets/h38-demo-overview-chat-photo-v1.jpg`
  - `assets/h38-demo-overview-chat-photo-v2.jpg`

## Non-Negotiable Rules

1. Separate findings by scope:
   - `LOCAL`
   - `ORIGIN_MAIN`
   - `LIVE_PAGES`
2. Never deploy from a dirty local checkout that is behind `origin/main`.
3. Never assume local file absence means the live site is broken.
4. Use a clean worktree or fresh clone based on `origin/main` for deployment.
5. Deploy the minimum file set only.

## Safe Deployment Procedure

Use this exact sequence:

1. Refresh remote state.
   - `git fetch origin`
2. Confirm branch positions.
   - `git rev-parse --short HEAD`
   - `git rev-parse --short origin/main`
3. If local `HEAD` differs from `origin/main`, do not deploy from the current working tree.
4. Create a clean deployment worktree.
   - `git worktree add /tmp/highway38-deploy origin/main`
5. In the clean worktree, make only the intended changes.
6. Review the exact diff.
   - `git --no-pager diff -- sample-library-now.html assets/`
7. Commit only the minimal deploy files.
   - Example: `git add sample-library-now.html assets/<image-name>`
   - `git commit -m "Update live sample dashboard image"`
8. Push from the clean worktree.
   - `git push origin HEAD:main`
9. Verify live with cache-busted URLs.
10. Remove the temporary worktree.
   - `git worktree remove /tmp/highway38-deploy`

## Required Live Verification

Run all three checks after push:

1. Live HTML source check
   - `curl -s "https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html?v=verify-<timestamp>" | grep -nE "h38-demo-overview-chat-photo-v[0-9]+\\.jpg|approved-investor-proof-dashboard"`
2. Live CSS check
   - `curl -I -s "https://rkrueth-maker.github.io/highway-38-solutions/report-fixes.css?v=verify-<timestamp>"`
3. Live image check
   - `curl -I -s "https://rkrueth-maker.github.io/highway-38-solutions/assets/<image-name>?v=verify-<timestamp>"`

## Decision Rule For This Repo

- If `LIVE_PAGES` already shows the intended image and the intended HTML source, do not push a duplicate deploy.
- If local work differs but `origin/main` and `LIVE_PAGES` are already correct, treat local as stale and do not use it as a deployment source.

## Copy/Paste Prompt For ChatGPT

```text
You are performing deployment verification for Highway 38 Solutions.

Hard requirements:
1. Separate all findings by scope: LOCAL, ORIGIN_MAIN, LIVE_PAGES.
2. Print both commit IDs first: local HEAD and origin/main.
3. If local HEAD differs from origin/main, do not deploy from the current working tree.
4. Use a clean worktree based on origin/main for any live deploy.
5. Deploy only the minimum changed files.
6. Verify the live page, live CSS URL, and live image URL with cache-busted requests.
7. End with this exact format:
   VERDICT: <PASS|BLOCKED|ALREADY_LIVE|UNKNOWN> | Scope Verified: <LOCAL|ORIGIN_MAIN|LIVE_PAGES|ORIGIN_MAIN+LIVE_PAGES>

Run these checks and report the relevant lines only:
- git fetch origin
- git rev-parse --short HEAD
- git rev-parse --short origin/main
- git --no-pager show origin/main:sample-library-now.html | sed -n '1,40p'
- git ls-tree -r --name-only origin/main -- assets | grep 'h38-demo-overview\|approved-investor-proof-dashboard'
- curl -s "https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html?v=verify-<timestamp>" | grep -nE "h38-demo-overview-chat-photo-v[0-9]+\.jpg|approved-investor-proof-dashboard"
- curl -I -s "https://rkrueth-maker.github.io/highway-38-solutions/report-fixes.css?v=verify-<timestamp>"
- curl -I -s "https://rkrueth-maker.github.io/highway-38-solutions/assets/h38-demo-overview-chat-photo-v2.jpg?v=verify-<timestamp>"

Do not claim the site is broken unless the LIVE_PAGES checks fail.
Do not claim a deploy is needed if LIVE_PAGES already matches origin/main.
```