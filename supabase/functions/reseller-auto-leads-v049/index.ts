import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const BASE=Deno.env.get("SUPABASE_URL")||"";
const ORIGINS=new Set(["https://appassets.androidplatform.net","https://highway38solutions.com","https://www.highway38solutions.com"]);
const DG_PAGES=[
  "https://pennytree.org/?store=dollargeneral",
  "https://pennytree.org/?sort=new&store=dollargeneral&view=cheap"
];
function cors(r:Request){const o=r.headers.get("origin")||"";return{"access-control-allow-origin":ORIGINS.has(o)?o:"https://appassets.androidplatform.net","access-control-allow-headers":"authorization, apikey, content-type","access-control-allow-methods":"GET, POST, OPTIONS","content-type":"application/json; charset=utf-8","cache-control":"private, max-age=120","vary":"Origin"}}
function json(r:Request,s:number,b:any){return new Response(JSON.stringify(b),{status:s,headers:cors(r)})}
function clean(v:any){return String(v??"").trim()}
function digits(v:any){return clean(v).replace(/\D/g,"")}
function absolute(v:string,base:string){try{return new URL(v,base).toString()}catch{return""}}
function imageCandidate(tag:string,base:string){
  const attrs=[...tag.matchAll(/(?:data-src|data-lazy-src|src)=["']([^"']+)["']/gi)].map(m=>m[1]);
  const srcset=tag.match(/srcset=["']([^"']+)["']/i)?.[1]?.split(",").map(x=>x.trim().split(/\s+/)[0]).filter(Boolean)||[];
  for(const raw of [...attrs,...srcset]){const u=absolute(raw,base);if(!u||/^data:/i.test(u)||/(?:logo|icon|avatar|spinner|placeholder|pixel|favicon)/i.test(u))continue;return u}
  return"";
}
function itemMeta(html:string,id:string,base:string){
  if(!id)return{};const lower=html.toLowerCase(),needle=id.toLowerCase();let at=lower.indexOf(needle);if(at<0&&/^0+\d+$/.test(id))at=lower.indexOf(String(Number(id)));if(at<0)return{};
  const start=Math.max(0,at-6500),end=Math.min(html.length,at+1800),slice=html.slice(start,end),before=slice.slice(0,Math.min(slice.length,at-start+200));
  const links=[...before.matchAll(/<a\b[^>]*href=["']([^"']*item\.php\?sku=[^"']+)["'][^>]*>/gi)],item_url=links.length?absolute(links[links.length-1][1],base):"";
  const imgs=[...before.matchAll(/<img\b[^>]*>/gi)],image_url=imgs.length?imageCandidate(imgs[imgs.length-1][0],base):"";
  return{item_url,image_url};
}
function addDirectSource(row:any,item_url:string){if(!item_url)return row;const src=Array.isArray(row.signal_sources)?row.signal_sources.slice():[];if(!src.some((x:any)=>clean(x?.url)===item_url))src.unshift({name:"Penny Tree item",domain:"pennytree.org",url:item_url,kind:row.deal_type||"candidate",evidence_type:"direct_item",observed_price:Number.isFinite(Number(row.buy_price))?Number(row.buy_price):null,observed_at:clean(row.last_seen||row.posted_date||"")});return{...row,signal_sources:src,signal_source_count:Math.max(Number(row.signal_source_count||0),src.length)}}
function enrichDollarGeneral(leads:any[],pages:{url:string,html:string}[]){let photos=0,direct=0;const out=leads.map(row=>{if(clean(row?.retailer).toLowerCase()!=="dollar general")return row;const id=digits(row?.upc)||digits(row?.sku);if(!id)return row;let found:any={};for(const p of pages){found=itemMeta(p.html,id,p.url);if(found.image_url||found.item_url)break}let next={...row};if(!clean(next.image_url)&&found.image_url){next.image_url=found.image_url;next.image_source="Penny Tree";photos++}if(found.item_url){const before=(next.signal_sources||[]).length;next=addDirectSource(next,found.item_url);if((next.signal_sources||[]).length>before)direct++}return next});return{leads:out,photos,direct}}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  try{
    const auth=req.headers.get("authorization")||"",apikey=req.headers.get("apikey")||"";if(!auth)return json(req,401,{error:"Sign in required."});const body=req.method==="POST"?await req.text():"{}";
    const jobs=[fetch(`${BASE}/functions/v1/reseller-auto-leads-v046`,{method:"POST",headers:{authorization:auth,apikey,"content-type":"application/json"},body:body||"{}",signal:AbortSignal.timeout(55000)}),...DG_PAGES.map(url=>fetch(url,{headers:{"user-agent":"Mozilla/5.0 H38ResellerScout/0.1.49","accept":"text/html,application/xhtml+xml"},redirect:"follow",signal:AbortSignal.timeout(18000)}))];
    const settled=await Promise.allSettled(jobs),up=settled[0];if(up.status!=="fulfilled")return json(req,503,{error:"Lead source failed."});const upstream=up.value,payload=await upstream.json().catch(()=>({}));if(!upstream.ok)return json(req,upstream.status,{error:payload?.error||"Lead source failed."});
    const pages:{url:string,html:string}[]=[];for(let i=1;i<settled.length;i++){const r=settled[i],url=DG_PAGES[i-1];if(r.status==="fulfilled"&&r.value.ok){const html=await r.value.text().catch(()=>"");if(html)pages.push({url,html})}}
    const base=Array.isArray(payload.leads)?payload.leads:[],enriched=enrichDollarGeneral(base,pages),warnings=[...(Array.isArray(payload.warnings)?payload.warnings:[])];if(!pages.length)warnings.push("Dollar General photo enrichment pages were unavailable; lead data was kept without fabricating images.");
    return json(req,200,{...payload,status:"PASS",leads:enriched.leads,count:enriched.leads.length,warnings,adapter_version:"near-penny-dg-photo-v049",dg_photo_enriched_count:enriched.photos,dg_direct_item_enriched_count:enriched.direct,dg_photo_rule:"Use real Penny Tree item imagery when present. Items with no source photo remain explicitly photo-less; no placeholder is treated as product evidence.",view_contract:"Exact penny, near-penny, clearance, and store verification remain separate evidence states."});
  }catch(e){return json(req,503,{error:e instanceof Error?e.message:String(e)})}
});
