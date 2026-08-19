import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED = new Set([
  "ccf25333-47cd-42ca-a20b-cdbc63a8a695",
  "6dd51b31-5974-4691-b8b8-83e5877528c0",
]);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ORIGINS = new Set([
  "https://appassets.androidplatform.net",
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
]);
const CLEARANCE_MIN_DISCOUNT = 50;
const CACHE_TTL_MS = 12 * 60 * 1000;
const RETAILER_SPECIFIC_ADAPTERS_V1 = true;
const HOME_DEPOT_PENNY_SOURCE = {
  retailer: "Home Depot",
  name: "PennyCentral community penny board",
  url: "https://www.pennycentral.com/penny-list",
  kind: "penny",
  adapter: "pennycentral",
  priority: 130,
};
const PENNY_SOURCES = [
  { retailer: "Dollar General", name: "RetailShout Penny List", url: "https://retailshout.com/latest-dollar-general-penny-items-near-you/", kind: "penny", adapter: "retailshout", priority: 100 },
  { retailer: "Dollar Tree", name: "RetailShout Penny List", url: "https://retailshout.com/latest-dollar-tree-penny-items-near-you/", kind: "penny", adapter: "retailshout", priority: 100 },
];
const RETAIL_SOURCES = [
  { retailer: "Home Depot", name: "Home Depot Deep Tool Savings 1", url: "https://www.homedepot.com/b/Tool-Savings/N-5yc1vZ1z1zuqf?Nao=0&catStyle=ShowProducts", kind: "deep_discount", priority: 105, broad: true },
  { retailer: "Home Depot", name: "Home Depot Deep Tool Savings 2", url: "https://www.homedepot.com/b/Tool-Savings/N-5yc1vZ1z1zuqf?Nao=16&catStyle=ShowProducts", kind: "deep_discount", priority: 104, broad: true },
  { retailer: "Home Depot", name: "Home Depot Daily Deals", url: "https://www.homedepot.com/daily-deals/", kind: "deal", priority: 99 },
  { retailer: "Walmart", name: "Walmart Clearance", url: "https://www.walmart.com/shop/deals/clearance", kind: "clearance", priority: 103, broad: true },
  { retailer: "Walmart", name: "Walmart Tool Clearance", url: "https://www.walmart.com/browse/home-improvement/clearance-tools/1072864_1031899_6846544", kind: "clearance", priority: 102, broad: true },
  { retailer: "Lowe's", name: "Lowe's Savings & Clearance", url: "https://www.lowes.com/l/savings", kind: "clearance", priority: 102, broad: true },
  { retailer: "Lowe's", name: "Lowe's Daily Deals", url: "https://www.lowes.com/l/savings/daily-deals", kind: "deal", priority: 97 },
  { retailer: "Ace Hardware", name: "Ace Clearance", url: "https://www.acehardware.com/clearance?pageSize=180", kind: "clearance", priority: 102, broad: true },
  { retailer: "Ace Hardware", name: "Ace Tool Deals", url: "https://www.acehardware.com/top-power-tool-deals", kind: "deal", priority: 96 },
  { retailer: "Menards", name: "Menards Ray's List", url: "https://www.menards.com/main/b-1957366.htm", kind: "deal", priority: 100, broad: true },
  { retailer: "Menards", name: "Menards Tools & Hardware Sale Items", url: "https://www.menards.com/main/sale-items/tools-hardware-sale-items/c-1642874323047994.htm", kind: "deal", priority: 96, broad: true },
];
const COLLECTION_TITLES: any = {
  "Home Depot": "Home Depot deep tool savings & daily deals",
  "Walmart": "Walmart clearance & rollbacks",
  "Lowe's": "Lowe's clearance & savings",
  "Ace Hardware": "Ace clearance & tool deals",
  "Menards": "Menards Ray's List & sale items",
};
let cache: any = null;
let inflight: Promise<any> | null = null;

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ORIGINS.has(origin) ? origin : "https://appassets.androidplatform.net",
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, max-age=120",
    "vary": "Origin",
  };
}
function json(req: Request, status: number, body: any) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}
async function userId(req: Request) {
  const token = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Sign in required.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SERVICE_KEY } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw new Error("Session expired.");
  return String(payload.id);
}
function decodeHtml(value: any) {
  return String(value || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&dollar;/gi, "$")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function clean(value: any) {
  return decodeHtml(value).replace(/^\*\s*/, "").replace(/^Image:\s*/i, "").replace(/\s+/g, " ").trim();
}
function slug(value: any) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}
function usefulTitle(value: any) {
  const s = clean(value);
  return s.length >= 9 && s.length <= 220 && !/^(add|compare|shop now|view|sort|filter|price|brand|availability|clearance|sale|savings|special buys?|daily deals?|shop all|featured|sponsored)$/i.test(s) && !/^\$?\d+(?:\.\d{1,2})?$/.test(s);
}
function usefulPennyTitle(value: any) {
  const s = clean(value);
  if (s.length < 8 || s.length > 240) return false;
  if (/^(?:fresh signal|community|last seen:?|report find|home depot|check amazon|reported by|filters?|sort|my list|report)$/i.test(s)) return false;
  if (/^\$/.test(s) || /^SKU\s+/i.test(s) || /^\d+\s+(?:reports?|states?)$/i.test(s)) return false;
  if (/^(?:[A-Z]{2}\s+\d+\s*)+(?:\+\d+ more)?$/i.test(s)) return false;
  return true;
}
function resaleFriendly(value: any) {
  return /tool|battery|charger|drill|driver|impact|saw|nailer|grinder|sander|router|vacuum|compressor|generator|mower|blower|trimmer|chainsaw|storage|toolbox|workbench|ladder|grill|smoker|cooler|appliance|electronics|camera|speaker|headphone|tablet|laptop|\btv\b|gaming|console|lego|heater|lighting|faucet|pump|welder|socket|wrench|ratchet|hammer|laser|level|patio|fire pit/i.test(String(value || ""));
}
function resaleScore(title: string, discount = 0, kind = "deal") {
  let score = 66, x = title.toLowerCase();
  if (/milwaukee|dewalt|ryobi|ridgid|makita|bosch|kobalt|craftsman|metabo|greenworks|ego|weber|traeger|blackstone|hart|masterforce/.test(x)) score += 11;
  if (/battery|charger|combo kit|generator|mower|blower|trimmer|chainsaw|vacuum|compressor|storage|toolbox|grill|smoker|electronics|gaming|lego/.test(x)) score += 9;
  if (kind === "penny") score += 12;
  if (discount > CLEARANCE_MIN_DISCOUNT) score += 12;
  return Math.max(45, Math.min(99, Math.round(score + Math.min(14, Math.max(0, discount) / 4))));
}
function pennySignalScore(original: number, reports: number, states: number, title: string) {
  let score = 74;
  if (original >= 50) score += 5;
  if (original >= 150) score += 5;
  if (original >= 300) score += 4;
  score += Math.min(8, Math.floor(Math.log2(Math.max(1, reports)) * 2));
  score += Math.min(5, Math.floor(states / 5));
  if (/milwaukee|ryobi|dewalt|ridgid|makita|husky|klein|weber|traeger|blackstone/i.test(title)) score += 4;
  return Math.max(60, Math.min(99, score));
}
function money(value: any): number {
  if (typeof value === "number" && Number.isFinite(value)) return value > 0 ? value : 0;
  if (typeof value === "string") {
    const match = value.replace(/,/g, "").match(/(?:\$\s*)?(\d{1,7}(?:\.\d{1,2})?)/);
    return match ? Number(match[1]) : 0;
  }
  if (value && typeof value === "object") for (const key of ["price", "value", "amount", "priceValue", "currentPrice", "minPrice", "maxPrice", "displayPrice"]) {
    const n = money(value[key]); if (n) return n;
  }
  return 0;
}
function at(object: any, path: string) {
  let value = object;
  for (const key of path.split(".")) { if (value == null || typeof value !== "object") return undefined; value = value[key]; }
  return value;
}
function firstString(object: any, paths: string[]) {
  for (const path of paths) {
    const value = at(object, path);
    if (typeof value === "string" && value.trim()) return clean(value);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}
function firstPrice(object: any, paths: string[]) {
  for (const path of paths) { const n = money(at(object, path)); if (n) return n; }
  return 0;
}
function retailerProductUrl(retailer: string, base: string, candidate: string) {
  if (!candidate) return "";
  try {
    const url = new URL(decodeHtml(candidate).replace(/\\\//g, "/"), base), host = url.hostname.toLowerCase().replace(/^www\./, ""), path = url.pathname;
    if (url.protocol !== "https:") return "";
    let ok = false;
    if (retailer === "Home Depot") ok = host === "homedepot.com" && /\/p\//i.test(path) && /\/\d{6,}\/?$/i.test(path);
    else if (retailer === "Walmart") ok = host === "walmart.com" && /\/ip\//i.test(path) && /\/\d{6,}\/?$/i.test(path);
    else if (retailer === "Lowe's") ok = host === "lowes.com" && /\/pd\//i.test(path) && /\/\d{6,}\/?$/i.test(path);
    else if (retailer === "Ace Hardware") ok = host === "acehardware.com" && /\/departments\//i.test(path) && /\d{5,}\/?$/i.test(path);
    else if (retailer === "Menards") ok = host === "menards.com" && /\/main\//i.test(path) && /\/p-\d+/i.test(path);
    if (!ok) return "";
    url.search = ""; url.hash = ""; return url.toString();
  } catch { return ""; }
}
function reportedDiscount(object: any, current: number, reference: number) {
  for (const path of ["discountPercent", "percentOff", "savingsPercent", "discount.percent", "priceInfo.savingsPercent", "pricing.savingsPercent"]) {
    const n = Number(String(at(object, path) || "").replace(/[^0-9.]/g, ""));
    if (n > 0 && n <= 100) return Math.round(n);
  }
  return current > 0 && reference > current ? Math.round((1 - current / reference) * 100) : 0;
}
function normalizedRetailLead(source: any, fields: any) {
  const title = clean(fields.title), productUrl = retailerProductUrl(source.retailer, source.url, fields.productUrl), current = Number(fields.current || 0), original = Number(fields.original || 0);
  if (!usefulTitle(title) || !productUrl || !(current > 0)) return null;
  if (!source.broad && !resaleFriendly(title)) return null;
  const pairPct = original > current ? Math.round((1 - current / original) * 100) : 0;
  const discount = pairPct || Math.max(0, Math.min(100, Math.round(Number(fields.discount || 0))));
  const deep = original > current && pairPct > CLEARANCE_MIN_DISCOUNT;
  const strictDeep = source.kind === "clearance" || source.kind === "deep_discount";
  if (strictDeep && !deep) return null;
  return {
    id: `${slug(source.retailer)}:${clean(fields.sku || "") || clean(fields.upc || "") || slug(title)}`,
    retailer: source.retailer, title, sku: clean(fields.sku || ""), upc: clean(fields.upc || "").replace(/\D/g, ""),
    buy_price: current, original_price: original, discount_pct: discount, deep_discount: deep,
    deal_type: source.kind === "deep_discount" ? "clearance" : source.kind, penny_date: "",
    source_name: source.name, source_url: productUrl,
    availability_label: strictDeep ? "Deep discount over 50% from retailer current/was price · local stock not checked by H38" : "Priced retailer product page · local stock not checked by H38",
    resale_potential: resaleScore(title, discount, source.kind), source_priority: source.priority,
    stock_status: "not_checked", stock_count: null, stock_checked: false,
  };
}
const CFG: any = {
  "Home Depot": { t: ["identifiers.productLabel", "productLabel", "productName", "name", "title", "displayName", "product.name"], u: ["canonicalUrl", "productUrl", "productURL", "productPageUrl", "url", "link", "itemUrl", "identifiers.canonicalUrl"], c: ["pricing.value", "pricing.currentPrice", "pricing.specialBuyPrice", "pricing.price", "priceInfo.currentPrice.price", "currentPrice", "offers.price", "price.value", "price"], r: ["pricing.original", "pricing.was", "pricing.wasPrice", "pricing.regularPrice", "pricing.listPrice", "priceInfo.wasPrice.price", "wasPrice", "originalPrice", "regularPrice", "listPrice"], s: ["identifiers.modelNumber", "modelNumber", "modelNo", "sku", "identifiers.itemId", "itemId", "productId"], g: ["identifiers.upcGtin13", "identifiers.upc", "upc", "gtin13", "gtin12", "gtin"] },
  "Walmart": { t: ["name", "productName", "title", "displayName", "item.name"], u: ["canonicalUrl", "productUrl", "productURL", "productPageUrl", "url", "link", "itemUrl", "canonicalURL"], c: ["priceInfo.currentPrice.price", "priceInfo.currentPrice", "price.currentPrice", "currentPrice.price", "currentPrice", "salePrice", "offerPrice", "price.value", "price"], r: ["priceInfo.wasPrice.price", "priceInfo.wasPrice", "priceInfo.listPrice.price", "wasPrice", "originalPrice", "regularPrice", "listPrice", "strikeThroughPrice"], s: ["usItemId", "itemId", "productId", "sku", "offerId"], g: ["upc", "gtin13", "gtin12", "gtin"] },
  "Lowe's": { t: ["productInfo.description", "productInfo.title", "productInfo.name", "productName", "name", "title", "displayName"], u: ["productInfo.productUrl", "productInfo.productPageUrl", "canonicalUrl", "productUrl", "productPageUrl", "url", "link"], c: ["pricing.salePrice", "pricing.currentPrice", "pricing.price", "priceInfo.currentPrice.price", "currentPrice", "salePrice", "offerPrice", "price.value", "price"], r: ["pricing.wasPrice", "pricing.regularPrice", "pricing.retailPrice", "pricing.listPrice", "priceInfo.wasPrice.price", "wasPrice", "originalPrice", "regularPrice", "listPrice"], s: ["productInfo.modelId", "productInfo.modelNumber", "productInfo.omniItemId", "modelNumber", "itemNumber", "sku", "productId"], g: ["productInfo.upc", "upc", "gtin13", "gtin12", "gtin"] },
  "Ace Hardware": { t: ["productName", "name", "title", "displayName", "product.name"], u: ["canonicalUrl", "productUrl", "productURL", "productPageUrl", "url", "link", "pdpUrl"], c: ["salePrice", "pricing.salePrice", "pricing.currentPrice", "price.current", "currentPrice", "offers.price", "price.value", "price"], r: ["standardPrice", "pricing.standardPrice", "pricing.regularPrice", "pricing.listPrice", "wasPrice", "originalPrice", "regularPrice", "listPrice"], s: ["productId", "productID", "sku", "itemId", "id"], g: ["upc", "gtin13", "gtin12", "gtin"] },
  "Menards": { t: ["productName", "name", "title", "displayName", "product.name"], u: ["canonicalUrl", "productUrl", "productURL", "productPageUrl", "url", "link", "pdpUrl"], c: ["salePrice", "pricing.salePrice", "pricing.currentPrice", "currentPrice", "offerPrice", "offers.price", "price.value", "price"], r: ["regularPrice", "pricing.regularPrice", "pricing.listPrice", "wasPrice", "originalPrice", "listPrice"], s: ["sku", "productId", "productID", "itemId", "modelNumber"], g: ["upc", "gtin13", "gtin12", "gtin"] },
};
function adapt(object: any, source: any) {
  const cfg = CFG[source.retailer], current = firstPrice(object, cfg.c), original = firstPrice(object, cfg.r);
  return normalizedRetailLead(source, { title: firstString(object, cfg.t), productUrl: firstString(object, cfg.u), current, original, sku: firstString(object, cfg.s), upc: firstString(object, cfg.g), discount: reportedDiscount(object, current, original) });
}
function homeDepotAdapter(object: any, source: any) { return adapt(object, source); }
function walmartAdapter(object: any, source: any) { return adapt(object, source); }
function lowesAdapter(object: any, source: any) { return adapt(object, source); }
function aceAdapter(object: any, source: any) { return adapt(object, source); }
function menardsAdapter(object: any, source: any) { return adapt(object, source); }
const RETAILER_ADAPTERS: any = { "Home Depot": homeDepotAdapter, "Walmart": walmartAdapter, "Lowe's": lowesAdapter, "Ace Hardware": aceAdapter, "Menards": menardsAdapter };
function walk(root: any, source: any, out: any[], seen: WeakSet<object>, count: { n: number }) {
  if (!root || count.n > 90000 || out.length > 180) return;
  if (Array.isArray(root)) { for (const value of root) walk(value, source, out, seen, count); return; }
  if (typeof root !== "object" || seen.has(root)) return;
  seen.add(root); count.n++;
  const lead = RETAILER_ADAPTERS[source.retailer]?.(root, source); if (lead) out.push(lead);
  for (const value of Object.values(root)) { if (value && typeof value === "object") walk(value, source, out, seen, count); if (count.n > 90000 || out.length > 180) return; }
}
function jsonProducts(html: string, source: any) {
  const out: any[] = []; let n = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (n++ > 100 || out.length > 160) break;
    const attrs = match[1] || "", body = decodeHtml((match[2] || "").trim());
    if (!body || body.length > 9_000_000) continue;
    if (!/application\/(?:ld\+json|json)/i.test(attrs) && !/__NEXT_DATA__|__APOLLO_STATE__|preloaded|initial-state|initialState|__PRELOADED_STATE__/i.test(attrs) && !/^[\[{]/.test(body)) continue;
    try { walk(JSON.parse(body), source, out, new WeakSet(), { n: 0 }); } catch {}
  }
  return out;
}
function visibleText(html: string) {
  return clean(decodeHtml(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}
function attr(attrs: string, name: string) {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeHtml(match?.[1] || match?.[2] || match?.[3] || "");
}
function price(text: string, rules: RegExp[]) {
  for (const rule of rules) { const match = text.match(rule); if (match) return Number(match[1].replace(/,/g, "")); }
  return 0;
}
function firstDollar(text: string) {
  const match = text.match(/\$\s*([0-9]{1,7}(?:,[0-9]{3})*(?:\.\d{1,2})?)/);
  return match ? Number(match[1].replace(/,/g, "")) : 0;
}
function htmlProducts(html: string, source: any) {
  const anchors: any[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (match.index == null) continue;
    const url = retailerProductUrl(source.retailer, source.url, attr(match[1] || "", "href"));
    if (url) anchors.push({ url, index: match.index, end: match.index + match[0].length, label: clean(attr(match[1] || "", "aria-label") || attr(match[1] || "", "title")), inner: visibleText(match[2] || "") });
  }
  const out: any[] = [], used = new Set<string>();
  for (let i = 0; i < anchors.length && out.length < 120; i++) {
    const anchor = anchors[i]; if (used.has(anchor.url)) continue; used.add(anchor.url);
    let j = i + 1; while (j < anchors.length && anchors[j].url === anchor.url) j++;
    const text = visibleText(html.slice(anchor.index, Math.min(j < anchors.length ? anchors[j].index : anchor.end + 9000, anchor.index + 14000)));
    const title = [anchor.label, anchor.inner].map((x: string) => clean(x.replace(/^(?:best seller|clearance|deal|rollback|sponsored|new)\s+/i, "").replace(/\s+\$[\s\S]*$/, ""))).find(usefulTitle) || "";
    if (!title) continue;
    const current = price(text, [/(?:current price|special buy|now|sale price|clearance price|your price|new lower price|after rebate)\s*\$\s*([0-9,.]+)/i]) || firstDollar(anchor.label || anchor.inner || text);
    const original = price(text, [/(?:was|regular price|original price|list price)\s*\$\s*([0-9,.]+)/i]);
    let sku = "";
    if (source.retailer === "Home Depot") sku = clean(text.match(/Model#\s*([A-Za-z0-9._\-/]+)/i)?.[1] || "");
    else if (source.retailer === "Menards") sku = anchor.url.match(/\/p-(\d+)/i)?.[1] || "";
    else sku = anchor.url.match(/\/(\d{5,})\/?$/)?.[1] || "";
    const lead = normalizedRetailLead(source, { title, productUrl: anchor.url, current, original, sku }); if (lead) out.push(lead);
  }
  return out;
}
function visibleLines(html: string) {
  return decodeHtml(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>|<\/tr>|<\/article>|<\/section>|<\/button>/gi, "\n").replace(/<[^>]+>/g, " ")).split(/\r?\n/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
}
function retailShoutPennyLeads(html: string, source: any) {
  const lines = visibleLines(html), out: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    const date = lines[i].match(/^(?:Penny Date|Date Pennied):\s*(.+)$/i); if (!date) continue;
    let title = "", sku = "", upc = "";
    for (let j = i - 1; j >= Math.max(0, i - 7); j--) if (usefulTitle(lines[j])) { title = clean(lines[j]).replace(/^\d+[.)]\s*/, ""); break; }
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 10); j++) {
      const match = lines[j].match(/SKU:\s*([A-Za-z0-9-]+).*?UPC:\s*([0-9]{7,14})/i); if (match) { sku = match[1]; upc = match[2]; break; }
    }
    if (title && upc) out.push({ id: `${slug(source.retailer)}:${upc}`, retailer: source.retailer, title, sku, upc, buy_price: 0.01, original_price: 0, discount_pct: 99, deep_discount: true, deal_type: "penny", penny_date: date[1].trim(), source_name: source.name, source_url: source.url, availability_label: "Chain penny lead · source does not show dependable local stock", resale_potential: resaleScore(title, 99, "penny"), source_priority: source.priority, stock_status: "not_shown", stock_count: null, stock_checked: false });
  }
  return out;
}
function dollars(value: string) {
  return [...String(value || "").matchAll(/\$\s*([0-9]{1,7}(?:,[0-9]{3})*(?:\.\d{1,2})?)/g)].map((m) => Number(m[1].replace(/,/g, ""))).filter((n) => Number.isFinite(n) && n >= 0);
}
function pennyCentralLeads(html: string, source: any) {
  const lines = visibleLines(html), found: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    const skuMatch = lines[i].match(/^SKU\s+([0-9][0-9-]{4,20})$/i); if (!skuMatch) continue;
    const sku = skuMatch[1], skuDigits = sku.replace(/\D/g, ""); if (skuDigits.length < 5) continue;
    let title = "", originalPrice = 0;
    for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
      const amounts = dollars(lines[j]);
      if (amounts.length) { for (const amount of amounts) if (amount > originalPrice) originalPrice = amount; continue; }
      if (!title && usefulPennyTitle(lines[j])) title = clean(lines[j]);
    }
    if (!title) continue;
    let lastSeen = "Recent", reports = 0, states = 0, stateSummary = "";
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 18); j++) {
      if (/^Last seen:?$/i.test(lines[j]) && lines[j + 1]) lastSeen = clean(lines[j + 1]);
      const reportMatch = lines[j].match(/^(\d{1,5})\s+reports?$/i); if (reportMatch) reports = Number(reportMatch[1]);
      const stateMatch = lines[j].match(/^(\d{1,3})\s+states?$/i); if (stateMatch) states = Number(stateMatch[1]);
      if (!stateSummary && /^(?:[A-Z]{2}\s+\d+\s*)+(?:\+\d+ more)?$/i.test(lines[j])) stateSummary = clean(lines[j]);
    }
    found.push({
      id: `home-depot:${skuDigits}`, retailer: "Home Depot", title, sku, upc: "",
      buy_price: 0, reported_penny_price: 0.01, original_price: originalPrice,
      discount_pct: originalPrice > 0.01 ? Math.round((1 - 0.01 / originalPrice) * 100) : 99,
      deep_discount: true, deal_type: "penny", penny_date: lastSeen, community_penny: true,
      source_name: source.name, source_url: source.url,
      home_depot_search_url: `https://www.homedepot.com/s/${encodeURIComponent(skuDigits)}`,
      availability_label: `Community penny candidate · ${reports || 1} report${reports === 1 ? "" : "s"}${states ? ` · ${states} state${states === 1 ? "" : "s"}` : ""} · last seen ${lastSeen}. Not a confirmed local $0.01 price until the opened store check verifies it.`,
      resale_potential: pennySignalScore(originalPrice, reports, states, title), source_priority: source.priority,
      community_reports: reports, community_states: states, state_summary: stateSummary,
      stock_status: "not_checked", stock_count: null, stock_checked: false,
    });
  }
  const deduped = new Map<string, any>();
  for (const lead of found) { const previous = deduped.get(lead.id); if (!previous || lead.community_reports > previous.community_reports) deduped.set(lead.id, lead); }
  return [...deduped.values()].sort((a, b) => Number(b.community_reports || 0) - Number(a.community_reports || 0) || Number(b.community_states || 0) - Number(a.community_states || 0) || Number(b.original_price || 0) - Number(a.original_price || 0)).slice(0, 80);
}
function dedupe(leads: any[]) {
  const map = new Map<string, any>();
  for (const lead of leads) {
    if (lead.deal_type === "penny") { if (!(lead.upc || lead.sku)) continue; }
    else {
      if (!(Number(lead.buy_price) > 0) || !retailerProductUrl(lead.retailer, lead.source_url, lead.source_url)) continue;
      if (lead.deal_type === "clearance" && !(Number(lead.original_price) > Number(lead.buy_price) && Number(lead.discount_pct) > CLEARANCE_MIN_DISCOUNT)) continue;
    }
    const key = `${slug(lead.retailer)}|${lead.upc || lead.sku || slug(lead.title)}`, existing = map.get(key);
    if (!existing || Number(lead.deep_discount) > Number(existing.deep_discount) || lead.source_priority > existing.source_priority || lead.discount_pct > existing.discount_pct) map.set(key, lead);
  }
  const groups = new Map<string, any[]>();
  for (const lead of map.values()) { const items = groups.get(lead.retailer) || []; items.push(lead); groups.set(lead.retailer, items); }
  const out: any[] = [];
  for (const items of groups.values()) {
    items.sort((a, b) => Number(b.deep_discount) - Number(a.deep_discount) || b.discount_pct - a.discount_pct || b.resale_potential - a.resale_potential);
    out.push(...items.slice(0, 70));
  }
  return out;
}
function rollup(retailer: string) {
  const source = RETAIL_SOURCES.filter((x) => x.retailer === retailer).sort((a, b) => b.priority - a.priority)[0];
  return { id: `${slug(retailer)}:sale-list`, retailer, title: COLLECTION_TITLES[retailer] || `${retailer} sale list`, sku: "", upc: "", buy_price: 0, original_price: 0, discount_pct: 0, deep_discount: false, deal_type: "sale_list", penny_date: "", source_name: source.name, source_url: source.url, availability_label: "Broad retailer sale list · H38 did not validate individual product rows from this source", resale_potential: 0, source_priority: source.priority, source_only: true, stock_status: "not_checked", stock_count: null, stock_checked: false };
}
async function fetchSource(source: any) {
  const response = await fetch(source.url, {
    headers: { "user-agent": "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 H38ResellerScout/0.1.14", "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" },
    redirect: "follow", signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error(`${source.name} returned ${response.status}`);
  const html = await response.text();
  let leads: any[] = [];
  if (source.adapter === "pennycentral") leads = pennyCentralLeads(html, source);
  else if (source.kind === "penny") leads = retailShoutPennyLeads(html, source);
  else leads = dedupe([...jsonProducts(html, source), ...htmlProducts(html, source)]);
  if (!leads.length) throw new Error(`${source.name} returned no product rows matching truthful hunt rules`);
  return leads;
}
async function buildPayload() {
  const sources = [HOME_DEPOT_PENNY_SOURCE, ...PENNY_SOURCES, ...RETAIL_SOURCES];
  const results = await Promise.allSettled(sources.map(fetchSource));
  const pennyOut: any[] = [], retailOut: any[] = [], warnings: string[] = [], sourceStatus: any[] = [];
  results.forEach((result, index) => {
    const source = sources[index];
    if (result.status === "fulfilled") {
      (source.kind === "penny" ? pennyOut : retailOut).push(...result.value);
      sourceStatus.push({ retailer: source.retailer, source: source.name, kind: source.kind, status: "PASS", products: result.value.length, adapter: source.adapter || source.retailer });
    } else {
      const warning = result.reason instanceof Error ? result.reason.message : String(result.reason);
      warnings.push(warning);
      sourceStatus.push({ retailer: source.retailer, source: source.name, kind: source.kind, status: "NO_MATCHING_PRODUCTS", products: 0, adapter: source.adapter || source.retailer, warning });
    }
  });
  const pennies = dedupe(pennyOut), priced = dedupe(retailOut);
  const retailers = [...new Set(RETAIL_SOURCES.map((x) => x.retailer))];
  const rollups = retailers.filter((retailer) => !priced.some((lead) => lead.retailer === retailer)).map(rollup);
  const leads = [...pennies, ...priced, ...rollups].sort((a, b) => Number(a.source_only) - Number(b.source_only) || Number(b.deep_discount) - Number(a.deep_discount) || b.discount_pct - a.discount_pct || b.source_priority - a.source_priority || b.resale_potential - a.resale_potential);
  if (!leads.length) throw new Error(warnings.join("; ") || "Automatic deal sources unavailable.");
  const byRetailer: any = {}, deepByRetailer: any = {};
  for (const lead of leads) { byRetailer[lead.retailer] = (byRetailer[lead.retailer] || 0) + 1; if (lead.deep_discount) deepByRetailer[lead.retailer] = (deepByRetailer[lead.retailer] || 0) + 1; }
  console.log("reseller-auto-leads multi-retailer-plus-hd-penny-v1", JSON.stringify({ by_retailer: byRetailer, deep_by_retailer: deepByRetailer, source_status: sourceStatus, retailer_specific_adapters: RETAILER_SPECIFIC_ADAPTERS_V1 }));
  return {
    status: "PASS", generated_at: new Date().toISOString(), count: leads.length,
    retailers: [...new Set(leads.map((x) => x.retailer))], by_retailer: byRetailer, deep_by_retailer: deepByRetailer,
    leads, source_status: sourceStatus, warnings,
    adapter_version: "multi-retailer-plus-home-depot-penny-v1",
    clearance_rule: `Clearance/deep-discount items require a current price, a higher was/reference price, a retailer product-page URL, and more than ${CLEARANCE_MIN_DISCOUNT}% off.`,
    stock_rule: "Penny candidates remain visible when stock is unknown. Home Depot community penny candidates are not locally confirmed until an opened-store check returns store-bound evidence. Other retailers retain their existing store-specific stock behavior.",
    note: "Old multi-retailer product adapters and penny feeds are preserved. Home Depot PennyCentral candidates are additive and use SKU-based store checks rather than replacing the retailer deal feed.",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "GET" && req.method !== "POST") return json(req, 405, { error: "GET or POST required." });
  try {
    const id = await userId(req);
    if (!ALLOWED.has(id)) return json(req, 403, { error: "Not authorized." });
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return json(req, 200, { ...cache.payload, cached: true });
    if (!inflight) inflight = buildPayload().then((payload) => { cache = { at: Date.now(), payload }; return payload; }).finally(() => { inflight = null; });
    return json(req, 200, await inflight);
  } catch (error) {
    if (cache) return json(req, 200, { ...cache.payload, cached: true, stale: true, warning: error instanceof Error ? error.message : String(error) });
    return json(req, 503, { error: error instanceof Error ? error.message : String(error) });
  }
});