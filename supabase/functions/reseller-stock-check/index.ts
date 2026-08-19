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
const SUPPORTED = new Set([
  "Home Depot", "Lowe's", "Walmart", "Target", "Menards", "Fleet Farm",
  "Harbor Freight", "Tractor Supply", "Dollar General", "Dollar Tree",
  "Family Dollar", "Northern Tool", "Ace Hardware",
]);
const UA = "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 H38ResellerScoutStock/0.1.16";
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { at: number; payload: any }>();

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ORIGINS.has(origin) ? origin : "https://appassets.androidplatform.net",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "vary": "Origin",
  };
}
function json(req: Request, status: number, body: any) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}
async function userId(req: Request) {
  const token = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Sign in required.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: SERVICE_KEY },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw new Error("Session expired.");
  return String(payload.id);
}
function decode(value: any) {
  return String(value || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'");
}
function clean(value: any) {
  return decode(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function norm(value: any) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function digits(value: any) {
  return String(value || "").replace(/\D/g, "");
}
function tokens(value: any) {
  return norm(value).split(" ").filter((x) => x.length >= 3 && !/^(store|road|street|avenue|highway|route|north|south|east|west|suite)$/.test(x));
}
function zipOf(value: any) {
  return String(value || "").match(/\b\d{5}(?:-\d{4})?\b/)?.[0]?.slice(0, 5) || "";
}
function streetNo(value: any) {
  return String(value || "").match(/^\s*(\d+[A-Za-z-]*)\b/)?.[1] || "";
}
function addressScore(text: string, store: any) {
  const x = norm(text), zip = zipOf(store.store_address), number = streetNo(store.store_address);
  let score = 0;
  if (zip && x.includes(zip)) score += 5;
  if (number && new RegExp(`\\b${number.toLowerCase()}\\b`).test(x)) score += 5;
  const retailerTokens = new Set(tokens(store.retailer));
  for (const token of [...tokens(store.store_address), ...tokens(store.store_name)]) {
    if (!retailerTokens.has(token) && x.includes(token)) score++;
  }
  return score;
}
function storeEvidence(text: string, store: any, storeId = "") {
  const x = norm(text), zip = zipOf(store.store_address), number = streetNo(store.store_address);
  if (storeId && new RegExp(`\\b${digits(storeId)}\\b`).test(text)) return `store ${storeId}`;
  if (zip && number && x.includes(zip) && new RegExp(`\\b${number.toLowerCase()}\\b`).test(x)) return `${number} / ${zip}`;
  const retailerTokens = new Set(tokens(store.retailer));
  const hits = [...new Set([...tokens(store.store_address), ...tokens(store.store_name)].filter((t) => !retailerTokens.has(t) && x.includes(t)))];
  return hits.length >= 3 ? hits.slice(0, 4).join(", ") : "";
}
function productEvidence(raw: string, body: any) {
  const flatDigits = digits(raw), upc = digits(body.upc), sku = digits(body.sku);
  if (upc.length >= 8 && flatDigits.includes(upc)) return true;
  if (sku.length >= 5 && flatDigits.includes(sku)) return true;
  const x = norm(raw), titleTokens = tokens(body.title).filter((t) => t.length >= 4);
  if (!titleTokens.length) return false;
  const hits = titleTokens.filter((t) => x.includes(t));
  return hits.length >= Math.min(4, Math.max(2, Math.ceil(titleTokens.length * 0.35)));
}
function exactCount(raw: string) {
  const rules = [
    /Quantity\s+Available\s*:?\s*(\d{1,4})/i,
    /(\d{1,4})\s+In[- ]Stock\b/i,
    /(\d{1,4})\s+in\s+stock\s+in\s+aisle\b/i,
    /Only\s+(\d{1,4})\s+(?:left|remaining)\b/i,
    /"(?:quantityAvailable|availableQuantity|inventoryQuantity|availableQty|onHandQuantity|onHandQty)"\s*:\s*"?(\d{1,4})"?/i,
    /"quantity"\s*:\s*"?(\d{1,4})"?\s*,\s*"(?:availability|stockStatus|inventoryStatus)"/i,
  ];
  for (const rule of rules) {
    const match = raw.match(rule);
    if (!match) continue;
    const count = Number(match[1]);
    if (Number.isInteger(count) && count >= 0 && count <= 9999) return count;
  }
  return null;
}
function availability(raw: string) {
  if (/out\s+of\s+stock|not\s+available|unavailable|sold\s+out|"availability"\s*:\s*"(?:OUT_OF_STOCK|UNAVAILABLE)"/i.test(raw)) return "out_of_stock";
  if (/in[- ]stock|in\s+stock|pickup\s+today|ready\s+in\s+\d+|available\s+for\s+pickup|quantity\s+available|"availability"\s*:\s*"(?:IN_STOCK|AVAILABLE)"/i.test(raw)) return "in_stock";
  return "unknown";
}
function numeric(value: any) {
  const n = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0.01 && n < 100000 ? n : 0;
}
function firstMatch(raw: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = raw.match(pattern), n = match ? numeric(match[1]) : 0;
    if (n) return n;
  }
  return 0;
}
function homeDepotPricePair(raw: string) {
  const current = firstMatch(raw, [
    /"currentPrice"\s*:\s*\{[\s\S]{0,300}?"(?:value|price)"\s*:\s*"?([0-9]+(?:\.[0-9]{1,2})?)/i,
    /"pricing"\s*:\s*\{[\s\S]{0,500}?"value"\s*:\s*"?([0-9]+(?:\.[0-9]{1,2})?)/i,
    /"offers"\s*:\s*\{[\s\S]{0,500}?"price"\s*:\s*"?([0-9]+(?:\.[0-9]{1,2})?)/i,
    /"price"\s*:\s*"([0-9]+(?:\.[0-9]{1,2})?)"\s*,\s*"priceCurrency"\s*:\s*"USD"/i,
  ]);
  const original = firstMatch(raw, [
    /"(?:wasPrice|originalPrice|regularPrice|listPrice)"\s*:\s*\{?[\s\S]{0,120}?"?(?:value|price)?"?\s*:?\s*"?([0-9]+(?:\.[0-9]{1,2})?)/i,
  ]);
  return { current, original: original > current ? original : 0 };
}
function homeDepotAisleBay(raw: string) {
  const text = clean(raw);
  const match = text.match(/Aisle\s+([A-Z0-9-]+)\s+(?:Bay\s+)?([A-Z0-9-]+)?/i) || text.match(/Aisle\s+([A-Z0-9-]+).*?Bay\s+([A-Z0-9-]+)/i);
  return match ? { aisle: match[1] || "", bay: match[2] || "" } : { aisle: "", bay: "" };
}
function homeDepotIds(raw: string) {
  const text = clean(raw);
  return {
    internet_number: text.match(/Internet\s*#\s*(\d{6,})/i)?.[1] || "",
    model: text.match(/Model\s*#\s*([A-Za-z0-9._\-/]+)/i)?.[1] || "",
    store_sku: text.match(/Store\s*SKU\s*#\s*([0-9-]{5,})/i)?.[1] || "",
  };
}
function retailerHost(retailer: string, host: string) {
  host = host.toLowerCase().replace(/^www\./, "");
  const map: any = {
    "Home Depot": "homedepot.com", "Lowe's": "lowes.com", "Walmart": "walmart.com",
    "Target": "target.com", "Menards": "menards.com", "Fleet Farm": "fleetfarm.com",
    "Harbor Freight": "harborfreight.com", "Tractor Supply": "tractorsupply.com",
    "Dollar General": "dollargeneral.com", "Dollar Tree": "dollartree.com",
    "Family Dollar": "familydollar.com", "Northern Tool": "northerntool.com",
    "Ace Hardware": "acehardware.com",
  };
  return host === map[retailer] || host.endsWith("." + map[retailer]);
}
function searchUrl(retailer: string, query: string) {
  const q = encodeURIComponent(query);
  const map: any = {
    "Home Depot": `https://www.homedepot.com/s/${q}`,
    "Lowe's": `https://www.lowes.com/search?searchTerm=${q}`,
    "Walmart": `https://www.walmart.com/search?q=${q}`,
    "Target": `https://www.target.com/s?searchTerm=${q}`,
    "Menards": `https://www.menards.com/main/search.html?search=${q}`,
    "Fleet Farm": `https://www.fleetfarm.com/search?Ntt=${q}`,
    "Harbor Freight": `https://www.harborfreight.com/search?q=${q}`,
    "Tractor Supply": `https://www.tractorsupply.com/tsc/search/${q}`,
    "Dollar General": `https://www.dollargeneral.com/product-search.html?query=${q}`,
    "Dollar Tree": `https://www.dollartree.com/searchresults?Ntt=${q}`,
    "Family Dollar": `https://www.familydollar.com/searchresults?Ntt=${q}`,
    "Northern Tool": `https://www.northerntool.com/search?s=${q}`,
    "Ace Hardware": `https://www.acehardware.com/search?query=${q}`,
  };
  return map[retailer] || "";
}
async function fetchPage(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": UA,
      "accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(16000),
  });
  if (!response.ok) throw new Error(`Retailer page returned ${response.status}.`);
  return { url: response.url, html: await response.text() };
}
function productHref(retailer: string, base: string, html: string) {
  const patterns: any = {
    "Home Depot": /href=["']([^"']*\/p\/[^"']+\/\d{6,}[^"']*)/i,
    "Lowe's": /href=["']([^"']*\/pd\/[^"']+\/\d{6,}[^"']*)/i,
    "Walmart": /href=["']([^"']*\/ip\/[^"']+\/\d{6,}[^"']*)/i,
    "Target": /href=["']([^"']*\/p\/[^"']*\/-\/A-\d+[^"']*)/i,
    "Menards": /href=["']([^"']*\/main\/[^"']*\/p-\d+[^"']*)/i,
    "Harbor Freight": /href=["']([^"']*\/[^"']*-\d{5,}\.html[^"']*)/i,
    "Tractor Supply": /href=["']([^"']*\/tsc\/product\/[^"']+)["']/i,
    "Dollar General": /href=["']([^"']*\/p\/[^"']+\/\d+[^"']*)/i,
    "Dollar Tree": /href=["']([^"']*\/[^"']+\/\d+[^"']*)/i,
    "Family Dollar": /href=["']([^"']*\/[^"']+\/\d+[^"']*)/i,
    "Northern Tool": /href=["']([^"']*\/products\/[^"']+)["']/i,
    "Ace Hardware": /href=["']([^"']*\/departments\/[^"']+\/\d+[^"']*)/i,
    "Fleet Farm": /href=["']([^"']*\/detail\/[^"']+)["']/i,
  };
  const match = html.match(patterns[retailer]);
  if (!match) return "";
  try { return new URL(match[1].replace(/&amp;/g, "&"), base).toString(); } catch { return ""; }
}
function locatorUrl(retailer: string, store: any) {
  const zip = zipOf(store.store_address), lat = Number(store.store_lat), lon = Number(store.store_lon);
  if (!zip && !Number.isFinite(lat)) return "";
  const map: any = {
    "Home Depot": zip && `https://www.homedepot.com/l/search/${zip}/full/`,
    "Lowe's": zip && `https://www.lowes.com/store/?searchTerm=${zip}`,
    "Walmart": zip && `https://www.walmart.com/store/finder?location=${zip}`,
    "Target": zip && `https://www.target.com/store-locator/find-stores/${zip}`,
    "Tractor Supply": zip && `https://www.tractorsupply.com/tsc/store-locator?zipCode=${zip}`,
    "Dollar General": zip && `https://www.dollargeneral.com/store-directory?search=${zip}`,
    "Harbor Freight": zip && `https://www.harborfreight.com/storelocator?zip=${zip}`,
    "Ace Hardware": zip && `https://www.acehardware.com/store-locator?query=${zip}`,
    "Menards": Number.isFinite(lat) && Number.isFinite(lon) && `https://www.menards.com/main/storeLocator.html?latitude=${lat}&longitude=${lon}`,
  };
  return map[retailer] || "";
}
function locatorCandidates(retailer: string, base: string, html: string) {
  const rules: any = {
    "Home Depot": /href=["']([^"']*\/l\/[^"']*\/(\d{3,6})(?:[/?#"']|$)[^"']*)/gi,
    "Lowe's": /href=["']([^"']*\/store\/[^"']*\/(\d{3,6})(?:[/?#"']|$)[^"']*)/gi,
    "Walmart": /href=["']([^"']*\/store\/(\d{2,6})-[^"']+)/gi,
    "Target": /href=["']([^"']*\/sl\/[^"']*\/(\d{2,6})[^"']*)/gi,
    "Tractor Supply": /href=["']([^"']*\/tsc\/store_[^"']*_(\d{2,6})[^"']*)/gi,
    "Dollar General": /href=["']([^"']*\/store-directory\/[a-z]{2}\/[^"]*\/(\d{2,8})[^"']*)/gi,
    "Ace Hardware": /href=["']([^"']*\/store-details\/(\d{2,8})[^"']*)/gi,
  };
  const rule = rules[retailer], out: any[] = [];
  if (!rule) return out;
  let match;
  while ((match = rule.exec(html)) && out.length < 80) {
    let url = "";
    try { url = new URL(match[1].replace(/&amp;/g, "&"), base).toString(); } catch { continue; }
    const index = match.index;
    out.push({ id: String(match[2]), url, block: clean(html.slice(Math.max(0, index - 1100), Math.min(html.length, index + 1800))) });
  }
  return out;
}
async function resolveStore(retailer: string, store: any) {
  const direct = String(store.store_name || "").match(/#\s*(\d{2,8})\b/)?.[1] || "";
  if (direct) return { id: direct, url: "", evidence: `store ${direct}` };
  const locator = locatorUrl(retailer, store);
  if (!locator) return { id: "", url: "", evidence: "" };
  try {
    const page = await fetchPage(locator), candidates = locatorCandidates(retailer, page.url, page.html);
    if (!candidates.length) return { id: "", url: "", evidence: "" };
    candidates.sort((a, b) => addressScore(b.block, store) - addressScore(a.block, store));
    const best = candidates[0], score = addressScore(best.block, store);
    return score >= 7 ? { id: best.id, url: best.url, evidence: storeEvidence(best.block, store, best.id) || `store ${best.id}` } : { id: "", url: "", evidence: "" };
  } catch {
    return { id: "", url: "", evidence: "" };
  }
}
function withParam(raw: string, key: string, value: string) {
  const url = new URL(raw); url.searchParams.set(key, value); return url.toString();
}
function contextualize(retailer: string, url: string, context: any, query: string) {
  if (!context?.id) return { url, bound: false };
  if (retailer === "Home Depot") return { url: withParam(url, "storeSelection", context.id), bound: true };
  if (retailer === "Tractor Supply") return { url: withParam(url, "store", context.id), bound: true };
  if (retailer === "Walmart" && context.url) return { url: context.url.replace(/\/$/, "") + `/search?query=${encodeURIComponent(query)}`, bound: true };
  if (retailer === "Lowe's") return { url: withParam(url, "store_code", context.id), bound: false };
  if (retailer === "Target") return { url: withParam(url, "storeId", context.id), bound: false };
  if (retailer === "Dollar General") return { url: withParam(url, "store", context.id), bound: false };
  if (retailer === "Ace Hardware") return { url: withParam(url, "store", context.id), bound: false };
  return { url, bound: false };
}
function logResult(payload: any) {
  try {
    console.log(JSON.stringify({
      h38_stock_v: 5,
      retailer: payload.retailer,
      status: payload.status,
      store_id: payload.store_id || "",
      stock_status: payload.stock_status,
      stock_count: payload.stock_count,
      current_price: payload.current_price ?? null,
      store_bound: !!payload.store_bound,
      cached: !!payload.cached,
    }));
  } catch {}
}

Deno.serve(async (req: Request) => {
  let attemptedRetailer = "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "POST required." });
  try {
    const uid = await userId(req);
    if (!ALLOWED.has(uid)) return json(req, 403, { error: "Not authorized." });
    const body = await req.json().catch(() => ({}));
    const retailer = clean(body.retailer);
    attemptedRetailer = retailer;
    const store = {
      retailer,
      store_name: clean(body.store_name),
      store_address: clean(body.store_address),
      store_lat: body.store_lat,
      store_lon: body.store_lon,
    };
    const query = clean(retailer === "Home Depot" ? (body.sku || body.upc || body.title) : (body.upc || body.sku || body.title));
    if (!SUPPORTED.has(retailer)) return json(req, 200, { status: "unsupported", retailer, stock_checked: true, stock_status: "unknown", stock_count: null, current_price: null, availability_label: "No H38 checker is configured for this retailer yet." });
    const cacheKey = [retailer, norm(store.store_address), query, clean(body.source_url)].join("|");
    const previous = cache.get(cacheKey);
    if (previous && Date.now() - previous.at < CACHE_TTL) return json(req, 200, { ...previous.payload, cached: true });

    let url = clean(body.source_url);
    if (url) {
      try { if (!retailerHost(retailer, new URL(url).hostname)) url = ""; } catch { url = ""; }
    }
    if (!url && query) url = searchUrl(retailer, query);
    if (!url) return json(req, 200, { status: "no_product_reference", retailer, stock_checked: true, stock_status: "unknown", stock_count: null, current_price: null, availability_label: "Need a product URL, UPC, SKU, or title to check this store." });

    const context = await resolveStore(retailer, store);
    let page = await fetchPage(url), html = page.html;
    const path = new URL(page.url).pathname;
    if (!retailerHost(retailer, new URL(page.url).hostname) || !(/\/p\/|\/pd\/|\/ip\/|\/product\/|p-\d+|\.html/i.test(path))) {
      const product = productHref(retailer, page.url, html);
      if (product) { page = await fetchPage(product); html = page.html; }
    }
    const contextual = contextualize(retailer, page.url, context, query);
    if (contextual.url !== page.url) {
      try { page = await fetchPage(contextual.url); html = page.html; } catch {}
    }

    const text = clean(html);
    const explicitEvidence = storeEvidence(text, store, context.id);
    const storeBound = !!(contextual.bound && context.id) || !!explicitEvidence;
    const productBound = productEvidence(html, body);
    const quantity = productBound ? exactCount(html) : null;
    const stockStatus = productBound ? availability(html) : "unknown";
    const hdPrice = retailer === "Home Depot" && productBound && storeBound ? homeDepotPricePair(html) : { current: 0, original: 0 };
    const hdLocation = retailer === "Home Depot" && productBound && storeBound ? homeDepotAisleBay(html) : { aisle: "", bay: "" };
    const hdIds = retailer === "Home Depot" && productBound ? homeDepotIds(html) : { internet_number: "", model: "", store_sku: "" };

    let status = "store_not_resolved";
    if (quantity !== null && storeBound) status = "exact";
    else if (stockStatus !== "unknown" && storeBound) status = "availability_only";
    else if (context.id) status = "store_resolved_no_quantity";

    const priceLabel = hdPrice.current ? `$${hdPrice.current.toFixed(2)} store-bound public price` : retailer === "Home Depot" && storeBound ? "Store price not exposed" : "";
    const quantityLabel = quantity !== null ? `${quantity} shown for this store` : stockStatus === "in_stock" ? "In stock · exact quantity not exposed" : stockStatus === "out_of_stock" ? "Out of stock at this store" : context.id ? `Store ${context.id} resolved · quantity not exposed` : `${retailer} store could not be resolved`;
    const payload: any = {
      status,
      retailer,
      stock_checked: true,
      stock_status: quantity !== null ? (quantity > 0 ? "in_stock" : "out_of_stock") : stockStatus,
      stock_count: storeBound ? quantity : null,
      store_bound: storeBound,
      store_id: context.id || null,
      store_evidence: explicitEvidence || context.evidence || null,
      checked_url: page.url,
      current_price: hdPrice.current || null,
      original_price: hdPrice.original || null,
      price_checked: hdPrice.current > 0,
      penny_price_detected: retailer === "Home Depot" && storeBound && Math.abs(hdPrice.current - 0.01) < 0.0001,
      aisle: hdLocation.aisle || null,
      bay: hdLocation.bay || null,
      internet_number: hdIds.internet_number || null,
      model: hdIds.model || null,
      store_sku: hdIds.store_sku || null,
      availability_label: `${priceLabel ? priceLabel + " · " : ""}${quantityLabel}${hdLocation.aisle ? ` · aisle ${hdLocation.aisle}${hdLocation.bay ? ` bay ${hdLocation.bay}` : ""}` : ""}. Retailer inventory can change.`,
    };
    cache.set(cacheKey, { at: Date.now(), payload });
    logResult(payload);
    return json(req, 200, payload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const blocked = /returned\s+(?:401|403|429)\b|forbidden|access denied|too many requests/i.test(detail);
    const payload = {
      status: blocked ? "retailer_blocked" : "check_failed",
      retailer: attemptedRetailer,
      stock_checked: true,
      stock_status: "unknown",
      stock_count: null,
      current_price: null,
      store_bound: false,
      retailer_blocked: blocked,
      availability_label: blocked
        ? `${attemptedRetailer || "Retailer"} blocked the automated store lookup. Price and quantity are not verified; open the retailer to confirm.`
        : `Store check unavailable: ${detail}`,
    };
    logResult(payload);
    return json(req, 200, payload);
  }
});