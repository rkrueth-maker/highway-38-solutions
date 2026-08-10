(function(){
'use strict';
const BUILD='20260810-one-tap-notes-1228';
const RESUME_KEY='h38:field-visit-resume-step';
const RETRY_KEY='h38:native-walkthrough-launch-retry';
const C=window.H38_FIELD_VISIT_CORE;
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
const shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!C)return;
const text=v=>String(v==null?'':v);
function android(){return /H38SiteScannerAndroid\//.test(String(navigator.userAgent||''))||!!window.AndroidH38Native;}
function visit(){return C.state?.visit||null;}
function latestVideo(){const ids=visit()?.videoAttachmentIds||[];return text(ids[ids.length-1]);}
function hammer(message){try{window.H38_WORKING_HAMMER?.start?.(message);}catch(_){}}
function unhammer(){try{window.H38_WORKING_HAMMER?.stop?.();}catch(_){}}
function toast(message,bad){try{if(typeof window.toast==='function')window.toast(message,!!bad);else C.toast?.(message,!!bad);}catch(_){}}
function remembered(){try{const raw=localStorage.getItem(RESUME_KEY);if(!raw)return false;const value=JSON.parse(raw);return Date.now()-Number(value?.time||0)<120000;}catch(_){return false;}}
function recovered(){try{return text(window.AndroidH38Native?.getRecoveredWalkthroughUrl?.()||window.H38NativeScanner?.getRecoveredWalkthroughUrl?.());}catch(_){return'';}}
function launchWhenBridgeReady(){
 if(!android()||!remembered()||recovered())return;
 const v=visit();if(!v||!C.state?.open||C.state?.tab!=='capture')return;
 let last=0;try{last=Number(sessionStorage.getItem(RETRY_KEY)||0);}catch(_){}
 if(Date.now()-last<4000)return;
 const bridge=window.AndroidH38Native;
 if(!bridge?.launchWalkthroughCapture)return;
 try{sessionStorage.setItem(RETRY_KEY,String(Date.now()));}catch(_){}
 try{bridge.launchWalkthroughCapture();toast('Opening H38 walkthrough camera…');}catch(error){toast(error?.message||'The H38 walkthrough camera could not open.',true);}
}
window.addEventListener('h38:native-scanner-ready',()=>setTimeout(launchWhenBridgeReady,40));
window.addEventListener('pageshow',()=>setTimeout(launchWhenBridgeReady,80));
window.addEventListener('focus',()=>setTimeout(launchWhenBridgeReady,80));

function supabaseClient(){if(shared?.ensure)return shared.ensure();if(!window.supabase||!cfg.enabled)return null;return window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});}
async function auth(forceRefresh=false){const api=supabaseClient();if(!api)throw Error('Secure Business Office connection is not ready.');let result=await api.auth.getSession();if(result.error)throw result.error;let session=result.data?.session;if(!session)throw Error('Sign in again before processing walkthrough notes.');if(forceRefresh||Number(session.expires_at||0)*1000<Date.now()+120000){const refreshed=await api.auth.refreshSession();if(refreshed.error||!refreshed.data?.session)throw Error(refreshed.error?.message||'Secure session could not be refreshed.');session=refreshed.data.session;}return{api,session};}
function voiceState(){const v=visit();if(!v)return null;if(!v.walkthroughVoice)v.walkthroughVoice={status:'WAITING',attachmentId:'',audioAttachmentId:'',transcript:'',cleanNotes:[],customerRequests:[],siteConditions:[],unknowns:[],spokenMeasurements:[],message:'',updatedAt:''};return v.walkthroughVoice;}
async function persist(){const s=voiceState();if(s)s.updatedAt=new Date().toISOString();await C.saveDraft?.();C.state.render?.();}
async function synced(videoId){if(!navigator.onLine)throw Error('Walkthrough notes will process automatically when this phone is online.');await window.H38_FIELD_VISIT_VIDEO?.syncPending?.();const local=await window.H38DB?.get?.('attachments',videoId);if(local&&text(local.syncStatus).toUpperCase()!=='SYNCED')throw Error('The walkthrough is still saving privately. H38 will create the notes when sync finishes.');const waiting=await window.H38_FIELD_VISIT_RECOVERY?.waitingOperations?.()||[];if(waiting.length){await window.H38_FIELD_VISIT_RECOVERY?.syncNow?.();const remaining=await window.H38_FIELD_VISIT_RECOVERY?.waitingOperations?.()||[];if(remaining.length)throw Error('The Site Visit is still syncing. H38 will create the notes when it finishes.');}}
async function request(videoId,forceRefresh=false){const a=await auth(forceRefresh),v=visit();const response=await fetch(`${cfg.url}/functions/v1/h38-walkthrough-transcription`,{method:'POST',mode:'cors',cache:'no-store',credentials:'omit',headers:{authorization:`Bearer ${a.session.access_token}`,apikey:cfg.publishableKey,'content-type':'application/json','x-client-info':'h38-site-visit-notes-v4'},body:JSON.stringify({businessId:v?.businessId||window.state?.businessId,captureSessionId:v?.sessionId,quoteId:v?.quoteId||'',attachmentId:videoId,audioAttachmentId:''})});const payload=await response.json().catch(()=>({}));return{response,payload};}
function apply(payload,videoId){const v=visit(),s=voiceState(),notes=payload?.notes||{};if(!v||!s)return;s.status='COMPLETE';s.message='Professional walkthrough notes ready.';s.attachmentId=videoId;s.audioAttachmentId=text(payload?.audioAttachmentId);s.transcript=text(payload?.transcript);s.cleanNotes=Array.isArray(notes.cleanNotes)?notes.cleanNotes:[];s.customerRequests=Array.isArray(notes.customerRequests)?notes.customerRequests:[];s.siteConditions=Array.isArray(notes.siteConditions)?notes.siteConditions:[];s.unknowns=Array.isArray(notes.unknowns)?notes.unknowns:[];s.spokenMeasurements=Array.isArray(notes.spokenMeasurements)?notes.spokenMeasurements:[];v.walkthroughTranscript=s.transcript;v.walkthroughVoiceNotes=s.cleanNotes;v.walkthroughSpokenMeasurements=s.spokenMeasurements;v.walkthroughProfessionalNotes={summary:s.cleanNotes,customerRequests:s.customerRequests,siteConditions:s.siteConditions,unknowns:s.unknowns,spokenMeasurements:s.spokenMeasurements,spokenMeasurementVerification:'UNVERIFIED_SPOKEN'};v.walkthroughTranscriptStatus='COMPLETE';v.walkthroughTranscriptAttachmentId=videoId;}
let running=null;
async function ensure(force=false){if(running)return running;running=(async()=>{const v=visit(),videoId=latestVideo(),s=voiceState();if(!v||!videoId||!v.sessionId||!s)return true;if(!navigator.onLine)return false;if(!force&&s.status==='COMPLETE'&&s.attachmentId===videoId)return true;s.attachmentId=videoId;s.status='SYNCING';s.message='Saving the walkthrough before creating notes…';hammer('Saving walkthrough evidence…');await persist();try{await synced(videoId);s.status='TRANSCRIBING';s.message='Turning what you said into professional Site Visit notes…';hammer('Creating walkthrough notes…');await persist();let attempt=await request(videoId,false);if(attempt.response.status===401)attempt=await request(videoId,true);if(!attempt.response.ok||attempt.payload?.status!=='PASS')throw Error(attempt.payload?.message||`Walkthrough note processing failed (${attempt.response.status}).`);apply(attempt.payload,videoId);await persist();toast('Professional Site Visit notes are ready.');return true;}catch(error){s.status='FAILED';s.message=text(error?.message||error);await persist();toast(s.message,true);return true;}finally{unhammer();}})().finally(()=>{running=null;});return running;}
function installNotesOverride(){const existing=window.H38_FIELD_VISIT_TRANSCRIPTION;if(!existing)return false;if(existing.__h38SiteVisitFirstFix)return true;existing.ensure=ensure;existing.build=`${text(existing.build)}+${BUILD}`;existing.siteVisitFirst=true;existing.quoteOptional=true;existing.__h38SiteVisitFirstFix=true;return true;}
function install(){if(!installNotesOverride())setTimeout(install,120);else if(latestVideo()&&voiceState()?.status!=='COMPLETE')setTimeout(()=>void ensure(true),400);}
install();
window.H38_SITE_VISIT_PHONE_FINAL_FIX={build:BUILD,oneTapNativeLaunchRetry:true,siteVisitFirstNotes:true,quoteOptional:true,automaticApproval:false,automaticCustomerSending:false};
})();
