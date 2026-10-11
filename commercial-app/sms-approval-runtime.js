/* ---- SMS Approval Runtime (2026-10-11) ----
 * Phase 3 Tier 3: Messages & Follow-ups rebuild.
 *
 * The approval queue in sms-provider.js showed "Queued — Owner Approval
 * Required" with ZERO buttons — drafts sat forever (Phase 1, M1).
 * This module adds the missing lifecycle actions:
 *
 *   Queued — Owner Approval Required → [Approve & Send] [Deny]
 *   Approve & Send → confirm → POST h38-send-sms (ownerApproved=true)
 *                    → Sent | Failed (with reason + retry)
 *   Deny → confirm → Denied (terminal)
 *
 * Patterns applied:
 * - Pattern 1: post-approve shows what happened + next + one-tap action.
 * - Pattern 3: every button has success / failure-with-fix / confirm.
 * - Pattern 4: every status has a UI action that transitions it.
 * - Pattern 5: confirmations lead with what DID happen.
 * - Offline: approve queues the send for reconnect; never shows failure
 *   for a queued action. Deny works offline (local status + queue).
 */
(function(){
'use strict';
var BUILD='20261011-sms-approval-1';
var text=function(v){ return String(v==null?'':v).trim(); };
var esc=function(v){ return text(v).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };

function bizId(){ return (typeof state!=='undefined'&&state.businessId)||''; }
function threads(){
  try{ return (typeof records==='function'?records('smsThreads'):[])||[]; }catch(e){ return []; }
}
function threadIdOf(row){
  try{ return text(row['SMS Thread ID']||row.threadId); }catch(e){ return ''; }
}
function findThread(threadId){
  var rows=threads();
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
  if(!token) throw new Error('Your sign-in expired. Sign in again, then approve.');
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
  if(!id) throw new Error('That text thread is missing its ID.');
  var record=Object.assign({},thread,{'Status':status,'Record Version':(Number(thread['Record Version'])||0)+1});
  if(extra) for(var k in extra){ record[k]=extra[k]; }
  var hist='';
  try{ if(window.H38Flow&&window.H38Flow.pushStatusHistory) hist=window.H38Flow.pushStatusHistory(thread,thread['Status'],status); }catch(e){}
  if(hist) record['Status History']=hist;
  await queueOperation('SMS_STATUS','SMS Thread',id,{threadId:id},{collection:'smsThreads',record:record,idKeys:['SMS Thread ID']});
}

/* Approve a queued thread: confirm → send via edge function (or queue offline). */
async function approveThread(threadId){
  var thread=findThread(threadId);
  if(!thread){ if(window.toast)window.toast('That text is no longer in the queue.',true); return; }
  var to=text(thread['Customer Number']);
  var body=text(thread['Pending Body']);
  var ok=await (window.H38Flow?window.H38Flow.confirm({
    title:'Approve and send this text?',
    message:'To '+to+': "'+body.slice(0,120)+(body.length>120?'…':'')+'"',
    okLabel:'Approve & Send',cancelLabel:'Cancel'
  }):Promise.resolve(true));
  if(!ok) return;

  // Offline: queue the approval; the send fires on reconnect.
  if(typeof navigator!=='undefined'&&!navigator.onLine){
    await saveThreadStatus(thread,'Approved — Queued to Send',{});
    if(window.H38Flow)window.H38Flow.showNextStep({
      title:'Text approved. It will send when you are back online.',
      next:'Nothing else needed — the send fires automatically on reconnect.',
      offline:true,
      actions:[{label:'View queue',handler:function(){ if(typeof renderMessages==='function')renderMessages(); }}],
      id:'h38SmsApprovedOffline',signature:'sms-approved-offline-'+threadId
    });
    else if(window.toast)window.toast('Text approved. Will send when back online.');
    if(typeof renderMessages==='function')renderMessages();
    return;
  }

  if(window.toast)window.toast('Sending…');
  try{
    var r=await authedFetch('h38-send-sms',{
      to:to,body:body,businessId:bizId(),threadId:threadId,
      ownerApproved:true,approvedBy:approvedBy(),
      purpose:text(thread['Purpose'])||'Customer text'
    });
    if(!r.ok){
      var msg=(r.payload&&r.payload.error)||('Send failed ('+r.status+').');
      await saveThreadStatus(thread,'Failed',{'Send Error':msg});
      if(window.H38Flow)window.H38Flow.fail({
        what:'Could not send the text.',
        why:msg,
        fixes:[{label:'Retry send',primary:true,handler:function(){ approveThread(threadId); }},{label:'Keep as queued',handler:function(){ saveThreadStatus(findThread(threadId)||thread,'Queued — Owner Approval Required',{}).then(function(){ if(typeof renderMessages==='function')renderMessages(); }); }}],
        id:'h38SmsSendFail'
      });
      else if(window.toast)window.toast(msg,true);
      if(typeof renderMessages==='function')renderMessages();
      return;
    }
    await saveThreadStatus(thread,'Sent',{'Sent Time':new Date().toISOString(),'Approved By':approvedBy(),'Provider Message ID':text((r.payload||{}).providerMessageId)});
    if(window.H38Flow)window.H38Flow.showNextStep({
      title:'Text sent to '+to+'.',
      next:'The thread is closed. Nothing further needed.',
      actions:[{label:'View messages',primary:true,handler:function(){ if(typeof renderMessages==='function')renderMessages(); }}],
      id:'h38SmsSent',signature:'sms-sent-'+threadId
    });
    else if(window.toast)window.toast('Text sent to '+to+'.');
  }catch(err){
    var em=err&&err.message?err.message:String(err);
    await saveThreadStatus(thread,'Failed',{'Send Error':em});
    if(window.H38Flow)window.H38Flow.fail({
      what:'Could not send the text.',why:em,
      fixes:[{label:'Retry send',primary:true,handler:function(){ approveThread(threadId); }}],
      id:'h38SmsSendFail2'
    });
    else if(window.toast)window.toast(em,true);
  }
  if(typeof renderMessages==='function')renderMessages();
}

/* Deny a queued thread: confirm → terminal Denied status. */
async function denyThread(threadId){
  var thread=findThread(threadId);
  if(!thread){ if(window.toast)window.toast('That text is no longer in the queue.',true); return; }
  var ok=await (window.H38Flow?window.H38Flow.confirm({
    title:'Deny this text?',
    message:'The draft stays in history but will never send.',
    okLabel:'Deny',cancelLabel:'Cancel'
  }):Promise.resolve(true));
  if(!ok) return;
  await saveThreadStatus(thread,'Denied',{});
  if(window.H38Flow)window.H38Flow.showNextStep({
    title:'Text denied. It will not send.',
    next:'The draft is kept in history for reference.',
    offline:(typeof navigator!=='undefined'&&!navigator.onLine),
    actions:[{label:'View queue',handler:function(){ if(typeof renderMessages==='function')renderMessages(); }}],
    id:'h38SmsDenied',signature:'sms-denied-'+threadId
  });
  else if(window.toast)window.toast('Text denied.');
  if(typeof renderMessages==='function')renderMessages();
}

/* Render action buttons for a queued thread row. Called from the queue card. */
function queueRowActions(thread){
  var id=esc(threadIdOf(thread));
  var status=text(thread['Status']||'');
  if(/queued.*approval/i.test(status)){
    return '<div class="row-actions">'
      +'<button type="button" data-sms-approve="'+id+'">Approve & Send</button>'
      +'<button type="button" class="secondary" data-sms-deny="'+id+'">Deny</button>'
      +'</div>';
  }
  if(status==='Failed'){
    return '<div class="row-actions"><button type="button" data-sms-approve="'+id+'">Retry send</button></div>';
  }
  if(status==='Approved — Queued to Send'){
    return '<div class="row-actions"><span class="muted small">📴 Sends automatically on reconnect.</span></div>';
  }
  return '';
}
function bindQueueActions(root){
  root=root||document;
  root.querySelectorAll('[data-sms-approve]').forEach(function(b){
    if(b.dataset.h38Bound)return; b.dataset.h38Bound='1';
    b.addEventListener('click',function(){ approveThread(b.getAttribute('data-sms-approve')); });
  });
  root.querySelectorAll('[data-sms-deny]').forEach(function(b){
    if(b.dataset.h38Bound)return; b.dataset.h38Bound='1';
    b.addEventListener('click',function(){ denyThread(b.getAttribute('data-sms-deny')); });
  });
}

window.H38SmsApproval={
  approveThread:approveThread,
  denyThread:denyThread,
  queueRowActions:queueRowActions,
  bindQueueActions:bindQueueActions,
  BUILD:BUILD
};
})();
