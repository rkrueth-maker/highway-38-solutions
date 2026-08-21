(function(){
'use strict';
const BUILD='20260820-site-visit-notes-audio-quote-optional-1';
const C=window.H38_FIELD_VISIT_CORE;
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
const shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!C)return;
const text=v=>String(v==null?'':v);
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
function visit(){return C.state?.visit||null;}
function docId(row){return text(value(row,'Document ID','documentId'));}
function updated(row){return text(value(row,'Updated Time','updatedAt','Created Time','createdAt'));}
function sessionDocs(){const sid=text(visit()?.sessionId);if(!sid)return[];return C.rows('documents').filter(row=>text(value(row,'Capture Session ID','captureSessionId'))===sid);}
function evidence(){
  const v=visit(),docs=sessionDocs(),videoIds=new Set((v?.videoAttachmentIds||[]).map(text).filter(Boolean));
  docs.filter(row=>text(value(row,'Mime Type','mimeType')).toLowerCase().startsWith('video/')).forEach(row=>{const id=docId(row);if(id)videoIds.add(id);});
  const audios=docs.filter(row=>text(value(row,'Mime Type','mimeType')).toLowerCase().startsWith('audio/')||/walkthrough voice audio/i.test(text(value(row,'Evidence Type','evidenceType')))).sort((a,b)=>updated(b).localeCompare(updated(a)));
  for(const audio of audios){const audioId=docId(audio),sourceVideoId=text(value(audio,'Source Video Attachment ID','sourceVideoAttachmentId'));if(audioId&&sourceVideoId&&videoIds.has(sourceVideoId))return{videoId:sourceVideoId,audioId,serverReady:true};}
  const localAudioIds=(v?.walkthroughAudioAttachmentIds||[]).map(text).filter(Boolean),localVideoIds=[...videoIds];
  if(localAudioIds.length&&localVideoIds.length)return{videoId:localVideoIds[localVideoIds.length-1],audioId:localAudioIds[localAudioIds.length-1],serverReady:docs.some(row=>docId(row)===localAudioIds[localAudioIds.length-1])};
  if(localVideoIds.length)return{videoId:localVideoIds[localVideoIds.length-1],audioId:'',serverReady:docs.some(row=>docId(row)===localVideoIds[localVideoIds.length-1])};
  return{videoId:'',audioId:'',serverReady:false};
}
function hammer(message){try{window.H38_WORKING_HAMMER?.start?.(message);}catch(_){}}
function unhammer(){try{window.H38_WORKING_HAMMER?.stop?.();}catch(_){}}
function toast(message,bad){try{if(typeof window.toast==='function')window.toast(message,!!bad);else C.toast?.(message,!!bad);}catch(_){}}
function supabaseClient(){if(shared?.ensure)return shared.ensure();if(!window.supabase||!cfg.enabled)return null;return window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});}
async function auth(forceRefresh=false){const api=supabaseClient();if(!api)throw Error('Secure Business Office connection is not ready.');let result=await api.auth.getSession();if(result.error)throw result.error;let session=result.data?.session;if(!session)throw Error('Sign in again before processing walkthrough notes.');if(forceRefresh||Number(session.expires_at||0)*1000<Date.now()+120000){const refreshed=await api.auth.refreshSession();if(refreshed.error||!refreshed.data?.session)throw Error(refreshed.error?.message||'Secure session could not be refreshed.');session=refreshed.data.session;}return{api,session};}
function voiceState(){const v=visit();if(!v)return null;if(!v.walkthroughVoice)v.walkthroughVoice={status:'WAITING',attachmentId:'',audioAttachmentId:'',transcript:'',cleanNotes:[],customerRequests:[],siteConditions:[],unknowns:[],spokenMeasurements:[],message:'',updatedAt:''};return v.walkthroughVoice;}
async function persist(){const s=voiceState();if(s)s.updatedAt=new Date().toISOString();await C.saveDraft?.();C.state.render?.();}
async function synced(videoId,audioId,serverReady){
  if(!navigator.onLine)throw Error('Walkthrough notes will process automatically when this phone is online.');
  await window.H38_FIELD_VISIT_VIDEO?.syncPending?.();
  const docs=sessionDocs(),serverIds=new Set(docs.map(docId).filter(Boolean));
  if(serverReady||serverIds.has(audioId)||serverIds.has(videoId))return;
  for(const id of [audioId,videoId].filter(Boolean)){const local=await window.H38DB?.get?.('attachments',id);if(local&&text(local.syncStatus).toUpperCase()!=='SYNCED')throw Error('The walkthrough is still saving privately. H38 will create the notes when sync finishes.');}
  const waiting=await window.H38_FIELD_VISIT_RECOVERY?.waitingOperations?.()||[];
  if(waiting.length){await window.H38_FIELD_VISIT_RECOVERY?.syncNow?.();const remaining=await window.H38_FIELD_VISIT_RECOVERY?.waitingOperations?.()||[];if(remaining.length)throw Error('The Site Visit is still syncing. H38 will create the notes when it finishes.');}
}
async function request(videoId,audioId,forceRefresh=false){const a=await auth(forceRefresh),v=visit();const response=await fetch(`${cfg.url}/functions/v1/h38-walkthrough-transcription`,{method:'POST',mode:'cors',cache:'no-store',credentials:'omit',headers:{authorization:`Bearer ${a.session.access_token}`,apikey:cfg.publishableKey,'content-type':'application/json','x-client-info':'h38-site-visit-notes-v6-audio-first'},body:JSON.stringify({businessId:v?.businessId||window.state?.businessId,captureSessionId:v?.sessionId,quoteId:v?.quoteId||'',attachmentId:videoId,audioAttachmentId:audioId||''})});const payload=await response.json().catch(()=>({}));return{response,payload};}
function apply(payload,videoId,audioId){const v=visit(),s=voiceState(),notes=payload?.notes||{};if(!v||!s)return;s.status='COMPLETE';s.message='Professional walkthrough notes ready.';s.attachmentId=videoId;s.audioAttachmentId=text(payload?.audioAttachmentId||audioId);s.transcript=text(payload?.transcript);s.cleanNotes=Array.isArray(notes.cleanNotes)?notes.cleanNotes:[];s.customerRequests=Array.isArray(notes.customerRequests)?notes.customerRequests:[];s.siteConditions=Array.isArray(notes.siteConditions)?notes.siteConditions:[];s.unknowns=Array.isArray(notes.unknowns)?notes.unknowns:[];s.spokenMeasurements=Array.isArray(notes.spokenMeasurements)?notes.spokenMeasurements:[];v.walkthroughTranscript=s.transcript;v.walkthroughVoiceNotes=s.cleanNotes;v.walkthroughSpokenMeasurements=s.spokenMeasurements;v.walkthroughProfessionalNotes={summary:s.cleanNotes,customerRequests:s.customerRequests,siteConditions:s.siteConditions,unknowns:s.unknowns,spokenMeasurements:s.spokenMeasurements};v.walkthroughTranscriptStatus='COMPLETE';v.walkthroughTranscriptAttachmentId=videoId;v.walkthroughVoiceAudioAttachmentId=s.audioAttachmentId;}
function deletedSessionError(message){return /site capture session was not found|session.*not found in the active business/i.test(text(message));}
let running=null;
async function ensure(force=false){if(running)return running;running=(async()=>{const v=visit(),pair=evidence(),s=voiceState();if(!v||!pair.videoId||!v.sessionId||!s)return true;if(!navigator.onLine)return false;if(!force&&s.status==='COMPLETE'&&s.attachmentId===pair.videoId&&(!pair.audioId||s.audioAttachmentId===pair.audioId))return true;if(s.status==='STOPPED')return true;s.attachmentId=pair.videoId;s.audioAttachmentId=pair.audioId;s.status='SYNCING';s.message=pair.audioId?'Saving the walkthrough audio before creating notes…':'Saving the walkthrough before creating notes…';hammer('Saving walkthrough evidence…');await persist();try{await synced(pair.videoId,pair.audioId,pair.serverReady);s.status='TRANSCRIBING';s.message='Turning what you said into professional Site Visit notes…';hammer('Creating walkthrough notes…');await persist();let attempt=await request(pair.videoId,pair.audioId,false);if(attempt.response.status===401)attempt=await request(pair.videoId,pair.audioId,true);if(!attempt.response.ok||attempt.payload?.status!=='PASS')throw Error(attempt.payload?.message||`Walkthrough note processing failed (${attempt.response.status}).`);apply(attempt.payload,pair.videoId,pair.audioId);await persist();toast('Professional Site Visit notes are ready.');return true;}catch(error){const message=text(error?.message||error);if(deletedSessionError(message)){s.status='STOPPED';s.message='This deleted Site Visit will not be retried.';await persist();return true;}s.status='FAILED';s.message=message;await persist();toast(s.message,true);return true;}finally{unhammer();}})().finally(()=>{running=null;});return running;}
function installNotesOverride(){const existing=window.H38_FIELD_VISIT_TRANSCRIPTION;if(!existing)return false;if(existing.__h38SiteVisitAudioFirstFix)return true;existing.ensure=ensure;existing.build=`${text(existing.build)}+${BUILD}`;existing.siteVisitFirst=true;existing.quoteOptional=true;existing.audioEvidencePreferred=true;existing.deletedSessionRetryStopped=true;existing.__h38SiteVisitFirstFix=true;existing.__h38SiteVisitAudioFirstFix=true;return true;}
function scheduleRecovery(){[350,1400,3600,7000].forEach(delay=>setTimeout(()=>{const s=voiceState(),pair=evidence();if(pair.videoId&&s?.status!=='COMPLETE'&&s?.status!=='STOPPED')void ensure(true);},delay));}
function install(){if(!installNotesOverride())setTimeout(install,120);else scheduleRecovery();}
install();
window.H38_SITE_VISIT_PHONE_FINAL_FIX={build:BUILD,userGestureCameraOnly:true,startupAutoLaunch:false,focusAutoLaunch:false,pageshowAutoLaunch:false,bridgeReadyAutoLaunch:false,siteVisitFirstNotes:true,quoteOptional:true,audioEvidencePreferred:true,matchingAudioSourceVideo:true,serverEvidenceRecovery:true,deletedSessionRetryStopped:true,boundedNotesRecovery:true,automaticApproval:false,automaticCustomerSending:false};
})();

(function(){
'use strict';
const BUILD='20260820-site-visit-quote-optional-1';
const C=window.H38_FIELD_VISIT_CORE;
if(!C)return;
const S=C.state,text=value=>String(value==null?'':value),now=()=>new Date().toISOString(),uid=prefix=>typeof window.newId==='function'?window.newId(prefix):`${prefix}-${crypto.randomUUID().toUpperCase()}`;
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
function optimistic(collection,key,record,keys){if(!window.state?.snapshot)return;if(!Array.isArray(window.state.snapshot[collection]))window.state.snapshot[collection]=[];const rows=window.state.snapshot[collection],index=rows.findIndex(row=>keys.some(k=>text(row?.[k])===text(key)));if(index>=0)rows[index]=record;else rows.unshift(record);}
async function queueEntity(collection,type,key,record,keys){if(typeof window.queueOperation!=='function')throw Error('Offline save queue is unavailable.');await window.queueOperation('SAVE_ENTITY',type,key,{entity:collection,record},{collection,record,idKeys:keys},false);optimistic(collection,key,record,keys);await C.pending?.();if(navigator.onLine)C.syncSoon?.();return record;}
function customers(){return C.rows('customers').filter(row=>text(value(row,'Status','status')).toUpperCase()!=='INACTIVE');}
function genericCustomer(){return customers().find(row=>/generic quote customer/i.test(text(value(row,'Customer Name','customerName'))));}
async function customerFromForm(form){let cid=text(form?.customerId?.value),name=text(form?.newCustomerName?.value).trim();if(!cid){const generic=genericCustomer();if(generic)cid=C.rid(generic,'Customer ID','customerId');}if(!cid&&name){cid=uid('CUSTOMER');await queueEntity('customers','Customer',cid,{'Customer ID':cid,'Business ID':C.business(),'Customer Name':name,'Email':text(form?.newCustomerEmail?.value).trim(),'Phone':text(form?.newCustomerPhone?.value).trim(),'Status':'Active','Created Time':now(),'Updated Time':now(),'Record Version':1},['Customer ID','customerId']);}if(!cid)throw Error('Choose a customer. Generic Quote Customer will be selected automatically when it exists.');return cid;}
async function relinkRows(collection,type,idKeys,qid){if(!S.visit?.sessionId)return;const sid=text(S.visit.sessionId),rows=C.rows(collection).filter(row=>text(value(row,'Capture Session ID','captureSessionId'))===sid);for(const row of rows){const key=C.rid(row,...idKeys);if(!key)continue;const updated={...row,'Quote ID':qid,'Updated Time':now(),'Record Version':C.n(value(row,'Record Version','recordVersion')||1)+1};await queueEntity(collection,type,key,updated,idKeys);}}
async function relinkSession(qid){const sid=text(S.visit?.sessionId);if(!sid)return;const session=C.rows('siteCaptureSessions').find(row=>text(value(row,'Capture Session ID','captureSessionId'))===sid);if(session){const updated={...session,'Quote ID':qid,'Quote Revision':qid?C.n(value(C.quote(qid),'Revision','revision')||1):0,'Updated Time':now(),'Record Version':C.n(value(session,'Record Version','recordVersion')||1)+1};await queueEntity('siteCaptureSessions','Site Capture Session',sid,updated,['Capture Session ID','captureSessionId']);}await relinkRows('siteMeasurements','Site Measurement',['Site Measurement ID','measurementId'],qid);await relinkRows('jobNotes','Field Note',['Job Note ID','jobNoteId'],qid);}
async function saveJobDraft(form,{announce=false}={}){if(!form)throw Error('Job form is unavailable.');const cid=await customerFromForm(form),title=text(form.projectTitle?.value).trim()||'Field visit',scope=text(form.scope?.value).trim(),projectType=text(form.projectType?.value)||'Custom work area';let qid=text(form.quoteId?.value),q=qid?C.quote(qid):null;if(qid&&C.locked(q)){qid='';q=null;C.toast('That quote is locked. This Site Visit will stay unassigned until you build a new quote.');}const oldQid=text(S.visit?.quoteId);if(qid&&q){const updated={...q,'Quote ID':qid,'Business ID':C.business(),'Customer ID':cid,'Project Title':title,'Scope':scope,'Status':text(value(q,'Status','status')||'Draft'),'Updated Time':now(),'Record Version':C.n(value(q,'Record Version','recordVersion')||1)+1};await queueEntity('quotes','Quote',qid,updated,['Quote ID','quoteId']);}Object.assign(S.visit,{customerId:cid,quoteId:qid,projectTitle:title,projectType,scope,status:S.visit.sessionId?'IN_PROGRESS':'LOCAL_DRAFT'});if(S.visit.sessionId&&oldQid!==qid)await relinkSession(qid);window.state.quote={quoteId:qid,customerId:cid,projectTitle:title,scope,lines:qid&&Array.isArray(window.state?.quote?.lines)?window.state.quote.lines:[]};await C.saveDraft();if(announce)C.toast(qid?'Site Visit draft saved with the selected quote.':'Site Visit draft saved. No quote was created; build one when the visit is finished.');C.state.render?.();return S.visit;}
async function ensureSession(){if(S.visit?.sessionId)return S.visit.sessionId;const id=uid('SCAN'),d=C.device(),qid=text(S.visit?.quoteId),record={'Capture Session ID':id,'Business ID':C.business(),'Customer ID':S.visit.customerId,'Quote ID':qid,'Quote Revision':qid?C.n(value(C.quote(qid),'Revision','revision')||1):0,'User ID':C.user(),'Project Type':S.visit.projectType,'Project Title':S.visit.projectTitle,'Capture Mode':'VIDEO_WALKTHROUGH_FIRST','Device Details':{userAgent:navigator.userAgent,platform:d.platform,label:d.label},'Started Time':now(),'Completed Time':'','Status':'IN_PROGRESS','Processing Status':'NOT_STARTED','Review Status':'DRAFT_INTERNAL_ONLY','Transcript':S.visit.notes,'Offline First':true,'Automatic Approval':false,'Automatic Customer Sending':false,'Created Time':now(),'Updated Time':now(),'Record Version':1};S.visit.sessionId=id;S.visit.status='IN_PROGRESS';await queueEntity('siteCaptureSessions','Site Capture Session',id,record,['Capture Session ID','captureSessionId']);await C.saveDraft();return id;}
async function saveAndStartWalkthrough(form){try{await saveJobDraft(form);await ensureSession();S.tab='capture';await C.load();C.state.render?.();requestAnimationFrame(()=>void window.H38_FIELD_VISIT_WORKFLOW?.openRecorder?.());}catch(error){C.toast(error?.message||String(error),true);}}
async function ensureDraftQuoteForVisit(){const visit=S.visit;if(!visit)throw Error('Open a Site Visit first.');let qid=text(visit.quoteId),q=qid?C.quote(qid):null;if(qid&&q&&!C.locked(q))return qid;const oldQid=qid;qid=uid('QUOTE');const record={'Quote ID':qid,'Business ID':C.business(),'Customer ID':text(visit.customerId),'Quote Number':`LOCAL-${Date.now()}`,'Project Title':text(visit.projectTitle||'Site visit'),'Scope':text(visit.scope),'Measurement Notes':'','Status':'Draft','Revision':1,'Subtotal':0,'Tax':0,'Total':0,'Created Time':now(),'Updated Time':now(),'Record Version':1,lines:[]};await queueEntity('quotes','Quote',qid,record,['Quote ID','quoteId']);visit.quoteId=qid;await relinkSession(qid);try{const attachments=await window.H38DB?.all('attachments')||[];for(const row of attachments){if(text(row?.relatedRecordId)===text(visit.visitId)&&(!oldQid||text(row?.quoteId)===oldQid))await window.H38DB.put('attachments',{...row,quoteId:qid});}}catch(_){}await C.saveDraft();window.state.quote={quoteId:qid,customerId:visit.customerId,projectTitle:visit.projectTitle,scope:visit.scope,lines:[]};return qid;}
function decorate(){const option=document.querySelector('#fieldContext select[name="quoteId"] option[value=""]');if(option)option.textContent='No quote yet — build after visit';const visit=S.visit;if(visit?.sessionId&&!visit?.quoteId){const heading=document.querySelector('#fieldContext')?.closest('.field-panel')?.querySelector('.field-hero h1');if(heading)heading.textContent='Site Visit draft saved';}}
function installWorkflow(){const workflow=window.H38_FIELD_VISIT_WORKFLOW;if(!workflow)return false;if(workflow.__h38QuoteOptionalFix)return true;workflow.saveJobDraft=saveJobDraft;workflow.saveAndStartWalkthrough=saveAndStartWalkthrough;workflow.ensureSession=ensureSession;workflow.quoteOptionalBeforeFinish=true;workflow.placeholderQuoteCreationStopped=true;workflow.__h38QuoteOptionalFix=true;return true;}
async function waitForFinishBuild(){for(let i=0;i<30;i+=1){if(window.H38_FIELD_VISIT_FINISH_BUILD?.finishAndBuild)return window.H38_FIELD_VISIT_FINISH_BUILD;await new Promise(resolve=>setTimeout(resolve,100));}return null;}
window.addEventListener('click',event=>{const target=event.target instanceof Element?event.target.closest('#fieldAttach'):null;if(!target||text(S.visit?.quoteId))return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();void(async()=>{target.disabled=true;const old=target.textContent;target.textContent='Creating quote…';try{await ensureDraftQuoteForVisit();const finish=await waitForFinishBuild();if(!finish?.finishAndBuild)throw Error('Quote Builder handoff is not ready.');await finish.finishAndBuild();}catch(error){C.toast(error?.message||String(error),true);}finally{target.disabled=false;target.textContent=old;}})();},true);
function install(attempt=0){if(!installWorkflow()&&attempt<80)setTimeout(()=>install(attempt+1),100);decorate();}
new MutationObserver(decorate).observe(document.documentElement,{childList:true,subtree:true});
install();
window.H38_SITE_VISIT_QUOTE_OPTIONAL={build:BUILD,ensureDraftQuoteForVisit,quoteOptionalUntilExplicitFinish:true,placeholderQuoteCreationStopped:true,existingQuotePreserved:true,explicitFinishCreatesQuote:true,sessionCanSaveWithoutQuote:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false};
})();

(function(){
'use strict';
async function purgeDynamicRepair(file){
  if(!window.caches?.keys)return;
  try{
    const names=await window.caches.keys();
    for(const name of names){
      if(!String(name).startsWith('h38-business-office-'))continue;
      const cache=await window.caches.open(name),requests=await cache.keys();
      for(const request of requests){
        try{if(new URL(request.url).pathname.endsWith(`/${file}`))await cache.delete(request);}catch(_){}
      }
    }
  }catch(error){console.warn('[H38 dynamic repair cache purge]',file,error?.message||error);}
}
window.H38_PURGE_DYNAMIC_REPAIR_CACHE=purgeDynamicRepair;
async function load(){
  await purgeDynamicRepair('site-visit-delete-runtime-repair.js');
  if(document.querySelector('script[data-h38-site-visit-delete-runtime-repair]'))return;
  const script=document.createElement('script');
  script.dataset.h38SiteVisitDeleteRuntimeRepair='1';
  script.src='./site-visit-delete-runtime-repair.js?build=20260818-play-delete-integrity-1';
  document.head.appendChild(script);
}
void load();
})();

(function(){
'use strict';
const BUILD='20260818-physical-work-list-delete-4';
async function load(){
  await window.H38_PURGE_DYNAMIC_REPAIR_CACHE?.('site-visit-work-list-delete-repair.js');
  if(window.H38_SITE_VISIT_WORK_LIST_DELETE_REPAIR||document.querySelector('script[data-h38-site-visit-work-list-delete-repair]'))return;
  const script=document.createElement('script');
  script.dataset.h38SiteVisitWorkListDeleteRepair='1';
  script.src=`./site-visit-work-list-delete-repair.js?build=${BUILD}`;
  document.head.appendChild(script);
}
function waitForDeleteAuthority(attempt=0){
  if(window.H38_SITE_VISIT_DELETE_RUNTIME_REPAIR){void load();return;}
  if(attempt<120)setTimeout(()=>waitForDeleteAuthority(attempt+1),100);
}
waitForDeleteAuthority();
})();

(function(){
'use strict';
const BUILD='20260818-work-site-visit-grouping-3-single-authority';
async function load(){
  await window.H38_PURGE_DYNAMIC_REPAIR_CACHE?.('site-visit-work-list-grouping-repair.js');
  if(window.H38_SITE_VISIT_WORK_LIST_GROUPING_REPAIR||document.querySelector('script[data-h38-site-visit-work-list-grouping-repair]'))return;
  const script=document.createElement('script');
  script.dataset.h38SiteVisitWorkListGroupingRepair='1';
  script.src=`./site-visit-work-list-grouping-repair.js?build=${BUILD}`;
  document.head.appendChild(script);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>void load(),{once:true});else void load();
})();