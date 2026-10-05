# H38 Office — Muse Connector

Connect Muse to your H38 Business Office so it can look up customers, check
the schedule, draft quotes, create invoices, and log time — right from chat.

## Live endpoint

```
https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-mcp-server
```

## Setup (2 minutes)

1. In Muse, open **Settings → Connectors → Add custom connector**
   (or tell Muse: "connect to this MCP server").
2. Paste the URL above as the MCP server URL.
3. When asked for credentials, choose **API key / Bearer token** and paste
   your H38 MCP API key (looks like `h38mcp_...`).
   - Your key was generated during setup and is stored securely.
   - Need a new one? Ask your H38 administrator to issue one.
4. Done. Try: *"What's on my schedule today?"* or
   *"Look up customer Northern Lakes and show their open invoices."*

## What Muse can do

| Tool | What it does |
|---|---|
| `list_customers` | Search customers by name |
| `get_customer` | Customer details + jobs, quotes, invoices |
| `list_jobs` | Jobs, filterable by status |
| `get_job` | Job details + quotes + time entries |
| `create_quote` | Draft a quote (preview first, then confirm) |
| `list_quotes` | Quotes by status (Draft / Presented / Accepted) |
| `get_schedule` | Jobs due in a date range |
| `create_invoice` | Create an invoice (preview first, then confirm) |
| `list_invoices` | Invoices: paid, unpaid, overdue, all |
| `log_time` | Log hours on a job (preview first, then confirm) |

## Safety

- **Reads are free.** Muse can look up anything, anytime.
- **Writes are two-phase.** `create_quote`, `create_invoice`, and `log_time`
  first return a *preview*. Nothing is created until you (or Muse, with your
  approval) call again with `confirmed: true`.
- New quotes are created as **Draft** and need owner review before they go
  to the customer — same rule as the Office app.
- Every key is scoped to **one business**. Your data never crosses tenants.
- Lost a key? Have your administrator deactivate it (set the
  `mcp_api_keys` record to `record_status: 'archived'`) and issue a new one.

## For developers

- Source: `supabase/functions/h38-mcp-server/index.ts`
- Protocol: MCP streamable HTTP (JSON-RPC 2.0 over POST). See `openapi.json`.
- Machine-readable capability doc: `llms.txt`
- Auth model: `Authorization: Bearer <key>` → SHA-256 → lookup in
  `business_records` (`collection='mcp_api_keys'`) → `business_id` scopes
  every query. Keys are stored as hashes only.
