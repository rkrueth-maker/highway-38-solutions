# H38 AI Team — Current Supabase Business Office Authority

Date: 2026-09-23

## Purpose

H38 AI Team is an orchestration layer inside the existing Supabase Business Office. It does **not** create a second Office, quote engine, invoice engine, scheduler, mutation backend, permission system, or deployment system.

The team uses the current signed-in business snapshot, the existing H38 Assistant command bus, the current advisory AI router, and the existing preview/approval/proof controls.

## Current team

- **Agent Manager** — routes findings, combines priorities, prevents duplicate/conflicting work, and produces the owner brief.
- **Office Coordinator** — watches active jobs, handoffs, missing customer links, tasks, and follow-up work.
- **Estimating Agent** — watches draft quotes, missing priced lines, zero totals, stale drafts, and quote readiness.
- **Field & Operations Agent** — watches schedule conflicts, active operations, and recurring-service dates.
- **Finance Agent** — watches open balances, overdue invoices, and near-due billing.
- **Customer Agent** — watches current customer records for missing contact or address context.
- **Owner Agent** — turns the highest-priority findings into a short decision/attention queue.
- **Improvement Agent** — detects repeated workflow friction and may propose product/process improvements only.

The legacy Apps Script specialist catalog remains compatibility/reference code. It is not made authoritative by this feature.

## Runtime authority

Current runtime: `commercial-app/ai-team-orchestrator.js`.

The AI Team is bootstrapped by the current Office runtime and wraps the existing `H38_ASSISTANT_COMMAND_BUS` rather than replacing it. Commands such as `AI team`, `team scan`, `business brief`, and `what needs attention` route through the team layer. Existing Assistant commands continue to route through the existing command bus.

The deterministic scan reads only the active authorized `window.state.snapshot`. It does not accept a tenant/business ID from prompt text.

The first release detects:

- overdue and soon-due invoice balances;
- draft quotes with no priced lines or a zero total;
- stale draft quotes;
- customers missing contact/address context;
- active jobs missing a customer link;
- overlapping schedule records for the same assigned user;
- recurring-service plans whose next service date is already past due.

## Advisory AI review

`AI owner brief` may send the deterministic findings to the existing `H38_ASSISTANT_ROUTER.ask` advisory route. The cloud model receives only the bounded finding summary and is asked to prioritize and explain safe next steps.

The advisory route does not receive model tools and cannot write business data.

## Consequential-action boundary

AI Team findings may navigate the user to the relevant Office page or prepare an advisory brief. Consequential actions continue to use the existing Business Office lifecycle:

`detect → investigate → propose → preview → owner/authorized-user approval → deterministic Office action → verify → proof`

The team itself has no `queueOperation` mutation path.

The following remain false at the AI Team authority boundary:

- `engineChangesAllowed`
- `externalActionsEnabled`
- `automaticApproval`
- `automaticCustomerSending`
- `automaticPurchasing`
- `automaticPayment`
- `automaticScheduling`
- `automaticDeployment`

## Customer-owned data vs H38 engine

A customer's authorized Office user may continue to use existing approved Assistant actions to change that customer's own tenant data when the current user's permissions allow it and the existing preview/approval/proof path succeeds.

The AI Team cannot modify H38 source code, schemas, RLS policies, roles, global configuration, deployment state, or another tenant's data. Improvement Agent findings about those subjects are suggestions only.

## Acceptance

Browser acceptance must prove that:

1. all eight AI Team roles render in the current My H38 Assistant;
2. deterministic findings are generated from active-tenant data;
3. `AI team` commands route through the wrapped current command bus;
4. the panel does not duplicate during Office lifecycle events;
5. no auto-send/approval/purchase/payment/schedule/deployment authority is granted;
6. the current tenant-action Assistant and its proof log remain authoritative for approved writes.
