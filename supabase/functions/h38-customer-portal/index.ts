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
const BUSINESS_HOURS_MODULE_KEY = "business_hours";
const ONLINE_PAYMENTS_MODULE_KEY = "online_payments";
const SIGNED_DEPOSIT_MODULE_KEY = "signed_deposit_acceptance";
const DEPOSIT_INVOICE_SOURCE = "Deposit on signed quote acceptance";
const CHANGE_ORDER_INVOICE_SOURCE = "Change order signed approval";
const DEFAULT_DEPOSIT_PERCENT = 50;
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

// Signed quote acceptance + deposit settings for a tenant. The enforcement
// source is the business_module_settings row (module_key =
// "signed_deposit_acceptance"): missing row or enabled !== true means OFF —
// the default for every tenant. The business's default deposit percent
// lives in the row's config.depositPercent (50 when never set); a quote's
// own "Deposit Percent" overrides it at signing time.
async function signedDepositSettings(
  service: ReturnType<typeof serviceClient>,
  businessId: string,
): Promise<{ enabled: boolean; depositPercent: number }> {
  const { data, error } = await service
    .from("business_module_settings")
    .select("enabled, config")
    .eq("business_id", businessId)
    .eq("module_key", SIGNED_DEPOSIT_MODULE_KEY)
    .maybeSingle();
  if (error) throw error;
  const config = ((data?.config || {}) as JsonObject);
  const rawPct = config.depositPercent;
  const rawNum = Number(rawPct);
  const depositPercent = rawPct !== undefined && rawPct !== null && Number.isFinite(rawNum)
    ? Math.min(100, Math.max(0, rawNum))
    : DEFAULT_DEPOSIT_PERCENT;
  return { enabled: data?.enabled === true, depositPercent };
}

// Per-quote override wins; otherwise the business default applies.
function quoteDepositPercent(q: JsonObject, businessDefault: number): number {
  const rawStr = String(pick(q, "Deposit Percent", "depositPercent") ?? "").trim();
  if (rawStr !== "") {
    const n = Number(rawStr);
    if (Number.isFinite(n)) return Math.min(100, Math.max(0, n));
  }
  return businessDefault;
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

// ---- Confirmed-slot booking ------------------------------------------------
// A business can switch portal booking from request-style (the customer
// asks, the owner calls back — the long-standing default and still the
// fallback) to confirmed slots: the customer picks a real open slot
// inside the business's own hours and is booked on the spot. Bookable
// windows come from the SAME business_hours settings the Office edits
// (business_module_settings row "business_hours"; defaults Mon–Fri
// 08:00–17:00 when unset). Mode + slot length live on the
// "online_booking" module row's config: { mode: "request"|"confirmed",
// slotMinutes: 30|60|90|120 }. A confirmed booking writes BOTH a
// booking_requests record (Status "Confirmed — booked online") and a
// scheduleEvents record, so it shows on the Office schedule like any
// other job visit. Slots already covered by a schedule event or another
// confirmed booking are not offered, and book-slot re-checks at write
// time so two customers cannot take the same slot.

type BizDay = { closed: boolean; open: string; close: string };
type BizHours = { timeZone: string; days: Record<string, BizDay> };
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function hhmmToMin(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins >= 0 && mins <= 1440 ? mins : null;
}

function defaultBizHours(tz: string): BizHours {
  const days: Record<string, BizDay> = {};
  for (const k of DAY_KEYS) {
    const weekend = k === "sat" || k === "sun";
    days[k] = { closed: weekend, open: "08:00", close: "17:00" };
  }
  return { timeZone: tz || "America/Chicago", days };
}

async function loadBizHours(
  sb: ReturnType<typeof serviceClient>,
  businessId: string,
): Promise<BizHours> {
  const { data: biz } = await sb
    .from("businesses")
    .select("timezone")
    .eq("id", businessId)
    .maybeSingle();
  const fallbackTz = clean((biz as JsonObject | null)?.timezone, 60) || "America/Chicago";
  const { data } = await sb
    .from("business_module_settings")
    .select("config")
    .eq("business_id", businessId)
    .eq("module_key", BUSINESS_HOURS_MODULE_KEY)
    .maybeSingle();
  const cfg = (data?.config || {}) as JsonObject;
  const out = defaultBizHours(clean(cfg.timeZone, 60) || fallbackTz);
  const srcDays = (cfg.days || {}) as Record<string, JsonObject>;
  for (const k of DAY_KEYS) {
    const d = srcDays[k];
    if (!d || typeof d !== "object") continue;
    const open = clean(d.open, 10);
    const close = clean(d.close, 10);
    out.days[k] = {
      closed: d.closed === true,
      open: hhmmToMin(open) !== null ? open : "08:00",
      close: hhmmToMin(close) !== null ? close : "17:00",
    };
  }
  return out;
}

async function bookingSettings(
  sb: ReturnType<typeof serviceClient>,
  businessId: string,
): Promise<{ enabled: boolean; mode: string; slotMinutes: number }> {
  const { data } = await sb
    .from("business_module_settings")
    .select("enabled, config")
    .eq("business_id", businessId)
    .eq("module_key", BOOKING_MODULE_KEY)
    .maybeSingle();
  const cfg = (data?.config || {}) as JsonObject;
  const slot = Number(cfg.slotMinutes);
  return {
    enabled: data?.enabled === true,
    mode: cfg.mode === "confirmed" ? "confirmed" : "request",
    slotMinutes: [30, 60, 90, 120].includes(slot) ? slot : 60,
  };
}

// Wall-clock time in a timezone -> the UTC instant. Two-pass: guess UTC,
// read back the wall parts in the zone, shift by the difference.
function wallToInstant(
  tz: string,
  y: number,
  mo: number,
  d: number,
  hh: number,
  mm: number,
): Date {
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(guess));
  const p: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  const readBack = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second || 0);
  return new Date(guess + (guess - readBack));
}

function slotLabel(tz: string, instant: Date): string {
  // ICU builds emit a narrow no-break space (U+202F) before AM/PM;
  // normalize to a plain space so labels read and compare cleanly.
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(instant).replace(/ /g, " ");
}

// A stored event time -> an instant. ISO-with-zone parses directly;
// naive "YYYY-MM-DDTHH:MM" values are wall times in the business zone
// (the Office stores them that way from its datetime-local form).
function eventInstant(tz: string, raw: string): number | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s);
  if (!m) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }
  return wallToInstant(tz, Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])).getTime();
}

type Slot = { start: string; end: string; label: string; available: boolean };

async function computeSlots(
  sb: ReturnType<typeof serviceClient>,
  businessId: string,
  dateStr: string,
): Promise<{ timeZone: string; slots: Slot[] }> {
  const hours = await loadBizHours(sb, businessId);
  const settings = await bookingSettings(sb, businessId);
  const tz = hours.timeZone;
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!dm) return { timeZone: tz, slots: [] };
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  const day = hours.days[DAY_KEYS[dow]];
  if (!day || day.closed) return { timeZone: tz, slots: [] };
  const openMin = hhmmToMin(day.open) ?? 480;
  const closeMin = hhmmToMin(day.close) ?? 1020;

  const busy: Array<[number, number]> = [];
  const { data: evRows } = await sb
    .from("business_records")
    .select("payload")
    .eq("business_id", businessId)
    .eq("collection", "scheduleEvents")
    .eq("record_status", "active")
    .limit(2000);
  for (const r of evRows || []) {
    const p = (r.payload || {}) as JsonObject;
    const s = eventInstant(tz, String(p["Start Time"] ?? p.startTime ?? ""));
    if (s === null) continue;
    const eRaw = String(p["End Time"] ?? p.endTime ?? "");
    const e = eRaw ? eventInstant(tz, eRaw) : null;
    busy.push([s, e !== null && e > s ? e : s + settings.slotMinutes * 60000]);
  }
  const { data: bkRows } = await sb
    .from("business_records")
    .select("payload")
    .eq("business_id", businessId)
    .eq("collection", "booking_requests")
    .eq("record_status", "active")
    .limit(500);
  for (const r of bkRows || []) {
    const p = (r.payload || {}) as JsonObject;
    if (!/^Confirmed/i.test(String(p["Status"] || ""))) continue;
    const s = eventInstant(tz, String(p["Slot Start"] || ""));
    const e = eventInstant(tz, String(p["Slot End"] || ""));
    if (s !== null) busy.push([s, e !== null && e > s ? e : s + settings.slotMinutes * 60000]);
  }

  const now = Date.now();
  const slots: Slot[] = [];
  for (let m = openMin; m + settings.slotMinutes <= closeMin; m += settings.slotMinutes) {
    const start = wallToInstant(tz, y, mo, d, Math.floor(m / 60), m % 60);
    const end = new Date(start.getTime() + settings.slotMinutes * 60000);
    const taken = busy.some(([bs, be]) => start.getTime() < be && end.getTime() > bs);
    slots.push({
      start: start.toISOString(),
      end: end.toISOString(),
      label: slotLabel(tz, start),
      available: start.getTime() > now && !taken,
    });
  }
  return { timeZone: tz, slots };
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

function round2(v: number): number { return Math.round(v * 100) / 100; }
function lineTotalOf(line: JsonObject): number {
  return numberValue(pick(line, "quantity", "Quantity")) * numberValue(pick(line, "unitPrice", "Unit Price", "rate"));
}
function tierTotalOf(tier: JsonObject): number {
  const items = Array.isArray(tier?.items) ? tier.items : [];
  return round2(items.reduce((sum: number, line: JsonObject) => sum + lineTotalOf(line), 0));
}
const TIER_IDS = ["good", "better", "best"];
function quoteTiersOf(q: JsonObject): JsonObject[] {
  return Array.isArray(q.tiers) ? q.tiers : [];
}
function isTieredQuotePayload(q: JsonObject): boolean {
  return clean(pick(q, "Tier Mode", "tierMode"), 40) === "Good-Better-Best" && quoteTiersOf(q).length === 3;
}
function quoteRevisionOf(q: JsonObject): number {
  return Math.max(1, Math.trunc(numberValue(pick(q, "Locked Revision", "lockedRevision")) || numberValue(pick(q, "Revision", "revision")) || 1));
}
// §3.1 acceptance snapshot: normalize the canonical quote to the chosen option.
function applyAcceptedOption(q: JsonObject, optionIndex: number, now: string): { updated: JsonObject; tier: JsonObject; chosenTotal: number } {
  const tiers = quoteTiersOf(q);
  const tier = tiers[optionIndex];
  const chosenTotal = tierTotalOf(tier);
  const tax = numberValue(pick(q, "Tax", "tax"));
  const updated: JsonObject = {
    ...q,
    lines: JSON.parse(JSON.stringify(Array.isArray(tier.items) ? tier.items : [])),
    "Subtotal": chosenTotal,
    "Total": round2(chosenTotal + tax),
    "Accepted Option ID": clean(pick(tier, "id"), 20) || TIER_IDS[optionIndex],
    "Accepted Option Index": optionIndex,
    "Accepted Option Name": clean(pick(tier, "name"), 40),
    "Accepted Option Total": chosenTotal,
    "Accepted At Revision": pick(q, "Locked Revision", "lockedRevision") || pick(q, "Revision", "revision"),
    "Customer Decision": "Accepted",
    "Status": "Approved",
    "Customer Approved Time": now,
    "Updated Time": now,
    "Record Version": numberValue(pick(q, "Record Version", "recordVersion")) + 1,
  };
  delete updated.__localPending;
  return { updated, tier, chosenTotal };
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

// Minted portal links always use the canonical domain. The caller's Origin
// is never used: server-side calls carry none, and owner sessions on the
// GitHub Pages mirror used to mint mirror links. Tokens are validated
// server-side by SHA-256 hash, so links minted before this change keep
// working. H38_PORTAL_BASE_URL overrides only for a deliberate rebrand.
const PORTAL_BASE_URL = Deno.env.get("H38_PORTAL_BASE_URL") || "https://highway38solutions.com/commercial-app/customer-portal.html";

function portalUrl(_request: Request, businessId: string, token: string): string {
  return `${PORTAL_BASE_URL}?business=${encodeURIComponent(businessId)}&token=${encodeURIComponent(token)}`;
}

// The business's own services, from the `services` collection the Office
// maintains (onboarding "What you offer and pricing" and Settings write these
// rows). The Book form offers exactly these names so a customer picks the
// business's real service — e.g. a snow business's "Snow Plowing" — instead of
// a generic list. Inactive/archived rows are excluded; an empty result means
// the client falls back to its generic list.
async function businessServices(
  service: ReturnType<typeof serviceClient>,
  businessId: string,
): Promise<string[]> {
  const { data } = await service
    .from("business_records")
    .select("payload")
    .eq("business_id", businessId)
    .eq("collection", "services")
    .eq("record_status", "active")
    .order("updated_at", { ascending: true })
    .limit(100);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of data || []) {
    const p = (row.payload || {}) as JsonObject;
    const status = clean(pick(p, "Status", "status"), 40);
    if (/inactive|archiv|delet|disabled/i.test(status)) continue;
    const name = clean(pick(p, "Service Name", "serviceName", "Name", "name"), 120);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= 60) break;
  }
  return names;
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

  const signedDeposit = await signedDepositSettings(service, businessId);

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
        revision: numberValue(pick(p, "Locked Revision", "lockedRevision")) || numberValue(pick(p, "Revision", "revision")),
        tierMode: clean(pick(p, "Tier Mode", "tierMode"), 40),
        scope: clean(pick(p, "Scope", "scope"), 2000),
        tiers: tiers.slice(0, 3).map((t: JsonObject, ti: number) => ({
          id: clean(pick(t, "id"), 20) || TIER_IDS[ti] || "",
          name: clean(pick(t, "name"), 40),
          description: clean(pick(t, "description"), 500),
          total: numberValue(pick(t, "total")),
          items: (Array.isArray(t.items) ? t.items : []).slice(0, 50).map((l: JsonObject) => ({
            description: clean(pick(l, "description", "Description"), 160),
            quantity: numberValue(pick(l, "quantity", "Quantity")),
            unit: clean(pick(l, "unit", "Unit"), 30),
            unitPrice: numberValue(pick(l, "unitPrice", "Unit Price", "rate")),
          })),
        })),
        lines: (Array.isArray(p.lines) ? p.lines : []).slice(0, 50).map((l: JsonObject) => ({
          description: clean(pick(l, "description", "Description"), 160),
          quantity: numberValue(pick(l, "quantity", "Quantity")),
          unitPrice: numberValue(pick(l, "unitPrice", "Unit Price", "rate")),
        })),
        signedBy: clean(pick(p, "Signed By Name", "signedByName"), 80),
        signedAt: clean(pick(p, "Signed At", "signedAt"), 40),
        signedRevision: numberValue(pick(p, "Signed Revision", "signedRevision")),
        depositPercent: quoteDepositPercent(p, signedDeposit.depositPercent),
        depositAmount: numberValue(pick(p, "Deposit Amount", "depositAmount")),
        depositInvoiceId: clean(pick(p, "Deposit Invoice ID", "depositInvoiceId"), 120),
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

  // Change orders on this customer's jobs (Wave 3 tail #6): the customer
  // sees priced change orders the owner sent to the portal and signs them
  // with the same typed-name rails as quote acceptance.
  const customerJobIds = new Set(jobs.map((j) => j.id));
  const { data: changeOrderRows } = await service
    .from("business_records")
    .select("record_key,payload,updated_at")
    .eq("business_id", businessId)
    .eq("collection", "changeOrders")
    .eq("record_status", "active")
    .order("updated_at", { ascending: false })
    .limit(100);
  const changeOrders = (changeOrderRows || [])
    .filter((r) => {
      const p = (r.payload || {}) as JsonObject;
      const jobId = clean(pick(p, "Job ID", "jobId"), 120);
      const coCustomer = clean(pick(p, "Customer ID", "customerId"), 120);
      return (jobId && customerJobIds.has(jobId)) || coCustomer === customerKey;
    })
    .map((r) => {
      const p = (r.payload || {}) as JsonObject;
      return {
        id: r.record_key,
        jobId: clean(pick(p, "Job ID", "jobId"), 120),
        title: clean(pick(p, "Title", "title"), 160),
        description: clean(pick(p, "Description", "description"), 1000),
        amount: numberValue(pick(p, "Amount", "amount")),
        status: clean(pick(p, "Status", "status"), 60),
        revision: Math.max(1, Math.trunc(numberValue(pick(p, "Record Version", "recordVersion")) || 1)),
        signedBy: clean(pick(p, "Signed By Name", "signedByName"), 80),
        signedAt: clean(pick(p, "Signed At", "signedAt"), 40),
        invoiceId: clean(pick(p, "Invoice ID", "invoiceId"), 120),
      };
    });

  // Job photos the owner shared with the customer (Wave 3 tail #8): only
  // photos on THIS customer's jobs whose Access Classification marks them
  // customer-visible, returned as short-lived signed URLs in capture-time
  // order — the client-visible end of the job photo timeline. Internal
  // photos and other customers' photos never leave the server.
  const { data: docRows } = await service
    .from("business_records")
    .select("record_key,payload,updated_at")
    .eq("business_id", businessId)
    .eq("collection", "documents")
    .eq("record_status", "active")
    .order("updated_at", { ascending: false })
    .limit(200);
  const jobPhotos: JsonObject[] = [];
  for (const r of docRows || []) {
    const p = (r.payload || {}) as JsonObject;
    const classification = clean(pick(p, "Access Classification", "accessClassification"), 60);
    if (!/CUSTOMER AVAILABLE|CUSTOMER RELEASED|SHARED/i.test(classification)) continue;
    const mime = clean(pick(p, "Mime Type", "mimeType"), 60).toLowerCase();
    const fileName = clean(pick(p, "File Name", "fileName"), 160);
    if (!mime.startsWith("image/") && !/\.(?:jpe?g|png|webp|gif|heic|heif)$/i.test(fileName)) continue;
    const jobIdField = clean(pick(p, "Job ID", "jobId"), 120);
    const sourceId = clean(pick(p, "Source ID", "sourceId"), 120);
    const photoJobId = jobIdField && customerJobIds.has(jobIdField)
      ? jobIdField
      : sourceId && customerJobIds.has(sourceId)
      ? sourceId
      : "";
    if (!photoJobId) continue;
    const path = clean(pick(p, "Storage Path", "storagePath"), 400);
    if (!path) continue;
    const bucket = clean(pick(p, "Storage Bucket", "storageBucket"), 80) || "business-office-files";
    let url = "";
    try {
      const signed = await service.storage.from(bucket).createSignedUrl(path, 3600);
      url = signed.data?.signedUrl || "";
    } catch {
      url = "";
    }
    if (!url) continue;
    jobPhotos.push({
      id: r.record_key,
      jobId: photoJobId,
      jobTitle: jobs.find((j) => j.id === photoJobId)?.title || "",
      fileName,
      capturedAt: clean(pick(p, "Capture Time", "captureTime", "Created Time", "createdAt"), 40),
      url,
    });
  }
  jobPhotos.sort((a, b) =>
    String(a.capturedAt || "").localeCompare(String(b.capturedAt || ""))
  );

  const paymentsState = await onlinePaymentsState(service, businessId);
  const bookingCfg = await bookingSettings(service, businessId);
  const services = await businessServices(service, businessId);

  return {
    business: { id: businessId, name: business?.display_name || "Highway 38" },
    payments: { onlineEnabled: paymentsState.ready },
    booking: { enabled: bookingCfg.enabled, mode: bookingCfg.mode, slotMinutes: bookingCfg.slotMinutes },
    signedDeposit: { enabled: signedDeposit.enabled, depositPercent: signedDeposit.depositPercent },
    services,
    customer: {
      name: clean(pick(customer, "Customer Name", "name"), 120),
      email: clean(pick(customer, "Email", "email"), 120),
      phone: clean(pick(customer, "Phone", "phone"), 40),
    },
    quotes,
    invoices,
    appointments,
    jobs,
    changeOrders,
    jobPhotos,
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
      const tierIndexRaw = body.tier_index ?? body.tierIndex;
      const tierIndex = tierIndexRaw === undefined || tierIndexRaw === null || tierIndexRaw === "" ? null : Math.trunc(numberValue(tierIndexRaw));
      const expectedRevisionRaw = body.expected_revision ?? body.expectedRevision;
      const expectedRevision = expectedRevisionRaw === undefined || expectedRevisionRaw === null || expectedRevisionRaw === "" ? null : Math.trunc(numberValue(expectedRevisionRaw));
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
      const currentRevision = quoteRevisionOf(q);
      if (expectedRevision === null || expectedRevision !== currentRevision) {
        return reply(req, 409, { error: "This quote changed since you opened it. Please reload and review the current version before approving." });
      }
      const now = new Date().toISOString();
      const tiered = isTieredQuotePayload(q);
      let updated: JsonObject;
      let approvalTierId = "";
      let approvalTierName = "";
      let approvalTotal = numberValue(pick(q, "Total", "total"));
      if (tiered) {
        if (tierIndex === null || tierIndex < 0 || tierIndex > 2) {
          return reply(req, 400, { error: "Choose which option you are approving." });
        }
        const tiers = quoteTiersOf(q);
        const tier = tiers[tierIndex];
        if (!tier || !Array.isArray(tier.items) || !tier.items.length) {
          return reply(req, 400, { error: "That option has no line items and cannot be approved." });
        }
        const applied = applyAcceptedOption(q, tierIndex, now);
        updated = applied.updated;
        approvalTierId = clean(pick(applied.tier, "id"), 20) || TIER_IDS[tierIndex];
        approvalTierName = clean(pick(applied.tier, "name"), 40);
        approvalTotal = applied.chosenTotal;
      } else {
        updated = {
          ...q,
          "Status": "Approved",
          "Customer Approved Time": now,
          "Customer Decision": "Accepted",
          "Updated Time": now,
          "Record Version": numberValue(pick(q, "Record Version", "recordVersion")) + 1,
        };
        delete updated.__localPending;
      }
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
          "Tier": approvalTierId,
          "Tier Name": approvalTierName,
          "Total": approvalTotal,
          "Status": "New — owner converts to job",
          "Business ID": session.businessId,
          "Created Time": now,
          "Record Version": 1,
        },
      });
      await writeProof(sb, session.businessId, "PORTAL_QUOTE_APPROVED", "Quote", quoteId, "OK", { tier: approvalTierName, tierId: approvalTierId, chosenTotal: approvalTotal });
      return reply(req, 200, { ok: true, message: "Quote approved. We will contact you to schedule the work." });
    }

    // ---- sign-quote: typed-name signature acceptance + automatic deposit
    // invoice. Runs ONLY when the tenant turned on signed deposit
    // acceptance in Owner Controls (business_module_settings row
    // "signed_deposit_acceptance", enabled = true). Missing row or
    // enabled !== true => 403 — the feature is OFF by default for every
    // tenant and the plain approve-quote flow above stays the only path.
    // The signature (typed name + timestamp) is stored on the quote tied
    // to the EXACT revision signed (expected_revision must match, same
    // guard as approve-quote). On signing, exactly ONE deposit invoice is
    // created for that quote revision: the dedupe lookup below reuses an
    // existing one, and a signed quote leaves PRESENTED/SENT status, so
    // retries and re-renders can never mint a second. The deposit percent
    // is the quote's own "Deposit Percent" when set, otherwise the
    // business default from the setting's config (50 when never set).
    // The deposit invoice is a plain Office invoice record (Draft, never
    // sent by this action); the office records the deposit against it by
    // hand — Venmo, Cash App, check or cash — through the normal payment
    // rails. Nothing is emailed or texted to the customer here, and no
    // online checkout of any kind is created. ----
    if (postAction === "sign-quote") {
      const settings = await signedDepositSettings(sb, session.businessId);
      if (!settings.enabled) {
        return reply(req, 403, { error: "Signed acceptance isn't turned on for this business. Please call us to accept this quote." });
      }
      const quoteId = clean(body.quote_id || body.quoteId, 120);
      const signerName = clean(body.signer_name || body.signerName, MAX.name);
      const tierIndexRaw = body.tier_index ?? body.tierIndex;
      const tierIndex = tierIndexRaw === undefined || tierIndexRaw === null || tierIndexRaw === "" ? null : Math.trunc(numberValue(tierIndexRaw));
      const expectedRevisionRaw = body.expected_revision ?? body.expectedRevision;
      const expectedRevision = expectedRevisionRaw === undefined || expectedRevisionRaw === null || expectedRevisionRaw === "" ? null : Math.trunc(numberValue(expectedRevisionRaw));
      if (!quoteId) return reply(req, 400, { error: "Invalid request." });
      if (signerName.length < 2) return reply(req, 400, { error: "Type your full name to sign." });
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
        return reply(req, 409, { error: "This quote can no longer be signed online. Please call us." });
      }
      const currentRevision = quoteRevisionOf(q);
      if (expectedRevision === null || expectedRevision !== currentRevision) {
        return reply(req, 409, { error: "This quote changed since you opened it. Please reload and review the current version before signing." });
      }
      const now = new Date().toISOString();
      const tiered = isTieredQuotePayload(q);
      let updated: JsonObject;
      let approvalTierId = "";
      let approvalTierName = "";
      if (tiered) {
        if (tierIndex === null || tierIndex < 0 || tierIndex > 2) {
          return reply(req, 400, { error: "Choose which option you are signing for." });
        }
        const tiers = quoteTiersOf(q);
        const tier = tiers[tierIndex];
        if (!tier || !Array.isArray(tier.items) || !tier.items.length) {
          return reply(req, 400, { error: "That option has no line items and cannot be signed for." });
        }
        const applied = applyAcceptedOption(q, tierIndex, now);
        updated = applied.updated;
        approvalTierId = clean(pick(applied.tier, "id"), 20) || TIER_IDS[tierIndex];
        approvalTierName = clean(pick(applied.tier, "name"), 40);
      } else {
        updated = {
          ...q,
          "Status": "Approved",
          "Customer Approved Time": now,
          "Customer Decision": "Accepted",
          "Updated Time": now,
          "Record Version": numberValue(pick(q, "Record Version", "recordVersion")) + 1,
        };
        delete updated.__localPending;
      }
      const acceptedTotal = numberValue(pick(updated, "Total", "total"));
      const pct = quoteDepositPercent(q, settings.depositPercent);
      const depositAmount = round2(acceptedTotal * pct / 100);
      const actorId = await attributionUserId(sb, session.businessId);
      // Dedupe: an existing deposit invoice for this exact quote revision
      // is reused, never duplicated (covers a retry after the invoice was
      // created but the quote write failed, and any double submit).
      let depositInvoiceId = "";
      if (depositAmount > 0) {
        const { data: invRows, error: invErr } = await sb
          .from("business_records")
          .select("record_key,payload")
          .eq("business_id", session.businessId)
          .eq("collection", "invoices")
          .eq("record_status", "active")
          .limit(500);
        if (invErr) throw invErr;
        const found = (invRows || []).find((r) => {
          const p = (r.payload || {}) as JsonObject;
          return clean(pick(p, "Quote ID", "quoteId"), 120) === quoteId
            && numberValue(pick(p, "Deposit For Revision", "depositForRevision")) === currentRevision
            && clean(pick(p, "Source", "source"), 80) === DEPOSIT_INVOICE_SOURCE
            && !/void/i.test(clean(pick(p, "Status", "status"), 40));
        });
        if (found) depositInvoiceId = found.record_key;
      }
      if (depositAmount > 0 && !depositInvoiceId) {
        depositInvoiceId = `INVOICE-${crypto.randomUUID().toUpperCase()}`;
        const quoteNumber = clean(pick(q, "Quote Number", "quoteNumber"), 60);
        const { error: insErr } = await sb.from("business_records").insert({
          business_id: session.businessId,
          collection: "invoices",
          record_key: depositInvoiceId,
          record_status: "active",
          created_by: actorId,
          updated_by: actorId,
          payload: {
            "Invoice ID": depositInvoiceId,
            "Invoice Number": `LOCAL-${Date.now()}`,
            "Business ID": session.businessId,
            "Customer ID": session.customerKey,
            "Quote ID": quoteId,
            "Source": DEPOSIT_INVOICE_SOURCE,
            "Status": "Draft",
            "Send Allowed": "No",
            "Delivery Status": "Not Sent",
            "Total": depositAmount,
            "Subtotal": depositAmount,
            "Tax": 0,
            "Balance": depositAmount,
            "Due Date": "",
            "lines": [{
              description: `Deposit — ${pct}% of Quote ${quoteNumber || quoteId} (signed acceptance)`,
              quantity: 1,
              unit: "each",
              unitPrice: depositAmount,
            }],
            "Deposit Percent": pct,
            "Deposit For Quote": quoteId,
            "Deposit For Revision": currentRevision,
            "Signed By Name": signerName,
            "Signed At": now,
            "Created Time": now,
            "Updated Time": now,
            "Record Version": 1,
          },
        });
        if (insErr) throw insErr;
      }
      updated["Customer Decision"] = "Accepted — signed";
      updated["Signed By Name"] = signerName;
      updated["Signed At"] = now;
      updated["Signature Type"] = "Typed name";
      updated["Signed Revision"] = currentRevision;
      updated["Deposit Percent"] = pct;
      updated["Deposit Amount"] = depositAmount;
      updated["Deposit Invoice ID"] = depositInvoiceId;
      updated["Deposit Required"] = depositAmount > 0 ? "Yes" : "No";
      const { error: upErr } = await sb.from("business_records").update({
        payload: updated,
        updated_at: now,
      }).eq("id", row.id);
      if (upErr) throw upErr;
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
          "Decision": "Approved — signed",
          "Signed By Name": signerName,
          "Signed At": now,
          "Signed Revision": currentRevision,
          "Tier": approvalTierId,
          "Tier Name": approvalTierName,
          "Total": acceptedTotal,
          "Deposit Percent": pct,
          "Deposit Amount": depositAmount,
          "Deposit Invoice ID": depositInvoiceId,
          "Status": "New — owner converts to job",
          "Business ID": session.businessId,
          "Created Time": now,
          "Record Version": 1,
        },
      });
      await writeProof(sb, session.businessId, "PORTAL_QUOTE_SIGNED", "Quote", quoteId, "OK", { tier: approvalTierName, tierId: approvalTierId, acceptedTotal, signerName, signedRevision: currentRevision, depositPercent: pct, depositAmount, depositInvoiceId });
      return reply(req, 200, {
        ok: true,
        message: depositAmount > 0
          ? `Quote signed and accepted. A deposit invoice for $${depositAmount.toFixed(2)} was created — we will contact you about the deposit and scheduling.`
          : "Quote signed and accepted. We will contact you to schedule the work.",
        deposit: { invoiceId: depositInvoiceId, amount: depositAmount, percent: pct },
      });
    }

    // ---- sign-change-order (Wave 3 tail #6) ----
    // Same signed-acceptance rails as sign-quote, gated on the same
    // signed_deposit_acceptance switch: typed-name signature + timestamp
    // stored on the exact change-order version the customer reviewed
    // (Record Version must match, so a priced change after they opened it
    // blocks signing). On signing, the priced delta flows to exactly ONE
    // invoice linked to the job (deduped on Change Order ID + revision,
    // same pattern as the deposit invoice) — a Draft the office sends and
    // collects through the normal rails. No money moves here.
    if (postAction === "sign-change-order") {
      const settings = await signedDepositSettings(sb, session.businessId);
      if (!settings.enabled) {
        return reply(req, 403, { error: "Signed approvals aren't turned on for this business. Please call us to approve this change." });
      }
      const coId = clean(body.change_order_id || body.changeOrderId, 120);
      const signerName = clean(body.signer_name || body.signerName, MAX.name);
      const expectedRevisionRaw = body.expected_revision ?? body.expectedRevision;
      const expectedRevision = expectedRevisionRaw === undefined || expectedRevisionRaw === null || expectedRevisionRaw === "" ? null : Math.trunc(numberValue(expectedRevisionRaw));
      if (!coId) return reply(req, 400, { error: "Invalid request." });
      if (signerName.length < 2) return reply(req, 400, { error: "Type your full name to sign." });
      const { data: row, error } = await sb
        .from("business_records")
        .select("id,record_key,payload")
        .eq("business_id", session.businessId)
        .eq("collection", "changeOrders")
        .eq("record_key", coId)
        .eq("record_status", "active")
        .maybeSingle();
      if (error) throw error;
      if (!row) return reply(req, 404, { error: "Change order not found." });
      const co = (row.payload || {}) as JsonObject;
      const jobId = clean(pick(co, "Job ID", "jobId"), 120);
      // Ownership: the change order's job (or the change order itself) must
      // belong to the session's customer.
      let ownerCustomerKey = clean(pick(co, "Customer ID", "customerId"), 120);
      if (jobId) {
        const { data: jobRow } = await sb
          .from("business_records")
          .select("payload")
          .eq("business_id", session.businessId)
          .eq("collection", "jobs")
          .eq("record_key", jobId)
          .eq("record_status", "active")
          .maybeSingle();
        if (jobRow) ownerCustomerKey = clean(pick(jobRow.payload || {}, "Customer ID", "customerId"), 120) || ownerCustomerKey;
      }
      if (ownerCustomerKey !== session.customerKey) {
        return reply(req, 403, { error: "Change order not found." });
      }
      const status = clean(pick(co, "Status", "status"), 60).toUpperCase();
      if (!/SENT|PRESENTED|AWAITING/.test(status) || /APPROVED|ACCEPTED|SIGNED|DECLIN|REJECT|VOID|CANCEL/.test(status)) {
        return reply(req, 409, { error: "This change order can no longer be signed online. Please call us." });
      }
      const currentRevision = Math.max(1, Math.trunc(numberValue(pick(co, "Record Version", "recordVersion")) || 1));
      if (expectedRevision === null || expectedRevision !== currentRevision) {
        return reply(req, 409, { error: "This change order changed since you opened it. Please reload and review the current version before signing." });
      }
      const now = new Date().toISOString();
      const amount = round2(numberValue(pick(co, "Amount", "amount")));
      const actorId = await attributionUserId(sb, session.businessId);
      // Dedupe: an existing change-order invoice for this exact revision is
      // reused, never duplicated.
      let invoiceId = clean(pick(co, "Invoice ID", "invoiceId"), 120);
      if (amount > 0 && !invoiceId) {
        const { data: invRows, error: invErr } = await sb
          .from("business_records")
          .select("record_key,payload")
          .eq("business_id", session.businessId)
          .eq("collection", "invoices")
          .eq("record_status", "active")
          .limit(500);
        if (invErr) throw invErr;
        const found = (invRows || []).find((r) => {
          const p = (r.payload || {}) as JsonObject;
          return clean(pick(p, "Change Order ID", "changeOrderId"), 120) === coId
            && numberValue(pick(p, "Change Order Revision", "changeOrderRevision")) === currentRevision
            && clean(pick(p, "Source", "source"), 80) === CHANGE_ORDER_INVOICE_SOURCE
            && !/void/i.test(clean(pick(p, "Status", "status"), 40));
        });
        if (found) invoiceId = found.record_key;
      }
      if (amount > 0 && !invoiceId) {
        invoiceId = `INVOICE-${crypto.randomUUID().toUpperCase()}`;
        const title = clean(pick(co, "Title", "title"), 160) || "Change order";
        const description = clean(pick(co, "Description", "description"), 1000);
        const { error: insErr } = await sb.from("business_records").insert({
          business_id: session.businessId,
          collection: "invoices",
          record_key: invoiceId,
          record_status: "active",
          created_by: actorId,
          updated_by: actorId,
          payload: {
            "Invoice ID": invoiceId,
            "Invoice Number": `LOCAL-${Date.now()}`,
            "Business ID": session.businessId,
            "Customer ID": session.customerKey,
            "Job ID": jobId,
            "Quote ID": clean(pick(co, "Quote ID", "quoteId"), 120),
            "Change Order ID": coId,
            "Change Order Revision": currentRevision,
            "Source": CHANGE_ORDER_INVOICE_SOURCE,
            "Status": "Draft",
            "Send Allowed": "No",
            "Delivery Status": "Not Sent",
            "Total": amount,
            "Subtotal": amount,
            "Tax": 0,
            "Balance": amount,
            "Due Date": "",
            "lines": [{
              description: `Change order — ${title}${description ? `: ${description}` : ""}`.slice(0, 300),
              quantity: 1,
              unit: "each",
              unitPrice: amount,
            }],
            "Signed By Name": signerName,
            "Signed At": now,
            "Created Time": now,
            "Updated Time": now,
            "Record Version": 1,
          },
        });
        if (insErr) throw insErr;
      }
      const updated: JsonObject = {
        ...co,
        "Status": "Approved — Signed",
        "Customer Decision": "Accepted — signed",
        "Customer Approved Time": now,
        "Signed By Name": signerName,
        "Signed At": now,
        "Signature Type": "Typed name",
        "Signed Revision": currentRevision,
        "Invoice ID": invoiceId,
        "Updated Time": now,
        "Record Version": currentRevision + 1,
      };
      delete updated.__localPending;
      const { error: upErr } = await sb.from("business_records").update({
        payload: updated,
        updated_at: now,
      }).eq("id", row.id);
      if (upErr) throw upErr;
      await writeProof(sb, session.businessId, "PORTAL_CHANGE_ORDER_SIGNED", "Change Order", coId, "OK", { signerName, signedRevision: currentRevision, amount, invoiceId, jobId });
      return reply(req, 200, {
        ok: true,
        message: amount > 0
          ? `Change order signed and approved. An invoice for $${amount.toFixed(2)} was added to your job — we will send it through the normal billing process.`
          : "Change order signed and approved. We will take care of the rest.",
        invoice: { id: invoiceId, amount },
      });
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
      // Payment methods are NOT pinned here: current Stripe accounts use
      // dynamic payment methods (managed per-account in the Stripe
      // Dashboard), and passing payment_method_types makes session
      // creation fail on those accounts. Card + bank debit stay available
      // via the account's Dashboard payment-method settings.
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

    // ---- booking-slots: the open confirmed slots for one date ----
    if (postAction === "booking-slots") {
      const bookingOn = await moduleEnabled(sb, session.businessId, BOOKING_MODULE_KEY);
      if (!bookingOn) {
        return reply(req, 403, { error: "Online booking is not enabled for this business." });
      }
      const settings = await bookingSettings(sb, session.businessId);
      if (settings.mode !== "confirmed") {
        return reply(req, 409, { error: "This business confirms bookings by phone. Send a service request instead." });
      }
      const date = clean(body.date, MAX.date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return reply(req, 400, { error: "Pick a date." });
      const result = await computeSlots(sb, session.businessId, date);
      return reply(req, 200, { ok: true, date, timeZone: result.timeZone, slots: result.slots });
    }

    // ---- book-slot: take a confirmed slot ----
    if (postAction === "book-slot") {
      const bookingOn = await moduleEnabled(sb, session.businessId, BOOKING_MODULE_KEY);
      if (!bookingOn) {
        return reply(req, 403, { error: "Online booking is not enabled for this business." });
      }
      const settings = await bookingSettings(sb, session.businessId);
      if (settings.mode !== "confirmed") {
        return reply(req, 409, { error: "This business confirms bookings by phone. Send a service request instead." });
      }
      const serviceName = clean(body.service, MAX.service);
      const slotStartRaw = clean(body.slotStart || body.slot_start, 60);
      const notes = clean(body.notes, MAX.notes);
      if (!serviceName) return reply(req, 400, { error: "Tell us what you need." });
      const startMs = Date.parse(slotStartRaw);
      if (!Number.isFinite(startMs)) return reply(req, 400, { error: "Pick a time slot." });
      // Recompute the day's slots in the business zone and require the
      // requested start to be one of them, still open (double-booking
      // guard — the check runs at write time, not just at display time).
      const hours = await loadBizHours(sb, session.businessId);
      const dateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: hours.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(startMs));
      const { slots } = await computeSlots(sb, session.businessId, dateStr);
      const slot = slots.find((s) => Date.parse(s.start) === startMs);
      if (!slot) return reply(req, 409, { error: "That time is outside booking hours. Pick another slot." });
      if (!slot.available) return reply(req, 409, { error: "That time was just taken. Pick another slot." });

      const customer = await customerById(sb, session.businessId, session.customerKey);
      const customerName = clean(pick(customer?.payload || {}, "Customer Name", "name"), 120);
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
          "Customer Name": customerName,
          "Phone": clean(pick(customer?.payload || {}, "Phone", "phone"), 40),
          "Email": clean(pick(customer?.payload || {}, "Email", "email"), 120),
          "Service": serviceName,
          "Preferred Date": dateStr,
          "Preferred Time": slot.label,
          "Slot Start": slot.start,
          "Slot End": slot.end,
          "Notes": notes,
          "Status": "Confirmed — booked online",
          "Source": "Customer portal",
          "Recorded By": "Customer — self-service portal",
          "Business ID": session.businessId,
          "Created Time": now,
          "Record Version": 1,
        },
      });
      if (insErr) throw insErr;
      // The booking lands on the Office schedule like any other visit.
      const eventId = `SCHEDULE-${crypto.randomUUID().toUpperCase()}`;
      const { error: evErr } = await sb.from("business_records").insert({
        business_id: session.businessId,
        collection: "scheduleEvents",
        record_key: eventId,
        record_status: "active",
        created_by: actorId,
        updated_by: actorId,
        payload: {
          "Schedule Event ID": eventId,
          "Business ID": session.businessId,
          "Event Type": "Job",
          "Title": `${serviceName} — ${customerName || "Customer"}`,
          "Related Record Type": "Booking",
          "Related Record ID": id,
          "Customer ID": session.customerKey,
          "Assigned User ID": "",
          "Start Time": slot.start,
          "End Time": slot.end,
          "Location": "",
          "Status": "Scheduled",
          "Notes": notes,
          "Created Time": now,
          "Updated Time": now,
          "Record Version": 1,
        },
      });
      if (evErr) throw evErr;
      await writeProof(sb, session.businessId, "PORTAL_SLOT_BOOKED", "Booking", id, "OK", { service: serviceName, slotStart: slot.start });
      return reply(req, 200, {
        ok: true,
        bookingId: id,
        message: `You're booked for ${slot.label} on ${dateStr}. A confirmation is on your portal home page.`,
      });
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
