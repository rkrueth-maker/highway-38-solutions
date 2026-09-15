import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const OPENAI_API_KEY=Deno.env.get("OPENAI_API_KEY")||"";
const MODEL=Deno.env.get("OPENAI_SITE_SCANNER_MODEL")||Deno.env.get("OPENAI_QUOTE_MODEL")||"gpt-5-mini-2025-08-07";
const BUILD="20260915-meeting-site-seed-1";
const ALLOWED_ORIGINS=new Set(["https://highway38solutions.com","https://www.highway38solutions.com","https://rkrueth-maker.github.io","http://localhost:8000","http://127.0.0.1:8000"]);
type Json=Record<string,unknown>;
const clean=(v:unknown,n=12000)=>String(v??"").replace(/Bearer\s+[A-Za-z0-9._-]+/gi,"Bearer [REDACTED]").trim().slice(0,n);
const origin=(r:Request)=>String(r.headers.get("origin")||"").replace(/\/+$/,"");
const cors=(r:Request)=>({"access-control-allow-origin":ALLOWED_ORIGINS.has(origin(r))?origin(r):origin(r)||"*","access-control-allow-headers":String(r.headers.get("access-control-request-headers")||"authorization, apikey, content-type, x-client-info"),"access-control-allow-methods":"POST, OPTIONS","cache-control":"no-store","content-type":"application/json; charset=utf-8","vary":"Origin, Access-Control-Request-Headers"});
const reply=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:cors(r)});
const bearer=(r:Request)=>String(r.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
const db=()=>createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const genericTitle=(v:unknown)=>/^(?:site|field)\s*visit$/i.test(clean(v,200))||!clean(v,200);
async function json(res:Response){const raw=await res.text();try{return JSON.parse(raw)||{}}catch{return{}}}
async function user(r:Request){const token=bearer(r);if(!token)throw Error("Supabase Auth session is required.");const res=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{authorization:`Bearer ${token}`,apikey:SERVICE_KEY,"x-client-info":BUILD},signal:AbortSignal.timeout(15000)});const p=await json(res);if(!res.ok||!p?.id)throw Error("Supabase Auth session is invalid or expired.");return String(p.id)}
async function membership(api:any,userId:string,businessId:string){const{data,error}=await api.from("business_memberships").select("role,status").eq("business_id",businessId).eq("auth_user_id",userId).eq("status","active").maybeSingle();if(error)throw error;if(!data||!["owner","administrator","staff"].includes(String(data.role)))throw Error("This account cannot update Site Visit context.")}
async function readRecord(api:any,businessId:string,collection:string,id:string){if(!id)return null;const{data,error}=await api.from("business_records").select("record_key,payload").eq("business_id",businessId).eq("collection",collection).eq("record_key",id).eq("record_status","active").maybeSingle();if(error)throw error;return data?.payload&&typeof data.payload==="object"?data.payload as Json:null;}
function outputText(p:any){if(typeof p?.output_text==="string")return p.output_text;for(const o of Array.isArray(p?.output)?p.output:[])for(const part of Array.isArray(o?.content)?o.content:[])if(part?.type==="output_text"&&typeof part?.text==="string")return part.text;return""}
function meetingText(meeting:Json|null){if(!meeting)return"";const segments=Array.isArray(meeting.segments)?meeting.segments:[];const parts=[clean(meeting.transcript,24000),clean(meeting.summary,6000),...segments.map((s:any)=>clean(s?.transcript||s?.text||s?.note||s?.recollection,6000))];return parts.filter(Boolean).join("\n\n").slice(0,42000);}
function simpleList(value:unknown,key="text"){return(Array.isArray(value)?value:[]).slice(0,20).map((item:any)=>clean(typeof item==="string"?item:item?.[key],1600)).filter(Boolean);}
function meetingMeasurements(meeting:Json|null){return(Array.isArray(meeting?.measurements)?meeting?.measurements:[]).slice(0,20).map((item:any)=>({label:clean(item?.label,300),valueText:clean(item?.valueText,300),statement:clean(item?.statement,1200),verificationStatus:clean(item?.verificationStatus,120)})).filter((item:any)=>item.label||item.valueText||item.statement);}
function blankSeed(meetingId=""){return{meetingId,customer:{name:"",email:"",phone:""},property:{name:"",address:"",address2:"",city:"",state:"",zip:""},projectTitle:"",scopeDraft:"",summary:"",captureItems:[],quoteInputs:[],measurements:[]};}
async function extract(session:Json,meeting:Json|null,meetingId:string){
  const transcript=clean(session["Walkthrough Transcript"]||session.walkthroughTranscript,24000);
  const notes=Array.isArray(session["Walkthrough Voice Notes"])?session["Walkthrough Voice Notes"]:[];
  const requests=Array.isArray(session["Walkthrough Customer Requests"])?session["Walkthrough Customer Requests"]:[];
  const evidence=meetingText(meeting);
  if(!transcript&&!notes.length&&!requests.length&&!evidence)return blankSeed(meetingId);
  const sourced={type:"object",additionalProperties:false,required:["type","label","reason"],properties:{type:{type:"string",enum:["PHOTO","MEASUREMENT","CONFIRMATION"]},label:{type:"string"},reason:{type:"string"}}};
  const schema={type:"object",additionalProperties:false,required:["customer","property","projectTitle","scopeDraft","summary","captureItems","quoteInputs"],properties:{customer:{type:"object",additionalProperties:false,required:["name","email","phone"],properties:{name:{type:"string"},email:{type:"string"},phone:{type:"string"}}},property:{type:"object",additionalProperties:false,required:["name","address","address2","city","state","zip"],properties:{name:{type:"string"},address:{type:"string"},address2:{type:"string"},city:{type:"string"},state:{type:"string"},zip:{type:"string"}}},projectTitle:{type:"string"},scopeDraft:{type:"string"},summary:{type:"string"},captureItems:{type:"array",maxItems:12,items:sourced},quoteInputs:{type:"array",maxItems:12,items:{type:"string"}}}};
  const instructions=[
    "Prepare editable internal pre-visit context for Highway 38 Site Manager from recorded meeting evidence and any existing walkthrough evidence.",
    "Use only facts explicitly present in the supplied evidence. Never invent names, addresses, contact information, dimensions, materials, prices, approvals, or scope.",
    "Customer fields are suggestions only. Extract a customer name, email, or phone only when clearly stated. Property address means the actual service/job/property address, not a billing or unrelated address.",
    "ScopeDraft should concisely describe only work that was actually requested or clearly agreed as work to inspect/quote. Requests are not approvals.",
    "CaptureItems tell the field operator what to capture before quoting. PHOTO is for visual evidence, MEASUREMENT is for dimensions that must be field-verified, and CONFIRMATION is for unresolved scope/condition questions.",
    "Do not treat spoken or recalled dimensions as verified. If a dimension was mentioned but not explicitly field-verified, create a MEASUREMENT capture item to verify it.",
    "QuoteInputs are useful factual inputs or constraints for later quote drafting, not prices or approvals unless explicitly stated as factual existing information.",
    "Nothing in this step approves, sends, schedules, purchases, charges, accepts, or authorizes work."
  ].join(" ");
  const input={meetingId,meetingType:clean(meeting?.meetingType||meeting?.["Meeting Type"],120),meetingTitle:clean(meeting?.title||meeting?.["Title"],300),currentProjectTitle:clean(session["Project Title"]||session.projectTitle,300),currentScope:clean(session["Scope"]||session.scope,4000),meetingEvidence:evidence,meetingSummary:clean(meeting?.summary,6000),customerRequests:simpleList(meeting?.customerRequests),decisions:simpleList(meeting?.decisions),siteConditions:simpleList(meeting?.siteConditions),unknowns:simpleList(meeting?.unknowns),questionsToAsk:simpleList(meeting?.questionsToAsk),measurements:meetingMeasurements(meeting),walkthroughTranscript:transcript,walkthroughNotes:notes,walkthroughCustomerRequests:requests};
  const res=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{authorization:`Bearer ${OPENAI_API_KEY}`,"content-type":"application/json"},body:JSON.stringify({model:MODEL,instructions,input:[{role:"user",content:[{type:"input_text",text:JSON.stringify(input)}]}],text:{format:{type:"json_schema",name:"h38_site_visit_meeting_seed",strict:true,schema}}}),signal:AbortSignal.timeout(120000)});
  const p=await json(res);if(!res.ok)throw Error(clean(p?.error?.message||p?.message||`Context extraction failed (${res.status}).`,4000));const raw=outputText(p);if(!raw)throw Error("No Site Visit context was returned.");const parsed=JSON.parse(raw) as Json;
  const customer=(parsed.customer&&typeof parsed.customer==="object"?parsed.customer:{}) as Json,property=(parsed.property&&typeof parsed.property==="object"?parsed.property:{}) as Json;
  return{meetingId,customer:{name:clean(customer.name,300),email:clean(customer.email,300),phone:clean(customer.phone,120)},property:{name:clean(property.name,300),address:clean(property.address,500),address2:clean(property.address2,300),city:clean(property.city,200),state:clean(property.state,100),zip:clean(property.zip,40)},projectTitle:clean(parsed.projectTitle,300),scopeDraft:clean(parsed.scopeDraft,5000),summary:clean(parsed.summary,6000),captureItems:(Array.isArray(parsed.captureItems)?parsed.captureItems:[]).slice(0,12).map((item:any)=>({type:["PHOTO","MEASUREMENT","CONFIRMATION"].includes(clean(item?.type,40).toUpperCase())?clean(item?.type,40).toUpperCase():"CONFIRMATION",label:clean(item?.label,600),reason:clean(item?.reason,1000)})).filter((item:any)=>item.label),quoteInputs:(Array.isArray(parsed.quoteInputs)?parsed.quoteInputs:[]).slice(0,12).map((x:any)=>clean(x,1200)).filter(Boolean),measurements:meetingMeasurements(meeting)};
}
Deno.serve(async(request:Request)=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(request)});
  if(request.method!=="POST")return reply(request,405,{status:"FAIL",message:"POST required.",build:BUILD});
  try{
    const body=await request.json() as Json,businessId=clean(body.businessId,180),captureSessionId=clean(body.captureSessionId,180),meetingId=clean(body.meetingId,180);if(!businessId||!captureSessionId)return reply(request,400,{status:"FAIL",message:"businessId and captureSessionId are required.",build:BUILD});
    const api=db(),userId=await user(request);await membership(api,userId,businessId);
    const session=await readRecord(api,businessId,"siteCaptureSessions",captureSessionId);if(!session)throw Error("The Site Visit session was not found.");
    const meeting=meetingId?await readRecord(api,businessId,"meetings",meetingId):null;
    const seed=await extract(session,meeting,meetingId);
    const currentTitle=clean(session["Project Title"]||session.projectTitle,300),currentScope=clean(session["Scope"]||session.scope,4000),projectTitle=seed.projectTitle,scopeDraft=seed.scopeDraft;
    const applyTitle=!!projectTitle&&genericTitle(currentTitle),applyScope=!!scopeDraft&&!currentScope,stamp=new Date().toISOString();
    const updated={...session,"Walkthrough Suggested Project Title":projectTitle,"Walkthrough Suggested Scope":scopeDraft,"Walkthrough Context Status":"COMPLETE","Walkthrough Context Updated Time":stamp,"Meeting Seed ID":meetingId,"Meeting Seed Status":meetingId?"READY":"NOT_LINKED","Meeting Seed":seed,"Meeting Seed Updated Time":stamp,"Project Title":applyTitle?projectTitle:currentTitle,"Scope":applyScope?scopeDraft:currentScope,"Updated Time":stamp,"Record Version":Number(session["Record Version"]||session.recordVersion||1)+1};
    const changed=await api.from("business_records").update({payload:updated,updated_by:userId,updated_at:stamp}).eq("business_id",businessId).eq("collection","siteCaptureSessions").eq("record_key",captureSessionId).eq("record_status","active");if(changed.error)throw changed.error;
    if(meeting&&meetingId){const nextMeeting={...meeting,siteVisitSeed:seed,"Site Visit Seed":seed,siteVisitSeedCaptureSessionId:captureSessionId,siteVisitSeedUpdatedAt:stamp,"Updated Time":stamp,updatedAt:stamp};const m=await api.from("business_records").update({payload:nextMeeting,updated_by:userId,updated_at:stamp}).eq("business_id",businessId).eq("collection","meetings").eq("record_key",meetingId).eq("record_status","active");if(m.error)throw m.error;}
    const quoteId=clean(session["Quote ID"]||session.quoteId,180);
    if(quoteId&&(applyTitle||applyScope)){
      const q=await readRecord(api,businessId,"quotes",quoteId);
      if(q){
        const status=clean(q.Status||q.status,80).toUpperCase();
        const lines=Array.isArray(q.lines)?q.lines:[];
        const total=Number(q.Total||q.total||0);
        const qTitle=clean(q["Project Title"]||q.projectTitle,300);
        const qScope=clean(q.Scope||q.scope,4000);
        if((!status||status==="DRAFT")&&lines.length===0&&total===0){const qu={...q,"Project Title":applyTitle&&genericTitle(qTitle)?projectTitle:qTitle,"Scope":applyScope&&!qScope?scopeDraft:qScope,"Meeting Seed ID":meetingId,"Updated Time":stamp,"Record Version":Number(q["Record Version"]||q.recordVersion||1)+1};await api.from("business_records").update({payload:qu,updated_by:userId,updated_at:stamp}).eq("business_id",businessId).eq("collection","quotes").eq("record_key",quoteId).eq("record_status","active");}
      }
    }
    try{await api.from("business_proof_log").insert({business_id:businessId,actor_user_id:userId,action_type:meetingId?"SITE_VISIT_MEETING_CONTEXT_PREPARED":"SITE_VISIT_SPOKEN_CONTEXT_EXTRACTED",entity_type:"Site Visit",entity_id:null,result:"PASS",details:{captureSessionId,meetingId:meetingId||null,quoteId:quoteId||null,projectTitleApplied:applyTitle,scopeApplied:applyScope,customerSuggested:!!seed.customer.name,propertySuggested:!!seed.property.address,captureItems:seed.captureItems.length,automaticApproval:false,automaticCustomerSending:false,automaticFinancialAction:false,externalActionOccurred:false,build:BUILD},external_action_occurred:false});}catch(_){ }
    return reply(request,200,{status:"PASS",build:BUILD,projectTitle:applyTitle?projectTitle:currentTitle,scope:applyScope?scopeDraft:currentScope,suggestedProjectTitle:projectTitle,suggestedScope:scopeDraft,projectTitleApplied:applyTitle,scopeApplied:applyScope,siteVisitSeed:seed});
  }catch(error){return reply(request,400,{status:"FAIL",message:clean(error instanceof Error?error.message:error,4000),build:BUILD});}
});
