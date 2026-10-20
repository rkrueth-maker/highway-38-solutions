/* H38 Guided Schedule — "Schedule Job" guided flow (Owner Ease rebuild, Phase 3, design §3.6).
 *
 * Script tag to add (coordinator handles index.html):
 *   <script src="guided-schedule.js"></script>
 *
 * Data collections used (read/write):
 *   jobs            — read open jobs for Step 1; new quick job written via SAVE_JOB;
 *                     status flipped to 'Scheduled' when a job is scheduled
 *   users           — crew picker (active users)
 *   customers       — customer picker for a quick job
 *   scheduleEvents  — written via SAVE_SCHEDULE (same record shape as the Schedule
 *                     page's scheduleForm in app-08.js); read for availability and
 *                     conflict checks
 *   smsThreads      — written by H38Sms.sendSms for crew notifications
 *                     (queued for owner approval, never sent directly)
 *
 * SMS reuse: crew texts go through window.H38Sms.sendSms({to, body, purpose}),
 * exactly like the Messages page "Request send". Sending is explicit: the owner
 * confirms the schedule (and the crew text) on the "Schedule →" confirm dialog.
 * AI is not used in this flow; every step works manually.
 *
 * Entry point: window.H38GuidedSchedule.start()
 *   Step 1: WHAT JOB — pick an open job or create a quick job.
 *   Step 2: WHO — crew picker, availability shown inline (busy crew greyed with reason).
 *   Step 3: WHEN — date (Today/Tomorrow/Pick), start/end time, conflict check.
 *   Step 4: DONE — confirmation; crew texts queued for approval.
 */
(function(){
'use strict';

/* WS4 header alignment: guided steps keep their .h38-steps progress, but
 * the page header is the standard screen header when H38Flow is present. */
function schedHead(title,desc){
  if(window.H38Flow&&typeof window.H38Flow.screenHeader==='function')return window.H38Flow.screenHeader({page:'schedule',title:title,purpose:desc});
  return pageHead(title,desc);
}

var sched={step:1,jobId:null,quickCustomerId:'',crewIds:[],dateMode:'today',customDate:'',startTime:'09:00',endTime:'12:00',results:null,overrideConflicts:false};

function bizName(){
  return (typeof state!=='undefined'&&state.snapshot&&state.snapshot.business)
    ? (String(v(state.snapshot.business,'Business Name','businessName','name')||'').trim()||'us')
    : 'us';
}

function openJobs(){
  return records('jobs').filter(function(row){
    if(typeof isTestRecord==='function'&&isTestRecord(row)) return false;
    return !['COMPLETE','CLOSED','CANCELLED'].includes(String(v(row,'Status')).toUpperCase());
  });
}
function crewUsers(){
  return activeRows(records('users')||[]);
}
function jobRow(id){
  return records('jobs').find(function(r){return String(rowId(r,'Job ID','jobId'))===String(id);})||null;
}
function userRow(id){
  return records('users').find(function(r){return String(rowId(r,'User ID','userId'))===String(id);})||null;
}
function localDateStr(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function chosenDateStr(){
  if(sched.dateMode==='tomorrow'){var t=new Date();t.setDate(t.getDate()+1);return localDateStr(t);}
  if(sched.dateMode==='pick') return sched.customDate||'';
  return localDateStr(new Date());
}
function prettyDate(ds){
  if(!ds) return '';
  var d=new Date(ds+'T12:00:00');
  return isNaN(d)?ds:d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
}

/* Events assigned to a user on a given YYYY-MM-DD date (not cancelled). */
function userEventsOn(userId,dateStr){
  return (records('scheduleEvents')||[]).filter(function(row){
    if(String(v(row,'Assigned User ID'))!==String(userId)) return false;
    var st=String(v(row,'Status')||'').toUpperCase();
    if(['CANCELLED','COMPLETE','COMPLETED'].includes(st)) return false;
    return String(v(row,'Start Time')||'').slice(0,10)===dateStr;
  });
}

/* Conflict: any of the user's events on the date overlap [start,end) (HH:MM). */
function conflictFor(userId,dateStr,start,end){
  return userEventsOn(userId,dateStr).find(function(row){
    var s=String(v(row,'Start Time')||'').slice(11,16), e=String(v(row,'End Time')||'').slice(11,16);
    if(!s) return false;
    return s<end && (e===''||e>start);
  })||null;
}

function stepHeader(step,of,title){
  var bars='';
  for(var i=1;i<=of;i++){bars+='<span class="'+(i<step?'done':(i===step?'now':''))+'"></span>';}
  return '<div class="h38-steps">'+bars+'</div><p class="h38-step-label">Step '+step+' of '+of+'</p><h2>'+esc(title)+'</h2>';
}

/* ================= STEP 1: WHAT JOB ================= */
function renderStep1(){
  var jobs=openJobs();
  var html=schedHead('Schedule Job','Pick the job, pick the crew, pick the time. Four steps, done.');
  html+='<section class="card">'+stepHeader(1,4,'What job are we scheduling?')+'<div class="list">';
  if(!jobs.length) html+='<p class="muted">No open jobs. Create a quick one below.</p>';
  html+=jobs.slice(0,40).map(function(row){
    var id=rowId(row,'Job ID','jobId');
    return '<button type="button" class="row'+(String(sched.jobId)===String(id)?' selected':'')+'" data-sched-job="'+esc(id)+'">'+
      '<div class="row-top"><strong>'+esc(v(row,'Project Title')||'Untitled job')+'</strong>'+pill(v(row,'Status')||'Open')+'</div>'+
      '<small>'+esc(customerName(v(row,'Customer ID')))+'</small></button>';
  }).join('')+'</div>';
  html+='<hr><h3>Or create a quick job</h3>'+
    '<div class="two"><div><label>Job title</label><input id="schedQuickTitle" placeholder="e.g. Johnson install" value="'+esc(sched.quickTitle||'')+'"></div>'+
    '<div><label>Customer (optional)</label><select id="schedQuickCustomer">'+optionRows(records('customers')||[],['Customer ID'],function(r){return v(r,'Customer Name');},'No customer')+'</select></div></div>'+
    '<div class="actions"><button type="button" class="secondary" id="schedQuickCreate">＋ Create &amp; select</button></div>';
  html+='<div class="actions"><button type="button" id="schedToStep2" '+(sched.jobId?'':'disabled')+'>Continue →</button>'+
    '<button type="button" class="secondary" id="schedBackHome">← Home</button></div></section>';
  $('mainContent').innerHTML='<div class="h38-flow-view">'+html+'</div>';
  $('mainContent').querySelectorAll('[data-sched-job]').forEach(function(b){
    b.onclick=function(){sched.jobId=b.getAttribute('data-sched-job');renderStep1();};
  });
  var qc=$('schedQuickCustomer'); if(qc&&sched.quickCustomerId) qc.value=sched.quickCustomerId;
  $('schedQuickCreate').onclick=async function(){
    var title=$('schedQuickTitle').value.trim();
    if(!title){toast('Give the quick job a title first.',true);return;}
    try{
      var id=newId('JOB');
      var record={'Job ID':id,'Business ID':state.businessId,'Customer ID':$('schedQuickCustomer').value||'',
        'Job Number':'LOCAL-'+Date.now(),'Project Title':title,'Status':'Approved',
        'Created Time':now(),'Updated Time':now(),'Record Version':1};
      await queueOperation('SAVE_JOB','Job',id,{jobId:id,customerId:record['Customer ID'],projectTitle:title,status:'Approved'},{collection:'jobs',record:record,idKeys:['Job ID']});
      sched.jobId=id; sched.quickTitle=''; sched.quickCustomerId='';
      toast('Quick job created.');
      renderStep1();
    }catch(err){toast('Could not create the job: '+(err&&err.message||err),true);}
  };
  $('schedQuickTitle').oninput=function(e){sched.quickTitle=e.target.value;};
  if(qc) qc.onchange=function(){sched.quickCustomerId=qc.value;};
  $('schedToStep2').onclick=function(){if(sched.jobId)renderStep2();};
  $('schedBackHome').onclick=function(){openPage('today');};
}

/* ================= STEP 2: WHO ================= */
function renderStep2(){
  var users=crewUsers();
  var todayStr=localDateStr(new Date());
  var html=schedHead('Schedule Job','Pick the crew. Availability is checked against today\'s schedule.');
  html+='<section class="card">'+stepHeader(2,4,'Who\'s doing it?');
  var job=jobRow(sched.jobId);
  html+='<p class="muted small">Job: <strong>'+esc(job?v(job,'Project Title'):'')+'</strong></p><div class="list">';
  if(!users.length) html+='<p class="muted">No team members found. Add people in Settings → Users first.</p>';
  users.forEach(function(row){
    var id=rowId(row,'User ID','userId');
    var name=String(v(row,'Display Name','Email')||'Team member');
    var busy=userEventsOn(id,todayStr)[0];
    var checked=sched.crewIds.includes(String(id));
    var disabled=!!busy;
    html+='<label class="row'+(disabled?' muted':'')+'">'+
      '<div class="row-top"><strong><input type="checkbox" data-sched-crew="'+esc(id)+'"'+(checked?' checked':'')+(disabled?' disabled':'')+' style="width:auto"> '+esc(name)+'</strong>'+
      (disabled?'<span class="pill pending">Busy today</span>':'<span class="pill good">Available</span>')+'</div>'+
      (disabled?'<small>On another job today: '+esc(v(busy,'Title')||'scheduled')+' ('+esc(String(v(busy,'Start Time')||'').slice(11,16))+')</small>':'')+
      '</label>';
  });
  html+='</div>';
  html+='<div class="actions"><button type="button" id="schedToStep3" '+(sched.crewIds.length?'':'disabled')+'>Continue →</button>'+
    '<button type="button" class="secondary" id="schedBack1">← Back</button></div></section>';
  $('mainContent').innerHTML='<div class="h38-flow-view">'+html+'</div>';
  $('mainContent').querySelectorAll('[data-sched-crew]').forEach(function(cb){
    cb.onchange=function(){
      var id=cb.getAttribute('data-sched-crew');
      sched.crewIds=Array.from($('mainContent').querySelectorAll('[data-sched-crew]:checked')).map(function(x){return x.getAttribute('data-sched-crew');});
      $('schedToStep3').disabled=!sched.crewIds.length;
    };
  });
  $('schedToStep3').onclick=function(){if(sched.crewIds.length){sched.overrideConflicts=false;renderStep3();}};
  $('schedBack1').onclick=function(){renderStep1();};
}

/* ================= STEP 3: WHEN ================= */
function renderStep3(){
  var dateStr=chosenDateStr();
  var html=schedHead('Schedule Job','Pick the day and time. Conflicts are flagged before you confirm.');
  html+='<section class="card">'+stepHeader(3,4,'When?');
  var job=jobRow(sched.jobId);
  var crewNames=sched.crewIds.map(function(id){var u=userRow(id);return u?String(v(u,'Display Name','Email')||''):id;});
  html+='<p class="muted small">Job: <strong>'+esc(job?v(job,'Project Title'):'')+'</strong><br>Crew: <strong>'+esc(crewNames.join(', ')||'None')+'</strong></p>';
  html+='<div class="h38-tier-toggle" role="group" aria-label="Pick a day">'+
    '<button type="button" data-sched-day="today" aria-pressed="'+(sched.dateMode==='today')+'">Today</button>'+
    '<button type="button" data-sched-day="tomorrow" aria-pressed="'+(sched.dateMode==='tomorrow')+'">Tomorrow</button>'+
    '<button type="button" data-sched-day="pick" aria-pressed="'+(sched.dateMode==='pick')+'">Pick…</button></div>';
  html+='<div id="schedPickRow" class="'+(sched.dateMode==='pick'?'':'hidden')+'"><label>Date</label><input type="date" id="schedCustomDate" value="'+esc(sched.customDate)+'"></div>';
  html+='<p class="muted"><strong>'+esc(prettyDate(dateStr)||'Choose a date')+'</strong></p>';
  html+='<div class="two"><div><label>Start time</label><input type="time" id="schedStart" value="'+esc(sched.startTime)+'"></div>'+
    '<div><label>End time</label><input type="time" id="schedEnd" value="'+esc(sched.endTime)+'"></div></div>';
  html+='<div id="schedConflictBox"></div>';
  html+='<div class="actions"><button type="button" id="schedConfirmBtn">Schedule →</button>'+
    '<button type="button" class="secondary" id="schedBack2">← Back</button></div></section>';
  $('mainContent').innerHTML='<div class="h38-flow-view">'+html+'</div>';

  $('mainContent').querySelectorAll('[data-sched-day]').forEach(function(b){
    b.onclick=function(){
      sched.dateMode=b.getAttribute('data-sched-day');
      sched.overrideConflicts=false;
      renderStep3();
      if(sched.dateMode==='pick'){var d=$('schedCustomDate');if(d)d.focus();}
    };
  });
  var cd=$('schedCustomDate');
  if(cd) cd.onchange=function(){sched.customDate=cd.value;sched.overrideConflicts=false;refreshConflicts();};
  $('schedStart').onchange=function(e){sched.startTime=e.target.value;sched.overrideConflicts=false;refreshConflicts();};
  $('schedEnd').onchange=function(e){sched.endTime=e.target.value;sched.overrideConflicts=false;refreshConflicts();};
  $('schedBack2').onclick=function(){renderStep2();};
  $('schedConfirmBtn').onclick=confirmSchedule;
  refreshConflicts();
}

function currentConflicts(){
  var dateStr=chosenDateStr();
  if(!dateStr||!sched.startTime||!sched.endTime) return [];
  return sched.crewIds.map(function(id){
    var ev=conflictFor(id,dateStr,sched.startTime,sched.endTime);
    return ev?{userId:id,event:ev}:null;
  }).filter(Boolean);
}

function refreshConflicts(){
  var box=$('schedConflictBox'); if(!box) return;
  var conflicts=currentConflicts();
  var btn=$('schedConfirmBtn');
  if(!conflicts.length){
    box.innerHTML='<p class="muted small">✅ No conflicts for the selected crew at this time.</p>';
    btn.textContent='Schedule →';
    return;
  }
  box.innerHTML='<div class="notice warn"><strong>⚠️ Possible overlap:</strong><ul>'+
    conflicts.map(function(c){
      var u=userRow(c.userId);
      return '<li>'+esc(u?String(v(u,'Display Name','Email')||''):'Crew')+' — '+esc(v(c.event,'Title')||'scheduled')+' ('+esc(String(v(c.event,'Start Time')||'').slice(11,16))+'–'+esc(String(v(c.event,'End Time')||'').slice(11,16))+')</li>';
    }).join('')+'</ul></div>';
  btn.textContent=sched.overrideConflicts?'Schedule anyway →':'Schedule →';
}

/* Explicit confirmation, then write events, flip job status, queue crew texts. */
async function confirmSchedule(){
  var dateStr=chosenDateStr();
  if(!dateStr){toast('Pick a date first.',true);return;}
  if(!sched.startTime||!sched.endTime){toast('Pick a start and end time.',true);return;}
  if(sched.endTime<=sched.startTime){toast('End time must be after the start time.',true);return;}
  var job=jobRow(sched.jobId); if(!job){toast('That job is gone — pick another.',true);renderStep1();return;}
  var conflicts=currentConflicts();
  if(conflicts.length&&!sched.overrideConflicts){
    sched.overrideConflicts=true;
    refreshConflicts();
    toast('Conflict noted — tap "Schedule anyway" to proceed, or adjust the time.',true);
    return;
  }
  var crewNames=sched.crewIds.map(function(id){var u=userRow(id);return u?String(v(u,'Display Name','Email')||''):id;});
  var summary=(v(job,'Project Title')||'Job')+' — '+prettyDate(dateStr)+', '+sched.startTime+'–'+sched.endTime+' — crew: '+crewNames.join(', ');
  var ok=true;
  if(window.H38Flow&&typeof window.H38Flow.confirm==='function'){
    ok=await window.H38Flow.confirm({title:'Schedule this job?',
      message:summary+'\n\nThe crew will be queued a text notification (you approve it before anything is sent).',
      okLabel:'Schedule job',cancelLabel:'Cancel'});
  }else if(!confirm(summary+'\n\nSchedule this job and queue a crew text?')) ok=false;
  if(!ok) return;

  var results={summary:summary,events:0,notified:[],failed:[]};
  for(var i=0;i<sched.crewIds.length;i++){
    var uid=sched.crewIds[i], u=userRow(uid);
    var evId=newId('SCHEDULE');
    var record={'Schedule Event ID':evId,'Business ID':state.businessId,'Event Type':'Job',
      'Title':v(job,'Project Title')||'Job','Related Record Type':'Job','Related Record ID':sched.jobId,
      'Assigned User ID':uid,'Start Time':dateStr+'T'+sched.startTime,'End Time':dateStr+'T'+sched.endTime,
      'Location':v(job,'Location')||'','Status':'Scheduled','Notes':'Scheduled via guided flow.',
      'Created Time':now(),'Updated Time':now(),'Record Version':1};
    try{
      await queueOperation('SAVE_SCHEDULE','Schedule Event',evId,{scheduleEventId:evId,relatedRecordId:sched.jobId,assignedUserId:uid,startTime:record['Start Time'],endTime:record['End Time'],status:'Scheduled'},{collection:'scheduleEvents',record:record,idKeys:['Schedule Event ID']});
      results.events++;
    }catch(err){results.failed.push({name:u?String(v(u,'Display Name','Email')||uid):uid,reason:'schedule: '+(err&&err.message||err)});continue;}
    /* Crew text — queued for owner approval, never sent directly. */
    var uname=u?String(v(u,'Display Name','Email')||'Crew'):'Crew';
    var phone=u?String(v(u,'Phone')||'').trim():'';
    if(!phone){results.failed.push({name:uname,reason:'no phone number on file — tell them yourself'});continue;}
    if(!window.H38Sms||typeof window.H38Sms.sendSms!=='function'){results.failed.push({name:uname,reason:'SMS module not loaded — tell them yourself'});continue;}
    try{
      await window.H38Sms.sendSms({to:phone,
        body:'New job: '+(v(job,'Project Title')||'Job')+' on '+prettyDate(dateStr)+', '+sched.startTime+'–'+sched.endTime+'. — '+bizName(),
        purpose:'Crew notification',category:'general'});
      results.notified.push(uname);
    }catch(err){
      results.failed.push({name:uname,reason:err&&(err.message||String(err))||'text not queued'});
    }
  }
  /* Flip the job to Scheduled (same rule as the Schedule page). */
  try{
    var st=String(v(job,'Status')||'');
    if(/^(lead|quoted|approved)$/i.test(st)){
      var updated=Object.assign({},job,{'Status':'Scheduled','Updated Time':now(),'Record Version':num(v(job,'Record Version'))+1});
      delete updated.__localPending;
      await queueOperation('SAVE_JOB','Job',sched.jobId,{jobId:sched.jobId,status:'Scheduled'},{collection:'jobs',record:updated,idKeys:['Job ID']});
    }
  }catch(err){toast('Scheduled, but the job status could not be flipped — update it from the Jobs list.',true);}
  sched.results=results;
  sched.step=4;
  renderStep4();
}

/* ================= STEP 4: DONE ================= */
function renderStep4(){
  var r=sched.results||{summary:'',events:0,notified:[],failed:[]};
  var html=schedHead('Job Scheduled','Everything is in place. Here is exactly what happened.');
  html+='<section class="card"><h2>✅ Job scheduled</h2><p><strong>'+esc(r.summary)+'</strong></p>';
  html+='<p class="muted small">'+r.events+' schedule event'+(r.events===1?'':'s')+' created.</p>';
  if(r.notified.length){
    html+='<h3>Crew texts queued ('+r.notified.length+')</h3><div class="list">'+
      r.notified.map(function(n){return '<div class="row"><div class="row-top"><strong>'+esc(n)+'</strong><span class="pill pending">Approval needed</span></div><small>Approve the text in 💬 Messages before it goes out.</small></div>';}).join('')+'</div>';
  }
  if(r.failed.length){
    html+='<h3>Needs your attention ('+r.failed.length+')</h3><div class="list">'+
      r.failed.map(function(f){return '<div class="row"><div class="row-top"><strong>'+esc(f.name)+'</strong><span class="pill bad">Not done</span></div><small>'+esc(f.reason)+'</small></div>';}).join('')+'</div>';
  }
  html+='<div class="actions"><button type="button" id="schedDoneHome">Done → Home</button>'+
    '<button type="button" class="secondary" id="schedDoneSchedule">View Schedule</button></div></section>';
  $('mainContent').innerHTML='<div class="h38-flow-view">'+html+'</div>';
  $('schedDoneHome').onclick=function(){openPage('today');};
  $('schedDoneSchedule').onclick=function(){openPage('schedule');};
}

function start(){
  sched={step:1,jobId:null,quickCustomerId:'',crewIds:[],dateMode:'today',customDate:'',startTime:'09:00',endTime:'12:00',results:null,overrideConflicts:false};
  renderStep1();
  try{window.scrollTo(0,0);}catch(e){}
}

window.H38GuidedSchedule={start:start};
})();
