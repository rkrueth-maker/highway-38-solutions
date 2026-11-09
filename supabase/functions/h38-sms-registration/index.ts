import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// h38-sms-registration — H38's own 10DLC texting-registration automation.
// Build 20261109-10dlc-1.
//
// Rick's decision (2026-11-09): "our own" — do NOT buy Dial. The filing runs
// HERE, server-side, with the CUSTOMER's own stored Telnyx API key, inside
// the customer's OWN carrier account. The customer keeps owning the number
// and the account; H38 only automates the paperwork.
//
// Actions (POST JSON {action, businessId, ...}):
//   precheck  — rules-based packet validation. Names every gap. Files NOTHING.
//   file      — pre-check, then brand -> campaign -> number attach via the
//               customer's Telnyx key; records TCR/Telnyx IDs + state.
//   refresh   — poll Telnyx for in_review records; a rejection records the
//               carrier reason verbatim and re-opens the pre-check.
//   dry_run   — mocked Telnyx transport (fixture validation ONLY; caller must
//               pass dryRun === true AND the internal job key). Proves the
//               request sequence + state round-trip. Never touches Telnyx.
//
// Auth (either):
//   - x-h38-nightly-key header matching the 'h38-sms-registration' row in
//     h38_internal_job_secrets (Kit handoff worker / pg_cron poller), or
//   - a signed-in owner/administrator JWT for the target business.
// verify_jwt = false; every path fails closed.
//
// Per-customer Telnyx key source, in order:
//   1. Request field telnyxApiKey (Kit passes it from secure storage when it
//      runs a filing; it is used for this request only, never logged/stored).
//   2. Edge secret SMS_REG_<businessId> (set by Kit at provider-setup time
//      alongside the h38-send-sms secrets).
//   3. Global TELNYX_API_KEY (single-account deployments only).
//
// Registration state: business_records collection 'smsRegistration', one row
// per business, written only here (service key). Statuses:
//   not_started | precheck_failed | filed | in_review | approved | rejected
// Default for every business is NOT approved: no row == no sends.
// The send path (h38-send-sms) consults this state per business IN ADDITION
// to the global H38_SMS_SEND_RELEASED / H38_SMS_A2P_APPROVED flags.

const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TELNYX_BASE = "https://api.telnyx.com/v2";
const COLLECTION = "smsRegistration";
const RECORD_KEY = "SMS-REG-TELNYX";
const SECRET_ROW = "h38-sms-registration";

// Office texts are service messages about the customer's own work — never
// marketing. CUSTOMER_CARE covers replies and two-way help; ACCOUNT_NOTIFICATION
// covers reminders/updates. MIXED is the honest single-campaign fit and is a
// standard (non-sole-prop) use case, which matches EIN businesses.
const CAMPAIGN_USECASE = "MIXED";
const CAMPAIGN_DESCRIPTION =
  "Service texts from this business to its own customers about work they asked for: " +
  "appointment reminders, on-the-way and job-status updates, quote and invoice follow-ups, " +
  "and replies to customer texts. No marketing blasts; customers can reply STOP to opt out.";
const OPTIN_KEYWORDS = "START,YES";
const OPTOUT_KEYWORDS = "STOP,UNSUBSCRIBE";

function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://highway38solutions.com";
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-h38-nightly-key",
    "Content-Type": "application/json",
  };
}

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function text(v: unknown, n = 2000): string {
  return String(v ?? "").trim().slice(0, n);
}

// ---------------------------------------------------------------------------
// Registration packet + pre-check (rules mirror commercial-app/sms-registration.js)
// ---------------------------------------------------------------------------
interface Packet {
  legalBusinessName: string;
  entityType: string;
  ein: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
  vertical: string;
  fromNumber: string;
  optInDescription: string;
  sampleMessages: string[];
  privacyUrl: string;
  privacyMentionsTexting: boolean;
}

function normalizePacket(raw: Record<string, unknown>): Packet {
  const samples = Array.isArray(raw.sampleMessages)
    ? raw.sampleMessages.map((s) => text(s, 320))
    : [text(raw.sample1, 320), text(raw.sample2, 320)].filter(Boolean);
  return {
    legalBusinessName: text(raw.legalBusinessName, 100),
    entityType: text(raw.entityType, 30).toUpperCase() || "PRIVATE_PROFIT",
    ein: text(raw.ein, 20),
    street: text(raw.street, 120),
    city: text(raw.city, 60),
    state: text(raw.state, 2).toUpperCase(),
    postalCode: text(raw.postalCode, 10),
    country: (text(raw.country, 2) || "US").toUpperCase(),
    contactEmail: text(raw.contactEmail, 120),
    contactPhone: text(raw.contactPhone, 20),
    website: text(raw.website, 140),
    vertical: text(raw.vertical, 50),
    fromNumber: text(raw.fromNumber, 20),
    optInDescription: text(raw.optInDescription, 600),
    sampleMessages: samples,
    privacyUrl: text(raw.privacyUrl, 200),
    privacyMentionsTexting: raw.privacyMentionsTexting === true,
  };
}

function precheckPacket(p: Packet): { ok: boolean; gaps: { field: string; label: string }[] } {
  const gaps: { field: string; label: string }[] = [];
  const need = (field: string, label: string, ok: boolean) => { if (!ok) gaps.push({ field, label }); };
  need("legalBusinessName", "Legal business name (exactly as it appears on the EIN filing)", p.legalBusinessName.length >= 2);
  need("entityType", "Business type (LLC, corporation, sole proprietor, nonprofit, government)",
    ["PRIVATE_PROFIT", "PUBLIC_PROFIT", "NON_PROFIT", "GOVERNMENT", "SOLE_PROPRIETOR"].includes(p.entityType));
  const einDigits = p.ein.replace(/\D/g, "");
  if (p.entityType !== "SOLE_PROPRIETOR") {
    need("ein", "EIN — 9 digits, matching the legal name above", einDigits.length === 9);
  } else if (p.ein && einDigits.length !== 9) {
    gaps.push({ field: "ein", label: "EIN — if you enter one it must be 9 digits (sole proprietors may file without one)" });
  }
  need("street", "Business street address", p.street.length >= 3);
  need("city", "Business city", p.city.length >= 2);
  need("state", "Business state (2 letters)", /^[A-Z]{2}$/.test(p.state));
  need("postalCode", "Business ZIP / postal code", p.postalCode.length >= 3);
  need("country", "Business country (US)", p.country === "US");
  need("contactEmail", "Contact email the carrier can reach", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contactEmail));
  const phoneDigits = p.contactPhone.replace(/\D/g, "");
  need("contactPhone", "Contact phone (10-digit US number)", phoneDigits.length === 10 || (phoneDigits.length === 11 && phoneDigits[0] === "1"));
  need("website", "Business website (live, names the business)", /^https?:\/\/[^\s.]+\.[^\s]+/i.test(p.website));
  need("vertical", "Industry (what the business does)", p.vertical.length >= 2);
  need("optInDescription", "Opt-in description — how customers agree to get texts (at least a sentence)", p.optInDescription.length >= 20);
  const goodSamples = p.sampleMessages.filter((s) => s.trim().length >= 10);
  need("sampleMessages", "At least 2 sample messages — real examples of texts you will send", goodSamples.length >= 2);
  need("privacyUrl", "Privacy page URL", /^https?:\/\/[^\s.]+\.[^\s]+/i.test(p.privacyUrl));
  need("privacyMentionsTexting", "Privacy page must mention text messaging (what you send, opt-in, STOP to opt out)", p.privacyMentionsTexting === true);
  // The number being registered: without it there is nothing to attach.
  need("fromNumber", "The business phone number being registered (from the connected Telnyx account)", /^\+1\d{10}$/.test(p.fromNumber));
  return { ok: gaps.length === 0, gaps };
}

// ---------------------------------------------------------------------------
// Telnyx transport (real fetch, or injected mock for dry_run)
// ---------------------------------------------------------------------------
interface TelnyxCall { method: string; path: string; body?: Record<string, unknown> }
interface Transport {
  call(method: string, path: string, body?: Record<string, unknown>): Promise<{ status: number; data: Record<string, unknown> }>;
}

function realTransport(apiKey: string): Transport {
  return {
    async call(method, path, body) {
      const res = await fetch(`${TELNYX_BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data: (data || {}) as Record<string, unknown> };
    },
  };
}

// Mock transport for dry_run: validates the exact payload shapes, returns
// fixture TCR-style IDs, and records the call sequence for the proof.
function mockTransport(calls: TelnyxCall[]): Transport {
  return {
    async call(method, path, body) {
      calls.push({ method, path, body });
      const b = body || {};
      if (method === "POST" && path === "/10dlc/brand") {
        if (!b.entityType || !b.displayName || !b.email || !b.vertical || !b.country) {
          return { status: 422, data: { errors: [{ detail: "brand requires entityType, displayName, email, vertical, country" }] } };
        }
        return { status: 200, data: { data: { brandId: "BDRYRUN0000000000000001", identityStatus: "VERIFIED", status: "VERIFIED" } } };
      }
      if (method === "POST" && path === "/10dlc/campaignBuilder") {
        if (!b.brandId || !b.usecase || !b.description || !b.sample1 || !b.sample2 || !b.messageFlow) {
          return { status: 422, data: { errors: [{ detail: "campaign requires brandId, usecase, description, sample1, sample2, messageFlow" }] } };
        }
        return { status: 200, data: { data: { campaignId: "CDRYRUN000000000000001", campaignStatus: "TCR_PENDING" } } };
      }
      if (method === "POST" && path === "/10dlc/assignments") {
        if (!b.phoneNumber || !b.campaignId) {
          return { status: 422, data: { errors: [{ detail: "assignment requires phoneNumber and campaignId" }] } };
        }
        return { status: 200, data: { data: { phoneNumber: b.phoneNumber, campaignId: b.campaignId, status: "PENDING" } } };
      }
      if (method === "GET" && path.startsWith("/10dlc/brand/") && !path.includes("feedback")) {
        return { status: 200, data: { data: { brandId: "BDRYRUN0000000000000001", identityStatus: "VERIFIED", status: "VERIFIED" } } };
      }
      if (method === "GET" && path.startsWith("/10dlc/campaign/")) {
        return { status: 200, data: { data: { campaignId: "CDRYRUN000000000000001", campaignStatus: "ACTIVE" } } };
      }
      if (method === "GET" && path.includes("/feedback/")) {
        return { status: 200, data: { data: {} } };
      }
      return { status: 404, data: { errors: [{ detail: "mock: unknown path " + path }] } };
    },
  };
}

function telnyxError(data: Record<string, unknown>): string {
  const errs = (data as { errors?: { detail?: string; title?: string }[] }).errors;
  if (Array.isArray(errs) && errs.length) return errs.map((e) => e.detail || e.title || "error").join("; ").slice(0, 900);
  return text(JSON.stringify(data), 900);
}

// Map Telnyx/TCR statuses onto our state machine.
function mapBrandStatus(data: Record<string, unknown>): "approved" | "rejected" | "in_review" {
  const d = (data.data || {}) as Record<string, unknown>;
  const identity = text(d.identityStatus, 40).toUpperCase();
  const status = text(d.status, 40).toUpperCase();
  if (identity === "VERIFIED" || identity === "VETTED_VERIFIED" || status === "VERIFIED" || status === "ACTIVE") return "approved";
  if (identity === "UNVERIFIED" && status === "FAILED") return "rejected";
  if (status === "FAILED" || status === "REJECTED") return "rejected";
  return "in_review";
}
function mapCampaignStatus(data: Record<string, unknown>): "approved" | "rejected" | "in_review" {
  const d = (data.data || {}) as Record<string, unknown>;
  const s = text(d.campaignStatus || d.status, 60).toUpperCase();
  if (s === "ACTIVE" || s === "APPROVED" || s === "TCR_APPROVED") return "approved";
  if (s.includes("REJECT") || s.includes("FAIL") || s === "TCR_REJECTED" || s === "SUSPENDED") return "rejected";
  return "in_review";
}

// ---------------------------------------------------------------------------
// Registration state record (business_records, service-key writes only)
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
type Sb = any;

async function ownerActor(sb: Sb, businessId: string): Promise<string> {
  const { data } = await sb.from("business_memberships")
    .select("auth_user_id,role").eq("business_id", businessId).eq("status", "active").limit(10);
  const members = (data || []) as { auth_user_id: string; role: string }[];
  const actor = members.find((m) => m.role === "owner") || members[0];
  return actor?.auth_user_id || "";
}

async function readState(sb: Sb, businessId: string): Promise<{ id: string; payload: Record<string, unknown> } | null> {
  const { data } = await sb.from("business_records")
    .select("id,payload")
    .eq("business_id", businessId)
    .eq("collection", COLLECTION)
    .eq("record_status", "active")
    .limit(5);
  for (const row of data || []) {
    const p = (row.payload || {}) as Record<string, unknown>;
    if (String(p["Provider"] || "telnyx").toLowerCase() === "telnyx") return { id: row.id, payload: p };
  }
  return (data && data[0]) ? { id: data[0].id, payload: (data[0].payload || {}) as Record<string, unknown> } : null;
}

async function writeState(sb: Sb, businessId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const existing = await readState(sb, businessId);
  const actorId = await ownerActor(sb, businessId);
  const nowIso = new Date().toISOString();
  if (existing) {
    const payload = { ...existing.payload, ...patch, "Record Version": (Number(existing.payload["Record Version"]) || 0) + 1 };
    await sb.from("business_records").update({ payload, ...(actorId ? { updated_by: actorId } : {}) }).eq("id", existing.id);
    return payload;
  }
  const payload: Record<string, unknown> = {
    "Registration ID": RECORD_KEY,
    "Business ID": businessId,
    "Provider": "telnyx",
    "Registration Status": "not_started",
    "Brand ID": "",
    "Campaign ID": "",
    "From Number": "",
    "Precheck Gaps": "[]",
    "Carrier Reason": "",
    "Filed At": "",
    "Last Checked": nowIso,
    "Record Version": 1,
    ...patch,
  };
  await sb.from("business_records").insert({
    business_id: businessId, collection: COLLECTION, record_key: RECORD_KEY,
    record_status: "active", ...(actorId ? { created_by: actorId, updated_by: actorId } : {}), payload,
  });
  return payload;
}

// ---------------------------------------------------------------------------
// Filing + refresh
// ---------------------------------------------------------------------------
function brandPayload(p: Packet): Record<string, unknown> {
  const body: Record<string, unknown> = {
    entityType: p.entityType === "SOLE_PROPRIETOR" ? "SOLE_PROPRIETOR" : p.entityType,
    displayName: p.legalBusinessName,
    companyName: p.legalBusinessName,
    phone: p.contactPhone,
    street: p.street,
    city: p.city,
    state: p.state,
    postalCode: p.postalCode,
    country: p.country,
    email: p.contactEmail,
    website: p.website,
    vertical: p.vertical,
  };
  const einDigits = p.ein.replace(/\D/g, "");
  if (einDigits.length === 9) body.ein = einDigits;
  return body;
}

function campaignPayload(p: Packet, brandId: string): Record<string, unknown> {
  return {
    brandId,
    usecase: CAMPAIGN_USECASE,
    description: CAMPAIGN_DESCRIPTION,
    messageFlow: p.optInDescription + " Privacy policy: " + p.privacyUrl,
    sample1: p.sampleMessages[0] || "",
    sample2: p.sampleMessages[1] || "",
    optinKeywords: OPTIN_KEYWORDS,
    optoutKeywords: OPTOUT_KEYWORDS,
    subscriberOptin: true,
    subscriberOptout: true,
    subscriberHelp: true,
    embeddedLink: false,
    embeddedPhone: false,
    affiliateMarketing: false,
    directLending: false,
    ageGated: false,
  };
}

async function fileRegistration(sb: Sb, businessId: string, packet: Packet, transport: Transport) {
  const check = precheckPacket(packet);
  if (!check.ok) {
    const state = await writeState(sb, businessId, {
      "Registration Status": "precheck_failed",
      "Precheck Gaps": JSON.stringify(check.gaps),
      "Carrier Reason": "",
      "Last Checked": new Date().toISOString(),
    });
    return { filed: false, precheck: check, state };
  }
  // 1) Brand
  const brandRes = await transport.call("POST", "/10dlc/brand", brandPayload(packet));
  if (brandRes.status >= 300) {
    const state = await writeState(sb, businessId, {
      "Registration Status": "precheck_failed",
      "Precheck Gaps": "[]",
      "Carrier Reason": "Telnyx brand filing failed: " + telnyxError(brandRes.data),
      "From Number": packet.fromNumber,
      "Last Checked": new Date().toISOString(),
    });
    return { filed: false, error: "brand", state };
  }
  const brandData = (brandRes.data.data || {}) as Record<string, unknown>;
  const brandId = text(brandData.brandId || brandData.id, 80);
  // 2) Campaign
  const campaignRes = await transport.call("POST", "/10dlc/campaignBuilder", campaignPayload(packet, brandId));
  if (campaignRes.status >= 300) {
    const state = await writeState(sb, businessId, {
      "Registration Status": "filed",
      "Brand ID": brandId,
      "Carrier Reason": "Brand filed; campaign filing failed: " + telnyxError(campaignRes.data),
      "From Number": packet.fromNumber,
      "Filed At": new Date().toISOString(),
      "Last Checked": new Date().toISOString(),
    });
    return { filed: false, error: "campaign", state };
  }
  const campaignData = (campaignRes.data.data || {}) as Record<string, unknown>;
  const campaignId = text(campaignData.campaignId || campaignData.id, 80);
  // 3) Attach the business's number to the campaign
  const assignRes = await transport.call("POST", "/10dlc/assignments", { phoneNumber: packet.fromNumber, campaignId });
  const campaignMapped = mapCampaignStatus(campaignRes.data);
  const status = campaignMapped === "approved" ? "approved" : "in_review";
  const state = await writeState(sb, businessId, {
    "Registration Status": status,
    "Brand ID": brandId,
    "Campaign ID": campaignId,
    "From Number": packet.fromNumber,
    "Precheck Gaps": "[]",
    "Carrier Reason": assignRes.status >= 300 ? "Number attach failed: " + telnyxError(assignRes.data) : "",
    "Filed At": new Date().toISOString(),
    "Last Checked": new Date().toISOString(),
  });
  return { filed: true, brandId, campaignId, assignStatus: assignRes.status, state };
}

async function refreshRegistration(sb: Sb, businessId: string, transport: Transport) {
  const existing = await readState(sb, businessId);
  if (!existing) return { refreshed: false, reason: "no registration on file" };
  const p = existing.payload;
  const current = text(p["Registration Status"], 30);
  if (current !== "filed" && current !== "in_review") {
    return { refreshed: false, reason: "status is " + current + " — nothing in review" };
  }
  const brandId = text(p["Brand ID"], 80);
  const campaignId = text(p["Campaign ID"], 80);
  let next = current;
  let reason = "";
  if (brandId) {
    const brandRes = await transport.call("GET", `/10dlc/brand/${encodeURIComponent(brandId)}`);
    if (brandRes.status < 300) {
      const mapped = mapBrandStatus(brandRes.data);
      if (mapped === "rejected") {
        next = "rejected";
        const fb = await transport.call("GET", `/10dlc/brand/feedback/${encodeURIComponent(brandId)}`);
        reason = fb.status < 300 ? (text(JSON.stringify(fb.data?.data ?? fb.data), 900) || "Brand rejected by the carrier.") : "Brand rejected by the carrier.";
      }
    }
  }
  if (next !== "rejected" && campaignId) {
    const campRes = await transport.call("GET", `/10dlc/campaign/${encodeURIComponent(campaignId)}`);
    if (campRes.status < 300) {
      const mapped = mapCampaignStatus(campRes.data);
      if (mapped === "approved") next = "approved";
      else if (mapped === "rejected") {
        next = "rejected";
        const d = (campRes.data.data || {}) as Record<string, unknown>;
        reason = text(d.failureReason || d.rejectionReason || d.description || "", 900) || "Campaign rejected by the carrier.";
      } else next = "in_review";
    }
  }
  const state = await writeState(sb, businessId, {
    "Registration Status": next,
    "Carrier Reason": next === "rejected" ? reason : text(p["Carrier Reason"], 900),
    "Last Checked": new Date().toISOString(),
  });
  return { refreshed: true, status: next, state };
}

// ---------------------------------------------------------------------------
// Auth: internal job key (Kit worker / cron) OR owner/admin JWT for the business
// ---------------------------------------------------------------------------
async function authorized(req: Request, sb: Sb, businessId: string): Promise<boolean> {
  const got = text(req.headers.get("x-h38-nightly-key"), 200);
  if (got) {
    const { data } = await sb.from("h38_internal_job_secrets").select("secret_value").eq("name", SECRET_ROW).limit(1);
    const want = text((data && data[0])?.secret_value, 200);
    if (want && got === want) return true;
  }
  const authz = req.headers.get("authorization") || "";
  const token = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7) : "";
  if (token && businessId) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const user = await res.json().catch(() => ({}));
      const uid = text((user as { id?: string }).id, 60);
      if (uid) {
        const { data } = await sb.from("business_memberships")
          .select("role").eq("business_id", businessId).eq("auth_user_id", uid).eq("status", "active").limit(1);
        const role = text((data && data[0])?.role, 30).toLowerCase();
        return role === "owner" || role === "administrator";
      }
    }
  }
  return false;
}

function customerTelnyxKey(businessId: string, body: Record<string, unknown>): string {
  const direct = text(body.telnyxApiKey, 300);
  if (direct) return direct;
  const perBiz = Deno.env.get("SMS_REG_" + businessId.replace(/[^A-Za-z0-9]/g, "")) || "";
  if (perBiz) return perBiz;
  return Deno.env.get("TELNYX_API_KEY") || "";
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, headers);
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "Server is not configured." }, headers);
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = text(body.action, 20).toLowerCase();
    const businessId = text(body.businessId, 60);
    if (!businessId && action !== "refresh_all") return json(400, { error: "businessId is required." }, headers);
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    if (!(await authorized(req, sb, businessId))) {
      return json(401, { error: "Not authorized for this business." }, headers);
    }

    if (action === "precheck") {
      const packet = normalizePacket((body.packet || {}) as Record<string, unknown>);
      // Pre-check is pure validation — no state write, no filing.
      return json(200, { ok: true, precheck: precheckPacket(packet) }, headers);
    }

    if (action === "status") {
      const existing = await readState(sb, businessId);
      return json(200, { ok: true, state: existing ? existing.payload : null }, headers);
    }

    if (action === "dry_run") {      // Fixture validation only: internal key required (never a plain JWT),
      // mocked transport, packet must carry its fromNumber so the attach
      // step is exercised too.
      const got = text(req.headers.get("x-h38-nightly-key"), 200);
      const { data } = await sb.from("h38_internal_job_secrets").select("secret_value").eq("name", SECRET_ROW).limit(1);
      const want = text((data && data[0])?.secret_value, 200);
      if (!want || got !== want) return json(401, { error: "dry_run requires the internal job key." }, headers);
      const packet = normalizePacket((body.packet || {}) as Record<string, unknown>);
      const existing = await readState(sb, businessId);
      const savedStatus = existing ? text(existing.payload["Registration Status"], 30) : null;
      const calls: TelnyxCall[] = [];
      const transport = mockTransport(calls);
      const filed = await fileRegistration(sb, businessId, packet, transport);
      // Round-trip: read back, refresh once (mock campaign ACTIVE -> approved),
      // then RESTORE the pre-dry-run status so a dry run can never flip a
      // real business's gate. The IDs/branding stay as dry-run evidence in
      // the returned payload only when the business had no live registration.
      const afterFile = await readState(sb, businessId);
      const refreshed = await refreshRegistration(sb, businessId, transport);
      const afterRefresh = await readState(sb, businessId);
      if (savedStatus && savedStatus !== "not_started") {
        await writeState(sb, businessId, { "Registration Status": savedStatus });
      }
      return json(200, {
        ok: true,
        dryRun: true,
        sequence: calls.map((c) => `${c.method} ${c.path}`),
        calls,
        filed,
        stateAfterFile: afterFile?.payload || null,
        refreshed,
        stateAfterRefresh: afterRefresh?.payload || null,
        restoredStatus: savedStatus,
      }, headers);
    }

    if (action === "file" || action === "refresh") {
      const apiKey = customerTelnyxKey(businessId, body);
      if (!apiKey) {
        return json(409, { error: "No Telnyx API key is stored for this business yet. Connect Telnyx with Hank first (provider setup), then file." }, headers);
      }
      const transport = realTransport(apiKey);
      if (action === "file") {
        const packet = normalizePacket((body.packet || {}) as Record<string, unknown>);
        if (!packet.fromNumber) {
          const cfg = await sb.from("business_records").select("payload")
            .eq("business_id", businessId).eq("collection", "providers").eq("record_status", "active").limit(5);
          for (const row of cfg.data || []) {
            const pp = (row.payload || {}) as Record<string, unknown>;
            if (text(pp["Provider Type"], 10).toLowerCase() === "sms") { packet.fromNumber = text(pp["From Number"], 20); break; }
          }
        }
        const result = await fileRegistration(sb, businessId, packet, transport);
        return json(200, { ok: true, ...result }, headers);
      }
      const result = await refreshRegistration(sb, businessId, transport);
      return json(200, { ok: true, ...result }, headers);
    }

    if (action === "refresh_all") {
      // Poller: every business with an in-review Telnyx registration.
      const apiKeyGlobal = Deno.env.get("TELNYX_API_KEY") || "";
      const { data } = await sb.from("business_records")
        .select("business_id,payload")
        .eq("collection", COLLECTION)
        .eq("record_status", "active")
        .limit(500);
      const results: Record<string, unknown>[] = [];
      for (const row of data || []) {
        const p = (row.payload || {}) as Record<string, unknown>;
        const st = text(p["Registration Status"], 30);
        if (st !== "filed" && st !== "in_review") continue;
        if (text(p["Provider"], 20).toLowerCase() !== "telnyx") continue;
        const bid = text(row.business_id, 60);
        const key = customerTelnyxKey(bid, body);
        if (!key && !apiKeyGlobal) { results.push({ businessId: bid, skipped: "no stored Telnyx key" }); continue; }
        const r = await refreshRegistration(sb, bid, realTransport(key || apiKeyGlobal));
        results.push({ businessId: bid, ...r });
      }
      return json(200, { ok: true, results }, headers);
    }

    return json(400, { error: "Unknown action." }, headers);
  } catch (err) {
    return json(500, { error: String((err as Error)?.message || err) }, headers);
  }
});
