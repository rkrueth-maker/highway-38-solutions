import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {aggregate,parsePennyGeneral,parsePennyPinchinMom,CANONICAL_IDENTITY_VERSION} from './core.mjs';

const FUNCTION_SLUG='reseller-auto-leads-v063';
const BASE=Deno.env.get('SUPABASE_URL')||'';
const UA='Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 H38ResellerScout/2.1.3 multi-source-hunt';
const ORIGINS=new Set(['https://appassets.androidplatform.net','https://highway38solutions.com','https://www.highway38solutions.com']);
const SOURCES=[
  {id:'pennygeneral-dg',name:'PennyGeneral',domain:'pennygeneral.net',retailer:'Dollar General',url:'https://pennygeneral.net/',priority:132,parser:parsePennyGeneral},
  {id:'pennypinchinmom-hd',name:"Penny Pinchin' Mom",domain:'pennypinchinmom.com',retailer:'Home Depot',url:'https://pennypinchinmom.com/home-depot-penny-list/',priority:130,parser:parsePennyPinchinMom}
];
const CACHE_MS=10*60*1000;
let extraCache:any=null;

function cors(req:Request){const o=req.headers.get('origin')||'';return{'access-control-allow-origin':ORIGINS.has(o)?o:'https://appassets.androidplatform.net','access-control-allow-headers':'authorization, apikey, content-type','access-control-allow-methods':'POST, OPTIONS','content-type':'application/json; charset=utf-8','cache-control':'private, max-age=90','vary':'Origin'}}
function json(req:Request,status:number,body:any){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
async function fetchSource(src:any){const r=await fetch(src.url,{headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9'},redirect:'follow',signal:AbortSignal.timeout(18000)});if(!r.ok)throw Error(`${src.name} returned ${r.status}`);const html=await r.text();const rows=src.parser(html,src);if(!Array.isArray(rows)||!rows.length)throw Error(`${src.name} returned no exact identifiable penny rows`);return rows}
async function extras(force=false){if(!force&&extraCache&&Date.now()-extraCache.at<CACHE_MS)return{...extraCache.payload,cached:true};const settled=await Promise.allSettled(SOURCES.map(fetchSource)),rows:any[]=[],source_status:any[]=[],warnings:string[]=[];settled.forEach((r,i)=>{const s=SOURCES[i];if(r.status==='fulfilled'){rows.push(...r.value);source_status.push({source:s.name,domain:s.domain,retailer:s.retailer,status:'PASS',products:r.value.length,identity_requirement:s.retailer==='Dollar General'?'UPC or SKU (bridge prefers both)':'exact Home Depot SKU'})}else{const warning=r.reason instanceof Error?r.reason.message:String(r.reason);warnings.push(warning);source_status.push({source:s.name,domain:s.domain,retailer:s.retailer,status:'UNAVAILABLE',products:0,warning})}});const payload={rows,source_status,warnings};extraCache={at:Date.now(),payload};return payload}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=='POST')return json(req,405,{error:'POST required.'});
  try{
    const auth=req.headers.get('authorization')||'',apikey=req.headers.get('apikey')||'';if(!auth)return json(req,401,{error:'Sign in required.'});
    const text=await req.text(),body=text||'{}';let force=false;try{force=!!JSON.parse(body).force}catch{}
    const upstream=await fetch(`${BASE}/functions/v1/reseller-auto-leads-v046`,{method:'POST',headers:{authorization:auth,apikey,'content-type':'application/json'},body,signal:AbortSignal.timeout(60000)});
    const payload=await upstream.json().catch(()=>({}));if(!upstream.ok)return json(req,upstream.status,{error:payload?.error||'Retail Hunt base feed failed.',function_slug:FUNCTION_SLUG});
    let extra:any={rows:[],source_status:[],warnings:[]};try{extra=await extras(force)}catch(e){extra={rows:[],source_status:[],warnings:[e instanceof Error?e.message:String(e)]}}
    const base=Array.isArray(payload?.leads)?payload.leads:[],leads=aggregate([...base,...extra.rows]),raw=base.length+extra.rows.length;
    const by:any={},multi:any={};for(const row of leads){const r=String(row?.retailer||'Unknown');by[r]=(by[r]||0)+1;if(Number(row?.signal_source_count)>=2)multi[r]=(multi[r]||0)+1}
    return json(req,200,{...payload,status:'PASS',leads,count:leads.length,raw_count:raw,duplicate_count:Math.max(0,raw-leads.length),by_retailer:by,multi_source_by_retailer:multi,source_status:[...(Array.isArray(payload?.source_status)?payload.source_status:[]),...extra.source_status],warnings:[...(Array.isArray(payload?.warnings)?payload.warnings:[]),...extra.warnings],function_slug:FUNCTION_SLUG,adapter_version:'multi-source-canonical-v063',canonical_identity_version:CANONICAL_IDENTITY_VERSION,dedupe_rule:'One card per retailer product. Strong UPC/SKU aliases merge independent source evidence; a bridge row collapses every matching cluster instead of leaving duplicates.',source_additions:['PennyGeneral — Dollar General','Penny Pinchin\' Mom — Home Depot'],penny_truth_rule:'Crawler/community sources discover and corroborate leads. Web/store checks do not erase penny evidence. Physical in-store UPC/register scan remains final local truth.'});
  }catch(e){return json(req,503,{error:e instanceof Error?e.message:String(e),function_slug:FUNCTION_SLUG,adapter_version:'multi-source-canonical-v063'})}
});
