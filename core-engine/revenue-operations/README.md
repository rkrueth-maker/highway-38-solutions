# Revenue Operations Core

This package implements the provider-neutral revenue, contract, communication, social, website-control, and accounting layer for Issue #36. It prepares and records controlled work without silently enabling external providers.

## Implemented

- quote drafting, owner approval, presentation packets, version checks, and duplicate locks;
- deposit, progress, final, and recurring invoice drafting;
- invoice approval and presentation packets;
- provider-hosted payment request validation without raw card storage;
- signed provider-event verification and idempotent payment recording;
- credit and refund preparation with amount limits and owner approval;
- bounded recurring contracts, included usage, overage tracking, renewal dates, and billing previews;
- product, project, contract, and campaign profitability calculations using integer cents;
- provider-neutral accounting CSV exports;
- communication drafting, owner approval, and duplicate-protected send packets;
- internal social scheduling and locked publication packets;
- website change packets requiring rollback references;
- lead and campaign attribution summaries;
- integration health with exact provider, credential, and feature-flag blockers;
- Proof Log and Error Log helpers with uncertain automatic retry disabled.

## Safety model

All generated external-action packets use `executionState: LOCKED` and `externalActionOccurred: false`. A packet is not permission to send, charge, refund, publish, spend, deploy, or deliver.

Live execution requires all of the following:

1. one selected record;
2. an approved provider;
3. production credentials held outside the repository and browser;
4. an explicit owner approval associated with the current record version;
5. a duplicate lock;
6. provider-specific sandbox or regression evidence;
7. Proof Log and Error Log behavior;
8. a rollback procedure where applicable;
9. Rick's explicit release of the corresponding live feature flag.

Failed or uncertain external actions must not automatically retry.

## Payment rules

- Money is represented as integer cents.
- Raw card numbers, security codes, and payment credentials are never accepted or stored.
- Card entry must occur on the approved provider's hosted page.
- Hosted payment URLs must use HTTPS and may not contain embedded credentials.
- Provider events require a valid signature, acceptable timestamp, matching invoice/currency, and a unique provider event ID.
- Overpayment, excess credit, and excess refund requests are rejected.

## Contract rules

Contract billing remains a preview until the contract, usage period, overage calculation, invoice, and provider action are owner reviewed. Included usage and overages are recorded with duplicate-protected usage event IDs.

## Social and website rules

Internal content scheduling is not publication. Website change approval is not deployment. Publication and deployment packets remain locked until providers, credentials, tests, owner approval, duplicate locks, Proof/Error behavior, and rollback controls are complete.

## Verification

```bash
node scripts/verify-revenue-operations-core.js
```

The verifier uses synthetic records only. It tests quote and invoice state controls, integer-cent calculations, hosted payment URL restrictions, signed provider events, duplicate event rejection, overpayment/credit/refund limits, recurring usage and overages, accounting CSV escaping, communication/social/website locks, profitability, attribution, integration-health blockers, Proof/Error behavior, and absence of live secrets or raw payment-card inputs.

Evidence is generated at:

- `launch-control/evidence/revenue-operations-core-verification.json`
- `launch-control/evidence/revenue-operations-sample-package.json`

## Exact remaining provider blockers

- Email: select provider, configure production credentials, verify sender/domain, test approved single-record send, and obtain owner release.
- Payments: select hosted provider, configure production credentials and webhook secret, test request/payment/refund events in sandbox, and obtain owner release.
- Accounting: continue validated CSV mode or select an API provider, configure account mappings and credentials, run reconciliation tests, and obtain owner release.
- Social: repair/select scheduler or native providers, configure platform credentials, run one approved test publication per platform, and obtain owner release.
- Website: use the existing repository/deployment architecture, verify rollback on a non-production test, preserve explicit deployment approval, and obtain owner release.

No provider is represented as connected merely because its adapter contract exists.
