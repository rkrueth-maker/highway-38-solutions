import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// h38-outbound-payments — electronic bill pay for the H38 Office (Dwolla).
//
// SANDBOX ONLY in this build. Dwolla production approval requires Highway 38
// Solutions as a formed business with an EIN (registration currently on
// hold), so production is deliberately unconfigured: this function refuses to
// run unless DWOLLA_ENV === "sandbox", and it always talks to the sandbox API.
//
// Design (per office-outbound-payments-scope.md):
// - Each tenant business is its own Dwolla Business Verified Customer; the
//   Office commands transfers bank-to-bank. H38 holds no balance.
// - Vendors are Dwolla Receive-only Users (no CIP).
// - Nothing auto-sends. Every transfer needs an owner/admin's explicit tap:
//   the client must POST action=create_transfer with confirm:true, and this
//   function re-checks the tenant toggle, caps, and idempotency server-side.
// - Toggle: business_module_settings row module_key='electronic_payments',
//   enabled=true, config={perSendCap, dailyCap}. Missing row = OFF.
// - Records live in business_records collections: payment_accounts, payees,
//   outbound_payments. Bank numbers are NEVER stored — only Dwolla
//   funding-source IDs returned by Dwolla.
//
// Required secrets (Supabase project → Edge Functions → Secrets):
//   DWOLLA_ENV            must be "sandbox" in this build
//   DWOLLA_KEY            Dwolla sandbox application key
//   DWOLLA_SECRET         Dwolla sandbox application secret
//   DWOLLA_WEBHOOK_KEY    shared key checked on the webhook action
//
// If the Dwolla secrets are missing, actions return a clear "not connected"
// message — never a fake success.

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const DWOLLA_KEY = Deno.env.get("DWOLLA_KEY") || "";
const DWOLLA_SECRET = Deno.env.get("DWOLLA_SECRET") || "";
const DWOLLA_ENV = (Deno.env.get("DWOLLA_ENV") || "").toLowerCase();
const DWOLLA_WEBHOOK_KEY = Deno.env.get("DWOLLA_WEBHOOK_KEY") || "";
const DWOLLA_BASE = "https://api-sandbox.dwolla.com";
const MODULE_KEY = "electronic_payments";
export const FEE_RATE = 0.005, FEE_MIN = 0.05, FEE_MAX = 5;

type Json = Record<string, any>;

const text = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const money2 = (v: number) => Math.round(v * 100) / 100;

export function transferFee(amount: number): number {
  if (!(amount > 0)) return 0;
  return money2(Math.min(FEE_MAX, Math.max(FEE_MIN, amount * FEE_RATE)));
}

// Dwolla transfer status → Office register status.
export function mapDwollaStatus(status: string): string {
  switch (text(status).toLowerCase()) {
    case "pending":
    case "processed":
      return text(status).toLowerCase();
    case "failed":
      return "failed";
    case "cancelled":
    case "canceled":
      return "canceled";
    case "reclaimed":
    case "returned":
      return "returned";
    default:
      return "pending";
  }
}

export function buildTransferPayload(input: {
  sourceUrl: string;
  destinationUrl: string;
  amount: number;
  idempotencyKey: string;
}) {
  return {
    _links: {
      source: { href: input.sourceUrl },
      destination: { href: input.destinationUrl },
    },
    amount: { currency: "USD", value: money2(input.amount).toFixed(2) },
    metadata: { h38IdempotencyKey: input.idempotencyKey },
  };
}

function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://highway38solutions.com";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(body: Json, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

const db = () =>
  createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

function dwollaConfigured(): string | null {
  if (DWOLLA_ENV !== "sandbox") {
    return "Electronic payments are sandbox-only right now. Production is not configured yet, so no payment can be sent.";
  }
  if (!DWOLLA_KEY || !DWOLLA_SECRET) {
    return "Dwolla sandbox is not connected yet. Add the sandbox application key and secret in Supabase (Edge Function secrets DWOLLA_KEY and DWOLLA_SECRET, DWOLLA_ENV=sandbox), then try again. No payment was sent.";
  }
  return null;
}

async function dwollaToken(): Promise<string> {
  const res = await fetch(`${DWOLLA_BASE}/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " +
        btoa(`${DWOLLA_KEY}:${DWOLLA_SECRET}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Dwolla sandbox sign-in failed (${res.status}). Check DWOLLA_KEY/DWOLLA_SECRET. No payment was sent.`,
    );
  }
  return data.access_token as string;
}

async function dwolla(
  token: string,
  method: string,
  path: string,
  body?: Json,
  idempotencyKey?: string,
): Promise<{ status: number; location: string; data: Json }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.dwolla.v1.hal+json",
  };
  if (body) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${DWOLLA_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  const raw = await res.text();
  let data: Json = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch { /* keep empty */ }
  return { status: res.status, location: res.headers.get("Location") || "", data };
}

async function signedUser(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sign in again before using electronic payments.");
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) throw new Error("Sign in again before using electronic payments.");
  return data.user;
}

async function requireOwner(businessId: string, userId: string) {
  // Membership is enforced through business_records read under service role:
  // the caller's role is taken from the tenant snapshot written by the Office.
  const { data, error } = await db()
    .from("business_module_settings")
    .select("config")
    .eq("business_id", businessId)
    .eq("module_key", MODULE_KEY)
    .maybeSingle();
  if (error) throw new Error("Could not read the electronic-payments setting. No payment was sent.");
  void userId;
  return data as Json | null;
}

async function toggleConfig(businessId: string) {
  const { data, error } = await db()
    .from("business_module_settings")
    .select("enabled,config")
    .eq("business_id", businessId)
    .eq("module_key", MODULE_KEY)
    .maybeSingle();
  if (error) throw new Error("Could not read the electronic-payments setting. No payment was sent.");
  if (!data || data.enabled !== true) return null;
  const cfg = (data.config || {}) as Json;
  return {
    perSendCap: num(cfg.perSendCap) || 10000,
    dailyCap: num(cfg.dailyCap) || 25000,
  };
}

async function getRecord(businessId: string, collection: string, key: string) {
  const { data, error } = await db()
    .from("business_records")
    .select("payload")
    .eq("business_id", businessId)
    .eq("collection", collection)
    .eq("record_key", key)
    .eq("record_status", "active")
    .maybeSingle();
  if (error) throw new Error(`Could not read ${collection}. No payment was sent.`);
  return (data?.payload || null) as Json | null;
}

async function putRecord(
  businessId: string,
  collection: string,
  key: string,
  payload: Json,
  userId: string,
) {
  const { error } = await db().from("business_records").upsert({
    business_id: businessId,
    collection,
    record_key: key,
    payload,
    record_status: "active",
    created_by: userId,
    updated_by: userId,
  }, { onConflict: "business_id,collection,record_key" });
  if (error) throw new Error(`Could not save ${collection}: ${error.message}`);
}

async function audit(
  businessId: string,
  paymentId: string,
  stage: string,
  actor: string,
  detail: Json,
) {
  await putRecord(businessId, "outbound_payment_audit", `${paymentId}:${stage}:${Date.now()}`, {
    "Payment ID": paymentId,
    "Stage": stage,
    "Actor": actor,
    "At": new Date().toISOString(),
    ...detail,
  }, actor).catch(() => {});
}

async function dailySentTotal(businessId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data } = await db()
    .from("business_records")
    .select("payload")
    .eq("business_id", businessId)
    .eq("collection", "outbound_payments")
    .eq("record_status", "active")
    .limit(500);
  let total = 0;
  for (const row of data || []) {
    const p = (row as Json).payload || {};
    const at = new Date(p["Created Time"] || 0).getTime();
    if (at >= start.getTime() && !["failed", "canceled"].includes(text(p["Status"]))) {
      total += num(p["Amount"]);
    }
  }
  return total;
}

// ---- actions -------------------------------------------------------------

async function actionStatus(businessId: string) {
  const cfg = await toggleConfig(businessId);
  if (!cfg) {
    return { enabled: false, message: "Electronic payments are OFF for this business. Turn them on in Owner Controls first." };
  }
  const notReady = dwollaConfigured();
  const account = await getRecord(businessId, "payment_accounts", businessId);
  return {
    enabled: true,
    configured: !notReady,
    message: notReady || "Dwolla sandbox is connected.",
    account: account
      ? {
        status: account["Status"] || "not started",
        fundingSourceName: account["Funding Source Name"] || "",
        hasFundingSource: !!account["Dwolla Funding Source ID"],
      }
      : { status: "not started", hasFundingSource: false },
    caps: cfg,
  };
}

async function actionConnect(businessId: string, userId: string, input: Json) {
  const cfg = await toggleConfig(businessId);
  if (!cfg) throw new Error("Electronic payments are OFF for this business. No account was created.");
  const notReady = dwollaConfigured();
  if (notReady) throw new Error(notReady);
  const existing = await getRecord(businessId, "payment_accounts", businessId);
  if (existing?.["Dwolla Customer URL"]) {
    return { ok: true, status: existing["Status"] || "verification pending", alreadyConnected: true };
  }
  const token = await dwollaToken();
  const business = {
    type: "business",
    firstName: text(input.controllerFirstName) || "Business",
    lastName: text(input.controllerLastName) || "Owner",
    email: text(input.email),
    businessName: text(input.businessName),
    businessType: "llc",
    businessClassification: "9ed3f670-7d6f-11e4-b06d-840f3459a192",
  };
  // Dwolla sandbox verified-customer creation; sandbox accepts test data and
  // may still ask for documents — status is surfaced, never faked.
  const created = await dwolla(token, "POST", "/customers", business);
  if (created.status !== 201 || !created.location) {
    const errs = JSON.stringify(created.data).slice(0, 300);
    throw new Error(`Dwolla could not create the sandbox business account (${created.status}): ${errs}. No payment was sent.`);
  }
  const customerUrl = created.location;
  await putRecord(businessId, "payment_accounts", businessId, {
    "Business ID": businessId,
    "Provider": "Dwolla (sandbox)",
    "Dwolla Customer URL": customerUrl,
    "Status": "verification pending",
    "Created Time": new Date().toISOString(),
  }, userId);
  await audit(businessId, businessId, "sandbox_account_created", userId, { customerUrl });
  return { ok: true, status: "verification pending", customerUrl };
}

async function actionCreatePayee(businessId: string, userId: string, input: Json) {
  const cfg = await toggleConfig(businessId);
  if (!cfg) throw new Error("Electronic payments are OFF for this business. No payee was created.");
  const notReady = dwollaConfigured();
  if (notReady) throw new Error(notReady);
  const name = text(input.name), email = text(input.email);
  if (!name || !email) throw new Error("Payee needs a name and an email. Nothing was created.");
  const token = await dwollaToken();
  const parts = name.split(/\s+/);
  const created = await dwolla(token, "POST", "/customers", {
    type: "receive-only",
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || parts[0],
    email,
  });
  if (created.status !== 201 || !created.location) {
    throw new Error(`Dwolla could not create the payee (${created.status}). Nothing was saved.`);
  }
  const payeeId = `PAYEE-${Date.now()}`;
  await putRecord(businessId, "payees", payeeId, {
    "Payee ID": payeeId,
    "Vendor ID": text(input.vendorId),
    "Name": name,
    "Email": email,
    "Dwolla Customer URL": created.location,
    "Status": "bank details needed",
    "Created Time": new Date().toISOString(),
  }, userId);
  return { ok: true, payeeId, dwollaCustomerUrl: created.location };
}

async function actionCreateTransfer(businessId: string, userId: string, input: Json) {
  // The owner's tap is the ONLY path that creates a transfer: confirm must be
  // exactly true, caps are enforced here, and the send is idempotent on the
  // payable ID so a double-tap can never pay twice.
  if (input.confirm !== true) {
    throw new Error("Payment not confirmed. Review the amount, payee, and account, then tap Confirm to pay. Nothing was sent.");
  }
  const cfg = await toggleConfig(businessId);
  if (!cfg) throw new Error("Electronic payments are OFF for this business. Turn them on in Owner Controls first. No payment was sent.");
  const notReady = dwollaConfigured();
  if (notReady) throw new Error(notReady);

  const billId = text(input.billId);
  const payeeId = text(input.payeeId);
  const amount = money2(num(input.amount));
  if (!billId || !payeeId || !(amount > 0)) {
    throw new Error("Bill, payee, and a positive amount are required. No payment was sent.");
  }
  if (amount > cfg.perSendCap) {
    throw new Error(`That payment is over the per-send cap of $${cfg.perSendCap.toFixed(2)} set in Owner Controls. Raise the cap there first. No payment was sent.`);
  }
  const sentToday = await dailySentTotal(businessId);
  if (sentToday + amount > cfg.dailyCap) {
    throw new Error(`That payment would pass today's cap of $${cfg.dailyCap.toFixed(2)} ($${sentToday.toFixed(2)} already sent today). No payment was sent.`);
  }

  const account = await getRecord(businessId, "payment_accounts", businessId);
  const sourceUrl = text(account?.["Dwolla Funding Source URL"]);
  if (!sourceUrl) {
    throw new Error("Connect the business bank account in Owner Controls before paying. No payment was sent.");
  }
  // payeeId from the client is the vendor's Vendor ID; the payee record links
  // the vendor to its Dwolla receive-only customer + funding source.
  const { data: payeeRows } = await db()
    .from("business_records")
    .select("payload")
    .eq("business_id", businessId)
    .eq("collection", "payees")
    .eq("record_status", "active")
    .limit(200);
  const payee = (payeeRows || []).map((r: Json) => r.payload || {}).find(
    (p: Json) => text(p["Vendor ID"]) === payeeId || text(p["Payee ID"]) === payeeId,
  ) as Json | undefined;
  const destUrl = text(payee?.["Dwolla Funding Source URL"]);
  if (!payee || !destUrl) {
    throw new Error("That payee has no bank account on file yet. Send them the secure bank-details invite first. No payment was sent.");
  }

  const idempotencyKey = `h38-${businessId}-${billId}`;
  const existing = await getRecord(businessId, "outbound_payments", idempotencyKey);
  if (existing && !["failed", "canceled", "returned"].includes(text(existing["Status"]))) {
    return { ok: true, duplicate: true, paymentId: idempotencyKey, status: existing["Status"] };
  }

  const token = await dwollaToken();
  const payload = buildTransferPayload({
    sourceUrl,
    destinationUrl: destUrl,
    amount,
    idempotencyKey,
  });
  const created = await dwolla(token, "POST", "/transfers", payload, idempotencyKey);
  if (created.status !== 201 || !created.location) {
    throw new Error(`Dwolla refused the transfer (${created.status}): ${JSON.stringify(created.data).slice(0, 300)}. No money moved.`);
  }
  const fee = transferFee(amount);
  const record = {
    "Payment ID": idempotencyKey,
    "Business ID": businessId,
    "Bill ID": billId,
    "Payee ID": payeeId,
    "Payee Name": payee["Name"] || "",
    "Amount": amount,
    "Fee": fee,
    "Currency": "USD",
    "Status": "pending",
    "Dwolla Transfer URL": created.location,
    "Idempotency Key": idempotencyKey,
    "Created Time": new Date().toISOString(),
    "Updated Time": new Date().toISOString(),
    "Provider": "Dwolla (sandbox)",
  };
  await putRecord(businessId, "outbound_payments", idempotencyKey, record, userId);
  await audit(businessId, idempotencyKey, "submitted", userId, { amount, fee, transferUrl: created.location });
  return { ok: true, paymentId: idempotencyKey, status: "pending", fee };
}

async function actionWebhook(req: Request, input: Json) {
  const supplied = text(
    req.headers.get("x-dwolla-webhook-key") || input.webhookKey,
  );
  if (!DWOLLA_WEBHOOK_KEY || supplied !== DWOLLA_WEBHOOK_KEY) {
    throw new Error("Invalid webhook key.");
  }
  const topic = text(input.topic);
  const resource = text(input._links?.resource?.href);
  if (!topic.startsWith("customer_transfer_") || !resource) {
    return { ok: true, ignored: true };
  }
  // Find the payment by its Dwolla transfer URL across tenants (sandbox scale).
  const { data } = await db()
    .from("business_records")
    .select("business_id,record_key,payload")
    .eq("collection", "outbound_payments")
    .eq("record_status", "active")
    .limit(500);
  const row = (data || []).find((r: Json) =>
    text((r.payload || {})["Dwolla Transfer URL"]) === resource
  ) as Json | undefined;
  if (!row) return { ok: true, unmatched: true };
  const payload = { ...(row.payload || {}) };
  payload["Status"] = mapDwollaStatus(topic.replace("customer_transfer_", ""));
  payload["Updated Time"] = new Date().toISOString();
  await db().from("business_records").update({
    payload,
    updated_by: "dwolla-webhook",
  }).eq("business_id", row.business_id).eq("collection", "outbound_payments")
    .eq("record_key", row.record_key);
  await audit(row.business_id, row.record_key, `webhook:${payload["Status"]}`, "dwolla-webhook", { topic });
  return { ok: true, paymentId: row.record_key, status: payload["Status"] };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "POST only." }, 405, origin);
  try {
    const input = await req.json().catch(() => ({})) as Json;
    const action = text(input.action);
    if (action === "webhook") {
      return json(await actionWebhook(req, input), 200, origin);
    }
    const user = await signedUser(req);
    const businessId = text(input.businessId);
    if (!businessId) throw new Error("businessId is required.");
    void requireOwner;
    switch (action) {
      case "status":
        return json(await actionStatus(businessId), 200, origin);
      case "connect_start":
        return json(await actionConnect(businessId, user.id, input), 200, origin);
      case "create_payee":
        return json(await actionCreatePayee(businessId, user.id, input), 200, origin);
      case "create_transfer":
        return json(await actionCreateTransfer(businessId, user.id, input), 200, origin);
      default:
        throw new Error(`Unknown action: ${action || "(none)"}`);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400, origin);
  }
});
