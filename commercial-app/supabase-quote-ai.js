(function(){
'use strict';
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
const Bridge=window.H38Bridge;
if(!cfg.enabled||!window.supabase||!Bridge||!Bridge.prototype)return;
const previousRequest=Bridge.prototype.request;
let db=null;
const missingCostCache=window.H38_QUOTE_MISSING_COST_CACHE&&typeof window.H38_QUOTE_MISSING_COST_CACHE==='object'?window.H38_QUOTE_MISSING_COST_CACHE:Object.create(null);
window.H38_QUOTE_MISSING_COST_CACHE=missingCostCache;
function text(value){return String(value==null?'':value);}
function valueOf(row,...keys){for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';}
function snapshotRows(collection){const rows=window.state?.snapshot?.[collection];return Array.isArray(rows)?rows:[];}
function compactMeasurement(row){
  const value=Number(valueOf(row,'Value','value'));
  const label=text(valueOf(row,'Label','label')).trim();
  if(!label||!Number.isFinite(value)||value<=0)return null;
  return{
    measurementId:text(valueOf(row,'Site Measurement ID','measurementId','Measurement ID')),
    label,
    value,
    unit:text(valueOf(row,'Unit','unit')||'in'),
    source:text(valueOf(row,'Source','source')),
    verificationStatus:text(valueOf(row,'Verification Status','verificationStatus')||'UNVERIFIED'),
    notes:text(valueOf(row,'Notes','notes'))
  };
}
function linkedMeasurementEvidence(args){
  const supplied=Array.isArray(args?.measurementEvidence)?args.measurementEvidence.map(compactMeasurement).filter(Boolean).slice(0,80):[];
  if(supplied.length)return supplied;
  const quoteId=text(args?.quoteId).trim();
  if(!quoteId)return[];
  const quote=snapshotRows('quotes').find(row=>text(valueOf(row,'Quote ID','quoteId'))===quoteId);
  const sessionId=text(valueOf(quote,'Site Scanner Session ID','siteScannerSessionId')).trim();
  if(!sessionId)return[];
  const rows=[...snapshotRows('siteMeasurements'),...snapshotRows('measurements')];
  const seen=new Set();
  return rows.filter(row=>text(valueOf(row,'Capture Session ID','captureSessionId'))===sessionId).map(compactMeasurement).filter(Boolean).filter(row=>{
    const key=[row.measurementId,row.label,row.value,row.unit,row.source,row.verificationStatus].join('|');
    if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,80);
}
function withMeasurementEvidence(args){
  const prepared={...(args||{})};
  const evidence=linkedMeasurementEvidence(prepared);
  if(evidence.length)prepared.measurementEvidence=evidence;
  return prepared;
}
function client(){return db||(db=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},global:{headers:{'x-client-info':'h38-supabase-quote-ai-v6'}}}));}
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
      headers:{authorization:`Bearer ${session.access_token}`,'x-client-info':'h38-supabase-quote-ai-v6'}
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
function quantityOf(line){const value=Number(line?.quantity??0);return Number.isFinite(value)?value:0;}
function zeroPriceLines(payload){return linesOf(payload).map((line,index)=>({line,index})).filter(item=>rateOf(item.line)<=0);}
function invalidQuantityLines(payload){return linesOf(payload).map((line,index)=>({line,index})).filter(item=>quantityOf(item.line)<=0);}
function normalizeDescription(value){return text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function normalizeUnit(value){
  const unit=text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const aliases={
    ea:'each',each:'each',item:'each',items:'each',
    hr:'hour',hrs:'hour',hour:'hour',hours:'hour',
    ft:'foot',foot:'foot',feet:'foot',
    lf:'linear foot','lin ft':'linear foot','linear ft':'linear foot','linear foot':'linear foot','linear feet':'linear foot',
    in:'inch',inch:'inch',inches:'inch',
    sf:'square foot','sq ft':'square foot','sq foot':'square foot','square ft':'square foot','square foot':'square foot','square feet':'square foot',
    sy:'square yard','sq yd':'square yard','square yard':'square yard','square yards':'square yard',
    cy:'cubic yard','cu yd':'cubic yard','cubic yard':'cubic yard','cubic yards':'cubic yard',
    yd:'yard',yard:'yard',yards:'yard',
    lb:'pound',lbs:'pound',pound:'pound',pounds:'pound',
    gal:'gallon',gallon:'gallon',gallons:'gallon',
    ton:'ton',tons:'ton',day:'day',days:'day',
    ls:'lump sum','lump sum':'lump sum'
  };
  return aliases[unit]||unit;
}
function sameUnitBasis(a,b){const left=normalizeUnit(a),right=normalizeUnit(b);return !!left&&left===right;}
const COST_STOP_WORDS=new Set(['and','the','for','with','from','into','per','each','all','job','work','labor','material','materials','install','installation','provide','supply']);
function descriptionWords(value){return new Set(normalizeDescription(value).split(' ').filter(word=>word.length>2&&!COST_STOP_WORDS.has(word)));}
function sameCostDescription(a,b){
  const left=normalizeDescription(a),right=normalizeDescription(b);
  if(!left||!right)return false;
  if(left===right||left.includes(right)||right.includes(left))return true;
  const A=descriptionWords(left),B=descriptionWords(right);
  if(!A.size||!B.size)return false;
  let common=0;A.forEach(word=>{if(B.has(word))common+=1;});
  return common/Math.min(A.size,B.size)>=0.67||common/Math.max(A.size,B.size)>=0.5;
}
function findPricedMatch(line,researchLines){
  const description=normalizeDescription(line?.description),unit=normalizeUnit(line?.unit);
  if(!description||!unit)return null;
  const exact=researchLines.filter(candidate=>rateOf(candidate)>0&&sameUnitBasis(line?.unit,candidate?.unit)&&normalizeDescription(candidate?.description)===description);
  if(exact.length===1)return exact[0];
  if(exact.length>1)return null;
  const fuzzy=researchLines.filter(candidate=>rateOf(candidate)>0&&sameUnitBasis(line?.unit,candidate?.unit)&&sameCostDescription(line?.description,candidate?.description));
  return fuzzy.length===1?fuzzy[0]:null;
}
function pricingRetryNotes(args,missing){
  const existing=text(args?.notes).trim();
  const targets=missing.map(({line,index})=>`Line ${index+1}: ${text(line?.description)} | quantity ${quantityOf(line)} ${text(line?.unit||'each')}`).join('\n');
  return [existing,
    'OWNER PRICING REQUIREMENT: Every quote line must have a current positive non-zero rate. Search the supplied Price Book first. For every line without an exact usable catalog price, use current web research for Grand Rapids / Itasca County, Minnesota contractor, labor, supplier, and material pricing. Derive a defensible installed or unit rate from current market evidence. Never return a $0 rate. Do not use zero as a placeholder. If an exact local figure is unavailable, use a conservative current regional market allowance and mark it local_research with low confidence. Preserve the requested work, quantities, and units while resolving pricing. Return the same unit basis for each researched line so the researched rate cannot be applied to a different unit.',
    'UNPRICED LINES THAT MUST BE RESOLVED:',targets
  ].filter(Boolean).join('\n\n');
}
function patchMissingPrices(original,research){
  const originalLines=linesOf(original),researchLines=linesOf(research);
  const patched=originalLines.map(line=>{
    if(rateOf(line)>0)return line;
    const priced=findPricedMatch(line,researchLines);
    if(!priced)return line;
    const source=text(priced?.priceSource)==='price_book'?'price_book':'local_research';
    return {...line,rate:rateOf(priced),catalogId:text(priced?.catalogId||line?.catalogId),priceSource:source,confidence:text(priced?.confidence||line?.confidence||'low'),rationale:text(priced?.rationale||line?.rationale||'Current web-researched market pricing used because no positive catalog rate was available.')};
  });
  return {...original,draft:{...(original?.draft||{}),suggestedLines:patched,pricingSummary:text(original?.draft?.pricingSummary||research?.draft?.pricingSummary)}};
}
async function buildPricedQuoteCore(args,timeout){
  const prepared=withMeasurementEvidence(args||{});
  const first=await quoteAi(prepared,timeout,'buildQuote');
  const invalidQuantities=invalidQuantityLines(first);
  if(invalidQuantities.length){
    const names=invalidQuantities.slice(0,6).map(({line})=>text(line?.description||'Invalid quantity line')).join('; ');
    throw new Error(`H38 blocked a quote draft because these lines do not have a positive quantity: ${names}. Verify the needed measurement or quantity before pricing.`);
  }
  const missing=zeroPriceLines(first);
  if(!missing.length)return first;
  const retryArgs={...prepared,notes:pricingRetryNotes(prepared,missing)};
  const researched=await quoteAi(retryArgs,timeout,'buildQuote');
  const patched=patchMissingPrices(first,researched);
  const unresolved=zeroPriceLines(patched);
  if(unresolved.length){
    const names=unresolved.slice(0,6).map(({line})=>text(line?.description||'Unpriced line')).join('; ');
    throw new Error(`H38 blocked a quote draft because current pricing could not be safely matched for: ${names}. No $0 or mismatched-unit lines were loaded.`);
  }
  patched.internetPriceRepairApplied=true;
  patched.internetPriceRepairCount=missing.length;
  return patched;
}
function estimateFromLines(lines){
  return lines.map((line,index)=>({quoteLineId:text(line?.quoteLineId||`AI-LINE-${index+1}`),description:text(line?.description),quantity:quantityOf(line),unit:text(line?.unit||'each'),unitPrice:rateOf(line),extendedPrice:quantityOf(line)*rateOf(line),priceSource:text(line?.priceSource),priceStatus:'Owner review required'}));
}
function costAuditNotes(args,baseLines){
  const existing=text(args?.notes).trim();
  const baseline=baseLines.map((line,index)=>`${index+1}. ${text(line?.description)} | ${quantityOf(line)} ${text(line?.unit||'each')} | ${rateOf(line)}`).join('\n');
  return [existing,
    'OWNER COST GAP AUDIT ONLY: The CURRENT ESTIMATE below is already included in the draft. Preserve every existing line, description, quantity, unit, and rate. Do not delete, reduce, replace, merge, or reprice those lines. Review the project scope, photos, measurements, site conditions, work sequence, and current estimate for plausible project expenses that may have been omitted. Append only likely missing expense candidates after the preserved current estimate. Do not invent new customer scope. Typical checks may include delivery or mobilization, disposal or dump fees, fasteners and consumables, equipment or rental, protection and cleanup, waste allowance, permit or inspection fees when relevant, subcontract work, access costs, restoration, and overhead or jobsite support when not already represented. Every appended candidate must have a current positive non-zero rate and positive quantity: Price Book first, then current web research for Grand Rapids / Itasca County, Minnesota; if exact local pricing is unavailable use a conservative current regional market allowance with low confidence. If a candidate cannot be priced above zero or does not have a defensible positive quantity, omit it. These candidates are OWNER-ONLY suggestions and must never be automatically added, approved, saved, or shown on the customer proposal. If no likely cost is missing, return the preserved current estimate with no extra lines.',
    'CURRENT ESTIMATE TO PRESERVE EXACTLY:',baseline
  ].filter(Boolean).join('\n\n');
}
function extractMissingCostSuggestions(base,audit){
  const baseline=linesOf(base),reviewed=linesOf(audit),seen=[];
  return reviewed.filter(line=>{
    if(rateOf(line)<=0||quantityOf(line)<=0||!text(line?.description).trim())return false;
    if(baseline.some(existing=>sameCostDescription(existing?.description,line?.description)))return false;
    if(seen.some(existing=>sameCostDescription(existing?.description,line?.description)))return false;
    seen.push(line);return true;
  }).slice(0,8).map((line,index)=>({
    suggestionId:`MISSING-COST-${index+1}-${normalizeDescription(line?.description).replace(/\s+/g,'-').slice(0,36)}`,
    description:text(line?.description||'Possible missing expense'),
    reason:text(line?.rationale||'H38 found this cost may be needed to complete the described work and did not find an equivalent line in the current draft.'),
    quantity:quantityOf(line),
    unit:text(line?.unit||'each'),
    rate:rateOf(line),
    catalogId:text(line?.catalogId),
    priceSource:text(line?.priceSource||'local_research'),
    confidence:text(line?.confidence||'low'),
    decision:'PENDING'
  }));
}
async function addOwnerMissingCostAudit(base,args,timeout){
  const quoteId=text(args?.quoteId);
  try{
    const baseline=linesOf(base);
    if(!baseline.length){if(quoteId)missingCostCache[quoteId]=[];return {...base,draft:{...(base?.draft||{}),possibleMissingCosts:[]},ownerMissingCostAuditStatus:'NO_BASE_LINES',ownerMissingCostSuggestionCount:0};}
    const auditArgs={...(args||{}),currentEstimate:estimateFromLines(baseline),notes:costAuditNotes(args||{},baseline)};
    const audited=await buildPricedQuoteCore(auditArgs,timeout);
    const suggestions=extractMissingCostSuggestions(base,audited);
    if(quoteId)missingCostCache[quoteId]=suggestions;
    return {...base,draft:{...(base?.draft||{}),possibleMissingCosts:suggestions},ownerMissingCostAuditStatus:'PASS',ownerMissingCostSuggestionCount:suggestions.length};
  }catch(error){
    if(quoteId)missingCostCache[quoteId]=[];
    return {...base,draft:{...(base?.draft||{}),possibleMissingCosts:[]},ownerMissingCostAuditStatus:'UNAVAILABLE',ownerMissingCostSuggestionCount:0,ownerMissingCostAuditMessage:text(error?.message||error)};
  }
}
async function buildPricedQuote(args,timeout){
  const priced=await buildPricedQuoteCore(args||{},timeout);
  return addOwnerMissingCostAudit(priced,args||{},timeout);
}
Bridge.prototype.request=async function(action,args,timeout){
  if(action==='aiBuildQuoteDraft')return buildPricedQuote(args||{},timeout);
  if(action==='aiRenderQuoteConcept')return quoteAi(args||{},timeout,'renderConcept');
  return previousRequest.call(this,action,args,timeout);
};
window.H38_SUPABASE_QUOTE_AI={enabled:true,endpoint:'h38-quote-ai',transport:'supabase-functions-invoke',authentication:'supabase-jwt',priceBookFirst:true,localResearchFallback:true,internetPriceRepair:true,zeroPriceBlocked:true,nonPositiveQuantityBlocked:true,pricingMatchRequiresDescriptionAndUnit:true,preservesFirstPassQuantities:true,structuredMeasurementEvidence:true,linkedSiteVisitMeasurementHydration:true,ownerMissingCostAudit:true,ownerMissingCostChoices:true,missingCostsNeverAutoAdded:true,renderConcept:true,separateRenderRequest:true,ownerReviewRequired:true,automaticApproval:false,automaticSending:false};
})();
