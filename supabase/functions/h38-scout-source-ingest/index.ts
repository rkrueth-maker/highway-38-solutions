import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Any = Record<string, any>;
const BASE = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-h38-nightly-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const text = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const httpsUrl = (v: unknown) => /^https:\/\//i.test(text(v)) ? text(v) : "";
const admin = () => createClient(BASE, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const nowIso = () => new Date().toISOString();

async function authorized(req: Request, db: any) {
  const supplied = text(req.headers.get("x-h38-nightly-key"));
  if (!supplied) return false;
  const q = await db.from("h38_internal_job_secrets").select("secret_value")
    .eq("name", "penny-nightly").maybeSingle();
  return !q.error && !!q.data?.secret_value && supplied === text(q.data.secret_value);
}

async function sha(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function cityStateZipFromAddress(v: unknown) {
  const address = text(v);
  const m = address.match(/\b([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+([A-Z]{2})\s*,?\s*(\d{5})(?:-\d{4})?\b/);
  if (!m) return null;
  return { city: m[1], state_code: m[2], state: m[2], zip: m[3], postal: m[3] };
}

async function latestSearchArea(db: any) {
  const q = await db.from("reseller_store_discovery_tiles")
    .select("area_key,lat,lon,radius_miles,source,updated_at")
    .not("lat", "is", null).not("lon", "is", null)
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (q.error) throw q.error;
  if (!q.data || !Number.isFinite(Number(q.data.lat)) || !Number.isFinite(Number(q.data.lon))) return null;
  const radius = Math.max(1, Math.min(100, Number(q.data.radius_miles || 50)));
  const area: Any = {
    area_key: text(q.data.area_key),
    lat: Number(q.data.lat),
    lon: Number(q.data.lon),
    radiusMiles: radius,
    radius_miles: radius,
    radius,
    source: text(q.data.source),
    area_observed_at: q.data.updated_at,
  };

  const tiles = await db.from("reseller_store_discovery_tiles")
    .select("stores,updated_at").eq("area_key", area.area_key)
    .order("updated_at", { ascending: false }).limit(40);
  if (!tiles.error) {
    const stores: Any[] = [];
    for (const tile of tiles.data || []) {
      if (Array.isArray(tile?.stores)) stores.push(...tile.stores);
    }
    stores.sort((a, b) => (num(a?.distance_miles) ?? 9999) - (num(b?.distance_miles) ?? 9999));
    for (const store of stores) {
      const d = num(store?.distance_miles);
      if (d !== null && d > Math.min(8, radius)) continue;
      const parsed = cityStateZipFromAddress(store?.store_address || store?.address);
      if (!parsed) continue;
      Object.assign(area, parsed);
      area.location_label = [parsed.city, parsed.state_code, parsed.zip].filter(Boolean).join(", ");
      area.location_evidence = "nearest_store_in_same_recorded_search_area";
      break;
    }
  }
  return area;
}

async function reverseLocation(area: Any) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${encodeURIComponent(String(area.lat))}&lon=${encodeURIComponent(String(area.lon))}`,
      {
        headers: { "user-agent": "H38ScoutSourceIngest/1.1 (+https://highway38solutions.com)", accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      },
    );
    const p = await r.json().catch(() => ({}));
    if (!r.ok) return area;
    const a = (p as Any)?.address || {};
    const city = text(a.city || a.town || a.village || a.hamlet || a.county || area.city);
    const state = text(a.state || area.state);
    const stateCode = text(a["ISO3166-2-lvl4"]).split("-").pop() || text(area.state_code);
    const zip = text(a.postcode).match(/\b\d{5}\b/)?.[0] || text(area.zip || area.postal);
    return {
      ...area,
      city,
      state,
      state_code: stateCode,
      zip,
      postal: zip,
      location_label: [city, stateCode || state, zip].filter(Boolean).join(", ") || text(area.location_label),
      location_evidence: city && zip ? "reverse_geocode_or_recorded_store_area" : text(area.location_evidence),
    };
  } catch {
    return area;
  }
}

async function invoke(slug: string, body: unknown, timeout = 45000) {
  try {
    const r = await fetch(`${BASE}/functions/v1/${slug}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    const raw = await r.text();
    let data: Any = {};
    try { data = JSON.parse(raw); } catch { data = { raw: raw.slice(0, 500) }; }
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 598, data: { error: e instanceof Error ? e.message : String(e) } };
  }
}

function rowsFrom(data: Any, keys: string[]) {
  const out: Any[] = [];
  const containers = [data, data?.data].filter((x) => x && typeof x === "object");
  for (const container of containers) {
    for (const key of keys) if (Array.isArray(container?.[key])) out.push(...container[key]);
  }
  return out;
}

function sourceUrl(row: Any) {
  return httpsUrl(row?.url || row?.source_url || row?.sourceUrl || row?.listing_url || row?.item_url);
}

function rowTitle(row: Any, fallback: string) {
  return text(row?.title || row?.name || row?.event_name || row?.lot_title || row?.description).slice(0, 260) || fallback;
}

function compactPayload(row: Any, extra: Any) {
  return {
    ...extra,
    source: text(row?.source || row?.platform || row?.provider),
    source_name: text(row?.source_name || row?.source || row?.platform || extra.source_name),
    verification_status: text(row?.verification_status || extra.verification_status),
    location_text: text(row?.location_label || row?.location || row?.address || row?.city || extra.location_text),
    distance_miles: num(row?.distance_miles),
    event_time: text(row?.event_time || row?.date_label || row?.start_date || row?.end_date),
    current_bid: num(row?.current_bid ?? row?.bid ?? row?.price),
    bid_count: num(row?.bid_count),
    pickup_terms: text(row?.pickup_terms || row?.pickup || row?.removal_terms),
    source_search_bound: row?.source_search_bound === true,
    location_verified: row?.location_verified === true,
    freshness_unproven: row?.freshness_unproven === true,
  };
}

async function cacheSourceRows(db: any, bucket: string, retailer: string, rows: Any[], area: Any, statusText: string) {
  const deduped = new Map<string, Any>();
  for (const row of rows) {
    const url = sourceUrl(row);
    const title = rowTitle(row, retailer + " lead");
    const location = text(row?.location_label || row?.location || row?.address || row?.city);
    const rawKey = `${bucket}|${url || title}|${location}`.toLowerCase();
    const key = `scout-source-v1:${bucket}:${await sha(rawKey)}`;
    if (!deduped.has(key)) deduped.set(key, { row, url, title, key });
  }

  const existing = await db.from("reseller_hunt_cache")
    .select("canonical_key,first_seen_at,seen_count")
    .eq("source_bucket", bucket).limit(1000);
  if (existing.error) throw existing.error;
  const existingMap = new Map((existing.data || []).map((x: Any) => [text(x.canonical_key), x]));
  const now = nowIso();
  const off = await db.from("reseller_hunt_cache").update({ active: false, last_changed_at: now })
    .eq("source_bucket", bucket).eq("active", true);
  if (off.error) throw off.error;

  const upserts: Any[] = [];
  for (const item of deduped.values()) {
    const old = existingMap.get(item.key);
    const row = item.row;
    upserts.push({
      canonical_key: item.key,
      retailer,
      title: item.title,
      upc: "",
      sku: "",
      deal_type: "resale_lead",
      buy_price: null,
      retail_price: null,
      image_url: httpsUrl(row?.image_url || row?.image),
      source_url: item.url,
      source_bucket: bucket,
      payload: compactPayload(row, {
        scheme: "h38_scout_source_ingest_v1",
        source_name: bucket,
        verification_status: text(row?.verification_status || statusText),
        evidence_scope: bucket === "facebook_public" ? "public_location_verified" : "public_search_lead",
        search_area_key: area.area_key,
        search_lat: area.lat,
        search_lon: area.lon,
        search_radius_miles: area.radiusMiles,
        search_location_label: text(area.location_label),
        search_location_evidence: text(area.location_evidence),
        observed_at: now,
        economics_complete: false,
        profit_verified: false,
        truth: bucket === "auctions"
          ? "Auction current bid is evidence only and is never treated as final purchase price. Fees, pickup and resale economics remain unknown until proven."
          : bucket === "facebook_public"
          ? "Only public Facebook rows whose adapter proved location are normalized. Public candidates with unproven locality are excluded."
          : "Public sale lead only. Verify address, date, item details and availability before travel or purchase.",
      }),
      first_seen_at: old?.first_seen_at || now,
      last_seen_at: now,
      last_changed_at: now,
      seen_count: Number(old?.seen_count || 0) + 1,
      active: true,
      penny_sort_at: now,
      penny_date_kind: "observed",
    });
  }

  if (upserts.length) {
    const q = await db.from("reseller_hunt_cache").upsert(upserts, { onConflict: "canonical_key" });
    if (q.error) throw q.error;
  }
  return upserts.length;
}

async function refreshCvs(db: any) {
  const urls = [
    "https://www.cvs.com/shop/grocery/beverages",
    "https://es.cvs.com/shop/grocery/beverages/soda",
    "https://www.cvs.com/shop/grocery/beverages/soda",
  ];
  const fetchText = async (url: string) => {
    let last = "";
    for (const candidate of [`https://r.jina.ai/${url}`, url]) {
      try {
        const r = await fetch(candidate, {
          headers: { "user-agent": "Mozilla/5.0 H38Coupon/3.2 public-retailer-check", accept: "text/html,text/plain,*/*;q=0.8" },
          redirect: "follow",
          signal: AbortSignal.timeout(18000),
        });
        last = `HTTP ${r.status}`;
        if (r.ok) {
          const t = await r.text();
          if (t.length > 200) return t.slice(0, 2200000);
        }
      } catch (e) { last = e instanceof Error ? e.message : String(e); }
    }
    throw new Error(last || "CVS source unavailable");
  };
  try {
    let matched: { sourceUrl: string; shelf: number; window: string } | null = null;
    const warnings: string[] = [];
    for (const sourceUrl of urls) {
      try {
        const raw = await fetchText(sourceUrl);
        const plain = raw.replace(/\r/g, " ").replace(/[*_#`]/g, " ").replace(/\s+/g, " ");
        const marker = /Coca-Cola\s+Soda\s+Soft\s+Drink(?:,?\s*Cans)?[^$]{0,260}(?:12\s*(?:ct|CT|PK)|12\s*oz)/i.exec(plain);
        if (marker?.index === undefined) {
          warnings.push(`${sourceUrl}: product not found`);
          continue;
        }
        const window = plain.slice(marker.index, marker.index + 1400);
        const priceMatch = window.match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/);
        const hasPromo = /Buy\s*2\s*,?\s*Get\s*1\s*Free/i.test(window);
        const shelf = priceMatch ? Number(priceMatch[1]) : null;
        if (hasPromo && Number.isFinite(shelf) && shelf! > 0) {
          matched = { sourceUrl, shelf: shelf!, window };
          break;
        }
        warnings.push(`${sourceUrl}: product found without jointly proven price/promo`);
      } catch (e) {
        warnings.push(`${sourceUrl}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (!matched) return { status: "DEGRADED", refreshed: 0, warnings: warnings.slice(0, 3) };
    const effective = Number((matched.shelf * 2 / 3).toFixed(4));
    const now = nowIso();
    const expiresAt = new Date(Date.now() + 30 * 3600000).toISOString();
    const row = {
      canonical_key: "coupon-v3:cvs:coca-cola-12-pack-buy-2-get-1-free",
      retailer: "CVS",
      title: "Coca-Cola Soda Soft Drink, Cans, 12 ct, 12 oz — Buy 2, Get 1 Free",
      item_name: "Coca-Cola",
      buy_price: effective,
      retail_price: matched.shelf,
      source_url: matched.sourceUrl,
      deal_terms: "Buy 2, Get 1 Free on eligible Coca-Cola 12-packs",
      evidence_scope: "chain_online_verify_local",
      observed_at: now,
      expires_at: expiresAt,
      active: true,
      payload: {
        scheme: "h38_coupon_public_offer_v3_cvs_repair",
        source_type: "official_public_retailer_page",
        source_name: "CVS public beverages",
        source_confidence: "retailer_current",
        locality: "not_verified",
        local_price_verified: false,
        live_checkout_verified: false,
        shelf_price: matched.shelf,
        deal_quantity: 3,
        effective_each: effective,
        deal_price_scope: "effective_each",
        package_size: "12 x 12 oz",
        checked_at: now,
        verification_status: "PUBLIC CVS OFFER · VERIFY LOCAL STORE/ELIGIBILITY",
        notes: "Current CVS public chain offer. Local store price, stock and coupon eligibility are not claimed.",
      },
    };
    const q = await db.from("coupon_public_offer_cache").upsert(row, { onConflict: "canonical_key" });
    if (q.error) throw q.error;
    return { status: "AVAILABLE", refreshed: 1, shelf_price: matched.shelf, effective_each: effective, source_url: matched.sourceUrl };
  } catch (e) {
    return { status: "UNAVAILABLE", refreshed: 0, warning: e instanceof Error ? e.message : String(e) };
  }
}

async function normalizeDealEngine(db: any, nightlyKey: string) {
  const q = await db.from("coupon_watch_rules").select("id")
    .eq("enabled", true).eq("source", "amazon").limit(20);
  if (q.error) throw q.error;
  const ids = (q.data || []).map((x: Any) => text(x.id)).filter(Boolean);
  if (!ids.length) return { skipped: true, reason: "no_enabled_amazon_watch_anchor" };
  try {
    const r = await fetch(`${BASE}/functions/v1/h38-deal-engine-api`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE}`,
        apikey: SERVICE,
        "x-h38-nightly-key": nightlyKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "scheduled_watch_refresh", watch_ids: ids }),
      signal: AbortSignal.timeout(55000),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok && data?.ok === true, status: r.status, refreshed: data?.refreshed || [], error: text(data?.error || data?.detail) };
  } catch (e) {
    return { ok: false, status: 598, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST_REQUIRED" }, 405);
  const db = admin();
  if (!(await authorized(req, db))) return json({ error: "SCOUT_SOURCE_INGEST_AUTH_REQUIRED" }, 401);
  const started = Date.now();
  try {
    const keyQ = await db.from("h38_internal_job_secrets").select("secret_value")
      .eq("name", "penny-nightly").maybeSingle();
    if (keyQ.error || !keyQ.data?.secret_value) throw new Error("NIGHTLY_KEY_UNAVAILABLE");
    const nightlyKey = text(keyQ.data.secret_value);
    const rawArea = await latestSearchArea(db);
    const area = rawArea ? await reverseLocation(rawArea) : null;
    const cvs = await refreshCvs(db);
    const diagnostics: Any[] = [];
    let facebookCount = 0, garageCount = 0, auctionCount = 0, facebookCandidatesExcluded = 0;

    if (area) {
      const [facebook, garage, auctions] = await Promise.all([
        invoke("reseller-facebook-public-v240", { ...area, terms: ["clearance", "tools", "electronics", "garage sale", "estate sale"], max_results: 80 }, 50000),
        invoke("reseller-garage-sales-v308", area, 50000),
        invoke("reseller-auction-search-v230", area, 50000),
      ]);
      const facebookResults = rowsFrom(facebook.data, ["results"]);
      const facebookCandidates = rowsFrom(facebook.data, ["candidates"]);
      const garageRows = rowsFrom(garage.data, ["results", "sales", "events"]);
      const auctionRows = rowsFrom(auctions.data, ["results", "auction_candidates", "candidates", "lots"]);

      diagnostics.push(
        { source: "facebook", ok: facebook.ok, status: facebook.status, result_count: facebookResults.length, candidate_count: facebookCandidates.length, provider_status: text(facebook.data?.provider_status || facebook.data?.status) },
        { source: "garage", ok: garage.ok, status: garage.status, result_count: garageRows.length, provider_status: text(garage.data?.status) },
        { source: "auctions", ok: auctions.ok, status: auctions.status, result_count: auctionRows.length, provider_status: text(auctions.data?.status) },
      );

      if (facebook.ok) {
        const verified = facebookResults.filter((r) => r?.location_verified === true);
        facebookCandidatesExcluded = facebookCandidates.length + Math.max(0, facebookResults.length - verified.length);
        facebookCount = await cacheSourceRows(db, "facebook_public", "Facebook Marketplace", verified, area, "PUBLIC FACEBOOK · LOCATION VERIFIED");
      }
      if (garage.ok) {
        garageCount = await cacheSourceRows(db, "garage_sales", "Garage / Estate Sale", garageRows, area, "PUBLIC SALE LEAD · VERIFY ADDRESS/DATE");
      }
      if (auctions.ok) {
        auctionCount = await cacheSourceRows(db, "auctions", "Auction", auctionRows, area, "AUCTION LEAD · CURRENT BID IS NOT PURCHASE PRICE");
      }
    } else {
      diagnostics.push({ source: "local_sources", ok: false, status: 204, warning: "No prior app store-search area exists; local-source refresh skipped rather than guessing a location." });
    }

    const normalization = await normalizeDealEngine(db, nightlyKey);
    return json({
      ok: true,
      engine: "H38_SCOUT_SOURCE_INGEST_V2",
      searched_area: area ? {
        area_key: area.area_key,
        location_label: text(area.location_label),
        location_evidence: text(area.location_evidence),
        radius_miles: area.radiusMiles,
        area_observed_at: area.area_observed_at,
      } : null,
      cached: { facebook_verified: facebookCount, garage_sales: garageCount, auctions: auctionCount, cvs_offers: cvs.refreshed },
      facebook_candidates_excluded_unproven_locality: facebookCandidatesExcluded,
      cvs,
      diagnostics,
      deal_engine_normalization: normalization,
      elapsed_ms: Date.now() - started,
      truth: "No location is guessed. The latest explicit app store-search area drives local public-source refreshes, with city/ZIP recovered only from stores recorded inside that same area when reverse geocoding is unavailable. Facebook rows enter the shared Deal Engine only when locality is proven by the adapter. Garage/estate and auction rows remain leads with unknown acquisition/resale economics; auction current bid is never stored as buy price. CVS public chain evidence never claims local stock or local eligibility.",
    });
  } catch (e) {
    return json({ error: "H38_SCOUT_SOURCE_INGEST_ERROR", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
