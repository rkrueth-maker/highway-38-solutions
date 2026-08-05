(function(){
'use strict';
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
const Bridge=window.H38Bridge;
if(!cfg.enabled||!window.supabase||!Bridge||!Bridge.prototype)return;
const previousRequest=Bridge.prototype.request;
let db=null;
function text(value){return String(value==null?'':value);}
function client(){return db||(db=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},global:{headers:{'x-client-info':'h38-supabase-quote-ai-v2'}}}));}
async function functionError(error){
  let detail='';
  const context=error&&error.context;
  if(context&&typeof context.clone==='function'){
    try{
      const payload=await context.clone().json();
      detail=text(payload&&payload.message||payload&&payload.error||'');
    }catch(ignore){}
  }
  return detail||text(error&&error.message||error||'Quote AI request failed.');
}
async function quoteAi(args,timeout){
  if(typeof window.sync==='function')await window.sync(false);
  const api=client();
  const {data,error}=await api.auth.getSession();
  if(error)throw error;
  const session=data.session;
  if(!session?.access_token)throw new Error('Sign in again before building the quote.');
  if(api.functions&&typeof api.functions.setAuth==='function')api.functions.setAuth(session.access_token);
  const timeoutMs=Math.max(30000,Number(timeout)||180000);
  let timer=null;
  try{
    const timeoutPromise=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Quote AI timed out. The saved draft and photos were not approved or sent.')),timeoutMs);});
    const invokePromise=api.functions.invoke('h38-quote-ai',{
      body:{action:'buildQuote',...args},
      headers:{authorization:`Bearer ${session.access_token}`,'x-client-info':'h38-supabase-quote-ai-v2'}
    });
    const result=await Promise.race([invokePromise,timeoutPromise]);
    const payload=result&&result.data||{};
    if(result&&result.error)throw new Error(await functionError(result.error));
    if(payload.status!=='PASS')throw new Error(text(payload.message||'Quote AI did not return a completed draft.'));
    return payload;
  }finally{if(timer)clearTimeout(timer);}
}
Bridge.prototype.request=async function(action,args,timeout){
  if(action==='aiBuildQuoteDraft')return quoteAi(args||{},timeout);
  return previousRequest.call(this,action,args,timeout);
};
window.H38_SUPABASE_QUOTE_AI={enabled:true,endpoint:'h38-quote-ai',transport:'supabase-functions-invoke',authentication:'supabase-jwt',priceBookFirst:true,localResearchFallback:true,ownerReviewRequired:true,automaticApproval:false,automaticSending:false};
})();