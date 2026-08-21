(function(){
'use strict';
const BUILD='20260821-site-visit-photo-quote-runtime-repair-2';
const C=window.H38_FIELD_VISIT_CORE;
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
const shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!C||!cfg.enabled||!window.supabase)return;
const text=value=>String(value==null?'':value);
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const unique=values=>Array.from(new Set((values||[]).map(text).filter(Boolean)));
const safe=value=>text(value).replace(/[^A-Za-z0-9._-]+/g,'-').slice(0,170);
const now=()=>new Date().toISOString();
let evidenceBusy=null,decorateTimer=0;
const serverImages=new Map(),signedUrls=new Map();
function api(){return shared?.ensure?.()||window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});}
function visit(){return C.state?.visit||null;}
function businessId(v=visit()){return text(v?.businessId||window.state?.businessId).trim();}
function quoteId(v=visit()){return text(v?.quoteId||window.state?.quote?.quoteId).trim();}
async function validatedSession(forceRefresh=false){
  const client=api();
  let result=await client.auth.getSession();
  if(result.error)throw result.error;
  let session=result.data?.session;
  if(!session)throw Error('Sign in again before using Site Visit photos or building the quote.');
  const expiring=Number(session.expires_at||0)*1000<=Date.now()+120000;
  let verified=!forceRefresh&&!expiring?await client.auth.getUser(session.access_token):{error:new Error('refresh-required'),data:{user:null}};
  if(forceRefresh||expiring||verified.error||!verified.data?.user){
    const refreshed=await client.auth.refreshSession();
    if(refreshed.error||!refreshed.data?.session)throw Error(refreshed.error?.message||verified.error?.message||'Secure session could not be refreshed. Sign in again.');
    session=refreshed.data.session;
    verified=await client.auth.getUser(session.access_token);
  }
  if(verified.error||!verified.data?.user)throw Error(verified.error?.message||'Secure session is invalid. Sign in again.');
  return{client,session,user:verified.data.user};
}
function siteImage(row,v){
  const p=row?.payload||{},mime=text(value(p,'Mime Type','mimeType')).toLowerCase();
  if(!mime.startsWith('image/'))return false;
  if(text(value(p,'Source Type','sourceType')).toLowerCase()!=='site visit')return false;
  const vid=text(v?.visitId),sid=text(v?.sessionId),sourceId=text(value(p,'Source ID','sourceId')),rowSession=text(value(p,'Capture Session ID','captureSessionId'));
  return !!((vid&&sourceId===vid)||(sid&&rowSession===sid));
}
function documentId(row){return text(value(row?.payload||{},'Document ID','documentId')||row?.record_key);}
function frameLike(row){const p=row?.payload||{},name=text(value(p,'File Name','fileName')).toLowerCase(),kind=text(value(p,'Evidence Type','evidenceType')).toLowerCase();return /walkthrough-.*-frame-|frame-\d+/.test(name)||kind.includes('frame');}
function transcriptText(v,sessionPayload){return [v?.walkthroughTranscript,v?.walkthroughVoice?.transcript,value(sessionPayload||{},'Walkthrough Transcript','walkthroughTranscript','Transcript','transcript')].map(text).filter(Boolean).join('\n');}
function actionIntent(v,sessionPayload){return /(?:action\s+photo|action\s+picture|before\s*(?:and|&)\s*after|before\s*\/\s*after)/i.test(transcriptText(v,sessionPayload));}
function updateSnapshot(collection,key,patch){const rows=window.state?.snapshot?.[collection];if(!Array.isArray(rows))return;const row=rows.find(item=>text(value(item,'Capture Session ID','captureSessionId','Quote ID','quoteId'))===text(key));if(row)Object.assign(row,patch);}
async function readSessionRecord(client,v){if(!v?.sessionId)return null;const result=await client.from('business_records').select('record_key,payload,updated_at').eq('business_id',businessId(v)).eq('collection','siteCaptureSessions').eq('record_key',text(v.sessionId)).eq('record_status','active').maybeSingle();if(result.error)throw result.error;return result.data||null;}
async function readQuoteRecord(client,v){const qid=quoteId(v);if(!qid)return null;const result=await client.from('business_records').select('record_key,payload,updated_at').eq('business_id',businessId(v)).eq('collection','quotes').eq('record_key',qid).eq('record_status','active').maybeSingle();if(result.error)throw result.error;return result.data||null;}
async function persistPointer(auth,v,selected,sessionRow,quoteRow){
  if(!selected)return false;
  const stamp=now(),bid=businessId(v),qid=quoteId(v);let wrote=false;
  if(sessionRow){const p=sessionRow.payload||{},needs=text(value(p,'Action Picture ID','actionPictureId'))!==selected||text(value(p,'Site Visit ID','siteVisitId'))!==text(v.visitId)||text(value(p,'Capture Session ID','captureSessionId'))!==text(v.sessionId);if(needs){const next={...p,'Action Picture ID':selected,'Site Visit ID':text(v.visitId),'Capture Session ID':text(v.sessionId),'Updated Time':stamp,'Record Version':Number(value(p,'Record Version','recordVersion')||1)+1};const changed=await auth.client.from('business_records').update({payload:next,updated_by:auth.user.id,updated_at:stamp}).eq('business_id',bid).eq('collection','siteCaptureSessions').eq('record_key',sessionRow.record_key).eq('record_status','active');if(changed.error)throw changed.error;sessionRow.payload=next;updateSnapshot('siteCaptureSessions',v.sessionId,{'Action Picture ID':selected,'Site Visit ID':text(v.visitId),'Updated Time':stamp});wrote=true;}}
  if(quoteRow&&qid){const p=quoteRow.payload||{},needs=text(value(p,'Action Picture ID','actionPictureId'))!==selected||text(value(p,'Site Visit ID','siteVisitId'))!==text(v.visitId)||text(value(p,'Site Scanner Session ID','siteScannerSessionId'))!==text(v.sessionId);if(needs){const next={...p,'Action Picture ID':selected,'Site Visit ID':text(v.visitId),'Site Scanner Session ID':text(v.sessionId),'Updated Time':stamp,'Record Version':Number(value(p,'Record Version','recordVersion')||1)+1};const changed=await auth.client.from('business_records').update({payload:next,updated_by:auth.user.id,updated_at:stamp}).eq('business_id',bid).eq('collection','quotes').eq('record_key',quoteRow.record_key).eq('record_status','active');if(changed.error)throw changed.error;quoteRow.payload=next;const rows=window.state?.snapshot?.quotes;if(Array.isArray(rows)){const row=rows.find(item=>text(value(item,'Quote ID','quoteId'))===qid);if(row)Object.assign(row,{'Action Picture ID':selected,'Site Visit ID':text(v.visitId),'Site Scanner Session ID':text(v.sessionId),'Updated Time':stamp});}wrote=true;}}
  return wrote;
}
async function ensureQuoteLink(auth,v,source,allRows=[]){
  const qid=quoteId(v),bid=businessId(v),original=documentId(source);if(!qid||!original)return'';
  const suffix=safe(qid.replace(/^QUOTE-/i,'')).slice(0,8),recordKey=`QUOTE-LINK-${safe(original)}-${suffix}`.slice(0,220),existing=(allRows||[]).find(row=>text(row?.record_key)===recordKey),existingPayload=existing?.payload||{};
  const map=window.H38_QUOTE_ACTION_PHOTO_BY_QUOTE||(window.H38_QUOTE_ACTION_PHOTO_BY_QUOTE=Object.create(null));map[qid]=original;
  if(existing&&text(value(existingPayload,'Source Type','sourceType')).toLowerCase()==='quote'&&text(value(existingPayload,'Source ID','sourceId'))===qid&&text(value(existingPayload,'Original Document ID','originalDocumentId'))===original&&String(value(existingPayload,'Action Picture','actionPicture')).toLowerCase()==='true'&&String(value(existingPayload,'Customer Quote Selected','customerQuoteSelected')).toLowerCase()==='false')return recordKey;
  const p=source.payload||{},stamp=now(),payload={...p,'Document ID':recordKey,'Source Type':'Quote','Source ID':qid,'Quote ID':qid,'Original Document ID':original,'Linked Site Visit ID':text(v.visitId),'Site Visit ID':text(v.visitId),'Capture Session ID':text(v.sessionId),'Action Picture':true,'Action Picture Source ID':original,'Action Picture Selected Time':stamp,'Customer Quote Selected':false,'Visibility':'Internal Action Picture','Access Classification':'Internal','Updated Time':stamp};
  const upsert=await auth.client.from('business_records').upsert({business_id:bid,collection:'documents',record_key:recordKey,payload,record_status:'active',created_by:auth.user.id,updated_by:auth.user.id,updated_at:stamp},{onConflict:'business_id,collection,record_key'});if(upsert.error)throw upsert.error;return recordKey;
}
async function hydrateEvidence(trigger='runtime'){
  const v=visit();if(!v?.visitId||!v?.sessionId||!navigator.onLine)return false;if(evidenceBusy)return evidenceBusy;
  evidenceBusy=(async()=>{
    const auth=await validatedSession(false),bid=businessId(v);
    const docsResult=await auth.client.from('business_records').select('record_key,payload,updated_at').eq('business_id',bid).eq('collection','documents').eq('record_status','active').order('updated_at',{ascending:false}).limit(600);if(docsResult.error)throw docsResult.error;
    const allDocs=docsResult.data||[],images=allDocs.filter(row=>siteImage(row,v)),ids=unique(images.map(documentId));images.forEach(row=>serverImages.set(documentId(row),row));
    const beforeIds=unique(v.attachmentIds||[]),merged=unique([...beforeIds,...ids]);if(merged.length!==beforeIds.length)v.attachmentIds=merged;
    const [sessionRow,quoteRow]=await Promise.all([readSessionRecord(auth.client,v),readQuoteRecord(auth.client,v)]),sessionPayload=sessionRow?.payload||{};
    let selected=text(v.actionPictureId||value(sessionPayload,'Action Picture ID','actionPictureId')||value(quoteRow?.payload||{},'Action Picture ID','actionPictureId')).trim();
    if(selected&&!ids.includes(selected))selected='';
    const intentional=images.filter(row=>!frameLike(row));
    if(!selected&&actionIntent(v,sessionPayload)&&intentional.length===1)selected=documentId(intentional[0]);
    let changed=false;if(selected&&text(v.actionPictureId)!==selected){v.actionPictureId=selected;changed=true;}
    if(selected){const source=images.find(row=>documentId(row)===selected);if(source){await persistPointer(auth,v,selected,sessionRow,quoteRow);await ensureQuoteLink(auth,v,source,allDocs);}}
    if(merged.length!==beforeIds.length||changed){await C.saveDraft?.();try{C.state.render?.();}catch(_){}}
    scheduleThumbnails();return true;
  })().catch(error=>{console.warn('[H38 photo/quote runtime evidence]',trigger,error?.message||error);return false;}).finally(()=>{evidenceBusy=null;});return evidenceBusy;
}
async function signedUrl(row){const p=row?.payload||{},path=text(value(p,'Storage Path','storagePath')),bucket=text(value(p,'Storage Bucket','storageBucket')||'business-office-files');if(!path)return'';const cached=signedUrls.get(path);if(cached&&cached.expires>Date.now())return cached.url;const auth=await validatedSession(false),result=await auth.client.storage.from(bucket).createSignedUrl(path,600);if(result.error)throw result.error;const url=text(result.data?.signedUrl);if(url)signedUrls.set(path,{url,expires:Date.now()+480000});return url;}
async function decorateThumbnails(){const v=visit();if(!v)return;const rows=Array.from(document.querySelectorAll('.field-owner-photo[data-photo-id]'));for(const node of rows){const id=text(node.dataset.photoId),server=serverImages.get(id);if(!server)continue;const existing=node.querySelector('img');if(existing&&/^(?:data:|blob:|https?:)/i.test(text(existing.getAttribute('src'))))continue;try{const url=await signedUrl(server);if(!url)continue;const img=document.createElement('img');img.src=url;img.alt=text(value(server.payload||{},'File Name','fileName')||'Site Visit photo');const placeholder=node.querySelector('.field-owner-photo-placeholder');if(placeholder)placeholder.replaceWith(img);else node.prepend(img);}catch(error){console.warn('[H38 private Site Visit thumbnail]',error?.message||error);}}
}
function scheduleThumbnails(delay=80){clearTimeout(decorateTimer);decorateTimer=setTimeout(()=>void decorateThumbnails(),delay);}
function compactMeasurement(row){const p=row?.payload||row||{},amount=Number(value(p,'Value','value'));const label=text(value(p,'Label','label')).trim();if(!label||!Number.isFinite(amount)||amount<=0)return null;return{measurementId:text(value(p,'Site Measurement ID','measurementId','Measurement ID')),label,value:amount,unit:text(value(p,'Unit','unit')||'in'),source:text(value(p,'Source','source')),verificationStatus:text(value(p,'Verification Status','verificationStatus')||'UNVERIFIED'),notes:text(value(p,'Notes','notes'))};}
async function liveMeasurements(auth,args){const bid=text(args?.businessId||window.state?.businessId),qid=text(args?.quoteId),v=visit(),quoteRow=(window.state?.snapshot?.quotes||[]).find(row=>text(value(row,'Quote ID','quoteId'))===qid),sid=text(v?.quoteId)===qid?text(v?.sessionId):text(value(quoteRow,'Site Scanner Session ID','siteScannerSessionId'));if(!bid||!qid)return[];const result=await auth.client.from('business_records').select('record_key,payload,updated_at').eq('business_id',bid).eq('collection','siteMeasurements').eq('record_status','active').order('updated_at',{ascending:false}).limit(500);if(result.error)throw result.error;const seen=new Set();return(result.data||[]).filter(row=>{const p=row.payload||{},rq=text(value(p,'Quote ID','quoteId')),rs=text(value(p,'Capture Session ID','captureSessionId'));return rq===qid||(sid&&rs===sid);}).map(compactMeasurement).filter(Boolean).filter(item=>{const key=[item.measurementId,item.label,item.value,item.unit,item.source,item.verificationStatus].join('|');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,80);}
function cleanOwnerNotes(notes){return text(notes).split(/\n+/).filter(line=>!/(?:insulat(?:e|ed|ing|ion)|drywall|sheet\s*rock|sheetrock)/i.test(line)).join('\n').trim();}
function buildPolicy(){return[
  'QUOTE BUILD AUTHORITY: Use only the actual project title, scope, saved Site Visit evidence, measurements, and Price Book context for this quote.',
  'Separate material and labor into distinct owner-review lines when both are genuinely part of an explicit work item. Trade-specific examples in system instructions apply only when that trade is actually named in the project scope.',
  'Material purchase quantities may include a 10% ordering allowance where appropriate; labor quantities stay at the net installed work quantity.',
  'Every returned line must have a positive quantity and positive rate. Search the supplied Price Book first. If no safe current same-unit catalog rate exists, use a defensible current local/regional owner-review planning allowance.',
  'When an exact dimension or count is missing, do not invent it. A clearly labeled quantity-1 lump-sum/job planning allowance may be used for an explicitly requested work item when defensible, while the exact unknown remains in missingInformation.',
  'Do not block the entire editable draft merely because one requested item needs later field confirmation. Never approve, send, purchase, pay, schedule, accept, or financially commit automatically.'
].join('\n');}
function preparedArgs(args,evidence){const prepared={...(args||{})};prepared.notes=[cleanOwnerNotes(prepared.notes),buildPolicy()].filter(Boolean).join('\n\n');prepared.materialOrderAllowancePercent=10;prepared.separateMaterialAndLabor=true;if(evidence.length){prepared.measurementEvidence=evidence;prepared.siteMeasurements=evidence;}return prepared;}
async function responsePayload(response){const raw=await response.text();if(!raw)return{};try{return JSON.parse(raw)||{};}catch(_){return{status:'FAIL',message:`Quote AI returned unreadable data (${response.status}).`};}}
async function postQuote(prepared,timeout,forceRefresh){const auth=await validatedSession(forceRefresh),controller=new AbortController(),ms=Math.max(30000,Number(timeout)||180000),timer=setTimeout(()=>controller.abort(),ms);try{const response=await fetch(`${cfg.url}/functions/v1/h38-quote-ai`,{method:'POST',mode:'cors',cache:'no-store',credentials:'omit',headers:{authorization:`Bearer ${auth.session.access_token}`,apikey:cfg.publishableKey,'content-type':'application/json','x-client-info':'h38-photo-quote-final-runtime-v2'},body:JSON.stringify({action:'buildQuote',...prepared}),signal:controller.signal});return{response,payload:await responsePayload(response)};}finally{clearTimeout(timer);}}
async function quoteAttempt(prepared,timeout){let attempt=await postQuote(prepared,timeout,false),message=text(attempt.payload?.message);if(attempt.response.status===401||/auth|session|token/i.test(message)){attempt=await postQuote(prepared,timeout,true);}if(!attempt.response.ok||attempt.payload?.status!=='PASS')throw Error(attempt.payload?.message||`Quote AI request failed (${attempt.response.status}).`);return attempt.payload;}
function draftLines(payload){return Array.isArray(payload?.draft?.suggestedLines)?payload.draft.suggestedLines:[];}
function draftProblems(payload){const lines=draftLines(payload),problems=[];if(!lines.length)problems.push('no quote lines were returned');const badQty=lines.filter(line=>!(Number(line?.quantity)>0)),badRate=lines.filter(line=>!(Number(line?.rate??line?.unitPrice)>0));if(badQty.length)problems.push(`non-positive quantities: ${badQty.slice(0,5).map(line=>text(line?.description)).join('; ')}`);if(badRate.length)problems.push(`non-positive rates: ${badRate.slice(0,5).map(line=>text(line?.description)).join('; ')}`);return problems;}
async function buildQuote(args,timeout){
  try{if(typeof window.sync==='function')await window.sync(false);}catch(_){}
  await hydrateEvidence('quote-build');
  let auth=await validatedSession(false),evidence=await liveMeasurements(auth,args),prepared=preparedArgs(args,evidence),payload=await quoteAttempt(prepared,timeout),problems=draftProblems(payload);
  if(problems.length){prepared={...prepared,notes:[prepared.notes,'OWNER DRAFT REPAIR: The prior response did not produce a usable editable estimate. Preserve the explicit project scope and verified evidence. Return positive owner-review planning lines for the requested work, using the Price Book first and defensible current local/regional allowances where needed. Do not invent dimensions or customer commitments.',`PROBLEMS TO CORRECT: ${problems.join(' | ')}`].join('\n\n')};payload=await quoteAttempt(prepared,timeout);problems=draftProblems(payload);}
  if(problems.length)throw Error(`H38 could not create a safe editable quote draft: ${problems.join('; ')}.`);
  payload.h38FinalPhotoQuoteRepair=true;payload.h38LiveMeasurementCount=evidence.length;return payload;
}
function installQuoteAuthority(){const Bridge=window.H38Bridge;if(!Bridge?.prototype||typeof Bridge.prototype.request!=='function')return false;const current=Bridge.prototype.request;if(current.__h38FinalPhotoQuoteAuthority)return true;const base=current;const wrapped=async function(action,args,timeout){if(action==='aiBuildQuoteDraft')return buildQuote(args,timeout);return base.call(this,action,args,timeout);};wrapped.__h38FinalPhotoQuoteAuthority=true;wrapped.__h38FinalPhotoQuoteAuthorityBase=base;Bridge.prototype.request=wrapped;return true;}
function scheduleEvidence(trigger){[0,300,1100].forEach(delay=>setTimeout(()=>void hydrateEvidence(trigger),delay));}
let installTicks=0;const installTimer=setInterval(()=>{installQuoteAuthority();installTicks++;if(installTicks>=40)clearInterval(installTimer);},250);installQuoteAuthority();
window.addEventListener('h38:session-valid',()=>scheduleEvidence('session-valid'));
window.addEventListener('h38:business-snapshot-updated',()=>scheduleEvidence('snapshot-updated'));
window.addEventListener('online',()=>scheduleEvidence('online'));
document.addEventListener('click',event=>{if(event.target?.closest?.('[data-make-action-picture],#fieldAttach'))setTimeout(()=>void hydrateEvidence('owner-action'),80);},true);
const observer=new MutationObserver(()=>{if(document.querySelector('.field-owner-photo-placeholder,.field-owner-photo[data-photo-id]'))scheduleThumbnails(60);});observer.observe(document.documentElement,{childList:true,subtree:true});
[0,500,1600,3500].forEach(delay=>setTimeout(()=>void hydrateEvidence('startup'),delay));
window.H38_SITE_VISIT_PHOTO_QUOTE_RUNTIME_REPAIR=Object.freeze({build:BUILD,hydrateEvidence,buildQuote,durableActionPicture:true,changeOnlyServerWrites:true,privateServerThumbnails:true,quoteLinkedActionPhoto:true,explicitTokenValidation:true,forcedAuthRefreshRetry:true,liveSupabaseMeasurements:true,scopeSpecificTradeRules:true,noGlobalDrywallInsulationContamination:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,automaticPayment:false,automaticScheduling:false});
})();
