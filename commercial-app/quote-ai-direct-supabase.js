(function(){
'use strict';
const BUILD='20260807-0525';
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
if(!cfg.enabled||!window.supabase)return;
let db=null;
const text=v=>String(v==null?'':v);
function client(){return db||(db=window.H38_SUPABASE_SHARED_CLIENT?.ensure?.()||window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},global:{headers:{'x-client-info':'h38-direct-quote-ai-v1'}}}));}
async function detail(error){const context=error&&error.context;if(context&&typeof context.clone==='function'){try{const payload=await context.clone().json();return text(payload?.message||payload?.error||error?.message||error);}catch(ignore){}}return text(error?.message||error||'Quote AI request failed.');}
async function session(){const api=client();let result=await api.auth.getSession();if(result.error)throw result.error;let current=result.data?.session||null;const expires=Number(current?.expires_at||0)*1000;if(!current?.access_token||!expires||expires-Date.now()<120000){const refreshed=await api.auth.refreshSession();if(refreshed.error)throw refreshed.error;current=refreshed.data?.session||null;}if(!current?.access_token)throw new Error('Sign in again before building the quote. Your draft remains saved.');return current;}
async function request(args,timeout){const api=client();const auth=await session();if(api.functions&&typeof api.functions.setAuth==='function')api.functions.setAuth(auth.access_token);const timeoutMs=Math.max(30000,Number(timeout)||180000);let timer;try{const invoke=api.functions.invoke('h38-quote-ai',{body:{action:'buildQuote',...(args||{})},headers:{authorization:`Bearer ${auth.access_token}`,'x-client-info':'h38-direct-quote-ai-v1'}});const timeoutPromise=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Quote AI timed out. The current draft was preserved.')),timeoutMs);});const result=await Promise.race([invoke,timeoutPromise]);if(result?.error)throw new Error(await detail(result.error));const payload=result?.data||{};if(payload.status!=='PASS')throw new Error(text(payload.message||'Quote AI did not return a completed draft.'));return payload;}finally{if(timer)clearTimeout(timer);}}
function install(){window.state=window.state||{};const previous=window.state.bridge&&typeof window.state.bridge.request==='function'?window.state.bridge.request.bind(window.state.bridge):null;window.state.bridge={request(action,args,timeout){if(action==='aiBuildQuoteDraft')return request(args,timeout);if(previous)return previous(action,args,timeout);throw new Error(`Unsupported secure Office action: ${action}`);}};window.state.bridgeReady=true;}
install();
window.H38_DIRECT_QUOTE_AI=Object.freeze({enabled:true,build:BUILD,transport:'supabase-functions-invoke',endpoint:'h38-quote-ai',automaticApproval:false,automaticSending:false,request});
})();
