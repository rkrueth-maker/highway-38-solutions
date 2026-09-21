import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const text = (v: unknown) => String(v ?? "").trim();
const lower = (v: unknown) => text(v).toLowerCase();
const norm = (v: unknown) => lower(v).replace(/[^a-z0-9]+/g, " ").trim();
const n = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
const iso = (v: unknown, fallback = new Date().toISOString()) => {
  const d = new Date(String(v || ""));
  return Number.isFinite(d.getTime()) ? d.toISOString() : fallback;
};
function dbError(label: string, e: any) {
  const detail = text(e?.message || e?.details || e?.hint || e?.code || "");
  let raw = "";
  try { raw = JSON.stringify(e); } catch {}
  return new Error(label + ": " + (detail || raw || String(e)));
}
const httpsUrl = (v: unknown) => /^https:\/\//i.test(text(v)) ? text(v) : "";
const tokenWords = (v: unknown) => norm(v).split(/\s+/).filter(x => x.length > 1);

function numberFrom(...values: unknown[]) {
  for (const value of values) {
    const x = n(value);
    if (x !== null) return x;
  }
  return null;
}

function confidenceScore(raw: any, retailer = "", source = "") {
  const direct = numberFrom(
    raw?.source_confidence_score,
    raw?.confidence_score,
    raw?.identity_confidence_score,
  );
  if (direct !== null) return clamp(direct <= 1 ? direct * 100 : direct);
  const label = lower(raw?.source_confidence || raw?.confidence || raw?.verification_status);
  if (/official|verified|high/.test(label)) return 92;
  if (/medium|public|saved/.test(label)) return 72;
  if (/low|unverified|search/.test(label)) return 52;
  if (/walmart/.test(lower(retailer)) && /official/.test(lower(source))) return 93;
  return 62;
}

function freshnessScore(observedAt: string) {
  const ageHours = Math.max(0, (Date.now() - Date.parse(observedAt)) / 3600000);
  if (ageHours <= 12) return 25;
  if (ageHours <= 24) return 22;
  if (ageHours <= 48) return 18;
  if (ageHours <= 96) return 12;
  if (ageHours <= 168) return 7;
  return 2;
}

function discountPercent(price: number | null, regular: number | null, raw: any) {
  const direct = numberFrom(raw?.discount_percent, raw?.discount_pct);
  if (direct !== null && direct >= 0) return Number(clamp(direct).toFixed(2));
  if (price !== null && regular !== null && regular > price && regular > 0) {
    return Number((((regular - price) / regular) * 100).toFixed(2));
  }
  return null;
}

function economics(args: {
  price: number | null;
  expectedResale: number | null;
  fees: number | null;
  shipping: number | null;
  travel: number | null;
  other: number | null;
}) {
  const { price, expectedResale, fees, shipping, travel, other } = args;
  if (price === null || expectedResale === null) {
    return { estimatedProfit: null, roiPercent: null, costComplete: false };
  }
  const extras = [fees, shipping, travel, other];
  if (extras.some(x => x === null)) {
    return { estimatedProfit: null, roiPercent: null, costComplete: false };
  }
  const cost = price + (fees || 0) + (shipping || 0) + (travel || 0) + (other || 0);
  if (!(cost > 0)) return { estimatedProfit: null, roiPercent: null, costComplete: false };
  const profit = expectedResale - cost;
  return {
    estimatedProfit: Number(profit.toFixed(2)),
    roiPercent: Number(((profit / cost) * 100).toFixed(2)),
    costComplete: true,
  };
}

function opportunityScore(input: {
  observedAt: string;
  confidence: number;
  discount: number | null;
  profit: number | null;
  roi: number | null;
  priceKnown: boolean;
}) {
  const fresh = freshnessScore(input.observedAt);
  const confidence = clamp(input.confidence) * .25;
  const savings = input.discount === null ? 0 : clamp(input.discount) * .25;
  let economics = 0;
  if (input.profit !== null && input.roi !== null) {
    const profitPart = clamp(input.profit / 4, 0, 12.5);
    const roiPart = clamp(input.roi / 8, 0, 12.5);
    economics = profitPart + roiPart;
  }
  const evidencePenalty = input.priceKnown ? 0 : 4;
  return Number(clamp(fresh + confidence + savings + economics - evidencePenalty).toFixed(1));
}

function sourceTruth(productArea: string, sourceKind: string, scope: string, raw: any) {
  const explicit = text(raw?.verification_status || raw?.evidence_status);
  if (explicit) return explicit.toUpperCase();
  if (productArea === "watch") return "WEB SEARCH · VERIFY";
  if (/store_specific|local_verified/.test(lower(scope))) return "LOCAL EVIDENCE";
  if (/chain_observed|chain_or_online/.test(lower(scope))) return "CHAIN EVIDENCE · VERIFY LOCAL";
  if (productArea === "coupon") return "PUBLIC OFFER · VERIFY ELIGIBILITY";
  if (productArea === "penny") return "PENNY LEAD · VERIFY REGISTER";
  if (/official/.test(lower(sourceKind))) return "OFFICIAL PUBLIC EVIDENCE";
  return "VERIFY BEFORE BUYING";
}

async function authenticatedUserId(sb: any, token: string) {
  try {
    const claims = await sb.auth.getClaims(token);
    const sub = text(claims?.data?.claims?.sub);
    if (!claims?.error && sub) return sub;
  } catch {}
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data: { user }, error } = await sb.auth.getUser(token);
      if (!error && user?.id) return String(user.id);
    } catch {}
    if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 150));
  }
  return "";
}

async function contextFor(sb: any, admin: any, userId: string) {
  const entitlements = await sb.from("h38_product_entitlements")
    .select("product_key,active,expires_at").eq("user_id", userId).eq("active", true);
  const now = Date.now();
  const allowed = new Set((entitlements.data || [])
    .filter((x: any) => !x.expires_at || Date.parse(x.expires_at) > now)
    .map((x: any) => String(x.product_key)));
  if (![..."penny resale coupon".split(" ")].some(x => allowed.has(x))) {
    const error: any = new Error("DEAL_ENGINE_PRODUCT_LOCKED");
    error.status = 403;
    throw error;
  }

  let membership = await admin.from("coupon_household_members")
    .select("household_id").eq("user_id", userId).limit(1).maybeSingle();
  if (membership.error) throw membership.error;
  let householdId = text(membership.data?.household_id);

  if (!householdId) {
    const slug = "h38-deals-" + userId.toLowerCase();
    const household = await admin.from("coupon_households").upsert({
      slug,
      name: "H38 Deals",
      created_by: userId,
    }, { onConflict: "slug" }).select("id").single();
    if (household.error) throw household.error;
    householdId = text(household.data?.id);
    if (!householdId) throw new Error("DEAL_ENGINE_HOUSEHOLD_CREATE_FAILED");
    const member = await admin.from("coupon_household_members").upsert({
      household_id: householdId,
      user_id: userId,
      role: "owner",
    }, { onConflict: "household_id,user_id" });
    if (member.error) throw member.error;
  }

  const members = await admin.from("coupon_household_members")
    .select("user_id").eq("household_id", householdId);
  if (members.error) throw members.error;
  return {
    householdId,
    entitlements: allowed,
    memberIds: (members.data || []).map((x: any) => String(x.user_id)).filter(Boolean),
  };
}

function savedDealIndex(rows: any[]) {
  const index = new Map<string, any>();
  for (const row of rows || []) {
    const keys = [
      text(row.upc) ? "u:" + text(row.upc).replace(/\D/g, "") : "",
      text(row.sku) ? "s:" + norm(row.sku) : "",
      text(row.title) ? "t:" + norm(row.title) : "",
    ].filter(Boolean);
    for (const key of keys) if (!index.has(key)) index.set(key, row);
  }
  return index;
}

function matchingSaved(row: any, index: Map<string, any>) {
  const keys = [
    text(row?.upc) ? "u:" + text(row.upc).replace(/\D/g, "") : "",
    text(row?.sku) ? "s:" + norm(row.sku) : "",
    text(row?.title) ? "t:" + norm(row.title) : "",
  ].filter(Boolean);
  for (const key of keys) if (index.has(key)) return index.get(key);
  return null;
}

function normalizeHunt(row: any, householdId: string, savedIndex: Map<string, any>) {
  const raw = row.payload && typeof row.payload === "object" ? row.payload : {};
  const saved = matchingSaved(row, savedIndex);
  const title = text(row.title || raw.title || raw.canonical_title) || "Untitled deal";
  const retailer = text(row.retailer || raw.retailer);
  const price = numberFrom(row.buy_price, raw.buy_price, raw.price);
  const regular = numberFrom(row.retail_price, raw.retail_price, raw.original_price);
  const expectedResale = numberFrom(saved?.expected_resale, raw.expected_resale);
  const fees = saved ? numberFrom(saved.estimated_fees, 0) : numberFrom(raw.estimated_fees);
  const shipping = saved ? numberFrom(saved.estimated_shipping, 0) : numberFrom(raw.estimated_shipping);
  const travel = saved ? numberFrom(saved.other_costs, 0) : numberFrom(raw.estimated_travel, raw.travel_cost);
  const other = saved ? 0 : numberFrom(raw.other_costs);
  const economicsResult = economics({ price, expectedResale, fees, shipping, travel, other });
  const discount = discountPercent(price, regular, raw);
  const observedAt = iso(row.last_seen_at || raw.observed_at || row.penny_sort_at);
  const sourceKind = text(raw.source_name || row.source_bucket || "shared_cache");
  const sourceScope = text(raw.deal_scope || raw.evidence_scope || row.source_bucket || "");
  const confidence = confidenceScore(raw, retailer, sourceKind);
  const productArea = /penny/i.test(text(row.deal_type)) ? "penny" : "resale";
  const score = opportunityScore({
    observedAt,
    confidence,
    discount,
    profit: economicsResult.estimatedProfit,
    roi: economicsResult.roiPercent,
    priceKnown: price !== null,
  });
  return {
    household_id: householdId,
    canonical_key: "hunt:" + text(row.canonical_key),
    product_area: productArea,
    source_name: sourceKind,
    source_kind: text(row.source_bucket || "reseller_hunt_cache"),
    source_scope: sourceScope,
    retailer,
    title,
    upc: text(row.upc),
    sku: text(row.sku),
    image_url: httpsUrl(row.image_url || raw.image_url),
    source_url: httpsUrl(row.source_url || raw.source_url || raw.source_item_url),
    observed_price: price,
    regular_price: regular,
    expected_resale: expectedResale,
    estimated_fees: fees,
    estimated_shipping: shipping,
    estimated_travel: travel,
    other_costs: other,
    discount_percent: discount,
    estimated_profit: economicsResult.estimatedProfit,
    roi_percent: economicsResult.roiPercent,
    confidence_score: confidence,
    opportunity_score: score,
    evidence_status: sourceTruth(productArea, sourceKind, sourceScope, raw),
    availability_label: text(raw.availability_label || raw.truth || ""),
    location_text: text(raw.location_text || raw.store_name || ""),
    distance_miles: numberFrom(raw.distance_miles),
    observed_at: observedAt,
    first_seen_at: iso(row.first_seen_at || observedAt),
    last_changed_at: iso(row.last_changed_at || observedAt),
    expires_at: null,
    active: true,
    payload: { ...raw, engine_cost_complete: economicsResult.costComplete },
  };
}

function normalizeCoupon(row: any, householdId: string) {
  const raw = row.payload && typeof row.payload === "object" ? row.payload : {};
  const price = numberFrom(row.buy_price, raw.effective_each, raw.offer_total_price);
  const regular = numberFrom(row.retail_price, raw.retail_price, raw.shelf_price);
  const discount = discountPercent(price, regular, raw);
  const observedAt = iso(row.observed_at);
  const retailer = text(row.retailer);
  const confidence = confidenceScore(raw, retailer, "coupon_public_offer_cache");
  const score = opportunityScore({
    observedAt, confidence, discount, profit: null, roi: null, priceKnown: price !== null,
  });
  return {
    household_id: householdId,
    canonical_key: "coupon:" + text(row.canonical_key),
    product_area: "coupon",
    source_name: text(raw.source_name || retailer || "Public retailer offer"),
    source_kind: "coupon_public_offer_cache",
    source_scope: text(row.evidence_scope || raw.evidence_scope),
    retailer,
    title: text(row.title || row.item_name) || "Coupon offer",
    upc: text(raw.upc || raw.barcode),
    sku: text(raw.sku),
    image_url: httpsUrl(raw.image_url),
    source_url: httpsUrl(row.source_url),
    observed_price: price,
    regular_price: regular,
    expected_resale: null,
    estimated_fees: null,
    estimated_shipping: null,
    estimated_travel: null,
    other_costs: null,
    discount_percent: discount,
    estimated_profit: null,
    roi_percent: null,
    confidence_score: confidence,
    opportunity_score: score,
    evidence_status: sourceTruth("coupon", "coupon_public_offer_cache", row.evidence_scope, raw),
    availability_label: text(row.deal_terms || raw.availability_label),
    location_text: "",
    distance_miles: null,
    observed_at: observedAt,
    first_seen_at: observedAt,
    last_changed_at: observedAt,
    expires_at: row.expires_at ? iso(row.expires_at) : null,
    active: true,
    payload: raw,
  };
}

function normalizeDiscovery(row: any, householdId: string) {
  const price = n(row.price);
  const regular = n(row.original_price);
  const discount = discountPercent(price, regular, row);
  const observedAt = iso(row.observed_at);
  const retailer = /amazon/i.test(text(row.source_url) + " " + text(row.source)) ? "Amazon" : text(row.source);
  const confidence = /amazon_web/i.test(lower(row.source)) ? 62 : 55;
  const score = opportunityScore({
    observedAt, confidence, discount, profit: null, roi: null, priceKnown: price !== null,
  });
  return {
    household_id: householdId,
    canonical_key: "watch:" + text(row.id),
    product_area: "watch",
    source_name: text(row.source || "web discovery"),
    source_kind: "watch_discovery",
    source_scope: "public_web",
    retailer,
    title: text(row.title) || "Watch discovery",
    upc: "",
    sku: "",
    image_url: "",
    source_url: httpsUrl(row.source_url),
    observed_price: price,
    regular_price: regular,
    expected_resale: null,
    estimated_fees: null,
    estimated_shipping: null,
    estimated_travel: null,
    other_costs: null,
    discount_percent: discount,
    estimated_profit: null,
    roi_percent: null,
    confidence_score: confidence,
    opportunity_score: score,
    evidence_status: "WEB SEARCH · VERIFY ON RETAILER",
    availability_label: text(row.signal || row.snippet),
    location_text: "",
    distance_miles: null,
    observed_at: observedAt,
    first_seen_at: observedAt,
    last_changed_at: observedAt,
    expires_at: row.expires_at ? iso(row.expires_at) : null,
    active: true,
    payload: {
      watch_id: row.watch_id,
      snippet: text(row.snippet),
      signal: text(row.signal),
      result_kind: text(row.result_kind),
    },
  };
}

function effectiveCouponPrice(row: any) {
  const shelf = numberFrom(row.shelf_price) || 0;
  const deductions = ["sale_discount", "store_coupon", "manufacturer_coupon", "rebate", "loyalty_value"]
    .map(k => numberFrom(row[k]) || 0).reduce((a, b) => a + b, 0);
  return Math.max(0, shelf - deductions);
}

function normalizePriceObservation(row: any, householdId: string) {
  const shelf = numberFrom(row.shelf_price);
  const price = shelf === null ? null : Number(effectiveCouponPrice(row).toFixed(2));
  const discount = discountPercent(price, shelf, {});
  const observedAt = iso(row.observed_at);
  const confidence = confidenceScore({ confidence: row.confidence }, row.store, "saved_price");
  return {
    household_id: householdId,
    canonical_key: "price:" + norm(row.store) + ":" + (text(row.barcode) || norm(row.item_name)),
    product_area: "coupon",
    source_name: "Saved price observation",
    source_kind: "coupon_price_observation",
    source_scope: "household_observed",
    retailer: text(row.store),
    title: text(row.item_name),
    upc: text(row.barcode),
    sku: "",
    image_url: "",
    source_url: "",
    observed_price: price,
    regular_price: shelf,
    expected_resale: null,
    estimated_fees: null,
    estimated_shipping: null,
    estimated_travel: null,
    other_costs: null,
    discount_percent: discount,
    estimated_profit: null,
    roi_percent: null,
    confidence_score: confidence,
    opportunity_score: opportunityScore({
      observedAt, confidence, discount, profit: null, roi: null, priceKnown: price !== null,
    }),
    evidence_status: "HOUSEHOLD PRICE OBSERVATION",
    availability_label: text(row.source_note),
    location_text: text(row.store),
    distance_miles: numberFrom(row.distance_miles),
    observed_at: observedAt,
    first_seen_at: observedAt,
    last_changed_at: observedAt,
    expires_at: null,
    active: true,
    payload: {
      brand: text(row.brand),
      required_qty: numberFrom(row.required_qty),
      package_qty: numberFrom(row.package_qty),
      unit_label: text(row.unit_label),
    },
  };
}

function changedEnough(old: any, next: any) {
  if (!old) return true;
  const keys = [
    "observed_price", "regular_price", "expected_resale", "discount_percent",
    "estimated_profit", "roi_percent", "confidence_score", "opportunity_score",
  ];
  return keys.some(k => {
    const a = n(old[k]), b = n(next[k]);
    if (a === null && b === null) return false;
    if (a === null || b === null) return true;
    return Math.abs(a - b) > .009;
  });
}

function sourceWarnings(rows: any[]) {
  const warnings: string[] = [];
  const couponRetailers = new Set(rows.filter(x => x.product_area === "coupon").map(x => lower(x.retailer)));
  for (const retailer of ["target", "cvs"]) {
    if (![...couponRetailers].some(x => x.includes(retailer))) {
      warnings.push(retailer.toUpperCase() + ": no current normalized public offer coverage.");
    }
  }
  const facebook = rows.filter(x => /facebook/.test(lower(x.source_name + " " + x.source_kind + " " + x.source_url)));
  if (!facebook.length) warnings.push("Facebook Marketplace: public index currently has no normalized opportunities.");
  const rays = rows.filter(x => /ray.?s|rays_list/.test(lower(x.source_name + " " + x.source_kind + " " + JSON.stringify(x.payload || {}))));
  if (rays.length) {
    const newest = Math.max(...rays.map(x => Date.parse(x.observed_at) || 0));
    if (Date.now() - newest > 48 * 3600000) warnings.push("Ray's List / Menards: current normalized evidence is stale; verify before travel.");
  } else {
    warnings.push("Ray's List / Menards: no current normalized Ray's List feed.");
  }
  return warnings;
}

function countsFor(rows: any[]) {
  const areas: Record<string, number> = {};
  const retailers: Record<string, number> = {};
  for (const row of rows) {
    areas[row.product_area] = (areas[row.product_area] || 0) + 1;
    const r = text(row.retailer) || "Unknown";
    retailers[r] = (retailers[r] || 0) + 1;
  }
  return { areas, retailers };
}

async function refreshEngine(admin: any, ctx: any, userId: string) {
  const nowIso = new Date().toISOString();
  const memberIds = ctx.memberIds.length ? ctx.memberIds : [userId];
  const [hunt, coupon, discoveries, prices, deals, existing] = await Promise.all([
    admin.from("reseller_hunt_cache").select("*").eq("active", true).limit(2500),
    admin.from("coupon_public_offer_cache").select("*").eq("active", true).or(`expires_at.is.null,expires_at.gt.${nowIso}`).limit(1000),
    admin.from("coupon_watch_discovery_cache").select("*").in("user_id", memberIds).gt("expires_at", nowIso).limit(1000),
    admin.from("coupon_price_observations").select("*").in("user_id", memberIds).order("observed_at", { ascending: false }).limit(1000),
    admin.from("reseller_deals").select("*").in("created_by", memberIds).order("updated_at", { ascending: false }).limit(1000),
    admin.from("deal_engine_observations").select("*").eq("household_id", ctx.householdId).limit(4000),
  ]);
  const reads = [
    ["hunt", hunt], ["coupon", coupon], ["discoveries", discoveries],
    ["prices", prices], ["deals", deals], ["existing", existing],
  ] as const;
  for (const [label, q] of reads) {
    if (q.error) throw dbError("REFRESH_READ_" + label.toUpperCase(), q.error);
  }

  const savedIndex = savedDealIndex(deals.data || []);
  const rows: any[] = [];
  rows.push(...(hunt.data || []).map((x: any) => normalizeHunt(x, ctx.householdId, savedIndex)));
  rows.push(...(coupon.data || []).map((x: any) => normalizeCoupon(x, ctx.householdId)));
  rows.push(...(discoveries.data || []).map((x: any) => normalizeDiscovery(x, ctx.householdId)));

  const latestPrice = new Map<string, any>();
  for (const row of prices.data || []) {
    const key = norm(row.store) + "|" + (text(row.barcode) || norm(row.item_name));
    if (!latestPrice.has(key)) latestPrice.set(key, row);
  }
  rows.push(...[...latestPrice.values()].map(x => normalizePriceObservation(x, ctx.householdId)));

  const byKey = new Map<string, any>();
  for (const row of rows) {
    if (!row.canonical_key || !row.title) continue;
    const old = byKey.get(row.canonical_key);
    if (!old || Date.parse(row.observed_at) > Date.parse(old.observed_at)) byKey.set(row.canonical_key, row);
  }
  const normalized = [...byKey.values()];
  const oldMap = new Map((existing.data || []).map((x: any) => [String(x.canonical_key), x]));

  const off = await admin.from("deal_engine_observations")
    .update({ active: false })
    .eq("household_id", ctx.householdId)
    .eq("active", true);
  if (off.error) throw dbError("REFRESH_DEACTIVATE", off.error);

  for (let i = 0; i < normalized.length; i += 400) {
    const q = await admin.from("deal_engine_observations")
      .upsert(normalized.slice(i, i + 400), { onConflict: "household_id,canonical_key" });
    if (q.error) throw dbError("REFRESH_OBSERVATION_UPSERT", q.error);
  }

  const history = normalized.filter(row =>
    (row.observed_price !== null || row.expected_resale !== null || row.discount_percent !== null) &&
    changedEnough(oldMap.get(row.canonical_key), row)
  ).map(row => ({
    household_id: ctx.householdId,
    canonical_key: row.canonical_key,
    retailer: row.retailer,
    title: row.title,
    source_name: row.source_name,
    observed_price: row.observed_price,
    regular_price: row.regular_price,
    expected_resale: row.expected_resale,
    discount_percent: row.discount_percent,
    estimated_profit: row.estimated_profit,
    roi_percent: row.roi_percent,
    confidence_score: row.confidence_score,
    opportunity_score: row.opportunity_score,
    observed_at: row.observed_at,
    payload: { evidence_status: row.evidence_status, source_url: row.source_url },
  }));
  for (let i = 0; i < history.length; i += 400) {
    const q = await admin.from("deal_engine_price_history").insert(history.slice(i, i + 400));
    if (q.error) throw dbError("REFRESH_HISTORY_INSERT", q.error);
  }

  const warnings = sourceWarnings(normalized);
  const sourceCounts = countsFor(normalized);
  const state = await admin.from("deal_engine_state").upsert({
    household_id: ctx.householdId,
    last_refresh_at: nowIso,
    last_refresh_by: userId,
    observation_count: normalized.length,
    source_counts: sourceCounts,
    warnings,
    updated_at: nowIso,
  }, { onConflict: "household_id" });
  if (state.error) throw dbError("REFRESH_STATE_UPSERT", state.error);

  return {
    refreshed_at: nowIso,
    observation_count: normalized.length,
    history_added: history.length,
    source_counts: sourceCounts,
    warnings,
  };
}

async function importLegacyWatches(admin: any, ctx: any) {
  const members = ctx.memberIds;
  if (!members.length) return { imported: 0 };
  const [existing, reseller, coupon] = await Promise.all([
    admin.from("deal_engine_watch_rules").select("*").eq("household_id", ctx.householdId),
    admin.from("reseller_watch_rules").select("*").in("created_by", members),
    admin.from("coupon_watch_rules").select("*").in("user_id", members),
  ]);
  if (existing.error || reseller.error || coupon.error) throw existing.error || reseller.error || coupon.error;
  const resaleIds = new Set((existing.data || []).map((x: any) => text(x.legacy_reseller_watch_id)).filter(Boolean));
  const couponIds = new Set((existing.data || []).map((x: any) => text(x.legacy_coupon_watch_id)).filter(Boolean));
  const add: any[] = [];
  for (const row of reseller.data || []) {
    if (resaleIds.has(String(row.id))) continue;
    add.push({
      household_id: ctx.householdId,
      created_by: row.created_by,
      query_text: text(row.query_text),
      retailer: text(row.retailer),
      product_area: "resale",
      watch_mode: (Number(row.max_buy_price) > 0 || Number(row.min_expected_profit) > 0 || Number(row.min_roi_percent) > 0) ? "rule" : "keyword",
      source_ref: "",
      source_url: "",
      last_status: "",
      max_buy_price: Number(row.max_buy_price) > 0 ? Number(row.max_buy_price) : null,
      min_expected_profit: Number(row.min_expected_profit) > 0 ? Number(row.min_expected_profit) : null,
      min_roi_percent: Number(row.min_roi_percent) > 0 ? Number(row.min_roi_percent) : null,
      enabled: !!row.enabled,
      legacy_reseller_watch_id: row.id,
    });
  }
  for (const row of coupon.data || []) {
    if (couponIds.has(String(row.id))) continue;
    add.push({
      household_id: ctx.householdId,
      created_by: row.user_id,
      query_text: text(row.item_name) || (row.watch_mode === "discovery" ? "Amazon deals" : "Coupon watch"),
      retailer: lower(row.source) === "amazon" ? "Amazon" : "",
      product_area: lower(row.source) === "amazon" ? "watch" : "coupon",
      watch_mode: row.watch_mode === "specific" ? "specific" : "category",
      source_ref: text(row.source_ref),
      source_url: text(row.source_url),
      max_buy_price: n(row.target_effective_price),
      min_discount_percent: n(row.target_discount_percent),
      enabled: !!row.enabled,
      last_checked_at: row.last_checked_at,
      last_status: text(row.last_status),
      legacy_coupon_watch_id: row.id,
    });
  }
  if (add.length) {
    const q = await admin.from("deal_engine_watch_rules").insert(add);
    if (q.error) throw dbError("WATCH_IMPORT", q.error);
  }
  return { imported: add.length };
}

function watchMatches(row: any, rule: any) {
  if (!rule.enabled) return false;
  if (rule.product_area && rule.product_area !== "all" && rule.product_area !== row.product_area) return false;
  if (text(rule.retailer) && !lower(row.retailer).includes(lower(rule.retailer))) return false;
  const q = norm(rule.query_text);
  if (q) {
    const hay = norm([row.title, row.retailer, row.upc, row.sku].join(" "));
    const words = tokenWords(q);
    const match = rule.watch_mode === "specific" ? hay.includes(q) : words.every(w => hay.includes(w));
    if (!match && rule.watch_mode !== "rule") return false;
  }
  const maxBuy = n(rule.max_buy_price);
  if (maxBuy !== null && (n(row.observed_price) === null || Number(row.observed_price) > maxBuy)) return false;
  const minDiscount = n(rule.min_discount_percent);
  if (minDiscount !== null && (n(row.discount_percent) === null || Number(row.discount_percent) < minDiscount)) return false;
  const minProfit = n(rule.min_expected_profit);
  if (minProfit !== null && (n(row.estimated_profit) === null || Number(row.estimated_profit) < minProfit)) return false;
  const minRoi = n(rule.min_roi_percent);
  if (minRoi !== null && (n(row.roi_percent) === null || Number(row.roi_percent) < minRoi)) return false;
  return true;
}

async function overview(admin: any, ctx: any, since?: string) {
  await importLegacyWatches(admin, ctx);
  const [obs, actions, watches, queue, state] = await Promise.all([
    admin.from("deal_engine_observations").select("*").eq("household_id", ctx.householdId).eq("active", true).order("opportunity_score", { ascending: false }).limit(2000),
    admin.from("deal_engine_actions").select("*").eq("household_id", ctx.householdId),
    admin.from("deal_engine_watch_rules").select("*").eq("household_id", ctx.householdId).eq("enabled", true).order("updated_at", { ascending: false }),
    admin.from("deal_engine_sourcing_queue").select("*").eq("household_id", ctx.householdId).neq("status", "cancelled").order("updated_at", { ascending: false }),
    admin.from("deal_engine_state").select("*").eq("household_id", ctx.householdId).maybeSingle(),
  ]);
  for (const q of [obs, actions, watches, queue, state]) if (q.error) throw q.error;
  const actionMap = new Map((actions.data || []).map((x: any) => [String(x.canonical_key), x]));
  const rows = (obs.data || []).map((row: any) => {
    const action = actionMap.get(String(row.canonical_key));
    const matched = (watches.data || []).filter((w: any) => watchMatches(row, w));
    return {
      ...row,
      user_action: action?.action || "",
      action_notes: action?.notes || "",
      watch_hit: matched.length > 0,
      watch_rule_ids: matched.map((x: any) => x.id),
      display_score: Number(clamp(Number(row.opportunity_score || 0) + (matched.length ? 5 : 0)).toFixed(1)),
    };
  });
  const visible = rows.filter((x: any) => x.user_action !== "pass");
  const best = [...visible].sort((a, b) => b.display_score - a.display_score).slice(0, 50);
  const resell = visible.filter((x: any) => n(x.estimated_profit) !== null)
    .sort((a: any, b: any) => Number(b.estimated_profit) - Number(a.estimated_profit) || Number(b.roi_percent || 0) - Number(a.roi_percent || 0)).slice(0, 50);
  const savings = visible.filter((x: any) => n(x.discount_percent) !== null)
    .sort((a: any, b: any) => Number(b.discount_percent) - Number(a.discount_percent) || b.display_score - a.display_score).slice(0, 50);
  const nearby = visible.filter((x: any) => n(x.distance_miles) !== null)
    .sort((a: any, b: any) => Number(a.distance_miles) - Number(b.distance_miles)).slice(0, 50);
  const watchHits = visible.filter((x: any) => x.watch_hit)
    .sort((a: any, b: any) => b.display_score - a.display_score).slice(0, 50);
  const sinceMs = since && Number.isFinite(Date.parse(since)) ? Date.parse(since) : Date.now() - 24 * 3600000;
  const newSince = visible.filter((x: any) => Date.parse(x.first_seen_at) > sinceMs)
    .sort((a: any, b: any) => Date.parse(b.first_seen_at) - Date.parse(a.first_seen_at)).slice(0, 50);
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    state: state.data || null,
    counts: {
      active: rows.length,
      visible: visible.length,
      passed: rows.length - visible.length,
      watch_hits: watchHits.length,
      resell_known_profit: resell.length,
      nearby_known_distance: nearby.length,
      queue: (queue.data || []).length,
      watches: (watches.data || []).length,
    },
    segments: { best, resell, savings, nearby, watch_hits: watchHits, new_since: newSince },
    watches: watches.data || [],
    queue: queue.data || [],
  };
}

async function invokeFunction(url: string, anon: string, auth: string, slug: string, body: unknown, timeout = 30000) {
  try {
    const r = await fetch(`${url}/functions/v1/${slug}`, {
      method: "POST",
      headers: { Authorization: auth, apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    const raw = await r.text();
    let data: any;
    try { data = JSON.parse(raw); } catch { data = { raw }; }
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 598, data: { error: e instanceof Error ? e.message : String(e) } };
  }
}

async function refreshSources(url: string, anon: string, auth: string, ctx: any, body: any) {
  const jobs: Promise<any>[] = [];
  const labels: string[] = [];
  if (ctx.entitlements.has("penny")) {
    labels.push("penny");
    jobs.push(invokeFunction(url, anon, auth, "h38-penny-api", { action: "hunt_fast", payload: body.location || {} }, 20000));
  }
  if (ctx.entitlements.has("coupon")) {
    labels.push("coupon_watch");
    jobs.push(invokeFunction(url, anon, auth, "h38-coupon-api", { action: "web_discover", force: true }, 45000));
    const itemNames = Array.isArray(body.items) ? body.items : [];
    if (itemNames.length) {
      labels.push("coupon_public");
      jobs.push(invokeFunction(url, anon, auth, "h38-coupon-public-refresh", { items: itemNames.slice(0, 12) }, 45000));
    }
  }
  if (ctx.entitlements.has("resale") && body.location && (body.location.zip || (body.location.lat && body.location.lon))) {
    labels.push("resale");
    jobs.push(invokeFunction(url, anon, auth, "h38-resale-api", { action: "deals", payload: body.location }, 60000));
  }
  const results = await Promise.all(jobs);
  return results.map((result, i) => ({ source: labels[i], ...result }));
}

async function mirrorWatch(admin: any, ctx: any, userId: string, rule: any) {
  let resellerId = text(rule.legacy_reseller_watch_id);
  let couponId = text(rule.legacy_coupon_watch_id);
  const resellerPayload = {
    created_by: userId,
    query_text: text(rule.query_text),
    retailer: text(rule.retailer),
    max_buy_price: n(rule.max_buy_price) || 0,
    min_expected_profit: n(rule.min_expected_profit) || 0,
    min_roi_percent: n(rule.min_roi_percent) || 0,
    enabled: !!rule.enabled,
    updated_at: new Date().toISOString(),
  };
  if (resellerId) {
    const q = await admin.from("reseller_watch_rules").update(resellerPayload).eq("id", resellerId);
    if (q.error) resellerId = "";
  }
  if (!resellerId) {
    const q = await admin.from("reseller_watch_rules").insert(resellerPayload).select("id").single();
    if (!q.error) resellerId = String(q.data.id);
  }

  const shouldCoupon = ["all", "coupon", "watch"].includes(text(rule.product_area)) ||
    /amazon/i.test(text(rule.retailer)) || n(rule.min_discount_percent) !== null;
  if (shouldCoupon) {
    const couponPayload = {
      user_id: userId,
      item_name: text(rule.query_text) || "Deal watch",
      brand: "",
      target_effective_price: n(rule.max_buy_price),
      target_discount_percent: n(rule.min_discount_percent),
      enabled: !!rule.enabled,
      source: /amazon/i.test(text(rule.retailer)) ? "amazon" : "all",
      source_ref: text(rule.source_ref),
      source_url: text(rule.source_url),
      watch_mode: ["category", "rule"].includes(text(rule.watch_mode)) ? "discovery" : "specific",
      updated_at: new Date().toISOString(),
    };
    if (couponId) {
      const q = await admin.from("coupon_watch_rules").update(couponPayload).eq("id", couponId);
      if (q.error) couponId = "";
    }
    if (!couponId) {
      const q = await admin.from("coupon_watch_rules").insert(couponPayload).select("id").single();
      if (!q.error) couponId = String(q.data.id);
    }
  }
  return { resellerId: resellerId || null, couponId: couponId || null };
}

async function saveWatch(admin: any, ctx: any, userId: string, input: any) {
  const now = new Date().toISOString();
  const id = text(input.id);
  const payload = {
    household_id: ctx.householdId,
    created_by: userId,
    query_text: text(input.query_text || input.title),
    retailer: text(input.retailer),
    product_area: ["all", "penny", "resale", "coupon", "watch"].includes(text(input.product_area)) ? text(input.product_area) : "all",
    watch_mode: ["specific", "keyword", "category", "rule"].includes(text(input.watch_mode)) ? text(input.watch_mode) : "keyword",
    source_ref: text(input.source_ref),
    source_url: httpsUrl(input.source_url),
    max_buy_price: n(input.max_buy_price),
    min_discount_percent: n(input.min_discount_percent),
    min_expected_profit: n(input.min_expected_profit),
    min_roi_percent: n(input.min_roi_percent),
    enabled: input.enabled !== false,
    updated_at: now,
  };
  if (!payload.query_text && !payload.retailer &&
      payload.max_buy_price === null && payload.min_discount_percent === null &&
      payload.min_expected_profit === null && payload.min_roi_percent === null) {
    throw new Error("WATCH_RULE_NEEDS_A_QUERY_OR_THRESHOLD");
  }

  let row: any;
  if (id) {
    const current = await admin.from("deal_engine_watch_rules").select("*")
      .eq("household_id", ctx.householdId).eq("id", id).maybeSingle();
    if (current.error || !current.data) throw current.error || new Error("WATCH_NOT_FOUND");
    const q = await admin.from("deal_engine_watch_rules").update(payload).eq("id", id).select("*").single();
    if (q.error) throw q.error;
    row = q.data;
  } else {
    const q = await admin.from("deal_engine_watch_rules").insert(payload).select("*").single();
    if (q.error) throw q.error;
    row = q.data;
  }
  const mirrored = await mirrorWatch(admin, ctx, userId, row);
  const q = await admin.from("deal_engine_watch_rules").update({
    legacy_reseller_watch_id: mirrored.resellerId,
    legacy_coupon_watch_id: mirrored.couponId,
    updated_at: now,
  }).eq("id", row.id).select("*").single();
  if (q.error) throw q.error;
  return q.data;
}

async function deleteWatch(admin: any, ctx: any, id: string) {
  const current = await admin.from("deal_engine_watch_rules").select("*")
    .eq("household_id", ctx.householdId).eq("id", id).maybeSingle();
  if (current.error || !current.data) throw current.error || new Error("WATCH_NOT_FOUND");
  if (current.data.legacy_reseller_watch_id) {
    await admin.from("reseller_watch_rules").delete().eq("id", current.data.legacy_reseller_watch_id);
  }
  if (current.data.legacy_coupon_watch_id) {
    await admin.from("coupon_watch_rules").delete().eq("id", current.data.legacy_coupon_watch_id);
  }
  const q = await admin.from("deal_engine_watch_rules").delete().eq("id", id).eq("household_id", ctx.householdId);
  if (q.error) throw q.error;
}

async function setAction(admin: any, ctx: any, userId: string, input: any) {
  const canonicalKey = text(input.canonical_key);
  const action = lower(input.decision || input.user_action);
  if (!canonicalKey || !["buy", "pass", "watch"].includes(action)) throw new Error("INVALID_ACTION");
  const item = await admin.from("deal_engine_observations").select("*")
    .eq("household_id", ctx.householdId).eq("canonical_key", canonicalKey).maybeSingle();
  if (item.error || !item.data) throw item.error || new Error("OPPORTUNITY_NOT_FOUND");
  const now = new Date().toISOString();
  const saved = await admin.from("deal_engine_actions").upsert({
    household_id: ctx.householdId,
    canonical_key: canonicalKey,
    action,
    notes: text(input.notes),
    created_by: userId,
    updated_at: now,
  }, { onConflict: "household_id,canonical_key" }).select("*").single();
  if (saved.error) throw saved.error;

  let watch: any = null;
  if (action === "watch") {
    const existing = await admin.from("deal_engine_watch_rules").select("*")
      .eq("household_id", ctx.householdId)
      .eq("query_text", item.data.title)
      .eq("retailer", item.data.retailer)
      .limit(1).maybeSingle();
    if (existing.data) watch = existing.data;
    else watch = await saveWatch(admin, ctx, userId, {
      query_text: item.data.title,
      retailer: item.data.retailer,
      product_area: item.data.product_area,
      watch_mode: "specific",
      source_url: item.data.source_url,
    });
  }

  let queue: any = null;
  if (action === "buy") {
    const open = await admin.from("deal_engine_sourcing_queue").select("*")
      .eq("household_id", ctx.householdId).eq("canonical_key", canonicalKey)
      .in("status", ["planned", "purchased", "listed"]).limit(1).maybeSingle();
    if (open.data) queue = open.data;
    else {
      const q = await admin.from("deal_engine_sourcing_queue").insert({
        household_id: ctx.householdId,
        canonical_key: canonicalKey,
        selected_by: userId,
        quantity: Math.max(1, Math.round(Number(input.quantity || 1))),
        status: "planned",
        estimated_cost: n(item.data.observed_price),
        notes: text(input.notes),
      }).select("*").single();
      if (q.error) throw q.error;
      queue = q.data;
    }
  } else if (action === "pass") {
    await admin.from("deal_engine_sourcing_queue")
      .update({ status: "cancelled", updated_at: now })
      .eq("household_id", ctx.householdId).eq("canonical_key", canonicalKey).eq("status", "planned");
  }
  return { action: saved.data, watch, queue };
}

async function historyFor(admin: any, ctx: any, canonicalKey: string) {
  const q = await admin.from("deal_engine_price_history").select("*")
    .eq("household_id", ctx.householdId).eq("canonical_key", canonicalKey)
    .order("observed_at", { ascending: false }).limit(100);
  if (q.error) throw q.error;
  const rows = q.data || [];
  const prices = rows.map((x: any) => n(x.observed_price)).filter((x: any) => x !== null);
  return {
    ok: true,
    canonical_key: canonicalKey,
    rows,
    summary: {
      observations: rows.length,
      lowest_price: prices.length ? Math.min(...prices) : null,
      highest_price: prices.length ? Math.max(...prices) : null,
      latest_price: prices.length ? prices[0] : null,
      latest_at: rows[0]?.observed_at || null,
    },
  };
}

async function updateQueue(admin: any, ctx: any, input: any) {
  const id = text(input.id);
  if (!id) throw new Error("QUEUE_ID_REQUIRED");
  const current = await admin.from("deal_engine_sourcing_queue").select("*")
    .eq("household_id", ctx.householdId).eq("id", id).maybeSingle();
  if (current.error || !current.data) throw current.error || new Error("QUEUE_ITEM_NOT_FOUND");
  const patch: any = { updated_at: new Date().toISOString() };
  if (["planned", "purchased", "listed", "sold", "cancelled"].includes(text(input.status))) patch.status = text(input.status);
  if (input.quantity !== undefined) patch.quantity = Math.max(1, Math.round(Number(input.quantity || 1)));
  for (const key of ["actual_cost", "actual_sale_price"]) if (input[key] !== undefined) patch[key] = n(input[key]);
  if (input.notes !== undefined) patch.notes = text(input.notes);
  const q = await admin.from("deal_engine_sourcing_queue").update(patch).eq("id", id).select("*").single();
  if (q.error) throw q.error;
  return q.data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST_REQUIRED" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "AUTH_REQUIRED" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const userId = await authenticatedUserId(sb, token);
    if (!userId) return json({ error: "AUTH_REQUIRED" }, 401);
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const ctx = await contextFor(sb, admin, userId);
    const body = await req.json().catch(() => ({}));
    const action = text(body.action || "overview");

    if (action === "refresh") {
      let source_refresh: any[] = [];
      if (body.refresh_sources) source_refresh = await refreshSources(url, anon, auth, ctx, body);
      const refresh = await refreshEngine(admin, ctx, userId);
      const data = await overview(admin, ctx, body.since);
      return json({ ...data, refresh, source_refresh });
    }

    if (action === "overview") {
      const state = await admin.from("deal_engine_state").select("last_refresh_at,observation_count")
        .eq("household_id", ctx.householdId).maybeSingle();
      const stale = !state.data?.last_refresh_at ||
        Date.now() - Date.parse(state.data.last_refresh_at) > 30 * 60 * 1000 ||
        Number(state.data.observation_count || 0) === 0;
      let refresh = null;
      if (stale) refresh = await refreshEngine(admin, ctx, userId);
      const data = await overview(admin, ctx, body.since);
      return json({ ...data, refresh });
    }

    if (action === "history") return json(await historyFor(admin, ctx, text(body.canonical_key)));

    if (action === "watch_save") {
      const watch = await saveWatch(admin, ctx, userId, body.watch || body);
      return json({ ok: true, watch });
    }

    if (action === "watch_delete") {
      await deleteWatch(admin, ctx, text(body.id));
      return json({ ok: true });
    }

    if (action === "set_action" || action === "action") {
      const result = await setAction(admin, ctx, userId, body);
      return json({ ok: true, ...result });
    }

    if (action === "action_clear") {
      const key = text(body.canonical_key);
      const q = await admin.from("deal_engine_actions").delete()
        .eq("household_id", ctx.householdId).eq("canonical_key", key);
      if (q.error) throw q.error;
      return json({ ok: true });
    }

    if (action === "queue_update") {
      const queue = await updateQueue(admin, ctx, body);
      return json({ ok: true, queue });
    }

    if (action === "health") {
      const [state, count, history, watches] = await Promise.all([
        admin.from("deal_engine_state").select("*").eq("household_id", ctx.householdId).maybeSingle(),
        admin.from("deal_engine_observations").select("canonical_key", { count: "exact", head: true }).eq("household_id", ctx.householdId).eq("active", true),
        admin.from("deal_engine_price_history").select("id", { count: "exact", head: true }).eq("household_id", ctx.householdId),
        admin.from("deal_engine_watch_rules").select("id", { count: "exact", head: true }).eq("household_id", ctx.householdId).eq("enabled", true),
      ]);
      return json({
        ok: !state.error && !count.error && !history.error && !watches.error,
        state: state.data || null,
        active_observations: count.count || 0,
        history_rows: history.count || 0,
        enabled_watches: watches.count || 0,
      });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (e: any) {
    let message = "";
    if (e instanceof Error) message = e.message;
    else {
      try { message = JSON.stringify(e); } catch { message = String(e); }
    }
    const status = Number(e?.status || 500);
    return json({ error: "DEAL_ENGINE_ERROR", detail: message }, status >= 400 && status < 600 ? status : 500);
  }
});
