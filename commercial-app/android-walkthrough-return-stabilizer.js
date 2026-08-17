(function(){
'use strict';
const BUILD='20260816-android-return-atomic-1818';
const RESUME_KEY='h38:field-visit-resume-step';
const RETURN_KEY='h38:native-walkthrough-return-context-v2';
const RETRY_KEY='h38:native-walkthrough-launch-retry';
const DELETE_TOMBSTONE='H38_FIELD_VISIT_DELETE_TOMBSTONE';
const RETURN_GRACE_MS=30000;
const C=window.H38_FIELD_VISIT_CORE;
const DB=window.H38DB;
if(!C||!DB)return;
let busy=false;
const text=v=>String(v==null?'':v);
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key]}return''};
const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
const now=()=>new Date().toISOString();
function android(){return /H38SiteScannerAndroid\//.test(String(navigator.userAgent||''))||!!window.AndroidH38Native||!!window.H38NativeScanner}
function read(key){try{const raw=localStorage.getItem(key);if(!raw)return null;const item=JSON.parse(raw);return item&&item.visitId?item:null}catch(_){return null}}
function expected(){return read(RETURN_KEY)||read(RESUME_KEY)}
function age(item){return item?Date.now()-Number(item.mirroredAt||item.time||0):Infinity}
function protectedReturn(item=expected()){return !!(item?.visitId&&age(item)<RETURN_GRACE_MS)}
function clearResume(){try{localStorage.removeItem(RESUME_KEY)}catch(_){}try{localStorage.removeItem(RETURN_KEY)}catch(_){}try{sessionStorage.removeItem(RETRY_KEY)}catch(_){}}
function nativeInfo(){try{return JSON.parse(String(window.AndroidH38Native?.getRecoveredWalkthroughInfo?.()||'{}'))}catch(_){return{}}}
function nativePhotoInfo(){try{return JSON.parse(String(window.AndroidH38Native?.getRecoveredWalkthroughPhotosInfo?.()||'{}'))}catch(_){return{}}}
function nativeUrl(){try{return text(window.H38NativeScanner?.getRecoveredWalkthroughUrl?.()||window.AndroidH38Native?.getRecoveredWalkthroughUrl?.())}catch(_){return''}}
function nativeReady(){const info=nativeInfo(),photos=nativePhotoInfo();return !!nativeUrl()||info.ready===true&&Number(info.size||0)>0||photos.ready===true&&Number(photos.count||photos.photos?.length||0)>0}
function sameVisit(visit,item){if(!visit||!item?.visitId)return false;if(text(visit.visitId)!==text(item.visitId))return false;if(item.sessionId&&text(visit.sessionId)!==text(item.sessionId))return false;if(item.businessId&&text(visit.businessId)&&text(visit.businessId)!==text(item.businessId))return false;return true}
async function tombstoned(item){const all=await DB.all('drafts');return all.some(row=>{if(row?.kind!==DELETE_TOMBSTONE)return false;const root=row.visit||row,business=text(row.businessId||root.businessId),visitId=text(row.visitId||root.visitId||root.siteVisitId),sessionId=text(row.sessionId||root.sessionId||root.captureSessionId);if(item.businessId&&business&&text(item.businessId)!==business)return false;return visitId===text(item.visitId)||(item.sessionId&&sessionId===text(item.sessionId))})}
function matchingSession(item){if(!item?.sessionId)return null;return rows('siteCaptureSessions').find(row=>text(value(row,'Capture Session ID','captureSessionId'))===text(item.sessionId))||null}
function matchingDocuments(item){return rows('documents').filter(row=>{const sourceType=text(value(row,'Source Type','sourceType')).toLowerCase(),sourceId=text(value(row,'Source ID','sourceId')),sessionId=text(value(row,'Capture Session ID','captureSessionId'));if(sourceType!=='site visit')return false;return sourceId===text(item.visitId)||(item.sessionId&&sessionId===text(item.sessionId))})}
function measurementIds(item){if(!item?.sessionId)return[];return rows('siteMeasurements').filter(row=>text(value(row,'Capture Session ID','captureSessionId'))===text(item.sessionId)).map(row=>text(value(row,'Site Measurement ID','measurementId'))).filter(Boolean)}
function buildDraft(item,session){const docs=matchingDocuments(item),mime=row=>text(value(row,'Mime Type','mimeType')).toLowerCase(),name=row=>text(value(row,'File Name','fileName')).toLowerCase(),id=row=>text(value(row,'Document ID','documentId'));const images=docs.filter(row=>mime(row).startsWith('image/')),videos=docs.filter(row=>mime(row).startsWith('video/')),audios=docs.filter(row=>mime(row).startsWith('audio/')),frames=images.filter(row=>/walkthrough-.*-frame-|frame-\d+/.test(name(row))).map(id).filter(Boolean);const businessId=text(item.businessId||value(session,'Business ID','businessId')||C.business()),quoteId=text(item.quoteId||value(session,'Quote ID','quoteId')),created=text(value(session,'Started Time','startedAt','Created Time','createdAt')||now()),updated=text(value(session,'Updated Time','updatedAt')||now());return{id:`FIELD-VISIT:${businessId}:${quoteId||'UNASSIGNED'}`,kind:'H38_FIELD_VISIT',visitId:text(item.visitId),businessId,userId:text(value(session,'User ID','userId')||C.user()),customerId:text(item.customerId||value(session,'Customer ID','customerId')),quoteId,projectTitle:text(item.projectTitle||value(session,'Project Title','projectTitle')||'Recovered Site Visit'),projectType:text(value(session,'Project Type','projectType')||'Custom work area'),scope:text(value(session,'Scope','scope')),notes:'',sessionId:text(item.sessionId||value(session,'Capture Session ID','captureSessionId')),measurementIds:measurementIds(item),attachmentIds:images.map(id).filter(Boolean),walkthroughFrameIds:frames,replacedWalkthroughFrameIds:[],videoAttachmentIds:videos.map(id).filter(Boolean),walkthroughAudioAttachmentIds:audios.map(id).filter(Boolean),walkthroughSkipped:false,status:text(value(session,'Status','status')||'IN_PROGRESS'),createdAt:created,updatedAt:updated,recoveredForAndroidReturn:true,automaticApproval:false,automaticCustomerSending:false}}
async function restoreExpected(item=expected()){if(!item)return false;if(await tombstoned(item)){clearResume();return false}if(!sameVisit(C.state?.visit,item)){const drafts=await DB.all('drafts');let visit=drafts.find(row=>row?.kind==='H38_FIELD_VISIT'&&sameVisit(row,item));if(!visit){visit=buildDraft(item,matchingSession(item));await DB.put('drafts',visit)}C.state.visit=visit}C.state.open=true;C.state.tab='capture';document.body.classList.add('field-visit-open');try{await C.load?.()}catch(error){console.warn('[H38 atomic return] load deferred',error)}try{C.state.render?.()}catch(error){console.error('[H38 atomic return] render failed',error);return false}return sameVisit(C.state.visit,item)&&!!document.querySelector('.field-visit-app')}
async function stabilize(reason){if(!android()||busy)return false;const item=expected();if(!item)return false;busy=true;window.H38_NATIVE_RETURN_REPAIR_ACTIVE=true;try{if(nativeReady()||protectedReturn(item)){const ok=await restoreExpected(item);if(ok&&nativeReady()){setTimeout(()=>window.H38_ANDROID_NATIVE_WALKTHROUGH_GUARD?.recoverNow?.(),80);setTimeout(()=>window.H38_ANDROID_WALKTHROUGH_PHOTO_RECOVERY?.recoverNow?.(),180)}return ok}if(document.visibilityState==='visible'&&age(item)>=RETURN_GRACE_MS){clearResume();return false}return false}finally{busy=false;if(!nativeReady()&&!protectedReturn())window.H38_NATIVE_RETURN_REPAIR_ACTIVE=false}}
window.addEventListener('focus',()=>void stabilize('focus'));
window.addEventListener('pageshow',()=>void stabilize('pageshow'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void stabilize('visible-return')});
window.addEventListener('h38:native-scanner-ready',()=>void stabilize('native-ready'));
setTimeout(()=>void stabilize('startup'),120);
window.H38_ANDROID_WALKTHROUGH_RETURN_STABILIZER=Object.freeze({build:BUILD,exactRememberedVisitRecovery:true,persistentReturnContext:true,returnGraceMs:RETURN_GRACE_MS,focusCannotClearFreshContext:true,photoEvidenceCountsAsNativeReady:true,atomicFieldRestoreBeforeRecovery:true,staleResumeClearedOnReturn:true,serverSnapshotAssist:true,missingLocalDraftRebuilt:true,noBlindRenderTimer:true,noMutationObserver:true,noCameraAuthority:true,automaticApproval:false,automaticCustomerSending:false});
})();