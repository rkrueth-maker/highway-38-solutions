---
name: h38-repo-change-safety
description: Safely plan and execute changes in the Highway 38 Solutions repository. Use for coding, fixes, app/module changes, website changes, refactors, merges, or any task that writes to rkrueth-maker/highway-38-solutions.
---

Use this skill before any repository write.

1. Read `AGENTS.md` first. Then read the architecture documents required by the task scope, especially `docs/architecture/WEBSITE_AND_WEB_APP_CHANGE_GOVERNANCE.md` and `docs/architecture/FAST_RELIABLE_CHANGE_PROCESS.md`.
2. Refetch actual `main` immediately before every repository write. Never assume a handoff SHA is still current.
3. Preserve intervening work. Never reset backward to an older handoff SHA.
4. Work on a feature or repair branch. Do not write directly to `main`.
5. Identify the canonical owner before editing: route, renderer, component, schema, data owner, module contract, action contract, workflow, verifier, asset, or deployment.
6. Reuse existing shared architecture. Do not create a second shell, router, navigation tree, database, synchronization layer, startup system, AI launcher, generator, harness, or verifier when a canonical owner already exists.
7. For authenticated app/module changes, read `docs/architecture/MODULE_PERFORMANCE_STANDARD.md`; protect tenant isolation, role checks, approval controls, external-action locks, and startup budgets.
8. For public-site or image changes, preserve approved assets exactly and follow the approved asset manifests.
9. Run the repository preflight required by `AGENTS.md` before domain-specific verification.
10. Diagnose the first failure before rerunning expensive workflows. Rerun only the failed job or affected scope when possible.
11. Do not claim PASS while exact-head verification, deployment, or live evidence is missing, stale, running, or HOLD.

Required output at the end of work:
- base `main` SHA used;
- feature branch;
- exact feature-head SHA;
- files/scopes changed;
- tests/checks run and their status;
- PR number or reason no PR exists;
- deployment status if applicable;
- any remaining HOLD/BLOCKED item.
