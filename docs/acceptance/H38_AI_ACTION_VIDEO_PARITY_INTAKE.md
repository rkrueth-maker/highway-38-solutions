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

## Acceptance-discovered photo-quote repair

Customer 360 browser acceptance exposed lost Scope input during photo selection. The canonical `owner-customer-workflow-polish.js` used a page-wide MutationObserver that scheduled another refresh after each panel replacement. Replace that loop with existing Office page/snapshot/context events and one explicit hook around the existing quote renderer. Pin the loader's cache keys. Preserve the same forms, upload/save authority, records and owner-review gates. The existing photo-only quote verifier now asserts idle panel stability and preservation of Scope through location/photo selection before its unchanged evidence-readiness assertions. No new startup RPC or observer is added.

The focused recorder shares `h38-controlled-training-test-data` with existing strict training acceptance so both cannot write the shared TEST database concurrently. Prior successful source evidence remains historical; each final changed head reruns its required checks.

## Exact-live follow-up repair

Base main `3d695143db5bc7657386b14f30dafe74bddf028e`, branch `agent/ai-proof-live-repair-20260929`. PR #1160 source checks passed and Pages run 36641947291 deployed that SHA. Live AI run 36641947259 was HOLD: H38 persisted rate/quote/proof but Controls omitted `Details.recordsAffected` external IDs; Northern pronoun pricing reached business-wide customer search, where common service/quote terms can produce ambiguity before the reviewed customer context. Fix the existing proof formatter to show affected record IDs, and resolve explicit customer pronouns against the current, membership-checked Customer 360 source before search. Named ambiguous requests remain fail-closed; stale pronouns cannot select unrelated records.

This necessary follow-up continues the same outcome after an actual production-only discovery. No new workflow, harness, authority, startup RPC, schema, role, external action, or observer is introduced. Existing contract verifiers cover affected IDs, pronoun pricing/contact, named ambiguity and stale context. The existing four-scenario recorder remains the live acceptance gate. Do not promote the four HOLD clips to successful training. Roll back this follow-up PR independently if needed; preserve original source-navigation and photo-quote repairs.

## Phone viewing-copy release repair

Base main `9783e7c5d078d2fb8678a5bc8ed29be122e546e4`, branch `agent/ai-phone-preview-20260929`. Live run 36643935601 passed 56 functional assertions at that exact deployment. Visual QA found the phone preview inside Personal Assistant's 280px bounded history: scrolling to the approval buttons clipped the proposed rate/contact details. Do not publish those phone clips as completed training. The canonical existing action-card renderer now places its single preview after the chat history, centers it on creation, and gives phone Edit/Cancel a shared row while keeping approval full-width. No new card, shell, observer, startup RPC, permission or data owner is added. The existing real-runtime verifier now requires both exact before/after summary and approval control to be fully visible, clear of the sticky customer context and navigation/captions, for pricing and contact actions. Reuse all successful historical assertions as historical evidence; rerun the four final source-bound sessions for publication. Rollback is a revert of this follow-up, preserving saved TEST history.
