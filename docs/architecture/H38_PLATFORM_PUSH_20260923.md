# H38 Business Office — Accounting, Dispatch, Offline, AI and Owner Intelligence Push

Status: active implementation contract

## Goal

Advance the existing H38 Business Office toward a mature small-service-business operating system without rebuilding the Office engine or creating parallel workflow authorities.

The five coordinated platform areas are:

1. QuickBooks / accounting bridge
2. Serious dispatch and resource planning
3. True offline field continuity
4. AI Office operating layer
5. Owner dashboard and profitability intelligence

They share one operating spine:

`Customer → Quote → Job → Task Manager / Schedule → Field Work → Cost → Invoice → Payment → Profitability`

Customer, employee, equipment, document, photo, recurring-service, AI and Proof Log context attach to that lifecycle rather than becoming separate products.

## Existing authorities preserved

- Supabase `business_id` RLS partition remains the tenant boundary.
- Task Manager and Schedule remain the assignment/deployment authority. The dispatch board enhances them; it does not create another dispatch database.
- `window.queueOperation(...)` remains the browser write path for supported offline-capable operational changes.
- User-scoped IndexedDB remains the device queue/cache authority.
- `window.sync(false)` remains the explicit synchronization path.
- Existing Assistant tenant actions and `Owner command:` authority remain the deterministic AI write boundary.
- Proof Log remains the verification/audit evidence surface.

## 1. Accounting bridge

Initial provider: QuickBooks Online.

H38 remains operational truth for customers, jobs, field work, invoices and job-cost context. The accounting provider may become the accounting-ledger authority where appropriate.

Initial entity coverage:

- customers,
- invoices,
- payments,
- expenses / job costs.

The browser runtime may store non-secret connection metadata and produce sync previews. It must never store Intuit client secrets, OAuth refresh tokens or provider access tokens.

Live provider writes require a server-side provider action that:

1. authenticates the H38 user,
2. verifies active business membership and required owner/financial permission,
3. resolves the exact H38 record and current provider mapping,
4. previews or validates the outgoing provider payload,
5. performs the provider call only when separately authorized,
6. rereads/verifies the provider result,
7. records H38 Proof Log evidence and any mapping IDs,
8. records failures in the Error Log.

Until that provider authorization exists, accounting sync controls are `Prepared — No External Writes` and `externalWritesEnabled=false`.

## 2. Dispatch and resource planning

Dispatch is an enhanced view/controller over existing Task Manager and Schedule data.

Resources include:

- people,
- crews where represented,
- vehicles and equipment,
- availability,
- skills/capabilities,
- operating location/base,
- assigned job/time window.

The first slice adds resource profiles, person/equipment readiness, daily utilization, and double-booking detection. Saving a deployment produces the canonical Schedule event plus internal dispatch context through the existing secure operation queue.

Future scoring may rank suitable people/equipment by availability, required skill, job location, maintenance hold, and travel distance, but it must not silently schedule work. Automatic scheduling remains disabled unless a separate owner-approved feature changes that contract.

## 3. Offline field continuity

The existing offline foundation is extended rather than replaced.

The installed Business Office already uses:

- a service-worker application shell,
- user-scoped IndexedDB,
- cached authoritative business snapshots,
- stable client IDs,
- an operation queue,
- tenant-checked synchronization,
- offline Site Visit / attachment and low-risk operational writes.

The platform push makes offline state visible and treats it as a normal field mode. Supported work can continue while disconnected, remain in the authenticated user's local queue, and synchronize when connectivity returns.

Offline mode never:

- approves pricing,
- sends customer communication,
- purchases materials,
- moves money,
- changes permissions,
- publishes/deploys software,
- changes the H38 engine.

Conflict-sensitive quote, financial, permission and settings changes continue to require explicit review where applicable.

## 4. AI Office operating layer

The target loop is:

`search → analyze → propose → preview → Owner command → execute → verify → Proof Log`

The AI Team may inspect active-tenant operational records and surface owner priorities across customers, quotes, jobs, recurring work, dispatch, invoices, expenses and follow-ups.

The AI scanner itself does not receive a direct database backdoor. Supported owner-commanded writes continue through deterministic Office action adapters and existing permission/proof controls.

Engine/source/schema/security/deployment changes remain outside customer/tenant AI authority.

## 5. Owner intelligence

The Owner Command Center is an operational start-of-day surface, not a replacement accounting report.

Initial deterministic signals include:

- open cash due,
- overdue cash,
- active jobs,
- jobs with blockers or stale updates,
- recorded invoice revenue versus recorded expenses as a planning-margin signal,
- recurring work due,
- overdue follow-up tasks,
- daily crew utilization,
- person/equipment dispatch conflicts,
- 3–5 recommended next actions.

Unknown or incomplete costs remain unknown. Planning signals are not posted accounting entries.

## Safety invariants

These remain false in this push:

- `automaticApproval`
- `automaticCustomerSending`
- `automaticPurchasing`
- `automaticPayment`
- `automaticScheduling`
- `automaticDeployment`
- browser QuickBooks external writes
- AI engine mutation
- cross-tenant action execution

The five areas are additive capabilities inside the current Office. They must not create a second engine, second tenant model, second queue, or second dispatch authority.
