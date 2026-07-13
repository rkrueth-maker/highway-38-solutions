# Command Center Deployment and Branding Closeout

Status: DOCUMENTATION PACKAGE COMPLETE / TECHNICAL HOLD  
Issue: #78 — 03 Operations & Documentation — deployment and branding closeout  
Parent issue: #31 — Complete Highway 38 ecosystem live launch  
Parent authority: 01 — Command Center  
Documentation owner: 03 — Operations & Documentation  
Technical resolution owner: 02 — Build & Automation  
Date: 2026-07-13

## Objective

Create the permanent operating controls for deployment-state verification, direct-to-main execution, Sample Library deployment, approved Highway 38 branding, failure prevention, and Command Center closure.

No website redesign, new feature work, or alternate logo work is authorized by this record.

## Documentation package

1. `docs/operating-system/operator/DEPLOYMENT_STATE_VERIFICATION_STANDARD.md`
2. `docs/operating-system/operator/DIRECT_TO_MAIN_COMMAND_RULE.md`
3. `docs/operating-system/operator/SAMPLE_LIBRARY_DEPLOYMENT_PROCEDURE.md`
4. `docs/brand/HIGHWAY_38_PUBLIC_LOGO_STANDARD.md`
5. `docs/operating-system/operator/DEPLOYMENT_FAILURE_PREVENTION_CHECKLIST.md`
6. `docs/command-center/DEPLOYMENT_AND_BRANDING_CLOSEOUT_2026-07-13.md`

## Sample Library marker correction summary

The earlier Sample Library deployment alarms were resolved by aligning the page source and deploy-helper defaults to the approved Version 5 asset markers.

Controlled markers:

- `assets/hero-garage-before-after.png?v=v5-no-svg-polish`
- `assets/demo-run-sample-garage-bay.png?v=v5-no-svg-polish`
- `assets/workflow-opportunity-finished.png?v=v5-no-svg-polish`

Controlling commits:

- `a1fc3bf69c2e8375007e600cdeed01f7d149df5c` — helper defaults corrected
- `463290ad08895b3a14863cd88d80cc7aca64722a` — Sample Library marker/page correction

The supporting Drive document **ChatCopilot** records that the correction reached `origin/main`, GitHub Pages deployed it, and LOCAL, ORIGIN_MAIN, and LIVE_PAGES marker checks passed at that closure.

Marker-repair history state: **COMPLETE.** The historical marker alarm is not reopened unless new marker or deployment evidence fails.

Current full-page compliance is evaluated separately below because current automated verification produced new evidence beyond the original marker alarm.

## False-alarm root cause

The earlier false alarms resulted from:

- old workflow-opportunity asset references;
- stale deploy-helper default markers;
- treating dirty LOCAL state as evidence that LIVE_PAGES was defective;
- pushing unrelated logo work without the pending Sample Library correction; and
- resolving branch integration without first defining the intended combined source.

## Approved logo decision

The only approved public logo is the second mountain-and-road Highway 38 Solutions badge.

Controlled values:

- asset: `assets/highway38-logo.png`
- cache key: `20260713-logo2`
- alt text: `Highway 38 Solutions`
- visible text fallback: required beside the image
- first H38 swoosh: retired
- third logo: retired

Controlling branding commit:

`4850f074718773ca950d22dbe30444f109634232` — **Use only the approved second logo across the public site**

No alternate logo may be reintroduced without 01 — Command Center approval.

## Deployment-control lesson

When Rick says **deploy to main**, work is not complete until:

1. intended files are present in `origin/main`;
2. the deployment mechanism has completed; and
3. the exact live public destination has been checked independently.

Every report must show LOCAL, ORIGIN_MAIN, and LIVE_PAGES separately. A local commit, branch push, pull request, merge, clean test, or remote workflow alone is not live proof.

## Repository verification performed for Issue #78

Baseline `main` during the 03 review resolved to:

`463290ad08895b3a14863cd88d80cc7aca64722a`

Comparison from branding commit `4850f074718773ca950d22dbe30444f109634232` to `main` showed:

- `main` ahead by two commits;
- the branding commit is in the `main` history;
- the two later modified files are `scripts/deploy_sample_library.sh` and `sample-library-now.html`.

Current `main` verification also found:

- `brand-global.js` uses `assets/highway38-logo.png?v=20260713-logo2`;
- `brand-global.js` uses alt text `Highway 38 Solutions`;
- `brand-global.js` retains a visible `Highway 38 Solutions` text fallback;
- homepage source uses the approved logo asset, cache key, and alt text; and
- the Sample Library deploy helper contains the corrected Version 5 markers.

## Pull-request verification evidence

The six-file documentation package was tested through PR #79 at head commit `cd15b0cdf28e6c5edc8d1e6c85fcf6c09965ba08` before merge.

Results:

- **Highway 38 Solutions Tests**, run 788: PASS.
- Existing Python repository tests: **64 passed**.
- **Commercial System Check**, run 138: HOLD/FAIL on existing Sample Library source.
- **Raster Sample Proof Check**, run 127: HOLD/FAIL at rendered Sample Library proof verification.

The commercial verification report passed catalog, pricing, link, privacy, intake, workflow, and owner-control checks, but reported these current Sample Library failures:

- `sample-library-now.html` is not connected to the approved catalog;
- the page is missing the public commercial contract layer;
- the approved Owner Portal public-location flag is missing;
- the samples hub does not contain all products and bundle proof; and
- the forbidden legacy/internal phrase `Custom Work Build` remains.

These failures were present in the current public-source baseline and were not introduced by the six documentation files. They are new evidence that the current Sample Library page requires technical reconciliation.

## Contradictions requiring 02 resolution

### Branding compliance

The later Sample Library correction commit replaced `sample-library-now.html` after the approved branding commit. Current `main` source for that page does not load `brand-global.css?v=20260713-logo2` or `brand-global.js?v=20260713-logo2` and does not contain the approved logo asset reference.

### Commercial samples-hub compliance

Current automated verification shows that the page is a legacy Version 5 package-ladder source rather than the approved catalog-driven hub for all 15 products and 9 bundles.

These findings do not invalidate the historical three-marker correction. They are separate current-source compliance defects discovered through stronger repository evidence.

03 is not authorized to redesign or alter the public site under Issue #78. The defects are routed to 02 — Build & Automation for narrow reconciliation and three-scope re-verification.

Required 02 return evidence:

- corrected file path and commit;
- confirmation the three controlled Version 5 markers remain valid or an approved replacement marker set is documented;
- confirmation the approved 15-product and 9-bundle samples-hub contract is restored;
- confirmation the Owner Portal location flag and required commercial layer are present;
- removal of forbidden legacy/internal wording from public source;
- confirmation the approved logo asset, cache key, alt text, and visible fallback are present;
- `origin/main` SHA;
- deployment workflow/result;
- cache-busted live URL check; and
- LOCAL, ORIGIN_MAIN, LIVE_PAGES, and final PASS or HOLD.

## Final closure states

- historical Sample Library marker repair: **COMPLETE**
- Sample Library deploy-helper marker alignment: **PASS**
- branding commit present in `main` history: **PASS**
- approved logo: **SECOND MOUNTAIN-AND-ROAD BADGE ONLY**
- first and third logo standards: **RETIRED**
- branch-only logo work: **ELIMINATED; controlling branding commit is in `main` history**
- six-file documentation package: **PASS FOR MERGE**
- current Sample Library branding compliance: **HOLD**
- current Sample Library commercial samples-hub compliance: **HOLD**
- LIVE_PAGES closeout for the reconciled final page: **NOT VERIFIED in this documentation package**
- Issue #78 closeout: **HOLD pending 02 correction and three-scope verification, unless 01 — Command Center explicitly accepts the documented exceptions**

## Closure rule

Issue #78 may receive final PASS only after:

- all six documentation files are in `origin/main`;
- documentation paths and links are verified;
- PR and merge evidence are recorded in Issues #78 and #31;
- the current Sample Library commercial and branding defects are corrected and independently verified, or 01 — Command Center explicitly accepts the documented exceptions;
- the commercial and raster verification checks pass; and
- no required work remains branch-only.

Until then, preserve this record and do not report deployment and branding closeout as fully PASS.
