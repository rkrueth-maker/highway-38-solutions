# Highway 38 Operating System — Technical Appendix

## Runtime architecture

The system spans three Apps Script layers:

1. container-bound Owner Review Portal project;
2. `H38OSLIB`, pinned to immutable version 1;
3. `H38OwnerLib`, pinned by H38OSLIB version 1 to immutable version 9.

All three layers are now archived in GitHub. H38OwnerLib version 9 has no further library dependency.

## Bound-project audit

The nine-file bound export passed:

- JavaScript and browser-script syntax
- manifest JSON
- zero duplicate server function declarations
- 20 of 20 menu references resolved
- one active menu builder
- Web App `doGet`
- private Web App access setting
- no trigger-creation code
- no secrets or private customer records
- exact Git blob consistency

The strict bound `h38OwnerApprovedSendSelectedDraft` requires exact Rick approval, `Send Allowed = Yes`, no prior send/lock/proof, an existing Gmail draft, and a matching recipient.

## H38OSLIB version-1 archive

Archive integrity:

- size: 45,581 bytes
- SHA-256: `acaf97d9f2aeaf3a78e435c88cb7cd700d5255322cf365e8d89c842399db705c`
- entries: 10
- JavaScript syntax: PASS for nine files
- manifest JSON: PASS
- named function declarations: 230
- duplicate function names: 6
- `onOpen` declarations: 4
- unresolved menu targets: 1
- timezone: `America/Chicago`

Confirmed immutable findings remain documented rather than changed:

- historical duplicate functions;
- unresolved `runOwnerReviewRouterForSelectedRow`;
- legacy core email path lacks the bound path's explicit `Send Allowed = Yes` and recipient-match checks.

## H38OwnerLib version-9 archive

Archive integrity:

- size: 4,399 bytes
- SHA-256: `b198901e05b1a32165cb5ef0301d987bfdf780d28542764deef394170ef53fd5`
- entries: 2
- `Code.js`: 24,864 bytes
- `appsscript.json`: 99 bytes
- JavaScript syntax: PASS
- manifest JSON: PASS
- named function declarations: 18
- duplicate function declarations: 0
- trigger-creation scan: PASS
- secret/customer-data scans: PASS
- timezone: `America/Chicago`
- nested libraries: none

Version 9 provides selected-row functions for approved email, quote, and follow-up draft sends; internal new-request routing; website-ready marking; and social-ready marking.

Its three Gmail-send paths require:

- the exact owner decision;
- `Send Allowed = Yes`;
- an existing Gmail draft;
- duplicate-send protections;
- draft-recipient match.

Website and social actions do not publish. New-request routing is internal only.

## Immutable-version rule

Pinned versions cannot be edited in place. Any correction requires cleaned candidate source, regression tests, a new Apps Script library version, deliberate manifest changes, and verification before live execution.

No new library version or deployment was created during these exports.

## Configuration findings

- bound manifest timezone: `America/New_York`
- bound Web App configuration timezone: `Etc/GMT`
- H38OSLIB version-1 timezone: `America/Chicago`
- H38OwnerLib version-9 timezone: `America/Chicago`
- intended operating timezone: `America/Chicago`

This configuration inconsistency remains documented and unchanged because a partial GitHub-only edit would break live/source parity.

## Final source-of-truth status

GitHub is authoritative for the exact source evidence of every Apps Script runtime layer. No source-export blocker remains.

The remaining work is controlled modernization rather than source recovery:

- create a cleaned replacement library candidate;
- remove historical duplicate/menu conflicts;
- unify timezone configuration;
- preserve strict owner gates and recipient matching;
- regression-test before creating or pinning any new version.

## Safety actions not performed

No email or quote was sent. No trigger was enabled. No payment was requested. No final work was delivered. No website or social content was published. No Web App deployment or Apps Script library version was created.
