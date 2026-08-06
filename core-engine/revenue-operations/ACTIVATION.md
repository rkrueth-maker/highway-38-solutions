# Revenue and Growth Activation Package

Release: `revenue-growth-activation-2.0.0`

This package completes the provider-neutral workflows, sandbox tests, content bank, accounting controls, and exact connection instructions required for revenue and growth operations. It does not claim that unavailable production accounts or credentials are connected.

## Implemented workflows

- customer email drafts;
- quote and invoice send preparation;
- deposit, progress, and final billing milestones;
- provider-hosted payment-link drafts;
- payment receipt drafts;
- credits and refund records;
- recurring service and Business OS billing drafts;
- final-delivery and follow-up drafts;
- bounded service contracts, usage, overage, renewal, and cancellation drafts;
- product, bundle, add-on, and contract profitability;
- accounting rows and CSV export;
- outstanding-balance and cash views;
- lead and campaign attribution;
- 30-day content bank across Facebook, Instagram, LinkedIn, Google Business Profile, and YouTube;
- platform-specific copy and asset requirements;
- scheduled publication records, publication-proof records, performance metrics, and social-inquiry-to-Task routing;
- rollback-protected website deployment records;
- exact integration-health reporting.

## Provider states

Production execution remains locked until each provider has:

1. an approved account and provider choice;
2. credentials stored only in the private runtime secret store;
3. a selected-record adapter;
4. persistent duplicate protection;
5. success, failure, duplicate, timeout, and uncertain-result tests;
6. provider-reference capture;
7. Proof Log and Error Log behavior;
8. no automatic retry after failure, timeout, or uncertain result;
9. rollback or reconciliation procedures;
10. the owner's explicit release for the selected external action.

`config/provider-activation.json` records one exact connection step for each blocked provider.

## Payment security

- Card entry must occur only on the payment provider's hosted page.
- Raw card numbers, security codes, track data, or provider secrets may not enter browser fields, sheets, logs, repository files, or application records.
- Every payment, credit, refund, and receipt stores only business records and provider references.
- Webhook signature verification is required before a production provider is released.

## Social plan

`config/social-content-plan-30-day.json` contains 30 approved themes, calls to action, formats, related products, platform cadence, and asset specifications. The activation module expands this into 150 platform-specific draft records.

No post is scheduled or published automatically. Every record remains `DRAFT` until individually approved and sent through a tested provider adapter. Secondary channels remain excluded until they have a quality-supported operating purpose.

## Sandbox outcomes

The provider simulator supports:

- `SUCCESS`;
- `FAILURE`;
- `DUPLICATE`;
- `TIMEOUT`;
- `UNCERTAIN`.

Timeout and uncertain results require manual provider reconciliation. Automatic retries remain disabled because a retry could duplicate an email, charge, refund, publication, or deployment.

## Website control

Every deployment draft requires:

- one selected record;
- a source commit/reference;
- a different rollback reference;
- named acceptance checks;
- owner release;
- live verification after deployment;
- proof and error records;
- tested rollback instructions.

## Verification

```bash
node scripts/verify-revenue-growth-activation.js
```

The verifier covers provider configuration, owner approval matching, selected-record execution, duplicate locks, all sandbox outcomes, payment-link security, billing milestones, recurring usage, credits, receipts, delivery, follow-up, contract renewal/cancellation, 150 social drafts, publication proof, performance metrics, inquiry routing, accounting, balances, cash, profitability, website rollback, exact blockers, private-data controls, and external-action lock state.
