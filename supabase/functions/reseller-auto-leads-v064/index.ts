import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {applySourceImage,enrichLeads} from './core.mjs';

const FUNCTION_SLUG='reseller-auto-leads-v064';
const BASE=Deno.env.get('SUPABASE_URL')||'';
const ORIGINS=new Set(['https://appassets.androidplatform.net','https://highway38solutions.com','https://www.highway38solutions.com']);
const IMAGE_FETCH_CAP=48;
const IMAGE_CONCURRENCY=8;
function cors(req:Request){const o=req.headers.get('origin')||'';return{'access-control-allow-origin':ORIGINS.has(o)?o:'https://appassets.androidplatform.net','access-control-allow-headers':'authorization, apikey, content-type','access-control-allow-methods':'POST, OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'private, max-age=90','vary':'Origin'}}
function json(req:Request,status:number,body:any){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
function dg(row:any){return String(row?.retailer||'').toLowerCase().includes('dollar general')}
function needsImage(row:any){return dg(row)&&!String(row?.image_url||'').trim()&&/^https:\/\/pennytree\.org\/item\.php\?/i.test(String(row?.source_item_url||''))}
async function fetchImageFor(row:any){
  const url=String(row?.source_item_url||'').trim();if(!url)return row;
  try{
    const r=await fetch(url,{headers:{'user-agent':'H38ResellerScout/3 public image verifier','accept':'text/html,application/xhtml+xml'},redirect:'follow',signal:AbortSignal.timeout(6500)});
    if(!r.ok)return row;
    const type=(r.headers.get('content-type')||'').toLowerCase();if(!type.includes('text/html'))return row;
    const html=(await r.text()).slice(0,1_200_000);
    return applySourceImage(row,html);
  }catch{return row}
}
async function hydrateImages(rows:any[]){
  const out=rows.slice(),targets=[] as number[];for(let i=0;i<out.length&&targets.length<IMAGE_FETCH_CAP;i++)if(needsImage(out[i]))targets.push(i);
  let cursor=0,found=0;
  async function worker(){while(cursor<targets.length){const idx=targets[cursor++],before=out[idx],after=await fetchImageFor(before);out[idx]=after;if(String(after?.image_url||'').trim()&&!String(before?.image_url||'').trim())found++;}}
  await Promise.all(Array.from({length:Math.min(IMAGE_CONCURRENCY,targets.length||1)},()=>worker()));
  return{rows:out,attempted:targets.length,found};
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=='POST')return json(req,405,{error:'POST required.'});
  try{
    const auth=req.headers.get('authorization')||'',apikey=req.headers.get('apikey')||'';
    if(!auth)return json(req,401,{error:'Sign in required.'});
    const body=await req.text();
    const upstream=await fetch(`${BASE}/functions/v1/reseller-auto-leads-v063`,{method:'POST',headers:{authorization:auth,apikey,'content-type':'application/json'},body:body||'{}',signal:AbortSignal.timeout(70000)});
    const payload=await upstream.json().catch(()=>({}));
    if(!upstream.ok)return json(req,upstream.status,{error:payload?.error||'Retail Hunt source failed.',function_slug:FUNCTION_SLUG});
    const enriched=enrichLeads(payload?.leads||[]),hydrated=await hydrateImages(enriched),leads=hydrated.rows,exact=leads.filter((x:any)=>x?.source_item_scope==='exact_product').length,dgImages=leads.filter((x:any)=>dg(x)&&String(x?.image_url||'').trim()).length;
    return json(req,200,{...payload,status:'PASS',leads,count:leads.length,function_slug:FUNCTION_SLUG,adapter_version:'exact-source-image-v065',exact_source_count:exact,dg_image_count:dgImages,dg_image_fetch_attempted:hydrated.attempted,dg_image_fetch_found:hydrated.found,exact_source_rule:'When PennyTree publishes a deterministic product route for the item UPC, Scout links to that exact product page. Broad list URLs remain labeled as source lists and are never presented as local store proof.',image_rule:'For Dollar General rows missing an image, Scout may fetch the exact public PennyTree item page and use only a real product image published on that exact page. Missing images remain missing; Scout never fabricates them.',penny_truth_rule:'Crawler/community sources discover and corroborate leads. Exact source pages still do not prove local store price or stock. Physical in-store UPC/register scan remains final local penny truth.'});
  }catch(e){return json(req,503,{error:e instanceof Error?e.message:String(e),function_slug:FUNCTION_SLUG,adapter_version:'exact-source-image-v065'})}
});
