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
const lower = (v: unknown) => text(v).toLowerCase();
const norm = (v: unknown) => lower(v).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const admin = () => createClient(BASE, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const nowIso = () => new Date().toISOString();
const cutoffIso = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

function discountPercent(price: number | null, regular: number | null, raw: Any) {
  const direct = num(raw?.discount_percent ?? raw?.discount_pct);
  if (direct !== null && direct >= 0) return Math.max(0, Math.min(100, direct));
  if (price !== null && regular !== null && regular > price && regular > 0) return ((regular - price) / regular) * 100;
  return null;
}

function effectiveCouponPrice(row: Any) {
  const shelf = num(row.shelf_price);
  if (shelf === null) return null;
  const deductions = ["sale_discount", "store_coupon", "manufacturer_coupon", "rebate", "loyalty_value"]
    .reduce((sum, key) => sum + (num(row[key]) || 0), 0);
  return Math.max(0, shelf - deductions);
}

function baseMatches(candidate: Any, rule: Any) {
  if (!rule.enabled) return false;
  if (rule.product_area && rule.product_area !== "all" && rule.product_area !== candidate.product_area) return false;
  if (text(rule.retailer) && !lower(candidate.retailer).includes(lower(rule.retailer))) return false;
  const query = norm(rule.query_text);
  if (query) {
    const hay = norm([candidate.title, candidate.retailer, candidate.upc, candidate.sku].join(" "));
    const words = query.split(/\s+/).filter((x: string) => x.length > 1);
    const queryMatch = rule.watch_mode === "specific" ? hay.includes(query) : words.every((word: string) => hay.includes(word));
    if (!queryMatch && rule.watch_mode !== "rule") return false;
  }
  return true;
}

function thresholdMatches(candidate: Any, rule: Any) {
  if (!baseMatches(candidate, rule)) return false;
  const maxBuy = num(rule.max_buy_price);
  if (maxBuy !== null && (candidate.price === null || candidate.price > maxBuy)) return false;
  const minDiscount = num(rule.min_discount_percent);
  if (minDiscount !== null && (candidate.discount === null || candidate.discount < minDiscount)) return false;
  const minProfit = num(rule.min_expected_profit);
  if (minProfit !== null && (candidate.profit === null || candidate.profit < minProfit)) return false;
  const minRoi = num(rule.min_roi_percent);
  if (minRoi !== null && (candidate.roi === null || candidate.roi < minRoi)) return false;
  return true;
}

function candidateFromHunt(row: Any) {
  const raw = row.payload && typeof row.payload === "object" ? row.payload : {};
  const price = num(row.buy_price ?? raw.buy_price ?? raw.price);
  const regular = num(row.retail_price ?? raw.retail_price ?? raw.original_price);
  return {
    product_area: /penny/i.test(text(row.deal_type)) ? "penny" : "resale",
    retailer: text(row.retailer || raw.retailer),
    title: text(row.title || raw.title || raw.canonical_title),
    upc: text(row.upc),
    sku: text(row.sku),
    price,
    discount: discountPercent(price, regular, raw),
    profit: null,
    roi: null,
    observed_at: row.last_seen_at || raw.observed_at || null,
  };
}

function candidateFromCoupon(row: Any) {
  const raw = row.payload && typeof row.payload === "object" ? row.payload : {};
  const price = num(row.buy_price ?? raw.effective_each ?? raw.offer_total_price);
  const regular = num(row.retail_price ?? raw.retail_price ?? raw.shelf_price);
  return {
    product_area: "coupon",
    retailer: text(row.retailer),
    title: text(row.title || row.item_name),
    upc: text(raw.upc || raw.barcode),
    sku: text(raw.sku),
    price,
    discount: discountPercent(price, regular, raw),
    profit: null,
    roi: null,
    observed_at: row.observed_at || null,
  };
}

function candidateFromDiscovery(row: Any) {
  const price = num(row.price), regular = num(row.original_price);
  return {
    product_area: "watch",
    retailer: /amazon/i.test(text(row.source_url) + " " + text(row.source)) ? "Amazon" : text(row.source),
    title: text(row.title),
    upc: "",
    sku: "",
    price,
    discount: discountPercent(price, regular, row),
    profit: null,
    roi: null,
    observed_at: row.observed_at || null,
    user_id: text(row.user_id),
  };
}

function candidateFromPrice(row: Any) {
  const price = effectiveCouponPrice(row), regular = num(row.shelf_price);
  return {
    product_area: "coupon",
    retailer: text(row.store),
    title: text(row.item_name),
    upc: text(row.barcode),
    sku: "",
    price,
    discount: discountPercent(price, regular, {}),
    profit: null,
    roi: null,
    observed_at: row.observed_at || null,
    user_id: text(row.user_id),
  };
}

function economicsFromSaved(candidate: Any, saved: Any[]) {
  const titleKey = norm(candidate.title);
  const upc = text(candidate.upc).replace(/\D/g, "");
  const sku = norm(candidate.sku);
  const match = saved.find((row: Any) => {
    const rowUpc = text(row.upc).replace(/\D/g, "");
    const rowSku = norm(row.sku);
    const rowTitle = norm(row.title);
    return (upc && rowUpc && upc === rowUpc) || (sku && rowSku && sku === rowSku) || (titleKey && rowTitle === titleKey);
  });
  if (!match) return candidate;
  const price = candidate.price ?? num(match.buy_price);
  const resale = num(match.expected_resale);
  const fees = num(match.estimated_fees);
  const shipping = num(match.estimated_shipping);
  const other = num(match.other_costs);
  if (price === null || resale === null || fees === null || shipping === null || other === null) return candidate;
  const cost = price + fees + shipping + other;
  if (!(cost > 0)) return candidate;
  const profit = resale - cost;
  return { ...candidate, price, profit: Number(profit.toFixed(2)), roi: Number(((profit / cost) * 100).toFixed(2)) };
}

async function authorize(req: Request, db: any) {
  const supplied = text(req.headers.get("x-h38-nightly-key"));
  if (!supplied) return false;
  const secret = await db.from("h38_internal_job_secrets").select("secret_value").eq("name", "penny-nightly").maybeSingle();
  return !secret.error && !!secret.data?.secret_value && supplied === text(secret.data.secret_value);
}

async function refreshCouponSources() {
  try {
    const hour = new Date().getUTCHours();
    if (hour % 6 !== 0) return { skipped: true, reason: "six_hour_window" };
    const r = await fetch(`${BASE}/functions/v1/h38-coupon-public-refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, "Content-Type": "application/json" },
      body: JSON.stringify({ items: ["Milk", "Dog food", "Laundry detergent", "Brisk Ice tea", "Coca-Cola"] }),
      signal: AbortSignal.timeout(55000),
    });
    const body = await r.json().catch(() => ({}));
    return { skipped: false, ok: r.ok, status: r.status, refreshed: Number(body?.refreshed || 0), diagnostics: body?.diagnostics || [] };
  } catch (e) {
    return { skipped: false, ok: false, status: 598, error: e instanceof Error ? e.message : String(e) };
  }
}

async function refreshWebDiscovery() {
  try {
    const r = await fetch(`${BASE}/functions/v1/h38-coupon-api`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE}`,
        apikey: SERVICE,
        "x-h38-nightly-key": (await admin().from("h38_internal_job_secrets")
          .select("secret_value").eq("name", "penny-nightly").maybeSingle()).data?.secret_value || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "scheduled_web_discover" }),
      signal: AbortSignal.timeout(35000),
    });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok && body?.ok === true, status: r.status,
      refreshed: body?.refreshed || [], due_count: Number(body?.due_count || 0),
      error: text(body?.error || body?.detail) };
  } catch (e) {
    return { ok: false, status: 598, refreshed: [], error: e instanceof Error ? e.message : String(e) };
  }
}

async function normalizeWatchDiscoveries(watchIds: string[]) {
  if (!watchIds.length) return { skipped: true, reason: "no_new_discoveries" };
  try {
    const secret = await admin().from("h38_internal_job_secrets")
      .select("secret_value").eq("name", "penny-nightly").maybeSingle();
    if (secret.error || !secret.data?.secret_value) throw new Error("WORKER_SECRET_UNAVAILABLE");
    const r = await fetch(`${BASE}/functions/v1/h38-deal-engine-api`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE,
        "x-h38-nightly-key": text(secret.data.secret_value), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "scheduled_watch_refresh", watch_ids: watchIds.slice(0, 20) }),
      signal: AbortSignal.timeout(45000),
    });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok && body?.ok === true, status: r.status, refreshed: body?.refreshed || [],
      error: text(body?.error || body?.detail) };
  } catch (e) {
    return { ok: false, status: 598, refreshed: [], error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST_REQUIRED" }, 405);
  const db = admin();
  if (!(await authorize(req, db))) return json({ error: "WORKER_AUTH_REQUIRED" }, 401);

  const started = Date.now();
  try {
    const now = nowIso();
    const sevenDaysAgo = cutoffIso(7);
    const fourteenDaysAgo = cutoffIso(14);

    const stale = await db.from("deal_engine_observations")
      .update({ active: false })
      .eq("active", true)
      .lt("observed_at", sevenDaysAgo)
      .select("canonical_key");
    if (stale.error) throw stale.error;

    const expired = await db.from("deal_engine_observations")
      .update({ active: false })
      .eq("active", true)
      .not("expires_at", "is", null)
      .lte("expires_at", now)
      .select("canonical_key");
    if (expired.error) throw expired.error;

    const expiredOffers = await db.from("coupon_public_offer_cache")
      .update({ active: false })
      .eq("active", true)
      .not("expires_at", "is", null)
      .lte("expires_at", now)
      .select("canonical_key");
    if (expiredOffers.error) throw expiredOffers.error;

    const [watchQ, memberQ, huntQ, couponQ, discoveryQ, priceQ, savedQ, legacyQ] = await Promise.all([
      db.from("deal_engine_watch_rules").select("*").eq("enabled", true),
      db.from("coupon_household_members").select("household_id,user_id"),
      db.from("reseller_hunt_cache").select("canonical_key,retailer,title,upc,sku,deal_type,buy_price,retail_price,last_seen_at,payload").eq("active", true).gte("last_seen_at", sevenDaysAgo).limit(4000),
      db.from("coupon_public_offer_cache").select("*").eq("active", true).or(`expires_at.is.null,expires_at.gt.${now}`).limit(1500),
      db.from("coupon_watch_discovery_cache").select("*").gt("expires_at", now).limit(2000),
      db.from("coupon_price_observations").select("*").gte("observed_at", fourteenDaysAgo).limit(2000),
      db.from("reseller_deals").select("created_by,title,upc,sku,buy_price,expected_resale,estimated_fees,estimated_shipping,other_costs,status,updated_at").limit(2000),
      db.from("coupon_watch_rules").select("id,source").eq("enabled", true),
    ]);
    for (const q of [watchQ, memberQ, huntQ, couponQ, discoveryQ, priceQ, savedQ, legacyQ]) if (q.error) throw q.error;
    const amazonDiscoveryIds = new Set((legacyQ.data || []).filter((row: Any) => lower(row.source) === "amazon").map((row: Any) => text(row.id)));

    const membersByHousehold = new Map<string, Set<string>>();
    for (const row of memberQ.data || []) {
      const id = text(row.household_id), uid = text(row.user_id);
      if (!id || !uid) continue;
      if (!membersByHousehold.has(id)) membersByHousehold.set(id, new Set());
      membersByHousehold.get(id)!.add(uid);
    }

    const sharedCandidates = [
      ...(huntQ.data || []).map(candidateFromHunt),
      ...(couponQ.data || []).map(candidateFromCoupon),
    ];
    const discovery = (discoveryQ.data || []).map(candidateFromDiscovery);
    const prices = (priceQ.data || []).map(candidateFromPrice);
    const saved = savedQ.data || [];

    let checked = 0, hits = 0, economicsBlocked = 0;
    for (const rule of watchQ.data || []) {
      const householdId = text(rule.household_id);
      const members = membersByHousehold.get(householdId) || new Set<string>();
      const householdSaved = saved.filter((x: Any) => members.has(text(x.created_by)));
      const candidates = [
        ...sharedCandidates,
        ...discovery.filter((x: Any) => members.has(text(x.user_id))),
        ...prices.filter((x: Any) => members.has(text(x.user_id))),
      ].map((x: Any) => economicsFromSaved(x, householdSaved));

      const base = candidates.filter((candidate: Any) => baseMatches(candidate, rule));
      const matched = base.filter((candidate: Any) => thresholdMatches(candidate, rule));
      const needsEconomics = num(rule.min_expected_profit) !== null || num(rule.min_roi_percent) !== null;
      const missingEconomics = needsEconomics ? base.filter((x: Any) => x.profit === null || x.roi === null).length : 0;
      let status = "No current matches";
      if (matched.length) {
        const best = [...matched].sort((a: Any, b: Any) => (b.discount || 0) - (a.discount || 0))[0];
        status = `${matched.length} current match${matched.length === 1 ? "" : "es"}${best?.title ? ` · ${text(best.title).slice(0, 90)}` : ""}`;
        hits += matched.length;
      } else if (missingEconomics) {
        status = `No current match with complete profit/ROI evidence · ${missingEconomics} candidate${missingEconomics === 1 ? "" : "s"} need sold comps/costs`;
        economicsBlocked += missingEconomics;
      }

      const update = await db.from("deal_engine_watch_rules").update({
        last_checked_at: now,
        last_status: status,
        updated_at: now,
      }).eq("id", rule.id);
      if (update.error) throw update.error;
      if (rule.legacy_coupon_watch_id && !amazonDiscoveryIds.has(text(rule.legacy_coupon_watch_id))) {
        const mirror = await db.from("coupon_watch_rules").update({ last_checked_at: now, last_status: status, updated_at: now })
          .eq("id", rule.legacy_coupon_watch_id);
        if (mirror.error) throw mirror.error;
      }
      checked++;
    }

    const stateQ = await db.from("deal_engine_state").select("household_id,warnings,last_refresh_at");
    if (stateQ.error) throw stateQ.error;
    for (const state of stateQ.data || []) {
      const obs = await db.from("deal_engine_observations").select("product_area,retailer", { count: "exact" })
        .eq("household_id", state.household_id).eq("active", true).limit(4000);
      if (obs.error) throw obs.error;
      const areas: Record<string, number> = {}, retailers: Record<string, number> = {};
      for (const row of obs.data || []) {
        areas[text(row.product_area) || "unknown"] = (areas[text(row.product_area) || "unknown"] || 0) + 1;
        retailers[text(row.retailer) || "Unknown"] = (retailers[text(row.retailer) || "Unknown"] || 0) + 1;
      }
      const stateUpdate = await db.from("deal_engine_state").update({
        observation_count: obs.count || 0,
        source_counts: { areas, retailers },
        updated_at: now,
      }).eq("household_id", state.household_id);
      if (stateUpdate.error) throw stateUpdate.error;
    }

    const couponRefresh = await refreshCouponSources();
    const webDiscovery = await refreshWebDiscovery();
    const pendingDiscoveryIds = (discoveryQ.data || []).filter((row: Any) => {
      const state = (stateQ.data || []).find((item: Any) =>
        membersByHousehold.get(text(item.household_id))?.has(text(row.user_id)));
      return !state?.last_refresh_at || Date.parse(text(row.observed_at)) > Date.parse(text(state.last_refresh_at));
    }).map((row: Any) => text(row.watch_id));
    const discoveredNow = (webDiscovery.refreshed || []).map((row: Any) => text(row.id));
    const normalizeIds = [...new Set([...pendingDiscoveryIds, ...discoveredNow])].filter(Boolean);
    const normalization = await normalizeWatchDiscoveries(normalizeIds);
    return json({
      ok: true,
      engine: "H38_DEAL_ENGINE_WORKER_V1",
      checked_at: now,
      stale_deactivated: stale.data?.length || 0,
      expired_deactivated: expired.data?.length || 0,
      expired_coupon_offers: expiredOffers.data?.length || 0,
      watches_checked: checked,
      watch_hits: hits,
      economics_blocked_candidates: economicsBlocked,
      source_candidates: {
        hunt: huntQ.data?.length || 0,
        coupon: couponQ.data?.length || 0,
        discovery: discoveryQ.data?.length || 0,
        household_prices: priceQ.data?.length || 0,
      },
      coupon_refresh: couponRefresh,
      web_discovery: webDiscovery,
      watch_normalization: normalization,
      elapsed_ms: Date.now() - started,
      truth: "Watch hits require current source evidence and all configured thresholds. Profit/ROI watches never pass when sold comps or costs are missing.",
    });
  } catch (e) {
    return json({ error: "H38_DEAL_ENGINE_WORKER_ERROR", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
