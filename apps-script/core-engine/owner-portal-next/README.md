# Highway 38 Integrated Business Operating System

Status: **OWNER-ONLY INTEGRATED PRODUCTION CANDIDATE — HARD-RULE EXPERIENCE SOURCE READY**

This folder remains the technical source for the existing bound Highway 38 Owner Portal. The proven architecture is preserved: one integrated business system centered on Unified Tasks, selected-record execution, normalized records, duplicate locks, Proof Log, Error Log, catalog controls, and rollback-protected deployment.

## Owner command center

The portal now contains the required owner-facing operating surfaces:

- Today;
- Needs Rick’s Decision;
- Active Work;
- Money Center;
- Growth Center;
- Website Center;
- System Health.

These views are derived from the same controlled task, customer, job, quote, invoice, payment, expense, communication, social, advertising, website, calendar, proof, error, catalog, and integration records. They do not create a second data system.

## Operating experience

Implemented source behavior includes:

- grouped navigation;
- global quick create;
- universal search;
- owner-persistent saved views using User Properties;
- list, board, and calendar task views;
- Customer 360;
- Job 360;
- persistent selected-task action rail;
- document, image, and video link previews;
- state-aware next-action guidance;
- structured status, loading, success, HOLD, error, and empty states;
- responsive mobile record cards instead of mandatory wide tables;
- SOP and help access;
- structured integration health;
- structured Settings and self-test output without raw JSON in normal operation.

## Existing integrated workflows preserved

- complete Task and Job workspaces;
- lead and customer context;
- catalog-controlled quotes and invoices;
- manual payment tracking;
- expenses and accounting CSV export;
- communication review records;
- social scheduling controls;
- advertising planning and approval;
- website change, merge, deployment, and rollback control records;
- calendar records;
- Proof Log and Error Log history.

## Locked safety defaults

- owner-only access;
- existing bound Apps Script project and existing private deployment only;
- `LIVE_EXTERNAL_ACTIONS_ENABLED = false`;
- selected-record execution only;
- no bulk execution;
- no trigger creation;
- no uncertain automatic retry;
- no live email, quote send, invoice send, payment request or processing, final delivery, social publication, advertising launch or spend, website merge, or deployment;
- owner approval, duplicate protection, Proof Log, and Error Log remain mandatory.

External-action buttons remain gate checks until 01 — Command Center separately releases a verified live workflow.

## Verification

Run both verifiers:

```bash
node scripts/verify-owner-portal-next.js
node scripts/verify-owner-portal-hard-rule.js
```

The hard-rule verifier tests the client syntax, server syntax, required operating surfaces, saved-view persistence, Customer 360 isolation, structured Settings, mobile cards, preview controls, external-action locks, and synthetic data-derived command-center behavior.

## Production deployment rule

This source merge does not silently write to the live Apps Script project. Production remains on the existing private bound project and existing deployment until the authorized deployment procedure creates a rollback backup, pushes to the existing script ID, updates the existing deployment ID only, runs the owner-only self-test, and records manual desktop/mobile acceptance.

Use:

- `scripts/deploy-owner-portal-next-production.sh`;
- `PRODUCTION_INSTALL.md`;
- `RUNTIME_TEST_RUNBOOK.md`;
- `docs/operating-system/OWNER_PORTAL_HARD_RULE_ACCEPTANCE.md`.
