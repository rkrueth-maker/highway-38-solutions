// business-drive-upload — own-it file storage (Rick, 2026-10-21).
//
// Uploads one business file into the business's OWN Google Drive (connected
// via business-drive-connect) and registers it in business_external_files.
// Records, jobs and accounting data never pass through here — files only.
//
// Contract (fixed by commercial-app/supabase-storage-provider.js):
//   functions.invoke('business-drive-upload', { body: {
//     businessId, attachmentId, fileName, mimeType, base64Data,
//     relatedRecordType, relatedRecordId, visibility, captureTime } })
//   -> { status: 'PASS', fileId, storagePath: 'drive/<id>', webViewLink }
// Expected business-level failures return HTTP 200 with status one of
// NOT_CONFIGURED / NOT_CONNECTED / REVOKED / TOO_LARGE / FAIL so the client
// can fall back to Supabase storage and flag it — a file is never lost here.
//
// A second transport accepts raw bytes (shared-client uploads that already
// hold a Blob): POST with x-h38-* metadata headers and the file as the body.
//
// Tokens live AES-GCM encrypted in business_drive_secrets (service role
// only) and are never returned, logged, or placed in any record.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CLIENT_ID = Deno.env.get("H38_DRIVE_OAUTH_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("H38_DRIVE_OAUTH_CLIENT_SECRET") || "";
const TOKEN_KEY = Deno.env.get("H38_DRIVE_TOKEN_ENCRYPTION_KEY") || "";
const OAUTH_BASE = Deno.env.get("H38_GOOGLE_OAUTH_BASE") || "https://oauth2.googleapis.com";
const API_BASE = Deno.env.get("H38_GOOGLE_API_BASE") || "https://www.googleapis.com";
const H38 = "10b85a89-5834-436d-95b0-c6ee2eb335ad";
const MAX_BYTES = 64 * 1024 * 1024; // decoded cap for the base64 transport
const CHUNK = 8 * 1024 * 1024;

type Json = Record<string, unknown>;
type SB = ReturnType<typeof createClient>;

function cors(request: Request): HeadersInit {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-h38-business-id, x-h38-file-name, x-h38-mime-type, x-h38-source-type, x-h38-source-id, x-h38-virtual-path, x-h38-document-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  return missing;
}

// --- token crypto (mirrors nl-bouncie-fleet: AES-GCM, SHA-256 key) ----------
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

// --- auth / membership -------------------------------------------------------
async function caller(request: Request): Promise<{ userId: string } | Response> {
  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader) return json(request, 401, { status: "FAIL", error: "Sign-in required." });
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return json(request, 401, { status: "FAIL", error: "Sign-in required." });
  return { userId: data.user.id };
}
async function roleFor(sb: SB, businessId: string, userId: string): Promise<string> {
  const { data } = await sb.from("business_memberships")
    .select("role").eq("business_id", businessId).eq("auth_user_id", userId)
    .eq("status", "active").limit(1).maybeSingle();
  return String((data as Json | null)?.role || "");
}

// --- connection state --------------------------------------------------------
async function loadSettings(sb: SB, businessId: string): Promise<Json | null> {
  const { data } = await sb.from("business_storage_settings").select("*")
    .eq("business_id", businessId).maybeSingle();
  return (data as Json | null) || null;
}
async function markConnectionError(sb: SB, businessId: string): Promise<void> {
  await sb.from("business_storage_settings")
    .update({ connection_status: "error", updated_at: new Date().toISOString() })
    .eq("business_id", businessId);
}
async function notifyOwners(sb: SB, businessId: string, kind: string, title: string, body: string): Promise<void> {
  // Existing owner-notification path: rows in business_records collection
  // 'notifications', rendered by the Office topbar bell (h38-owner-notify
  // shape). Deterministic key = at most one row per business/kind/day.
  const day = new Date().toISOString().slice(0, 10);
  const hashBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${businessId}|${kind}|${day}`));
  const hash = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24).toUpperCase();
  const recordKey = `OWNERNOTIF-${hash}`;
  const payload = {
    "Title": title, "Body": body, "Status": "Unread", "Audience": "owners-admins",
    "Category": "Storage", "Link Page": "settings", "Source ID": recordKey,
    "Event Type": kind, "Business ID": businessId, "Customer ID": "", "Customer Name": "",
    "Push Status": "off", "Created Time": new Date().toISOString(), "Read By JSON": "[]",
    "Notification ID": recordKey, "Source Collection": "business_storage_settings",
    "Link Record ID": "", "Record Version": 1,
  };
  await sb.from("business_records").upsert({
    business_id: businessId, collection: "notifications", record_key: recordKey,
    payload, record_status: "active",
  }, { onConflict: "business_id,collection,record_key", ignoreDuplicates: true });
}

// --- Google token handling ---------------------------------------------------
class DriveAuthError extends Error { revoked = false; }
async function saveTokens(sb: SB, businessId: string, tokens: Json): Promise<void> {
  const access = clean(tokens.access_token, 8000);
  const refresh = clean(tokens.refresh_token, 8000);
  const { data: existing } = await sb.from("business_drive_secrets")
    .select("refresh_token_ciphertext, token_nonce").eq("business_id", businessId).maybeSingle();
  const row: Json = { business_id: businessId, updated_at: new Date().toISOString() };
  const nonces: Record<string, string> = {};
  try { Object.assign(nonces, JSON.parse(clean((existing as Json | null)?.token_nonce, 500) || "{}")); } catch { /* fresh */ }
  if (access) {
    const ea = await encrypt(access);
    row.access_token_ciphertext = ea.cipher; nonces.access = ea.nonce;
    row.token_expires_at = new Date(Date.now() + Math.max(60, Number(tokens.expires_in || 3600)) * 1000).toISOString();
  }
  if (refresh) {
    const er = await encrypt(refresh);
    row.refresh_token_ciphertext = er.cipher; nonces.refresh = er.nonce;
  }
  row.token_nonce = JSON.stringify(nonces);
  if (tokens.scope) row.granted_scopes = clean(tokens.scope, 300);
  const { error } = await sb.from("business_drive_secrets").upsert(row, { onConflict: "business_id" });
  if (error) throw new Error(`Could not store Drive tokens: ${error.message}`);
}
async function accessToken(sb: SB, businessId: string): Promise<string> {
  const { data: sec } = await sb.from("business_drive_secrets")
    .select("*").eq("business_id", businessId).maybeSingle();
  const row = sec as Json | null;
  if (!row?.refresh_token_ciphertext) {
    const e = new DriveAuthError("This business has no stored Drive grant.");
    e.revoked = true; throw e;
  }
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
    throw new DriveAuthError("Saved Google Drive token could not be read. Reconnect Google Drive.");
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
    const e = new DriveAuthError(`Drive token refresh failed (${res.status}): ${clean(tokens.error, 120)}`);
    if (clean(tokens.error, 120) === "invalid_grant") e.revoked = true;
    throw e;
  }
  if (!tokens.refresh_token) tokens.refresh_token = refresh;
  await saveTokens(sb, businessId, tokens);
  return clean(tokens.access_token, 8000);
}

// --- Drive folders + upload --------------------------------------------------
function segment(value: string, fallback: string): string {
  const s = value.replace(/[^A-Za-z0-9 _.-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return s || fallback;
}
async function driveJson(token: string, url: string, init?: RequestInit): Promise<Json> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({})) as Json;
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${clean((data as Json)?.error ? clean(((data as Json).error as Json)?.message, 300) : "", 300) || res.statusText}`);
  return data;
}
async function ensureFolder(token: string, parentId: string, name: string): Promise<string> {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await driveJson(token, `${API_BASE}/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`);
  const files = (found.files as Json[]) || [];
  if (files.length) return clean(files[0].id, 200);
  const created = await driveJson(token, `${API_BASE}/drive/v3/files?fields=id`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  return clean(created.id, 200);
}
async function uploadResumable(token: string, folderId: string, name: string, mime: string, total: number, chunks: AsyncIterable<Uint8Array>): Promise<Json> {
  const init = await fetch(`${API_BASE}/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mime, "X-Upload-Content-Length": String(total),
    },
    body: JSON.stringify({ name, parents: [folderId], mimeType: mime }),
  });
  if (!init.ok) throw new Error(`Drive upload could not start (${init.status}).`);
  const session = init.headers.get("Location") || "";
  if (!session) throw new Error("Drive upload session was not created.");
  let sent = 0;
  let result: Json | null = null;
  for await (const chunk of chunks) {
    let offset = 0;
    while (offset < chunk.length) {
      const part = chunk.subarray(offset, offset + CHUNK);
      const start = sent + offset;
      const end = start + part.length - 1;
      const res = await fetch(session, {
        method: "PUT",
        headers: { "Content-Length": String(part.length), "Content-Range": `bytes ${start}-${end}/${total}` },
        body: part,
      });
      if (res.status === 200 || res.status === 201) {
        result = await res.json().catch(() => ({})) as Json;
      } else if (res.status !== 308) {
        throw new Error(`Drive upload failed mid-transfer (${res.status}).`);
      }
      offset += part.length;
    }
    sent += chunk.length;
  }
  if (!result) {
    // Zero-byte file or final status not returned: ask the session.
    const res = await fetch(session, { method: "PUT", headers: { "Content-Length": "0", "Content-Range": `bytes */${total}` } });
    if (res.ok) result = await res.json().catch(() => ({})) as Json;
  }
  if (!result?.id) throw new Error("Drive did not confirm the upload.");
  return result;
}
function decodeBase64Chunked(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(request) });
  if (request.method !== "POST") return json(request, 405, { status: "FAIL", error: "POST only." });
  try {
    const auth = await caller(request);
    if (auth instanceof Response) return auth;
    const missing = configured();
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // ---- transport detection ---------------------------------------------
    const contentType = request.headers.get("content-type") || "";
    let businessId = "", attachmentId = "", fileName = "", mimeType = "application/octet-stream";
    let sourceType = "", sourceId = "", virtualPath = "";
    let bytes: Uint8Array | null = null;
    let bodyStream: ReadableStream<Uint8Array> | null = null;
    let total = 0;

    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({})) as Json;
      businessId = clean(body.businessId, 100);
      attachmentId = clean(body.attachmentId, 200);
      fileName = clean(body.fileName, 240) || "file";
      mimeType = clean(body.mimeType, 160) || "application/octet-stream";
      sourceType = clean(body.relatedRecordType, 120);
      sourceId = clean(body.relatedRecordId, 200);
      if (!businessId) return json(request, 400, { status: "FAIL", error: "businessId is required." });
      const b64 = clean(body.base64Data, 96 * 1024 * 1024);
      if (!b64) return json(request, 400, { status: "FAIL", error: "base64Data is required." });
      bytes = decodeBase64Chunked(b64);
      total = bytes.length;
      if (total > MAX_BYTES) {
        return json(request, 200, { status: "TOO_LARGE", error: `File is ${Math.round(total / 1048576)} MB, over the ${Math.round(MAX_BYTES / 1048576)} MB Drive upload limit. It will be kept in Office storage instead.` });
      }
    } else {
      businessId = clean(request.headers.get("x-h38-business-id"), 100);
      attachmentId = clean(request.headers.get("x-h38-document-key"), 200);
      fileName = clean(request.headers.get("x-h38-file-name"), 240) || "file";
      mimeType = clean(request.headers.get("x-h38-mime-type"), 160) || "application/octet-stream";
      sourceType = clean(request.headers.get("x-h38-source-type"), 120);
      sourceId = clean(request.headers.get("x-h38-source-id"), 200);
      virtualPath = clean(request.headers.get("x-h38-virtual-path"), 600);
      if (!businessId) return json(request, 400, { status: "FAIL", error: "x-h38-business-id is required." });
      total = Number(request.headers.get("content-length") || 0);
      if (!total || !request.body) return json(request, 400, { status: "FAIL", error: "File body is required." });
      bodyStream = request.body;
    }

    // ---- authorization: any active member may upload their business's files
    const role = await roleFor(sb, businessId, auth.userId);
    const platformRole = businessId === H38 ? role : await roleFor(sb, H38, auth.userId);
    if (!role && !(platformRole === "owner" || platformRole === "administrator")) {
      return json(request, 403, { status: "FAIL", error: "You are not a member of this business." });
    }

    // ---- connection gate ----------------------------------------------------
    if (missing.length) {
      return json(request, 200, { status: "NOT_CONFIGURED", error: "Google Drive setup is not finished yet.", missing });
    }
    const settings = await loadSettings(sb, businessId);
    if (!settings || settings.provider !== "google_drive" || settings.connection_status !== "connected" || !settings.root_folder_id) {
      return json(request, 200, { status: "NOT_CONNECTED", error: "This business has not connected a Google Drive." });
    }

    // ---- token (revocation is a business-level outcome, not a 500) ---------
    let token = "";
    try {
      token = await accessToken(sb, businessId);
    } catch (error) {
      if (error instanceof DriveAuthError && error.revoked) {
        await markConnectionError(sb, businessId);
        await notifyOwners(sb, businessId, "drive_connection_attention",
          "Google Drive connection needs attention",
          "The business's Google Drive grant was revoked or expired, so new files are being saved to Office storage until an owner reconnects Drive in Settings.");
        return json(request, 200, { status: "REVOKED", error: "The Drive grant was revoked or expired." });
      }
      if (error instanceof DriveAuthError) {
        return json(request, 200, { status: "FAIL", error: error.message });
      }
      throw error;
    }

    // ---- folders: root / <Source Type> / <Source ID> ------------------------
    const rootId = clean(settings.root_folder_id, 200);
    const typeFolder = await ensureFolder(token, rootId, segment(sourceType.replace(/\s+/g, "-"), "Files"));
    const targetFolder = sourceId ? await ensureFolder(token, typeFolder, segment(sourceId, "General")) : typeFolder;

    // ---- upload --------------------------------------------------------------
    async function* jsonChunks(): AsyncIterable<Uint8Array> { if (bytes) yield bytes; }
    async function* rawChunks(): AsyncIterable<Uint8Array> {
      const reader = bodyStream!.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield value;
      }
    }
    const stored = await uploadResumable(token, targetFolder, fileName, mimeType, total,
      bodyStream ? rawChunks() : jsonChunks());
    const fileId = clean(stored.id, 200);
    const storagePath = `drive/${fileId}`;

    // ---- registry (feeds the data meter's external split; never counted) ---
    const { error: regErr } = await sb.from("business_external_files").upsert({
      business_id: businessId, provider: "google_drive", location: "external",
      storage_path: storagePath, virtual_path: virtualPath || null,
      drive_file_id: fileId, file_name: fileName, mime_type: mimeType,
      file_size: Number(stored.size || total), source_type: sourceType || null,
      source_id: sourceId || null, document_record_key: attachmentId || null,
      status: "available", status_reason: null, created_by: auth.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "business_id,storage_path" });
    if (regErr) throw new Error(`File reached Drive but the registry write failed: ${regErr.message}`);

    return json(request, 200, {
      status: "PASS", fileId, storagePath,
      webViewLink: clean(stored.webViewLink, 600),
      fileSize: Number(stored.size || total),
    });
  } catch (error) {
    return json(request, 500, { status: "FAIL", error: safeMessage(error) });
  }
});
