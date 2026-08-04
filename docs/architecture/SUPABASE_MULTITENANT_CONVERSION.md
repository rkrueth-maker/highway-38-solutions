# Supabase Multitenant Conversion

## Decision

Highway 38 Business Office will move from one Google Apps Script deployment per business to one shared multitenant application backed by Supabase.

The current Highway 38 Google-native production system remains the rollback source until Supabase feature parity, record reconciliation, security verification, and owner acceptance are complete.

Northern Lakes must not receive a new permanent Apps Script project or deployment. It will become the first separately configured tenant after the shared platform foundation passes security and acceptance checks.

## Protected invariants

- One authenticated product: Highway 38 Business Office.
- Today remains the first workspace, not a separate application.
- Existing Highway 38 production records and Google files are not deleted or overwritten.
- No automatic approvals, customer sends, publishing, payments, purchases, payroll, tax filing, ad spend, SMS, or destructive actions.
- External actions require an explicit owner approval record.
- Proof Log, Error Log, role history, and approval history remain preserved.
- Approved website assets and public website behavior are outside this conversion scope.

## Target architecture

### Shared application

One Business Office frontend serves all approved businesses. The active business is resolved from an authenticated membership, never from an untrusted URL value alone.

### Supabase ownership

- Auth: users, sessions, password reset, magic-link/invite flows.
- Postgres: business configuration, memberships, roles, customers, quotes, jobs, Price Book, approvals, Proof Log, Error Log, and module records.
- Storage: tenant-scoped photos, PDFs, drawings, and documents.
- Edge Functions: protected AI, PDF, import/export, and integration operations.
- Row Level Security: mandatory tenant isolation for every exposed table.

### Optional Google-native services

Google Drive and Apps Script may remain as optional document adapters during transition. They are not the permanent record owner after a module has been migrated and reconciled.

## Tenant boundary

Every tenant-owned row must contain `business_id`. Access requires an active `business_memberships` row for `auth.uid()`.

Roles:

- owner
- administrator
- staff
- viewer

Authorization must not use user-editable metadata. Browser clients never receive a service-role key.

## Delivery stages

### Stage 0 — Preserve fallback

- Allow the already-running Highway 38 release proof to finish or fail naturally.
- Do not restart the oversized proof merely to obtain another run.
- Preserve its logs and artifacts.
- Keep current production available.

### Stage 1 — Foundation

- Add versioned schema migration.
- Add businesses, memberships, invitations, module configuration, approvals, Proof Log, Error Log, and inert external-action queue.
- Enable RLS on every exposed table.
- Run security and performance advisors.
- Verify cross-tenant reads and writes are denied.

### Stage 2 — Authentication and tenant resolution

- Add Supabase Auth sign-in to the existing unified shell.
- Resolve the user’s permitted business memberships after authentication.
- Preserve role-denied, suspended, and no-membership states.
- Keep startup bounded and avoid a second application shell.

### Stage 3 — Read-only module pilots

Move one module at a time, beginning with low-risk read-only data. Compare exact record counts and stable IDs against the Google-native source.

### Stage 4 — Controlled writes

Enable writes only after module-specific backup, import, reconciliation, rollback, RLS, approval, Proof Log, and Error Log tests pass.

### Stage 5 — Northern Lakes tenant

- Create the Northern Lakes business configuration.
- Invite the approved owner account.
- Apply branding, enabled modules, and Price Book configuration.
- Verify complete tenant isolation from Highway 38.
- Do not migrate or activate external actions automatically.

### Stage 6 — Cutover

A module may treat Supabase as permanent record owner only after:

1. exact record and file reconciliation;
2. role and RLS acceptance;
3. mobile and desktop acceptance;
4. backup and rollback evidence;
5. owner approval;
6. current production remains recoverable.

## Rollback

Before cutover, rollback means disabling the Supabase route and returning traffic to the existing Google-native production system. No destructive rollback is permitted.

After a module cutover, rollback uses the module-specific export and reconciliation package. Stable IDs and source-system identifiers must be retained throughout transition.

## Verification gates

- Migration applies cleanly to an isolated Supabase branch or local database.
- No anonymous table access.
- Every exposed table has RLS enabled.
- Cross-business select, insert, update, and delete attempts fail.
- Viewer cannot alter business configuration or memberships.
- Staff cannot approve external actions.
- Owner/administrator actions remain business-scoped.
- External action rows cannot advance beyond draft/pending without an approval link.
- No trigger or scheduled function executes an external action.
- Security advisors have no unresolved critical findings.
- Existing Highway 38 production IDs and records remain unchanged.

## First implementation scope

The first pull request is foundation-only. It must not:

- apply the migration to production;
- migrate customer or quote records;
- change live login;
- activate Northern Lakes;
- remove Apps Script;
- create a new permanent customer deployment;
- execute external actions.
