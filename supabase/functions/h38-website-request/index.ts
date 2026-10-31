// h38-website-request — public Start a Request intake for the H38 website.
//
// PUBLIC endpoint (verify_jwt = false). Accepts anonymous website requests
// from start-request.html and stores them as business_records rows
// (collection = "requests") on the Highway 38 tenant, so a website lead
// lands in the Office requests list (Work) and the owner-notification scan
// (h38-owner-notify reads collection "requests", Source != "Office",
// Status "New") instead of only in the legacy Apps Script sheet.
//
// The legacy Apps Script intake stays as the form's fallback path; this
// function is the Office write. Payload mirrors the canonical SAVE_REQUEST
// record shape (supabase-data.js) plus the visitor's contact fields, so
// every existing requests surface renders it without a second schema.
//
// Abuse controls: per-IP in-memory rate limit, honeypot field, strict
// input validation with length caps, idempotency key dedupe. Client-facing
// errors are generic; internals are logged server-side only.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

// Website requests belong to Highway 38 itself — fixed tenant, never
// caller-selected, so the public endpoint cannot write into other tenants.
const BUSINESS_ID = "10b85a89-5834-436d-95b0-c6ee2eb335ad";
const COLLECTION = "requests";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateHits = new Map<string, number[]>();

const MAX = {
  name: 80,
  phone: 30,
  email: 120,
  message: 2000,
  idempotencyKey: 80,
} as const;

export interface WebsiteRequestDeps {
  supabaseUrl: string;
  serviceKey: string;
  createClient?: (url: string, key: string) => any;
}

function cors(origin: string | null): Record<string, string> {
  const o =
    origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : "https://highway38solutions.com";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function requestId(): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = crypto.getRandomValues(new Uint8Array(3));
  const suffix = [...rand].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `WEB-${ymd}-${suffix}`;
}

// Anonymous submissions still need created_by/updated_by (NOT NULL, no
// default). Attribute the row to the tenant's owner (or an administrator) —
// the payload itself records Source: "Website" so the origin stays clear.
// Same pattern as h38-public-booking.
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

export async function handleWebsiteRequest(
  req: Request,
  deps: WebsiteRequestDeps,
): Promise<Response> {
  const headers = cors(req.headers.get("origin"));

  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed." }, headers);
  }
  if (!deps.supabaseUrl || !deps.serviceKey) {
    console.error("[h38-website-request] missing SUPABASE_URL or SERVICE_ROLE_KEY");
    return json(500, { error: "Requests are unavailable right now. Please call us directly." }, headers);
  }

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
    return json(200, { ok: true, requestId: "received" }, headers);
  }

  const name = clean(body.name, MAX.name);
  const phone = clean(body.phone, MAX.phone);
  const email = clean(body.email, MAX.email);
  const message = clean(body.message, MAX.message);
  const idempotencyKey = clean(body.idempotencyKey, MAX.idempotencyKey);

  if (!name || !email || !phone || !message) {
    return json(400, { error: "Name, email, phone, and a short message are required." }, headers);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: "Please enter a valid email address." }, headers);
  }
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return json(400, { error: "Please enter a valid phone number." }, headers);
  }

  const makeClient = deps.createClient ?? createClient;
  const sb = makeClient(deps.supabaseUrl, deps.serviceKey);

  try {
    // Idempotency: the form carries one key per session; a retry or a
    // double tap returns the original request instead of duplicating it.
    const recordKey = idempotencyKey
      ? `WEB-${idempotencyKey.replace(/[^A-Za-z0-9-]/g, "").slice(0, 60)}`
      : requestId();
    const { data: existing, error: readError } = await sb
      .from("business_records")
      .select("record_key")
      .eq("business_id", BUSINESS_ID)
      .eq("collection", COLLECTION)
      .eq("record_key", recordKey)
      .maybeSingle();
    if (readError) throw readError;
    if (existing?.record_key) {
      return json(200, { ok: true, requestId: existing.record_key, duplicate: true }, headers);
    }

    const now = new Date().toISOString();
    const actorId = await attributionUserId(sb, BUSINESS_ID);
    const details = `${message}\n\n— Website request from ${name} · ${email} · ${phone}`;
    const { error } = await sb.from("business_records").insert({
      business_id: BUSINESS_ID,
      collection: COLLECTION,
      record_key: recordKey,
      record_status: "active",
      created_by: actorId,
      updated_by: actorId,
      payload: {
        "Request ID": recordKey,
        "Business ID": BUSINESS_ID,
        "Customer ID": "",
        "Source": "Website",
        "Subject": `Website request — ${name}`,
        "Details": details,
        "Priority": "Normal",
        "Status": "New",
        "Created Time": now,
        "Updated Time": now,
        "Record Version": 1,
        "Customer Name": name,
        "Contact Name": name,
        "Email": email,
        "Phone": phone,
        "Message": message,
        "Preferred Contact": "Phone",
      },
    });
    if (error) throw error;

    return json(200, { ok: true, requestId: recordKey }, headers);
  } catch (e) {
    // Never leak internals (table names, RLS details, stack traces) to the client.
    console.error("[h38-website-request] insert failed:", e);
    return json(500, { error: "Something went wrong. Please call us directly." }, headers);
  }
}

if (import.meta.main) {
  Deno.serve((req: Request) =>
    handleWebsiteRequest(req, {
      supabaseUrl: Deno.env.get("SUPABASE_URL") || "",
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    }),
  );
}
