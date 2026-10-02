(function(){
'use strict';
// H38 AI handoff: route async AI work to Kit (Muse) via ai_handoff_tasks.
// The app writes a pending row; Kit claims it, does the work, writes back result.
// Nothing executes automatically. Falls back gracefully when the table is absent.
const BUILD='20261002-ai-handoff-1';
const POLL_MS=4000, TIMEOUT_MS=300000;
const text=(v,n=12000)=>String(v??'').trim().slice(0,n);
function client(){const c=window.H38_SUPABASE_SHARED_CLIENT?.ensure?.();if(c)return c;const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};if(!cfg.url||!cfg.publishableKey||!window.supabase)throw Error('Secure Business Office connection is unavailable.');return window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});}
async function auth(){const api=client();const r=await api.auth.getSession();if(r.error)throw r.error;const s=r.data?.session;if(!s?.access_token)throw Error('Sign in again.');return s;}
async function submitTask(taskType,payload){
  const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{},s=await auth(),businessId=text(payload.businessId,180);
  if(!businessId)throw Error('Business is required for AI handoff.');
  const res=await fetch(`${cfg.url}/rest/v1/ai_handoff_tasks`,{method:'POST',headers:{authorization:`Bearer ${s.access_token}`,apikey:cfg.publishableKey,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify({business_id:businessId,task_type:taskType,payload,status:'pending'})});
  if(res.status===404)throw Object.assign(Error('AI handoff table is not deployed yet.'),{code:'HANDOFF_NOT_DEPLOYED'});
  if(!res.ok)throw Error(`AI handoff submit failed (${res.status}).`);
  const rows=await res.json().catch(()=>[]);
  if(!rows[0]?.id)throw Error('AI handoff task was not created.');
  return rows[0].id;
}
async function waitForResult(taskId,opts){
  const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{},s=await auth(),deadline=Date.now()+(opts?.timeoutMs||TIMEOUT_MS);
  while(Date.now()<deadline){
    await new Promise(r=>setTimeout(r,POLL_MS));
    const res=await fetch(`${cfg.url}/rest/v1/ai_handoff_tasks?id=eq.${encodeURIComponent(taskId)}&select=status,result,last_error`,{headers:{authorization:`Bearer ${s.access_token}`,apikey:cfg.publishableKey}});
    if(!res.ok)throw Error(`AI handoff poll failed (${res.status}).`);
    const rows=await res.json().catch(()=>[]),row=rows[0];
    if(!row)throw Error('AI handoff task disappeared.');
    if(row.status==='done')return row.result||{};
    if(row.status==='failed'||row.status==='cancelled')throw Error(text(row.last_error,500)||'Kit could not complete the task.');
  }
  throw Error('Timed out waiting for Kit. Try again.');
}
async function runTask(taskType,payload,opts){
  const taskId=await submitTask(taskType,payload);
  if(typeof opts?.onQueued==='function')opts.onQueued(taskId);
  return waitForResult(taskId,opts);
}
window.H38_AI_HANDOFF=Object.freeze({build:BUILD,submitTask,waitForResult,runTask});
})();
