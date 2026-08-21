(function(){
'use strict';
const BUILD='20260821-quote-runtime-authority-1';
const Bridge=window.H38Bridge;
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
const shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!Bridge||!Bridge.prototype||!cfg.enabled||!window.supabase)return;
const previousRequest=Bridge.prototype.request;
const inflight=Object.create(null);
const directionCache=window.H38_QUOTE_DIRECTION_CACHE&&typeof window.H38_QUOTE_DIRECTION_CACHE==='object'?window.H38_QUOTE_DIRECTION_CACHE:Object.create(null);
window.H38_QUOTE_DIRECTION_CACHE=directionCache;
const text=value=>String(value==null?'':value);
const val=(row,...keys)=>{const source=row?.payload&&typeof row.payload==='object'?row.payload:row;for(const key of keys){if(source&&source[key]!==undefined&&source[key]!==null&&source[key]!=='')return source[key];}return'';};
const number=value=>{const n=Number(value==null?0:value);return Number.isFinite(n)?n:0;};
const authLike=value=>/401|auth|session|jwt|token|sign in/i.test(text(value));
const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
const quoteIdOf=row=>text(val(row,'Quote ID','quoteId')).trim();
const sessionIdOf=row=>text(val(row,'Capture Session ID','captureSessionId')).trim();
const verifiedStatuses=new Set(['FIELD_MEASURED_AND_CHECKED','FIELD_MEASURED','OPERATOR_VERIFIED','FIELD_VERIFIED','VERIFIED_BY_OPERATOR','VERIFIED']);
function requestId(){try{return crypto.randomUUID();}catch(_){return`${Date.now()}-${Math.random().toString(16).slice(2)}`;}}
function quoteRecord(quoteId){return rows('quotes').find(row=>quoteIdOf(row)===text(quoteId))||null;}
function compactMeasurement(row){
  const value=number(val(row,'Value','value'));
  const label=text(val(row,'Label','label')).trim();
  if(!label||value<=0)return null;
  return{measurementId:text(val(row,'Site Measurement ID','measurementId','Measurement ID')),label,value,unit:text(val(row,'Unit','unit')||'in'),source:text(val(row,'Source','source')),verificationStatus:text(val(row,'Verification Status','verificationStatus')||'UNVERIFIED').toUpperCase(),notes:text(val(row,'Notes','notes'))};
}
function localMeasurements(args){
  const quoteId=text(args?.quoteId).trim(),quote=quoteRecord(quoteId),sessionId=text(val(quote,'Site Scanner Session ID','siteScannerSessionId')).trim();
  const supplied=[...(Array.isArray(args?.measurementEvidence)?args.measurementEvidence:[]),...(Array.isArray(args?.siteMeasurements)?args.siteMeasurements:[])];
  const candidates=[...supplied,...rows('siteMeasurements').filter(row=>quoteIdOf(row)===quoteId||(sessionId&&sessionIdOf(row)===sessionId))];
  const seen=new Set();
  return candidates.map(compactMeasurement).filter(Boolean).filter(item=>{const key=[item.measurementId,item.label,item.value,item.unit,item.source,item.verificationStatus].join('|');if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>(verifiedStatuses.has(b.verificationStatus)?1:0)-(verifiedStatuses.has(a.verificationStatus)?1:0)).slice(0,80);
}
async function liveMeasurements(api,args){
  const businessId=text(args?.businessId||window.state?.businessId).trim(),quoteId=text(args?.quoteId).trim(),quote=quoteRecord(quoteId),sessionId=text(val(quote,'Site Scanner Session ID','siteScannerSessionId')).trim();
  if(!businessId||!quoteId)return[];
  try{
    const result=await api.from('business_records').select('record_key,payload,updated_at').eq('business_id',businessId).eq('collection','siteMeasurements').eq('record_status','active').order('updated_at',{ascending:false}).limit(500);
    if(result.error)throw result.error;
    const seen=new Set();
    return(result.data||[]).map(row=>row?.payload||{}).filter(row=>quoteIdOf(row)===quoteId||(sessionId&&sessionIdOf(row)===sessionId)).map(compactMeasurement).filter(Boolean).filter(item=>{const key=[item.measurementId,item.label,item.value,item.unit,item.source,item.verificationStatus].join('|');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,80);
  }catch(error){console.warn('[H38 Quote authority] live measurement hydration unavailable',error);return[];}
}
function policyText(){return[
  'H38 QUOTE POLICY: Keep every price, quantity, option and visual owner-review required.',
  'System policy is not project scope and must never add a trade or material that is absent from the project title, current scope, owner work request, Site Visit evidence or current estimate.',
  'Use field-verified measurements as the highest measurement authority. Do not ask again for a field-verified dimension.',
  'Keep uncertain pricing or quantity as an editable owner-review item instead of blocking the entire draft.',
  'Never approve, send, purchase, pay, schedule or financially commit automatically.'
].join('\n');}
function ownerWorkRequest(args){
  const explicit=text(args?.ownerWorkRequest).trim();if(explicit)return explicit;
  const notes=text(args?.notes).trim();
  if(!notes)return'';
  if(/OWNER-ONLY SITE VISIT CONTEXT|Field notes:|Owner scope confirmations:|Walkthrough customer requests:/i.test(notes))return notes;
  if(!/QUOTE COST BREAKOUT REQUIREMENT|SYSTEM QUOTE POLICY/i.test(notes))return notes;
  return'';
}
async function validSession(forceRefresh){
  const api=shared?.ensure?.()||window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},global:{headers:{'x-client-info':BUILD}}});
  let result=await api.auth.getSession();
  if(result.error)throw result.error;
  let session=result.data?.session||null;
  if(!session)throw new Error('Sign in again before building the quote.');
  const expiresSoon=Number(session.expires_at||0)*1000<=Date.now()+120000;
  if(forceRefresh||expiresSoon){
    const refreshed=await api.auth.refreshSession();
    if(refreshed.error||!refreshed.data?.session)throw new Error(refreshed.error?.message||'Secure session could not be refreshed. Sign in again.');
    session=refreshed.data.session;
  }
  let verified=await api.auth.getUser(session.access_token);
  if((verified.error||!verified.data?.user)&&!forceRefresh){
    const refreshed=await api.auth.refreshSession();
    if(!refreshed.error&&refreshed.data?.session){session=refreshed.data.session;verified=await api.auth.getUser(session.access_token);}
  }
  if(verified.error||!verified.data?.user)throw new Error(verified.error?.message||'Secure session is invalid. Sign in again.');
  return{api,session,user:verified.data.user};
}
async function payload(response){const raw=await response.text();if(!raw)return{};try{return JSON.parse(raw);}catch(_){return{status:'FAIL',message:`H38 returned unreadable data (${response.status}).`};}}
async function post(endpoint,action,args,timeout,forceRefresh){
  const auth=await validSession(forceRefresh),id=requestId(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(30000,Number(timeout)||180000));
  try{
    const response=await fetch(`${cfg.url}/functions/v1/${endpoint}`,{method:'POST',mode:'cors',cache:'no-store',credentials:'omit',headers:{Authorization:`Bearer ${auth.session.access_token}`,apikey:cfg.publishableKey,'Content-Type':'application/json','x-client-info':BUILD,'x-h38-request-id':id},body:JSON.stringify({action,...(args||{}),requestId:id,clientRuntimeBuild:BUILD}),signal:controller.signal});
    const data=await payload(response);
    if(!response.ok||data.status!=='PASS'){const error=new Error(text(data.message||`${endpoint} failed (${response.status}).`));error.status=response.status;throw error;}
    return data;
  }finally{clearTimeout(timer);}
}
async function oneRetry(endpoint,action,args,timeout){
  try{return await post(endpoint,action,args,timeout,false);}catch(error){if(!authLike(error?.message||error)||error?.__h38Retried)throw error;try{return await post(endpoint,action,args,timeout,true);}catch(second){second.__h38Retried=true;throw second;}}
}
async function prepareBuild(args){
  if(typeof window.sync==='function')await window.sync(false);
  const prepared={...(args||{})};
  prepared.businessId=text(prepared.businessId||window.state?.businessId).trim();
  const quote=quoteRecord(prepared.quoteId);
  prepared.projectTitle=text(prepared.projectTitle||val(quote,'Project Title','projectTitle')).trim();
  prepared.scope=text(prepared.scope||val(quote,'Scope','scope')).trim();
  prepared.ownerWorkRequest=ownerWorkRequest(prepared);
  prepared.systemQuotePolicy=policyText();
  delete prepared.notes;
  let evidence=localMeasurements(prepared);
  try{const auth=await validSession(false),live=await liveMeasurements(auth.api,prepared);if(live.length)evidence=live;}catch(_){}
  if(evidence.length){prepared.measurementEvidence=evidence;prepared.siteMeasurements=evidence;}
  prepared.userInitiated=true;
  return prepared;
}
function normalizedLine(line,index,scope){
  const description=text(line?.description||`Owner review — ${scope||'project work'}`).trim();
  let quantity=number(line?.quantity);if(quantity<=0)quantity=1;
  let rate=number(line?.rate??line?.unitPrice);if(rate<0)rate=0;
  const manual=rate<=0||text(line?.priceSource).toLowerCase()==='manual_required';
  return{...line,quoteLineId:text(line?.quoteLineId||`AI-LINE-${index+1}`),description,quantity,unit:text(line?.unit||'each'),rate,unitPrice:rate,costType:text(line?.costType||'other'),priceSource:manual?'manual_required':text(line?.priceSource||'price_book'),confidence:text(line?.confidence||'low'),rationale:text(line?.rationale||'Owner review required before this line is used in a final proposal.'),ownerReviewRequired:true};
}
function normalizeDraft(result,prepared){
  const draft=result?.draft&&typeof result.draft==='object'?{...result.draft}:{};
  let lines=Array.isArray(draft.suggestedLines)?draft.suggestedLines.map((line,index)=>normalizedLine(line,index,prepared.scope)):[];
  if(!lines.length){lines=[normalizedLine({description:`Owner review — ${prepared.scope||prepared.projectTitle||'project scope'}`,quantity:1,unit:'lump sum',rate:0,costType:'other',priceSource:'manual_required',confidence:'low',rationale:'The Site Visit is attached, but H38 still needs an owner value or project quantity before pricing can be finalized.'},0,prepared.scope)];}
  return{...result,draft:{...draft,suggestedLines:lines,editableOwnerDraft:true,manualRequiredLinesAllowed:true}};
}
async function loadDirections(prepared,baseResult,timeout){
  const quoteId=text(prepared.quoteId).trim();
  if(!quoteId)return null;
  try{
    const data=await oneRetry('h38-quote-options','buildDirections',{businessId:prepared.businessId,quoteId,projectTitle:prepared.projectTitle,scope:prepared.scope,ownerWorkRequest:prepared.ownerWorkRequest,measurementEvidence:prepared.measurementEvidence||[],baseDraft:baseResult.draft,currentEstimate:prepared.currentEstimate||[]},Math.min(Math.max(60000,Number(timeout)||150000),180000));
    if(data?.directions?.length){directionCache[quoteId]=data;window.dispatchEvent(new CustomEvent('h38:quote-directions-ready',{detail:{quoteId,data}}));return data;}
  }catch(error){console.warn('[H38 Quote authority] project directions unavailable; base quote remains usable',error);}
  return null;
}
async function buildQuote(args,timeout){
  const prepared=await prepareBuild(args),key=`build|${text(prepared.quoteId)}`;
  if(inflight[key])return inflight[key];
  const task=(async()=>{const base=normalizeDraft(await oneRetry('h38-quote-ai','buildQuote',prepared,timeout),prepared);const directions=await loadDirections(prepared,base,timeout);return directions?{...base,quoteDirections:directions}:base;})();
  inflight[key]=task.finally(()=>{delete inflight[key];});return inflight[key];
}
function actionPictureId(quoteId,args){
  const explicit=text(args?.actionPhotoDocumentId||args?.actionPictureId).trim();if(explicit)return explicit;
  const quote=quoteRecord(quoteId),saved=text(val(quote,'Action Picture ID','actionPictureId')).trim();if(saved)return saved;
  const map=window.H38_QUOTE_ACTION_PHOTO_BY_QUOTE||{};if(text(map[quoteId]).trim())return text(map[quoteId]).trim();
  const visit=window.H38_FIELD_VISIT_CORE?.state?.visit;if(visit&&text(visit.quoteId)===quoteId&&text(visit.actionPictureId).trim())return text(visit.actionPictureId).trim();
  const linked=rows('documents').find(row=>{const sourceType=text(val(row,'Source Type','sourceType')).toLowerCase(),sourceId=text(val(row,'Source ID','sourceId')),original=text(val(row,'Original Document ID','originalDocumentId')),action=text(val(row,'Action Picture Source ID','actionPictureSourceId'));return sourceType==='quote'&&sourceId===quoteId&&(val(row,'Action Picture','actionPicture')===true||original||action);});
  return text(val(linked,'Action Picture Source ID','actionPictureSourceId','Original Document ID','originalDocumentId','Document ID','documentId')).trim();
}
async function touchActionPicture(api,businessId,quoteId,sourceId){
  if(!api||!businessId||!quoteId||!sourceId)return'';
  const result=await api.from('business_records').select('record_key,payload').eq('business_id',businessId).eq('collection','documents').eq('record_status','active').limit(500);
  if(result.error)throw result.error;
  const row=(result.data||[]).find(item=>{const p=item?.payload||{},sourceType=text(val(p,'Source Type','sourceType')).toLowerCase(),source=text(val(p,'Source ID','sourceId')),doc=text(val(p,'Document ID','documentId')),original=text(val(p,'Original Document ID','originalDocumentId')),action=text(val(p,'Action Picture Source ID','actionPictureSourceId'));return sourceType==='quote'&&source===quoteId&&(doc===sourceId||original===sourceId||action===sourceId||val(p,'Action Picture','actionPicture')===true);});
  if(!row)return'';
  const now=new Date().toISOString(),updated={...(row.payload||{}),'Action Picture':true,'Action Picture Source ID':sourceId,'Visibility':'Internal Action Picture','Customer Quote Selected':Boolean(val(row.payload,'Customer Quote Selected','customerQuoteSelected')),'Updated Time':now};
  const saved=await api.from('business_records').update({payload:updated,updated_at:now}).eq('business_id',businessId).eq('collection','documents').eq('record_key',row.record_key);
  if(saved.error)throw saved.error;
  return text(row.record_key);
}
function directionPayload(quoteId,args){
  const cache=directionCache[quoteId],id=text(args?.selectedDirectionId||window.state?.quote?.h38SelectedDirectionId).trim();
  const directions=Array.isArray(cache?.directions)?cache.directions:[];
  return directions.find(direction=>text(direction.id)===id)||null;
}
async function renderQuote(args,timeout){
  const quoteId=text(args?.quoteId).trim(),businessId=text(args?.businessId||window.state?.businessId).trim(),quote=quoteRecord(quoteId),sourceId=actionPictureId(quoteId,args);
  if(!sourceId)throw new Error('The saved Site Visit Action Picture could not be resolved for this quote. Reopen the Site Visit and verify its Action Picture.');
  const auth=await validSession(false),linkId=await touchActionPicture(auth.api,businessId,quoteId,sourceId),direction=directionPayload(quoteId,args);
  const prepared={...(args||{}),businessId,quoteId,projectTitle:text(args?.projectTitle||val(quote,'Project Title','projectTitle')),scope:text(args?.scope||val(quote,'Scope','scope')),actionPhotoDocumentId:sourceId,actionPhotoQuoteLinkId:linkId,systemQuotePolicy:policyText()};
  if(direction){prepared.selectedDirectionId=text(direction.id);prepared.ownerWorkRequest=[text(args?.ownerWorkRequest),`SELECTED OWNER-REVIEW VISUAL DIRECTION: ${text(direction.name)}. ${text(direction.summary)}. VISUAL CHANGE: ${text(direction.visualPrompt)}`].filter(Boolean).join('\n');prepared.suggestedLines=Array.isArray(args?.suggestedLines)&&args.suggestedLines.length?args.suggestedLines:direction.suggestedLines||[];}
  return oneRetry('h38-quote-ai','renderConcept',prepared,timeout);
}
Bridge.prototype.request=async function(action,args,timeout){
  if(action==='aiBuildQuoteDraft')return buildQuote(args||{},timeout);
  if(action==='aiRenderQuoteConcept')return renderQuote(args||{},timeout);
  return previousRequest.call(this,action,args,timeout);
};
Bridge.prototype.request.__h38QuoteRuntimeAuthority=true;
Bridge.prototype.request.__h38PlayQuoteAuthCircuit=true;
window.H38_DIRECT_QUOTE_AI=Object.freeze({enabled:true,build:BUILD,request:async(args,timeout)=>{if(args?.userInitiated!==true)throw new Error('Automatic quote preflight is retired. Build or refresh the quote from an explicit owner action.');return buildQuote(args||{},timeout);}});
window.H38_QUOTE_RUNTIME_AUTHORITY=Object.freeze({enabled:true,build:BUILD,buildQuote,renderQuote,loadDirections,actionPictureId,directionCache,singleTransport:true,oneAuthRefreshRetry:true,automaticPreflight:false,manualRequiredLinesRemainEditable:true,savedQuoteActionPictureAuthority:true,customerQuotePhotoSelectionIndependent:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,automaticPayment:false});
})();