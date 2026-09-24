# H38 Complete Training Library

This is the operator-training coverage map for the real deployed Highway 38 Business Office. Recordings use controlled `TEST` data only. Synthetic app screens, mock forms, slide substitutes, customer sends, real payments, purchases, and automatic scheduling are prohibited.

## Already proven in the production evidence pipeline

- Full customer lifecycle — Customer → Site Visit → Quote → Invoice → Payment → Paid, desktop and phone.
- Task Manager — owner creates a job, assigns a real active Staff employee, saves the task, and confirms the assignment, desktop and phone.
- Native accounting / tax handoff — H38 runs daily accounting; QuickBooks is optional tax-only handoff, desktop and phone.
- H38 ↔ Northern Lakes real-runtime tenant scenarios.
- Assistant action evidence — preview, approve, execute, cancel, permission boundary, and tenant-isolation checks.

## Complete operator-library recorder

`scripts/record-complete-training-library.js` adds short real-runtime recordings for the surrounding workflows that were not previously packaged as dedicated operator videos:

1. Full Office map — every available owner Office area in the canonical navigation.
2. Daily owner workflow — Today → Work → Schedule → Messages → Money → Reports.
3. Scheduling and dispatch — work selection, schedule review, and Today handoff on desktop and phone.
4. Meetings — Meetings workspace, Start Meeting path, organized Meeting Report, and follow-up preparation.
5. Receipts and expenses — native H38 expense / receipt path and tax-package relationship.
6. Documents / Smart Upload — upload, type detection, proposed linkage, confirmation, and document retrieval.
7. Quote revision — reopen a TEST quote, revise connected evidence/pricing, regenerate, print, and keep send/approval explicit.
8. Assistant approvals — context-aware request → preview → revise/cancel/approve → Proof Log.
9. Settings / administration — People, Controls, Settings, users/roles, service/business configuration.
10. Lawn recurring service — Northern Lakes assignment → field execution path → proof/closeout → invoice preparation.
11. Snow recurring service — Northern Lakes trigger/assignment → field execution areas/material/proof → invoice preparation.
12. Employee handoff — owner-assigned TEST task, Staff status progression, time/proof/issue boundaries.
13. Role login — employee/site-manager Office access and isolated Customer Portal login path.

The recorder also creates a desktop/phone owner-daily pair, desktop/phone dispatch pair, desktop/phone Meetings pair, desktop/phone Smart Upload pair, desktop/phone Assistant pair, phone lawn/snow clips, and a phone role-login clip.

## Authenticated employee completion gate

The recorder supports a real permission-limited Staff completion video when CI has both `H38_WORKFLOW_STAFF_EMAIL` and `H38_WORKFLOW_STAFF_PASSWORD`. With those credentials it signs into the real Staff membership, refreshes assigned work, and moves an assigned TEST task through `Accepted → Started → Completed` using `H38_EMPLOYEE_WORKSPACE.updateAssignedTask`, which calls the bounded employee RPC and writes Proof Log evidence.

When the dedicated Staff credential pair is not configured, the library still records the employee login surface and owner-to-employee handoff, but the manifest marks authenticated post-login Staff completion as an `EXTERNAL_GATE`; it is never simulated with an owner session.

Customer Portal login is recorded without exposing credentials. A real post-login customer walkthrough likewise requires an authorized TEST customer account and should not be faked with an owner account.

## Evidence output

The GitHub Actions workflow writes the new material under:

`artifacts/complete-training-library/`

Each clip has a JSON result with source SHA, tenant, viewport, step status, and `externalActionsOccurred:false`. The run-level `manifest.json` lists every PASS/HOLD and any credential gate. MP4 is created from the raw WEBM when FFmpeg is available; raw WEBM remains the acceptance source.
