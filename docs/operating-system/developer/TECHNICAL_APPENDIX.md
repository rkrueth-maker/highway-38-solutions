# Highway 38 Operating System — Technical Appendix

## Runtime architecture

The system spans three Apps Script dependency layers:

1. the container-bound Owner Review Portal project;
2. `H38OSLIB`, pinned to immutable version 1;
3. nested `H38OwnerLib`, pinned by the version-1 manifest to version 9.

The complete bound project and a checksum-verifiable exact archive of H38OSLIB version 1 are now in GitHub. `H38OwnerLib` version 9 remains live-only.

## Bound-project audit

The nine-file bound export passed:

- JavaScript and browser-script syntax
- manifest JSON
- zero duplicate server function declarations
- 20 of 20 menu references resolved
- one active menu builder
- Web App `doGet` entry
- private Web App access setting
- no trigger-creation code
- no secrets or private customer records
- exact Git blob consistency

The strict bound-project function `h38OwnerApprovedSendSelectedDraft` remains selected-row only and requires exact Rick approval, `Send Allowed = Yes`, no prior send, lock, or proof, a valid Gmail draft, and a matching recipient.

## H38OSLIB version-1 archive

The version-specific Apps Script API export produced ten files, including `H38_OS_Library_Core.js`. The original ZIP is preserved losslessly as ordered base64 parts and reconstructed by `apps-script/core-engine/h38oslib/version-1-archive/reconstruct.sh`.

Archive integrity:

- original size: 45,581 bytes
- SHA-256: `acaf97d9f2aeaf3a78e435c88cb7cd700d5255322cf365e8d89c842399db705c`
- entries: 10

Automated source results:

- JavaScript syntax: PASS for all nine JavaScript files
- manifest JSON: PASS
- `H38OS_executeApprovedSelectedRow` definition: PASS
- `H38OS_updateDashboard` definition: PASS
- trigger-creation scan: PASS
- secret scan: PASS
- private customer-data scan: PASS
- named function declarations: 230
- duplicated function names: 6
- `onOpen` declarations: 4
- menu references: 42
- unresolved menu targets: 1
- manifest timezone: `America/Chicago`

## Immutable-version rule

Version 1 is already pinned and cannot be edited in place. Confirmed conflicts were documented rather than silently altered. Any correction requires cleaned candidate source, regression tests, a new Apps Script library version, an intentional bound-manifest update, and verification before live execution.

No new library version or deployment was created during this export.

## Core execution safety and parity

`H38_OS_Library_Core.js` performs one-row routing under a document lock, validates owner approval, checks required fields and duplicate signals, and writes proof or error records.

Confirmed email-path differences:

- the library core does not require `Send Allowed = Yes`;
- the library core does not compare the Gmail draft recipient with the selected queue-row recipient.

The bound-project `h38OwnerApprovedSendSelectedDraft` remains the stricter preferred email action. The immutable library was not modified.

## Historical duplicate findings

Version 1 duplicates:

- `h38OwnerApprovedSendSelectedDraft`
- `onOpen`
- `h38OwnerRouteSelectedNewRequest`
- `h38OwnerApproveSelectedWebsiteItem`
- `h38OwnerApprovedSendSelectedFollowUp`
- `h38OwnerApproveSelectedSocialItem`

The historical menu target `runOwnerReviewRouterForSelectedRow` is unresolved.

## Configuration findings

- bound manifest timezone: `America/New_York`
- bound Web App configuration timezone: `Etc/GMT`
- H38OSLIB version-1 timezone: `America/Chicago`
- intended operating timezone: `America/Chicago`

The inconsistency remains documented and unchanged because a partial GitHub-only edit would break source parity.

## Remaining transitive dependency

The H38OSLIB version-1 manifest pins `H38OwnerLib` version 9. Until version 9 is exported, GitHub is authoritative for the complete bound project and the exact H38OSLIB version used by it, but not every transitive runtime dependency.

## Safety actions not performed

No email was sent. No trigger was enabled. No payment was requested. No final work was delivered. No website or social content was published. No Web App deployment or Apps Script library version was created.
