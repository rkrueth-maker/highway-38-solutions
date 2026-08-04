# Supabase Multitenant Conversion

## Decision

Highway 38 Business Office will move from one Google Apps Script deployment per business to one shared multitenant application backed by Supabase.

The current Highway 38 Google-native production system remains the rollback source until Supabase feature parity, record reconciliation, security verification, and owner acceptance are complete.

Northern Lakes will become the first separately configured tenant after the shared Supabase platform passes security and acceptance checks. It must not receive another permanent Apps Script project or deployment.

## Canonical Supabase foundation

The existing Supabase migration `20260804225947_business_office_foundation` is authoritative. It already owns:

- `businesses`
- `business_memberships`, including invited email, role, status, and Auth user binding
- `business_module_settings`
- `business_approvals`
- `business_proof_log`
- `business_error_log`
- `price_book_items`
- `quote_items`
- existing customer portal records and tenant-aware customer access
- the private `business_access(business_id, roles)` authorization function

Do not create competing profiles, invitations, memberships, module settings, approval, Proof Log, Error Log, Price Book, or quote-item tables. New work must extend these canonical owners.

## Protected invariants

- One authenticated product: Highway 38 Business Office.
- Today remains the first workspace, not a separate application.
- Every tenant-owned row is scoped by `business_id`.
- Active membership and RLS determine access; URL values do not.
- Roles remain Owner, Administrator, Staff, and Viewer.
- Authorization never uses user-editable metadata.
- Browser clients never receive a service-role key.
- Existing Highway 38 records and Google files are not deleted or overwritten.
- No automatic approval, customer send, publishing, payment, purchase, payroll, tax filing, ad spend, SMS, deployment, or destructive action.
- Proof Log, Error Log, role history, approvals, and rollback evidence remain preserved.
- Approved public website assets are outside this conversion scope.

## Target architecture

### Shared application

One Business Office frontend serves approved businesses. Supabase Auth establishes the user. `business_memberships` resolves the businesses and roles the user may access.

### Supabase ownership

- Auth: users, sessions, password resets, magic links, and invitations.
- Postgres: business configuration, memberships, modules, customers, quotes, jobs, Price Book, approvals, Proof Log, Error Log, and migrated module records.
- Storage: tenant-scoped photos, PDFs, drawings, and documents.
- Edge Functions: protected AI, PDF, import/export, and approved integration operations.
- RLS: mandatory tenant isolation on every exposed tenant-owned table.

### Optional Google-native services

Google Drive and Apps Script may remain as temporary document adapters. A module does not switch permanent record ownership until its migration, reconciliation, backup, rollback, and acceptance evidence pass.

## External-action boundary

`business_approvals` records the business decision. Approval alone does not execute anything.

The foundation-completion migration adds an inert `external_action_queue` and enforces:

1. Staff may draft an action.
2. Owner or Administrator may connect the exact pending approval.
3. Owner or Administrator may review the approval.
4. Only an Owner may separately set `external_action_allowed=true` on an approved record.
5. Browser roles may prepare the queue row as approved but cannot move it to executing, completed, or failed.
6. A server-side executor must re-check the matching business, action, entity, approval status, and Owner authorization immediately before execution.
7. No database trigger or schedule executes the action.

Final approval decisions and the Owner authorization gate are immutable.

## Delivery stages

### Stage 0 — Preserve fallback

- Preserve the current Google-native production system and evidence.
- Do not restart oversized proof runs merely to obtain another run.
- Do not activate Northern Lakes on the old per-business deployment model.

### Stage 1 — Complete and verify the existing foundation

- Extend the canonical schema rather than duplicating it.
- Add the inert external-action queue.
- Lock approval decisions and the Owner-only authorization gate.
- Verify RLS, cross-tenant denial, role restrictions, and browser execution denial in an isolated Supabase branch.
- Run Supabase security and performance advisors.

### Stage 2 — Authentication and tenant resolution

- Add Supabase Auth to the existing unified Business Office shell.
- Resolve active memberships after authentication.
- Preserve suspended, revoked, no-membership, permission-denied, loading, and error states.
- Avoid a second application shell or duplicate startup path.

### Stage 3 — Read-only module pilots

Move one low-risk module at a time. Compare exact stable IDs and record counts against the Google-native source.

### Stage 4 — Controlled writes

Enable writes only after module-specific RLS, role, backup, import, reconciliation, approval, Proof Log, Error Log, and rollback checks pass.

### Stage 5 — Northern Lakes tenant

- Create the Northern Lakes business record and memberships in the shared platform.
- Apply its approved branding, modules, and Price Book configuration.
- Verify complete tenant isolation from Highway 38.
- Keep all external actions disabled until separately approved.

### Stage 6 — Cutover

A module may treat Supabase as its permanent record owner only after:

1. exact record and file reconciliation;
2. role and RLS acceptance;
3. mobile and desktop acceptance;
4. backup and rollback evidence;
5. Owner approval;
6. the current production fallback remains recoverable.

## Verification gates

- The exact repository migration applies cleanly to an isolated Supabase branch.
- Canonical tables are reused and no duplicate tenant system is created.
- All tenant-owned foundation tables have RLS enabled.
- Anonymous access remains revoked.
- Cross-business reads and writes fail.
- Viewer cannot alter module configuration or memberships.
- Staff cannot approve an action.
- Administrator cannot grant the Owner-only external-action gate.
- Owner authorization is separate from ordinary approval.
- Browser roles cannot execute an external action.
- Final approvals cannot be changed.
- Security advisors have no unresolved critical findings.
- Existing production IDs, records, and Google files remain unchanged.

## First implementation scope

This pull request is foundation hardening and isolated-branch validation only. It must not:

- apply the migration to production;
- migrate customer or quote records;
- change live login;
- activate Northern Lakes;
- remove Apps Script;
- create another permanent customer deployment;
- execute an external action.
