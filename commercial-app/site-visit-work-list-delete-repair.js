(function(){
'use strict';
const BUILD='20260818-physical-work-list-delete-2';
const DB=window.H38DB;
const shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!DB)return;
const REPAIR_TOMBSTONE='H38_SITE_VISIT_DELETE_REPAIR_TOMBSTONE';
const LEGACY_TOMBSTONE='H38_FIELD_VISIT_DELETE_TOMBSTONE';
const pendingSessionIds=new Set();
const rowSession=new WeakMap();
let decorateScheduled=false;
let markerLoadBusy=false;
const text=value=>String(value==null?'':value).trim();
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const normalize=value=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const sessionId=row=>text(value(row,'Capture Session ID','captureSessionId','sessionId'));
const businessId=row=>text(value(row,'Business ID','businessId')||window.state?.businessId);
const projectTitle=row=>text(value(row,'Project Title','projectTitle')||'Site Visit');
const sessionTime=row=>text(value(row,'Updated Time','updatedAt','Completed Time','completedAt','Started Time','startedAt','Created Time','createdAt'));
function toast(message,bad){try{window.toast?.(message,!!bad);}catch(_){try{window.H38_FIELD_VISIT_CORE?.toast?.(message,!!bad);}catch(__){}}}
function isWorkPage(){return text(window.state?.page)==='work'&&!!document.getElementById('mainContent');}
function snapshots(){
  const rows=Array.isArray(window.state?.snapshot?.siteCaptureSessions)?window.state.snapshot.siteCaptureSessions:[];
  return rows.filter(row=>sessionId(row)).slice().sort((a,b)=>sessionTime(b).localeCompare(sessionTime(a)));
}
function sourceFromSession(row){
  return{
    businessId:businessId(row),
    sessionId:sessionId(row),
    captureSessionId:sessionId(row),
    quoteId:text(value(row,'Quote ID','quoteId')),
    customerId:text(value(row,'Customer ID','customerId')),
    projectTitle:projectTitle(row),
    projectType:text(value(row,'Project Type','projectType')),
    scope:text(value(row,'Scope','scope')),
    status:text(value(row,'Status','status')),
    createdAt:text(value(row,'Started Time','startedAt','Created Time','createdAt')),
    updatedAt:sessionTime(row),
    recoveredFromServerSession:true,
    automaticApproval:false,
    automaticCustomerSending:false
  };
}
function markerSession(row){return text(row?.sessionId||row?.captureSessionId||row?.visit?.sessionId||row?.visit?.captureSessionId||row?.visit?.['Capture Session ID']);}
async function loadPendingMarkers(){
  if(markerLoadBusy)return;markerLoadBusy=true;
  try{
    const drafts=await DB.all('drafts');
    for(const row of drafts){
      if(![REPAIR_TOMBSTONE,LEGACY_TOMBSTONE].includes(row?.kind))continue;
      const sid=markerSession(row);if(sid)pendingSessionIds.add(sid);
    }
    suppressPendingSnapshot();scheduleDecorate();
  }catch(error){console.warn('[H38 physical Site Visit list delete] pending marker load:',error?.message||error);}finally{markerLoadBusy=false;}
}
function suppressPendingSnapshot(){
  const snapshot=window.state?.snapshot;if(!snapshot||!Array.isArray(snapshot.siteCaptureSessions)||!pendingSessionIds.size)return;
  snapshot.siteCaptureSessions=snapshot.siteCaptureSessions.filter(row=>!pendingSessionIds.has(sessionId(row)));
}
function actionButtons(row){return Array.from(row?.querySelectorAll?.('button')||[]);}
function isVisitDomRow(row){
  const labels=actionButtons(row).map(button=>normalize(button.textContent));
  return labels.some(label=>label==='open'||label.includes('open edit'))&&labels.some(label=>label==='delete'||label.startsWith('delete '));
}
function deleteButton(row){return actionButtons(row).find(button=>{const label=normalize(button.textContent);return label==='delete'||label.startsWith('delete ');})||null;}
function titleForDomRow(row){return normalize(row?.querySelector?.('strong')?.textContent||'');}
function mapDomRows(){
  if(!isWorkPage())return;
  suppressPendingSnapshot();
  const main=document.getElementById('mainContent');
  const domRows=Array.from(main.querySelectorAll('.row')).filter(isVisitDomRow);
  if(!domRows.length)return;
  const sessions=snapshots(),used=new Set();
  for(const row of domRows){
    const title=titleForDomRow(row);
    let match=sessions.find(item=>!used.has(sessionId(item))&&title&&normalize(projectTitle(item))===title);
    if(!match)match=sessions.find(item=>!used.has(sessionId(item))&&title&&(normalize(projectTitle(item)).includes(title)||title.includes(normalize(projectTitle(item)))));
    if(!match)continue;
    const sid=sessionId(match);used.add(sid);rowSession.set(row,match);
    row.dataset.h38SiteVisitSessionId=sid;
    const button=deleteButton(row);if(button){button.dataset.h38SiteVisitSessionId=sid;button.dataset.h38PhysicalListDelete=BUILD;}
    if(pendingSessionIds.has(sid))row.remove();
  }
}
function scheduleDecorate(){if(decorateScheduled)return;decorateScheduled=true;setTimeout(()=>{decorateScheduled=false;mapDomRows();},20);}
async function secureSourceFence(source){
  const sid=text(source?.sessionId),bid=text(source?.businessId||window.state?.businessId);
  if(!sid||!bid)throw Error('This Site Visit does not have a secure capture-session identity. Reopen it before deleting.');
  const recovery=window.H38_SUPABASE_SESSION_RECOVERY;
  if(recovery?.validate){const valid=await recovery.validate();if(valid===false)throw Error('Secure session needs sign-in before deleting this Site Visit.');}
  const api=shared?.ensure?.();if(!api)throw Error('Secure Business Office connection is not ready.');
  const sessionResult=await api.auth.getSession();if(sessionResult.error)throw sessionResult.error;
  const user=sessionResult.data?.session?.user;if(!user)throw Error('Sign in again before deleting this Site Visit.');
  const changed=await api.from('business_records').update({record_status:'deleted',updated_by:user.id,updated_at:new Date().toISOString()})
    .eq('business_id',bid).eq('collection','siteCaptureSessions').eq('record_key',sid).eq('record_status','active').select('record_key');
  if(changed.error)throw changed.error;
  const verify=await api.from('business_records').select('record_key').eq('business_id',bid).eq('collection','siteCaptureSessions').eq('record_key',sid).eq('record_status','active').maybeSingle();
  if(verify.error)throw verify.error;
  if(verify.data)throw Error('The secure Site Visit source record is still active. Nothing was removed from this list.');
  return true;
}
function authority(){const owner=window.H38_FIELD_VISIT_OWNER_CONTROLS;return owner&&typeof owner.deleteDraft==='function'&&owner.playDeleteIntegrityRepair===true?owner:null;}
async function deleteMappedRow(button,row,session){
  const sid=sessionId(session),source=sourceFromSession(session),owner=authority();
  if(!owner)throw Error('Secure Site Visit delete controls are still loading. Try again in a moment.');
  button.disabled=true;button.textContent='Deleting…';
  try{
    if(navigator.onLine)await secureSourceFence(source);
    pendingSessionIds.add(sid);suppressPendingSnapshot();
    const outcome=await owner.deleteDraft(source,{confirmed:true});
    if(!outcome?.deleted)throw Error('Site Visit delete did not complete.');
    row.remove();
    if(typeof window.renderWork==='function')setTimeout(()=>window.renderWork(),30);
    return outcome;
  }catch(error){
    if(!pendingSessionIds.has(sid)){button.disabled=false;button.textContent='Delete';button.dataset.h38DeleteArmedUntil='0';}
    throw error;
  }
}
function captureDelete(event){
  if(!isWorkPage())return;
  const button=event.target instanceof Element?event.target.closest('button'):null;if(!button)return;
  const row=button.closest('.row');if(!row||!isVisitDomRow(row)||button!==deleteButton(row))return;
  const session=rowSession.get(row);if(!session||!sessionId(session))return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  const now=Date.now(),armed=Number(button.dataset.h38DeleteArmedUntil||0);
  if(armed<=now){
    button.dataset.h38DeleteArmedUntil=String(now+5000);button.textContent='Tap Again to Delete';
    toast('Tap again within 5 seconds to delete this Site Visit. Its linked customer and quote stay.');
    setTimeout(()=>{if(Number(button.dataset.h38DeleteArmedUntil||0)<=Date.now()&&button.isConnected){button.textContent='Delete';button.dataset.h38DeleteArmedUntil='0';}},5100);
    return;
  }
  button.dataset.h38DeleteArmedUntil='0';
  void deleteMappedRow(button,row,session).catch(error=>toast(`Could not delete Site Visit: ${error?.message||error}`,true));
}
document.addEventListener('click',captureDelete,true);
new MutationObserver(scheduleDecorate).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('pageshow',()=>{void loadPendingMarkers();scheduleDecorate();});
window.addEventListener('focus',scheduleDecorate);
window.addEventListener('online',()=>{void window.H38_FIELD_VISIT_OWNER_CONTROLS?.flushTombstones?.();setTimeout(()=>void loadPendingMarkers(),100);});
setInterval(()=>{scheduleDecorate();},750);
setTimeout(()=>{void loadPendingMarkers();scheduleDecorate();},0);
window.H38_SITE_VISIT_WORK_LIST_DELETE_REPAIR=Object.freeze({
  build:BUILD,
  physicalFailureBoundary:'Jobs Site Visit list delete',
  serverSessionFenceBeforeLocalRemoval:true,
  captureSessionIdentityRequired:true,
  workListDeleteUsesOwnerAuthority:true,
  twoTapDelete:true,
  pendingDeleteRowsSuppressed:true,
  linkedQuoteDeleted:false,
  linkedCustomerDeleted:false,
  automaticApproval:false,
  automaticCustomerSending:false,
  physicalAndroidAcceptanceRequired:true
});
})();
