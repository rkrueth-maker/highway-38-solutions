# Highway 38 Core Engine Apps Script

This folder contains the exported Owner Review Portal bound project, reusable Core Engine modules, and deployment documentation.

## Bound project source

The exact live bound-project export is stored at:

```text
apps-script/core-engine/owner-review-portal/
```

Target Apps Script project ID:

```text
13Bes6_rs3LD-Sch4Vi5DKssCnIU_qb4hzZpGpDVfoRELRAk0HtXEJ7o
```

The export contains the manifest, complete menu source, bound wrappers, dashboard wrapper, self-verification, Web App server and UI, and the owner-approved selected-row send implementation.

## Separate library dependency

The bound manifest references library symbol `H38OSLIB`, pinned to version `1` with development mode disabled. The separate library project contains `H38_OS_Library_Core` and must be exported independently before GitHub is the complete multi-project source of truth.

## Safety rules

- selected-row execution only
- exact Rick approval required
- duplicate locks required
- no triggers
- no bulk processing
- no payment requests
- no automatic final delivery
- no automatic social publishing
- no automatic website deployment

## Existing deployment

The current private Web App deployment URL is retained. Exporting source does not require a new deployment.

## Clasp workflow

From the existing Cloud Shell bound-project directory:

```bash
cd ~/h38-owner-portal-real
clasp pull
```

Do not run `clasp push` from a directory containing both the exact exported `H38OwnerApprovedEmailSend.js` and the older root-level `.gs` mirror.
