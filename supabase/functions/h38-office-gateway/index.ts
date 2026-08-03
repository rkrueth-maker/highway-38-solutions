import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const HIGHWAY_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);
const EXPECTED_SCRIPT_ID = "1nNYrjaH4kwCWQ2SGWMbXGxpkDgLWXXEa_vGSec9N1DjSVLzAl1Z1fxhf";
const EXPECTED_DEPLOYMENT_ID = "AKfycbyY8cbfvGLzllw7rMhRY46wx_eIKhsK5oLlV6vIcDxDIKuCzX0_oTi4EyVufSxonLdxow";
const EXPECTED_DEPLOYMENT_URL = `https://script.google.com/macros/s/${EXPECTED_DEPLOYMENT_ID}/exec`;
const SESSION_VERSION = 1;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_SESSION_MS = 50 * 60 * 1000;

function hostnameOf(origin: string | null): string {
  try { return origin ? new URL(origin).hostname : ""; } catch { return ""; }
}
function isGoogleScriptHost(host: string): boolean {
  return host === "script.google.com" ||
    host === "script.googleusercontent.com" ||
    host.endsWith(".script.googleusercontent.com") ||
    host.endsWith("-script.googleusercontent.com");
}
function isGoogleScriptOrigin(origin: string | null): boolean {
  return isGoogleScriptHost(hostnameOf(origin));
}
function isHighwayOrigin(origin: string | null): boolean {
  return !!origin && HIGHWAY_ORIGINS.has(origin);
}
function isApprovedResponseHost(host: string): boolean {
  return isGoogleScriptHost(host);
}
function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "access-control-allow-headers": "authorization, content-type, x-h38-request-id",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "86400",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "vary": "Origin",
  };
  if (isHighwayOrigin(origin) || isGoogleScriptOrigin(origin)) {
    headers["access-control-allow-origin"] = String(origin);
  }
  return headers;
}
function json(origin: string | null, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders(origin) });
}
function safeMessage(value: unknown): string {
  return String(value ?? "Gateway request failed.")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[REDACTED_TOKEN]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .slice(0, 700);
}
function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
async function encryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) throw new Error("Gateway encryption key is unavailable.");
  const material = new TextEncoder().encode(`h38-office-gateway-v1:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
interface GatewaySession {
  v: number;
  email: string;
  accessToken: string;
  issuedAt: number;
  expiresAt: number;
  scriptId: string;
  deploymentUrl: string;
}
async function sealSession(payload: GatewaySession): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), plaintext));
  return `${encodeBase64Url(iv)}.${encodeBase64Url(ciphertext)}`;
}
async function openSession(token: string): Promise<GatewaySession> {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) throw new Error("Gateway session is invalid.");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64Url(parts[0]) }, await encryptionKey(), decodeBase64Url(parts[1]));
  const payload = JSON.parse(new TextDecoder().decode(plaintext)) as GatewaySession;
  if (payload.v !== SESSION_VERSION || !payload.email || !payload.accessToken) throw new Error("Gateway session is incomplete.");
  if (payload.expiresAt <= Date.now()) throw new Error("Gateway session expired. Reopen Business Office securely.");
  if (payload.scriptId !== EXPECTED_SCRIPT_ID || payload.deploymentUrl !== EXPECTED_DEPLOYMENT_URL) throw new Error("Gateway session target is invalid.");
  return payload;
}
async function googleTokenInfo(accessToken: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (!response.ok) throw new Error(`Google authorization was rejected (${response.status}).`);
  return payload;
}
function tokenScopes(info: Record<string, unknown>): Set<string> {
  return new Set(String(info.scope || "").split(/\s+/).filter(Boolean));
}
function requiredScopesPresent(scopes: Set<string>): boolean {
  const hasSheets = scopes.has("https://www.googleapis.com/auth/spreadsheets");
  const hasDrive = scopes.has("https://www.googleapis.com/auth/drive") || scopes.has("https://www.googleapis.com/auth/drive.file");
  const hasEmail = scopes.has("https://www.googleapis.com/auth/userinfo.email") || scopes.has("openid");
  return hasSheets && hasDrive && hasEmail;
}
async function bootstrap(origin: string | null, body: Record<string, unknown>): Promise<Response> {
  if (!isGoogleScriptOrigin(origin)) return json(origin, 403, { status: "FAIL", error: "Gateway bootstrap must originate from the authorized Google Apps Script page." });
  const accessToken = String(body.accessToken || "");
  const scriptId = String(body.scriptId || "");
  const deploymentUrl = String(body.deploymentUrl || "");
  if (!accessToken) return json(origin, 401, { status: "FAIL", error: "Google authorization token is missing." });
  if (scriptId !== EXPECTED_SCRIPT_ID || deploymentUrl !== EXPECTED_DEPLOYMENT_URL) return json(origin, 403, { status: "FAIL", error: "The requested Business Office backend is not approved." });
  const info = await googleTokenInfo(accessToken);
  const email = String(info.email || "").trim().toLowerCase();
  const scopes = tokenScopes(info);
  if (!email) return json(origin, 401, { status: "FAIL", error: "Google authorization did not identify a user." });
  if (!requiredScopesPresent(scopes)) return json(origin, 403, { status: "FAIL", error: "Google authorization is missing required Business Office permissions." });
  const expiresIn = Math.max(60, Number(info.expires_in || 0));
  const issuedAt = Date.now();
  const expiresAt = Math.min(issuedAt + MAX_SESSION_MS, issuedAt + expiresIn * 1000 - 60_000);
  if (expiresAt <= issuedAt + 60_000) return json(origin, 401, { status: "FAIL", error: "Google authorization expires too soon. Reopen Business Office securely." });
  const gatewaySession = await sealSession({ v: SESSION_VERSION, email, accessToken, issuedAt, expiresAt, scriptId, deploymentUrl });
  return json(origin, 200, { status: "PASS", transport: "supabase-gateway", gatewaySession, email, issuedAt: new Date(issuedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString() });
}
async function readBackendJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { throw new Error(`Apps Script returned a non-JSON response (${response.status}).`); }
  if (!response.ok) throw new Error(String(payload.error || `Apps Script request failed (${response.status}).`));
  return payload;
}
async function callAppsScript(session: GatewaySession, action: string, args: unknown): Promise<Record<string, unknown>> {
  let target = new URL(session.deploymentUrl);
  target.searchParams.set("gateway", "1");
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(target.toString(), {
      method: "POST",
      headers: { authorization: `Bearer ${session.accessToken}`, "content-type": "application/json; charset=utf-8", accept: "application/json", "x-h38-gateway": "supabase-v3" },
      body: JSON.stringify({ gateway: "H38_SUPABASE_GATEWAY_V1", action, args: args ?? {} }),
      redirect: "manual",
      signal: AbortSignal.timeout(120000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Apps Script redirect ${response.status} did not include a destination.`);
      const next = new URL(location, target);
      if (!isApprovedResponseHost(next.hostname)) throw new Error("Apps Script redirected to an unapproved host.");
      target = next;
      continue;
    }
    return readBackendJson(response);
  }
  throw new Error("Apps Script exceeded the approved redirect limit.");
}
async function apiRequest(origin: string | null, request: Request, body: Record<string, unknown>): Promise<Response> {
  if (!isHighwayOrigin(origin)) return json(origin, 403, { status: "FAIL", error: "Business Office API requests must originate from Highway 38." });
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return json(origin, 401, { status: "FAIL", error: "Gateway session is missing." });
  const session = await openSession(match[1]);
  const action = String(body.action || "").trim();
  if (!/^[A-Za-z][A-Za-z0-9]{0,79}$/.test(action)) return json(origin, 400, { status: "FAIL", error: "Business Office action is invalid." });
  const result = await callAppsScript(session, action, body.args ?? {});
  return json(origin, 200, result);
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") {
    if (!(isHighwayOrigin(origin) || isGoogleScriptOrigin(origin))) return new Response(null, { status: 403, headers: corsHeaders(origin) });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method === "GET") return json(origin, 200, { status: "PASS", service: "h38-office-gateway", transport: "supabase-gateway", version: "2.0.1", browserReceivesGoogleToken: false, existingAppsScriptDeployment: true, googlePageBootstrap: true });
  if (request.method !== "POST") return json(origin, 405, { status: "FAIL", error: "Method not allowed." });
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY_BYTES) return json(origin, 413, { status: "FAIL", error: "Request is too large." });
  try {
    const body = await request.json() as Record<string, unknown>;
    const type = String(body.type || "api");
    if (type === "bootstrap") return bootstrap(origin, body);
    if (type === "api") return apiRequest(origin, request, body);
    return json(origin, 400, { status: "FAIL", error: "Gateway request type is invalid." });
  } catch (error) {
    const message = safeMessage(error instanceof Error ? error.message : error);
    const expired = /expired|authorization|session/i.test(message);
    return json(origin, expired ? 401 : 500, { status: "FAIL", error: message });
  }
});
