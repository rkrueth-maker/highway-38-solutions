(function(){
'use strict';
const BUILD='20260915-quick-meeting-notes-1';
const FUNCTION_SLUG='h38-quick-meeting-notes';
const MOBILE='(max-width: 760px)';
const text=(value,n=12000)=>String(value==null?'':value).trim().slice(0,n);
const esc=value=>typeof window.esc==='function'?window.esc(value):text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const office=()=>window.state||{};
const snapshot=()=>office().snapshot||{};
const rows=name=>Array.isArray(snapshot()[name])?snapshot()[name]:[];
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const mobile=()=>!!window.matchMedia?.(MOBILE).matches;
const selectedCustomerId=()=>text(window.H38_CUSTOMER_360?.selectedCustomerId||'');
const now=()=>new Date().toISOString();
const uid=()=>typeof window.newId==='function'?window.newId('MEETING'):`MEETING-${crypto.randomUUID().toUpperCase()}`;
let dialog=null;
let stream=null;
let recorder=null;
let chunks=[];
let audioBlob=null;
let recordingStartedAt=0;
let timer=null;
let defaults={};

function customerName(id){const row=rows('customers').find(r=>text(value(r,'Customer ID','customerId','id'),180)===text(id,180));return text(value(row,'Customer Name','name'),240)||'Customer';}
function customerOptions(selected=''){
  return `<option value="">No customer</option>`+rows('customers').map(row=>{const id=text(value(row,'Customer ID','customerId','id'),180),name=text(value(row,'Customer Name','name'),240)||id;return `<option value="${esc(id)}" ${id===selected?'selected':''}>${esc(name)}</option>`;}).join('');
}
function notify(message,error=false){
  if(typeof window.notify==='function'){window.notify(message,error);return;}
  const toast=document.getElementById('toast');if(toast){toast.textContent=message;toast.classList.toggle('error',!!error);toast.hidden=false;setTimeout(()=>{toast.hidden=true;},4200);return;}
  console[error?'error':'log']('[H38 quick meeting]',message);
}
function ensureStyle(){
  if(document.getElementById('h38QuickMeetingNotesStyle'))return;
  const style=document.createElement('style');style.id='h38QuickMeetingNotesStyle';style.textContent=`
.h38-quick-meeting-dialog{width:min(620px,calc(100vw - 18px));max-height:calc(100dvh - 20px);border:0;border-radius:18px;padding:0;overflow:hidden}.h38-quick-meeting-dialog::backdrop{background:rgba(0,0,0,.58)}
.h38-qm-shell{padding:16px;display:grid;gap:12px;max-height:calc(100dvh - 20px);overflow:auto}.h38-qm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.h38-qm-head h2{margin:0}.h38-qm-head p{margin:4px 0 0;color:var(--muted,#607285);font-size:.86rem}.h38-qm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.h38-qm-grid label,.h38-qm-shell>label{display:grid;gap:5px;font-weight:800}.h38-qm-shell input,.h38-qm-shell select,.h38-qm-shell textarea{width:100%;min-width:0}.h38-qm-shell textarea{min-height:110px;resize:vertical}.h38-qm-consent{padding:10px 12px;border-radius:12px;background:#f5f7f9;color:#52616d;font-size:.82rem;line-height:1.35}.h38-qm-actions{display:flex;flex-wrap:wrap;gap:8px}.h38-qm-actions button{min-height:44px}.h38-qm-recording{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;border:1px solid #d6e0e8;border-radius:12px}.h38-qm-recording strong{font-variant-numeric:tabular-nums}.h38-qm-notes{display:grid;gap:10px}.h38-qm-notes label{display:grid;gap:5px;font-weight:800}.h38-qm-notehint{font-size:.78rem;color:var(--muted,#607285)}
.h38-quick-meeting-card{display:grid;gap:8px}.h38-quick-meeting-card button{width:100%;min-height:48px}.h38-qm-customer-clean #mainContent{min-width:0}.h38-qm-customer-clean #mainContent .grid,.h38-qm-customer-clean #mainContent .h38-c360-grid,.h38-qm-customer-clean #mainContent .h38-c360-detail-cards,.h38-qm-customer-clean #mainContent .h38-c360-setup-grid{grid-template-columns:minmax(0,1fr)!important}.h38-qm-customer-clean #mainContent .grid>*,.h38-qm-customer-clean #mainContent .h38-c360,.h38-qm-customer-clean #mainContent .card{min-width:0!important;max-width:100%!important;width:100%!important;grid-column:1/-1!important;overflow-wrap:anywhere}.h38-qm-customer-clean #mainContent .h38-c360-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important}.h38-qm-customer-clean #mainContent .h38-c360-actions button{min-width:0!important;width:100%!important}
@media(max-width:760px){.h38-qm-grid{grid-template-columns:1fr}.h38-qm-shell{padding:14px}.h38-qm-customer-clean #mainContent .grid{display:grid!important;grid-template-columns:minmax(0,1fr)!important}.h38-qm-customer-clean #mainContent .grid>*{grid-column:1/-1!important}}
`;document.head.appendChild(style);
}
function ensureDialog(){
  ensureStyle();
  if(dialog?.isConnected)return dialog;
  dialog=document.createElement('dialog');dialog.id='h38QuickMeetingNotesDialog';dialog.className='h38-quick-meeting-dialog';
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
  document.body.appendChild(dialog);return dialog;
}
function releaseRecording(){
  clearInterval(timer);timer=null;
  try{if(recorder&&recorder.state!=='inactive')recorder.stop();}catch(_){}
  recorder=null;
  try{stream?.getTracks?.().forEach(track=>track.stop());}catch(_){}
  stream=null;
}
function discardTemporaryAudio(){releaseRecording();chunks=[];audioBlob=null;recordingStartedAt=0;}
function closeDialog(){discardTemporaryAudio();if(dialog?.open)dialog.close();}
function renderStart(){
  const d=ensureDialog(),cid=text(defaults.customerId||selectedCustomerId(),180),title=text(defaults.title,300);
  d.innerHTML=`<form class="h38-qm-shell" id="h38QuickMeetingForm"><div class="h38-qm-head"><div><h2>Meeting</h2><p>Customer optional. Record or type, then save only the finished notes.</p></div><button type="button" class="icon-button" data-qm-close aria-label="Close">×</button></div><div class="h38-qm-grid"><label>Customer<select name="customerId">${customerOptions(cid)}</select></label><label>Title<input name="title" value="${esc(title)}" placeholder="Optional"></label></div><label>Typed notes / context<textarea name="typedNotes" placeholder="Optional. Type notes instead of recording, or add context before summarizing."></textarea></label><div class="h38-qm-consent">Recording starts only when you tap <strong>Start recording</strong>. Use recording only where permitted and with any consent your situation requires. Audio is temporary and is discarded after the bullet notes are created; H38 does not save the recording or transcript for this Quick Meeting.</div><div class="h38-qm-actions"><button type="button" class="primary" data-qm-record>Start recording</button><button type="button" class="secondary" data-qm-notes>Make bullet notes from typed notes</button><button type="button" class="secondary" data-qm-close>Cancel</button></div></form>`;
  d.querySelectorAll('[data-qm-close]').forEach(button=>button.onclick=closeDialog);
  d.querySelector('[data-qm-record]').onclick=()=>void beginRecording();
  d.querySelector('[data-qm-notes]').onclick=()=>void makeNotes(false);
}
function renderRecording(){
  const form=dialog?.querySelector('#h38QuickMeetingForm');if(!form)return;
  form.querySelector('.h38-qm-actions').innerHTML=`<button type="button" class="primary" data-qm-stop>Stop & make bullet notes</button><button type="button" class="secondary" data-qm-cancel-record>Discard recording</button>`;
  const status=document.createElement('div');status.className='h38-qm-recording';status.id='h38QuickMeetingRecordingStatus';status.innerHTML='<span>● Recording meeting</span><strong>00:00</strong>';form.querySelector('.h38-qm-consent').insertAdjacentElement('afterend',$status);
  const clock=status.querySelector('strong');timer=setInterval(()=>{const elapsed=Math.max(0,Date.now()-recordingStartedAt),seconds=Math.floor(elapsed/1000),mm=String(Math.floor(seconds/60)).padStart(2,'0'),ss=String(seconds%60).padStart(2,'0');clock.textContent=`${mm}:${ss}`;},250);
  form.querySelector('[data-qm-stop]').onclick=()=>void stopAndMakeNotes();
  form.querySelector('[data-qm-cancel-record]').onclick=()=>{discardTemporaryAudio();renderStart();};
}
async function beginRecording(){
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){notify('Microphone recording is not available in this browser. Type notes instead.',true);return;}
  try{
    discardTemporaryAudio();
    stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    const preferred=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(type=>MediaRecorder.isTypeSupported?.(type));
    recorder=preferred?new MediaRecorder(stream,{mimeType:preferred}):new MediaRecorder(stream);
    chunks=[];audioBlob=null;recordingStartedAt=Date.now();
    recorder.ondataavailable=event=>{if(event.data?.size)chunks.push(event.data);};
    recorder.start(1000);renderRecording();
  }catch(error){discardTemporaryAudio();notify(error?.message||Microphone permission was not available.',true);}
}
function stopRecorder(){
  if(!recorder||recorder.state==='inactive')return Promise.resolve(audioBlob);
  return new Promise((resolve,reject)=>{
    const active=recorder;active.onerror=event=>reject(event.error||Error('Meeting recording failed.'));
    active.onstop=()=>{const type=active.mimeType||chunks[0]?.type||'audio/webm';audioBlob=new Blob(chunks,{type});try{stream?.getTracks?.().forEach(track=>track.stop());}catch(_){}stream=null;recorder=null;clearInterval(timer);timer=null;resolve(audioBlob);};
    active.stop();
  });
}
async function stopAndMakeNotes(){try{await stopRecorder();await makeNotes(true);}catch(error){notify(error?.message||String(error),true);}}
function getStartValues(){const form=dialog?.querySelector('#h38QuickMeetingForm'),data=form?new FormData(form):new FormData();return{customerId:text(data.get('customerId'),180),title:text(data.get('title'),300),typedNotes:text(data.get('typedNotes'),12000)};}
function sharedClient(){const api=window.H38_SUPABASE_SHARED_CLIENT?.ensure?.();if(api)return api;const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};if(!cfg.url||!cfg.publishableKey||!window.supabase)throw Error('Secure Business Office connection is unavailable.');return window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowTypd:'pkce'}});}
async function session(force=false){const api=sharedClient();let result=await api.auth.getSession();if(result.error)throw result.error;let current=result.data?.session;if(!current?.access_token)throw Error('Sign in again before creating meeting notes.');if(force||Number(current.expires_at||0)*1000<Date.now()+120000){const refreshed=await api.auth.refreshSession();if(refreshed.error||!refreshed.data?.session)throw refreshed.error||Error('Secure session refresh failed.');current=refreshed.data.session;}return{api,current};}
async function requestNotes(fields,blob,retry=false){
  if(!navigator.onLine)throw Error('Quick Meeting needs an internet connection to turn the meeting into bullet notes. Nothing has been saved yet.');
  if(!text(office().businessId,180))throw Error('Business Office is still loading. Try Meeting again in a moment.');
  const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{},auth=await session(retry),body=new FormData();
  body.append('businessId',text(office().businessId,180));body.append('customerId',fields.customerId);body.append('title',fields.title);body.append('typedNotes',fields.typedNotes);
  if(blob?.size)body.append('audio',new File([blob],`meeting-${Date.now()}.webm`,{type:blob.type||'audio/webm'}));
  const response=await fetch(`${cfg.url}/functions/v1/${FUNCTION_SLUG}`,{method:'POST',mode:'cors',cache:'no-store',credentials:'omit',headers:{authorization:`Bearer ${auth.current.access_token}`,apikey:cfg.publishableKey,'x-client-info':BUILD},body});
  const payload=await response.json().catch(()=>({}));if(response.status===101&&!retry)return requestNotes(fields,blob,true);if(!response.ok||payload?.status!=='PASS'){throw Error(payload?.message||`Meeting notes failed (${response.status}).`);}return payload.notes||{};
}
function lines(value){return (Array.isArray(value)?value:[]).map(item=>text(item,800)).filter(Boolean).slice(0,20);}
function renderNotes(fields,notes){
  const d=ensureDialog(),sections={discussed:lines(notes.discussed),decisions:lines(notes.decisions),actionItems:lines(notes.actionItems),followUp:lines(notes.followUp)};
  d.innerHTML=`<form class="h38-qm-shell" id="h38QuickMeetingReview"><div class="h38-qm-head"><div><h2>Review meeting notes</h2><p>Edit anything you want. These notes are the only meeting content H38 will save.</p></div><button type="button" class="icon-button" data-qm-close aria-label="Close">×</button></div><div class="h38-qm-notes"><label>What was discussed<textarea name="discussed">${esc(sections.discussed.join('\n'))}</textarea></label><label>Decisions<textarea name="decisions">${esc(sections.decisions.join('\n'))}</textarea></label><label>Action items<textarea name="actionItems">${esc(sections.actionItems.join('\n'))}</textarea></label><label>Questions / follow-up<textarea name="followUp">${esc(sections.followUp.join('\n')))</textarea></label><div class="h38-qm-notehint">One bullet per line. Blank sections are fine.</div></div><div class="h38-qm-actions"><button type="submit" class="primary">Save notes</button><button type="button" class="secondary" data-qm-back>Back</button><button type="button" class="secondary" data-qm-close>Discard</button></div></form>`;
  discardTemporaryAudio();
  d.querySelectorAll('[data-qm-close]').forEach(button=>button.onclick=closeDialog);d.querySelector('[data-qm-back]').onclick=renderStart;
  d.querySelector('form').onsubmit=event=>{event.preventDefault();void saveNotes(fields,new FormData(event.currentTarget));};
}
function parseTextarea(formData,key){return text(formData.get(key),12000).split(/\r?\n/).map(line=>line.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean).slice(0,30);}
function flattenNotes(notes){const out=[];for(const [label,key] of [['What was discussed','discussed'],['Decisions','decisions'],['Action items','actionItems'],['Questions / follow-up','followUp']]){const items=notes[key]||[];if(!items.length)continue;out.push(label);for(const item of items)out.push(`• ${item}`);}return out.join('\n');}
function noteObjects(items,key='text'){return items.map(item=>({[Key]:item}));}
async function persistRecord(fields,notes){
  const id=uid(),stamp=now(),title=fields.title||'Meeting',record={
    'Meeting ID':id,meetingId:id,'Business ID':office().businessId,businessId:office().businessId,
    'Meeting Type':'Meeting',meetingType:'Meeting','Title':title;title,'Status':'Complete',status:'Complete',
    'Occurred At':stamp,occurredAt:stamp,'Created Time':stamp,createdAt:stamp,'Updated Time':stamp,updatedAt:stamp,
    'Customer ID':fields.customerId||'',customerId:fields.customerId||'',
    notesOnly:true,storagePolicy:'NOTES_ONLY',noteSections:notes,summary:notes.discussed.join('\n'),
    decisions:noteObjects(notes.decisions),actionItems:noteObjects(notes.actionItems,'action'),followUps:noteObjects(notes.followUp),manualNotes:flattenNotes(notes)
  };
  if(typeof window.queueOperation!=='function')throw Error('Business Office save queue is unavailable.');
  await window.queueOperation('MEETING_CREATED','Meeting',id,{__h38Record:{collection:'meetings',record}},{collection:'meetings',record,idKeys:['Meeting ID','meetingId']},false);
  const snap=snapshot();if(!Array.isArray(snap.meetings))snap.meetings=[];snap.meetings.unshift({...record,__localPending:true});
  if(navigator.onLine&&office().bridgeReady&&typeof window.sync==='function'){try{await window.sync(false);}catch(error){console.warn('[H38 quick meeting sync]',error?.message||error);}}
  window.dispatchEvent(new CustomEvent('h38:quick-meeting-notes-saved',{detail:{meetingId:id,customerId:fields.customerId||'',notesOnly:true}}));
  return record;
}
async function saveNotes(fields,formData){
  const notes={discussed:parseTextarea(formData,'discussed'),decisions:parseTextarea(formData,'decisions'),actionItems:parseTextarea(formData,'actionItems'),followUp:parseTextarea(formData,'followUp')};
  if(!Object.values(notes).some(items=>items.length)){notify('Add at least one meeting note before saving.',true);return;}
  const submit=dialog?.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
  try{await persistRecord(fields,notes);closeDialog();notify(fields.customerId?`Meeting notes saved to ${customerName(fields.customerId)}.`:'Meeting notes saved.');}
  catch(error){if(submit)submit.disabled=false;notify(error?.message||String(error),true);}
}
async function makeNotes(includeAudio){
  const fields=getStartValues();if(includeAudio&&!audioBlob&&recorder)await stopRecorder();const blob=includeAudio?audioBlob:null;
  if(!blob?.size&&!fields.typedNotes){notify('Record the meeting or type notes first.',true);return;}
  const actions=dialog?.querySelector('.h38-qm-actions');if(actions)actions.querySelectorAll('button').forEach(button=>button.disabled=true);notify('Creating bullet notes…');
  try{const notes=await requestNotes(fields,blob);renderNotes(fields,notes);}
  catch(error){if(actions)actions.querySelectorAll('button').forEach(button=>button.disabled=false);notify(error?.message||String(error),true);}
}
function start(nextDefaults={}){defaults={customerId:text(nextDefaults.customerId||'',180),title:text(nextDefaults.title||'',300)};discardTemporaryAudio();renderStart();const d=ensureDialog();if(!d.open)d.showModal?.();}
function quickMenuMeetingButton(button){const root=button.closest('#h38QuickCreateDialog,#H38PhoneCreateDialog');return !!root&&/\bmeeting\b/i.test(text(button.textContent,200));}
function customerMeetingButton(button){if(office().page!=='customers')return false;const label=text(button.textContent,200).replace(/\s+/g,' ').toLowerCase();return label==='meeting'||label==='start follow-up meeting'||label==='start meeting';}
function routeMeetingClick(event){if(!mobile())return;const button=event.target?.closest?.('button');if(!button||button.closest('#h38QuickMeetingNotesDialog'))return;if(!quickMenuMeetingButton(button)&&!customerMeetingButton(button))return;event.preventDefault();event.stopImmediatePropagation();button.closest('dialog')?.close?.();start({customerId:selectedCustomerId()});}
function reconcileToday(){
  if(!mobile()||office().page!=='today'){document.getElementById('h38QuickMeetingTodayCard')?.remove();return;}
  const today=document.getElementById('h38PhoneToday');if(!today||document.getElementById('h38QuickMeetingTodayCard'))return;
  const card=document.createElement('section');card.id='h38QuickMeetingTodayCard';card.className='h38-phone-card h38-quick-meeting-card';card.innerHTML='<span class="h38-eyebrow">QUICK START</span><button type="button" class="primary">Start meeting</button><small>Customer optional ± saves bullet notes only</small>';card.querySelector('button').onclick=()=>start({customerId:''});today.querySelector('.h38-phone-card')?.insertAdjacentElement('afterend',card)||today.prepend(card);
}
function reconcileCustomer(){
  const isCustomer=mobile()&&office().page==='customers';document.body.classList.toggle('h38-qm-customer-clean',isCustomer);if(!isCustomer)return;
  const main=document.getElementById('mainContent');if(!main)return;
  const meetingButtons=[...main.querySelectorAll('button')].filter(customerMeetingButton);const keep=meetingButtons.find(button=>text(button.textContent,80).trim().toLowerCase()==='meeting')||meetingButtons[0];
  meetingButtons.forEach(button=>{if(button===keep){button.hidden=false;button.dataset.h38QuickMeeting='1';if(/follow-up/i.test(text(button.textContent,100)))button.textContent='Meeting';}else{button.hidden=true;button.dataset.h38QuickMeetingDuplicate='1';}});
  for(const select of main.querySelectorAll('select')){const optionText=[...select.options].map(option=>option.textContent||'').join(' ');if(/No customer\s*\/\s*business-only meeting/i.test(optionText)){const nearby=[...select.parentElement?.querySelectorAll?.('button')||[]].find(button=>/follow-up meeting/i.test(text(button.textContent,120)));if(nearby||selectedCustomerId())select.hidden=true;}}
}
function reconcile(){ensureStyle();reconcileToday();reconcileCustomer();}
document.addEventListener('click',routeMeetingClick,true);
window.addEventListener('h38:office-page-rendered',()=>setTimeout(reconcile,0));window.addEventListener('h38:business-snapshot-updated',()=>setTimeout(reconcile,0));window.addEventListener('pageshow',()=>setTimeout(reconcile,0));
const observer=new MutationObserver(()=>{queueMicrotask(reconcile);});observer.observe(document.documentElement,{subtree:true,childList:true});
setTimeout(reconcile,0);
window.H38_QUICK_MEETING_NOTES=Object.freeze({build:BUILD,start,notesOnly:true,customerOptional:true,temporaryAudioOnly:true,recordingPersisted:false,transcriptPersisted:false,meetingReportDocument:false,siteVisitEvidenceUntouched:true,reconcile});
window.dispatchEvent(new CustomEvent('h38:quick-meeting-notes-ready',{detail:{build:BUILD}}));
})();
