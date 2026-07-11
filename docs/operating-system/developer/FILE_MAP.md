# Highway 38 Operating System — File Map

## Bound Owner Review Portal export

The nine-file live bound project export is stored byte-for-byte under `apps-script/core-engine/owner-review-portal/`.

| Path | Purpose | Status |
|---|---|---|
| `owner-review-portal/appsscript.json` | Runtime, Web App access, and pinned H38OSLIB dependency | Exact live export |
| `owner-review-portal/Code.js` | Connection/setup logger | Exact live export |
| `owner-review-portal/H38_OS_Bound_Wrappers.js` | Selected-row library wrapper and safety status | Exact live export |
| `owner-review-portal/H38_OS_Dashboard_Wrapper.js` | Dashboard library wrapper with fallback | Exact live export |
| `owner-review-portal/H38_OS_Menu_Restore.js` | Bound menu, compatibility wrappers, HOLD stubs | Exact live export |
| `owner-review-portal/H38_OS_Self_Verification.js` | Self-verification routine | Exact live export |
| `owner-review-portal/H38_WebApp_Code.js` | Private Web App server and routes | Exact live export |
| `owner-review-portal/H38_WebApp_Index.html` | Private Web App browser UI | Exact live export |
| `owner-review-portal/H38OwnerApprovedEmailSend.js` | Strict approved selected-row send | Exact live export |

## H38OSLIB version-1 export

The complete ten-file immutable export is preserved losslessly under `apps-script/core-engine/h38oslib/version-1-archive/`.

- original ZIP size: 45,581 bytes
- SHA-256: `acaf97d9f2aeaf3a78e435c88cb7cd700d5255322cf365e8d89c842399db705c`
- entries: 10
- reconstruction script: `version-1-archive/reconstruct.sh`

Selected files are expanded under `apps-script/core-engine/h38oslib/version-1/`.

## H38OwnerLib version-9 export

The final nested library is stored under `apps-script/core-engine/h38ownerlib/`.

Expanded manifest for inspection:

- `h38ownerlib/version-9/appsscript.json`

Checksum-verifiable complete archive:

- original ZIP size: 4,399 bytes
- SHA-256: `b198901e05b1a32165cb5ef0301d987bfdf780d28542764deef394170ef53fd5`
- entries: 2
- reconstruction script: `h38ownerlib/version-9-archive/reconstruct.sh`

The version-9 manifest contains no library dependency.

## Existing compatibility mirror

`apps-script/core-engine/H38OwnerApprovedEmailSend.gs` is the pre-export maintained mirror. Its Git blob is identical to the bound-project `.js` source. Do not push both copies into one project.

## Source-of-truth result

GitHub contains the complete source evidence for all three Apps Script runtime layers. There is no remaining unexported transitive Apps Script dependency.

## Public/private boundary

The exports contain project/library configuration identifiers but no API secrets, OAuth tokens, passwords, private keys, session cookies, embedded customer emails, phone numbers, Gmail customer IDs, or private customer records.
