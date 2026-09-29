import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const text = (v: unknown) => String(v ?? "").trim();
const norm = (v: unknown) => text(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
const marker = "[AUTO:BING_EBAY_PUBLIC_V1]";
const stop = new Set(["the","and","with","for","from","this","that","new","pack","piece","pieces","black","white","men","women","womens","mens","fits","perfect","device","devices"]);

function stripHtml(v: unknown) {
  return text(v)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRssItems(xml: string) {
  const out: any[] = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const item = match[1] || "";
    const value = (tag: string) => stripHtml((item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i")) || [])[1] || "");
    out.push({ title: value("title"), link: value("link"), description: value("description"), pubDate: value("pubDate") });
  }
  return out;
}

async function fetchText(url: string, timeout = 10000) {
  const r = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 H38DealEngine/1.0 (+https://highway38solutions.com)",
      accept: "application/rss+xml,application/xml,text/xml,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
  });
  const body = await r.text().catch(() => "");
  if (!r.ok) throw new Error(`PUBLIC_INDEX_HTTP_${r.status}`);
  return body;
}

function titleTokens(v: unknown) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of norm(v).split(" ")) {
    if (token.length < 3 || stop.has(token) || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= 12) break;
  }
  return out;
}

function searchQuery(row: any) {
  const upc = text(row.upc).replace(/\D/g, "");
  if (upc.length >= 8) return `site:ebay.com/itm "${upc}" (sold OR completed)`;
  const sku = text(row.sku);
  if (sku.length >= 4) return `site:ebay.com/itm "${sku.replace(/[\"']/g, " ")}" (sold OR completed)`;
  const tokens = titleTokens(row.title).slice(0, 8);
  return `site:ebay.com/itm "${tokens.join(" ")}" (sold OR completed)`;
}

function directEbayItemUrl(v: unknown) {
  try {
    const u = new URL(text(v));
    return /(^|\.)ebay\.com$/i.test(u.hostname) && /^\/itm\//i.test(u.pathname) ? u.toString() : "";
  } catch { return ""; }
}

function priceFrom(v: unknown) {
  const s = stripHtml(v);
  const explicit = s.match(/(?:sold\s+(?:for|at)|price\s*[:\-])\s*(?:US\s*)?\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (explicit) return Number(explicit[1].replace(/,/g, ""));
  const values = [...s.matchAll(/(?:US\s*)?\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi)]
    .map(m => Number(m[1].replace(/,/g, ""))).filter(Number.isFinite);
  const unique = [...new Set(values.map(v => Number(v.toFixed(2))))];
  return unique.length === 1 ? unique[0] : null;
}

function classify(v: unknown): "sold" | "completed" | "active" {
  const s = stripHtml(v).toLowerCase();
  if (/\b(?:this listing sold|listing sold|sold for|sold on|item sold)\b/.test(s)) return "sold";
  if (/\b(?:this listing has ended|listing ended|completed listing|ended listing)\b/.test(s)) return "completed";
  return "active";
}

function relevance(row: any, item: any) {
  const combined = norm(`${item.title} ${item.description}`);
  const upc = text(row.upc).replace(/\D/g, "");
  const sku = norm(row.sku);
  if (upc.length >= 8 && combined.replace(/\D/g, "").includes(upc)) return { ok: true, ratio: 1, identifier: true };
  if (sku.length >= 4 && combined.includes(sku)) return { ok: true, ratio: 1, identifier: true };
  const target = titleTokens(row.title);
  if (target.length < 4) return { ok: false, ratio: 0, identifier: false };
  const hits = target.filter(t => combined.includes(t)).length;
  const ratio = hits / target.length;
  return { ok: hits >= 3 && ratio >= 0.45, ratio, identifier: false };
}

function toEvidence(row: any, item: any) {
  const sourceUrl = directEbayItemUrl(item.link);
  if (!sourceUrl) return null;
  const rel = relevance(row, item);
  if (!rel.ok) return null;
  const body = `${item.title} ${item.description}`;
  const evidenceType = classify(body);
  const price = priceFrom(body);
  if (evidenceType === "active" && price === null) return null;
  if (evidenceType === "active" && !rel.identifier && rel.ratio < 0.70) return null;
  const confidence = clamp(
    (evidenceType === "sold" ? 55 : evidenceType === "completed" ? 46 : 40) +
    (rel.identifier ? 20 : Math.round(rel.ratio * 20)) +
    (price !== null ? 10 : 0), 0, 92,
  );
  return {
    evidence_type: evidenceType,
    marketplace: "eBay public index",
    title: stripHtml(item.title) || text(row.title),
    source_url: sourceUrl,
    observed_price: price,
    shipping_price: null,
    condition_label: "",
    upc: text(row.upc),
    sku: text(row.sku),
    asin: "",
    confidence_score: confidence,
    observed_at: new Date().toISOString(),
    sold_at: null,
    notes: `${marker} Public search-index evidence only. ${evidenceType === "sold" ? "Sold status was explicit in the indexed text." : evidenceType === "completed" ? "Listing completion was explicit; sale was not proven." : "Current/active evidence only."} Match=${rel.identifier ? "identifier" : `title:${Math.round(rel.ratio * 100)}%`}.`,
  };
}

async function saveEvidence(admin: any, row: any, createdBy: string, evidence: any) {
  const existing = await admin.from("deal_engine_market_evidence").select("id,notes")
    .eq("household_id", row.household_id).eq("canonical_key", row.canonical_key)
    .eq("evidence_type", evidence.evidence_type).eq("source_url", evidence.source_url)
    .limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) {
    if (!text(existing.data.notes).startsWith(marker)) return "manual_preserved";
    const q = await admin.from("deal_engine_market_evidence").update({
      ...evidence, updated_at: new Date().toISOString(),
    }).eq("id", existing.data.id);
    if (q.error) throw q.error;
    return "updated";
  }
  const q = await admin.from("deal_engine_market_evidence").insert({
    household_id: row.household_id,
    canonical_key: row.canonical_key,
    created_by: createdBy,
    ...evidence,
  });
  if (q.error) throw q.error;
  return "inserted";
}

async function searchOne(admin: any, row: any, createdBy: string) {
  const query = searchQuery(row);
  const attemptedAt = new Date().toISOString();
  try {
    const xml = await fetchText(`https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&count=20`);
    const candidates = parseRssItems(xml).map(item => toEvidence(row, item)).filter(Boolean).slice(0, 6) as any[];
    let inserted = 0, updated = 0, manualPreserved = 0;
    for (const evidence of candidates) {
      const result = await saveEvidence(admin, row, createdBy, evidence);
      if (result === "inserted") inserted++;
      else if (result === "updated") updated++;
      else manualPreserved++;
    }
    const soldCount = candidates.filter(x => x.evidence_type === "sold").length;
    const activeCount = candidates.filter(x => x.evidence_type === "active").length;
    const completedCount = candidates.filter(x => x.evidence_type === "completed").length;
    const status = candidates.length ? "PASS" : "EMPTY";
    const state = await admin.from("deal_engine_market_refresh_state").upsert({
      household_id: row.household_id,
      canonical_key: row.canonical_key,
      last_attempt_at: attemptedAt,
      last_success_at: candidates.length ? attemptedAt : null,
      result_count: candidates.length,
      sold_count: soldCount,
      active_count: activeCount,
      completed_count: completedCount,
      status,
      last_query: query,
      last_error: "",
      updated_at: attemptedAt,
    }, { onConflict: "household_id,canonical_key" });
    if (state.error) throw state.error;
    return { canonical_key: row.canonical_key, title: row.title, status, found: candidates.length, sold: soldCount, active: activeCount, completed: completedCount, inserted, updated, manual_preserved: manualPreserved, query };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("deal_engine_market_refresh_state").upsert({
      household_id: row.household_id,
      canonical_key: row.canonical_key,
      last_attempt_at: attemptedAt,
      result_count: 0,
      sold_count: 0,
      active_count: 0,
      completed_count: 0,
      status: "ERROR",
      last_query: query,
      last_error: message.slice(0, 500),
      updated_at: attemptedAt,
    }, { onConflict: "household_id,canonical_key" });
    return { canonical_key: row.canonical_key, title: row.title, status: "ERROR", found: 0, error: message, query };
  }
}

async function userIdForToken(sb: any, token: string) {
  try {
    const claims = await sb.auth.getClaims(token);
    const sub = text(claims?.data?.claims?.sub);
    if (!claims?.error && sub) return sub;
  } catch {}
  try {
    const { data: { user }, error } = await sb.auth.getUser(token);
    return !error && user?.id ? String(user.id) : "";
  } catch { return ""; }
}

async function ownerMap(admin: any, householdIds: string[]) {
  const out = new Map<string, string>();
  if (!householdIds.length) return out;
  const q = await admin.from("coupon_household_members").select("household_id,user_id,role").in("household_id", householdIds);
  if (q.error) throw q.error;
  for (const row of q.data || []) {
    const key = text(row.household_id);
    if (!out.has(key) || text(row.role).toLowerCase() === "owner") out.set(key, text(row.user_id));
  }
  return out;
}

async function batchRows(admin: any, limit: number) {
  const observations = await admin.from("deal_engine_observations")
    .select("household_id,canonical_key,retailer,title,upc,sku,observed_price,opportunity_score,observed_at")
    .eq("active", true).eq("product_area", "resale").not("observed_price", "is", null)
    .order("opportunity_score", { ascending: false }).limit(100);
  if (observations.error) throw observations.error;
  const rows = observations.data || [];
  if (!rows.length) return [];
  const states = await admin.from("deal_engine_market_refresh_state")
    .select("household_id,canonical_key,last_attempt_at").in("canonical_key", rows.map((x: any) => x.canonical_key));
  if (states.error) throw states.error;
  const stateMap = new Map((states.data || []).map((x: any) => [`${x.household_id}|${x.canonical_key}`, x]));
  const dueBefore = Date.now() - 18 * 3600000;
  return rows
    .map((row: any) => ({ row, state: stateMap.get(`${row.household_id}|${row.canonical_key}`) }))
    .filter((x: any) => !x.state?.last_attempt_at || Date.parse(x.state.last_attempt_at) < dueBefore)
    .sort((a: any, b: any) => {
      const aa = a.state?.last_attempt_at ? Date.parse(a.state.last_attempt_at) : 0;
      const bb = b.state?.last_attempt_at ? Date.parse(b.state.last_attempt_at) : 0;
      return aa - bb || Number(b.row.opportunity_score || 0) - Number(a.row.opportunity_score || 0);
    })
    .slice(0, limit).map((x: any) => x.row);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST_REQUIRED" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "AUTH_REQUIRED" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    const serviceRun = token === service;

    let rows: any[] = [];
    let createdByByHousehold = new Map<string, string>();
    if (serviceRun) {
      const limit = Math.max(1, Math.min(8, Number(body.limit || 6)));
      rows = await batchRows(admin, limit);
      createdByByHousehold = await ownerMap(admin, [...new Set(rows.map((x: any) => text(x.household_id)).filter(Boolean))]);
    } else {
      const sb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
      const userId = await userIdForToken(sb, token);
      if (!userId) return json({ error: "AUTH_REQUIRED" }, 401);
      const ent = await sb.from("h38_product_entitlements").select("active,expires_at")
        .eq("user_id", userId).eq("product_key", "resale").maybeSingle();
      if (!ent.data?.active || (ent.data.expires_at && Date.parse(ent.data.expires_at) <= Date.now())) return json({ error: "PRODUCT_LOCKED" }, 403);
      const membership = await admin.from("coupon_household_members").select("household_id")
        .eq("user_id", userId).limit(1).maybeSingle();
      if (membership.error || !membership.data?.household_id) return json({ error: "HOUSEHOLD_REQUIRED" }, 403);
      const canonicalKey = text(body.canonical_key);
      if (!canonicalKey) return json({ error: "CANONICAL_KEY_REQUIRED" }, 400);
      const observation = await admin.from("deal_engine_observations")
        .select("household_id,canonical_key,retailer,title,upc,sku,observed_price,opportunity_score,observed_at")
        .eq("household_id", membership.data.household_id).eq("canonical_key", canonicalKey)
        .eq("active", true).eq("product_area", "resale").maybeSingle();
      if (observation.error || !observation.data) return json({ error: "RESALE_OPPORTUNITY_NOT_FOUND" }, 404);
      rows = [observation.data];
      createdByByHousehold.set(text(membership.data.household_id), userId);
    }

    const results = [];
    for (const row of rows) {
      const createdBy = createdByByHousehold.get(text(row.household_id));
      if (!createdBy) {
        results.push({ canonical_key: row.canonical_key, status: "SKIPPED", error: "HOUSEHOLD_OWNER_NOT_FOUND" });
        continue;
      }
      results.push(await searchOne(admin, row, createdBy));
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const found = results.reduce((sum, x: any) => sum + Number(x.found || 0), 0);
    const sold = results.reduce((sum, x: any) => sum + Number(x.sold || 0), 0);
    return json({
      ok: true,
      mode: serviceRun ? "bounded_batch" : "single_opportunity",
      provider: "Bing public index → eBay item pages",
      truth: "SOLD is recorded only when indexed public text explicitly says sold. Completed-but-not-proven-sold stays COMPLETED; ambiguous product matches are discarded.",
      searched: results.length,
      evidence_found: found,
      sold_found: sold,
      results,
    });
  } catch (e) {
    return json({ error: "MARKET_REFRESH_ERROR", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
