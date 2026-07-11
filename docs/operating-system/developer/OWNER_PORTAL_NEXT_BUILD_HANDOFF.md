# Owner Portal Next — Build and Integration Handoff

## Completed architecture

An owner-only Google Apps Script application backed by normalized Sheets and a compatibility layer for existing Owner Review Portal queues.

## Completed modules and screens

Dashboard, Unified Tasks, Leads, Customers, Jobs, Quotes, Invoices, Payments, Expenses, Communications, Social, Advertising, Website, Calendar, Products/Bundles, Reports, Proof Log, Error Log, Settings, global search, selected-task workspace, and responsive desktop/tablet/mobile navigation.

## Functional workflows

- project legacy queues into one task list
- open a task with related customer, job, financial, communication, source, proof, and error records
- approve, hold, revise, reject, or close one selected task
- preserve exact queue decisions and validate approval/allowed/duplicate gates
- create internal leads, customers, jobs, tasks, social, advertising, and website records
- create catalog-controlled quotes and invoices
- convert accepted quotes into jobs
- record manual payments and reconcile invoice balances
- record approved-category expenses
- schedule social internally without publishing
- approve website merge handoffs without merging or deploying
- generate accounting CSV
- load synthetic `example.invalid` fixtures
- test provider adapters without external action

## Safety state

- test mode ON
- live external actions OFF
- selected-record only
- no bulk execution or triggers
- owner-only manifest
- document locks, Proof Log, Error Log, duplicate checks
- no raw card data

## Integrations represented

Gmail, Drive, Calendar, GitHub, Metricool, Stripe, Square, PayPal, QuickBooks, Xero, Wave, FreshBooks, Meta Ads, Google Ads, and LinkedIn. Manual/test fallbacks prevent credentials or paid-provider choices from blocking the internal application.

## Systems not changed

Live Apps Script, pinned libraries, current private Web App deployment, current Sheet data, website, social platforms, advertising platforms, and payment providers.

## Go / no-go

- **GO:** GitHub integration and copied-environment testing.
- **NO-GO:** live deployment or external execution.

## Rick approvals required next

1. Separate Apps Script candidate project and spreadsheet copy.
2. Candidate sheet installer in the copy.
3. Exact approved catalog import.
4. Synthetic functional testing.
5. Operational dictionaries and SOP confirmation from 03.
6. Release-candidate regression approval.
7. Any new Apps Script version or Web App deployment.
8. Every external integration and live workflow independently.
