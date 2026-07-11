# Owner Portal Next — Production Installation

## Approved target

The production installer must target the live spreadsheet titled exactly:

`Owner Review Portal — Rick Approval Dashboard`

The spreadsheet ID is supplied at runtime through `H38_PRODUCTION_SPREADSHEET_ID`. It is never committed to source.

## Installation behavior

The production script:

1. clones the current `main` branch;
2. runs `scripts/verify-owner-portal-next.js`;
3. creates a separate standalone Apps Script Web App project;
4. pushes the verified Owner Portal Next source;
5. creates an owner-only deployment;
6. configures the project as `PRODUCTION` through Script Properties;
7. verifies the live workbook title and required Proof/Error logs;
8. creates or verifies all normalized Portal sheets without deleting existing legacy sheets or rows;
9. imports the exact 15-product and 9-bundle controlled catalog from `catalog-data.js`;
10. runs production readiness and non-destructive self-tests;
11. prints the owner-only production Web App URL and evidence-file paths.

## Safety state

Production installation does not mean uncontrolled external execution.

The installed portal keeps:

- `LIVE_EXTERNAL_ACTIONS_ENABLED = false`;
- owner-only access;
- selected-record execution only;
- exact Rick approval decisions;
- `Send Allowed`, `Delivery Allowed`, and `Publish Allowed` gates;
- duplicate-action locks;
- Proof Log and Error Log records;
- no trigger creation;
- no bulk execution;
- no automatic customer email, quote, invoice, payment request, final delivery, social publication, ad launch, or website deployment.

Internal production functions—record creation, approval decisions, manual payment recording, expense recording, task management, reporting, catalog control, internal scheduling, and website handoff approval—are available after installation.

## Command

From Cloud Shell, set the live spreadsheet ID and run:

```bash
export H38_PRODUCTION_SPREADSHEET_ID='LIVE_OWNER_REVIEW_PORTAL_SPREADSHEET_ID'
bash scripts/deploy-owner-portal-next-production.sh
```

The script stops on any verification, workbook-title, schema, catalog, environment, readiness, or self-test hold.

## Rollback

The existing bound Owner Review Portal project and existing private Web App are not overwritten. If the new production portal has a runtime issue:

1. continue using the existing private Web App;
2. disable or delete only the new standalone deployment;
3. retain the new Portal sheets for evidence or archive them after review;
4. repair source in GitHub and create a new verified deployment.
