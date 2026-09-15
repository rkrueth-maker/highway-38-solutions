(function(){
'use strict';
const BUILD='20260915-site-visit-simple-flow-1';
const C=window.H38_FIELD_VISIT_CORE;
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
const shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!C)return;

const text=(v,n=12000)=>String(v==null?'':v).trim().slice(0,n);
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const now=()=>new Date().toISOString();
const enteredVisits=new Set();
let busy=false;
let lastError='';
let lastVisitId='';

function visit(){return C.state?.open===true?C.state.visit:null;}
function rows(name){return Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];}
function meetingId(row){return text(value(row,'Meeting ID','meetingId','id'),180);}
function visitId(v=visit()){return text(v?.visitId||v?.id,180);}
function linkedMeeting(v=visit()){
  if(!v)return null;
  const vid=visitId(v),sid=text(v.sessionId,180);
  return rows('meetings').filter(row=>meetingId(row)).find(row=>{
    const rowVid=text(value(row,'Site Visit ID','siteVisitId'),180);
    const rowSid=text(value(row,'Site Capture Session ID','siteCaptureSessionId'),180);
    return (vid&&rowVid===vid)||(sid&&rowSid===sid);
  })||null;
}
function recordingActive(){return !!document.getElementById('h38MeetingRecordingDock');}
function assistant(){return window.H38_CONVERSATION_MEETING_ASSISTANT;}
function controller(){return window.H38_CONVERSATION_AUDIO_CONTROLLER;}
function esc(v){return C.esc?C.esc(text(v)):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function itemText(item){
  if(item==null)return'';
  if(typeof item==='string'||typeof item==='number')return text(item,1200);
  const label=text(value(item,'label','Label','category','Category'),220);
  const statement=text(value(item,'text','statement','description','request','decision','commitment','condition','question','action','summary','valueText'),1200);
  const numeric=text(value(item,'valueText','value','Value'),220);
  if(label&&statement&&statement!==label)return`${label}: ${statement}`;
  if(label&&numeric&&numeric!==label)return`${label}: ${numeric}`;
  return statement||label||numeric;
}
function addSection(lines,label,items){
  const list=(Array.isArray(items)?items:[items]).map(itemText).filter(Boolean);
  if(!list.length)return;
  lines.push(`${label}:`);
  list.slice(0,20).forEach(item=>lines.push(`• ${item}`));
}
function meetingBulletNotes(row){
  if(!row)return'';
  const lines=[];
  const summary=text(value(row,'Summary','summary'),5000);
  if(summary){lines.push('Summary:');lines.push(summary);}
  addSection(lines,'Customer requests',value(row,'Customer Requests','customerRequests'));
  addSection(lines,'Decisions',value(row,'Decisions','decisions'));
  addSection(lines,'Commitments',value(row,'Commitments','commitments'));
  addSection(lines,'Site conditions',value(row,'Site Conditions','siteConditions'));
  addSection(lines,'Measurements mentioned',value(row,'Measurements','measurements'));
  addSection(lines,'Open questions',value(row,'Unknowns','unknowns','Questions To Ask','questionsToAsk'));
  addSection(lines,'Action items',value(row,'Action Items','actionItems'));
  addSection(lines,'Follow-up',value(row,'Follow Ups','followUps'));
  return lines.join('\n').trim().slice(0,12000);
}
async function mergeMeetingIntoVisit(row){
  const v=visit();
  if(!v||!row)return false;
  const id=meetingId(row);
  const bullets=meetingBulletNotes(row);
  v.meetingId=id;
  v.meetingSummary=text(value(row,'Summary','summary'),5000);
  v.meetingBulletNotes=bullets;
  const applied=Array.isArray(v.meetingNotesAppliedIds)?v.meetingNotesAppliedIds:[];
  if(bullets&&id&&!applied.includes(id)){
    const marker=`Conversation notes · ${id}`;
    const existing=text(v.notes,18000);
    v.notes=[existing,`${marker}\n${bullets}`].filter(Boolean).join('\n\n').slice(0,24000);
    applied.push(id);
    v.meetingNotesAppliedIds=applied;
  }
  await C.saveDraft?.();
  const notes=document.getElementById('fieldNotes');
  if(notes&&bullets)notes.value=text(v.notes,24000);
  return !!bullets;
}
async function auth(){
  const api=shared?.ensure?.();
  if(!api)throw Error('Secure Business Office connection is not ready.');
  let result=await api.auth.getSession();
  if(result.error)throw result.error;
  let session=result.data?.session;
  if(!session)throw Error('Sign in again before refreshing optional Site Visit guidance.');
  if(Number(session.expires_at||0)*1000<Date.now()+120000){
    const refreshed=await api.auth.refreshSession();
    if(refreshed.error||!refreshed.data?.session)throw refreshed.error||Error('Secure session refresh failed.');
    session=refreshed.data.session;
  }
  return{api,session};
}
function applySeedLocally(v,seed){
  if(!v||!seed||typeof seed!=='object')return;
  v.meetingSeed=seed;
  v.meetingSeedStatus='READY_OPTIONAL';
  v.meetingSeedCaptureItems=Array.isArray(seed.captureItems)?seed.captureItems:[];
  v.meetingSeedQuoteInputs=Array.isArray(seed.quoteInputs)?seed.quoteInputs:[];
  v.meetingSeedMeasurements=Array.isArray(seed.measurements)?seed.measurements:[];
  if(!text(v.scope)&&text(seed.scopeDraft))v.scope=text(seed.scopeDraft);
  if((!text(v.projectTitle)||/^(?:site|field)\s*visit$/i.test(text(v.projectTitle)))&&text(seed.projectTitle))v.projectTitle=text(seed.projectTitle);
}
async function requestSeed(row=linkedMeeting()){
  const v=visit();
  if(!v||!row||!v.sessionId||!navigator.onLine||!cfg.url||!cfg.publishableKey)return null;
  const a=await auth();
  const response=await fetch(`${cfg.url}/functions/v1/h38-site-visit-context`,{
    method:'POST',mode:'cors',cache:'no-store',credentials:'omit',
    headers:{authorization:`Bearer ${a.session.access_token}`,apikey:cfg.publishableKey,'content-type':'application/json','x-client-info':BUILD},
    body:JSON.stringify({businessId:v.businessId||window.state?.businessId,captureSessionId:v.sessionId,meetingId:meetingId(row)})
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload?.status!=='PASS')throw Error(payload?.message||`Optional Site Visit guidance failed (${response.status}).`);
  const seed=payload.siteVisitSeed||payload.seed;
  if(seed&&typeof seed==='object'){
    applySeedLocally(v,seed);
    await C.saveDraft?.();
  }
  return seed||null;
}
async function applySeed(){
  const v=visit();
  if(!v)return false;
  const seed=v.meetingSeed;
  if(!seed||typeof seed!=='object')return false;
  applySeedLocally(v,seed);
  await C.saveDraft?.();
  C.state.render?.();
  C.toast('Optional meeting guidance applied to this Site Visit.');
  return true;
}
async function startMeeting(){
  const a=assistant();
  if(!a?.startVisitAssistant)throw Error('Conversation recording is still loading.');
  await a.startVisitAssistant();
  setTimeout(decorate,100);
}
async function finishConversation(){
  if(busy)return;
  busy=true;
  lastError='';
  decorate();
  try{
    const ctl=controller();
    if(recordingActive()&&ctl?.finish)await ctl.finish('meeting-finish');
    const a=assistant();
    if(navigator.onLine&&a?.syncPendingMeetingAttachments)await a.syncPendingMeetingAttachments();
    let row=linkedMeeting();
    if(row&&navigator.onLine&&a?.organizeMeeting&&text(value(row,'Structured Status','structuredStatus')).toUpperCase()!=='COMPLETE'){
      try{await a.organizeMeeting(meetingId(row));}catch(error){lastError=`Conversation saved. AI notes will retry when available: ${error?.message||error}`;}
      row=linkedMeeting()||row;
    }
    await mergeMeetingIntoVisit(row);
    if(row&&visit()?.sessionId&&navigator.onLine)void requestSeed(row).catch(()=>{});
    C.toast(lastError||'Conversation saved. Add photos if they help, or finish the visit.',!!lastError);
  }catch(error){
    lastError=error?.message||String(error);
    C.toast(lastError,true);
  }finally{
    busy=false;
    decorate();
  }
}
async function finishVisit(){
  const v=visit();
  if(!v||busy)return;
  busy=true;
  lastError='';
  decorate();
  try{
    if(recordingActive()){
      const ctl=controller();
      if(ctl?.finish)await ctl.finish('meeting-finish');
      if(navigator.onLine&&assistant()?.syncPendingMeetingAttachments)await assistant().syncPendingMeetingAttachments();
    }
    let row=linkedMeeting();
    if(row&&navigator.onLine&&assistant()?.organizeMeeting&&text(value(row,'Structured Status','structuredStatus')).toUpperCase()!=='COMPLETE'){
      try{await assistant().organizeMeeting(meetingId(row));}catch(error){lastError=`Visit saved. AI notes will retry when available: ${error?.message||error}`;}
      row=linkedMeeting()||row;
    }
    if(row)await mergeMeetingIntoVisit(row);
    v.status='COMPLETE';
    v.completedAt=now();
    v.updatedAt=now();
    await C.saveDraft?.();
    if(navigator.onLine)C.syncSoon?.();
    C.toast('Site Visit saved.');
    const close=document.getElementById('fieldClose');
    if(close)close.click(); else window.H38_FIELD_VISIT?.close?.();
  }catch(error){
    lastError=error?.message||String(error);
    C.toast(lastError,true);
  }finally{
    busy=false;
  }
}
function counts(){
  const v=visit();
  return{
    photos:Array.isArray(v?.attachmentIds)?v.attachmentIds.length:0,
    videos:Array.isArray(v?.videoAttachmentIds)?v.videoAttachmentIds.length:0,
    measurements:Array.isArray(v?.measurementIds)?v.measurementIds.length:0
  };
}
function unlockOptionalCapture(v){
  if(!v)return false;
  let changed=false;
  if(v.walkthroughOptional!==true){v.walkthroughOptional=true;changed=true;}
  const c=counts();
  if(!c.videos&&v.walkthroughSkipped!==true){v.walkthroughSkipped=true;changed=true;}
  return changed;
}
function normalizeCaptureUi(app,card,stage){
  const v=visit(),c=counts();
  const panel=stage.closest('.field-panel');
  if(!panel)return;
  const head=panel.querySelector('.field-step-head');
  if(head){
    const number=head.querySelector('span'),title=head.querySelector('h1'),copy=head.querySelector('p');
    if(number)number.textContent='1';
    if(title)title.textContent='Site Visit';
    if(copy)copy.textContent='Talk first if useful. Add photos only when they help. Video and measurements are optional.';
  }

  const photoButton=panel.querySelector('#fieldPhotos');
  const measureButton=panel.querySelector('#fieldCamera');
  const actions=photoButton?.closest('.field-targeted-actions')||panel.querySelector('.field-targeted-actions')||panel.querySelector('.field-capture-actions');
  if(actions){
    actions.hidden=false;
    actions.classList.remove('field-targeted-locked');
    if(card.nextElementSibling!==actions)card.insertAdjacentElement('afterend',actions);
    Array.from(actions.children).forEach(button=>{if(button instanceof HTMLButtonElement){button.hidden=false;button.disabled=false;}});
  }
  if(photoButton){photoButton.hidden=false;photoButton.disabled=false;photoButton.textContent='📷 Add Photo';}
  if(measureButton){measureButton.hidden=false;measureButton.textContent='📐 Measure (optional)';}

  const preservedEvidence=stage.querySelector('[data-field-walkthrough-evidence]');
  stage.className='field-card field-walkthrough-stage optional';
  stage.innerHTML=c.videos
    ? `<div class="field-walkthrough-status"><span>✓</span><div><strong>Optional video saved</strong><small>${c.videos} video${c.videos===1?'':'s'} kept privately with this visit.</small></div></div><button type="button" class="field-secondary" data-simple-video>🎥 Record Another Video</button>`
    : '<div class="field-walkthrough-required"><span class="field-walkthrough-icon">🎥</span><div><strong>Video walkthrough (optional)</strong><small>Use this only when video adds useful context. Photos and Finish Visit do not depend on it.</small></div></div><button type="button" class="field-secondary" data-simple-video>🎥 Record Video (optional)</button>';
  if(preservedEvidence)stage.appendChild(preservedEvidence);
  stage.querySelector('[data-simple-video]')?.addEventListener('click',()=>void window.H38_FIELD_VISIT_VIDEO?.openRecorder?.());

  if(actions?.nextElementSibling!==stage)actions?.insertAdjacentElement('afterend',stage);
  panel.querySelector('.field-device-card')?.setAttribute('hidden','');
  panel.querySelector('.field-capture-counts')?.setAttribute('hidden','');
  panel.querySelector('[data-field-after-walkthrough]')?.setAttribute('hidden','');

  let finish=panel.querySelector('[data-simple-finish]');
  if(!finish){
    finish=document.createElement('section');
    finish.dataset.simpleFinish='1';
    finish.className='field-card field-simple-finish';
    finish.innerHTML='<button type="button" class="field-primary" data-simple-finish-button>✓ Finish Visit</button><small>Conversation, photos, video and measurements are all optional. H38 keeps whatever you captured.</small>';
    stage.insertAdjacentElement('afterend',finish);
  }
  finish.querySelector('[data-simple-finish-button]')?.addEventListener('click',()=>void finishVisit(),{once:true});

  panel.querySelectorAll(':scope > details').forEach(node=>{node.hidden=false;});
  const next=panel.querySelector('.field-next');
  if(next)next.hidden=false;

  const bottom=app.querySelector('.field-bottom-nav');
  if(bottom){
    bottom.querySelectorAll('button').forEach(button=>{
      const label=text(button.textContent,120).toLowerCase();
      if(label.includes('job'))button.querySelector('small')&&(button.querySelector('small').textContent='Details');
      if(label.includes('capture'))button.querySelector('small')&&(button.querySelector('small').textContent='Visit');
      if(label.includes('review'))button.querySelector('small')&&(button.querySelector('small').textContent='Finish');
    });
  }
}
function renderConversationCard(card,row,isRecording){
  if(!row){
    card.innerHTML='<div class="field-meeting-seed-head"><span>1</span><div><strong>Conversation</strong><small>Start here when talking with the customer. H38 will turn the conversation into editable notes. You can also just take photos and finish.</small></div></div><button type="button" class="field-primary" data-meeting-start>🎙️ Start Conversation</button>';
  }else if(isRecording){
    card.innerHTML='<div class="field-meeting-seed-head"><span>●</span><div><strong>Conversation recording</strong><small>Keep talking while you walk the job. Use Add Photo in the recording controls whenever a picture helps.</small></div></div><div class="field-meeting-seed-actions"><button type="button" class="field-secondary" data-meeting-photo>📷 Add Photo</button><button type="button" class="field-primary" data-meeting-finish>Finish Conversation</button></div>';
  }else{
    const organized=text(value(row,'Structured Status','structuredStatus')).toUpperCase()==='COMPLETE';
    card.innerHTML=`<div class="field-meeting-seed-head"><span>✓</span><div><strong>Conversation saved</strong><small>${organized?'Editable notes are attached to this Site Visit.':'The conversation is safe. H38 can finish organizing the notes when online.'}</small></div></div><div class="field-meeting-seed-actions"><button type="button" class="field-secondary" data-meeting-start>Resume Conversation</button><button type="button" class="field-secondary" data-meeting-open>View Notes</button></div>${lastError?`<p class="field-meeting-seed-error">${esc(lastError)}</p>`:''}`;
  }
  card.querySelector('[data-meeting-start]')?.addEventListener('click',()=>void startMeeting().catch(error=>C.toast(error?.message||String(error),true)));
  card.querySelector('[data-meeting-finish]')?.addEventListener('click',()=>void finishConversation());
  card.querySelector('[data-meeting-photo]')?.addEventListener('click',()=>{
    const meetingPhoto=document.getElementById('h38MeetingPhoto');
    if(meetingPhoto)meetingPhoto.click(); else document.getElementById('fieldPhotos')?.click();
  });
  card.querySelector('[data-meeting-open]')?.addEventListener('click',()=>assistant()?.openMeeting?.(meetingId(row)));
}
function decorate(){
  const v=visit(),app=document.getElementById('h38FieldVisitApp');
  if(!v||!app)return;
  const vid=visitId(v);
  if(vid!==lastVisitId){lastVisitId=vid;lastError='';}
  if(!enteredVisits.has(vid)){
    enteredVisits.add(vid);
    const changed=unlockOptionalCapture(v);
    if(changed)void C.saveDraft?.();
    if(C.state.tab==='job'){
      C.state.tab='capture';
      C.state.render?.();
      return;
    }
  }else if(unlockOptionalCapture(v)){
    void C.saveDraft?.();
  }

  const stage=app.querySelector('[data-field-walkthrough-stage]');
  if(!stage)return;
  let card=app.querySelector('[data-field-meeting-seed]');
  if(!card){
    card=document.createElement('section');
    card.dataset.fieldMeetingSeed='1';
    stage.insertAdjacentElement('beforebegin',card);
  }
  const row=linkedMeeting(v),isRecording=recordingActive();
  card.className='field-card field-meeting-seed complete';
  renderConversationCard(card,row,isRecording);
  normalizeCaptureUi(app,card,stage);

  if(row&&!isRecording&&text(value(row,'Structured Status','structuredStatus')).toUpperCase()==='COMPLETE'&&v.meetingNotesAppliedIds?.includes?.(meetingId(row))!==true){
    void mergeMeetingIntoVisit(row).then(()=>C.state.render?.()).catch(()=>{});
  }

  if(window.H38_FIELD_VISIT){
    window.H38_FIELD_VISIT.walkthroughFirst=false;
    window.H38_FIELD_VISIT.targetedPhotosAfterWalkthrough=false;
    window.H38_FIELD_VISIT.conversationFirst=true;
    window.H38_FIELD_VISIT.walkthroughOptional=true;
  }
}
function install(){
  const ui=window.H38_FIELD_VISIT_UI;
  if(!ui||typeof ui.render!=='function')return false;
  if(!ui.__simpleSiteVisitWrapped){
    const base=ui.render;
    ui.render=function(){base();setTimeout(decorate,0);};
    ui.__simpleSiteVisitWrapped=true;
    C.setRender(ui.render);
  }
  decorate();
  return true;
}

const style=document.createElement('style');
style.textContent=`
.field-meeting-seed{display:grid;gap:.75rem;margin-bottom:.8rem;border:2px solid #37704a;background:#f5faf6}
.field-meeting-seed-head{display:flex;gap:.75rem;align-items:flex-start}
.field-meeting-seed-head>span{display:grid;place-items:center;min-width:34px;height:34px;border-radius:999px;background:#173f5f;color:#fff;font-weight:900}
.field-meeting-seed-head>div{display:grid;gap:.18rem}
.field-meeting-seed-head small,.field-simple-finish small{color:var(--muted);line-height:1.4}
.field-meeting-seed-actions{display:grid;grid-template-columns:1fr 1fr;gap:.55rem}
.field-meeting-seed-error{color:#9b2226;font-weight:700}
.field-walkthrough-stage.optional{border:1px solid rgba(23,63,95,.18);background:#f7f9fb}
.field-simple-finish{display:grid;gap:.5rem;margin-top:.8rem}
.field-targeted-actions[hidden],.field-capture-actions.field-targeted-locked{display:grid!important}
@media(max-width:560px){.field-meeting-seed-actions{grid-template-columns:1fr}.field-device-card,.field-capture-counts{display:none!important}}
`;
document.head.appendChild(style);

[0,120,350,800,1600,3200].forEach(delay=>setTimeout(install,delay));
setInterval(()=>{if(visit())decorate();},700);
window.addEventListener('h38:business-snapshot-updated',()=>setTimeout(decorate,0));
window.addEventListener('online',()=>setTimeout(decorate,0));

window.H38_SITE_VISIT_MEETING_SEED={
  build:BUILD,
  decorate,
  requestSeed,
  applySeed,
  startMeeting,
  finishAndPrepare:finishConversation,
  finishConversation,
  finishVisit,
  mergeMeetingIntoVisit,
  meetingFirst:true,
  conversationFirst:true,
  walkthroughFirst:false,
  walkthroughOptional:true,
  photosOptional:true,
  measurementsOptional:true,
  captureSessionNotRequiredForConversation:true,
  notesAutoAppliedToVisit:true,
  automaticCustomerSending:false,
  automaticApproval:false
};
})();
