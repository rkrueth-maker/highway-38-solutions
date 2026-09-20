# H38 Workflow Video Library

Versioned index for operator training and acceptance/regression evidence for the real Highway 38 Business Office runtime. It never authorizes a synthetic recording: no mock form, slide, or simulated workflow may be placed in this library.

Each entry has a written guide, raw acceptance-capture path, and clean training-reference path. Video binaries are excluded from normal Git history. The CI evidence workflow uploads raw WEBM, screenshots, results, and a run manifest as a time-limited artifact; reviewed clean MP4 references belong in approved media storage.

- Record authenticated runtime behavior with controlled TEST records only.
- Include source SHA, viewport, role, tenant, record IDs/names, workflow status, timestamps, and first failed step.
- Do not show customer PII, credentials, tokens, browser storage, or real recipients. Test email is limited to highway38solutions@gmail.com and rkrueth@gmail.com with [H38 TEST].
- Capture Northern-specific evidence for branding, snow, lawn, Customer 360, and tenant isolation.

Use `workflow-video-library.json` as the authoritative catalog. See `H38_WORKFLOW_VIDEO_EVIDENCE.md` for CI and physical-device acceptance.
