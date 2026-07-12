# Secure Customer Portal Core

This package implements the provider-neutral security and workflow layer for Issue #33. It is intentionally **not activated** until a production identity provider, private storage provider, malware scanner, hosted payment provider, server runtime, and domain/session configuration are selected and tested.

## Implemented core

- signed, time-limited customer sessions;
- session revocation support;
- tenant isolation;
- customer-own record authorization;
- recursive removal of internal fields;
- private upload intents with quarantine and malware-scan requirements;
- version-checked, single-use quote approvals;
- provider-hosted payment-link validation without raw card storage;
- short-lived, customer-scoped download grants;
- revision requests routed to owner review;
- customer messages recorded without automatic outbound sends;
- Proof Log and Error Log entries;
- no bulk execution or uncertain automatic retry.

## Production runtime contract

The runtime package converts the remaining production blockers into a provider-neutral, fail-closed activation contract:

- `runtime/customer-portal-runtime-contract.js` validates the selected server runtime, identity provider, private storage, malware scanning, hosted payments, session controls, monitoring, rollback, and feature flags;
- `config/customer-portal.runtime.example.json` is the repository-safe configuration template and contains no credentials;
- runtime secrets are accepted only from the named environment variable and are never written to evidence;
- cross-tenant, cross-customer, guessed-ID, expired-session, upload/download, health, and rollback checks are mandatory before activation can become eligible;
- customer-portal activation still requires Rick's explicit deployment approval;
- every external action remains separately disabled and separately approval-gated;
- the gate returns `HOLD` or `READY_FOR_OWNER_ENABLE`; it never activates the portal itself.

The example configuration intentionally remains `HOLD` with the customer portal and all external actions disabled. Replace only provider identifiers, public endpoints, deployment references, and approved hostnames in the authorized runtime configuration. Supply secrets outside the repository.

## Not activated

The library does not create a public login, store a password, accept raw card data, transmit files, charge a card, send an email, deliver a final file, or expose a customer record. The public `customer-portal.html` remains a truthful activation-status page until the exact blockers below are resolved.

## Production connection requirements

1. Select an identity provider supporting secure server-side validation, short session lifetime, revocation, and tenant/customer claims.
2. Configure an authorized HTTPS server runtime. Static GitHub Pages and the existing execute-as-owner Apps Script deployment cannot securely distinguish public customers or hold private provider credentials.
3. Select private object storage with tenant/customer namespaces, deny-public-access controls, and signed download support.
4. Configure quarantine plus malware scanning before an upload can become available to the owner or customer.
5. Select a provider-hosted payment flow. Card entry must remain entirely on the payment provider's hosted page.
6. Configure production domain, Secure and HttpOnly cookies, CSRF controls, CSP, rate limiting, audit retention, and error monitoring.
7. Supply a 32-byte-or-longer session secret through the configured runtime environment variable.
8. Record the runtime deployment ID and tested rollback reference.
9. Run cross-customer and cross-tenant tests in the selected production stack.
10. Obtain Rick's approval to enable the customer-portal feature flag and each external action separately.

## Verification

```bash
node scripts/verify-customer-portal-core.js
node scripts/verify-customer-portal-runtime.js
```

The core verifier uses synthetic records only and tests:

- token tampering, expiration, revocation, and secret length;
- unapproved permissions;
- cross-tenant and cross-customer denial;
- private-field removal;
- upload type, size, extension, traversal, quarantine, and private-path controls;
- quote version and duplicate approval locks;
- approved hosted payment provider and HTTPS-only links;
- rejection of payment URLs containing credentials;
- scoped and expiring download grants;
- owner-review routing for revisions and customer messages;
- Proof/Error behavior and disabled automatic retry;
- absence of live secrets and raw payment-card data.

The runtime verifier additionally tests:

- fail-closed repository defaults;
- environment-only session secrets;
- required runtime, identity, storage, scanner, payment, domain, monitoring, and rollback controls;
- a complete synthetic readiness path without self-activation;
- activation denial after an isolation-test failure;
- rejection of persisted secrets and enabled-by-default external actions;
- sanitized evidence output.

Evidence is written to:

- `launch-control/evidence/customer-portal-core-verification.json`
- `launch-control/evidence/customer-portal-security-sample.json`
- `launch-control/evidence/customer-portal-runtime-verification.json`
- `launch-control/evidence/customer-portal-runtime-readiness-sample.json`

These files demonstrate the tested core and activation contract. They are not proof of a connected identity, storage, payment, scanning, communications, or production runtime provider.
