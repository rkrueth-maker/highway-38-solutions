// Zero-dependency on purpose: plain PostgREST fetch only, so the platform
// bundler never has to resolve npm packages for this public function.

// First-party traffic counting for the public Highway 38 website.
// The public shell (assets/js/h38-site-v2.js) sends one beacon per page
// load: { path, ref }. This function validates the hit, counts it in
// public.site_pageviews with the service role, and returns 204.
//
// Privacy by design: no cookies are set, no raw IP address is ever stored,
// and the only visitor identifier is a salted SHA-256 of IP + user agent
// that includes the UTC day, so it rotates daily and cannot follow a
// visitor across days. Referrers are stored as host names only (query
// strings are stripped). Known bot / crawler user agents are accepted
// with 204 but never recorded.
//
// Limits: origin allow-list, payload size cap, path shape validation, and
// a per-visitor rate limit of 60 recorded hits per minute.

const BUILD = "20261007-site-analytics-1";
const ALLOWED_ORIGINS = new Set([
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
  "https://rkrueth-maker.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// Server-only salt for the daily visitor hash. Falls back to the service
// role key (also server-only) so hashes are never computable off-server.
const HASH_SALT = Deno.env.get("H38_SITE_ANALYTICS_SALT") || SUPABASE_SERVICE_ROLE_KEY;
const RATE_LIMIT_PER_MINUTE = 60;
const MAX_BODY_BYTES = 1024;
const MAX_PATH_LENGTH = 300;
const BOT_UA_MARKERS = [
  "bot", "crawler", "spider", "headless", "curl", "wget", "python-requests",
  "python-urllib", "go-http-client", "okhttp", "axios", "node-fetch",
  "bingpreview", "facebookexternalhit", "slurp", "scrapy", "puppeteer",
  "playwright", "lighthouse", "pingdom", "uptimerobot",
];

type JsonObject = Record<string, unknown>;

function clean(value: unknown, max = 4000): string {
  return String(value ?? "").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]").slice(0, max);
}
function requestOrigin(request: Request): string { return String(request.headers.get("origin") || "").trim().replace(/\/+$/, ""); }
function corsHeaders(request: Request): HeadersInit {
  const origin = requestOrigin(request);
  const requestedHeaders = String(request.headers.get("access-control-request-headers") || "").trim();
  return {
    "access-control-allow-origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://highway38solutions.com",
    "access-control-allow-headers": requestedHeaders || "content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "600",
    "cache-control": "no-store",
    "vary": "Origin, Access-Control-Request-Headers",
  };
}
function noContent(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
function json(request: Request, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders(request), "content-type": "application/json; charset=utf-8" } });
}
function restHeaders(prefer: string): HeadersInit {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
    prefer: prefer,
  };
}
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function clientIp(request: Request): string {
  const forwarded = String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (forwarded) return forwarded.slice(0, 64);
  return String(request.headers.get("cf-connecting-ip") || "").trim().slice(0, 64);
}
function isBot(ua: string): boolean {
  if (!ua) return true;
  const lower = ua.toLowerCase();
  return BOT_UA_MARKERS.some(marker => lower.includes(marker));
}
function deviceClass(ua: string): "phone" | "tablet" | "desktop" {
  const lower = ua.toLowerCase();
  if (lower.includes("ipad") || lower.includes("tablet") || (lower.includes("android") && !lower.includes("mobile"))) return "tablet";
  if (lower.includes("mobile") || lower.includes("iphone") || lower.includes("ipod") || lower.includes("windows phone")) return "phone";
  return "desktop";
}
function validPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let path = value.trim();
  if (!path || path.length > MAX_PATH_LENGTH) return null;
  // The path must be a plain site path: leading slash, no scheme, no
  // backslashes, no parent traversal, no control characters or spaces.
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.includes("\\") || path.includes("..") || /[\s\u0000-\u001f\u007f]/.test(path)) return null;
  // Strip any query string or fragment the client may have included.
  path = path.split(/[?#]/)[0];
  if (!path || path.length > MAX_PATH_LENGTH) return null;
  return path;
}
function referrerHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().slice(0, 500);
  if (!raw) return null;
  try {
    const host = new URL(raw).host.toLowerCase();
    return host ? host.slice(0, 253) : null;
  } catch (_) {
    return null;
  }
}
async function recentCount(visitorDayHash: string): Promise<number> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const params = new URLSearchParams();
  params.set("select", "id");
  params.set("visitor_day_hash", `eq.${visitorDayHash}`);
  params.set("created_at", `gte.${since}`);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/site_pageviews?${params.toString()}`, {
    method: "GET",
    headers: restHeaders("count=exact"),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Pageview count failed (${response.status}).`);
  const range = String(response.headers.get("content-range") || "");
  const total = Number(range.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}
async function insertPageview(row: { page_path: string; referrer_host: string | null; visitor_day_hash: string | null; device_class: string }): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/site_pageviews`, {
    method: "POST",
    headers: restHeaders("return=minimal"),
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Pageview insert failed (${response.status}): ${clean(await response.text(), 240)}`);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return noContent(request);
  if (request.method !== "POST") return json(request, 405, { status: "ERROR", reason: "method_not_allowed", build: BUILD });

  // Only count hits from the public site itself (or the local test rig).
  const origin = requestOrigin(request);
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json(request, 403, { status: "ERROR", reason: "origin_not_allowed", build: BUILD });
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json(request, 413, { status: "ERROR", reason: "payload_too_large", build: BUILD });
  }

  let payload: JsonObject = {};
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json(request, 413, { status: "ERROR", reason: "payload_too_large", build: BUILD });
    const parsed = raw ? JSON.parse(raw) : {};
    payload = parsed && typeof parsed === "object" ? parsed as JsonObject : {};
  } catch (_) {
    return json(request, 400, { status: "ERROR", reason: "invalid_json", build: BUILD });
  }

  const pagePath = validPath(payload.path);
  if (!pagePath) return json(request, 400, { status: "ERROR", reason: "invalid_path", build: BUILD });

  const ua = String(request.headers.get("user-agent") || "").slice(0, 400);
  // Bots and health checks get a quiet 204 and are never recorded.
  if (isBot(ua)) return noContent(request);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("site-analytics: Supabase service configuration missing");
    return json(request, 500, { status: "ERROR", reason: "unavailable", build: BUILD });
  }

  try {
    const ip = clientIp(request);
    const utcDay = new Date().toISOString().slice(0, 10);
    const visitorDayHash = ip
      ? await sha256Hex(`h38-site-analytics|${utcDay}|${ip}|${ua}|${HASH_SALT}`)
      : null;

    if (visitorDayHash) {
      const recent = await recentCount(visitorDayHash);
      if (recent >= RATE_LIMIT_PER_MINUTE) {
        // Quiet drop: beacons ignore responses, and flooding gains nothing.
        return noContent(request);
      }
    }

    await insertPageview({
      page_path: pagePath,
      referrer_host: referrerHost(payload.ref),
      visitor_day_hash: visitorDayHash,
      device_class: deviceClass(ua),
    });
    return noContent(request);
  } catch (error) {
    console.error("site-analytics pageview failed:", clean(error instanceof Error ? error.message : error, 240));
    return json(request, 500, { status: "ERROR", reason: "unavailable", build: BUILD });
  }
});
