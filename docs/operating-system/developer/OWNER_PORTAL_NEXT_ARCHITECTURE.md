# Owner Portal Next — Integrated Architecture

Status: non-deployed candidate.

## Runtime boundary

The candidate is additive. The immutable live bound project and pinned libraries remain unchanged. Normalized sheets are created only by an explicit manual installer confirmation.

## Application layers

1. Responsive single-page Apps Script HTML application.
2. Dashboard, unified tasks, task workspace, search, reports, and lifecycle services.
3. Selected-record approval and action dispatcher with document locks.
4. Normalized Google Sheets repository and legacy queue compatibility.
5. Exact 15-product/9-bundle catalog validator and Catalog Mismatch Hold.
6. Provider-neutral integrations with manual and test fallbacks.
7. Proof Log, Error Log, self-test, migration, deployment, and rollback controls.

## Normalized entities

Tasks, Leads, Customers, Jobs, Quotes, Invoices, Payments, Expenses, Communications, Social, Advertising, Website, Calendar, Catalog, and Settings. Existing Proof Log and Error Log remain audit destinations.

## Security

- owner check on public server operations
- owner-only Web App manifest
- no secret values returned to the browser
- no raw payment-card storage
- no trigger creation or bulk external execution
- selected-record locking and duplicate-action checks
- external actions disabled by default

## Catalog drift control

Catalog-derived work requires all exact IDs `H38-P001` through `H38-P015` and `H38-B001` through `H38-B009`, plus controlled price, payment, revision, and SOP fields. Missing, extra, or incomplete records produce Catalog Mismatch Hold.

## Release decision

Suitable for copied-environment testing. Not approved for live source push or Web App deployment.
