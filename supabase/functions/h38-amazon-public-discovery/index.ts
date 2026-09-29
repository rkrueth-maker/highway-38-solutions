import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

type Any = Record<string, any>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const AMAZON_DEALS_URL = "https://www.amazon.com/s?k=deals";
const READER_URL = `https://r.jina.ai/${AMAZON_DEALS_URL}`;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const txt = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const round2 = (v: number | null) => v == null ? null : Number(v.toFixed(2));

function canonicalUrl(asin: string) {
  return `https://www.amazon.com/dp/${asin}`;
}

function nearbyMatches(text: string, re: RegExp) {
  const out: RegExpMatchArray[] = [];
  for (const m of text.matchAll(re)) out.push(m);
  return out;
}

function cleanTitle(raw: string) {
  return raw
    .replace(/^Image\s+\d+:\s*/i, "")
    .replace(/^\d+%\s+off\s+/i, "")
    .replace(/\s+(?:\d+%\s+off|Limited time deal|Early Prime Big Deal|Prime Big Deal).*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function parseWindow(context: string, asin: string): Any | null {
  const discountHits = nearbyMatches(context, /(\d{1,2})%\s+off/gi);
  const discountHit = discountHits.at(-1) || null;
  const discount = discountHit ? num(discountHit[1]) : null;
  const discountIndex = discountHit?.index ?? 0;
  const dealSegment = context.slice(discountIndex, Math.min(context.length, discountIndex + 650));

  const regularMatch = dealSegment.match(/(?:List(?: Price)?|Typical price):?\s*(?:List:?\s*)?\$([0-9]{1,5}(?:\.[0-9]{2})?)/i);
  const regular = regularMatch ? num(regularMatch[1]) : null;
  const beforeRegular = regularMatch?.index != null ? dealSegment.slice(0, regularMatch.index) : dealSegment.slice(0, 300);
  const currentHits = nearbyMatches(beforeRegular, /\$([0-9]{1,5}(?:\.[0-9]{2})?)/g);
  const price = currentHits.length ? num(currentHits[0][1]) : null;

  const imageHits = nearbyMatches(context, /https:\/\/m\.media-amazon\.com\/images\/[^)\s]+/gi);
  const image = imageHits.length ? txt(imageHits.at(-1)?.[0]) : "";

  const titleHits = nearbyMatches(context, /Image\s+\d+:\s*([^\]]{8,700})/gi);
  let title = titleHits.length ? cleanTitle(txt(titleHits.at(-1)?.[1])) : "";

  if (!title) {
    const line = context.split("\n").reverse().find(x => x.includes("% off") && x.length > 20) || "";
    title = cleanTitle(line.replace(/^.*?\]\(/, ""));
  }
  if (!title) title = `Amazon deal ${asin}`;

  const signal = /Early Prime Big Deal/i.test(dealSegment)
    ? "Early Prime Big Deal"
    : /Prime Big Deal/i.test(dealSegment)
    ? "Prime Big Deal"
    : /Limited time deal/i.test(dealSegment)
    ? "Limited Time Deal"
    : /Lightning deal/i.test(dealSegment)
    ? "Lightning Deal"
    : "Amazon Deal";

  if (discount == null && price == null) return null;
  return {
    asin,
    title,
    source_url: canonicalUrl(asin),
    image_url: image,
    price: round2(price),
    original_price: round2(regular),
    discount_percent: discount == null ? null : Number(discount.toFixed(1)),
    signal,
  };
}

function parseDeals(markdown: string) {
  const out = new Map<string, Any>();
  const re = /https:\/\/www\.amazon\.com\/[^\s)\]]*?\/dp\/([A-Z0-9]{10})[^\s)\]]*/gi;
  for (const match of markdown.matchAll(re)) {
    const asin = txt(match[1]).toUpperCase();
    if (!asin || out.has(asin)) continue;
    const start = Math.max(0, (match.index || 0) - 1200);
    const end = Math.min(markdown.length, (match.index || 0) + 350);
    const row = parseWindow(markdown.slice(start, end), asin);
    if (row) out.set(asin, row);
    if (out.size >= 80) break;
  }
  return [...out.values()];
}

function chooseDeals(rows: Any[], targetDiscount = 40) {
  const ranked = [...rows].sort((a, b) =>
    Number(b.discount_percent || 0) - Number(a.discount_percent || 0) ||
    Number((b.original_price || 0) - (b.price || 0)) - Number((a.original_price || 0) - (a.price || 0))
  );
  const target = ranked.filter(x => Number(x.discount_percent || 0) >= targetDiscount);
  const fill = ranked.filter(x => Number(x.discount_percent || 0) >= 10 && !target.some(y => y.asin === x.asin));
  return [...target, ...fill].slice(0, 24);
}

async function authenticate(req: Request, admin: any) {
  const supplied = txt(req.headers.get("x-h38-nightly-key"));
  if (!supplied) return false;
  const q = await admin.from("h38_internal_job_secrets").select("secret_value")
    .eq("name", "penny-nightly").maybeSingle();
  if (q.error || !q.data?.secret_value) return false;
  return supplied === txt(q.data.secret_value);
}

async function normalizeWatchRows(admin: any, watchIds: string[], nightlyKey: string) {
  if (!watchIds.length) return { ok: true, skipped: true };
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/h38-deal-engine-api`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "content-type": "application/json",
        "x-h38-nightly-key": nightlyKey,
      },
      body: JSON.stringify({ action: "scheduled_watch_refresh", watch_ids: watchIds }),
      signal: AbortSignal.timeout(45000),
    });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, ...body };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST_REQUIRED" }, 405);
  const started = Date.now();
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!await authenticate(req, admin)) return json({ error: "WORKER_AUTH_REQUIRED" }, 401);

  const secretQ = await admin.from("h38_internal_job_secrets").select("secret_value")
    .eq("name", "penny-nightly").maybeSingle();
  if (secretQ.error || !secretQ.data?.secret_value) return json({ error: "WORKER_SECRET_MISSING" }, 500);
  const nightlyKey = txt(secretQ.data.secret_value);

  const watchesQ = await admin.from("coupon_watch_rules").select("*")
    .eq("enabled", true).eq("source", "amazon").eq("watch_mode", "discovery");
  if (watchesQ.error) return json({ error: "WATCH_READ_FAILED", detail: watchesQ.error.message }, 500);
  const watches = watchesQ.data || [];
  if (!watches.length) return json({ ok: true, products: 0, watches: 0, reason: "NO_ENABLED_AMAZON_DISCOVERY_WATCHES" });

  let markdown = "";
  try {
    const r = await fetch(READER_URL, {
      headers: { accept: "text/plain", "user-agent": "H38-Deals-Amazon-Public/1.0" },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return json({ error: "AMAZON_PUBLIC_FETCH_FAILED", status: r.status }, 502);
    markdown = await r.text();
  } catch (e) {
    return json({ error: "AMAZON_PUBLIC_FETCH_FAILED", detail: e instanceof Error ? e.message : String(e) }, 502);
  }

  const parsed = parseDeals(markdown);
  const targetDiscount = Math.max(0, ...watches.map((w: Any) => Number(w.target_discount_percent || 0)));
  const selected = chooseDeals(parsed, targetDiscount || 40);
  if (!selected.length) return json({ error: "AMAZON_PUBLIC_PARSE_EMPTY", parsed: parsed.length }, 502);

  const now = new Date();
  const expires = new Date(now.getTime() + 8 * 3600000).toISOString();
  const observed = now.toISOString();
  const watchIds: string[] = [];

  for (const watch of watches) {
    const watchId = txt(watch.id);
    watchIds.push(watchId);

    await admin.from("coupon_watch_discovery_cache").delete()
      .eq("watch_id", watchId)
      .in("result_kind", ["search", "event"]);

    const rows = selected.map((x: Any) => ({
      watch_id: watchId,
      user_id: watch.user_id,
      source: "amazon_public_deals",
      title: x.title,
      snippet: `${x.signal}${x.discount_percent != null ? ` · ${x.discount_percent}% off` : ""}${x.original_price != null ? ` · list $${x.original_price}` : ""}`,
      source_url: x.source_url,
      price: x.price,
      original_price: x.original_price,
      discount_percent: x.discount_percent,
      signal: x.signal,
      result_kind: "product",
      observed_at: observed,
      expires_at: expires,
    }));
    const up = await admin.from("coupon_watch_discovery_cache").upsert(rows, { onConflict: "watch_id,source_url" });
    if (up.error) return json({ error: "AMAZON_CACHE_UPSERT_FAILED", detail: up.error.message }, 500);

    const bestPrice = selected.map(x => Number(x.price)).filter(Number.isFinite).sort((a, b) => a - b)[0] ?? null;
    await admin.from("coupon_watch_rules").update({
      last_checked_at: observed,
      last_price: bestPrice,
      last_status: `Amazon public deals: ${selected.length} current products`,
    }).eq("id", watchId);
  }

  const normalized = await normalizeWatchRows(admin, watchIds, nightlyKey);
  return json({
    ok: true,
    source: "amazon_public_deals",
    amazon_url: AMAZON_DEALS_URL,
    watches: watches.length,
    parsed_products: parsed.length,
    stored_products: selected.length,
    target_discount_percent: targetDiscount || 40,
    examples: selected.slice(0, 8),
    normalized,
    elapsed_ms: Date.now() - started,
  });
});
