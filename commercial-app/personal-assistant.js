(function(){
'use strict';
const BUILD='20260807-2245';
const TABLE='personal_assistant_items';
const CACHE_KIND='H38_PERSONAL_ASSISTANT';
const CACHE_PREFIX='personal-assistant:';
const TYPES=['inbox','task','reminder','note','routine','memory'];
const runtime={items:[],chat:[],filter:'open',loading:false,lastError:'',syncing:false,started:false,voice:null};
const text=v=>String(v==null?'':v);
const upper=v=>text(v).trim().toUpperCase();
const esc=v=>typeof window.esc==='function'?window.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const now=()=>new Date().toISOString();
const app=()=>{try{if(typeof state!=='undefined')return state;}catch(_){}return window.state||null};
const snapshot=()=>app()?.snapshot||{};
const rows=name=>Array.isArray(snapshot()[name])?snapshot()[name]:[];
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return''};
const rid=(row,...keys)=>text(value(row,...keys));
const money=v=>{try{return typeof window.money==='function'?window.money(v):Number(v||0).toLocaleString(undefined,{style:'currency',currency:'USD'});}catch(_){return text(v)}};
const dateTime=v=>{if(!v)return'Not set';const d=new Date(v);return Number.isNaN(d.getTime())?text(v):d.toLocaleString();};
const dateOnly=v=>{if(!v)return'Not set';const d=new Date(v);return Number.isNaN(d.getTime())?text(v):d.toLocaleDateString();};
const uid=()=>crypto.randomUUID();
function currentUserId(){
  const auth=window.H38_SUPABASE_AUTH?.getState?.()||{};
  return text(auth.userId||auth.user?.id||window.H38DB?.getUserScope?.()).trim();
}
function client(){
  return window.H38_SUPABASE_SHARED_CLIENT?.ensure?.()||null;
}
function cacheId(id){return`${CACHE_PREFIX}${id}`;}
function normalizeRow(row={}){
  return{
    id:text(row.id||uid()),user_id:text(row.user_id||currentUserId()),item_type:TYPES.includes(text(row.item_type))?text(row.item_type):'inbox',
    title:text(row.title),body:text(row.body),status:['open','done','archived'].includes(text(row.status))?text(row.status):'open',
    priority:['low','normal','high','urgent'].includes(text(row.priority))?text(row.priority):'normal',due_at:row.due_at||null,remind_at:row.remind_at||null,
    recurrence:row.recurrence&&typeof row.recurrence==='object'?row.recurrence:{},tags:Array.isArray(row.tags)?row.tags:[],context:row.context&&typeof row.context==='object'?row.context:{},
    source:text(row.source||'assistant'),completed_at:row.completed_at||null,created_at:row.created_at||now(),updated_at:row.updated_at||now()
  };
}
async function cachedEntries(){
  try{return(await window.H38DB.all('records')).filter(row=>row?.kind===CACHE_KIND&&row?.row).map(row=>({cache:row,item:normalizeRow(row.row)}));}catch(_){return[];}
}
async function cacheWrite(item,syncStatus='synced'){
  if(!window.H38DB)return;
  await window.H38DB.put('records',{id:cacheId(item.id),kind:CACHE_KIND,syncStatus,row:normalizeRow(item),updatedAt:now()});
}
async function cacheRemove(id){try{await window.H38DB?.remove('records',cacheId(id));}catch(_){} }
function sortItems(list){
  return list.slice().sort((a,b)=>{
    const aOpen=a.status==='open'?0:1,bOpen=b.status==='open'?0:1;if(aOpen!==bOpen)return aOpen-bOpen;
    const ap={urgent:0,high:1,normal:2,low:3}[a.priority]??2,bp={urgent:0,high:1,normal:2,low:3}[b.priority]??2;if(ap!==bp)return ap-bp;
    const ad=new Date(a.remind_at||a.due_at||'2999-01-01').getTime(),bd=new Date(b.remind_at||b.due_at||'2999-01-01').getTime();if(ad!==bd)return ad-bd;
    return new Date(b.updated_at||0)-new Date(a.updated_at||0);
  });
}
function mergeItems(server,cached){
  const map=new Map();server.forEach(row=>map.set(row.id,normalizeRow(row)));
  cached.forEach(entry=>{if(entry.cache.syncStatus==='pending'||!map.has(entry.item.id))map.set(entry.item.id,entry.item);});
  return sortItems(Array.from(map.values()));
}
async function loadPersonal(){
  if(runtime.loading)return;runtime.loading=true;runtime.lastError='';
  const cached=await cachedEntries();runtime.items=sortItems(cached.map(x=>x.item));renderIfOpen();updateAssistantBadge();
  const db=client(),userId=currentUserId();
  if(!navigator.onLine||!db||!userId){runtime.loading=false;return;}
  try{
    await syncPending(cached);
    const response=await db.from(TABLE).select('*').order('updated_at',{ascending:false}).limit(500);
    if(response.error)throw response.error;
    const fresh=(response.data||[]).map(normalizeRow);runtime.items=mergeItems(fresh,await cachedEntries());
    for(const item of fresh)await cacheWrite(item,'synced');
  }catch(error){runtime.lastError=text(error?.message||error);}
  runtime.loading=false;renderIfOpen();updateAssistantBadge();scanDueReminders();
}
async function syncPending(entries){
  if(runtime.syncing)return;const db=client(),userId=currentUserId();if(!db||!userId||!navigator.onLine)return;runtime.syncing=true;
  try{
    const pending=(entries||await cachedEntries()).filter(x=>x.cache.syncStatus==='pending');
    for(const entry of pending){
      const item=normalizeRow({...entry.item,user_id:userId,updated_at:entry.item.updated_at||now()});
      const response=await db.from(TABLE).upsert(item,{onConflict:'id'}).select().single();
      if(response.error)throw response.error;
      await cacheWrite(normalizeRow(response.data||item),'synced');
    }
  }finally{runtime.syncing=false;}
}
async function saveItem(input,announce=true){
  const userId=currentUserId();if(!userId)throw new Error('Sign in to save personal assistant items.');
  const existing=runtime.items.find(row=>row.id===input.id),item=normalizeRow({...existing,...input,user_id:userId,updated_at:now(),created_at:existing?.created_at||input.created_at||now()});
  const index=runtime.items.findIndex(row=>row.id===item.id);if(index>=0)runtime.items[index]=item;else runtime.items.unshift(item);runtime.items=sortItems(runtime.items);
  await cacheWrite(item,'pending');renderIfOpen();updateAssistantBadge();
  if(navigator.onLine&&client()){
    try{await syncPending();const cached=await window.H38DB.get('records',cacheId(item.id));if(cached?.row){const synced=normalizeRow(cached.row);const i=runtime.items.findIndex(x=>x.id===synced.id);if(i>=0)runtime.items[i]=synced;}}catch(error){runtime.lastError=text(error?.message||error);}
  }
  if(announce&&typeof window.toast==='function')window.toast(`${labelType(item.item_type)} saved privately.`);
  renderIfOpen();return item;
}
function labelType(type){return({inbox:'Inbox item',task:'Task',reminder:'Reminder',note:'Note',routine:'Routine',memory:'Memory'})[type]||'Item';}
function toIso(local){if(!local)return null;const d=new Date(local);return Number.isNaN(d.getTime())?null:d.toISOString();}
function localValue(iso){if(!iso)return'';const d=new Date(iso);if(Number.isNaN(d.getTime()))return'';const z=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;}
function nextRecurrence(item){
  const frequency=text(item.recurrence?.frequency);if(!frequency)return null;const base=new Date(item.due_at||item.remind_at||Date.now());if(Number.isNaN(base.getTime()))return null;
  if(frequency==='daily')base.setDate(base.getDate()+1);else if(frequency==='weekly')base.setDate(base.getDate()+7);else if(frequency==='monthly')base.setMonth(base.getMonth()+1);else return null;return base.toISOString();
}
async function completeItem(id){
  const item=runtime.items.find(row=>row.id===id);if(!item)return;
  if(item.item_type==='routine'&&item.recurrence?.frequency){const next=nextRecurrence(item);await saveItem({...item,status:'open',due_at:next,remind_at:next,completed_at:null,context:{...item.context,lastCompletedAt:now()}},false);window.toast?.(`Routine completed. Next: ${dateTime(next)}.`);return;}
  await saveItem({...item,status:'done',completed_at:now()},false);window.toast?.(`${labelType(item.item_type)} completed.`);
}
async function reopenItem(id){const item=runtime.items.find(row=>row.id===id);if(item)await saveItem({...item,status:'open',completed_at:null},false);}
async function archiveItem(id){const item=runtime.items.find(row=>row.id===id);if(item)await saveItem({...item,status:'archived'},false);}
async function snoozeItem(id,hours){const item=runtime.items.find(row=>row.id===id);if(!item)return;const d=new Date(Date.now()+hours*3600000);await saveItem({...item,status:'open',remind_at:d.toISOString()},false);window.toast?.(`Reminder moved to ${dateTime(d)}.`);}
function parseWhen(input){
  const original=text(input),lower=original.toLowerCase();let due=null;
  const inHours=lower.match(/\bin\s+(\d+(?:\.\d+)?)\s+hours?\b/);if(inHours)due=new Date(Date.now()+Number(inHours[1])*3600000);
  const inMinutes=lower.match(/\bin\s+(\d+)\s+minutes?\b/);if(!due&&inMinutes)due=new Date(Date.now()+Number(inMinutes[1])*60000);
  if(!due&&/\btomorrow\b/.test(lower)){due=new Date();due.setDate(due.getDate()+1);due.setHours(9,0,0,0);}
  if(!due&&/\btonight\b/.test(lower)){due=new Date();due.setHours(19,0,0,0);if(due<Date.now())due.setDate(due.getDate()+1);}
  if(!due&&/\bthis afternoon\b/.test(lower)){due=new Date();due.setHours(15,0,0,0);}
  if(!due&&/\bthis evening\b/.test(lower)){due=new Date();due.setHours(19,0,0,0);}
  const clock=lower.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if(clock){if(!due)due=new Date();let hour=Number(clock[1]),minute=Number(clock[2]||0);if(clock[3]==='pm'&&hour<12)hour+=12;if(clock[3]==='am'&&hour===12)hour=0;due.setHours(hour,minute,0,0);if(due<Date.now()&&!/today|tomorrow|tonight/.test(lower))due.setDate(due.getDate()+1);}
  return due&&!Number.isNaN(due.getTime())?due.toISOString():null;
}
function inferCapture(input){
  const raw=text(input).trim(),lower=raw.toLowerCase(),when=parseWhen(raw);let type='inbox',title=raw,frequency='';
  if(/^remember(?:\s+that)?\s+/i.test(raw)){type='memory';title=raw.replace(/^remember(?:\s+that)?\s+/i,'');}
  else if(/^note(?:\s+that)?\s+/i.test(raw)){type='note';title=raw.replace(/^note(?:\s+that)?\s+/i,'');}
  else if(/^remind\s+me(?:\s+to)?\s+/i.test(raw)){type='reminder';title=raw.replace(/^remind\s+me(?:\s+to)?\s+/i,'').replace(/\s+(tomorrow|tonight|this afternoon|this evening|in \d+(?:\.\d+)? hours?|in \d+ minutes?|at \d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b.*$/i,'').trim()||raw;}
  else if(/^add(?:\s+a)?\s+task\s+/i.test(raw)){type='task';title=raw.replace(/^add(?:\s+a)?\s+task\s+/i,'').trim();}
  else if(/\bevery\s+day\b|\bdaily\b/.test(lower)){type='routine';frequency='daily';}
  else if(/\bevery\s+week\b|\bweekly\b/.test(lower)){type='routine';frequency='weekly';}
  else if(/\bevery\s+month\b|\bmonthly\b/.test(lower)){type='routine';frequency='monthly';}
  return{item_type:type,title:title||raw,body:'',due_at:type==='task'||type==='routine'?when:null,remind_at:type==='reminder'||type==='routine'?when:null,recurrence:frequency?{frequency}:{},source:'assistant-command'};
}
function todayRange(){const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);return[start.getTime(),end.getTime()];}
function isToday(value){if(!value)return false;const t=new Date(value).getTime(),[s,e]=todayRange();return Number.isFinite(t)&&t>=s&&t<e;}
function isPast(value){if(!value)return false;const t=new Date(value).getTime();return Number.isFinite(t)&&t<Date.now();}
function personalDue(){return runtime.items.filter(item=>item.status==='open'&&(isToday(item.due_at)||isToday(item.remind_at)||isPast(item.due_at)||isPast(item.remind_at)));}
function businessDay(){
  const userId=currentUserId(),events=rows('scheduleEvents').filter(row=>isToday(value(row,'Start Time','startTime'))).sort((a,b)=>new Date(value(a,'Start Time'))-new Date(value(b,'Start Time')));
  const tasks=rows('tasks').filter(row=>{const status=upper(value(row,'Status','status'));if(/DONE|COMPLETE|CLOSED|CANCEL/.test(status))return false;const assigned=rid(row,'Assigned User ID','assignedUserId');return !assigned||!userId||assigned===userId||assigned==='USER-OWNER';}).filter(row=>isToday(value(row,'Due Time','dueTime'))||isPast(value(row,'Due Time','dueTime')));
  let lifecycle=[];try{lifecycle=window.H38_JOB_LIFECYCLE?.attention?.()||[];}catch(_){}
  return{events,tasks,lifecycle:Array.isArray(lifecycle)?lifecycle:[]};
}
function briefText(){
  const personal=personalDue(),business=businessDay(),lines=[];
  lines.push(`${personal.length} personal item${personal.length===1?'':'s'} due or overdue.`);
  lines.push(`${business.events.length} business schedule item${business.events.length===1?'':'s'} today.`);
  lines.push(`${business.tasks.length} business task${business.tasks.length===1?'':'s'} due or overdue.`);
  if(business.lifecycle.length)lines.push(`${business.lifecycle.length} job lifecycle item${business.lifecycle.length===1?'':'s'} need attention.`);
  const urgent=personal.find(x=>x.priority==='urgent')||personal[0];if(urgent)lines.push(`First personal item: ${urgent.title}.`);
  return lines.join(' ');
}
function businessWatchRows(){
  const out=[],business=businessDay();
  business.events.slice(0,4).forEach(row=>out.push({kind:'Schedule',title:text(value(row,'Title','title')||'Scheduled work'),detail:`${dateTime(value(row,'Start Time','startTime'))} · ${text(value(row,'Location','location')||'No location')}`,page:'schedule'}));
  business.tasks.slice(0,4).forEach(row=>out.push({kind:'Task',title:text(value(row,'Task Title','taskTitle')||'Business task'),detail:`${text(value(row,'Status','status')||'Open')} · due ${dateTime(value(row,'Due Time','dueTime'))}`,page:'work'}));
  const invoices=rows('invoices').filter(row=>Number(value(row,'Balance','balance')||0)>0&&isPast(value(row,'Due Date','dueDate'))).slice(0,4);invoices.forEach(row=>out.push({kind:'Invoice',title:`${text(value(row,'Invoice Number','invoiceNumber')||'Invoice')} overdue`,detail:`Balance ${money(value(row,'Balance','balance'))} · due ${dateOnly(value(row,'Due Date','dueDate'))}`,page:'money'}));
  let life=[];try{life=window.H38_JOB_LIFECYCLE?.attention?.()||[];}catch(_){}if(Array.isArray(life))life.slice(0,4).forEach(entry=>{const l=entry.lifecycle||entry.analysis||entry;const j=entry.job||{};out.push({kind:'Job',title:text(value(j,'Project Title','projectTitle')||l.projectTitle||'Job needs attention'),detail:text(l.nextAction||l.next_action||l.reason||'Review job lifecycle'),page:'work'});});
  return out.slice(0,10);
}
function filteredItems(){
  return runtime.items.filter(item=>{if(runtime.filter==='all')return item.status!=='archived';if(runtime.filter==='done')return item.status==='done';if(runtime.filter==='notes')return item.status!=='archived'&&['note','memory'].includes(item.item_type);if(runtime.filter==='reminders')return item.status==='open'&&['reminder','routine','task'].includes(item.item_type);return item.status==='open';});
}
function itemClass(item){if(item.item_type==='routine')return'pa-routine';if(item.item_type==='memory')return'pa-memory';if(item.item_type==='note')return'pa-note';if(item.status==='open'&&isPast(item.remind_at||item.due_at))return'pa-overdue';if(item.status==='open'&&isToday(item.remind_at||item.due_at))return'pa-due';return'';}
function itemRow(item){
  const when=item.remind_at||item.due_at,repeat=text(item.recurrence?.frequency),detail=[labelType(item.item_type),item.priority!=='normal'?item.priority:'',when?dateTime(when):'',repeat?`repeats ${repeat}`:''].filter(Boolean).join(' · ');
  return`<div class="pa-item ${itemClass(item)}"><div class="pa-item-main"><strong>${esc(item.title||labelType(item.item_type))}</strong><small>${esc(detail)}</small>${item.body?`<p>${esc(item.body)}</p>`:''}</div><div class="pa-item-actions">${item.status==='open'?`<button type="button" data-pa-done="${esc(item.id)}">Done</button>${['reminder','routine','task'].includes(item.item_type)?`<button type="button" class="secondary" data-pa-snooze="${esc(item.id)}">+1 hr</button>`:''}`:`<button type="button" data-pa-reopen="${esc(item.id)}">Reopen</button>`}<button type="button" class="secondary" data-pa-archive="${esc(item.id)}">Archive</button></div></div>`;
}
function renderPersonalAssistant(){
  const node=document.getElementById('mainContent');if(!node)return;const personal=personalDue(),business=businessDay(),watch=businessWatchRows(),items=filteredItems();
  node.innerHTML=(typeof pageHead==='function'?pageHead('Personal Assistant','Your private command center for reminders, notes, routines and the work that matters today.'):'<header class="page-head"><h1>Personal Assistant</h1></header>')+`<div class="pa-shell"><section class="pa-private"><strong>Private to your signed-in account.</strong> Personal reminders, notes and memory records are stored separately from shared business records. Business actions remain inside the existing Office controls.</section>${runtime.lastError?`<section class="pa-warning"><strong>Personal sync needs attention.</strong> ${esc(runtime.lastError)} Your user-scoped offline cache is still available.</section>`:''}<div class="pa-grid"><section class="pa-card span8"><div class="pa-hero"><div><div class="pa-kicker">My Day</div><h2>${esc(new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}))}</h2><p>${esc(briefText())}</p></div><div class="pa-toolbar"><button type="button" id="paRefresh">Refresh</button><button type="button" class="secondary" id="paReadDay">🔊 Read my day</button></div></div><div class="pa-brief">${personal.slice(0,5).map(item=>`<div class="pa-brief-row"><div><strong>${esc(item.title)}</strong><small>Personal · ${esc(dateTime(item.remind_at||item.due_at))}</small></div>${item.status==='open'?`<button type="button" data-pa-done="${esc(item.id)}">Done</button>`:''}</div>`).join('')||'<div class="pa-empty">No personal reminders are due today.</div>'}${business.events.slice(0,4).map(row=>`<div class="pa-brief-row"><div><strong>${esc(value(row,'Title','title')||'Scheduled work')}</strong><small>Business · ${esc(dateTime(value(row,'Start Time','startTime')))}</small></div><button type="button" class="secondary" data-pa-page="schedule">Open</button></div>`).join('')}${business.tasks.slice(0,4).map(row=>`<div class="pa-brief-row"><div><strong>${esc(value(row,'Task Title','taskTitle')||'Task')}</strong><small>Business task · ${esc(dateTime(value(row,'Due Time','dueTime')))}</small></div><button type="button" class="secondary" data-pa-page="work">Open</button></div>`).join('')}</div></section><section class="pa-card span4"><h3>Quick capture</h3><p class="muted">Type it the way you would say it. “Remind me to call Jim tomorrow at 9”, “Remember that…”, or just dump a thought into Inbox.</p><form id="paCaptureForm"><label>What do you want me to remember?</label><textarea name="capture" required placeholder="Remind me to order block tomorrow at 8 am"></textarea><div class="actions"><button>Capture</button><button type="button" class="secondary" id="paVoiceCapture">🎙️ Speak</button></div></form></section><section class="pa-card span8"><h3>Ask / command the assistant</h3><div class="pa-command-log" id="paChat">${runtime.chat.length?runtime.chat.map(m=>`<div class="pa-bubble ${m.role}">${esc(m.body)}</div>`).join(''):'<div class="pa-bubble assistant">I can manage your private reminders, notes, routines and memory, summarize today, find Office records, and take you to the right business screen. I prepare business work but do not send, buy, pay or approve anything.</div>'}</div><form id="paCommandForm"><label>Command</label><textarea name="command" required placeholder="What do I need to do today?  |  Find Anderson retaining wall  |  Remind me to call supplier in 2 hours"></textarea><div class="actions"><button>Run command</button></div></form></section><section class="pa-card span4"><h3>Device reminders</h3><p class="muted">Due reminders appear inside Office. With notification permission, the installed Office can also show a device notification while its service worker is active.</p><div class="pa-safe"><strong>${typeof Notification==='undefined'?'Notifications unavailable':Notification.permission==='granted'?'Device reminders enabled':Notification.permission==='denied'?'Browser notifications blocked':'Device reminders not enabled'}</strong></div>${typeof Notification!=='undefined'&&Notification.permission==='default'?'<div class="actions"><button type="button" id="paEnableNotifications">Enable device reminders</button></div>':''}<p class="pa-status-line">Timezone: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone||'device timezone')}</p></section><section class="pa-card full"><div class="pa-hero"><div><h3>Private items</h3><p>Tasks, reminders, routines, notes and memory stay attached to your account.</p></div><div class="pa-filters"><button type="button" data-pa-filter="open" class="${runtime.filter==='open'?'active':''}">Open</button><button type="button" data-pa-filter="reminders" class="${runtime.filter==='reminders'?'active':''}">Tasks & reminders</button><button type="button" data-pa-filter="notes" class="${runtime.filter==='notes'?'active':''}">Notes & memory</button><button type="button" data-pa-filter="done" class="${runtime.filter==='done'?'active':''}">Done</button><button type="button" data-pa-filter="all" class="${runtime.filter==='all'?'active':''}">All</button></div></div><form id="paItemForm"><div class="pa-form-grid"><div><label>Type</label><select name="itemType"><option value="task">Task</option><option value="reminder">Reminder</option><option value="routine">Routine</option><option value="note">Note</option><option value="memory">Memory</option><option value="inbox">Inbox</option></select></div><div><label>Priority</label><select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></div><div class="full"><label>Title</label><input name="title" required></div><div class="full"><label>Details</label><textarea name="body"></textarea></div><div><label>Due / reminder</label><input name="when" type="datetime-local"></div><div><label>Repeat</label><select name="repeat"><option value="">One time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div></div><div class="actions"><button>Save privately</button></div></form><div>${items.length?items.map(itemRow).join(''):'<div class="pa-empty">Nothing in this view.</div>'}</div></section><section class="pa-card full"><div class="pa-hero"><div><h3>Business watch</h3><p>Read-only signals from the active Business Office. Open the source screen before changing shared work.</p></div><div class="pa-business-actions"><button type="button" class="secondary" data-pa-page="work">Work</button><button type="button" class="secondary" data-pa-page="schedule">Schedule</button><button type="button" class="secondary" data-pa-page="money">Money</button><button type="button" class="secondary" data-pa-page="documents">Documents</button></div></div>${watch.length?watch.map(row=>`<div class="pa-watch"><div><strong>${esc(row.title)}</strong><small>${esc(row.kind)} · ${esc(row.detail)}</small></div><button type="button" class="secondary" data-pa-page="${esc(row.page)}">Open</button></div>`).join(''):'<div class="pa-empty">No business exceptions are demanding attention from the cached Office right now.</div>'}</section><section class="pa-card full"><div class="pa-safe"><strong>Authority:</strong> the assistant may read your permitted Office context and prepare private or internal work. Customer messages, quote delivery, approvals, purchases, payments and other external commitments still require the existing explicit controls.</div></section></div></div>`;
  bindPage();
}
function bindPage(){
  document.getElementById('paRefresh')?.addEventListener('click',loadPersonal);
  document.getElementById('paReadDay')?.addEventListener('click',()=>speak(briefText()));
  document.getElementById('paCaptureForm')?.addEventListener('submit',async e=>{e.preventDefault();const raw=new FormData(e.currentTarget).get('capture');const draft=inferCapture(raw);await saveItem({...draft,id:uid()});e.currentTarget.reset();});
  document.getElementById('paVoiceCapture')?.addEventListener('click',voiceCapture);
  document.getElementById('paCommandForm')?.addEventListener('submit',async e=>{e.preventDefault();const command=text(new FormData(e.currentTarget).get('command')).trim();e.currentTarget.reset();await runCommand(command);});
  document.getElementById('paItemForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.currentTarget),type=text(d.get('itemType')),when=toIso(d.get('when')),repeat=text(d.get('repeat'));await saveItem({id:uid(),item_type:type,title:text(d.get('title')).trim(),body:text(d.get('body')).trim(),priority:text(d.get('priority')),due_at:['task','routine'].includes(type)?when:null,remind_at:['reminder','routine'].includes(type)?when:null,recurrence:repeat?{frequency:repeat}:{},source:'manual'});e.currentTarget.reset();});
  document.getElementById('paEnableNotifications')?.addEventListener('click',enableNotifications);
  document.querySelectorAll('[data-pa-done]').forEach(b=>b.onclick=()=>completeItem(b.dataset.paDone));
  document.querySelectorAll('[data-pa-reopen]').forEach(b=>b.onclick=()=>reopenItem(b.dataset.paReopen));
  document.querySelectorAll('[data-pa-archive]').forEach(b=>b.onclick=()=>archiveItem(b.dataset.paArchive));
  document.querySelectorAll('[data-pa-snooze]').forEach(b=>b.onclick=()=>snoozeItem(b.dataset.paSnooze,1));
  document.querySelectorAll('[data-pa-filter]').forEach(b=>b.onclick=()=>{runtime.filter=b.dataset.paFilter;renderPersonalAssistant();});
  document.querySelectorAll('[data-pa-page]').forEach(b=>b.onclick=()=>{try{openPage(b.dataset.paPage);}catch(_){}});
}
async function runCommand(command){
  if(!command)return;runtime.chat.push({role:'user',body:command});renderIfOpen();const q=command.toLowerCase();let answer='';
  try{
    if(/^remind\s+me\b|^remember\b|^note\b|^add(?:\s+a)?\s+task\b|\bevery\s+(day|week|month)\b|\b(daily|weekly|monthly)\b/.test(q)){
      const draft=inferCapture(command),item=await saveItem({...draft,id:uid()},false);answer=`Saved privately as ${labelType(item.item_type).toLowerCase()}${item.remind_at||item.due_at?` for ${dateTime(item.remind_at||item.due_at)}`:''}.`;
    }else if(/what.*(today|need|do)|my day|what's next|whats next/.test(q))answer=briefText();
    else if(/reminder|personal task/.test(q)){const list=runtime.items.filter(x=>x.status==='open'&&['reminder','task','routine'].includes(x.item_type)).slice(0,8);answer=list.length?list.map(x=>`${x.title}${x.remind_at||x.due_at?` — ${dateTime(x.remind_at||x.due_at)}`:''}`).join('\n'):'You have no open personal reminders or tasks.';}
    else if(/blocked|stuck|needs attention|follow.?up/.test(q)){const watch=businessWatchRows();answer=watch.length?watch.slice(0,8).map(x=>`${x.kind}: ${x.title} — ${x.detail}`).join('\n'):'The cached Office has no obvious exception requiring attention right now.';}
    else if(/^find\s+|search\s+/.test(q)){const term=command.replace(/^(find|search)\s+/i,'').trim();let found=[];try{found=window.H38_JOB_LIFECYCLE?.search?.(term)||[];}catch(_){}if(!Array.isArray(found)||!found.length){const collections=['customers','jobs','quotes','tasks','scheduleEvents','documents','invoices'];for(const collection of collections)for(const row of rows(collection)){const blob=JSON.stringify(row).toLowerCase();if(blob.includes(term.toLowerCase()))found.push({collection,row});if(found.length>=8)break;}}answer=found.length?found.slice(0,8).map(entry=>{const row=entry.row||entry.record||entry;return`${entry.collection||entry.type||'Office'}: ${text(value(row,'Project Title','Customer Name','Task Title','Title','Quote Number','Invoice Number','File Name')||'matching record')}`;}).join('\n'):`I could not find “${term}” in the currently cached Office.`;}
    else if(/receipt|expense/.test(q)){answer='Open Money to capture the receipt or expense and attach it to the correct job. I will not guess the job or financial category for you.';try{openPage('money');}catch(_){} }
    else if(/mileage/.test(q)){answer='Open Money to record mileage against the correct job. The Office does not invent a reimbursement or tax rate.';try{openPage('money');}catch(_){} }
    else if(/schedule|calendar|appointment/.test(q)){const b=businessDay();answer=`You have ${b.events.length} business schedule item${b.events.length===1?'':'s'} today. I can open Schedule for changes.`;}
    else answer='I can capture reminders, tasks, notes, routines and memory; summarize your day; find cached Office records; show business exceptions; and open the right Office screen. Business sends, approvals, purchases and payments stay behind their existing controls.';
  }catch(error){answer=`I could not complete that command: ${text(error?.message||error)}`;}
  runtime.chat.push({role:'assistant',body:answer});renderIfOpen();speak(answer);
}
function speak(message){try{if(!('speechSynthesis'in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text(message).slice(0,1200));window.speechSynthesis.speak(u);}catch(_){} }
function voiceCapture(){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SpeechRecognition){window.toast?.('Voice capture is not available in this browser.',true);return;}
  try{runtime.voice?.stop?.();}catch(_){}const rec=new SpeechRecognition();runtime.voice=rec;rec.lang=navigator.language||'en-US';rec.interimResults=false;rec.maxAlternatives=1;rec.onresult=e=>{const words=text(e.results?.[0]?.[0]?.transcript);const box=document.querySelector('#paCaptureForm textarea[name="capture"]');if(box){box.value=words;box.focus();}};rec.onerror=()=>window.toast?.('Voice capture stopped.',true);rec.start();
}
async function enableNotifications(){try{const permission=await Notification.requestPermission();window.toast?.(permission==='granted'?'Device reminders enabled.':'Notification permission was not enabled.',permission!=='granted');renderIfOpen();if(permission==='granted')scanDueReminders();}catch(error){window.toast?.(text(error?.message||error),true);}}
async function showNotification(item){
  const key=`h38-pa-notified:${item.id}:${item.updated_at}`;try{if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');}catch(_){}
  if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
  const body=item.title||labelType(item.item_type);try{const reg=await navigator.serviceWorker?.ready;if(reg?.showNotification)await reg.showNotification('H38 Personal Assistant',{body,tag:`h38-personal-${item.id}`,renotify:false,data:{assistant:true,url:'./?shell=office&assistant=1'}});else new Notification('H38 Personal Assistant',{body});}catch(_){}
}
function scanDueReminders(){const due=runtime.items.filter(item=>item.status==='open'&&item.remind_at&&new Date(item.remind_at).getTime()<=Date.now());due.slice(0,5).forEach(showNotification);updateAssistantBadge();}
function dueCount(){return runtime.items.filter(item=>item.status==='open'&&(isPast(item.remind_at)||isToday(item.remind_at)||isPast(item.due_at)||isToday(item.due_at))).length;}
function updateAssistantBadge(){const button=document.getElementById('personalAssistantButton');if(!button)return;const count=dueCount(),badge=button.querySelector('.pa-due-dot');if(count){if(badge)badge.textContent=String(Math.min(count,99));else button.insertAdjacentHTML('beforeend',`<span class="pa-due-dot">${Math.min(count,99)}</span>`);}else badge?.remove();}
function installNav(){
  try{if(typeof PAGE_DEFS!=='undefined'&&!PAGE_DEFS.assistant)PAGE_DEFS.assistant=['🤝','Assistant'];if(typeof SHELL_PAGES!=='undefined'&&Array.isArray(SHELL_PAGES.office)&&!SHELL_PAGES.office.includes('assistant'))SHELL_PAGES.office.splice(Math.max(1,SHELL_PAGES.office.indexOf('settings')),0,'assistant');if(typeof renderNav==='function')renderNav();}catch(_){}
}
function installTopButton(){const top=document.querySelector('.top-actions');if(!top||document.getElementById('personalAssistantButton'))return;const button=document.createElement('button');button.id='personalAssistantButton';button.type='button';button.className='ai-launcher pa-top-button';button.innerHTML='<span aria-hidden="true">🤝</span><span class="ai-launcher-label">Assistant</span>';button.setAttribute('aria-label','Open Personal Assistant');button.onclick=()=>{try{openPage('assistant');}catch(_){}};const ai=document.getElementById('globalAiButton');top.insertBefore(button,ai||top.firstChild);updateAssistantBadge();}
function installRenderer(){
  try{if(typeof renderPage!=='function'||renderPage.__h38PersonalAssistant)return;const original=renderPage,wrapped=function(){if(app()?.page==='assistant'){renderPersonalAssistant();return;}return original.apply(this,arguments);};wrapped.__h38PersonalAssistant=true;renderPage=wrapped;}catch(_){}
}
function renderIfOpen(){if(app()?.page==='assistant')renderPersonalAssistant();}
function notificationClickSupport(){window.addEventListener('message',event=>{if(event.data?.type==='H38_OPEN_PERSONAL_ASSISTANT'){try{openPage('assistant');}catch(_){}}});}
async function start(){
  if(runtime.started)return;runtime.started=true;installNav();installRenderer();installTopButton();notificationClickSupport();
  await loadPersonal();
  addEventListener('online',()=>{loadPersonal();});addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){loadPersonal();scanDueReminders();}});
  setInterval(scanDueReminders,60000);
  const params=new URLSearchParams(location.search);if(params.get('assistant')==='1'){setTimeout(()=>{try{if(app()?.snapshot)openPage('assistant');}catch(_){}},500);}
}
window.H38_PERSONAL_ASSISTANT={
  enabled:true,build:BUILD,privateUserRecords:true,table:TABLE,load:loadPersonal,save:saveItem,runCommand,brief:briefText,
  authority:{readPersonal:true,readPermittedBusinessContext:true,preparePrivateRecords:true,externalActionsRequireExistingOfficeControls:true},
  automaticCustomerSending:false,automaticApproval:false,automaticPurchasing:false,automaticPayment:false
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
