// h38-public-booking — public online booking intake for H38 Office tenants.
//
// PUBLIC endpoint (verify_jwt = false). Accepts anonymous booking requests and
// stores them as business_records rows (collection = "booking_requests").
//
// Hard gate: a booking is accepted ONLY when the tenant has explicitly enabled
// online booking in business_module_settings (module_key = "online_booking",
// enabled = true). Missing row or enabled != true => 403. Default is OFF.
//
// Abuse controls: per-IP in-memory rate limit, honeypot field, strict input
// validation with length caps. Client-facing errors are generic; internals are
// logged server-side only and never returned.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

// Fallback when the booking page is opened without ?business=<id>.
const DEFAULT_BUSINESS_ID = "10b85a89-5834-436d-95b0-c6ee2eb335ad";

const MODULE_KEY = "online_booking";
const BOOKING_COLLECTION = "booking_requests";

// Rate limit: max requests per IP per window. In-memory per isolate —
// defense in depth alongside the tenant gate, not a hard guarantee.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateHits = new Map<string, number[]>();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX = {
  name: 80,
  phone: 30,
  email: 120,
  service: 80,
  date: 10,
  time: 20,
  notes: 1000,
} as const;

export interface BookingDeps {
  supabaseUrl: string;
  serviceKey: string;
  // Injectable for tests; defaults to the real client.
  createClient?: (url: string, key: string) => any;
}

function cors(origin: string | null): Record<string, string> {
  const o =
    origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://highway38solutions.com";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

function json(
  status: number,
  body: unknown,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
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

function clean(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

function bookingId(): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = crypto.getRandomValues(new Uint8Array(3));
  const suffix = [...rand].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `BOOK-${ymd}-${suffix}`;
}

async function bookingEnabledFor(
  sb: any,
  businessId: string,
): Promise<boolean> {
  const { data, error } = await sb
    .from("business_module_settings")
    .select("enabled")
    .eq("business_id", businessId)
    .eq("module_key", MODULE_KEY)
    .maybeSingle();
  if (error) throw error;
  // Default OFF: missing row or enabled !== true means disabled.
  return data?.enabled === true;
}

// Anonymous bookings still need created_by/updated_by (NOT NULL, no default).
// Attribute the row to the tenant's owner (or an administrator) — the payload
// itself records Source: "Online booking" so the origin stays clear.
async function attributionUserId(sb: any, businessId: string): Promise<string> {
  for (const role of ["owner", "administrator"]) {
    const { data, error } = await sb
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

export async function handleBookingRequest(
  req: Request,
  deps: BookingDeps,
): Promise<Response> {
  const headers = cors(req.headers.get("origin"));

  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { error: "Method not allowed." }, headers);
  }
  if (!deps.supabaseUrl || !deps.serviceKey) {
    console.error("[h38-public-booking] missing SUPABASE_URL or SERVICE_ROLE_KEY");
    return json(500, { error: "Booking is unavailable right now. Please call us directly." }, headers);
  }

  const makeClient = deps.createClient ?? createClient;
  const sb = makeClient(deps.supabaseUrl, deps.serviceKey);

  const url = new URL(req.url);
  const rawBusinessId =
    req.method === "GET"
      ? url.searchParams.get("business_id")
      : null;

  // Public status check: lets the booking page show "not available" instead of
  // a dead form. Returns only the boolean — no tenant data leaks.
  if (req.method === "GET") {
    const businessId = (rawBusinessId || DEFAULT_BUSINESS_ID).trim();
    if (!UUID_RE.test(businessId)) {
      return json(400, { error: "Invalid business." }, headers);
    }
    try {
      const enabled = await bookingEnabledFor(sb, businessId);
      return json(200, { enabled }, headers);
    } catch (e) {
      console.error("[h38-public-booking] status check failed:", e);
      return json(500, { error: "Booking is unavailable right now. Please call us directly." }, headers);
    }
  }

  // ---- POST: new booking request ----
  if (req.headers.get("content-type")?.includes("application/json") !== true) {
    return json(400, { error: "Invalid request." }, headers);
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return json(429, { error: "Too many requests. Please try again later or call us directly." }, headers);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid request." }, headers);
  }

  // Honeypot: bots fill it; humans never see it. Pretend success, store nothing.
  if (String(body.website || "").trim() !== "") {
    return json(200, { ok: true, bookingId: "received" }, headers);
  }

  const businessId = String(body.business_id || DEFAULT_BUSINESS_ID).trim();
  if (!UUID_RE.test(businessId)) {
    return json(400, { error: "Invalid business." }, headers);
  }

  const name = clean(body.name, MAX.name);
  const phone = clean(body.phone, MAX.phone);
  const service = clean(body.service, MAX.service);
  const email = clean(body.email, MAX.email);
  const date = clean(body.date, MAX.date);
  const time = clean(body.time, MAX.time);
  const notes = clean(body.notes, MAX.notes);

  if (!name || !phone || !service) {
    return json(400, { error: "Name, phone, and service are required." }, headers);
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return json(400, { error: "Please enter a valid phone number." }, headers);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "Please enter a valid email address." }, headers);
  }

  try {
    // HARD GATE: refuse unless this tenant explicitly enabled online booking.
    const enabled = await bookingEnabledFor(sb, businessId);
    if (!enabled) {
      return json(
        403,
        {
          error: "Online booking is not currently enabled for this business. Please call us directly.",
          code: "booking_disabled",
        },
        headers,
      );
    }

    const id = bookingId();
    const now = new Date().toISOString();
    const actorId = await attributionUserId(sb, businessId);
    const { error } = await sb.from("business_records").insert({
      business_id: businessId,
      collection: BOOKING_COLLECTION,
      record_key: id,
      record_status: "active",
      created_by: actorId,
      updated_by: actorId,
      payload: {
        "Booking ID": id,
        "Customer Name": name,
        "Phone": phone,
        "Email": email,
        "Service": service,
        "Preferred Date": date,
        "Preferred Time": time,
        "Notes": notes,
        "Status": "New — needs owner review",
        "Source": "Online booking",
        "Recorded By": "System — anonymous online booking request",
        "Business ID": businessId,
        "Created Time": now,
        "Record Version": 1,
      },
    });
    if (error) throw error;

    return json(200, { ok: true, bookingId: id }, headers);
  } catch (e) {
    // Never leak internals (table names, RLS details, stack traces) to the client.
    console.error("[h38-public-booking] booking insert failed:", e);
    return json(500, { error: "Something went wrong. Please call us directly." }, headers);
  }
}

if (import.meta.main) {
  Deno.serve((req: Request) =>
    handleBookingRequest(req, {
      supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    }),
  );
}
