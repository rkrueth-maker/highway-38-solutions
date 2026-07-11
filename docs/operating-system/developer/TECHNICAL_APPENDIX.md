# Highway 38 Operating System — Technical Appendix

## Runtime architecture

The Owner Review Portal is a container-bound Apps Script project with a private Web App, a spreadsheet menu, selected-row actions, and a separately versioned Apps Script library identified as `H38OSLIB`.

The bound project is now exported under `apps-script/core-engine/owner-review-portal/`. The separate library source is not included in a bound-project `clasp pull` and requires its own export.

## Automated export audit

The 2026-07-11 export contained nine files. Automated checks produced these results:

- Runtime file inventory: PASS — 8 code/UI files plus `appsscript.json`.
- JavaScript syntax: PASS for all seven server `.js` files and `Code.js`.
- Web App browser-script syntax: PASS.
- Manifest JSON syntax: PASS.
- Duplicate server function declarations: PASS — zero duplicates.
- Menu function references: PASS — 20 of 20 menu items resolve to declared bound-project functions.
- Menu builders: PASS — one `onOpen` and one `buildOwnerPortalMenu`.
- Wrapper-to-library references: PASS structurally — `H38OS_executeApprovedSelectedRow` and `H38OS_updateDashboard` are the two referenced library functions.
- Web App entry point: PASS — `doGet` renders `H38_WebApp_Index`.
- Manifest Web App restriction: PASS — execute as deploying user, access `MYSELF`.
- Trigger scan: PASS — no trigger creation, deletion, or enablement code found.
- Secret scan: PASS — no API keys, OAuth tokens, passwords, private keys, or session credentials found.
- Private customer-data scan: PASS — no customer records, customer emails, phone numbers, Gmail customer message IDs, or private job-folder links found.
- Exact source consistency: PASS for the nine exported files, confirmed by Git blob hashes.

## Approved-send implementation

`h38OwnerApprovedSendSelectedDraft` was preserved byte-for-byte. It remains selected-row only, restricted to `Email Approval Queue`, and requires:

- `Rick Decision = APPROVE SEND`
- `Send Allowed = Yes`
- no prior sent time
- no active duplicate/send lock
- no prior `PROOF-SENT` proof ID
- a Gmail draft recipient matching the queue recipient

The function writes Proof Log on success and Error Log when blocked. No email was sent during the export or audit.

## Web App safety behavior

The Web App routes only one explicit queue row at a time under a document lock. Each action route requires the exact approval status and decision, then applies the duplicate lock. Output, social, and website routes prepare drafts or handoffs rather than performing final delivery, social publication, or website deployment.

The existing deployment URL was not changed and no new deployment was created.

## Preserved deprecated behavior

`h38MenuV6ProcessSelectedIntakeRow` and `h38MenuV6SyncLatestFormResponse` remain HOLD-only stubs. Other `h38MenuV6*` functions remain compatibility wrappers. Missing dynamic targets display HOLD rather than silently performing a different action.

## Confirmed configuration conflicts not altered in the exact export

The live manifest uses `America/New_York`, while `H38_WEBAPP_CONFIG.TIMEZONE` uses `Etc/GMT`. The operating timezone for this system is `America/Chicago`. This is a confirmed configuration inconsistency, but the exported files were committed exactly as pulled so GitHub and the bound live project remain comparable. Correcting the timezone requires a synchronized source change and clasp push; it must not be changed in only one location.

The private Web App server has a separate `executeEmail_` route in addition to the menu's `h38OwnerApprovedSendSelectedDraft` path. Both require owner approval and duplicate locks. The menu path additionally performs an explicit draft-recipient comparison. This parity difference is documented and was not changed during a source-export-only operation.

## Separate library blocker

The manifest pins this dependency:

- Symbol: `H38OSLIB`
- Version: `1`
- Development mode: `false`
- Library ID: recorded in `appsscript.json`

`H38_OS_Library_Core` remains inside that separate library project. Until that project is pulled and committed, GitHub is the complete source of truth for the bound Owner Review Portal project but not yet for the full multi-project runtime.
