import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const BASE=Deno.env.get("SUPABASE_URL")||"";
const ORIGINS=new Set(["https://appassets.androidplatform.net","https://highway38solutions.com","https://www.highway38solutions.com"]);
const OPEN_FACTS_LIMIT=5;
const OPEN_FACTS_API="https://world.openfoodfacts.org/api/v3/product";
const FACTS_CACHE=new Map<string,{image_url:string,image_reference_url:string,product_name:string,source:string,miss:boolean,ts:number}>();
function cors(r:Request){const o=r.headers.get("origin")||"";return{"access-control-allow-origin":ORIGINS.has(o)?o:"https://appassets.androidplatform.net","access-control-allow-headers":"authorization, apikey, content-type","access-control-allow-methods":"GET, POST, OPTIONS","content-type":"application/json; charset=utf-8","cache-control":"private, max-age=120","vary":"Origin"}}
function json(r:Request,s:number,b:any){return new Response(JSON.stringify(b),{status:s,headers:cors(r)})}
function clean(v:any){return String(v??"").trim()}
function digits(v:any){return clean(v).replace(/\D/g,"")}
function artifactTitle(v:any){const t=clean(v),plain=t.replace(/[^a-z0-9]+/gi," ").replace(/\s+/g," ").trim();if(t.length<7||plain.length<3)return true;return /^(?:today|yesterday|\d+\s+(?:minutes?|hours?|days?|weeks?)\s+ago|fd|dg|dt|item|product|unknown|clearance|penny|deal)$/i.test(plain)||/^(?:home depot|dollar general|dollar tree|family dollar)\s+(?:deep|daily|weekly|tool|deal|deals|clearance|penny)/i.test(plain)||/(?:deep tool savings|daily deals|weekly deals|current weekly list|surprise penny list)$/i.test(plain)}
function isDollarGeneral(row:any){return clean(row?.retailer).toLowerCase()==="dollar general"}
function codeFor(row:any){const code=digits(row?.upc)||digits(row?.sku);return code.length>=7?code:""}
function allowedImage(url:string){try{const u=new URL(url);if(u.protocol!=="https:")return false;const h=u.hostname.toLowerCase();return h.endsWith("openfoodfacts.org")||h.endsWith("openbeautyfacts.org")||h.endsWith("openproductsfacts.org")||h.endsWith("openpetfoodfacts.org")}catch{return false}}
async function lookupOpenFacts(code:string){
  const cached=FACTS_CACHE.get(code);if(cached&&Date.now()-cached.ts<6*60*60*1000)return cached;
  const url=`${OPEN_FACTS_API}/${encodeURIComponent(code)}?product_type=all&fields=code,product_name,brands,image_front_url,image_url,url`;
  try{
    const r=await fetch(url,{headers:{"user-agent":"H38ResellerScout/0.1.51 (https://highway38solutions.com)","accept":"application/json"},redirect:"follow",signal:AbortSignal.timeout(9000)});
    if(r.status===404){const miss={image_url:"",image_reference_url:"",product_name:"",source:"Open Facts barcode",miss:true,ts:Date.now()};FACTS_CACHE.set(code,miss);return miss}
    if(!r.ok)throw new Error(`Open Facts ${r.status}`);
    const data=await r.json().catch(()=>({})),p=data?.product||{},image=clean(p.image_front_url||p.image_url),reference=clean(p.url||r.url.replace(/\/api\/v3\/product\/.*/,`/product/${code}`));
    const hit={image_url:allowedImage(image)?image:"",image_reference_url:reference,product_name:clean(p.product_name),source:"Open Facts barcode",miss:!allowedImage(image),ts:Date.now()};FACTS_CACHE.set(code,hit);return hit;
  }catch(e){return{image_url:"",image_reference_url:"",product_name:"",source:"Open Facts barcode",miss:true,ts:Date.now(),error:e instanceof Error?e.message:String(e)} as any}
}
async function enrichOpenFacts(leads:any[],known:Set<string>){
  const candidates:any[]=[];for(const row of leads){if(!isDollarGeneral(row)||clean(row?.image_url)||artifactTitle(row?.canonical_title||row?.raw_title||row?.title))continue;const code=codeFor(row);if(!code||known.has(code))continue;candidates.push({row,code});if(candidates.length>=OPEN_FACTS_LIMIT)break}
  const results=await Promise.all(candidates.map(x=>lookupOpenFacts(x.code))),byCode=new Map<string,any>();candidates.forEach((x,i)=>byCode.set(x.code,results[i]));
  let photos=0,misses=0;const checked:string[]=[],errors:string[]=[];
  for(let i=0;i<candidates.length;i++){const code=candidates[i].code,r:any=results[i];checked.push(code);if(r?.image_url)photos++;else misses++;if(r?.error)errors.push(`${code}: ${r.error}`)}
  const out=leads.map(row=>{if(!isDollarGeneral(row)||clean(row?.image_url))return row;const code=codeFor(row),hit=byCode.get(code);if(!hit?.image_url)return row;return{...row,image_url:hit.image_url,image_source:hit.source,image_reference_url:hit.image_reference_url,image_match_barcode:code,image_match_title:hit.product_name||""}});
  return{leads:out,photos,misses,checked,errors};
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  try{
    const auth=req.headers.get("authorization")||"",apikey=req.headers.get("apikey")||"";if(!auth)return json(req,401,{error:"Sign in required."});
    const rawBody=req.method==="POST"?await req.text():"{}";let requestBody:any={};try{requestBody=JSON.parse(rawBody||"{}")||{}}catch{requestBody={}}
    const known=new Set((Array.isArray(requestBody.known_image_ids)?requestBody.known_image_ids:[]).map(digits).filter((x:string)=>x.length>=7));
    const upstream=await fetch(`${BASE}/functions/v1/reseller-auto-leads-v049`,{method:"POST",headers:{authorization:auth,apikey,"content-type":"application/json"},body:rawBody||"{}",signal:AbortSignal.timeout(55000)});
    const payload=await upstream.json().catch(()=>({}));if(!upstream.ok)return json(req,upstream.status,{error:payload?.error||"Lead source failed."});
    const base=Array.isArray(payload.leads)?payload.leads:[],enriched=await enrichOpenFacts(base,known),warnings=[...(Array.isArray(payload.warnings)?payload.warnings:[])];
    if(enriched.errors.length)warnings.push(`Open Facts image fallback had ${enriched.errors.length} lookup error(s); existing lead evidence was kept.`);
    return json(req,200,{...payload,status:"PASS",leads:enriched.leads,count:enriched.leads.length,warnings,adapter_version:"artifact-filter-progressive-dg-photo-v051",open_facts_checked_ids:enriched.checked,open_facts_requested_count:enriched.checked.length,open_facts_photo_enriched_count:enriched.photos,open_facts_miss_count:enriched.misses,open_facts_lookup_limit:OPEN_FACTS_LIMIT,open_facts_rule:"After Penny Tree, query a bounded number of still-photo-less Dollar General UPCs against the Open Facts universal barcode API. Barcode match only; never fabricate an image or treat image metadata as price evidence.",artifact_rule:"Page navigation and relative-date titles such as arrow + today/yesterday remain in raw crawler evidence but are not image-enrichment candidates or actionable UI products.",view_contract:"Exact penny, near-penny, clearance, store verification, and resale validation remain separate evidence states."});
  }catch(e){return json(req,503,{error:e instanceof Error?e.message:String(e)})}
});
