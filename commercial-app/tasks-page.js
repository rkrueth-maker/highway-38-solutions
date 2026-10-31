/* ---- H38 Tasks Page — Phase 4: Tasks & Delegation (2026-10-11) ----
 *
 * SCRIPT TAGS (coordinator wires these into index.html):
 *   <script src="./tasks-page.js?build=20261011-tasks-1"></script>
 *   <script src="./send-task.js?build=20261011-tasks-1"></script>
 *   Load order: AFTER app-02.js (uses pageHead, records, v, esc, pill, empty,
 *   userName, openPage, toast, queueOperation, newId, now, rowId, dateTime).
 *
 * DATA COLLECTIONS USED:
 *   tasks      — existing collection (Task ID, Business ID, Job ID, Task Title,
 *                Assigned User ID, Status, Due Time) plus Phase-4 optional
 *                fields added in code only (no migration): Assigned Contact
 *                Name, Assigned Phone, Assigned Email, Delivery Method,
 *                Completion Token, Link URL, Priority, Template, Sent At,
 *                Sent By Name, Business Name, Completed At, Nudge Count.
 *   users      — team members (assignee names on the Tasks page)
 *   customers  — contacts (fallback assignee lookup)
 *
 * NAV REGISTRATION NEEDED (coordinator):
 *   Add a top-level nav item: id 'tasks', icon '✅', label 'Tasks',
 *   badge count from window.H38TasksPage.openCount(). The render switch in
 *   app-02.js (or wherever renderPage lives) must call
 *   window.H38TasksPage.render() for page === 'tasks'.
 *
 * SMS / EMAIL: reuses the existing infrastructure — no new send code.
 *   - SMS: window.H38Sms.sendSms(...) queues into smsThreads with status
 *     'Queued — Owner Approval Required' (see sms-provider.js). The owner
 *     approves in Messages before anything goes out. Never auto-sent.
 *   - Email: a draft is written to emailThreads + emailMessages (the same
 *     shape app-09.js bindEmailForm writes) so the owner reviews/sends it
 *     from Messages.
 *   - App (team members): a notifications row is queued (collection
 *     'notifications') and the task itself appears in their Tasks list.
 */
(function(){
'use strict';
var BUILD='20261011-tasks-1';

/* ---- local helpers (prefer the app globals when present) ---- */
function g(name){ return (typeof window!=='undefined'&&typeof window[name]==='function')?window[name]:null; }
function text(v){ return String(v==null?'':v).trim(); }
function Hesc(v){ var f=g('esc'); return f?f(v):text(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function Hv(row){ var f=g('v'); if(f) return f.apply(null,arguments); var r=arguments[0]; for(var i=1;i<arguments.length;i++){ var k=arguments[i]; if(r&&r[k]!==undefined&&r[k]!==null&&String(r[k])!=='') return r[k]; } return ''; }
function HrowId(row){ var f=g('rowId'); if(f) return String(f.apply(null,arguments)); var r=arguments[0]; var keys=Array.prototype.slice.call(arguments,1); for(var i=0;i<keys.length;i++){ if(r&&r[keys[i]]) return String(r[keys[i]]); } return ''; }
function Hpill(t){ var f=g('pill'); return f?f(t):'<span class="pill">'+Hesc(t)+'</span>'; }
function Hempty(msg){ var f=g('empty'); return f?f(msg):'<p class="muted">'+Hesc(msg)+'</p>'; }
function HdateTime(v){ var f=g('dateTime'); if(f) return f(v); try{ var d=new Date(v); return isNaN(d)?text(v):d.toLocaleString(); }catch(e){ return text(v); } }
function HuserName(id){ var f=g('userName'); return f?f(id):text(id); }
function Hrecords(name){ var f=g('records'); try{ return (f?f(name):[])||[]; }catch(e){ return []; } }
function Htoast(msg,bad){ var f=g('toast'); if(f) f(msg,bad); }
function Hnow(){ var f=g('now'); return f?f():new Date().toISOString(); }
function Hqueue(op,label,id,args,opts){ var f=g('queueOperation'); if(!f) throw new Error('The Office save queue is not ready.'); return f(op,label,id,args,opts); }
function HbizId(){ try{ return (typeof state!=='undefined'&&state.businessId)||''; }catch(e){ return ''; } }
function Hmain(){ return (typeof document!=='undefined')?document.getElementById('mainContent'):null; }
function Hconfirm(o){ try{ if(window.H38Flow&&window.H38Flow.confirm) return window.H38Flow.confirm(o); }catch(e){} return Promise.resolve(window.confirm(o.title+'\n\n'+o.message)); }

/* ---- task data helpers ---- */
function isTestRow(row){ try{ var f=g('isTestRecord'); return f?!!f(row):false; }catch(e){ return false; } }
function isDone(row){ return /^(COMPLETE|COMPLETED|DONE)$/i.test(text(Hv(row,'Status'))); }
function isCancelled(row){ return /^CANCEL/i.test(text(Hv(row,'Status'))); }
function isOpen(row){ return !isDone(row)&&!isCancelled(row); }
function openTasks(){
  return Hrecords('tasks').filter(function(row){ return !isTestRow(row)&&isOpen(row); });
}
function sentStamp(row){ return Hv(row,'Sent At')||Hv(row,'Created Time'); }
function assigneeLabel(row){
  var uid=text(Hv(row,'Assigned User ID'));
  if(uid) return HuserName(uid);
  var name=text(Hv(row,'Assigned Contact Name'));
  if(name) return name;
  var phone=text(Hv(row,'Assigned Phone'));
  if(phone) return phone;
  return 'Unassigned';
}
function timeAgo(iso){
  var t=new Date(iso).getTime();
  if(isNaN(t)) return '';
  var mins=Math.max(0,Math.round((Date.now()-t)/60000));
  if(mins<1) return 'just now';
  if(mins<60) return mins+'m ago';
  var hrs=Math.round(mins/60);
  if(hrs<24) return hrs+'h ago';
  var days=Math.round(hrs/24);
  return days+'d ago';
}
function todayStamp(){ return new Date().toISOString().slice(0,10); }
function doneToday(){
  var today=todayStamp();
  return Hrecords('tasks').filter(function(row){
    if(isTestRow(row)||!isDone(row)) return false;
    var c=text(Hv(row,'Completed At')||'');
    return c.slice(0,10)===today;
  }).sort(function(a,b){ return String(Hv(b,'Completed At')).localeCompare(String(Hv(a,'Completed At'))); });
}
function sortOpen(rows){
  return rows.slice().sort(function(a,b){
    var au=/urgent/i.test(text(Hv(a,'Priority')))?0:1;
    var bu=/urgent/i.test(text(Hv(b,'Priority')))?0:1;
    if(au!==bu) return au-bu;
    return String(sentStamp(a)).localeCompare(String(sentStamp(b)));
  });
}

function taskCard(row){
  var id=Hesc(HrowId(row,'Task ID','taskId'));
  var title=Hesc((window.H38_HUMAN_NUMBERS?window.H38_HUMAN_NUMBERS.scrubText(Hv(row,'Task Title')||'',row):(Hv(row,'Task Title')||''))||'Untitled task');
  var who=Hesc(assigneeLabel(row));
  var sent=text(sentStamp(row))?Hesc(timeAgo(sentStamp(row))):'';
  var due=text(Hv(row,'Due Time'))?(' · due '+Hesc(HdateTime(Hv(row,'Due Time')))):'';
  var urgent=/urgent/i.test(text(Hv(row,'Priority')));
  var method=text(Hv(row,'Delivery Method'));
  var phone=text(Hv(row,'Assigned Phone'));
  var methodLabel=method==='sms'?' · text':(method==='email'?' · email':(method==='app'?' · app':''));
  var nudgeBtn=(phone&&method!=='app')
    ?'<button type="button" class="secondary" data-task-nudge="'+id+'">Nudge</button>':'';
  /* Quote lifecycle tasks (Quote Review etc.) deep-link to their quote:
     without this the task was a dead end — it named a quote the owner
     could not open from here. */
  var quoteId=text(Hv(row,'Quote ID')||Hv(row,'Linked Record ID'));
  var isQuoteTask=/quote/i.test(text(Hv(row,'Linked Record Type')))||/quote/i.test(text(Hv(row,'Task Type')))||/quote/i.test(text(Hv(row,'Task Domain')));
  var quoteBtn=(quoteId&&isQuoteTask)
    ?'<button type="button" data-task-quote="'+id+'">Open quote</button>':'';
  return '<div class="row" data-task-row="'+id+'">'
    +'<div class="row-top"><strong>'+title+'</strong>'
    +(urgent?'<span class="pill" style="background:#ffe9e9;color:#a83232">Urgent</span>':Hpill('Open'))
    +'</div>'
    +'<small>→ '+who+(sent?' · sent '+sent:'')+due+methodLabel+'</small>'
    +'<div class="row-actions">'
    +quoteBtn
    +'<button type="button" data-task-done="'+id+'">✓ Done</button>'
    +nudgeBtn
    +'</div></div>';
}

function doneRow(row){
  var title=Hesc((window.H38_HUMAN_NUMBERS?window.H38_HUMAN_NUMBERS.scrubText(Hv(row,'Task Title')||'',row):(Hv(row,'Task Title')||''))||'Untitled task');
  var who=Hesc(assigneeLabel(row));
  var when=text(Hv(row,'Completed At'))?Hesc(timeAgo(Hv(row,'Completed At'))):'';
  return '<div class="row"><div class="row-top"><strong>✓ '+title+'</strong></div>'
    +'<small>→ '+who+(when?' · done '+when:'')+'</small></div>';
}

/* ---- public API ---- */
function openCount(){ return openTasks().length; }

function render(){
  var main=Hmain();
  if(!main) return;
  var open=sortOpen(openTasks());
  var done=doneToday();
  var head=g('pageHead');
  var sendBtn='<button type="button" id="h38TasksSendBtn">+ Send Task</button>';
  main.innerHTML='<div class="h38-flow-view">'+(head?head('Tasks','Everything you asked someone to do — all in one place.',sendBtn):'')
    +'<div class="grid">'
    +'<section class="card span12"><h2>Needs attention'+(open.length?' ('+open.length+')':'')+'</h2>'
    +'<div class="list" id="h38TasksOpen">'
    +(open.length?open.map(taskCard).join(''):Hempty('Nothing waiting. Send a task to get something off your plate.'))
    +'</div></section>'
    +'<section class="card span12"><h2>Done today'+(done.length?' ('+done.length+')':'')+'</h2>'
    +'<div class="list" id="h38TasksDone">'
    +(done.length?done.map(doneRow).join(''):Hempty('Nothing finished yet today.'))
    +'</div></section>'
    +'</div>'+'</div>';
  var sb=document.getElementById('h38TasksSendBtn');
  if(sb) sb.addEventListener('click',function(){
    if(window.H38SendTask&&window.H38SendTask.start) window.H38SendTask.start();
    else Htoast('The Send Task flow is still loading. Try again in a moment.',true);
  });
  bindRowActions(main);
}

function bindRowActions(root){
  root.querySelectorAll('[data-task-done]').forEach(function(b){
    if(b.dataset.h38Bound) return; b.dataset.h38Bound='1';
    b.addEventListener('click',function(){ markDone(b.getAttribute('data-task-done')); });
  });
  root.querySelectorAll('[data-task-nudge]').forEach(function(b){
    if(b.dataset.h38Bound) return; b.dataset.h38Bound='1';
    b.addEventListener('click',function(){ nudge(b.getAttribute('data-task-nudge')); });
  });
  root.querySelectorAll('[data-task-quote]').forEach(function(b){
    if(b.dataset.h38Bound) return; b.dataset.h38Bound='1';
    b.addEventListener('click',function(){ openLinkedQuote(b.getAttribute('data-task-quote')); });
  });
}

/* Open the quote a quote-lifecycle task points at, in the quote builder.
   A missing quote is a visible error (openQuote toasts that the saved
   quote was not found), never a silent dead end. */
function openLinkedQuote(taskId){
  var row=findTask(taskId);
  if(!row){ Htoast('That task is no longer in the list.',true); return; }
  var quoteId=text(Hv(row,'Quote ID')||Hv(row,'Linked Record ID'));
  if(!quoteId){ Htoast('This task does not name a quote to open.',true); return; }
  var openQuote=g('openQuote');
  if(!openQuote){ Htoast('The quote builder is still loading. Try again in a moment.',true); return; }
  var openPage=g('openPage');
  var nav=openPage?openPage('quotes'):null;
  Promise.resolve(nav).then(function(){
    if(!openQuote(quoteId)) Htoast('Quote '+quoteId+' could not be opened. It may have been deleted — this task is left open for the owner to close.',true);
  }).catch(function(){
    if(!openQuote(quoteId)) Htoast('Quote '+quoteId+' could not be opened. It may have been deleted — this task is left open for the owner to close.',true);
  });
}

function findTask(id){
  var rows=Hrecords('tasks');
  for(var i=0;i<rows.length;i++){
    if(String(HrowId(rows[i],'Task ID','taskId'))===String(id)) return rows[i];
  }
  return null;
}

async function saveTask(id,changes){
  var row=findTask(id);
  if(!row) throw new Error('That task is no longer in the list.');
  var record=Object.assign({},row,changes,{
    'Updated Time':Hnow(),
    'Record Version':Math.max(1,Number(Hv(row,'Record Version'))||0)+1
  });
  Object.assign(row,changes,{'Updated Time':record['Updated Time'],'Record Version':record['Record Version']});
  await Hqueue('SAVE_ENTITY','Task',id,{entity:'tasks',record:record},{collection:'tasks',record:record,idKeys:['Task ID']});
  return record;
}

async function markDone(id){
  var row=findTask(id);
  if(!row){ Htoast('That task is no longer in the list.',true); return; }
  var ok=await Hconfirm({
    title:'Mark this task done?',
    message:'"'+text(Hv(row,'Task Title'))+'" will move to Done today.',
    okLabel:'Mark Done',cancelLabel:'Keep Open'
  });
  if(!ok) return;
  try{
    await saveTask(id,{'Status':'Completed','Completed At':Hnow()});
    Htoast('Done — "'+text(Hv(row,'Task Title'))+'" marked complete.');
    render();
  }catch(err){ Htoast(err&&err.message?err.message:String(err),true); }
}

function completeUrl(token){
  try{ return new URL('task-complete.html',location.href).href+'?token='+encodeURIComponent(token); }
  catch(e){ return 'task-complete.html?token='+encodeURIComponent(token); }
}

async function nudge(id){
  var row=findTask(id);
  if(!row){ Htoast('That task is no longer in the list.',true); return; }
  var phone=text(Hv(row,'Assigned Phone'));
  if(!phone){ Htoast('No phone number on this task, so there is nothing to nudge.',true); return; }
  var title=text(Hv(row,'Task Title'));
  var who=assigneeLabel(row);
  var token=text(Hv(row,'Completion Token'));
  var ok=await Hconfirm({
    title:'Send a nudge?',
    message:'A polite follow-up text goes to '+who+' about "'+title+'". It is queued for your approval in Messages first.',
    okLabel:'Queue Nudge',cancelLabel:'Cancel'
  });
  if(!ok) return;
  try{
    var sendSms=(window.H38Sms&&window.H38Sms.sendSms)||null;
    if(!sendSms) throw new Error('Texting is not set up on this device yet.');
    var body='Hey '+who.split(' ')[0]+', just checking on: '+title+(token?'. Tap to view: '+completeUrl(token):'');
    await sendSms({to:phone,body:body,purpose:'Task nudge: '+title,category:'Task'});
    await saveTask(id,{'Nudge Count':(Number(Hv(row,'Nudge Count'))||0)+1});
    Htoast('Nudge queued in Messages. Approve it there to send.');
    render();
  }catch(err){ Htoast(err&&err.message?err.message:String(err),true); }
}

window.H38TasksPage={
  openLinkedQuote:openLinkedQuote,
  render:render,
  openCount:openCount,
  markDone:markDone,
  nudge:nudge,
  findTask:findTask,
  completeUrl:completeUrl,
  BUILD:BUILD
};
})();
