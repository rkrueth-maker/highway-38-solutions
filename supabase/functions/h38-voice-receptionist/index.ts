// h38-voice-receptionist — live-call answering for H38 Office tenants.
//
// Serves BOTH Twilio (TwiML) and Telnyx (TeXML) inbound voice webhooks with
// one provider-agnostic core. Loads the tenant's receptionist profile from
// business_module_settings (module_key = "ai_receptionist" — the same profile
// the Office test bench edits), runs a short turn-based conversation using the
// provider's speech gather + say, captures the lead as an Office request, and
// hands off to Kit via ai_handoff_tasks (task_type = "call_lead").
//
// DARK by default: a call is only answered conversationally when the tenant
// config has liveEnabled === true AND the dialed number matches
// config.liveDid. Anything else gets a polite voicemail-style fallback, so a
// misrouted or half-configured number never dead-airs.
//
// v1 is scripted (greeting -> need -> FAQ answers -> callback number ->
// confirm). Free-form live AI conversation (media streaming) is phase 2.
// Nothing is ever sent to a customer from here; Kit drafts, owner approves.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MODULE_KEY = "ai_receptionist";
const MAX_TURNS = 8;

function clean(v: unknown, max: number): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
function digits(v: string): string {
  return String(v || "").replace(/\D/g, "");
}
function spokenPhone(v: string): string {
  const d = digits(v);
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.split("").join(" ");
}
function xmlEscape(v: string): string {
  return String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function xml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}

async function settingFor(sb: any, businessId: string) {
  const { data, error } = await sb
    .from("business_module_settings")
    .select("enabled, config")
    .eq("business_id", businessId)
    .eq("module_key", MODULE_KEY)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

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

type Turn = { who: string; text: string };
type CallState = {
  stage: string;
  turns: Turn[];
  callerName: string;
  callback: string;
  need: string;
  startedAt: string;
};

async function loadCall(sb: any, businessId: string, callKey: string): Promise<CallState | null> {
  const { data } = await sb
    .from("business_records")
    .select("payload")
    .eq("business_id", businessId)
    .eq("collection", "voice_calls")
    .eq("record_key", callKey)
    .maybeSingle();
  return (data?.payload as CallState) || null;
}

async function saveCall(sb: any, businessId: string, callKey: string, state: CallState, actorId: string) {
  const { data: existing } = await sb
    .from("business_records")
    .select("id")
    .eq("business_id", businessId)
    .eq("collection", "voice_calls")
    .eq("record_key", callKey)
    .maybeSingle();
  if (existing?.id) {
    await sb.from("business_records").update({ payload: state, updated_by: actorId }).eq("id", existing.id);
  } else {
    await sb.from("business_records").insert({
      business_id: businessId,
      collection: "voice_calls",
      record_key: callKey,
      record_status: "active",
      created_by: actorId,
      updated_by: actorId,
      payload: state,
    });
  }
}

async function finalizeCall(sb: any, businessId: string, callKey: string, from: string, state: CallState) {
  const actorId = await attributionUserId(sb, businessId);
  const now = new Date().toISOString();
  const transcript = state.turns.map((t) => `${t.who === "caller" ? "Caller" : "Receptionist"}: ${t.text}`).join("\n").slice(0, 4000);
  const summary = [
    `AI receptionist call from ${state.callerName || "unknown caller"}`,
    `Callback: ${state.callback || from}`,
    `Need: ${state.need || "(not captured)"}`,
  ].join(" — ");
  await sb.from("business_records").insert({
    business_id: businessId,
    collection: "requests",
    record_key: `CALL-${callKey}`.slice(0, 80),
    record_status: "active",
    created_by: actorId,
    updated_by: actorId,
    payload: {
      "Request ID": `CALL-${callKey}`.slice(0, 80),
      "Business ID": businessId,
      "Customer Name": state.callerName || "",
      "Phone": state.callback || from,
      "Request Type": "Phone lead — AI receptionist",
      "Subject": summary.slice(0, 200),
      "Description": transcript,
      "Source": "AI Receptionist call",
      "Status": "New — needs owner review",
      "Created Time": now,
      "Record Version": 1,
    },
  });
  await sb.from("ai_handoff_tasks").insert({
    business_id: businessId,
    task_type: "call_lead",
    status: "pending",
    payload: {
      callKey,
      callerName: state.callerName,
      phone: state.callback || from,
      need: state.need,
      transcript,
      source: "AI Receptionist call",
      createdAt: now,
    },
  });
}

function faqAnswer(faqs: string, question: string): string {
  const q = question.toLowerCase();
  const lines = String(faqs || "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let best = "";
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes("?")) continue;
    const words = line.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
    const score = words.filter((w) => q.includes(w)).length;
    const answer = (lines[i + 1] || "").replace(/^(a:|answer:)\s*/i, "");
    if (score >= 2 && score > bestScore && answer) {
      bestScore = score;
      best = answer;
    }
  }
  return best;
}

export async function handleVoice(req: Request, provider: string): Promise<Response> {
  const url = new URL(req.url);
  const businessId = clean(url.searchParams.get("business"), 64);
  const turn = parseInt(url.searchParams.get("turn") || "0", 10) || 0;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey || !/^[0-9a-f-]{36}$/i.test(businessId)) {
    return xml(`<Say>We are unable to take your call right now. Please try again later.</Say><Hangup/>`);
  }
  const sb = createClient(supabaseUrl, serviceKey);
  const form = req.method === "POST" ? await req.formData().catch(() => null) : null;
  const get = (k: string) => clean(form?.get(k) ?? url.searchParams.get(k) ?? "", 500);
  const callKey = get("CallSid") || get("call_sid") || get("CallControlId") || `call-${Date.now()}`;
  const from = get("From") || get("from");
  const to = get("To") || get("to");
  const speech = get("SpeechResult") || get("speech_result");

  const fnBase = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/h38-voice-receptionist/${provider}`;
  const base = `${fnBase}?business=${businessId}`;
  const gatherXml = (sayText: string, nextTurn: number) =>
    `<Gather input="speech" speechTimeout="auto" timeout="8" action="${base}&amp;turn=${nextTurn}" method="POST"><Say>${xmlEscape(sayText)}</Say></Gather><Say>Sorry, I didn't catch that.</Say><Redirect method="POST">${base}&amp;turn=${nextTurn}</Redirect>`;
  const actorId = await attributionUserId(sb, businessId).catch(() => "");
  const respond = async (st: CallState, sayText: string, nextTurn: number) => {
    if (actorId) {
      try { await saveCall(sb, businessId, callKey, st, actorId); } catch (e) { console.error("[h38-voice-receptionist] state save failed:", e); }
    }
    return xml(gatherXml(sayText, nextTurn));
  };

  try {
    const setting = await settingFor(sb, businessId);
    const cfg: any = setting?.config || {};
    const live = cfg.liveEnabled === true && digits(String(cfg.liveDid || "")) !== "" && digits(String(cfg.liveDid || "")) === digits(to);
    if (!live) {
      return xml(`<Say>Thank you for calling. We can't take your call right now, but please leave a message after the tone and we'll get back to you.</Say><Record maxLength="120" playBeep="true"/><Hangup/>`);
    }

    const greeting = clean(cfg.greeting || "", 300) || "Thank you for calling. How can I help you today?";
    const hours = clean(cfg.businessHours || "", 160);
    let state = turn === 0 ? null : await loadCall(sb, businessId, callKey);
    if (!state) {
      state = { stage: "need", turns: [{ who: "receptionist", text: greeting }], callerName: "", callback: "", need: "", startedAt: new Date().toISOString() };
    }

    if (turn === 0) {
      return respond(state, greeting, 1);
    }

    if (speech) state.turns.push({ who: "caller", text: speech });
    const said = speech.toLowerCase();
    let reply = "";

    if (state.stage === "need") {
      if (speech) state.need = state.need ? `${state.need}; ${speech}` : speech;
      const answer = faqAnswer(String(cfg.faqs || ""), speech);
      state.stage = "name";
      reply = answer
        ? `${answer} So I can pass this along, may I have your name?`
        : "Got it. May I have your name so I can pass this along?";
    } else if (state.stage === "name") {
      if (speech) state.callerName = speech.replace(/^(my name is|this is|it's|im|i'm)\s+/i, "").slice(0, 60);
      state.stage = "phone";
      state.callback = from;
      reply = `Thanks, ${state.callerName || "there"}. I'll have them call you back at ${spokenPhone(from)}. Is that the best number?`;
    } else if (state.stage === "phone") {
      if (/\bno\b|different|another/.test(said)) {
        state.stage = "phone_new";
        reply = "No problem — what's the best number to reach you?";
      } else {
        state.stage = "done";
      }
    } else if (state.stage === "phone_new") {
      const d = digits(speech);
      if (d.length >= 7) state.callback = speech;
      state.stage = "done";
    }

    if (state.stage === "done" || turn >= MAX_TURNS) {
      const bye = `Thanks${state.callerName ? `, ${xmlEscape(state.callerName.split(" ")[0])}` : ""}. I've passed this to the team and they'll reach out shortly${hours ? ` — our hours are ${xmlEscape(hours)}` : ""}. Goodbye!`;
      state.turns.push({ who: "receptionist", text: bye });
      if (actorId) {
        try { await saveCall(sb, businessId, callKey, state, actorId); } catch (e) { console.error("[h38-voice-receptionist] state save failed:", e); }
      }
      try {
        await finalizeCall(sb, businessId, callKey, from, state);
      } catch (e) {
        console.error("[h38-voice-receptionist] finalize failed:", e);
      }
      return xml(`<Say>${bye}</Say><Hangup/>`);
    }

    if (!reply) reply = "May I have your name so I can pass this along?";
    state.turns.push({ who: "receptionist", text: reply });
    return respond(state, reply, turn + 1);
  } catch (e) {
    console.error("[h38-voice-receptionist] failed:", e);
    return xml(`<Say>We're having a little trouble. Please try calling again in a few minutes.</Say><Hangup/>`);
  }
}

if (import.meta.main) {
  Deno.serve((req: Request) => {
    const path = new URL(req.url).pathname;
    const provider = path.includes("telnyx") ? "telnyx" : "twilio";
    return handleVoice(req, provider);
  });
}
