import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "content-type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

async function invoke(
  url: string,
  anon: string,
  auth: string,
  slug: string,
  body: unknown,
) {
  const r = await fetch(`${url}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      Authorization: auth,
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, text, data };
}

function savedCandidate(row: any) {
  return {
    ...row,
    id: row.canonical_key,
    verification_status: "SAVED DEAL · NEEDS SOLD COMPS",
    stage: "needs_comp",
    profit_verified: false,
    reason: "Current acquisition price is saved; verify sold comps, fees and local availability before buying.",
  };
}

function usableSavedRow(row: any) {
  const title = String(row?.title || "").trim();
  const lower = title.toLowerCase();
  if (title.length < 3) return false;
  if (lower === "permalink") return false;
  if (lower.includes("first seen at a penny")) return false;
  if (lower.includes("inventory checker")) return false;
  if (lower.includes("add the first photo")) return false;
  return true;
}

async function loadSaved(admin: any, limit = 80) {
  const q = await admin
    .from("reseller_hunt_cache")
    .select("canonical_key,retailer,title,upc,sku,buy_price,retail_price,image_url,source_url,deal_type,penny_sort_at")
    .eq("active", true)
    .gt("buy_price", 0)
    .order("penny_sort_at", { ascending: false })
    .limit(Math.max(200, limit * 4));
  const clean = (q.data || []).filter(usableSavedRow).slice(0, limit);
  return { rows: clean.map(savedCandidate), error: q.error };
}

function normalizeRadius(payload: Record<string, any>) {
  const raw = Number(payload.radiusMiles ?? payload.radius_miles ?? payload.radius ?? 50);
  const radius = Number.isFinite(raw) && raw > 0 ? Math.max(1, Math.min(150, raw)) : 50;
  payload.radiusMiles = radius;
  payload.radius_miles = radius;
  payload.radius = radius;
}

function locationLabel(location: any) {
  return [location?.city, location?.state_code || location?.state, location?.zip || location?.postal]
    .filter(Boolean)
    .join(", ");
}

async function reverseLocation(lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`,
      {
        headers: {
          "user-agent": "H38Resale/1.0 (+https://highway38solutions.com)",
          accept: "application/json",
        },
        signal: AbortSignal.timeout(7000),
      },
    );
    const p = await r.json().catch(() => ({}));
    if (!r.ok) return null;
    const a = (p as any)?.address || {};
    const city = String(a.city || a.town || a.village || a.hamlet || a.county || "").trim();
    const state = String(a.state || "").trim();
    const stateCode = String(a["ISO3166-2-lvl4"] || "").split("-").pop() || "";
    const zip = String(a.postcode || "").match(/\b\d{5}\b/)?.[0] || "";
    return { city, state, state_code: stateCode, zip, postal: zip };
  } catch {
    return null;
  }
}

async function normalizeLocation(
  payload: Record<string, any>,
  url: string,
  anon: string,
  auth: string,
) {
  normalizeRadius(payload);
  const zip = String(payload.postal || payload.zip || "").match(/\b\d{5}\b/)?.[0] || "";
  if (zip) {
    payload.postal = zip;
    payload.zip = zip;
  }

  let lat = Number(payload.lat);
  let lon = Number(payload.lon);
  if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && zip) {
    const geo = await invoke(url, anon, auth, "reseller-location-geocode", { zip });
    const location = (geo.data as any)?.location;
    if (geo.ok && location) {
      Object.assign(payload, location);
      lat = Number(location.lat);
      lon = Number(location.lon);
      payload.postal = location.zip || zip;
      payload.zip = location.zip || zip;
      payload.location_label = locationLabel(location);
      payload.locationLabel = payload.location_label;
    }
  }

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    payload.lat = lat;
    payload.lon = lon;
    if (!String(payload.location_label || payload.locationLabel || "").trim()) {
      const rev = await reverseLocation(lat, lon);
      if (rev) {
        Object.assign(payload, rev);
        if (rev.zip) {
          payload.postal = rev.zip;
          payload.zip = rev.zip;
        }
        payload.location_label = locationLabel(rev);
        payload.locationLabel = payload.location_label;
      }
    }
  }
  return payload;
}

const SALE_EVENT_RE = /\b(?:garage|yard|rummage|moving|estate|neighborhood|multi[- ]?family)\s+sales?\b|\b(?:garage|yard|rummage|moving|estate|neighborhood|multi[- ]?family)\s+sale\b/i;
const stripHtml = (v: unknown) => String(v || "")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#0*39;|&apos;/gi, "'")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

function saleType(v: unknown) {
  const s = String(v || "").toLowerCase();
  if (/estate/.test(s)) return "ESTATE SALE";
  if (/moving/.test(s)) return "MOVING SALE";
  if (/rummage/.test(s)) return "RUMMAGE SALE";
  if (/yard/.test(s)) return "YARD SALE";
  return "GARAGE SALE";
}

function saleIntent(v: unknown) {
  return SALE_EVENT_RE.test(stripHtml(v));
}

function dedupeSaleRows(rows: any[]) {
  const out: any[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const url = String(r?.url || r?.source_url || "").replace(/[?#].*$/, "").toLowerCase();
    const sig = [r?.source, r?.title, r?.location_label, r?.event_time || r?.date_label]
      .map((x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
      .join("|");
    const key = url || sig;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function parseRssItems(xml: string) {
  const out: any[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const item = m[1] || "";
    const val = (tag: string) => stripHtml((item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i")) || [])[1] || "");
    out.push({ title: val("title"), link: val("link"), description: val("description"), pubDate: val("pubDate") });
  }
  return out;
}

async function fetchText(url: string, timeout = 9000) {
  const r = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 H38Resale/1.1 (+https://highway38solutions.com)",
      accept: "text/html,application/xhtml+xml,application/rss+xml,application/xml,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
  });
  const text = await r.text().catch(() => "");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return { text, url: r.url || url };
}

async function facebookGarageRows(
  url: string,
  anon: string,
  auth: string,
  payload: Record<string, any>,
) {
  const p = {
    ...payload,
    terms: ["garage sale", "estate sale", "yard sale", "moving sale"],
    max_results: 80,
  };
  const fb = await invoke(url, anon, auth, "reseller-facebook-public-v240", p);
  if (!fb.ok || !fb.data || typeof fb.data !== "object") {
    return { rows: [], health: { status: "unavailable", count: 0 } };
  }
  const d = fb.data as Record<string, any>;
  const verified = Array.isArray(d.results) ? d.results : [];
  const candidates = Array.isArray(d.candidates) ? d.candidates : [];
  const rows = [...verified, ...candidates]
    .filter((r) => saleIntent(r?.title || r?.name || ""))
    .map((r) => ({
      ...r,
      source: "Facebook",
      source_type: "public_facebook_sale_listing",
      title: String(r?.title || r?.name || "Facebook sale listing").trim(),
      url: r?.url || r?.source_url || "",
      event_type: saleType(r?.title || r?.name || ""),
      sale_event_verified: true,
      detail_verified: r?.location_verified === true,
      freshness_unproven: true,
      verification_status: r?.location_verified === true ? "PUBLIC FACEBOOK · LOCATION VERIFIED" : "PUBLIC FACEBOOK · LOCATION NEEDS PROOF",
      source_search_bound: true,
    }));
  return {
    rows,
    health: {
      status: rows.length ? "live" : (d.provider_status || d.status || "empty"),
      count: rows.length,
      provider_status: d.provider_status || d.status || "UNKNOWN",
      raw_public_candidates: Number(d.raw_public_candidates || 0),
    },
  };
}

async function facebookPublicIndexRows(payload: Record<string, any>) {
  const city = String(payload.city || "").trim();
  const state = String(payload.state_code || payload.state || "").trim();
  if (!city) return { rows: [], health: { status: "not_applicable", count: 0 } };
  const q = `site:facebook.com ("garage sale" OR "estate sale" OR "yard sale" OR "moving sale") "${city}" ${state}`;
  try {
    const p = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&count=30`, 10000);
    const rows = parseRssItems(p.text)
      .filter((x) => /facebook\.com/i.test(x.link) && saleIntent(`${x.title} ${x.description}`))
      .map((x) => ({
        source: "Facebook public index",
        source_type: "public_search_index_sale_post",
        title: x.title || "Facebook sale post",
        url: x.link,
        event_type: saleType(`${x.title} ${x.description}`),
        location_label: [city, state].filter(Boolean).join(", "),
        event_time: x.pubDate || "",
        date_label: x.pubDate || "",
        location_verified: false,
        freshness_unproven: true,
        sale_event_verified: true,
        source_search_bound: true,
        verification_status: "PUBLIC INDEX · LOCATION/DATE NEEDS PROOF",
      }));
    return { rows, health: { status: rows.length ? "live" : "empty", count: rows.length, route: p.url } };
  } catch (e) {
    return { rows: [], health: { status: "unavailable", count: 0, warning: String(e) } };
  }
}

function parseApgSaleRows(html: string, base: string, fallbackLocation: string) {
  const out: any[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (out.length >= 30) break;
    const rawHref = m[1] || "";
    let url = "";
    try { url = new URL(rawHref, base).toString(); } catch { continue; }
    if (!/marketplace\.apg-mn\.com/i.test(url) || !/\/places\/view\//i.test(url) || seen.has(url)) continue;
    const start = Math.max(0, m.index - 1400);
    const end = Math.min(html.length, m.index + (m[0]?.length || 0) + 1800);
    const chunk = html.slice(start, end);
    const plain = stripHtml(chunk);
    if (!saleIntent(plain)) continue;
    const anchorTitle = stripHtml(m[2] || "");
    const heading = stripHtml((chunk.match(/<(?:h2|h3)\b[^>]*>([\s\S]*?)<\/(?:h2|h3)>/i) || [])[1] || "");
    const title = (heading.length >= 5 ? heading : anchorTitle.length >= 5 ? anchorTitle : `${saleType(plain)} listing`).slice(0, 220);
    const publication = (plain.match(/Publication Date:\s*(\d{1,2}-\d{1,2}-20\d{2})/i) || [])[1] || "";
    if (publication) {
      const [mm, dd, yy] = publication.split("-").map(Number);
      const t = Date.UTC(yy, mm - 1, dd, 23, 59, 59);
      if (Number.isFinite(t) && t < Date.now() - 120 * 86400000) continue;
    }
    const location = (plain.match(/\b([A-Z][A-Za-z .'-]{1,60},\s*MN(?:\s+\d{5})?)\b/) || [])[1] || fallbackLocation;
    seen.add(url);
    out.push({
      source: "Grand Rapids Herald-Review / APG",
      source_type: "local_newspaper_classified",
      title,
      url,
      event_type: saleType(plain),
      location_label: location,
      event_time: publication,
      date_label: publication,
      location_verified: false,
      freshness_unproven: !publication,
      sale_event_verified: true,
      source_search_bound: true,
      verification_status: publication ? "LOCAL PAPER CLASSIFIED" : "LOCAL PAPER · DATE NEEDS PROOF",
    });
  }
  return out;
}

async function localPaperGarageRows(payload: Record<string, any>) {
  const state = String(payload.state_code || payload.state || "").trim().toUpperCase();
  const fallbackLocation = [payload.city, state].filter(Boolean).join(", ") || String(payload.location_label || payload.locationLabel || "");
  if (state && state !== "MN") return { rows: [], health: { status: "not_applicable", count: 0 } };
  const urls = [
    "https://marketplace.apg-mn.com/grandrapidsmn/categories%3A207",
    "https://marketplace.apg-mn.com/grandrapidsmn/categories%3A172",
  ];
  const rows: any[] = [];
  let successes = 0;
  const warnings: string[] = [];
  for (const u of urls) {
    try {
      const p = await fetchText(u, 10000);
      successes++;
      rows.push(...parseApgSaleRows(p.text, p.url, fallbackLocation));
    } catch (e) {
      warnings.push(String(e));
    }
  }
  return {
    rows: dedupeSaleRows(rows),
    health: { status: rows.length ? "live" : successes ? "empty" : "unavailable", count: rows.length, warnings: warnings.slice(0, 2) },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "AUTH_REQUIRED" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) return json({ error: "AUTH_REQUIRED" }, 401);

    const { data: ent } = await sb
      .from("h38_product_entitlements")
      .select("active,expires_at")
      .eq("user_id", user.id)
      .eq("product_key", "resale")
      .maybeSingle();
    if (!ent?.active || (ent.expires_at && Date.parse(ent.expires_at) <= Date.now()))
      return json({ error: "PRODUCT_LOCKED", product: "resale" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "deals");
    const payload: Record<string, any> = { ...(body.payload || {}) };
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

    if (action === "saved") {
      const saved = await loadSaved(admin, 80);
      if (saved.error)
        return json({ error: "SAVED_DEALS_UNAVAILABLE", detail: saved.error.message }, 500);
      return json({
        ok: true,
        product: "resale",
        source: "h38_shared_deal_cache",
        data: {
          candidates: saved.rows,
          candidate_count: saved.rows.length,
          saved_only: true,
          warning: "Saved H38 buy leads are shown without starting a live marketplace scan. Verify sold comps, fees and local availability before buying.",
        },
      });
    }

    await normalizeLocation(payload, url, anon, auth);

    if (action === "stores") {
      if (!Number.isFinite(Number(payload.lat)) || !Number.isFinite(Number(payload.lon))) {
        return json({
          ok: true,
          product: "resale",
          source: "reseller-nearby-stores-v262",
          data: { status: "PARTIAL", stores: [], warning: "Enter a valid ZIP or use phone location before finding nearby stores." },
        });
      }
      const nearby = await invoke(url, anon, auth, "reseller-nearby-stores-v262", payload);
      if (nearby.ok) return json({ ok: true, product: "resale", source: "reseller-nearby-stores-v262", data: nearby.data });
      return json({ error: "SOURCE_UNAVAILABLE", detail: `reseller-nearby-stores-v262:${nearby.status}:${nearby.text.slice(0, 250)}` }, 502);
    }

    const map: Record<string, string> = {
      deals: "reseller-opportunity-scan-v060",
      facebook: "reseller-facebook-public-v240",
      auctions: "reseller-auction-search-v230",
      garage: "reseller-garage-sales-v308",
    };
    const slug = map[action];
    if (!slug) return json({ error: "UNKNOWN_ACTION" }, 400);

    let facebookMeta: Record<string, any> | null = null;
    if (action === "deals") {
      const fb = await invoke(url, anon, auth, "reseller-facebook-public-v240", payload);
      if (fb.ok && fb.data && typeof fb.data === "object") {
        const fd = fb.data as Record<string, any>;
        const facebookCandidates = [
          ...(Array.isArray(fd.results) ? fd.results : []),
          ...(Array.isArray(fd.candidates) ? fd.candidates : []),
        ];
        if (facebookCandidates.length) payload.facebookCandidates = facebookCandidates;
        facebookMeta = {
          provider_status: fd.provider_status || fd.status || "UNKNOWN",
          verified_count: Array.isArray(fd.results) ? fd.results.length : 0,
          candidate_count: Array.isArray(fd.candidates) ? fd.candidates.length : 0,
          raw_public_candidates: Number(fd.raw_public_candidates || 0),
          warnings: Array.isArray(fd.warnings) ? fd.warnings.slice(0, 4) : [],
        };
      } else {
        facebookMeta = { provider_status: "UNAVAILABLE", verified_count: 0, candidate_count: 0 };
      }
    }

    let scanPayload = payload;
    if (action === "garage" && Number(payload.radiusMiles) === 75) {
      scanPayload = { ...payload, radiusMiles: 100, radius_miles: 100, radius: 100 };
    }

    const result = await invoke(url, anon, auth, slug, scanPayload);
    if (result.ok) {
      const data = (result.data && typeof result.data === "object" ? result.data : {}) as Record<string, any>;
      if (facebookMeta) data.facebook_source = facebookMeta;

      if (action === "garage") {
        const [fbSales, fbIndex, papers] = await Promise.all([
          facebookGarageRows(url, anon, auth, payload),
          facebookPublicIndexRows(payload),
          localPaperGarageRows(payload),
        ]);
        const baseRows = Array.isArray(data.results) ? data.results : [];
        const requestedRadius = Number(payload.radiusMiles || 50);
        data.results = dedupeSaleRows([...baseRows, ...fbSales.rows, ...fbIndex.rows, ...papers.rows])
          .filter((r) => {
            const d = Number(r?.distance_miles);
            return !Number.isFinite(d) || d <= requestedRadius + 0.15;
          })
          .slice(0, 72);
        data.source_health = {
          ...(data.source_health || {}),
          "Facebook sale search": fbSales.health,
          "Facebook public index": fbIndex.health,
          "Local newspaper classifieds": papers.health,
        };
        data.status = data.results.length ? "PASS" : (data.status || "PARTIAL");
        data.engine = "garage_sales_multi_source_v317";
        data.truth = "Garage/Estate combines Craigslist, public Facebook sale evidence, local newspaper classifieds, EstateSales.NET, YardSaleSearch and local event calendars. Facebook remains public-only; unproven location/date is labeled instead of treated as confirmed local inventory.";
      }

      data.location_used = {
        zip: payload.zip || payload.postal || null,
        location_label: payload.location_label || payload.locationLabel || null,
        radius_miles: payload.radiusMiles,
        coordinates_available: Number.isFinite(Number(payload.lat)) && Number.isFinite(Number(payload.lon)),
      };
      const hasRows = [data.opportunities, data.candidates, data.auction_candidates]
        .some((rows: any) => Array.isArray(rows) && rows.length);
      if (action === "deals" && !hasRows) {
        const saved = await loadSaved(admin, 80);
        if (!saved.error && saved.rows.length) {
          data.candidates = saved.rows;
          data.candidate_count = saved.rows.length;
          data.fallback_source = "h38_shared_deal_cache";
          data.warning = "Live marketplace scan returned no rows, so current saved deals are shown for resale review.";
        }
      }
      return json({ ok: true, product: "resale", source: slug, data });
    }
    return json({ error: "SOURCE_UNAVAILABLE", detail: `${slug}:${result.status}:${result.text.slice(0, 250)}` }, 502);
  } catch (e) {
    return json({ error: "RESALE_API_ERROR", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
