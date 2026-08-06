# Revenue Operations Core

This package implements the provider-neutral internal control layer for Issue #36. It prepares revenue, contract, communication, social, website, and accounting records while keeping every external action locked until credentials, provider tests, rollback protection, and Rick's approval are complete.

## Implemented

- controlled quote and invoice state machines;
- deposit, progress, final-payment, receipt-draft, refund, and credit record support;
- provider-hosted payment validation with no raw card storage;
- recurring service contracts, renewal/cancellation states, included usage, and overage tracking;
- customer communication drafts with owner approval and duplicate locks;
- internal social drafts and schedules for approved platforms;
- website changes with mandatory rollback references;
- expenses, accounting rows, provider-neutral CSV export, balances, profitability, and lead/campaign attribution;
- provider connection health with truthful credential and live-execution states;
- selected-record execution, Proof Log, Error Log, and no uncertain automatic retry.

## Not activated

The core does not send a quote, invoice, receipt, customer email, or final delivery. It does not create or process a live payment, issue a provider refund, publish social content, spend advertising money, or deploy a website. Prepared action records always report `externalActionOccurred: false`.

## Exact provider connection sequence

1. Select the production provider and record its approved mode in configuration.
2. Store credentials only in the selected provider's secure secret store or authorized runtime; never commit them.
3. Run provider sandbox tests for success, failure, duplicate result, timeout, and uncertain result.
4. Verify selected-record execution and duplicate-lock persistence.
5. Verify provider references are written to Proof Log and failures to Error Log.
6. Confirm failed or uncertain results do not automatically retry.
7. Create and test rollback or cancellation procedures.
8. Obtain Rick's explicit approval for that provider and external action.
9. Enable only that single action flag; do not enable unrelated actions.
10. Execute one approved selected record and inspect provider, Proof Log, Error Log, and customer-visible results.

## Payments

- Customer card entry must occur entirely on a provider-hosted HTTPS page.
- Raw card numbers, security codes, magnetic-stripe data, or payment credentials may not enter browser forms, sheets, logs, repository files, or the Owner Portal.
- A provider result must include a non-secret reference before a payment or refund record is considered confirmed.
- Receipts remain drafts until the corresponding send workflow is approved and connected.

## Accounting

The default mode is CSV export. An accounting API adapter may replace it only after account mapping, authentication, duplicate handling, reconciliation, rollback, and error behavior are tested. CSV exports are internal data preparation and do not claim an accounting sync occurred.

## Social and website

Social records support Facebook, Instagram, LinkedIn, Google Business Profile, and YouTube. Publication remains locked. Website change records require a rollback reference before approval and deployment preparation.

## Verification

```bash
node scripts/verify-revenue-operations-core.js
```

The verifier uses synthetic data only and checks state transitions, owner approval, selected-record enforcement, duplicate locks, payment safety, refunds, contracts, communications, social controls, website rollback, accounting export, profitability, attribution, integration truth state, Proof/Error behavior, and absence of live secrets.

Evidence is generated at:

- `launch-control/evidence/revenue-operations-core-verification.json`
- `launch-control/evidence/revenue-operations-sample-package.json`
