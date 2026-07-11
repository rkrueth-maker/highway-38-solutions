# Highway 38 Operating System — Function Map

## Export scope

This map covers:

- the complete nine-file bound Owner Review Portal export under `apps-script/core-engine/owner-review-portal/`;
- the complete checksum-verifiable immutable H38OSLIB version-1 archive under `apps-script/core-engine/h38oslib/version-1-archive/`.

Selected H38OSLIB files are expanded under `h38oslib/version-1/`; the reconstructed archive is authoritative for the whole version.

## Preferred owner-approved email send

| Function | File | Role | Status |
|---|---|---|---|
| `h38OwnerApprovedSendSelectedDraft` | `owner-review-portal/H38OwnerApprovedEmailSend.js` | Sends one selected existing Gmail draft after exact owner approval, `Send Allowed = Yes`, recipient match, and duplicate checks | Current preferred path; preserved byte-for-byte |
| `h38BuildRowObject_` | same | Builds a header/value object | Private helper |
| `h38GetFirst_` | same | Reads accepted header aliases | Private helper |
| `h38ExtractDraftId_` | same | Extracts a Gmail draft ID | Private helper |
| `h38CreateEmailProofId_` | same | Creates the send proof ID | Private helper |
| `h38SetIfHeaderExists_` | same | Writes only when a target header exists | Private helper |
| `h38WriteProofLog_` / `h38WriteErrorLog_` | same | Writes send proof or blocked-send error | Private audit helpers |

## Bound library wrappers

| Function | File | Library target | Status |
|---|---|---|---|
| `h38ExecuteApprovedSelectedRow` | `owner-review-portal/H38_OS_Bound_Wrappers.js` | `H38OSLIB.H38OS_executeApprovedSelectedRow` | Current bound wrapper |
| `h38ExecutionSafetyStatus` | same | Local safety alert | Current diagnostic |
| `h38RefreshOwnerDashboard` | `owner-review-portal/H38_OS_Dashboard_Wrapper.js` | `H38OSLIB.H38OS_updateDashboard`, with local fallback | Current wrapper |

## H38OSLIB core exports

The archived `H38_OS_Library_Core.js` defines:

| Function | Role | Status |
|---|---|---|
| `H38OS_executeApprovedSelectedRow` | Public selected-row execution export | Exact immutable version-1 source |
| `H38OS_updateDashboard` | Public dashboard refresh export | Exact immutable version-1 source |
| `executeApprovedSelectedRow` | Routes one selected queue row under a document lock | Internal core |
| `executeEmail` | Sends an approved existing Gmail draft | Internal legacy route; parity gaps documented |
| `executeQuote` / `executeFollowUp` | Executes approved draft routes | Internal legacy routes |
| `executeOutput` / `executeSocial` / `executeWebsite` | Prepares or routes non-email actions | Internal legacy routes |
| `validateApproval` | Checks allowed owner decisions/statuses | Internal safety gate |
| `duplicateLock` | Blocks sent, completed, or proof-logged rows | Internal safety gate |
| `writeExecutionProof` | Writes Proof Log | Internal audit function |
| `writeExecutionError` / `blockError_` | Writes Error Log and blocks execution | Internal audit/safety functions |

## Menu and compatibility functions

The bound project has one active `onOpen`, one active `buildOwnerPortalMenu`, and 20 of 20 menu references resolved. Its two deprecated HOLD-only stubs remain:

- `h38MenuV6ProcessSelectedIntakeRow`
- `h38MenuV6SyncLatestFormResponse`

The immutable library archive contains historical router/menu source with four `onOpen` declarations, six duplicated function names, and one unresolved target: `runOwnerReviewRouterForSelectedRow`. These were archived unchanged.

## Self-verification and Web App

| Function | File | Role |
|---|---|---|
| `h38RunSystemSelfVerification` | `owner-review-portal/H38_OS_Self_Verification.js` | Verifies wrapper, library object, queue, proof, and error dependencies |
| `verifySetup` | `owner-review-portal/Code.js` | Logs the draft-only connection message |
| `doGet` | `owner-review-portal/H38_WebApp_Code.js` | Renders the existing private Web App |
| `h38WebAppBootstrap` | same | Returns portal configuration and dashboard data |
| `h38WebAppExecuteRow` | same | Routes one explicitly selected approved row |

## Nested library dependency

H38OSLIB version 1 references `H38OwnerLib` version 9. Historical wrappers call that library for new-request routing and quote, follow-up, website, and social approval actions. Version 9 remains the only unexported transitive Apps Script dependency.
