# Highway 38 Operating System — File Map

## Complete bound Owner Review Portal export

The live bound project was pulled with clasp on 2026-07-11 and is stored byte-for-byte under `apps-script/core-engine/owner-review-portal/`.

| Path | Purpose | Status |
|---|---|---|
| `apps-script/core-engine/owner-review-portal/appsscript.json` | Runtime, Web App access, and pinned library dependency | Exact live export |
| `apps-script/core-engine/owner-review-portal/Code.js` | Connection/setup logger | Exact live export |
| `apps-script/core-engine/owner-review-portal/H38_OS_Bound_Wrappers.js` | Selected-row library wrapper and execution safety status | Exact live export |
| `apps-script/core-engine/owner-review-portal/H38_OS_Dashboard_Wrapper.js` | Library dashboard wrapper with safe local fallback | Exact live export |
| `apps-script/core-engine/owner-review-portal/H38_OS_Menu_Restore.js` | Complete menu builder, compatibility wrappers, and HOLD stubs | Exact live export |
| `apps-script/core-engine/owner-review-portal/H38_OS_Self_Verification.js` | Bound-project self-verification routine | Exact live export |
| `apps-script/core-engine/owner-review-portal/H38_WebApp_Code.js` | Private Web App server and selected-row routes | Exact live export |
| `apps-script/core-engine/owner-review-portal/H38_WebApp_Index.html` | Private Web App browser UI | Exact live export |
| `apps-script/core-engine/owner-review-portal/H38OwnerApprovedEmailSend.js` | Approved selected-row Gmail draft send implementation | Exact live export |

## Existing compatibility mirror

`apps-script/core-engine/H38OwnerApprovedEmailSend.gs` is the pre-export maintained mirror used by the older deployment helper. Its Git blob is identical to the pulled `H38OwnerApprovedEmailSend.js`. Do not push both copies into the same Apps Script project.

## Separate library project

The manifest references `H38OSLIB` at library version `1`, development mode disabled. The separate library source, including `H38_OS_Library_Core`, is not part of the bound-project pull and still requires its own clasp export before GitHub is the complete multi-project code source of truth.

## Documentation

| Path | Purpose |
|---|---|
| `docs/operating-system/developer/FUNCTION_MAP.md` | Runtime function and dependency map |
| `docs/operating-system/developer/MENU_MAP.md` | Exact bound menu and routing map |
| `docs/operating-system/developer/FILE_MAP.md` | Source-control ownership and export inventory |
| `docs/operating-system/developer/TECHNICAL_APPENDIX.md` | Architecture, automated audit results, and remaining conflicts |

## Public/private boundary

The export contains owner configuration emails, the Owner Review Portal spreadsheet ID, and the Apps Script library ID. The automated scan found no API secrets, OAuth tokens, passwords, private keys, session cookies, Gmail customer draft/message IDs, customer emails, customer phone numbers, or private customer records.
