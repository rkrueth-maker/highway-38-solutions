import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// h38-send-sms — server-side SMS executor for the H38 Office.
// The browser NEVER calls a provider directly and never holds API keys.
// Flow: Office UI (sms-provider.js) validates + queues for owner approval.
// Only after an owner approves (Lane 2) does an approved executor POST here.
//
// Required secrets (Supabase project settings → Edge Functions → Secrets):
//   SMS_PROVIDER            telnyx | twilio | plivo   (default: telnyx)
//   SMS_FROM_NUMBER         E.164 sender, e.g. +12185550100
//   TELNYX_API_KEY
//   TELNYX_MESSAGING_PROFILE_ID   (optional but recommended)
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN
//   PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN
//
// Request body:
//   { to, body, businessId, threadId, ownerApproved, approvedBy, purpose }
// Refuses to send unless ownerApproved === true and approvedBy is present.
// STOP / opt-out handling: carrier-level suppression lists are automatic at the
// provider; inbound STOP webhooks are handled below (maybeHandleInbound) — a
// STOP/QUIT/CANCEL/END/UNSUBSCRIBE reply flips matching smsThreads rows to
// 'Opted Out' so the Office never texts them again.

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PROVIDER = (Deno.env.get("SMS_PROVIDER") || "telnyx").toLowerCase();
const FROM_NUMBER = Deno.env.get("SMS_FROM_NUMBER") || "";

const MAX_SEGMENTS = 5;

function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://highway38solutions.com";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function e164(to: string): string | null {
  const d = String(to || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") return "+" + d;
  if (d.length === 10) return "+1" + d;
  return null;
}

function segmentCount(body: string): number {
  // Rough estimate: GSM-7 single 160 / concat 153; UCS-2 single 70 / concat 67.
  // deno-lint-ignore no-control-regex
  const gsm = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà]*$/.test(body);
  const per = gsm ? (body.length <= 160 ? 160 : 153) : (body.length <= 70 ? 70 : 67);
  return Math.max(1, Math.ceil(body.length / per));
}

async function sendViaTelnyx(to: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const key = Deno.env.get("TELNYX_API_KEY") || "";
  if (!key) return { ok: false, error: "TELNYX_API_KEY is not set." };
  const profileId = Deno.env.get("TELNYX_MESSAGING_PROFILE_ID") || "";
  const payload: Record<string, string> = { from: FROM_NUMBER, to, text };
  if (profileId) payload.messaging_profile_id = profileId;
  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `Telnyx ${res.status}: ${JSON.stringify(data).slice(0, 300)}` };
  return { ok: true, id: data?.data?.id || "" };
}

async function sendViaTwilio(to: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
  const token = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  if (!sid || !token) return { ok: false, error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set." };
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${token}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: FROM_NUMBER, To: to, Body: text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `Twilio ${res.status}: ${String(data?.message || "").slice(0, 300)}` };
  return { ok: true, id: data?.sid || "" };
}

async function sendViaPlivo(to: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  const authId = Deno.env.get("PLIVO_AUTH_ID") || "";
  const authToken = Deno.env.get("PLIVO_AUTH_TOKEN") || "";
  if (!authId || !authToken) return { ok: false, error: "PLIVO_AUTH_ID / PLIVO_AUTH_TOKEN are not set." };
  const res = await fetch(`https://api.plivo.com/v1/Account/${authId}/Message/`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${authId}:${authToken}`),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ src: FROM_NUMBER, dst: to, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `Plivo ${res.status}: ${String(data?.error || "").slice(0, 300)}` };
  return { ok: true, id: data?.message_uuid || "" };
}

// Inbound webhook probe: Telnyx sends JSON {data:{event_type:'message.received',
// payload:{from:{phone_number},text}}}; Twilio sends form-encoded {From,Body}.
// STOP/QUIT/CANCEL/END/UNSUBSCRIBE flips matching smsThreads rows to 'Opted Out'.
// Returns a Response when this request was an inbound webhook, else null.
async function maybeHandleInbound(req: Request, headers: Record<string, string>): Promise<Response | null> {
  const ct = req.headers.get("content-type") || "";
  let from = "", text = "", isWebhook = false;
  if (ct.includes("json")) {
    const b = await req.json().catch(() => ({}));
    const d = b?.data || {};
    const evt = d.event_type || b?.event_type || "";
    if (evt === "message.received") {
      const p = d.payload || b?.payload || {};
      from = p?.from?.phone_number || p?.from || "";
      text = p?.text || "";
      isWebhook = true;
    }
  } else if (ct.includes("form-urlencoded")) {
    const form = await req.formData().catch(() => null);
    if (form && form.get("From")) {
      from = String(form.get("From"));
      text = String(form.get("Body") || "");
      isWebhook = true;
    }
  }
  if (!isWebhook) return null;
  const t = text.trim().toLowerCase();
  const stop = /^(stop|quit|cancel|end|unsubscribe)\b/.test(t);
  // Shared-inbox ingestion (Wave 3 tail #10): a normal customer reply used to
  // be acknowledged and thrown away — the crew never saw it. Now it lands in
  // the business's shared inbox as an smsMessages row on the customer's
  // thread (smsThreads), visible to every crew member of that business.
  // Business resolution: the provider number is deployment-wide, so the
  // business is resolved from the sender's number — the business holding a
  // thread (most recent wins) or a customer record with that phone.
  if (!stop && text.trim() && SUPABASE_URL && SERVICE_KEY) {
    try {
      const recorded = await recordInboundText(from, text);
      if (recorded) {
        return new Response(JSON.stringify({ ok: true, optOut: false, recorded: true, threadId: recorded.threadId, businessId: recorded.businessId }), { headers });
      }
    } catch {
      // Ingestion must never break the webhook acknowledgement.
    }
  }
  if (stop && SUPABASE_URL && SERVICE_KEY) {
    try {
      const sb = createClient(SUPABASE_URL, SERVICE_KEY);
      const digits = from.replace(/\D/g, "").slice(-10);
      let updated = 0;
      if (digits) {
        const found = await sb.from("business_records")
          .select("id,payload")
          .eq("collection", "smsThreads")
          .eq("record_status", "active")
          .limit(200);
        for (const row of found.data || []) {
          const num = String((row.payload as Record<string, unknown>)?.["Customer Number"] || "").replace(/\D/g, "").slice(-10);
          if (num && num === digits) {
            const payload = { ...((row.payload as Record<string, unknown>) || {}), "Consent Status": "Opted Out" };
            await sb.from("business_records").update({ payload }).eq("id", row.id);
            updated++;
          }
        }
      }
      return new Response(JSON.stringify({ ok: true, optOut: true, updated }), { headers });
    } catch {
      // fall through to plain acknowledgement
    }
  }
  return new Response(JSON.stringify({ ok: true, optOut: stop }), { headers });
}

// Record one inbound customer text into the shared inbox. Returns the thread
// and business it landed on, or null when the sender's number cannot be
// attributed to any business (unknown numbers are acknowledged, not stored).
async function recordInboundText(from: string, bodyText: string): Promise<{ threadId: string; businessId: string } | null> {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const digits = from.replace(/\D/g, "").slice(-10);
  if (!digits) return null;
  const last10 = (value: unknown) => String(value || "").replace(/\D/g, "").slice(-10);

  // 1) Resolve the business from existing threads for this number.
  let businessId = "";
  let threadRow: { id: string; payload: Record<string, unknown> } | null = null;
  const threadScan = await sb.from("business_records")
    .select("id,business_id,payload,updated_at")
    .eq("collection", "smsThreads")
    .eq("record_status", "active")
    .order("updated_at", { ascending: false })
    .limit(500);
  for (const row of threadScan.data || []) {
    const payload = (row.payload || {}) as Record<string, unknown>;
    if (last10(payload["Customer Number"]) === digits) {
      if (!businessId) { businessId = String(row.business_id || ""); threadRow = { id: row.id, payload }; }
      break;
    }
  }

  // 2) Fall back to a customer record carrying this phone.
  let customerId = "";
  let customerName = "";
  if (!businessId) {
    const custScan = await sb.from("business_records")
      .select("business_id,record_key,payload")
      .eq("collection", "customers")
      .eq("record_status", "active")
      .limit(1000);
    for (const row of custScan.data || []) {
      const payload = (row.payload || {}) as Record<string, unknown>;
      if (last10(payload["Phone"]) === digits || last10(payload["Mobile Phone"]) === digits) {
        businessId = String(row.business_id || "");
        customerId = String(payload["Customer ID"] || row.record_key || "");
        customerName = String(payload["Customer Name"] || "");
        break;
      }
    }
  }
  if (!businessId) return null;

  // Attribution user for created_by/updated_by (NOT NULL FK): an active
  // owner/admin member of the resolved business.
  const member = await sb.from("business_memberships")
    .select("auth_user_id,role")
    .eq("business_id", businessId)
    .eq("status", "active")
    .limit(10);
  const members = member.data || [];
  const actor = (members.find((m: { role?: string }) => m.role === "owner") || members[0]) as { auth_user_id?: string } | undefined;
  const actorId = actor?.auth_user_id || "";
  if (!actorId) return null;

  const nowIso = new Date().toISOString();
  // Thread: reuse the resolved one; otherwise find this business's newest
  // thread for the number; otherwise open a fresh shared thread.
  if (threadRow && String((threadRow as { business_id?: string }).business_id || businessId) !== businessId) threadRow = null;
  if (!threadRow) {
    const own = (threadScan.data || []).filter((r: { business_id?: string }) => String(r.business_id || "") === businessId);
    for (const row of own) {
      const payload = (row.payload || {}) as Record<string, unknown>;
      if (last10(payload["Customer Number"]) === digits) { threadRow = { id: row.id, payload }; break; }
    }
  }
  let threadId = "";
  let threadPayload: Record<string, unknown> = {};
  if (threadRow) {
    threadPayload = { ...(threadRow.payload || {}) };
    threadId = String(threadPayload["SMS Thread ID"] || "");
    customerId = customerId || String(threadPayload["Customer ID"] || "");
  }
  if (!customerId || !customerName) {
    const custScan2 = await sb.from("business_records")
      .select("record_key,payload")
      .eq("business_id", businessId)
      .eq("collection", "customers")
      .eq("record_status", "active")
      .limit(1000);
    for (const row of custScan2.data || []) {
      const payload = (row.payload || {}) as Record<string, unknown>;
      if (last10(payload["Phone"]) === digits || last10(payload["Mobile Phone"]) === digits) {
        if (!customerId) customerId = String(payload["Customer ID"] || row.record_key || "");
        if (!customerName) customerName = String(payload["Customer Name"] || "");
        break;
      }
    }
  }
  const jobId = String(threadPayload["Job ID"] || "");
  if (!threadRow) {
    threadId = `SMS-THREAD-IN-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, "0")}`;
    threadPayload = {
      "SMS Thread ID": threadId,
      "Business ID": businessId,
      "Provider": PROVIDER,
      "Customer Number": from,
      "Customer ID": customerId,
      "Job ID": jobId,
      "Consent Status": "Consented",
      "Status": "New customer text — Unread",
      "Last Message Time": nowIso,
      "Record Version": 1,
    };
    const ins = await sb.from("business_records").insert({
      business_id: businessId, collection: "smsThreads", record_key: threadId,
      record_status: "active", created_by: actorId, updated_by: actorId, payload: threadPayload,
    });
    if (ins.error) return null;
  } else {
    threadPayload["Status"] = "New customer text — Unread";
    threadPayload["Last Message Time"] = nowIso;
    threadPayload["Record Version"] = (Number(threadPayload["Record Version"]) || 0) + 1;
    if (customerId && !threadPayload["Customer ID"]) threadPayload["Customer ID"] = customerId;
    await sb.from("business_records").update({ payload: threadPayload, updated_by: actorId }).eq("id", threadRow.id);
  }

  const messageId = `SMS-MESSAGE-IN-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, "0")}`;
  const messagePayload = {
    "SMS Message ID": messageId,
    "Business ID": businessId,
    "SMS Thread ID": threadId,
    "Customer ID": customerId,
    "Job ID": jobId,
    "Customer Number": from,
    "Direction": "Inbound",
    "Body": bodyText.slice(0, 2000),
    "Author": customerName || from,
    "Consent Status": String(threadPayload["Consent Status"] || "Consented"),
    "Status": "Unread — New",
    "Created Time": nowIso,
    "Record Version": 1,
  };
  const msgIns = await sb.from("business_records").insert({
    business_id: businessId, collection: "smsMessages", record_key: messageId,
    record_status: "active", created_by: actorId, updated_by: actorId, payload: messagePayload,
  });
  if (msgIns.error) return null;
  return { threadId, businessId };
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers });

  // Inbound provider webhooks (STOP/HELP) are probed on a cloned request so the
  // outbound body below stays readable. Returns null when this isn't a webhook.
  try {
    const inbound = await maybeHandleInbound(req.clone(), headers);
    if (inbound) return inbound;
  } catch {
    // A broken probe must never block outbound sends.
  }

  try {
    const body = await req.json().catch(() => ({}));
    const to = e164(body.to);
    const text = String(body.body || "").trim();
    const businessId = String(body.businessId || "").trim();
    const threadId = String(body.threadId || "").trim();
    const ownerApproved = body.ownerApproved === true;
    const approvedBy = String(body.approvedBy || "").trim();
    const purpose = String(body.purpose || "Customer text").slice(0, 120);

    if (!ownerApproved || !approvedBy) {
      return new Response(JSON.stringify({ error: "Owner approval is required before any SMS is sent." }), { status: 403, headers });
    }
    if (!to) return new Response(JSON.stringify({ error: "A valid US 'to' number is required." }), { status: 400, headers });
    if (!text) return new Response(JSON.stringify({ error: "Message body is required." }), { status: 400, headers });
    if (segmentCount(text) > MAX_SEGMENTS) {
      return new Response(JSON.stringify({ error: `Message exceeds ${MAX_SEGMENTS} segments.` }), { status: 400, headers });
    }
    if (!FROM_NUMBER) return new Response(JSON.stringify({ error: "SMS_FROM_NUMBER is not configured." }), { status: 500, headers });
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ error: "Server is not configured." }), { status: 500, headers });
    }

    let result: { ok: boolean; id?: string; error?: string };
    if (PROVIDER === "twilio") result = await sendViaTwilio(to, text);
    else if (PROVIDER === "plivo") result = await sendViaPlivo(to, text);
    else result = await sendViaTelnyx(to, text);

    // Record the outcome on the smsThreads row (best effort; send result is authoritative).
    try {
      const sb = createClient(SUPABASE_URL, SERVICE_KEY);
      if (businessId && threadId) {
        const found = await sb.from("business_records")
          .select("id,payload")
          .eq("business_id", businessId)
          .eq("collection", "smsThreads")
          .eq("record_status", "active")
          .filter("payload->>'SMS Thread ID'", "eq", threadId)
          .limit(1)
          .maybeSingle();
        if (!found.error && found.data) {
          const payload = { ...(found.data.payload || {}) };
          payload["Status"] = result.ok ? "Sent" : "Failed";
          payload["Provider Message ID"] = result.id || "";
          payload["Send Error"] = result.ok ? "" : (result.error || "Unknown error");
          payload["Sent Time"] = new Date().toISOString();
          payload["Approved By"] = approvedBy;
          payload["Purpose"] = purpose;
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
