# H38OSLIB Version 1 — Source Audit

Audit date: 2026-07-11

## Identity and inventory

The complete ten-file source was retrieved from the Apps Script API with `versionNumber=1` and is preserved under `version-1-archive/` as a checksum-verified, reconstructable ZIP.

Selected files are expanded under `version-1/` for easier inspection. The archive is the authoritative immutable snapshot.

## Automated checks

- JavaScript syntax: PASS for all nine JavaScript files.
- Manifest JSON: PASS.
- Core export: PASS — `H38OS_executeApprovedSelectedRow` is defined in `H38_OS_Library_Core.js`.
- Dashboard export: PASS — `H38OS_updateDashboard` is defined.
- Trigger creation scan: PASS — none found.
- Secret scan: PASS — no API keys, OAuth tokens, passwords, private keys, bearer tokens, or session credentials found.
- Customer-data scan: PASS — no customer emails, customer phone numbers, customer records, or private job links found.
- Named function declarations: 230.
- Duplicate function names: 6.
- Menu references: 42.
- Unresolved menu targets: 1.
- Manifest timezone: `America/Chicago`.
- Nested dependency: `H38OwnerLib` version 9.

## Duplicate declarations in immutable version 1

- `h38OwnerApprovedSendSelectedDraft` — two declarations.
- `onOpen` — four declarations.
- `h38OwnerRouteSelectedNewRequest` — three declarations.
- `h38OwnerApproveSelectedWebsiteItem` — three declarations.
- `h38OwnerApprovedSendSelectedFollowUp` — three declarations.
- `h38OwnerApproveSelectedSocialItem` — three declarations.

These were archived unchanged. Cleanup requires a new tested library version.

## Unresolved historical menu target

`runOwnerReviewRouterForSelectedRow` appears as a menu target but has no definition in the version-1 archive. It remains classified as broken/HOLD until replaced in a tested version.

## Core email-path parity finding

The library core performs selected-row routing under a document lock, validates owner approval, applies duplicate checks, and writes Proof Log or Error Log records. Its email route sends an existing Gmail draft.

Compared with the stricter bound-project function `h38OwnerApprovedSendSelectedDraft`, the library core:

- does not require `Send Allowed = Yes`;
- does not compare the Gmail draft recipient with the selected queue-row recipient.

The bound-project approved-send function remains the preferred email-send path. Version 1 was not modified because a correction requires a new version, regression testing, and a deliberate manifest update.

## Deployment status

No source was pushed to Apps Script. No new library version was created. No dependency or Web App deployment was changed. No trigger was enabled, no email was sent, no payment was requested, no final work was delivered, and no website or social content was published.
