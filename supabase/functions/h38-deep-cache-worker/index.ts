import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Any = Record<string, any>;
const BASE = Deno.env.get("SUPABASE_URL") || "", SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type,x-h38-nightly-key", "Access-Control-Allow-Methods": "POST,OPTIONS", "Content-Type": "application/json" };
const txt = (v: any) => String(v ?? "").trim(), digits = (v: any) => txt(v).replace(/\D/g, "");
const json = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });
const admin = () => createClient(BASE, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
function retailerKey(v: any) { const s = txt(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); if (s.includes("home depot")) return "home depot"; if (s.includes("walgreens")) return "walgreens"; return s || "other"; }
function titleKey(v: any) { return txt(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 180); }
function canonical(r: Any) { const rr = retailerKey(r.retailer || r.store_name || r.source_name), upc = digits(r.upc || r.gtin || r.barcode).replace(/^0+/, ""), sku = digits(r.sku || r.store_sku || r.internet_number || r.retailer_item_id).replace(/^0+/, ""), t = titleKey(r.source_identity_title || r.canonical_title || r.title || r.product_name || r.item_name); if (upc) return `${rr}|u:${upc}`; if (sku) return `${rr}|s:${sku}`; return t ? `${rr}|t:${t}` : ""; }
function list(d: any) { if (Array.isArray(d)) return d; if (Array.isArray(d?.items)) return d.items; if (Array.isArray(d?.leads)) return d.leads; if (Array.isArray(d?.results)) return d.results; return []; }
function numberOrNull(v: any) { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function validImage(v: any) { const u = txt(v); return /^https:\/\//i.test(u) && !/(?:placeholder|blank|spacer|logo|favicon|sprite|pixel|loading|no-image)/i.test(u) ? u : ""; }
async function validSecret(req: Request, a: any) { const got = txt(req.headers.get("x-h38-nightly-key")); if (!got) return false; const { data } = await a.from("h38_internal_job_secrets").select("secret_value").eq("name", "penny-nightly").maybeSingle(); return !!data?.secret_value && got === data.secret_value; }
async function acquire(a: any, key: string, staleMs: number) { for (let i = 0; i < 2; i++) { const token = crypto.randomUUID(), { error } = await a.from("reseller_hunt_scan_locks").insert({ cache_key: key, token, acquired_at: new Date().toISOString() }); if (!error) return token; if (error.code !== "23505") throw error; const { data } = await a.from("reseller_hunt_scan_locks").select("token,acquired_at").eq("cache_key", key).maybeSingle(); const old = data?.acquired_at ? Date.parse(data.acquired_at) : 0; if (!old || Date.now() - old <= staleMs) return null; await a.from("reseller_hunt_scan_locks").delete().eq("cache_key", key).eq("token", data.token); } return null; }
async function release(a: any, key: string, token: string) { await a.from("reseller_hunt_scan_locks").delete().eq("cache_key", key).eq("token", token); }
async function invokeDeep() { try { const r = await fetch(`${BASE}/functions/v1/h38-deep-sources`, { method: "POST", headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, "Content-Type": "application/json" }, body: JSON.stringify({ action: "shared" }), signal: AbortSignal.timeout(120000) }), text = await r.text(); let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; } return { ok: r.ok, status: r.status, text, data }; } catch (e) { return { ok: false, status: 598, text: e instanceof Error ? e.message : String(e), data: {} }; } }

async function persist(a: any, rows: Any[]) {
  const candidates = rows.map(r => ({ r, key: canonical(r), title: txt(r.source_identity_title || r.canonical_title || r.title || r.product_name || r.item_name) })).filter(x => x.key && x.title.length >= 4);
  if (!candidates.length) return { new_count: 0, updated_count: 0, skipped_penny: 0, total_input: 0 };
  const keys = [...new Set(candidates.map(x => x.key))];
  const { data: existing, error: ee } = await a.from("reseller_hunt_cache").select("canonical_key,retailer,title,upc,sku,deal_type,buy_price,retail_price,image_url,image_storage_path,image_cached_at,image_source_url,image_mime,source_url,source_bucket,payload,penny_sort_at,penny_date_kind,first_seen_at,seen_count").in("canonical_key", keys); if (ee) throw ee;
  const old = new Map((existing || []).map((x: Any) => [x.canonical_key, x]));
  const hdTitles = [...new Set(candidates.filter(x => retailerKey(x.r.retailer) === "home depot").map(x => x.title))], wgTitles = [...new Set(candidates.filter(x => retailerKey(x.r.retailer) === "walgreens").map(x => x.title))];
  const byTitle = new Map<string, Any>();
  for (const [retailer, titles] of [["Home Depot", hdTitles], ["Walgreens", wgTitles]] as any[]) for (let i = 0; i < titles.length; i += 100) { const part = titles.slice(i, i + 100); if (!part.length) continue; const { data } = await a.from("reseller_hunt_cache").select("canonical_key,retailer,title,deal_type,image_url,image_storage_path,payload").eq("active", true).eq("retailer", retailer).in("title", part); for (const x of data || []) byTitle.set(`${retailerKey(x.retailer)}|${titleKey(x.title)}`, x); }
  let add = 0, upd = 0, skippedPenny = 0; const now = new Date().toISOString(), out: any[] = [];
  for (const { r, key, title } of candidates) {
    const rr = retailerKey(r.retailer), titleMatch = byTitle.get(`${rr}|${titleKey(title)}`), prior: any = old.get(key) || titleMatch || null;
    if (prior && txt(prior.deal_type).toLowerCase() === "penny") { skippedPenny++; continue; }
    const incomingImage = validImage(r.image_url || r.image || r.thumbnail_url), keepCached = !!prior?.image_storage_path, image = keepCached ? txt(prior.image_url) : (incomingImage || txt(prior?.image_url));
    const payloadPrior = prior?.payload && typeof prior.payload === "object" ? prior.payload : {}, evidence = Array.isArray(payloadPrior.source_evidence) ? payloadPrior.source_evidence : [];
    const ev = { source_name: txt(r.source_name), source_url: txt(r.source_url), observed_at: txt(r.observed_at || now), confidence: txt(r.source_confidence), identity_confidence: txt(r.identity_confidence) }, ekey = `${ev.source_name}|${ev.source_url}|${ev.identity_confidence}`;
    const mergedEvidence = [...evidence.filter((x: any) => `${txt(x?.source_name)}|${txt(x?.source_url)}|${txt(x?.identity_confidence)}` !== ekey), ev].slice(-12);
    const dbKey = prior?.canonical_key || key, firstAt = prior?.first_seen_at || now, sortAt = prior?.penny_sort_at || now, dateKind = prior?.penny_date_kind || "first_captured";
    prior ? upd++ : add++;
    out.push({ canonical_key: dbKey, retailer: txt(r.retailer), title, upc: txt(prior?.upc || r.upc || r.gtin || r.barcode), sku: txt(prior?.sku || r.sku || r.store_sku || r.internet_number || r.retailer_item_id), deal_type: txt(prior?.deal_type || r.deal_type || "clearance"), buy_price: prior?.buy_price ?? numberOrNull(r.buy_price ?? r.price ?? r.current_price ?? r.sale_price), retail_price: prior?.retail_price ?? numberOrNull(r.retail_price ?? r.regular_price ?? r.original_price ?? r.msrp), image_url: image, image_storage_path: txt(prior?.image_storage_path), image_cached_at: prior?.image_cached_at || null, image_source_url: keepCached ? txt(prior?.image_source_url) : (incomingImage || txt(prior?.image_source_url)), image_mime: txt(prior?.image_mime), source_url: txt(r.source_item_url || r.source_url || prior?.source_url), source_bucket: "deep-shared-v1", payload: { ...payloadPrior, ...r, source_evidence: mergedEvidence, image_url: image }, first_seen_at: firstAt, last_seen_at: now, last_changed_at: now, seen_count: Number(prior?.seen_count || 0) + 1, active: true, penny_sort_at: sortAt, penny_date_kind: dateKind });
  }
  if (out.length) { const { error } = await a.from("reseller_hunt_cache").upsert(out, { onConflict: "canonical_key" }); if (error) throw error; }
  return { new_count: add, updated_count: upd, skipped_penny: skippedPenny, total_input: candidates.length, persisted: out.length };
}
async function run(a: any, reason: string) { const lock = await acquire(a, "penny-deep", 15 * 60 * 1000); if (!lock) return { started: false, already_running: true, reason }; try { const source = await invokeDeep(); if (!source.ok) throw new Error(`h38-deep-sources ${source.status}: ${source.text.slice(0, 400)}`); const data = source.data?.data || source.data, rows = list(data), stats = await persist(a, rows); return { started: true, reason, stats, coverage: data?.coverage || null, source_status: data?.source_status || [] }; } finally { await release(a, "penny-deep", lock).catch(() => {}); } }

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST_REQUIRED" }, 405);
  const a = admin(); if (!await validSecret(req, a)) return json({ error: "UNAUTHORIZED" }, 401);
  try { const body = await req.json().catch(() => ({})), action = txt(body.action || "refresh"); if (action !== "refresh") return json({ error: "UNKNOWN_ACTION" }, 400); return json({ ok: true, data: await run(a, txt(body.reason || "manual")) }); }
  catch (e) { return json({ error: "H38_DEEP_CACHE_WORKER_ERROR", detail: e instanceof Error ? e.message : String(e) }, 500); }
});
