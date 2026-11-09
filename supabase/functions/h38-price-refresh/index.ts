import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// h38-price-refresh — 30-day price book freshness (build 20261109-price-refresh-1).
//
// Rick's direction (2026-11-09): "We can update prices with a search every
// 30 days but we should look up what we can."
//
// The quote validator (h38-quote-ai) treats a local_research price row older
// than 30 days (by updated_at) as stale and demotes even exactly-correct
// model lines to manual-required allowances. This function is the honest
// half of the fix: it keeps researched prices fresh WITHOUT ever inventing
// or silently changing an owner's price.
//
// What it does:
//   scan        — for one business (or refresh_all for the fleet), walk the
//                 active price_book_items and, for every local_research row
//                 OLDER than the freshness window that carries a stored
//                 source link, fetch that exact source page and read the
//                 price the page itself publishes (JSON-LD Product offer).
//                 The result lands as a REVIEW row — nothing is applied.
//   review_list — return the review rows for a business.
//   resolve     — owner-only. decision "approve" applies the found price and
//                 stamps freshness; "still_current" keeps the owner's price
//                 and stamps freshness; "dismiss" records no-change. Both
//                 approve and still_current update updated_at on the item,
//                 which is what the validator's 30-day window reads.
//
// Price classes (research, docs/PRICE_REFRESH_RESEARCH_2026-11-09.md):
//   (a) materials with published retail/list prices — searchable, but ONLY
//       from the exact source URL stored on the row. A search engine result
//       is a lead, never a price; the price must come off the source page.
//   (b) labor rates — NO live searchable price exists. Only published
//       benchmarks (BLS OEWS wages, updated annually). Labor rows are
//       therefore "benchmark-only": the scan never proposes a labor price;
//       the owner confirms "still current" or sets the rate by hand.
//   (c) assemblies — never searched directly. Their component rows refresh;
//       the assembly recomputes from components in the app as it does today.
//   (d) owner-set rows (source_type 'business' or approval 'approved') —
//       never scanned, never touched. Blank rows stay blank: a row with no
//       price is never given one by this system.
//
// Review state: business_records collection 'priceRefreshReviews', one row
// per (item, scan) finding, written ONLY here (service key). The client
// reads it and asks the owner; the owner's decision comes back here as a
// JWT call so the price write + freshness stamp stay server-side and
// auditable (business_proof_log, [ai:kit] tag on scan rows).
//
// Auth (either):
//   - x-h38-nightly-key header matching the 'h38-price-refresh' row in
//     h38_internal_job_secrets (pg_cron monthly job / Kit worker), or
//   - a signed-in owner/administrator JWT for the target business.
// verify_jwt = false; every path fails closed. scan accepts either auth;
// resolve REQUIRES a real owner/administrator JWT — the internal key can
// never approve a price change.

const BUILD = "20261109-price-refresh-1";
const COLLECTION = "priceRefreshReviews";
const SECRET_ROW = "h38-price-refresh";
const FRESH_DAYS = 30; // mirrors LOCAL_RESEARCH_REFRESH_DAYS in h38-quote-ai

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// deno-lint-ignore no-explicit-any
type Sb = any;

function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://highway38solutions.com";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-h38-nightly-key",
    "Content-Type": "application/json",
  };
}

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function text(v: unknown, n = 2000): string {
  return String(v == null ? "" : v).slice(0, n).trim();
}

function num(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// ---------------------------------------------------------------------------
// Source price extraction — the price must come off the source page itself.
// Retailer pages (Menards proven 2026-11-09) publish a schema.org JSON-LD
// Product offer; that is the only machine-honest price on the page. A page
// with no JSON-LD price yields NO finding — never a guessed number.
// ---------------------------------------------------------------------------
function extractJsonLdPrice(html: string): number | null {
  const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of blocks) {
    const inner = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    let data: unknown;
    try { data = JSON.parse(inner); } catch { continue; }
    const nodes: unknown[] = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      const found = priceFromNode(node);
      if (found !== null) return found;
    }
  }
  return null;
}

function priceFromNode(node: unknown): number | null {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  const graph = obj["@graph"];
  if (Array.isArray(graph)) {
    for (const g of graph) { const p = priceFromNode(g); if (p !== null) return p; }
  }
  const offers = obj["offers"];
  const offerList = Array.isArray(offers) ? offers : (offers ? [offers] : []);
  for (const offer of offerList) {
    if (offer && typeof offer === "object") {
      const p = num((offer as Record<string, unknown>)["price"]);
      if (p > 0) return p;
      const spec = (offer as Record<string, unknown>)["priceSpecification"];
      if (spec && typeof spec === "object") {
        const sp = num((spec as Record<string, unknown>)["price"]);
        if (sp > 0) return sp;
      }
    }
  }
  return null;
}

// Default fetcher: plain GET, short timeout, browser-ish UA. Injectable so
// the dry_run fixture path can exercise the whole scan without the network.
async function fetchSourcePrice(url: string): Promise<{ price: number | null; note: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (H38 price freshness check)", "Accept": "text/html" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { price: null, note: `source page returned HTTP ${res.status}` };
    const html = await res.text();
    const price = extractJsonLdPrice(html);
    if (price === null) return { price: null, note: "no published price found on the source page" };
    return { price, note: "price read from the source page's published offer" };
  } catch (e) {
    return { price: null, note: `source fetch failed: ${text((e as Error)?.message || e, 120)}` };
  }
}

// The source link lives in source_note ("Source: <url> ..." free text the
// research rows already carry) — pull the first http(s) URL out of it.
function sourceUrlFromNote(note: string): string {
  const m = String(note || "").match(/https?:\/\/[^\s"'<>)\]]+/);
  return m ? m[0].replace(/[.,;]+$/, "") : "";
}

function isLaborRow(row: Record<string, unknown>): boolean {
  const hay = `${text(row.item_code, 200)} ${text(row.description, 400)} ${text(row.category, 120)}`.toLowerCase();
  return /\blabor\b|\blabour\b/.test(hay);
}

function ageDays(updatedAt: unknown): number | null {
  const t = Date.parse(String(updatedAt || ""));
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

// ---------------------------------------------------------------------------
// Review rows (business_records, service-key writes only)
// ---------------------------------------------------------------------------
async function ownerActor(sb: Sb, businessId: string): Promise<string> {
  const { data } = await sb.from("business_memberships")
    .select("auth_user_id,role").eq("business_id", businessId).eq("status", "active").limit(10);
  const members = (data || []) as { auth_user_id: string; role: string }[];
  const actor = members.find((m) => m.role === "owner") || members[0];
  return actor?.auth_user_id || "";
}

async function readReviews(sb: Sb, businessId: string): Promise<{ id: string; payload: Record<string, unknown> }[]> {
  const { data } = await sb.from("business_records")
    .select("id,payload")
    .eq("business_id", businessId)
    .eq("collection", COLLECTION)
    .eq("record_status", "active")
    .limit(500);
  return (data || []).map((r: Record<string, unknown>) => ({ id: String(r.id), payload: (r.payload || {}) as Record<string, unknown> }));
}

async function writeReview(sb: Sb, businessId: string, recordKey: string, payload: Record<string, unknown>): Promise<void> {
  const actorId = await ownerActor(sb, businessId);
  const { data } = await sb.from("business_records")
    .select("id,payload")
    .eq("business_id", businessId).eq("collection", COLLECTION).eq("record_key", recordKey)
    .eq("record_status", "active").limit(1);
  const existing = (data || [])[0] as { id: string; payload: Record<string, unknown> } | undefined;
  if (existing) {
    const merged = { ...existing.payload, ...payload, "Record Version": (Number(existing.payload["Record Version"]) || 0) + 1 };
    await sb.from("business_records").update({ payload: merged, ...(actorId ? { updated_by: actorId } : {}) }).eq("id", existing.id);
    return;
  }
  await sb.from("business_records").insert({
    business_id: businessId, collection: COLLECTION, record_key: recordKey,
    record_status: "active", ...(actorId ? { created_by: actorId, updated_by: actorId } : {}),
    payload: { "Review ID": recordKey, "Business ID": businessId, "Record Version": 1, ...payload },
  });
}

async function proofLog(sb: Sb, businessId: string, actionType: string, details: Record<string, unknown>): Promise<void> {
  try {
    await sb.from("business_proof_log").insert({
      business_id: businessId,
      action_type: actionType,
      entity_type: "Price Refresh Review",
      result: "PASS",
      details: { ...details, tag: "[ai:kit]", source: "h38-price-refresh", build: BUILD },
      external_action_occurred: false,
    });
  } catch { /* proof log is best-effort; the review rows are the record */ }
}

// ---------------------------------------------------------------------------
// Scan — propose review rows only. Never writes a price.
// ---------------------------------------------------------------------------
type Fetcher = (url: string) => Promise<{ price: number | null; note: string }>;

async function scanBusiness(sb: Sb, businessId: string, fetcher: Fetcher): Promise<Record<string, unknown>> {
  const { data: items, error } = await sb.from("price_book_items")
    .select("id,item_code,category,description,unit,unit_cost,sell_price,source_type,source_note,approval_status,updated_at")
    .eq("business_id", businessId).eq("active", true).limit(500);
  if (error) throw error;

  const existing = await readReviews(sb, businessId);
  const pendingByItem = new Map<string, string>();
  for (const r of existing) {
    if (text(r.payload["Status"], 20) === "pending") pendingByItem.set(text(r.payload["Item ID"], 60), String(r.id));
  }

  const nowIso = new Date().toISOString();
  let scanned = 0, proposed = 0, skippedFresh = 0, skippedClass = 0, noSource = 0, noPrice = 0;

  for (const row of (items || []) as Record<string, unknown>[]) {
    const sourceType = text(row.source_type, 40).toLowerCase();
    const approval = text(row.approval_status, 40).toLowerCase();
    // Class (d): owner-set rows are never scanned. Only researched rows go stale.
    if (sourceType !== "local_research" || approval === "approved") { skippedClass++; continue; }
    const age = ageDays(row.updated_at);
    if (age === null || age <= FRESH_DAYS) { skippedFresh++; continue; }
    const currentSell = row.sell_price !== null && row.sell_price !== undefined ? num(row.sell_price) : null;
    // Blank stays blank: no price on the row, nothing to refresh against.
    if (currentSell === null || currentSell <= 0) { skippedClass++; continue; }
    scanned++;
    const itemId = text(row.id, 60);
    if (pendingByItem.has(itemId)) continue; // one open review per item

    const labor = isLaborRow(row);
    const url = sourceUrlFromNote(text(row.source_note, 1000));
    const stamp = nowIso.slice(0, 10).replace(/-/g, "");
    const recordKey = `PRICE-REVIEW-${itemId.slice(0, 8).toUpperCase()}-${stamp}`;
    const base: Record<string, unknown> = {
      "Item ID": itemId,
      "Item Code": text(row.item_code, 120),
      "Description": text(row.description, 400),
      "Unit": text(row.unit, 40),
      "Current Sell Price": currentSell,
      "Current Cost": num(row.unit_cost),
      "Price Class": labor ? "labor_benchmark_only" : "material_published",
      "Source": url,
      "Found Sell Price": null,
      "Found Note": "",
      "Found At": nowIso,
      "Item Updated At": text(row.updated_at, 40),
      "Status": "pending",
      "Decision": "",
      "Decided At": "",
      "Build": BUILD,
    };

    if (labor) {
      // Class (b): no live searchable price exists for labor. The honest
      // review is a benchmark check — owner confirms or edits by hand.
      base["Found Note"] = "Labor has no live published price to look up — only survey benchmarks (e.g. BLS OEWS wages, updated yearly). Confirm the rate is still current, or edit it in the price book.";
      await writeReview(sb, businessId, recordKey, base);
      proposed++;
      continue;
    }
    if (!url) {
      // Class (a) without a stored source link: cannot honestly refresh.
      noSource++;
      base["Status"] = "no_source";
      base["Found Note"] = "No source link is stored on this price row, so there is nothing honest to look up. Add the source link to the row and it joins the next refresh.";
      await writeReview(sb, businessId, recordKey, base);
      continue;
    }
    const found = await fetcher(url);
    if (found.price === null) {
      noPrice++;
      base["Status"] = "no_price_found";
      base["Found Note"] = found.note;
      await writeReview(sb, businessId, recordKey, base);
      continue;
    }
    // Per-SF rows: a retailer page price is per package/sheet. Unit conversion
    // is the owner's call on the review — the found price is stored as the
    // page states it, with the row's unit shown beside it.
    base["Found Sell Price"] = round2(found.price);
    base["Found Note"] = found.note;
    await writeReview(sb, businessId, recordKey, base);
    proposed++;
  }

  const summary = {
    businessId, scanned, proposed,
    skippedFresh, skippedClass, noSource, noPrice,
    build: BUILD,
  };
  await proofLog(sb, businessId, "PRICE_REFRESH_SCAN", { scanned, proposed, skippedFresh, skippedClass, noSource, noPrice });
  return summary;
}

// ---------------------------------------------------------------------------
// Resolve — owner JWT only. The only path that writes a price or a
// freshness stamp, and it writes exactly what the owner decided.
// ---------------------------------------------------------------------------
async function resolveReview(sb: Sb, businessId: string, body: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const reviewId = text(body.reviewId, 80);
  const decision = text(body.decision, 20).toLowerCase();
  if (!reviewId) return { status: 400, body: { error: "reviewId is required." } };
  if (!["approve", "still_current", "dismiss"].includes(decision)) {
    return { status: 400, body: { error: "decision must be approve, still_current, or dismiss." } };
  }
  const { data } = await sb.from("business_records")
    .select("id,payload")
    .eq("business_id", businessId).eq("collection", COLLECTION).eq("record_key", reviewId)
    .eq("record_status", "active").limit(1);
  const review = (data || [])[0] as { id: string; payload: Record<string, unknown> } | undefined;
  if (!review) return { status: 404, body: { error: "Review not found." } };
  if (text(review.payload["Status"], 20) !== "pending") {
    return { status: 409, body: { error: "This review was already decided." } };
  }
  const itemId = text(review.payload["Item ID"], 60);
  const nowIso = new Date().toISOString();
  let appliedPrice: number | null = null;

  if (decision !== "dismiss") {
    const { data: itemRows } = await sb.from("price_book_items")
      .select("id,sell_price,unit_cost,source_note").eq("business_id", businessId).eq("id", itemId).limit(1);
    const item = (itemRows || [])[0] as Record<string, unknown> | undefined;
    if (!item) return { status: 404, body: { error: "Price book item not found." } };
    const patch: Record<string, unknown> = { updated_at: nowIso };
    if (decision === "approve") {
      const found = review.payload["Found Sell Price"];
      if (found === null || found === undefined || num(found) <= 0) {
        return { status: 409, body: { error: "This review has no found price to approve — use still_current or dismiss." } };
      }
      appliedPrice = round2(num(found));
      patch.sell_price = appliedPrice;
    }
    // Freshness stamp: updated_at is what the validator's window reads.
    // The decision itself is recorded on the review row below — the stamp
    // is never silent.
    await sb.from("price_book_items").update(patch).eq("id", itemId).eq("business_id", businessId);
  }

  const payload = {
    ...review.payload,
    "Status": decision === "approve" ? "approved" : decision === "still_current" ? "confirmed_current" : "dismissed",
    "Decision": decision,
    "Decided At": nowIso,
    ...(appliedPrice !== null ? { "Applied Sell Price": appliedPrice } : {}),
    "Record Version": (Number(review.payload["Record Version"]) || 0) + 1,
  };
  await sb.from("business_records").update({ payload }).eq("id", review.id);
  await proofLog(sb, businessId, "PRICE_REFRESH_RESOLVE", { reviewId, decision, appliedPrice });
  return { status: 200, body: { ok: true, reviewId, decision, appliedPrice } };
}

// ---------------------------------------------------------------------------
// Auth: internal job key (scan only) OR owner/admin JWT for the business.
// ---------------------------------------------------------------------------
async function internalKeyOk(req: Request, sb: Sb): Promise<boolean> {
  const got = text(req.headers.get("x-h38-nightly-key"), 200);
  if (!got) return false;
  const { data } = await sb.from("h38_internal_job_secrets").select("secret_value").eq("name", SECRET_ROW).limit(1);
  const want = text((data && data[0])?.secret_value, 200);
  return !!want && got === want;
}

async function jwtUserId(req: Request): Promise<string> {
  const authz = req.headers.get("authorization") || "";
  const token = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7) : "";
  if (!token) return "";
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!res.ok) return "";
  const user = await res.json().catch(() => ({}));
  return text((user as { id?: string }).id, 60);
}

async function ownerRole(sb: Sb, businessId: string, uid: string): Promise<boolean> {
  if (!uid || !businessId) return false;
  const { data } = await sb.from("business_memberships")
    .select("role").eq("business_id", businessId).eq("auth_user_id", uid).eq("status", "active").limit(1);
  const role = text((data && data[0])?.role, 30).toLowerCase();
  return role === "owner" || role === "administrator";
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, headers);
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "Server is not configured." }, headers);
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = text(body.action, 30).toLowerCase();
    const businessId = text(body.businessId, 60);
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    if (action === "scan" || action === "refresh_all") {
      const viaKey = await internalKeyOk(req, sb);
      const uid = viaKey ? "" : await jwtUserId(req);
      if (action === "refresh_all") {
        if (!viaKey) return json(401, { error: "refresh_all requires the internal job key." }, headers);
        const { data: biz } = await sb.from("businesses").select("id").eq("status", "active").limit(200);
        const results = [];
        for (const b of (biz || []) as Record<string, unknown>[]) {
          results.push(await scanBusiness(sb, text(b.id, 60), fetchSourcePrice));
        }
        return json(200, { ok: true, build: BUILD, businesses: results.length, results }, headers);
      }
      if (!businessId) return json(400, { error: "businessId is required." }, headers);
      if (!viaKey && !(await ownerRole(sb, businessId, uid))) {
        return json(401, { error: "Not authorized for this business." }, headers);
      }
      const summary = await scanBusiness(sb, businessId, fetchSourcePrice);
      return json(200, { ok: true, ...summary }, headers);
    }

    if (action === "dry_run") {
      // Fixture validation ONLY: internal key required, and the caller must
      // pin the Build Sandbox tenant — a dry run can never scan another
      // business. The source fetcher is stubbed from the caller's fixture
      // map (url -> price), so the full scan path runs with no network.
      if (!(await internalKeyOk(req, sb))) return json(401, { error: "dry_run requires the internal job key." }, headers);
      const SANDBOX = "d44d32de-dd95-4f6e-81e8-ff5592979d68";
      if (businessId !== SANDBOX) return json(400, { error: "dry_run is pinned to the Build Sandbox tenant." }, headers);
      const fixtures = (body.fixtures || {}) as Record<string, unknown>;
      const stub: Fetcher = (url: string) => {
        const f = fixtures[url] as Record<string, unknown> | undefined;
        if (!f) return Promise.resolve({ price: null, note: "no fixture for this source URL" });
        return Promise.resolve({ price: f.price === null || f.price === undefined ? null : num(f.price), note: text(f.note, 200) || "fixture price" });
      };
      const summary = await scanBusiness(sb, businessId, stub);
      return json(200, { ok: true, dryRun: true, ...summary }, headers);
    }

    if (action === "review_list") {
      if (!businessId) return json(400, { error: "businessId is required." }, headers);
      const uid = await jwtUserId(req);
      if (!(await ownerRole(sb, businessId, uid)) && !(await internalKeyOk(req, sb))) {
        return json(401, { error: "Not authorized for this business." }, headers);
      }
      const rows = await readReviews(sb, businessId);
      return json(200, { ok: true, build: BUILD, reviews: rows.map((r) => r.payload) }, headers);
    }

    if (action === "resolve") {
      // Owner decision — a real owner/administrator JWT is required. The
      // internal job key alone can never approve a price change.
      if (!businessId) return json(400, { error: "businessId is required." }, headers);
      const uid = await jwtUserId(req);
      if (!(await ownerRole(sb, businessId, uid))) {
        return json(401, { error: "Only a business owner or administrator can decide a price review." }, headers);
      }
      const out = await resolveReview(sb, businessId, body);
      return json(out.status, out.body, headers);
    }

    return json(400, { error: `Unknown action "${action}".` }, headers);
  } catch (e) {
    return json(500, { error: text((e as Error)?.message || e, 300) || "Server error." }, headers);
  }
});
