(function(){
'use strict';
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
const Bridge=window.H38Bridge;
if(!cfg.enabled||!window.supabase||!Bridge||!Bridge.prototype)return;
const previousRequest=Bridge.prototype.request;
let db=null;
function text(value){return String(value==null?'':value);}
function client(){return db||(db=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},global:{headers:{'x-client-info':'h38-supabase-quote-ai-v4'}}}));}
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
async function quoteAi(args,timeout,requestAction){
  if(typeof window.sync==='function')await window.sync(false);
  const api=client();
  const {data,error}=await api.auth.getSession();
  if(error)throw error;
  const session=data.session;
  if(!session?.access_token)throw new Error('Sign in again before building the quote.');
  if(api.functions&&typeof api.functions.setAuth==='function')api.functions.setAuth(session.access_token);
  const timeoutMs=Math.max(30000,Number(timeout)||145000);
  let timer=null;
  try{
    const timeoutPromise=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Quote AI operation timed out. The saved quote and photos were not approved or sent.')),timeoutMs);});
    const invokePromise=api.functions.invoke('h38-quote-ai',{
      body:{action:requestAction||'buildQuote',...args},
      headers:{authorization:`Bearer ${session.access_token}`,'x-client-info':'h38-supabase-quote-ai-v4'}
    });
    const result=await Promise.race([invokePromise,timeoutPromise]);
    const payload=result&&result.data||{};
    if(result&&result.error)throw new Error(await functionError(result.error));
    if(payload.status!=='PASS')throw new Error(text(payload.message||'Quote AI operation did not complete.'));
    return payload;
  }finally{if(timer)clearTimeout(timer);}
}
function linesOf(payload){return Array.isArray(payload?.draft?.suggestedLines)?payload.draft.suggestedLines:[];}
function rateOf(line){const value=Number(line?.rate??line?.unitPrice??0);return Number.isFinite(value)?value:0;}
function zeroPriceLines(payload){return linesOf(payload).map((line,index)=>({line,index})).filter(item=>rateOf(item.line)<=0);}
function normalizeDescription(value){return text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function pricingRetryNotes(args,missing){
  const existing=text(args?.notes).trim();
  const targets=missing.map(({line,index})=>`Line ${index+1}: ${text(line?.description)} | quantity ${Number(line?.quantity||0)} ${text(line?.unit||'each')}`).join('\n');
  return [existing,
    'OWNER PRICING REQUIREMENT: Every quote line must have a current positive non-zero rate. Search the supplied Price Book first. For every line without an exact usable catalog price, use current web research for Grand Rapids / Itasca County, Minnesota contractor, labor, supplier, and material pricing. Derive a defensible installed or unit rate from current market evidence. Never return a $0 rate. Do not use zero as a placeholder. If an exact local figure is unavailable, use a conservative current regional market allowance and mark it local_research with low confidence. Preserve the requested work, quantities, and units while resolving pricing.',
    'UNPRICED LINES THAT MUST BE RESOLVED:',targets
  ].filter(Boolean).join('\n\n');
}
function patchMissingPrices(original,research){
  const originalLines=linesOf(original),researchLines=linesOf(research);
  const byDescription=new Map();
  researchLines.forEach(line=>{const key=normalizeDescription(line?.description);if(key&&rateOf(line)>0&&!byDescription.has(key))byDescription.set(key,line);});
  const patched=originalLines.map((line,index)=>{
    if(rateOf(line)>0)return line;
    const exact=byDescription.get(normalizeDescription(line?.description));
    const indexed=researchLines[index]&&rateOf(researchLines[index])>0?researchLines[index]:null;
    const priced=exact||indexed;
    if(!priced)return line;
    return {...line,rate:rateOf(priced),catalogId:text(priced?.catalogId||line?.catalogId),priceSource:text(priced?.priceSource||'local_research'),confidence:text(priced?.confidence||line?.confidence||'low'),rationale:text(priced?.rationale||line?.rationale||'Current web-researched market pricing used because no positive catalog rate was available.')};
  });
  return {...original,draft:{...(original?.draft||{}),suggestedLines:patched,pricingSummary:text(original?.draft?.pricingSummary||research?.draft?.pricingSummary)}};
}
async function buildPricedQuote(args,timeout){
  const first=await quoteAi(args||{},timeout,'buildQuote');
  const missing=zeroPriceLines(first);
  if(!missing.length)return first;
  const retryArgs={...(args||{}),notes:pricingRetryNotes(args||{},missing)};
  const researched=await quoteAi(retryArgs,timeout,'buildQuote');
  const patched=patchMissingPrices(first,researched);
  const unresolved=zeroPriceLines(patched);
  if(unresolved.length){
    const names=unresolved.slice(0,6).map(({line})=>text(line?.description||'Unpriced line')).join('; ');
    throw new Error(`H38 blocked a quote draft because current pricing could not be resolved for: ${names}. No $0 lines were loaded.`);
  }
  patched.internetPriceRepairApplied=true;
  patched.internetPriceRepairCount=missing.length;
  return patched;
}
Bridge.prototype.request=async function(action,args,timeout){
  if(action==='aiBuildQuoteDraft')return buildPricedQuote(args||{},timeout);
  if(action==='aiRenderQuoteConcept')return quoteAi(args||{},timeout,'renderConcept');
  return previousRequest.call(this,action,args,timeout);
};
window.H38_SUPABASE_QUOTE_AI={enabled:true,endpoint:'h38-quote-ai',transport:'supabase-functions-invoke',authentication:'supabase-jwt',priceBookFirst:true,localResearchFallback:true,internetPriceRepair:true,zeroPriceBlocked:true,preservesFirstPassQuantities:true,renderConcept:true,separateRenderRequest:true,ownerReviewRequired:true,automaticApproval:false,automaticSending:false};
})();
