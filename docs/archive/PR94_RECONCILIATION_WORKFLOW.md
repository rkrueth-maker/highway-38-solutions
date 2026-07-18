# Archived PR #94 Reconciliation Workflow

Archived during issue #180 repository cleanup.

## Former workflow

Path: `.github/workflows/reconcile-business-office-pr94.yml`

The workflow existed to reconcile current `main` into the temporary controlling branch `separate-business-office-platform` while PR #94 was active. It checked out that branch, merged `main`, resolved remaining conflicts in favor of the PR #94 architecture, ran Business Office separation checks, and pushed the branch.

PR #94 has since merged into `main`, and the temporary reconciliation branch is no longer an active release authority. Keeping this workflow active would retain a manual, write-capable action that can modify a retired branch using historical conflict-resolution rules.

## Retained evidence

The original authorized request remains at:

`launch-control/business-office/reconcile-pr94.json`

The repository history and merged pull request preserve the implementation and reconciliation record.

## Current rule

- `main` is the authoritative production and reusable-platform source.
- No workflow may revive or update the former PR #94 controlling branch as part of normal operation.
- Current Business Office production deployment continues only through the protected unified Owner Portal deployment path.
- Reusable Business Office installation continues through the current package and installer verification lanes.

Removing the historical workflow does not change application source, production data, Apps Script project IDs, deployment IDs, URLs, roles, permissions, approval gates, or external-action locks.
