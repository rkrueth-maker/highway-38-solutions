import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
};
const txt = (v: any) => String(v ?? "").trim();
const clean = (v: any) => txt(v).replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;|&#x27;/gi, "'").replace(/&nbsp;|&#160;/gi, " ").replace(/\s+/g, " ").trim();
const money = (v: any) => { const n = Number(txt(v).replace(/[$,]/g, "")); return Number.isFinite(n) ? n : null; };
const pct = (now: any, was: any) => Number.isFinite(now) && Number.isFinite(was) && was > now ? Math.round((was - now) / was * 1000) / 10 : 0;
const json = (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: CORS });
const nowIso = () => new Date().toISOString();

async function fetchText(url: string, timeout = 18000) {
  const r = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 H38Deals/5.2 clearance-source",
      "accept": "text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.7",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return (await r.text()).slice(0, 2_400_000);
}
const mirror = (url: string, timeout = 22000) => fetchText("https://r.jina.ai/" + url, timeout);
function stripMd(v: any) { return clean(String(v ?? "").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*/g, "").replace(/^#+\s*/, "").replace(/^[-*]\s*/, "")); }
function usefulTitle(v: any) { const s = stripMd(v); return s.length >= 8 && s.length <= 260 && !/^(?:home depot|walgreens|clearance|find of the day|more .* finds|track .* like this|page navigation|price and inventory)/i.test(s) && !/(?:wag_header_logo|\/store\/c\/productlist\/|https?:\/\/)/i.test(s); }
function regulatedWalgreens(v: any) { return /\b(?:nicorette|nicotine|tobacco|cigarette|cigar|vape|beer|wine|liquor|spirits)\b/i.test(txt(v)); }

function hdRow(title: any, brand: any, discount: any, sourceUrl: string, image = "", stock: any = null) {
  const d = Number(discount);
  if (!usefulTitle(title) || !Number.isFinite(d) || d < 40 || d > 99.9) return null;
  const t = stripMd(title);
  return {
    retailer: "Home Depot", title: t, canonical_title: t, buy_price: null, retail_price: null,
    discount_pct: d, deep_discount: true, deal_type: "clearance",
    source_name: "Endless public Home Depot clearance preview", source_url: sourceUrl, source_item_url: sourceUrl,
    image_url: image, observed_at: nowIso(), deal_scope: "chain_observed", store_specific: false,
    source_confidence: "MEDIUM", source_confidence_score: .78,
    identity_confidence: image ? "TITLE_IMAGE_EXACT_CARD" : "TITLE_BRAND",
    evidence_role: "specialist_clearance_monitor", evidence_group: "endless-home-depot", brand,
    source_stock_observed: Number.isFinite(stock) ? stock : null,
    availability_label: "Home Depot clearance observed across scanned stores. Exact local price and stock must be verified before travel.",
    image_source_scope: image ? "exact_product_card" : "",
    image_source_proof: image ? "public_clearance_preview_exact_product_card" : "",
  };
}
function parseHdBrand(md: string, sourceUrl: string, brandHint: string) {
  const raw = String(md || ""), lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean), rows: any[] = [], brand = brandHint || "";
  for (let i = 0; i < lines.length; i++) {
    if (!/^##\s+/.test(lines[i])) continue;
    const title = stripMd(lines[i]); if (!usefulTitle(title)) continue;
    const before = lines.slice(Math.max(0, i - 4), i).join(" "), after = lines.slice(i + 1, i + 4).join(" "), pm = (before + " " + after).match(/(\d{2,3})%\s*off/i);
    if (!pm) continue;
    const im = before.match(/https:\/\/images\.thdstatic\.com\/[^)\s\]]+/i), sm = after.match(/(\d+)\s+(?:in stock|left)/i);
    const r = hdRow(title, brand, Number(pm[1]), sourceUrl, im ? im[0] : "", sm ? Number(sm[1]) : null); if (r) rows.push(r);
  }
  const cardRe = /!\[[^\]]*\]\((https:\/\/images\.thdstatic\.com\/[^)]+)\)\s*[^\[]*?(\d{2,3})%\s*off\s+###\s+(.+?)\s+(\d{2,3})%\s*off\s+and\s+(\d+)\s+(?:in stock|left)/gi;
  let m; while ((m = cardRe.exec(raw))) { if (Number(m[2]) !== Number(m[4])) continue; const r = hdRow(stripMd(m[3]), brand, Number(m[2]), sourceUrl, m[1], Number(m[5])); if (r) rows.push(r); }
  const best = new Map<string, any>(); for (const r of rows) { const k = r.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), p = best.get(k); if (!p || r.discount_pct > p.discount_pct) best.set(k, r); }
  return [...best.values()];
}
const HD_BRANDS = ["hampton-bay","everbilt","home-decorators-collection","milwaukee","glacier-bay","vigoro","ryobi","dewalt","commercial-electric","feit-electric","msi","trafficmaster","husky","ridgid","rheem","lincoln-electric","southwire","echo"];
async function homeDepotShared(limitBrands = 14) {
  const statuses: any[] = [], all: any[] = [], brands = HD_BRANDS.slice(0, Math.max(1, Math.min(limitBrands, HD_BRANDS.length))); let cursor = 0;
  async function worker() { while (cursor < brands.length) { const slug = brands[cursor++], url = `https://endless.page/deals/home-depot/brands/${slug}/`; try { const md = await mirror(url, 18000), rows = parseHdBrand(md, url, slug.replace(/-/g, " ")); all.push(...rows); statuses.push({ source: "Endless Home Depot public brand preview", key: slug, status: rows.length ? "AVAILABLE" : "DEGRADED", products: rows.length, strategy: "public_text_mirror" }); } catch (e) { statuses.push({ source: "Endless Home Depot public brand preview", key: slug, status: "UNAVAILABLE", products: 0, strategy: "public_text_mirror", warning: e instanceof Error ? e.message : String(e) }); } } }
  await Promise.all(Array.from({ length: Math.min(5, brands.length) }, () => worker()));
  const best = new Map<string, any>(); for (const r of all) { const k = r.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), p = best.get(k); if (!p || r.discount_pct > p.discount_pct) best.set(k, r); }
  return { rows: [...best.values()].sort((a, b) => b.discount_pct - a.discount_pct).slice(0, 180), statuses };
}
function parseCurrentExpression(v: any) { const s = txt(v); let m = s.match(/1\s*\/\s*\$([\d,.]+)/i); if (m) return money(m[1]); m = s.match(/\$([\d,.]+)/); if (m) return money(m[1]); m = s.match(/^([\d,.]+)/); return m ? money(m[1]) : null; }
function walgreensRow({ title, was, now, clearanceUrl, itemUrl, itemId, sku, strategy }: any) {
  const discount = pct(now, was), t = stripMd(title).replace(/^\*+|\*+$/g, "").trim();
  if (!usefulTitle(t) || regulatedWalgreens(t) || !Number.isFinite(now) || !Number.isFinite(was) || discount < 40) return null;
  return { retailer: "Walgreens", title: t, canonical_title: t, sku: txt(sku), retailer_item_id: txt(itemId), buy_price: now, retail_price: was, discount_pct: discount, deep_discount: true, deal_type: "clearance", source_name: "Walgreens official clearance", source_url: clearanceUrl, source_item_url: itemUrl || clearanceUrl, image_url: "", observed_at: nowIso(), deal_scope: "chain_or_online", store_specific: false, source_confidence: "HIGH", source_confidence_score: .94, identity_confidence: itemUrl ? "OFFICIAL_PRODUCT_URL_TITLE" : "OFFICIAL_TITLE_PRICE", evidence_role: "official_retailer", evidence_group: "walgreens-official-clearance", acquisition_strategy: strategy, availability_label: "Official Walgreens clearance. Walgreens notes that price and inventory may vary by store." };
}
function parseWalgreensText(text: string, clearanceUrl: string, strategy: string) {
  const lines = String(text || "").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'").split(/\r?\n/).map(x => clean(x)).filter(Boolean), out: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^Previous price was$/i.test(lines[i])) continue;
    const title = lines[i - 3] || "", brand = lines[i - 2] || "", rating = lines[i - 1] || "";
    if (!usefulTitle(title) || regulatedWalgreens(title) || !/^(?:\(\d+[\d,]*\)|No Reviews)$/i.test(rating)) continue;
    const was = money(lines[i + 1]); if (!/^Current sale price is$/i.test(lines[i + 2] || "")) continue;
    const now = parseCurrentExpression(lines[i + 3]); if (!/^Clearance$/i.test(lines[i + 4] || "")) continue;
    const r: any = walgreensRow({ title, was, now, clearanceUrl, itemUrl: "", itemId: "", sku: "", strategy }); if (r) { r.brand = brand; r.identity_confidence = "OFFICIAL_CLEARANCE_LIST_TITLE_PRICE"; out.push(r); }
  }
  const best = new Map<string, any>(); for (const r of out) { const k = `t:${r.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`, p = best.get(k); if (!p || r.discount_pct > p.discount_pct) best.set(k, r); }
  return [...best.values()];
}
async function walgreensShared() {
  const rows: any[] = [], statuses: any[] = [], clearance = "https://www.walgreens.com/search/results.jsp?Ntt=Clearance&ban=dl_dlsp_ShopProducts_Clearance";
  try { const md = await mirror(clearance, 18000), got = parseWalgreensText(md, clearance, "official_clearance_text_mirror"); rows.push(...got); statuses.push({ source: "Walgreens official clearance", status: got.length ? "AVAILABLE" : "DEGRADED", products: got.length, strategy: "official_clearance_text_mirror" }); } catch (e) { statuses.push({ source: "Walgreens official clearance", status: "UNAVAILABLE", products: 0, strategy: "official_clearance_text_mirror", warning: e instanceof Error ? e.message : String(e) }); }
  const best = new Map<string, any>(); for (const r of rows) { const k = `t:${r.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`, p = best.get(k); if (!p || r.discount_pct > p.discount_pct) best.set(k, r); }
  return { rows: [...best.values()].sort((a, b) => b.discount_pct - a.discount_pct).slice(0, 120), statuses };
}
async function runShared(fast = false) { const [hd, wal] = await Promise.all([homeDepotShared(fast ? 6 : 14), walgreensShared()]), rows = [...hd.rows, ...wal.rows]; return { items: rows, leads: rows, count: rows.length, source_status: [...hd.statuses, ...wal.statuses], coverage: { home_depot: hd.rows.length, walgreens: wal.rows.length, menards: "local Ray's List remains separate" } }; }

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "POST_REQUIRED" }, 405);
  try { const body = await req.json().catch(() => ({})), action = txt(body.action || "shared"); if (action === "shared" || action === "shared_fast") return json({ ok: true, data: await runShared(action === "shared_fast") }); return json({ error: "UNKNOWN_ACTION" }, 400); }
  catch (e) { return json({ error: "H38_DEEP_SOURCES_ERROR", detail: e instanceof Error ? e.message : String(e) }, 500); }
});
