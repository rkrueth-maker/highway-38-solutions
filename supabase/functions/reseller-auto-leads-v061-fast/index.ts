import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const FUNCTION_SLUG="reseller-auto-leads-v061-fast";
const BASE=Deno.env.get("SUPABASE_URL")||"";
const ORIGINS=new Set(["https://appassets.androidplatform.net","https://highway38solutions.com","https://www.highway38solutions.com"]);
function cors(req:Request){const o=req.headers.get("origin")||"";return{"access-control-allow-origin":ORIGINS.has(o)?o:"https://appassets.androidplatform.net","access-control-allow-headers":"authorization, apikey, content-type","access-control-allow-methods":"POST, OPTIONS","content-type":"application/json; charset=utf-8","cache-control":"private, max-age=45","vary":"Origin"}}
function json(req:Request,status:number,body:any){return new Response(JSON.stringify(body),{status,headers:cors(req)})}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return json(req,405,{error:"POST required."});
  try{
    const auth=req.headers.get("authorization")||"",apikey=req.headers.get("apikey")||"";
    if(!auth)return json(req,401,{error:"Sign in required."});
    const body=await req.text();
    const upstream=await fetch(`${BASE}/functions/v1/reseller-auto-leads-v049`,{method:"POST",headers:{authorization:auth,apikey,"content-type":"application/json"},body:body||"{}",signal:AbortSignal.timeout(55000)});
    const payload=await upstream.json().catch(()=>({}));
    if(!upstream.ok)return json(req,upstream.status,{error:payload?.error||"Retail Hunt feed failed."});
    const leads=Array.isArray(payload?.leads)?payload.leads:[];
    return json(req,200,{...payload,status:payload?.status||"PASS",leads,count:leads.length,function_slug:FUNCTION_SLUG,adapter_version:"fast-text-evidence-feed-v061",photo_mode:"deferred",photo_rule:"Normal Hunt does not call photo-enrichment providers. Existing source images may pass through, but missing pictures never delay or block discovery.",view_contract:"Crawler discovery evidence, store verification, resale evidence, and optional image evidence remain independent."});
  }catch(e){return json(req,503,{error:e instanceof Error?e.message:String(e),function_slug:FUNCTION_SLUG,adapter_version:"fast-text-evidence-feed-v061",photo_mode:"deferred"})}
});
