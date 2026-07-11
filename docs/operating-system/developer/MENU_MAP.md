# Highway 38 Operating System — Menu Map

Current menu label: `H38 Owner Portal`.

| Menu group | Menu item | Compatibility wrapper | Target function | Classification |
|---|---|---|---|---|
| Dashboard | Refresh Owner Dashboard | `h38MenuV6RefreshOwnerDashboard` | `h38RefreshOwnerDashboard` | Current, live-only target |
| Intake | Process Selected Intake Row | `h38MenuV6ProcessSelectedIntakeRow` | HOLD alert only | Deprecated stub |
| Intake | Sync Latest Form Response | `h38MenuV6SyncLatestFormResponse` | HOLD alert only | Deprecated stub |
| Owner Review | Show Safe Next Action For Selected Row | `h38MenuV6ShowSafeAction` | `h38OwnerActionRouterShowSelectedRow` | Current, live-only target |
| Owner Review | Approve Selected Row | `h38MenuV6ApproveSelectedRow` | `approveSelectedRow` | Current, live-only target |
| Owner Review | Hold Selected Row | `h38MenuV6HoldSelectedRow` | `holdSelectedRow` | Current, live-only target |
| Owner Review | Revise Selected Row | `h38MenuV6ReviseSelectedRow` | `reviseSelectedRow` | Current, live-only target |
| Owner Review | Reject Selected Row | `h38MenuV6RejectSelectedRow` | `rejectSelectedRow` | Current, live-only target |
| Email | Create Gmail Draft From Selected Row | `h38MenuV6CreateGmailDraftFromSelectedRow` | `h38CreateGmailDraftFromSelectedRow` | Current, live-only target |
| Email | Send Approved Gmail Draft | `h38MenuV6SendApprovedGmailDraft` | `h38OwnerApprovedSendSelectedDraft` | Current, GitHub-controlled target |
| Quote | Prepare Quote Email Draft | `h38MenuV6PrepareQuoteEmailDraft` | `h38PrepareQuoteEmailDraft` | Current, live-only target |
| Quote | Mark Quote Ready For Review | `h38MenuV6MarkQuoteReadyForReview` | `h38MarkQuoteReadyForReview` | Current, live-only target |
| Follow-Up | Create Follow-Up Draft | `h38MenuV6CreateFollowUpDraft` | `h38CreateFollowUpDraft` | Current, live-only target |
| Follow-Up | Mark Follow-Up Complete | `h38MenuV6MarkFollowUpComplete` | `h38MarkFollowUpComplete` | Current, live-only target |
| Proof / Error | Write Manual Proof Note | `h38MenuV6WriteManualProofNote` | `h38WriteManualProofNote` | Current, live-only target |
| Proof / Error | Send Selected Row To Error Log | `h38MenuV6SendSelectedRowToErrorLog` | `h38SendSelectedRowToErrorLog` | Current, live-only target |
| Tools | Refresh Dashboard Counts | `h38MenuV6RefreshOwnerDashboard` | `h38RefreshOwnerDashboard` | Duplicate menu exposure by design |
| Tools | Check Customer Replies V2 | `h38MenuV6CheckCustomerRepliesV2` | `h38CheckCustomerRepliesV2` | Current compatibility path |
| Tools | Menu Safety Status | `h38MenuV6SafetyStatus` | Local alert | Current diagnostic |
| Tools | Run Launch Function Audit | `h38MenuV6RunLaunchAudit` | `h38LaunchModeFunctionAudit` | Compatibility name |
| Tools | Launch Safety Status | `h38MenuV6LaunchSafetyStatus` | `h38LaunchModeSafetyStatus` | Compatibility name |

## Broken-reference rule

The compatibility dispatcher must show a HOLD message when a target is missing. A missing target must never silently perform another action.

## Productized menu target

A future customer installation should expose versionless wrappers while retaining deprecated aliases temporarily. Renaming the live working menu is not part of cleanup until the full bound project has been exported, compared, and safety-tested.