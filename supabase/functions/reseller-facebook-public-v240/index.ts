import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Any = Record<string, any>;

const ORIGINS = new Set([
  "https://appassets.androidplatform.net",
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ORIGINS.has(origin) ? origin : "https://appassets.androidplatform.net",
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, max-age=30",
    vary: "Origin",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}

const txt = (v: unknown) => String(v ?? "").trim();
const clean = (v: unknown) => txt(v)
  .replace(/<!\[CDATA\[|\]\]>/g, " ")
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#0*39;|&apos;/gi, "'")
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

function where(body: Any) {
  return txt(body.location_label || body.locationLabel).replace(/^ZIP\s+/i, "").trim()
    || [txt(body.city), txt(body.state_code || body.state), txt(body.postal || body.zip)].filter(Boolean).join(", ");
}

function locationParts(body: Any) {
  const city = txt(body.city) || where(body).split(",")[0]?.trim() || "";
  const state = txt(body.state_code || body.state) || (where(body).match(/\b([A-Z]{2})\b/) || [])[1] || "";
  return { city, state };
}

function aliases(term: string) {
  const n = term.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const out = new Set([n]);
  if (/\bfridge\b/.test(n)) out.add(n.replace(/\bfridge\b/g, "refrigerator"));
  if (/\brefrigerator\b/.test(n)) out.add(n.replace(/\brefrigerator\b/g, "fridge"));
  if (/\btv\b/.test(n)) out.add(n.replace(/\btv\b/g, "television"));
  if (/\btelevision\b/.test(n)) out.add(n.replace(/\btelevision\b/g, "tv"));
  if (/\bsofa\b/.test(n)) out.add(n.replace(/\bsofa\b/g, "couch"));
  if (/\bcouch\b/.test(n)) out.add(n.replace(/\bcouch\b/g, "sofa"));
  return [...out].filter(Boolean);
}

function relevant(text: string, term: string) {
  const hay = clean(text).toLowerCase().replace(/[^a-z0-9]+/g, " ");
  return aliases(term).some((a) => a.split(" ").filter((w) => w.length > 1).every((w) => hay.includes(w)));
}

function marketplaceItem(value: string) {
  const m = txt(value).match(/https?:\/\/(?:[a-z0-9-]+\.)*facebook\.com\/marketplace\/item\/(\d{6,})/i);
  return m ? `https://www.facebook.com/marketplace/item/${m[1]}/` : "";
}

function rssItems(xml: string) {
  const rows: Any[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = m[1] || "";
    const val = (tag: string) => clean((block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i")) || [])[1] || "");
    rows.push({ title: val("title"), link: val("link"), description: val("description"), pubDate: val("pubDate") });
  }
  return rows;
}

function searchUrl(term: string, body: Any) {
  const u = new URL("https://www.facebook.com/marketplace/search/");
  u.searchParams.set("query", term);
  u.searchParams.set("sortBy", "creation_time_descend");
  u.searchParams.set("daysSinceListed", "7");
  u.searchParams.set("deliveryMethod", "local_pick_up");
  u.searchParams.set("radius", String(Math.max(25, Math.min(150, Number(body.radiusMiles || body.radius_miles || 50)))));
  const lat = Number(body.lat), lon = Number(body.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    u.searchParams.set("latitude", String(lat));
    u.searchParams.set("longitude", String(lon));
  }
  return u.toString();
}

async function bingIndex(term: string, body: Any) {
  const { city, state } = locationParts(body);
  const place = [city, state].filter(Boolean).join(", ");
  const q = `site:facebook.com/marketplace/item "${place}" ${term}`;
  try {
    const r = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss&count=30`, {
      headers: { "user-agent": "Mozilla/5.0 H38Scout/3.2", accept: "application/rss+xml,application/xml,text/xml,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    const xml = await r.text().catch(() => "");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const candidates: Any[] = [];
    const verified: Any[] = [];
    const seen = new Set<string>();
    for (const row of rssItems(xml)) {
      const url = marketplaceItem(`${row.link} ${row.description} ${row.title}`);
      if (!url || seen.has(url) || !relevant(`${row.title} ${row.description}`, term)) continue;
      seen.add(url);
      const evidence = `${row.title} ${row.description}`;
      const cityMatch = !!city && new RegExp(`\\b${city.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i").test(evidence);
      const stateMatch = !state || new RegExp(`\\b${state.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i").test(evidence);
      const priceText = (evidence.match(/\$\s*([0-9][0-9,.]*(?:\.\d{2})?)/) || [])[1] || "";
      const price = priceText ? Number(priceText.replace(/,/g, "")) : null;
      const item = {
        id: url,
        source: "Facebook Marketplace",
        source_type: "public_search_index_listing",
        title: clean(row.title).replace(/\s*[-|·]\s*Facebook Marketplace.*$/i, "") || `Facebook Marketplace result for ${term}`,
        description: clean(row.description).slice(0, 800),
        url,
        source_url: url,
        price: Number.isFinite(price as number) ? price : null,
        buy_price: Number.isFinite(price as number) ? price : null,
        location_label: place,
        location_verified: cityMatch && stateMatch,
        location_evidence: cityMatch && stateMatch ? "public_index_city_state" : "unproven",
        source_search_bound: true,
        public_indexed: true,
        freshness_unproven: true,
        query_relevance_verified: true,
        verification_status: cityMatch && stateMatch ? "PUBLIC FACEBOOK · LOCATION TEXT VERIFIED" : "PUBLIC FACEBOOK · LOCATION NEEDS PROOF",
        search_term: term,
        observed_at: new Date().toISOString(),
      };
      candidates.push(item);
      if (item.location_verified) verified.push(item);
      if (candidates.length >= 30) break;
    }
    return { ok: true, status: r.status, candidates, verified, query: q };
  } catch (e) {
    return { ok: false, status: 0, candidates: [], verified: [], query: q, error: e instanceof Error ? e.message : String(e) };
  }
}

function routeCandidate(term: string, body: Any) {
  return {
    id: `facebook-search-route:${encodeURIComponent(term)}:${encodeURIComponent(where(body))}`,
    record_type: "search_route",
    route_only: true,
    source: "Facebook Marketplace",
    source_type: "live_search_route",
    title: "Open Facebook Marketplace live search",
    description: `Facebook did not expose an indexable local item card for this pass. Open the live Marketplace search for “${term}” in the selected area.`,
    url: searchUrl(term, body),
    source_url: searchUrl(term, body),
    price: null,
    buy_price: null,
    location_label: where(body),
    location_verified: false,
    source_search_bound: true,
    freshness_unproven: true,
    query_relevance_verified: true,
    verification_status: "FACEBOOK SEARCH ROUTE · OPEN TO VIEW LIVE LISTINGS",
    search_term: term,
    economics_complete: false,
    profit_verified: false,
    observed_at: new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "POST required" });
  if (!req.headers.get("authorization")) return json(req, 401, { error: "Sign in required" });

  const started = Date.now();
  const body: Any = await req.json().catch(() => ({}));
  const requested = (Array.isArray(body.terms) ? body.terms : []).map(txt).filter((v: string) => v.length >= 2);
  const terms = [...new Set(requested.length ? requested : ["tools", "lawn mower", "electronics", "appliances"])].slice(0, 4);
  const results: Any[] = [];
  const candidates: Any[] = [];
  const diagnostics: Any[] = [];
  const seen = new Set<string>();

  for (const term of terms) {
    const indexed = await bingIndex(term, body);
    diagnostics.push({ provider: "bing_public_index", term, ok: indexed.ok, http_status: indexed.status, verified_count: indexed.verified.length, candidate_count: indexed.candidates.length, query: indexed.query, error: indexed.error || "" });
    for (const row of indexed.verified) {
      if (!seen.has(row.url)) { seen.add(row.url); results.push(row); }
    }
    for (const row of indexed.candidates) {
      if (!seen.has(row.url)) { seen.add(row.url); candidates.push(row); }
    }
  }

  const liveListingCount = results.length + candidates.length;
  if (!liveListingCount) {
    for (const term of terms) candidates.push(routeCandidate(term, body));
  }

  const providerStatus = results.length
    ? "LIVE"
    : liveListingCount
    ? "PUBLIC_LOCATION_UNPROVEN"
    : "SEARCH_ROUTES_AVAILABLE";

  return json(req, 200, {
    status: results.length ? "PASS" : "PARTIAL",
    engine: "H38_FACEBOOK_PUBLIC_V313_SEARCH_ROUTE_FALLBACK",
    provider_status: providerStatus,
    provider: "Public Bing index + Facebook live search routes",
    authentication: "NO_FACEBOOK_LOGIN",
    device_fallback_required: false,
    results: results.slice(0, 60),
    candidates: candidates.slice(0, 60),
    count: results.length,
    captured_count: candidates.length,
    terms,
    location_query: where(body),
    diagnostics,
    elapsed_ms: Date.now() - started,
    config_hint: results.length
      ? "Public Marketplace item evidence was found with location text proof."
      : liveListingCount
      ? "Public Marketplace item evidence was found but location is not proven; keep it out of local ranking until verified."
      : "Meta exposed no indexable item cards, so Scout returns live location-bound Marketplace search routes instead of a false zero-inventory claim.",
    truth: "Facebook remains public-only. Search-route candidates are navigation routes, not listings, not inventory, and never carry invented prices or resale profit. Item cards enter verified results only when public evidence proves the selected city/state.",
  });
});
