// business-drive-connect — own-it file storage (Rick, 2026-10-21).
//
// Owns the Google Drive connection lifecycle for a business:
//   POST {action:'authorize-url'}  owner/admin -> Google consent URL
//   GET  ?action=callback&code&state            -> token exchange, folder
//        creation, settings write, redirect back into the Office
//   POST {action:'status'}         any member  -> connection + registry sums
//   POST {action:'disconnect'}     owner/admin -> revoke + clear + default
//   POST {action:'resolve'}        any member  -> short-lived stream URL
//   GET  ?action=stream&t=<token>              -> server-mediated file bytes
//        (field crew view Drive files WITHOUT the owner's Google login)
//
// Policy: records/accounting never live here — files only. Drive files do
// not count toward the business's 5 GB server-data limit. If the OAuth
// client is not configured yet, authorize-url reports configured:false so
// the Settings card can say so honestly instead of dead-ending.
// Tokens are AES-GCM encrypted in business_drive_secrets (service role
// only) and never returned, logged, or placed in any record.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLIENT_ID = Deno.env.get("H38_DRIVE_OAUTH_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("H38_DRIVE_OAUTH_CLIENT_SECRET") || "";
const TOKEN_KEY = Deno.env.get("H38_DRIVE_TOKEN_ENCRYPTION_KEY") || "";
const STATE_SECRET = Deno.env.get("H38_DRIVE_STATE_SECRET") || "";
const OAUTH_BASE = Deno.env.get("H38_GOOGLE_OAUTH_BASE") || "https://oauth2.googleapis.com";
const API_BASE = Deno.env.get("H38_GOOGLE_API_BASE") || "https://www.googleapis.com";
const APP_ORIGIN = Deno.env.get("H38_APP_ORIGIN") || "https://highway38solutions.com";
const H38 = "10b85a89-5834-436d-95b0-c6ee2eb335ad";
const ROOT_FOLDER_NAME = "Highway 38 Office";
const SCOPES = "openid email https://www.googleapis.com/auth/drive.file";

type Json = Record<string, unknown>;
type SB = ReturnType<typeof createClient>;

function cors(request: Request): HeadersInit {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json",
    "vary": "Origin, Access-Control-Request-Headers",
  };
}
function json(request: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: cors(request) });
}
function safeMessage(error: unknown): string {
  return String(error instanceof Error ? error.message : error || "Request failed.")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[REDACTED_TOKEN]")
    .replace(/sb_secret_[A-Za-z0-9_-]+/g, "[REDACTED_KEY]")
    .slice(0, 700);
}
function clean(value: unknown, max = 400): string {
  return String(value == null ? "" : value).slice(0, max);
}
function configured(): string[] {
  const missing: string[] = [];
  if (!CLIENT_ID) missing.push("H38_DRIVE_OAUTH_CLIENT_ID");
  if (!CLIENT_SECRET) missing.push("H38_DRIVE_OAUTH_CLIENT_SECRET");
  if (!TOKEN_KEY) missing.push("H38_DRIVE_TOKEN_ENCRYPTION_KEY");
  if (!STATE_SECRET) missing.push("H38_DRIVE_STATE_SECRET");
  return missing;
}
function callbackUrl(): string {
  return `${SUPABASE_URL}/functions/v1/business-drive-connect?action=callback`;
}

// --- crypto helpers (AES-GCM tokens at rest + HMAC-signed short tokens) -----
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function keyMaterial(): Promise<CryptoKey> {
  if (!TOKEN_KEY) throw new Error("H38_DRIVE_TOKEN_ENCRYPTION_KEY is not configured.");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(TOKEN_KEY));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encrypt(value: string): Promise<{ cipher: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyMaterial();
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(value)));
  return { cipher: b64url(ct), nonce: b64url(nonce) };
}
async function decrypt(cipher: string, nonce: string): Promise<string> {
  const key = await keyMaterial();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(nonce) }, key, fromB64url(cipher));
  return new TextDecoder().decode(pt);
}
async function hmacKey(): Promise<CryptoKey> {
  if (!STATE_SECRET) throw new Error("H38_DRIVE_STATE_SECRET is not configured.");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(STATE_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function signToken(payload: Json, ttlSeconds: number): Promise<string> {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = b64url(new TextEncoder().encode(JSON.stringify(body)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(encoded));
  return `${encoded}.${b64url(new Uint8Array(sig))}`;
}
async function verifyToken(token: string): Promise<Json | null> {
  const [encoded, sig] = String(token || "").split(".");
  if (!encoded || !sig) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromB64url(sig), new TextEncoder().encode(encoded))
    .catch(() => false);
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(encoded))) as Json;
    if (Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// --- auth / roles --------------------------------------------------------------
async function caller(request: Request): Promise<{ userId: string } | Response> {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader) return json(request, 401, { error: "Sign-in required." });
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return json(request, 401, { error: "Sign-in required." });
  return { userId: data.user.id };
}
async function roleFor(sb: SB, businessId: string, userId: string): Promise<string> {
  const { data } = await sb.from("business_memberships")
    .select("role").eq("business_id", businessId).eq("auth_user_id", userId)
    .eq("status", "active").limit(1).maybeSingle();
  return String((data as Json | null)?.role || "");
}
async function requireRole(request: Request, sb: SB, businessId: string, userId: string, adminOnly: boolean): Promise<string | Response> {
  const role = await roleFor(sb, businessId, userId);
  const platformRole = businessId === H38 ? role : await roleFor(sb, H38, userId);
  const effective = role || platformRole;
  const allowed = adminOnly
    ? (role === "owner" || role === "administrator" || platformRole === "owner" || platformRole === "administrator")
    : Boolean(effective);
  if (!allowed) {
    return json(request, 403, { error: adminOnly
      ? "Only the business's owners and administrators can manage file storage."
      : "You are not a member of this business." });
  }
  return effective;
}

// --- tokens --------------------------------------------------------------------
async function saveTokens(sb: SB, businessId: string, tokens: Json): Promise<void> {
  const access = clean(tokens.access_token, 8000);
  const refresh = clean(tokens.refresh_token, 8000);
  if (!access || !refresh) throw new Error("Google did not return both an access and a refresh token. Reconnect and approve offline access.");
  const ea = await encrypt(access);
  const er = await encrypt(refresh);
  const { error } = await sb.from("business_drive_secrets").upsert({
    business_id: businessId,
    access_token_ciphertext: ea.cipher, refresh_token_ciphertext: er.cipher,
    token_nonce: JSON.stringify({ access: ea.nonce, refresh: er.nonce }),
    token_expires_at: new Date(Date.now() + Math.max(60, Number(tokens.expires_in || 3600)) * 1000).toISOString(),
    granted_scopes: clean(tokens.scope, 300) || SCOPES,
    updated_at: new Date().toISOString(),
  }, { onConflict: "business_id" });
  if (error) throw new Error(`Could not store Drive tokens: ${error.message}`);
}
async function accessToken(sb: SB, businessId: string): Promise<string> {
  const { data: sec } = await sb.from("business_drive_secrets")
    .select("*").eq("business_id", businessId).maybeSingle();
  const row = sec as Json | null;
  if (!row?.refresh_token_ciphertext) throw new Error("This business has no stored Drive grant.");
  let nonces: Record<string, string> = {};
  try { nonces = JSON.parse(clean(row.token_nonce, 500) || "{}"); } catch { /* handled below: no usable nonces */ }
  const exp = new Date(clean(row.token_expires_at, 100)).getTime();
  let refresh = "";
  try {
    if (row.access_token_ciphertext && nonces.access && exp > Date.now() + 120000) {
      return await decrypt(clean(row.access_token_ciphertext, 12000), clean(nonces.access, 200));
    }
    if (!nonces.refresh) throw new Error("Stored Drive token has no nonce.");
    refresh = await decrypt(clean(row.refresh_token_ciphertext, 12000), clean(nonces.refresh, 200));
  } catch {
    throw new Error("Saved Google Drive token could not be read. Reconnect Google Drive.");
  }
  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      grant_type: "refresh_token", refresh_token: refresh,
    }),
  });
  const tokens = await res.json().catch(() => ({})) as Json;
  if (!res.ok || !tokens.access_token) {
    throw new Error(`Drive token refresh failed (${res.status}): ${clean(tokens.error, 120)}`);
  }
  const ea = await encrypt(clean(tokens.access_token, 8000));
  await sb.from("business_drive_secrets").update({
    access_token_ciphertext: ea.cipher,
    token_nonce: JSON.stringify({ ...nonces, access: ea.nonce }),
    token_expires_at: new Date(Date.now() + Math.max(60, Number(tokens.expires_in || 3600)) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);
  return clean(tokens.access_token, 8000);
}
async function driveJson(token: string, url: string, init?: RequestInit): Promise<Json> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({})) as Json;
  if (!res.ok) {
    const msg = (data as Json)?.error ? clean(((data as Json).error as Json)?.message, 300) : res.statusText;
    throw new Error(`Drive API ${res.status}: ${msg}`);
  }
  return data;
}
async function ensureRootFolder(token: string): Promise<string> {
  const q = encodeURIComponent(`name='${ROOT_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await driveJson(token, `${API_BASE}/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`);
  const files = (found.files as Json[]) || [];
  if (files.length) return clean(files[0].id, 200);
  const created = await driveJson(token, `${API_BASE}/drive/v3/files?fields=id`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: ROOT_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  return clean(created.id, 200);
}
function appRedirect(params: Record<string, string>): Response {
  const qs = new URLSearchParams(params).toString();
  return new Response(null, {
    status: 302,
    headers: { Location: `${APP_ORIGIN}/commercial-app/index.html?${qs}` },
  });
}

// --- OAuth callback (browser GET, authenticated by the signed state) ----------
async function handleCallback(request: Request, url: URL): Promise<Response> {
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const oauthError = url.searchParams.get("error") || "";
  if (oauthError) return appRedirect({ drive: "error", driveReason: "cancelled" });
  const payload = await verifyToken(state);
  if (!payload || !code) return appRedirect({ drive: "error", driveReason: "state" });
  const businessId = clean(payload.b, 100);
  const userId = clean(payload.u, 100);
  if (!businessId || !userId) return appRedirect({ drive: "error", driveReason: "state" });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const role = await roleFor(sb, businessId, userId);
    const platformRole = businessId === H38 ? role : await roleFor(sb, H38, userId);
    if (!(role === "owner" || role === "administrator" || platformRole === "owner" || platformRole === "administrator")) {
      return appRedirect({ drive: "error", driveReason: "role" });
    }
    const res = await fetch(`${OAUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        grant_type: "authorization_code", code, redirect_uri: callbackUrl(),
      }),
    });
    const tokens = await res.json().catch(() => ({})) as Json;
    if (!res.ok || !tokens.access_token) throw new Error(`Token exchange failed (${res.status}).`);
    await saveTokens(sb, businessId, tokens);
    const token = clean(tokens.access_token, 8000);
    const info = await driveJson(token, `${API_BASE}/oauth2/v3/userinfo`).catch(() => ({} as Json));
    const email = clean((info as Json).email, 320);
    const rootId = await ensureRootFolder(token);
    const { error } = await sb.from("business_storage_settings").upsert({
      business_id: businessId, provider: "google_drive", connection_status: "connected",
      provider_account_email: email || null, root_folder_id: rootId,
      connected_by: userId, connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "business_id" });
    if (error) throw new Error(`Settings write failed: ${error.message}`);
    return appRedirect({ drive: "connected" });
  } catch (error) {
    console.warn("drive callback:", safeMessage(error));
    return appRedirect({ drive: "error", driveReason: "exchange" });
  }
}

// --- stream (browser GET, authenticated by the short-lived signed token) ------
async function handleStream(request: Request, url: URL): Promise<Response> {
  const payload = await verifyToken(url.searchParams.get("t") || "");
  if (!payload) return new Response("This file link has expired. Reopen the file from the Office.", { status: 401 });
  const businessId = clean(payload.b, 100);
  const fileId = clean(payload.f, 200);
  const registryId = clean(payload.r, 100);
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const token = await accessToken(sb, businessId);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    const range = request.headers.get("range");
    if (range) headers["Range"] = range;
    const res = await fetch(`${API_BASE}/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers });
    if (res.status === 404 || res.status === 410) {
      await markUnavailable(sb, businessId, registryId, "File is missing from the connected Google Drive.");
      return new Response("This file is no longer in the connected Google Drive.", { status: 410 });
    }
    if (!res.ok && res.status !== 206) {
      return new Response("The file could not be loaded from Google Drive right now.", { status: 502 });
    }
    const out = new Headers();
    for (const h of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const v = res.headers.get(h);
      if (v) out.set(h, v);
    }
    out.set("Cache-Control", "private, max-age=120");
    return new Response(res.body, { status: res.status, headers: out });
  } catch (error) {
    return new Response(`The file could not be loaded: ${safeMessage(error)}`, { status: 502 });
  }
}
async function markUnavailable(sb: SB, businessId: string, registryId: string, reason: string): Promise<void> {
  if (!registryId) return;
  const { data: row } = await sb.from("business_external_files")
    .select("id, document_record_key, drive_file_id").eq("id", registryId).eq("business_id", businessId).maybeSingle();
  const reg = row as Json | null;
  if (!reg) return;
  await sb.from("business_external_files")
    .update({ status: "unavailable", status_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", registryId);
  const docKey = clean(reg.document_record_key, 200);
  let docRow: Json | null = null;
  if (docKey) {
    const { data: doc } = await sb.from("business_records")
      .select("id, payload").eq("business_id", businessId).eq("collection", "documents")
      .eq("record_key", docKey).maybeSingle();
    docRow = doc as Json | null;
  }
  if (!docRow?.payload) {
    // Direct-upload records carry no registry document key; find the record
    // by the Drive file id stamped into its payload instead.
    const fileId = clean(reg.drive_file_id, 200);
    if (fileId) {
      const { data: rows } = await sb.from("business_records")
        .select("id, payload").eq("business_id", businessId).eq("collection", "documents")
        .order("created_at", { ascending: false }).limit(500);
      docRow = ((rows || []) as Json[]).find((r) => clean((r.payload as Json)?.["Provider File ID"], 200) === fileId) || null;
    }
  }
  if (docRow?.payload) {
    const payload = { ...(docRow.payload as Json), "Status": "Unavailable — missing from Drive", "Updated Time": new Date().toISOString() };
    await sb.from("business_records").update({ payload }).eq("id", clean(docRow.id, 100));
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(request) });
  const url = new URL(request.url);
  const getAction = url.searchParams.get("action") || "";
  try {
    if (request.method === "GET" && getAction === "callback") return await handleCallback(request, url);
    if (request.method === "GET" && getAction === "stream") return await handleStream(request, url);
    if (request.method !== "POST") return json(request, 405, { error: "POST only." });

    const auth = await caller(request);
    if (auth instanceof Response) return auth;
    const body = await request.json().catch(() => ({})) as Json;
    const action = clean(body.action, 60);
    const businessId = clean(body.businessId, 100);
    if (!businessId) return json(request, 400, { error: "businessId is required." });
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const missing = configured();

    if (action === "authorize-url") {
      const gate = await requireRole(request, sb, businessId, auth.userId, true);
      if (gate instanceof Response) return gate;
      if (missing.length) return json(request, 200, { configured: false, missing });
      const state = await signToken({ b: businessId, u: auth.userId, n: crypto.randomUUID() }, 900);
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", callbackUrl());
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("include_granted_scopes", "true");
      authUrl.searchParams.set("state", state);
      return json(request, 200, { configured: true, url: authUrl.toString() });
    }

    if (action === "status") {
      const gate = await requireRole(request, sb, businessId, auth.userId, false);
      if (gate instanceof Response) return gate;
      const { data: settings } = await sb.from("business_storage_settings")
        .select("provider, connection_status, provider_account_email, root_folder_id, connected_at")
        .eq("business_id", businessId).maybeSingle();
      const s = settings as Json | null;
      const { data: sums } = await sb.from("business_external_files")
        .select("file_size").eq("business_id", businessId).eq("status", "available");
      const rows = (sums as Json[]) || [];
      const externalBytes = rows.reduce((acc, r) => acc + Number(r.file_size || 0), 0);
      return json(request, 200, {
        configured: missing.length === 0,
        missing,
        provider: s?.provider || "supabase",
        connectionStatus: s?.connection_status || (s?.provider === "google_drive" ? "not_configured" : "connected"),
        providerAccountEmail: s?.provider_account_email || "",
        rootFolderConfigured: Boolean(s?.root_folder_id),
        connectedAt: s?.connected_at || null,
        externalFileCount: rows.length,
        externalBytes,
      });
    }

    if (action === "disconnect") {
      const gate = await requireRole(request, sb, businessId, auth.userId, true);
      if (gate instanceof Response) return gate;
      // Best-effort revoke at Google; local clearing happens regardless.
      try {
        const { data: sec } = await sb.from("business_drive_secrets")
          .select("refresh_token_ciphertext, token_nonce").eq("business_id", businessId).maybeSingle();
        const row = sec as Json | null;
        if (row?.refresh_token_ciphertext) {
          const nonces: Record<string, string> = JSON.parse(clean(row.token_nonce, 500) || "{}");
          const refresh = await decrypt(clean(row.refresh_token_ciphertext, 12000), clean(nonces.refresh, 200));
          await fetch(`${OAUTH_BASE}/revoke?token=${encodeURIComponent(refresh)}`, {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          }).catch(() => null);
        }
      } catch { /* revoke is best-effort */ }
      await sb.from("business_drive_secrets").delete().eq("business_id", businessId);
      const { error } = await sb.from("business_storage_settings").upsert({
        business_id: businessId, provider: "supabase", connection_status: "not_configured",
        provider_account_email: null, root_folder_id: null, connected_by: null,
        connected_at: null, config: {}, updated_at: new Date().toISOString(),
      }, { onConflict: "business_id" });
      if (error) throw new Error(error.message);
      return json(request, 200, { status: "PASS", disconnected: true });
    }

    if (action === "resolve") {
      const gate = await requireRole(request, sb, businessId, auth.userId, false);
      if (gate instanceof Response) return gate;
      const storagePath = clean(body.storagePath, 400);
      const virtualPath = clean(body.virtualPath, 600);
      let query = sb.from("business_external_files").select("*")
        .eq("business_id", businessId).eq("status", "available");
      if (storagePath.startsWith("drive/")) query = query.eq("storage_path", storagePath);
      else if (virtualPath) query = query.eq("virtual_path", virtualPath);
      else if (storagePath) query = query.eq("virtual_path", storagePath);
      else return json(request, 400, { error: "storagePath is required." });
      const { data: row } = await query.limit(1).maybeSingle();
      const reg = row as Json | null;
      if (!reg) {
        // Maybe it exists but is already marked unavailable.
        const { data: anyRow } = await sb.from("business_external_files").select("status, status_reason")
          .eq("business_id", businessId)
          .or(storagePath.startsWith("drive/") ? `storage_path.eq.${storagePath}` : `virtual_path.eq.${virtualPath || storagePath}`)
          .limit(1).maybeSingle();
        const anyReg = anyRow as Json | null;
        if (anyReg?.status === "unavailable") {
          return json(request, 200, { found: true, unavailable: true, reason: clean(anyReg.status_reason, 300) || "This file is unavailable." });
        }
        return json(request, 200, { found: false });
      }
      const { data: settings } = await sb.from("business_storage_settings")
        .select("provider, connection_status").eq("business_id", businessId).maybeSingle();
      const s = settings as Json | null;
      if (!s || s.provider !== "google_drive" || s.connection_status !== "connected") {
        return json(request, 200, { found: true, unavailable: true, reason: "Google Drive is not connected for this business right now." });
      }
      const token = await signToken({ f: clean(reg.drive_file_id, 200), b: businessId, r: clean(reg.id, 100) }, 600);
      return json(request, 200, {
        found: true, unavailable: false,
        url: `${SUPABASE_URL}/functions/v1/business-drive-connect?action=stream&t=${token}`,
        expiresIn: 600,
      });
    }

    return json(request, 400, { error: `Unknown action: ${action}` });
  } catch (error) {
    return json(request, 500, { error: safeMessage(error) });
  }
});
