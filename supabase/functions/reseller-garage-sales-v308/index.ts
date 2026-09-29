import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Row = Record<string, any>;

const ORIGINS = new Set([
  "https://appassets.androidplatform.net",
  "https://highway38solutions.com",
  "https://www.highway38solutions.com",
]);
const UA = "Mozilla/5.0 H38ResellerScout/3.2 public-sale-discovery";
const STATE_URL = "https://garagesaletime.com/garage-sales/minnesota/";
const JINA_URL = "https://r.jina.ai/https://garagesaletime.com/garage-sales/minnesota/";

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ORIGINS.has(origin) ? origin : "https://appassets.androidplatform.net",
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    vary: "Origin",
  };
}
function json(req: Request, status: number, body: unknown) { return new Response(JSON.stringify(body), { status, headers: cors(req) }); }
function dec(v: unknown) { return String(v ?? "").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'").replace(/&nbsp;|&#160;/gi, " ").replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">"); }
function strip(v: unknown) { return dec(v).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function abs(href: string, base: string) { try { return new URL(dec(href), base).toString(); } catch { return ""; } }
function hav(a: number, b: number, c: number, d: number) { const R=3958.7613,q=Math.PI/180,x=(c-a)*q,y=(d-b)*q,z=Math.sin(x/2)**2+Math.cos(a*q)*Math.cos(c*q)*Math.sin(y/2)**2; return 2*R*Math.atan2(Math.sqrt(z),Math.sqrt(1-z)); }
function saleType(v: string) { const s=v.toLowerCase(); if (/estate/.test(s)) return "ESTATE SALE"; if (/moving/.test(s)) return "MOVING SALE"; if (/yard/.test(s)) return "YARD SALE"; if (/rummage/.test(s)) return "RUMMAGE SALE"; return "GARAGE SALE"; }

async function fetchText(url: string, timeout=12000) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,text/plain,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(timeout) });
  const text = await r.text().catch(() => "");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return { text, url: r.url || url, status: r.status };
}

const MONTHS: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
function parseEndDate(v: string) {
  const s = strip(v).replace(/September/gi,"Sep").replace(/October/gi,"Oct").replace(/November/gi,"Nov").replace(/December/gi,"Dec").replace(/August/gi,"Aug").replace(/July/gi,"Jul").replace(/June/gi,"Jun").replace(/April/gi,"Apr").replace(/March/gi,"Mar").replace(/February/gi,"Feb").replace(/January/gi,"Jan");
  const m = s.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:\s*[–-]\s*(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+)?(\d{1,2}))?,?\s*(20\d{2})\b/i);
  if (!m) return null;
  const startMonth=MONTHS[m[1].slice(0,3).toLowerCase()], endMonth=m[3]?MONTHS[m[3].slice(0,3).toLowerCase()]:startMonth, endDay=Number(m[4]||m[2]), year=Number(m[5]);
  if (!Number.isFinite(endDay)||!Number.isFinite(year)) return null;
  return new Date(Date.UTC(year,endMonth,endDay+1,5,59,59));
}
function dateLabel(v: string) { return (strip(v).match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:tember|ober|ember|uary|ruary|ch|il|e|y|ust)?\s+\d{1,2}(?:\s*[–-]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:tember|ober|ember|uary|ruary|ch|il|e|y|ust)?\s+)?\d{1,2})?,?\s*20\d{2}/i)||[])[0]||""; }

function candidateFromText(text: string, url: string) {
  const plain = strip(text);
  const sale = plain.match(/\b(?:Furniture,?\s*Tools\s*)?(Estate|Garage|Yard|Moving|Rummage)\s+Sale\s+in\s+([A-Za-z .'-]+),\s*Minnesota\b/i)
    || plain.match(/\b(Estate|Garage|Yard|Moving|Rummage)\s+Sale\s+in\s+([A-Za-z .'-]+),\s*Minnesota\b/i);
  if (!sale) return null;
  const city = sale[2].trim();
  const loc = plain.match(new RegExp(`${city.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\s*,\\s*MN\\s*(\\d{5})`,"i"));
  const zip = loc?.[1] || (plain.match(/\bMN\s*(\d{5})\b/i)||[])[1] || "";
  const dlabel = dateLabel(plain);
  const end = dlabel ? parseEndDate(dlabel) : null;
  if (end && end.getTime() < Date.now() - 6*3600000) return null;
  const titleMatch = plain.match(new RegExp(`((?:Furniture|Tools|Decor|Books|Clothing|Appliances|Electronics|Toys|Vintage|Collectibles|Household|Outdoor|Jewelry|Antiques|Furniture, Tools|Tools, Electronics|Furniture, Decor)[^]{0,80}?)?${sale[1]}\\s+Sale\\s+in\\s+${city.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\s*,\\s*Minnesota`,"i"));
  const title = strip(titleMatch?.[0] || `${sale[1]} Sale in ${city}, Minnesota`).slice(0,220);
  return { source:"GarageSaleTime", source_type:"public_current_sale_index", title, event_type:saleType(`${sale[1]} sale`), url, source_url:url, location_label:[city,"MN",zip].filter(Boolean).join(" "), city, state_code:"MN", zip, event_time:dlabel, date_label:dlabel, end_at:end?.toISOString()||"", location_verified:false, freshness_unproven:!dlabel, detail_verified:false, sale_event_verified:true, source_search_bound:true, verification_status:"PUBLIC SALE INDEX · VERIFY EXACT HOURS/ADDRESS", economics_complete:false, profit_verified:false };
}

function htmlRows(html: string, base: string) {
  const out: Row[]=[]; const seen=new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (out.length>=36) break;
    const href=abs(m[1]||"",base); const text=strip(m[2]||"");
    if (!href || seen.has(href) || !/\b(?:Estate|Garage|Yard|Moving|Rummage)\s+Sale\s+in\s+[^,]+,\s*Minnesota\b/i.test(text)) continue;
    const row=candidateFromText(text,href); if (!row) continue; seen.add(href); out.push(row);
  }
  return out;
}
function markdownRows(md: string) {
  const out: Row[]=[]; const seen=new Set<string>();
  for (const m of md.matchAll(/\[([^\]]{10,900}(?:Estate|Garage|Yard|Moving|Rummage)\s+Sale\s+in\s+[^\]]+?,\s*Minnesota[^\]]*)\]\((https?:\/\/[^)]+)\)/gi)) {
    if (out.length>=36) break;
    const url=m[2]; if (seen.has(url)) continue; const row=candidateFromText(m[1],url); if (!row) continue; seen.add(url); out.push(row);
  }
  if (!out.length) {
    for (const block of md.split(/(?=Garage\/Yard sale listing)/i)) {
      if (out.length>=36) break;
      if (!/\b(?:Estate|Garage|Yard|Moving|Rummage)\s+Sale\s+in\s+[^,]+,\s*Minnesota\b/i.test(block)) continue;
      const row=candidateFromText(block,STATE_URL+"#"+encodeURIComponent(strip(block).slice(0,80))); if (row) out.push(row);
    }
  }
  return out;
}

async function geocode(label: string) {
  try {
    const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(label)}`,{headers:{"user-agent":"H38ResellerScout/3.2 (+https://highway38solutions.com)",accept:"application/json"},signal:AbortSignal.timeout(7000)});
    const a=await r.json().catch(()=>[]),x=Array.isArray(a)?a[0]:null,lat=Number(x?.lat),lon=Number(x?.lon);
    return Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:null;
  } catch { return null; }
}

async function localize(rows: Row[], lat: number, lon: number, radius: number) {
  if (!Number.isFinite(lat)||!Number.isFinite(lon)) return rows.slice(0,24);
  const out:Row[]=[]; const cache=new Map<string,any>();
  for (const r of rows.slice(0,14)) {
    const key=`${r.city}, MN ${r.zip}`; let g=cache.get(key); if (g===undefined) { g=await geocode(key); cache.set(key,g); }
    if (!g) continue; const d=hav(lat,lon,g.lat,g.lon); if (d>radius+0.15) continue;
    out.push({...r,distance_miles:Number(d.toFixed(1)),location_verified:true,detail_verified:true,verification_status:"PUBLIC SALE INDEX · LOCATION/RADIUS VERIFIED · VERIFY HOURS/ADDRESS"});
  }
  return out;
}
function dedupe(rows:Row[]) { const out:Row[]=[]; const seen=new Set<string>(); for(const r of rows){const k=String(r.url||`${r.title}|${r.location_label}|${r.event_time}`).toLowerCase();if(!k||seen.has(k))continue;seen.add(k);out.push(r);}return out; }

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST") return json(req,405,{error:"POST required"});
  if(!req.headers.get("authorization")) return json(req,401,{error:"Sign in required"});
  const started=Date.now();
  try{
    const b:Row=await req.json().catch(()=>({})); const lat=Number(b.lat),lon=Number(b.lon),radius=Math.max(1,Math.min(150,Number(b.radiusMiles||b.radius_miles||50)));
    let raw:Row[]=[]; const health:Row={GarageSaleTime:{status:"unavailable",count:0}}; const warnings:string[]=[];
    try{const p=await fetchText(STATE_URL); raw=htmlRows(p.text,p.url); health.GarageSaleTime={status:raw.length?"live":"empty",count:raw.length,route:p.url,http_status:p.status};}catch(e){warnings.push(`GarageSaleTime direct: ${e instanceof Error?e.message:String(e)}`);}
    if(!raw.length){try{const p=await fetchText(JINA_URL,15000);raw=markdownRows(p.text);health.GarageSaleTime={status:raw.length?"live":"empty",count:raw.length,route:STATE_URL,mirror:"jina_public_text"};}catch(e){warnings.push(`GarageSaleTime text mirror: ${e instanceof Error?e.message:String(e)}`);}}
    const results=dedupe(await localize(raw,lat,lon,radius)).slice(0,48);
    return json(req,200,{status:results.length?"PASS":"PARTIAL",engine:"garage_sales_v318_current_mn_index",results,source_health:health,warnings,location_query:String(b.location_label||b.locationLabel||b.postal||""),radius_miles:radius,elapsed_ms:Date.now()-started,truth:"Sale-level public discovery only. Results are current public sale-index leads inside the requested radius when geocoding proves locality. They are not item inventory, do not carry a purchase price or resale profit, and exact address/hours must be verified at the source before travel."});
  }catch(e){return json(req,500,{error:e instanceof Error?e.message:String(e)});}
});
