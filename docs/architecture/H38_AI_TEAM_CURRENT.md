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

Current team runtime: `commercial-app/ai-team-orchestrator.js`.

Explicit owner-command runtime: `commercial-app/ai-owner-command-authority.js`.

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

## Explicit owner-command authority

A signed-in owner may intentionally authorize a supported Business Office action with the explicit command form:

`Owner command: <action>`

This is a human approval signal, not autonomous AI approval.

- The owner-command runtime strips the explicit prefix and gives the action to the existing Assistant command bus and `assistant-tenant-actions.js` resolver.
- If that resolver can create an exact, permitted tenant-data action, the owner-command runtime immediately uses the existing `executePending()` path.
- Existing role/capability checks, active-tenant checks, stale-preview checks, deterministic Office mutation functions, verification, and proof logging remain authoritative.
- `Owner command: approve` / `Owner command: save it` may execute the exact currently pending authorized preview.
- `Owner command: cancel` cancels the pending preview without writing it.
- Ordinary wording without the explicit owner-command prefix remains preview-first and still waits for the normal approval action.
- A non-owner cannot use the owner-command direct-execution authority.
- If an owner command cannot be resolved to an existing deterministic action adapter, no business-data success is claimed and no alternate mutation backend is created.

The owner-command layer has no `queueOperation` write path of its own. It delegates to existing tenant-action authority only.

## Advisory AI review

`AI owner brief` may send the deterministic findings to the existing `H38_ASSISTANT_ROUTER.ask` advisory route. The cloud model receives only the bounded finding summary and is asked to prioritize and explain safe next steps.

The advisory route does not receive model tools and cannot write business data.

## Consequential-action boundary

AI Team findings may navigate the user to the relevant Office page or prepare an advisory brief. Consequential tenant-data actions use one of two human-authorized paths:

Normal preview path:

`detect → investigate → propose → preview → owner/authorized-user approval → deterministic Office action → verify → proof`

Explicit owner-command path:

`owner command → resolve exact supported action → permission/tenant validation → explicit owner approval → deterministic Office action → verify → proof`

`automaticApproval` remains false because the owner command itself is the human approval; the AI is not approving its own work.

The team and owner-command wrappers have no separate mutation backend.

The following remain false at the AI Team / owner-command authority boundary:

- `engineChangesAllowed`
- `externalActionsEnabled`
- `automaticApproval`
- `automaticCustomerSending`
- `automaticPurchasing`
- `automaticPayment`
- `automaticScheduling`
- `automaticDeployment`

Owner commands do **not** auto-execute sending/delivery, payment/refund, purchasing, deletion, invitation/permission changes, publishing/social posting, deployment, payroll export, tax filing, or similar external commitments. Those requests remain behind their existing explicit specialist Office controls.

## Customer-owned data vs H38 engine

A customer's authorized Office user may continue to use existing approved Assistant actions to change that customer's own tenant data when the current user's permissions allow it and the existing preview/approval/proof path succeeds. A signed-in owner may use the explicit owner-command form to provide that approval in the command itself for supported deterministic actions.

The AI Team and owner-command authority cannot modify H38 source code, schemas, RLS policies, roles, global configuration, deployment state, or another tenant's data. Improvement Agent findings about those subjects are suggestions only.

## Acceptance

Browser acceptance must prove that:

1. all eight AI Team roles render in the current My H38 Assistant;
2. deterministic findings are generated from active-tenant data;
3. `AI team` commands route through the wrapped current command bus;
4. the panel does not duplicate during Office lifecycle events;
5. an explicit signed-in owner command can execute an exact supported tenant-data action through the existing tenant-action authority;
6. ordinary command wording remains preview-only;
7. a non-owner cannot use owner-command direct execution;
8. external commitments are not auto-executed even when prefixed as an owner command;
9. no auto-send/purchase/payment/schedule/deployment authority is granted;
10. the current tenant-action Assistant and its verification/proof log remain authoritative for writes.
