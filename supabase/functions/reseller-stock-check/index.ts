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
const UA = "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 H38ResellerScoutStoreCheck/0.1.13";
const CACHE_TTL = 4 * 60 * 1000;
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
  for (const token of [...tokens(store.store_address), ...tokens(store.store_name)]) if (!retailerTokens.has(token) && x.includes(token)) score++;
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
  const flatDigits = digits(raw);
  const skuDigits = digits(body.sku);
  const upcDigits = digits(body.upc);
  if (skuDigits.length >= 5 && flatDigits.includes(skuDigits)) return true;
  if (upcDigits.length >= 8 && flatDigits.includes(upcDigits)) return true;
  const x = norm(raw);
  const titleTokens = tokens(body.title).filter((t) => t.length >= 4);
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
    const match = raw.match(pattern);
    const n = match ? numeric(match[1]) : 0;
    if (n) return n;
  }
  return 0;
}
function pricePair(raw: string) {
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
function aisleBay(raw: string) {
  const text = clean(raw);
  const match = text.match(/Aisle\s+([A-Z0-9-]+)\s+(?:Bay\s+)?([A-Z0-9-]+)?/i) || text.match(/Aisle\s+([A-Z0-9-]+).*?Bay\s+([A-Z0-9-]+)/i);
  return match ? { aisle: match[1] || "", bay: match[2] || "" } : { aisle: "", bay: "" };
}
function productIds(raw: string) {
  const text = clean(raw);
  return {
    internet_number: text.match(/Internet\s*#\s*(\d{6,})/i)?.[1] || "",
    model: text.match(/Model\s*#\s*([A-Za-z0-9._\-/]+)/i)?.[1] || "",
    store_sku: text.match(/Store\s*SKU\s*#\s*([0-9-]{5,})/i)?.[1] || "",
  };
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
  if (!response.ok) throw new Error(`Home Depot page returned ${response.status}.`);
  return { url: response.url, html: await response.text() };
}
function productHref(base: string, html: string) {
  const match = html.match(/href=["']([^"']*\/p\/[^"']+\/\d{6,}[^"']*)/i);
  if (!match) return "";
  try { return new URL(match[1].replace(/&amp;/g, "&"), base).toString(); } catch { return ""; }
}
function locatorUrl(store: any) {
  const zip = zipOf(store.store_address);
  return zip ? `https://www.homedepot.com/l/search/${zip}/full/` : "";
}
function locatorCandidates(base: string, html: string) {
  const out: any[] = [];
  const rule = /href=["']([^"']*\/l\/[^"']*\/(\d{3,6})(?:[/?#"']|$)[^"']*)/gi;
  let match;
  while ((match = rule.exec(html)) && out.length < 80) {
    let url = "";
    try { url = new URL(match[1].replace(/&amp;/g, "&"), base).toString(); } catch { continue; }
    const index = match.index;
    out.push({ id: String(match[2]), url, block: clean(html.slice(Math.max(0, index - 1200), Math.min(html.length, index + 1900))) });
  }
  return out;
}
async function resolveStore(store: any) {
  const direct = String(store.store_name || "").match(/#\s*(\d{2,8})\b/)?.[1] || "";
  if (direct) return { id: direct, evidence: `store ${direct}` };
  const url = locatorUrl(store);
  if (!url) return { id: "", evidence: "" };
  try {
    const page = await fetchPage(url);
    const candidates = locatorCandidates(page.url, page.html);
    if (!candidates.length) return { id: "", evidence: "" };
    candidates.sort((a, b) => addressScore(b.block, store) - addressScore(a.block, store));
    const best = candidates[0];
    if (addressScore(best.block, store) < 7) return { id: "", evidence: "" };
    return { id: best.id, evidence: storeEvidence(best.block, store, best.id) || `store ${best.id}` };
  } catch {
    return { id: "", evidence: "" };
  }
}
function withStore(url: string, storeId: string) {
  const parsed = new URL(url);
  parsed.searchParams.set("storeSelection", storeId);
  return parsed.toString();
}
function searchUrl(query: string) {
  return `https://www.homedepot.com/s/${encodeURIComponent(query)}`;
}
function logResult(payload: any) {
  try {
    console.log(JSON.stringify({
      h38_stock_v: 3,
      retailer: payload.retailer,
      status: payload.status,
      store_id: payload.store_id || "",
      stock_status: payload.stock_status,
      stock_count: payload.stock_count,
      current_price: payload.current_price || null,
      store_bound: !!payload.store_bound,
      cached: !!payload.cached,
    }));
  } catch {}
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "POST required." });
  try {
    const uid = await userId(req);
    if (!ALLOWED.has(uid)) return json(req, 403, { error: "Not authorized." });
    const body = await req.json().catch(() => ({}));
    const retailer = clean(body.retailer);
    if (retailer !== "Home Depot") {
      return json(req, 200, {
        status: "unsupported",
        retailer,
        stock_checked: true,
        stock_status: "unknown",
        stock_count: null,
        current_price: null,
        availability_label: "This owner build automatically checks Home Depot penny candidates only.",
      });
    }
    const store = {
      retailer,
      store_name: clean(body.store_name),
      store_address: clean(body.store_address),
      store_lat: body.store_lat,
      store_lon: body.store_lon,
    };
    const query = clean(body.sku || body.upc || body.title);
    if (!query) return json(req, 200, { status: "no_product_reference", retailer, stock_checked: true, stock_status: "unknown", stock_count: null, current_price: null, availability_label: "Need a Home Depot SKU, UPC, or title." });
    const cacheKey = [norm(store.store_address), query].join("|");
    const previous = cache.get(cacheKey);
    if (previous && Date.now() - previous.at < CACHE_TTL) return json(req, 200, { ...previous.payload, cached: true });

    const context = await resolveStore(store);
    let page = await fetchPage(searchUrl(query));
    const productUrl = /\/p\//i.test(new URL(page.url).pathname) ? page.url : productHref(page.url, page.html);
    if (productUrl && productUrl !== page.url) page = await fetchPage(productUrl);
    if (context.id) {
      try { page = await fetchPage(withStore(page.url, context.id)); } catch {}
    }

    const raw = page.html;
    const storeBound = !!context.id || !!storeEvidence(clean(raw), store, context.id);
    const productBound = productEvidence(raw, body);
    const quantity = productBound ? exactCount(raw) : null;
    const stockStatus = productBound ? availability(raw) : "unknown";
    const prices = productBound ? pricePair(raw) : { current: 0, original: 0 };
    const location = productBound ? aisleBay(raw) : { aisle: "", bay: "" };
    const ids = productBound ? productIds(raw) : { internet_number: "", model: "", store_sku: "" };

    let status = "store_not_resolved";
    if (storeBound && quantity !== null) status = "exact";
    else if (storeBound && stockStatus !== "unknown") status = "availability_only";
    else if (storeBound) status = "store_resolved_no_quantity";

    const priceLabel = prices.current ? `$${prices.current.toFixed(2)} public store/product page price` : "Store price not exposed";
    const quantityLabel = quantity !== null ? `${quantity} shown` : stockStatus === "in_stock" ? "In stock · exact quantity not exposed" : stockStatus === "out_of_stock" ? "Out of stock" : "Quantity not exposed";
    const payload = {
      status,
      retailer,
      stock_checked: true,
      stock_status: quantity !== null ? (quantity > 0 ? "in_stock" : "out_of_stock") : stockStatus,
      stock_count: quantity,
      store_bound: storeBound,
      store_id: context.id || null,
      store_evidence: context.evidence || null,
      checked_url: page.url,
      current_price: prices.current || null,
      original_price: prices.original || null,
      price_checked: prices.current > 0,
      penny_price_detected: Math.abs(prices.current - 0.01) < 0.0001,
      price_label: priceLabel,
      aisle: location.aisle || null,
      bay: location.bay || null,
      internet_number: ids.internet_number || null,
      model: ids.model || null,
      store_sku: ids.store_sku || null,
      availability_label: `${priceLabel} · ${quantityLabel}${location.aisle ? ` · aisle ${location.aisle}${location.bay ? ` bay ${location.bay}` : ""}` : ""}. Retailer inventory can change.`,
    };
    cache.set(cacheKey, { at: Date.now(), payload });
    logResult(payload);
    return json(req, 200, payload);
  } catch (error) {
    const payload = {
      status: "check_failed",
      retailer: "Home Depot",
      stock_checked: true,
      stock_status: "unknown",
      stock_count: null,
      current_price: null,
      store_bound: false,
      availability_label: `Store check unavailable: ${error instanceof Error ? error.message : String(error)}`,
    };
    logResult(payload);
    return json(req, 200, payload);
  }
});
