# Real-runtime workflow video evidence

## Change brief

Requested outcome: permanent versioned training and acceptance-video library.
Primary scope: authenticated Business Office evidence workflow and documentation.
Canonical source owner: `docs/training/workflow-video-library.json` plus `scripts/record-real-office-workflow-evidence.js`.
Data impact: controlled TEST records only; no seed, delete, send, charge, or publish action.
Security: recording requires explicit authorization plus either an authenticated storage state or a complete secure recorder email/password pair; generated auth state remains runner-temp only and fails closed when auth material is incomplete.
External actions: none.
Fast checks: JSON parse, library verifier, governance verifier.
Live check: manually dispatched authenticated CI recording or browser-authenticated operator capture.
Rollback: remove this library/workflow; it does not mutate runtime or records.

## CI execution

Run **H38 Workflow Video Evidence** manually with input `recording_authorized=true`. Configure either:

- `H38_WORKFLOW_STORAGE_STATE` with an authorized test-only Playwright storage-state JSON, or
- both `H38_WORKFLOW_TEST_EMAIL` and `H38_WORKFLOW_TEST_PASSWORD` for an authorized recorder account that can access the H38 and Northern Lakes TEST scenarios.

When credentials are used, the runner signs into the real deployed H38 Office through its normal Supabase login form and writes the resulting Playwright storage state only to `RUNNER_TEMP`. Login secrets and generated auth state are never uploaded as evidence.

The runner preflights authorization and auth material before recording, writes a clear Actions summary for held prerequisites, opens the deployed Office URL, rejects anonymous/gateway pages, and stores manifest, results, screenshots, and raw WEBM under `artifacts/workflow-video-evidence/`. Missing or incomplete authorization material produces machine-readable HOLD evidence; it never synthesizes an alternate video.

## Physical-device acceptance

An Owner manually captures Android and iPhone installed app/PWA flows: camera/mic permission, capture/review, offline save/resume/reconnect, location as applicable, and iPhone LiDAR where supported. Use TEST records, show role/tenant/test record first, and attach a result note. Do not capture notifications, photo libraries, credentials, or real customer data.

## Help readiness

All initial entries are Help-ready. UI links wait for reviewed durable MP4 media URLs so no dead link is introduced.
