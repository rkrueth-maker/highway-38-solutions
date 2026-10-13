// h38-review-scheduler — server-side drain for due review-request texts.
//
// The Office queues auto review requests as smsThreads rows with
// Status='Approved — Queued to Send' (the owner pre-approved this one message
// category by enabling the 'Auto-send review requests' owner control) and a
// 'Deliver After' timestamp. The in-app processor only runs while the Office
// is open in a browser; this scheduler is the always-on equivalent, invoked
// on a 15-minute cron by a workspace runner.
//
// Per due row, in order:
//   (i)   owner control auto_send_review_requests must be ON for the business
//   (ii)  atomic claim: payload Status -> 'Sending', conditioned on the row
//         still being 'Approved — Queued to Send' (same update style as
//         h38-send-sms's outcome writeback); proceed only if exactly 1 row
//         changed
//   (iii) consent/STOP: mirrors h38-send-sms — a STOP reply flips matching
//         smsThreads rows' 'Consent Status' to 'Opted Out', and the client
//         consent lookup (smsConsentFor) treats ANY thread for the number
//         showing 'Opted Out' as opted out. Opted-out rows are marked
//         Status='Opted Out' and never sent.
//   (iv)  quiet hours in the business timezone (businesses.timezone):
//         21:00–08:00 local releases the claim back to
//         'Approved — Queued to Send' and skips
//   (v)   send via the same provider code path as h38-send-sms (helpers
//         copied from it — h38-send-sms itself is NOT called over HTTP: it
//         requires an owner-approval claim this scheduler cannot make).
//         Missing provider credentials -> 'Failed' with
//         Send Error 'provider not configured'.
//   (vi)  write back Status/'Sent Time'/'Provider Message ID'/'Send Error'
//         in h38-send-sms's exact payload shape, plus a business_proof_log
//         row per send attempt.
//
// Caller auth: kit-proactive-engine pattern verbatim — verify_jwt=false plus
// the x-h38-nightly-key header checked against the 'h38-review-scheduler'
// row in h38_internal_job_secrets (401 without it).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUILD = "20261012-review-scheduler-1";
const KIT_TAG = "[ai:kit]";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const PROVIDER = (Deno.env.get("SMS_PROVIDER") || "telnyx").toLowerCase();
const FROM_NUMBER = Deno.env.get("SMS_FROM_NUMBER") || "";
const MAX_SEGMENTS = 5;
const MAX_ROWS_PER_RUN = 50;

// ---- Provider send path (copied from h38-send-sms) ----

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

function providerConfigured(): boolean {
  if (!FROM_NUMBER) return false;
  if (PROVIDER === "twilio") {
    return !!(Deno.env.get("TWILIO_ACCOUNT_SID") && Deno.env.get("TWILIO_AUTH_TOKEN"));
  }
  if (PROVIDER === "plivo") {
    return !!(Deno.env.get("PLIVO_AUTH_ID") && Deno.env.get("PLIVO_AUTH_TOKEN"));
  }
  return !!Deno.env.get("TELNYX_API_KEY");
}

async function sendSms(to: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (PROVIDER === "twilio") return sendViaTwilio(to, text);
  if (PROVIDER === "plivo") return sendViaPlivo(to, text);
  return sendViaTelnyx(to, text);
}

// ---- Internal caller gate (kit-proactive-engine pattern, verbatim) ----
// The caller must present the x-h38-nightly-key header matching the
// 'h38-review-scheduler' row in h38_internal_job_secrets. verify_jwt
// stays false because the scheduler (workspace cron runner) sends no
// user JWT — this header check is the authentication.
const JOB_SECRET_NAME = "h38-review-scheduler";

async function validSecret(req: Request, supabase: any): Promise<boolean> {
  const got = String(req.headers.get("x-h38-nightly-key") ?? "").trim();
  if (!got) return false;
  const { data } = await supabase
    .from("h38_internal_job_secrets")
    .select("secret_value")
    .eq("name", JOB_SECRET_NAME)
    .maybeSingle();
  return !!data?.secret_value && got === data.secret_value;
}

// ---- Business helpers ----

const text = (v: unknown, n = 2000): string => String(v ?? "").trim().slice(0, n);

// The toggle lives in Owner Controls (commercial-app/owner-controls.js):
// localStorage + a SAVE_FEATURE_TOGGLES queueOperation. Server-side mirrors
// checked in order: business_module_settings, business_records
// ownerControls / feature toggles records, businesses.module_config.
// Default is OFF (matches the client default) when no source enables it.
async function autoSendEnabled(sb: any, businessId: string, moduleConfig: any): Promise<boolean> {
  try {
    const ms = await sb.from("business_module_settings")
      .select("enabled")
      .eq("business_id", businessId)
      .eq("module_key", "auto_send_review_requests")
      .maybeSingle();
    if (!ms.error && ms.data && ms.data.enabled === true) return true;
  } catch { /* fall through to record sources */ }
  try {
    const recs = await sb.from("business_records")
      .select("collection,payload")
      .eq("business_id", businessId)
      .eq("record_status", "active")
      .in("collection", ["ownerControls", "featureToggles", "FeatureToggles", "settings"])
      .limit(20);
    for (const row of recs.data || []) {
      const p = row.payload || {};
      const toggles = (p.toggles && typeof p.toggles === "object") ? p.toggles : p;
      if (toggles.auto_send_review_requests === true) return true;
      if (toggles["Auto Send Review Requests"] === true) return true;
    }
  } catch { /* fall through */ }
  const mc = moduleConfig || {};
  if (mc.auto_send_review_requests === true) return true;
  if (mc.featureToggles && mc.featureToggles.auto_send_review_requests === true) return true;
  return false;
}

function localHour(timeZone: string, at: Date): number {
  try {
    const s = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "America/Chicago",
      hour: "numeric",
      hour12: false,
    }).format(at);
    const h = Number(s);
    return Number.isFinite(h) ? h % 24 : at.getHours();
  } catch {
    return at.getHours();
  }
}

// Mirrors h38-send-sms STOP handling + the client smsConsentFor lookup:
// a number is opted out when this thread — or ANY smsThreads row in the
// business for the same number — shows Consent Status / Status 'Opted Out'.
async function isOptedOut(sb: any, businessId: string, row: any): Promise<boolean> {
  const p = row.payload || {};
  if (text(p["Consent Status"], 60) === "Opted Out") return true;
  if (/opted out/i.test(text(p["Status"], 80))) return true;
  const digits = text(p["Customer Number"], 40).replace(/\D/g, "").slice(-10);
  if (!digits) return false;
  const found = await sb.from("business_records")
    .select("payload")
    .eq("business_id", businessId)
    .eq("collection", "smsThreads")
    .eq("record_status", "active")
    .limit(200);
  for (const other of found.data || []) {
    const op = other.payload || {};
    const num = text(op["Customer Number"], 40).replace(/\D/g, "").slice(-10);
    if (num && num === digits && text(op["Consent Status"], 60) === "Opted Out") {
      return true;
    }
  }
  return false;
}

async function writeThread(sb: any, row: any, payload: Record<string, any>): Promise<boolean> {
  const { error } = await sb.from("business_records")
    .update({ payload, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("record_status", "active");
  if (error) console.warn("[h38-review-scheduler] writeback failed:", error.message);
  return !error;
}

async function proof(sb: any, businessId: string, action: string, threadRef: string, details: Record<string, any>): Promise<void> {
  const sent = action.endsWith("_SENT");
  const failed = action.endsWith("_FAILED");
  try {
    await sb.from("business_proof_log").insert({
      business_id: businessId,
      actor_user_id: null,
      action_type: action,
      entity_type: "SMS Thread",
      entity_id: null,
      result: failed ? "FAIL" : "PASS",
      details: { ...details, threadRef, aiActor: KIT_TAG, build: BUILD },
      external_action_occurred: sent,
    });
  } catch (e) {
    console.warn("[h38-review-scheduler] proof log failed:", e);
  }
}

Deno.serve(async (req: Request) => {
  // Only allow POST (from cron) or GET, and only with the internal job key
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!await validSecret(req, supabase)) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const summary: Record<string, any> = {
    build: BUILD,
    checked: 0,
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: {
      owner_controls_off: 0,
      opted_out: 0,
      quiet_hours: 0,
      claim_lost: 0,
      not_due: 0,
      invalid: 0,
    },
    errors: [],
  };

  try {
    const nowIso = new Date().toISOString();
    const { data: candidates, error } = await supabase
      .from("business_records")
      .select("id,business_id,record_key,payload")
      .eq("collection", "smsThreads")
      .eq("record_status", "active")
      .filter('payload->>"Status"', "eq", "Approved — Queued to Send")
      .filter('payload->>"Purpose"', "like", "Review request%")
      .filter('payload->>"Deliver After"', "neq", "")
      .limit(200);
    if (error) throw error;

    const due = (candidates || []).filter((row: any) => {
      const at = Date.parse(text((row.payload || {})["Deliver After"], 60));
      return Number.isFinite(at) && at <= Date.now();
    });
    summary.checked = (candidates || []).length;
    summary.skipped.not_due = (candidates || []).length - due.length;

    // Cache per-business lookups for this run.
    const bizCache = new Map<string, any>();
    const enabledCache = new Map<string, boolean>();

    for (const row of due.slice(0, MAX_ROWS_PER_RUN)) {
      const businessId = row.business_id as string;
      const p = (row.payload || {}) as Record<string, any>;
      const threadRef = text(p["SMS Thread ID"] || row.record_key, 180);
      try {
        if (!bizCache.has(businessId)) {
          const { data: biz } = await supabase.from("businesses")
            .select("id,timezone,module_config,status")
            .eq("id", businessId)
            .maybeSingle();
          bizCache.set(businessId, biz || {});
        }
        const biz = bizCache.get(businessId);

        // (i) owner controls
        if (!enabledCache.has(businessId)) {
          enabledCache.set(businessId, await autoSendEnabled(supabase, businessId, biz.module_config));
        }
        if (!enabledCache.get(businessId)) {
          summary.skipped.owner_controls_off++;
          continue;
        }

        // (ii) atomic claim — conditioned on the status still being queued
        const claimPayload = {
          ...p,
          "Status": "Sending",
          "Claimed At": nowIso,
          "Record Version": (Number(p["Record Version"]) || 0) + 1,
        };
        const { data: claimedRows, error: claimErr } = await supabase
          .from("business_records")
          .update({ payload: claimPayload, updated_at: nowIso })
          .eq("id", row.id)
          .eq("record_status", "active")
          .filter('payload->>"Status"', "eq", "Approved — Queued to Send")
          .select("id");
        if (claimErr) throw claimErr;
        if (!claimedRows || claimedRows.length !== 1) {
          summary.skipped.claim_lost++;
          continue;
        }
        summary.claimed++;
        const claimed = { ...row, payload: claimPayload };

        // (iii) consent / STOP
        if (await isOptedOut(supabase, businessId, claimed)) {
          await writeThread(supabase, claimed, {
            ...claimPayload,
            "Status": "Opted Out",
            "Updated Time": new Date().toISOString(),
          });
          await proof(supabase, businessId, "REVIEW_REQUEST_SMS_SKIPPED_OPTED_OUT", threadRef, {});
          summary.skipped.opted_out++;
          continue;
        }

        // (iv) quiet hours 21:00–08:00 in the business timezone
        const hour = localHour(text(biz.timezone, 80) || "America/Chicago", new Date());
        if (hour >= 21 || hour < 8) {
          // Release the claim; the next run after 08:00 local picks it up.
          await writeThread(supabase, claimed, {
            ...p,
            "Status": "Approved — Queued to Send",
            "Updated Time": new Date().toISOString(),
          });
          summary.skipped.quiet_hours++;
          continue;
        }

        // (v) send
        const to = e164(text(p["Customer Number"], 40));
        const bodyText = text(p["Pending Body"], 4000);
        let result: { ok: boolean; id?: string; error?: string };
        if (!to || !bodyText || segmentCount(bodyText) > MAX_SEGMENTS) {
          result = { ok: false, error: !to ? "invalid customer number" : !bodyText ? "message body is empty" : "message exceeds segment limit" };
        } else if (!providerConfigured()) {
          result = { ok: false, error: "provider not configured" };
        } else {
          result = await sendSms(to, bodyText);
        }

        // (vi) write back in h38-send-sms's exact payload shape + proof row
        const outPayload = {
          ...claimPayload,
          "Status": result.ok ? "Sent" : "Failed",
          "Provider Message ID": result.id || "",
          "Send Error": result.ok ? "" : (result.error || "Unknown error"),
          "Sent Time": new Date().toISOString(),
          "Approved By": text(p["Approved By"], 200),
          "Purpose": text(p["Purpose"], 120),
          "Updated Time": new Date().toISOString(),
          "Record Version": (Number(claimPayload["Record Version"]) || 0) + 1,
        };
        await writeThread(supabase, claimed, outPayload);
        await proof(
          supabase,
          businessId,
          result.ok ? "REVIEW_REQUEST_SMS_SENT" : "REVIEW_REQUEST_SMS_FAILED",
          threadRef,
          {
            provider: PROVIDER,
            providerMessageId: result.id || "",
            sendError: result.ok ? "" : (result.error || "Unknown error"),
          },
        );
        if (result.ok) summary.sent++;
        else summary.failed++;
      } catch (rowErr) {
        summary.errors.push({
          thread: threadRef,
          error: rowErr instanceof Error ? rowErr.message : String(rowErr),
        });
      }
    }

    return new Response(JSON.stringify(summary), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[h38-review-scheduler] error", e);
    return new Response(
      JSON.stringify({ ...summary, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
