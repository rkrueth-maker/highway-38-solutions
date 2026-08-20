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
const UA = "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Safari/537.36 H38ResellerScout/1";
const DEFAULT_TERMS = ["tools", "Milwaukee", "DeWalt", "Snap-on", "generator", "welder", "toolbox", "zero turn", "pressure washer"];
const SELLING_FRICTION = 0.13;
const DEFAULT_AUCTION_PREMIUM = 18;

function cors(r: Request) {
  const o = r.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ORIGINS.has(o) ? o : "https://appassets.androidplatform.net",
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "vary": "Origin",
  };
}
function json(r: Request, s: number, b: unknown) { return new Response(JSON.stringify(b), { status: s, headers: cors(r) }); }
async function uid(r: Request) {
  const t = String(r.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!t) throw Error("Sign in required.");
  const x = await fetch(`${U}/auth/v1/user`, { headers: { authorization: `Bearer ${t}`, apikey: K } });
  const p = await x.json().catch(() => ({}));
  if (!x.ok || !p?.id) throw Error("Session expired.");
  return String(p.id);
}
function dec(v: unknown) {
  return String(v || "")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—");
}
function text(v: unknown) {
  return dec(v).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ").trim();
}
function money(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v > 0 ? v : 0;
  const m = String(v || "").replace(/,/g, "").match(/\$\s*([0-9]{1,7}(?:\.\d{1,2})?)/);
  return m ? Number(m[1]) : 0;
}
function price(v: string) { return money(v); }
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function uniq(rows: any[]) {
  const m = new Map<string, any>();
  for (const x of rows) {
    const k = String(x.url || x.notification_id || `${x.source}|${x.title}|${x.buy_price}`).toLowerCase();
    if (k && !m.has(k)) m.set(k, x);
  }
  return [...m.values()];
}
function matches(title: string, term: string) {
  const a = title.toLowerCase(), b = term.toLowerCase(), parts = b.split(/\s+/).filter(x => x.length > 2);
  return a.includes(b) || parts.some(x => a.includes(x));
}
function friendly(v: string) {
  return /tool|battery|charger|drill|driver|impact|saw|nailer|grinder|sander|router|vacuum|compressor|generator|mower|blower|trimmer|chainsaw|storage|toolbox|workbench|ladder|grill|smoker|cooler|appliance|electronics|camera|speaker|headphone|tablet|laptop|\btv\b|gaming|console|lego|heater|lighting|pump|welder|socket|wrench|ratchet|hammer|laser|level|zero turn|pressure washer|snowblower|snow blower/i.test(v);
}
function quality(title: string, source: string, hasPrice: boolean, hasImage: boolean, hasLocation: boolean) {
  let s = 42;
  if (hasPrice) s += 20;
  if (hasImage) s += 7;
  if (hasLocation) s += 7;
  if (/milwaukee|dewalt|snap-?on|makita|bosch|ridgid|ryobi|kobalt|craftsman|metabo|ego|stihl|husqvarna|honda|generac|lincoln|miller/i.test(title)) s += 13;
  if (friendly(title)) s += 9;
  if (source === "Facebook Marketplace") s += 3;
  return clamp(s, 0, 100);
}
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.7613, d2r = Math.PI / 180, dLat = (lat2 - lat1) * d2r, dLon = (lon2 - lon1) * d2r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * d2r) * Math.cos(lat2 * d2r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function absUrl(href: string, base: string) { try { return new URL(dec(href), base).toString(); } catch { return ""; } }
function imageFrom(block: string, base: string) {
  const m = block.match(/<(?:img|source)\b[^>]*(?:src|data-src)=["']([^"']+)["']/i);
  return m ? absUrl(m[1], base) : "";
}
function geoFrom(block: string) {
  const a = block.match(/data-latitude=["'](-?\d+(?:\.\d+)?)["']/i), b = block.match(/data-longitude=["'](-?\d+(?:\.\d+)?)["']/i);
  if (!a || !b) return null;
  const lat = Number(a[1]), lon = Number(b[1]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}
function locationFrom(block: string) {
  const m = block.match(/<(?:span|div)\b[^>]*class=["'][^"']*(?:location|nearby|town)[^"']*["'][^>]*>([\s\S]{0,250}?)<\/(?:span|div)>/i);
  return m ? text(m[1]).replace(/^\(|\)$/g, "") : "";
}
function ageLabel(ms: number) {
  if (!ms || !Number.isFinite(ms)) return "";
  const d = Math.max(0, Date.now() - ms), min = Math.round(d / 60000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60); if (hr < 48) return `${hr} hr ago`;
  return `${Math.round(hr / 24)} d ago`;
}
async function get(url: string, timeout = 7000) {
  const c = new AbortController(), to = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" }, redirect: "follow", signal: c.signal });
    const html = await r.text().catch(() => "");
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    return { url: r.url, html };
  } finally { clearTimeout(to); }
}
async function reversePostal(lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  try {
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const r = await fetch(u, { headers: { "user-agent": UA, accept: "application/json" } });
    if (!r.ok) return "";
    const p = await r.json().catch(() => ({}));
    return String(p?.address?.postcode || "").match(/\d{5}/)?.[0] || "";
  } catch { return ""; }
}

function craigslist(html: string, base: string, term: string, ctx: any) {
  const out: any[] = [], seen = new Set<string>();
  for (const m of html.matchAll(/<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (out.length >= 24) break;
    const href = absUrl(m[2] || "", base), title = text(m[4] || "");
    if (!href || seen.has(href) || title.length < 5 || (!/\.html(?:$|\?)/i.test(href) && !/\/d\//i.test(href))) continue;
    if (!matches(title, term) && !friendly(title)) continue;
    const at = m.index || 0, block = html.slice(Math.max(0, at - 1300), Math.min(html.length, at + 3600)), buy = price(text(block));
    if (!(buy > 0)) continue;
    const g = geoFrom(block), dist = g && Number.isFinite(ctx.lat) && Number.isFinite(ctx.lon) ? haversine(ctx.lat, ctx.lon, g.lat, g.lon) : null;
    if (dist != null && dist > ctx.radiusMiles * 1.25) continue;
    const loc = locationFrom(block), img = imageFrom(block, base), dt = block.match(/datetime=["']([^"']+)["']/i), posted = dt ? Date.parse(dt[1]) : 0;
    seen.add(href);
    out.push({ source: "Craigslist", title, url: href, buy_price: buy, estimated_all_in: buy, image_url: img, location_label: loc, distance_miles: dist, posted_at: posted || null, age_label: ageLabel(posted), term, automatic: true, quality: quality(title, "Craigslist", true, !!img, !!loc || dist != null) });
  }
  return out;
}
function hibid(html: string, base: string, term: string) {
  const out: any[] = [], seen = new Set<string>();
  for (const m of html.matchAll(/<a\b([^>]*)href=["']([^"']*(?:\/lot\/|\/lot-information\/)[^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (out.length >= 24) break;
    const href = absUrl(m[2] || "", base), title = text(m[4] || "");
    if (!href || seen.has(href) || title.length < 5 || (!matches(title, term) && !friendly(title))) continue;
    const at = m.index || 0, block = html.slice(Math.max(0, at - 1700), Math.min(html.length, at + 4300)), plain = text(block), bid = price(plain);
    if (!(bid > 0)) continue;
    const pm = plain.match(/(?:buyer'?s?\s+premium|bp)\s*[:\-]?\s*(\d{1,2}(?:\.\d+)?)\s*%/i), premium = pm ? clamp(Number(pm[1]), 0, 40) : DEFAULT_AUCTION_PREMIUM;
    const estimated = Number((bid * (1 + premium / 100)).toFixed(2)), img = imageFrom(block, base), loc = locationFrom(block);
    const close = plain.match(/(?:Ends|Closing|Closes)\s*[:\-]?\s*([^|]{3,45})/i)?.[0] || "";
    seen.add(href);
    out.push({ source: "HiBid", title, url: href, buy_price: bid, estimated_all_in: estimated, buyer_premium_pct: premium, buyer_premium_estimated: !pm, image_url: img, location_label: loc, closing_label: close, term, automatic: true, quality: quality(title, "HiBid", true, !!img, !!loc) });
  }
  return out;
}
function facebook(rows: any[], terms: string[]) {
  const out: any[] = [];
  for (const x of rows.slice(0, 80)) {
    const raw = `${x?.title || ""} ${x?.text || ""}`.trim(), title = String(x?.title || x?.text || "").trim();
    const buy = Number(x?.price || money(raw));
    if (title.length < 4 || !(buy > 0)) continue;
    const matched = terms.some(t => matches(raw, t)) || friendly(raw);
    if (!matched) continue;
    out.push({ source: "Facebook Marketplace", title, url: String(x?.url || ""), notification_id: x?.notification ? String(x?.id || "") : "", buy_price: buy, estimated_all_in: buy, posted_at: Number(x?.posted_at || 0) || null, age_label: ageLabel(Number(x?.posted_at || 0)), location_label: "Marketplace alert location", automatic: true, quality: quality(title, "Facebook Marketplace", true, false, false), facebook_device_alert: true });
  }
  return out;
}

const compCache = new Map<string, any>();
function compQuery(title: string) {
  return title.replace(/\b(new|used|obo|firm|sale|for sale|lot|auction|pickup only)\b/gi, " ").replace(/[^a-z0-9+.# -]/gi, " ").replace(/\s+/g, " ").trim().slice(0, 90);
}
async function soldComp(title: string) {
  const q = compQuery(title).toLowerCase();
  if (!q) return null;
  if (compCache.has(q)) return compCache.get(q);
  const promise = (async () => {
    try {
      const u = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}&LH_Sold=1&LH_Complete=1&_sop=13`;
      const p = await get(u, 5000);
      if (/pardon our interruption|captcha|robot check/i.test(p.html)) return null;
      const vals: number[] = [];
      for (const m of p.html.matchAll(/s-item__price[^>]*>([\s\S]{0,180}?)<\/span>/gi)) {
        const n = price(text(m[1] || ""));
        if (n >= 5 && n <= 25000) vals.push(n);
        if (vals.length >= 24) break;
      }
      if (vals.length < 2) return null;
      vals.sort((a, b) => a - b);
      const lo = Math.floor(vals.length * 0.15), hi = Math.max(lo + 1, Math.ceil(vals.length * 0.85)), trimmed = vals.slice(lo, hi);
      const mid = Math.floor(trimmed.length / 2), median = trimmed.length % 2 ? trimmed[mid] : (trimmed[mid - 1] + trimmed[mid]) / 2;
      return { median: Number(median.toFixed(2)), samples: vals.length, confidence: vals.length >= 8 ? "high" : vals.length >= 4 ? "medium" : "low" };
    } catch { return null; }
  })();
  compCache.set(q, promise);
  return promise;
}
async function scoreCandidates(rows: any[]) {
  const ordered = [...rows].sort((a, b) => Number(b.quality || 0) - Number(a.quality || 0));
  const compTargets = ordered.filter(x => Number(x.buy_price) > 0).slice(0, 10);
  const comps = await Promise.all(compTargets.map(x => soldComp(x.title)));
  compTargets.forEach((x, i) => x.__comp = comps[i]);

  const out: any[] = [];
  let needsCompKept = 0;
  for (const x of ordered) {
    const c = x.__comp || null, allIn = Number(x.estimated_all_in || x.buy_price || 0), dist = Number(x.distance_miles);
    if (c && allIn > 0) {
      const resale = Number(c.median), net = Number((resale * (1 - SELLING_FRICTION) - allIn).toFixed(2)), roi = Number((net / allIn * 100).toFixed(1));
      if (net < 15 || roi < 20) continue;
      const distancePenalty = Number.isFinite(dist) ? Math.min(20, dist / 4) : 5;
      const opportunity = Math.round(clamp(45 + roi * 0.28 + net / 18 - distancePenalty, 1, 99));
      out.push({ ...x, resale_estimate: resale, comp_samples: c.samples, comp_confidence: c.confidence, selling_friction_pct: SELLING_FRICTION * 100, net_profit: net, roi_pct: roi, opportunity_score: opportunity, needs_comp: false });
    } else {
      if (Number(x.quality || 0) < 69 || needsCompKept >= 6) continue;
      needsCompKept++;
      out.push({ ...x, resale_estimate: null, comp_samples: 0, comp_confidence: "none", net_profit: null, roi_pct: null, opportunity_score: Math.round(clamp(Number(x.quality || 0) - 25, 1, 70)), needs_comp: true });
    }
  }
  return out.sort((a, b) => Number(b.opportunity_score || 0) - Number(a.opportunity_score || 0)).slice(0, 32);
}

Deno.serve(async (r) => {
  if (r.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(r) });
  if (r.method !== "POST") return json(r, 405, { error: "POST required" });
  try {
    const id = await uid(r);
    if (!ALLOWED.has(id)) return json(r, 403, { error: "Not authorized" });
    const b = await r.json().catch(() => ({}));
    let terms = Array.isArray(b.terms) ? b.terms.map((x: any) => String(x || "").trim()).filter((x: string) => x.length >= 2).slice(0, 12) : [];
    if (!terms.length) terms = DEFAULT_TERMS.slice();
    const wanted = new Set((Array.isArray(b.sources) ? b.sources : []).map((x: any) => String(x).toLowerCase()));
    const use = (n: string) => !wanted.size || wanted.has(n.toLowerCase());
    const lat = Number(b.lat), lon = Number(b.lon), radiusMiles = [25, 50, 100, 150].includes(Number(b.radiusMiles)) ? Number(b.radiusMiles) : 50;
    let postal = String(b.postal || "").match(/\d{5}/)?.[0] || "";
    if (!postal && Number.isFinite(lat) && Number.isFinite(lon)) postal = await reversePostal(lat, lon);
    const ctx = { lat, lon, radiusMiles, postal };

    let rows: any[] = [], status: any[] = [];
    const remoteTerms = terms.slice(0, 5);
    for (const term of remoteTerms) {
      const q = encodeURIComponent(term), jobs: any[] = [];
      if (use("Craigslist")) {
        const geo = Number.isFinite(lat) && Number.isFinite(lon) ? `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&search_distance=${radiusMiles}` : "";
        jobs.push({ source: "Craigslist", url: `https://www.craigslist.org/search/sss?query=${q}&sort=date${geo}`, parse: (h: string, u: string) => craigslist(h, u, term, ctx) });
      }
      if (use("HiBid")) {
        const loc = postal ? `&zip=${encodeURIComponent(postal)}&miles=${radiusMiles}` : "";
        jobs.push({ source: "HiBid", url: `https://hibid.com/lots?q=${q}${loc}`, parse: (h: string, u: string) => hibid(h, u, term) });
      }
      const settled = await Promise.all(jobs.map(async j => {
        try {
          const p = await get(j.url), found = j.parse(p.html, p.url);
          status.push({ source: j.source, term, status: "PASS", matches: found.length });
          return found;
        } catch (e) {
          status.push({ source: j.source, term, status: "BLOCKED_OR_UNAVAILABLE", matches: 0, detail: e instanceof Error ? e.message : String(e) });
          return [];
        }
      }));
      for (const x of settled) rows.push(...x);
    }

    if (use("Facebook Marketplace")) {
      const fb = facebook(Array.isArray(b.facebookCandidates) ? b.facebookCandidates : [], terms);
      rows.push(...fb);
      status.push({ source: "Facebook Marketplace", term: "phone alerts", status: "PASS", matches: fb.length, device_session: true });
    }

    const candidates = uniq(rows).sort((a, b) => Number(b.quality || 0) - Number(a.quality || 0)).slice(0, 60);
    const opportunities = await scoreCandidates(candidates);
    const by: Record<string, any> = {};
    for (const s of status) {
      const k = s.source;
      if (!by[k]) by[k] = { attempts: 0, passed: 0, matches: 0, failed: 0, qualified: 0 };
      by[k].attempts++;
      if (s.status === "PASS") by[k].passed++; else by[k].failed++;
      by[k].matches += Number(s.matches || 0);
    }
    for (const x of opportunities) {
      const k = x.source;
      if (!by[k]) by[k] = { attempts: 0, passed: 0, matches: 0, failed: 0, qualified: 0 };
      by[k].qualified++;
    }

    return json(r, 200, {
      status: "PASS",
      engine: "location_profit_v1",
      facebook_mode: "device_notifications_only",
      location: { lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null, postal: postal || null, radius_miles: radiusMiles },
      candidates_checked: candidates.length,
      opportunities,
      source_status: status,
      source_summary: by,
      automatic: true,
      scanned_at: new Date().toISOString(),
    });
  } catch (e) {
    return json(r, 200, { status: "PARTIAL", engine: "location_profit_v1", facebook_mode: "device_notifications_only", candidates_checked: 0, opportunities: [], source_status: [], source_summary: {}, automatic: true, warning: e instanceof Error ? e.message : String(e) });
  }
});
