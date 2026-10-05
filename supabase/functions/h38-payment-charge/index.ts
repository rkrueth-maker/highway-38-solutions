import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// h38-payment-charge — server-side card charge executor for the H38 Office.
// The browser NEVER calls Stripe directly and never holds the secret key.
// Flow: Office UI (card-vault.js) confirms with the owner, then (for
// auto-charge) an owner approves the queued request. Only the approved
// executor POSTs here with ownerApproved === true.
//
// Required secrets (Supabase project settings → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY      sk_live_... or sk_test_...
//
// Request body:
//   { businessId, invoiceId, paymentMethodToken, amountCents, currency,
//     description, customerLabel, ownerApproved, approvedBy }
// Refuses to charge unless ownerApproved === true and approvedBy is present.
// Writes a receipt row to business_records (collection 'payments' is handled
// client-side; this function only moves money and returns the transaction id).

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

const MAX_BODY_BYTES = 64 * 1024;

function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://highway38solutions.com";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function json(origin: string | null, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: cors(origin) });
}
function safeMessage(value: unknown): string {
  return String(value ?? "Payment failed.")
    .replace(/sk_(live|test)_[A-Za-z0-9]+/g, "[REDACTED]")
    .replace(/pm_[A-Za-z0-9_]+/g, "[REDACTED_PM]")
    .slice(0, 500);
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) throw new Error("Request too large.");
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) throw new Error("Request too large.");
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

function looksLikeRawPan(value: string): boolean {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 13 && digits.length <= 19 && /^\d+$/.test(digits);
}

async function stripeRequest(path: string, params: URLSearchParams): Promise<unknown> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
    throw new Error(safeMessage(err?.message || `Stripe error (HTTP ${res.status}).`));
  }
  return data;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json(origin, 405, { status: "FAIL", error: "Method not allowed." });

  try {
    if (!STRIPE_SECRET_KEY) {
      return json(origin, 503, {
        status: "FAIL",
        error: "Card processing is not configured. The owner must deploy STRIPE_SECRET_KEY before live charges work.",
      });
    }
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Payment service is unavailable.");

    const body = await readBody(req);
    const ownerApproved = body.ownerApproved === true;
    const approvedBy = String(body.approvedBy || "").trim();
    if (!ownerApproved || !approvedBy) {
      return json(origin, 403, {
        status: "FAIL",
        error: "Refused: card charges require explicit owner approval. Nothing was charged.",
      });
    }

    const businessId = String(body.businessId || "").trim();
    const invoiceId = String(body.invoiceId || "").trim();
    const token = String(body.paymentMethodToken || "").trim();
    const amountCents = Math.round(Number(body.amountCents) || 0);
    const currency = String(body.currency || "usd").trim().toLowerCase() || "usd";
    const description = String(body.description || "H38 Office invoice charge").slice(0, 200);

    if (!businessId) throw new Error("businessId is required.");
    if (!invoiceId) throw new Error("invoiceId is required.");
    if (!token) throw new Error("paymentMethodToken is required.");
    if (looksLikeRawPan(token)) {
      return json(origin, 400, {
        status: "FAIL",
        error: "Refused: raw card numbers are never accepted. Only processor tokens may be charged.",
      });
    }
    if (!(amountCents > 0)) throw new Error("amountCents must be greater than zero.");
    if (amountCents > 100000000) throw new Error("Charge amount exceeds the per-transaction limit.");

    // Verify the invoice still has an open balance before moving money.
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: invRows, error: invError } = await sb
      .from("business_records")
      .select("payload")
      .eq("business_id", businessId)
      .eq("collection", "invoices")
      .eq("record_status", "active")
      .limit(2000);
    if (invError) throw new Error("Could not verify the invoice before charging.");
    const invoice = (invRows || [])
      .map((r) => (r as Record<string, unknown>).payload as Record<string, unknown>)
      .find((p) => String(p?.["Invoice ID"] || p?.invoiceId) === invoiceId);
    if (!invoice) throw new Error("Invoice not found in this business.");
    const balance = Number(
      invoice["Balance"] ?? invoice["Balance Due"] ?? invoice["Amount Due"] ?? invoice["Open Balance"] ?? 0,
    );
    if (!(balance > 0)) throw new Error("This invoice has no open balance. Nothing was charged.");
    if (amountCents / 100 > balance + 0.005) {
      throw new Error("Charge amount exceeds the open invoice balance. Nothing was charged.");
    }

    // Create and confirm a PaymentIntent off-session with the stored method.
    const createParams = new URLSearchParams();
    createParams.set("amount", String(amountCents));
    createParams.set("currency", currency);
    createParams.set("payment_method", token);
    createParams.set("confirm", "true");
    createParams.set("off_session", "true");
    createParams.set("description", description);
    createParams.set("metadata[business_id]", businessId);
    createParams.set("metadata[invoice_id]", invoiceId);
    createParams.set("metadata[approved_by]", approvedBy.slice(0, 80));

    const pi = (await stripeRequest("payment_intents", createParams)) as Record<string, unknown>;
    const piStatus = String(pi.status || "");
    if (piStatus !== "succeeded") {
      const lastErr = (pi.last_payment_error as Record<string, unknown> | undefined)?.message;
      return json(origin, 402, {
        status: "FAIL",
        error: safeMessage(lastErr || `Card charge was not completed (status: ${piStatus}). No money moved.`),
      });
    }

    // Audit log: charge receipt (no card details, token redacted).
    try {
      await sb.from("business_records").insert({
        business_id: businessId,
        collection: "paymentReceipts",
        record_key: `CHARGE-${Date.now()}-${String(pi.id || "").slice(-6)}`,
        record_status: "active",
        payload: {
          "Receipt ID": `CHARGE-${Date.now()}`,
          "Business ID": businessId,
          "Invoice ID": invoiceId,
          "Amount": amountCents / 100,
          "Currency": currency.toUpperCase(),
          "Transaction ID": String(pi.id || ""),
          "Approved By": approvedBy,
          "Description": description,
          "Processed Time": new Date().toISOString(),
        },
      });
    } catch {
      // Audit failure must not mask a completed charge; client reconciles.
    }

    return json(origin, 200, {
      status: "PASS",
      transactionId: String(pi.id || ""),
      paymentIntentId: String(pi.id || ""),
      amountCharged: amountCents / 100,
    });
  } catch (error) {
    return json(origin, 500, { status: "FAIL", error: safeMessage(error) });
  }
});
