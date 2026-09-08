import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const BUILD='20260908-quote-release-gate-1';
const CANONICAL_AGENT='h38-quote-agent';
const H38_ORIGIN='https://highway38solutions.com';
const ALLOWED_ORIGINS=new Set([H38_ORIGIN,'https://www.highway38solutions.com','https://rkrueth-maker.github.io','http://localhost:8000','http://127.0.0.1:8000']);
type J=Record<string,any>;
const txt=(v:any,max=12000)=>String(v??'').trim().slice(0,max);
const num=(v:any)=>{const n=Number(v??0);return Number.isFinite(n)?n:0;};
const norm=(v:any)=>txt(v,2000).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const unit=(v:any)=>{const x=norm(v),m:J={ls:'lump sum','lump sum':'lump sum',ea:'each',each:'each',hr:'hour',hrs:'hour',hour:'hour',hours:'hour',lf:'linear foot','linear ft':'linear foot','linear foot':'linear foot',sf:'square foot','sq ft':'square foot','square foot':'square foot',cy:'cubic yard','cu yd':'cubic yard','cubic yard':'cubic yard',ft:'foot',foot:'foot',feet:'foot'};return m[x]||x;};
function origin(req:Request){return txt(req.headers.get('origin'),300).replace(/\/+$/,'');}
function headers(req:Request):HeadersInit{return{'access-control-allow-origin':origin(req)||'*','access-control-allow-headers':txt(req.headers.get('access-control-request-headers'),700)||'authorization, apikey, content-type, x-client-info, x-h38-request-id','access-control-allow-methods':'GET, POST, OPTIONS','cache-control':'no-store','content-type':'application/json; charset=utf-8','vary':'Origin, Access-Control-Request-Headers'};}
const json=(req:Request,status:number,payload:any)=>new Response(JSON.stringify(payload),{status,headers:headers(req)});
const bearer=(req:Request)=>String(req.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1]?.trim()||'';
const db=()=>{if(!SUPABASE_URL||!SERVICE_KEY)throw new Error('Supabase service configuration is unavailable.');return createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});};
async function readJson(r:Response){const raw=await r.text();try{return raw?JSON.parse(raw):{};}catch{return{status:'FAIL',message:raw.slice(0,1400)}}}
async function authorize(req:Request,businessId:string){
  const token=bearer(req);if(!token)throw new Error('Supabase Auth session is required.');
  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{authorization:`Bearer ${token}`,apikey:SERVICE_KEY,'x-client-info':BUILD},signal:AbortSignal.timeout(15000)}),p=await readJson(r);if(!r.ok||!p?.id)throw new Error('Supabase Auth session is invalid or expired.');
  const s=db(),m=await s.from('business_memberships').select('id,role,status').eq('business_id',businessId).eq('auth_user_id',p.id).eq('status','active').maybeSingle();if(m.error)throw m.error;if(!m.data||!['owner','administrator'].includes(String(m.data.role)))throw new Error('Owner or administrator access is required to build or verify quotes.');return{token,userId:String(p.id),role:String(m.data.role),client:s};
}
const CONTRACT=[
  'H38 QUOTE RELEASE CONTRACT: A customer-facing service quote may never be represented as one lump-sum/LS line.',
  'Break actual requested work into defensible measurable component lines. Use material, labor, equipment, and other only where each category is genuinely applicable.',
  'Labor must be its own measurable line for physical installation, repair, construction, remodeling, replacement, field service, or fabrication work.',
  'Materials must be separate from labor when materials are part of the requested work. Equipment, disposal, mobilization, permits, subcontract work, and similar direct costs must be separate when applicable.',
  'Do not hide a whole service, project, package, or trade behind unit each/project/job/service/package. Do not return unit lump sum or LS.',
  'Every quote-ready line must have a positive quantity and positive rate. If a critical quantity is truly unknown, state it in missingInformation rather than inventing it.',
  'Specialty/vendor/subcontract quotes are verification inputs after the H38 base quote is itemized. They may confirm or replace the matching specialty allowance but must not collapse the base quote into a lump sum.',
  'Preserve owner-reviewed existing component lines while adding newly supported add-on scope from quote-linked photos, video frames, transcripts, and owner notes.',
  'Web Office and Site Manager use this same canonical quote release contract and the same h38-quote-agent pipeline.'
].join(' ');
function lines(result:J){return Array.isArray(result?.draft?.suggestedLines)?result.draft.suggestedLines:[];}
const physical=/\b(install|installation|repair|replace|replacement|build|construction|construct|remodel|renovation|fabricat|field service|drywall|insulation|deck|fence|roof|siding|electrical|plumb|hvac|heating|concrete|landscap|framing|flooring|paint|cabinet|countertop|door|window|stairs?|railing)\b/i;
const materialScope=/\b(drywall|sheetrock|insulation|lumber|framing|deck|fence|roof|shingle|siding|concrete|flooring|tile|cabinet|countertop|door|window|stairs?|railing|pipe|duct|wire|receptacle|fixture)\b/i;
const broad=/\b(complete|entire|whole|total|project|job|package|service|installation|repair|construction|remodel|replacement)\b/i;
function contractProblems(result:J,body:J){
  const out:string[]=[],rows=lines(result),scope=txt(`${body.projectTitle||''} ${body.scope||''} ${body.ownerWorkRequest||''}`,12000);
  if(!rows.length)return['no quote lines returned'];
  rows.forEach((line:J,index:number)=>{const u=unit(line.unit),q=num(line.quantity),rate=num(line.rate??line.unitPrice),type=norm(line.costType||'other');if(u==='lump sum')out.push(`line ${index+1} uses forbidden lump sum`);if(q<=0)out.push(`line ${index+1} has non-positive quantity`);if(rate<=0)out.push(`line ${index+1} has non-positive rate`);if(!['material','labor','equipment','other'].includes(type))out.push(`line ${index+1} has invalid cost type`);if(type==='other'&&['each','project','job','service','package'].includes(u)&&broad.test(txt(line.description,800)))out.push(`line ${index+1} hides broad service scope in one other/each-style line`);});
  if(physical.test(scope)&&!rows.some((line:J)=>norm(line.costType)==='labor'&&num(line.quantity)>0&&unit(line.unit)!=='lump sum'))out.push('physical work has no distinct measurable labor line');
  if(physical.test(scope)&&materialScope.test(scope)&&!rows.some((line:J)=>norm(line.costType)==='material'&&num(line.quantity)>0&&unit(line.unit)!=='lump sum'))out.push('material-bearing physical scope has no distinct material line');
  if(rows.length===1&&physical.test(scope)&&norm(rows[0]?.costType)!=='labor')out.push('physical service returned as one non-labor line instead of a component breakout');
  return Array.from(new Set(out));
}
async function quoteMediaEvidence(s:any,businessId:string,quoteId:string){
  const sessions=await s.from('business_records').select('record_key,payload,updated_at').eq('business_id',businessId).eq('collection','mediaAnalysisSessions').eq('record_status','active').order('updated_at',{ascending:false}).limit(120);if(sessions.error)throw sessions.error;
  const linked=(sessions.data||[]).filter((r:J)=>txt(r.payload?.['Quote ID']||r.payload?.quoteId,220)===quoteId).slice(0,12);if(!linked.length)return{sessionCount:0,text:'',scopes:[] as string[]};
  const ids=new Set(linked.map((r:J)=>txt(r.record_key||r.payload?.['Media Analysis Session ID'],220))),analyses=await s.from('business_records').select('record_key,payload,updated_at').eq('business_id',businessId).eq('collection','mediaAnalyses').eq('record_status','active').order('updated_at',{ascending:false}).limit(160);if(analyses.error)throw analyses.error;
  const scopes=linked.map((r:J)=>txt(r.payload?.['Owner Add-On Scope']||r.payload?.['Title'],1800)).filter(Boolean),parts:string[]=[];
  for(const row of analyses.data||[]){const p=row.payload||{},sid=txt(p['Media Analysis Session ID']||p.mediaSessionId,220);if(!ids.has(sid))continue;const a=p.Analysis&&typeof p.Analysis==='object'?p.Analysis:{},scopeItems=Array.isArray(a.scopeItems)?a.scopeItems:[],facts=Array.isArray(a.observedFacts)?a.observedFacts.map((x:any)=>typeof x==='string'?x:x?.fact).filter(Boolean):[],unknowns=Array.isArray(a.unknowns)?a.unknowns:[];parts.push([`QUOTE ADD-ON VIDEO SESSION ${sid}`,txt(a.summary,1600),scopeItems.length?`Scope items: ${scopeItems.join(' | ')}`:'',facts.length?`Observed facts: ${facts.slice(0,12).join(' | ')}`:'',unknowns.length?`Unknowns: ${unknowns.slice(0,10).join(' | ')}`:'',txt(p.Transcript,6000)?`Transcript: ${txt(p.Transcript,6000)}`:''].filter(Boolean).join('\n'));}
  return{sessionCount:linked.length,text:parts.join('\n\n').slice(0,10000),scopes};
}
async function callAgent(req:Request,token:string,body:J,timeout=175000){const r=await fetch(`${SUPABASE_URL}/functions/v1/${CANONICAL_AGENT}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:SERVICE_KEY,'content-type':'application/json',Origin:H38_ORIGIN,'x-client-info':BUILD,'x-h38-request-id':txt(body.requestId||crypto.randomUUID(),180)},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)}),p=await readJson(r);if(!r.ok||p?.status!=='PASS')throw new Error(txt(p?.message||`${CANONICAL_AGENT} failed (${r.status}).`,1600));return p;}
function contractedBody(body:J,media:{sessionCount:number,text:string,scopes:string[]},repair:string[]=[]){const policy=[txt(body.systemQuotePolicy||body.notes,12000),CONTRACT,repair.length?`SERVER CONTRACT REPAIR REQUIRED: ${repair.join('; ')}. Return a compliant itemized quote; do not repeat these defects.`:''].filter(Boolean).join('\n\n'),owner=[txt(body.ownerWorkRequest,8000),...media.scopes.map(x=>`QUOTE ADD-ON SCOPE: ${x}`)].filter(Boolean).join('\n\n').slice(0,12000),measurement=[txt(body.measurementNotes,8000),media.text].filter(Boolean).join('\n\n').slice(0,14000);return{...body,systemQuotePolicy:policy,notes:policy,ownerWorkRequest:owner,measurementNotes:measurement,entryPathIndependent:true,quoteReleaseContract:BUILD,...(media.sessionCount?{forceAiReinterpretation:true,preserveSavedBaseline:false,reproductionMode:false}:{}),...(repair.length?{forceAiReinterpretation:true,preserveSavedBaseline:false,reproductionMode:false}: {})};}
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return json(req,200,{status:'PASS',preflight:true,build:BUILD});
  if(req.method==='GET')return json(req,200,{status:'PASS',service:'h38-quote-release-gate',build:BUILD,canonicalPipeline:CANONICAL_AGENT,noLumpSum:true,lineItemBreakout:true,entryPathIndependent:true,quoteMediaAddOns:true,specialtyVerificationSupported:true,ownerReviewRequired:true,automaticApproval:false,automaticCustomerSending:false,automaticVendorSending:false,automaticFinancialAction:false});
  if(req.method!=='POST')return json(req,405,{status:'FAIL',message:'POST required.',build:BUILD});
  let body:J={};try{body=await req.json();}catch{return json(req,400,{status:'FAIL',message:'Request body must be JSON.',build:BUILD});}
  const o=origin(req);if(!ALLOWED_ORIGINS.has(o))return json(req,403,{status:'FAIL',message:`Quote release origin is not approved: ${o||'missing origin'}.`,build:BUILD});
  const businessId=txt(body.businessId,100),quoteId=txt(body.quoteId,220),action=txt(body.action||'buildQuote',80);if(!businessId||!quoteId)return json(req,400,{status:'FAIL',message:'Business and saved quote are required.',build:BUILD});
  try{
    const auth=await authorize(req,businessId);
    if(action!=='buildQuote'){const result=await callAgent(req,auth.token,body);return json(req,200,{...result,releaseGate:{build:BUILD,canonicalPipeline:CANONICAL_AGENT,passThrough:true,ownerReviewRequired:true}});}
    const media=await quoteMediaEvidence(auth.client,businessId,quoteId),firstBody=contractedBody(body,media),first=await callAgent(req,auth.token,firstBody),firstProblems=contractProblems(first,firstBody);
    let result=first,repairApplied=false,problems=firstProblems;
    if(firstProblems.length){repairApplied=true;const repairBody=contractedBody(body,media,firstProblems);result=await callAgent(req,auth.token,repairBody);problems=contractProblems(result,repairBody);}
    if(problems.length)return json(req,422,{status:'FAIL',message:`H38 blocked this draft because it still violates the itemized quote contract: ${problems.join('; ')}.`,build:BUILD,canonicalPipeline:CANONICAL_AGENT,problems,repairApplied,noLumpSum:true,ownerReviewRequired:true,externalActionOccurred:false});
    return json(req,200,{...result,releaseGate:{build:BUILD,canonicalPipeline:CANONICAL_AGENT,noLumpSum:true,lineItemBreakout:true,entryPathIndependent:true,quoteMediaAddOnSessions:media.sessionCount,specialtyVerificationSupported:true,repairApplied,problems:[],ownerReviewRequired:true,automaticApproval:false,automaticCustomerSending:false,automaticVendorSending:false,automaticFinancialAction:false},externalActionOccurred:false});
  }catch(error){const message=txt(error instanceof Error?error.message:error,1800);return json(req,/auth|member|administrator|owner/i.test(message)?403:500,{status:'FAIL',message,build:BUILD,canonicalPipeline:CANONICAL_AGENT,noLumpSum:true,ownerReviewRequired:true,externalActionOccurred:false});}
});
