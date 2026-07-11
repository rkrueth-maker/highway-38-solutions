# Highway 38 Operating System — Menu Map

## Active bound-project menu

Current menu label: `H38 Owner Portal`.

The bound project contains one active `onOpen` and one `buildOwnerPortalMenu`. Every one of its 20 menu items resolves to a declared bound-project function.

| Menu group | Menu item | Menu function | Routed target | Classification |
|---|---|---|---|---|
| Dashboard | Refresh Owner Dashboard | `h38MenuV6RefreshOwnerDashboard` | `h38RefreshOwnerDashboard` | Current wrapper |
| Intake | Process Selected Intake Row | `h38MenuV6ProcessSelectedIntakeRow` | HOLD alert only | Deprecated HOLD stub |
| Intake | Sync Latest Form Response | `h38MenuV6SyncLatestFormResponse` | HOLD alert only | Deprecated HOLD stub |
| Owner Review | Show Safe Next Action | `h38MenuV6ShowSafeAction` | dynamic target | Compatibility dispatch; HOLD when absent |
| Owner Review | Approve/Hold/Revise/Reject | corresponding `h38MenuV6*` wrapper | dynamic target | Compatibility dispatch; HOLD when absent |
| Email | Send Approved Gmail Draft | `h38MenuV6SendApprovedGmailDraft` | `h38OwnerApprovedSendSelectedDraft` | Current strict send path |
| Tools | Run System Self Verification | `h38RunSystemSelfVerification` | local verification | Current diagnostic |
| Execution | Execute Approved Selected Row | `h38ExecuteApprovedSelectedRow` | `H38OSLIB.H38OS_executeApprovedSelectedRow` | Current library wrapper |

Bound menu results:

- menu items: 20
- missing references: 0
- active menu builders: 1
- duplicate menu builders: 0

## H38OSLIB version-1 historical menu source

The complete immutable archive contains historical menu/router files in addition to the active bound-project menu.

Automated results:

- menu references: 42
- `onOpen` declarations: 4
- duplicated function names: 6
- unresolved menu targets: 1

Unresolved target:

- `runOwnerReviewRouterForSelectedRow`

The historical version-1 menu sources were archived exactly and were not rewritten. They are compatibility/history source, not the preferred menu implementation for a new installation.

## Migration rule

A future cleanup must:

1. create a new library version;
2. retain the bound-project menu as the sole active menu builder;
3. remove or rename duplicates only after regression testing;
4. keep missing targets HOLD-only;
5. intentionally update the bound manifest only after validation.
