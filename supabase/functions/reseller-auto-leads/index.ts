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
const SOURCES = [
  {
    retailer: "Dollar General",
    url: "https://retailshout.com/latest-dollar-general-penny-items-near-you/",
  },
  {
    retailer: "Dollar Tree",
    url: "https://retailshout.com/latest-dollar-tree-penny-items-near-you/",
  },
];
const CACHE_TTL_MS = 30 * 60 * 1000;
let cache: { at: number; payload: unknown } | null = null;
let inflight: Promise<unknown> | null = null;

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ORIGINS.has(origin) ? origin : "https://appassets.androidplatform.net",
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, max-age=300",
    "vary": "Origin",
  };
}
function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}
async function userId(req: Request) {
  const token = String(req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Sign in required.");
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: `Bearer ${token}`, apikey: SERVICE_KEY },
  });
  const p = await r.json().catch(() => ({}));
  if (!r.ok || !p?.id) throw new Error("Session expired.");
  return String(p.id);
}
function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&times;/gi, "×")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function textLines(html: string) {
  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>|<\/h[1-6]>|<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeHtml(stripped)
    .split(/\r?\n/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
function usefulTitle(line: string) {
  return !!line &&
    !/^\d+[.)]?$/.test(line) &&
    !/^Image:/i.test(line) &&
    !/^Recently Pennied$/i.test(line) &&
    !/^Last Updated:/i.test(line) &&
    !/^Penny Date:|^Date Pennied:/i.test(line) &&
    !/^Was\s+/i.test(line) &&
    !/^SKU:/i.test(line);
}
function potential(title: string) {
  const t = title.toLowerCase();
  if (/diaper|wipe|razor|deodorant|shampoo|conditioner|soap|lotion|cetaphil|vaseline|sheamoisture|pantene|kiss|swiffer|paper towel/.test(t)) return 92;
  if (/tool|battery|electronics|charger|vacuum|appliance/.test(t)) return 90;
  if (/candy|gummy|chocolate|snack|food|frozen|ice cream|tomato/.test(t)) return 58;
  if (/graduation|seasonal|decor|mug|frame|tumbler|lanyard|banner|yard stake/.test(t)) return 72;
  return 80;
}
function parsePennyPage(html: string, retailer: string, sourceUrl: string) {
  const lines = textLines(html);
  const updatedLine = lines.find((x) => /^Last Updated:/i.test(x)) || "";
  const updated = updatedLine.replace(/^Last Updated:\s*/i, "");
  const leads: any[] = [];
  for (let i = 0; i < lines.length; i++) {
    const dateMatch = lines[i].match(/^(?:Penny Date|Date Pennied):\s*(.+)$/i);
    if (!dateMatch) continue;
    let title = "";
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      if (usefulTitle(lines[j])) { title = lines[j].replace(/^\d+[.)]\s*/, "").trim(); break; }
    }
    if (!title) continue;
    let sku = "", upc = "";
    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 8); j++) {
      const m = lines[j].match(/SKU:\s*([A-Za-z0-9-]+).*?UPC:\s*([0-9]{7,14})/i);
      if (m) { sku = m[1]; upc = m[2]; break; }
    }
    if (!upc) continue;
    leads.push({
      id: `${retailer.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${upc}`,
      retailer,
      title,
      sku,
      upc,
      buy_price: 0.01,
      deal_type: "penny",
      penny_date: dateMatch[1].trim(),
      source_updated: updated,
      source_name: "RetailShout",
      source_url: sourceUrl,
      availability: "hunt",
      availability_label: "Chain penny lead · local shelf availability unknown",
      resale_potential: potential(title),
    });
  }
  const seen = new Set<string>();
  return leads.filter((x) => !seen.has(x.id) && seen.add(x.id));
}
async function fetchSource(source: { retailer: string; url: string }) {
  const r = await fetch(source.url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; H38PrivateResellerScout/0.1.4; +https://highway38solutions.com)",
      "accept": "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`${source.retailer} source returned ${r.status}`);
  const html = await r.text();
  const leads = parsePennyPage(html, source.retailer, source.url);
  if (!leads.length) throw new Error(`${source.retailer} source returned no parseable penny items`);
  return { retailer: source.retailer, leads };
}
async function buildPayload() {
  const results = await Promise.allSettled(SOURCES.map(fetchSource));
  const leads: any[] = [];
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") leads.push(...r.value.leads);
    else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
  }
  if (!leads.length) throw new Error(errors.join("; ") || "Automatic deal sources unavailable.");
  leads.sort((a, b) => String(b.penny_date).localeCompare(String(a.penny_date)) || b.resale_potential - a.resale_potential);
  return {
    status: "PASS",
    generated_at: new Date().toISOString(),
    count: leads.length,
    retailers: [...new Set(leads.map((x) => x.retailer))],
    leads,
    warnings: errors,
    note: "Penny pricing is a chain-level hunt lead. Shelf availability must be checked at the physical store.",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "GET" && req.method !== "POST") return json(req, 405, { error: "GET or POST required." });
  try {
    const uid = await userId(req);
    if (!ALLOWED.has(uid)) return json(req, 403, { error: "Not authorized." });
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return json(req, 200, { ...(cache.payload as any), cached: true });
    if (!inflight) inflight = buildPayload().then((payload) => { cache = { at: Date.now(), payload }; return payload; }).finally(() => { inflight = null; });
    const payload = await inflight;
    return json(req, 200, payload);
  } catch (e) {
    if (cache) return json(req, 200, { ...(cache.payload as any), cached: true, stale: true, warning: e instanceof Error ? e.message : String(e) });
    return json(req, 503, { error: e instanceof Error ? e.message : String(e) });
  }
});
