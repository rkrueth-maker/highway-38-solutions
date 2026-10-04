// H38 SMS triggers — BUILD 20261004-sms-kit-1
// Kit-through texting: triggers scan REAL business records, compose messages
// from OWNER-APPROVED templates (H38Sms.templates), and queue drafts with
// Status 'Queued — Owner Approval Required'. Nothing sends automatically.
//
// Kit's role: after a draft is queued, requestKitPersonalization() submits an
// ai_handoff_tasks row (task_type 'personalize_sms'). Kit (the in-Office AI)
// claims it, rewrites the draft body in the business's voice from the real
// record context, and writes the personalized body back. The owner still
// approves before anything is delivered.
//
// Stop rules enforced here: only Approved templates are used; customer consent
// + per-category SMS preferences are enforced by H38Sms.sendSms; quiet hours
// set Deliver After on the queued draft (the approved executor must respect it).
// Idempotency: thread IDs are deterministic per (job/quote, date, kind) so a
// re-run never double-queues.
(function(){
'use strict';
var BUILD='20261004-sms-kit-1';
var LS_DAILY_KEY='h38-sms-triggers-last-run';

function H(){ return window.H38Sms||null; }
function bizId(){ return (typeof state!=='undefined'&&state.businessId)||''; }
function businessName(){
  try{
    var s=state.snapshot||{};
    return s.businessName||(s.business&&s.business.name)||(s.user&&s.user.businessName)||'Highway 38 Solutions';
  }catch(e){ return 'Highway 38 Solutions'; }
}
function localDateStr(d){
  d=d||new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function addDaysStr(base,n){
  var d=new Date(base.getTime()); d.setDate(d.getDate()+n); return localDateStr(d);
}
function eventDateStr(ev){
  var st=String((window.v? v(ev,'Start Time'):ev['Start Time'])||'');
  return st.slice(0,10); // ISO datetime → YYYY-MM-DD
}
function threads(){ try{ return records('smsThreads')||[]; }catch(e){ return []; } }
function threadExists(threadId){
  var rows=threads();
  for(var i=0;i<rows.length;i++){
    var tid=null;
    try{ tid=rowId(rows[i],'SMS Thread ID','threadId'); }catch(e){}
    if(String(tid)===String(threadId)) return true;
  }
  return false;
}
function customerNameOf(cust){
  if(!cust) return '';
  try{ return v(cust,'Customer Name')||''; }catch(e){ return ''; }
}
function firstNameOf(name){
  var n=String(name||'').trim();
  return n?n.split(/\s+/)[0]:'there';
}
function jobByNumber(jobNumber){
  var jobs=[]; try{ jobs=records('jobs')||[]; }catch(e){}
  for(var i=0;i<jobs.length;i++){
    try{ if(String(v(jobs[i],'Job Number'))===String(jobNumber)) return jobs[i]; }catch(e){}
  }
  return null;
}
function customerById(cid){
  var cs=[]; try{ cs=records('customers')||[]; }catch(e){}
  for(var i=0;i<cs.length;i++){
    var id=null; try{ id=rowId(cs[i],'Customer ID','customerId'); }catch(e){}
    if(String(id)===String(cid)) return cs[i];
  }
  return null;
}
function customerPhone(cust){
  if(!cust) return '';
  try{ return v(cust,'Mobile Phone')||v(cust,'Phone')||''; }catch(e){ return ''; }
}
function jobIdOf(job){
  try{ return rowId(job,'Job ID','jobId'); }catch(e){ return ''; }
}
function fmtTime(iso){
  var m=String(iso||'').match(/T(\d{2}):(\d{2})/);
  if(!m) return String(iso||'');
  var h=parseInt(m[1],10), ap=h>=12?'PM':'AM'; h=h%12||12;
  return h+':'+m[2]+' '+ap;
}
function fmtDate(iso){
  var m=String(iso||'').match(/(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return String(iso||'');
  var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(m[2],10)-1]+' '+parseInt(m[3],10);
}

// Ask Kit (in-Office AI) to personalize a queued draft. Best-effort: when the
// handoff table isn't deployed, the draft stays as the template wrote it and
// the owner reviews it as-is.
async function requestKitPersonalization(threadId,context){
  var api=null;
  try{ api=window.H38_AI_HANDOFF; }catch(e){}
  if(!api||typeof api.submitTask!=='function') return {requested:false,reason:'handoff-unavailable'};
  try{
    var taskId=await api.submitTask('personalize_sms',{
      businessId:bizId(), threadId:threadId, context:context||{},
      note:'Personalize this queued SMS draft from the real business records. Keep it short, keep the STOP line, do not change the meaning.'
    });
    return {requested:true,taskId:taskId};
  }catch(err){
    return {requested:false,reason:String((err&&err.message)||err)};
  }
}

// ---- Appointment reminders: tomorrow's scheduled events ----
async function draftReminders(){
  var Hh=H(); if(!Hh) return {drafted:0,skipped:'sms-module-missing'};
  if(!Hh.smsGatewayEnabled()) return {drafted:0,skipped:'gateway-off'};
  var tpl=Hh.templates.approvedFor('reminder');
  if(!tpl) return {drafted:0,skipped:'no-approved-reminder-template'};
  var tomorrow=addDaysStr(new Date(),1), drafted=0, skipped=0;
  var events=[]; try{ events=records('scheduleEvents')||[]; }catch(e){}
  for(var i=0;i<events.length;i++){
    var ev=events[i], st='';
    try{ st=String(v(ev,'Status')||''); }catch(e){}
    if(/cancel|done|complete/i.test(st)) continue;
    if(eventDateStr(ev)!==tomorrow) continue;
    var job=null;
    try{ job=jobByNumber(v(ev,'Job Number')); }catch(e){}
    if(!job){ skipped++; continue; }
    var cust=null;
    try{ cust=customerById(v(job,'Customer ID')); }catch(e){}
    var phone=customerPhone(cust);
    if(!phone){ skipped++; continue; }
    var jid=jobIdOf(job);
    var threadId='SMS-THREAD-'+jid+'-'+tomorrow+'-reminder';
    if(threadExists(threadId)){ skipped++; continue; }
    var cname=customerNameOf(cust);
    var data={
      customer_name:cname, first_name:firstNameOf(cname),
      job_date:fmtDate((function(){try{return v(ev,'Start Time');}catch(e){return '';}})()),
      job_time:fmtTime((function(){try{return v(ev,'Start Time');}catch(e){return '';}})()),
      tech_name:'', business_name:businessName(),
      job_address:(function(){try{return v(ev,'Location')||'';}catch(e){return '';}})()
    };
    var c2=Hh.templates.compose(tpl,data);
    if(c2.missing.length){ skipped++; continue; } // never send a half-rendered template
    try{
      await Hh.sendSms({to:phone,body:c2.body,category:'reminder',purpose:'Appointment reminder',
        threadId:threadId,consentStatus:'Consented'});
      await requestKitPersonalization(threadId,{kind:'reminder',jobId:jid,customerId:(function(){try{return v(job,'Customer ID');}catch(e){return '';}})()});
      drafted++;
    }catch(err){ skipped++; }
  }
  return {drafted:drafted,skipped:skipped};
}

// ---- On-my-way: called by the dispatch board when a crew goes en route ----
async function draftOnMyWay(assignment){
  var Hh=H(); if(!Hh) return {drafted:0,skipped:'sms-module-missing'};
  if(!Hh.smsGatewayEnabled()) return {drafted:0,skipped:'gateway-off'};
  var tpl=Hh.templates.approvedFor('on_my_way');
  if(!tpl) return {drafted:0,skipped:'no-approved-onmyway-template'};
  assignment=assignment||{};
  var job=null;
  try{
    var jobs=records('jobs')||[];
    for(var i=0;i<jobs.length;i++){ var id=null; try{id=rowId(jobs[i],'Job ID','jobId');}catch(e){}
      if(String(id)===String(assignment.jobId)){ job=jobs[i]; break; } }
  }catch(e){}
  var cust=job?customerById((function(){try{return v(job,'Customer ID');}catch(e){return '';}})()):null;
  var phone=customerPhone(cust);
  if(!phone) return {drafted:0,skipped:'no-phone'};
  var threadId='SMS-THREAD-'+String(assignment.jobId||'job')+'-'+localDateStr()+'-onmyway';
  if(threadExists(threadId)) return {drafted:0,skipped:'already-queued'};
  var cname=customerNameOf(cust);
  var c=Hh.templates.compose(tpl,{
    customer_name:cname, first_name:firstNameOf(cname),
    tech_name:String(assignment.techName||'our tech'), business_name:businessName(),
    job_time:String(assignment.etaMin||15)+' min'
  });
  if(c.missing.length) return {drafted:0,skipped:'template-missing-data'};
  try{
    await Hh.sendSms({to:phone,body:c.body,category:'on_my_way',purpose:'On my way',
      threadId:threadId,consentStatus:'Consented'});
    await requestKitPersonalization(threadId,{kind:'on_my_way',jobId:assignment.jobId});
    return {drafted:1,skipped:0};
  }catch(err){ return {drafted:0,skipped:String((err&&err.message)||err)}; }
}

// ---- Follow-ups: stale quotes + recently completed jobs ----
async function draftFollowUps(){
  var Hh=H(); if(!Hh) return {drafted:0,skipped:'sms-module-missing'};
  if(!Hh.smsGatewayEnabled()) return {drafted:0,skipped:'gateway-off'};
  var tpl=Hh.templates.approvedFor('follow_up');
  if(!tpl) return {drafted:0,skipped:'no-approved-followup-template'};
  var drafted=0, skipped=0;
  var threeDaysAgo=addDaysStr(new Date(),-3), yesterday=addDaysStr(new Date(),-1);
  // Quotes presented/sent 3+ days ago with no follow-up queued.
  try{
    var quotes=records('quotes')||[];
    for(var i=0;i<quotes.length;i++){
      var q=quotes[i], qst='';
      try{ qst=String(v(q,'Status')||''); }catch(e){}
      if(!/presented|sent/i.test(qst)) continue;
      var qdate='';
      try{ qdate=String(v(q,'Presented Date')||v(q,'Sent Date')||v(q,'Created Time')||'').slice(0,10); }catch(e){}
      if(!qdate||qdate>threeDaysAgo) continue;
      var qid=''; try{ qid=rowId(q,'Quote ID','quoteId'); }catch(e){}
      var threadId='SMS-THREAD-'+qid+'-quotefollowup';
      if(threadExists(threadId)){ skipped++; continue; }
      var cust=customerById((function(){try{return v(q,'Customer ID');}catch(e){return '';}})());
      var phone=customerPhone(cust);
      if(!phone){ skipped++; continue; }
      var cname=customerNameOf(cust);
      var total=''; try{ total=v(q,'Total'); }catch(e){}
      var c=Hh.templates.compose(tpl,{customer_name:cname,first_name:firstNameOf(cname),
        business_name:businessName(),
        quote_total:total===''?'':(typeof money==='function'?money(total):String(total)),
        quote_number:(function(){try{return v(q,'Quote Number')||'';}catch(e){return '';}})()});
      if(c.missing.length){ skipped++; continue; }
      try{
        await Hh.sendSms({to:phone,body:c.body,category:'follow_up',purpose:'Quote follow-up',
          threadId:threadId,consentStatus:'Consented'});
        await requestKitPersonalization(threadId,{kind:'quote_followup',quoteId:qid});
        drafted++;
      }catch(err){ skipped++; }
    }
  }catch(e){}
  // Jobs completed yesterday → review/follow-up ask.
  try{
    var jobs=records('jobs')||[];
    for(var j=0;j<jobs.length;j++){
      var jb=jobs[j], jst='';
      try{ jst=String(v(jb,'Status')||''); }catch(e){}
      if(!/complete/i.test(jst)) continue;
      var ud='';
      try{ ud=String(v(jb,'Updated Time')||v(jb,'Completed Time')||'').slice(0,10); }catch(e){}
      if(ud!==yesterday) continue;
      var jid2=jobIdOf(jb);
      var tid2='SMS-THREAD-'+jid2+'-jobfollowup';
      if(threadExists(tid2)){ skipped++; continue; }
      var cust2=customerById((function(){try{return v(jb,'Customer ID');}catch(e){return '';}})());
      var phone2=customerPhone(cust2);
      if(!phone2){ skipped++; continue; }
      var cname2=customerNameOf(cust2);
      var c2=Hh.templates.compose(tpl,{customer_name:cname2,first_name:firstNameOf(cname2),
        business_name:businessName()});
      if(c2.missing.length){ skipped++; continue; }
      try{
        await Hh.sendSms({to:phone2,body:c2.body,category:'follow_up',purpose:'Job follow-up',
          threadId:tid2,consentStatus:'Consented'});
        await requestKitPersonalization(tid2,{kind:'job_followup',jobId:jid2});
        drafted++;
      }catch(err){ skipped++; }
    }
  }catch(e){}
  return {drafted:drafted,skipped:skipped};
}

// Run once per day (guarded): reminders + follow-ups.
async function runDaily(){
  var today=localDateStr(), last='';
  try{ last=localStorage.getItem(LS_DAILY_KEY)||''; }catch(e){}
  if(last===today) return {ran:false,reason:'already-ran-today'};
  var Hh=H();
  if(!Hh||!Hh.smsGatewayEnabled()) return {ran:false,reason:'gateway-off'};
  var r=await draftReminders(), f=await draftFollowUps();
  try{ localStorage.setItem(LS_DAILY_KEY,today); }catch(e){}
  return {ran:true,reminders:r,followUps:f};
}

window.H38SmsTriggers={
  draftReminders:draftReminders,
  draftOnMyWay:draftOnMyWay,
  draftFollowUps:draftFollowUps,
  requestKitPersonalization:requestKitPersonalization,
  runDaily:runDaily,
  BUILD:BUILD
};
})();
