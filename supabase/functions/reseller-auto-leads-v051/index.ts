import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const BASE=Deno.env.get("SUPABASE_URL")||"";
const ORIGINS=new Set(["https://appassets.androidplatform.net","https://highway38solutions.com","https://www.highway38solutions.com"]);
const DIRECT_LIMIT=8;
const OPEN_FACTS_LIMIT=8;
const OPEN_FACTS_API="https://world.openfoodfacts.org/api/v3/product";
const PENNY_ITEM_BASE="https://pennytree.org/item.php?sku=dg%3A";
type ImageHit={image_url:string,image_reference_url:string,product_name:string,source:string,confirmed_miss?:boolean,ts:number};
const FACTS_CACHE=new Map<string,ImageHit>();
const PENNY_CACHE=new Map<string,ImageHit>();
function cors(r:Request){const o=r.headers.get("origin")||"";return{"access-control-allow-origin":ORIGINS.has(o)?o:"https://appassets.androidplatform.net","access-control-allow-headers":"authorization, apikey, content-type","access-control-allow-methods":"GET, POST, OPTIONS","content-type":"application/json; charset=utf-8","cache-control":"private, max-age=120","vary":"Origin"}}
function json(r:Request,s:number,b:any){return new Response(JSON.stringify(b),{status:s,headers:cors(r)})}
function clean(v:any){return String(v??"").trim()}
function digits(v:any){return clean(v).replace(/\D/g,"")}
function artifactTitle(v:any){const t=clean(v),plain=t.replace(/[^a-z0-9]+/gi," ").replace(/\s+/g," ").trim();if(t.length<7||plain.length<3)return true;return /^(?:today|yesterday|\d+\s+(?:minutes?|hours?|days?|weeks?)\s+ago|fd|dg|dt|item|product|unknown|clearance|penny|deal)$/i.test(plain)||/^(?:home depot|dollar general|dollar tree|family dollar)\s+(?:deep|daily|weekly|tool|deal|deals|clearance|penny)/i.test(plain)||/(?:deep tool savings|daily deals|weekly deals|current weekly list|surprise penny list)$/i.test(plain)}
function isDollarGeneral(row:any){return clean(row?.retailer).toLowerCase()==="dollar general"}
function codeFor(row:any){const code=digits(row?.upc)||digits(row?.sku);return code.length>=7?code:""}
function strippedCode(code:string){const x=code.replace(/^0+/,"");return x||code}
function absolute(v:string,base:string){try{return new URL(v,base).toString()}catch{return""}}
function htmlDecode(v:string){return v.replace(/&amp;/g,"&").replace(/&#0*39;|&apos;/g,"'").replace(/&quot;|&#0*34;/g,'"')}
function safePennyImage(url:string){try{const u=new URL(url);if(u.protocol!=="https:")return false;return !/(?:logo|icon|avatar|spinner|placeholder|pixel|favicon|social[-_]?share|default[-_]?image)/i.test(u.pathname+u.search)}catch{return false}}
function allowedFactsImage(url:string){try{const u=new URL(url);if(u.protocol!=="https:")return false;const h=u.hostname.toLowerCase();return h.endsWith("openfoodfacts.org")||h.endsWith("openbeautyfacts.org")||h.endsWith("openproductsfacts.org")||h.endsWith("openpetfoodfacts.org")}catch{return false}}
function extractPennyImage(html:string,base:string){
  const raws:string[]=[];
  for(const re of [
    /<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi
  ]) for(const m of html.matchAll(re)) raws.push(m[1]);
  for(const m of html.matchAll(/"image"\s*:\s*"([^"]+)"/gi)) raws.push(m[1].replace(/\\\//g,"/"));
  for(const tag of html.match(/<img\b[^>]*>/gi)||[]){const m=tag.match(/(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i);if(m)raws.push(m[1])}
  for(const raw of raws){const u=absolute(htmlDecode(raw),base);if(u&&safePennyImage(u))return u}
  return"";
}
function addDirectSource(row:any,itemUrl:string,code:string){
  if(!itemUrl)return row;
  const src=Array.isArray(row?.signal_sources)?row.signal_sources.slice():[];
  if(!src.some((x:any)=>clean(x?.url)===itemUrl))src.unshift({name:"Penny Tree item",domain:"pennytree.org",url:itemUrl,kind:row?.deal_type||"candidate",evidence_type:"direct_item",observed_price:Number.isFinite(Number(row?.buy_price))?Number(row.buy_price):null,observed_at:clean(row?.last_seen||row?.posted_date||""),matched_upc:code});
  return{...row,signal_sources:src,signal_source_count:Math.max(Number(row?.signal_source_count||0),src.length)};
}
async function lookupPennyTree(code:string){
  const cached=PENNY_CACHE.get(code);if(cached&&Date.now()-cached.ts<2*60*60*1000)return cached;
  const ids=[...new Set([strippedCode(code),code])];
  for(const id of ids){
    const url=PENNY_ITEM_BASE+encodeURIComponent(id);
    try{
      const r=await fetch(url,{headers:{"user-agent":"Mozilla/5.0 H38ResellerScout/0.1.52","accept":"text/html,application/xhtml+xml"},redirect:"follow",signal:AbortSignal.timeout(8000)});
      if(!r.ok)continue;
      const html=await r.text().catch(()=>"");
      if(!html)continue;
      const matched=html.includes(code)||html.includes(strippedCode(code));
      if(!matched)continue;
      const image=extractPennyImage(html,r.url||url);
      const hit:ImageHit={image_url:image,image_reference_url:r.url||url,product_name:"",source:"Penny Tree direct item",confirmed_miss:!image,ts:Date.now()};
      PENNY_CACHE.set(code,hit);
      return hit;
    }catch{}
  }
  const miss:ImageHit={image_url:"",image_reference_url:"",product_name:"",source:"Penny Tree direct item",confirmed_miss:true,ts:Date.now()};
  PENNY_CACHE.set(code,miss);
  return miss;
}
async function enrichPennyTree(leads:any[]){
  const cachedApplied=leads.map(row=>{if(!isDollarGeneral(row)||clean(row?.image_url))return row;const code=codeFor(row),hit=code?PENNY_CACHE.get(code):null;if(!hit?.image_url)return row;return addDirectSource({...row,image_url:hit.image_url,image_source:hit.source,image_reference_url:hit.image_reference_url,image_match_barcode:code},hit.image_reference_url,code)});
  const candidates:any[]=[];
  for(const row of cachedApplied){if(!isDollarGeneral(row)||clean(row?.image_url)||artifactTitle(row?.canonical_title||row?.raw_title||row?.title))continue;const code=codeFor(row);if(!code)continue;const cached=PENNY_CACHE.get(code);if(cached&&Date.now()-cached.ts<2*60*60*1000)continue;candidates.push({row,code});if(candidates.length>=DIRECT_LIMIT)break}
  const results=await Promise.all(candidates.map(x=>lookupPennyTree(x.code))),byCode=new Map<string,ImageHit>();candidates.forEach((x,i)=>byCode.set(x.code,results[i]));
  let photos=0,direct=0,misses=0;
  for(const r of results){if(r.image_url)photos++;else misses++;if(r.image_reference_url)direct++}
  const out=cachedApplied.map(row=>{if(!isDollarGeneral(row)||clean(row?.image_url))return row;const code=codeFor(row),hit=byCode.get(code);if(!hit)return row;let next=hit.image_reference_url?addDirectSource(row,hit.image_reference_url,code):row;if(hit.image_url)next={...next,image_url:hit.image_url,image_source:hit.source,image_reference_url:hit.image_reference_url,image_match_barcode:code};return next});
  return{leads:out,photos,direct,misses,checked:candidates.map(x=>x.code)};
}
async function lookupOpenFacts(code:string){
  const cached=FACTS_CACHE.get(code);if(cached&&Date.now()-cached.ts<6*60*60*1000)return cached;
  const url=`${OPEN_FACTS_API}/${encodeURIComponent(code)}.json?product_type=all&cc=us&fields=code,product_name,brands,image_front_url,image_url,url`;
  try{
    const r=await fetch(url,{headers:{"user-agent":"H38ResellerScout/0.1.52 (https://highway38solutions.com)","accept":"application/json"},redirect:"follow",signal:AbortSignal.timeout(9000)});
    if(r.status===404){const miss:ImageHit={image_url:"",image_reference_url:"",product_name:"",source:"Open Facts barcode",confirmed_miss:true,ts:Date.now()};FACTS_CACHE.set(code,miss);return miss}
    if(!r.ok)throw new Error(`Open Facts ${r.status}`);
    const data=await r.json().catch(()=>({})),p=data?.product||{},image=clean(p.image_front_url||p.image_url),reference=clean(p.url||r.url.replace(/\/api\/v3\/product\/.*/,`/product/${code}`));
    const hit:ImageHit={image_url:allowedFactsImage(image)?image:"",image_reference_url:reference,product_name:clean(p.product_name),source:"Open Facts barcode",confirmed_miss:!allowedFactsImage(image),ts:Date.now()};FACTS_CACHE.set(code,hit);return hit;
  }catch(e){return{image_url:"",image_reference_url:"",product_name:"",source:"Open Facts barcode",confirmed_miss:false,ts:Date.now(),error:e instanceof Error?e.message:String(e)} as any}
}
async function enrichOpenFacts(leads:any[],known:Set<string>){
  const candidates:any[]=[];for(const row of leads){if(!isDollarGeneral(row)||clean(row?.image_url)||artifactTitle(row?.canonical_title||row?.raw_title||row?.title))continue;const code=codeFor(row);if(!code||known.has(code))continue;candidates.push({row,code});if(candidates.length>=OPEN_FACTS_LIMIT)break}
  const results=await Promise.all(candidates.map(x=>lookupOpenFacts(x.code))),byCode=new Map<string,any>();candidates.forEach((x,i)=>byCode.set(x.code,results[i]));
  let photos=0,misses=0;const checked:string[]=[],errors:string[]=[];
  for(let i=0;i<candidates.length;i++){const code=candidates[i].code,r:any=results[i];if(r?.image_url)photos++;else misses++;if(r?.error)errors.push(`${code}: ${r.error}`);if(r?.image_url||r?.confirmed_miss)checked.push(code)}
  const out=leads.map(row=>{if(!isDollarGeneral(row)||clean(row?.image_url))return row;const code=codeFor(row),hit=byCode.get(code);if(!hit?.image_url)return row;return{...row,image_url:hit.image_url,image_source:hit.source,image_reference_url:hit.image_reference_url,image_match_barcode:code,image_match_title:hit.product_name||""}});
  return{leads:out,photos,misses,checked,errors,requested:candidates.map(x=>x.code)};
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  try{
    const auth=req.headers.get("authorization")||"",apikey=req.headers.get("apikey")||"";if(!auth)return json(req,401,{error:"Sign in required."});
    const rawBody=req.method==="POST"?await req.text():"{}";let requestBody:any={};try{requestBody=JSON.parse(rawBody||"{}")||{}}catch{requestBody={}}
    const known=new Set((Array.isArray(requestBody.known_image_ids)?requestBody.known_image_ids:[]).map(digits).filter((x:string)=>x.length>=7));
    const upstream=await fetch(`${BASE}/functions/v1/reseller-auto-leads-v049`,{method:"POST",headers:{authorization:auth,apikey,"content-type":"application/json"},body:rawBody||"{}",signal:AbortSignal.timeout(55000)});
    const payload=await upstream.json().catch(()=>({}));if(!upstream.ok)return json(req,upstream.status,{error:payload?.error||"Lead source failed."});
    const base=Array.isArray(payload.leads)?payload.leads:[],penny=await enrichPennyTree(base),facts=await enrichOpenFacts(penny.leads,known),warnings=[...(Array.isArray(payload.warnings)?payload.warnings:[])];
    if(facts.errors.length)warnings.push(`Open Facts image fallback had ${facts.errors.length} transient lookup error(s); those UPCs remain eligible for retry.`);
    console.log(JSON.stringify({event:"dg-image-enrichment-v051b",penny_checked:penny.checked.length,penny_direct:penny.direct,penny_photos:penny.photos,penny_misses:penny.misses,open_facts_requested:facts.requested.length,open_facts_checked:facts.checked.length,open_facts_photos:facts.photos,open_facts_misses:facts.misses}));
    return json(req,200,{...payload,status:"PASS",leads:facts.leads,count:facts.leads.length,warnings,adapter_version:"dg-direct-photo-retry-v051b",pennytree_direct_checked_ids:penny.checked,pennytree_direct_item_enriched_count:penny.direct,pennytree_direct_photo_enriched_count:penny.photos,pennytree_direct_miss_count:penny.misses,open_facts_requested_ids:facts.requested,open_facts_checked_ids:facts.checked,open_facts_requested_count:facts.requested.length,open_facts_photo_enriched_count:facts.photos,open_facts_miss_count:facts.misses,pennytree_direct_lookup_limit:DIRECT_LIMIT,open_facts_lookup_limit:OPEN_FACTS_LIMIT,photo_rule:"For photo-less Dollar General UPCs, verify a direct Penny Tree item page by barcode first; only then use its non-placeholder image. Open Facts remains a barcode-only fallback. Transient lookup errors are not permanently cached as misses.",artifact_rule:"Page navigation and relative-date titles remain in raw crawler evidence but are not image-enrichment candidates or actionable UI products.",view_contract:"Exact penny, near-penny, clearance, store verification, and resale validation remain separate evidence states."});
  }catch(e){return json(req,503,{error:e instanceof Error?e.message:String(e)})}
});