# H38OwnerLib Version 9 — Source Audit

Audit date: 2026-07-11

## Identity and inventory

The immutable version-specific Apps Script API export contains:

- `Code.js` — 24,864 bytes
- `appsscript.json` — 99 bytes

Original ZIP:

- size: 4399 bytes
- SHA-256: `b198901e05b1a32165cb5ef0301d987bfdf780d28542764deef394170ef53fd5`
- entries: 2

## Automated checks

- JavaScript syntax: PASS.
- Manifest JSON: PASS.
- Manifest timezone: `America/Chicago`.
- Runtime: V8.
- Nested Apps Script libraries: none.
- Named function declarations: 18.
- Duplicate function declarations: 0.
- Trigger-creation scan: PASS — none found.
- Secret scan: PASS — no API keys, OAuth tokens, passwords, private keys, bearer tokens, or session credentials found.
- Customer-data scan: PASS — no customer email addresses, phone numbers, customer records, Gmail customer IDs, or private job links embedded in source.

## Owner-gated execution paths

| Function | Queue | Result |
|---|---|---|
| `h38OwnerApprovedSendSelectedDraft` | Email Approval Queue | Sends one existing draft after `APPROVE SEND`, `Send Allowed = Yes`, duplicate checks, and recipient match |
| `h38OwnerApprovedSendSelectedQuote` | Quote Approval Queue | Sends one existing quote draft after `APPROVE QUOTE SEND`, numeric quote validation, `Send Allowed = Yes`, duplicate checks, and recipient match |
| `h38OwnerRouteSelectedNewRequest` | New Requests | Routes one approved row internally to Job Queue; no customer-facing action |
| `h38OwnerApproveSelectedWebsiteItem` | Website Approval Queue | Marks one row publish-ready; does not deploy |
| `h38OwnerApprovedSendSelectedFollowUp` | Follow-Up Queue | Sends one existing follow-up draft after `APPROVE FOLLOW-UP SEND`, `Send Allowed = Yes`, duplicate checks, and recipient match |
| `h38OwnerApproveSelectedSocialItem` | Social Approval Queue | Marks one row social-ready; does not publish or schedule |

## Source relationship

H38OSLIB version 1 contains historical duplicate copies of several owner-action names. `H38OwnerLib` version 9 contains one declaration for each of its 18 functions and is the cleaner immutable owner-action library snapshot.

The bound-project `h38OwnerApprovedSendSelectedDraft` remains the preferred live email menu path because it is directly exported with the bound project and independently audited.

## Deployment status

No Apps Script source was pushed. No new library version or Web App deployment was created. No trigger was enabled. No email or quote was sent. No payment was requested. No final delivery occurred. No website or social content was published.
