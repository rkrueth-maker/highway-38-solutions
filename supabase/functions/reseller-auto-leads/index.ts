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

type Source = {
  retailer: string;
  name: string;
  url: string;
  kind: "penny" | "deal" | "clearance" | "in_store_bargain";
  priority: number;
  broad?: boolean;
};

type Lead = {
  id: string;
  retailer: string;
  title: string;
  sku: string;
  upc: string;
  buy_price: number;
  original_price: number;
  discount_pct: number;
  deal_type: string;
  penny_date: string;
  source_name: string;
  source_url: string;
  availability_label: string;
  resale_potential: number;
  source_priority: number;
};

const PENNY_SOURCES: Source[] = [
  {
    retailer: "Dollar General",
    name: "RetailShout Penny List",
    url: "https://retailshout.com/latest-dollar-general-penny-items-near-you/",
    kind: "penny",
    priority: 100,
  },
  {
    retailer: "Dollar Tree",
    name: "RetailShout Penny List",
    url: "https://retailshout.com/latest-dollar-tree-penny-items-near-you/",
    kind: "penny",
    priority: 100,
  },
];

const RETAIL_SOURCES: Source[] = [
  {
    retailer: "Home Depot",
    name: "Home Depot Daily Deals",
    url: "https://www.homedepot.com/daily-deals/",
    kind: "deal",
    priority: 99,
  },
  {
    retailer: "Home Depot",
    name: "Home Depot Tool Savings",
    url: "https://www.homedepot.com/b/Tool-Savings/N-5yc1vZ1z1zuqf",
    kind: "deal",
    priority: 98,
  },
  {
    retailer: "Walmart",
    name: "Walmart Tool Clearance",
    url: "https://www.walmart.com/tp/tool-clearance",
    kind: "clearance",
    priority: 98,
    broad: true,
  },
  {
    retailer: "Lowe's",
    name: "Lowe's Daily Deals",
    url: "https://www.lowes.com/l/savings/daily-deals",
    kind: "deal",
    priority: 97,
  },
  {
    retailer: "Ace Hardware",
    name: "Ace Clearance",
    url: "https://www.acehardware.com/clearance?pageSize=60",
    kind: "clearance",
    priority: 96,
  },
  {
    retailer: "Ace Hardware",
    name: "Ace Tool Deals",
    url: "https://www.acehardware.com/top-power-tool-deals",
    kind: "deal",
    priority: 96,
  },
  {
    retailer: "Menards",
    name: "Menards Tools & Hardware Sale Items",
    url: "https://www.menards.com/main/sale-items/tools-hardware-sale-items/c-1642874323047994.htm",
    kind: "deal",
    priority: 96,
    broad: true,
  },
  {
    retailer: "Menards",
    name: "Menards Ray's List",
    url: "https://www.menards.com/main/b-1957366.htm",
    kind: "in_store_bargain",
    priority: 99,
    broad: true,
  },
];

const CACHE_TTL_MS = 12 * 60 * 1000;
let cache: { at: number; payload: any } | null = null;
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

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}

async function userId(req: Request) {
  const token = String(req.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) throw new Error("Sign in required.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: SERVICE_KEY },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw new Error("Session expired.");
  return String(payload.id);
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function cleanTitle(value: string) {
  return decodeHtml(value || "")
    .replace(/^\*\s*/, "")
    .replace(/^Image:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function usefulTitle(value: string) {
  const text = cleanTitle(value);
  return text.length >= 9 &&
    text.length <= 220 &&
    !/^(add|compare|shop now|view|sort|filter|all filters|price|brand|availability|category|get it fast|showing|load more|clear all|image|sponsored|free shipping|pickup|delivery|shipping|deals by|shop by|top categories|sign in|create account|see more options|expert installation|limit \d+)/i.test(text) &&
    !/^\$?\d+(?:\.\d{1,2})?$/.test(text) &&
    !/^was\s*\$?|^save\s*\$?/i.test(text) &&
    !/^\(?\d(?:\.\d)?\s*\/\s*\d+/i.test(text);
}

function resaleFriendly(value: string) {
  return /tool|battery|charger|drill|driver|impact|saw|nailer|grinder|sander|router|vacuum|compressor|generator|mower|blower|trimmer|chainsaw|pressure washer|storage|toolbox|tool box|workbench|ladder|grill|smoker|cooler|appliance|electronics|camera|speaker|headphone|tablet|laptop|television|\btv\b|gaming|console|lego|outdoor power|snow blower|air conditioner|heater|dehumidifier|fan|lighting|\bled\b|faucet|fixture|pump|welder|socket|wrench|ratchet|screwdriver|hammer|laser|level|shop vac|wet dry|patio|fire pit/i.test(value);
}

function resaleScore(title: string, discount = 0, kind = "deal") {
  let score = 66;
  const text = title.toLowerCase();
  if (/milwaukee|dewalt|ryobi|ridgid|makita|bosch|kobalt|craftsman|metabo|greenworks|ego|weber|traeger|blackstone|stanley|black\+decker|hart|masterforce/.test(text)) score += 11;
  if (/battery|charger|combo kit|tool kit|generator|mower|blower|trimmer|chainsaw|vacuum|compressor|storage|toolbox|workbench|grill|smoker|electronics|gaming|lego/.test(text)) score += 9;
  if (kind === "penny") score += 12;
  if (kind === "in_store_bargain") score += 8;
  score += Math.min(14, Math.max(0, discount) / 4);
  return Math.max(45, Math.min(99, Math.round(score)));
}

function money(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value > 0 ? value : 0;
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").replace(/\s+(\d{2})(?=\D|$)/, ".$1");
    const match = normalized.match(/(?:\$\s*)?(\d{1,7}(?:\.\d{1,2})?)/);
    return match ? Number(match[1]) : 0;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["price", "value", "amount", "priceValue", "currentPrice", "minPrice", "maxPrice"]) {
      if (key in obj) {
        const parsed = money(obj[key]);
        if (parsed) return parsed;
      }
    }
  }
  return 0;
}

function at(obj: any, path: string) {
  let value = obj;
  for (const key of path.split(".")) {
    if (value == null || typeof value !== "object") return undefined;
    value = value[key];
  }
  return value;
}

function firstPrice(obj: any, paths: string[]) {
  for (const path of paths) {
    const value = money(at(obj, path));
    if (value) return value;
  }
  return 0;
}

function firstString(obj: any, paths: string[]) {
  for (const path of paths) {
    const value = at(obj, path);
    if (typeof value === "string" && value.trim()) return cleanTitle(value);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function absoluteUrl(sourceUrl: string, candidate: string) {
  if (!candidate) return sourceUrl;
  try {
    return new URL(candidate, sourceUrl).toString();
  } catch {
    return sourceUrl;
  }
}

function visibleLines(html: string) {
  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>|<\/tr>|<\/article>|<\/section>|<\/button>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeHtml(stripped)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function pennyLeads(html: string, source: Source): Lead[] {
  const lines = visibleLines(html);
  const output: Lead[] = [];
  for (let i = 0; i < lines.length; i++) {
    const dateMatch = lines[i].match(/^(?:Penny Date|Date Pennied):\s*(.+)$/i);
    if (!dateMatch) continue;
    let title = "";
    for (let j = i - 1; j >= Math.max(0, i - 7); j--) {
      if (usefulTitle(lines[j])) {
        title = cleanTitle(lines[j]).replace(/^\d+[.)]\s*/, "");
        break;
      }
    }
    let sku = "";
    let upc = "";
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 10); j++) {
      const match = lines[j].match(/SKU:\s*([A-Za-z0-9-]+).*?UPC:\s*([0-9]{7,14})/i);
      if (match) {
        sku = match[1];
        upc = match[2];
        break;
      }
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
    });
  }
  return output;
}

function discountFromObject(obj: any, current: number, original: number) {
  for (const path of ["discountPercent", "percentOff", "savingsPercent", "discount.percent", "priceInfo.savingsPercent", "priceInfo.savings.percent"]) {
    const raw = at(obj, path);
    const value = typeof raw === "number" ? raw : Number(String(raw || "").replace(/[^0-9.]/g, ""));
    if (Number.isFinite(value) && value > 0 && value <= 100) return Math.round(value);
  }
  if (current > 0 && original > current) return Math.round((1 - current / original) * 100);
  return 0;
}

function productFromObject(obj: any, source: Source): Lead | null {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const title = firstString(obj, [
    "productName", "name", "title", "displayName", "product.name", "item.name",
  ]);
  if (!usefulTitle(title)) return null;

  const sku = firstString(obj, [
    "sku", "modelNumber", "modelNo", "model", "productId", "productID", "usItemId", "itemId", "id",
  ]);
  const upc = firstString(obj, ["upc", "gtin13", "gtin12", "gtin", "product.upc"])
    .replace(/\D/g, "");
  const current = firstPrice(obj, [
    "priceInfo.currentPrice.price", "priceInfo.currentPrice", "currentPrice.price", "currentPrice",
    "salePrice.price", "salePrice", "offerPrice", "finalPrice", "pricing.currentPrice", "pricing.price",
    "offers.price", "offers.lowPrice", "price.price", "price.value", "price",
  ]);
  const original = firstPrice(obj, [
    "priceInfo.wasPrice.price", "priceInfo.wasPrice", "wasPrice.price", "wasPrice", "originalPrice.price",
    "originalPrice", "regularPrice", "listPrice", "strikeThroughPrice", "comparisonPrice", "offers.highPrice",
  ]);
  const productUrl = firstString(obj, [
    "canonicalUrl", "productUrl", "productURL", "productPageUrl", "url", "link", "itemUrl",
  ]);
  const shapeHint = !!sku || !!upc || !!current || !!productUrl || !!obj.priceInfo || !!obj.offers || String(obj["@type"] || "").toLowerCase() === "product";
  if (!shapeHint) return null;
  if (!source.broad && !resaleFriendly(title)) return null;

  const discount = discountFromObject(obj, current, original);
  if (source.kind === "deal" && current > 0 && original > current && discount < 8) return null;

  return {
    id: `${slug(source.retailer)}:${sku || upc || slug(title)}`,
    retailer: source.retailer,
    title,
    sku,
    upc,
    buy_price: current,
    original_price: original,
    discount_pct: discount,
    deal_type: source.kind,
    penny_date: "",
    source_name: source.name,
    source_url: absoluteUrl(source.url, productUrl),
    availability_label: source.kind === "in_store_bargain"
      ? "Retailer in-store bargain lead · exact local item availability varies"
      : "Retailer deal/clearance lead · local price and stock may vary",
    resale_potential: resaleScore(title, discount, source.kind),
    source_priority: source.priority,
  };
}

function walkProducts(root: unknown, source: Source, output: Lead[], seenObjects: WeakSet<object>, counter: { value: number }) {
  if (counter.value > 120000 || root == null) return;
  if (Array.isArray(root)) {
    for (const item of root) walkProducts(item, source, output, seenObjects, counter);
    return;
  }
  if (typeof root !== "object") return;
  const obj = root as Record<string, unknown>;
  if (seenObjects.has(obj)) return;
  seenObjects.add(obj);
  counter.value += 1;

  const lead = productFromObject(obj, source);
  if (lead) output.push(lead);
  if (output.length > 250) return;

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") walkProducts(value, source, output, seenObjects, counter);
    if (output.length > 250 || counter.value > 120000) return;
  }
}

function embeddedJsonProducts(html: string, source: Source): Lead[] {
  const output: Lead[] = [];
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  let checked = 0;
  for (const match of scripts) {
    if (checked++ > 120 || output.length > 200) break;
    const attrs = match[1] || "";
    let body = (match[2] || "").trim();
    if (!body || body.length > 8_000_000) continue;
    const likelyJson = /application\/(?:ld\+json|json)/i.test(attrs) || /__NEXT_DATA__|__APOLLO_STATE__|preloaded|initial-state|initialState/i.test(attrs) || /^[\[{]/.test(body);
    if (!likelyJson) continue;
    body = decodeHtml(body);
    try {
      const parsed = JSON.parse(body);
      walkProducts(parsed, source, output, new WeakSet<object>(), { value: 0 });
    } catch {
      // Hydration blobs are not always strict JSON. Product-shaped fragments are handled below.
    }
  }

  if (output.length < 8) {
    const normalized = decodeHtml(html)
      .replace(/\\u0026/g, "&")
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\\"/g, '"');
    const re = /"(?:productName|displayName|name|title)"\s*:\s*"([^"\\]{9,220})"/g;
    let match: RegExpExecArray | null;
    let guard = 0;
    while ((match = re.exec(normalized)) && guard++ < 800 && output.length < 220) {
      const title = cleanTitle(match[1]);
      if (!usefulTitle(title) || (!source.broad && !resaleFriendly(title))) continue;
      const nearby = normalized.slice(match.index, Math.min(normalized.length, match.index + 2600));
      const currentMatch = nearby.match(/"(?:currentPrice|salePrice|offerPrice|finalPrice|price)"\s*:\s*(?:\{[^{}]{0,240}"(?:price|value|amount)"\s*:\s*)?"?\$?(\d{1,7}(?:\.\d{1,2})?)/i);
      const originalMatch = nearby.match(/"(?:wasPrice|originalPrice|regularPrice|listPrice)"\s*:\s*(?:\{[^{}]{0,240}"(?:price|value|amount)"\s*:\s*)?"?\$?(\d{1,7}(?:\.\d{1,2})?)/i);
      const skuMatch = nearby.match(/"(?:sku|modelNumber|productId|usItemId|itemId)"\s*:\s*"?([A-Za-z0-9._-]{3,80})/i);
      const current = currentMatch ? Number(currentMatch[1]) : 0;
      const original = originalMatch ? Number(originalMatch[1]) : 0;
      const discount = current > 0 && original > current ? Math.round((1 - current / original) * 100) : 0;
      output.push({
        id: `${slug(source.retailer)}:${skuMatch?.[1] || slug(title)}`,
        retailer: source.retailer,
        title,
        sku: skuMatch?.[1] || "",
        upc: "",
        buy_price: current,
        original_price: original,
        discount_pct: discount,
        deal_type: source.kind,
        penny_date: "",
        source_name: source.name,
        source_url: source.url,
        availability_label: source.kind === "in_store_bargain"
          ? "Retailer in-store bargain lead · exact local item availability varies"
          : "Retailer deal/clearance lead · local price and stock may vary",
        resale_potential: resaleScore(title, discount, source.kind),
        source_priority: source.priority,
      });
    }
  }
  return output;
}

function nearbyVisiblePrice(lines: string[], index: number) {
  let current = 0;
  let original = 0;
  let discount = 0;
  let sku = "";
  for (let j = index + 1; j <= Math.min(lines.length - 1, index + 12); j++) {
    const line = lines[j];
    let match = line.match(/(?:Model#|Model #|Item #|SKU:?)\s*([A-Za-z0-9._-]+)/i);
    if (match && !sku) sku = match[1];
    match = line.match(/(?:Save[^%]{0,50}|off\s*)\(?\s*(\d{1,2})\s*%\)?/i);
    if (match) discount = Math.max(discount, Number(match[1]));
    const nowMatch = line.match(/(?:Now|Sale Price|current price)\s*\$?\s*(\d{1,7})(?:[ .](\d{2}))?/i);
    if (nowMatch && !current) current = Number(`${nowMatch[1]}.${nowMatch[2] || "00"}`);
    const wasMatch = line.match(/(?:Was|regular price|original price)\s*\$?\s*(\d{1,7})(?:[ .](\d{2}))?/i);
    if (wasMatch && !original) original = Number(`${wasMatch[1]}.${wasMatch[2] || "00"}`);
    if (!current) {
      const priceMatch = line.match(/\$\s*(\d{1,7})(?:[ .](\d{2}))?/);
      if (priceMatch) current = Number(`${priceMatch[1]}.${priceMatch[2] || "00"}`);
    }
  }
  if (!discount && current > 0 && original > current) discount = Math.round((1 - current / original) * 100);
  return { current, original, discount, sku };
}

function visibleRetailProducts(html: string, source: Source): Lead[] {
  const lines = visibleLines(html);
  const output: Lead[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length && output.length < 80; i++) {
    const title = cleanTitle(lines[i]);
    if (!usefulTitle(title) || (!source.broad && !resaleFriendly(title))) continue;
    const key = slug(title);
    if (!key || seen.has(key)) continue;
    const pricing = nearbyVisiblePrice(lines, i);
    const hasProductSignal = pricing.current > 0 || pricing.sku || /^Image:/i.test(lines[i]) || resaleFriendly(title);
    if (!hasProductSignal) continue;
    seen.add(key);
    output.push({
      id: `${slug(source.retailer)}:${pricing.sku || key}`,
      retailer: source.retailer,
      title,
      sku: pricing.sku,
      upc: "",
      buy_price: pricing.current,
      original_price: pricing.original,
      discount_pct: pricing.discount,
      deal_type: source.kind,
      penny_date: "",
      source_name: source.name,
      source_url: source.url,
      availability_label: source.kind === "in_store_bargain"
        ? "Retailer in-store bargain lead · exact local item availability varies"
        : "Retailer deal/clearance lead · local price and stock may vary",
      resale_potential: resaleScore(title, pricing.discount, source.kind),
      source_priority: source.priority,
    });
  }
  return output;
}

function dedupe(leads: Lead[]) {
  const merged = new Map<string, Lead>();
  for (const lead of leads) {
    const key = `${slug(lead.retailer)}|${lead.upc || lead.sku || slug(lead.title)}`;
    const existing = merged.get(key);
    if (!existing || lead.source_priority > existing.source_priority || lead.discount_pct > existing.discount_pct || (lead.buy_price > 0 && existing.buy_price <= 0)) {
      merged.set(key, lead);
    }
  }
  const grouped = new Map<string, Lead[]>();
  for (const lead of merged.values()) {
    const bucket = grouped.get(lead.retailer) || [];
    bucket.push(lead);
    grouped.set(lead.retailer, bucket);
  }
  const output: Lead[] = [];
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => b.resale_potential - a.resale_potential || b.discount_pct - a.discount_pct || Number(b.buy_price > 0) - Number(a.buy_price > 0));
    output.push(...bucket.slice(0, 70));
  }
  return output.sort((a, b) => b.source_priority - a.source_priority || b.resale_potential - a.resale_potential);
}

async function fetchSource(source: Source) {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 H38ResellerScout/0.1.6",
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
    : dedupe([
      ...embeddedJsonProducts(html, source),
      ...visibleRetailProducts(html, source),
    ]);
  if (!leads.length) throw new Error(`${source.name} returned no product records`);
  return leads;
}

async function buildPayload() {
  const sources = [...PENNY_SOURCES, ...RETAIL_SOURCES];
  const results = await Promise.allSettled(sources.map(fetchSource));
  const raw: Lead[] = [];
  const warnings: string[] = [];
  const sourceStatus: any[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const source = sources[i];
    if (result.status === "fulfilled") {
      raw.push(...result.value);
      sourceStatus.push({
        retailer: source.retailer,
        source: source.name,
        status: "PASS",
        products: result.value.length,
      });
    } else {
      const warning = result.reason instanceof Error ? result.reason.message : String(result.reason);
      warnings.push(warning);
      sourceStatus.push({
        retailer: source.retailer,
        source: source.name,
        status: "NO_PRODUCTS",
        products: 0,
        warning,
      });
    }
  }

  const leads = dedupe(raw);
  if (!leads.length) throw new Error(warnings.join("; ") || "Automatic deal sources unavailable.");
  const byRetailer = Object.fromEntries(
    [...new Set(leads.map((lead) => lead.retailer))].map((retailer) => [
      retailer,
      leads.filter((lead) => lead.retailer === retailer).length,
    ]),
  );
  console.log("reseller-auto-leads build", JSON.stringify({ byRetailer, sourceStatus }));

  return {
    status: "PASS",
    generated_at: new Date().toISOString(),
    count: leads.length,
    retailers: [...new Set(leads.map((lead) => lead.retailer))],
    by_retailer: byRetailer,
    leads,
    source_status: sourceStatus,
    warnings,
    note: "Only actual product records are returned as leads. Source-only placeholders are not counted as deals. Local shelf stock and local price are not claimed unless a retailer source itself is store-specific.",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "GET" && req.method !== "POST") return json(req, 405, { error: "GET or POST required." });
  try {
    const id = await userId(req);
    if (!ALLOWED.has(id)) return json(req, 403, { error: "Not authorized." });
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return json(req, 200, { ...cache.payload, cached: true });
    }
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
