(function(){
'use strict';
const BUILD='20260808-2115';
const C=window.H38_FIELD_VISIT_CORE;
const recovery=window.H38_FIELD_VISIT_RECOVERY;
const reviewer=window.H38_FIELD_VISIT_PHOTO_REVIEW;
if(!C)return;
let reviewBusy=false,syncBusy=false,syncTimer=0,lastAttemptKey='';
const text=v=>String(v==null?'':v);
const esc=v=>typeof C.esc==='function'?C.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function visit(){return C.state.visit||null}
function state(){const v=visit();if(!v)return null;if(!v.walkthroughAi)v.walkthroughAi={status:'WAITING',message:'',review:null,recommendedPhotos:[],missingMeasurements:[],evidenceKey:'',updatedAt:''};return v.walkthroughAi}
function unique(items){const out=[];for(const item of items.map(text).map(x=>x.trim()).filter(Boolean)){if(!out.some(x=>x.toLowerCase()===item.toLowerCase()))out.push(item)}return out}
function photoRecommendations(review){
  const items=[];
  const confidence=text(review?.confidence).toLowerCase();
  if(confidence==='low')items.push('Take one wider photo from the opposite side of the work area so H38 can confirm the overall layout.');
  for(const risk of Array.isArray(review?.risksAndClearances)?review.risksAndClearances.slice(0,3):[])items.push(`Take a close-up that clearly shows: ${text(risk)}`);
  for(const assumption of Array.isArray(review?.assumptions)?review.assumptions.slice(0,2):[])items.push(`Take a photo that confirms or disproves this assumption: ${text(assumption)}`);
  if(!items.length&&confidence==='low')items.push('Take a clear close-up of the main work area or problem condition.');
  return unique(items).slice(0,4);
}
function evidenceKey(){const v=visit();if(!v)return'';return [v.sessionId,(v.videoAttachmentIds||[]).length,(v.walkthroughFrameIds||[]).length,(v.attachmentIds||[]).length,(v.measurementIds||[]).length,text(v.notes).length,text(v.scope).length].join('|')}
async function persist(){const s=state();if(!s)return;s.updatedAt=new Date().toISOString();await C.saveDraft?.()}
async function setPhotoReviewState(status){const s=state();if(!s)return;s.status=status==='RUNNING'?'ANALYZING':status;s.message=status==='RUNNING'?'H38 is reviewing the walkthrough frames, scope and saved measurements…':'';await persist();C.state.render?.()}
async function failPhotoReview(message){const s=state();if(!s)return;s.status='FAILED';s.message=text(message);s.evidenceKey=evidenceKey();await persist();C.state.render?.()}
async function applyPhotoReview(review){const s=state();if(!s)return;s.status='COMPLETE';s.message='Walkthrough review complete.';s.review=review||{};s.recommendedPhotos=photoRecommendations(review||{});s.missingMeasurements=unique(Array.isArray(review?.missingMeasurements)?review.missingMeasurements:[]).slice(0,8);s.evidenceKey=evidenceKey();lastAttemptKey=s.evidenceKey;await persist();C.state.render?.()}
window.H38_FIELD_VISIT_GUIDANCE={build:BUILD,setPhotoReviewState,failPhotoReview,applyPhotoReview,walkthroughFirst:true};
async function drain(){
  if(syncBusy||!navigator.onLine||!recovery?.syncNow)return false;
  const waiting=await recovery.waitingOperations?.()||[];
  if(!waiting.length)return true;
  syncBusy=true;
  try{await recovery.syncNow();const left=await recovery.waitingOperations?.()||[];return !left.length}
  finally{syncBusy=false}
}
function scheduleSync(delay=500){clearTimeout(syncTimer);syncTimer=setTimeout(()=>void drain().then(ok=>{if(ok)void maybeReview()}),delay)}
async function maybeReview(force=false){
  const v=visit(),s=state();if(!v||!s||reviewBusy||!reviewer?.run||!navigator.onLine)return;
  const frames=(v.walkthroughFrameIds||[]).length,videos=(v.videoAttachmentIds||[]).length,key=evidenceKey();
  if(!videos||!frames||!v.quoteId||!v.sessionId)return;
  if(!force&&s.status==='COMPLETE'&&s.evidenceKey===key)return;
  if(!force&&lastAttemptKey===key&&s.status==='ANALYZING')return;
  lastAttemptKey=key;reviewBusy=true;s.status='SYNCING';s.message='Uploading walkthrough evidence before analysis…';await persist();C.state.render?.();
  try{
    await window.H38_FIELD_VISIT_VIDEO?.syncPending?.();
    const synced=await drain();
    if(!synced)throw Error('Some walkthrough evidence is still waiting to sync. H38 will retry automatically while you stay online.');
    s.status='ANALYZING';s.message='H38 is analyzing the walkthrough and deciding what still needs a photo or measurement.';await persist();C.state.render?.();
    await reviewer.run();
  }catch(error){await failPhotoReview(error?.message||String(error))}
  finally{reviewBusy=false}
}
function guidanceCard(){
  const v=visit(),s=state();if(!v||!s||(v.videoAttachmentIds||[]).length===0)return'';
  const photoList=s.recommendedPhotos||[],measureList=s.missingMeasurements||[];
  if(['WAITING','SYNCING','ANALYZING'].includes(s.status))return `<section id="fieldWalkthroughAi" class="field-card field-ai-guidance"><div class="field-ai-head"><span>✨</span><div><strong>H38 walkthrough review</strong><small>${esc(s.message||'Preparing walkthrough analysis…')}</small></div></div></section>`;
  if(s.status==='FAILED')return `<section id="fieldWalkthroughAi" class="field-card field-ai-guidance"><div class="field-ai-head"><span>⚠</span><div><strong>Walkthrough review needs another try</strong><small>${esc(s.message||'Analysis could not finish.')}</small></div></div><button id="fieldAiRetry" class="field-secondary" type="button">Retry analysis</button></section>`;
  if(s.status!=='COMPLETE')return'';
  return `<section id="fieldWalkthroughAi" class="field-card field-ai-guidance"><div class="field-ai-head"><span>✨</span><div><strong>H38 walkthrough review</strong><small>${esc(text(s.review?.confidence||'low'))} confidence · owner review required</small></div></div><div class="field-ai-section"><strong>Photos still needed</strong>${photoList.length?`<ol>${photoList.map(x=>`<li>${esc(x)}</li>`).join('')}</ol><button id="fieldAiPhoto" class="field-secondary" type="button">📷 Add requested photo</button>`:'<p>No additional detail photos are recommended from the current walkthrough.</p>'}</div><div class="field-ai-section"><strong>Measurements still needed</strong>${measureList.length?`<ol>${measureList.map(x=>`<li>${esc(x)}</li>`).join('')}</ol><button id="fieldAiMeasure" class="field-secondary" type="button">📐 Enter next measurement</button>`:'<p>No additional critical measurements were identified from the current evidence.</p>'}</div><button id="fieldAiRetry" class="field-link" type="button">Reanalyze current evidence</button></section>`
}
function decorate(){
  const app=document.getElementById('h38FieldVisitApp');if(!app)return;
  const capture=app.querySelector('.field-panel.active')||app.querySelector('.field-panel');
  const stage=app.querySelector('[data-field-walkthrough-stage]');if(!stage)return;
  app.querySelector('#fieldWalkthroughAi')?.remove();stage.insertAdjacentHTML('afterend',guidanceCard());
  app.querySelector('#fieldAiRetry')?.addEventListener('click',()=>void maybeReview(true));
  app.querySelector('#fieldAiPhoto')?.addEventListener('click',()=>document.getElementById('fieldPhotoInput')?.click());
  app.querySelector('#fieldAiMeasure')?.addEventListener('click',()=>{
    const request=state()?.missingMeasurements?.[0];const form=document.getElementById('fieldManual');if(!request||!form)return;
    const details=form.closest('details');if(details)details.open=true;
    if(form.elements?.label)form.elements.label.value=text(request).split(/[.;]/)[0].replace(/^measure\s+/i,'').slice(0,110)||'Requested measurement';
    if(form.elements?.measurementNotes)form.elements.measurementNotes.value=`H38 walkthrough request: ${text(request)}`;
    form.scrollIntoView?.({behavior:'smooth',block:'center'});form.elements?.feet?.focus?.();
  });
  scheduleSync(350);void maybeReview();
}
function install(){if(C.state.__walkthroughAiWrapped)return;const base=C.state.render;if(typeof base!=='function')return;C.state.__walkthroughAiWrapped=true;C.setRender(function(){base();decorate()});decorate()}
window.addEventListener('online',()=>scheduleSync(100));
setInterval(()=>{if(C.state.open&&navigator.onLine){scheduleSync(0);void maybeReview()}},5000);
const style=document.createElement('style');style.textContent='.field-ai-guidance{display:grid;gap:.85rem;border:1px solid #b7d4e6;background:#f7fbfe}.field-ai-head{display:flex;gap:.7rem;align-items:flex-start}.field-ai-head>span{font-size:1.35rem}.field-ai-head small{display:block;margin-top:.2rem}.field-ai-section{display:grid;gap:.45rem;padding-top:.6rem;border-top:1px solid #d7e7f0}.field-ai-section ol{margin:.2rem 0 .2rem 1.2rem;padding:0;display:grid;gap:.35rem}.field-ai-section p{margin:.15rem 0;color:#425466}';document.head.appendChild(style);
install();setTimeout(install,500);
})();