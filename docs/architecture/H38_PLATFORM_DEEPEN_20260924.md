# H38 Platform Deepening — 2026-09-24

This slice deepens the platform push merged in PR #1088 without creating a second Business Office, scheduling authority, offline store, database, or AI mutation path.

## Preserved authorities

- Business Office remains the operational system of record for tenant workflows.
- Task Manager + Schedule remain the only dispatch/scheduling authority.
- Existing user-scoped IndexedDB, `operations` queue, `queueOperation(...)`, and `window.sync(false)` remain the offline authority.
- Existing owner-command adapters, permissions, deterministic write paths, verification, and Proof Log remain the AI mutation authority.
- Payments/refunds, purchases, customer sends, deletions, access/permissions, security, publishing/deployment, payroll/tax, and engine/schema changes keep their existing dedicated controls.
- The service-worker cache name is not changed by this slice.

## Real QuickBooks Online connection

The browser-only bridge from PR #1088 remains a non-secret planning/status surface. This slice adds a server-side connection path:

- `supabase/functions/h38-quickbooks-bridge/index.ts`
- `supabase/migrations/20260924010000_h38_quickbooks_server_bridge.sql`
- `commercial-app/quickbooks-server-bridge.js`

### Server secrets

Set these only in Supabase Edge Function secrets:

- `QBO_CLIENT_ID`
- `QBO_CLIENT_SECRET`
- `QBO_REDIRECT_URI`
- `H38_QBO_TOKEN_ENCRYPTION_KEY`

Never place them in browser JavaScript, localStorage, IndexedDB, tenant records, logs, or Proof Log.

### OAuth and token handling

- OAuth starts only for a signed-in active business member with owner/administrator authority.
- The callback carries encrypted, short-lived tenant/user state.
- OAuth access/refresh tokens are encrypted with AES-GCM before persistence.
- The browser receives only sanitized status: company name, realm ID, mode, expiry/status, last sync, and non-secret errors.
- Provider errors are redacted before Business Error Log writes.
- Connection/refresh/disconnect and reconciliation-preview events are recorded in Proof Log.

`h38-quickbooks-bridge` uses custom authentication because Intuit must call its GET callback without a Supabase JWT. Supabase gateway JWT verification is therefore disabled for this one function, while POST actions explicitly validate Supabase Auth and membership inside the function and the GET callback validates the encrypted state envelope.

### Server-owned tables

`h38_quickbooks_connections` stores one tenant connection. It has RLS enabled, removes anon/authenticated table access, and is service-role only. The token envelope is encrypted at the application layer.

`h38_quickbooks_mappings` stores tenant/entity identity mappings and sync-token/reconciliation metadata for Customers, Invoices, Payments, and Expenses. It is also RLS-enabled and service-role only.

### Current write boundary

This slice deliberately keeps QuickBooks accounting writes fail-closed.

Real capabilities in this phase:

- authorize/connect
- encrypted token storage
- token refresh
- token revoke/disconnect
- tenant-specific realm/company identity
- read-only QuickBooks reconciliation preview
- H38 vs QuickBooks counts for Customers, Invoices, Payments, and Purchases/Expenses
- mapping counts
- server status surfaced in Accounting
- non-secret accounting connection metadata stored through the existing H38 queue
- reconciliation preview records stored through the existing H38 queue

Not enabled in this phase:

- create/update/delete QuickBooks Customers
- create/update/delete QuickBooks Invoices
- create/update/delete QuickBooks Payments
- create/update/delete QuickBooks Expenses
- automatic external sync

The next provider-write phase must add record-level conflict review, idempotent push/pull rules, sync-token enforcement, explicit owner approval for external accounting changes, retry/error resolution, and exact-head acceptance before changing the fail-closed flag.

## Dispatch deepening

`commercial-app/platform-deepen.js` adds a 7-day planning board over current Schedule data.

It surfaces:

- scheduled events by day
- unscheduled active jobs
- urgent/high-priority unscheduled work
- jobs missing locations
- a Plan action that only pre-fills the existing dispatch form

It does not silently create schedule records. Final assignment still uses the existing Schedule/Task Manager deployment form and conflict checks from `platform-next.js`.

Route/distance/travel-time numbers are intentionally not fabricated. Missing job locations are called out. A future verified routing provider can supply those values.

## Offline field deepening

The field/work surface now exposes an offline-readiness view using the existing tenant snapshot and `operations` queue.

It checks visible cached coverage for:

- assigned work
- customers/sites
- Site Visits
- notes
- time
- mileage
- photos
- attachments
- measurements
- signatures
- receipts

It also shows pending sync and connectivity status.

This is not a claim of true offline acceptance. True offline remains blocked until a physical phone/tablet can:

1. load assigned work while online,
2. lose all service / airplane mode,
3. complete the entire required field workflow,
4. persist every required artifact locally,
5. reconnect,
6. synchronize through the existing queue,
7. verify server state,
8. expose and resolve conflicts/errors.

## Owner profitability and billing intelligence

The Owner Today page receives deterministic operational signals derived only from recorded tenant data:

- AR total and aging buckets
- completed jobs without linked invoices
- open WIP count
- stale open quotes
- recorded losing-job candidates where linked recorded expenses exceed recorded invoice revenue
- prioritized billing/follow-up actions

No missing job cost is invented. Margin signals are operational intelligence, not posted accounting truth.

## AI Office deepening

The existing Assistant command bus is extended read-only for questions such as:

- which jobs are losing margin?
- what work needs invoicing?
- what is AR aging / what is unpaid over 30 days?
- what dispatch/equipment conflicts exist?
- what recurring work is due?
- what changed / what are the top actions?
- show an arithmetic price-increase preview

These answers do not create a second AI write path. Price-change requests remain previews unless the existing supported `Owner command:` path and deterministic tenant adapter explicitly support and execute the requested data change.

## Bootstrap and cache behavior

The two new browser extensions are loaded by `supabase-final-startup.js`, which is already in the existing service worker's live-first set. This avoids a broad service-worker cache-version bump.

`ai-team-owner-polish.js` also knows how to load the platform slices as a secondary idempotent path. Duplicate script loads are prevented by globals/data attributes.

## Required acceptance before merge

At minimum:

- Python suite including `tests/test_platform_push_deepening.py`
- JavaScript syntax checks
- existing platform-push tests
- Supabase RLS / tenant-boundary checks
- Business Office auth checks
- Commercial System Check
- Phone First Office
- native walkthrough
- front-to-back quotes/documents
- website/web-app governance
- H38 and Northern tenant-isolation workflow checks

Do not apply the production migration or deploy the production QuickBooks Edge Function from an unaccepted branch.

## Production activation sequence after merge

1. Apply the migration to the production Supabase project.
2. Set the four QuickBooks server secrets in Supabase.
3. Deploy `h38-quickbooks-bridge` with the repository `verify_jwt = false` custom-auth configuration.
4. Register the deployed callback URL in the Intuit application and set the identical value as `QBO_REDIRECT_URI`.
5. Connect an Intuit sandbox company first.
6. Run status, refresh, reconciliation preview, disconnect, and reconnect acceptance for H38.
7. Repeat tenant-isolation/status behavior for Northern without sharing connection rows or tokens.
8. Verify phone/tablet/desktop Accounting UI.
9. Keep provider accounting writes disabled until the separate write/reconciliation gate is accepted.
