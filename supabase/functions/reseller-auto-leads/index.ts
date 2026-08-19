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
const SOURCE_URL = "https://www.pennycentral.com/penny-list";
const CACHE_TTL_MS = 10 * 60 * 1000;
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
function decodeHtml(value: string) {
  return String(value || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}
function clean(value: any) {
  return decodeHtml(String(value || "")).replace(/\s+/g, " ").trim();
}
function visibleLines(html: string) {
  return decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6]|tr|article|section|button|a)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
function dollars(value: string) {
  return [...String(value || "").matchAll(/\$\s*([0-9]{1,7}(?:,[0-9]{3})*(?:\.\d{1,2})?)/g)]
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n >= 0);
}
function usefulTitle(value: string) {
  const s = clean(value);
  if (s.length < 8 || s.length > 240) return false;
  if (/^(?:fresh signal|community|last seen:?|report find|home depot|check amazon|reported by|filters?|sort|my list|report)$/i.test(s)) return false;
  if (/^\$/.test(s) || /^SKU\s+/i.test(s) || /^\d+\s+(?:reports?|states?)$/i.test(s)) return false;
  if (/^(?:[A-Z]{2}\s+\d+\s*)+(?:\+\d+ more)?$/i.test(s)) return false;
  return true;
}
function resaleScore(original: number, reports: number, states: number, title: string) {
  let score = 74;
  if (original >= 50) score += 5;
  if (original >= 150) score += 5;
  if (original >= 300) score += 4;
  score += Math.min(8, Math.floor(Math.log2(Math.max(1, reports)) * 2));
  score += Math.min(5, Math.floor(states / 5));
  if (/milwaukee|ryobi|dewalt|ridgid|makita|husky|klein|weber|traeger|blackstone/i.test(title)) score += 4;
  return Math.max(60, Math.min(99, score));
}
function parsePennyCentral(html: string) {
  const lines = visibleLines(html);
  const found: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    const skuMatch = lines[i].match(/^SKU\s+([0-9][0-9-]{4,20})$/i);
    if (!skuMatch) continue;
    const sku = skuMatch[1];
    const skuDigits = sku.replace(/\D/g, "");
    if (skuDigits.length < 5) continue;

    let title = "";
    let originalPrice = 0;
    for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
      const amounts = dollars(lines[j]);
      if (amounts.length) {
        for (const amount of amounts) if (amount > originalPrice) originalPrice = amount;
        continue;
      }
      if (!title && usefulTitle(lines[j])) title = clean(lines[j]);
    }
    if (!title) continue;

    let lastSeen = "Recent";
    let reports = 0;
    let states = 0;
    let stateSummary = "";
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 18); j++) {
      if (/^Last seen:?$/i.test(lines[j]) && lines[j + 1]) lastSeen = clean(lines[j + 1]);
      const r = lines[j].match(/^(\d{1,5})\s+reports?$/i);
      if (r) reports = Number(r[1]);
      const s = lines[j].match(/^(\d{1,3})\s+states?$/i);
      if (s) states = Number(s[1]);
      if (!stateSummary && /^(?:[A-Z]{2}\s+\d+\s*)+(?:\+\d+ more)?$/i.test(lines[j])) stateSummary = clean(lines[j]);
    }

    found.push({
      id: `home-depot:${skuDigits}`,
      retailer: "Home Depot",
      title,
      sku,
      upc: "",
      buy_price: 0.01,
      original_price: originalPrice,
      discount_pct: originalPrice > 0.01 ? Math.round((1 - 0.01 / originalPrice) * 100) : 99,
      deep_discount: true,
      deal_type: "penny",
      penny_date: lastSeen,
      source_name: "PennyCentral community penny board",
      source_url: SOURCE_URL,
      home_depot_search_url: `https://www.homedepot.com/s/${encodeURIComponent(skuDigits)}`,
      availability_label: `Community penny signal · ${reports || 1} report${reports === 1 ? "" : "s"}${states ? ` · ${states} state${states === 1 ? "" : "s"}` : ""} · last seen ${lastSeen}. Open a Home Depot store to auto-check its public price and quantity/availability.`,
      resale_potential: resaleScore(originalPrice, reports, states, title),
      source_priority: 130,
      community_reports: reports,
      community_states: states,
      state_summary: stateSummary,
      stock_status: "not_checked",
      stock_count: null,
      stock_checked: false,
    });
  }

  const deduped = new Map<string, any>();
  for (const lead of found) {
    const previous = deduped.get(lead.id);
    if (!previous || lead.community_reports > previous.community_reports) deduped.set(lead.id, lead);
  }
  return [...deduped.values()]
    .sort((a, b) =>
      Number(b.community_reports || 0) - Number(a.community_reports || 0) ||
      Number(b.community_states || 0) - Number(a.community_states || 0) ||
      Number(b.original_price || 0) - Number(a.original_price || 0),
    )
    .slice(0, 80);
}
async function buildPayload() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 H38ResellerScout/0.1.13",
      "accept": "text/html,application/xhtml+xml,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error(`Penny source returned ${response.status}.`);
  const html = await response.text();
  const leads = parsePennyCentral(html);
  if (!leads.length) throw new Error("Penny source returned no parseable Home Depot penny candidates.");
  const payload = {
    status: "PASS",
    generated_at: new Date().toISOString(),
    count: leads.length,
    retailers: ["Home Depot"],
    by_retailer: { "Home Depot": leads.length },
    deep_by_retailer: { "Home Depot": leads.length },
    leads,
    source_status: [{ retailer: "Home Depot", source: "PennyCentral community penny board", kind: "penny", status: "PASS", products: leads.length }],
    warnings: [],
    adapter_version: "home-depot-penny-community-v1",
    stock_rule: "Opening a Home Depot store triggers store-bound price and quantity/availability checks for the visible penny candidates. Missing quantities are reported as not exposed; H38 does not invent counts.",
    note: "Penny entries are community hunt signals, not checkout guarantees. The store-bound checker separately reads Home Depot public product/store pages when the store card is opened.",
  };
  console.log("reseller-auto-leads home-depot-penny-community-v1", JSON.stringify({ count: leads.length }));
  return payload;
}

Deno.serve(async (req: Request) => {
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
    if (cache) return json(req, 200, { ...cache.payload, cached: true, stale: true, warning: error instanceof Error ? error.message : String(error) });
    return json(req, 503, { error: error instanceof Error ? error.message : String(error) });
  }
});
