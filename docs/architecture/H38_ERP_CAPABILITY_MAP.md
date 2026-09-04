# H38 Business Office — Phone-First ERP Capability Map

Status: active architecture contract

## Product rule

Highway 38 Business Office remains one product and one tenant-aware data model. Daily field work must stay fast enough to run from a phone. Larger companies may open deeper ERP controls on desktop without creating a second app, a second workflow, or a second source of truth.

Primary mobile navigation is intentionally small. Capabilities that are not part of the daily field loop belong in the ERP Center, reports, or a future add-on surface until a business enables them.

## Core operating loop

1. Customer / request
2. Site Visit and evidence capture
3. Quote and owner review
4. Job
5. Task Manager assignment / deployment
6. Employee time and field execution
7. Invoice / payment / closeout
8. Historical reporting and business-specific quoting context

Task Manager remains the assignment and deployment authority. Do not replace it with a separate dispatch product.

## Capability placement

| Capability | Phone | ERP desktop | Reports | Add-on / hidden | Current authority |
| --- | --- | --- | --- | --- | --- |
| Today / priorities | Primary | Summary | Yes | No | Existing Office |
| Customers / properties | Primary | Full | Yes | No | Existing Office |
| Site Visit | Primary | Review | Yes | No | Existing Office |
| Quotes | Primary | Full | Yes | No | Existing Office |
| Jobs | Primary | Full | Yes | No | Existing Office |
| Task Manager / deployment | Primary | Full | Yes | No | Existing Work page / tasks |
| Time & attendance | Primary punch | Full edit/audit | Yes | No | ERP time RPCs + revision ledger |
| Existing-data uptake | Minimal status | Full stage/review/apply | Import reports | No | ERP import runs / rows |
| Business quote learning | Optional context | Full analysis | Yes | No | Tenant quote-learning profile |
| Accounting depth | Exceptions | Full | Yes | Expand as needed | Existing accounting records |
| Payroll processing | Status only | Future | Yes | Hidden add-on | Hook reserved |
| Inventory control | Task exceptions | Future | Yes | Hidden add-on | Hook reserved |
| Fleet | Task exceptions | Future | Yes | Hidden add-on | Hook reserved |
| Purchasing | Approvals only | Future | Yes | Hidden add-on | Hook reserved |
| Advanced reporting / BI | Alerts only | Future | Primary | Hidden add-on | Hook reserved |

## Time and attendance contract

Employees with an active staff membership may clock themselves in and out. A user may have only one open punch at a time.

Time-entry writes do not use the generic `business_records` browser write path. Punches use self-scoped authenticated RPCs. Owner/administrator corrections use a separate authenticated RPC and require an edit reason.

Every time-entry insert, clock-out update, and owner correction is copied to an append-only revision ledger with before/after payloads, actor, reason, and timestamp. The ordinary employee does not receive access to another employee's audit history.

Imported historical time may be staged by an owner/administrator through the data uptake process.

## Existing-data uptake contract

A new business should not have to start empty. Existing CSV/JSON exports are staged into that business's tenant partition before they are applied.

The uptake path is:

1. Choose the business and data type.
2. Upload a bounded batch.
3. Preserve the raw row.
4. Normalize into the H38 target collection.
5. Stage the rows without changing operational records.
6. Review the staged count/type.
7. Explicitly apply the staged run.
8. Record imported/error counts and preserve the import run for review.

Approved initial target collections are customers, contacts, properties, jobs, work orders, tasks, quotes, time entries, expenses, invoices, payments, documents, and generic historical records. Settings, approvals, provider credentials, social accounts, proof logs, and error logs are not valid import targets.

In the current platform, “their own database” means their own RLS-isolated `business_id` tenant partition in the production Supabase system of record. Separate physical Supabase projects are not required for each customer to keep their operational data isolated.

## Business-specific historical learning

Historical context is tenant-isolated. H38 may summarize only records belonging to the active business when helping that business quote future work.

Initial signals include:

- prior quote count and acceptance/win count,
- average and median quote totals,
- project-title patterns,
- average quoted labor and materials by pattern,
- completed-job count,
- recorded time samples and labor hours,
- average recorded hours for matching historical job patterns when Job IDs are available.

This context is advisory. It must not silently change a quote price, approve a quote, send a quote, purchase materials, schedule work, or create a payment.

## Hidden and add-on rule

A capability may exist in the data/model layer before it deserves a primary user-facing button. If it is not part of the common daily loop, keep it behind ERP Center, reporting, or an explicit add-on flag. Preserve the contract and verifier so it is not forgotten.

Do not grow primary mobile navigation to expose every ERP capability.

## Safety boundaries

These remain false unless a separate owner-approved feature explicitly changes them:

- `automaticApproval`
- `automaticCustomerSending`
- `automaticPurchasing`
- `automaticPayment`
- `automaticScheduling`
- `externalActionsEnabled`

No historical-learning or reporting feature may bypass these controls.
