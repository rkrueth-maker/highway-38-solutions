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
const UA = "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/151 Safari/537.36 H38ResellerScout/0.1.35";

type Any = Record<string, any>;

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
function json(r: Request, status: number, body: unknown) { return new Response(JSON.stringify(body), { status, headers: cors(r) }); }
async function userId(r: Request) {
  const token = String(r.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Sign in required.");
  const res = await fetch(`${U}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: K }, signal: AbortSignal.timeout(12000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.id) throw new Error("Session expired.");
  return String(body.id);
}
function decode(v: string) { return String(v || "").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'").replace(/&nbsp;|&#160;/gi, " ").replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—"); }
function strip(v: string) { return decode(String(v || "")).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function abs(href: string, base: string) { try { return new URL(decode(href), base).toString(); } catch { return ""; } }
function hav(a: number, b: number, c: number, d: number) { const R = 3958.7613, q = Math.PI / 180, x = (c - a) * q, y = (d - b) * q; const z = Math.sin(x / 2) ** 2 + Math.cos(a * q) * Math.cos(c * q) * Math.sin(y / 2) ** 2; return 2 * R * Math.atan2(Math.sqrt(z), Math.sqrt(1 - z)); }
async function get(url: string, timeout = 10000) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(timeout) });
  const html = await res.text().catch(() => ""); if (!res.ok) throw new Error(`HiBid HTTP ${res.status}`); return { html, url: res.url };
}
async function reverse(lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${lat}&lon=${lon}`, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    const p = await res.json().catch(() => ({})), a = p?.address || {};
    return res.ok ? { city: a.city || a.town || a.village || "", state: a.state || "", zip: String(a.postcode || "").match(/\d{5}/)?.[0] || "" } : null;
  } catch { return null; }
}
async function zipPoint(zip: string) {
  zip = String(zip || "").match(/\b\d{5}\b/)?.[0] || ""; if (!zip) return null;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(7000) });
    const p = await res.json().catch(() => ({})), place = Array.isArray(p?.places) ? p.places[0] : null; const lat = Number(place?.latitude), lon = Number(place?.longitude);
    return res.ok && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon, city: String(place?.["place name"] || ""), state: String(place?.state || ""), zip } : null;
  } catch { return null; }
}
async function geocode(q: string) {
  q = strip(q).replace(/\s+/g, " ").trim().slice(0, 160); if (q.length < 3) return null;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    const rows = await res.json().catch(() => []), x = Array.isArray(rows) ? rows[0] : null; const lat = Number(x?.lat), lon = Number(x?.lon);
    return res.ok && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch { return null; }
}
function slug(state: string) { return state.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""); }
function titleFromSlug(url: string) { try { const part = new URL(url).pathname.split("/").filter(Boolean).pop() || "Auction"; return part.replace(/^\d+-?/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); } catch { return "Auction"; } }
function cleanTitle(v: string) { return strip(v).replace(/\s+(?:Auction Details|Register to Bid|Catalog).*$/i, "").trim().slice(0, 220); }
function findAddress(text: string) {
  const patterns = [/\b\d{1,6}\s+[A-Za-z0-9.'#& -]{3,80},\s*[A-Za-z.' -]{2,50},?\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/, /\b\d{1,6}\s+[A-Za-z0-9.'#& -]{3,80}\s+[A-Za-z.' -]{2,50},\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/];
  for (const p of patterns) { const m = text.match(p); if (m) return m[0].trim(); }
  const cityZip = text.match(/\b[A-Za-z.' -]{2,50},\s*[A-Z]{2}\s+\d{5}\b/); return cityZip ? cityZip[0].trim() : "";
}
function parseEvents(html: string, base: string) {
  const out: Any[] = [], seen = new Set<string>(); const re = /<a\b([^>]*?)href=["']([^"']*\/catalog\/[^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const url = abs(m[2] || "", base); if (!url || seen.has(url)) continue; seen.add(url);
    const idx = m.index || 0, chunk = html.slice(Math.max(0, idx - 3500), Math.min(html.length, idx + 8500)), plain = strip(chunk); let title = cleanTitle(m[4] || "");
    if (title.length < 5 || /^(auction details|catalog|register to bid|view \d+ matches)$/i.test(title)) { const headings = [...chunk.matchAll(/<h[1-5]\b[^>]*>([\s\S]{0,700}?)<\/h[1-5]>/gi)].map((x) => cleanTitle(x[1] || "")).filter((x) => x.length > 4 && !/^bidding notice/i.test(x)); title = headings.find((x) => /auction/i.test(x)) || headings[0] || titleFromSlug(url); }
    const headings = [...chunk.matchAll(/<h[2-6]\b[^>]*>([\s\S]{0,500}?)<\/h[2-6]>/gi)].map((x) => cleanTitle(x[1] || "")).filter(Boolean); const company = headings.find((x) => x !== title && !/bidding notice|auction notice|live and online/i.test(x) && x.length < 120) || ""; const address = findAddress(plain);
    const dateMatch = plain.match(/Date\(s\)\s*([^|]{3,90}?)(?=\s+(?:Bidding|Prebidding|Online Only|Live Webcast|Local Pickup|Shipping Available|Auction Details|Bidding Notice|Auction Notice|$))/i), dateLabel = dateMatch ? `Date(s) ${dateMatch[1].trim()}` : ""; const close = plain.match(/(?:items? begin closing|auction (?:ends|closes)|begins? to close|closing|starts?)\s*[:\-]?\s*([^|]{4,90})/i)?.[0]?.trim() || "";
    const type = /Live Webcast Auction/i.test(plain) ? "Live Webcast" : /Online Only Auction/i.test(plain) ? "Online Only" : /Absentee Auction/i.test(plain) ? "Absentee" : /Listing Only/i.test(plain) ? "Listing Only" : "Auction"; let pickup = "Pickup not established"; if (/Local Pick-?up Only/i.test(plain)) pickup = "Local Pickup Only"; else if (/No Shipping Available[^.]{0,80}Local Pick-?up/i.test(plain)) pickup = "Local Pickup Only"; else if (/Local Pick-?up Preferred/i.test(plain)) pickup = "Local Pickup Preferred"; else if (/Shipping Available/i.test(plain)) pickup = "Shipping Available";
    const status = plain.match(/\b(?:Bidding Open|Prebidding Open|Bidding opens in[^|]{0,40}|Live Now|Closing Soon)\b/i)?.[0] || ""; if (title.length < 4) title = titleFromSlug(url); out.push({ title, company, address, location_label: address, date_label: dateLabel, closing_label: close, auction_type: type, pickup_mode: pickup, status, url, source: "HiBid" }); if (out.length >= 80) break;
  }
  return out;
}
function likelyEndMs(a: Any) { const text = `${a.closing_label || ""} ${a.date_label || ""}`, mm = [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)]; if (mm.length) { const x = mm[mm.length - 1], d = new Date(Number(x[3]), Number(x[1]) - 1, Number(x[2]), 23, 59, 59).getTime(); return Number.isFinite(d) ? d : Number.MAX_SAFE_INTEGER; } const d = Date.parse(text); return Number.isFinite(d) ? d : Number.MAX_SAFE_INTEGER; }

Deno.serve(async (r) => {
  if (r.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(r) }); if (r.method !== "POST") return json(r, 405, { error: "POST required" });
  try {
    const uid = await userId(r); if (!ALLOWED.has(uid)) return json(r, 403, { error: "Not authorized" }); const b = await r.json().catch(() => ({})); let lat = Number(b?.lat), lon = Number(b?.lon), postal = String(b?.postal || "").match(/\d{5}/)?.[0] || ""; const radiusMiles = [25, 50, 100, 150].includes(Number(b?.radiusMiles)) ? Number(b.radiusMiles) : 50; const filter = ["near", "ending", "pickup", "physical"].includes(String(b?.filter)) ? String(b.filter) : "near";
    let rev = Number.isFinite(lat) && Number.isFinite(lon) ? await reverse(lat, lon) : null; if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && postal) { const z = await zipPoint(postal); if (z) { lat = z.lat; lon = z.lon; rev = { city: z.city, state: z.state, zip: z.zip }; } } if (!postal) postal = rev?.zip || ""; const state = String(rev?.state || "").trim(); if (!state) return json(r, 200, { status: "PARTIAL", auctions: [], summary: { note: "State could not be resolved from the selected location." }, source: "HiBid" });
    const base = `https://hibid.com/${slug(state)}/auctions`, pages: string[] = [base, `${base}?apage=2`], all: Any[] = [], failures: string[] = []; for (const url of pages) { try { const p = await get(url); all.push(...parseEvents(p.html, p.url)); } catch (e) { failures.push(e instanceof Error ? e.message : String(e)); } }
    const unique = new Map<string, Any>(); for (const x of all) if (x.url && !unique.has(x.url)) unique.set(x.url, x); const zipCache = new Map<string, Promise<{lat:number;lon:number;city:string;state:string;zip:string}|null>>(), addressCache = new Map<string, Promise<{lat:number;lon:number}|null>>(), located: Any[] = []; let addressFallbacks = 0;
    for (const event of [...unique.values()].slice(0, 50)) { let d: number | null = null; if (Number.isFinite(lat) && Number.isFinite(lon) && event.address) { const eventZip = String(event.address).match(/\b\d{5}\b/)?.[0] || ""; let g: {lat:number;lon:number}|null = null; if (eventZip) { if (!zipCache.has(eventZip)) zipCache.set(eventZip, zipPoint(eventZip)); g = await zipCache.get(eventZip)!; } else if (addressFallbacks < 8) { addressFallbacks++; if (!addressCache.has(event.address)) addressCache.set(event.address, geocode(event.address)); g = await addressCache.get(event.address)!; } if (g) d = hav(lat, lon, g.lat, g.lon); } if (Number.isFinite(lat) && Number.isFinite(lon) && (d == null || !Number.isFinite(d) || d > radiusMiles * 1.18)) continue; located.push({ ...event, distance_miles: d == null ? null : Number(d.toFixed(1)) }); }
    let rows = located; if (filter === "pickup") rows = rows.filter((x) => /local pickup/i.test(x.pickup_mode) || /online only/i.test(x.auction_type)); if (filter === "physical") rows = rows.filter((x) => !/online only/i.test(x.auction_type)); if (filter === "ending") rows = rows.slice().sort((a, b) => likelyEndMs(a) - likelyEndMs(b)); else rows = rows.slice().sort((a, b) => Number(a.distance_miles ?? 99999) - Number(b.distance_miles ?? 99999)); rows = rows.slice(0, 40);
    return json(r, 200, { status: failures.length && !rows.length ? "PARTIAL" : "PASS", source: "HiBid", location: { state, postal: postal || null, radius_miles: radiusMiles }, auctions: rows, summary: { state_page: base, discovered: unique.size, within_radius: located.length, shown: rows.length, filter, failures: failures.length, note: "Auction events are discovery results. Profit, buyer premium, and resale value are not required to appear." } });
  } catch (e) { return json(r, 200, { status: "PARTIAL", auctions: [], source: "HiBid", summary: { note: e instanceof Error ? e.message : String(e) } }); }
});
