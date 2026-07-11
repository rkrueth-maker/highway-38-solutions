# Highway 38 Operating System — File Map

## Bound Owner Review Portal export

The live bound project was pulled with clasp on 2026-07-11 and is stored byte-for-byte under `apps-script/core-engine/owner-review-portal/`.

| Path | Purpose | Status |
|---|---|---|
| `owner-review-portal/appsscript.json` | Runtime, Web App access, and pinned `H38OSLIB` dependency | Exact live export |
| `owner-review-portal/Code.js` | Connection/setup logger | Exact live export |
| `owner-review-portal/H38_OS_Bound_Wrappers.js` | Selected-row library wrapper and execution safety status | Exact live export |
| `owner-review-portal/H38_OS_Dashboard_Wrapper.js` | Library dashboard wrapper with safe local fallback | Exact live export |
| `owner-review-portal/H38_OS_Menu_Restore.js` | Complete bound menu, compatibility wrappers, and HOLD stubs | Exact live export |
| `owner-review-portal/H38_OS_Self_Verification.js` | Bound-project self-verification | Exact live export |
| `owner-review-portal/H38_WebApp_Code.js` | Private Web App server and selected-row routes | Exact live export |
| `owner-review-portal/H38_WebApp_Index.html` | Private Web App browser UI | Exact live export |
| `owner-review-portal/H38OwnerApprovedEmailSend.js` | Strict approved selected-row Gmail draft send | Exact live export |

## H38OSLIB version-1 export

The complete ten-file immutable export is stored losslessly as ordered base64 archive parts under `apps-script/core-engine/h38oslib/version-1-archive/`.

- original ZIP size: 45,581 bytes
- SHA-256: `acaf97d9f2aeaf3a78e435c88cb7cd700d5255322cf365e8d89c842399db705c`
- reconstruction script: `version-1-archive/reconstruct.sh`
- ZIP entries: 10

Selected exact files are also expanded under `apps-script/core-engine/h38oslib/version-1/`, including the manifest, historical wrapper/menu source, and customer-reply source. The reconstructed archive is authoritative for the complete version.

The archive inventory includes `H38_OS_Library_Core.js`, both customer-reply modules, historical status/router/menu/audit files, `Code.js`, and `appsscript.json`.

## Existing compatibility mirror

`apps-script/core-engine/H38OwnerApprovedEmailSend.gs` is the pre-export maintained mirror. Its Git blob is identical to the pulled bound-project `.js` file. Do not push both copies into one Apps Script project.

## Remaining transitive dependency

The H38OSLIB version-1 manifest references `H38OwnerLib` version 9. That nested library remains live-only.

## Public/private boundary

The exports contain project and library configuration identifiers but no API secrets, OAuth tokens, passwords, private keys, session cookies, customer emails, customer phone numbers, Gmail customer message IDs, or private customer records.
