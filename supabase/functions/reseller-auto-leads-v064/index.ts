import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {enrichLeads} from './core.mjs';

const FUNCTION_SLUG='reseller-auto-leads-v064';
const BASE=Deno.env.get('SUPABASE_URL')||'';
const ORIGINS=new Set(['https://appassets.androidplatform.net','https://highway38solutions.com','https://www.highway38solutions.com']);
function cors(req:Request){const o=req.headers.get('origin')||'';return{'access-control-allow-origin':ORIGINS.has(o)?o:'https://appassets.androidplatform.net','access-control-allow-headers':'authorization, apikey, content-type','access-control-allow-methods':'POST, OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'private, max-age=90','vary':'Origin'}}
function json(req:Request,status:number,body:any){return new Response(JSON.stringify(body),{status,headers:cors(req)})}

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
    const leads=enrichLeads(payload?.leads||[]),exact=leads.filter((x:any)=>x?.source_item_scope==='exact_product').length;
    return json(req,200,{...payload,status:'PASS',leads,count:leads.length,function_slug:FUNCTION_SLUG,adapter_version:'exact-source-v064',exact_source_count:exact,exact_source_rule:'When PennyTree publishes a deterministic product route for the item UPC, Scout links to that exact product page. Broad list URLs remain labeled as source lists and are never presented as local store proof.',penny_truth_rule:'Crawler/community sources discover and corroborate leads. Exact source pages still do not prove local store price or stock. Physical in-store UPC/register scan remains final local penny truth.'});
  }catch(e){return json(req,503,{error:e instanceof Error?e.message:String(e),function_slug:FUNCTION_SLUG,adapter_version:'exact-source-v064'})}
});
