# Owner Portal Next — Copied-Environment Test Evidence

Test date: 2026-07-11  
Environment: private Google Drive spreadsheet copy  
Production systems changed: none

## Test environment

- A private copied Owner Portal workbook was created under Rick's Drive account.
- The copied workbook uses `America/Chicago`.
- The normalized Owner Portal data layer was installed with all required tables and exact headers.
- The controlled catalog was synchronized with exactly 15 products (`H38-P001` through `H38-P015`) and nine bundles (`H38-B001` through `H38-B009`).
- No customer records were used. All synthetic contact data used the reserved `example.invalid` domain.

## Synthetic lifecycle tested

`Lead → Customer → Job → Quote → Invoice → Partial Payment → Expense → Reporting`

Verified relationships:

- `CUST-TEST-001`
- `LEAD-TEST-001`
- `JOB-TEST-001`
- `QUOTE-TEST-001`
- `INV-TEST-001`
- `PAY-TEST-001`
- `EXP-TEST-001`
- `TASK-TEST-001`

Financial assertions:

- controlled catalog price: `$99`
- quoted amount: `$99`
- invoice total: `$99`
- recorded manual test payment: `$40`
- remaining balance: `$59`
- synthetic expense: `$15`
- estimated job profit: `$84`

## Approval and audit assertions

- exact selected-task decision: `APPROVE QUOTE SEND`
- owner approval status preserved
- Proof Log record created in the test workbook
- expected external-action HOLD recorded in Error Log
- communication remained a draft with no Gmail action
- social item was scheduled internally with no publication time or URL
- advertising spend remained `$0`
- website change remained an approved handoff with no deployment time

## Safety assertions

- `TEST_MODE = true`
- `LIVE_EXTERNAL_ACTIONS_ENABLED = false`
- no trigger was created
- no email, quote, invoice, payment request, or final delivery was sent
- no social content was published
- no advertising campaign was launched
- no website was deployed
- no raw payment-card data was stored

## Release-candidate correction

The original candidate contained the live spreadsheet ID in source configuration. Before release testing, this was removed and replaced with an explicit Script Properties environment gate. The release candidate now requires the exact confirmation `CONFIGURE NON-DEPLOYED TEST ENVIRONMENT` and accepts only a TEST environment through that configuration function.

## CI gate

This evidence update is submitted through a pull request so the repository's `Owner Portal Next Verify` workflow runs against the final source, manifest, interface, environment gate, approval controls, and safety defaults before merge.

## Result

- copied-environment recorded tests: **21 PASS / 0 FAIL**
- production deployment: **not performed**
- external execution: **not performed**
- recommendation: **GO for separate Apps Script candidate installation and owner-only Web App testing; NO-GO for production replacement or live external workflows**
