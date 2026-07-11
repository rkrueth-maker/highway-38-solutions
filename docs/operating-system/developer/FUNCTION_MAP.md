# Highway 38 Operating System — Function Map

## Export scope

This map covers all three Apps Script runtime layers:

- bound Owner Review Portal project under `apps-script/core-engine/owner-review-portal/`;
- immutable H38OSLIB version 1 under `apps-script/core-engine/h38oslib/version-1-archive/`;
- immutable H38OwnerLib version 9 under `apps-script/core-engine/h38ownerlib/version-9-archive/`.

## Preferred bound email send

| Function | File | Role | Status |
|---|---|---|---|
| `h38OwnerApprovedSendSelectedDraft` | `owner-review-portal/H38OwnerApprovedEmailSend.js` | Sends one selected existing Gmail draft after exact owner approval, `Send Allowed = Yes`, recipient match, and duplicate checks | Current preferred menu path |
| `h38BuildRowObject_` | same | Builds a header/value object | Private helper |
| `h38GetFirst_` | same | Reads accepted header aliases | Private helper |
| `h38ExtractDraftId_` | same | Extracts a Gmail draft ID | Private helper |
| `h38CreateEmailProofId_` | same | Creates the send proof ID | Private helper |
| `h38SetIfHeaderExists_` | same | Writes only when a target header exists | Private helper |
| `h38WriteProofLog_` / `h38WriteErrorLog_` | same | Writes proof or blocked-send error | Private audit helpers |

## Bound wrappers

| Function | Target | Status |
|---|---|---|
| `h38ExecuteApprovedSelectedRow` | `H38OSLIB.H38OS_executeApprovedSelectedRow` | Current wrapper |
| `h38RefreshOwnerDashboard` | `H38OSLIB.H38OS_updateDashboard` | Current wrapper with local fallback |
| `h38ExecutionSafetyStatus` | Local safety alert | Current diagnostic |

## H38OSLIB version-1 exports

| Function | Role | Status |
|---|---|---|
| `H38OS_executeApprovedSelectedRow` | Public selected-row execution export | Exact immutable source |
| `H38OS_updateDashboard` | Public dashboard refresh export | Exact immutable source |
| `executeApprovedSelectedRow` | Routes one selected queue row under a document lock | Internal core |
| `validateApproval` | Checks allowed decisions/statuses | Internal safety gate |
| `duplicateLock` | Blocks duplicate/completed/proof-logged execution | Internal safety gate |
| `writeExecutionProof` | Writes Proof Log | Internal audit |
| `writeExecutionError` / `blockError_` | Writes Error Log and blocks | Internal safety/audit |

H38OSLIB version 1 also contains historical duplicated owner-action and menu functions. The exact archive remains authoritative and unchanged.

## H38OwnerLib version-9 owner actions

| Function | Role | Safety behavior |
|---|---|---|
| `h38OwnerApprovedSendSelectedDraft` | Sends approved existing customer-email draft | `APPROVE SEND`, `Send Allowed = Yes`, duplicate checks, recipient match |
| `h38OwnerApprovedSendSelectedQuote` | Sends approved existing quote draft | `APPROVE QUOTE SEND`, numeric amount, `Send Allowed = Yes`, duplicate checks, recipient match |
| `h38OwnerRouteSelectedNewRequest` | Routes selected request internally to Job Queue | Owner approval required; no customer-facing action |
| `h38OwnerApproveSelectedWebsiteItem` | Marks website item publish-ready | Owner decision and allowed flag; no deploy |
| `h38OwnerApprovedSendSelectedFollowUp` | Sends approved follow-up draft | `APPROVE FOLLOW-UP SEND`, `Send Allowed = Yes`, duplicate checks, recipient match |
| `h38OwnerApproveSelectedSocialItem` | Marks social item ready | Owner decision and allowed flag; no publish or schedule |
| `hold_` / `block_` | Returns HOLD and writes blocked-action error | Shared safety helpers |
| `getValue_` / `setHeaderValue_` | Reads aliases and writes existing headers | Shared row helpers |
| `extractDraftId_` | Extracts draft identifier | Shared Gmail helper |
| `writeProofLog_` / `writeErrorLog_` | Appends audit rows | Shared audit helpers |

Version 9 contains 18 named function declarations with zero duplicates and no nested library dependency.

## Menu and compatibility functions

The bound project has one active `onOpen`, one active `buildOwnerPortalMenu`, and 20 of 20 menu references resolved. Its two HOLD-only deprecated stubs remain:

- `h38MenuV6ProcessSelectedIntakeRow`
- `h38MenuV6SyncLatestFormResponse`

The immutable H38OSLIB archive contains historical router/menu source with four `onOpen` declarations, six duplicated names, and one unresolved target: `runOwnerReviewRouterForSelectedRow`.

## Self-verification and Web App

| Function | File | Role |
|---|---|---|
| `h38RunSystemSelfVerification` | `owner-review-portal/H38_OS_Self_Verification.js` | Verifies wrapper, library object, queue, proof, and error dependencies |
| `doGet` | `owner-review-portal/H38_WebApp_Code.js` | Renders the existing private Web App |
| `h38WebAppExecuteRow` | same | Routes one explicitly selected approved row |

## Dependency status

All Apps Script runtime source layers are now exported. No unexported nested Apps Script dependency remains.
