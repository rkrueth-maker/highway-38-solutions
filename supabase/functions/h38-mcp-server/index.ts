// H38 Office MCP Server — lets Muse (or any MCP client) interact with
// a contractor's H38 Business Office: customers, jobs, quotes, schedule,
// invoices, and time entries.
//
// Data model: the Office is local-first; the canonical server store is the
// `business_records` table (collections: customers, jobs, quotes, invoices,
// timeEntries, ...), keyed by business_id.
//
// Protocol: MCP over streamable HTTP (JSON-RPC 2.0 via POST).
// Auth: Authorization: Bearer <api-key> — key is SHA-256 hashed and looked
// up in business_records (collection='mcp_api_keys'), which yields the
// business_id that scopes every query.
//
// Write tools are two-phase: call without confirmed=true to get a preview,
// then call again with confirmed=true to execute.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROTOCOL_VERSION = "2024-11-05";
// Writes are attributed to the business owner (standing "you run the stuff"
// authorization); every MCP write is tagged in its payload Source field.
const OWNER_UUID = "ccf25333-47cd-42ca-a20b-cdbc63a8a695";

// ---------- helpers ----------

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sb(path: string, opts: { method?: string; body?: unknown; query?: Record<string, string> } = {}) {
  let url = `${SUPABASE_URL}/rest/v1/${path}`;
  if (opts.query) {
    const qs = new URLSearchParams(opts.query).toString();
    if (qs) url += `?${qs}`;
  }
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  return data as any[];
}

async function authenticate(req: Request): Promise<string> {
  const header = req.headers.get("authorization") || "";
  const m = /^Bearer (.+)$/i.exec(header.trim());
  if (!m) throw httpError(401, "Missing Authorization: Bearer <api-key>.");
  const hash = await sha256Hex(m[1]);
  const rows = await sb("business_records", {
    query: {
      "collection": "eq.mcp_api_keys",
      "record_status": "eq.active",
      "select": "business_id,payload",
    },
  });
  const match = rows.find((r: any) => r.payload && r.payload.key_hash === hash);
  if (!match) throw httpError(401, "Invalid API key.");
  return match.business_id as string;
}

function httpError(status: number, message: string): Error {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  return e;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function money(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
}

// Query business_records for a collection. `filters` maps payload field ->
// PostgREST operator expression, e.g. { "Status": "eq.Draft" }.
// `search` matches record_key + common name fields with ilike.
async function records(
  bid: string,
  collection: string,
  opts: {
    filters?: Record<string, string>;
    search?: string;
    searchFields?: string[];
    order?: string;
    limit?: number;
    activeOnly?: boolean;
  } = {},
) {
  const q: Record<string, string> = {
    "business_id": `eq.${bid}`,
    "collection": `eq.${collection}`,
    "select": "record_key,record_status,payload,created_at",
    "limit": String(Math.min(opts.limit || 20, 100)),
  };
  if (opts.activeOnly !== false) q["record_status"] = "eq.active";
  if (opts.order) q["order"] = opts.order;
  for (const [field, expr] of Object.entries(opts.filters || {})) {
    q[`payload->>${field}`] = expr;
  }
  if (opts.search) {
    const s = `*${opts.search}*`;
    const fields = opts.searchFields || ["Customer Name", "Project Title"];
    const ors = fields.map((f) => `payload->>${f}.ilike.${s}`).join(",");
    q["or"] = `(${ors},record_key.ilike.${s})`;
  }
  return await sb("business_records", { query: q });
}

async function insertRecord(bid: string, collection: string, recordKey: string, payload: Record<string, unknown>) {
  const rows = await sb("business_records", {
    method: "POST",
    body: {
      business_id: bid,
      collection,
      record_key: recordKey,
      record_status: "active",
      created_by: OWNER_UUID,
      updated_by: OWNER_UUID,
      payload: { ...payload, "Business ID": bid },
    },
  });
  return rows[0];
}

// Slim projection of a record for list views.
function slim(row: any, fields: string[]) {
  const p = row.payload || {};
  const out: Record<string, unknown> = { id: row.record_key };
  for (const f of fields) out[f] = p[f] ?? null;
  return out;
}

// ---------- tool definitions ----------

const TOOLS = [
  {
    name: "list_customers",
    description: "Search and list customers for this business. Use to find a customer before creating a quote or looking up their history.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Match against customer name or ID." },
        status: { type: "string", description: "Filter by status, e.g. 'Active'." },
        limit: { type: "integer", description: "Max results (default 20, max 100).", default: 20 },
      },
    },
  },
  {
    name: "get_customer",
    description: "Get full details for one customer, including their jobs, quotes, and invoices.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "The Customer ID (record key)." },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "list_jobs",
    description: "List jobs, optionally filtered by status (e.g. Scheduled, In Progress, Complete).",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by job status." },
        limit: { type: "integer", description: "Max results (default 20, max 100).", default: 20 },
      },
    },
  },
  {
    name: "get_job",
    description: "Get full details for one job, including related quotes and time entries.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The Job ID (record key)." },
      },
      required: ["job_id"],
    },
  },
  {
    name: "create_quote",
    description: "Draft a quote for a customer. TWO-PHASE: call first without confirmed to preview the quote and total, then call again with confirmed=true to create it. New quotes are created as Draft and need owner review before presenting.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "The Customer ID." },
        project_title: { type: "string", description: "Quote title, e.g. 'Bathroom remodel'." },
        items: {
          type: "array",
          description: "Line items.",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number", default: 1 },
              unit: { type: "string", default: "each" },
              unit_price: { type: "number" },
            },
            required: ["description", "unit_price"],
          },
        },
        confirmed: { type: "boolean", description: "Set true to actually create the quote. Default false = preview only.", default: false },
      },
      required: ["customer_id", "project_title", "items"],
    },
  },
  {
    name: "list_quotes",
    description: "List quotes, optionally filtered by status (Draft, Presented, Accepted).",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter by quote status." },
        limit: { type: "integer", description: "Max results (default 20, max 100).", default: 20 },
      },
    },
  },
  {
    name: "get_schedule",
    description: "Get the work schedule: jobs with due/scheduled dates in a date range. Defaults to today.",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Start date YYYY-MM-DD (default today)." },
        days: { type: "integer", description: "Number of days to include (default 1, max 31).", default: 1 },
      },
    },
  },
  {
    name: "create_invoice",
    description: "Create an invoice for a customer (optionally linked to a job). TWO-PHASE: call first without confirmed to preview, then with confirmed=true to create.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "The Customer ID." },
        job_id: { type: "string", description: "Optional Job ID to link." },
        amount: { type: "number", description: "Invoice total. If omitted and job_id is given, uses the job's accepted quote total." },
        title: { type: "string", description: "Invoice title/memo." },
        due_days: { type: "integer", description: "Days until due (default 30).", default: 30 },
        confirmed: { type: "boolean", description: "Set true to actually create. Default false = preview only.", default: false },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "list_invoices",
    description: "List invoices. Status filter: Paid, Draft, or all. Overdue = unpaid with Due Date before today.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "'Paid', 'Draft', 'overdue', 'unpaid', or 'all' (default).", default: "all" },
        limit: { type: "integer", description: "Max results (default 20, max 100).", default: 20 },
      },
    },
  },
  {
    name: "log_time",
    description: "Log hours worked on a job. TWO-PHASE: call first without confirmed to preview, then with confirmed=true to record.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "The Job ID." },
        hours: { type: "number", description: "Hours worked." },
        notes: { type: "string", description: "What was done." },
        date: { type: "string", description: "Work date YYYY-MM-DD (default today)." },
        confirmed: { type: "boolean", description: "Set true to actually record. Default false = preview only.", default: false },
      },
      required: ["job_id", "hours"],
    },
  },
];

// ---------- tool implementations ----------

const CUSTOMER_FIELDS = ["Customer ID", "Customer Name", "Email", "Phone", "Status", "Notes"];
const JOB_FIELDS = ["Job ID", "Job Number", "Project Title", "Status", "Customer ID", "Due Date", "Scheduled Date", "Progress"];
const QUOTE_FIELDS = ["Quote ID", "Quote Number", "Project Title", "Customer ID", "Customer Name", "Status", "Total", "Subtotal"];
const INVOICE_FIELDS = ["Invoice ID", "Invoice Number", "Customer ID", "Job ID", "Status", "Total", "Balance", "Due Date"];

async function tListCustomers(bid: string, a: any) {
  const filters: Record<string, string> = {};
  if (a.status) filters["Status"] = `eq.${a.status}`;
  const rows = await records(bid, "customers", {
    filters,
    search: a.search,
    searchFields: ["Customer Name"],
    limit: a.limit,
    order: "created_at.desc",
  });
  return rows.map((r) => slim(r, CUSTOMER_FIELDS));
}

async function tGetCustomer(bid: string, a: any) {
  const rows = await records(bid, "customers", {
    filters: {},
    limit: 5,
  });
  const cust = rows.find((r) => r.record_key === a.customer_id);
  if (!cust) throw httpError(404, "Customer not found.");
  const cid = a.customer_id;
  const [jobs, quotes, invoices] = await Promise.all([
    records(bid, "jobs", { filters: { "Customer ID": `eq.${cid}` }, limit: 20, order: "created_at.desc" }),
    records(bid, "quotes", { filters: { "Customer ID": `eq.${cid}` }, limit: 20, order: "created_at.desc" }),
    records(bid, "invoices", { filters: { "Customer ID": `eq.${cid}` }, limit: 20, order: "created_at.desc" }),
  ]);
  return {
    customer: slim(cust, CUSTOMER_FIELDS),
    jobs: jobs.map((r) => slim(r, JOB_FIELDS)),
    quotes: quotes.map((r) => slim(r, QUOTE_FIELDS)),
    invoices: invoices.map((r) => slim(r, INVOICE_FIELDS)),
  };
}

async function tListJobs(bid: string, a: any) {
  const filters: Record<string, string> = {};
  if (a.status) filters["Status"] = `eq.${a.status}`;
  const rows = await records(bid, "jobs", { filters, limit: a.limit, order: "created_at.desc" });
  return rows.map((r) => slim(r, JOB_FIELDS));
}

async function tGetJob(bid: string, a: any) {
  const rows = await records(bid, "jobs", { limit: 5 });
  const job = rows.find((r) => r.record_key === a.job_id);
  if (!job) throw httpError(404, "Job not found.");
  const jid = a.job_id;
  const [quotes, time] = await Promise.all([
    records(bid, "quotes", { filters: { "Job ID": `eq.${jid}` }, limit: 10, order: "created_at.desc" }),
    records(bid, "timeEntries", { filters: { "Job ID": `eq.${jid}` }, limit: 20, order: "created_at.desc" }),
  ]);
  return {
    job: slim(job, JOB_FIELDS),
    quotes: quotes.map((r) => slim(r, QUOTE_FIELDS)),
    time_entries: time.map((r) => slim(r, ["Time Entry ID", "Job ID", "Hours", "Notes", "Start Time", "Status"])),
  };
}

async function tCreateQuote(bid: string, a: any) {
  const custRows = await records(bid, "customers", { limit: 5 });
  const cust = custRows.find((r) => r.record_key === a.customer_id);
  if (!cust) throw httpError(404, "Customer not found.");
  const items = (a.items || []).map((it: any, i: number) => ({
    line: i + 1,
    description: String(it.description || ""),
    quantity: Number(it.quantity) || 1,
    unit: String(it.unit || "each"),
    unitPrice: money(it.unit_price),
    amount: money((Number(it.quantity) || 1) * money(it.unit_price)),
  }));
  if (!items.length) throw httpError(400, "At least one line item is required.");
  const subtotal = money(items.reduce((s: number, it: any) => s + it.amount, 0));

  if (!a.confirmed) {
    return {
      preview: true,
      message: "Preview only — call again with confirmed=true to create this quote.",
      customer: cust.payload["Customer Name"],
      project_title: a.project_title,
      items,
      subtotal,
      total: subtotal,
      note: "Quote will be created as Draft; owner review is required before presenting to the customer.",
    };
  }

  const quoteId = `QUOTE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const quoteNumber = `Q-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();
  await insertRecord(bid, "quotes", quoteId, {
    "Quote ID": quoteId,
    "Quote Number": quoteNumber,
    "Project Title": a.project_title,
    "Customer ID": a.customer_id,
    "Customer Name": cust.payload["Customer Name"],
    "Status": "Draft",
    "Revision": 1,
    "lines": items,
    "Subtotal": subtotal,
    "Tax": 0,
    "Total": subtotal,
    "Source": "mcp-server [ai:kit]",
    "Created Time": now,
    "Updated Time": now,
    "Record Version": 1,
  });
  return {
    created: true,
    quote_id: quoteId,
    quote_number: quoteNumber,
    customer: cust.payload["Customer Name"],
    project_title: a.project_title,
    total: subtotal,
    item_count: items.length,
    status: "Draft",
  };
}

async function tListQuotes(bid: string, a: any) {
  const filters: Record<string, string> = {};
  if (a.status && !/^all$/i.test(a.status)) filters["Status"] = `eq.${a.status}`;
  const rows = await records(bid, "quotes", { filters, limit: a.limit, order: "created_at.desc" });
  return rows.map((r) => slim(r, QUOTE_FIELDS));
}

async function tGetSchedule(bid: string, a: any) {
  const start = a.date || todayISO();
  const days = Math.min(Math.max(Number(a.days) || 1, 1), 31);
  const endD = new Date(start + "T00:00:00Z");
  endD.setUTCDate(endD.getUTCDate() + days);
  const endStr = endD.toISOString().slice(0, 10);
  // Jobs store dates in payload "Due Date" / "Scheduled Date" as YYYY-MM-DD strings.
  const rows = await records(bid, "jobs", { limit: 100, order: "created_at.desc" });
  const inRange = rows.filter((r) => {
    const p = r.payload || {};
    const d = String(p["Due Date"] || p["Scheduled Date"] || "").slice(0, 10);
    return d >= start && d < endStr;
  });
  return {
    from: start,
    to: endStr,
    jobs: inRange.map((r) => slim(r, JOB_FIELDS)),
  };
}

async function tCreateInvoice(bid: string, a: any) {
  const custRows = await records(bid, "customers", { limit: 5 });
  const cust = custRows.find((r) => r.record_key === a.customer_id);
  if (!cust) throw httpError(404, "Customer not found.");

  let amount = money(a.amount);
  let jobTitle = "";
  if (a.job_id && !(amount > 0)) {
    const jobRows = await records(bid, "jobs", { limit: 5 });
    const job = jobRows.find((r) => r.record_key === a.job_id);
    if (!job) throw httpError(404, "Job not found.");
    jobTitle = String(job.payload["Project Title"] || "");
    const quotes = await records(bid, "quotes", {
      filters: { "Job ID": `eq.${a.job_id}`, "Status": "eq.Accepted" },
      limit: 1,
      order: "created_at.desc",
    });
    amount = quotes.length ? money(quotes[0].payload["Total"]) : 0;
  }
  if (!(amount > 0)) throw httpError(400, "Invoice amount must be greater than zero (pass amount, or link a job with an accepted quote).");

  const title = a.title || jobTitle || "Invoice";
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + (Number(a.due_days) || 30));
  const dueStr = due.toISOString().slice(0, 10);

  if (!a.confirmed) {
    return {
      preview: true,
      message: "Preview only — call again with confirmed=true to create this invoice.",
      customer: cust.payload["Customer Name"],
      title,
      amount,
      due_date: dueStr,
    };
  }

  const invoiceId = `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();
  await insertRecord(bid, "invoices", invoiceId, {
    "Invoice ID": invoiceId,
    "Invoice Number": invoiceNumber,
    "Customer ID": a.customer_id,
    "Job ID": a.job_id || "",
    "Title": title,
    "Status": "Draft",
    "Subtotal": amount,
    "Tax": 0,
    "Total": amount,
    "Balance": amount,
    "Due Date": dueStr,
    "Source": "mcp-server [ai:kit]",
    "Created Time": now,
    "Updated Time": now,
    "Record Version": 1,
  });
  return {
    created: true,
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    customer: cust.payload["Customer Name"],
    title,
    amount,
    balance: amount,
    status: "Draft",
    due_date: dueStr,
  };
}

async function tListInvoices(bid: string, a: any) {
  const status = (a.status || "all").toLowerCase();
  const filters: Record<string, string> = {};
  if (status === "paid") filters["Status"] = "eq.Paid";
  else if (status === "draft") filters["Status"] = "eq.Draft";
  const rows = await records(bid, "invoices", { filters, limit: a.limit, order: "created_at.desc" });
  const today = todayISO();
  let out = rows.map((r) => slim(r, INVOICE_FIELDS));
  if (status === "overdue") {
    out = out.filter((r) => Number(r["Balance"]) > 0 && String(r["Due Date"] || "") < today && !/^paid$/i.test(String(r["Status"])));
  } else if (status === "unpaid") {
    out = out.filter((r) => Number(r["Balance"]) > 0 && !/^paid$/i.test(String(r["Status"])));
  }
  return out;
}

async function tLogTime(bid: string, a: any) {
  const jobRows = await records(bid, "jobs", { limit: 100 });
  const job = jobRows.find((r) => r.record_key === a.job_id);
  const jobLabel = job ? `${job.payload["Job Number"] || ""} — ${job.payload["Project Title"] || ""}`.trim() : a.job_id;
  const hours = Number(a.hours);
  if (!Number.isFinite(hours) || hours <= 0) throw httpError(400, "Hours must be a positive number.");
  const date = a.date || todayISO();

  if (!a.confirmed) {
    return {
      preview: true,
      message: "Preview only — call again with confirmed=true to record this time entry.",
      job: jobLabel,
      hours,
      date,
      notes: a.notes || "",
    };
  }

  const entryId = `TIME-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();
  await insertRecord(bid, "timeEntries", entryId, {
    "Time Entry ID": entryId,
    "Job ID": a.job_id,
    "Hours": hours,
    "Start Time": `${date}T00:00:00Z`,
    "Notes": a.notes || "",
    "Status": "Recorded",
    "Source": "mcp-server [ai:kit]",
    "Created Time": now,
    "Updated Time": now,
    "Record Version": 1,
  });
  return { recorded: true, entry_id: entryId, job: jobLabel, hours, date };
}

const HANDLERS: Record<string, (bid: string, args: any) => Promise<unknown>> = {
  list_customers: tListCustomers,
  get_customer: tGetCustomer,
  list_jobs: tListJobs,
  get_job: tGetJob,
  create_quote: tCreateQuote,
  list_quotes: tListQuotes,
  get_schedule: tGetSchedule,
  create_invoice: tCreateInvoice,
  list_invoices: tListInvoices,
  log_time: tLogTime,
};

// ---------- JSON-RPC ----------

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type, mcp-session-id",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "cache-control": "no-store",
    },
  });
}
function rpcResult(id: unknown, result: unknown): Response {
  return json(200, { jsonrpc: "2.0", id, result });
}
function rpcError(id: unknown, code: number, message: string): Response {
  return json(200, { jsonrpc: "2.0", id, error: { code, message } });
}

async function handleRpc(req: Request, body: any): Promise<Response> {
  const id = body?.id ?? null;
  const method = body?.method;

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "h38-office", version: "1.0.0" },
    });
  }
  if (method === "notifications/initialized") {
    return new Response(null, { status: 202 });
  }
  if (method === "ping") {
    return rpcResult(id, {});
  }

  let businessId: string;
  try {
    businessId = await authenticate(req);
  } catch (e: any) {
    return rpcError(id, -32001, e.message || "Unauthorized");
  }

  if (method === "tools/list") {
    return rpcResult(id, { tools: TOOLS });
  }
  if (method === "tools/call") {
    const name = body?.params?.name;
    const args = body?.params?.arguments || {};
    const handler = HANDLERS[name];
    if (!handler) return rpcError(id, -32602, `Unknown tool: ${name}`);
    try {
      const data = await handler(businessId, args);
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      });
    } catch (e: any) {
      return rpcResult(id, {
        content: [{ type: "text", text: `Error: ${e.message || "Tool failed."}` }],
        isError: true,
      });
    }
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type, mcp-session-id",
        "access-control-allow-methods": "GET, POST, OPTIONS",
      },
    });
  }
  if (req.method === "GET") {
    return json(200, {
      name: "h38-office",
      version: "1.0.0",
      description: "MCP server for H38 Business Office. POST JSON-RPC 2.0 here with Authorization: Bearer <api-key>.",
      protocol: "mcp-streamable-http",
      tools: TOOLS.map((t) => t.name),
    });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Use POST with a JSON-RPC 2.0 body." });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Invalid JSON.");
  }
  try {
    if (Array.isArray(body)) {
      return json(400, { error: "Batch requests not supported; send one JSON-RPC object per POST." });
    }
    return await handleRpc(req, body);
  } catch (e: any) {
    const status = e.status || 500;
    return json(status, { error: e.message || "Internal error." });
  }
});
