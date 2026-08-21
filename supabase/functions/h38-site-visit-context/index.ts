import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const OPENAI_API_KEY=Deno.env.get("OPENAI_API_KEY")||"";
const MODEL=Deno.env.get("OPENAI_SITE_SCANNER_MODEL")||Deno.env.get("OPENAI_QUOTE_MODEL")||"gpt-5-mini-2025-08-07";
const ALLOWED_ORIGINS=new Set(["https://highway38solutions.com","https://www.highway38solutions.com","https://rkrueth-maker.github.io","http://localhost:8000","http://127.0.0.1:8000"]);
type Json=Record<string,unknown>;
const clean=(v:unknown,n=12000)=>String(v??"").replace(/Bearer\s+[A-Za-z0-9._-]+/gi,"Bearer [REDACTED]").slice(0,n);
const origin=(r:Request)=>String(r.headers.get("origin")||"").replace(/\/+$/,"");
const cors=(r:Request)=>({"access-control-allow-origin":ALLOWED_ORIGINS.has(origin(r))?origin(r):origin(r)||"*","access-control-allow-headers":String(r.headers.get("access-control-request-headers")||"authorization, apikey, content-type, x-client-info"),"access-control-allow-methods":"POST, OPTIONS","cache-control":"no-store","content-type":"application/json; charset=utf-8","vary":"Origin, Access-Control-Request-Headers"});
const reply=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:cors(r)});
const bearer=(r:Request)=>String(r.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
const db=()=>createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const genericTitle=(v:unknown)=>/^(?:site|field)\s*visit$/i.test(clean(v,200).trim())||!clean(v,200).trim();
async function json(res:Response){const raw=await res.text();try{return JSON.parse(raw)||{}}catch{return{}}}
async function user(r:Request){const token=bearer(r);if(!token)throw Error("Supabase Auth session is required.");const res=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{authorization:`Bearer ${token}`,apikey:SERVICE_KEY,"x-client-info":"h38-site-visit-context-v1"}});const p=await json(res);if(!res.ok||!p?.id)throw Error("Supabase Auth session is invalid or expired.");return String(p.id)}
async function membership(api:any,userId:string,businessId:string){const{data,error}=await api.from("business_memberships").select("role,status").eq("business_id",businessId).eq("auth_user_id",userId).eq("status","active").maybeSingle();if(error)throw error;if(!data||!["owner","administrator","staff"].includes(String(data.role)))throw Error("This account cannot update Site Visit context.")}
function outputText(p:any){if(typeof p?.output_text==="string")return p.output_text;for(const o of Array.isArray(p?.output)?p.output:[])for(const part of Array.isArray(o?.content)?o.content:[])if(part?.type==="output_text"&&typeof part?.text==="string")return part.text;return""}
async function extract(session:Json){
  const transcript=clean(session["Walkthrough Transcript"]||session.walkthroughTranscript,24000);
  const notes=Array.isArray(session["Walkthrough Voice Notes"])?session["Walkthrough Voice Notes"]:[];
  const requests=Array.isArray(session["Walkthrough Customer Requests"])?session["Walkthrough Customer Requests"]:[];
  if(!transcript&&!notes.length&&!requests.length)return{projectTitle:"",scopeDraft:""};
  const schema={type:"object",additionalProperties:false,required:["projectTitle","scopeDraft"],properties:{projectTitle:{type:"string"},scopeDraft:{type:"string"}}};
  const instructions=[
    "Extract editable internal Site Visit context from the contractor's spoken walkthrough.",
    "Use only facts explicitly present in the transcript or already-organized walkthrough notes.",
    "For projectTitle: if the speaker explicitly states a job/project title, preserve those words except normal capitalization. Otherwise, if the work and location/customer wording clearly identify the job, form a short internal title only from those explicit words. If not clear, return an empty string.",
    "For scopeDraft: summarize only the explicitly requested work into a concise editable scope. Do not invent materials, dimensions, prices, approvals, or work not stated.",
    "Never approve, send, schedule, purchase, charge, accept, or authorize work."
  ].join(" ");
  const res=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{authorization:`Bearer ${OPENAI_API_KEY}`,"content-type":"application/json"},body:JSON.stringify({model:MODEL,instructions,input:[{role:"user",content:[{type:"input_text",text:JSON.stringify({currentProjectTitle:clean(session["Project Title"]||session.projectTitle,300),currentScope:clean(session["Scope"]||session.scope,2000),transcript,notes,customerRequests:requests})}]}],text:{format:{type:"json_schema",name:"h38_site_visit_context",strict:true,schema}}}),signal:AbortSignal.timeout(120000)});
  const p=await json(res);if(!res.ok)throw Error(clean(p?.error?.message||p?.message||`Context extraction failed (${res.status}).`,4000));const raw=outputText(p);if(!raw)throw Error("No Site Visit context was returned.");const parsed=JSON.parse(raw);return{projectTitle:clean(parsed.projectTitle,300).trim(),scopeDraft:clean(parsed.scopeDraft,4000).trim()};
}
Deno.serve(async(request:Request)=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(request)});
  if(request.method!=="POST")return reply(request,405,{status:"FAIL",message:"POST required."});
  try{
    const body=await request.json() as Json,businessId=clean(body.businessId,180),captureSessionId=clean(body.captureSessionId,180);if(!businessId||!captureSessionId)return reply(request,400,{status:"FAIL",message:"businessId and captureSessionId are required."});
    const api=db(),userId=await user(request);await membership(api,userId,businessId);
    const{data,error}=await api.from("business_records").select("record_key,payload").eq("business_id",businessId).eq("collection","siteCaptureSessions").eq("record_key",captureSessionId).eq("record_status","active").maybeSingle();if(error)throw error;if(!data)throw Error("The Site Visit session was not found.");
    const session=(data.payload&&typeof data.payload==="object"?data.payload:{}) as Json;
    let projectTitle=clean(session["Walkthrough Suggested Project Title"],300).trim(),scopeDraft=clean(session["Walkthrough Suggested Scope"],4000).trim();
    if(!projectTitle&&!scopeDraft){const x=await extract(session);projectTitle=x.projectTitle;scopeDraft=x.scopeDraft;}
    const currentTitle=clean(session["Project Title"]||session.projectTitle,300).trim(),currentScope=clean(session["Scope"]||session.scope,4000).trim();
    const applyTitle=!!projectTitle&&genericTitle(currentTitle),applyScope=!!scopeDraft&&!currentScope;
    const now=new Date().toISOString();const updated={...session,"Walkthrough Suggested Project Title":projectTitle,"Walkthrough Suggested Scope":scopeDraft,"Walkthrough Context Status":"COMPLETE","Walkthrough Context Updated Time":now,"Project Title":applyTitle?projectTitle:currentTitle,"Scope":applyScope?scopeDraft:currentScope,"Updated Time":now,"Record Version":Number(session["Record Version"]||session.recordVersion||1)+1};
    const changed=await api.from("business_records").update({payload:updated,updated_by:userId,updated_at:now}).eq("business_id",businessId).eq("collection","siteCaptureSessions").eq("record_key",captureSessionId).eq("record_status","active");if(changed.error)throw changed.error;
    const quoteId=clean(session["Quote ID"]||session.quoteId,180).trim();
    if(quoteId&&(applyTitle||applyScope)){
      const q=await api.from("business_records").select("record_key,payload").eq("business_id",businessId).eq("collection","quotes").eq("record_key",quoteId).eq("record_status","active").maybeSingle();
      if(!q.error&&q.data){const qp=(q.data.payload&&typeof q.data.payload==="object"?q.data.payload:{}) as Json;const lines=Array.isArray(qp.lines)?qp.lines:[];const total=Number(qp.Total||qp.total||0);const status=clean(qp.Status||qp.status,80).toUpperCase();const qTitle=clean(qp["Project Title"]||qp.projectTitle,300).trim(),qScope=clean(qp.Scope||qp.scope,4000).trim();if((!status||status==="DRAFT")&&lines.length===0&&total===0){const qu={...qp,"Project Title":applyTitle&&genericTitle(qTitle)?projectTitle:qTitle,"Scope":applyScope&&!qScope?scopeDraft:qScope,"Updated Time":now,"Record Version":Number(qp["Record Version"]||qp.recordVersion||1)+1};await api.from("business_records").update({payload:qu,updated_by:userId,updated_at:now}).eq("business_id",businessId).eq("collection","quotes").eq("record_key",quoteId).eq("record_status","active");}}
    }
    try{await api.from("business_proof_log").insert({business_id:businessId,actor_user_id:userId,action_type:"SITE_VISIT_SPOKEN_CONTEXT_EXTRACTED",entity_type:"Site Visit",entity_id:null,result:"PASS",details:{captureSessionId,quoteId:quoteId||null,projectTitleApplied:applyTitle,scopeApplied:applyScope,automaticApproval:false,automaticCustomerSending:false},external_action_occurred:false});}catch(_){ }
    return reply(request,200,{status:"PASS",projectTitle:applyTitle?projectTitle:currentTitle,scope:applyScope?scopeDraft:currentScope,suggestedProjectTitle:projectTitle,suggestedScope:scopeDraft,projectTitleApplied:applyTitle,scopeApplied:applyScope});
  }catch(error){return reply(request,400,{status:"FAIL",message:clean(error instanceof Error?error.message:error,4000)});}
});
