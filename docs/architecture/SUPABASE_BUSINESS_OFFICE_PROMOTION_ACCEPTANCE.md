# Supabase Business Office promotion acceptance

Acceptance date: 2026-08-04 Central / 2026-08-05 UTC

## Scope

This record covers the clean production-derived Supabase branch used to validate the canonical Business Office foundation, Supabase Auth, active-business resolution, tenant isolation, and the standard Office launcher before production promotion.

It does not authorize Northern Lakes activation or any external action.

## Promotion branch

- Parent production project: `jqukmwtsgcsaruucnqja`
- Temporary branch name: `business-office-standard-promotion`
- Temporary project ref: `nezhkdtsrzscktwsfnyl`
- Branch data copy: disabled
- Branch status at acceptance: healthy / functions deployed

## Canonical migration history

The branch was aligned with production and accepted these new repository migrations exactly once:

- `20260804232100_multitenant_platform_foundation.sql`
- `20260805004500_business_office_auth_resolution.sql`
- `20260805010000_harden_business_office_auth_state.sql`

The production replay statement for `20260804230053_lock_rls_auto_enable` was repaired to safely no-op when the optional production-only `public.rls_auto_enable()` event-trigger helper is absent on a clean branch. The checked-in migration contains the same conditional behavior.

## Database acceptance

The transactional database acceptance passed for:

- Auth resolver existence and execute privileges
- Public resolver remaining `SECURITY INVOKER`
- Exact-email invitation claiming
- Owner and administrator memberships
- Multiple active businesses and explicit switching
- Canonical module settings
- Cross-business RLS isolation
- Suspended and revoked membership denial
- No-membership denial
- Proof Log recording with `external_action_occurred = false`
- Full rollback with zero retained Auth users, businesses, memberships, or Proof Log fixtures

## Advisor review

No new Business Office or Auth security warning was introduced. The branch retained only the three pre-existing Customer Portal `SECURITY DEFINER` warnings. Performance findings were informational unused-index notices expected on an empty preview and the existing Auth connection-allocation notice.

## Safeguards

The accepted implementation keeps all of the following disabled:

- Automatic customer sending
- Automatic approvals
- Automatic social publishing
- Automatic financial actions
- Payments, purchases, payroll, and tax filing
- Production data migration
- Northern Lakes activation
- External actions

The existing Google Apps Script Office remains unchanged and is available only through the explicit rollback page. The Supabase Business Office is the standard entry path after promotion.
