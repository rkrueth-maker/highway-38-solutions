import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const headers = { "Content-Type": "application/json" };
const text = (v: unknown) => String(v ?? "").trim();
const norm = (v: unknown) => text(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const marker = "[AUTO:BING_HIBID_SOURCE_V2]";
const stop = new Set(["the","and","with","for","from","this","that","new","pack","piece","pieces","black","white","men","women","womens","mens","fits","perfect","device","devices"]);

function strip(v: unknown) {
  return text(v).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'").replace(/&nbsp;|&#160;/gi, " ").replace(/\s+/g, " ").trim();
}
function rss(xml: string) {
  const out: any[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const item = m[1] || "";
    const value = (tag: string) => strip((item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i")) || [])[1] || "");
    out.push({ title: value("title"), link: value("link"), description: value("description") });
  }
  return out;
}
async function fetchRss(query: string) {
  const r = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&count=30`, {
    headers: { "user-agent": "Mozilla/5.0 H38DealEngine/1.2 (+https://highway38solutions.com)", accept: "application/rss+xml,application/xml,*/*;q=0.8" },
    signal: AbortSignal.timeout(10000), redirect: "follow",
  });
  const body = await r.text().catch(() => "");
  if (!r.ok) throw new Error(`PUBLIC_INDEX_HTTP_${r.status}`);
  return rss(body);
}
async function fetchLotPage(url: string) {
  const r = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 H38DealEngine/1.2 (+https://highway38solutions.com)", accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(8000), redirect: "follow",
  });
  const body = await r.text().catch(() => "");
  if (!r.ok) throw new Error(`HIBID_HTTP_${r.status}`);
  return { url: hibidUrl(r.url) || url, plain: strip(body) };
}
function tokens(v: unknown) {
  const out: string[] = [], seen = new Set<string>();
  for (const token of norm(v).split(" ")) {
    if (token.length < 3 || stop.has(token) || seen.has(token)) continue;
    seen.add(token); out.push(token); if (out.length >= 12) break;
  }
  return out;
}
function searchQueries(row: any) {
  const t = tokens(row.title), words = t.filter(x => /[a-z]/.test(x));
  const strict = `site:hibid.com/lot "${t.slice(0,5).join(" ")}"`;
  const anchor = words.slice(0, Math.min(2, words.length)).join(" ");
  const broad = anchor ? `site:hibid.com/lot "${anchor}"` : strict;
  return [...new Set([strict, broad])].slice(0, 2);
}
function relevance(row: any, candidate: any) {
  const hay = norm(`${candidate.title || ""} ${candidate.description || ""}`), target = tokens(row.title);
  const upc = text(row.upc).replace(/\D/g, ""), sku = norm(row.sku);
  if (upc.length >= 8 && hay.replace(/\D/g, "").includes(upc)) return { ok: true, ratio: 1, identifier: true };
  if (sku.length >= 4 && hay.includes(sku)) return { ok: true, ratio: 1, identifier: true };
  if (target.length < 4) return { ok: false, ratio: 0, identifier: false };
  const hits = target.filter(t => hay.includes(t)).length, ratio = hits / target.length;
  return { ok: hits >= 3 && ratio >= .45, ratio, identifier: false };
}
function hibidUrl(v: unknown) {
  try { const u = new URL(text(v)); return (u.hostname === "hibid.com" || u.hostname.endsWith(".hibid.com")) && /\/lot\//i.test(u.pathname) ? u.toString() : ""; }
  catch { return ""; }
}
function realizedPrice(v: unknown) {
  const s = strip(v).replace(/,/g, "");
  const m = s.match(/Price\s+Realized\s*:?\s*(?:US\s*)?\$?\s*([0-9]{1,8}(?:\.\d{1,2})?)\s*(?:USD)?/i);
  return m ? Number(m[1]) : null;
}
async function ownerMap(admin: any, ids: string[]) {
  const out = new Map<string,string>(); if (!ids.length) return out;
  const q = await admin.from("coupon_household_members").select("household_id,user_id,role").in("household_id", ids);
  if (q.error) throw q.error;
  for (const r of q.data || []) if (!out.has(r.household_id) || text(r.role).toLowerCase() === "owner") out.set(r.household_id, r.user_id);
  return out;
}
async function save(admin: any, row: any, createdBy: string, item: any, page: {url:string;plain:string}) {
  const url = page.url; if (!url) return null;
  const rel = relevance(row, { title: item.title, description: `${item.description} ${page.plain}` }); if (!rel.ok) return null;
  const price = realizedPrice(page.plain), mentionsRealized = /Price\s+Realized/i.test(page.plain);
  if (!mentionsRealized) return null;
  const evidenceType = price !== null ? "sold" : "completed";
  const confidence = Math.min(96, (price !== null ? 78 : 54) + (rel.identifier ? 15 : Math.round(rel.ratio * 12)));
  const existing = await admin.from("deal_engine_market_evidence").select("id,notes")
    .eq("household_id", row.household_id).eq("canonical_key", row.canonical_key)
    .eq("evidence_type", evidenceType).eq("source_url", url).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  const payload = {
    evidence_type: evidenceType, marketplace: "HiBid source lot", title: strip(item.title) || row.title,
    source_url: url, observed_price: price, shipping_price: null, condition_label: "", upc: text(row.upc), sku: text(row.sku), asin: "",
    confidence_score: confidence, observed_at: new Date().toISOString(), sold_at: null,
    notes: `${marker} ${price !== null ? "Numeric Price Realized was verified on the HiBid lot page." : "HiBid lot page showed Price Realized without a numeric value; recorded as COMPLETED, not SOLD."} Match=${rel.identifier ? "identifier" : `title:${Math.round(rel.ratio*100)}%`}.`,
    updated_at: new Date().toISOString(),
  };
  if (existing.data?.id) {
    if (!text(existing.data.notes).startsWith("[AUTO:")) return { type: evidenceType, action: "manual_preserved" };
    const q = await admin.from("deal_engine_market_evidence").update(payload).eq("id", existing.data.id); if (q.error) throw q.error;
    return { type: evidenceType, action: "updated" };
  }
  if (!createdBy) throw new Error("HOUSEHOLD_OWNER_NOT_FOUND");
  const q = await admin.from("deal_engine_market_evidence").insert({ household_id: row.household_id, canonical_key: row.canonical_key, created_by: createdBy, ...payload });
  if (q.error) throw q.error;
  return { type: evidenceType, action: "inserted" };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST_REQUIRED" }), { status: 405, headers });
  try {
    const token = text(req.headers.get("authorization")).replace(/^Bearer\s+/i, "");
    const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!token || token !== service) return new Response(JSON.stringify({ error: "WORKER_AUTH_REQUIRED" }), { status: 401, headers });
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({})), limit = Math.max(1, Math.min(8, Number(body.limit || 6)));
    const states = await admin.from("deal_engine_market_refresh_state")
      .select("household_id,canonical_key,last_attempt_at,status")
      .in("status", ["EMPTY","EMPTY_ALL"]).order("last_attempt_at", { ascending: true }).limit(limit);
    if (states.error) throw states.error;
    const keys = (states.data || []).map((x:any)=>x.canonical_key);
    if (!keys.length) return new Response(JSON.stringify({ ok:true, provider:"Public index discovery → verified HiBid lot pages", searched:0, evidence_found:0, sold_found:0, results:[] }), { headers });
    const obs = await admin.from("deal_engine_observations").select("household_id,canonical_key,title,upc,sku")
      .eq("active", true).eq("product_area", "resale").in("canonical_key", keys);
    if (obs.error) throw obs.error;
    const owners = await ownerMap(admin, [...new Set((obs.data||[]).map((x:any)=>x.household_id))]);
    const results:any[]=[];
    for (const row of obs.data || []) {
      const queries = searchQueries(row);
      let found=0,sold=0,completed=0,error="",discovered=0;
      try {
        const itemMap = new Map<string,any>();
        for (const query of queries) {
          const items = await fetchRss(query);
          for (const item of items) {
            const url = hibidUrl(item.link); if (url && !itemMap.has(url)) itemMap.set(url,{...item,link:url});
          }
          if (itemMap.size >= 12) break;
        }
        const items = [...itemMap.values()].slice(0,8); discovered=items.length;
        const pages = await Promise.allSettled(items.map((item:any)=>fetchLotPage(item.link)));
        for (let i=0;i<pages.length;i++) {
          const page = pages[i]; if (page.status !== "fulfilled") continue;
          const saved = await save(admin,row,owners.get(row.household_id)||"",items[i],page.value);
          if (!saved) continue; found++; if (saved.type==="sold") sold++; else completed++; if(found>=6) break;
        }
      } catch(e) { error=e instanceof Error?e.message:String(e); }
      const now = new Date().toISOString(), status = error ? "ERROR_AUCTION" : found ? "PASS" : "EMPTY_ALL";
      const st = await admin.from("deal_engine_market_refresh_state").update({
        result_count:found, sold_count:sold, completed_count:completed, status, last_success_at:found?now:null,
        last_query:queries.join(" || "), last_error:error.slice(0,500), updated_at:now,
      }).eq("household_id",row.household_id).eq("canonical_key",row.canonical_key);
      if (st.error) throw st.error;
      results.push({canonical_key:row.canonical_key,title:row.title,status,discovered,found,sold,completed,queries,error:error||undefined});
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    const evidenceFound=results.reduce((a,x)=>a+x.found,0), soldFound=results.reduce((a,x)=>a+x.sold,0);
    return new Response(JSON.stringify({ok:true,provider:"Public index discovery → verified HiBid lot pages",truth:"Search is discovery only. SOLD requires a matching HiBid source lot page with an explicit numeric Price Realized.",searched:results.length,evidence_found:evidenceFound,sold_found:soldFound,results}),{headers});
  } catch(e) {
    return new Response(JSON.stringify({error:"AUCTION_COMP_REFRESH_ERROR",detail:e instanceof Error?e.message:String(e)}),{status:500,headers});
  }
});
