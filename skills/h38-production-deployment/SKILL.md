---
name: h38-production-deployment
description: Merge, deploy, and verify Highway 38 production safely. Use for GitHub Pages, production Business Office releases, merged PR verification, or requests to build/deploy/finish a release.
---

1. Read and obey the Deployment Safety Rules in `AGENTS.md`.
2. Refetch actual `main` before every write or merge action.
3. Confirm the feature branch is based on current `main` or reconcile intervening changes without resetting backward.
4. Require exact-head acceptance for the scope before merge. Do not merge on stale evidence.
5. Inspect required checks/workflows. Diagnose failed stages before rerunning; rerun only failed jobs/scopes when supported.
6. Merge with an expected head SHA so a moved PR cannot be merged accidentally.
7. After merge, capture the new `main` SHA.
8. Observe the authoritative deployment workflow for that production target. A merged PR is not deployment proof.
9. Verify the deployed source SHA/marker matches the intended `main` SHA.
10. Perform cache-busted live checks for the changed behavior/markers. Distinguish `LOCAL`, `ORIGIN_MAIN`, and `LIVE_PAGES` evidence.
11. Do not redeploy when the intended markers are already live.
12. Remove temporary recorder/transfer/diagnostic workflow changes in the same workstream when they are no longer needed.

End with exactly one deployment verdict line when deployment is in scope:
`VERDICT: <PASS|BLOCKED|ALREADY_LIVE|UNKNOWN> | Scope Verified: <LOCAL|ORIGIN_MAIN|LIVE_PAGES|ORIGIN_MAIN+LIVE_PAGES|LOCAL+LIVE_PAGES>`
