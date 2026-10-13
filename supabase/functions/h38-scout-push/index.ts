import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Scout push notifications — server side.
// The Scout app (h38-penny-web / h38-resale-web) notifies its own signed-in
// users by Web Push when NEW penny deals or NEW resale deals land for their
// household. Detection is at the data layer (deal_engine_observations /
// reseller_deals) because the penny ingest function is deployed-only.
//
// Actions (POST JSON):
//   {action:"config"}      -> {vapidPublicKey} (public, no auth)
//   {action:"get_state", endpoint?} + user JWT -> prefs + device subscription state
//   {action:"subscribe", subscription:{endpoint,keys:{p256dh,auth}}, userAgent?} + user JWT
//   {action:"set_prefs", penny_alerts, resale_alerts} + user JWT
//   {action:"unsubscribe", endpoint} + user JWT
//   {action:"receipt", endpoint, title}  (service worker delivery receipt, no JWT)
//   {action:"check"} + x-h38-nightly-key header == h38_internal_job_secrets 'scout-push'
//        -> pg_cron entry point (every 30 min); a subscribe also runs the same
//           per-household check inline so a pending catch-up batch fires the
//           moment the first device registers.
//
// Dispatch rules: batched (ONE push per user per run, penny+resale combined
// when both are new), honest counts/stores taken from the actual rows, and a
// per-household/per-scope watermark that advances only once a batch has been
// dispatched (or when every account in the household has that alert off), so
// nothing ever notifies twice and a pre-enabled account that has not yet
// granted phone permission keeps its pending batch (catch-up).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("SCOUT_VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_JWK = Deno.env.get("SCOUT_VAPID_PRIVATE_KEY_JWK") ?? "";
const VAPID_SUBJECT = Deno.env.get("SCOUT_VAPID_SUBJECT") ?? "mailto:highway38solutions@gmail.com";
const PENNY_URL = "https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-penny-web";
const RESALE_URL = "https://jqukmwtsgcsaruucnqja.supabase.co/functions/v1/h38-resale-web";
const INTERNAL_SECRET_NAME = "scout-push";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-h38-nightly-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// ---------- base64url helpers ----------
function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Web Push (RFC 8030 + VAPID RFC 8292 + payload RFC 8291 aes128gcm) ----------
async function vapidJwt(audience: string): Promise<string> {
  const jwk = JSON.parse(VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = bytesToB64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  })));
  const signingInput = new TextEncoder().encode(`${header}.${payload}`);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, signingInput);
  return `${header}.${payload}.${bytesToB64url(new Uint8Array(sig))}`;
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

async function encryptPayload(
  payloadText: string,
  uaPublicB64: string,
  authSecretB64: string,
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(uaPublicB64);
  const authSecret = b64urlToBytes(authSecretB64);
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, ephemeral.privateKey, 256));

  const info = concatBytes(new TextEncoder().encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(shared, authSecret, info, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  // Single record: plaintext + 0x02 (final-record delimiter, no extra padding).
  const plaintext = concatBytes(new TextEncoder().encode(payloadText), new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, plaintext));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concatBytes(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

interface PushSub { endpoint: string; p256dh: string; auth: string }
async function sendPush(sub: PushSub, payload: Record<string, unknown>): Promise<{ status: number; body: string }> {
  const audience = new URL(sub.endpoint).origin;
  const jwt = await vapidJwt(audience);
  const encrypted = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "86400",
      "Urgency": "high",
    },
    body: encrypted,
  });
  const text = await res.text().catch(() => "");
  return { status: res.status, body: text.slice(0, 300) };
}

// ---------- auth / household helpers ----------
async function userFromJwt(req: Request): Promise<{ id: string; email: string } | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === ANON_KEY) return null;
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? "" };
}

async function householdIdsForUser(userId: string): Promise<string[]> {
  const { data } = await admin.from("coupon_household_members").select("household_id").eq("user_id", userId);
  return (data ?? []).map((r: { household_id: string }) => r.household_id);
}

async function getPrefs(userId: string, householdId: string) {
  const { data } = await admin.from("scout_notification_prefs")
    .select("penny_alerts, resale_alerts, prompt_on_open")
    .eq("user_id", userId).eq("household_id", householdId).maybeSingle();
  return data ?? { penny_alerts: false, resale_alerts: false, prompt_on_open: false };
}

// ---------- detection + dispatch ----------
interface BatchInfo {
  count: number;
  topStores: string[];
  maxTs: string | null;
}

async function pennyBatch(householdId: string, sinceIso: string): Promise<BatchInfo> {
  const { data } = await admin.from("deal_engine_observations")
    .select("retailer, first_seen_at")
    .eq("household_id", householdId)
    .gt("first_seen_at", sinceIso)
    .or("product_area.eq.penny,observed_price.eq.0.01")
    .order("first_seen_at", { ascending: false })
    .limit(500);
  const rows = data ?? [];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(String(r.retailer || "a local store"), (counts.get(String(r.retailer || "a local store")) ?? 0) + 1);
  const topStores = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => `${n} at ${name}`);
  return { count: rows.length, topStores, maxTs: rows.length ? String(rows[0].first_seen_at) : null };
}

async function resaleBatch(householdId: string, sinceIso: string): Promise<BatchInfo> {
  // reseller_deals carries no household column; a deal belongs to the
  // household(s) its creator belongs to.
  const { data: members } = await admin.from("coupon_household_members").select("user_id").eq("household_id", householdId);
  const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
  if (!memberIds.length) return { count: 0, topStores: [], maxTs: null };
  const { data } = await admin.from("reseller_deals")
    .select("retailer, created_at")
    .in("created_by", memberIds)
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(String(r.retailer || "a local seller"), (counts.get(String(r.retailer || "a local seller")) ?? 0) + 1);
  const topStores = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => `${n} at ${name}`);
  return { count: rows.length, topStores, maxTs: rows.length ? String(rows[0].created_at) : null };
}

function composeCopy(penny: BatchInfo, resale: BatchInfo): { title: string; body: string; url: string } {
  const parts: string[] = [];
  if (penny.count) parts.push(`${penny.count} new penny item${penny.count === 1 ? "" : "s"}${penny.topStores.length ? ` (${penny.topStores.join(", ")})` : ""}`);
  if (resale.count) parts.push(`${resale.count} new resale lead${resale.count === 1 ? "" : "s"}${resale.topStores.length ? ` (${resale.topStores.join(", ")})` : ""}`);
  const title = penny.count && resale.count ? "Scout: new deals found"
    : penny.count ? "Scout: new penny deals" : "Scout: new resale deals";
  return { title, body: parts.join(" · "), url: penny.count ? PENNY_URL : RESALE_URL };
}

interface SubRow { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
interface DispatchJob { sub: SubRow; title: string; body: string; url: string; scopes: string[]; windowFrom: string }

// Runs detection for one household and dispatches to its eligible accounts.
// Watermarks are PER ACCOUNT: a batch is only "seen" by an account once a
// push for it was handed to that account's push service, so an account whose
// alerts are on but which has no device yet keeps its pending batch
// (catch-up) without anybody else being re-notified. Also used inline by
// subscribe (immediate catch-up) and by the pg_cron check entry point.
async function checkHousehold(householdId: string): Promise<Record<string, unknown>> {
  const nowIso = new Date().toISOString();
  const { data: prefRows } = await admin.from("scout_notification_prefs")
    .select("user_id, penny_alerts, resale_alerts, prompt_on_open").eq("household_id", householdId);
  const { data: subRows } = await admin.from("scout_push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .eq("household_id", householdId).eq("active", true);
  const subs = (subRows ?? []) as SubRow[];
  const { data: stateRows } = await admin.from("scout_push_state")
    .select("user_id, scope, watermark_at").eq("household_id", householdId);
  const state = new Map<string, string>();
  for (const r of stateRows ?? []) state.set(`${r.user_id}:${r.scope}`, r.watermark_at);

  async function watermarkFor(userId: string, scope: string): Promise<string> {
    const key = `${userId}:${scope}`;
    if (!state.has(key)) {
      // No watermark yet (organic account, not pre-seeded): start from now —
      // alerts cover what arrives from here on, never a historical blast.
      await admin.from("scout_push_state").upsert(
        { household_id: householdId, user_id: userId, scope, watermark_at: nowIso },
        { onConflict: "household_id,user_id,scope" },
      );
      state.set(key, nowIso);
    }
    return state.get(key)!;
  }
  async function advance(userId: string, scope: string, ts: string) {
    await admin.from("scout_push_state")
      .update({ watermark_at: ts, updated_at: new Date().toISOString() })
      .eq("household_id", householdId).eq("user_id", userId).eq("scope", scope);
    state.set(`${userId}:${scope}`, ts);
  }

  const jobs: DispatchJob[] = [];
  const pendingAdvance = new Map<string, string>();
  const heldForNoDevice: string[] = [];
  let totalNewPenny = 0;
  let totalNewResale = 0;

  for (const prefs of prefRows ?? []) {
    const userId = prefs.user_id as string;
    const userSubs = subs.filter((s) => s.user_id === userId);
    for (const scope of ["penny", "resale"] as const) {
      const wants = scope === "penny" ? prefs.penny_alerts : prefs.resale_alerts;
      const wm = await watermarkFor(userId, scope);
      if (!wants) {
        // Alert off: keep the watermark current so a later opt-in does not
        // blast everything that arrived while it was off.
        await advance(userId, scope, nowIso);
        continue;
      }
      const batch = scope === "penny" ? await pennyBatch(householdId, wm) : await resaleBatch(householdId, wm);
      if (!batch.count) continue;
      if (scope === "penny") totalNewPenny = Math.max(totalNewPenny, batch.count); else totalNewResale = Math.max(totalNewResale, batch.count);
      if (!userSubs.length) { heldForNoDevice.push(`${userId}:${scope}`); continue; }
      const copy = composeCopy(
        scope === "penny" ? batch : { count: 0, topStores: [], maxTs: null },
        scope === "resale" ? batch : { count: 0, topStores: [], maxTs: null },
      );
      for (const sub of userSubs) {
        jobs.push({ sub, title: copy.title, body: copy.body, url: copy.url, scopes: [scope], windowFrom: wm });
      }
      // Remember the batch end per account+scope; the watermark advances
      // after dispatch, and only for jobs the push service actually
      // answered (a server-side failure must not silently eat a batch).
      if (batch.maxTs) pendingAdvance.set(`${userId}:${scope}`, batch.maxTs);
    }
  }

  // Merge per-device jobs that cover both scopes into ONE combined push.
  const merged = new Map<string, DispatchJob>();
  for (const job of jobs) {
    const existing = merged.get(job.sub.id);
    if (!existing) { merged.set(job.sub.id, job); continue; }
    existing.scopes = [...existing.scopes, ...job.scopes];
    existing.title = "Scout: new deals found";
    existing.body = `${existing.body} · ${job.body}`;
    existing.url = PENNY_URL;
  }

  let sent = 0;
  for (const job of merged.values()) {
    let responded = false;
    try {
      const result = await sendPush(job.sub, { title: job.title, body: job.body, url: job.url, tag: "scout-new-deals" });
      responded = true;
      if (result.status === 404 || result.status === 410) {
        await admin.from("scout_push_subscriptions").update({ active: false, updated_at: new Date().toISOString() }).eq("id", job.sub.id);
      }
      if (result.status >= 200 && result.status < 300) sent++;
      await admin.from("scout_push_dispatch_log").insert({
        household_id: householdId, user_id: job.sub.user_id, subscription_id: job.sub.id,
        scopes: job.scopes.join(","), title: job.title, body: job.body,
        window_from: job.windowFrom, window_to: new Date().toISOString(),
        push_status: result.status, result: result.body,
      });
    } catch (err) {
      await admin.from("scout_push_dispatch_log").insert({
        household_id: householdId, user_id: job.sub.user_id, subscription_id: job.sub.id,
        scopes: job.scopes.join(","), title: job.title, body: job.body,
        push_status: 0, result: String(err).slice(0, 300),
      });
    }
    // The push service answered (any HTTP status): this account has now been
    // handed the batch, so its watermark may advance. If our own send threw,
    // the watermark holds and the batch is retried on the next run instead.
    if (responded) {
      for (const scope of job.scopes) {
        const ts = pendingAdvance.get(`${job.sub.user_id}:${scope}`);
        if (ts) await advance(job.sub.user_id, scope, ts);
      }
    }
  }

  return {
    household: householdId,
    newPenny: totalNewPenny,
    newResale: totalNewResale,
    sent,
    heldForNoDevice,
  };
}

// ---------- request handling ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = String(body.action ?? "");

  if (action === "config") {
    return json({ vapidPublicKey: VAPID_PUBLIC_KEY, pushSupported: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_JWK) });
  }

  if (action === "check") {
    const got = String(req.headers.get("x-h38-nightly-key") ?? "").trim();
    const { data: secretRow } = await admin.from("h38_internal_job_secrets")
      .select("secret_value").eq("name", INTERNAL_SECRET_NAME).maybeSingle();
    if (!got || !secretRow?.secret_value || got !== secretRow.secret_value) {
      return json({ error: "Internal key required" }, 403);
    }
    const { data: households } = await admin.from("scout_push_state").select("household_id");
    const seen = new Set<string>();
    const results: Record<string, unknown>[] = [];
    for (const row of households ?? []) {
      if (seen.has(row.household_id)) continue;
      seen.add(row.household_id);
      results.push(await checkHousehold(row.household_id));
    }
    // Also cover households that have prefs but no state rows yet.
    const { data: prefHouseholds } = await admin.from("scout_notification_prefs").select("household_id");
    for (const row of prefHouseholds ?? []) {
      if (seen.has(row.household_id)) continue;
      seen.add(row.household_id);
      results.push(await checkHousehold(row.household_id));
    }
    return json({ ok: true, results });
  }

  if (action === "receipt") {
    const endpoint = String(body.endpoint ?? "");
    const title = String(body.title ?? "").slice(0, 120);
    if (endpoint.startsWith("https://")) {
      await admin.from("scout_push_receipts").insert({ endpoint_hash: await sha256Hex(endpoint), title });
    }
    return json({ ok: true });
  }

  // Everything below requires a real user session.
  const user = await userFromJwt(req);
  if (!user) return json({ error: "Sign in required" }, 401);
  const households = await householdIdsForUser(user.id);
  if (!households.length) return json({ error: "No Scout household for this account" }, 403);
  const householdId = households[0];

  if (action === "get_state") {
    const prefs = await getPrefs(user.id, householdId);
    const endpoint = String(body.endpoint ?? "");
    let deviceSubscribed = false;
    if (endpoint) {
      const { data } = await admin.from("scout_push_subscriptions")
        .select("id").eq("endpoint", endpoint).eq("user_id", user.id).eq("active", true).maybeSingle();
      deviceSubscribed = Boolean(data);
    }
    return json({ ok: true, householdId, prefs, deviceSubscribed });
  }

  if (action === "set_prefs") {
    const penny = Boolean(body.penny_alerts);
    const resale = Boolean(body.resale_alerts);
    await admin.from("scout_notification_prefs").upsert({
      user_id: user.id, household_id: householdId,
      penny_alerts: penny, resale_alerts: resale,
      prompt_on_open: false, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,household_id" });
    return json({ ok: true, prefs: { penny_alerts: penny, resale_alerts: resale, prompt_on_open: false } });
  }

  if (action === "subscribe") {
    const sub = body.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
    const endpoint = String(sub?.endpoint ?? "");
    const p256dh = String(sub?.keys?.p256dh ?? "");
    const auth = String(sub?.keys?.auth ?? "");
    if (!endpoint.startsWith("https://") || !p256dh || !auth) return json({ error: "Invalid subscription" }, 400);
    await admin.from("scout_push_subscriptions").upsert({
      user_id: user.id, household_id: householdId, endpoint, p256dh, auth,
      user_agent: String(body.userAgent ?? "").slice(0, 300),
      active: true, updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" });
    // Catch-up: if this household has a pending batch for alerts this
    // account wants, dispatch it right now to the just-registered device.
    const dispatch = await checkHousehold(householdId);
    return json({ ok: true, catchUp: dispatch });
  }

  if (action === "unsubscribe") {
    const endpoint = String(body.endpoint ?? "");
    if (endpoint) {
      await admin.from("scout_push_subscriptions")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("endpoint", endpoint).eq("user_id", user.id);
    }
    return json({ ok: true });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});
