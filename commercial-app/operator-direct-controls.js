(function(){
'use strict';
if(window.__H38_OPERATOR_DIRECT_CONTROLS_INSTALLED)return;
window.__H38_OPERATOR_DIRECT_CONTROLS_INSTALLED=true;
const BUILD='20260810-recovery-rebuild-0236';
const shared=window.H38_SUPABASE_SHARED_CLIENT;
const DB=window.H38DB;
const text=value=>String(value==null?'':value);
const now=()=>new Date().toISOString();
const esc=value=>typeof window.esc==='function'?window.esc(value):text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let decorating=false,busyQuote=false;
function officeState(){try{return typeof state!=='undefined'?state:(window.state||null)}catch(_){return window.state||null}}
function C(){return window.H38_FIELD_VISIT_CORE;}
function rows(name){return Array.isArray(officeState()?.snapshot?.[name])?officeState().snapshot[name]:[];}
function val(row,...keys){for(const key of keys)if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];return'';}
function rid(row,...keys){return text(val(row,...keys));}
function toastMessage(message,bad){try{if(typeof window.toast==='function')window.toast(message,!!bad);else C()?.toast?.(message,!!bad)}catch(_){}}
function android(){return /H38SiteScannerAndroid\//.test(text(navigator.userAgent))||!!window.AndroidH38Native||!!window.H38NativeScanner?.getRecoveredWalkthroughUrl;}
function apple(){return /iPad|iPhone|iPod/.test(text(navigator.userAgent))||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
function businessId(){return text(officeState()?.businessId||C()?.business?.());}
function customerName(id){const row=rows('customers').find(x=>rid(x,'Customer ID','customerId')===text(id));return text(val(row,'Customer Name','customerName','name')||'No customer');}
async function auth(){const api=shared?.ensure?.();if(!api)throw Error('The secure Business Office connection is not ready.');const result=await api.auth.getSession();if(result.error)throw result.error;if(!result.data?.session?.user)throw Error('Sign in again before deleting.');return{api,user:result.data.session.user};}
async function removePending(tokens){if(!DB)return;const wanted=(tokens||[]).map(text).filter(Boolean);if(!wanted.length)return;for(const row of await DB.all('operations')){let hay='';try{hay=JSON.stringify(row)}catch(_){}if(wanted.some(token=>hay.includes(token)))await DB.remove('operations',row.id);}}
async function deleteQuoteById(quoteId){
  if(busyQuote)return;quoteId=text(quoteId);if(!quoteId)return;
  const s=officeState(),row=rows('quotes').find(item=>rid(item,'Quote ID','quoteId')===quoteId)||{},title=text(val(row,'Project Title','projectTitle')||'this quote');
  if(!confirm(`Delete “${title}”?\n\nThis deletes the quote only. The customer and Site Visit are kept.`))return;
  if(!navigator.onLine){toastMessage('Connect to the internet to permanently delete this saved quote.',true);return;}
  busyQuote=true;
  try{
    const{api,user}=await auth(),bid=businessId(),changed=await api.from('business_records').update({record_status:'deleted',updated_by:user.id,updated_at:now()}).eq('business_id',bid).eq('collection','quotes').eq('record_key',quoteId);
    if(changed.error)throw changed.error;
    await removePending([quoteId]);
    if(Array.isArray(s?.snapshot?.quotes))s.snapshot.quotes=s.snapshot.quotes.filter(item=>rid(item,'Quote ID','quoteId')!==quoteId);
    try{await api.from('business_proof_log').insert({business_id:bid,actor_user_id:user.id,action_type:'DELETE_QUOTE',entity_type:'Quote',entity_id:null,result:'PASS',details:{quoteId,customerDeleted:false,siteVisitDeleted:false,ownerInitiated:true,automaticApproval:false,automaticCustomerSending:false},external_action_occurred:false})}catch(_){}
    if(text(s?.quote?.quoteId)===quoteId)s.quote={quoteId:'',lines:[],hydrationComplete:true};
    toastMessage('Quote deleted. Customer and Site Visit kept.');
    try{if(s?.page==='quotes'&&typeof renderQuotes==='function')renderQuotes();else window.renderQuotes?.()}catch(_){}
  }catch(error){toastMessage(error?.message||String(error),true)}finally{busyQuote=false}
}
function quoteDeletes(){
  const s=officeState();
  document.querySelectorAll('[data-open-quote]').forEach(open=>{
    const id=text(open.dataset.openQuote),actions=open.closest('.row-actions');if(!id||!actions)return;
    let button=actions.querySelector(`[data-delete-quote-row="${CSS.escape(id)}"]`);
    if(!button){button=document.createElement('button');button.type='button';button.className='secondary h38-direct-delete';button.dataset.deleteQuoteRow=id;button.textContent='Delete';button.onclick=event=>{event.preventDefault();event.stopPropagation();void deleteQuoteById(id)};actions.appendChild(button)}
    if(!/open\s*\/\s*edit/i.test(text(open.textContent)))open.textContent='Open / Edit';
  });
  const quoteId=text(s?.quote?.quoteId),save=document.getElementById('saveQuoteButton');
  if(save&&quoteId){let button=document.getElementById('deleteQuoteButton');if(!button){button=document.createElement('button');button.id='deleteQuoteButton';button.type='button';button.className='secondary h38-direct-delete';button.textContent='Delete Quote';button.onclick=()=>void deleteQuoteById(text(officeState()?.quote?.quoteId));save.insertAdjacentElement('afterend',button)}}
  else document.getElementById('deleteQuoteButton')?.remove();
}
function visitIdentity(row){return{businessId:text(row?.businessId||row?.['Business ID']||businessId()),visitId:text(row?.visitId||row?.siteVisitId||row?.['Site Visit ID']),sessionId:text(row?.sessionId||row?.captureSessionId||row?.['Capture Session ID']),quoteId:text(row?.quoteId||row?.['Quote ID']),customerId:text(row?.customerId||row?.['Customer ID'])};}
function visitKey(row){const i=visitIdentity(row);return i.sessionId||i.visitId||`${i.quoteId}:${text(row?.projectTitle||row?.['Project Title'])}`;}
function isLocalVisit(row){const kind=text(row?.kind).toUpperCase(),id=text(row?.id).toUpperCase();return kind==='H38_FIELD_VISIT'||id.startsWith('FIELD-VISIT:')||!!row?.visitId||!!row?.sessionId;}
async function localVisits(){if(!DB)return[];const bid=businessId(),all=await DB.all('drafts');return all.filter(row=>isLocalVisit(row)&&text(visitIdentity(row).businessId)===bid&&text(row?.status).toUpperCase()!=='CLOSED'&&!/DELETE_TOMBSTONE/.test(text(row?.kind).toUpperCase()));}
async function allSiteVisits(){
  const map=new Map();
  for(const row of rows('siteCaptureSessions')){const key=visitKey(row);if(key)map.set(key,row)}
  for(const row of await localVisits()){const key=visitKey(row);if(key)map.set(key,row)}
  return Array.from(map.values()).sort((a,b)=>text(val(b,'Updated Time','updatedAt','Created Time','createdAt')).localeCompare(text(val(a,'Updated Time','updatedAt','Created Time','createdAt'))));
}
async function matchingLocal(source){const key=visitKey(source),locals=await localVisits();return locals.find(row=>visitKey(row)===key)||null;}
async function localAttachmentsFor(source){if(!DB)return[];const i=visitIdentity(source),all=await DB.all('attachments');return all.filter(row=>{if(text(row?.businessId)&&text(row.businessId)!==i.businessId)return false;return(i.visitId&&text(row?.relatedRecordId||row?.visitId)===i.visitId)||(i.sessionId&&text(row?.captureSessionId||row?.sessionId)===i.sessionId);});}
async function normalizeVisit(source){
  const local=await matchingLocal(source);if(local)return local;
  const i=visitIdentity(source),attachments=await localAttachmentsFor(source),firstVisitId=text(attachments.find(row=>row?.relatedRecordId)?.relatedRecordId),visitId=i.visitId||firstVisitId||(i.sessionId?`VISIT-${i.sessionId}`:`VISIT-${crypto.randomUUID().toUpperCase()}`),videos=attachments.filter(row=>text(row?.mimeType).toLowerCase().startsWith('video/')).map(row=>text(row?.attachmentId||row?.id)).filter(Boolean),images=attachments.filter(row=>text(row?.mimeType).toLowerCase().startsWith('image/')).map(row=>text(row?.attachmentId||row?.id)).filter(Boolean),title=text(val(source,'Project Title','projectTitle')||'Site visit'),projectType=text(val(source,'Project Type','projectType')||'Custom work area'),status=text(val(source,'Status','status')||'IN_PROGRESS'),created=text(val(source,'Created Time','createdAt','Started Time')||now());
  const draft={kind:'H38_FIELD_VISIT',visitId,businessId:i.businessId,customerId:i.customerId,quoteId:i.quoteId,projectTitle:title,projectType,scope:text(val(source,'Scope','scope')),notes:text(val(source,'Transcript','notes')),sessionId:i.sessionId,measurementIds:rows('siteMeasurements').filter(row=>rid(row,'Capture Session ID','captureSessionId')===i.sessionId).map(row=>rid(row,'Site Measurement ID','measurementId')).filter(Boolean),attachmentIds:images,videoAttachmentIds:videos,walkthroughFrameIds:images.filter(id=>attachments.find(row=>text(row?.attachmentId||row?.id)===id)?.walkthroughFrame===true),walkthroughSkipped:false,status:/CLOSED/i.test(status)?'CLOSED':'IN_PROGRESS',createdAt:created,updatedAt:now(),automaticApproval:false,automaticCustomerSending:false};
  return draft;
}
async function stageVisitForOpen(source){
  if(!DB)throw Error('Local Site Visit storage is unavailable.');
  const draft=await normalizeVisit(source);draft.updatedAt=now();
  const id=text(draft.id)||`FIELD-VISIT:${draft.businessId}:${draft.visitId||draft.sessionId||draft.quoteId||crypto.randomUUID().toUpperCase()}`;
  await DB.put('drafts',{...draft,id,kind:'H38_FIELD_VISIT'});
  return draft;
}
async function openSiteVisit(source){
  try{
    const draft=await stageVisitForOpen(source),field=window.H38_FIELD_VISIT;
    if(!field?.open)throw Error('Site Visit workspace is still loading.');
    await field.open({quoteId:text(draft.quoteId),customerId:text(draft.customerId)});
  }catch(error){toastMessage(error?.message||String(error),true)}
}
async function deleteSiteVisit(source){
  try{
    const row=await normalizeVisit(source),controls=window.H38_FIELD_VISIT_OWNER_CONTROLS;
    if(!controls?.deleteDraft)throw Error('Site Visit delete controls are still loading.');
    await controls.deleteDraft(row);
    setTimeout(()=>void decorate(),100);
  }catch(error){toastMessage(error?.message||String(error),true)}
}
async function siteVisitManager(){
  const s=officeState(),main=document.getElementById('mainContent');if(!main||!['field','work'].includes(text(s?.page)))return;
  const visits=await allSiteVisits();
  let card=document.getElementById('h38SiteVisitManager');
  if(!card){card=document.createElement('section');card.id='h38SiteVisitManager';card.className='card h38-site-visit-manager';const head=main.querySelector('.page-head');if(head)head.insertAdjacentElement('afterend',card);else main.prepend(card)}
  card.innerHTML=`<div class="h38-manager-head"><div><h2>Site Visits</h2><p>Open, edit or delete a Site Visit directly. You do not have to open a broken visit before deleting it.</p></div><button type="button" class="primary" id="h38ManagerNewVisit">Start Site Visit</button></div><div class="list">${visits.length?visits.map((row,index)=>{const i=visitIdentity(row),title=text(val(row,'Project Title','projectTitle')||'Site visit'),status=text(val(row,'Status','status')||'Draft'),updated=text(val(row,'Updated Time','updatedAt','Created Time','createdAt','Started Time'));return`<div class="row h38-site-visit-row"><div class="row-top"><strong>${esc(title)}</strong><span class="pill">${esc(status)}</span></div><small>${esc(customerName(i.customerId))}${i.quoteId?' · linked quote kept':''}${updated?` · ${esc(new Date(updated).toLocaleString())}`:''}</small><div class="row-actions"><button type="button" data-h38-open-site="${index}">Open / Edit</button><button type="button" class="secondary h38-direct-delete" data-h38-delete-site="${index}">Delete</button></div></div>`}).join(''):'<div class="empty">No Site Visits yet.</div>'}</div>`;
  card.querySelector('#h38ManagerNewVisit')?.addEventListener('click',()=>window.H38_FIELD_VISIT?.open?.({customerId:'',quoteId:''}));
  card.querySelectorAll('[data-h38-open-site]').forEach(button=>button.onclick=()=>void openSiteVisit(visits[Number(button.dataset.h38OpenSite)]));
  card.querySelectorAll('[data-h38-delete-site]').forEach(button=>button.onclick=()=>void deleteSiteVisit(visits[Number(button.dataset.h38DeleteSite)]));
}
function activeVisitDelete(){
  const app=document.getElementById('h38FieldVisitApp'),visit=C()?.state?.visit;if(!app||!visit)return;
  const header=app.querySelector('.field-visit-header');if(!header)return;
  let button=app.querySelector('#fieldDeleteSiteVisit');
  if(!button){button=document.createElement('button');button.id='fieldDeleteSiteVisit';button.type='button';button.className='field-delete-site-visit';button.textContent='Delete Site Visit';button.onclick=()=>void deleteSiteVisit(C()?.state?.visit);const sync=header.querySelector('#fieldSync');if(sync)sync.insertAdjacentElement('beforebegin',button);else header.appendChild(button)}
}
function appleWalkthrough(event){
  if(!apple()||android())return false;
  const button=event.target?.closest?.('#fieldWalkthrough');if(!button)return false;
  const input=document.getElementById('fieldVideoInput');
  event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();
  if(!input){toastMessage('The iPhone walkthrough camera is still loading.',true);return true;}
  try{input.click();toastMessage('Opening iPhone video capture. Camera and microphone audio stay in this same walkthrough.')}catch(error){toastMessage(error?.message||String(error),true)}
  return true;
}
async function decorate(){if(decorating)return;decorating=true;try{quoteDeletes();activeVisitDelete();await siteVisitManager()}finally{decorating=false}}
document.addEventListener('click',event=>{appleWalkthrough(event)},true);
const style=document.createElement('style');style.textContent=`.h38-direct-delete,.field-delete-site-visit{border-color:#a32828!important;color:#8f1f1f!important;font-weight:900!important}.h38-site-visit-manager{margin:0 0 14px}.h38-manager-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.h38-manager-head h2{margin:0}.h38-manager-head p{margin:.25rem 0 0;color:#52616d}.h38-site-visit-row .row-actions{display:flex;gap:8px;flex-wrap:wrap}.field-delete-site-visit{background:#fff!important;border:1px solid #a32828!important;border-radius:10px!important;min-height:42px!important;padding:6px 8px!important;font-size:.72rem!important;line-height:1.05!important;max-width:86px}@media(max-width:620px){.h38-manager-head{display:grid}.h38-manager-head .primary{width:100%}.h38-site-visit-row .row-actions button{flex:1;min-height:44px}}`;document.head.appendChild(style);
const observer=new MutationObserver(()=>void decorate());observer.observe(document.documentElement,{childList:true,subtree:true});setInterval(()=>void decorate(),900);setTimeout(()=>void decorate(),0);setTimeout(()=>void decorate(),700);
window.H38_OPERATOR_DIRECT_CONTROLS={build:BUILD,deleteQuoteById,deleteSiteVisit,openSiteVisit,directQuoteDelete:true,directSiteVisitDelete:true,rowDeleteBesideOpenEdit:true,androidWalkthroughAuthority:'android-native-walkthrough-guard',iphoneWalkthroughAuthority:'native-video-input',webViewRecorderAuthority:false,sharedSiteVisitState:true,automaticApproval:false,automaticCustomerSending:false};
})();
