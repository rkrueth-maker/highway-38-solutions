import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

// H38 Accountant View (Phase 1, 2026-10-22) — read-only live workbook links.
//
// A business owner/administrator mints a long unguessable token URL from the
// Office (Reports → Accountant view). The outside accountant opens it with NO
// login and sees a spreadsheet-style workbook of THAT business's money data,
// computed live from business_records at open. Only the SHA-256 hash of the
// token is stored (public.accountant_share_links); the raw token is returned
// once at creation. Revoked or unknown tokens serve nothing. The link
// surface is read-only: the only mutations in this function are link
// create/revoke by an authenticated owner/admin of the same business, and
// the open counter on the link row itself. No business record is ever
// written from a token request.
//
// Actions (POST JSON):
//   {action:"create", businessId, label?}   (JWT, owner/admin) -> {url, link}
//   {action:"list",   businessId}           (JWT, owner/admin) -> {links}
//   {action:"revoke", businessId, linkId}   (JWT, owner/admin) -> {ok}
//   {action:"view",   token}                (public)           -> workbook JSON
// GET ?token=<t>                -> workbook JSON (same as view)
// GET ?token=<t>&format=xlsx    -> workbook .xlsx (real formulas for totals)

const BUILD = "20261022-accountant-view-1";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SITE_ORIGIN = "https://highway38solutions.com";
const PAGE_PATH = "/commercial-app/accountant-view.html";
const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

type Json = Record<string, unknown>;

function clean(v: unknown, max = 6000): string {
  return String(v ?? "").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]").slice(0, max);
}
function origin(req: Request): string {
  return clean(req.headers.get("origin"), 300).replace(/\/+$/, "");
}
function corsHeaders(req: Request): Record<string, string> {
  const o = origin(req);
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has(o) ? o : SITE_ORIGIN,
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "cache-control": "no-store",
    "vary": "Origin",
  };
}
function json(req: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(req), "content-type": "application/json; charset=utf-8" },
  });
}
function bearer(req: Request): string {
  const m = String(req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}
function service() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase service configuration is unavailable.");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
function xml(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// ---------- auth (admin actions only) ----------
async function actor(req: Request) {
  const token = bearer(req);
  if (!token) throw new Error("Supabase Auth session is required.");
  const db = service();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Supabase Auth session is invalid or expired.");
  return { db, user: data.user };
}
async function membership(db: ReturnType<typeof service>, userId: string, businessId: string): Promise<string> {
  const { data, error } = await db.from("business_memberships")
    .select("role,status").eq("business_id", businessId).eq("auth_user_id", userId).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The signed-in account is not an active member of this business.");
  const role = clean(data.role, 60).toLowerCase();
  if (!["owner", "administrator"].includes(role)) {
    throw new Error("Only an Owner or Administrator can manage accountant view links.");
  }
  return role;
}

// ---------- tokens ----------
function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return "acct-" + b64;
}
async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- workbook ----------
type ColType = "text" | "money" | "int" | "date" | "num";
interface Col { label: string; type: ColType; total?: boolean }
interface Tab {
  id: string; title: string; columns: Col[];
  rows: (string | number)[][];
  totals: (number | null)[]; // aligned with columns; null where no total
  note?: string;
}
interface Workbook {
  business: { id: string; key: string; name: string };
  generatedAt: string;
  note: string;
  tabs: Tab[];
}

const r2 = (v: number): number => Math.round((Number(v) || 0) * 100) / 100;
function s(p: Json, ...keys: string[]): string {
  for (const k of keys) {
    const v = p[k];
    if (v !== null && v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}
function num(p: Json, ...keys: string[]): number {
  for (const k of keys) {
    const v = p[k];
    if (v !== null && v !== undefined && v !== "") {
      const x = Number(v);
      if (Number.isFinite(x)) return x;
    }
  }
  return 0;
}
function day(p: Json, ...keys: string[]): string {
  const v = s(p, ...keys);
  return v ? v.slice(0, 10) : "";
}
const VOID_RE = /VOID|CANCEL/i;
function notVoid(p: Json): boolean { return !VOID_RE.test(s(p, "Status")); }

async function loadCollection(
  db: ReturnType<typeof service>, businessId: string, collection: string,
): Promise<Json[]> {
  const out: Json[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await db.from("business_records")
      .select("record_key,payload,created_at")
      .eq("business_id", businessId).eq("collection", collection).eq("record_status", "active")
      .order("created_at", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    const rows = (data || []) as unknown as { record_key: string; payload: Json }[];
    for (const r of rows) out.push({ ...(r.payload || {}), __recordKey: r.record_key });
    if (rows.length < 1000) break;
    from += 1000;
  }
  return out;
}

// Default chart of accounts (mirrors commercial-app/accounting-engine.js
// DEFAULT_ACCOUNTS) so GL account ids render with names.
const ACCOUNT_NAMES: Record<string, string> = {
  "ACCT-1000": "1000 · Operating Checking", "ACCT-1010": "1010 · Savings",
  "ACCT-1100": "1100 · Accounts Receivable", "ACCT-1200": "1200 · Undeposited Funds",
  "ACCT-1300": "1300 · Inventory", "ACCT-1500": "1500 · Equipment & Fixed Assets",
  "ACCT-2000": "2000 · Accounts Payable", "ACCT-2100": "2100 · Credit Cards Payable",
  "ACCT-2200": "2200 · Loans Payable", "ACCT-2300": "2300 · Customer Deposits",
  "ACCT-2400": "2400 · Federal Withholding Payable", "ACCT-2410": "2410 · FICA Payable",
  "ACCT-2420": "2420 · State Withholding Payable", "ACCT-2430": "2430 · Other Payroll Deductions Payable",
  "ACCT-2440": "2440 · Net Pay Payable", "ACCT-2450": "2450 · Employer Payroll Taxes Payable",
  "ACCT-3000": "3000 · Owner Equity", "ACCT-4000": "4000 · Service Revenue",
  "ACCT-4100": "4100 · Other Revenue", "ACCT-5000": "5000 · Materials / Cost of Goods Sold",
  "ACCT-5100": "5100 · Direct Labor / Cost of Goods Sold", "ACCT-5200": "5200 · Equipment / Cost of Goods Sold",
  "ACCT-6000": "6000 · Operating Expense", "ACCT-6100": "6100 · Fuel",
  "ACCT-6200": "6200 · Insurance", "ACCT-6300": "6300 · Rent",
  "ACCT-6400": "6400 · Software & Subscriptions", "ACCT-6500": "6500 · Bank & Processor Fees",
  "ACCT-6600": "6600 · Mileage & Reimbursements", "ACCT-6700": "6700 · Repairs & Maintenance",
  "ACCT-6800": "6800 · Wages Expense", "ACCT-6900": "6900 · Employer Payroll Taxes",
};

function totalsFor(columns: Col[], rows: (string | number)[][]): (number | null)[] {
  return columns.map((c, i) => {
    if (!c.total) return null;
    return r2(rows.reduce((sum, row) => sum + (typeof row[i] === "number" ? (row[i] as number) : 0), 0));
  });
}
function makeTab(id: string, title: string, columns: Col[], rows: (string | number)[][], note?: string): Tab {
  return { id, title, columns, rows, totals: totalsFor(columns, rows), note };
}

async function buildWorkbook(db: ReturnType<typeof service>, businessId: string): Promise<Workbook> {
  const { data: biz, error: bizErr } = await db.from("businesses")
    .select("id,business_key,display_name,legal_name").eq("id", businessId).maybeSingle();
  if (bizErr) throw bizErr;
  if (!biz) throw new Error("Business not found.");
  const bizName = clean(biz.display_name || biz.legal_name, 300) || "Business";
  const bizKey = clean(biz.business_key, 100);

  const [customers, invoicesRaw, paymentsRaw, expensesRaw, payrollRaw, glRaw, mileageRaw, jobsRaw] = await Promise.all([
    loadCollection(db, businessId, "customers"),
    loadCollection(db, businessId, "invoices"),
    loadCollection(db, businessId, "payments"),
    loadCollection(db, businessId, "expenses"),
    loadCollection(db, businessId, "payrollPeriods"),
    loadCollection(db, businessId, "accountingTransactions"),
    loadCollection(db, businessId, "mileageTrips"),
    loadCollection(db, businessId, "jobs"),
  ]);

  const customerName = new Map<string, string>();
  for (const c of customers) {
    const name = s(c, "Customer Name", "Name", "Business Name");
    const rk = s(c, "__recordKey");
    const cid = s(c, "Customer ID");
    if (rk && name) customerName.set(rk, name);
    if (cid && name) customerName.set(cid, name);
  }
  const custName = (id: string): string => (id ? (customerName.get(id) || "") : "");

  const invoices = invoicesRaw.filter(notVoid);
  const invoiceById = new Map<string, Json>();
  for (const inv of invoices) {
    const iid = s(inv, "Invoice ID");
    if (iid) invoiceById.set(iid, inv);
  }

  // --- Invoices ---
  const invRows = invoices.map((inv) => {
    const total = r2(num(inv, "Total"));
    const balance = r2(num(inv, "Balance", "Balance Due", "Amount Due", "Open Balance"));
    const row: (string | number)[] = [
      day(inv, "Invoice Date", "Created Time"),
      s(inv, "Invoice Number", "Invoice ID"),
      custName(s(inv, "Customer ID")),
      s(inv, "Status"),
      r2(num(inv, "Subtotal")),
      r2(num(inv, "Tax", "Tax Amount")),
      total,
      r2(total - balance),
      balance,
    ];
    return { d: row[0] as string, row };
  }).sort((a, b) => a.d.localeCompare(b.d)).map((x) => x.row);
  const invTab = makeTab("invoices", "Invoices", [
    { label: "Date", type: "date" }, { label: "Invoice #", type: "text" },
    { label: "Customer", type: "text" }, { label: "Status", type: "text" },
    { label: "Subtotal", type: "money", total: true }, { label: "Tax", type: "money", total: true },
    { label: "Total", type: "money", total: true }, { label: "Paid", type: "money", total: true },
    { label: "Balance Due", type: "money", total: true },
  ], invRows);

  // --- Payments ---
  const payRows = paymentsRaw.filter(notVoid).map((p) => {
    const inv = invoiceById.get(s(p, "Invoice ID"));
    const row: (string | number)[] = [
      day(p, "Payment Date", "Created Time"),
      inv ? s(inv, "Invoice Number", "Invoice ID") : s(p, "Invoice ID"),
      custName(s(p, "Customer ID")) || (inv ? custName(s(inv, "Customer ID")) : ""),
      s(p, "Method"),
      s(p, "Reference"),
      s(p, "Status"),
      r2(num(p, "Amount")),
    ];
    return { d: row[0] as string, row };
  }).sort((a, b) => a.d.localeCompare(b.d)).map((x) => x.row);
  const payTab = makeTab("payments", "Payments", [
    { label: "Date", type: "date" }, { label: "Invoice #", type: "text" },
    { label: "Customer", type: "text" }, { label: "Method", type: "text" },
    { label: "Reference", type: "text" }, { label: "Status", type: "text" },
    { label: "Amount", type: "money", total: true },
  ], payRows);

  // --- Expenses ---
  const expRows = expensesRaw.filter(notVoid).map((e) => {
    const row: (string | number)[] = [
      day(e, "Expense Date", "Created Time"),
      s(e, "Vendor"),
      s(e, "Category"),
      s(e, "Description"),
      s(e, "Status"),
      r2(num(e, "Amount")),
      r2(num(e, "Tax", "Tax Amount")),
    ];
    return { d: row[0] as string, row };
  }).sort((a, b) => a.d.localeCompare(b.d)).map((x) => x.row);
  const expTab = makeTab("expenses", "Expenses", [
    { label: "Date", type: "date" }, { label: "Vendor", type: "text" },
    { label: "Category", type: "text" }, { label: "Description", type: "text" },
    { label: "Status", type: "text" },
    { label: "Amount", type: "money", total: true }, { label: "Tax", type: "money", total: true },
  ], expRows);

  // --- Payroll ---
  const payrRows = payrollRaw.filter(notVoid).map((p) => {
    const row: (string | number)[] = [
      day(p, "Period Start", "Start Date"),
      day(p, "Period End", "End Date"),
      day(p, "Pay Date", "Created Time"),
      Math.round(num(p, "Employee Count")),
      s(p, "Status"),
      r2(num(p, "Gross Pay", "Total Gross")),
      r2(num(p, "Deductions")),
      r2(num(p, "Net Pay", "Total Net", "Prepared Net Amount")),
    ];
    return { d: row[2] as string, row };
  }).sort((a, b) => a.d.localeCompare(b.d)).map((x) => x.row);
  const payrollTab = makeTab("payroll", "Payroll", [
    { label: "Period Start", type: "date" }, { label: "Period End", type: "date" },
    { label: "Pay Date", type: "date" }, { label: "Employees", type: "int" },
    { label: "Status", type: "text" },
    { label: "Gross Pay", type: "money", total: true },
    { label: "Deductions", type: "money", total: true },
    { label: "Net Pay", type: "money", total: true },
  ], payrRows);

  // --- Mileage (business trips from the Office mileage log) ---
  const jobLabel = new Map<string, string>();
  for (const j of jobsRaw) {
    const jid = s(j, "Job ID");
    if (!jid) continue;
    const num2 = s(j, "Job Number");
    const title = s(j, "Project Title", "Title");
    jobLabel.set(jid, (num2 && num2 !== jid ? num2 + " — " : "") + (title || jid));
  }
  const mileageRows = mileageRaw
    .filter((t) => s(t, "Classification") === "Business" &&
      (s(t, "Status") === "Classified" || s(t, "Status") === "Auto-filed"))
    .map((t) => {
      const row: (string | number)[] = [
        day(t, "Started At"),
        s(t, "User Name"),
        s(t, "Start Label") || "Trip start",
        s(t, "End Label") || "Trip end",
        jobLabel.get(s(t, "Job ID")) || s(t, "Job ID"),
        s(t, "Purpose"),
        r2(num(t, "Miles")),
      ];
      return { d: row[0] as string, row };
    }).sort((a, b) => a.d.localeCompare(b.d)).map((x) => x.row);
  const mileageTab = makeTab("mileage", "Mileage", [
    { label: "Date", type: "date" }, { label: "Driver", type: "text" },
    { label: "From", type: "text" }, { label: "To", type: "text" },
    { label: "Job", type: "text" }, { label: "Purpose", type: "text" },
    { label: "Miles", type: "num", total: true },
  ], mileageRows, "Business trips only, from the Office mileage log (Fleet \u2192 Mileage). Each driver's personal trips stay private to that driver and are never included here.");

  // --- Journal (GL detail) + account rollup ---
  const journalRows: (string | number)[][] = [];
  const byAccount = new Map<string, { debit: number; credit: number }>();
  const glSorted = [...glRaw].sort((a, b) =>
    day(a, "Transaction Date", "date", "Created Time").localeCompare(day(b, "Transaction Date", "date", "Created Time")));
  for (const tx of glSorted) {
    if (!notVoid(tx)) continue;
    const lines = (Array.isArray(tx["Lines"]) ? tx["Lines"] : Array.isArray(tx["lines"]) ? tx["lines"] : []) as Json[];
    const txDate = day(tx, "Transaction Date", "date", "Created Time");
    const txType = s(tx, "Transaction Type", "type");
    const memo = s(tx, "Memo", "memo");
    for (const ln of lines) {
      const acctId = s(ln, "accountId", "Account ID", "Account");
      const debit = r2(num(ln, "debit", "Debit"));
      const credit = r2(num(ln, "credit", "Credit"));
      journalRows.push([
        txDate, txType, memo,
        ACCOUNT_NAMES[acctId] || acctId,
        s(ln, "description", "Description"),
        debit, credit,
      ]);
      const agg = byAccount.get(acctId) || { debit: 0, credit: 0 };
      agg.debit = r2(agg.debit + debit);
      agg.credit = r2(agg.credit + credit);
      byAccount.set(acctId, agg);
    }
  }
  const journalTab = makeTab("journal", "Journal (GL)", [
    { label: "Date", type: "date" }, { label: "Type", type: "text" },
    { label: "Memo", type: "text" }, { label: "Account", type: "text" },
    { label: "Description", type: "text" },
    { label: "Debit", type: "money", total: true }, { label: "Credit", type: "money", total: true },
  ], journalRows, "One row per general-ledger line. Total debits equal total credits when the books balance.");

  const acctRows = [...byAccount.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([acctId, agg]) => [
      ACCOUNT_NAMES[acctId] || acctId,
      agg.debit, agg.credit, r2(agg.debit - agg.credit),
    ] as (string | number)[]);
  const acctTab = makeTab("gl-accounts", "GL by Account", [
    { label: "Account", type: "text" },
    { label: "Debits", type: "money", total: true }, { label: "Credits", type: "money", total: true },
    { label: "Balance (Dr − Cr)", type: "money", total: true },
  ], acctRows);

  // --- Books (summary) ---
  const t = (tab: Tab, i: number): number => tab.totals[i] ?? 0;
  const booksRows: (string | number)[][] = [
    ["Invoices issued", invTab.rows.length, t(invTab, 6)],
    ["Payments received", payTab.rows.length, t(payTab, 6)],
    ["Open invoice balance (amount still owed)", "", t(invTab, 8)],
    ["Expenses recorded (incl. tax)", expTab.rows.length, r2(t(expTab, 5) + t(expTab, 6))],
    ["Payroll — gross pay", payrollTab.rows.length, t(payrollTab, 5)],
    ["Payroll — net pay", "", t(payrollTab, 7)],
    ["Journal — total debits", journalTab.rows.length, t(journalTab, 5)],
    ["Journal — total credits", "", t(journalTab, 6)],
  ];
  const booksTab: Tab = {
    id: "books", title: "Books — Summary",
    columns: [
      { label: "Item", type: "text" }, { label: "Count", type: "int" }, { label: "Amount", type: "money" },
    ],
    rows: booksRows,
    totals: [null, null, null],
    note: "Summary of the tabs in this workbook, computed live from the business's records. In the downloaded spreadsheet these amounts are formulas that read the other tabs.",
  };

  return {
    business: { id: businessId, key: bizKey, name: bizName },
    generatedAt: new Date().toISOString(),
    note: "Read-only accountant view. Figures are computed live from the business's Office records at the moment this page opens. Voided or cancelled records are excluded.",
    tabs: [booksTab, invTab, payTab, expTab, payrollTab, mileageTab, acctTab, journalTab],
  };
}

// ---------- XLSX (hand-rolled OOXML, same approach as h38-document-factory,
// extended to multiple sheets with REAL formulas: every total cell is a
// =SUM(...) over its column, Invoices "Paid" is =Total-Balance per row, and
// the Books amounts are cross-sheet references to the other tabs' totals.
// Cached values are embedded so readers show numbers immediately, and
// fullCalcOnLoad makes Excel/Sheets recompute on open.) ----------
const HEADER_ROW = 4;
function colLetter(c: number): string { return String.fromCharCode(65 + c); }

interface SheetPlan {
  name: string;
  tab: Tab;
  firstDataRow: number;
  lastDataRow: number;
  totalRow: number | null;
}

function cellXml(ref: string, value: string | number, style: number, formula?: string): string {
  const sAttr = style ? ` s="${style}"` : "";
  if (formula) {
    const cached = typeof value === "number" && Number.isFinite(value) ? value : 0;
    return `<c r="${ref}"${sAttr}><f>${xml(formula)}</f><v>${cached}</v></c>`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"${sAttr}><v>${value}</v></c>`;
  }
  const str = String(value ?? "");
  if (str === "") return `<c r="${ref}"${sAttr}/>`;
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t>${xml(str)}</t></is></c>`;
}

function buildXlsx(wb: Workbook): Promise<Uint8Array> {
  const plans: SheetPlan[] = wb.tabs.map((tab) => {
    const firstDataRow = HEADER_ROW + 1;
    const lastDataRow = HEADER_ROW + tab.rows.length;
    const hasTotals = tab.totals.some((v) => v !== null) && tab.rows.length > 0;
    return {
      name: tab.title.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet",
      tab, firstDataRow, lastDataRow,
      totalRow: hasTotals ? lastDataRow + 1 : null,
    };
  });
  const planById = new Map(plans.map((p) => [p.tab.id, p]));
  const totalRef = (tabId: string, colIdx: number): string | null => {
    const p = planById.get(tabId);
    if (!p || p.totalRow === null) return null;
    return `'${p.name}'!${colLetter(colIdx)}${p.totalRow}`;
  };

  const sheetXmlFor = (plan: SheetPlan): string => {
    const tab = plan.tab;
    const rowsXml: string[] = [];
    rowsXml.push(`<row r="1">${cellXml("A1", wb.business.name, 2)}</row>`);
    rowsXml.push(`<row r="2">${cellXml("A2", tab.title, 0)}</row>`);
    if (tab.note) rowsXml.push(`<row r="3">${cellXml("A3", tab.note, 0)}</row>`);
    rowsXml.push(`<row r="${HEADER_ROW}">` + tab.columns.map((c, i) =>
      cellXml(`${colLetter(i)}${HEADER_ROW}`, c.label, 2)).join("") + `</row>`);
    tab.rows.forEach((row, ri) => {
      const r = plan.firstDataRow + ri;
      const cells = row.map((value, ci) => {
        const col = tab.columns[ci];
        const style = col.type === "money" ? 1 : 0;
        // Invoices "Paid" (col 7) is a live formula: Total (G) - Balance (I).
        if (tab.id === "invoices" && ci === 7) {
          return cellXml(`${colLetter(ci)}${r}`, value, style, `${colLetter(6)}${r}-${colLetter(8)}${r}`);
        }
        return cellXml(`${colLetter(ci)}${r}`, value, style);
      }).join("");
      rowsXml.push(`<row r="${r}">${cells}</row>`);
    });
    if (plan.totalRow !== null) {
      const r = plan.totalRow;
      const cells = tab.columns.map((c, ci) => {
        if (ci === 0) return cellXml(`${colLetter(ci)}${r}`, "Total", 2);
        if (c.total) {
          const f = `SUM(${colLetter(ci)}${plan.firstDataRow}:${colLetter(ci)}${plan.lastDataRow})`;
          return cellXml(`${colLetter(ci)}${r}`, tab.totals[ci] ?? 0, c.type === "money" ? 3 : 2, f);
        }
        return cellXml(`${colLetter(ci)}${r}`, "", 0);
      }).join("");
      rowsXml.push(`<row r="${r}">${cells}</row>`);
    }
    // Books sheet: point Amount cells at the other tabs' total cells.
    if (tab.id === "books") {
      const refs: (string | null)[] = [
        totalRef("invoices", 6), totalRef("payments", 6), totalRef("invoices", 8),
        (() => { const a = totalRef("expenses", 5), b = totalRef("expenses", 6); return a && b ? `${a}+${b}` : null; })(),
        totalRef("payroll", 5), totalRef("payroll", 7),
        totalRef("journal", 5), totalRef("journal", 6),
      ];
      for (let i = 0; i < refs.length; i++) {
        const f = refs[i];
        if (!f) continue;
        const r = plan.firstDataRow + i;
        const row = tab.rows[i];
        const cells = row.map((value, ci) =>
          ci === 2 ? cellXml(`${colLetter(ci)}${r}`, value, 1, f) : cellXml(`${colLetter(ci)}${r}`, value, 0)
        ).join("");
        rowsXml[3 + 1 + i] = `<row r="${r}">${cells}</row>`;
      }
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml.join("")}</sheetData></worksheet>`;
  };

  const z = new JSZip();
  const sheetOverrides = plans.map((_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  z.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`);
  z.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  z.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><calcPr fullCalcOnLoad="1"/><sheets>${plans.map((p, i) => `<sheet name="${xml(p.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  z.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${plans.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${plans.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  z.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>`);
  plans.forEach((p, i) => z.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXmlFor(p)));
  return z.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// ---------- link lookup ----------
async function findLink(db: ReturnType<typeof service>, token: string) {
  if (!token || token.length > 200 || /\s/.test(token)) return null;
  const hash = await tokenHash(token);
  const { data, error } = await db.from("accountant_share_links")
    .select("id,business_id,open_count,revoked_at").eq("token_hash", hash).maybeSingle();
  if (error) throw error;
  if (!data || data.revoked_at) return null;
  return data;
}
async function registerOpen(db: ReturnType<typeof service>, link: { id: string; open_count: number }) {
  try {
    await db.from("accountant_share_links")
      .update({ last_opened_at: new Date().toISOString(), open_count: (link.open_count || 0) + 1 })
      .eq("id", link.id);
  } catch (_) { /* an open-counter failure must never block the view */ }
}

// ---------- handler ----------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    const db = service();
    const url = new URL(req.url);

    if (req.method === "GET") {
      const token = clean(url.searchParams.get("token") || url.searchParams.get("t") || "", 200);
      if (!token) return json(req, 400, { status: "FAIL", error: "A link token is required." });
      const link = await findLink(db, token);
      if (!link) return json(req, 404, { status: "NOT_FOUND", error: "This accountant view link is not active." });
      await registerOpen(db, link);
      const wb = await buildWorkbook(db, link.business_id as string);
      if ((url.searchParams.get("format") || "").toLowerCase() === "xlsx") {
        const bytes = await buildXlsx(wb);
        const fname = `${(wb.business.key || "business").replace(/[^\w-]+/g, "-")}-accountant-workbook.xlsx`;
        return new Response(bytes, {
          status: 200,
          headers: {
            ...corsHeaders(req),
            "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "content-disposition": `attachment; filename="${fname}"`,
          },
        });
      }
      return json(req, 200, { status: "OK", build: BUILD, workbook: wb });
    }

    if (req.method !== "POST") return json(req, 405, { status: "FAIL", error: "Method not allowed." });
    const body = (await req.json().catch(() => ({}))) as Json;
    const action = clean(body.action, 40).toLowerCase();

    if (action === "view") {
      const token = clean(body.token, 200);
      const link = await findLink(db, token);
      if (!link) return json(req, 404, { status: "NOT_FOUND", error: "This accountant view link is not active." });
      await registerOpen(db, link);
      const wb = await buildWorkbook(db, link.business_id as string);
      return json(req, 200, { status: "OK", build: BUILD, workbook: wb });
    }

    // Everything below requires an authenticated owner/admin of the business.
    const { user } = await actor(req);
    const businessId = clean(body.businessId, 80);
    if (!businessId) return json(req, 400, { status: "FAIL", error: "businessId is required." });
    await membership(db, user.id, businessId);

    if (action === "create") {
      const token = newToken();
      const hash = await tokenHash(token);
      const label = clean(body.label, 120);
      const { data, error } = await db.from("accountant_share_links").insert({
        business_id: businessId, token_hash: hash,
        token_prefix: token.slice(0, 13), label, created_by: user.id,
      }).select("id,created_at,label,token_prefix").single();
      if (error) throw error;
      return json(req, 200, {
        status: "OK", build: BUILD,
        url: `${SITE_ORIGIN}${PAGE_PATH}?t=${token}`,
        link: data,
      });
    }
    if (action === "list") {
      const { data, error } = await db.from("accountant_share_links")
        .select("id,label,token_prefix,created_at,last_opened_at,open_count,revoked_at")
        .eq("business_id", businessId).order("created_at", { ascending: false });
      if (error) throw error;
      return json(req, 200, { status: "OK", build: BUILD, links: data || [] });
    }
    if (action === "revoke") {
      const linkId = clean(body.linkId, 80);
      if (!linkId) return json(req, 400, { status: "FAIL", error: "linkId is required." });
      const { error } = await db.from("accountant_share_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", linkId).eq("business_id", businessId);
      if (error) throw error;
      return json(req, 200, { status: "OK", build: BUILD, revoked: linkId });
    }
    return json(req, 400, { status: "FAIL", error: "Unknown action." });
  } catch (e) {
    return json(req, 400, { status: "FAIL", error: clean(e instanceof Error ? e.message : String(e), 500) });
  }
});
