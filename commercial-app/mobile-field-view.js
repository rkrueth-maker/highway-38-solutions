(function(){
'use strict';
const BUILD='20260919-field-execution-ux-1';
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
  const task=timeTask||tasks.find(row=>/START|IN PROGRESS|ACCEPT|ON MY WAY|ARRIVED|PAUSED/.test(upper(value(row,'Status','status'))))||tasks[0]||null;
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
function parseRequirementValue(raw){
  if(Array.isArray(raw))return raw.map(item=>text(typeof item==='string'?item:item?.label||item?.title||item?.name)).filter(Boolean);
  if(raw&&typeof raw==='object'){if(Array.isArray(raw.items))return parseRequirementValue(raw.items);return Object.entries(raw).filter(([,enabled])=>enabled===true||enabled==='Required').map(([label])=>text(label)).filter(Boolean);}
  const source=text(raw);if(!source)return[];
  try{const parsed=JSON.parse(source);if(parsed!==source)return parseRequirementValue(parsed);}catch(_){}
  return source.split(/[\n,;|]+/).map(text).filter(Boolean);
}
function workOrderFor(job){
  const wid=id(job,'Work Order ID','workOrderId'),jid=id(job,'Job ID','jobId');
  return rows('workOrders').find(row=>(wid&&id(row,'Work Order ID','workOrderId','id')===wid)||(jid&&id(row,'Job ID','jobId')===jid))||null;
}
function requiredProof(task,job){
  const workOrder=workOrderFor(job),configured=[
    value(task,'Required Proof','requiredProof','Required Closeout','requiredCloseout','Completion Requirements','completionRequirements','Proof Required','proofRequired'),
    value(job,'Required Proof','requiredProof','Required Closeout','requiredCloseout','Completion Requirements','completionRequirements','Proof Required','proofRequired'),
    value(workOrder,'Closeout Requirements JSON','closeoutRequirementsJson','Required Proof','requiredProof','Completion Requirements','completionRequirements')
  ];
  let items=[];
  for(const raw of configured){items=parseRequirementValue(raw);if(items.length)break;}
  if(!items.length){
    const checklistRows=rows('checklists').filter(row=>id(row,'Job ID','jobId')===id(job,'Job ID','jobId'));
    for(const row of checklistRows){const labels=parseRequirementValue(value(row,'Items JSON','itemsJson','Required Items JSON','requiredItemsJson'));if(labels.length){items=labels;break;}}
  }
  if(items.length)return Array.from(new Set(items));
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
  if(/issue|constraint|customer requirement/.test(key))return notes.length>0;
  if(/note/.test(key)){
    const completionNotes=notes.filter(row=>!/FIELD ISSUE/.test(upper(value(row,'Note Type','noteType'))));
    return completionNotes.length>0;
  }
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
function syncTruth(job,task){
  if(navigator.onLine===false)return'Offline — saved locally';
  const related=['documents','jobNotes','dailyLogs','siteMeasurements','siteCaptureSessions','checklists'].flatMap(name=>linkedRows(name,job,task));
  if(related.some(row=>row?.__localPending===true||/PENDING|QUEUED|SYNCING/.test(upper(value(row,'Sync Status','syncStatus')))))return'Syncing';
  return'Saved';
}
function timeState(time){const status=upper(value(time,'Status','status'));if(status==='BREAK')return'BREAK';if(status==='PAUSED')return'PAUSED';return time?'WORKING':'';}
function workElapsedLabel(time){
  if(!time)return'';
  const started=new Date(value(time,'Clock In','Clock In Time','Start Time','startTime','Created Time')||0).getTime();if(!Number.isFinite(started))return'Active';
  let breakMinutes=Number(value(time,'Break Minutes','breakMinutes'))||0;
  if(/PAUSED|BREAK/.test(upper(value(time,'Status','status')))){const paused=new Date(value(time,'Paused Time','pausedTime')||0).getTime();if(Number.isFinite(paused))breakMinutes+=Math.max(0,(Date.now()-paused)/60000);}
  const min=Math.max(0,Math.floor((Date.now()-started)/60000-breakMinutes)),h=Math.floor(min/60),m=min%60;return h?`${h}h ${m}m`:`${m}m`;
}
async function taskStatus(task,status,note=''){if(!task||!window.H38_EMPLOYEE_WORKSPACE?.updateAssignedTask)return;await window.H38_EMPLOYEE_WORKSPACE.updateAssignedTask(id(task,'Task ID','taskId'),status,note);scheduleDecorate();}
async function startWork(task){if(!task)return;await clockIn(task);try{await taskStatus(task,'Started','Work started from the field Job Hub.');}catch(_){scheduleDecorate();}}
async function pauseWork(task,kind){if(!window.H38_EMPLOYEE_WORKSPACE?.timeTransition)return;await window.H38_EMPLOYEE_WORKSPACE.timeTransition(kind,'Field Job Hub');if(task)try{await taskStatus(task,'Paused',kind==='BREAK'?'Break started.':'Job paused.');}catch(_){}scheduleDecorate();}
async function resumeWork(task){if(!window.H38_EMPLOYEE_WORKSPACE?.timeTransition)return;await window.H38_EMPLOYEE_WORKSPACE.timeTransition('RESUME','Field Job Hub');if(task)try{await taskStatus(task,'Started','Work resumed.');}catch(_){}scheduleDecorate();}
function executionState(task,time){
  const taskState=upper(value(task,'Status','status')),clock=timeState(time);
  if(/COMPLET/.test(taskState))return'COMPLETE';if(clock==='BREAK')return'BREAK';if(clock==='PAUSED'||taskState==='PAUSED')return'PAUSED';if(clock==='WORKING')return'WORKING';if(taskState==='ON MY WAY')return'ON_MY_WAY';if(taskState==='ARRIVED'||taskState==='STARTED')return'ARRIVED';return'SCHEDULED';
}
function proofAction(label){
  const key=text(label).toLowerCase();
  if(/photo|condition|before|after/.test(key))return['photo','Take Photo'];if(/video/.test(key))return['video','Record Video'];if(/voice|audio/.test(key))return['voice','Record Voice Note'];if(/measure|dimension/.test(key))return['measure','Measure'];if(/note|description/.test(key))return['note','Add Note'];if(/checklist|mow|trim|blow|truck|skid/.test(key))return['checklist','Open Checklist'];if(/material|part|salt/.test(key))return['material','Record Material'];if(/issue|constraint|access|safety|unable/.test(key))return['issue','Report Issue'];return['capture','Add Proof'];
}
function proofMarkup(proof){
  if(!proof.items.length)return'<p>No required proof is configured for this assignment.</p>';
  return proof.items.map((item,index)=>{const [action,label]=proofAction(item.label);return `<div class="h38-proof-item ${item.done?'done':'pending'}"><b>${item.done?'✓':'○'}</b><span>${esc(item.label)}</span>${item.done?'':`<button type="button" class="secondary" data-h38-proof-action="${esc(action)}" data-h38-proof-index="${index}">${esc(label)}</button>`}</div>`;}).join('');
}
function launchCapture(kind,job,task,show){
  window.H38_PENDING_FIELD_CAPTURE_CONTEXT={kind:text(kind),jobId:id(job,'Job ID','jobId'),taskId:id(task,'Task ID','taskId'),customerId:id(job,'Customer ID','customerId')};
  if(kind==='checklist'){show?.('work');return;}if(kind==='material'&&allowed().includes('inventory')){window.openPage?.('inventory');return;}if(kind==='issue'){showIssueDialog(job,task);return;}openSite(job);
}
function captureDialog(job,task,show){
  let dialog=document.getElementById('h38FieldCaptureDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='h38FieldCaptureDialog';document.body.appendChild(dialog);}
  dialog.innerHTML=`<form method="dialog" class="h38-field-dialog"><header><div><span class="h38-field-kicker">CAPTURE FOR THIS JOB</span><h2>Add proof or a field record</h2></div><button value="cancel" class="secondary">Close</button></header><div class="h38-field-capture-grid">${[['photo','Photo'],['video','Video'],['voice','Voice note'],['note','Text note'],['measure','Measurement'],['issue','Report Issue']].map(([key,label])=>`<button type="button" class="secondary" data-h38-capture-kind="${key}">${label}</button>`).join('')}</div><p>Customer, job and assignment context stay attached through the existing Office/Site Visit records. Nothing is sent to the customer automatically.</p></form>`;
  dialog.querySelectorAll('[data-h38-capture-kind]').forEach(button=>button.onclick=()=>{const kind=button.dataset.h38CaptureKind;dialog.close();launchCapture(kind,job,task,show);});dialog.showModal();
}
function showIssueDialog(job,task){
  let dialog=document.getElementById('h38FieldIssueDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='h38FieldIssueDialog';document.body.appendChild(dialog);}
  const categories=['Need material','Equipment problem','Customer scope change','Access problem','Safety issue','Weather','Property condition','Unable to complete','Other'];
  dialog.innerHTML=`<form class="h38-field-dialog" data-h38-issue-form><header><div><span class="h38-field-kicker">INTERNAL ISSUE</span><h2>What is preventing normal completion?</h2></div><button type="button" class="secondary" data-h38-issue-close>Close</button></header><label>Category<select name="category">${categories.map(category=>`<option>${esc(category)}</option>`).join('')}</select></label><label>What happened?<textarea name="note" rows="4" placeholder="What does the office need to know?"></textarea></label><p>This creates an internal Needs Attention record. It does not message the customer.</p><div class="h38-field-actions"><button type="button" class="secondary" data-h38-issue-evidence>Add photo / voice evidence</button><button type="submit" class="primary">Save Internal Issue</button></div></form>`;
  dialog.querySelector('[data-h38-issue-close]').onclick=()=>dialog.close();dialog.querySelector('[data-h38-issue-evidence]').onclick=()=>{dialog.close();launchCapture('capture',job,task);};
  dialog.querySelector('[data-h38-issue-form]').onsubmit=async event=>{event.preventDefault();const form=new FormData(event.currentTarget),submit=event.currentTarget.querySelector('[type="submit"]');submit.disabled=true;try{if(!window.H38_EMPLOYEE_WORKSPACE?.reportIssue)throw new Error('Secure field issue reporting is not ready.');await window.H38_EMPLOYEE_WORKSPACE.reportIssue({jobId:id(job,'Job ID','jobId'),taskId:id(task,'Task ID','taskId'),category:form.get('category'),note:form.get('note')});dialog.close();scheduleDecorate();}catch(error){window.toast?.(error.message||'Could not save the issue.',true);}finally{submit.disabled=false;}};dialog.showModal();
}
function showCloseout(job,task,time,proof){
  let dialog=document.getElementById('h38FieldCloseoutDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='h38FieldCloseoutDialog';document.body.appendChild(dialog);}
  const docs=linkedRows('documents',job,task),photos=docs.filter(row=>/^image\//i.test(text(value(row,'Mime Type','mimeType')))||/photo|image/i.test(text(value(row,'Document Type','documentType','Evidence Type','evidenceType')))),notes=[...linkedRows('jobNotes',job,task),...linkedRows('dailyLogs',job,task)],materials=linkedRows('inventoryTransactions',job,task),issues=linkedRows('jobNotes',job,task).filter(row=>/FIELD ISSUE/.test(upper(value(row,'Note Type','noteType')))&&!/RESOLVED|CLOSED/.test(upper(value(row,'Status','status')))),missing=proof.items.filter(item=>!item.done);
  dialog.innerHTML=`<form method="dialog" class="h38-field-dialog"><header><div><span class="h38-field-kicker">FINISH JOB</span><h2>Review closeout</h2></div><button value="cancel" class="secondary">Finish Later</button></header><div class="h38-closeout-grid"><div><small>Time</small><strong>${esc(workElapsedLabel(time)||'No active timer')}</strong></div><div><small>Required proof</small><strong>${proof.items.filter(x=>x.done).length} of ${proof.items.length}</strong></div><div><small>Photos</small><strong>${photos.length}</strong></div><div><small>Notes</small><strong>${notes.length}</strong></div><div><small>Materials</small><strong>${materials.length}</strong></div><div><small>Open issues</small><strong>${issues.length}</strong></div></div>${missing.length?`<section class="h38-closeout-missing"><strong>${missing.length} ITEM${missing.length===1?'':'S'} STILL REQUIRED</strong>${missing.map(item=>`<div>○ ${esc(item.label)}</div>`).join('')}<button type="button" class="primary" data-h38-closeout-proof>Finish Requirements</button></section>`:'<button type="button" class="primary" data-h38-closeout-complete>Complete Job</button>'}</form>`;
  dialog.querySelector('[data-h38-closeout-proof]')?.addEventListener('click',()=>{dialog.close();document.querySelector('[data-h38-job-tab="proof"]')?.click();});
  dialog.querySelector('[data-h38-closeout-complete]')?.addEventListener('click',async event=>{event.currentTarget.disabled=true;try{await completeTask(task);dialog.close();}catch(error){window.toast?.(error.message||'Could not complete this job.',true);event.currentTarget.disabled=false;}});dialog.showModal();
}
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
 .h38-field-status-row{display:flex;justify-content:space-between;gap:8px;align-items:center}.h38-field-status-row small{color:var(--muted,#607285)}
 .h38-field-progress{display:grid;gap:4px}.h38-field-progress progress{width:100%;height:8px}
 .h38-proof-item{flex-wrap:wrap}.h38-proof-item>span{flex:1 1 150px}.h38-proof-item>button{margin-left:auto}
 .h38-field-file{width:100%;display:flex!important;justify-content:space-between!important;text-align:left!important;padding:10px!important}.h38-field-file small{color:var(--muted,#607285)}
 .h38-field-alert{padding:9px;border-radius:10px;background:#fff7e6;border:1px solid #ead39c;display:grid;gap:5px}
 .h38-field-dialog{display:grid;gap:12px;min-width:min(520px,calc(100vw - 28px));padding:16px}.h38-field-dialog header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
 .h38-field-dialog label{display:grid;gap:5px;font-weight:800}.h38-field-dialog select,.h38-field-dialog textarea{width:100%;min-height:44px}
 .h38-field-capture-grid,.h38-closeout-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.h38-closeout-grid>div{display:grid;gap:3px;padding:9px;border:1px solid var(--line,#d6e0e8);border-radius:10px}
 .h38-closeout-missing{display:grid;gap:8px;padding:10px;border-radius:10px;background:#fff7e6}
 html[data-h38-one-shell-role="field"] #h38CustomerReadyToday{display:none!important}
}
`;document.head.appendChild(style);
}
function renderMyDay(){
  const main=document.getElementById('mainContent');if(!mobile()||!fieldRole()||window.state?.page!=='today'||!main)return;
  const head=main.querySelector('.page-head'),title=head?.querySelector('h1'),copy=head?.querySelector('p');if(title)title.textContent='My Day';if(copy)copy.textContent='What you are doing now, what is next, and what must be finished before you leave.';
  let host=document.getElementById(MY_DAY_ID);const ctx=currentContext(),active=!!ctx.time,primaryJob=ctx.job,primaryTask=ctx.task,proof=proofState(primaryTask,primaryJob),events=upcomingEvents(),primaryJobId=id(primaryJob,'Job ID','jobId');
  const filteredEvents=events.filter(item=>id(jobById(value(item.row,'Related Record ID','relatedRecordId','Job ID','jobId')),'Job ID','jobId')!==primaryJobId),next=filteredEvents[0]||null,nextJob=jobById(value(next?.row,'Related Record ID','relatedRecordId','Job ID','jobId')),nextCustomer=customerFor(nextJob,next?.row),nextAddress=text(value(next?.row,'Location','location','Address','address')||value(nextCustomer,'Service Address','serviceAddress','Address','address')),nextPhone=text(value(nextCustomer,'Phone','phone','Mobile Phone','mobilePhone')),nextInstructions=text(value(next?.row,'Instructions','instructions','Notes','notes')||value(nextJob,'Instructions','instructions','Scope','scope','Description','description'));
  const todayEnd=new Date();todayEnd.setHours(23,59,59,999);const remaining=filteredEvents.filter(item=>item!==next&&item.start.getTime()<=todayEnd.getTime()).slice(0,8),primaryLabel=active?'CURRENT JOB':'NEXT JOB';
  const signature=JSON.stringify({active,job:primaryJobId,task:id(primaryTask,'Task ID','taskId'),taskStatus:text(value(primaryTask,'Status','status')),time:id(ctx.time,'Time Entry ID','timeEntryId'),timeStatus:text(value(ctx.time,'Status','status')),proof:proof.items,next:id(next?.row,'Schedule Event ID','scheduleEventId'),remaining:remaining.map(item=>id(item.row,'Schedule Event ID','scheduleEventId')),online:navigator.onLine!==false});
  if(host?.dataset.h38FieldSignature===signature)return;if(host)host.remove();host=document.createElement('section');host.id=MY_DAY_ID;host.className='h38-field-my-day';host.dataset.h38FieldSignature=signature;
  host.innerHTML=`<section class="h38-field-card"><span class="h38-field-kicker">${primaryLabel}</span><h2>${esc(value(primaryJob,'Project Title','projectTitle','Job Number','jobNumber')||(active?'No job in progress':'No assigned job'))}</h2><p>${esc(value(primaryTask,'Task Title','taskTitle','Instructions','instructions')||(active?'Open the active job to continue.':'No assigned work is ready to start.'))}</p>${ctx.time?`<strong>${esc(executionState(primaryTask,ctx.time).replaceAll('_',' '))} · ${esc(workElapsedLabel(ctx.time))}</strong>`:''}<small>${esc(syncTruth(primaryJob,primaryTask))}</small><div class="h38-field-actions">${primaryJob?`<button type="button" class="primary" data-h38-open-current-job>Open Job</button>`:''}${ctx.time?'<button type="button" class="secondary" data-h38-clock-out>Clock Out</button>':primaryTask?'<button type="button" class="secondary" data-h38-clock-in>Start Work</button>':''}</div></section>
  <section class="h38-field-card"><span class="h38-field-kicker">NEXT ASSIGNMENT</span><h2>${esc(value(next?.row,'Title','title')||value(nextJob,'Project Title','projectTitle')||'Nothing scheduled after this')}</h2>${next?`<p>${esc(next.start.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))} · ${esc(value(nextCustomer,'Customer Name','name')||'Customer')} · ${esc(nextAddress||'Location not set')}</p>${nextInstructions?`<p><strong>Instructions:</strong> ${esc(nextInstructions)}</p>`:''}<div class="h38-field-actions">${nextAddress?'<button type="button" class="secondary" data-h38-next-navigate>Navigate</button>':''}${nextPhone?`<a class="secondary" href="tel:${esc(nextPhone.replace(/[^\d+]/g,''))}">Call</a>`:''}<button type="button" class="secondary" data-h38-next-message>Message</button>${nextJob?'<button type="button" class="primary" data-h38-next-open>Open</button>':''}</div>`:'<p>No additional assigned work is scheduled next.</p>'}</section>
  <section class="h38-field-card"><span class="h38-field-kicker">REQUIRED BEFORE LEAVING</span><div class="h38-proof-list">${proofMarkup(proof)}</div></section><section class="h38-field-card"><span class="h38-field-kicker">REMAINING TODAY</span><div class="h38-field-remaining">${remaining.length?remaining.map(item=>{const j=jobById(value(item.row,'Related Record ID','relatedRecordId','Job ID','jobId'));return `<button type="button" data-h38-remaining-job="${esc(id(j,'Job ID','jobId'))}"><strong>${esc(item.start.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}))} — ${esc(value(item.row,'Title','title')||value(j,'Project Title','projectTitle')||'Assignment')}</strong></button>`;}).join(''):'<p>No more assignments today.</p>'}</div></section>`;
  head?.insertAdjacentElement('afterend',host)||main.prepend(host);host.querySelector('[data-h38-open-current-job]')?.addEventListener('click',()=>openJob(primaryJobId));host.querySelector('[data-h38-clock-in]')?.addEventListener('click',()=>void startWork(primaryTask));host.querySelector('[data-h38-clock-out]')?.addEventListener('click',()=>void clockOut());host.querySelector('[data-h38-next-navigate]')?.addEventListener('click',()=>navigate(nextAddress));host.querySelector('[data-h38-next-message]')?.addEventListener('click',()=>openMessages(id(nextCustomer,'Customer ID','customerId'),id(nextJob,'Job ID','jobId')));host.querySelector('[data-h38-next-open]')?.addEventListener('click',()=>openJob(id(nextJob,'Job ID','jobId')));host.querySelectorAll('[data-h38-remaining-job]').forEach(button=>button.addEventListener('click',()=>button.dataset.h38RemainingJob&&openJob(button.dataset.h38RemainingJob)));host.querySelectorAll('[data-h38-proof-action]').forEach(button=>button.addEventListener('click',()=>launchCapture(button.dataset.h38ProofAction,primaryJob,primaryTask)));
}
function jobContext(){
  const select=document.getElementById('h38LifecycleJob'),selected=jobById(select?.value);
  const current=currentContext();return {job:selected||current.job,task:current.task,time:current.time};
}
function renderJobHub(){
  const main=document.getElementById('mainContent');if(!mobile()||!fieldRole()||window.state?.page!=='work'||!main)return;
  let host=document.getElementById(JOB_HUB_ID),activeTab=host?.querySelector('[data-h38-job-tab].active')?.dataset.h38JobTab||'overview';const ctx=jobContext(),job=ctx.job;if(!job){host?.remove();return;}
  const jid=id(job,'Job ID','jobId'),task=ctx.task&&id(ctx.task,'Job ID','jobId')===jid?ctx.task:assignedTasks().find(row=>id(row,'Job ID','jobId')===jid)||null,customer=customerFor(job),address=text(value(job,'Address','address','Service Address','serviceAddress')||value(customer,'Service Address','serviceAddress','Address','address')),phone=text(value(customer,'Phone','phone','Mobile Phone','mobilePhone')),proof=proofState(task,job),visit=linkedRows('siteCaptureSessions',job,task).slice().sort((a,b)=>new Date(value(b,'Updated Time','Created Time')||0)-new Date(value(a,'Updated Time','Created Time')||0))[0],visitOpen=visit&&!/COMPLET|FINISH|ORGANIZ/.test(upper(value(visit,'Status','status'))),time=ctx.time&&id(ctx.time,'Job ID','jobId')===jid?ctx.time:null,stateKey=executionState(task,time);
  let action='on-my-way',label='On My Way';if(stateKey==='ON_MY_WAY'){action='arrive';label='Arrive';}else if(stateKey==='ARRIVED'){action='start';label='Start Work';}else if(stateKey==='WORKING'){action='finish';label='Finish Work';}else if(stateKey==='PAUSED'||stateKey==='BREAK'){action='resume';label='Resume';}else if(stateKey==='COMPLETE'){action='summary';label='View Summary';}if(visitOpen&&stateKey!=='COMPLETE'){action='site';label='Continue Site Visit';}
  const files=linkedRows('documents',job,task),issues=linkedRows('jobNotes',job,task).filter(row=>/FIELD ISSUE/.test(upper(value(row,'Note Type','noteType')))),activity=[...linkedRows('jobNotes',job,task),...linkedRows('dailyLogs',job,task),...linkedRows('siteCaptureSessions',job,task)].slice().sort((a,b)=>new Date(value(b,'Updated Time','Created Time')||0)-new Date(value(a,'Updated Time','Created Time')||0)).slice(0,10),done=proof.items.filter(item=>item.done).length,total=proof.items.length,progress=total?`${done} of ${total} requirements complete`:'No closeout requirements configured';
  const signature=JSON.stringify({jid,task:id(task,'Task ID','taskId'),taskStatus:text(value(task,'Status','status')),time:id(time,'Time Entry ID','timeEntryId'),timeStatus:text(value(time,'Status','status')),visit:id(visit,'Capture Session ID','captureSessionId','Site Visit ID','siteVisitId'),visitStatus:text(value(visit,'Status','status')),proof:proof.items,files:files.map(row=>id(row,'Document ID','documentId')),issues:issues.map(row=>id(row,'Job Note ID','jobNoteId'))});
  if(host?.dataset.h38FieldSignature===signature)return;if(host)host.remove();host=document.createElement('section');host.id=JOB_HUB_ID;host.className='h38-field-job-hub';host.dataset.h38FieldSignature=signature;
  host.innerHTML=`<section class="h38-field-card h38-field-job-hero"><span class="h38-field-kicker">JOB</span><h2>${esc(value(job,'Project Title','projectTitle','Job Number','jobNumber')||'Job')}</h2><p>${esc(value(customer,'Customer Name','name')||'Customer')} · ${esc(address||'Address not set')}</p><div class="h38-field-status-row"><strong>${esc(stateKey.replaceAll('_',' '))}${time?` · ${esc(workElapsedLabel(time))}`:''}</strong><small>${esc(syncTruth(job,task))}</small></div><div class="h38-field-progress"><span>${esc(progress)}</span><progress max="${Math.max(1,total)}" value="${done}"></progress></div><div class="h38-field-actions">${phone?`<a class="secondary" href="tel:${esc(phone.replace(/[^\d+]/g,''))}">Call</a>`:''}<button type="button" class="secondary" data-h38-job-message>Message</button>${address?'<button type="button" class="secondary" data-h38-job-navigate>Navigate</button>':''}<button type="button" class="secondary" data-h38-job-capture>+ Capture</button></div></section>
  <section class="h38-field-card"><span class="h38-field-kicker">NEXT</span><h2>${esc(label)}</h2><p>${esc(value(task,'Task Title','taskTitle','Instructions','instructions')||value(job,'Status','status')||'Keep this job moving.')}</p><button type="button" class="primary" data-h38-job-primary="${action}">${esc(label)}</button></section>
  <section class="h38-field-card"><div class="h38-field-job-tabs" role="tablist">${['overview','work','proof','files','activity'].map((key,index)=>`<button type="button" data-h38-job-tab="${key}" class="${index===0?'active':''}">${key[0].toUpperCase()+key.slice(1)}</button>`).join('')}</div><div class="h38-field-job-pane" data-h38-job-pane="overview"><strong>${esc(value(job,'Status','status')||'Open')}</strong><span>${esc(value(job,'Scope','scope','Description','description')||'Job details are available in the records below.')}</span>${issues.length?`<div class="h38-field-alert"><strong>${issues.length} field issue${issues.length===1?'':'s'} reported</strong><button type="button" class="secondary" data-h38-job-issues>Review activity</button></div>`:''}</div>
  <div class="h38-field-job-pane" data-h38-job-pane="work" hidden><strong>${esc(value(task,'Task Title','taskTitle')||'Assigned work')}</strong><span>${esc(value(task,'Instructions','instructions')||'Review the job scope and assigned checklist.')}</span><div class="h38-field-actions">${stateKey==='WORKING'?'<button type="button" class="secondary" data-h38-job-pause>Pause</button><button type="button" class="secondary" data-h38-job-break>Break</button>':''}${stateKey==='PAUSED'||stateKey==='BREAK'?'<button type="button" class="primary" data-h38-job-resume>Resume</button>':''}<button type="button" class="secondary" data-h38-job-report>Report Issue</button><button type="button" class="secondary" data-h38-job-capture>+ Capture</button></div></div>
  <div class="h38-field-job-pane" data-h38-job-pane="proof" hidden><div class="h38-proof-list">${proofMarkup(proof)}</div><div class="h38-field-actions"><button type="button" class="secondary" data-h38-job-site>Start / Continue Site Visit</button></div></div>
  <div class="h38-field-job-pane" data-h38-job-pane="files" hidden>${files.length?files.slice(0,12).map(row=>`<button type="button" class="h38-field-file secondary" data-h38-open-document-id="${esc(id(row,'Document ID','documentId'))}" ${text(value(row,'Storage Path','storagePath'))?'':'disabled'}><strong>${esc(value(row,'File Name','fileName','Title','title')||'File')}</strong><small>${text(value(row,'Storage Path','storagePath'))?'Open':'Original file unavailable'}</small></button>`).join(''):'<p>No job files yet.</p>'}</div>
  <div class="h38-field-job-pane" data-h38-job-pane="activity" hidden>${activity.length?activity.map(row=>`<div class="${/FIELD ISSUE/.test(upper(value(row,'Note Type','noteType'))) ? 'h38-field-alert' : ''}"><strong>${esc(value(row,'Issue Category','Title','Summary','Note Type','Status')||'Activity')}</strong><small>${esc(value(row,'Body','Note','Updated Time','Created Time')||'')}</small></div>`).join(''):'<p>No job activity yet.</p>'}</div></section>`;
  const existing=document.getElementById('h38JobCommandHome'),head=main.querySelector('.page-head');if(existing)existing.insertAdjacentElement('beforebegin',host);else if(head)head.insertAdjacentElement('afterend',host);else main.prepend(host);
  const show=key=>{host.querySelectorAll('[data-h38-job-pane]').forEach(p=>p.hidden=p.dataset.h38JobPane!==key);host.querySelectorAll('[data-h38-job-tab]').forEach(b=>b.classList.toggle('active',b.dataset.h38JobTab===key));};show(activeTab);
  host.querySelectorAll('[data-h38-job-tab]').forEach(button=>button.addEventListener('click',()=>show(button.dataset.h38JobTab)));host.querySelector('[data-h38-job-message]')?.addEventListener('click',()=>openMessages(id(customer,'Customer ID','customerId'),jid));host.querySelector('[data-h38-job-navigate]')?.addEventListener('click',()=>navigate(address));host.querySelectorAll('[data-h38-job-capture]').forEach(button=>button.addEventListener('click',()=>captureDialog(job,task,show)));host.querySelector('[data-h38-job-pause]')?.addEventListener('click',()=>void pauseWork(task,'PAUSE'));host.querySelector('[data-h38-job-break]')?.addEventListener('click',()=>void pauseWork(task,'BREAK'));host.querySelector('[data-h38-job-resume]')?.addEventListener('click',()=>void resumeWork(task));host.querySelector('[data-h38-job-report]')?.addEventListener('click',()=>showIssueDialog(job,task));host.querySelector('[data-h38-job-issues]')?.addEventListener('click',()=>show('activity'));host.querySelector('[data-h38-job-site]')?.addEventListener('click',()=>openSite(job));host.querySelectorAll('[data-h38-proof-action]').forEach(button=>button.addEventListener('click',()=>launchCapture(button.dataset.h38ProofAction,job,task,show)));
  host.querySelector('[data-h38-job-primary]')?.addEventListener('click',event=>{const a=event.currentTarget.dataset.h38JobPrimary;if(a==='on-my-way')void taskStatus(task,'On My Way','Travel status set internally. No customer message sent.');else if(a==='arrive')void taskStatus(task,'Arrived','Arrived at the assigned job.');else if(a==='start')void startWork(task);else if(a==='resume')void resumeWork(task);else if(a==='site')openSite(job);else if(a==='finish'){if(proof.items.length&&!proof.complete)show('proof');else showCloseout(job,task,time,proof);}else if(a==='summary')show('activity');});
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