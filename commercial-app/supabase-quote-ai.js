(function(){
'use strict';
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
const Bridge=window.H38Bridge;
if(!cfg.enabled||!window.supabase||!Bridge||!Bridge.prototype)return;
const previousRequest=Bridge.prototype.request;
let db=null;
function text(value){return String(value==null?'':value);}
function client(){return db||(db=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},global:{headers:{'x-client-info':'h38-supabase-quote-ai'}}}));}
async function quoteAi(args,timeout){
  if(typeof window.sync==='function')await window.sync(false);
  const {data,error}=await client().auth.getSession();
  if(error)throw error;
  const session=data.session;
  if(!session?.access_token)throw new Error('Sign in again before building the quote.');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),Math.max(30000,Number(timeout)||180000));
  try{
    const response=await fetch(`${cfg.url}/functions/v1/h38-quote-ai`,{
      method:'POST',
      headers:{
        authorization:`Bearer ${session.access_token}`,
        apikey:cfg.publishableKey,
        'content-type':'application/json',
        'x-client-info':'h38-supabase-quote-ai'
      },
      body:JSON.stringify({action:'buildQuote',...args}),
      signal:controller.signal
    });
    const raw=await response.text();
    let payload={};
    try{payload=raw?JSON.parse(raw):{};}catch(error){throw new Error(`Quote AI returned an unreadable response (${response.status}).`);}
    if(!response.ok||payload.status!=='PASS')throw new Error(text(payload.message||`Quote AI failed (${response.status}).`));
    return payload;
  }catch(error){
    if(error&&error.name==='AbortError')throw new Error('Quote AI timed out. The saved draft and photos were not approved or sent.');
    throw error;
  }finally{clearTimeout(timer);}
}
Bridge.prototype.request=async function(action,args,timeout){
  if(action==='aiBuildQuoteDraft')return quoteAi(args||{},timeout);
  return previousRequest.call(this,action,args,timeout);
};
window.H38_SUPABASE_QUOTE_AI={enabled:true,endpoint:'h38-quote-ai',authentication:'supabase-jwt',priceBookFirst:true,localResearchFallback:true,ownerReviewRequired:true,automaticApproval:false,automaticSending:false};
})();