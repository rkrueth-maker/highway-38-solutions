(function(){
'use strict';
const BUILD='20260809-0230';
const shared=window.H38_SUPABASE_SHARED_CLIENT;
const text=value=>String(value==null?'':value);
const now=()=>new Date().toISOString();
const NAV_ORDER=['today','work','customers','quotes','schedule','messages','field','documents','money','accounting','reports','people','inventory','fleet','payroll','tax','social','controls','ai','settings'];
const NAV_FALLBACK={today:['🏠','Today'],work:['🧰','Work'],customers:['👥','Customers'],quotes:['🧾','Quotes'],schedule:['📅','Schedule'],messages:['💬','Messages'],field:['📍','Field'],documents:['📁','Files'],money:['💵','Money'],accounting:['📚','Accounting'],reports:['📊','Reports'],people:['👤','People'],inventory:['📦','Inventory'],fleet:['🚚','Fleet'],payroll:['💰','Payroll'],tax:['🧾','Tax'],social:['📣','Social'],controls:['🛡️','Controls'],ai:['✨','H38 AI'],settings:['⚙️','Settings']};
let busyQuote=false,busyWalkthrough=false,lastNavSignature='';
function esc(value){return text(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function toast(message,bad){if(typeof window.toast==='function')window.toast(message,!!bad);else window.H38_FIELD_VISIT_CORE?.toast?.(message,!!bad);}
function pages(){try{return typeof window.allowedPages==='function'?window.allowedPages():[];}catch(_){return[];}}
function labelFor(key){try{if(typeof PAGE_DEFS!=='undefined'&&PAGE_DEFS[key])return PAGE_DEFS[key][1];}catch(_){}return NAV_FALLBACK[key]?.[1]||key;}
function iconFor(key){try{if(typeof PAGE_DEFS!=='undefined'&&PAGE_DEFS[key])return PAGE_DEFS[key][0];}catch(_){}return NAV_FALLBACK[key]?.[0]||'•';}
function renderScrollableNav(){
  const nav=document.getElementById('mainNav'),state=window.state;if(!nav||!state||state.shell!=='office')return;
  const allowed=new Set(pages()),keys=NAV_ORDER.filter(key=>allowed.has(key));
  const signature=`${state.page}|${keys.join(',')}`;
  if(signature===lastNavSignature&&!nav.querySelector('[data-h38-nav-action]'))return;
  lastNavSignature=signature;
  nav.classList.add('h38-operator-scroll-nav');
  nav.innerHTML=keys.map(key=>`<button type="button" data-page="${esc(key)}" class="${state.page===key?'active':''}"><span class="nav-icon">${iconFor(key)}</span><span>${esc(labelFor(key))}</span></button>`).join('');
  nav.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>window.openPage?.(button.dataset.page));
}
async function session(){const api=shared?.ensure?.();if(!api)throw Error('The secure Business Office connection is not ready.');const result=await api.auth.getSession();if(result.error)throw result.error;if(!result.data?.session?.user)throw Error('Sign in again before deleting.');return{api,user:result.data.session.user};}
async function removePending(tokens){if(!window.H38DB)return;const wanted=(tokens||[]).map(text).filter(Boolean);if(!wanted.length)return;for(const row of await window.H38DB.all('operations')){let hay='';try{hay=JSON.stringify(row);}catch(_){}if(wanted.some(token=>hay.includes(token)))await window.H38DB.remove('operations',row.id);}}
async function deleteQuote(){
  if(busyQuote)return;const quoteId=text(window.state?.quote?.quoteId);if(!quoteId){toast('Open a saved quote first.',true);return;}
  const row=(window.state?.snapshot?.quotes||[]).find(item=>text(item?.['Quote ID']||item?.quoteId)===quoteId)||{};
  const title=text(row['Project Title']||row.projectTitle||window.state?.quote?.projectTitle||'this quote');
  if(!confirm(`Delete “${title}”?\n\nThis deletes the quote only. The customer and Site Visit are kept.`))return;
  if(!navigator.onLine){toast('Connect to the internet to permanently delete this saved quote.',true);return;}
  busyQuote=true;try{
    const{api,user}=await session(),businessId=text(window.state?.businessId);
    const changed=await api.from('business_records').update({record_status:'deleted',updated_by:user.id,updated_at:now()}).eq('business_id',businessId).eq('collection','quotes').eq('record_key',quoteId);
    if(changed.error)throw changed.error;
    await removePending([quoteId]);
    if(Array.isArray(window.state?.snapshot?.quotes))window.state.snapshot.quotes=window.state.snapshot.quotes.filter(item=>text(item?.['Quote ID']||item?.quoteId)!==quoteId);
    try{await api.from('business_proof_log').insert({business_id:businessId,actor_user_id:user.id,action_type:'DELETE_QUOTE',entity_type:'Quote',entity_id:null,result:'PASS',details:{quoteId,customerDeleted:false,siteVisitDeleted:false,ownerInitiated:true,automaticApproval:false,automaticCustomerSending:false},external_action_occurred:false});}catch(_){}
    window.state.quote={quoteId:'',lines:[],hydrationComplete:true};
    toast('Quote deleted. Customer and Site Visit kept.');window.renderQuotes?.();
  }catch(error){toast(error?.message||String(error),true);}finally{busyQuote=false;}
}
function addDeleteQuoteButton(){
  const save=document.getElementById('saveQuoteButton'),quoteId=text(window.state?.quote?.quoteId);if(!save||!quoteId)return;
  if(document.getElementById('deleteQuoteButton'))return;
  const button=document.createElement('button');button.id='deleteQuoteButton';button.type='button';button.className='secondary h38-direct-delete';button.textContent='Delete Quote';button.onclick=()=>void deleteQuote();
  save.insertAdjacentElement('afterend',button);
}
async function deleteOldWalkthrough(){
  if(busyWalkthrough)return;const C=window.H38_FIELD_VISIT_CORE,v=C?.state?.visit;if(!C||!v)return;
  const videos=Array.isArray(v.videoAttachmentIds)?v.videoAttachmentIds.filter(Boolean):[];if(!videos.length){C.toast('No saved walkthrough to delete.',true);return;}
  const videoId=videos[0],audioId=text(v.walkthroughAudioByVideo?.[videoId]),onlyOne=videos.length===1,frameIds=onlyOne?[...(v.walkthroughFrameIds||[]),...(v.replacedWalkthroughFrameIds||[])]:[],ids=Array.from(new Set([videoId,audioId,...frameIds].filter(Boolean)));
  if(!confirm(`Delete the ${videos.length>1?'oldest ':'saved '}walkthrough?\n\nThe walkthrough video${audioId?', its private audio':''}${onlyOne?', and its extracted walkthrough frames':''} will be deleted. Manually taken detail photos stay.`))return;
  busyWalkthrough=true;try{
    const businessId=text(v.businessId||C.business()),visitId=text(v.visitId),locals=[];
    for(const id of ids){const local=await window.H38DB.get('attachments',id);if(local)locals.push(local);await window.H38DB.remove('attachments',id);}
    await removePending(ids);
    v.videoAttachmentIds=videos.filter(id=>id!==videoId);
    if(Array.isArray(v.walkthroughAudioAttachmentIds))v.walkthroughAudioAttachmentIds=v.walkthroughAudioAttachmentIds.filter(id=>id!==audioId);
    if(v.walkthroughAudioByVideo)delete v.walkthroughAudioByVideo[videoId];
    if(onlyOne){v.walkthroughFrameIds=[];v.replacedWalkthroughFrameIds=[];v.attachmentIds=(v.attachmentIds||[]).filter(id=>!frameIds.includes(id));}
    await C.saveDraft?.();
    if(navigator.onLine){
      const{api,user}=await session(),rows=await api.from('business_records').select('record_key,payload').eq('business_id',businessId).eq('collection','documents').limit(500);if(rows.error)throw rows.error;
      const wanted=new Set(ids),matches=(rows.data||[]).filter(row=>wanted.has(text(row.record_key))||wanted.has(text(row.payload?.['Document ID']||row.payload?.documentId))||wanted.has(text(row.payload?.['Original Document ID']||row.payload?.originalDocumentId))),paths=Array.from(new Set([...locals.map(x=>text(x.storagePath)),...matches.map(row=>text(row.payload?.['Storage Path']||row.payload?.storagePath))].filter(Boolean))),keys=Array.from(new Set(matches.map(row=>row.record_key).filter(Boolean)));
      if(paths.length){const removed=await api.storage.from('business-office-files').remove(paths);if(removed.error)throw removed.error;}
      if(keys.length){const removed=await api.from('business_records').delete().eq('business_id',businessId).eq('collection','documents').in('record_key',keys);if(removed.error)throw removed.error;}
      try{await api.from('business_proof_log').insert({business_id:businessId,actor_user_id:user.id,action_type:'DELETE_SITE_WALKTHROUGH',entity_type:'Site Visit',entity_id:null,result:'PASS',details:{visitId,videoAttachmentId:videoId,attachmentIds:ids,manualDetailPhotosPreserved:true,ownerInitiated:true,automaticApproval:false,automaticCustomerSending:false},external_action_occurred:false});}catch(_){}
      C.toast('Walkthrough deleted. Detail photos kept.');
    }else C.toast('Walkthrough removed from this phone. Reconnect before relying on the server copy being deleted.',true);
    C.state.render?.();
  }catch(error){C.toast(error?.message||String(error),true);}finally{busyWalkthrough=false;}
}
function addWalkthroughDeleteButton(){
  const app=document.getElementById('h38FieldVisitApp'),C=window.H38_FIELD_VISIT_CORE,v=C?.state?.visit;if(!app||!v)return;
  const videos=Array.isArray(v.videoAttachmentIds)?v.videoAttachmentIds.filter(Boolean):[];if(!videos.length)return;
  const record=app.querySelector('#fieldWalkthrough');if(!record||app.querySelector('#fieldDeleteWalkthrough'))return;
  const button=document.createElement('button');button.id='fieldDeleteWalkthrough';button.type='button';button.className='field-secondary h38-direct-delete';button.textContent=videos.length>1?'Delete Old Walkthrough':'Delete Saved Walkthrough';button.onclick=()=>void deleteOldWalkthrough();record.insertAdjacentElement('afterend',button);
}
function decorate(){renderScrollableNav();addDeleteQuoteButton();addWalkthroughDeleteButton();}
const style=document.createElement('style');style.textContent=`
.h38-direct-delete{border-color:#a32828!important;color:#8f1f1f!important;font-weight:900!important}
@media(max-width:760px){body.h38-flow-tightening .main-nav.h38-operator-scroll-nav{display:flex!important;overflow-x:auto!important;overflow-y:hidden!important;scroll-snap-type:x proximity;justify-content:flex-start!important;gap:4px!important;-webkit-overflow-scrolling:touch;scrollbar-width:none}body.h38-flow-tightening .main-nav.h38-operator-scroll-nav::-webkit-scrollbar{display:none}body.h38-flow-tightening .main-nav.h38-operator-scroll-nav button{flex:0 0 76px!important;min-width:76px!important;max-width:76px!important;scroll-snap-align:start;padding:5px 3px!important}.field-walkthrough-recorder{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:#000!important;color:#fff!important;z-index:2147483647!important}.field-walkthrough-recorder::backdrop{background:#000!important}.field-walkthrough-recorder-shell{display:grid!important;grid-template-rows:auto minmax(0,1fr) auto auto!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;background:#000!important}.field-walkthrough-recorder header{padding:max(10px,env(safe-area-inset-top)) 12px 8px!important}.field-walkthrough-camera{position:relative!important;min-height:0!important;background:#000!important}.field-walkthrough-camera video{display:block!important;width:100%!important;height:100%!important;object-fit:cover!important;background:#000!important}.field-walkthrough-recorder-help{padding:8px 12px!important;background:#0b2438!important;color:#fff!important}.field-walkthrough-recorder footer{position:relative!important;display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;padding:10px 12px calc(10px + env(safe-area-inset-bottom))!important;background:#0b2438!important}.field-walkthrough-recorder footer button{min-height:58px!important;font-size:1rem!important}.field-walkthrough-recorder footer #fieldWalkthroughCancel{grid-column:1/-1!important;min-height:44px!important}}
`;document.head.appendChild(style);
const observer=new MutationObserver(()=>decorate());observer.observe(document.documentElement,{childList:true,subtree:true});
setInterval(decorate,700);setTimeout(decorate,0);setTimeout(decorate,1200);
window.H38_OPERATOR_DIRECT_CONTROLS={build:BUILD,deleteQuote,deleteOldWalkthrough,scrollableBottomNav:true,plusLauncher:false,fullScreenWalkthroughRecorder:true,directQuoteDelete:true,directWalkthroughDelete:true};
})();
