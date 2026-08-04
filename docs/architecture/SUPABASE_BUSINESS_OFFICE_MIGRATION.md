# Supabase Business Office Migration

## Status

This document is the authoritative transition plan for moving Highway 38 Business Office data, authentication, and future business onboarding to the existing Supabase project without replacing the accepted live system before parity is proven.

Current foundation project:

- Supabase project: `jqukmwtsgcsaruucnqja`
- Existing Customer Portal remains operational.
- Existing Apps Script project and deployment IDs remain unchanged.
- Northern Lakes remains unactivated until the shared platform and migration evidence pass.
- No automatic customer send, approval, publishing, payment, purchase, deployment, or financial transaction is enabled.

## Change brief

```text
Requested outcome: Replace per-business Google-native deployment work with one shared Supabase Business Office platform.
Primary scope: Customer Portal/security boundary, authenticated web app, shared architecture, performance and reliability.
Canonical source owner: supabase/migrations and the existing unified Business Office contracts.
Data or record impact: Add tenant IDs and shared business records; preserve all existing IDs and customer records.
Security or permission impact: Supabase Auth memberships and database-enforced Row Level Security.
External-action impact: None; all external-action flags remain false and owner review remains required.
Existing workflow or verifier owner: Repository governance and Supabase foundation verifier.
Fast checks: Governance, migration structure, RLS, role, storage, approval, and no-external-action checks.
Expensive or live checks: Database migration verification, RLS identity tests, browser sign-in, module parity, and exact record reconciliation.
Rollback boundary: Leave additive database objects unused and keep the existing Apps Script launcher until Supabase parity is accepted.
```

## Architecture decision

Highway 38 Business Office remains one authenticated product. Supabase becomes the shared identity and permanent-record foundation in controlled stages. The existing Apps Script implementation remains a fallback and source adapter during migration; it is not duplicated for each future business.

The shared platform uses:

- Supabase Auth for password, magic-link, session, and future invitation flows.
- `businesses` for tenant identity and configuration.
- `business_memberships` for Owner, Administrator, Staff, and Viewer access.
- Row Level Security on every exposed business table.
- Existing `customer_accounts`, `customer_jobs`, `customer_quotes`, `customer_invoices`, `customer_messages`, `customer_files`, and `customer_portal_events` as the canonical customer-facing records, extended with `business_id` rather than copied into a second schema.
- `price_book_items` for Price Book-first pricing and owner-reviewed local research.
- `quote_items` for itemized work-package estimates.
- `business_approvals`, `business_proof_log`, and `business_error_log` for approval and evidence controls.
- Private Supabase Storage paths beginning with the business UUID.

## Tenant and role model

A user can belong to more than one business. Access is granted by an active membership row, never by editable user metadata.

Roles:

- `owner`: full business administration and membership authority.
- `administrator`: operational configuration, quote approval, pricing approval, invoice control, and error review.
- `staff`: customers, jobs, draft quotes, staged messages, staged files, and unapproved pricing proposals.
- `viewer`: read-only business access.

Business invitations are represented by membership rows with an invited email. When the matching Supabase Auth identity exists, a private trigger activates the membership. The trigger is not executable by browser roles.

## Pricing and quote controls

The migration preserves these rules:

1. Search the business Price Book first.
2. Missing prices may be researched locally.
3. Researched pricing defaults to `owner_review_required`.
4. Staff-created quote lines default to unapproved.
5. Only Owner or Administrator roles may approve pricing or update itemized quote lines.
6. Customer quote decisions remain version-checked and do not automatically charge, schedule, send, or begin work.

## Data isolation

Every shared table includes `business_id`. RLS policies call a private membership predicate that checks the signed-in user, active membership, business, and allowed role.

The public browser receives only the Supabase publishable key. The service-role key is never committed or placed in browser code.

Public views must use `security_invoker = true`. Security-definer helpers remain in the non-exposed `private` schema, have explicit search paths, and revoke anonymous/public execution.

## Storage

The private `business-office` bucket stores files under:

```text
<business-uuid>/<module-or-record>/<file>
```

Read, insert, and update policies validate the first path segment and active business membership. No delete policy is granted in the foundation migration.

## Migration stages

### Stage 1 — foundation

- Apply `20260804_business_office_foundation.sql`.
- Verify all new tables have RLS.
- Provision the Highway 38 owner membership without sending an external invitation.
- Verify the existing Customer Portal still reads its original records.
- Keep the current live Business Office launcher unchanged.

### Stage 2 — Supabase sign-in and tenant bootstrap

- Add Supabase Auth to the existing Business Office launcher and shared shell.
- Load the user’s memberships and business configuration in the existing startup path.
- Preserve one startup request and on-demand module loading.
- Keep Apps Script available behind the same app for unmigrated modules.

### Stage 3 — module migration

Move one canonical data owner at a time:

1. Customers and users.
2. Price Book.
3. Quotes and itemized work packages.
4. Jobs and documents.
5. Approvals, Proof Log, and Error Log.
6. Remaining operational and accounting modules.

Each module requires exact record counts, ID mapping, permission tests, rollback evidence, and no-external-action confirmation before becoming authoritative in Supabase.

### Stage 4 — Northern Lakes onboarding

Northern Lakes becomes a business tenant in the same platform only after Highway 38 sign-in and core module parity pass. It does not receive a new Supabase project, a new Business Office shell, or another Apps Script deployment.

### Stage 5 — retire Google-native data ownership

Apps Script may remain only for explicitly retained Google-native document operations. Permanent business records move to Supabase only after accepted parity evidence. Existing Apps Script resources are archived or reduced in place; they are not destructively deleted without separate approval.

## Module performance intake

```text
Module/route: Shared Business Office authentication and tenant bootstrap.
Requested outcome: One Supabase sign-in and one shared app for Highway 38 and future businesses.
Canonical module contract entry: Existing unified Business Office contracts; no new product shell.
Server owner: Supabase Auth, Postgres, RLS, and shared Edge Functions where privileged work is required.
Client owner: Existing Business Office launcher and unified shell.
Today-critical or on-demand: Auth and active business are startup-critical; module records remain on-demand.
Normal first-load limit: Memberships and enabled-module metadata only.
Data sources and expected reads: One session read and one membership/business projection.
Cache key and scope: Auth user ID, business ID, membership version, and module-config version.
Cache TTL: Session-managed; business configuration version invalidates cached metadata.
Invalidation events: Membership, role, business status, branding, or module-setting changes.
Prefetch priority: Today and the active requested route only.
Cold target: 2 seconds or less excluding provider cold start.
Warm/cached target: 1 second or less.
Startup RPC impact: Replace the Google authorization bootstrap; do not add a second startup chain.
Startup payload impact: Business identity, role, and enabled modules only.
Stale-response protection: Existing route token and shared in-flight request rules.
Previous-workspace loading behavior: Keep the current workspace visible while modules load.
External-action impact: None.
Migration/rollback plan: Additive schema; existing launcher remains until parity is accepted.
Verification commands: Governance plus Supabase foundation, customer-portal security, and affected module checks.
Measured before: Existing Google authorization and gateway session path.
Measured after: Recorded during Stage 2 browser acceptance.
```

## Rollback

The foundation migration is additive. A code rollback leaves its tables and tenant columns in place but unused. The current Apps Script launcher remains the production fallback until Supabase sign-in and module parity are explicitly accepted.

Do not drop migrated tables or columns as a routine rollback. Destructive rollback requires:

- a verified export;
- exact row and file counts;
- proof that no accepted Supabase-only records would be lost;
- owner approval;
- a separately reviewed migration.

## Acceptance gates

The platform remains on HOLD for full cutover until all of the following pass:

- Highway 38 owner sign-in through Supabase Auth.
- Tenant and role isolation tests using at least Owner, Staff, Viewer, customer, and unrelated-user identities.
- Existing Customer Portal regression checks.
- Price Book-first and owner-review-required pricing behavior.
- Itemized professional quote output.
- Exact record and file reconciliation for every migrated module.
- Mobile and desktop Business Office acceptance.
- External actions, approvals, sends, payments, publishing, and deployment remain false unless explicitly owner-approved.
- Northern Lakes is still inactive until the Highway 38 gates pass.
