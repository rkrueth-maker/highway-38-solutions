# Supabase Production Security Gate

This document is the canonical acceptance and repair boundary for the Highway 38 production Supabase project.

## Scope and ownership

- Project: `jqukmwtsgcsaruucnqja`
- Source contract: `supabase/acceptance/production-policy.json`
- PR-safe source verification: `scripts/verify-supabase-source-acceptance.py`
- Disposable database attacks: `supabase/tests/database/*.test.sql`
- Live read-only verification: `scripts/verify-supabase-live-acceptance.mjs`
- Workflow: `.github/workflows/verify-supabase-acceptance.yml`

Pull requests never mutate production. Database migrations replay in a disposable local Supabase stack. The live job runs only on schedule or manual dispatch and uses read-only management scopes.

## Authentication routes

`business-office-invite-activation` is the only account-creation path. It requires an exact pending membership and uses the Supabase administrative invitation API.

`business-office-passwordless-login` may send a magic link only to an existing Auth user. Its checked-in and deployed body must contain `shouldCreateUser:false`.

The three historical Amanda recovery slugs are permanent tombstones. They require platform JWT verification, return `410`, contain no service-role operation, and are locked by the `H38_DISABLED_LEGACY_RECOVERY_V1` marker. They must never regain recovery behavior.

## Database contract

- Every exposed public table has RLS enabled.
- Service-only cache/discovery tables have explicit deny-all policies for `anon` and `authenticated`.
- Tenant and role behavior is attacked with deterministic `.example.test` identities.
- Public `SECURITY DEFINER` functions pin `search_path` and are never executable by `anon` or `PUBLIC`.
- Authenticated execution is allowed only for the exact reviewed RPC signatures in the production policy. Every approved RPC performs identity, membership, role, and tenant checks.
- Redundant permissive policies remain consolidated.
- Every production-advisor foreign-key finding has a covering index.
- Storage buckets remain private.

## Advisor treatment

The live gate fails on leaked-password protection being disabled, mutable function search paths, RLS tables without explicit policies, unindexed foreign keys, and redundant permissive policies.

The authenticated `SECURITY DEFINER` advisor group is accepted only when its exact function signatures equal the reviewed allowlist. New, removed, or changed signatures fail the gate. Informational unused-index findings do not authorize index deletion.

## Rollback

Edge recovery tombstones may be redeployed from their checked-in source. Database rollback means restoring the prior policy definitions and dropping only the seven named new indexes; business records are never deleted. Leaked-password protection can be disabled in Auth settings only as an emergency compatibility rollback with Owner approval.
