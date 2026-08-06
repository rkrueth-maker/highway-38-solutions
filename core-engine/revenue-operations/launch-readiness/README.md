# Revenue and Growth Launch Readiness

Release: `revenue-growth-launch-readiness-2026-07-12`

This package completes the internal, testable portion of Highway 38 revenue and growth operations while keeping every external action locked until the exact provider connection, test evidence, and separate owner approval exist.

## Included

- exact provider readiness and blocker registry;
- email, payments, accounting, social, website, and customer-auth/storage connection steps;
- observed Metricool connection failure state without claiming a connected brand;
- 30-day content bank;
- Facebook, Instagram, LinkedIn, Google Business Profile, and YouTube platform compilation;
- 150 platform-specific draft records with asset specifications, campaign IDs, suggested planning windows, and inquiry-routing instructions;
- synthetic success, failure, duplicate, timeout, and uncertain-result provider tests;
- social inquiry-to-Task routing with duplicate protection;
- outstanding-balance, cash, expense, profitability, accounting-export, and lead/campaign attribution acceptance reports;
- activation gate that remains on hold until provider connections, tests, and owner release are complete.

## Metricool state

A live read of the connected Metricool tool on 2026-07-12 returned:

```text
We couldn't connect your account. Please try again.
```

No brand ID, blog ID, network list, timezone, scheduled-post record, publication reference, or analytics result is represented as connected. The exact recovery step is recorded in `provider-readiness.json`.

## Social content bank

`social-content-bank.json` contains 30 approved-for-review base topics covering:

- problem clarity;
- space and project planning;
- shop flow;
- business workflow;
- file control;
- automation and manufacturing planning;
- proof and privacy;
- quote, payment, accounting, communication, website, and recurring-service controls;
- Highway 38 tools and customer paths;
- monthly operating review.

The compiler produces five platform records for every day:

- Facebook;
- Instagram;
- LinkedIn;
- Google Business Profile;
- YouTube.

Every output remains `DRAFT_OWNER_REVIEW`. Asset files are not invented, scheduled-post references are null, publication references are null, and publication proof is null until a real selected-record action succeeds after separate approval.

## Provider tests

The sandbox test harness records five required outcomes for each external slot:

1. success;
2. failure;
3. duplicate block;
4. timeout hold with no retry;
5. uncertain-result hold with manual reconciliation.

Synthetic results never call a live provider and always record `externalActionOccurred: false`.

## Inquiry routing

One authenticated social inquiry can create one internal Task. The router:

- accepts exactly one selected inquiry;
- creates a deterministic duplicate lock;
- creates a `NEEDS_OWNER_REVIEW` Task;
- does not reply to the inquiry;
- records an internal Proof Log entry;
- blocks a duplicate Task for the same inquiry.

## Accounting acceptance

The report combines:

- invoices and outstanding balances;
- payment and refund records;
- expenses and net cash;
- provider-neutral accounting rows and CSV;
- product, bundle, add-on, contract, or campaign profitability records;
- lead and campaign attribution.

The chart-of-accounts map remains owner-review work unless an accounting connection is approved and verified.

## Activation rule

External activation is not inferred from completed code. The activation gate remains `HOLD` until:

- every required provider connection is truthful and verified;
- every required provider scenario passes;
- provider references, Proof Log entries, Error Log entries, duplicate locks, timeout behavior, uncertain-result reconciliation, and rollback are documented;
- customer-auth and storage isolation pass security tests;
- Rick separately approves the selected external action.

No bulk send, advertising spend, automatic retry, card-data collection, automatic publication, automatic deployment, or final delivery is enabled.

## Verify

```bash
node scripts/verify-revenue-growth-launch-readiness.js
```

The verifier writes repository evidence to `launch-control/evidence/` and makes no external calls.
