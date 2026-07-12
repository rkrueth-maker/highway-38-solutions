# Business OS Commercial License Control Plane

Release: `commercial-license-control-plane-2026-07-12`

This package implements provider-neutral licensing, entitlement, billing-record, revocation, support-contract, and audit controls for the transferable Business OS. It does **not** contain a production private signing key, billing credential, webhook secret, customer payment data, or live provider execution.

## What is implemented

- Ed25519 signing and verification over canonical JSON payloads.
- Public-key keyrings with key IDs and rotation support.
- Tenant, tier, release-channel, module, feature, add-on, seat, start-date, expiration, suspension, and revocation enforcement.
- Payload hash and signature tamper detection.
- Owner-review revocation drafts and explicit activation approval.
- Provider-neutral billing account, subscription, invoice, credit, refund, duplicate-event, failure, timeout, and uncertain-result records.
- No automatic retry after a failed, timed-out, or uncertain provider result.
- Proof Log and Error Log records.
- Bounded support-plan and included-usage tracking with overage drafts.
- Hash-chained commercial audit records and tamper verification.
- A production activation gate with exact remaining blockers.
- CLI commands for key generation, signing, verification, entitlement inspection, and revocation-draft creation.

## Security boundaries

- Private keys must be generated and stored outside the repository.
- The CLI refuses to write a private signing key inside the repository and requires an output path containing `private` or `secrets`.
- Generated private-key files use mode `0600`.
- Only public keys belong in keyrings distributed to the verifier/runtime.
- Raw payment-card data, security codes, passwords, private keys, API keys, and access tokens are rejected from license, billing, support, and audit records.
- Provider-hosted payment entry remains required. This package never accepts browser or repository card entry.
- Selected-record execution, duplicate-event locks, Proof Log, Error Log, and owner approval remain mandatory.
- Billing events are internal records only. No charge, refund, credit, invoice send, receipt send, or subscription activation occurs.

## Commercial tiers

`config/commercial-plans.json` aligns Core, Operations, Growth, and Control with the existing tier matrix. Prices are intentionally unapproved planning placeholders. The catalog includes add-on entitlement IDs and Standard, Managed, and Priority support-plan controls.

External-action eligibility never enables external execution. Provider credentials, regression tests, duplicate protection, owner release, and rollback remain separate gates.

## Generate a signing keypair

Run in a private filesystem outside the repository:

```bash
node scripts/business-os-commercial-license.js generate-keypair \
  --key-id production-ed25519-2026-01 \
  --private-out /private/business-os/license-signing-key.pem \
  --public-out /private/business-os/license-signing-public.pem \
  --keyring-out /private/business-os/public-keyring.json
```

Move production private-key custody to an approved HSM or secret manager before production use. Do not paste the private key into chat, source control, sheets, logs, or browser storage.

## Sign an approved payload

```bash
node scripts/business-os-commercial-license.js sign \
  --payload approved-license-payload.json \
  --private-key /private/business-os/license-signing-key.pem \
  --key-id production-ed25519-2026-01 \
  --output signed-license.json
```

Signing a payload does not create a billing account, charge a customer, activate a provider, or release the license to a customer. Those actions require separate approval and infrastructure.

## Verify and inspect entitlement

```bash
node scripts/business-os-commercial-license.js verify \
  --license signed-license.json \
  --keyring public-keyring.json \
  --revocations revocations.json

node scripts/business-os-commercial-license.js inspect \
  --license signed-license.json \
  --keyring public-keyring.json \
  --revocations revocations.json \
  --tenant tenant-one \
  --module jobs \
  --feature backup-restore \
  --channel stable \
  --seats 3
```

## Revocation

Create an owner-review draft:

```bash
node scripts/business-os-commercial-license.js revoke-draft \
  --license-id LIC-001 \
  --reason "Contract ended" \
  --output revocation-draft.json
```

A draft does not revoke a license. Activation requires an explicit owner ID and approval record. Production distribution of the active revocation list remains an entitlement-runtime responsibility.

## Billing and support records

The library creates locked provider-neutral billing records. Synthetic provider outcomes support:

- success;
- failure;
- duplicate event;
- timeout;
- uncertain result.

Timeouts and uncertain results are held for reconciliation and never automatically retried.

Support contracts track response targets, included requests, used requests, and overage draft amounts. No support promise, overage charge, renewal, or cancellation becomes customer-facing without owner approval.

## Verification

```bash
node scripts/verify-business-os-commercial-license.js
```

The verifier generates ephemeral keys in a temporary directory and tests signing, verification, key rotation, tamper rejection, wrong-key rejection, date controls, suspension, revocation, tenant/tier/module/feature/channel/seat entitlements, sensitive-data rejection, billing outcomes, duplicate locks, Proof/Error logs, support usage, audit-chain integrity, CLI behavior, private-key filesystem controls, and production activation blockers.

## Exact remaining production blockers

The code and tests are complete, but production remains on hold until all of the following are true:

1. Production signing keys are held in an approved HSM or secret manager with rotation, recovery, and access review.
2. An authorized entitlement runtime exposes health, audit, backup, revocation-distribution, and rollback controls.
3. A billing provider account, credentials, hosted-payment flow, signed webhooks, reconciliation, and five-outcome tests pass.
4. Support staffing, hours, escalation, response commitments, cancellation, and refund policies are approved.
5. The owner explicitly releases the selected customer, license, and external action.

External actions remain disabled.
