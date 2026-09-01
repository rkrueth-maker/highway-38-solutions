# H38 Business Office Supabase Hardening — 2026-09-01

## Scope

This pass is intentionally limited to the production Highway 38 Business Office authorization surface and one Supabase advisor search-path warning. It does not alter Reseller Scout behavior, Customer creation, Site Visit, Quote Builder, CameraX, customer portal decision semantics, automated approvals, customer sending, purchasing, payments, or scheduling.

## Production authority

- Repository: `rkrueth-maker/highway-38-solutions`
- Base branch: `main`
- Base commit: `5f083d2bd8f28a00d3aef149c057dfa286f79e8d`
- Supabase project: `jqukmwtsgcsaruucnqja`

## Findings

Supabase reports the project as healthy. The Office runtime is Supabase Auth + RLS + operational records; Firebase is not the supported Office runtime.

Security advisor warnings include public-schema `SECURITY DEFINER` RPCs callable by authenticated users, leaked-password protection disabled, and a mutable search path on `sanitize_reseller_store_discovery_tiles`.

The customer portal decision functions intentionally require authenticated execution and bind the target quote to `auth.uid()` through `customer_accounts` before updating it. Platform-owner tenant-management wrappers must retain explicit owner authorization through their private implementation path.

## Change

The migration `20260901173000_h38_office_security_hardening.sql`:

1. Revokes `EXECUTE` on the audited Office/customer RPCs from `anon` and `PUBLIC`.
2. Explicitly preserves `authenticated` execution for supported authenticated workflows.
3. Sets a deterministic `search_path` on `sanitize_reseller_store_discovery_tiles`.

This change does not enable any external action or automatic approval/sending behavior.

## Verification

- Static verifier: `node scripts/verify-h38-office-supabase-hardening.js`
- Supabase security/performance advisors should be re-run after deployment.
- Live privilege checks should confirm `anon` cannot execute the audited RPCs and `authenticated` retains the required paths.
- Physical Android phone acceptance remains required for user-visible Office behavior and must not be inferred from CI or database deployment alone.
