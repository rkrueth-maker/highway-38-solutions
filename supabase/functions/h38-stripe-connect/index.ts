import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// h38-stripe-connect — owner-side Stripe Connect actions for the H38 Office.
//
// Each Office business (tenant) connects its OWN Stripe account (Connect
// standard). Payments settle directly to that business's bank account; H38
// never holds or routes customer funds. The Office only:
//   - creates the Connect onboarding link (account_link action),
//   - refreshes and stores connection status (account_status action),
//   - creates hosted Checkout links for open invoices (checkout_link),
//   - executes OWNER-INITIATED refunds (refund action) after the owner's
//     explicit in-app confirmation. Nothing here runs automatically and
//     nothing is ever triggered by Kit/AI.
//
// Hard gates, enforced server-side (the app UI also checks, but this is the
// authoritative one):
//   1. Caller must be a signed-in owner/administrator of the business.
//   2. business_module_settings row module_key="online_payments" must have
//      enabled === true before customers can be given a pay link.
//   3. The connected account must report charges_enabled before a checkout
//      link is created.
//   4. Refunds require an explicit confirmed:true from the owner's dialog.
//
// Required secrets (Supabase Edge Functions → Secrets — added by the owner,
// never by Kit):
//   STRIPE_SECRET_KEY   platform secret (sk_test_... / sk_live_...)
// Until that secret exists every action replies 503 with a clear message
// and touches nothing.

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const MODULE_KEY = "online_payments";
const MAX_BODY_BYTES = 64 * 1024;
const OFFICE_URL = "https://highway38solutions.com/commercial-app/index.html";

type JsonObject = Record<string, any>;

function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://highway38solutions.com";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  };
}
function json(origin: string | null, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: cors(origin) });
}
function clean(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}
function safeMessage(value: unknown): string {
  return String(value ?? "Stripe request failed.")
    .replace(/sk_(live|test)_[A-Za-z0-9]+/g, "[REDACTED]")
    .replace(/acct_[A-Za-z0-9]+/g, "[ACCT]")
    .slice(0, 500);
}

async function readBody(req: Request): Promise<JsonObject> {
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) throw new Error("Request too large.");
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function bearer(request: Request): string {
  const match = String(request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function signedInUser(request: Request): Promise<{ id: string }> {
  const token = bearer(request);
  if (!token) throw new Error("Supabase Auth session is required.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      apikey: SERVICE_KEY,
      "content-type": "application/json",
      "x-client-info": "h38-stripe-connect-v1",
    },
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.id !== "string" || !payload.id) {
    throw new Error("Supabase Auth session is invalid or expired.");
  }
  return { id: payload.id };
}

async function activeOwner(sb: ReturnType<typeof createClient>, userId: string, businessId: string) {
  const { data, error } = await sb
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

async function settingsRow(sb: ReturnType<typeof createClient>, businessId: string) {
  const { data, error } = await sb
    .from("business_module_settings")
    .select("enabled, config")
    .eq("business_id", businessId)
    .eq("module_key", MODULE_KEY)
    .maybeSingle();
  if (error) throw error;
  return (data || { enabled: false, config: {} }) as { enabled: boolean; config: JsonObject };
}

async function saveSettings(
  sb: ReturnType<typeof createClient>,
  businessId: string,
  enabled: boolean,
  config: JsonObject,
  userId: string,
) {
  const now = new Date().toISOString();
  const nextConfig = { ...config, updatedAt: now, updatedBy: userId };
  const { error } = await sb.from("business_module_settings").upsert(
    { business_id: businessId, module_key: MODULE_KEY, enabled: !!enabled, config: nextConfig, updated_at: now },
    { onConflict: "business_id,module_key" },
  );
  if (error) throw error;
  return nextConfig;
}

async function stripeRequest(
  path: string,
  params: URLSearchParams | null,
  accountId?: string,
): Promise<JsonObject> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(accountId ? { "Stripe-Account": accountId } : {}),
    },
    body: params ? params.toString() : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as JsonObject)?.error as JsonObject | undefined;
    throw new Error(safeMessage(err?.message || `Stripe error (HTTP ${res.status}).`));
  }
  return data as JsonObject;
}

async function loadInvoice(sb: ReturnType<typeof createClient>, businessId: string, invoiceId: string) {
  const { data, error } = await sb
    .from("business_records")
    .select("record_key, payload")
    .eq("business_id", businessId)
    .eq("collection", "invoices")
    .eq("record_key", invoiceId)
    .eq("record_status", "active")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Invoice not found in this business.");
  return data as { record_key: string; payload: JsonObject };
}

function invoiceBalance(payload: JsonObject): number {
  return Number(payload["Balance"] ?? payload["Balance Due"] ?? payload["Amount Due"] ?? payload["Open Balance"] ?? 0);
}

async function patchInvoice(
  sb: ReturnType<typeof createClient>,
  businessId: string,
  recordKey: string,
  payload: JsonObject,
  changes: JsonObject,
) {
  const next = {
    ...payload,
    ...changes,
    "Updated Time": new Date().toISOString(),
    "Record Version": Math.max(1, Number(payload["Record Version"] || 1)) + 1,
  };
  const { error } = await sb
    .from("business_records")
    .update({ payload: next })
    .eq("business_id", businessId)
    .eq("collection", "invoices")
    .eq("record_key", recordKey);
  if (error) throw error;
  return next;
}

// Recompute an invoice's paid/balance state from its ACTIVE payment records.
// Shared shape with h38-stripe-webhook; kept deterministic so retries and
// double events converge on the same numbers.
async function reconcileInvoice(
  sb: ReturnType<typeof createClient>,
  businessId: string,
  invoiceRecordKey: string,
) {
  const invoice = await loadInvoice(sb, businessId, invoiceRecordKey);
  const { data: payRows, error } = await sb
    .from("business_records")
    .select("payload")
    .eq("business_id", businessId)
    .eq("collection", "payments")
    .eq("record_status", "active")
    .limit(2000);
  if (error) throw error;
  const total = Number(invoice.payload["Total"] ?? 0);
  let paid = 0;
  for (const row of payRows || []) {
    const p = (row as JsonObject).payload as JsonObject;
    if (String(p["Invoice ID"] || "") !== invoiceRecordKey) continue;
    if (/refund/i.test(String(p["Status"] || ""))) continue;
    paid += Number(p["Amount"] || 0);
  }
  paid = Math.round(paid * 100) / 100;
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
  const nowIso = new Date().toISOString();
  return patchInvoice(sb, businessId, invoiceRecordKey, invoice.payload, {
    "Amount Paid": paid,
    "Balance": balance,
    "Balance Due": balance,
    "Amount Due": balance,
    "Open Balance": balance,
    "Status": balance <= 0.005 ? "Paid" : paid > 0 ? "Partially Paid" : String(invoice.payload["Status"] || "Open"),
    "Paid Time": balance <= 0.005 ? String(invoice.payload["Paid Time"] || nowIso) : (invoice.payload["Paid Time"] ?? ""),
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json(origin, 405, { status: "FAIL", error: "Method not allowed." });

  try {
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Payment service is unavailable.");
    const body = await readBody(req);
    const action = clean(body.action, 40);
    const businessId = clean(body.businessId || body.business_id, 60);
    if (!businessId) throw new Error("businessId is required.");

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const user = await signedInUser(req);
    await activeOwner(sb, user.id, businessId);
    const settings = await settingsRow(sb, businessId);
    const config = (settings.config || {}) as JsonObject;
    const accountId = clean(config.stripeAccountId, 80);

    // ---- connection status (works even before the platform key exists) ----
    if (action === "status") {
      return json(origin, 200, {
        status: "PASS",
        configured: !!STRIPE_SECRET_KEY,
        enabled: settings.enabled === true,
        connected: !!accountId,
        chargesEnabled: config.chargesEnabled === true,
        payoutsEnabled: config.payoutsEnabled === true,
        detailsSubmitted: config.detailsSubmitted === true,
      });
    }

    if (!STRIPE_SECRET_KEY) {
      return json(origin, 503, {
        status: "FAIL",
        error: "Online payments are not configured yet. The platform Stripe secret must be added before Stripe can be connected. Nothing was changed.",
      });
    }

    // ---- connect / continue onboarding ----
    if (action === "account_link") {
      let acct = accountId;
      if (!acct) {
        const params = new URLSearchParams();
        params.set("type", "standard");
        params.set("metadata[business_id]", businessId);
        const created = await stripeRequest("accounts", params);
        acct = String(created.id || "");
        if (!acct) throw new Error("Stripe did not return an account id.");
      }
      const linkParams = new URLSearchParams();
      linkParams.set("account", acct);
      linkParams.set("refresh_url", OFFICE_URL);
      linkParams.set("return_url", OFFICE_URL);
      linkParams.set("type", "account_onboarding");
      const link = await stripeRequest("account_links", linkParams);
      await saveSettings(sb, businessId, settings.enabled === true, { ...config, stripeAccountId: acct }, user.id);
      return json(origin, 200, { status: "PASS", url: String(link.url || ""), accountId: acct });
    }

    // ---- refresh connection status from Stripe ----
    if (action === "account_status") {
      if (!accountId) throw new Error("Stripe is not connected for this business yet.");
      const acct = await stripeRequest(`accounts/${accountId}`, null);
      const nextConfig = {
        ...config,
        stripeAccountId: accountId,
        chargesEnabled: acct.charges_enabled === true,
        payoutsEnabled: acct.payouts_enabled === true,
        detailsSubmitted: acct.details_submitted === true,
      };
      await saveSettings(sb, businessId, settings.enabled === true, nextConfig, user.id);
      return json(origin, 200, {
        status: "PASS",
        connected: true,
        chargesEnabled: nextConfig.chargesEnabled,
        payoutsEnabled: nextConfig.payoutsEnabled,
        detailsSubmitted: nextConfig.detailsSubmitted,
      });
    }

    // ---- create a hosted Checkout pay link for an open invoice ----
    if (action === "checkout_link") {
      if (settings.enabled !== true) {
        return json(origin, 403, {
          status: "FAIL",
          error: "Online payments are turned OFF for this business. Turn them on in Settings → Owner Controls → Online Payments first. Nothing was created.",
        });
      }
      if (!accountId || config.chargesEnabled !== true) {
        return json(origin, 409, {
          status: "FAIL",
          error: "Stripe is not fully connected yet (charges are not enabled). Finish Stripe onboarding, then refresh the connection status. Nothing was created.",
        });
      }
      const invoiceId = clean(body.invoiceId || body.invoice_id, 120);
      if (!invoiceId) throw new Error("invoiceId is required.");
      const invoice = await loadInvoice(sb, businessId, invoiceId);
      const balance = invoiceBalance(invoice.payload);
      if (!(balance > 0)) throw new Error("This invoice has no open balance. Nothing was created.");
      const amountCents = Math.round(balance * 100);

      // Customer email (for the Stripe receipt) when we have it.
      let receiptEmail = "";
      const customerId = clean(invoice.payload["Customer ID"], 120);
      if (customerId) {
        const { data: cust } = await sb
          .from("business_records")
          .select("payload")
          .eq("business_id", businessId)
          .eq("collection", "customers")
          .eq("record_key", customerId)
          .maybeSingle();
        receiptEmail = clean((cust?.payload as JsonObject | undefined)?.["Email"], 120);
      }

      const params = new URLSearchParams();
      params.set("mode", "payment");
      params.append("payment_method_types[]", "card");
      params.append("payment_method_types[]", "us_bank_account");
      params.set("line_items[0][quantity]", "1");
      params.set("line_items[0][price_data][currency]", "usd");
      params.set("line_items[0][price_data][unit_amount]", String(amountCents));
      params.set(
        "line_items[0][price_data][product_data][name]",
        `Invoice ${clean(invoice.payload["Invoice Number"], 60) || invoiceId}`,
      );
      params.set("metadata[business_id]", businessId);
      params.set("metadata[invoice_id]", invoiceId);
      params.set("payment_intent_data[metadata][business_id]", businessId);
      params.set("payment_intent_data[metadata][invoice_id]", invoiceId);
      if (receiptEmail) params.set("payment_intent_data[receipt_email]", receiptEmail);
      params.set("success_url", `${OFFICE_URL}?payment=success&invoice=${encodeURIComponent(invoiceId)}`);
      params.set("cancel_url", `${OFFICE_URL}?payment=cancelled&invoice=${encodeURIComponent(invoiceId)}`);
      const session = await stripeRequest("checkout/sessions", params, accountId);
      const url = String(session.url || "");
      if (!url) throw new Error("Stripe did not return a checkout link.");

      await patchInvoice(sb, businessId, invoiceId, invoice.payload, {
        "Online Payment Status": "Link Open",
        "Stripe Checkout Session": String(session.id || ""),
        "Online Payment Link": url,
        "Online Payment Updated": new Date().toISOString(),
      });
      return json(origin, 200, { status: "PASS", url, sessionId: String(session.id || "") });
    }

    // ---- owner-initiated refund (explicit in-app confirmation required) ----
    if (action === "refund") {
      if (body.confirmed !== true) {
        return json(origin, 403, {
          status: "FAIL",
          error: "Refused: refunds require the owner to confirm in the app first. Nothing was refunded.",
        });
      }
      if (!accountId) throw new Error("Stripe is not connected for this business.");
      const invoiceId = clean(body.invoiceId || body.invoice_id, 120);
      if (!invoiceId) throw new Error("invoiceId is required.");
      const { data: payRows, error } = await sb
        .from("business_records")
        .select("record_key, payload")
        .eq("business_id", businessId)
        .eq("collection", "payments")
        .eq("record_status", "active")
        .limit(2000);
      if (error) throw error;
      const payment = (payRows || []).find((r) => {
        const p = (r as JsonObject).payload as JsonObject;
        return String(p["Invoice ID"] || "") === invoiceId &&
          String(p["Source"] || "") === "Stripe" &&
          !/refund/i.test(String(p["Status"] || ""));
      }) as { record_key: string; payload: JsonObject } | undefined;
      if (!payment) throw new Error("No Stripe payment was found for this invoice. Nothing was refunded.");
      const pi = clean(payment.payload["Stripe Payment Intent"] || payment.payload["Transaction Reference"], 120);
      if (!pi) throw new Error("The Stripe payment reference is missing. Nothing was refunded.");

      const params = new URLSearchParams();
      params.set("payment_intent", pi);
      params.set("metadata[business_id]", businessId);
      params.set("metadata[invoice_id]", invoiceId);
      params.set("metadata[refunded_by]", user.id);
      const refund = await stripeRequest("refunds", params, accountId);

      const { error: updErr } = await sb
        .from("business_records")
        .update({
          payload: {
            ...payment.payload,
            "Status": "Refunded",
            "Stripe Refund ID": String(refund.id || ""),
            "Refunded Time": new Date().toISOString(),
            "Updated Time": new Date().toISOString(),
            "Record Version": Math.max(1, Number(payment.payload["Record Version"] || 1)) + 1,
          },
        })
        .eq("business_id", businessId)
        .eq("collection", "payments")
        .eq("record_key", payment.record_key);
      if (updErr) throw updErr;
      const next = await reconcileInvoice(sb, businessId, invoiceId);
      return json(origin, 200, {
        status: "PASS",
        refundId: String(refund.id || ""),
        invoiceBalance: next["Balance"],
      });
    }

    return json(origin, 400, { status: "FAIL", error: `Unknown action "${action}".` });
  } catch (error) {
    // Auth failures surface as 401 (sign-in state); everything else 500.
    const msg = safeMessage(error);
    return json(origin, /Supabase Auth session/.test(msg) ? 401 : 500, { status: "FAIL", error: msg });
  }
});
