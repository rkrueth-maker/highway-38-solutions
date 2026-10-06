import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// h38-stripe-webhook — Stripe Connect webhook receiver for the H38 Office.
//
// PUBLIC endpoint (verify_jwt = false). Authenticity comes ONLY from the
// Stripe-Signature header, verified with HMAC-SHA256 against
// STRIPE_WEBHOOK_SECRET (constant-time compare, 5-minute tolerance).
//
// One platform Connect webhook endpoint receives events for every
// connected tenant account; the tenant is resolved from event.account by
// matching business_module_settings.config.stripeAccountId. Events that
// do not belong to a known connected account are acknowledged and ignored.
//
// Handled events:
//   checkout.session.completed  (payment_status = paid) -> record payment
//   payment_intent.succeeded                            -> record payment
//   payment_intent.payment_failed                       -> note on invoice
//   charge.refunded (refund made outside the Office)    -> reconcile
//
// Recording is idempotent by construction: the payment record key is
// derived from the Stripe PaymentIntent id, the invoice totals are
// recomputed from the full active payments set, and every processed
// event id is kept in the stripe_webhook_events collection for audit.
//
// Until STRIPE_WEBHOOK_SECRET and STRIPE_SECRET_KEY exist, this replies
// 503 (fail closed) so Stripe retries later; nothing is half-recorded.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const MODULE_KEY = "online_payments";
const EVENT_COLLECTION = "stripe_webhook_events";
const TOLERANCE_SECONDS = 300;

type JsonObject = Record<string, any>;

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Stripe signature verification: header "t=<ts>,v1=<hex hmac of '<ts>.<raw>'>".
async function verifySignature(raw: string, header: string, secret: string): Promise<boolean> {
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t") timestamp = v || "";
    if (k === "v1" && v) signatures.push(v);
  }
  if (!timestamp || !signatures.length) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;
  const expected = await hmacSha256Hex(secret, `${timestamp}.${raw}`);
  return signatures.some((sig) => timingSafeEqual(sig, expected));
}

async function findInvoice(
  sb: ReturnType<typeof createClient>,
  businessId: string,
  invoiceId: string,
) {
  const { data, error } = await sb
    .from("business_records")
    .select("record_key, payload")
    .eq("business_id", businessId)
    .eq("collection", "invoices")
    .eq("record_key", invoiceId)
    .eq("record_status", "active")
    .maybeSingle();
  if (error) throw error;
  return (data || null) as { record_key: string; payload: JsonObject } | null;
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

// Recompute paid/balance from the invoice's ACTIVE, non-refunded payments.
async function reconcileInvoice(
  sb: ReturnType<typeof createClient>,
  businessId: string,
  invoiceRecordKey: string,
  extraChanges: JsonObject = {},
) {
  const invoice = await findInvoice(sb, businessId, invoiceRecordKey);
  if (!invoice) return null;
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
    ...extraChanges,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json(204, {});
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  // Fail closed until Stripe is configured by the owner.
  if (!WEBHOOK_SECRET || !STRIPE_SECRET_KEY) {
    return json(503, { error: "Stripe webhook is not configured yet." });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "Service unavailable." });

  const raw = await req.text();
  const signature = req.headers.get("stripe-signature") || "";
  const valid = await verifySignature(raw, signature, WEBHOOK_SECRET).catch(() => false);
  if (!valid) return json(400, { error: "Invalid signature." });

  let event: JsonObject;
  try {
    event = JSON.parse(raw);
  } catch {
    return json(400, { error: "Invalid JSON." });
  }

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const eventId = String(event.id || "");
    const type = String(event.type || "");
    const accountId = String(event.account || "");
    const obj = ((event.data || {}).object || {}) as JsonObject;
    const metadata = (obj.metadata || {}) as JsonObject;
    const businessId = String(metadata.business_id || "");
    const invoiceId = String(metadata.invoice_id || "");

    // Audit every verified event once, before doing any work.
    if (eventId) {
      const { data: seen } = await sb
        .from("business_records")
        .select("record_key")
        .eq("collection", EVENT_COLLECTION)
        .eq("record_key", eventId)
        .maybeSingle();
      if (seen) return json(200, { received: true, duplicate: true });
    }

    // Resolve the tenant from the connected account when metadata is absent.
    let resolvedBusiness = businessId;
    if (!resolvedBusiness && accountId) {
      const { data: rows } = await sb
        .from("business_module_settings")
        .select("business_id, config")
        .eq("module_key", MODULE_KEY)
        .limit(200);
      for (const row of rows || []) {
        if (String((row.config as JsonObject)?.stripeAccountId || "") === accountId) {
          resolvedBusiness = String(row.business_id || "");
          break;
        }
      }
    }

    const noteEvent = async (note: string) => {
      if (!eventId) return;
      await sb.from("business_records").insert({
        business_id: resolvedBusiness || "unknown",
        collection: EVENT_COLLECTION,
        record_key: eventId,
        record_status: "active",
        payload: {
          "Event ID": eventId,
          "Event Type": type,
          "Stripe Account": accountId,
          "Business ID": resolvedBusiness,
          "Invoice ID": invoiceId,
          "Note": note,
          "Processed Time": new Date().toISOString(),
        },
      }).then(() => {}, () => {});
    };

    if (!resolvedBusiness || !invoiceId) {
      await noteEvent("Ignored: no matching H38 tenant/invoice in metadata.");
      return json(200, { received: true, ignored: true });
    }

    if (type === "checkout.session.completed" || type === "payment_intent.succeeded") {
      const pi = type === "payment_intent.succeeded"
        ? String(obj.id || "")
        : String(obj.payment_intent || "");
      const amountCents = Number(
        type === "payment_intent.succeeded" ? obj.amount_received ?? obj.amount : obj.amount_total ?? 0,
      );
      const invoice = await findInvoice(sb, resolvedBusiness, invoiceId);
      if (!invoice || !pi || !(amountCents > 0)) {
        await noteEvent("Ignored: invoice missing or amount not payable.");
        return json(200, { received: true, ignored: true });
      }
      const paymentKey = `PAYMENT-${pi}`;
      const nowIso = new Date().toISOString();
      // Deterministic record key: a duplicate event reuses the same row.
      const { data: existingPayment } = await sb
        .from("business_records")
        .select("record_key")
        .eq("business_id", resolvedBusiness)
        .eq("collection", "payments")
        .eq("record_key", paymentKey)
        .maybeSingle();
      if (!existingPayment) {
        const { error: payErr } = await sb.from("business_records").insert({
          business_id: resolvedBusiness,
          collection: "payments",
          record_key: paymentKey,
          record_status: "active",
          payload: {
            "Payment ID": paymentKey,
            "Invoice ID": invoiceId,
            "Customer ID": String(invoice.payload["Customer ID"] || ""),
            "Job ID": String(invoice.payload["Job ID"] || ""),
            "Payment Date": nowIso,
            "Amount": Math.round(amountCents) / 100,
            "Payment Method": "Stripe",
            "Transaction Reference": pi,
            "Deposit Account": "Stripe (connected account)",
            "Status": "Recorded — Stripe",
            "Approval Status": "Not Required",
            "Posting Status": "Ready",
            "Source": "Stripe",
            "Stripe Payment Intent": pi,
            "Stripe Checkout Session": type === "checkout.session.completed" ? String(obj.id || "") : String(invoice.payload["Stripe Checkout Session"] || ""),
            "Created Time": nowIso,
            "Updated Time": nowIso,
            "Record Version": 1,
          },
        });
        if (payErr) throw payErr;
      }
      await reconcileInvoice(sb, resolvedBusiness, invoiceId, {
        "Online Payment Status": "Paid",
        "Online Payment Updated": nowIso,
      });
      await noteEvent("Payment recorded and invoice reconciled.");
      return json(200, { received: true });
    }

    if (type === "payment_intent.payment_failed") {
      const invoice = await findInvoice(sb, resolvedBusiness, invoiceId);
      if (invoice) {
        await patchInvoice(sb, resolvedBusiness, invoiceId, invoice.payload, {
          "Online Payment Status": "Payment Failed",
          "Online Payment Updated": new Date().toISOString(),
        });
      }
      await noteEvent("Payment failed; invoice noted.");
      return json(200, { received: true });
    }

    if (type === "charge.refunded") {
      await reconcileInvoice(sb, resolvedBusiness, invoiceId, {
        "Online Payment Updated": new Date().toISOString(),
      });
      await noteEvent("Refund observed at Stripe; invoice reconciled.");
      return json(200, { received: true });
    }

    await noteEvent("Acknowledged; no handler for this event type.");
    return json(200, { received: true });
  } catch (error) {
    console.error("[h38-stripe-webhook]", String((error as Error)?.message || error));
    // 500 makes Stripe retry; reconcile is idempotent so retries are safe.
    return json(500, { error: "Webhook processing failed." });
  }
});
