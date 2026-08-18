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
const CACHE_TTL_MS = 20 * 60 * 1000;
let cache: { at: number; payload: any } | null = null;
let inflight: Promise<any> | null = null;

type Source = {
  retailer: string;
  url: string;
  name: string;
  kind: "penny" | "clearance" | "deal" | "in_store_bargain";
  priority: number;
  sourceOnlyFallback?: boolean;
};

const PENNY_SOURCES: Source[] = [
  { retailer: "Dollar General", name: "RetailShout Penny List", kind: "penny", priority: 100, url: "https://retailshout.com/latest-dollar-general-penny-items-near-you/" },
  { retailer: "Dollar Tree", name: "RetailShout Penny List", kind: "penny", priority: 100, url: "https://retailshout.com/latest-dollar-tree-penny-items-near-you/" },
];
const RETAIL_SOURCES: Source[] = [
  { retailer: "Home Depot", name: "Home Depot Daily Deals", kind: "deal", priority: 98, url: "https://www.homedepot.com/daily-deals/", sourceOnlyFallback: true },
  { retailer: "Home Depot", name: "Home Depot Tool Savings", kind: "deal", priority: 99, url: "https://www.homedepot.com/b/Tool-Savings/N-5yc1vZ1z1zuqf", sourceOnlyFallback: true },
  { retailer: "Menards", name: "Menards Ray's List", kind: "in_store_bargain", priority: 97, url: "https://www.menards.com/main/rayslist.html", sourceOnlyFallback: true },
  { retailer: "Ace Hardware", name: "Ace Clearance", kind: "clearance", priority: 92, url: "https://www.acehardware.com/clearance?pageSize=60", sourceOnlyFallback: true },
  { retailer: "Ace Hardware", name: "Ace Tool Deals", kind: "deal", priority: 94, url: "https://www.acehardware.com/top-power-tool-deals", sourceOnlyFallback: true },
  { retailer: "Walmart", name: "Walmart Tool Clearance & Rollbacks", kind: "clearance", priority: 95, url: "https://www.walmart.com/browse/tools/clearance/1072864_1031899/c3BlY2lhbF9vZmZlcnM6Q2xlYXJhbmNlfHxzcGVjaWFsX29mZmVyczpSZWR1Y2VkIFByaWNlfHxzcGVjaWFsX29mZmVyczpSb2xsYmFjawieie", sourceOnlyFallback: true },
  { retailer: "Lowe's", name: "Lowe's Tool Deals", kind: "deal", priority: 95, url: "https://www.lowes.com/l/savings/tools-savings", sourceOnlyFallback: true },
  { retailer: "Lowe's", name: "Lowe's Savings & Clearance", kind: "clearance", priority: 93, url: "https://www.lowes.com/l/savings", sourceOnlyFallback: true },
];

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ORIGINS.has(origin) ? origin : "https://appassets.androidplatform.net",
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, max-age=180",
    "vary": "Origin",
  };
}
function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}
async function userId(req: Request) {
  const token = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Sign in required.");
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SERVICE_KEY } });
  const p = await r.json().catch(() => ({}));
  if (!r.ok || !p?.id) throw new Error("Session expired.");
  return String(p.id);
}
function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'").replace(/&times;/gi, "×")
    .replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function textLines(html: string) {
  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>|<\/tr>|<\/article>|<\/section>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeHtml(stripped).split(/\r?\n/).map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
}
function slug(v: string) { return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90); }
function cleanTitle(v: string) { return v.replace(/^\*\s*/, "").replace(/^Image:\s*/i, "").replace(/\s+/g, " ").trim(); }
function usefulTitle(line: string) {
  const x = cleanTitle(line);
  if (x.length < 10 || x.length > 190) return false;
  if (/^(add|compare|shop now|view results|view all|sort by|filter|all filters|price|brand|availability|category|sub-category|get it fast|showing \d+|load more|clear all|image|sponsored|free shipping|pickup|delivery|shipping|deals by|shop by|top categories|selected filters|find great|safer, easier shopping)/i.test(x)) return false;
  if (/^\$?\d+(?:\.\d{1,2})?$/.test(x) || /^was\s*\$?/i.test(x) || /^save\s*\$?/i.test(x)) return false;
  return true;
}
function resaleKeyword(title: string) {
  return /tool|battery|charger|drill|driver|impact|saw|nailer|grinder|sander|router|vacuum|compressor|generator|mower|blower|trimmer|chainsaw|pressure washer|storage|toolbox|tool box|workbench|ladder|grill|smoker|cooler|appliance|electronics|camera|speaker|headphone|tablet|laptop|tv|television|gaming|console|lego|collectible|outdoor power|snow blower|air conditioner|heater|dehumidifier|fan|light|lighting|faucet|fixture/i.test(title);
}
function potential(title: string, discount = 0, kind = "deal") {
  const t = title.toLowerCase();
  let score = 72;
  if (/milwaukee|dewalt|ryobi|ridgid|makita|bosch|kobalt|craftsman|metabo|greenworks|ego|stihl|weber|traeger|blackstone/.test(t)) score += 9;
  if (/battery|charger|combo kit|tool kit|power tool|generator|mower|blower|trimmer|chainsaw|vacuum|compressor|storage|toolbox|workbench|grill|smoker|electronics|speaker|gaming|lego/.test(t)) score += 8;
  if (/seasonal|holiday|decor|patio furniture|clearance/.test(t)) score += 2;
  if (/food|grocery|candy|snack|drink|cosmetic|makeup/.test(t)) score -= 14;
  if (kind === "penny") score += 10;
  if (kind === "in_store_bargain") score += 6;
  score += Math.min(12, Math.max(0, discount) / 5);
  return Math.max(45, Math.min(99, Math.round(score)));
}
function parseMoney(line: string) {
  const normalized = line.replace(/,/g, "");
  const m = normalized.match(/\$\s*(\d{1,6}(?:\.\d{1,2})?)/);
  if (m) return Number(m[1]);
  const n = normalized.match(/^(?:Now\s*)?(\d{1,6})\s+(\d{2})(?:\s|$)/i);
  if (n) return Number(`${n[1]}.${n[2]}`);
  return 0;
}
function nearbyPrice(lines: string[], start: number) {
  let current = 0, original = 0, discount = 0, sku = "";
  for (let j = start + 1; j <= Math.min(lines.length - 1, start + 10); j++) {
    const line = lines[j];
    const model = line.match(/(?:Model#|Model #|Item #|SKU:?)\s*([A-Za-z0-9._-]+)/i);
    if (model && !sku) sku = model[1];
    const pct = line.match(/(?:Save[^%]{0,40}|off\s*)\(?\s*(\d{1,2})\s*%\)?/i);
    if (pct) discount = Math.max(discount, Number(pct[1]));
    if (/^Was\b/i.test(line)) { const p = parseMoney(line); if (p) original = p; continue; }
    if (/^Save\b/i.test(line)) continue;
    if (!current) {
      const p = parseMoney(line);
      if (p) current = p;
    }
  }
  if (!discount && current > 0 && original > current) discount = Math.round((1 - current / original) * 100);
  return { current, original, discount, sku };
}
function parsePennyPage(html: string, source: Source) {
  const lines = textLines(html), updatedLine = lines.find((x) => /^Last Updated:/i.test(x)) || "";
  const updated = updatedLine.replace(/^Last Updated:\s*/i, "");
  const leads: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    const dateMatch = lines[i].match(/^(?:Penny Date|Date Pennied):\s*(.+)$/i);
    if (!dateMatch) continue;
    let title = "";
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) if (usefulTitle(lines[j])) { title = cleanTitle(lines[j]).replace(/^\d+[.)]\s*/, ""); break; }
    if (!title) continue;
    let sku = "", upc = "";
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 8); j++) {
      const m = lines[j].match(/SKU:\s*([A-Za-z0-9-]+).*?UPC:\s*([0-9]{7,14})/i);
      if (m) { sku = m[1]; upc = m[2]; break; }
    }
    if (!upc) continue;
    leads.push({
      id: `${slug(source.retailer)}:${upc}`, retailer: source.retailer, title, sku, upc,
      buy_price: 0.01, original_price: 0, discount_pct: 99, deal_type: "penny",
      penny_date: dateMatch[1].trim(), source_updated: updated, source_name: source.name,
      source_url: source.url, availability: "hunt", availability_label: "Chain penny lead · local shelf availability unknown",
      resale_potential: potential(title, 99, "penny"), source_priority: source.priority,
    });
  }
  return leads;
}
function parseRetailPage(html: string, source: Source) {
  const lines = textLines(html), leads: any[] = [], seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const title = cleanTitle(lines[i]);
    if (!usefulTitle(title) || !resaleKeyword(title)) continue;
    const info = nearbyPrice(lines, i);
    const id = `${slug(source.retailer)}:${slug(title)}:${info.sku || i}`;
    const dedupe = `${slug(source.retailer)}|${slug(title)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const hasPrice = info.current > 0;
    const hasDiscount = info.discount >= 10 || (info.original > info.current && info.current > 0);
    if (!hasPrice && source.kind === "deal" && source.retailer === "Home Depot") continue;
    if (hasPrice && info.discount > 0 && info.discount < 8 && source.kind !== "clearance") continue;
    leads.push({
      id, retailer: source.retailer, title, sku: info.sku, upc: "",
      buy_price: info.current, original_price: info.original, discount_pct: info.discount,
      deal_type: source.kind, penny_date: "", source_updated: new Date().toISOString().slice(0, 10),
      source_name: source.name, source_url: source.url, availability: source.kind === "in_store_bargain" ? "local_source" : "hunt",
      availability_label: source.kind === "in_store_bargain" ? "Retailer in-store bargain source · exact store listing varies" : "Retailer deal/clearance lead · local price and stock may vary",
      resale_potential: potential(title, info.discount, source.kind), source_priority: source.priority,
    });
    if (leads.length >= 45) break;
  }
  return leads;
}
function fallbackLead(source: Source) {
  const title = source.retailer === "Menards"
    ? "Ray's List — unclaimed orders, display models, dinged & dented bargains"
    : `${source.name} — browse current retailer deals`;
  return {
    id: `${slug(source.retailer)}:source:${slug(source.name)}`, retailer: source.retailer, title,
    sku: "", upc: "", buy_price: 0, original_price: 0, discount_pct: 0,
    deal_type: source.kind, penny_date: "", source_updated: new Date().toISOString().slice(0, 10),
    source_name: source.name, source_url: source.url, availability: "source",
    availability_label: source.kind === "in_store_bargain" ? "Store-specific bargain source · open source to view current local listings" : "Official retailer savings source · product extraction temporarily unavailable",
    resale_potential: source.kind === "in_store_bargain" ? 88 : 74,
    source_priority: source.priority, source_only: true,
  };
}
async function fetchHtml(source: Source) {
  const r = await fetch(source.url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Linux; Android 16; H38ResellerScout/0.1.6) AppleWebKit/537.36 Chrome/138 Safari/537.36",
      "accept": "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(14000),
  });
  if (!r.ok) throw new Error(`${source.name} returned ${r.status}`);
  return await r.text();
}
async function fetchSource(source: Source) {
  try {
    const html = await fetchHtml(source);
    const leads = source.kind === "penny" ? parsePennyPage(html, source) : parseRetailPage(html, source);
    if (leads.length) return { source, leads, warning: "" };
    if (source.sourceOnlyFallback) return { source, leads: [fallbackLead(source)], warning: `${source.name} returned no parseable product cards; source link retained.` };
    throw new Error(`${source.name} returned no parseable items`);
  } catch (e) {
    if (source.sourceOnlyFallback) return { source, leads: [fallbackLead(source)], warning: e instanceof Error ? e.message : String(e) };
    throw e;
  }
}
function dedupeAndLimit(leads: any[]) {
  const byKey = new Map<string, any>();
  for (const lead of leads) {
    const key = `${slug(lead.retailer)}|${lead.upc || slug(lead.title)}`;
    const old = byKey.get(key);
    if (!old || Number(lead.source_priority || 0) > Number(old.source_priority || 0) || Number(lead.discount_pct || 0) > Number(old.discount_pct || 0)) byKey.set(key, lead);
  }
  const grouped = new Map<string, any[]>();
  for (const lead of byKey.values()) {
    const a = grouped.get(lead.retailer) || [];
    a.push(lead); grouped.set(lead.retailer, a);
  }
  const out: any[] = [];
  for (const [, arr] of grouped) {
    arr.sort((a, b) => Number(b.resale_potential || 0) - Number(a.resale_potential || 0) || Number(b.discount_pct || 0) - Number(a.discount_pct || 0));
    out.push(...arr.slice(0, 70));
  }
  return out.sort((a, b) => Number(b.source_priority || 0) - Number(a.source_priority || 0) || Number(b.resale_potential || 0) - Number(a.resale_potential || 0));
}
async function buildPayload() {
  const allSources = [...PENNY_SOURCES, ...RETAIL_SOURCES];
  const results = await Promise.allSettled(allSources.map(fetchSource));
  const rawLeads: any[] = [], warnings: string[] = [], sourceStatus: any[] = [];
  for (let i = 0; i < results.length; i++) {
    const source = allSources[i], r = results[i];
    if (r.status === "fulfilled") {
      rawLeads.push(...r.value.leads);
      if (r.value.warning) warnings.push(r.value.warning);
      sourceStatus.push({ retailer: source.retailer, source: source.name, status: r.value.warning ? "PARTIAL" : "PASS", leads: r.value.leads.length });
    } else {
      const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
      warnings.push(message); sourceStatus.push({ retailer: source.retailer, source: source.name, status: "FAIL", leads: 0 });
    }
  }
  const leads = dedupeAndLimit(rawLeads);
  if (!leads.length) throw new Error(warnings.join("; ") || "Automatic deal sources unavailable.");
  return {
    status: "PASS", generated_at: new Date().toISOString(), count: leads.length,
    retailers: [...new Set(leads.map((x) => x.retailer))], leads, source_status: sourceStatus, warnings,
    note: "Automatic hunt leads come from penny-list and retailer-owned savings sources. Local shelf stock and local price are not claimed unless the retailer source itself is store-specific.",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "GET" && req.method !== "POST") return json(req, 405, { error: "GET or POST required." });
  try {
    const uid = await userId(req);
    if (!ALLOWED.has(uid)) return json(req, 403, { error: "Not authorized." });
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return json(req, 200, { ...cache.payload, cached: true });
    if (!inflight) inflight = buildPayload().then((payload) => { cache = { at: Date.now(), payload }; return payload; }).finally(() => { inflight = null; });
    const payload = await inflight;
    return json(req, 200, payload);
  } catch (e) {
    if (cache) return json(req, 200, { ...cache.payload, cached: true, stale: true, warning: e instanceof Error ? e.message : String(e) });
    return json(req, 503, { error: e instanceof Error ? e.message : String(e) });
  }
});
