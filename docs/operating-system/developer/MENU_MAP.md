# Highway 38 Operating System — Menu Map

Current menu label: `H38 Owner Portal`.

The pulled bound project contains one `onOpen` function and one `buildOwnerPortalMenu` function. Every menu item references a function declared in the pulled project.

| Menu group | Menu item | Menu function | Routed target | Classification |
|---|---|---|---|---|
| Dashboard | Refresh Owner Dashboard | `h38MenuV6RefreshOwnerDashboard` | `h38RefreshOwnerDashboard` | Current wrapper |
| Intake | Process Selected Intake Row | `h38MenuV6ProcessSelectedIntakeRow` | HOLD alert only | Deprecated HOLD stub |
| Intake | Sync Latest Form Response | `h38MenuV6SyncLatestFormResponse` | HOLD alert only | Deprecated HOLD stub |
| Owner Review | Show Safe Next Action For Selected Row | `h38MenuV6ShowSafeAction` | `h38OwnerActionRouterShowSelectedRow` | Compatibility dispatch; HOLD when absent |
| Owner Review | Approve Selected Row | `h38MenuV6ApproveSelectedRow` | `approveSelectedRow` | Compatibility dispatch; HOLD when absent |
| Owner Review | Hold Selected Row | `h38MenuV6HoldSelectedRow` | `holdSelectedRow` | Compatibility dispatch; HOLD when absent |
| Owner Review | Revise Selected Row | `h38MenuV6ReviseSelectedRow` | `reviseSelectedRow` | Compatibility dispatch; HOLD when absent |
| Owner Review | Reject Selected Row | `h38MenuV6RejectSelectedRow` | `rejectSelectedRow` | Compatibility dispatch; HOLD when absent |
| Email | Create Gmail Draft From Selected Row | `h38MenuV6CreateGmailDraftFromSelectedRow` | `h38CreateGmailDraftFromSelectedRow` | Compatibility dispatch; HOLD when absent |
| Email | Send Approved Gmail Draft | `h38MenuV6SendApprovedGmailDraft` | `h38OwnerApprovedSendSelectedDraft` | Current owner-approved send path |
| Quote | Prepare Quote Email Draft | `h38MenuV6PrepareQuoteEmailDraft` | `h38PrepareQuoteEmailDraft` | Compatibility dispatch; HOLD when absent |
| Quote | Mark Quote Ready For Review | `h38MenuV6MarkQuoteReadyForReview` | `h38MarkQuoteReadyForReview` | Compatibility dispatch; HOLD when absent |
| Follow-Up | Create Follow-Up Draft | `h38MenuV6CreateFollowUpDraft` | `h38CreateFollowUpDraft` | Compatibility dispatch; HOLD when absent |
| Follow-Up | Mark Follow-Up Complete | `h38MenuV6MarkFollowUpComplete` | `h38MarkFollowUpComplete` | Compatibility dispatch; HOLD when absent |
| Proof / Error | Write Manual Proof Note | `h38MenuV6WriteManualProofNote` | `h38WriteManualProofNote` | Compatibility dispatch; HOLD when absent |
| Proof / Error | Send Selected Row To Error Log | `h38MenuV6SendSelectedRowToErrorLog` | `h38SendSelectedRowToErrorLog` | Compatibility dispatch; HOLD when absent |
| Tools | Check Customer Replies V2 | `h38MenuV6CheckCustomerRepliesV2` | `h38CheckCustomerRepliesV2` | Compatibility dispatch; HOLD when absent |
| Tools | Menu Safety Status | `h38MenuV6SafetyStatus` | Local safety alert | Current diagnostic |
| Tools | Run System Self Verification | `h38RunSystemSelfVerification` | Local verification routine | Current diagnostic |
| Execution | Execution Safety Status | `h38ExecutionSafetyStatus` | Local safety alert | Current diagnostic |
| Execution | Execute Approved Selected Row | `h38ExecuteApprovedSelectedRow` | `H38OSLIB.H38OS_executeApprovedSelectedRow` | Current library wrapper |

## Reference checks

- Menu items found: 20.
- Missing menu function references: 0.
- Active menu builders: 1.
- Duplicate menu builders: 0.
- The compatibility dispatcher must continue to show HOLD when its dynamic target is missing.
- The two Intake functions remain HOLD-only and deprecated.
