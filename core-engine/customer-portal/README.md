# Secure Customer Portal Core

Supabase is the selected production platform for Highway 38 customer authentication, customer-facing Postgres records, Row Level Security, and private file storage. The portal remains **fail-closed** until the actual Supabase project URL, publishable key, redirect allowlist, SQL migration, customer mappings, and isolation tests are completed.

## Current implementation

- Supabase email magic-link login for existing invited users only;
- one authenticated user mapped to one active `customer_accounts` row;
- Row Level Security on customer accounts, projects, quotes, invoices, messages, files, and portal evidence;
- explicit customer filtering in browser queries in addition to RLS;
- private Supabase Storage bucket with customer-ID path isolation;
- short-lived signed download URLs;
- version-checked, selected-record quote approval RPC;
- customer messages recorded as `pending_owner_review` without automatic email or SMS;
- provider-hosted HTTPS payment links only;
- no raw card fields, no service-role key in the browser, no bulk execution, and no automatic retry.

## Repository files

- `customer-portal.html` — customer login and workspace shell;
- `customer-portal-config.js` — public, fail-closed project URL and publishable-key configuration;
- `customer-portal-supabase.js` — Auth, customer dashboard, selected quote approval, private downloads, and owner-review messages;
- `supabase/migrations/20260716_customer_portal.sql` — tables, helper function, RLS policies, selected quote approval RPC, private bucket, and storage policies;
- `config/customer-portal.supabase.example.json` — repository-safe Supabase runtime contract;
- `SUPABASE_SETUP.md` — exact connection steps;
- `scripts/verify-customer-portal-supabase.js` — source and security acceptance.

## Activation state

`customer-portal-config.js` intentionally contains:

- `enabled: false`;
- a placeholder Supabase project URL;
- a placeholder publishable key;
- no private credentials.

With those defaults, `customer-portal.html` displays a setup hold and makes no customer-data request.

## Required connection steps

1. Create or select the Highway 38 Supabase project.
2. Apply `supabase/migrations/20260716_customer_portal.sql`.
3. Add the deployed customer portal URL to Supabase Auth redirect URLs.
4. Copy only the project URL and publishable/anon key into `customer-portal-config.js`.
5. Invite or create each customer in Supabase Auth.
6. Map each Auth UUID to exactly one active `public.customer_accounts` row.
7. Populate only customer-safe jobs, quotes, invoices, files, and messages with the matching `customer_id`.
8. Store private files under `{customer_id}/...` in the `customer-portal` bucket.
9. Run cross-customer, guessed-ID, signed-download, expired-session, and quote-version tests.
10. Run `npm run test:customer-portal-supabase`.
11. Set `enabled: true` only after the real project passes those checks.

## Security rules

- Never commit a Supabase `service_role` or secret key.
- RLS must remain enabled on every table exposed through the Data API.
- Authorization data comes from the database mapping, not user-editable metadata.
- The storage bucket remains private; customer access is controlled by RLS and signed URLs.
- Customer messages do not automatically send texts or email.
- Quote approval records one selected decision and does not process payment.
- Invoice payment links must remain HTTPS and provider-hosted.
- Owner Portal and Business Office records remain separate from this customer-facing schema.

## Verification

```bash
node scripts/verify-customer-portal-core.js
node scripts/verify-customer-portal-runtime.js
node scripts/verify-customer-portal-supabase.js
```

The legacy provider-neutral core and runtime-contract tests remain for reusable platform validation. The Supabase verifier is the current Highway 38 implementation gate.
