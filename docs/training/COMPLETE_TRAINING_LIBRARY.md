# H38 Complete Training Library

This is the operator-training coverage map for the real deployed Highway 38 Business Office. Recordings use controlled `TEST` data only. Synthetic app screens, mock forms, slide substitutes, customer sends, real payments, purchases, and automatic scheduling are prohibited.

## Evidence levels and current proof

Do not infer a completed transaction from a page tour. A `PASS` navigation clip proves only the visible route and controls named in its JSON steps. A workflow is proven only when the recorder performs the action and asserts the resulting persisted state, tenant, role, and external-action boundary. Every published claim must name the source SHA and capture date; older evidence is historical until the same flow is run against the current deployed build.

| Flow | Executed evidence | Limit |
| --- | --- | --- |
| Customer → Site Visit → Quote → draft invoice → manual payment → Paid | Desktop and phone `full-lifecycle-training` in run `36563204194`, 2026-09-29, at deployed SHA `7066bbf4`. Saved invoices reached Paid / zero balance after sync; fresh MP4s are in Amanda's dated folder. | Manual TEST bookkeeping only. Invoice creation in Money follows quote review; direct quote-to-invoice linkage and revision/correction remain open. |
| Owner assignment → Staff Accepted → Started → Completed | Owner task desktop/phone clips and authenticated Staff completion in run `36563204194`, 2026-09-29, at SHA `7066bbf4`. | Narrow TEST task path; not every time, issue, or attachment variation. |
| Northern recurring service | Run `36563204194` asserts TEST job start, finish, correct Money invoice review, and no automatic invoice at SHA `7066bbf4`; MP4 is in Amanda's dated folder. | Does not assert occurrence field proof, approved billing, or an actual saved invoice. |
| AI assistant action | Run `36563204194` has JSON assertions for preview/approve/execute/proof, cancel/no-write, and role/tenant denial at SHA `7066bbf4`. | No corresponding executed-action video in that packet; AI Team finding-to-approval video remains open. |
| Customer Portal | Strict run `36515462333` recorded a signed-in Northern TEST account and Staff task flow. | H38 customer-only identity and role isolation are unproven. A dual-role account cannot prove customer-only access. |
| Accounting, Smart Upload, lawn/snow, AI Team, and other narrated lessons | Real authenticated UI orientation, including 39 Northern narrated clips and 18 strict H38 clips. | Route, control, and privacy proof only where the JSON steps do not execute and assert the full mutation. |

Open action-video acceptance: quote revision/linkage/correction and audit; Northern lawn and snow occurrence → field proof → billing approval → saved invoice; connected bank staging, match/reconcile, check print review and reports; Smart Upload upload/OCR/link/retrieve/print/delete and permission/offline; AI Team finding/source/preview/owner approval/cancel/Proof Log/denial; dedicated H38 customer-only portal; physical iPhone and Android cold start/offline. Connected Drive remains gated by the owner and is excluded from a launch PASS. Never perform real sends, payments, or purchases to complete a training video. The exact run index and 27 fresh MP4s are in [Amanda's dated shared folder](https://drive.google.com/drive/folders/18zY9xowfMKKlKgKQ-QgpBicWvyDANsnC).

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

`scripts/record-customer-portal-signed-in.js` owns that separate phone-size walkthrough for H38 and Northern. It signs in before recording, holds session state only in memory, requires a dedicated `+portaltest` identity with an active TEST customer mapping, verifies that only one account for the selected tenant is visible, and then records read-only sections of the real portal. The workflow uses `H38_PORTAL_TEST_EMAIL` / `H38_PORTAL_TEST_PASSWORD` and `NL_PORTAL_TEST_EMAIL` / `NL_PORTAL_TEST_PASSWORD` secrets. Without a tenant's credential pair, its manifest marks that tenant `EXTERNAL_GATE`; a manual release run requires both tenant videos to pass. Customer messages, approvals, payments, and downloads are not performed.

For the Northern TEST walkthrough only, `highway38solutions+playreview@gmail.com` can use the existing H38 Staff CI password when its Northern customer account is scoped to the Highway 38 Solutions — TEST customer. The recorder labels this dual-role identity and scopes its account query to Northern. That clip demonstrates the Northern portal and TEST lawn/snow rows; it does not replace a customer-only cross-role security proof. A dedicated `+portaltest` account remains required for H38 and for the final customer-only release acceptance.

## Evidence output

The GitHub Actions workflow writes the new material under:

`artifacts/complete-training-library/`

Each clip has a JSON result with source SHA, tenant, viewport, step status, and `externalActionsOccurred:false`. The run-level `manifest.json` lists every PASS/HOLD and any credential gate. MP4 is created from the raw WEBM when FFmpeg is available; raw WEBM remains the acceptance source.
