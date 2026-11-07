// h38-webhooks — outgoing webhooks dispatcher + owner actions (gap6).
//
// "Outgoing webhooks — works with Zapier Catch Hooks and similar tools."
// A listing in Zapier's app directory would need a Zapier developer
// account; this is NOT that — it posts plain JSON to any URL the owner
// pastes in (a Zapier Catch Hook URL works as-is, no developer account).
//
// Owner config: business_module_settings row module_key
// 'outgoing_webhooks' (enabled + config {secret, endpoints[]}), written
// by Owner Controls. Events are enqueued SERVER-SIDE by the
// h38_webhook_enqueue trigger on public.business_records (migration
// 20261107090000_outgoing_webhooks.sql), so every real path is covered:
//   customer.created  — customers INSERT (Office, import, Kit, portal)
//   quote.accepted    — quotes UPDATE storing 'Signed By Name'
//                       (the h38-customer-portal sign-quote action)
//   job.completed     — jobs UPDATE transitioning Status to
//                       Complete/Completed (Office, field, Kit)
//   invoice.paid      — payments INSERT (a payment recorded against an
//                       invoice), or invoices UPDATE transitioning to
//                       Paid with no payment announcement in the last
//                       10 minutes (e.g. an online-payment writeback)
// This function only DELIVERS outbox rows and serves two owner actions;
// it never creates business events itself (except webhook.test rows the
// owner explicitly requests from Owner Controls).
//
// Delivery: POST the stored payload JSON as-is. Headers:
//   Content-Type: application/json
//   X-H38-Event: <event type>
//   X-H38-Delivery: <outbox row id>
//   X-H38-Signature: sha256=<HMAC-SHA256 hex of the raw body, keyed by
//     the business's per-business secret from its webhook config> —
//     a receiver verifies us by recomputing that HMAC over the raw
//     request body with the same secret.
// A failed delivery is retried up to 3 attempts total with backoff
// (next_attempt_at: +1 minute, then +5 minutes) by the per-minute drain;
// after the 3rd failure the row stays 'failed' in the log. Delivery can
// never fail or block the underlying business action — enqueue already
// happened in a exception-safe trigger, and delivery is async here.
//
// Caller auth (verify_jwt=false):
//  - drain: x-h38-nightly-key header matching the 'h38-webhooks' row in
//    h38_internal_job_secrets (pg_cron 'h38-webhooks-1m' pattern, same as
//    h38-review-scheduler / h38-owner-notify).
//  - owner actions ('test', 'deliveries'): a signed-in user JWT plus an
//    active owner/administrator business_memberships row for the
//    business (the h38-customer-portal activeOwner pattern).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUILD = "20261107-gap6-connections-1";
const JOB_SECRET_NAME = "h38-webhooks";
const MODULE_KEY = "outgoing_webhooks";
const MAX_ROWS_PER_RUN = 25;
const MAX_ATTEMPTS = 3;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// CORS (h38-customer-portal pattern): the Owner Controls card calls this
// function from the Office origin via the Supabase client, so browser
// calls need an OPTIONS preflight answer and CORS headers on replies.
// The pg_cron drain sends no Origin and is unaffected.
const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function corsHeaders(request: Request): HeadersInit {
  const origin = String(request.headers.get("origin") || "").replace(/\/+$/, "");
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://highway38solutions.com";
  const requestedHeaders = String(request.headers.get("access-control-request-headers") || "").slice(0, 500);
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-headers": requestedHeaders || "authorization, apikey, content-type, x-client-info, x-h38-nightly-key",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "600",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin, Access-Control-Request-Headers",
  };
}

let currentRequest: Request | null = null;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: currentRequest ? corsHeaders(currentRequest) : { "Content-Type": "application/json" },
  });
}

const text = (v: unknown, n = 2000): string => String(v ?? "").trim().slice(0, n);

// ---- Internal caller gate (h38-review-scheduler pattern) ----
async function validSecret(req: Request, sb: any): Promise<boolean> {
  const got = String(req.headers.get("x-h38-nightly-key") ?? "").trim();
  if (!got) return false;
  const { data } = await sb
    .from("h38_internal_job_secrets")
    .select("secret_value")
    .eq("name", JOB_SECRET_NAME)
    .maybeSingle();
  return !!data?.secret_value && got === data.secret_value;
}

// ---- Owner caller gate (h38-customer-portal pattern) ----
function bearer(request: Request): string {
  const match = String(request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function signedInUser(request: Request): Promise<{ id: string } | null> {
  const token = bearer(request);
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      apikey: ANON_KEY,
      "content-type": "application/json",
      "x-client-info": "h38-webhooks-auth-v1",
    },
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok || typeof payload.id !== "string" || !payload.id) return null;
  return { id: payload.id };
}

async function activeOwner(sb: any, userId: string, businessId: string): Promise<boolean> {
  const { data, error } = await sb
    .from("business_memberships")
    .select("id, role, status")
    .eq("business_id", businessId)
    .eq("auth_user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) return false;
  return ["owner", "administrator"].includes(String(data.role));
}

// ---- Webhook config ----
type Endpoint = { id?: string; url: string; events: string[]; enabled: boolean };

async function webhookConfig(sb: any, businessId: string): Promise<{ enabled: boolean; secret: string; endpoints: Endpoint[] }> {
  const { data } = await sb
    .from("business_module_settings")
    .select("enabled, config")
    .eq("business_id", businessId)
    .eq("module_key", MODULE_KEY)
    .maybeSingle();
  const cfg = (data && typeof data.config === "object" && data.config) || {};
  const endpoints: Endpoint[] = (Array.isArray(cfg.endpoints) ? cfg.endpoints : [])
    .filter((e: any) => e && typeof e.url === "string")
    .map((e: any) => ({
      id: typeof e.id === "string" ? e.id : undefined,
      url: e.url,
      events: Array.isArray(e.events) ? e.events.map(String) : [],
      enabled: e.enabled === true,
    }));
  return { enabled: data?.enabled === true, secret: text(cfg.secret || "", 200), endpoints };
}

// ---- HMAC-SHA256 signature (hex) over the exact raw body we send ----
async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- One delivery attempt for one outbox row ----
async function attemptDelivery(sb: any, row: any, secret: string): Promise<{ ok: boolean; status: number; error: string }> {
  const body = JSON.stringify(row.payload ?? {});
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-H38-Event": String(row.event_type || ""),
    "X-H38-Delivery": String(row.id || ""),
    "User-Agent": "H38-Office-Webhooks/1",
  };
  if (secret) headers["X-H38-Signature"] = "sha256=" + (await hmacHex(secret, body));
  let status = 0;
  let error = "";
  try {
    const res = await fetch(String(row.endpoint_url), {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });
    status = res.status;
    // Drain the response so the connection is released; content is not used.
    await res.text().catch(() => "");
    if (!res.ok) error = `Receiver answered HTTP ${res.status}.`;
  } catch (e) {
    error = `Delivery failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500);
  }
  const ok = status >= 200 && status < 300;
  const attempts = Number(row.attempts || 0) + 1;
  const nowIso = new Date().toISOString();
  if (ok) {
    await sb.from("h38_webhook_outbox").update({
      status: "delivered",
      attempts,
      last_status_code: status || null,
      last_error: null,
      delivered_at: nowIso,
      updated_at: nowIso,
    }).eq("id", row.id);
  } else if (attempts >= MAX_ATTEMPTS) {
    await sb.from("h38_webhook_outbox").update({
      status: "failed",
      attempts,
      last_status_code: status || null,
      last_error: error || "Delivery failed.",
      updated_at: nowIso,
    }).eq("id", row.id);
  } else {
    const backoffMs = attempts === 1 ? 60_000 : 300_000;
    await sb.from("h38_webhook_outbox").update({
      status: "pending",
      attempts,
      last_status_code: status || null,
      last_error: error || "Delivery failed.",
      next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
      updated_at: nowIso,
    }).eq("id", row.id);
  }
  return { ok, status, error };
}

// ---- Drain: claim due rows, deliver each to its endpoint ----
async function drain(sb: any): Promise<{ claimed: number; delivered: number; failed: number }> {
  const { data: rows, error } = await sb
    .from("h38_webhook_outbox")
    .select("id, business_id, event_type, endpoint_url, payload, attempts, status")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(MAX_ROWS_PER_RUN);
  if (error) throw error;
  let delivered = 0;
  let failed = 0;
  const secrets = new Map<string, string>();
  for (const row of rows || []) {
    // Atomic claim: only proceed if the row is still pending.
    const { data: claimed } = await sb
      .from("h38_webhook_outbox")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id");
    if (!claimed || claimed.length !== 1) continue;
    if (!secrets.has(row.business_id)) {
      const cfg = await webhookConfig(sb, row.business_id);
      secrets.set(row.business_id, cfg.secret);
    }
    const res = await attemptDelivery(sb, row, secrets.get(row.business_id) || "");
    if (res.ok) delivered++;
    else failed++;
  }
  return { claimed: (rows || []).length, delivered, failed };
}

Deno.serve(async (req: Request) => {
  currentRequest = req;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);
  const sb = serviceClient();
  const body = await req.json().catch(() => ({} as any));
  const action = text(body?.action || "", 40);

  try {
    // Cron drain — internal key only.
    if (action === "drain" || action === "") {
      if (!(await validSecret(req, sb))) return json({ error: "Unauthorized." }, 401);
      const result = await drain(sb);
      return json({ status: "PASS", build: BUILD, ...result });
    }

    // Owner actions — user JWT + active owner/administrator membership.
    const businessId = text(body?.businessId || "", 60);
    if (!businessId) return json({ error: "businessId is required." }, 400);
    const user = await signedInUser(req);
    if (!user) return json({ error: "Sign in again before using webhook settings." }, 401);
    if (!(await activeOwner(sb, user.id, businessId))) {
      return json({ error: "Only a business owner or administrator can use webhook settings." }, 403);
    }

    if (action === "deliveries") {
      const { data, error } = await sb
        .from("h38_webhook_outbox")
        .select("id, event_type, endpoint_url, record_collection, record_key, status, attempts, last_error, last_status_code, created_at, delivered_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return json({ status: "PASS", build: BUILD, deliveries: data || [] });
    }

    if (action === "test") {
      const cfg = await webhookConfig(sb, businessId);
      if (!cfg.enabled) return json({ error: "Outgoing webhooks are off for this business. Turn them on and save first." }, 400);
      const endpointId = text(body?.endpointId || "", 80);
      const targets = cfg.endpoints.filter((e) => e.enabled && (!endpointId || e.id === endpointId));
      if (!targets.length) return json({ error: "No enabled endpoint to test. Add an endpoint URL and save first." }, 400);
      const results: Array<{ url: string; ok: boolean; status: number; error: string }> = [];
      for (const ep of targets) {
        const payload = {
          event: "webhook.test",
          timestamp: new Date().toISOString(),
          businessId,
          record: { note: "Test delivery from H38 Office Owner Controls — your webhook wiring works." },
        };
        const { data: inserted, error: insErr } = await sb
          .from("h38_webhook_outbox")
          .insert({
            business_id: businessId,
            event_type: "webhook.test",
            endpoint_url: ep.url,
            record_collection: "",
            record_key: "",
            payload,
          })
          .select("id, business_id, event_type, endpoint_url, payload, attempts")
          .single();
        if (insErr || !inserted) {
          results.push({ url: ep.url, ok: false, status: 0, error: "Could not queue the test." });
          continue;
        }
        const res = await attemptDelivery(sb, inserted, cfg.secret);
        results.push({ url: ep.url, ok: res.ok, status: res.status, error: res.error });
      }
      return json({ status: "PASS", build: BUILD, results });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
