---
name: h38-office-acceptance
description: Run end-to-end Highway 38 Business Office acceptance. Use when validating Office behavior, Northern Lakes behavior, a release candidate, mobile/desktop flow, or a change that could affect customer-to-payment lifecycle operations.
---

Run this skill against the exact feature head or exact deployed production SHA being evaluated.

1. Confirm tenant, role, environment, and exact commit. Use controlled TEST data for acceptance.
2. Verify desktop and phone layouts separately.
3. Exercise the canonical lifecycle:
   - create/find customer;
   - verify address/location behavior;
   - start and complete site visit when relevant;
   - create quote;
   - approve/convert quote according to permissions;
   - create/schedule job or service occurrence;
   - complete field work;
   - create invoice;
   - record payment;
   - verify invoice balance reaches the correct paid/due state.
4. Exercise recurring/service workflows when in scope, including snow plowing and lawn mowing, per-time or hourly billing, customer-specific equipment requirements, and special instructions.
5. Verify Customer 360 shows authoritative customer information and connected records without stale duplicates.
6. Verify documents, receipts, photos, meetings, and attachments are reachable, printable/deletable when allowed, and do not dead-end.
7. Verify permissions for owner, employee/site-manager, and customer-facing roles when affected.
8. Verify tenant boundaries: H38 and Northern Lakes share engine behavior but not tenant-owned data or branding.
9. Verify external actions remain controlled: no unintended email, charge, payment, or real-customer communication from TEST runs.
10. Record defects by exact step, expected behavior, actual behavior, platform, role, tenant, and commit.

Acceptance verdicts:
- `PASS` only when the exact tested head passes all in-scope checks.
- `HOLD` when evidence is incomplete, stale, or a required workflow is unavailable.
- `FAIL` when a reproducible product defect remains.

Do not substitute static mockups for real runtime acceptance when the request is to prove the functioning software.
