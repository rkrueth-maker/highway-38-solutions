# Highway 38 Operating System — Function Map

## Export scope

This map covers the nine-file live Owner Review Portal bound Apps Script export pulled on 2026-07-11 and stored under `apps-script/core-engine/owner-review-portal/`.

## Owner-approved send path

| Function | File | Role | Status |
|---|---|---|---|
| `h38OwnerApprovedSendSelectedDraft` | `H38OwnerApprovedEmailSend.js` | Sends the selected existing Gmail draft only after exact owner approval and duplicate checks | Current; preserved byte-for-byte |
| `h38BuildRowObject_` | `H38OwnerApprovedEmailSend.js` | Builds a header/value object | Private helper |
| `h38GetFirst_` | `H38OwnerApprovedEmailSend.js` | Reads the first populated accepted header alias | Private helper |
| `h38ExtractDraftId_` | `H38OwnerApprovedEmailSend.js` | Extracts a Gmail draft ID | Private helper |
| `h38CreateEmailProofId_` | `H38OwnerApprovedEmailSend.js` | Creates the send proof ID | Private helper |
| `h38SetIfHeaderExists_` | `H38OwnerApprovedEmailSend.js` | Writes a value only when the target header exists | Private helper |
| `h38WriteProofLog_` | `H38OwnerApprovedEmailSend.js` | Appends the approved-send proof row | Private helper |
| `h38WriteErrorLog_` | `H38OwnerApprovedEmailSend.js` | Appends the blocked-send error row | Private helper |

## Bound library wrappers

| Function | File | Library target | Status |
|---|---|---|---|
| `h38ExecuteApprovedSelectedRow` | `H38_OS_Bound_Wrappers.js` | `H38OSLIB.H38OS_executeApprovedSelectedRow` | Current bound wrapper |
| `h38ExecutionSafetyStatus` | `H38_OS_Bound_Wrappers.js` | Local safety alert | Current diagnostic |
| `h38RefreshOwnerDashboard` | `H38_OS_Dashboard_Wrapper.js` | `H38OSLIB.H38OS_updateDashboard`, with local fallback | Current wrapper |

## Menu and compatibility functions

`H38_OS_Menu_Restore.js` contains the single active `onOpen` and `buildOwnerPortalMenu` implementation. All `h38MenuV6*` names are compatibility wrappers retained for the live menu.

The following wrappers are current: `h38MenuV6RefreshOwnerDashboard`, `h38MenuV6ShowSafeAction`, `h38MenuV6ApproveSelectedRow`, `h38MenuV6HoldSelectedRow`, `h38MenuV6ReviseSelectedRow`, `h38MenuV6RejectSelectedRow`, `h38MenuV6CreateGmailDraftFromSelectedRow`, `h38MenuV6SendApprovedGmailDraft`, `h38MenuV6PrepareQuoteEmailDraft`, `h38MenuV6MarkQuoteReadyForReview`, `h38MenuV6CreateFollowUpDraft`, `h38MenuV6MarkFollowUpComplete`, `h38MenuV6WriteManualProofNote`, `h38MenuV6SendSelectedRowToErrorLog`, `h38MenuV6CheckCustomerRepliesV2`, and `h38MenuV6SafetyStatus`.

The following remain deprecated HOLD-only stubs and must not be converted into active processing without a separate tested change:

- `h38MenuV6ProcessSelectedIntakeRow`
- `h38MenuV6SyncLatestFormResponse`

`h38MenuV6Call_` intentionally displays HOLD when its dynamic target is unavailable.

## Self-verification

| Function | File | Role |
|---|---|---|
| `h38RunSystemSelfVerification` | `H38_OS_Self_Verification.js` | Writes the non-customer-facing System Verification tab and checks wrapper, library-object, queue, proof, and error dependencies |
| `verifySetup` | `Code.js` | Logs the draft-only connection message |

## Web App server entry functions

| Function | Role |
|---|---|
| `doGet` | Renders `H38_WebApp_Index` for the existing private Web App deployment |
| `h38WebAppBootstrap` | Returns access, dashboard, queue, summary, and safety data |
| `h38WebAppGetQueue` | Reads an allowed queue, limited to the configured recent-row count |
| `h38WebAppRefreshDashboard` | Refreshes dashboard data |
| `h38WebAppApproveRow` | Records the exact decision and allow value for one selected row |
| `h38WebAppHoldRow` | Returns one selected row to HOLD |
| `h38WebAppExecuteRow` | Routes one selected approved row under a document lock |
| `h38WebAppGetProofLog` | Reads filtered Proof Log rows |
| `h38WebAppGetErrorLog` | Reads filtered Error Log rows |
| `h38WebAppSafetyStatus` | Returns the private portal safety state |

The server's internal execution routes are `executeEmail_`, `executeQuote_`, `executeFollowUp_`, `executeOutput_`, `executeSocial_`, and `executeWebsite_`. Each route calls `validateApproval_` and `duplicateLock_` before its action.

## Duplicate-function result

The automated scan found **zero duplicate function declarations across the nine pulled runtime files**. Client-side functions inside `H38_WebApp_Index.html` are a separate browser scope and do not collide with Apps Script server functions.

## Separate library dependency

The bound project manifest references library symbol `H38OSLIB`, pinned to version `1` with development mode disabled. The separate library project's source, including `H38_OS_Library_Core`, is not contained in this bound-project export and remains the only code-export blocker.
