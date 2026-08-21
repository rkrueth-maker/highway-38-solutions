(function(){
'use strict';
const BUILD='20260821-site-visit-identity-write-fence-final-1';
const C=window.H38_FIELD_VISIT_CORE;
const DB=window.H38DB;
if(!C)return;
const text=value=>String(value==null?'':value).trim();
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const normalize=value=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
const sid=row=>text(value(row,'Capture Session ID','captureSessionId','sessionId'));
const qid=row=>text(value(row,'Quote ID','quoteId'));
const visitId=row=>text(value(row,'Site Visit ID','siteVisitId','visitId'));
const customerId=row=>text(value(row,'Customer ID','customerId'));
const title=row=>text(value(row,'Project Title','projectTitle'));
const scope=row=>text(value(row,'Scope','scope'));
const projectType=row=>text(value(row,'Project Type','projectType'));
const sessionTime=row=>text(value(row,'Updated Time','updatedAt','Completed Time','completedAt','Started Time','startedAt','Created Time','createdAt'));
const docId=row=>text(value(row,'Document ID','documentId'));
const mime=row=>text(value(row,'Mime Type','mimeType')).toLowerCase();
const fileName=row=>text(value(row,'File Name','fileName')).toLowerCase();
const sourceType=row=>text(value(row,'Source Type','sourceType')).toLowerCase();
const sourceId=row=>text(value(row,'Source ID','sourceId'));
const docSession=row=>text(value(row,'Capture Session ID','captureSessionId'));
function sessions(){return rows('siteCaptureSessions').filter(row=>sid(row));}
function quoteById(id){return rows('quotes').find(row=>qid(row)===text(id))||null;}
function unique(list){return list.length===1?list[0]:null;}
function sessionById(id){return unique(sessions().filter(row=>sid(row)===text(id)));}
function sessionByVisit(id){return unique(sessions().filter(row=>visitId(row)&&visitId(row)===text(id)));}
function sessionByQuote(id){return unique(sessions().filter(row=>qid(row)&&qid(row)===text(id)));}
function sessionByTitle(name){const key=normalize(name);return key?unique(sessions().filter(row=>normalize(title(row))===key)):null;}
function resolve(opts={}){
  const explicitSession=text(opts.captureSessionId||opts.sessionId);if(explicitSession){const found=sessionById(explicitSession);if(found)return found;}
  const explicitVisit=text(opts.siteVisitId||opts.visitId);if(explicitVisit){const found=sessionByVisit(explicitVisit);if(found)return found;}
  const explicitQuote=text(opts.quoteId);if(explicitQuote){const found=sessionByQuote(explicitQuote);if(found)return found;}
  const explicitTitle=text(opts.projectTitle);if(explicitTitle){const found=sessionByTitle(explicitTitle);if(found)return found;}
  return null;
}
function documentsFor(session){const sessionId=sid(session),vId=visitId(session);return rows('documents').filter(row=>sourceType(row)==='site visit'&&((sessionId&&docSession(row)===sessionId)||(vId&&sourceId(row)===vId)));}
function canonical(session){
  const sessionId=sid(session),quoteId=qid(session),docs=documentsFor(session),images=docs.filter(row=>mime(row).startsWith('image/')),videos=docs.filter(row=>mime(row).startsWith('video/')),audios=docs.filter(row=>mime(row).startsWith('audio/'));
  const exactVisit=visitId(session)||text(sourceId(videos[0]||audios[0]||images[0]))||`VISIT-RECOVERED-${sessionId}`;
  const frames=images.filter(row=>/walkthrough-.*-frame-|frame-\d+/.test(fileName(row))).map(docId).filter(Boolean);
  const measurements=rows('siteMeasurements').filter(row=>text(value(row,'Capture Session ID','captureSessionId'))===sessionId);
  const transcript=text(value(session,'Walkthrough Transcript','walkthroughTranscript','Transcript','transcript'));
  const transcriptStatus=text(value(session,'Walkthrough Transcript Status','walkthroughTranscriptStatus')).toUpperCase();
  return{
    id:`FIELD-VISIT:${text(value(session,'Business ID','businessId')||C.business())}:${quoteId||'UNASSIGNED'}`,
    kind:'H38_FIELD_VISIT',visitId:exactVisit,businessId:text(value(session,'Business ID','businessId')||C.business()),userId:text(value(session,'User ID','userId')||C.user()),customerId:customerId(session),quoteId,
    projectTitle:title(session)||'Recovered Site Visit',projectType:projectType(session)||'Custom work area',scope:scope(session),notes:'',sessionId,
    measurementIds:measurements.map(row=>text(value(row,'Site Measurement ID','measurementId'))).filter(Boolean),attachmentIds:images.map(docId).filter(Boolean),walkthroughFrameIds:frames,replacedWalkthroughFrameIds:[],videoAttachmentIds:videos.map(docId).filter(Boolean),walkthroughAudioAttachmentIds:audios.map(docId).filter(Boolean),
    walkthroughTranscript:transcript,walkthroughVoice:{status:transcriptStatus==='COMPLETE'?'COMPLETE':(transcriptStatus||'WAITING'),message:'Recovered from the authoritative Site Visit session.'},walkthroughSkipped:false,
    status:text(value(session,'Status','status')||'IN_PROGRESS'),createdAt:text(value(session,'Started Time','startedAt','Created Time','createdAt'))||sessionTime(session),updatedAt:sessionTime(session),recoveredFromServerSession:true,identityAuthorityBuild:BUILD,automaticApproval:false,automaticCustomerSending:false
  };
}
async function applyCanonical(session){
  const recovered=canonical(session);C.state.visit=recovered;C.state.open=true;C.state.tab='capture';document.body.classList.add('field-visit-open');
  if(DB)try{await DB.put('drafts',recovered);}catch(error){console.warn('[H38 Site Visit identity] draft recovery:',error?.message||error);}
  await C.load?.();C.state.render?.();return recovered;
}
function installOpen(){const api=window.H38_FIELD_VISIT;if(!api||typeof api.open!=='function'||api.open.__h38IdentityWriteFence)return false;const base=api.open;const wrapped=async function(opts={}){const session=resolve(opts);const result=await base.apply(this,arguments);if(session)await applyCanonical(session);return result;};wrapped.__h38IdentityWriteFence=true;wrapped.__h38IdentityWriteFenceBase=base;api.open=wrapped;return true;}
function openButton(button){const label=normalize(button?.textContent);return label==='open'||label==='open edit'||label.startsWith('open edit ');}
function rowSession(row){
  const dataset=[row,...Array.from(row.querySelectorAll('button'))].reduce((out,node)=>Object.assign(out,node?.dataset||{}),{});
  const hinted=text(dataset.h38SiteVisitSessionId||dataset.captureSessionId||dataset.sessionId);if(hinted){const found=sessionById(hinted);if(found)return found;}
  const strong=text(row.querySelector('strong')?.textContent);return sessionByTitle(strong);
}
function captureOpen(event){const button=event.target instanceof Element?event.target.closest('button'):null;if(!button||!openButton(button))return;const row=button.closest('.row');if(!row)return;const session=rowSession(row);if(!session)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();installOpen();void window.H38_FIELD_VISIT?.open?.({captureSessionId:sid(session),sessionId:sid(session),siteVisitId:visitId(session),visitId:visitId(session),quoteId:qid(session),customerId:customerId(session),projectTitle:title(session),scope:scope(session)});}
function installWriteFence(){const current=window.queueOperation;if(typeof current!=='function'||current.__h38SiteVisitIdentityWriteFence)return false;const wrapped=async function(){const args=Array.from(arguments),action=text(args[0]).toUpperCase(),payload=args[3],meta=args[4],collection=text(payload?.entity||meta?.collection).toLowerCase();if(action==='SAVE_ENTITY'&&collection==='quotes'){
    const record=payload?.record||meta?.record||{},quoteId=text(value(record,'Quote ID','quoteId')||args[2]),linked=sessionByQuote(quoteId),visit=C.state?.visit;
    if(linked&&C.state?.open){const linkedSid=sid(linked),activeSid=text(visit?.sessionId);if(!activeSid||activeSid!==linkedSid)throw Error('This quote belongs to a saved Site Visit. Reopen the authoritative Site Visit before changing it.');
      const safe=Object.assign({},record,{'Customer ID':customerId(linked),'Project Title':title(linked),'Scope':scope(linked)||text(value(record,'Scope','scope')),'Site Visit ID':visitId(linked)||text(value(record,'Site Visit ID','siteVisitId')),'Site Scanner Session ID':linkedSid,'Updated Time':new Date().toISOString()});
      if(payload?.record)args[3]=Object.assign({},payload,{record:safe});if(meta?.record)args[4]=Object.assign({},meta,{record:safe});
    }
  }return current.apply(this,args);};wrapped.__h38SiteVisitIdentityWriteFence=true;wrapped.__h38SiteVisitIdentityWriteFenceBase=current;window.queueOperation=wrapped;return true;}
function reconcileLocalAliases(){if(text(window.state?.page)!=='work')return 0;const main=document.getElementById('mainContent');if(!main)return 0;const visitRows=Array.from(main.querySelectorAll('.row')).filter(row=>Array.from(row.querySelectorAll('button')).some(openButton));const groups=new Map();for(const row of visitRows){const session=rowSession(row);if(!session)continue;const key=sid(session);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({row,session,local:/\bLOCAL[_ -]?DRAFT\b/i.test(text(row.textContent))});}
  let removed=0;for(const items of groups.values()){if(items.length<2)continue;items.sort((a,b)=>Number(a.local)-Number(b.local));const keep=items[0];keep.row.dataset.h38SiteVisitSessionId=sid(keep.session);for(const item of items.slice(1)){if(item.local&&item.row.isConnected){item.row.remove();removed++;}}}return removed;}
let observer=null,timer=0;function arm(){installOpen();installWriteFence();if(text(window.state?.page)!=='work'){observer?.disconnect();observer=null;return;}const main=document.getElementById('mainContent');if(!main)return;observer?.disconnect();observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(reconcileLocalAliases,30);});observer.observe(main,{childList:true,subtree:true});reconcileLocalAliases();}
document.addEventListener('click',captureOpen,true);document.addEventListener('click',event=>{const button=event.target instanceof Element?event.target.closest('[data-h38-primary="work"],button'):null;if(button&&(/\bjobs\b/i.test(text(button.textContent))||button?.dataset?.h38Primary==='work'))setTimeout(arm,0);},true);
window.addEventListener('h38:business-snapshot-updated',()=>{installOpen();installWriteFence();if(text(window.state?.page)==='work')arm();});
[0,100,350,900,1800,3600,7000].forEach(delay=>setTimeout(()=>{installOpen();installWriteFence();if(text(window.state?.page)==='work')arm();},delay));
window.H38_SITE_VISIT_IDENTITY_WRITE_FENCE_FINAL=Object.freeze({enabled:true,build:BUILD,authoritativeSessionBeforeOpen:true,linkedQuoteIdentityWriteFence:true,sessionlessLocalDraftCannotMutateLinkedQuote:true,canonicalEvidenceRecovery:true,localAliasSuppression:true,distinctServerSessionsPreserved:true,serverEvidenceNeverDeleted:true,automaticApproval:false,automaticCustomerSending:false,physicalAndroidAcceptanceRequired:true});
})();