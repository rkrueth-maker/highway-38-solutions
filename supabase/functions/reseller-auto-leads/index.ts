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

const PENNY_SOURCES = [
  { retailer: "Dollar General", name: "RetailShout Penny List", url: "https://retailshout.com/latest-dollar-general-penny-items-near-you/", kind: "penny", priority: 100 },
  { retailer: "Dollar Tree", name: "RetailShout Penny List", url: "https://retailshout.com/latest-dollar-tree-penny-items-near-you/", kind: "penny", priority: 100 },
];

const RETAIL_SOURCES = [
  { retailer: "Home Depot", name: "Home Depot Clearance", url: "https://www.homedepot.com/c/clearance/", kind: "clearance", priority: 103, broad: true },
  { retailer: "Home Depot", name: "Home Depot Appliance Clearance", url: "https://www.homedepot.com/c/Appliance_Clearance_Sale", kind: "clearance", priority: 102, broad: true },
  { retailer: "Home Depot", name: "Home Depot Daily Deals", url: "https://www.homedepot.com/daily-deals/", kind: "deal", priority: 99 },
  { retailer: "Home Depot", name: "Home Depot Tool Savings", url: "https://www.homedepot.com/b/Tool-Savings/N-5yc1vZ1z1zuqf", kind: "deal", priority: 98 },

  { retailer: "Walmart", name: "Walmart Clearance", url: "https://www.walmart.com/shop/deals/clearance", kind: "clearance", priority: 102, broad: true },
  { retailer: "Walmart", name: "Walmart Tool Clearance", url: "https://www.walmart.com/browse/home-improvement/clearance-tools/1072864_1031899_6846544", kind: "clearance", priority: 101, broad: true },

  { retailer: "Lowe's", name: "Lowe's Savings & Clearance", url: "https://www.lowes.com/l/savings", kind: "clearance", priority: 101, broad: true },
  { retailer: "Lowe's", name: "Lowe's Daily Deals", url: "https://www.lowes.com/l/savings/daily-deals", kind: "deal", priority: 97 },

  { retailer: "Ace Hardware", name: "Ace Clearance", url: "https://www.acehardware.com/clearance?pageSize=60", kind: "clearance", priority: 101, broad: true },
  { retailer: "Ace Hardware", name: "Ace Tool Deals", url: "https://www.acehardware.com/top-power-tool-deals", kind: "deal", priority: 96 },

  { retailer: "Menards", name: "Menards Ray's List", url: "https://www.menards.com/main/b-1957366.htm", kind: "in_store_bargain", priority: 100, broad: true },
  { retailer: "Menards", name: "Menards Tools & Hardware Sale Items", url: "https://www.menards.com/main/sale-items/tools-hardware-sale-items/c-1642874323047994.htm", kind: "deal", priority: 96, broad: true },
];

const COLLECTION_TITLES = {
  "Home Depot": "Home Depot clearance & sale list",
  "Walmart": "Walmart clearance & rollbacks",
  "Lowe's": "Lowe's clearance & savings",
  "Ace Hardware": "Ace clearance & tool deals",
  "Menards": "Menards Ray's List & sale items",
};

let cache = null;
let inflight = null;

function cors(req) {
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
function json(req, status, body) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}
async function userId(req) {
  const token = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Sign in required.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: SERVICE_KEY },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw new Error("Session expired.");
  return String(payload.id);
}
function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}
function clean(value) {
  return decodeHtml(value).replace(/^\*\s*/, "").replace(/^Image:\s*/i, "").replace(/\s+/g, " ").trim();
}
function usefulTitle(value) {
  const text = clean(value);
  return text.length >= 9 &&
    text.length <= 220 &&
    !/^(add|compare|shop now|view|sort|filter|all filters|price|brand|availability|category|get it fast|showing|load more|clear all|image|sponsored|free shipping|pickup|delivery|shipping|deals by|shop by|top categories|sign in|create account|see more options|expert installation|rollback|rollbacks|clearance|sale|savings|special buys?|daily deals?|shop all|featured|best sellers?|recommended|related products?)$/i.test(text) &&
    !/^\$?\d+(?:\.\d{1,2})?$/.test(text) &&
    !/^was\s*\$?|^save\s*\$?/i.test(text);
}
function resaleFriendly(value) {
  return /tool|battery|charger|drill|driver|impact|saw|nailer|grinder|sander|router|vacuum|compressor|generator|mower|blower|trimmer|chainsaw|pressure washer|storage|toolbox|workbench|ladder|grill|smoker|cooler|appliance|electronics|camera|speaker|headphone|tablet|laptop|\btv\b|gaming|console|lego|outdoor power|snow blower|air conditioner|heater|dehumidifier|fan|lighting|faucet|fixture|pump|welder|socket|wrench|ratchet|screwdriver|hammer|laser|level|shop vac|patio|fire pit/i.test(String(value || ""));
}
function resaleScore(title, discount = 0, kind = "deal") {
  let score = 66;
  const text = String(title || "").toLowerCase();
  if (/milwaukee|dewalt|ryobi|ridgid|makita|bosch|kobalt|craftsman|metabo|greenworks|ego|weber|traeger|blackstone|stanley|hart|masterforce/.test(text)) score += 11;
  if (/battery|charger|combo kit|tool kit|generator|mower|blower|trimmer|chainsaw|vacuum|compressor|storage|toolbox|workbench|grill|smoker|electronics|gaming|lego/.test(text)) score += 9;
  if (kind === "penny") score += 12;
  if (kind === "in_store_bargain") score += 8;
  if (discount > 50) score += 12;
  score += Math.min(14, Math.max(0, discount) / 4);
  return Math.max(45, Math.min(99, Math.round(score)));
}
function money(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value > 0 ? value : 0;
  if (typeof value === "string") {
    const match = value.replace(/,/g, "").match(/(?:\$\s*)?(\d{1,7}(?:\.\d{1,2})?)/);
    return match ? Number(match[1]) : 0;
  }
  if (value && typeof value === "object") {
    for (const key of ["price", "value", "amount", "priceValue", "currentPrice", "minPrice", "maxPrice"]) {
      const parsed = money(value[key]);
      if (parsed) return parsed;
    }
  }
  return 0;
}
function at(obj, path) {
  let value = obj;
  for (const key of path.split(".")) {
    if (value == null || typeof value !== "object") return undefined;
    value = value[key];
  }
  return value;
}
function firstString(obj, paths) {
  for (const path of paths) {
    const value = at(obj, path);
    if (typeof value === "string" && value.trim()) return clean(value);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}
function firstPrice(obj, paths) {
  for (const path of paths) {
    const value = money(at(obj, path));
    if (value) return value;
  }
  return 0;
}
function absoluteUrl(base, candidate) {
  try { return candidate ? new URL(candidate, base).toString() : base; } catch { return base; }
}
function discount(obj, current, original) {
  for (const path of ["discountPercent", "percentOff", "savingsPercent", "discount.percent", "priceInfo.savingsPercent"]) {
    const n = Number(String(at(obj, path) || "").replace(/[^0-9.]/g, ""));
    if (n > 0 && n <= 100) return Math.round(n);
  }
  return current > 0 && original > current ? Math.round((1 - current / original) * 100) : 0;
}
function visibleLines(html) {
  return decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>|<\/tr>|<\/article>|<\/section>|<\/button>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  ).split(/\r?\n/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
}
function pennyLeads(html, source) {
  const lines = visibleLines(html);
  const output = [];
  for (let i = 0; i < lines.length; i++) {
    const dateMatch = lines[i].match(/^(?:Penny Date|Date Pennied):\s*(.+)$/i);
    if (!dateMatch) continue;
    let title = "";
    for (let j = i - 1; j >= Math.max(0, i - 7); j--) {
      if (usefulTitle(lines[j])) { title = clean(lines[j]).replace(/^\d+[.)]\s*/, ""); break; }
    }
    let sku = "", upc = "";
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 10); j++) {
      const match = lines[j].match(/SKU:\s*([A-Za-z0-9-]+).*?UPC:\s*([0-9]{7,14})/i);
      if (match) { sku = match[1]; upc = match[2]; break; }
    }
    if (!title || !upc) continue;
    output.push({
      id: `${slug(source.retailer)}:${upc}`,
      retailer: source.retailer,
      title,
      sku,
      upc,
      buy_price: 0.01,
      original_price: 0,
      discount_pct: 99,
      deal_type: "penny",
      penny_date: dateMatch[1].trim(),
      source_name: source.name,
      source_url: source.url,
      availability_label: "Chain penny lead · local shelf availability unknown",
      resale_potential: resaleScore(title, 99, "penny"),
      source_priority: source.priority,
      stock_status: "unknown",
      stock_count: null,
    });
  }
  return output;
}
function objectLead(obj, source) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const title = firstString(obj, ["productName", "name", "title", "displayName", "product.name", "item.name"]);
  if (!usefulTitle(title)) return null;
  const sku = firstString(obj, ["sku", "modelNumber", "modelNo", "model", "productId", "productID", "usItemId", "itemId"]);
  const upc = firstString(obj, ["upc", "gtin13", "gtin12", "gtin", "product.upc"]).replace(/\D/g, "");
  const productUrl = firstString(obj, ["canonicalUrl", "productUrl", "productURL", "productPageUrl", "url", "link", "itemUrl"]);
  const current = firstPrice(obj, [
    "priceInfo.currentPrice.price", "priceInfo.currentPrice", "currentPrice.price", "currentPrice",
    "salePrice.price", "salePrice", "offerPrice", "finalPrice", "pricing.currentPrice", "pricing.price",
    "offers.price", "offers.lowPrice", "price.price", "price.value", "price",
  ]);
  if (!(current > 0)) return null;
  const shape = !!sku || !!upc || !!productUrl || String(obj["@type"] || "").toLowerCase() === "product" || resaleFriendly(title);
  if (!shape || (!source.broad && !resaleFriendly(title))) return null;
  const original = firstPrice(obj, [
    "priceInfo.wasPrice.price", "priceInfo.wasPrice", "wasPrice.price", "wasPrice",
    "originalPrice.price", "originalPrice", "regularPrice", "listPrice", "strikeThroughPrice",
    "comparisonPrice", "offers.highPrice",
  ]);
  const pct = discount(obj, current, original);
  return {
    id: `${slug(source.retailer)}:${sku || upc || slug(title)}`,
    retailer: source.retailer,
    title,
    sku,
    upc,
    buy_price: current,
    original_price: original,
    discount_pct: pct,
    deep_discount: pct > CLEARANCE_MIN_DISCOUNT,
    deal_type: source.kind,
    penny_date: "",
    source_name: source.name,
    source_url: absoluteUrl(source.url, productUrl),
    availability_label: source.kind === "clearance"
      ? "Deep-clearance candidate · must verify local price/stock"
      : "Priced retailer item · local price and stock may vary",
    resale_potential: resaleScore(title, pct, source.kind),
    source_priority: source.priority,
    stock_status: "unknown",
    stock_count: null,
  };
}
function walk(root, source, output, seen, counter) {
  if (!root || counter.value > 90000 || output.length > 180) return;
  if (Array.isArray(root)) {
    for (const value of root) walk(value, source, output, seen, counter);
    return;
  }
  if (typeof root !== "object" || seen.has(root)) return;
  seen.add(root);
  counter.value++;
  const lead = objectLead(root, source);
  if (lead) output.push(lead);
  for (const value of Object.values(root)) {
    if (value && typeof value === "object") walk(value, source, output, seen, counter);
    if (counter.value > 90000 || output.length > 180) return;
  }
}
function jsonProducts(html, source) {
  const output = [];
  let checked = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (checked++ > 100 || output.length > 160) break;
    const attrs = match[1] || "";
    const body = decodeHtml((match[2] || "").trim());
    if (!body || body.length > 8_000_000) continue;
    if (!/application\/(?:ld\+json|json)/i.test(attrs) &&
        !/__NEXT_DATA__|__APOLLO_STATE__|preloaded|initial-state|initialState/i.test(attrs) &&
        !/^[\[{]/.test(body)) continue;
    try { walk(JSON.parse(body), source, output, new WeakSet(), { value: 0 }); } catch {}
  }
  return output;
}
function visibleProducts(html, source) {
  const lines = visibleLines(html);
  const output = [];
  const seen = new Set();
  for (let i = 0; i < lines.length && output.length < 45; i++) {
    const title = clean(lines[i]);
    if (!usefulTitle(title) || (!source.broad && !resaleFriendly(title))) continue;
    let sku = "", current = 0, original = 0, pct = 0;
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 10); j++) {
      let match = lines[j].match(/(?:Model#|Model #|Item #|SKU:?)\s*([A-Za-z0-9._-]+)/i);
      if (match && !sku) sku = match[1];
      match = lines[j].match(/(?:Now|Sale Price|current price)\s*\$?\s*(\d{1,7})(?:[ .](\d{2}))?/i);
      if (match && !current) current = Number(`${match[1]}.${match[2] || "00"}`);
      match = lines[j].match(/(?:Was|regular price|original price)\s*\$?\s*(\d{1,7})(?:[ .](\d{2}))?/i);
      if (match && !original) original = Number(`${match[1]}.${match[2] || "00"}`);
      match = lines[j].match(/(?:Save[^%]{0,50}|off\s*)\(?\s*(\d{1,2})\s*%\)?/i);
      if (match) pct = Math.max(pct, Number(match[1]));
    }
    if (!(current > 0) || (!sku && !resaleFriendly(title))) continue;
    if (!pct && original > current) pct = Math.round((1 - current / original) * 100);
    const key = sku || slug(title);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({
      id: `${slug(source.retailer)}:${key}`,
      retailer: source.retailer,
      title,
      sku,
      upc: "",
      buy_price: current,
      original_price: original,
      discount_pct: pct,
      deep_discount: pct > CLEARANCE_MIN_DISCOUNT,
      deal_type: source.kind,
      penny_date: "",
      source_name: source.name,
      source_url: source.url,
      availability_label: source.kind === "clearance"
        ? "Deep-clearance candidate · must verify local price/stock"
        : "Priced retailer item · local price and stock may vary",
      resale_potential: resaleScore(title, pct, source.kind),
      source_priority: source.priority,
      stock_status: "unknown",
      stock_count: null,
    });
  }
  return output;
}
function dedupe(leads) {
  const merged = new Map();
  for (const lead of leads) {
    if (lead.deal_type !== "penny" && !(Number(lead.buy_price) > 0)) continue;
    if (lead.deal_type === "clearance" && !(Number(lead.discount_pct) > CLEARANCE_MIN_DISCOUNT)) continue;
    const key = `${slug(lead.retailer)}|${lead.upc || lead.sku || slug(lead.title)}`;
    const existing = merged.get(key);
    if (!existing ||
        Number(lead.deep_discount) > Number(existing.deep_discount) ||
        lead.source_priority > existing.source_priority ||
        lead.discount_pct > existing.discount_pct) {
      merged.set(key, lead);
    }
  }
  const grouped = new Map();
  for (const lead of merged.values()) {
    const bucket = grouped.get(lead.retailer) || [];
    bucket.push(lead);
    grouped.set(lead.retailer, bucket);
  }
  const output = [];
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) =>
      Number(b.deep_discount) - Number(a.deep_discount) ||
      b.discount_pct - a.discount_pct ||
      b.resale_potential - a.resale_potential
    );
    output.push(...bucket.slice(0, 70));
  }
  return output;
}
function rollup(retailer) {
  const source = RETAIL_SOURCES.filter((x) => x.retailer === retailer).sort((a, b) => b.priority - a.priority)[0];
  return {
    id: `${slug(retailer)}:sale-list`,
    retailer,
    title: COLLECTION_TITLES[retailer] || `${retailer} sale list`,
    sku: "",
    upc: "",
    buy_price: 0,
    original_price: 0,
    discount_pct: 0,
    deal_type: "sale_list",
    penny_date: "",
    source_name: source.name,
    source_url: source.url,
    availability_label: "Broad sale / clearance list · open retailer page to browse all items",
    resale_potential: 0,
    source_priority: source.priority,
    source_only: true,
    stock_status: "unknown",
    stock_count: null,
  };
}
async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 H38ResellerScout/0.1.8",
      "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${source.name} returned ${response.status}`);
  const html = await response.text();
  const leads = source.kind === "penny"
    ? pennyLeads(html, source)
    : dedupe([...jsonProducts(html, source), ...visibleProducts(html, source)]);
  if (!leads.length) throw new Error(`${source.name} returned no priced product records matching hunt rules`);
  return leads;
}
async function buildPayload() {
  const sources = [...PENNY_SOURCES, ...RETAIL_SOURCES];
  const results = await Promise.allSettled(sources.map(fetchSource));
  const pennyOutput = [];
  const retailOutput = [];
  const warnings = [];
  const sourceStatus = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const source = sources[i];
    if (result.status === "fulfilled") {
      (source.kind === "penny" ? pennyOutput : retailOutput).push(...result.value);
      sourceStatus.push({ retailer: source.retailer, source: source.name, kind: source.kind, status: "PASS", products: result.value.length });
    } else {
      const warning = result.reason instanceof Error ? result.reason.message : String(result.reason);
      warnings.push(warning);
      sourceStatus.push({ retailer: source.retailer, source: source.name, kind: source.kind, status: "NO_MATCHING_PRODUCTS", products: 0, warning });
    }
  }

  const priced = dedupe(retailOutput);
  const retailers = [...new Set(RETAIL_SOURCES.map((x) => x.retailer))];
  const rollups = retailers.filter((retailer) => !priced.some((lead) => lead.retailer === retailer)).map(rollup);
  const leads = [...dedupe(pennyOutput), ...priced, ...rollups].sort((a, b) =>
    Number(a.source_only) - Number(b.source_only) ||
    Number(b.deep_discount) - Number(a.deep_discount) ||
    b.discount_pct - a.discount_pct ||
    b.source_priority - a.source_priority ||
    b.resale_potential - a.resale_potential
  );

  if (!leads.length) throw new Error(warnings.join("; ") || "Automatic deal sources unavailable.");

  const byRetailer = {};
  const deepByRetailer = {};
  for (const lead of leads) {
    byRetailer[lead.retailer] = (byRetailer[lead.retailer] || 0) + 1;
    if (lead.deep_discount) deepByRetailer[lead.retailer] = (deepByRetailer[lead.retailer] || 0) + 1;
  }

  console.log("reseller-auto-leads deep-hunt", JSON.stringify({
    by_retailer: byRetailer,
    deep_by_retailer: deepByRetailer,
    source_status: sourceStatus,
    clearance_min_discount: CLEARANCE_MIN_DISCOUNT,
  }));

  return {
    status: "PASS",
    generated_at: new Date().toISOString(),
    count: leads.length,
    retailers: [...new Set(leads.map((x) => x.retailer))],
    by_retailer: byRetailer,
    deep_by_retailer: deepByRetailer,
    leads,
    source_status: sourceStatus,
    warnings,
    clearance_rule: `Clearance items require more than ${CLEARANCE_MIN_DISCOUNT}% off.`,
    note: "Deep-clearance sources are queried separately. Clearance rows require a verified discount greater than 50%. Deep discounts sort ahead of ordinary sale items. If a retailer only exposes a broad page, one sale-list row is returned.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "GET" && req.method !== "POST") return json(req, 405, { error: "GET or POST required." });
  try {
    const id = await userId(req);
    if (!ALLOWED.has(id)) return json(req, 403, { error: "Not authorized." });
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return json(req, 200, { ...cache.payload, cached: true });
    if (!inflight) {
      inflight = buildPayload()
        .then((payload) => {
          cache = { at: Date.now(), payload };
          return payload;
        })
        .finally(() => { inflight = null; });
    }
    return json(req, 200, await inflight);
  } catch (error) {
    if (cache) {
      return json(req, 200, {
        ...cache.payload,
        cached: true,
        stale: true,
        warning: error instanceof Error ? error.message : String(error),
      });
    }
    return json(req, 503, { error: error instanceof Error ? error.message : String(error) });
  }
});