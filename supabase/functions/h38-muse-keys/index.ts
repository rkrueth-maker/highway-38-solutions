import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// H38 Muse Connection Keys (2026-11-18) — self-serve key management for the
// Office "Connect Your Muse" offer.
//
// A business owner/administrator issues a connection key from the Office
// (Settings → Muse Permissions). The key authenticates against the existing
// h38-mcp-server, which looks up SHA-256(key) in business_records
// (collection='mcp_api_keys', record_status='active') and scopes every call
// to that business. This function is the ONLY writer of those records from
// the app: it stores only the SHA-256 hash, returns the raw key exactly once
// at issuance, and revokes by flipping record_status to 'archived' — the
// business_records check constraint allows only active/archived/deleted,
// and the MCP server only accepts 'active', so an archived key is dead the
// moment it is revoked. (Found by the 2026-11-18 Sandbox E2E proof: the
// first version wrote 'revoked' and the constraint rejected the update.)
// The MCP server itself is unchanged.
//
// Actions (POST JSON, all require a Supabase Auth JWT + owner/admin
// membership of businessId):
//   {action:"issue",  businessId, name?}     -> {key (raw, once), record}
//   {action:"list",   businessId}            -> {keys:[{record_key,name,
//                                               created_at,created_for,status}]}
//   {action:"revoke", businessId, recordKey} -> {ok, revoked}

const BUILD = "20261118-muse-keys-2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SITE_ORIGIN = "https://highway38solutions.com";
const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

type Json = Record<string, unknown>;

function clean(v: unknown, max = 6000): string {
  return String(v ?? "").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]").slice(0, max);
}
function origin(req: Request): string {
  return clean(req.headers.get("origin"), 300).replace(/\/+$/, "");
}
function corsHeaders(req: Request): Record<string, string> {
  const o = origin(req);
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has(o) ? o : SITE_ORIGIN,
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "cache-control": "no-store",
    "vary": "Origin",
  };
}
function json(req: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(req), "content-type": "application/json; charset=utf-8" },
  });
}
function bearer(req: Request): string {
  const m = String(req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}
function service() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase service configuration is unavailable.");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ---------- auth ----------
async function actor(req: Request) {
  const token = bearer(req);
  if (!token) throw new Error("Supabase Auth session is required.");
  const db = service();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Supabase Auth session is invalid or expired.");
  return { db, user: data.user };
}
async function membership(db: ReturnType<typeof service>, userId: string, businessId: string): Promise<string> {
  const { data, error } = await db.from("business_memberships")
    .select("role,status").eq("business_id", businessId).eq("auth_user_id", userId).eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The signed-in account is not an active member of this business.");
  const role = clean(data.role, 60).toLowerCase();
  if (!["owner", "administrator"].includes(role)) {
    throw new Error("Only an Owner or Administrator can manage Muse connection keys.");
  }
  return role;
}

// ---------- keys ----------
// Raw key format matches the keys the MCP server already validates:
// "h38mcp_" + 48 hex chars (24 random bytes). Only the SHA-256 hex of the
// raw key is stored, in the exact payload shape of the existing records.
function newRawKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "h38mcp_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function keyHash(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function newRecordKey(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const suffix = [...bytes].map((b) => b.toString(36).padStart(2, "0")).join("").replace(/[^a-z0-9]/g, "").slice(0, 8);
  return `mcp-key-${Date.now().toString(36)}-${suffix || "key"}`;
}

interface KeyRow {
  record_key: string;
  record_status: string;
  created_at: string;
  payload: Json | null;
}
function publicKey(row: KeyRow) {
  const p = (row.payload || {}) as Json;
  return {
    record_key: row.record_key,
    name: clean(p.name, 120) || "Muse connection key",
    created_at: clean(p.created_at, 40) || row.created_at,
    created_for: clean(p.created_for, 120),
    status: row.record_status,
  };
}

// ---------- handler ----------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    if (req.method !== "POST") return json(req, 405, { status: "FAIL", error: "Method not allowed." });
    const body = (await req.json().catch(() => ({}))) as Json;
    const action = clean(body.action, 40).toLowerCase();
    if (!["issue", "list", "revoke"].includes(action)) {
      return json(req, 400, { status: "FAIL", error: "Unknown action." });
    }

    const { db, user } = await actor(req);
    const businessId = clean(body.businessId, 80);
    if (!businessId) return json(req, 400, { status: "FAIL", error: "businessId is required." });
    await membership(db, user.id, businessId);

    if (action === "issue") {
      const raw = newRawKey();
      const hash = await keyHash(raw);
      const nowIso = new Date().toISOString();
      const name = clean(body.name, 120) || "Muse connection key";
      const recordKey = newRecordKey();
      const { data, error } = await db.from("business_records").insert({
        business_id: businessId,
        collection: "mcp_api_keys",
        record_key: recordKey,
        record_status: "active",
        created_by: user.id,
        updated_by: user.id,
        payload: {
          name,
          key_hash: hash,
          created_at: nowIso,
          created_for: "office-connect-your-muse",
        },
      }).select("record_key,record_status,created_at,payload").single();
      if (error) throw error;
      // The raw key is returned exactly once, here. It is never stored.
      return json(req, 200, { status: "OK", build: BUILD, key: raw, record: publicKey(data as KeyRow) });
    }

    if (action === "list") {
      const { data, error } = await db.from("business_records")
        .select("record_key,record_status,created_at,payload")
        .eq("business_id", businessId).eq("collection", "mcp_api_keys")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json(req, 200, { status: "OK", build: BUILD, keys: (data || []).map((r) => publicKey(r as KeyRow)) });
    }

    // revoke
    const recordKey = clean(body.recordKey, 120);
    if (!recordKey) return json(req, 400, { status: "FAIL", error: "recordKey is required." });
    const { data, error } = await db.from("business_records")
      .update({ record_status: "archived", updated_by: user.id })
      .eq("business_id", businessId).eq("collection", "mcp_api_keys")
      .eq("record_key", recordKey).eq("record_status", "active")
      .select("record_key");
    if (error) throw error;
    return json(req, 200, { status: "OK", build: BUILD, revoked: recordKey, changed: (data || []).length > 0 });
  } catch (e) {
    // PostgrestError and friends are plain objects, not Error instances —
    // String(e) would leak "[object Object]" to the customer. Pull the
    // message out properly.
    const raw = e instanceof Error ? e.message
      : (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));
    return json(req, 400, { status: "FAIL", error: clean(raw, 500) });
  }
});
