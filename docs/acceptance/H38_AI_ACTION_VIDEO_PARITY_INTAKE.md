# AI action source review and training intake

Date: 2026-09-29. Base main: `ce919ad392e319fa7a7d7dc60ce2b00e6cf3c145`. Branch: `agent/ai-action-video-parity-20260929`.

## Change brief

- Outcome: open the exact customer behind an AI Team finding and prove approved tenant-data actions on H38/Northern desktop and phone with real-runtime videos.
- Scope/module: authenticated Assistant (`assistant`), shared customer navigation, Controls Proof Log rendering, recording/verification. No new module or contract entry.
- Canonical owners: `ai-team-orchestrator.js`, `app-19.js` (existing Controls renderer), `H38_CUSTOMER_360`, existing `assistant-tenant-actions.js`, `scripts/verify-assistant-tenant-actions-live.js`, and `h38-workflow-video-evidence.yml`.
- Record impact: only deterministic, named TEST customer fixtures and TEST draft quotes in each active business; cancelled bulk previews never write customer rates. Existing normal save/sync and Proof Log authority remains the write owner.
- Permissions: active snapshot and existing role capabilities; stale/missing customer sources fail closed. No new role, schema, RLS or engine-write authority.
- External actions: no customer delivery, payment, purchasing, publishing or provider commitment. Owner brief remains advisory.
- Fast checks: syntax, change planner, governance, Assistant contracts, source-navigation regression and video safety contract.
- Live checks: exact-deployment H38 and Northern owner flows at desktop/phone widths, source review, contact save, pricing/quote approval, cancel/revise, Proof Log, tenant denial, and preview revision. Real Staff authorization remains a separate acceptance item; owner videos cannot substitute for it.
- Rollback: revert integrated PR. TEST fixtures remain auditable, rates/contact fields reset through normal save/sync; preserve TEST draft quote evidence.

## Module performance intake

- Assistant is secondary; no extra startup RPC, schema or provider dependency.
- Data: already authorized `state.snapshot.customers`; scan retains five customer findings and eight visible findings. Selected customer is prioritized within those existing bounds.
- Cache: active business snapshot only, invalidated by existing `h38:business-snapshot-updated` and scan. Customer navigation rechecks current snapshot membership.
- Reads/writes: source navigation performs zero network writes and adds zero startup calls. Action recording uses existing save/sync and targeted secured audit history.
- Load targets: source selection is local; cold/warm/cached Assistant route timings are captured in the live manifest. No performance-budget exception requested.
- Failure: missing source stays in Assistant with an operator-visible rescan message. Expired recorder session requires authorized TEST sign-in; auth files remain runner-only and outside artifacts.
- Deployment: existing Publish H38 Pages only. Run one controlled evidence job after exact-head PR checks and deployment succeed; focused AI scope reuses the same workflow and skips unrelated recordings.
