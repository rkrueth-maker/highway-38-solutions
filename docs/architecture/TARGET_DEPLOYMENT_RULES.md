# Target Deployment Rules

These rules govern fast, reliable deployment to a specific production target.

## One target, one workflow

- Use one authoritative workflow per production target.
- Do not start unrelated deployment workflows when only one target changed.
- Each target workflow must own its source paths, verification, concurrency group, deployment environment, and live marker.
- The Highway 38 GitHub Pages production target is owned by `.github/workflows/pages-branch-fallback.yml`.

## Trigger rules

- A merge to `main` that changes publishable Highway 38 Pages content must trigger the Pages workflow automatically.
- Workflow-only changes must not be excluded from the next target publication. When a workflow change needs immediate production use, include one intentional publishable target change, such as a service-worker cache bump or target trigger marker, in the same pull request.
- `workflow_dispatch` is the approved manual retry path. Manual retries must use the same workflow and exact source commit rather than creating a temporary deployment workflow.
- Do not use empty commits or unrelated file edits merely to force a deployment.

## Fast validation

- Validate current file relationships and required runtime markers instead of hard-coding historical dates, cache names, or build IDs.
- Build IDs may be extracted and reported, but a verifier must not require yesterday's exact value.
- Run syntax and structural checks only for files required by the selected target.
- Do not rerun unrelated Apps Script, Supabase, native, documentation, or full-repository checks for a Pages-only deployment unless the changed files cross those boundaries.
- Fail on the first target defect and fix that defect before retrying.

## Cache and service-worker rules

- Any changed runtime asset referenced by `commercial-app/index.html` must be reachable from the current service worker.
- New critical quote, delivery, authentication, or field-visit runtime files must be added to `LIVE_FIRST` and `SHELL` when offline or stale-cache behavior would otherwise be unsafe.
- Bump the service-worker cache name when the deployed runtime asset set changes.
- Keep navigation and critical runtime requests network-first so a successful deployment becomes visible without requiring users to clear browser storage.

## Publication rules

- Publish from the exact merged `main` SHA.
- Write that SHA to `deployed-main-sha.txt` in the publication artifact.
- Use the existing filtered `gh-pages` publication branch; do not create a competing Pages branch or deployment workflow.
- Use target-specific concurrency with `cancel-in-progress: true` so a newer Pages deployment replaces an obsolete queued run.

## Completion evidence

A target deployment is complete only after all of the following are known:

1. merged `main` SHA;
2. Pages workflow run ID;
3. workflow conclusion;
4. deployed source SHA from `deployed-main-sha.txt`;
5. cache-busted live verification of the changed marker or asset.

Use this verdict format:

`VERDICT: <PASS|BLOCKED|ALREADY_LIVE|UNKNOWN> | Target: <target> | Source: <sha> | Scope Verified: <ORIGIN_MAIN|LIVE_PAGES|ORIGIN_MAIN+LIVE_PAGES>`
