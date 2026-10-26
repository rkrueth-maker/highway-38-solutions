import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
// @ts-ignore — pure-JS shared core, fixture-tested by scripts/test-fleet-provider-mappers.mjs
import { PROVIDERS, providerById, mapSamsaraVehicles, mapGeotabVehicles, mapGeotabTrips, mapLinxupVehicles, mirrorPositionPayload, mirrorStampPayload } from "./mappers.mjs";

/* ============================================================================
 * H38 Fleet Providers — the generalized tracker connection layer.
 *
 * Registry-driven (mappers.mjs PROVIDERS): a provider is config + a mapper
 * + a sync entry point here, never a hardcoded branch. Bouncie stays in its
 * proven nl-bouncie-fleet function (OAuth app flow, Northern Lakes) and is
 * registered as a delegated provider; every other provider connects and
 * syncs here with the owner's own credentials:
 *   - credentials are validated against the provider BEFORE anything is
 *     stored; on success the secret fields are AES-GCM encrypted into
 *     fleet_provider_secrets (service-role only), non-secret config lives
 *     in fleet_provider_connections.settings. Raw keys never touch
 *     business_records.
 *   - sync normalizes into fleet_vehicles / fleet_trips and mirrors the
 *     latest positions into business_records crewPositions +
 *     crewLocationStamps so the dispatch map and recorded-stops view —
 *     which read those collections for every business — show tracker
 *     vehicles next to phone crews.
 * Owner/administrator membership is required for every action.
 * ========================================================================== */
const BUILD = "20261026-fleet-providers-5";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
/* Current-secret pattern (same as h38-quickbooks-bridge serviceSecret()):
 * this project migrated to the new Supabase key system — the working
 * server secret lives in SUPABASE_SECRET_KEYS.default; the legacy
 * SUPABASE_SERVICE_ROLE_KEY env is revoked and rejects Auth calls. */
function serviceSecret() {
  const current = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (current) { try { const parsed = JSON.parse(current); if (parsed?.default) return String(parsed.default); } catch (_) {} }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
const SERVICE_KEY = serviceSecret();
const TOKEN_KEY = Deno.env.get("FLEET_TOKEN_ENCRYPTION_KEY") || Deno.env.get("BOUNCIE_TOKEN_ENCRYPTION_KEY") || "";
type Json = Record<string, unknown>;
function clean(v: unknown, max = 3000) { return String(v ?? "").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]").slice(0, max); }
function db() { if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase service configuration is unavailable."); return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }); }
function cors(req: Request) { const o = clean(req.headers.get("origin"), 300); return { "access-control-allow-origin": o || "*", "access-control-allow-headers": "authorization, apikey, content-type, x-client-info", "access-control-allow-methods": "GET, POST, OPTIONS", "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "vary": "Origin" }; }
function json(req: Request, status: number, payload: unknown) { return new Response(JSON.stringify(payload), { status, headers: cors(req) }); }
function bearer(req: Request) { const m = String(req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i); return m ? m[1].trim() : ""; }
function b64url(bytes: Uint8Array) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function fromB64url(v: string) { let s = v.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const raw = atob(s), out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; }
async function keyMaterial() { if (!TOKEN_KEY) throw new Error("Fleet token encryption is not configured on the server (FLEET_TOKEN_ENCRYPTION_KEY)."); const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(TOKEN_KEY)); return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]); }
async function encrypt(value: string) { const nonce = crypto.getRandomValues(new Uint8Array(12)), key = await keyMaterial(); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(value))); return { cipher: b64url(ct), nonce: b64url(nonce) }; }
async function decrypt(cipher: string, nonce: string) { const key = await keyMaterial(); const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(nonce) }, key, fromB64url(cipher)); return new TextDecoder().decode(pt); }
/* Session validation via the Auth REST API — the repo's proven pattern
 * (h38-quote-ai, h38-conversation-organize, ...). The supabase-js
 * service-client auth.getUser() path used by nl-bouncie-fleet rejects
 * valid session tokens in this project; do not use it here. */
async function signedUser(req: Request) { const token = bearer(req); if (!token) throw new Error("Supabase Auth session is required."); const service = db(); const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SERVICE_KEY, "x-client-info": BUILD }, signal: AbortSignal.timeout(15000) }); const user = await res.json().catch(() => ({})) as Json; if (!res.ok || typeof user.id !== "string" || !user.id) { console.warn(JSON.stringify({ event: "fleet-providers-auth-rejected", status: res.status, errorCode: clean(user.error_code || user.code || "", 120) })); throw new Error("Supabase Auth session is invalid or expired."); } return { service, user: { id: user.id as string } }; }
async function member(service: ReturnType<typeof db>, userId: string, businessId: string) { const { data, error } = await service.from("business_memberships").select("role,status").eq("business_id", businessId).eq("auth_user_id", userId).eq("status", "active").maybeSingle(); if (error) throw error; if (!data) throw new Error("Active business membership is required."); const role = clean(data.role, 60).toLowerCase(); if (!["owner", "administrator"].includes(role)) throw new Error("Owner or Administrator access is required."); return role; }
async function proof(service: ReturnType<typeof db>, businessId: string, userId: string | null, action: string, details: Json) { try { await service.from("business_proof_log").insert({ business_id: businessId, actor_user_id: userId, action_type: action, entity_type: "Fleet", result: "PASS", details, external_action_occurred: false }); } catch (_) {} }
function num(v: unknown) { const n = Number(v); return Number.isFinite(n) ? n : null; }

/* ------------------------- connection storage ------------------------- */
async function connection(service: ReturnType<typeof db>, businessId: string, provider: string) {
  const { data, error } = await service.from("fleet_provider_connections").select("*").eq("business_id", businessId).eq("provider", provider).maybeSingle();
  if (error) throw error; return data as Json | null;
}
async function saveCredential(service: ReturnType<typeof db>, connectionId: string, blob: Json) {
  const enc = await encrypt(JSON.stringify(blob));
  const { error } = await service.from("fleet_provider_secrets").upsert({
    connection_id: connectionId, access_token_ciphertext: enc.cipher, refresh_token_ciphertext: null,
    token_nonce: JSON.stringify({ access: enc.nonce }), token_expires_at: null, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
async function readCredential(service: ReturnType<typeof db>, conn: Json): Promise<Json> {
  const { data, error } = await service.from("fleet_provider_secrets").select("*").eq("connection_id", clean(conn.id, 100)).maybeSingle();
  if (error) throw error; if (!data) throw new Error("Saved credentials for this connection are missing. Reconnect the provider.");
  const nonces = JSON.parse(clean(data.token_nonce, 500) || "{}") as Json;
  const plain = await decrypt(clean(data.access_token_ciphertext, 20000), clean(nonces.access, 200));
  const secrets = JSON.parse(plain) as Json;
  return { ...(conn.settings as Json || {}), ...secrets };
}

/* ------------------------------ Samsara ------------------------------- */
const SAMSARA_API = "https://api.samsara.com";
async function samsaraGet(token: string, path: string) {
  const r = await fetch(`${SAMSARA_API}${path}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(25000) });
  const raw = await r.text(); let p: Json = {}; try { p = raw ? JSON.parse(raw) : {}; } catch (_) { p = { raw: raw.slice(0, 500) }; }
  if (!r.ok) throw new Error(`Samsara ${path} failed (${r.status}): ${clean((p as Json).message || raw, 600)}`);
  return p;
}
async function samsaraPaged(token: string, basePath: string) {
  const out: Json[] = []; let after = "";
  for (let page = 0; page < 5; page++) {
    const p = await samsaraGet(token, basePath + (after ? `${basePath.includes("?") ? "&" : "?"}after=${encodeURIComponent(after)}` : ""));
    if (Array.isArray(p.data)) out.push(...(p.data as Json[]));
    const pg = (p.pagination || {}) as Json;
    if (!pg.hasNextPage || !pg.endCursor) break;
    after = clean(pg.endCursor, 500);
  }
  return { data: out };
}
async function samsaraSync(service: ReturnType<typeof db>, businessId: string, conn: Json) {
  const cred = await readCredential(service, conn);
  const token = clean(cred.apiToken, 8000); if (!token) throw new Error("Samsara API token is missing. Reconnect Samsara.");
  const [vehicles, stats] = await Promise.all([
    samsaraPaged(token, "/fleet/vehicles"),
    samsaraPaged(token, "/fleet/vehicles/stats?types=gps,obdOdometerMeters"),
  ]);
  const rows = mapSamsaraVehicles(businessId, vehicles, stats) as Json[];
  return finishSync(service, businessId, "samsara", rows, []);
}

/* ------------------------------- Geotab ------------------------------- */
async function geotabRpc(server: string, method: string, params: Json) {
  const host = clean(server, 200).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host) throw new Error("Geotab server is missing. Reconnect Geotab.");
  const r = await fetch(`https://${host}/apiv1`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: 1, method, params }), signal: AbortSignal.timeout(25000) });
  const p = await r.json().catch(() => ({})) as Json;
  if (!r.ok) throw new Error(`Geotab request failed (${r.status}).`);
  if (p.error) { const e = (p.error as Json).data as Json || {}; throw new Error(`Geotab ${clean(e.type, 100) || "error"}: ${clean((p.error as Json).message, 500)}`); }
  return p.result;
}
async function geotabSession(cred: Json) {
  let server = clean(cred.server, 200);
  const database = clean(cred.database, 200), userName = clean(cred.userName, 300), password = clean(cred.password, 4000);
  if (!database || !userName || !password) throw new Error("Geotab database, user name, and password are all required. Reconnect Geotab.");
  let auth = await geotabRpc(server, "Authenticate", { database, userName, password }) as Json;
  const path = clean(auth?.path, 200);
  if (path && path !== "ThisServer" && path.replace(/^https?:\/\//, "") !== server.replace(/^https?:\/\//, "")) {
    server = path; auth = await geotabRpc(server, "Authenticate", { database, userName, password }) as Json;
  }
  const sessionId = clean(auth?.sessionId, 500);
  if (!sessionId) throw new Error("Geotab did not return a session. Check the database, user name, and password.");
  return { server, credentials: { database, userName, sessionId } };
}
async function geotabSync(service: ReturnType<typeof db>, businessId: string, conn: Json) {
  const cred = await readCredential(service, conn);
  const { server, credentials } = await geotabSession(cred);
  const fromDate = new Date(Date.now() - 7 * 86400000).toISOString();
  const [devices, statuses, tripsRaw] = await Promise.all([
    geotabRpc(server, "Get", { typeName: "Device", credentials, resultsLimit: 500 }),
    geotabRpc(server, "Get", { typeName: "DeviceStatusInfo", credentials, resultsLimit: 500 }),
    geotabRpc(server, "Get", { typeName: "Trip", credentials, search: { fromDate }, resultsLimit: 1000 }).catch(() => []),
  ]);
  const rows = mapGeotabVehicles(businessId, devices, statuses) as Json[];
  const result = await finishSync(service, businessId, "geotab", rows, []);
  const { data: dbVehicles } = await service.from("fleet_vehicles").select("id,provider_device_id").eq("business_id", businessId).eq("provider", "geotab");
  const byDevice: Record<string, string> = {}; for (const v of dbVehicles || []) byDevice[clean(v.provider_device_id, 200)] = v.id;
  const trips = mapGeotabTrips(businessId, tripsRaw, byDevice) as Json[];
  if (trips.length) {
    const { error } = await service.from("fleet_trips").upsert(trips, { onConflict: "business_id,provider,provider_trip_id" });
    if (error) throw error;
  }
  return { ...result, trips: trips.length };
}

/* ------------------------------- Linxup ------------------------------- */
/* PROVISIONAL — see mappers.mjs. Auth model (per-account API host link +
 * V2 API key as bearer) is confirmed from Linxup's help center; the device
 * payload nesting is not publicly specified, so the mapper picks fields
 * defensively and every surface labels this provider provisional. */
function linxupHost(raw: unknown) {
  let host = clean(raw, 500).replace(/\/+$/, "");
  if (host && !/^https?:\/\//i.test(host)) host = `https://${host}`;
  return host;
}
async function linxupGet(cred: Json, path: string) {
  const host = linxupHost(cred.host); if (!host) throw new Error("Linxup API host link is missing. Reconnect Linxup.");
  const token = clean(cred.apiToken, 8000); if (!token) throw new Error("Linxup API key is missing. Reconnect Linxup.");
  const r = await fetch(`${host}${path}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(25000) });
  const raw = await r.text(); let p: unknown = {}; try { p = raw ? JSON.parse(raw) : {}; } catch (_) { p = { raw: raw.slice(0, 500) }; }
  if (!r.ok) throw new Error(`Linxup ${path} failed (${r.status}): ${clean(raw, 600)}`);
  return p;
}
async function linxupSync(service: ReturnType<typeof db>, businessId: string, conn: Json) {
  const cred = await readCredential(service, conn);
  const payload = await linxupGet(cred, "/devices");
  const rows = mapLinxupVehicles(businessId, payload) as Json[];
  const result = await finishSync(service, businessId, "linxup", rows, []);
  return { ...result, provisional: true };
}

/* ---------------------------- sync finish ----------------------------- */
async function finishSync(service: ReturnType<typeof db>, businessId: string, provider: string, rows: Json[], _trips: Json[]) {
  if (rows.length) {
    const { error } = await service.from("fleet_vehicles").upsert(rows, { onConflict: "business_id,provider,provider_device_id" });
    if (error) throw error;
  }
  const current = new Set(rows.map((r) => clean(r.provider_device_id, 200)));
  const { data: existing } = await service.from("fleet_vehicles").select("id,provider_device_id").eq("business_id", businessId).eq("provider", provider).eq("active", true);
  for (const old of existing || []) {
    if (!current.has(clean(old.provider_device_id))) {
      await service.from("fleet_vehicles").update({ active: false, connection_status: "removed", updated_at: new Date().toISOString() }).eq("id", old.id);
    }
  }
  const mirrored = await mirror(service, businessId, rows);
  await service.from("fleet_provider_connections").update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("business_id", businessId).eq("provider", provider);
  return { vehicles: rows.length, mirroredPositions: mirrored };
}
async function mirror(service: ReturnType<typeof db>, businessId: string, rows: Json[]) {
  const positioned = rows.filter((r) => num(r.latitude) !== null && num(r.longitude) !== null);
  if (!positioned.length) return 0;
  const { data: ownerRow } = await service.from("business_memberships").select("auth_user_id").eq("business_id", businessId).eq("status", "active").in("role", ["owner", "administrator"]).limit(1).maybeSingle();
  const actor = ownerRow?.auth_user_id as string | undefined;
  if (!actor) return 0;
  const now = new Date().toISOString();
  const positions = positioned.map((r) => { const m = mirrorPositionPayload(r, now); return { business_id: businessId, collection: "crewPositions", record_key: m.recordKey, payload: m.payload, record_status: "active", created_by: actor, updated_by: actor }; });
  const { error } = await service.from("business_records").upsert(positions, { onConflict: "business_id,collection,record_key" });
  if (error) throw error;
  const stamps = positioned.map((r) => { const m = mirrorStampPayload(r, now); return { business_id: businessId, collection: "crewLocationStamps", record_key: m.recordKey, payload: m.payload, record_status: "active", created_by: actor, updated_by: actor }; });
  await service.from("business_records").upsert(stamps, { onConflict: "business_id,collection,record_key" });
  return positions.length;
}

/* ------------------------------ actions ------------------------------- */
function publicRegistry(businessRows: Json[]) {
  const byProvider = new Map(businessRows.map((r) => [clean(r.provider, 60), r]));
  return PROVIDERS.map((p) => {
    const conn = byProvider.get(p.id);
    return {
      id: p.id, name: p.name, authModel: p.authModel, provisional: p.provisional,
      delegatedFunction: p.delegatedFunction, blurb: p.blurb, credentialFields: p.credentialFields,
      connection: conn ? { status: conn.status, connectedAt: conn.connected_at, lastSyncAt: conn.last_sync_at, lastWebhookAt: conn.last_webhook_at } : null,
    };
  });
}
async function actionProviders(service: ReturnType<typeof db>, businessId: string) {
  const { data, error } = await service.from("fleet_provider_connections").select("provider,status,connected_at,last_sync_at,last_webhook_at").eq("business_id", businessId);
  if (error) throw error;
  return { providers: publicRegistry((data || []) as Json[]) };
}
async function actionConnect(service: ReturnType<typeof db>, businessId: string, userId: string, input: Json) {
  const provider = providerById(clean(input.provider, 60));
  if (!provider) throw new Error("Unknown tracker provider.");
  if (provider.delegatedFunction) throw new Error(`${provider.name} connects through its own sign-in flow (${provider.delegatedFunction}). Use the ${provider.name} Connect button.`);
  const creds = (input.credentials || {}) as Json;
  const settings: Json = {}; const secrets: Json = {};
  for (const f of provider.credentialFields) {
    const value = clean(creds[f.key], f.secret ? 8000 : 500);
    if (!value) throw new Error(`${f.label} is required.`);
    if (f.secret) secrets[f.key] = value; else settings[f.key] = value;
  }
  /* Validate against the live provider BEFORE storing anything. */
  if (provider.id === "samsara") await samsaraGet(clean(secrets.apiToken, 8000), "/fleet/vehicles");
  if (provider.id === "geotab") await geotabSession({ ...settings, ...secrets });
  if (provider.id === "linxup") await linxupGet({ ...settings, ...secrets }, "/devices");
  const { data: conn, error } = await service.from("fleet_provider_connections").upsert(
    { business_id: businessId, provider: provider.id, status: "connected", connected_at: new Date().toISOString(), settings, updated_at: new Date().toISOString() },
    { onConflict: "business_id,provider" },
  ).select().single();
  if (error) throw error;
  await saveCredential(service, conn.id, secrets);
  await proof(service, businessId, userId, "FLEET_PROVIDER_CONNECTED", { provider: provider.id, provisional: provider.provisional, externalActionOccurred: false });
  return { provider: provider.id, status: "connected", provisional: provider.provisional };
}
async function actionDisconnect(service: ReturnType<typeof db>, businessId: string, userId: string, input: Json) {
  const provider = providerById(clean(input.provider, 60));
  if (!provider) throw new Error("Unknown tracker provider.");
  const conn = await connection(service, businessId, provider.id);
  if (conn) {
    await service.from("fleet_provider_secrets").delete().eq("connection_id", clean(conn.id, 100));
    await service.from("fleet_provider_connections").update({ status: "not_connected", updated_at: new Date().toISOString() }).eq("id", clean(conn.id, 100));
  }
  await proof(service, businessId, userId, "FLEET_PROVIDER_DISCONNECTED", { provider: provider.id, externalActionOccurred: false });
  return { provider: provider.id, status: "not_connected" };
}
async function actionSync(service: ReturnType<typeof db>, businessId: string, userId: string, input: Json) {
  const provider = providerById(clean(input.provider, 60));
  if (!provider) throw new Error("Unknown tracker provider.");
  if (provider.delegatedFunction) return { delegated: provider.delegatedFunction, provider: provider.id };
  const conn = await connection(service, businessId, provider.id);
  if (!conn || clean(conn.status) !== "connected") throw new Error(`Connect the ${provider.name} account first.`);
  let result: Json;
  if (provider.id === "samsara") result = await samsaraSync(service, businessId, conn);
  else if (provider.id === "geotab") result = await geotabSync(service, businessId, conn);
  else if (provider.id === "linxup") result = await linxupSync(service, businessId, conn);
  else throw new Error("Unsupported fleet provider.");
  await proof(service, businessId, userId, "FLEET_PROVIDER_SYNC", { provider: provider.id, ...result, externalActionOccurred: false });
  return { provider: provider.id, ...result };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  const action = new URL(req.url).searchParams.get("action");
  try {
    if (req.method !== "POST") return json(req, 405, { status: "FAIL", message: "POST required.", build: BUILD });
    const input = await req.json() as Json;
    const requested = clean(input.action || action, 100);
    const { service, user } = await signedUser(req);
    const businessId = clean(input.businessId, 80);
    if (!businessId) throw new Error("businessId is required.");
    await member(service, user.id, businessId);
    if (requested === "providers") { const result = await actionProviders(service, businessId); return json(req, 200, { status: "PASS", build: BUILD, ...result, externalActionOccurred: false }); }
    if (requested === "connect") { const result = await actionConnect(service, businessId, user.id, input); return json(req, 200, { status: "PASS", build: BUILD, ...result, externalActionOccurred: false }); }
    if (requested === "disconnect") { const result = await actionDisconnect(service, businessId, user.id, input); return json(req, 200, { status: "PASS", build: BUILD, ...result, externalActionOccurred: false }); }
    if (requested === "sync") { const result = await actionSync(service, businessId, user.id, input); return json(req, 200, { status: "PASS", build: BUILD, ...result, externalActionOccurred: false }); }
    throw new Error("Unsupported fleet action.");
  } catch (error) {
    return json(req, 200, { status: "FAIL", build: BUILD, message: clean((error as Error)?.message || error, 1200), externalActionOccurred: false });
  }
});
