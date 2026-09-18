(function(){
'use strict';
const BUILD='20260918-one-shell-field-experience-1';
const LEGACY_PREF_KEY='h38:mobile-workspace-view:v1';
const STYLE_ID='h38OneShellFieldExperienceStyle';
const MY_DAY_ID='h38FieldMyDay';
const JOB_HUB_ID='h38FieldJobHub';
let scheduled=false;
const text=value=>String(value==null?'':value).trim();
const upper=value=>text(value).toUpperCase();
const esc=value=>text(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&text(row[key])!=='')return row[key];}return'';};
const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
const id=(row,...keys)=>text(value(row,...keys));
function mobile(){return !!window.matchMedia?.('(max-width: 760px)').matches;}
function user(){return window.state?.snapshot?.user||null;}
function role(){const u=user()||{};return text(u.roleId||u.roleName||u.role).toLowerCase();}
function fieldRole(){
  const u=user();if(!u||u.owner===true||u.permissions?.all===true)return false;
  const r=role(),title=text(u.jobTitle||u.title).toLowerCase();
  return r==='staff'||r==='field'||r==='field staff'||r==='foreman'||r==='site-manager'||r==='site manager'||/foreman|crew lead|field/.test(title);
}
function allowed(){try{return Array.isArray(window.allowedPages?.())?window.allowedPages():[];}catch(_){return[];}}
function userId(){const u=user()||{};return text(u.userId||u.id||u.authUserId||u.email);}
function linkedToUser(row){
  const uid=userId();if(!uid)return true;
  const assigned=text(value(row,'Assigned User ID','assignedUserId','Employee ID','employeeId','User ID','userId','Assigned To','assignedTo','Email','email'));
  return !assigned||assigned===uid||assigned.toLowerCase()===uid.toLowerCase();
}
function customerFor(job,event){
  const cid=text(value(event,'Customer ID','customerId')||value(job,'Customer ID','customerId'));
  return rows('customers').find(row=>id(row,'Customer ID','customerId','id')===cid)||null;
}
function jobById(jid){return rows('jobs').find(row=>id(row,'Job ID','jobId','id')===text(jid))||null;}
function taskById(tid){return rows('tasks').find(row=>id(row,'Task ID','taskId','id')===text(tid))||null;}
function activeTime(){
  const list=rows('timeEntries').filter(linkedToUser).filter(row=>!text(value(row,'Clock Out','Clock Out Time','End Time','endTime','clockOut')));
  return list.slice().sort((a,b)=>new Date(value(b,'Clock In','Clock In Time','Start Time','startTime','Created Time')||0)-new Date(value(a,'Clock In','Clock In Time','Start Time','startTime','Created Time')||0))[0]||null;
}
function assignedTasks(){
  return rows('tasks').filter(linkedToUser).filter(row=>!/COMPLET|CANCEL|VOID|ARCHIV/.test(upper(value(row,'Status','status'))));
}
function currentContext(){
  const time=activeTime(),tasks=assignedTasks(),timeTask=taskById(value(time,'Task ID','taskId'));
  const task=timeTask||tasks.find(row=>/START|IN PROGRESS|ACCEPT/.test(upper(value(row,'Status','status'))))||tasks[0]||null;
  const jid=text(value(time,'Job ID','jobId')||value(task,'Job ID','jobId'));
  const job=jobById(jid)||rows('jobs').find(row=>linkedToUser(row)&&!/COMPLET|CANCEL|VOID|ARCHIV/.test(upper(value(row,'Status','status'))))||null;
  return {time,task,job};
}
function eventStart(row){const raw=value(row,'Start Time','startTime','Scheduled Time','scheduledAt','Due Time','dueTime');const d=new Date(raw||0);return Number.isFinite(d.getTime())?d:null;}
function upcomingEvents(){
  const now=Date.now();
  return rows('scheduleEvents').filter(linkedToUser).map(row=>({row,start:eventStart(row)})).filter(item=>item.start&&item.start.getTime()>=now-15*60*1000).sort((a,b)=>a.start-b.start);
}
function durationLabel(time){
  if(!time)return'';
  const start=new Date(value(time,'Clock In','Clock In Time','Start Time','startTime','Created Time')||0).getTime();
  if(!Number.isFinite(start))return'Active';
  const min=Math.max(0,Math.floor((Date.now()-start)/60000)),h=Math.floor(min/60),m=min%60;
  return h?`${h}h ${m}m active`:`${m}m active`;
}
function requiredProof(task,job){
  const configured=text(value(task,'Required Proof','requiredProof','Required Closeout','requiredCloseout','Completion Requirements','completionRequirements')||value(job,'Required Proof','requiredProof','Required Closeout','requiredCloseout','Completion Requirements','completionRequirements'));
  let items=configured.split(/[\n,;|]+/).map(text).filter(Boolean);
  if(items.length)return items;
  const service=text(value(task,'Task Title','taskTitle','Service','service','Instructions','instructions')||value(job,'Project Title','projectTitle','Service','service','Scope','scope')).toLowerCase();
  if(/snow|plow/.test(service))items=['Completion photo','Completion note'];
  else if(/lawn|mow/.test(service))items=['Mowing complete','Trimming complete','Blow-off complete','Completion photos'];
  else if(/measure|site visit|survey/.test(service))items=['Required photos','Required dimensions','Constraints/issues','Visit completion'];
  else if(/repair|service/.test(service))items=['Before condition','Work performed','Parts/materials','Completion proof'];
  return items;
}
function linkedRows(name,job,task){
  const jid=id(job,'Job ID','jobId'),tid=id(task,'Task ID','taskId'),cid=id(job,'Customer ID','customerId');
  return rows(name).filter(row=>{
    const rj=id(row,'Job ID','jobId'),rt=id(row,'Task ID','taskId'),rc=id(row,'Customer ID','customerId'),source=id(row,'Source ID','sourceId');
    return (!!jid&&(rj===jid||source===jid))||!!tid&&rt===tid||!!cid&&rc===cid;
  });
}
function proofDone(label,job,task){
  const key=text(label).toLowerCase();
  const docs=linkedRows('documents',job,task),checks=linkedRows('checklists',job,task),notes=[...linkedRows('jobNotes',job,task),...linkedRows('dailyLogs',job,task)],measurements=linkedRows('siteMeasurements',job,task),visits=linkedRows('siteCaptureSessions',job,task);
  const searchable=list=>list.map(row=>Object.values(row||{}).join(' ').toLowerCase());
  if(/photo|condition|before|after|completion proof/.test(key)){
    const words=searchable(docs);
    if(/before|arrival/.test(key))return words.some(v=>/before|arrival|start/.test(v));
    if(/completion|after/.test(key))return words.some(v=>/completion|complete|after|finished/.test(v))||docs.length>0&&/COMPLET/.test(upper(value(task,'Status','status')));
    return docs.length>0;
  }
  if(/note|issue|constraint|customer requirement/.test(key))return notes.length>0;
  if(/measure|dimension/.test(key))return measurements.length>0;
  if(/visit/.test(key))return visits.some(row=>/COMPLET|FINISH|ORGANIZ/.test(upper(value(row,'Status','status'))));
  if(/checklist|mow|trim|blow|truck|skid|work performed|parts|material/.test(key))return checks.some(row=>/COMPLET|PASS|DONE/.test(upper(value(row,'Status','status'))))||/COMPLET/.test(upper(value(task,'Status','status')));
  return /COMPLET/.test(upper(value(task,'Status','status')));
}
function proofState(task,job){
  const items=requiredProof(task,job).map(label=>({label,done:proofDone(label,job,task)}));
  return {items,complete:items.length>0&&items.every(item=>item.done)};
}
function openJob(jid){
  if(!allowed().includes('work'))return;
  window.openPage?.('work');
  setTimeout(()=>{
    const select=document.getElementById('h38LifecycleJob');
    if(select&&Array.from(select.options||[]).some(option=>option.value===text(jid))){select.value=text(jid);select.dispatchEvent(new Event('change',{bubbles:true}));}
    scheduleDecorate();
  },30);
}
function openSite(job){
  if(!job)return;
  const customerId=id(job,'Customer ID','customerId'),jid=id(job,'Job ID','jobId'),quote=rows('quotes').filter(row=>id(row,'Job ID','jobId')===jid).slice().sort((a,b)=>new Date(value(b,'Updated Time','Created Time')||0)-new Date(value(a,'Updated Time','Created Time')||0))[0];
  if(window.H38_FIELD_VISIT?.open)window.H38_FIELD_VISIT.open({customerId,quoteId:id(quote,'Quote ID','quoteId')});
  else if(allowed().includes('field'))window.openPage?.('field');
}
async function clockIn(task){
  if(!task||!window.H38_EMPLOYEE_WORKSPACE?.clockInToTask)return;
  await window.H38_EMPLOYEE_WORKSPACE.clockInToTask(task);scheduleDecorate();
}
async function clockOut(){
  if(!window.H38_EMPLOYEE_WORKSPACE?.clockOut)return;
  await window.H38_EMPLOYEE_WORKSPACE.clockOut();scheduleDecorate();
}
async function completeTask(task){
  if(!task||!window.H38_EMPLOYEE_WORKSPACE?.updateAssignedTask)return;
  if(!window.confirm('Mark this assigned task complete? This records completion only; it does not send anything to the customer.'))return;
  if(activeTime())await clockOut();
  await window.H38_EMPLOYEE_WORKSPACE.updateAssignedTask(id(task,'Task ID','taskId'),'Completed','Completed from the job workflow after required proof review.');
  scheduleDecorate();
}
function navigate(address){if(address)window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(address),'_blank','noopener');}
function openMessages(customerId='',jobId=''){window.H38_PENDING_MESSAGE_CONTEXT={customerId:text(customerId),jobId:text(jobId)};window.openPage?.('messages');}
function syncTruth(){return navigator.onLine===false?'Offline — changes stay queued locally':'Online';}
function normalizeOneShell(){
  const s=window.state;if(!s)return false;
  let changed=s.shell==='field';
  if(changed)s.shell='office';
  try{localStorage.removeItem(LEGACY_PREF_KEY);}catch(_){}
  document.documentElement.classList.remove('h38-mobile-field-view','h38-mobile-full-office');
  document.getElementById('h38MobileWorkspaceToggle')?.remove();
  const label=document.getElementById('shellLabel');if(label)label.textContent='Business Office';
  document.documentElement.dataset.h38OneShellRole=fieldRole()?'field':'office';
  if(changed){try{window.renderNav?.();}catch(_){}try{window.openPage?.(s.page||'today',false);}catch(_){}}
  window.dispatchEvent(new CustomEvent('h38:mobile-workspace-view-changed',{detail:{mode:'office',fieldView:false,fullOffice:false,oneShell:true,legacyFieldModeRetired:true}}));
  return true;
}
function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
@media(max-width:760px){
 .h38-field-my-day,.h38-field-job-hub{display:grid;gap:10px;margin:0 0 12px}
 .h38-field-card{border:1px solid var(--line,#d6e0e8);border-radius:14px;background:var(--card,#fff);padding:12px;display:grid;gap:9px}
 .h38-field-card h2,.h38-field-card h3{margin:0}.h38-field-card p{margin:0;color:var(--muted,#607285)}
 .h38-field-kicker{font-size:.7rem;font-weight:900;letter-spacing:.08em;color:var(--blue,#174a70)}
 .h38-field-actions{display:flex;gap:7px;flex-wrap:wrap}.h38-field-actions>*{min-height:44px;display:inline-flex;align-items:center;justify-content:center}
 .h38-proof-list{display:grid;gap:7px}.h38-proof-item{display:flex;align-items:center;gap:8px;padding:8px 0;border-top:1px solid var(--line,#d6e0e8)}
 .h38-proof-item:first-child{border-top:0}.h38-proof-item b{width:22px;text-align:center}.h38-proof-item.pending b{color:#9a5d00}.h38-proof-item.done b{color:#1d7a46}
 .h38-field-remaining{display:grid;gap:7px}.h38-field-remaining button{text-align:left;min-height:48px}
 .h38-field-job-tabs{display:flex;gap:5px;overflow:auto}.h38-field-job-tabs button{min-height:42px;white-space:nowrap}
 .h38-field-job-pane[hidden]{display:none!important}.h38-field-job-pane{display:grid;gap:8px}
 html[data-h38-one-shell-role="field"] #h38CustomerReadyToday{display:none!important}
}
`;document.head.appendChild(style);
}
function renderMyDay(){
  const main=document.getElementById('mainContent');if(!mobile()||!fieldRole()||window.state?.page!=='today'||!main)return;
  const head=main.querySelector('.page-head'),title=head?.querySelector('h1'),copy=head?.querySelector('p');if(title)title.textContent='My Day';if(copy)copy.textContent='What you are doing now, what is next, and what must be finished before you leave.';
  let host=document.getElementById(MY_DAY_ID);if(host)host.remove();host=document.createElement('section');host.id=MY_DAY_ID;host.className='h38-field-my-day';
  const ctx=currentContext(),job=ctx.job,task=ctx.task,proof=proofState(task,job),events=upcomingEvents(),next=events[0]||null,nextJob=jobById(value(next?.row,'Related Record ID','relatedRecordId','Job ID','jobId')),nextCustomer=customerFor(nextJob,next?.row),nextAddress=text(value(next?.row,'Location','location','Address','address')||value(nextCustomer,'Service Address','serviceAddress','Address','address')),nextPhone=text(value(nextCustomer,'Phone','phone','Mobile Phone','mobilePhone')),nextInstructions=text(value(next?.row,'Instructions','instructions','Notes','notes')||value(nextJob,'Instructions','instructions','Scope','scope','Description','description'));
  const todayEnd=new Date();todayEnd.setHours(23,59,59,999);const remaining=events.filter(item=>item.start.getTime()<=todayEnd.getTime()).slice(0,8);
  host.innerHTML=`<section class="h38-field-card"><span class="h38-field-kicker">CURRENT WORK</span><h2>${esc(value(job,'Project Title','projectTitle','Job Number','jobNumber')||'No job in progress')}</h2><p>${esc(value(task,'Task Title','taskTitle','Instructions','instructions')||'Open your next assignment when you are ready.')}</p>${ctx.time?`<strong>${esc(durationLabel(ctx.time))}</strong>`:''}<small>${esc(syncTruth())}</small><div class="h38-field-actions">${job?`<button type="button" class="primary" data-h38-open-current-job>Open Job</button>`:''}${ctx.time?'<button type="button" class="secondary" data-h38-clock-out>Clock Out</button>':task?'<button type="button" class="secondary" data-h38-clock-in>Clock In</button>':''}</div></section>
  <section class="h38-field-card"><span class="h38-field-kicker">NEXT ASSIGNMENT</span><h2>${esc(value(next?.row,'Title','title')||value(nextJob,'Project Title','projectTitle')||'Nothing scheduled next')}</h2>${next?`<p>${esc(next.start.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))} · ${esc(value(nextCustomer,'Customer Name','name')||'Customer')} · ${esc(nextAddress||'Location not set')}</p>${nextInstructions?`<p><strong>Instructions:</strong> ${esc(nextInstructions)}</p>`:''}<div class="h38-field-actions">${nextAddress?'<button type="button" class="secondary" data-h38-next-navigate>Navigate</button>':''}${nextPhone?`<a class="secondary" href="tel:${esc(nextPhone.replace(/[^\d+]/g,''))}">Call</a>`:''}<button type="button" class="secondary" data-h38-next-message>Message</button>${nextJob?'<button type="button" class="primary" data-h38-next-open>Open</button>':''}</div>`:'<p>No more assigned work is scheduled next.</p>'}</section>
  <section class="h38-field-card"><span class="h38-field-kicker">REQUIRED BEFORE LEAVING</span><div class="h38-proof-list">${proof.items.length?proof.items.map(item=>`<div class="h38-proof-item ${item.done?'done':'pending'}"><b>${item.done?'✓':'○'}</b><span>${esc(item.label)}</span></div>`).join(''):'<p>No required proof is configured for the current assignment.</p>'}</div></section>
  <section class="h38-field-card"><span class="h38-field-kicker">REMAINING TODAY</span><div class="h38-field-remaining">${remaining.length?remaining.map(item=>{const j=jobById(value(item.row,'Related Record ID','relatedRecordId','Job ID','jobId'));return `<button type="button" data-h38-remaining-job="${esc(id(j,'Job ID','jobId'))}"><strong>${esc(item.start.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))} — ${esc(value(item.row,'Title','title')||value(j,'Project Title','projectTitle')||'Assignment')}</strong></button>`;}).join(''):'<p>No more assigned jobs today.</p>'}</div></section>`;
  head?.insertAdjacentElement('afterend',host)||main.prepend(host);
  host.querySelector('[data-h38-open-current-job]')?.addEventListener('click',()=>openJob(id(job,'Job ID','jobId')));
  host.querySelector('[data-h38-clock-in]')?.addEventListener('click',()=>void clockIn(task));
  host.querySelector('[data-h38-clock-out]')?.addEventListener('click',()=>void clockOut());
  host.querySelector('[data-h38-next-navigate]')?.addEventListener('click',()=>navigate(nextAddress));
  host.querySelector('[data-h38-next-message]')?.addEventListener('click',()=>openMessages(id(nextCustomer,'Customer ID','customerId'),id(nextJob,'Job ID','jobId')));
  host.querySelector('[data-h38-next-open]')?.addEventListener('click',()=>openJob(id(nextJob,'Job ID','jobId')));
  host.querySelectorAll('[data-h38-remaining-job]').forEach(button=>button.addEventListener('click',()=>button.dataset.h38RemainingJob&&openJob(button.dataset.h38RemainingJob)));
}
function jobContext(){
  const select=document.getElementById('h38LifecycleJob'),selected=jobById(select?.value);
  const current=currentContext();return {job:selected||current.job,task:current.task,time:current.time};
}
function renderJobHub(){
  const main=document.getElementById('mainContent');if(!mobile()||!fieldRole()||window.state?.page!=='work'||!main)return;
  let host=document.getElementById(JOB_HUB_ID);if(host)host.remove();
  const ctx=jobContext(),job=ctx.job;if(!job)return;const jid=id(job,'Job ID','jobId'),task=ctx.task&&id(ctx.task,'Job ID','jobId')===jid?ctx.task:assignedTasks().find(row=>id(row,'Job ID','jobId')===jid)||null,customer=customerFor(job),address=text(value(job,'Address','address','Service Address','serviceAddress')||value(customer,'Service Address','serviceAddress','Address','address')),phone=text(value(customer,'Phone','phone','Mobile Phone','mobilePhone')),proof=proofState(task,job),visit=linkedRows('siteCaptureSessions',job,task).slice().sort((a,b)=>new Date(value(b,'Updated Time','Created Time')||0)-new Date(value(a,'Updated Time','Created Time')||0))[0],visitOpen=visit&&!/COMPLET|FINISH|ORGANIZ/.test(upper(value(visit,'Status','status'))),time=ctx.time&&id(ctx.time,'Job ID','jobId')===jid?ctx.time:null;
  let action='summary',label='View Summary';if(visitOpen){action='site';label='Continue Site Visit';}else if(!time&&task){action='start';label='Start Job';}else if(time&&proof.items.length&&!proof.complete){action='proof';label='Finish Required Proof';}else if(time){action='continue';label='Continue Work';}else if(proof.complete&&task&&!/COMPLET/.test(upper(value(task,'Status','status')))){action='complete';label='Review & Complete';}
  const files=linkedRows('documents',job,task),activity=[...linkedRows('jobNotes',job,task),...linkedRows('dailyLogs',job,task),...linkedRows('siteCaptureSessions',job,task)].slice().sort((a,b)=>new Date(value(b,'Updated Time','Created Time')||0)-new Date(value(a,'Updated Time','Created Time')||0)).slice(0,8);
  host=document.createElement('section');host.id=JOB_HUB_ID;host.className='h38-field-job-hub';
  host.innerHTML=`<section class="h38-field-card"><span class="h38-field-kicker">CURRENT JOB</span><h2>${esc(value(job,'Project Title','projectTitle','Job Number','jobNumber')||'Job')}</h2><p>${esc(value(customer,'Customer Name','name')||'Customer')} · ${esc(address||'Address not set')}</p><div class="h38-field-actions">${phone?`<a class="secondary" href="tel:${esc(phone.replace(/[^\d+]/g,''))}">Call</a>`:''}<button type="button" class="secondary" data-h38-job-message>Message</button>${address?'<button type="button" class="secondary" data-h38-job-navigate>Navigate</button>':''}</div></section>
  <section class="h38-field-card"><span class="h38-field-kicker">NEXT STEP</span><h2>${esc(label)}</h2><p>${esc(value(task,'Task Title','taskTitle','Instructions','instructions')||value(job,'Status','status')||'Keep this job moving.')}</p><button type="button" class="primary" data-h38-job-primary="${action}">${esc(label)}</button></section>
  <section class="h38-field-card"><div class="h38-field-job-tabs" role="tablist">${['overview','work','proof','files','activity'].map((key,index)=>`<button type="button" data-h38-job-tab="${key}" class="${index===0?'active':''}">${key[0].toUpperCase()+key.slice(1)}</button>`).join('')}</div>
   <div class="h38-field-job-pane" data-h38-job-pane="overview"><strong>${esc(value(job,'Status','status')||'Open')}</strong><span>${esc(value(job,'Scope','scope','Description','description')||'Job details are available in the records below.')}</span></div>
   <div class="h38-field-job-pane" data-h38-job-pane="work" hidden><strong>${esc(value(task,'Task Title','taskTitle')||'Assigned work')}</strong><span>${esc(value(task,'Instructions','instructions')||'Review the job scope and assigned checklist.')}</span><div class="h38-field-actions">${time?'<button type="button" class="secondary" data-h38-job-clock-out>Clock Out</button>':task?'<button type="button" class="secondary" data-h38-job-clock-in>Clock In</button>':''}${task&&proof.complete&&!/COMPLET/.test(upper(value(task,'Status','status')))?'<button type="button" class="primary" data-h38-job-complete>Complete task</button>':''}</div></div>
   <div class="h38-field-job-pane" data-h38-job-pane="proof" hidden><div class="h38-proof-list">${proof.items.length?proof.items.map(item=>`<div class="h38-proof-item ${item.done?'done':'pending'}"><b>${item.done?'✓':'○'}</b><span>${esc(item.label)}</span></div>`).join(''):'<p>No required proof has been configured yet.</p>'}</div><div class="h38-field-actions"><button type="button" class="secondary" data-h38-job-site>Start / Continue Site Visit</button></div></div>
   <div class="h38-field-job-pane" data-h38-job-pane="files" hidden>${files.length?files.slice(0,8).map(row=>`<div><strong>${esc(value(row,'File Name','fileName','Title','title')||'File')}</strong></div>`).join(''):'<p>No job files yet.</p>'}</div>
   <div class="h38-field-job-pane" data-h38-job-pane="activity" hidden>${activity.length?activity.map(row=>`<div><strong>${esc(value(row,'Title','Summary','Note Type','Status')||'Activity')}</strong><small>${esc(value(row,'Updated Time','Created Time')||'')}</small></div>`).join(''):'<p>No job activity yet.</p>'}</div>
  </section>`;
  const existing=document.getElementById('h38JobCommandHome'),head=main.querySelector('.page-head');(existing||head)?.insertAdjacentElement(existing?'beforebegin':'afterend',host);
  const show=key=>{host.querySelectorAll('[data-h38-job-pane]').forEach(p=>p.hidden=p.dataset.h38JobPane!==key);host.querySelectorAll('[data-h38-job-tab]').forEach(b=>b.classList.toggle('active',b.dataset.h38JobTab===key));};
  host.querySelectorAll('[data-h38-job-tab]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.h38JobTab)));
  host.querySelector('[data-h38-job-message]')?.addEventListener('click',()=>openMessages(id(customer,'Customer ID','customerId'),jid));
  host.querySelector('[data-h38-job-navigate]')?.addEventListener('click',()=>navigate(address));
  host.querySelector('[data-h38-job-clock-in]')?.addEventListener('click',()=>void clockIn(task));
  host.querySelector('[data-h38-job-clock-out]')?.addEventListener('click',()=>void clockOut());
  host.querySelector('[data-h38-job-complete]')?.addEventListener('click',()=>void completeTask(task));
  host.querySelector('[data-h38-job-site]')?.addEventListener('click',()=>openSite(job));
  host.querySelector('[data-h38-job-primary]')?.addEventListener('click',event=>{const a=event.currentTarget.dataset.h38JobPrimary;if(a==='start')void clockIn(task);else if(a==='site')openSite(job);else if(a==='proof')show('proof');else if(a==='complete')void completeTask(task);else show(a==='continue'?'work':'activity');});
}
function decorate(){
  if(!mobile()||!user())return;
  normalizeOneShell();installStyle();
  if(!fieldRole()){document.getElementById(MY_DAY_ID)?.remove();document.getElementById(JOB_HUB_ID)?.remove();return;}
  renderMyDay();renderJobHub();
}
function scheduleDecorate(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;decorate();});}
function start(){
  normalizeOneShell();installStyle();scheduleDecorate();
  window.addEventListener('h38:business-snapshot-updated',scheduleDecorate);
  window.addEventListener('h38:office-page-rendered',scheduleDecorate);
  window.addEventListener('pageshow',scheduleDecorate);
  window.addEventListener('focus',scheduleDecorate);
  window.addEventListener('h38:auth-cleared',()=>{document.getElementById(MY_DAY_ID)?.remove();document.getElementById(JOB_HUB_ID)?.remove();});
  new MutationObserver(scheduleDecorate).observe(document.body,{childList:true,subtree:true});
  let attempts=0;const timer=setInterval(()=>{attempts++;if(user()){decorate();clearInterval(timer);}else if(attempts>40)clearInterval(timer);},200);
}
window.H38_MOBILE_FIELD_VIEW=Object.freeze({
  build:BUILD,
  retiredUserFacingMode:true,
  compatibilityOnly:true,
  oneBusinessOfficeShell:true,
  roleAwarePresentation:true,
  legacyPreferenceIgnored:true,
  legacyFieldQueryNormalized:true,
  fieldRoleLanding:'today-my-day',
  fieldPrimaryNavigation:['Today','Jobs','Schedule','Messages','More'],
  siteVisitContextualAction:true,
  sameBusinessOfficeData:true,
  samePermissions:true,
  separateAppRequired:false,
  preferenceKey:LEGACY_PREF_KEY,
  setFieldView:()=>{normalizeOneShell();scheduleDecorate();return false;},
  setFullOffice:()=>{normalizeOneShell();scheduleDecorate();return true;},
  reconcile:()=>{normalizeOneShell();scheduleDecorate();return true;}
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();