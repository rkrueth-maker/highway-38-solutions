/* ---- Email Send Runtime (2026-10-11) ----
 * Phase 3 Tier 3: Messages & Follow-ups rebuild.
 *
 * Email was write-only: "Save email draft" → "Nothing sent." (Phase 1, M2).
 * This module adds the missing send path:
 *
 *   Draft → [Send] → confirm → POST h38-send-email (ownerApproved=true)
 *           → Sent | Failed (with reason + retry)
 *
 * Patterns applied:
 * - Pattern 1: post-send shows what happened + next.
 * - Pattern 3: confirm before send; failure shows why + retry.
 * - Pattern 4: Draft → Sent | Failed. Every status has a transition.
 * - Pattern 5: "Email sent to x." not "Nothing sent."
 * - Offline: send queues for reconnect; never shows failure for queued.
 */
(function(){
'use strict';
var BUILD='20261011-email-send-1';
var text=function(v){ return String(v==null?'':v).trim(); };
var esc=function(v){ return text(v).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };

function bizId(){ return (typeof state!=='undefined'&&state.businessId)||''; }
function emailThreads(){
  try{ return (typeof records==='function'?records('emailThreads'):[])||[]; }catch(e){ return []; }
}
function threadIdOf(row){
  try{ return text(row['Email Thread ID']||row.threadId); }catch(e){ return ''; }
}
function findThread(threadId){
  var rows=emailThreads();
  for(var i=0;i<rows.length;i++){ if(threadIdOf(rows[i])===text(threadId)) return rows[i]; }
  return null;
}
function approvedBy(){
  try{
    var s=(typeof state!=='undefined'&&state.snapshot)||{};
    return text((s.user&&(s.user.email||s.user.userId))||'owner');
  }catch(e){ return 'owner'; }
}
function supabaseCfg(){
  try{ return window.H38_BUSINESS_OFFICE_SUPABASE||null; }catch(e){ return null; }
}
async function authedFetch(path,body){
  var cfg=supabaseCfg();
  if(!cfg||!cfg.url||!cfg.publishableKey) throw new Error('The secure Office connection is not ready. Try again in a moment.');
  var token='';
  try{
    if(window.supabase&&cfg){
      var client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
      var sess=await client.auth.getSession();
      token=(sess&&sess.data&&sess.data.session&&sess.data.session.access_token)||'';
    }
  }catch(e){}
  if(!token) throw new Error('Your sign-in expired. Sign in again, then send.');
  var res=await fetch(cfg.url+'/functions/v1/'+path,{
    method:'POST',mode:'cors',cache:'no-store',credentials:'omit',
    headers:{authorization:'Bearer '+token,apikey:cfg.publishableKey,'content-type':'application/json','x-client-info':BUILD},
    body:JSON.stringify(body||{})
  });
  var payload=null;
  try{ payload=await res.json(); }catch(e){}
  return {ok:res.ok,status:res.status,payload:payload||{}};
}
async function saveThreadStatus(thread,status,extra){
  var id=threadIdOf(thread);
  if(!id) throw new Error('That email is missing its ID.');
  var record=Object.assign({},thread,{'Status':status,'Record Version':(Number(thread['Record Version'])||0)+1});
  if(extra) for(var k in extra){ record[k]=extra[k]; }
  var hist='';
  try{ if(window.H38Flow&&window.H38Flow.pushStatusHistory) hist=window.H38Flow.pushStatusHistory(thread,thread['Status'],status); }catch(e){}
  if(hist) record['Status History']=hist;
  await queueOperation('EMAIL_STATUS','Email Thread',id,{threadId:id},{collection:'emailThreads',record:record,idKeys:['Email Thread ID']});
}
/* Get the latest draft body for a thread from emailMessages snapshot. */
function draftBodyFor(threadId){
  try{
    var msgs=(typeof state!=='undefined'&&state.snapshot&&state.snapshot.emailMessages)||[];
    for(var i=0;i<msgs.length;i++){
      var m=msgs[i];
      if(text(m['Email Thread ID']||m.threadId)===text(threadId)){
        return {to:JSON.parse(m['To Addresses JSON']||'[]')[0]||'',subject:text(m['Subject']),body:text(m['Body Preview'])};
      }
    }
  }catch(e){}
  return {to:'',subject:'',body:''};
}

async function sendThread(threadId){
  var thread=findThread(threadId);
  if(!thread){ if(window.toast)window.toast('That email draft is gone.',true); return; }
  var draft=draftBodyFor(threadId);
  var to=draft.to||text(thread['To Addresses JSON']||'');
  try{ var arr=JSON.parse(text(thread['To Addresses JSON']||'[]')); if(arr&&arr[0]) to=arr[0]; }catch(e){}
  var subject=draft.subject||text(thread['Subject']);
  var body=draft.body;
  if(!to||!subject||!body){
    if(window.H38Flow)window.H38Flow.fail({
      what:'This email draft is incomplete.',
      why:'It needs a recipient, subject, and message before it can send.',
      fixes:[{label:'Back to drafts',handler:function(){ if(typeof renderMessages==='function')renderMessages(); }}],
      id:'h38EmailIncomplete'
    });
    else if(window.toast)window.toast('This email draft is incomplete.',true);
    return;
  }
  var ok=await (window.H38Flow?window.H38Flow.confirm({
    title:'Send this email?',
    message:'To '+to+' — "'+subject+'"',
    okLabel:'Send',cancelLabel:'Cancel'
  }):Promise.resolve(true));
  if(!ok) return;

  if(typeof navigator!=='undefined'&&!navigator.onLine){
    await saveThreadStatus(thread,'Queued to Send',{});
    if(window.H38Flow)window.H38Flow.showNextStep({
      title:'Email queued. It will send when you are back online.',
      next:'Nothing else needed.',
      offline:true,
      actions:[{label:'View emails',handler:function(){ if(typeof renderMessages==='function')renderMessages(); }}],
      id:'h38EmailQueuedOffline',signature:'email-queued-'+threadId
    });
    else if(window.toast)window.toast('Email queued. Will send when back online.');
    if(typeof renderMessages==='function')renderMessages();
    return;
  }

  if(window.toast)window.toast('Sending…');
  try{
    var r=await authedFetch('h38-send-email',{
      to:to,subject:subject,body:body,businessId:bizId(),threadId:threadId,
      ownerApproved:true,approvedBy:approvedBy()
    });
    if(!r.ok){
      var msg=(r.payload&&r.payload.error)||('Send failed ('+r.status+').');
      await saveThreadStatus(thread,'Failed',{'Send Error':msg});
      if(window.H38Flow)window.H38Flow.fail({
        what:'Could not send the email.',why:msg,
        fixes:[{label:'Retry send',primary:true,handler:function(){ sendThread(threadId); }}],
        id:'h38EmailSendFail'
      });
      else if(window.toast)window.toast(msg,true);
      if(typeof renderMessages==='function')renderMessages();
      return;
    }
    await saveThreadStatus(thread,'Sent',{'Sent Time':new Date().toISOString(),'Approved By':approvedBy()});
    if(window.H38Flow)window.H38Flow.showNextStep({
      title:'Email sent to '+to+'.',
      next:'The thread is closed. Nothing further needed.',
      actions:[{label:'View emails',primary:true,handler:function(){ if(typeof renderMessages==='function')renderMessages(); }}],
      id:'h38EmailSent',signature:'email-sent-'+threadId
    });
    else if(window.toast)window.toast('Email sent to '+to+'.');
  }catch(err){
    var em=err&&err.message?err.message:String(err);
    await saveThreadStatus(thread,'Failed',{'Send Error':em});
    if(window.H38Flow)window.H38Flow.fail({
      what:'Could not send the email.',why:em,
      fixes:[{label:'Retry send',primary:true,handler:function(){ sendThread(threadId); }}],
      id:'h38EmailSendFail2'
    });
    else if(window.toast)window.toast(em,true);
  }
  if(typeof renderMessages==='function')renderMessages();
}

/* Action buttons for an email thread row. */
function threadRowActions(thread){
  var id=esc(threadIdOf(thread));
  var status=text(thread['Status']||'');
  if(status==='Draft'||status==='Draft — Not Sent'||status==='Failed'){
    return '<div class="row-actions"><button type="button" data-email-send="'+id+'">'
      +(status==='Failed'?'Retry send':'Send')+'</button></div>';
  }
  if(status==='Queued to Send'){
    return '<div class="row-actions"><span class="muted small">📴 Sends automatically on reconnect.</span></div>';
  }
  return '';
}
function bindThreadActions(root){
  root=root||document;
  root.querySelectorAll('[data-email-send]').forEach(function(b){
    if(b.dataset.h38Bound)return; b.dataset.h38Bound='1';
    b.addEventListener('click',function(){ sendThread(b.getAttribute('data-email-send')); });
  });
}

window.H38EmailSend={
  sendThread:sendThread,
  threadRowActions:threadRowActions,
  bindThreadActions:bindThreadActions,
  BUILD:BUILD
};
})();
