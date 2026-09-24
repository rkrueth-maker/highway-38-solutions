import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUILD = "20260924-qbo-server-bridge-1";
const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const QBO_CLIENT_ID = Deno.env.get("QBO_CLIENT_ID") || "";
const QBO_CLIENT_SECRET = Deno.env.get("QBO_CLIENT_SECRET") || "";
const QBO_REDIRECT_URI = Deno.env.get("QBO_REDIRECT_URI") || "";
const QBO_CRYPTO_SECRET = Deno.env.get("H38_QBO_TOKEN_ENCRYPTION_KEY") || "";
const QBO_SCOPE = "com.intuit.quickbooks.accounting";
const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const STATE_TTL_MS = 10 * 60 * 1000;
const EXTERNAL_ACCOUNTING_WRITES_ENABLED = false;

type JsonObject = Record<string, unknown>;
type User = { id: string; email?: string };
type Membership = { role: string; status: string };
type TokenEnvelope = { accessToken: string; refreshToken: string };
type StateEnvelope = { businessId: string; userId: string; mode: "sandbox" | "production"; returnUrl: string; issuedAt: number; expiresAt: number; nonce: string };

function text(value: unknown, max = 8000): string { return String(value ?? "").trim().slice(0, max); }
function safeMessage(value: unknown): string {
  return text(value, 800)
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/(access_token|refresh_token|client_secret)\"?\s*[:=]\s*\"?[^\s\",}]+/gi, "$1=[REDACTED]");
}
function requestOrigin(request: Request): string { return text(request.headers.get("origin")).replace(/\/+$/, ""); }
function corsHeaders(request: Request): HeadersInit {
  const origin = requestOrigin(request);
  const requestedHeaders = text(request.headers.get("access-control-request-headers"), 500);
  return {
    "access-control-allow-origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://highway38solutions.com",
    "access-control-allow-headers": requestedHeaders || "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "600",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin, Access-Control-Request-Headers",
  };
}
function json(request: Request, status: number, payload: unknown): Response { return new Response(JSON.stringify(payload), { status, headers: corsHeaders(request) }); }
function bearer(request: Request): string { const match = text(request.headers.get("authorization")).match(/^Bearer\s+(.+)$/i); return match ? match[1].trim() : ""; }
async function readJson(response: Response): Promise<JsonObject> {
  const raw = await response.text();
  if (!raw) return {};
  try { const value = JSON.parse(raw); return value && typeof value === "object" ? value as JsonObject : {}; } catch (_) { return {}; }
}
function serviceSecret(): string {
  const current = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (current) {
    try { const parsed = JSON.parse(current); if (parsed?.default) return String(parsed.default); } catch (_) {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
function serviceClient() {
  const key = serviceSecret();
  if (!SUPABASE_URL || !key) throw new Error("Supabase server configuration is unavailable.");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function signedInUser(request: Request): Promise<User> {
  const token = bearer(request), key = serviceSecret();
  if (!token) throw new Error("Supabase Auth session is required.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: key, "x-client-info": `h38-qbo-${BUILD}` }, signal: AbortSignal.timeout(15000) });
  const payload = await readJson(response);
  if (!response.ok || typeof payload.id !== "string" || !payload.id) throw new Error("Supabase Auth session is invalid or expired.");
  return { id: payload.id as string, email: typeof payload.email === "string" ? payload.email : undefined };
}
async function membership(service: ReturnType<typeof serviceClient>, userId: string, businessId: string): Promise<Membership> {
  const { data, error } = await service.from("business_memberships").select("role,status").eq("business_id", businessId).eq("auth_user_id", userId).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The signed-in account is not an active member of this business.");
  return data as Membership;
}
function requireFinancialAuthority(row: Membership) {
  if (!/^(owner|administrator)$/i.test(text(row.role, 120))) throw new Error("Owner or administrator authority is required for the accounting connection.");
}
function configured(): boolean { return !!(QBO_CLIENT_ID && QBO_CLIENT_SECRET && QBO_REDIRECT_URI && QBO_CRYPTO_SECRET); }
function normalizeMode(value: unknown): "sandbox" | "production" { return text(value).toLowerCase() === "sandbox" ? "sandbox" : "production"; }
function apiBase(mode: string): string { return mode === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com"; }
function returnUrlAllowed(value: string): boolean {
  try { const url = new URL(value); return ALLOWED_ORIGINS.has(url.origin); } catch (_) { return false; }
}
function defaultReturnUrl(): string { return "https://highway38solutions.com/commercial-app/?page=accounting"; }
function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/"), padded = normalized + "=".repeat((4 - normalized.length % 4) % 4), binary = atob(padded), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
async function cryptoKey(purpose: "state" | "token"): Promise<CryptoKey> {
  if (!QBO_CRYPTO_SECRET) throw new Error("QuickBooks token encryption is not configured.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`h38-qbo-${purpose}-v1:${QBO_CRYPTO_SECRET}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(value: unknown, purpose: "state" | "token"): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12)), plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(purpose), plaintext));
  return `${encodeBase64Url(iv)}.${encodeBase64Url(ciphertext)}`;
}
async function open<T>(value: string, purpose: "state" | "token"): Promise<T> {
  const parts = text(value).split(".");
  if (parts.length !== 2) throw new Error("Encrypted QuickBooks state is invalid.");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64Url(parts[0]) }, await cryptoKey(purpose), decodeBase64Url(parts[1]));
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
async function proof(service: ReturnType<typeof serviceClient>, businessId: string, userId: string | null, actionType: string, details: JsonObject, externalActionOccurred: boolean) {
  const { error } = await service.from("business_proof_log").insert({ business_id: businessId, actor_user_id: userId, action_type: actionType, entity_type: "Accounting Connection", result: "PASS", details, external_action_occurred: externalActionOccurred });
  if (error) console.error("QuickBooks proof log failed", safeMessage(error.message));
}
async function errorLog(service: ReturnType<typeof serviceClient>, businessId: string, userId: string | null, code: string, error: unknown, context: JsonObject = {}) {
  try {
    await service.from("business_error_log").insert({ business_id: businessId, actor_user_id: userId, source: "h38-quickbooks-bridge", error_code: code, message: safeMessage((error as Error)?.message || error), severity: "error", status: "open", context, occurrence_count: 1, last_seen_at: new Date().toISOString() });
  } catch (_) {}
}
async function exchangeToken(params: URLSearchParams): Promise<JsonObject> {
  if (!QBO_CLIENT_ID || !QBO_CLIENT_SECRET) throw new Error("QuickBooks OAuth client is not configured.");
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { authorization: `Basic ${btoa(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`)}`, accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: params.toString(), signal: AbortSignal.timeout(30000) });
  const payload = await readJson(response);
  if (!response.ok || typeof payload.access_token !== "string" || typeof payload.refresh_token !== "string") throw new Error(safeMessage(payload.error_description || payload.error || `QuickBooks token exchange failed (${response.status}).`));
  return payload;
}
function tokenTimes(payload: JsonObject) {
  const now = Date.now(), accessSeconds = Math.max(60, Number(payload.expires_in || 3600)), refreshSeconds = Math.max(accessSeconds, Number(payload.x_refresh_token_expires_in || 8640000));
  return { accessExpiresAt: new Date(now + accessSeconds * 1000).toISOString(), refreshExpiresAt: new Date(now + refreshSeconds * 1000).toISOString() };
}
async function connection(service: ReturnType<typeof serviceClient>, businessId: string) {
  const { data, error } = await service.from("h38_quickbooks_connections").select("business_id,realm_id,company_name,mode,status,token_ciphertext,access_expires_at,refresh_expires_at,connected_by,last_synced_at,last_error,created_at,updated_at").eq("business_id", businessId).maybeSingle();
  if (error) throw error;
  return data;
}
function publicConnection(row: any) {
  if (!row) return { status: "disconnected", configured: configured(), externalWritesEnabled: false };
  return { status: text(row.status), configured: configured(), realmId: text(row.realm_id), companyName: text(row.company_name), mode: normalizeMode(row.mode), accessExpiresAt: row.access_expires_at || null, refreshExpiresAt: row.refresh_expires_at || null, lastSyncedAt: row.last_synced_at || null, lastError: text(row.last_error, 500), externalWritesEnabled: false };
}
async function saveTokens(service: ReturnType<typeof serviceClient>, businessId: string, userId: string, mode: "sandbox" | "production", realmId: string, companyName: string, payload: JsonObject) {
  const times = tokenTimes(payload), tokenCiphertext = await seal({ accessToken: text(payload.access_token), refreshToken: text(payload.refresh_token) } satisfies TokenEnvelope, "token");
  const { error } = await service.from("h38_quickbooks_connections").upsert({ business_id: businessId, realm_id: realmId, company_name: companyName, mode, status: "connected", token_ciphertext: tokenCiphertext, access_expires_at: times.accessExpiresAt, refresh_expires_at: times.refreshExpiresAt, connected_by: userId, last_error: null, updated_at: new Date().toISOString() }, { onConflict: "business_id" });
  if (error) throw error;
  return times;
}
async function providerJson(url: string, accessToken: string): Promise<JsonObject> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(safeMessage((payload.Fault as any)?.Error?.[0]?.Message || payload.error_description || payload.error || `QuickBooks API failed (${response.status}).`));
  return payload;
}
async function companyInfo(mode: string, realmId: string, accessToken: string): Promise<JsonObject> {
  const payload = await providerJson(`${apiBase(mode)}/v3/company/${encodeURIComponent(realmId)}/companyinfo/${encodeURIComponent(realmId)}`, accessToken);
  const info = payload.QueryResponse && typeof payload.QueryResponse === "object" ? (payload.QueryResponse as JsonObject).CompanyInfo : payload.CompanyInfo;
  return Array.isArray(info) ? (info[0] as JsonObject || {}) : (info && typeof info === "object" ? info as JsonObject : {});
}
async function refreshConnection(service: ReturnType<typeof serviceClient>, row: any, actorUserId: string): Promise<any> {
  if (!row?.token_ciphertext) throw new Error("QuickBooks connection tokens are unavailable. Reconnect QuickBooks.");
  const token = await open<TokenEnvelope>(row.token_ciphertext, "token");
  const payload = await exchangeToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: token.refreshToken }));
  await saveTokens(service, row.business_id, actorUserId, normalizeMode(row.mode), text(row.realm_id), text(row.company_name), payload);
  return await connection(service, row.business_id);
}
async function usableAccessToken(service: ReturnType<typeof serviceClient>, row: any, actorUserId: string): Promise<{ row: any; accessToken: string }> {
  let current = row;
  const expiry = new Date(current?.access_expires_at || 0).getTime();
  if (!expiry || expiry <= Date.now() + 5 * 60 * 1000) current = await refreshConnection(service, current, actorUserId);
  if (!current?.token_ciphertext) throw new Error("QuickBooks connection token is unavailable.");
  const token = await open<TokenEnvelope>(current.token_ciphertext, "token");
  return { row: current, accessToken: token.accessToken };
}
async function qboCount(mode: string, realmId: string, accessToken: string, entity: string): Promise<number> {
  const query = `select count(*) from ${entity}`;
  const payload = await providerJson(`${apiBase(mode)}/v3/company/${encodeURIComponent(realmId)}/query?query=${encodeURIComponent(query)}`, accessToken);
  const q = payload.QueryResponse && typeof payload.QueryResponse === "object" ? payload.QueryResponse as JsonObject : {};
  const total = Number(q.totalCount ?? 0);
  return Number.isFinite(total) ? total : 0;
}
async function h38Count(service: ReturnType<typeof serviceClient>, businessId: string, collectionName: string): Promise<number> {
  const { count, error } = await service.from("business_records").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("collection", collectionName).eq("record_status", "active");
  if (error) throw error;
  return Number(count || 0);
}
async function previewReconciliation(service: ReturnType<typeof serviceClient>, businessId: string, row: any, userId: string) {
  const usable = await usableAccessToken(service, row, userId), mode = normalizeMode(usable.row.mode), realmId = text(usable.row.realm_id);
  if (!realmId) throw new Error("QuickBooks realm/company ID is missing.");
  const [customerQbo, invoiceQbo, paymentQbo, expenseQbo, customerH38, invoiceH38, paymentH38, expenseH38, mappings] = await Promise.all([
    qboCount(mode, realmId, usable.accessToken, "Customer"), qboCount(mode, realmId, usable.accessToken, "Invoice"), qboCount(mode, realmId, usable.accessToken, "Payment"), qboCount(mode, realmId, usable.accessToken, "Purchase"),
    h38Count(service, businessId, "customers"), h38Count(service, businessId, "invoices"), h38Count(service, businessId, "payments"), h38Count(service, businessId, "expenses"),
    service.from("h38_quickbooks_mappings").select("entity_type,h38_record_key,qbo_id,h38_updated_at,provider_updated_at,last_reconciled_at").eq("business_id", businessId),
  ]);
  if ((mappings as any).error) throw (mappings as any).error;
  const mappingRows = Array.isArray((mappings as any).data) ? (mappings as any).data : [];
  const mapped = { customer: 0, invoice: 0, payment: 0, expense: 0 } as Record<string, number>;
  for (const item of mappingRows) if (Object.prototype.hasOwnProperty.call(mapped, item.entity_type)) mapped[item.entity_type] += 1;
  const counts = {
    customers: { h38: customerH38, quickBooks: customerQbo, mapped: mapped.customer },
    invoices: { h38: invoiceH38, quickBooks: invoiceQbo, mapped: mapped.invoice },
    payments: { h38: paymentH38, quickBooks: paymentQbo, mapped: mapped.payment },
    expenses: { h38: expenseH38, quickBooks: expenseQbo, mapped: mapped.expense },
  };
  await service.from("h38_quickbooks_connections").update({ last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq("business_id", businessId);
  await proof(service, businessId, userId, "QBO_RECONCILIATION_PREVIEW", { counts, providerWrites: false }, false);
  return { counts, providerWrites: false, conflictsRequireReview: true, message: "Read-only reconciliation preview complete. No QuickBooks accounting record was created or changed." };
}
async function startAuth(request: Request, service: ReturnType<typeof serviceClient>, user: User, businessId: string, body: JsonObject) {
  const member = await membership(service, user.id, businessId); requireFinancialAuthority(member);
  if (!configured()) return json(request, 503, { status: "FAIL", error: "QuickBooks connection secrets are not configured on the server." });
  const mode = normalizeMode(body.mode), requestedReturn = text(body.returnUrl, 1500), returnUrl = returnUrlAllowed(requestedReturn) ? requestedReturn : defaultReturnUrl(), now = Date.now();
  const state = await seal({ businessId, userId: user.id, mode, returnUrl, issuedAt: now, expiresAt: now + STATE_TTL_MS, nonce: crypto.randomUUID() } satisfies StateEnvelope, "state");
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", QBO_CLIENT_ID); url.searchParams.set("response_type", "code"); url.searchParams.set("scope", QBO_SCOPE); url.searchParams.set("redirect_uri", QBO_REDIRECT_URI); url.searchParams.set("state", state);
  return json(request, 200, { status: "PASS", authorizationUrl: url.toString(), mode, externalWritesEnabled: false });
}
async function callback(request: Request): Promise<Response> {
  const service = serviceClient(), url = new URL(request.url), stateRaw = text(url.searchParams.get("state")), code = text(url.searchParams.get("code")), realmId = text(url.searchParams.get("realmId")), providerError = text(url.searchParams.get("error"));
  let state: StateEnvelope | null = null;
  try {
    state = await open<StateEnvelope>(stateRaw, "state");
    if (!state.businessId || !state.userId || !state.returnUrl || state.expiresAt < Date.now()) throw new Error("QuickBooks authorization state expired or is invalid.");
    if (!returnUrlAllowed(state.returnUrl)) throw new Error("QuickBooks return URL is not approved.");
    const member = await membership(service, state.userId, state.businessId); requireFinancialAuthority(member);
    if (providerError) throw new Error(`QuickBooks authorization was not completed: ${providerError}.`);
    if (!code || !realmId) throw new Error("QuickBooks authorization did not return a code and realm ID.");
    const tokenPayload = await exchangeToken(new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: QBO_REDIRECT_URI }));
    const token = { accessToken: text(tokenPayload.access_token), refreshToken: text(tokenPayload.refresh_token) } satisfies TokenEnvelope;
    const info = await companyInfo(state.mode, realmId, token.accessToken), companyName = text(info.CompanyName || info.LegalName || "QuickBooks company", 300);
    await saveTokens(service, state.businessId, state.userId, state.mode, realmId, companyName, tokenPayload);
    await proof(service, state.businessId, state.userId, "QBO_CONNECTION_AUTHORIZED", { realmId, companyName, mode: state.mode, accountingWritesEnabled: false }, true);
    const destination = new URL(state.returnUrl); destination.searchParams.set("qbo", "connected");
    return Response.redirect(destination.toString(), 303);
  } catch (error) {
    if (state?.businessId) await errorLog(service, state.businessId, state.userId || null, "QBO_OAUTH_CALLBACK", error, { stage: "oauth_callback" });
    const destination = new URL(state?.returnUrl && returnUrlAllowed(state.returnUrl) ? state.returnUrl : defaultReturnUrl()); destination.searchParams.set("qbo", "error"); destination.searchParams.set("qbo_message", safeMessage((error as Error)?.message || error).slice(0, 180));
    return Response.redirect(destination.toString(), 303);
  }
}
async function authenticatedAction(request: Request, body: JsonObject): Promise<Response> {
  const service = serviceClient(), user = await signedInUser(request), businessId = text(body.businessId);
  if (!businessId) return json(request, 400, { status: "FAIL", error: "businessId is required." });
  const member = await membership(service, user.id, businessId); requireFinancialAuthority(member);
  const action = text(body.action).toLowerCase();
  try {
    if (action === "start") return startAuth(request, service, user, businessId, body);
    const row = await connection(service, businessId);
    if (action === "status") return json(request, 200, { status: "PASS", connection: publicConnection(row), build: BUILD });
    if (!row || row.status !== "connected") return json(request, 409, { status: "FAIL", error: "QuickBooks is not connected for this business." });
    if (action === "refresh") {
      const refreshed = await refreshConnection(service, row, user.id);
      await proof(service, businessId, user.id, "QBO_TOKEN_REFRESHED", { realmId: text(refreshed.realm_id), mode: normalizeMode(refreshed.mode), accountingWritesEnabled: false }, true);
      return json(request, 200, { status: "PASS", connection: publicConnection(refreshed) });
    }
    if (action === "preview") {
      const preview = await previewReconciliation(service, businessId, row, user.id);
      return json(request, 200, { status: "PASS", connection: publicConnection(await connection(service, businessId)), preview });
    }
    if (action === "disconnect") {
      let externalActionOccurred = false;
      try {
        const token = await open<TokenEnvelope>(row.token_ciphertext, "token"), response = await fetch(REVOKE_URL, { method: "POST", headers: { authorization: `Basic ${btoa(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`)}`, accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ token: token.refreshToken || token.accessToken }), signal: AbortSignal.timeout(30000) });
        externalActionOccurred = true;
        if (!response.ok && response.status !== 400) throw new Error(`QuickBooks revoke failed (${response.status}).`);
      } finally {
        const { error } = await service.from("h38_quickbooks_connections").update({ status: "disconnected", token_ciphertext: null, access_expires_at: null, refresh_expires_at: null, last_error: null, updated_at: new Date().toISOString() }).eq("business_id", businessId);
        if (error) throw error;
      }
      await proof(service, businessId, user.id, "QBO_CONNECTION_DISCONNECTED", { realmId: text(row.realm_id), accountingWritesEnabled: false }, externalActionOccurred);
      return json(request, 200, { status: "PASS", connection: publicConnection(await connection(service, businessId)) });
    }
    if (action === "push" || action === "sync" || action === "write") return json(request, 409, { status: "FAIL", error: "QuickBooks accounting writes are still fail-closed. Run reconciliation and use a separately approved provider-write control when that phase is enabled.", externalWritesEnabled: EXTERNAL_ACCOUNTING_WRITES_ENABLED });
    return json(request, 400, { status: "FAIL", error: "Unsupported QuickBooks bridge action." });
  } catch (error) {
    await errorLog(service, businessId, user.id, `QBO_${action.toUpperCase() || "ACTION"}`, error, { action });
    return json(request, 500, { status: "FAIL", error: safeMessage((error as Error)?.message || error) });
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  if (request.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) return callback(request);
  if (request.method !== "POST") return json(request, 405, { status: "FAIL", error: "Method not allowed." });
  const origin = requestOrigin(request);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(request, 403, { status: "FAIL", error: "Origin is not allowed." });
  let body: JsonObject = {};
  try { const parsed = await request.json(); body = parsed && typeof parsed === "object" ? parsed as JsonObject : {}; } catch (_) { return json(request, 400, { status: "FAIL", error: "Request body must be JSON." }); }
  try { return await authenticatedAction(request, body); } catch (error) { return json(request, 401, { status: "FAIL", error: safeMessage((error as Error)?.message || error) }); }
});
