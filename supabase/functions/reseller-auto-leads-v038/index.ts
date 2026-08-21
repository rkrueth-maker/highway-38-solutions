import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ORIGINS=new Set(["https://appassets.androidplatform.net","https://highway38solutions.com","https://www.highway38solutions.com"]);
const BASE=Deno.env.get("SUPABASE_URL")||"";

function cors(req:Request){
  const origin=req.headers.get("origin")||"";
  return {
    "access-control-allow-origin":ORIGINS.has(origin)?origin:"https://appassets.androidplatform.net",
    "access-control-allow-headers":"authorization, apikey, content-type",
    "access-control-allow-methods":"GET, POST, OPTIONS",
    "content-type":"application/json; charset=utf-8",
    "cache-control":"private, max-age=120",
    "vary":"Origin"
  };
}
function json(req:Request,status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
function clean(v:unknown){return String(v??"").trim()}
function retailerKey(v:unknown){
  const s=clean(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  if(s.includes("home depot"))return"home depot";
  if(s.includes("dollar general"))return"dollar general";
  if(s.includes("dollar tree"))return"dollar tree";
  if(s.includes("family dollar"))return"family dollar";
  if(s.includes("lowe"))return"lowes";
  return s;
}
function identity(row:any){
  const retailer=retailerKey(row?.retailer);
  const upc=clean(row?.upc).replace(/\D/g,"");
  const rawSku=clean(row?.sku).toLowerCase();
  const skuDigits=rawSku.replace(/\D/g,"");
  const sku=retailer==="home depot"&&skuDigits.length>=5?skuDigits:rawSku.replace(/[^a-z0-9]+/g,"");
  let url="";
  try{const u=new URL(clean(row?.source_url));url=u.hostname.toLowerCase()+u.pathname.replace(/\/$/,"")}catch{}
  const title=clean(row?.title).toLowerCase().replace(/[^a-z0-9]+/g," ").trim().slice(0,140);
  return `${retailer}|${upc.length>=7?`u:${upc}`:sku?`s:${sku}`:url?`url:${url}`:`t:${title}`}`;
}
function rank(row:any){
  return (String(row?.deal_type||"").toLowerCase()==="penny"?100000:0)+(row?.deep_discount?10000:0)+Number(row?.source_priority||0)*10+Number(row?.discount_pct||0);
}
function dedupe(rows:any[]){
  const map=new Map<string,any>();
  for(const row of rows){
    const key=identity(row);if(!key||key.endsWith("|t:"))continue;
    const old=map.get(key);if(!old||rank(row)>rank(old))map.set(key,row);
  }
  return [...map.values()];
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="GET"&&req.method!=="POST")return json(req,405,{error:"GET or POST required."});
  try{
    const auth=req.headers.get("authorization")||"";
    const apikey=req.headers.get("apikey")||"";
    if(!auth)return json(req,401,{error:"Sign in required."});
    const upstream=await fetch(`${BASE}/functions/v1/reseller-auto-leads`,{
      method:"POST",
      headers:{authorization:auth,apikey,"content-type":"application/json"},
      body:"{}",
      signal:AbortSignal.timeout(40000)
    });
    const payload=await upstream.json().catch(()=>({}));
    if(!upstream.ok)return json(req,upstream.status,{error:payload?.error||payload?.message||"Candidate source unavailable."});
    const raw=Array.isArray(payload?.leads)?payload.leads:[];
    const leads=dedupe(raw);
    const by:any={};for(const lead of leads)by[lead.retailer]=(by[lead.retailer]||0)+1;
    return json(req,200,{...payload,leads,count:leads.length,raw_count:raw.length,duplicate_count:Math.max(0,raw.length-leads.length),by_retailer:by,dedupe_version:"strict-retailer-upc-sku-v038"});
  }catch(e){return json(req,503,{error:e instanceof Error?e.message:String(e)})}
});
