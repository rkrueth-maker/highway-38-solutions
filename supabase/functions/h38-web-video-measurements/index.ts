import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
// --- AI usage tracking & per-tenant monthly caps (Muse Spark: $1.25/1M in, $4.25/1M out) ---
const AI_MONTHLY_CAP_USD=20,AI_ALERT_USD=15,AI_COST_IN_PER_M=1.25,AI_COST_OUT_PER_M=4.25;
const AI_MONTHLY_ACTION_LIMIT=5000,AI_ACTION_ALERT_COUNT=3750;
async function aiUsageAlert75(svc:any,businessId:string,count:number):Promise<void>{try{const now=new Date();const month=`${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}`;const ex=await svc.from("business_records").select("id,payload").eq("business_id",businessId).eq("collection","ai_config").eq("record_key","ai_usage_alert_75").maybeSingle();if(ex.error)return;const prev=ex.data?.payload as any;if(prev&&prev.month===month)return;const payload={month,level:75,count,sentAt:now.toISOString()};if(ex.data){await svc.from("business_records").update({payload,updated_at:now.toISOString()}).eq("id",ex.data.id);}else{const own=await svc.from("business_memberships").select("auth_user_id").eq("business_id",businessId).eq("role","owner").eq("status","active").limit(1).maybeSingle();const ownerId=own.data?.auth_user_id;if(!ownerId)return;const ins=await svc.from("business_records").insert({business_id:businessId,collection:"ai_config",record_key:"ai_usage_alert_75",record_status:"active",payload,created_by:ownerId,updated_by:ownerId});if(ins.error)return;}try{await svc.from("business_proof_log").insert({business_id:businessId,actor_user_id:null,action_type:"AI_USAGE_ALERT_75",entity_type:"AI Usage",entity_id:null,result:"PASS",details:{month,level:75,count},external_action_occurred:false});}catch{}}catch{}}
async function aiCapCheck(svc:any,businessId:string):Promise<{spend:number;alert:boolean;actions:number}>{const m=new Date();m.setUTCDate(1);m.setUTCHours(0,0,0,0);const r=await svc.from("ai_usage_log").select("cost_estimate").eq("business_id",businessId).gte("created_at",m.toISOString());if(r.error)throw r.error;const spend=(r.data||[]).reduce((t:number,x:any)=>t+Number(x.cost_estimate||0),0);const actions=(r.data||[]).length;const ov=await svc.from("business_records").select("payload").eq("business_id",businessId).eq("collection","ai_config").eq("record_key","ai_cap_override").eq("record_status","active").maybeSingle();const override=!ov.error&&ov.data&&(ov.data.payload as any)?.enabled===true;if(actions>=AI_MONTHLY_ACTION_LIMIT&&!override)throw new Error("AI action limit reached for this month (5,000). Usage resets on the 1st.");if(spend>=AI_MONTHLY_CAP_USD&&!override)throw new Error(`AI usage cap reached for this month ($${AI_MONTHLY_CAP_USD.toFixed(2)}). Usage resets on the 1st.`);if(actions>=AI_ACTION_ALERT_COUNT)await aiUsageAlert75(svc,businessId,actions);return{spend,alert:spend>=AI_ALERT_USD,actions};}
async function aiLogUsage(svc:any,businessId:string,fn:string,usage:any,model:string):Promise<void>{try{const ti=Number(usage?.prompt_tokens??0),to=Number(usage?.completion_tokens??0);const cost=(ti/1e6)*AI_COST_IN_PER_M+(to/1e6)*AI_COST_OUT_PER_M;const r=await svc.from("ai_usage_log").insert({business_id:businessId,function_name:fn,tokens_in:ti,tokens_out:to,cost_estimate:Number(cost.toFixed(6)),model:model||"muse-spark-1.1"});if(r.error)console.warn("ai_usage_log insert failed:",r.error.message);}catch(e){console.warn("aiLogUsage failed:",e instanceof Error?e.message:e);}}

const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const MUSE_SPARK_API_KEY=Deno.env.get('MUSE_SPARK_API_KEY')||'';
const MODEL=Deno.env.get('OPENAI_SITE_SCANNER_MODEL')||Deno.env.get('OPENAI_QUOTE_MODEL')||'claude-sonnet-4-20250514';
const BUCKET='business-office-files';
const ENGINE='web-video-reference-scale-v1';
const ORIGINS=new Set([
  'https://highway38solutions.com',
  'https://www.highway38solutions.com',
  'https://rkrueth-maker.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
]);

type J=Record<string,unknown>;
type C=any;
type Ref={id:string;label:string;valueInches:number;displayValue:string;unit:string;method:string};
type Frame={id:string;url:string;time:number};

const clean=(v:unknown,n=6000)=>String(v??'').replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [REDACTED]').slice(0,n);
const origin=(r:Request)=>String(r.headers.get('origin')||'').trim().replace(/\/+$/,'');
const headers=(r:Request):HeadersInit=>({
  'access-control-allow-origin':origin(r)||'*',
  'access-control-allow-headers':String(r.headers.get('access-control-request-headers')||'authorization, apikey, content-type, x-client-info'),
  'access-control-allow-methods':'POST, OPTIONS',
  'access-control-max-age':'600',
  'cache-control':'no-store',
  'content-type':'application/json; charset=utf-8',
  vary:'Origin, Access-Control-Request-Headers',
});
const reply=(r:Request,s:number,p:unknown)=>new Response(JSON.stringify(p),{status:s,headers:headers(r)});
const bearer=(r:Request)=>String(r.headers.get('authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1]?.trim()||'';

function db():C{
  if(!SUPABASE_URL||!SERVICE_KEY)throw Error('Supabase configuration unavailable.');
  return createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function readJson(res:Response):Promise<J>{
  const raw=await res.text();
  try{return raw?JSON.parse(raw):{}}catch{return{}}
}
async function signedInUser(r:Request){
  const token=bearer(r);
  if(!token)throw Error('Supabase Auth session is required.');
  const res=await fetch(`${SUPABASE_URL}/auth/v1/user`,{
    headers:{authorization:`Bearer ${token}`,apikey:SERVICE_KEY,'x-client-info':'h38-web-video-measurements-auth-v2'},
    signal:AbortSignal.timeout(15000),
  });
  const payload=await readJson(res);
  if(!res.ok||typeof payload.id!=='string'||!payload.id)throw Error('Supabase Auth session is invalid or expired.');
  return{id:payload.id as string};
}
async function requireMembership(c:C,userId:string,businessId:string){
  const q=await c.from('business_memberships').select('role,status').eq('business_id',businessId).eq('auth_user_id',userId).eq('status','active').maybeSingle();
  if(q.error)throw q.error;
  if(!q.data)throw Error('The signed-in account is not an active member of this business.');
  if(!['owner','administrator','staff'].includes(String(q.data.role)))throw Error('This role cannot create web video estimates.');
}
async function record(c:C,b:string,col:string,key:string){
  const q=await c.from('business_records').select('payload').eq('business_id',b).eq('collection',col).eq('record_key',key).eq('record_status','active').maybeSingle();
  if(q.error)throw q.error;
  return q.data?.payload&&typeof q.data.payload==='object'?q.data.payload as J:null;
}
async function save(c:C,b:string,u:string,col:string,key:string,payload:J){
  const old=await c.from('business_records').select('id').eq('business_id',b).eq('collection',col).eq('record_key',key).maybeSingle();
  if(old.error)throw old.error;
  if(old.data){
    const q=await c.from('business_records').update({payload,record_status:'active',updated_by:u}).eq('id',old.data.id);
    if(q.error)throw q.error;
  }else{
    const q=await c.from('business_records').insert({business_id:b,collection:col,record_key:key,payload,record_status:'active',created_by:u,updated_by:u});
    if(q.error)throw q.error;
  }
}
function inches(value:number,unit:string){
  const u=unit.toLowerCase().trim();
  if(u==='in'||u.startsWith('inch'))return value;
  if(['ft','foot','feet'].includes(u))return value*12;
  if(u==='cm')return value/2.54;
  if(u==='m')return value*39.3700787402;
  return 0;
}
function display(value:number){
  const eighths=Math.round(value*8),whole=Math.floor(eighths/8),rem=eighths%8,ft=Math.floor(whole/12),inch=whole%12;
  return `${ft} ft ${inch}${rem?` ${rem}/8`:''} in`;
}
async function references(c:C,b:string,sid:string):Promise<Ref[]>{
  const q=await c.from('business_records').select('record_key,payload').eq('business_id',b).eq('collection','mediaMeasurementReferences').eq('record_status','active').limit(100);
  if(q.error)throw q.error;
  return(q.data||[])
    .filter((r:any)=>clean(r.payload?.['Media Analysis Session ID'],180)===sid&&r.payload?.['Owner Confirmed']===true)
    .map((r:any)=>{
      const p=r.payload||{},v=inches(Number(p['Value']||0),clean(p['Unit'],20));
      return{id:String(r.record_key),label:clean(p['Label'],160),valueInches:v,displayValue:display(v),unit:clean(p['Unit'],20),method:clean(p['Verification Method'],120)};
    })
    .filter((x:Ref)=>x.valueInches>0)
    .slice(0,12);
}
async function frames(c:C,b:string,sid:string):Promise<Frame[]>{
  const q=await c.from('business_records').select('record_key,payload').eq('business_id',b).eq('collection','documents').eq('record_status','active').limit(1000);
  if(q.error)throw q.error;
  const out:Frame[]=[];
  for(const row of q.data||[]){
    const p=(row as any).payload||{};
    if(clean(p['Media Analysis Session ID'],180)!==sid||clean(p['Evidence Type'],100)!=='Media Review Frame')continue;
    const path=clean(p['Storage Path'],1200);
    if(!path.startsWith(`${b}/`))continue;
    const signed=await c.storage.from(clean(p['Storage Bucket']||BUCKET,100)).createSignedUrl(path,600);
    if(!signed.error&&signed.data?.signedUrl)out.push({id:String((row as any).record_key),url:signed.data.signedUrl,time:Number(p['Frame Time Seconds']||0)});
    if(out.length>=6)break;
  }
  return out;
}
function schema():J{
  const point={type:'object',additionalProperties:false,required:['x','y'],properties:{x:{type:'number',minimum:0,maximum:1},y:{type:'number',minimum:0,maximum:1}}};
  return{type:'object',additionalProperties:false,required:['observations'],properties:{observations:{type:'array',maxItems:24,items:{type:'object',additionalProperties:false,required:['frameIndex','targetLabel','targetDimension','referenceId','samePlane','referenceStart','referenceEnd','targetStart','targetEnd','confidence','evidenceNote'],properties:{frameIndex:{type:'integer',minimum:0,maximum:5},targetLabel:{type:'string'},targetDimension:{type:'string',enum:['width','height','length','depth']},referenceId:{type:'string'},samePlane:{type:'boolean'},referenceStart:point,referenceEnd:point,targetStart:point,targetEnd:point,confidence:{type:'number',minimum:0,maximum:1},evidenceNote:{type:'string'}}}}}};
}
function outputText(p:J){
  const _ch=(p.choices as J[]|undefined)?.[0];const _m=_ch?(_ch as J).message as J|undefined:undefined;if(_m&&typeof _m.content==="string"&&_m.content)return _m.content as string;
  if(typeof p.output_text==='string')return p.output_text;
  for(const o of Array.isArray(p.output)?p.output:[]){
    if(!o||typeof o!=='object')continue;
    for(const x of Array.isArray((o as J).content)?(o as J).content as any[]:[])if(x?.type==='output_text'&&typeof x.text==='string')return x.text;
  }
  return'';
}
const span=(a:J,b:J)=>Math.hypot(Number(b.x||0)-Number(a.x||0),Number(b.y||0)-Number(a.y||0));
const slug=(v:string)=>v.toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||'MEASURE';
function calculate(parsed:J,refs:Ref[],fs:Frame[]){
  const rm=new Map(refs.map(r=>[r.id,r])),raw:any[]=[];
  for(const x of Array.isArray(parsed.observations)?parsed.observations:[]){
    if(!x||typeof x!=='object')continue;
    const o=x as J,idx=Number(o.frameIndex),ref=rm.get(clean(o.referenceId,180));
    if(!ref||o.samePlane!==true||!Number.isInteger(idx)||idx<0||idx>=fs.length)continue;
    const referenceSpan=span(o.referenceStart as J,o.referenceEnd as J);
    const targetSpan=span(o.targetStart as J,o.targetEnd as J);
    if(referenceSpan<.025||targetSpan<.02)continue;
    const ratio=targetSpan/referenceSpan;
    if(!Number.isFinite(ratio)||ratio<.08||ratio>12)continue;
    const value=ref.valueInches*ratio;
    if(!(value>.5&&value<2400))continue;
    raw.push({
      label:clean(o.targetLabel,160),dimension:clean(o.targetDimension,40),valueInches:Math.round(value*8)/8,displayValue:display(value),
      source:'CAMERA_ESTIMATE',verificationStatus:'UNVERIFIED',method:'SAME_FRAME_REFERENCE_SCALE',
      confidence:Math.max(.3,Math.min(.72,Number(o.confidence||0)*.85)),frameIndex:idx,frameDocumentId:fs[idx].id,
      referenceId:ref.id,referenceLabel:ref.label,referenceValue:ref.displayValue,referenceMethod:ref.method,
      startPoint:{...(o.targetStart as J),coordinateSystem:'VIDEO_FRAME_NORMALIZED',frameDocumentId:fs[idx].id},
      endPoint:{...(o.targetEnd as J),coordinateSystem:'VIDEO_FRAME_NORMALIZED',frameDocumentId:fs[idx].id},
      evidenceNote:clean(o.evidenceNote,500),ownerReviewRequired:true,fieldVerificationRequired:true,
    });
  }
  const groups=new Map<string,any[]>();
  for(const estimate of raw){const key=`${estimate.label.toLowerCase()}|${estimate.dimension}`;groups.set(key,[...(groups.get(key)||[]),estimate]);}
  const results:any[]=[];
  for(const arr of groups.values()){
    arr.sort((a,b)=>a.valueInches-b.valueInches);
    const mid=arr[Math.floor(arr.length/2)];
    const spread=mid.valueInches?Math.abs(arr[arr.length-1].valueInches-arr[0].valueInches)/mid.valueInches:1;
    results.push({...mid,id:`WEB-VIDEO-${slug(mid.label)}-${slug(mid.dimension)}`,sampleCount:arr.length,agreementSpreadRatio:Math.round(spread*1000)/1000,conflictReviewRequired:spread>.12,confidence:Math.max(.3,Math.min(.72,mid.confidence-(spread>.12?.18:arr.length>1?-.04:0)))});
  }
  return results.slice(0,10);
}

Deno.serve(async r=>{
  if(r.method==='OPTIONS')return reply(r,200,{status:'PASS',preflight:true});
  if(r.method==='GET')return reply(r,200,{status:'PASS',function:'h38-web-video-measurements',engine:ENGINE,confirmedReferenceRequired:true,sameFrameRequired:true,samePlaneRequired:true,fieldVerificationRequired:true,measurementsVerified:false,automaticApproval:false,automaticCustomerSending:false});
  if(r.method!=='POST')return reply(r,405,{status:'FAIL',message:'POST required.'});
  const c=db();let b='',sid='',u='';
  try{
    if(!ORIGINS.has(origin(r)))return reply(r,403,{status:'FAIL',message:`Web video measurement origin is not approved: ${origin(r)||'missing origin'}.`});
    const body=await r.json() as J;
    b=clean(body.businessId,100);sid=clean(body.mediaSessionId,180);
    const targets=(Array.isArray(body.targets)?body.targets:[]).map(x=>clean(x,300)).filter(Boolean).slice(0,12);
    if(!b||!sid||!targets.length)throw Error('Business, media session, and measurement targets are required.');
    u=(await signedInUser(r)).id;
    await requireMembership(c,u,b);
    const session=await record(c,b,'mediaAnalysisSessions',sid);
    if(!session)throw Error('Media analysis session was not found.');
    const refs=await references(c,b,sid),reviewFrames=await frames(c,b,sid);
    if(!refs.length)return reply(r,200,{status:'PASS',engine:ENGINE,outcome:'NO_VERIFIED_REFERENCE',message:'Confirm one accurate reference dimension that is visible in the uploaded video before running distance estimates.',references:[],estimates:[],fieldVerificationRequired:true,measurementsVerified:false});
    if(!reviewFrames.length)return reply(r,200,{status:'PASS',engine:ENGINE,outcome:'NO_REVIEW_FRAMES',message:'No saved review frames are available for this uploaded video.',references:refs,estimates:[],fieldVerificationRequired:true,measurementsVerified:false});
    if(!MUSE_SPARK_API_KEY)throw Error('Muse Spark API key is not configured.');
    await aiCapCheck(c,b);
    const instructions=[
      'You are H38 internal web-video endpoint locator.',
      'Use only supplied owner-confirmed reference dimensions that are clearly visible in the SAME FRAME and on the SAME PHYSICAL PLANE as a requested target.',
      'Return normalized endpoints only. Never return or invent a dimension value; the server computes scale deterministically.',
      'Never infer scale across different walls, planes, camera positions, or separate frames.',
      'If perspective, occlusion, reference identity, or geometry is unreliable, omit the observation.',
      'Every result remains CAMERA_ESTIMATE and UNVERIFIED until field checked.',
    ].join(' ');
    const content:any[]=[{type:'text',text:JSON.stringify({targets,references:refs,policy:{sameFrameOnly:true,samePlaneOnly:true,serverComputesScale:true,fieldVerificationRequired:true}})}];
    reviewFrames.forEach((f,i)=>{content.push({type:'text',text:`FRAME ${i}, ${f.time}s, ${f.id}`});content.push({type:'image_url',image_url:{url:f.url}});});
    const res=await fetch('https://api.meta.ai/v1/chat/completions',{
      method:'POST',headers:{authorization:`Bearer ${MUSE_SPARK_API_KEY}`,'content-type':'application/json'},
      body:JSON.stringify({model:MODEL,max_tokens:4000,messages:[{role:'system',content:instructions},{role:'user',content}],response_format:{type:'json_schema',json_schema:{name:'h38_web_video_measurement_observations',strict:true,schema:schema()}}}),
      signal:AbortSignal.timeout(120000),
    });
    const payload=await readJson(res);
    await aiLogUsage(c,b,'h38-web-video-measurements',(payload as J).usage,MODEL);
    if(!res.ok)throw Error(clean((payload.error as J|undefined)?.message||payload.message||`Muse Spark returned ${res.status}.`,1200));
    const parsed=JSON.parse(outputText(payload)||'{"observations":[]}') as J;
    const estimates=calculate(parsed,refs,reviewFrames);
    for(const e of estimates){
      await save(c,b,u,'mediaMeasurements',`${sid}:${e.id}`,{
        'Media Measurement ID':`${sid}:${e.id}`,'Media Analysis Session ID':sid,'Customer ID':clean(session['Customer ID'],180),'Job ID':clean(session['Job ID'],180),
        'Label':e.label,'Measurement Type':e.dimension,'Value':e.valueInches,'Unit':'in','Display Value':e.displayValue,'Source':'CAMERA_ESTIMATE','Verification Status':'UNVERIFIED','Method':'SAME_FRAME_REFERENCE_SCALE','Confidence':e.confidence,'Frame Document ID':e.frameDocumentId,'Reference ID':e.referenceId,'Reference Label':e.referenceLabel,'Reference Value':e.referenceValue,'Reference Method':e.referenceMethod,'Sample Count':e.sampleCount,'Agreement Spread Ratio':e.agreementSpreadRatio,'Conflict Review Required':e.conflictReviewRequired,'Evidence Note':e.evidenceNote,'Owner Review Required':true,'Field Verification Required':true,'Automatic Approval':false,'Automatic Customer Sending':false,'Created Time':new Date().toISOString(),'Updated Time':new Date().toISOString()
      });
    }
    await c.from('business_proof_log').insert({business_id:b,actor_user_id:u,action_type:'WEB_MEDIA_VIDEO_MEASUREMENT_ESTIMATE',entity_type:'Media Analysis Session',entity_id:null,result:'PASS',details:{mediaSessionId:sid,engine:ENGINE,referenceCount:refs.length,frameCount:reviewFrames.length,targetCount:targets.length,estimateCount:estimates.length,exactDimensionsInvented:false,confirmedReferenceRequired:true,sameFrameRequired:true,samePlaneRequired:true,fieldVerificationRequired:true,measurementsVerified:false,automaticApproval:false,automaticCustomerSending:false},external_action_occurred:false});
    return reply(r,200,{status:'PASS',engine:ENGINE,outcome:estimates.length?'ESTIMATES_READY':'NO_RELIABLE_SAME_PLANE_ESTIMATE',message:estimates.length?`${estimates.length} camera estimate${estimates.length===1?' is':'s are'} ready for field verification.`:'No defensible same-plane estimate was produced from the selected frames and reference.',references:refs,frameCount:reviewFrames.length,estimates,ownerReviewRequired:true,fieldVerificationRequired:true,measurementsVerified:false,automaticApproval:false,automaticCustomerSending:false});
  }catch(e){
    const message=clean(e instanceof Error?e.message:e,1600);
    if(b)try{await c.from('business_error_log').insert({business_id:b,actor_user_id:u||null,source:'supabase/functions/h38-web-video-measurements',error_code:'WEB_VIDEO_MEASUREMENT_FAILED',message,severity:'error',status:'open',context:{mediaSessionId:sid,engine:ENGINE}});}catch{}
    return reply(r,/Auth session/i.test(message)?401:/active member|role cannot|origin/i.test(message)?403:400,{status:'FAIL',engine:ENGINE,message,measurementsVerified:false,automaticApproval:false,automaticCustomerSending:false});
  }
});
