# Highway 38 Fast and Reliable Change Process

This is the default execution process for future Highway 38 website, Business Office, Quote Builder, Customer Portal, workflow, data-generation, deployment, and verification work.

It supplements `AGENTS.md`, `WEBSITE_AND_WEB_APP_CHANGE_GOVERNANCE.md`, `UNIFIED_APP_CHANGE_RULES.md`, and `MODULE_PERFORMANCE_STANDARD.md`. It may improve speed and reliability, but it may not weaken authentication, authorization, customer or business isolation, records, IDs, approval gates, Proof Log, Error Log, backups, audit history, existing deployment IDs, approved assets, or external-action controls.

## 1. Primary operating rule

Use **one workstream, one canonical owner, one integrated branch, one pull request, one deployment workflow, and one final evidence packet** for each approved outcome.

Do not create a second workflow, harness, schema, router, seeder, deployment, data owner, or verifier merely because the current path failed. Fix or reuse the authoritative path.

## 2. Ten-line change brief

Before editing, record only what is needed to execute:

```text
Requested outcome:
Primary scope:
Canonical source owner:
Data or record impact:
Security or permission impact:
External-action impact:
Existing workflow or verifier owner:
Fast checks:
Expensive or live checks:
Rollback boundary:
```

Use `Not applicable` with a reason instead of leaving uncertainty. Do not expand the brief into a second planning project.

## 3. Staged execution path

### Stage A — inspect and plan once

1. Start from current `main`.
2. Read only the canonical files that own the requested outcome.
3. Search for an existing route, component, workflow, generator, harness, verifier, deployment, and evidence artifact before adding anything.
4. Generate a scope-aware verification plan:

```bash
npm run plan:change -- --base <base-ref> --head <head-ref>
```

5. Reuse valid evidence from the exact same commit when the tested concern did not change.

### Stage B — run fast checks before building or deploying

Run governance, syntax, structural, manifest, and contract checks first. A fast failure must stop expensive browser, image, clean-install, Apps Script, or production work.

Do not spend deployment time proving that source code already fails a local invariant.

### Stage C — implement as one integrated change

1. Change the canonical source.
2. Batch related edits instead of fixing one page, record, or module at a time.
3. Remove obsolete duplicate code, workflow, or verifier in the same pull request.
4. Keep the branch rebased on current `main` before the final verification pass.
5. Update current documentation in the same pull request. Do not leave a retired process documented as authoritative.

### Stage D — run scope-relevant checks only

- Public-only work runs public structural checks and only the browser/image checks affected by the change.
- Authenticated-only work runs Business Office or Owner Portal checks and does not wait on unrelated public rendering.
- Customer Portal work runs the security-boundary suite.
- Shared architecture runs each affected domain.
- Workflow-only work verifies the workflow contract and a controlled dry or authorized run without repeating unrelated product checks.

Security, data integrity, destructive-action, customer isolation, and deployment-ID checks remain fail-closed.

### Stage E — merge once, deploy once, verify once

1. Merge only after the pull-request source is green.
2. Use the single accepted production workflow for the domain.
3. Do not start a second production workflow while the first owns the same Apps Script project, deployment, folder, sheet, or live site.
4. Verify the exact merged commit and exact deployed version.
5. Record one final PASS or HOLD evidence packet.

## 4. Data generation and long-running operations

Any seeder, migration, backfill, PDF build, import, or project generator must be:

- deterministic;
- idempotent;
- resumable;
- version-aware;
- duplicate-resistant;
- safe to rerun;
- auditable;
- rollback-preserving;
- fail-closed for external actions.

Use these defaults:

1. Stable marker and stable record IDs.
2. Upsert instead of append-only duplication.
3. Small batches, normally two to five logical records or packages per execution.
4. Persist a cursor, version, start time, update time, status, and last error.
5. Resume from the last verified checkpoint rather than restarting completed batches.
6. Finalize only after exact record IDs, exact table counts, exact file counts, and no-external-action status pass.
7. A second execution must produce the same final state without duplicate records, folders, files, or logs.
8. Use an already-authorized execution harness when Apps Script execution permissions require it; do not create another production project or deployment.

## 5. Failure-handling rules

A failed run is diagnostic evidence, not permission for a blind rerun.

1. Inspect the first failing stage and its logs before changing code or rerunning.
2. Classify the failure as source defect, stale verifier, permission boundary, platform outage, concurrency conflict, or environment/configuration problem.
3. Correct the owner of the failure. Do not patch a downstream symptom.
4. Rerun only the failed job or affected scope when GitHub supports it.
5. Do not rerun successful expensive jobs for the same commit unless their inputs changed.
6. After the same failure occurs twice, stop repeating the pipeline. Change the execution design, reduce the batch, correct permissions, or move the action into the proven authorized harness.
7. Never weaken a real safety check to obtain a green run.
8. Preserve the current live system when final verification is HOLD.

## 6. Evidence reuse rules

Evidence may be reused only when it is tied to the exact commit and the tested inputs are unchanged.

- Documentation-only changes do not invalidate product browser evidence unless the rendered product or workflow behavior changed.
- Server-only changes do not invalidate public image evidence.
- Public CSS, HTML, image, or client changes invalidate the affected desktop and mobile browser evidence.
- Schema, seeder, migration, or data-owner changes invalidate exact record-count and rollback evidence.
- Workflow changes invalidate the affected workflow run evidence, not unrelated application checks.
- A new commit invalidates evidence only for concerns affected by that commit; the verification plan must state what remains reusable.

## 7. Workflow and verifier ownership

1. One invariant has one authoritative verifier.
2. One production target has one authoritative deployment workflow.
3. Temporary workflows are allowed only when the accepted workflow cannot transfer or inspect required evidence. They must be removed in the same workstream after use.
4. Workflow path filters must be narrow enough to avoid unrelated production runs.
5. Concurrency groups must protect the actual shared resource, not merely the branch name.
6. Production workflows must upload machine-readable evidence even on failure.
7. A workflow that cannot execute because of a known permission boundary must fail early with a precise HOLD reason; it must not continue through unrelated expensive steps.

## 8. Documentation update rule

Every process-changing pull request must update:

- the authoritative rule or playbook;
- the pull-request or issue intake fields affected by the change;
- the governance verifier that protects the rule;
- obsolete workflow or process references;
- the final handoff summary.

Older documents remain historical references only and must not conflict with the current canonical process.

## 9. Fast handoff format

Use this handoff instead of a long narrative:

```text
Repository:
Accepted main commit:
Outcome completed:
Canonical files changed:
PR and merge commit:
Fast checks:
Scope checks:
Production workflow and run:
Exact deployed version or SHA:
Live verification:
Evidence artifact:
External actions performed:
Rollback point:
Open blocker or next action:
```

Do not claim PASS when production or live verification is still running, missing, or HOLD.

## 10. Definition of done

A change is complete when:

- the requested result exists in the canonical source;
- no duplicate architecture, workflow, generator, or verifier remains;
- the scope-aware plan and fast checks pass;
- affected domain checks pass;
- long-running work is resumable and exact-count verified when applicable;
- the accepted production workflow deploys the exact merged commit when deployment is required;
- live verification confirms the intended result;
- one evidence packet records PASS or an honest HOLD;
- current process documentation matches the implemented path;
- no unauthorized external action occurred.
