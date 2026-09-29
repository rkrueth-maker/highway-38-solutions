import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const headers = { "Content-Type": "application/json" };
const text = (v: unknown) => String(v ?? "").trim();
const norm = (v: unknown) => text(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const marker = "[AUTO:BING_HIBID_PUBLIC_V1]";
const stop = new Set(["the","and","with","for","from","this","that","new","pack","piece","pieces","black","white","men","women","womens","mens","fits","perfect","device","devices"]);

function strip(v: unknown) {
  return text(v).replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/\s+/g, " ").trim();
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
  const r = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&count=20`, {
    headers: { "user-agent": "Mozilla/5.0 H38DealEngine/1.0 (+https://highway38solutions.com)", accept: "application/rss+xml,application/xml,*/*;q=0.8" },
    signal: AbortSignal.timeout(10000), redirect: "follow",
  });
  const body = await r.text().catch(() => "");
  if (!r.ok) throw new Error(`PUBLIC_INDEX_HTTP_${r.status}`);
  return rss(body);
}
function tokens(v: unknown) {
  const out: string[] = [], seen = new Set<string>();
  for (const token of norm(v).split(" ")) {
    if (token.length < 3 || stop.has(token) || seen.has(token)) continue;
    seen.add(token); out.push(token); if (out.length >= 12) break;
  }
  return out;
}
function relevance(row: any, item: any) {
  const hay = norm(`${item.title} ${item.description}`), target = tokens(row.title);
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
async function save(admin: any, row: any, createdBy: string, item: any) {
  const url = hibidUrl(item.link); if (!url) return null;
  const rel = relevance(row, item); if (!rel.ok) return null;
  const combined = `${item.title} ${item.description}`;
  const price = realizedPrice(combined);
  const mentionsRealized = /Price\s+Realized/i.test(combined);
  if (!mentionsRealized) return null;
  const evidenceType = price !== null ? "sold" : "completed";
  const confidence = Math.min(94, (price !== null ? 72 : 52) + (rel.identifier ? 15 : Math.round(rel.ratio * 12)));
  const existing = await admin.from("deal_engine_market_evidence").select("id,notes")
    .eq("household_id", row.household_id).eq("canonical_key", row.canonical_key)
    .eq("evidence_type", evidenceType).eq("source_url", url).limit(1).maybeSingle();
  if (existing.error) throw existing.error;
  const payload = {
    evidence_type: evidenceType, marketplace: "HiBid public index", title: strip(item.title) || row.title,
    source_url: url, observed_price: price, shipping_price: null, condition_label: "", upc: text(row.upc), sku: text(row.sku), asin: "",
    confidence_score: confidence, observed_at: new Date().toISOString(), sold_at: null,
    notes: `${marker} ${price !== null ? "Numeric Price Realized was explicit in the public indexed text." : "Price Realized was referenced but no numeric realized price was exposed; recorded as COMPLETED, not SOLD."} Match=${rel.identifier ? "identifier" : `title:${Math.round(rel.ratio*100)}%`}.`,
    updated_at: new Date().toISOString(),
  };
  if (existing.data?.id) {
    if (!text(existing.data.notes).startsWith(marker)) return { type: evidenceType, action: "manual_preserved" };
    const q = await admin.from("deal_engine_market_evidence").update(payload).eq("id", existing.data.id); if (q.error) throw q.error;
    return { type: evidenceType, action: "updated" };
  }
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
      .eq("status", "EMPTY").order("last_attempt_at", { ascending: true }).limit(limit);
    if (states.error) throw states.error;
    const keys = (states.data || []).map((x:any)=>x.canonical_key);
    if (!keys.length) return new Response(JSON.stringify({ ok:true, provider:"Bing public index → HiBid realized prices", searched:0, evidence_found:0, sold_found:0, results:[] }), { headers });
    const obs = await admin.from("deal_engine_observations").select("household_id,canonical_key,title,upc,sku")
      .eq("active", true).eq("product_area", "resale").in("canonical_key", keys);
    if (obs.error) throw obs.error;
    const owners = await ownerMap(admin, [...new Set((obs.data||[]).map((x:any)=>x.household_id))]);
    const results:any[]=[];
    for (const row of obs.data || []) {
      const query = `"${tokens(row.title).slice(0,8).join(" ")}" "Price Realized" HiBid`;
      let found=0,sold=0,completed=0,error="";
      try {
        const items = await fetchRss(query);
        for (const item of items) {
          const saved = await save(admin,row,owners.get(row.household_id)||"",item);
          if (!saved) continue; found++; if (saved.type==="sold") sold++; else completed++; if(found>=6) break;
        }
      } catch(e) { error=e instanceof Error?e.message:String(e); }
      const now = new Date().toISOString(), status = error ? "ERROR_AUCTION" : found ? "PASS" : "EMPTY_ALL";
      const st = await admin.from("deal_engine_market_refresh_state").update({
        result_count:found, sold_count:sold, completed_count:completed, status, last_success_at:found?now:null,
        last_query:query, last_error:error.slice(0,500), updated_at:now,
      }).eq("household_id",row.household_id).eq("canonical_key",row.canonical_key);
      if (st.error) throw st.error;
      results.push({canonical_key:row.canonical_key,title:row.title,status,found,sold,completed,query,error:error||undefined});
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    const evidenceFound=results.reduce((a,x)=>a+x.found,0), soldFound=results.reduce((a,x)=>a+x.sold,0);
    return new Response(JSON.stringify({ok:true,provider:"Bing public index → HiBid realized prices",truth:"SOLD requires an explicit numeric Price Realized. Price-realized mentions without a number are COMPLETED only.",searched:results.length,evidence_found:evidenceFound,sold_found:soldFound,results}),{headers});
  } catch(e) {
    return new Response(JSON.stringify({error:"AUCTION_COMP_REFRESH_ERROR",detail:e instanceof Error?e.message:String(e)}),{status:500,headers});
  }
});
