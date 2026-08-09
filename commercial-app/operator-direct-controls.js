(function(){
'use strict';
const BUILD='20260809-0245';
const shared=window.H38_SUPABASE_SHARED_CLIENT;
const text=value=>String(value==null?'':value);
const now=()=>new Date().toISOString();
let busyQuote=false,busyWalkthrough=false;
function toast(message,bad){if(typeof window.toast==='function')window.toast(message,!!bad);else window.H38_FIELD_VISIT_CORE?.toast?.(message,!!bad);}
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
  window.state.quote={quoteId:'',lines:[],hydrationComplete:true};toast('Quote deleted. Customer and Site Visit kept.');window.renderQuotes?.();
 }catch(error){toast(error?.message||String(error),true);}finally{busyQuote=false;}
}
function addDeleteQuoteButton(){
 if(text(window.state?.page)!=='quotes')return;const quoteId=text(window.state?.quote?.quoteId);if(!quoteId)return;if(document.getElementById('deleteQuoteButton'))return;
 const tools=document.querySelector('#mainContent .page-tools')||document.querySelector('.page-tools');if(!tools)return;
 const button=document.createElement('button');button.id='deleteQuoteButton';button.type='button';button.className='secondary h38-direct-delete';button.textContent='Delete Quote';button.onclick=()=>void deleteQuote();tools.appendChild(button);
}
async function currentWalkthroughIds(){
 const C=window.H38_FIELD_VISIT_CORE,v=C?.state?.visit;if(!C||!v)return[];const ids=new Set((v.videoAttachmentIds||[]).map(text).filter(Boolean));
 if(window.H38DB){for(const row of await window.H38DB.all('attachments')){const visitId=text(v.visitId),sessionId=text(v.sessionId),sameVisit=visitId&&text(row?.relatedRecordId||row?.visitId)===visitId,sameSession=sessionId&&text(row?.captureSessionId||row?.sessionId)===sessionId,mime=text(row?.mimeType).toLowerCase();if((sameVisit||sameSession)&&mime.startsWith('video/'))ids.add(text(row?.attachmentId||row?.id));}}
 return Array.from(ids).filter(Boolean);
}
async function deleteOldWalkthrough(){
 if(busyWalkthrough)return;const C=window.H38_FIELD_VISIT_CORE,v=C?.state?.visit;if(!C||!v)return;const videos=await currentWalkthroughIds();if(!videos.length){C.toast('No saved walkthrough to delete.',true);return;}
 const videoId=videos[0],audioId=text(v.walkthroughAudioByVideo?.[videoId]),onlyOne=videos.length===1,frameIds=onlyOne?[...(v.walkthroughFrameIds||[]),...(v.replacedWalkthroughFrameIds||[])]:[],ids=Array.from(new Set([videoId,audioId,...frameIds].filter(Boolean)));
 if(!confirm(`Delete the ${videos.length>1?'oldest ':'saved '}walkthrough?\n\nThe walkthrough video${audioId?', its private audio':''}${onlyOne?', and its extracted walkthrough frames':''} will be deleted. Manually taken detail photos stay.`))return;
 busyWalkthrough=true;try{
  const businessId=text(v.businessId||C.business()),visitId=text(v.visitId),locals=[];
  for(const id of ids){const local=await window.H38DB?.get('attachments',id);if(local)locals.push(local);await window.H38DB?.remove('attachments',id);}await removePending(ids);
  v.videoAttachmentIds=(v.videoAttachmentIds||[]).filter(id=>id!==videoId);if(Array.isArray(v.walkthroughAudioAttachmentIds))v.walkthroughAudioAttachmentIds=v.walkthroughAudioAttachmentIds.filter(id=>id!==audioId);if(v.walkthroughAudioByVideo)delete v.walkthroughAudioByVideo[videoId];if(onlyOne){v.walkthroughFrameIds=[];v.replacedWalkthroughFrameIds=[];v.attachmentIds=(v.attachmentIds||[]).filter(id=>!frameIds.includes(id));}await C.saveDraft?.();
  if(navigator.onLine){const{api,user}=await session(),rows=await api.from('business_records').select('record_key,payload').eq('business_id',businessId).eq('collection','documents').limit(500);if(rows.error)throw rows.error;const wanted=new Set(ids),matches=(rows.data||[]).filter(row=>wanted.has(text(row.record_key))||wanted.has(text(row.payload?.['Document ID']||row.payload?.documentId))||wanted.has(text(row.payload?.['Original Document ID']||row.payload?.originalDocumentId))),paths=Array.from(new Set([...locals.map(x=>text(x.storagePath)),...matches.map(row=>text(row.payload?.['Storage Path']||row.payload?.storagePath))].filter(Boolean))),keys=Array.from(new Set(matches.map(row=>row.record_key).filter(Boolean)));if(paths.length){const removed=await api.storage.from('business-office-files').remove(paths);if(removed.error)throw removed.error;}if(keys.length){const removed=await api.from('business_records').delete().eq('business_id',businessId).eq('collection','documents').in('record_key',keys);if(removed.error)throw removed.error;}try{await api.from('business_proof_log').insert({business_id:businessId,actor_user_id:user.id,action_type:'DELETE_SITE_WALKTHROUGH',entity_type:'Site Visit',entity_id:null,result:'PASS',details:{visitId,videoAttachmentId:videoId,attachmentIds:ids,manualDetailPhotosPreserved:true,ownerInitiated:true,automaticApproval:false,automaticCustomerSending:false},external_action_occurred:false});}catch(_){}C.toast('Walkthrough deleted. Detail photos kept.');}else C.toast('Walkthrough removed from this phone. Server cleanup will finish when online.',true);
  C.state.render?.();
 }catch(error){C.toast(error?.message||String(error),true);}finally{busyWalkthrough=false;}
}
async function addWalkthroughDeleteButton(){
 const app=document.getElementById('h38FieldVisitApp');if(!app||app.querySelector('#fieldDeleteWalkthrough'))return;const record=app.querySelector('#fieldWalkthrough');if(!record)return;const videos=await currentWalkthroughIds();if(!videos.length)return;const button=document.createElement('button');button.id='fieldDeleteWalkthrough';button.type='button';button.className='field-secondary h38-direct-delete';button.textContent=videos.length>1?'Delete Old Walkthrough':'Delete Saved Walkthrough';button.onclick=()=>void deleteOldWalkthrough();record.insertAdjacentElement('afterend',button);
}
function forceRecorderVisible(){
 const recorder=document.getElementById('fieldWalkthroughRecorder');if(!recorder)return;
 recorder.style.setProperty('position','fixed','important');recorder.style.setProperty('inset','0','important');recorder.style.setProperty('width','100vw','important');recorder.style.setProperty('height','100dvh','important');recorder.style.setProperty('max-width','none','important');recorder.style.setProperty('max-height','none','important');recorder.style.setProperty('margin','0','important');recorder.style.setProperty('padding','0','important');recorder.style.setProperty('border','0','important');recorder.style.setProperty('background','#000','important');recorder.style.setProperty('z-index','2147483647','important');
 const shell=recorder.querySelector('.field-walkthrough-recorder-shell');if(shell){shell.style.setProperty('display','grid','important');shell.style.setProperty('grid-template-rows','auto minmax(0,1fr) auto auto','important');shell.style.setProperty('width','100%','important');shell.style.setProperty('height','100%','important');}
 const camera=recorder.querySelector('.field-walkthrough-camera');if(camera){camera.style.setProperty('min-height','0','important');camera.style.setProperty('position','relative','important');}
 const video=recorder.querySelector('video');if(video){video.style.setProperty('display','block','important');video.style.setProperty('width','100%','important');video.style.setProperty('height','100%','important');video.style.setProperty('object-fit','cover','important');}
 const footer=recorder.querySelector('footer');if(footer){footer.style.setProperty('display','grid','important');footer.style.setProperty('grid-template-columns','1fr 1fr','important');footer.style.setProperty('gap','8px','important');footer.style.setProperty('padding','10px 12px calc(10px + env(safe-area-inset-bottom))','important');footer.style.setProperty('background','#0b2438','important');}
 if(recorder.tagName==='DIALOG'&&!recorder.open){setTimeout(()=>{if(recorder.isConnected&&!recorder.open){try{recorder.showModal();}catch(_){recorder.setAttribute('open','');}}},350);}document.documentElement.classList.add('h38-recorder-open');document.body.classList.add('h38-recorder-open');
}
function cleanupRecorderClass(){if(!document.getElementById('fieldWalkthroughRecorder')){document.documentElement.classList.remove('h38-recorder-open');document.body.classList.remove('h38-recorder-open');}}
function decorate(){addDeleteQuoteButton();void addWalkthroughDeleteButton();forceRecorderVisible();cleanupRecorderClass();}
const style=document.createElement('style');style.textContent=`.h38-direct-delete{border-color:#a32828!important;color:#8f1f1f!important;font-weight:900!important}html.h38-recorder-open,body.h38-recorder-open{overflow:hidden!important}.field-walkthrough-recorder{box-sizing:border-box!important}.field-walkthrough-recorder header{padding:max(10px,env(safe-area-inset-top)) 12px 8px!important;background:#0b2438!important;color:#fff!important}.field-walkthrough-recorder-help{padding:8px 12px!important;background:#0b2438!important;color:#fff!important}.field-walkthrough-recorder footer button{min-height:58px!important;font-size:1rem!important}.field-walkthrough-recorder footer #fieldWalkthroughCancel{grid-column:1/-1!important;min-height:44px!important}`;document.head.appendChild(style);
const observer=new MutationObserver(decorate);observer.observe(document.documentElement,{childList:true,subtree:true});setInterval(decorate,500);setTimeout(decorate,0);setTimeout(decorate,900);
window.H38_OPERATOR_DIRECT_CONTROLS={build:BUILD,deleteQuote,deleteOldWalkthrough,directQuoteDelete:true,directWalkthroughDelete:true,forceRecorderVisible:true};
})();
