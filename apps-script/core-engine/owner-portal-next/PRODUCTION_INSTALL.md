# Integrated Business OS — Existing Bound Production Update

## Approved target

The production update must use the existing bound Apps Script project and existing private Web App deployment connected to the spreadsheet titled exactly:

`Owner Review Portal — Rick Approval Dashboard`

The script ID, deployment ID, and spreadsheet ID are supplied at runtime. They are never committed to source.

## Update behavior

The production script:

1. clones the current `main` branch;
2. runs `scripts/verify-owner-portal-next.js`;
3. targets the existing bound Apps Script project through its exact `.clasp.json` script ID;
4. pulls and archives a rollback backup;
5. verifies that the existing private deployment ID is present;
6. pushes the verified integrated source into the existing bound project;
7. updates that same deployment ID;
8. prints the unchanged private Web App URL, backup path, evidence path, and required Script Properties.

It does **not** create a standalone Apps Script project and does **not** create a second deployment.

## Required Script Properties

Confirm these in the existing bound project:

```text
H38_PORTAL_SPREADSHEET_ID=<LIVE_OWNER_REVIEW_PORTAL_SPREADSHEET_ID>
H38_PORTAL_ENVIRONMENT=PRODUCTION
H38_PORTAL_LIVE_EXTERNAL_ACTIONS=false
```

## Safety state

The integrated production build keeps:

- owner-only access;
- selected-record execution only;
- exact Rick approval decisions;
- duplicate-action locks;
- Proof Log and Error Log records;
- no triggers or bulk execution;
- no automatic customer email, quote, invoice, payment request, final delivery, social publication, advertising spend, website merge, or website deployment.

## Command

```bash
export H38_BOUND_SCRIPT_ID='<EXISTING_BOUND_SCRIPT_ID>'
export H38_EXISTING_DEPLOYMENT_ID='<EXISTING_PRIVATE_DEPLOYMENT_ID>'
export H38_PRODUCTION_SPREADSHEET_ID='<LIVE_OWNER_REVIEW_PORTAL_SPREADSHEET_ID>'
bash scripts/deploy-owner-portal-next-production.sh
```

The script stops on static verification failure, invalid identifiers, backup failure, missing existing deployment, push failure, or deployment-update failure.

## Acceptance

After the update:

1. confirm the same private Web App URL opens;
2. verify Dashboard and every module;
3. open Tasks and a Job workspace;
4. verify all empty sections render safely;
5. create and update internal test records;
6. verify task decisions and Proof Log entries;
7. run the Settings self-test;
8. confirm external actions remain OFF;
9. hand operating procedures to 03 – Operations & Documentation;
10. route any future live external-function approval to 01 – Command Center.
