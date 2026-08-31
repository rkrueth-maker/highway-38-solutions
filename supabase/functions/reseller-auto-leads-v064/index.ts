import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {applySourceImage,enrichLeads,exactDollarGeneralImageSources} from './core.mjs';
import {mergeDollarGeneralEvidence,runDollarGeneralSourceOrchestrator} from './dg-source-orchestrator.mjs';

const FUNCTION_SLUG='reseller-auto-leads-v064';
const BASE=Deno.env.get('SUPABASE_URL')||'';
const ORIGINS=new Set(['https://appassets.androidplatform.net','https://highway38solutions.com','https://www.highway38solutions.com']);
const IDENTITY_FETCH_CAP=48;
const IMAGE_CONCURRENCY=8;
function cors(req:Request){const o=req.headers.get('origin')||'';return{'access-control-allow-origin':ORIGINS.has(o)?o:'https://appassets.androidplatform.net','access-control-allow-headers':'authorization, apikey, content-type','access-control-allow-methods':'POST, OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'private, max-age=90','vary':'Origin'}}
function json(req:Request,status:number,body:any){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
function dg(row:any){return String(row?.retailer||'').toLowerCase().includes('dollar general')}
function needsIdentityCheck(row:any){return dg(row)&&exactDollarGeneralImageSources(row).length>0}
async function fetchHtml(url:string){
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36 H38ResellerScout/3','accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9'},redirect:'follow',signal:AbortSignal.timeout(6500)});
  if(!r.ok)return'';const type=(r.headers.get('content-type')||'').toLowerCase();if(!type.includes('text/html'))return'';return(await r.text()).slice(0,1_200_000);
}
async function fetchIdentityFor(row:any){
  for(const source of exactDollarGeneralImageSources(row)){
    try{const html=await fetchHtml(source.url);if(!html)continue;const found=applySourceImage(row,html,source.url,source.provider);if(String(found?.source_identity_title||'').trim()||String(found?.image_url||'').trim())return found}catch{}
  }
  return row;
}
async function hydrateIdentities(rows:any[]){
  const out=rows.slice(),targets=[] as number[];for(let i=0;i<out.length&&targets.length<IDENTITY_FETCH_CAP;i++)if(needsIdentityCheck(out[i]))targets.push(i);
  let cursor=0,found=0,corrected=0;
  async function worker(){while(cursor<targets.length){const idx=targets[cursor++],before=out[idx],after=await fetchIdentityFor(before);out[idx]=after;if(String(after?.image_url||'').trim()&&!String(before?.image_url||'').trim())found++;if(after?.description_conflict===true)corrected++;}}
  await Promise.all(Array.from({length:Math.min(IMAGE_CONCURRENCY,targets.length||1)},()=>worker()));
  return{rows:out,attempted:targets.length,found,corrected};
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=='POST')return json(req,405,{error:'POST required.'});
  try{
    const auth=req.headers.get('authorization')||'',apikey=req.headers.get('apikey')||'';
    if(!auth)return json(req,401,{error:'Sign in required.'});
    const body=await req.text();
    const upstreamPromise=fetch(`${BASE}/functions/v1/reseller-auto-leads-v063`,{method:'POST',headers:{authorization:auth,apikey,'content-type':'application/json'},body:body||'{}',signal:AbortSignal.timeout(70000)});
    const dgPromise=runDollarGeneralSourceOrchestrator().catch(e=>({rows:[],source_status:[],warnings:[`Dollar General source orchestrator: ${e instanceof Error?e.message:String(e)}`]}));
    const [upstream,dgSources]=await Promise.all([upstreamPromise,dgPromise]);
    const payload=await upstream.json().catch(()=>({}));
    if(!upstream.ok)return json(req,upstream.status,{error:payload?.error||'Retail Hunt source failed.',function_slug:FUNCTION_SLUG,dg_source_status:dgSources.source_status||[],dg_source_warnings:dgSources.warnings||[],provider_isolation_rule:'Dollar General source adapters run independently; their failures do not replace or suppress the upstream retailer feed.'});
    const merged=mergeDollarGeneralEvidence(Array.isArray(payload?.leads)?payload.leads:[],dgSources.rows||[]);
    const enriched=enrichLeads(merged),hydrated=await hydrateIdentities(enriched),leads=hydrated.rows,exact=leads.filter((x:any)=>x?.source_item_scope==='exact_product').length,dgImages=leads.filter((x:any)=>dg(x)&&String(x?.image_url||'').trim()).length,dgRows=leads.filter((x:any)=>dg(x)).length;
    const statuses=dgSources.source_status||[],sourceAvailable=statuses.filter((x:any)=>x?.status==='AVAILABLE').length,sourceDegraded=statuses.filter((x:any)=>x?.status==='DEGRADED').length,sourceReference=statuses.filter((x:any)=>x?.status==='REFERENCE_ONLY').length,sourceUnavailable=statuses.filter((x:any)=>x?.status==='UNAVAILABLE').length;
    return json(req,200,{...payload,status:'PASS',leads,count:leads.length,function_slug:FUNCTION_SLUG,adapter_version:'source-orchestrator-v068+exact-upc-identity-v069',dg_source_adapter_version:'source-orchestrator-v068',dg_source_status:statuses,dg_source_warnings:dgSources.warnings||[],dg_source_available:sourceAvailable,dg_source_degraded:sourceDegraded,dg_source_reference_only:sourceReference,dg_source_unavailable:sourceUnavailable,dg_source_candidate_count:(dgSources.rows||[]).length,dg_merged_row_count:dgRows,exact_source_count:exact,dg_image_count:dgImages,dg_identity_fetch_attempted:hydrated.attempted,dg_image_fetch_found:hydrated.found,dg_description_conflicts_corrected:hydrated.corrected,provider_isolation_rule:'Each Dollar General source owns its parser/acquisition method and source-specific fallback. One source failure cannot erase rows produced by other adapters or the upstream retailer feed.',confidence_rule:'Original/primary and truly independent public sources may increase confidence. Aggregators, catalog/community mirrors, reference-only lists, image enrichment, and search-index fallback remain visible evidence but do not multiply independent confidence.',future_truth_rule:'Future-dated penny lists are not emitted as already-active penny inventory before their effective date.',image_rule:'For Dollar General rows, Scout may fetch deterministic public pages tied to the exact UPC to verify product identity and obtain a real published product image. Exact-UPC title conflicts replace the aggregated display description and preserve the raw title for audit. If no trustworthy identity resolves, Scout does not invent one.',penny_truth_rule:'Public/community sources discover and corroborate leads. Product pages, search indexes, and images do not prove local store price or stock. Physical DG app/UPC/register scan remains final local penny truth.'});
  }catch(e){return json(req,503,{error:e instanceof Error?e.message:String(e),function_slug:FUNCTION_SLUG,adapter_version:'source-orchestrator-v068+exact-upc-identity-v069'})}
});
