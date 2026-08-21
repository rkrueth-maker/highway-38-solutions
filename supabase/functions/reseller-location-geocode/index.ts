import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED = new Set([
  "ccf25333-47cd-42ca-a20b-cdbc63a8a695",
  "6dd51b31-5974-4691-b8b8-83e5877528c0",
]);
const U = Deno.env.get("SUPABASE_URL") || "";
const K = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ORIGINS = new Set([
  "https://appassets.androidplatform.net",
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
]);
const UA = "H38ResellerScout/0.1.35 (+https://highway38solutions.com)";

function cors(r: Request) {
  const o = r.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ORIGINS.has(o) ? o : "https://highway38solutions.com",
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    vary: "Origin",
  };
}
function json(r: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors(r) });
}
async function userId(r: Request) {
  const token = String(r.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Sign in required.");
  const res = await fetch(`${U}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: K },
    signal: AbortSignal.timeout(12000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.id) throw new Error("Session expired.");
  return String(body.id);
}

Deno.serve(async (r) => {
  if (r.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(r) });
  if (r.method !== "POST") return json(r, 405, { error: "POST required" });
  try {
    const uid = await userId(r);
    if (!ALLOWED.has(uid)) return json(r, 403, { error: "Not authorized" });
    const body = await r.json().catch(() => ({}));
    const zip = String(body?.zip || "").match(/\b\d{5}\b/)?.[0] || "";
    if (!zip) return json(r, 400, { error: "A 5-digit ZIP is required." });
    const url = `https://api.zippopotam.us/us/${encodeURIComponent(zip)}`;
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(9000) });
    const payload = await res.json().catch(() => ({}));
    const place = Array.isArray(payload?.places) ? payload.places[0] : null;
    const lat = Number(place?.latitude), lon = Number(place?.longitude);
    if (!res.ok || !Number.isFinite(lat) || !Number.isFinite(lon)) return json(r, 200, { status: "NOT_FOUND", location: null });
    return json(r, 200, {
      status: "PASS",
      location: {
        zip,
        lat,
        lon,
        city: String(place?.["place name"] || ""),
        state: String(place?.state || ""),
        state_code: String(place?.["state abbreviation"] || ""),
      },
    });
  } catch (e) {
    return json(r, 200, { status: "PARTIAL", location: null, warning: e instanceof Error ? e.message : String(e) });
  }
});
