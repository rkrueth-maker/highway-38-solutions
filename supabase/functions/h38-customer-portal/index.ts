// h38-customer-portal — customer self-service portal API for H38 Office tenants.
//
// PUBLIC endpoint (verify_jwt = false). Customers authenticate with single-use
// magic-link tokens (SHA-256 hashes stored, raw token never persisted) and get
// a scoped session token that only ever exposes THEIR records.
//
// Hard gate: every action runs ONLY when the tenant has explicitly enabled the
// customer portal in business_module_settings (module_key = "customer_portal",
// enabled = true). Missing row or enabled != true => 403. Default is OFF.
//
// Security design:
// - Magic tokens: 32 random bytes (base64url), SHA-256 hash stored, expire in
//   24h, single-use. Redeeming mints a 30-day session token (also hashed).
// - Raw tokens are never stored anywhere. Token hashes are unguessable.
// - All reads are scoped to (business_id, customer_record_key). A session can
//   never see another customer's records.
// - Quote approval only touches quotes in PRESENTED/SENT status that belong to
//   the session's customer. Approval marks the quote APPROVED and records the
//   event; the owner still converts it to a job in the Office.
// - Payments: while a business only records them manually, the portal
//   records a payment intent (portal_payment_intents) for the office to
//   complete — the portal never moves money. When the business has ALSO
//   enabled online payments (module_key = "online_payments") and finished
//   Stripe Connect onboarding, pay-invoice-checkout sends the customer to
//   hosted Stripe Checkout on the business's OWN connected account; funds
//   settle to that business's bank, never to H38.
// - Client-facing errors are generic; internals are logged server-side only.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const MODULE_KEY = "customer_portal";
const BOOKING_MODULE_KEY = "online_booking";
const ONLINE_PAYMENTS_MODULE_KEY = "online_payments";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const TOKEN_COLLECTION = "portal_tokens";
const INVITE_COLLECTION = "portal_invite_requests";
const APPROVAL_COLLECTION = "quote_approvals";
const PAYMENT_INTENT_COLLECTION = "portal_payment_intents";

const MAGIC_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const SESSION_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Rate limit: max requests per IP per window. In-memory per isolate —
// defense in depth alongside the tenant gate, not a hard guarantee.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const rateHits = new Map<string, number[]>();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX = {
  email: 120,
  phone: 30,
  name: 80,
  service: 80,
  date: 10,
  time: 20,
  notes: 1000,
  reason: 500,
} as const;

type JsonObject = Record<string, any>;

function clean(v: unknown, max: number): string {
const CONTROL_CHARS_RE = new RegExp("[\\u0000-\\u001f\\u007f]", "g");
  return String(v ?? "")
    .replace(CONTROL_CHARS_RE, "")
    .trim()
    .slice(0, max);
}

function requestOrigin(request: Request): string {
  return clean(request.headers.get("origin"), 300).replace(/\/+$/, "");
}

function corsHeaders(request: Request): HeadersInit {
  const origin = requestOrigin(request);
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://highway38solutions.com";
  const requestedHeaders = clean(request.headers.get("access-control-request-headers"), 500);
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-headers": requestedHeaders || "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "600",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin, Access-Control-Request-Headers",
  };
}

function reply(request: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders(request) });
}

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rateHits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) return true;
  hits.push(now);
  rateHits.set(ip, hits);
  return false;
}

function serviceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase service configuration is unavailable.");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function pick(payload: JsonObject, ...keys: string[]): any {
  for (const k of keys) {
    const v = payload[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

function numberValue(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  // base64url
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bearer(request: Request): string {
  const match = String(request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function signedInUser(request: Request): Promise<{ id: string; email?: string }> {
  const token = bearer(request);
  if (!token) throw new Error("Supabase Auth session is required.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      "content-type": "application/json",
      "x-client-info": "h38-customer-portal-auth-v1",
    },
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.id !== "string" || !payload.id) {
    throw new Error("Supabase Auth session is invalid or expired.");
  }
  return { id: payload.id, email: typeof payload.email === "string" ? payload.email : undefined };
}

async function activeOwner(service: ReturnType<typeof serviceClient>, userId: string, businessId: string) {
  const { data, error } = await service
    .from("business_memberships")
    .select("id, role, status")
    .eq("business_id", businessId)
    .eq("auth_user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The signed-in account is not an active member of this business.");
  if (!["owner", "administrator"].includes(String(data.role))) {
    throw new Error("Owner or Administrator permission is required.");
  }
  return data;
}

async function moduleEnabled(service: ReturnType<typeof serviceClient>, businessId: string, moduleKey: string): Promise<boolean> {
  const { data, error } = await service
    .from("business_module_settings")
    .select("enabled")
    .eq("business_id", businessId)
    .eq("module_key", moduleKey)
    .maybeSingle();
  if (error) throw error;
  return data?.enabled === true;
}

// Online payments (Stripe Connect) state for a tenant. Ready only when the
// owner turned the module on AND Stripe reports charges enabled on the
// business's own connected account.
async function onlinePaymentsState(
  service: ReturnType<typeof serviceClient>,
  businessId: string,
): Promise<{ enabled: boolean; ready: boolean; accountId: string }> {
  const { data, error } = await service
    .from("business_module_settings")
    .select("enabled, config")
    .eq("business_id", businessId)
    .eq("module_key", ONLINE_PAYMENTS_MODULE_KEY)
    .maybeSingle();
  if (error) throw error;
  const config = ((data?.config || {}) as JsonObject);
  const enabled = data?.enabled === true;
  const accountId = clean(config.stripeAccountId, 80);
  return { enabled, ready: enabled && !!accountId && config.chargesEnabled === true, accountId };
}

async function stripeCreateCheckout(
  accountId: string,
  params: URLSearchParams,
): Promise<JsonObject> {
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Account": accountId,
    },
    body: params.toString(),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Stripe checkout could not be created.");
  return data as JsonObject;
}

async function attributionUserId(service: ReturnType<typeof serviceClient>, businessId: string): Promise<string> {
  for (const role of ["owner", "administrator"]) {
    const { data, error } = await service
      .from("business_memberships")
      .select("auth_user_id")
      .eq("business_id", businessId)
      .eq("role", role)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.auth_user_id) return data.auth_user_id;
  }
  throw new Error("no owner or administrator found for business");
}

async function readJsonBody(req: Request): Promise<JsonObject> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeProof(
  service: ReturnType<typeof serviceClient>,
  businessId: string,
  actionType: string,
  entityType: string,
  entityId: string | null,
  result: string,
  details: JsonObject,
) {
  try {
    await service.from("business_proof_log").insert({
      business_id: businessId,
      actor_user_id: null,
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId,
      result,
      details: { ...details, via: "customer_portal" },
      external_action_occurred: false,
    });
  } catch (_) {
    // Proof log is best-effort; never break the portal action.
  }
}

// ---- Customer lookup ----

interface CustomerMatch {
  record_key: string;
  payload: JsonObject;
}

async function findCustomer(
  service: ReturnType<typeof serviceClient>,
  businessId: string,
  email: string,
  phone: string,
): Promise<CustomerMatch | null> {
  const normEmail = email.trim().toLowerCase();
  const normPhone = phone.replace(/[^0-9+]/g, "");
  const { data, error } = await service
    .from("business_records")
    .select("record_key,payload")
    .eq("business_id", businessId)
    .eq("collection", "customers")
    .eq("record_status", "active")
    .limit(500);
  if (error) throw error;
  for (const row of data || []) {
    const p = (row.payload || {}) as JsonObject;
    const rowEmail = clean(pick(p, "Email", "email"), 320).toLowerCase();
    const rowPhone = clean(pick(p, "Phone", "phone"), 40).replace(/[^0-9+]/g, "");
    if (normEmail && rowEmail && rowEmail === normEmail) return { record_key: row.record_key, payload: p };
    if (normPhone && rowPhone && rowPhone === normPhone) return { record_key: row.record_key, payload: p };
  }
  return null;
}

async function customerById(
  service: ReturnType<typeof serviceClient>,
  businessId: string,
  customerId: string,
): Promise<CustomerMatch | null> {
  const { data, error } = await service
    .from("business_records")
    .select("record_key,payload")
    .eq("business_id", businessId)
    .eq("collection", "customers")
    .eq("record_status", "active")
    .eq("record_key", customerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { record_key: data.record_key, payload: (data.payload || {}) as JsonObject };
}

// ---- Session handling ----

interface PortalSession {
  tokenHash: string;
  businessId: string;
  customerKey: string;
}

async function validateSessionToken(
  service: ReturnType<typeof serviceClient>,
  rawToken: string,
): Promise<PortalSession | null> {
  if (!rawToken || rawToken.length < 20) return null;
  const hash = await sha256Hex(rawToken);
  const { data, error } = await service
    .from("business_records")
    .select("business_id,payload")
    .eq("collection", TOKEN_COLLECTION)
    .eq("record_status", "active")
    .limit(2000);
  if (error) throw error;
  const now = Date.now();
  for (const row of data || []) {
    const p = (row.payload || {}) as JsonObject;
    if (p.token_hash !== hash) continue;
    if (p.token_type !== "session") continue;
    if (p.used === true) continue;
    if (new Date(p.expires_at).getTime() < now) continue;
    return { tokenHash: hash, businessId: row.business_id, customerKey: String(p.customer_key || "") };
  }
  return null;
}

function portalUrl(request: Request, businessId: string, token: string): string {
  const origin = requestOrigin(request) || "https://rkrueth-maker.github.io";
  // Portal page is served alongside the Office app.
  const base = origin.includes("github.io")
    ? `${origin}/highway-38-solutions/commercial-app/customer-portal.html`
    : `${origin}/commercial-app/customer-portal.html`;
  return `${base}?business=${encodeURIComponent(businessId)}&token=${encodeURIComponent(token)}`;
}

// ---- Session bundle (what the customer is allowed to see) ----

async function buildSessionBundle(
  service: ReturnType<typeof serviceClient>,
  businessId: string,
  customerKey: string,
): Promise<JsonObject> {
  const { data: business } = await service
    .from("businesses")
    .select("display_name")
    .eq("id", businessId)
    .maybeSingle();

  const { data: customerRow } = await service
    .from("business_records")
    .select("payload")
    .eq("business_id", businessId)
    .eq("collection", "customers")
    .eq("record_key", customerKey)
    .eq("record_status", "active")
    .maybeSingle();
  const customer = ((customerRow?.payload || {}) as JsonObject);

  const { data: quoteRows } = await service
    .from("business_records")
    .select("record_key,payload,updated_at")
    .eq("business_id", businessId)
    .eq("collection", "quotes")
    .eq("record_status", "active")
    .order("updated_at", { ascending: false })
    .limit(100);
  const quotes = (quoteRows || [])
    .filter((r) => clean(pick(r.payload || {}, "Customer ID", "customerId"), 120) === customerKey)
    .map((r) => {
      const p = (r.payload || {}) as JsonObject;
      const tiers = Array.isArray(p.tiers) ? p.tiers : [];
      return {
        id: r.record_key,
        number: clean(pick(p, "Quote Number", "quoteNumber"), 60),
        title: clean(pick(p, "Project Title", "projectTitle"), 120),
        status: clean(pick(p, "Status", "status"), 40),
        total: numberValue(pick(p, "Total", "total")),
        tierMode: clean(pick(p, "Tier Mode", "tierMode"), 40),
        scope: clean(pick(p, "Scope", "scope"), 2000),
        tiers: tiers.slice(0, 3).map((t: JsonObject) => ({
          name: clean(pick(t, "name"), 40),
          description: clean(pick(t, "description"), 500),
          total: numberValue(pick(t, "total")),
          items: (Array.isArray(t.items) ? t.items : []).slice(0, 50).map((l: JsonObject) => ({
            description: clean(pick(l, "description", "Description"), 160),
            quantity: numberValue(pick(l, "quantity", "Quantity")),
            unitPrice: numberValue(pick(l, "unitPrice", "Unit Price", "rate")),
          })),
        })),
        lines: (Array.isArray(p.lines) ? p.lines : []).slice(0, 50).map((l: JsonObject) => ({
          description: clean(pick(l, "description", "Description"), 160),
          quantity: numberValue(pick(l, "quantity", "Quantity")),
          unitPrice: numberValue(pick(l, "unitPrice", "Unit Price", "rate")),
        })),
        updatedAt: r.updated_at,
      };
    });

  const { data: invoiceRows } = await service
    .from("business_records")
    .select("record_key,payload,updated_at")
    .eq("business_id", businessId)
    .eq("collection", "invoices")
    .eq("record_status", "active")
    .order("updated_at", { ascending: false })
    .limit(100);
  const invoices = (invoiceRows || [])
    .filter((r) => clean(pick(r.payload || {}, "Customer ID", "customerId"), 120) === customerKey)
    .map((r) => {
      const p = (r.payload || {}) as JsonObject;
      return {
        id: r.record_key,
        number: clean(pick(p, "Invoice Number", "invoiceNumber"), 60),
        status: clean(pick(p, "Status", "status"), 40),
        total: numberValue(pick(p, "Total", "total")),
        balance: numberValue(pick(p, "Balance", "balance")),
        dueDate: clean(pick(p, "Due Date", "dueDate"), 20),
      };
    });

  const { data: eventRows } = await service
    .from("business_records")
    .select("payload")
    .eq("business_id", businessId)
    .eq("collection", "scheduleEvents")
    .eq("record_status", "active")
    .order("updated_at", { ascending: false })
    .limit(100);
  const now = Date.now();
  const appointments = (eventRows || [])
    .map((r) => (r.payload || {}) as JsonObject)
    .filter((p) => {
      const relId = clean(pick(p, "Related Record ID", "relatedRecordId"), 120);
      const relType = clean(pick(p, "Related Record Type", "relatedRecordType"), 40);
      // Show events linked to this customer's jobs, or titled with the customer name.
      return (
        (relType === "Job" && relId) ||
        clean(pick(p, "Title", "title"), 200).toLowerCase().includes(
          clean(pick(customer, "Customer Name", "name"), 120).toLowerCase().slice(0, 20),
        )
      );
    })
    .map((p) => ({
      title: clean(pick(p, "Title", "title"), 160),
      start: clean(pick(p, "Start Time", "startTime"), 40),
      end: clean(pick(p, "End Time", "endTime"), 40),
      location: clean(pick(p, "Location", "location"), 200),
      status: clean(pick(p, "Status", "status"), 40),
    }))
    .filter((a) => a.start && new Date(a.start).getTime() >= now - 24 * 60 * 60 * 1000)
    .slice(0, 20);

  const { data: jobRows } = await service
    .from("business_records")
    .select("record_key,payload,updated_at")
    .eq("business_id", businessId)
    .eq("collection", "jobs")
    .eq("record_status", "active")
    .order("updated_at", { ascending: false })
    .limit(100);
  const jobs = (jobRows || [])
    .filter((r) => clean(pick(r.payload || {}, "Customer ID", "customerId"), 120) === customerKey)
    .map((r) => {
      const p = (r.payload || {}) as JsonObject;
      return {
        id: r.record_key,
        number: clean(pick(p, "Job Number", "jobNumber"), 60),
        title: clean(pick(p, "Project Title", "projectTitle"), 160),
        status: clean(pick(p, "Status", "status"), 40),
      };
    });

  const paymentsState = await onlinePaymentsState(service, businessId);

  return {
    business: { id: businessId, name: business?.display_name || "Highway 38" },
    payments: { onlineEnabled: paymentsState.ready },
    customer: {
      name: clean(pick(customer, "Customer Name", "name"), 120),
      email: clean(pick(customer, "Email", "email"), 120),
      phone: clean(pick(customer, "Phone", "phone"), 40),
    },
    quotes,
    invoices,
    appointments,
    jobs,
  };
}

// ---- Main handler ----

export async function handlePortalRequest(req: Request): Promise<Response> {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[h38-customer-portal] missing SUPABASE_URL or SERVICE_ROLE_KEY");
    return new Response(JSON.stringify({ error: "The portal is unavailable right now." }), { status: 500, headers });
  }

  const url = new URL(req.url);
  // Read the body ONCE — Request bodies are single-use streams; a second
  // readJsonBody() call would see an empty body.
  const body: JsonObject = req.method === "POST" ? await readJsonBody(req) : {};
  const action = clean(
    url.searchParams.get("action") || (typeof body.action === "string" ? body.action : ""),
    40,
  );

  const sb = serviceClient();

  // ---- Public status check (fail closed) ----
  if (req.method === "GET" && action === "status") {
    const businessId = clean(url.searchParams.get("business_id"), 80);
    if (!UUID_RE.test(businessId)) return reply(req, 400, { error: "Invalid business." });
    try {
      const portal = await moduleEnabled(sb, businessId, MODULE_KEY);
      const booking = await moduleEnabled(sb, businessId, BOOKING_MODULE_KEY);
      return reply(req, 200, { portalEnabled: portal, bookingEnabled: booking });
    } catch (e) {
      console.error("[h38-customer-portal] status check failed:", e);
      return reply(req, 500, { error: "The portal is unavailable right now." });
    }
  }

  if (req.method === "GET" && action === "session") {
    const rawToken = clean(url.searchParams.get("token"), 200);
    try {
      const session = await validateSessionToken(sb, rawToken);
      if (!session) return reply(req, 401, { error: "This link is invalid or has expired." });
      if (!(await moduleEnabled(sb, session.businessId, MODULE_KEY))) {
        return reply(req, 403, { error: "The customer portal is not enabled for this business." });
      }
      const bundle = await buildSessionBundle(sb, session.businessId, session.customerKey);
      return reply(req, 200, { sessionToken: rawToken, ...bundle });
    } catch (e) {
      console.error("[h38-customer-portal] session failed:", e);
      return reply(req, 500, { error: "The portal is unavailable right now." });
    }
  }

  // ---- Everything below is POST ----
  if (req.method !== "POST") return reply(req, 405, { error: "Method not allowed." });

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return reply(req, 429, { error: "Too many requests. Please try again later." });
  }

  const postAction = clean(
    (typeof body.action === "string" ? body.action : "") || url.searchParams.get("action"),
    40,
  );

  try {
    // ---- request-link (public): customer asks for a magic link ----
    if (postAction === "request-link") {
      const businessId = clean(body.business_id, 80);
      if (!UUID_RE.test(businessId)) return reply(req, 400, { error: "Invalid request." });
      if (!(await moduleEnabled(sb, businessId, MODULE_KEY))) {
        return reply(req, 403, { error: "The customer portal is not enabled for this business." });
      }
      const email = clean(body.email, MAX.email);
      const phone = clean(body.phone, MAX.phone);
      if (!email && !phone) return reply(req, 400, { error: "Enter your email or phone number." });

      const customer = await findCustomer(sb, businessId, email, phone);
      if (customer) {
        const raw = newToken();
        const hash = await sha256Hex(raw);
        const now = new Date().toISOString();
        const actorId = await attributionUserId(sb, businessId);
        await sb.from("business_records").insert({
          business_id: businessId,
          collection: TOKEN_COLLECTION,
          record_key: `MAGIC-${Date.now()}-${hash.slice(0, 8)}`,
          record_status: "active",
          created_by: actorId,
          updated_by: actorId,
          payload: {
            "Token Type": "magic",
            token_type: "magic",
            token_hash: hash,
            customer_key: customer.record_key,
            customer_name: clean(pick(customer.payload, "Customer Name", "name"), 120),
            used: false,
            expires_at: new Date(Date.now() + MAGIC_TOKEN_TTL_MS).toISOString(),
            "Business ID": businessId,
            "Created Time": now,
            "Record Version": 1,
          },
        });
        // Queue an invite request so the office sees it and can deliver the
        // link through its normal channel (SMS/email). Never auto-send.
        await sb.from("business_records").insert({
          business_id: businessId,
          collection: INVITE_COLLECTION,
          record_key: `INVITE-${Date.now()}-${hash.slice(0, 8)}`,
          record_status: "active",
          created_by: actorId,
          updated_by: actorId,
          payload: {
            "Customer ID": customer.record_key,
            "Customer Name": clean(pick(customer.payload, "Customer Name", "name"), 120),
            "Email": email || clean(pick(customer.payload, "Email", "email"), 120),
            "Phone": phone || clean(pick(customer.payload, "Phone", "phone"), 40),
            "Status": "Pending — send portal link",
            "Portal Link": portalUrl(req, businessId, raw),
            "Business ID": businessId,
            "Created Time": now,
            "Record Version": 1,
          },
        });
        await writeProof(sb, businessId, "PORTAL_LINK_REQUESTED", "Customer", customer.record_key, "OK", {
          channel: email ? "email" : "phone",
        });
      }
      // Generic response whether or not a customer matched — never confirm or
      // deny that an account exists.
      return reply(req, 200, {
        ok: true,
        message: "If we found your account, your secure sign-in link is on its way. It expires in 24 hours.",
      });
    }

    // ---- create-link (owner only): generate a portal link to text/email ----
    if (postAction === "create-link") {
      const businessId = clean(body.business_id, 80);
      const customerId = clean(body.customer_id, 120);
      if (!UUID_RE.test(businessId) || !customerId) return reply(req, 400, { error: "Invalid request." });
      const user = await signedInUser(req);
      await activeOwner(sb, user.id, businessId);
      if (!(await moduleEnabled(sb, businessId, MODULE_KEY))) {
        return reply(req, 403, { error: "Enable the customer portal in Owner Controls first." });
      }
      const customer = await customerById(sb, businessId, customerId);
      if (!customer) return reply(req, 404, { error: "Customer not found." });
      const raw = newToken();
      const hash = await sha256Hex(raw);
      const now = new Date().toISOString();
      await sb.from("business_records").insert({
        business_id: businessId,
        collection: TOKEN_COLLECTION,
        record_key: `MAGIC-${Date.now()}-${hash.slice(0, 8)}`,
        record_status: "active",
        created_by: user.id,
        updated_by: user.id,
        payload: {
          "Token Type": "magic",
          token_type: "magic",
          token_hash: hash,
          customer_key: customer.record_key,
          customer_name: clean(pick(customer.payload, "Customer Name", "name"), 120),
          used: false,
          expires_at: new Date(Date.now() + MAGIC_TOKEN_TTL_MS).toISOString(),
          "Business ID": businessId,
          "Created Time": now,
          "Record Version": 1,
        },
      });
      await writeProof(sb, businessId, "PORTAL_LINK_CREATED", "Customer", customer.record_key, "OK", {});
      return reply(req, 200, { ok: true, link: portalUrl(req, businessId, raw), expiresInHours: 24 });
    }

    // ---- redeem (public): exchange a single-use magic token for a session ----
    if (postAction === "redeem") {
      const raw = clean(body.token, 200);
      if (!raw) return reply(req, 400, { error: "Invalid request." });
      const hash = await sha256Hex(raw);
      const { data: rows, error } = await sb
        .from("business_records")
        .select("id,business_id,payload")
        .eq("collection", TOKEN_COLLECTION)
        .eq("record_status", "active")
        .limit(2000);
      if (error) throw error;
      const now = Date.now();
      const match = (rows || []).find((r) => {
        const p = (r.payload || {}) as JsonObject;
        return p.token_hash === hash && p.token_type === "magic" && p.used !== true && new Date(p.expires_at).getTime() >= now;
      });
      if (!match) return reply(req, 401, { error: "This link is invalid or has expired." });
      const mp = (match.payload || {}) as JsonObject;
      const businessId = match.business_id;
      if (!(await moduleEnabled(sb, businessId, MODULE_KEY))) {
        return reply(req, 403, { error: "The customer portal is not enabled for this business." });
      }
      // Burn the magic token (single-use).
      await sb.from("business_records").update({
        record_status: "archived",
        updated_at: new Date().toISOString(),
        payload: { ...mp, used: true, used_at: new Date().toISOString() },
      }).eq("id", match.id);
      // Mint a session token.
      const sessionRaw = newToken();
      const sessionHash = await sha256Hex(sessionRaw);
      const actorId = await attributionUserId(sb, businessId);
      await sb.from("business_records").insert({
        business_id: businessId,
        collection: TOKEN_COLLECTION,
        record_key: `SESSION-${Date.now()}-${sessionHash.slice(0, 8)}`,
        record_status: "active",
        created_by: actorId,
        updated_by: actorId,
        payload: {
          "Token Type": "session",
          token_type: "session",
          token_hash: sessionHash,
          customer_key: String(mp.customer_key || ""),
          used: false,
          expires_at: new Date(Date.now() + SESSION_TOKEN_TTL_MS).toISOString(),
          "Business ID": businessId,
          "Created Time": new Date().toISOString(),
          "Record Version": 1,
        },
      });
      await writeProof(sb, businessId, "PORTAL_SESSION_CREATED", "Customer", String(mp.customer_key || ""), "OK", {});
      return reply(req, 200, { ok: true, sessionToken: sessionRaw });
    }

    // ---- Session-authenticated customer actions ----
    const sessionToken = clean(body.session_token || body.sessionToken, 200);
    const session = await validateSessionToken(sb, sessionToken);
    if (!session) return reply(req, 401, { error: "Your session has expired. Please sign in again." });
    if (!(await moduleEnabled(sb, session.businessId, MODULE_KEY))) {
      return reply(req, 403, { error: "The customer portal is not enabled for this business." });
    }

    // ---- approve-quote ----
    if (postAction === "approve-quote") {
      const quoteId = clean(body.quote_id || body.quoteId, 120);
      const tier = clean(body.tier, 40); // optional: Good/Better/Best tier name
      if (!quoteId) return reply(req, 400, { error: "Invalid request." });
      const { data: row, error } = await sb
        .from("business_records")
        .select("id,record_key,payload")
        .eq("business_id", session.businessId)
        .eq("collection", "quotes")
        .eq("record_key", quoteId)
        .eq("record_status", "active")
        .maybeSingle();
      if (error) throw error;
      if (!row) return reply(req, 404, { error: "Quote not found." });
      const q = (row.payload || {}) as JsonObject;
      if (clean(pick(q, "Customer ID", "customerId"), 120) !== session.customerKey) {
        return reply(req, 403, { error: "Quote not found." });
      }
      const status = clean(pick(q, "Status", "status"), 40).toUpperCase();
      if (!["PRESENTED", "SENT"].includes(status)) {
        return reply(req, 409, { error: "This quote can no longer be approved online. Please call us." });
      }
      const now = new Date().toISOString();
      const updated = {
        ...q,
        "Status": "Approved",
        "Customer Approved Time": now,
        "Approved Tier": tier || clean(pick(q, "Tier Mode", "tierMode"), 40),
        "Updated Time": now,
        "Record Version": numberValue(pick(q, "Record Version", "recordVersion")) + 1,
      };
      const { error: upErr } = await sb.from("business_records").update({
        payload: updated,
        updated_at: now,
      }).eq("id", row.id);
      if (upErr) throw upErr;
      const actorId = await attributionUserId(sb, session.businessId);
      await sb.from("business_records").insert({
        business_id: session.businessId,
        collection: APPROVAL_COLLECTION,
        record_key: `APPROVAL-${Date.now()}-${quoteId.slice(-6)}`,
        record_status: "active",
        created_by: actorId,
        updated_by: actorId,
        payload: {
          "Quote ID": quoteId,
          "Customer ID": session.customerKey,
          "Decision": "Approved",
          "Tier": tier || "",
          "Total": numberValue(pick(q, "Total", "total")),
          "Status": "New — owner converts to job",
          "Business ID": session.businessId,
          "Created Time": now,
          "Record Version": 1,
        },
      });
      await writeProof(sb, session.businessId, "PORTAL_QUOTE_APPROVED", "Quote", quoteId, "OK", { tier: tier || "" });
      return reply(req, 200, { ok: true, message: "Quote approved. We will contact you to schedule the work." });
    }

    // ---- decline-quote ----
    if (postAction === "decline-quote") {
      const quoteId = clean(body.quote_id || body.quoteId, 120);
      const reason = clean(body.reason, MAX.reason);
      if (!quoteId) return reply(req, 400, { error: "Invalid request." });
      const { data: row, error } = await sb
        .from("business_records")
        .select("id,record_key,payload")
        .eq("business_id", session.businessId)
        .eq("collection", "quotes")
        .eq("record_key", quoteId)
        .eq("record_status", "active")
        .maybeSingle();
      if (error) throw error;
      if (!row) return reply(req, 404, { error: "Quote not found." });
      const q = (row.payload || {}) as JsonObject;
      if (clean(pick(q, "Customer ID", "customerId"), 120) !== session.customerKey) {
        return reply(req, 403, { error: "Quote not found." });
      }
      const status = clean(pick(q, "Status", "status"), 40).toUpperCase();
      if (!["PRESENTED", "SENT"].includes(status)) {
        return reply(req, 409, { error: "This quote can no longer be declined online. Please call us." });
      }
      const now = new Date().toISOString();
      const { error: upErr } = await sb.from("business_records").update({
        payload: { ...q, "Status": "Declined", "Decline Reason": reason, "Customer Declined Time": now, "Updated Time": now },
        updated_at: now,
      }).eq("id", row.id);
      if (upErr) throw upErr;
      await writeProof(sb, session.businessId, "PORTAL_QUOTE_DECLINED", "Quote", quoteId, "OK", { reason: reason.slice(0, 200) });
      return reply(req, 200, { ok: true, message: "Thanks for letting us know." });
    }

    // ---- pay-invoice: record a payment intent for the office to complete ----
    if (postAction === "pay-invoice") {
      const invoiceId = clean(body.invoice_id || body.invoiceId, 120);
      const amount = numberValue(body.amount);
      if (!invoiceId || amount <= 0) return reply(req, 400, { error: "Invalid request." });
      const { data: row, error } = await sb
        .from("business_records")
        .select("id,record_key,payload")
        .eq("business_id", session.businessId)
        .eq("collection", "invoices")
        .eq("record_key", invoiceId)
        .eq("record_status", "active")
        .maybeSingle();
      if (error) throw error;
      if (!row) return reply(req, 404, { error: "Invoice not found." });
      const inv = (row.payload || {}) as JsonObject;
      if (clean(pick(inv, "Customer ID", "customerId"), 120) !== session.customerKey) {
        return reply(req, 403, { error: "Invoice not found." });
      }
      const balance = numberValue(pick(inv, "Balance", "balance"));
      if (balance <= 0) return reply(req, 409, { error: "This invoice has no balance due." });
      const charge = Math.min(amount, balance);
      const now = new Date().toISOString();
      const actorId = await attributionUserId(sb, session.businessId);
      await sb.from("business_records").insert({
        business_id: session.businessId,
        collection: PAYMENT_INTENT_COLLECTION,
        record_key: `PAYINTENT-${Date.now()}-${invoiceId.slice(-6)}`,
        record_status: "active",
        created_by: actorId,
        updated_by: actorId,
        payload: {
          "Invoice ID": invoiceId,
          "Invoice Number": clean(pick(inv, "Invoice Number", "invoiceNumber"), 60),
          "Customer ID": session.customerKey,
          "Amount": charge,
          "Status": "Pending — owner completes charge",
          "Source": "Customer portal",
          "Business ID": session.businessId,
          "Created Time": now,
          "Record Version": 1,
        },
      });
      await writeProof(sb, session.businessId, "PORTAL_PAYMENT_INTENT", "Invoice", invoiceId, "OK", { amount: charge });
      return reply(req, 200, {
        ok: true,
        message: "Payment request received. We will process it and send your receipt.",
        amount: charge,
      });
    }

    // ---- pay-invoice-checkout: hosted Stripe Checkout on the business's
    // own connected account. Only when the tenant enabled online payments
    // AND Stripe reports charges enabled; otherwise the customer keeps the
    // manual (intent) path above. ----
    if (postAction === "pay-invoice-checkout") {
      const invoiceId = clean(body.invoice_id || body.invoiceId, 120);
      if (!invoiceId) return reply(req, 400, { error: "Invalid request." });
      const payState = await onlinePaymentsState(sb, session.businessId);
      if (!payState.ready || !STRIPE_SECRET_KEY) {
        return reply(req, 409, { error: "Online payment isn't available right now. Please contact the office." });
      }
      const { data: row, error } = await sb
        .from("business_records")
        .select("id,record_key,payload")
        .eq("business_id", session.businessId)
        .eq("collection", "invoices")
        .eq("record_key", invoiceId)
        .eq("record_status", "active")
        .maybeSingle();
      if (error) throw error;
      if (!row) return reply(req, 404, { error: "Invoice not found." });
      const inv = (row.payload || {}) as JsonObject;
      if (clean(pick(inv, "Customer ID", "customerId"), 120) !== session.customerKey) {
        return reply(req, 403, { error: "Invoice not found." });
      }
      const balance = numberValue(pick(inv, "Balance", "balance"));
      if (balance <= 0) return reply(req, 409, { error: "This invoice has no balance due." });
      const origin = requestOrigin(req) || "https://highway38solutions.com";
      const portalBase = origin.includes("github.io")
        ? `${origin}/highway-38-solutions/commercial-app/customer-portal.html`
        : `${origin}/commercial-app/customer-portal.html`;
      const params = new URLSearchParams();
      params.set("mode", "payment");
      params.append("payment_method_types[]", "card");
      params.append("payment_method_types[]", "us_bank_account");
      params.set("line_items[0][quantity]", "1");
      params.set("line_items[0][price_data][currency]", "usd");
      params.set("line_items[0][price_data][unit_amount]", String(Math.round(balance * 100)));
      params.set(
        "line_items[0][price_data][product_data][name]",
        `Invoice ${clean(pick(inv, "Invoice Number", "invoiceNumber"), 60) || invoiceId}`,
      );
      params.set("metadata[business_id]", session.businessId);
      params.set("metadata[invoice_id]", invoiceId);
      params.set("payment_intent_data[metadata][business_id]", session.businessId);
      params.set("payment_intent_data[metadata][invoice_id]", invoiceId);
      const customer = await customerById(sb, session.businessId, session.customerKey).catch(() => null);
      const custEmail = clean(pick((customer?.payload || {}) as JsonObject, "Email", "email"), 120);
      if (custEmail) params.set("payment_intent_data[receipt_email]", custEmail);
      params.set("success_url", `${portalBase}?business=${encodeURIComponent(session.businessId)}&paid=1`);
      params.set("cancel_url", `${portalBase}?business=${encodeURIComponent(session.businessId)}&paid=0`);
      const checkout = await stripeCreateCheckout(payState.accountId, params);
      const checkoutUrl = String(checkout.url || "");
      if (!checkoutUrl) return reply(req, 502, { error: "Online payment could not be started. Please contact the office." });
      await sb
        .from("business_records")
        .update({
          payload: {
            ...inv,
            "Online Payment Status": "Link Open",
            "Stripe Checkout Session": String(checkout.id || ""),
            "Online Payment Link": checkoutUrl,
            "Online Payment Updated": new Date().toISOString(),
            "Updated Time": new Date().toISOString(),
            "Record Version": Math.max(1, numberValue(inv["Record Version"]) || 1) + 1,
          },
        })
        .eq("business_id", session.businessId)
        .eq("collection", "invoices")
        .eq("record_key", invoiceId);
      await writeProof(sb, session.businessId, "PORTAL_CHECKOUT_LINK", "Invoice", invoiceId, "OK", { amount: balance });
      return reply(req, 200, { ok: true, url: checkoutUrl });
    }

    // ---- request-service (session or portal-gated public) ----
    if (postAction === "request-service") {
      const portalOn = await moduleEnabled(sb, session.businessId, MODULE_KEY);
      const bookingOn = await moduleEnabled(sb, session.businessId, BOOKING_MODULE_KEY);
      if (!portalOn && !bookingOn) {
        return reply(req, 403, { error: "Online service requests are not enabled for this business." });
      }
      const serviceName = clean(body.service, MAX.service);
      const date = clean(body.date, MAX.date);
      const time = clean(body.time, MAX.time);
      const notes = clean(body.notes, MAX.notes);
      if (!serviceName) return reply(req, 400, { error: "Tell us what you need." });
      const customer = await customerById(sb, session.businessId, session.customerKey);
      const now = new Date().toISOString();
      const actorId = await attributionUserId(sb, session.businessId);
      const id = `BOOK-${now.slice(0, 10).replace(/-/g, "")}-${crypto.getRandomValues(new Uint8Array(3)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "").toUpperCase()}`;
      const { error: insErr } = await sb.from("business_records").insert({
        business_id: session.businessId,
        collection: "booking_requests",
        record_key: id,
        record_status: "active",
        created_by: actorId,
        updated_by: actorId,
        payload: {
          "Booking ID": id,
          "Customer ID": session.customerKey,
          "Customer Name": clean(pick(customer?.payload || {}, "Customer Name", "name"), 120),
          "Phone": clean(pick(customer?.payload || {}, "Phone", "phone"), 40),
          "Email": clean(pick(customer?.payload || {}, "Email", "email"), 120),
          "Service": serviceName,
          "Preferred Date": date,
          "Preferred Time": time,
          "Notes": notes,
          "Status": "New — needs owner review",
          "Source": "Customer portal",
          "Recorded By": "Customer — self-service portal",
          "Business ID": session.businessId,
          "Created Time": now,
          "Record Version": 1,
        },
      });
      if (insErr) throw insErr;
      await writeProof(sb, session.businessId, "PORTAL_SERVICE_REQUESTED", "Booking", id, "OK", { service: serviceName });
      return reply(req, 200, { ok: true, bookingId: id, message: "Request received. We will call you to confirm." });
    }

    return reply(req, 400, { error: "Unknown action." });
  } catch (e) {
    // Never leak internals (table names, RLS details, stack traces) to the client.
    console.error("[h38-customer-portal] action failed:", e);
    const msg = e instanceof Error ? e.message : "";
    // Owner-auth failures are safe to surface; everything else stays generic.
    if (/Owner or Administrator|not an active member|Auth session|Enable the customer portal|Customer not found/.test(msg)) {
      return reply(req, 403, { error: msg });
    }
    return reply(req, 500, { error: "Something went wrong. Please call us directly." });
  }
}

if (import.meta.main) {
  Deno.serve((req: Request) => handlePortalRequest(req));
}
