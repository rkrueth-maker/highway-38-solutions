# Highway 38 Owner Portal Next

Status: **NON-DEPLOYED INTEGRATED CANDIDATE**

This folder contains an additive Owner Portal application candidate. It does not replace or modify the immutable live export under `owner-review-portal/`.

## Included

- owner-only responsive web application
- dashboard, unified selected-record tasks, and click-in workspace
- leads, customers, jobs, quotes, invoices, payments, expenses, communications, social, advertising, website, calendar, catalog, reports, proof, errors, and settings modules
- legacy queue compatibility projection
- catalog validator for exactly 15 products and 9 bundles
- selected-record approvals, duplicate-action protection, Proof Log, and Error Log
- manual payments, expenses, accounting CSV, adapter test mode, synthetic fixtures, and non-destructive self-test

## Locked safety defaults

- `TEST_MODE = true`
- `LIVE_EXTERNAL_ACTIONS_ENABLED = false`
- owner-only access
- selected-record execution only
- no bulk execution or trigger creation
- no live email, quote, invoice, payment request, final delivery, publication, ad spend, merge, or deployment

External-action controls validate approval gates in test mode and record that no external action occurred.

## Candidate installation

Use a separate Apps Script candidate project and a copied test spreadsheet. Do not push into the current live project.

```javascript
h38PortalInstallCandidate({confirmation:'INSTALL NON-DEPLOYED CANDIDATE'});
```

Then import the exact approved catalog payload:

```javascript
h38PortalImportCatalogPayload(approvedCatalogObject,'IMPORT APPROVED CATALOG SNAPSHOT');
```

The importer requires `H38-P001` through `H38-P015` and `H38-B001` through `H38-B009` with controlled price, payment, revision, and SOP fields.

## Release gate

Run static verification, install in a copied environment, load synthetic fixtures, run `h38PortalSelfTest()`, complete mobile/desktop/accessibility/workflow regression tests, reconcile timezone and historical library conflicts, and obtain Rick approval before any version, manifest, or deployment change.
