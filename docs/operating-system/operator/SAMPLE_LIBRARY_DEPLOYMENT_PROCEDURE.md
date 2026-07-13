# Sample Library Deployment Procedure

Status: CONTROLLED  
Owner: 03 — Operations & Documentation  
Technical execution owner: 02 — Build & Automation  
Parent authority: 01 — Command Center  
Effective date: 2026-07-13

## Controlled files

- Page source: `sample-library-now.html`
- Deploy helper: `scripts/deploy_sample_library.sh`
- Guard: `scripts/guard_deploy.py`
- Public URL: `https://rkrueth-maker.github.io/highway-38-solutions/sample-library-now.html`

## Current approved Sample Library markers

The corrected Version 5 Sample Library state uses these deploy-helper markers:

- `assets/hero-garage-before-after.png?v=v5-no-svg-polish`
- `assets/demo-run-sample-garage-bay.png?v=v5-no-svg-polish`
- `assets/workflow-opportunity-finished.png?v=v5-no-svg-polish`

The page source and deploy-helper defaults must agree. A marker check is evidence about a specific source state; it is not permission to alter the guard until stale or incorrect page source passes.

## Procedure

### 1. Inspect actual current source

Before running or changing any guard:

- inspect `sample-library-now.html` directly;
- list the actual current asset markers;
- confirm the intended product/version state;
- inspect `scripts/deploy_sample_library.sh` defaults; and
- compare the helper markers to the current approved page source.

Do not assume an old marker is still required.

### 2. Separate the three scopes

Record independently:

- LOCAL branch, SHA, worktree, and guard result;
- ORIGIN_MAIN SHA, file contents, and workflow result; and
- LIVE_PAGES URL, markers, and deployment evidence.

A dirty local worktree is not evidence of a remote or live defect.

### 3. Run the guard with current markers

Normal controlled check:

```bash
bash scripts/deploy_sample_library.sh
```

Explicit diagnostic with dirty local state:

```bash
bash scripts/deploy_sample_library.sh --allow-dirty
```

Use `--match` only when a documented current approved source requires a different marker set. Record every custom marker.

### 4. Interpret the verdict correctly

- `PASS`: preflight conditions passed. This is not final live proof; complete the deployment and rerun post-deployment verification.
- `BLOCKED`: stop and correct the named scope. Do not deploy.
- `ALREADY_LIVE`: intended markers are present in both `origin/main` and the live page. Do not deploy again.
- technical `UNKNOWN`: report operationally as `NOT_VERIFIED`; do not claim the page is live or fixed.

### 5. Correct the right source

When the helper and page differ:

- determine which state is current and approved;
- fix page source when page source is wrong;
- update helper defaults when they are stale;
- do not change a guard solely to make stale or incorrect source pass; and
- keep page correction and unrelated branding or feature work separate unless the combined result is explicitly reviewed.

### 6. Resolve conflicts deliberately

Do not choose `ours` or `theirs` blindly. Inspect both versions, preserve the approved content from each when required, test the merged result, and never push an incomplete conflict resolution.

### 7. Verify deployment

After the intended source is in `origin/main`:

- record the full `origin/main` SHA;
- confirm both controlled files are present;
- confirm the Pages deployment mechanism completed;
- check the exact public URL independently;
- use a cache-busted URL, for example `?verification=<unique-value>`;
- confirm all required markers; and
- report LOCAL, ORIGIN_MAIN, and LIVE_PAGES separately.

## Recorded false-alarm causes

The prior Sample Library alarms were caused by:

1. old workflow-opportunity asset references;
2. stale deploy-helper default markers;
3. treating dirty local state as live-site failure evidence;
4. pushing unrelated logo work without the pending Sample Library correction; and
5. merge/rebase attempts that did not first define the intended combined result.

## Recorded correction

- Helper-marker correction commit: `a1fc3bf69c2e8375007e600cdeed01f7d149df5c`
- Sample Library correction commit: `463290ad08895b3a14863cd88d80cc7aca64722a`

The supporting Drive record **ChatCopilot** reports that the correction reached `origin/main`, GitHub Pages deployed it, and the three Sample Library markers passed LOCAL, ORIGIN_MAIN, and LIVE_PAGES at closure.

## Closure rule

The Sample Library repair is treated as complete and live. Do not reopen the repair without new evidence of a functional or deployment defect.

A later branding, accessibility, or shared-layout inconsistency is a separate controlled defect. Route it to the correct owner without rewriting the Sample Library repair history.

Related controls:

- `DEPLOYMENT_STATE_VERIFICATION_STANDARD.md`
- `DIRECT_TO_MAIN_COMMAND_RULE.md`
- `DEPLOYMENT_FAILURE_PREVENTION_CHECKLIST.md`
