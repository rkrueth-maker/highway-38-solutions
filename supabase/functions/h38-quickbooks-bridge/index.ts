import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUILD = "20261101-wave3tail1-qbo-sync-1";
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
// Two-way sync engine (Wave 3 tail #1): writes are enabled in code, but every
// provider write still requires a connected QuickBooks company for the
// business. With no connection, sync attempts fail honestly into the error
// queue (h38_quickbooks_sync_outbox, status 'failed' with the exact reason).
const EXTERNAL_ACCOUNTING_WRITES_ENABLED = true;

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
  const { data, error } = await service.from("h38_quickbooks_connections").select("business_id,realm_id,company_name,mode,status,token_ciphertext,access_expires_at,refresh_expires_at,connected_by,last_synced_at,last_inbound_at,last_error,created_at,updated_at").eq("business_id", businessId).maybeSingle();
  if (error) throw error;
  return data;
}
function publicConnection(row: any) {
  if (!row) return { status: "disconnected", configured: configured(), externalWritesEnabled: EXTERNAL_ACCOUNTING_WRITES_ENABLED, syncReady: false };
  const connected = text(row.status) === "connected";
  return { status: text(row.status), configured: configured(), realmId: text(row.realm_id), companyName: text(row.company_name), mode: normalizeMode(row.mode), accessExpiresAt: row.access_expires_at || null, refreshExpiresAt: row.refresh_expires_at || null, lastSyncedAt: row.last_synced_at || null, lastInboundAt: row.last_inbound_at || null, lastError: text(row.last_error, 500), externalWritesEnabled: EXTERNAL_ACCOUNTING_WRITES_ENABLED, syncReady: connected && configured() };
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
// ---------------------------------------------------------------------------
// Two-way sync engine (Wave 3 tail #1).
// OUT: Office customers/invoices/payments -> QuickBooks via the outbox.
// IN: payments recorded in QuickBooks -> Office payment records.
// Every failed attempt lands in h38_quickbooks_sync_outbox with status
// 'failed' and the exact reason (the owner-visible error queue); the retry
// action resets failed rows to 'pending'.
// ---------------------------------------------------------------------------
const COLLECTION_ENTITY: Record<string, string> = { customers: "customer", invoices: "invoice", payments: "payment" };
const ENTITY_ORDER: Record<string, number> = { customer: 0, invoice: 1, payment: 2 };
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as JsonObject;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}
async function payloadHash(payload: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(payload)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function moneyNumber(value: unknown): number { const n = Number(value); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function dateOnly(value: unknown): string { const t = text(value, 40); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : new Date().toISOString().slice(0, 10); }

async function enqueueChanges(service: ReturnType<typeof serviceClient>, businessId: string, body: JsonObject) {
  const limit = Math.min(200, Math.max(1, Number(body.limit || 50)));
  const onlyKeys = Array.isArray(body.recordKeys) ? (body.recordKeys as unknown[]).map((k) => text(k, 220)).filter(Boolean) : [];
  let enqueued = 0, unchanged = 0, scanned = 0;
  for (const [collection, entity] of Object.entries(COLLECTION_ENTITY)) {
    let query = service.from("business_records").select("record_key,payload,updated_at").eq("business_id", businessId).eq("collection", collection).eq("record_status", "active").order("updated_at", { ascending: false }).limit(limit);
    if (onlyKeys.length) query = query.in("record_key", onlyKeys);
    const { data, error } = await query;
    if (error) throw error;
    for (const rec of (data || []) as any[]) {
      scanned++;
      const hash = await payloadHash(rec.payload);
      const { data: map } = await service.from("h38_quickbooks_mappings").select("last_sync_hash").eq("business_id", businessId).eq("entity_type", entity).eq("h38_record_key", rec.record_key).maybeSingle();
      const { data: existing } = await service.from("h38_quickbooks_sync_outbox").select("id,payload_hash,status").eq("business_id", businessId).eq("entity_type", entity).eq("h38_record_key", rec.record_key).eq("direction", "out").maybeSingle();
      if (map?.last_sync_hash === hash && !existing) { unchanged++; continue; }
      if (existing && existing.payload_hash === hash && existing.status !== "failed") { unchanged++; continue; }
      const rowData = { business_id: businessId, entity_type: entity, h38_record_key: rec.record_key, direction: "out", operation: "upsert", payload: rec.payload, payload_hash: hash, status: "pending", last_error: null, updated_at: new Date().toISOString() };
      const write = existing
        ? await service.from("h38_quickbooks_sync_outbox").update(rowData).eq("id", existing.id)
        : await service.from("h38_quickbooks_sync_outbox").insert(rowData);
      if (write.error) throw write.error;
      enqueued++;
    }
  }
  return { enqueued, unchanged, scanned };
}

async function queueState(service: ReturnType<typeof serviceClient>, businessId: string) {
  const { data, error } = await service.from("h38_quickbooks_sync_outbox").select("id,entity_type,h38_record_key,direction,status,attempts,last_error,qbo_id,created_at,updated_at,synced_at").eq("business_id", businessId).order("updated_at", { ascending: false }).limit(50);
  if (error) throw error;
  const counts = { pending: 0, failed: 0, synced: 0 };
  const { data: all } = await service.from("h38_quickbooks_sync_outbox").select("status").eq("business_id", businessId).limit(2000);
  for (const row of (all || []) as any[]) if (row.status in counts) counts[row.status as keyof typeof counts]++;
  return { counts, items: data || [] };
}

async function retryFailed(service: ReturnType<typeof serviceClient>, businessId: string, body: JsonObject) {
  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map((v) => text(v, 60)).filter(Boolean) : [];
  let query = service.from("h38_quickbooks_sync_outbox").update({ status: "pending", last_error: null, updated_at: new Date().toISOString() }).eq("business_id", businessId).eq("status", "failed");
  if (ids.length) query = query.in("id", ids);
  const { data, error } = await query.select("id");
  if (error) throw error;
  return { requeued: (data || []).length };
}

async function providerWrite(url: string, accessToken: string, bodyObj: JsonObject): Promise<JsonObject> {
  const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(bodyObj), signal: AbortSignal.timeout(30000) });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(safeMessage((payload.Fault as any)?.Error?.[0]?.Message || (payload.Fault as any)?.Error?.[0]?.Detail || payload.error_description || payload.error || `QuickBooks API failed (${response.status}).`));
  return payload;
}
function qboCustomerPayload(p: JsonObject): JsonObject {
  const out: JsonObject = { DisplayName: text(p["Customer Name"] || p["Display Name"] || "Customer", 500) };
  const email = text(p.Email || p["Email Address"], 200); if (email) out.PrimaryEmailAddr = { Address: email };
  const phone = text(p.Phone || p["Phone Number"], 60); if (phone) out.PrimaryPhone = { FreeFormNumber: phone };
  const address = text(p.Address || p["Billing Address"], 500); if (address) out.BillAddr = { Line1: address };
  return out;
}
function qboInvoicePayload(p: JsonObject, customerQboId: string): JsonObject {
  const total = moneyNumber(p.Total ?? p.Subtotal ?? p.Balance);
  const out: JsonObject = {
    CustomerRef: { value: customerQboId },
    TxnDate: dateOnly(p["Created Time"] || p["Invoice Date"]),
    Line: [{ DetailType: "SalesItemLineDetail", Amount: total, Description: text(p.Description || p.Notes || "Office invoice", 1000), SalesItemLineDetail: { ItemRef: { value: "1" }, Qty: 1, UnitPrice: total } }],
  };
  const doc = text(p["Invoice Number"], 21); if (doc) out.DocNumber = doc;
  const due = text(p["Due Date"], 20); if (/^\d{4}-\d{2}-\d{2}/.test(due)) out.DueDate = due.slice(0, 10);
  return out;
}
function qboPaymentPayload(p: JsonObject, customerQboId: string, invoiceQboId: string): JsonObject {
  const amount = moneyNumber(p.Amount ?? p.Total);
  return {
    CustomerRef: { value: customerQboId },
    TotalAmt: amount,
    TxnDate: dateOnly(p["Created Time"] || p["Payment Date"]),
    PaymentRefNum: text(p.Reference, 30) || undefined,
    Line: [{ Amount: amount, LinkedTxn: [{ TxnId: invoiceQboId, TxnType: "Invoice" }] }],
  };
}
async function mappingFor(service: ReturnType<typeof serviceClient>, businessId: string, entity: string, recordKey: string) {
  const { data } = await service.from("h38_quickbooks_mappings").select("qbo_id,qbo_sync_token").eq("business_id", businessId).eq("entity_type", entity).eq("h38_record_key", recordKey).maybeSingle();
  return data as any;
}
async function pushOne(service: ReturnType<typeof serviceClient>, businessId: string, mode: string, realmId: string, accessToken: string, item: any): Promise<string> {
  const p = (item.payload || {}) as JsonObject;
  const existing = await mappingFor(service, businessId, item.entity_type, item.h38_record_key);
  let bodyObj: JsonObject, endpoint = "";
  if (item.entity_type === "customer") {
    bodyObj = qboCustomerPayload(p); endpoint = "customer";
  } else if (item.entity_type === "invoice") {
    const customerKey = text(p["Customer ID"], 220);
    const customerMap = customerKey ? await mappingFor(service, businessId, "customer", customerKey) : null;
    if (!customerMap?.qbo_id) throw new Error(`Customer ${customerKey || "(missing)"} has not synced to QuickBooks yet. Sync customers first, then retry this invoice from the error queue.`);
    bodyObj = qboInvoicePayload(p, text(customerMap.qbo_id)); endpoint = "invoice";
  } else if (item.entity_type === "payment") {
    const invoiceKey = text(p["Invoice ID"], 220);
    const invoiceMap = invoiceKey ? await mappingFor(service, businessId, "invoice", invoiceKey) : null;
    if (!invoiceMap?.qbo_id) throw new Error(`Invoice ${invoiceKey || "(missing)"} has not synced to QuickBooks yet. Sync invoices first, then retry this payment from the error queue.`);
    const { data: invoiceRec } = await service.from("business_records").select("payload").eq("business_id", businessId).eq("collection", "invoices").eq("record_key", invoiceKey).maybeSingle();
    const customerKey = text((invoiceRec?.payload as JsonObject)?.["Customer ID"], 220);
    const customerMap = customerKey ? await mappingFor(service, businessId, "customer", customerKey) : null;
    if (!customerMap?.qbo_id) throw new Error(`Customer ${customerKey || "(missing)"} for invoice ${invoiceKey} has not synced to QuickBooks yet. Sync customers first, then retry.`);
    bodyObj = qboPaymentPayload(p, text(customerMap.qbo_id), text(invoiceMap.qbo_id)); endpoint = "payment";
  } else {
    throw new Error(`Unsupported sync entity: ${item.entity_type}.`);
  }
  if (existing?.qbo_id) { bodyObj.Id = text(existing.qbo_id); bodyObj.SyncToken = text(existing.qbo_sync_token || "0"); bodyObj.sparse = true; }
  const response = await providerWrite(`${apiBase(mode)}/v3/company/${encodeURIComponent(realmId)}/${endpoint}?minorversion=73`, accessToken, bodyObj);
  const entityResponse = (response[(endpoint[0].toUpperCase() + endpoint.slice(1))] || {}) as JsonObject;
  const qboId = text(entityResponse.Id, 60);
  if (!qboId) throw new Error(`QuickBooks accepted the ${endpoint} write but returned no Id.`);
  const now = new Date().toISOString();
  const { error: mapError } = await service.from("h38_quickbooks_mappings").upsert({ business_id: businessId, entity_type: item.entity_type, h38_record_key: item.h38_record_key, qbo_id: qboId, qbo_sync_token: text(entityResponse.SyncToken, 40) || null, provider_updated_at: now, h38_updated_at: now, last_sync_hash: item.payload_hash, last_reconciled_at: now, updated_at: now }, { onConflict: "business_id,entity_type,h38_record_key" });
  if (mapError) throw mapError;
  return qboId;
}
async function pullPayments(service: ReturnType<typeof serviceClient>, businessId: string, mode: string, realmId: string, accessToken: string, connRow: any): Promise<number> {
  const since = connRow?.last_inbound_at ? dateOnly(connRow.last_inbound_at) : "2000-01-01";
  const query = `select * from Payment where TxnDate >= '${since}' maxresults 100`;
  const payload = await providerJson(`${apiBase(mode)}/v3/company/${encodeURIComponent(realmId)}/query?query=${encodeURIComponent(query)}`, accessToken);
  const qr = payload.QueryResponse && typeof payload.QueryResponse === "object" ? payload.QueryResponse as JsonObject : {};
  const payments = Array.isArray(qr.Payment) ? qr.Payment as JsonObject[] : [];
  let imported = 0;
  for (const pay of payments) {
    const lines = Array.isArray(pay.Line) ? pay.Line as JsonObject[] : [];
    const linked = lines.flatMap((l) => Array.isArray(l.LinkedTxn) ? l.LinkedTxn as JsonObject[] : []).find((t) => t.TxnType === "Invoice");
    if (!linked?.TxnId) continue;
    const { data: invMap } = await service.from("h38_quickbooks_mappings").select("h38_record_key").eq("business_id", businessId).eq("entity_type", "invoice").eq("qbo_id", text(linked.TxnId, 60)).maybeSingle();
    if (!invMap) continue;
    const recordKey = `PAYMENT-QBO-${text(pay.Id, 40)}`;
    const { data: existingRec } = await service.from("business_records").select("id").eq("business_id", businessId).eq("collection", "payments").eq("record_key", recordKey).maybeSingle();
    if (existingRec) continue;
    const recordPayload = { "Payment ID": recordKey, "QBO Payment ID": text(pay.Id, 40), "Invoice ID": invMap.h38_record_key, Amount: moneyNumber(pay.TotalAmt), Method: "QuickBooks Online", Reference: text(p.PaymentRefNum, 100), Status: "Recorded in QuickBooks Online", "Created Time": text((pay.MetaData as JsonObject)?.CreateTime, 40) || new Date().toISOString(), "Record Version": 1 };
    const { error: insError } = await service.from("business_records").insert({ business_id: businessId, collection: "payments", record_key: recordKey, payload: recordPayload, record_status: "active" });
    if (insError) throw insError;
    const hash = await payloadHash(recordPayload), now = new Date().toISOString();
    await service.from("h38_quickbooks_mappings").upsert({ business_id: businessId, entity_type: "payment", h38_record_key: recordKey, qbo_id: text(pay.Id, 40), qbo_sync_token: text(pay.SyncToken, 40) || null, provider_updated_at: now, h38_updated_at: now, last_sync_hash: hash, last_reconciled_at: now, updated_at: now }, { onConflict: "business_id,entity_type,h38_record_key" });
    await service.from("h38_quickbooks_sync_outbox").upsert({ business_id: businessId, entity_type: "payment", h38_record_key: recordKey, direction: "in", operation: "upsert", payload: recordPayload, payload_hash: hash, status: "synced", attempts: 1, qbo_id: text(pay.Id, 40), synced_at: now, updated_at: now }, { onConflict: "business_id,entity_type,h38_record_key,direction" });
    imported++;
  }
  return imported;
}
async function runSync(service: ReturnType<typeof serviceClient>, businessId: string, row: any, userId: string, body: JsonObject) {
  const limit = Math.min(100, Math.max(1, Number(body.limit || 25)));
  const { data: pending, error } = await service.from("h38_quickbooks_sync_outbox").select("*").eq("business_id", businessId).eq("direction", "out").eq("status", "pending").order("created_at", { ascending: true }).limit(200);
  if (error) throw error;
  const items = ((pending || []) as any[]).sort((a, b) => (ENTITY_ORDER[a.entity_type] ?? 9) - (ENTITY_ORDER[b.entity_type] ?? 9)).slice(0, limit);
  const result = { attempted: 0, synced: 0, failed: 0, importedPayments: 0, connected: false, failures: [] as { recordKey: string; entityType: string; error: string }[] };
  const failItem = async (item: any, reason: string) => {
    result.failed++;
    result.failures.push({ recordKey: item.h38_record_key, entityType: item.entity_type, error: reason });
    await service.from("h38_quickbooks_sync_outbox").update({ status: "failed", attempts: Number(item.attempts || 0) + 1, last_error: reason.slice(0, 900), updated_at: new Date().toISOString() }).eq("id", item.id);
  };
  if (!row || row.status !== "connected" || !configured()) {
    const reason = !configured()
      ? "QuickBooks sync cannot reach Intuit: the server's Intuit app secrets are not configured (QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI, H38_QBO_TOKEN_ENCRYPTION_KEY), so no QuickBooks company can be connected yet. The record is safe in the error queue — connect QuickBooks, then Retry."
      : "QuickBooks is not connected for this business. The record is safe in the error queue — connect QuickBooks, then Retry.";
    for (const item of items) { result.attempted++; await failItem(item, reason); }
    if (items.length) {
      await errorLog(service, businessId, userId, "QBO_SYNC_BLOCKED", new Error(reason), { attempted: items.length });
      await service.from("h38_quickbooks_connections").upsert({ business_id: businessId, status: row?.status || "disconnected", last_error: reason.slice(0, 500), updated_at: new Date().toISOString() }, { onConflict: "business_id" });
    }
    return result;
  }
  result.connected = true;
  const usable = await usableAccessToken(service, row, userId), mode = normalizeMode(usable.row.mode), realmId = text(usable.row.realm_id);
  if (!realmId) throw new Error("QuickBooks realm/company ID is missing.");
  for (const item of items) {
    result.attempted++;
    try {
      const qboId = await pushOne(service, businessId, mode, realmId, usable.accessToken, item);
      await service.from("h38_quickbooks_sync_outbox").update({ status: "synced", attempts: Number(item.attempts || 0) + 1, last_error: null, qbo_id: qboId, synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", item.id);
      result.synced++;
    } catch (error) {
      await failItem(item, safeMessage((error as Error)?.message || error));
    }
  }
  try { result.importedPayments = await pullPayments(service, businessId, mode, realmId, usable.accessToken, usable.row); } catch (error) { await errorLog(service, businessId, userId, "QBO_SYNC_INBOUND", error, { stage: "pull_payments" }); }
  const now = new Date().toISOString();
  await service.from("h38_quickbooks_connections").update({ last_synced_at: now, last_inbound_at: now, last_error: result.failed ? result.failures[0].error.slice(0, 500) : null, updated_at: now }).eq("business_id", businessId);
  await proof(service, businessId, userId, "QBO_SYNC_RUN", { attempted: result.attempted, synced: result.synced, failed: result.failed, importedPayments: result.importedPayments }, result.synced > 0 || result.importedPayments > 0);
  return result;
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
    await proof(service, state.businessId, state.userId, "QBO_CONNECTION_AUTHORIZED", { realmId, companyName, mode: state.mode, accountingWritesEnabled: EXTERNAL_ACCOUNTING_WRITES_ENABLED }, true);
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
    if (action === "enqueue") {
      const enq = await enqueueChanges(service, businessId, body);
      await proof(service, businessId, user.id, "QBO_SYNC_ENQUEUE", enq, false);
      return json(request, 200, { status: "PASS", connection: publicConnection(row), enqueue: enq, queue: await queueState(service, businessId), build: BUILD });
    }
    if (action === "queue") return json(request, 200, { status: "PASS", connection: publicConnection(row), queue: await queueState(service, businessId), build: BUILD });
    if (action === "retry") {
      const retried = await retryFailed(service, businessId, body);
      await proof(service, businessId, user.id, "QBO_SYNC_RETRY", retried, false);
      return json(request, 200, { status: "PASS", connection: publicConnection(row), retry: retried, queue: await queueState(service, businessId), build: BUILD });
    }
    if (action === "sync" || action === "push") {
      const sync = await runSync(service, businessId, row, user.id, body);
      return json(request, 200, { status: "PASS", connection: publicConnection(await connection(service, businessId)), sync, queue: await queueState(service, businessId), build: BUILD });
    }
    if (!row || row.status !== "connected") return json(request, 409, { status: "FAIL", error: "QuickBooks is not connected for this business." });
    if (action === "refresh") {
      const refreshed = await refreshConnection(service, row, user.id);
      await proof(service, businessId, user.id, "QBO_TOKEN_REFRESHED", { realmId: text(refreshed.realm_id), mode: normalizeMode(refreshed.mode), accountingWritesEnabled: EXTERNAL_ACCOUNTING_WRITES_ENABLED }, true);
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
      await proof(service, businessId, user.id, "QBO_CONNECTION_DISCONNECTED", { realmId: text(row.realm_id), accountingWritesEnabled: EXTERNAL_ACCOUNTING_WRITES_ENABLED }, externalActionOccurred);
      return json(request, 200, { status: "PASS", connection: publicConnection(await connection(service, businessId)) });
    }
    if (action === "write") return json(request, 400, { status: "FAIL", error: "Use the sync action: it pushes the outbox to QuickBooks and pulls new QuickBooks payments back.", externalWritesEnabled: EXTERNAL_ACCOUNTING_WRITES_ENABLED });
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
