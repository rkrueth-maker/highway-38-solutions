import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// h38-send-email — server-side email executor for the H38 Office.
// The browser NEVER holds API keys. Flow mirrors h38-send-sms:
//   1. Office UI composes a draft (app-09.js) → status 'Draft'.
//   2. Owner taps Send → confirm → POST here with ownerApproved=true.
//   3. This function sends via the configured provider and marks the
//      emailThreads row Sent (or Failed with the reason).
//
// Required secrets (Supabase → Edge Functions → Secrets):
//   EMAIL_PROVIDER            resend (default) | sendgrid
//   EMAIL_FROM_ADDRESS        e.g. office@highway38solutions.com
//   RESEND_API_KEY            (when EMAIL_PROVIDER=resend)
//   SENDGRID_API_KEY          (when EMAIL_PROVIDER=sendgrid)
//
// Request body:
//   { to, subject, body, businessId, threadId, ownerApproved, approvedBy }
// Refuses unless ownerApproved === true and approvedBy is present.

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PROVIDER = (Deno.env.get("EMAIL_PROVIDER") || "resend").toLowerCase();
const FROM_ADDRESS = Deno.env.get("EMAIL_FROM_ADDRESS") || "";

function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://highway38solutions.com";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function validEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "").trim());
}

async function sendViaResend(to: string, subject: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = Deno.env.get("RESEND_API_KEY") || "";
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set." };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${JSON.stringify(data).slice(0, 300)}` };
  return { ok: true, id: String(data?.id || "") };
}

async function sendViaSendgrid(to: string, subject: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = Deno.env.get("SENDGRID_API_KEY") || "";
  if (!key) return { ok: false, error: "SENDGRID_API_KEY is not set." };
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_ADDRESS },
      subject,
      content: [{ type: "text/plain", value: text }],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `SendGrid ${res.status}: ${t.slice(0, 300)}` };
  }
  return { ok: true, id: res.headers.get("x-message-id") || "" };
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers });

  try {
    const body = await req.json().catch(() => ({}));
    const to = String(body.to || "").trim();
    const subject = String(body.subject || "").trim();
    const text = String(body.body || "").trim();
    const businessId = String(body.businessId || "").trim();
    const threadId = String(body.threadId || "").trim();
    const ownerApproved = body.ownerApproved === true;
    const approvedBy = String(body.approvedBy || "").trim();

    if (!ownerApproved || !approvedBy) {
      return new Response(JSON.stringify({ error: "Owner approval is required before any email is sent." }), { status: 403, headers });
    }
    if (!validEmail(to)) return new Response(JSON.stringify({ error: "A valid recipient email address is required." }), { status: 400, headers });
    if (!subject) return new Response(JSON.stringify({ error: "Subject is required." }), { status: 400, headers });
    if (!text) return new Response(JSON.stringify({ error: "Message body is required." }), { status: 400, headers });
    if (!FROM_ADDRESS) return new Response(JSON.stringify({ error: "EMAIL_FROM_ADDRESS is not configured." }), { status: 500, headers });
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ error: "Server is not configured." }), { status: 500, headers });
    }

    let result: { ok: boolean; id?: string; error?: string };
    if (PROVIDER === "sendgrid") result = await sendViaSendgrid(to, subject, text);
    else result = await sendViaResend(to, subject, text);

    // Record the outcome on the emailThreads row (best effort).
    try {
      const sb = createClient(SUPABASE_URL, SERVICE_KEY);
      if (businessId && threadId) {
        const found = await sb.from("business_records")
          .select("id,payload")
          .eq("business_id", businessId)
          .eq("collection", "emailThreads")
          .eq("record_status", "active")
          .filter("payload->>'Email Thread ID'", "eq", threadId)
          .limit(1)
          .maybeSingle();
        if (!found.error && found.data) {
          const payload = { ...(found.data.payload || {}) };
          payload["Status"] = result.ok ? "Sent" : "Failed";
          payload["Provider Message ID"] = result.id || "";
          payload["Send Error"] = result.ok ? "" : (result.error || "Unknown error");
          payload["Sent Time"] = new Date().toISOString();
          payload["Approved By"] = approvedBy;
          await sb.from("business_records").update({ payload }).eq("id", found.data.id);
        }
      }
    } catch {
      // Outcome logging must never mask the send result.
    }

    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error || "Send failed." }), { status: 502, headers });
    }
    return new Response(JSON.stringify({ ok: true, provider: PROVIDER, providerMessageId: result.id || "" }), { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error)?.message || err) }), { status: 500, headers });
  }
});
