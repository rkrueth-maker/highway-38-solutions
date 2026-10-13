// h38-proof-link — public proof-of-service page for a route.
//
// PUBLIC endpoint (verify_jwt = false). Accepts an anonymous proof token
// (the per-route 'Proof Token' minted by the Office Route Manager —
// "proof-" + 12 base36 chars) and renders exactly one capability: a
// read-only, SANITIZED proof-of-service page for THAT route. No other
// records are readable.
//
//   GET  ?token=<token>        -> HTML proof page
//   POST {token}               -> same (JSON body accepted too)
//
// Sanitized projection ONLY: business display name, route name, route date,
// "X of Y stops completed", and per stop: first name + last initial (or the
// business name for commercial stops), CITY ONLY (never the street address),
// status, arrived/completed times, and the completion photo when the stored
// value is already a public/signed http(s) URL. Storage paths are never
// exposed or signed here.
//
// Expiry/revocation: payload 'Proof Token Expires' in the past -> 410;
// 'Proof Token Revoked' === true -> 404 (indistinguishable from unknown).
//
// Abuse controls: per-IP in-memory rate limit (defense in depth only —
// each isolate keeps its own counters, so this is a speed bump, not a hard
// guarantee), generic client errors; every successful view is recorded in
// business_proof_log.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUILD = "20261012-proof-link-1";
const ROUTES_COLLECTION = "routes";
const STOPS_COLLECTION = "routeStops";

// Rate limit: max requests per IP per window. In-memory per isolate —
// defense in depth, not a hard guarantee.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const rateHits = new Map<string, number[]>();

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rateHits.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  hits.push(now);
  rateHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

function serviceClient(): any {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("server_misconfigured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const text = (v: unknown, n = 500): string => String(v ?? "").trim().slice(0, n);

// "123 Main St, Grand Rapids, MN 55744" -> "Grand Rapids".
// Takes the segment before the state/ZIP segment; never returns the street.
function cityOnly(address: unknown): string {
  const raw = text(address, 500);
  if (!raw) return "";
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 2].slice(0, 80);
  if (parts.length === 2) {
    // "Grand Rapids, MN 55744" — first segment is the city.
    if (/\b[A-Z]{2}\s+\d{5}/.test(parts[1])) return parts[0].slice(0, 80);
    return parts[1].slice(0, 80);
  }
  return ""; // single-segment value could be a street address — show nothing
}

const BUSINESS_HINT =
  /\b(llc|inc|corp|company|co\.|ltd|services|service|properties|property|rentals|rental|farms|farm|ranch|store|shop|market|cafe|restaurant|church|school|clinic|motel|hotel|resort|marina|outfitters|construction|realty|bank|salon|studio|garage|auto|tire|electric|plumbing|heating|landscaping)\b/i;

// "Jane Smith" -> "Jane S."; business names pass through whole.
function displayName(name: unknown): string {
  const raw = text(name, 200);
  if (!raw) return "Customer";
  if (BUSINESS_HINT.test(raw) || !raw.includes(" ")) return raw;
  const parts = raw.split(/\s+/);
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}

function fmtTime(iso: unknown): string {
  const raw = text(iso, 60);
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(status: unknown): string {
  const s = text(status, 40).toLowerCase();
  if (s === "done" || s === "completed" || s === "complete") return "Completed";
  if (s === "arrived" || s === "in_progress" || s === "in progress") return "Crew on site";
  if (s === "skipped") return "Skipped";
  return "Scheduled";
}

function page(title: string, body: string, status = 200): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f4f6f8;color:#1c2733}
  header{background:#14432a;color:#fff;padding:20px 16px}
  header .brand{font-weight:700;font-size:1.05rem;letter-spacing:.02em}
  header h1{margin:6px 0 2px;font-size:1.45rem}
  header p{margin:2px 0;opacity:.85}
  main{max-width:640px;margin:0 auto;padding:16px}
  .progress{background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  .bar{height:10px;background:#e3e9e4;border-radius:6px;overflow:hidden;margin-top:8px}
  .bar div{height:100%;background:#2e7d46}
  .stop{background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  .stop .name{font-weight:600}
  .stop .meta{color:#5a6a76;font-size:.92rem;margin-top:2px}
  .badge{display:inline-block;font-size:.78rem;font-weight:600;padding:2px 8px;border-radius:999px;background:#e8f2ea;color:#256b3a}
  .badge.done{background:#2e7d46;color:#fff}
  .stop img{max-width:100%;border-radius:8px;margin-top:10px}
  footer{max-width:640px;margin:0 auto;padding:0 16px 24px;color:#7a8894;font-size:.85rem}
</style>
</head>
<body>
${body}
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function messagePage(title: string, message: string, status: number): Response {
  return page(
    title,
    `<header><div class="brand">Highway 38 Solutions</div><h1>${esc(title)}</h1></header>
<main><div class="progress"><p>${esc(message)}</p></div></main>
<footer>Proof of service — Highway 38 Solutions</footer>`,
    status,
  );
}

type RouteRow = {
  id: string;
  business_id: string;
  record_key: string;
  payload: Record<string, any>;
};

async function findRoute(sb: any, token: string): Promise<RouteRow | null> {
  const { data, error } = await sb
    .from("business_records")
    .select("id,business_id,record_key,payload")
    .eq("collection", ROUTES_COLLECTION)
    .eq("record_status", "active")
    .eq('payload->>"Proof Token"', token)
    .maybeSingle();
  if (error) throw error;
  return (data as RouteRow | null) || null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return messagePage("Too many requests", "Please try again in a few minutes.", 429);
  }

  const url = new URL(req.url);
  let token = url.searchParams.get("token") || "";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body && typeof body.token === "string" && !token) token = body.token;
    } catch {
      // ignore malformed bodies; GET params still apply
    }
  } else if (req.method !== "GET") {
    return messagePage("Not available", "This proof link is not available.", 405);
  }
  token = token.trim();
  // Existing tokens are "proof-" + 12 chars; accept that family without
  // rejecting other stored token shapes outright — the lookup is exact.
  if (!token || token.length > 120 || /\s/.test(token)) {
    return messagePage("Link not valid", "This proof link is not valid.", 404);
  }

  let sb: any;
  try {
    sb = serviceClient();
  } catch {
    console.error("[h38-proof-link] missing service credentials");
    return messagePage("Unavailable", "The proof service is unavailable.", 500);
  }

  try {
    const route = await findRoute(sb, token);
    if (!route) {
      return messagePage("Link not valid", "This proof link is not valid. It may have been replaced.", 404);
    }
    const p = route.payload || {};
    if (p["Proof Token Revoked"] === true) {
      return messagePage("Link not valid", "This proof link is not valid. It may have been replaced.", 404);
    }
    const expires = text(p["Proof Token Expires"], 60);
    if (expires) {
      const exp = new Date(expires);
      if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
        return messagePage("Link expired", "This proof link has expired. Contact the business for a fresh link.", 410);
      }
    }

    const routeId = text(p["Route ID"] || route.record_key, 180);
    const { data: biz } = await sb
      .from("businesses")
      .select("display_name")
      .eq("id", route.business_id)
      .maybeSingle();
    const businessName = text(biz?.display_name, 200) || "Your service provider";

    const { data: stopRows, error: stopErr } = await sb
      .from("business_records")
      .select("record_key,payload")
      .eq("business_id", route.business_id)
      .eq("collection", STOPS_COLLECTION)
      .eq("record_status", "active")
      .eq('payload->>"Route ID"', routeId)
      .limit(200);
    if (stopErr) throw stopErr;
    const stops = (stopRows || [])
      .map((r: any) => r.payload || {})
      .sort((a: any, b: any) =>
        Number(a["Stop Order"] || 0) - Number(b["Stop Order"] || 0)
      );
    const doneCount = stops.filter((s: any) =>
      /^(done|completed|complete)$/i.test(text(s["Status"], 40))
    ).length;
    const pct = stops.length ? Math.round((doneCount / stops.length) * 100) : 0;

    const stopHtml = stops.map((s: any) => {
      const label = statusLabel(s["Status"]);
      const done = label === "Completed";
      const city = cityOnly(s["Address"]);
      const arrived = fmtTime(s["Arrived At"]);
      const completed = fmtTime(s["Completed At"]);
      const times = [
        arrived ? `Arrived ${arrived}` : "",
        completed ? `Completed ${completed}` : "",
      ].filter(Boolean).join(" &middot; ");
      const photoRaw = text(s["Photo"], 2000);
      // Only include a photo that is ALREADY a public/signed http(s) URL.
      // Raw storage paths are never exposed or signed here.
      const photo = done && /^https?:\/\//i.test(photoRaw)
        ? `<img src="${esc(photoRaw)}" alt="Completion photo" loading="lazy">`
        : "";
      return `<section class="stop">
  <div><span class="name">${esc(displayName(s["Customer Name"]))}</span>
  <span class="badge ${done ? "done" : ""}">${esc(label)}</span></div>
  ${city ? `<div class="meta">${esc(city)}</div>` : ""}
  ${times ? `<div class="meta">${times}</div>` : ""}
  ${photo}
</section>`;
    }).join("\n");

    const routeName = text(p["Route Name"], 200) || "Service route";
    const routeDate = text(p["Route Date"], 60);
    const body = `<header>
  <div class="brand">${esc(businessName)}</div>
  <h1>${esc(routeName)}</h1>
  ${routeDate ? `<p>${esc(routeDate)}</p>` : ""}
  <p>Proof of service</p>
</header>
<main>
  <div class="progress"><strong>${doneCount} of ${stops.length} stops completed</strong>
    <div class="bar"><div style="width:${pct}%"></div></div>
  </div>
  ${stopHtml || '<div class="stop"><div class="meta">No stops on this route yet.</div></div>'}
</main>
<footer>Shared by ${esc(businessName)} via Highway 38 Solutions. Addresses are withheld for customer privacy.</footer>`;

    // Record the view (best-effort; the page is the product).
    try {
      await sb.from("business_proof_log").insert({
        business_id: route.business_id,
        actor_user_id: null,
        action_type: "PROOF_LINK_VIEWED",
        entity_type: "Route",
        entity_id: null,
        result: "PASS",
        details: { kind: "proof_link_view", route: route.record_key, build: BUILD },
        external_action_occurred: false,
      });
    } catch (e) {
      console.warn("[h38-proof-link] proof log failed:", e);
    }

    return page(`${routeName} — Proof of Service`, body);
  } catch (e) {
    console.error("[h38-proof-link] error", e);
    return messagePage("Unavailable", "The proof service hit a problem. Try again.", 500);
  }
});
