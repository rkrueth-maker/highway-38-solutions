import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Any = Record<string, any>;
const BASE = Deno.env.get("SUPABASE_URL") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const txt = (v: unknown) => String(v ?? "").trim();
const nowIso = () => new Date().toISOString();
const admin = () => createClient(BASE, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 1000) / 10 : 0;
const ageHours = (v: unknown) => { const n = Date.parse(txt(v)); return Number.isFinite(n) ? Math.round(((Date.now() - n) / 3600000) * 10) / 10 : null; };
const worst = (...s: string[]) => s.includes("FAIL") ? "FAIL" : s.includes("PARTIAL") ? "PARTIAL" : "PASS";

async function boundedCheck(label: string, promise: Promise<Any>, timeoutMs: number) {
  const started = Date.now();
  try {
    const value = await Promise.race([
      promise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)),
    ]);
    return { ...value, elapsed_ms: Date.now() - started };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      status: "FAIL",
      error: message,
      elapsed_ms: Date.now() - started,
      warnings: [message],
      timed_out: /timed out/i.test(message),
    };
  }
}

async function ownerAuth(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = createClient(BASE, ANON, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return null;
  const a = admin();
  const q = await a.from("business_memberships").select("role,status")
    .eq("auth_user_id", user.id).eq("status", "active").in("role", ["owner", "administrator"]).limit(1);
  if (q.error || !q.data?.length) return { denied: true, user, auth };
  return { denied: false, user, auth, role: q.data[0].role };
}

async function invoke(slug: string, auth: string, body: Any, timeout = 30000, apikey = ANON) {
  try {
    const r = await fetch(`${BASE}/functions/v1/${slug}`, {
      method: "POST",
      headers: { Authorization: auth, apikey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    const text = await r.text();
    let data: Any = {};
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 800) }; }
    return { ok: r.ok, status: r.status, data, error: r.ok ? "" : txt(data?.error || data?.detail || text).slice(0, 500) };
  } catch (e) {
    return { ok: false, status: 598, data: {}, error: e instanceof Error ? e.message : String(e) };
  }
}

async function couponCheck(repair: boolean) {
  const a = admin(), warnings: string[] = [], repairs: Any[] = [];
  if (repair) {
    const stale = await a.from("coupon_public_offer_cache").update({ active: false })
      .eq("active", true).not("expires_at", "is", null).lte("expires_at", nowIso()).select("canonical_key");
    if (stale.error) warnings.push(`Expire cleanup failed: ${stale.error.message}`);
    else repairs.push({ action: "deactivate_expired_offers", changed: stale.data?.length || 0 });

    const refresh = await invoke("h38-coupon-public-refresh", `Bearer ${SERVICE}`, {
      items: ["Milk", "Dog food", "Laundry detergent", "Brisk Ice tea", "Coca-Cola"].map(item_name => ({ item_name })),
    }, 50000, SERVICE);
    repairs.push({ action: "refresh_supported_staples", ok: refresh.ok, status: refresh.status, refreshed: Number(refresh.data?.refreshed || 0), diagnostics: refresh.data?.diagnostics || [] });
    if (!refresh.ok) warnings.push(`Coupon public refresh failed: ${refresh.error || refresh.status}`);
  }

  const q = await a.from("coupon_public_offer_cache")
    .select("canonical_key,retailer,title,item_name,buy_price,source_url,deal_terms,evidence_scope,observed_at,expires_at,active,payload")
    .eq("active", true).limit(500);
  if (q.error) return { status: "FAIL", error: q.error.message, warnings, repairs };
  const rows = q.data || [], now = Date.now();
  const keys = ["Milk", "Dog food", "Laundry detergent", "Brisk Ice tea", "Coca-Cola"];
  const coverage = Object.fromEntries(keys.map(k => [k, rows.filter((r: Any) => txt(r.item_name).toLowerCase() === k.toLowerCase()).length]));
  const expired = rows.filter((r: Any) => r.expires_at && Date.parse(r.expires_at) <= now).length;
  const invalidPrice = rows.filter((r: Any) => !(Number(r.buy_price) > 0)).length;
  const invalidSource = rows.filter((r: Any) => !/^https:\/\//i.test(txt(r.source_url))).length;
  const badMilk = rows.filter((r: Any) => txt(r.item_name).toLowerCase() === "milk" && /\b(?:chocolate|candy|morsel|cookie|powder|formula|protein|shake|almond|oat|soy|coconut|condensed|evaporated)\b/i.test(txt(r.title))).length;
  const missing = keys.filter(k => Number(coverage[k] || 0) === 0);
  if (missing.length) warnings.push(`No active current offer rows for: ${missing.join(", ")}`);
  if (expired) warnings.push(`${expired} expired offer rows are still active`);
  if (invalidPrice) warnings.push(`${invalidPrice} active offer rows have no positive price`);
  if (invalidSource) warnings.push(`${invalidSource} active offer rows have no HTTPS source`);
  if (badMilk) warnings.push(`${badMilk} milk false-positive rows remain`);
  const status = expired || invalidPrice || invalidSource || badMilk ? "FAIL" : missing.length ? "PARTIAL" : "PASS";
  return {
    status, active_offers: rows.length, coverage, expired_active: expired, invalid_price: invalidPrice,
    invalid_source: invalidSource, milk_false_positives: badMilk,
    newest_observation: rows.map((r: Any) => r.observed_at).filter(Boolean).sort().at(-1) || null,
    source_scopes: [...new Set(rows.map((r: Any) => txt(r.evidence_scope)).filter(Boolean))], warnings, repairs,
  };
}

async function pennyCheck() {
  const a = admin(), warnings: string[] = [];
  const [q, m] = await Promise.all([
    a.from("reseller_hunt_cache").select("canonical_key,retailer,title,buy_price,image_url,source_url,last_seen_at,active").eq("active", true).limit(1500),
    a.from("reseller_hunt_cache_meta").select("scan_status,last_full_scan_at,last_fast_scan_at,last_total_count,last_new_count,last_updated_count,last_error,updated_at,last_nightly_date").eq("cache_key", "penny").maybeSingle(),
  ]);
  if (q.error) return { status: "FAIL", error: q.error.message, warnings };
  const rows = q.data || [], total = rows.length;
  const priced = rows.filter((r: Any) => Number(r.buy_price) > 0).length;
  const images = rows.filter((r: Any) => /^https:\/\//i.test(txt(r.image_url))).length;
  const sources = rows.filter((r: Any) => /^https:\/\//i.test(txt(r.source_url))).length;
  const junk = rows.filter((r: Any) => !txt(r.title) || /add the first photo|inventory checker|^permalink$/i.test(txt(r.title))).length;
  const fullAge = ageHours(m.data?.last_full_scan_at);
  const imageCoverage = pct(images, total), priceCoverage = pct(priced, total), sourceCoverage = pct(sources, total);
  if (!total) warnings.push("Penny cache is empty");
  if (fullAge == null || fullAge > 48) warnings.push(`Full Penny scan is stale (${fullAge == null ? "unknown" : fullAge + "h"})`);
  if (imageCoverage < 85) warnings.push(`Penny image coverage is ${imageCoverage}%`);
  if (priceCoverage < 80) warnings.push(`Penny positive-price coverage is ${priceCoverage}%`);
  if (junk) warnings.push(`${junk} active Penny rows look like junk/index rows`);
  if (txt(m.data?.last_error)) warnings.push(`Last Penny scan error: ${txt(m.data.last_error).slice(0, 300)}`);
  const status = !total || junk > Math.max(5, total * .03) ? "FAIL" : warnings.length ? "PARTIAL" : "PASS";
  return {
    status, active_rows: total, priced_rows: priced, price_coverage_pct: priceCoverage,
    image_rows: images, image_coverage_pct: imageCoverage, source_rows: sources, source_coverage_pct: sourceCoverage,
    suspicious_rows: junk, cache_meta: m.data || null, full_scan_age_hours: fullAge, warnings,
  };
}

function probeSummary(name: string, r: Any) {
  const d = r.data || {};
  const results = Array.isArray(d.results) ? d.results.length : Array.isArray(d.stores) ? d.stores.length : Array.isArray(d.candidates) ? d.candidates.length : Number(d.count || 0);
  const declared = txt(d.status || d.provider_status || d.health?.status).toUpperCase();
  const status = !r.ok ? "FAIL" : declared === "FAIL" ? "FAIL" : declared === "PARTIAL" || declared.includes("UNAVAILABLE") || !results ? "PARTIAL" : "PASS";
  return { name, status, http_status: r.status, result_count: results, declared_status: declared || null, engine: d.engine || null, warnings: d.warnings || [], error: r.error || null };
}

async function resaleCheck(auth: string, deep: boolean) {
  const a = admin(), warnings: string[] = [];
  const q = await a.from("reseller_hunt_cache").select("canonical_key,buy_price,last_seen_at,active").eq("active", true).gt("buy_price", 0).limit(1500);
  if (q.error) return { status: "FAIL", error: q.error.message, warnings };
  const saved = q.data || [], fresh = saved.filter((r: Any) => { const t = Date.parse(txt(r.last_seen_at)); return Number.isFinite(t) && Date.now() - t < 72 * 3600000; }).length;
  const out: Any = { saved_candidates: saved.length, fresh_72h: fresh, freshest_seen: saved.map((r: Any) => r.last_seen_at).filter(Boolean).sort().at(-1) || null, live_probes: [], warnings };
  if (!saved.length) warnings.push("No saved priced Resale candidates");
  if (!deep) { out.status = warnings.length ? "PARTIAL" : "PASS"; return out; }

  const base = { city: "Grand Rapids", state: "MN", postal: "55744", zip: "55744", location_label: "Grand Rapids, MN", radiusMiles: 50, radius_miles: 50, max_results: 30 };
  const [fb, garage, auction, stores] = await Promise.all([
    invoke("reseller-facebook-public-v240", auth, { ...base, terms: ["tools"] }, 35000),
    invoke("reseller-garage-sales-v308", auth, { ...base }, 35000),
    invoke("reseller-auction-search-v230", auth, { ...base, terms: ["tools"], query: "tools" }, 45000),
    invoke("reseller-nearby-stores-v262", auth, { ...base }, 35000),
  ]);
  const probes = [probeSummary("facebook_marketplace", fb), probeSummary("garage_estate_sales", garage), probeSummary("auctions", auction), probeSummary("nearby_stores", stores)];
  out.live_probes = probes;
  for (const p of probes) if (p.status !== "PASS") warnings.push(`${p.name}: ${p.error || p.declared_status || "no confirmed results"}`);
  out.status = probes.some((p: Any) => p.status === "FAIL") ? "FAIL" : probes.some((p: Any) => p.status === "PARTIAL") || warnings.length ? "PARTIAL" : "PASS";
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST_REQUIRED" }, 405);
  const who = await ownerAuth(req);
  if (!who) return json({ error: "AUTH_REQUIRED" }, 401);
  if (who.denied) return json({ error: "OWNER_OR_ADMIN_REQUIRED" }, 403);
  try {
    const body = await req.json().catch(() => ({}));
    const action = txt(body.action || "check").toLowerCase();
    if (!["check", "maintain"].includes(action)) return json({ error: "UNKNOWN_ACTION", allowed: ["check", "maintain"] }, 400);
    const deep = body.deep !== false;
    const repair = action === "maintain";
    const started = Date.now();
    const [coupon, penny, resale] = await Promise.all([
      boundedCheck("Couponing health check", couponCheck(repair), repair ? 70000 : 20000),
      boundedCheck("Penny health check", pennyCheck(), 20000),
      boundedCheck("Resale health check", resaleCheck(who.auth, deep), deep ? 60000 : 20000),
    ]);
    const status = worst(coupon.status, penny.status, resale.status);
    const warnings = [...(coupon.warnings || []).map((x: string) => `Couponing: ${x}`), ...(penny.warnings || []).map((x: string) => `Penny: ${x}`), ...(resale.warnings || []).map((x: string) => `Resale: ${x}`)];
    return json({
      ok: status !== "FAIL", status, engine: "H38_DEALS_MAINTENANCE_V1", action, checked_at: nowIso(),
      elapsed_ms: Date.now() - started, access_role: who.role, coupon, penny, resale, warnings,
      truth: "Maintenance reports confirmed cache/database health plus authenticated live source probes when deep=true. PARTIAL means a source is empty, degraded, or unproven; it is not converted into a false PASS.",
    });
  } catch (e) {
    return json({ error: "H38_DEALS_MAINTENANCE_ERROR", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
