# Real-runtime workflow video evidence

## Change brief

Requested outcome: permanent versioned training and acceptance-video library.
Primary scope: authenticated Business Office evidence workflow and documentation.
Canonical source owner: `docs/training/workflow-video-library.json` plus `scripts/record-real-office-workflow-evidence.js`.
Data impact: controlled TEST records only; no seed, delete, send, charge, or publish action.
Security: recording requires an explicitly authorized authenticated storage state and fails closed when absent.
External actions: none.
Fast checks: JSON parse, library verifier, governance verifier.
Live check: manually dispatched authenticated CI recording or browser-authenticated operator capture.
Rollback: remove this library/workflow; it does not mutate runtime or records.

## CI execution

Run **H38 Workflow Video Evidence** manually with repository secret `H38_WORKFLOW_STORAGE_STATE`, containing an authorized test-only Owner/Field storage-state JSON, and input `recording_authorized=true`. The secret exists only in runner temp storage and is never uploaded.

The runner preflights `recording_authorized` and `H38_WORKFLOW_STORAGE_STATE` before recording, writes a clear Actions summary for held prerequisites, opens the deployed Office URL, rejects anonymous/gateway pages, and stores manifest, results, screenshots, and raw WEBM under `artifacts/workflow-video-evidence/`. Missing authorization produces machine-readable HOLD evidence; it never synthesizes an alternate video.

## Physical-device acceptance

An Owner manually captures Android and iPhone installed app/PWA flows: camera/mic permission, capture/review, offline save/resume/reconnect, location as applicable, and iPhone LiDAR where supported. Use TEST records, show role/tenant/test record first, and attach a result note. Do not capture notifications, photo libraries, credentials, or real customer data.

## Help readiness

All initial entries are Help-ready. UI links wait for reviewed durable MP4 media URLs so no dead link is introduced.
