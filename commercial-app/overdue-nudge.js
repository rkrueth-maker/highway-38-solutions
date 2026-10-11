/* H38 Overdue Nudge — "Get Paid" guided flow (Owner Ease rebuild, Phase 3, design §3.5).
 *
 * Script tag to add (coordinator handles index.html):
 *   <script src="overdue-nudge.js"></script>
 *
 * Data collections used (read/write):
 *   invoices       — read overdue invoices (Balance, Due Date, Status, Invoice Number)
 *   customers      — read customer name, phone, email
 *   smsThreads     — written by H38Sms.sendSms (queued for owner approval, never sent directly)
 *   emailThreads / state.snapshot.emailMessages — email draft fallback (Status 'Draft — Not Sent')
 *
 * SMS/email reuse: this file calls window.H38Sms.sendSms({to, body, purpose}),
 * exactly like the Messages page's "Request send" (app-09.js bindSmsForm). That
 * path validates the gateway, consent, quiet hours, and writes a thread with
 * status 'Queued — Owner Approval Required'. NOTHING IS SENT UNTIL THE OWNER
 * APPROVES. Email reminders use the same SAVE_EMAIL_DRAFT record shape as
 * bindEmailForm (Draft — Not Sent).
 *
 * Entry point: window.H38OverdueNudge.start()
 *   Step 1: WHO OWES YOU — overdue list, "Send reminder" per invoice, "Remind all".
 *   Step 2: DONE — confirmation of who was queued and how.
 */
(function(){
'use strict';

/* ---- local state (reset on every start()) ---- */
var nudge={step:1,items:[],editingId:null,channel:{},message:{},queued:[],failed:[],remindedAll:false};

/* Business display name for message text. */
function bizName(){
  return (typeof state!=='undefined'&&state.snapshot&&state.snapshot.business)
    ? (String(v(state.snapshot.business,'Business Name','businessName','name')||'').trim()||'us')
    : 'us';
}

/* Find overdue invoices: positive balance, past due, not paid/voided/draft/deleted, not a test record. */
function overdueInvoices(){
  var todayStart=new Date(); todayStart.setHours(0,0,0,0);
  return records('invoices').filter(function(row){
    if(typeof isTestRecord==='function'&&isTestRecord(row)) return false;
    if(num(v(row,'Balance'))<=0) return false;
    var st=String(v(row,'Status')||'').toUpperCase();
    if(/^(PAID|VOIDED|DELETED|DRAFT)/.test(st)) return false;
    var due=v(row,'Due Date'); if(!due) return false;
    var d=new Date(due); if(isNaN(d)) return false;
    return d<todayStart;
  }).map(function(row){
    var d=new Date(v(row,'Due Date'));
    var days=Math.floor((Date.now()-d.getTime())/86400000);
    return {row:row,id:rowId(row,'Invoice ID','invoiceId'),daysLate:days};
  }).sort(function(a,b){return b.daysLate-a.daysLate;});
}

function customerFor(invoiceRow){
  var id=v(invoiceRow,'Customer ID');
  return (records('customers')||[]).find(function(c){return rowId(c,'Customer ID','customerId')===String(id);})||null;
}

/* Pre-written polite reminder. Kept short — multi-part SMS is unreliable. */
function defaultMessage(item){
  var c=customerFor(item.row);
  var name=c?String(v(c,'Customer Name','name')||''): 'there';
  var first=name.split(',')[0].split(' ')[0]||'there';
  return 'Hi '+first+', this is '+bizName()+'. Invoice '+v(item.row,'Invoice Number')+' ('+money(v(item.row,'Balance'))+') was due '+dateOnly(v(item.row,'Due Date'))+' — '+item.daysLate+' day'+(item.daysLate===1?'':'s')+' late. Can you settle up this week? Reply or call us. Thank you!';
}

function itemById(id){return nudge.items.find(function(i){return String(i.id)===String(id);})||null;}
function alreadyQueued(id){return nudge.queued.some(function(q){return String(q.id)===String(id);});}

/* ================= STEP 1: WHO OWES YOU ================= */
function renderStep1(){
  nudge.items=overdueInvoices();
  var html=pageHead('Overdue Invoices','Who owes you money. Tap "Send reminder" — nothing goes out until you approve it.');
  html+='<section class="card"><div class="list">';
  if(!nudge.items.length){
    html+='<p class="muted">🎉 Nobody is overdue. All invoices are paid up or not due yet.</p>';
  }else{
    html+=nudge.items.map(function(item){
      var c=customerFor(item.row), cname=c?String(v(c,'Customer Name','name')||'Customer'):'Customer';
      var queued=alreadyQueued(item.id);
      var editing=nudge.editingId===item.id;
      var inner='<div class="row-top"><strong>'+esc(cname)+'</strong><span>'+money(v(item.row,'Balance'))+'</span></div>'+
        '<small>Invoice '+esc(v(item.row,'Invoice Number')||item.id)+' · '+item.daysLate+' day'+(item.daysLate===1?'':'s')+' late (due '+esc(dateOnly(v(item.row,'Due Date')))+')</small>';
      if(queued){
        inner+='<div class="row-actions"><span class="pill good">Queued for approval ✓</span></div>';
      }else if(editing){
        var ch=nudge.channel[item.id]||'sms';
        var msg=nudge.message[item.id]!=null?nudge.message[item.id]:defaultMessage(item);
        inner+='<div class="nudge-edit">'+
          '<div class="h38-tier-toggle" role="group" aria-label="Reminder channel">'+
            '<button type="button" data-nudge-channel="sms" data-nudge-id="'+esc(item.id)+'" aria-pressed="'+(ch==='sms')+'">Text (SMS)</button>'+
            '<button type="button" data-nudge-channel="email" data-nudge-id="'+esc(item.id)+'" aria-pressed="'+(ch==='email')+'">Email</button>'+
          '</div>'+
          '<label>Reminder message (tap to edit)</label>'+
          '<textarea id="nudgeMsg-'+esc(item.id)+'" rows="3">'+esc(msg)+'</textarea>'+
          '<div class="row-actions">'+
            '<button type="button" class="secondary" id="nudgeKitBtn-'+esc(item.id)+'">🤖 Ask Hank to draft it</button>'+
            '<button type="button" data-nudge-queue="'+esc(item.id)+'">Queue '+(ch==='sms'?'text':'email')+' for approval →</button>'+
            '<button type="button" class="secondary" data-nudge-cancel="'+esc(item.id)+'">Cancel</button>'+
          '</div>'+
          '<p class="muted small">'+(ch==='sms'
            ?'The text is queued and needs your approval in 💬 Messages before anything is sent.'
            :'A draft is saved and needs you to tap Send in 💬 Messages. Nothing sends automatically.')+'</p>'+
        '</div>';
      }else{
        inner+='<div class="row-actions"><button type="button" data-nudge-edit="'+esc(item.id)+'">Send reminder</button></div>';
      }
      return '<div class="row">'+inner+'</div>';
    }).join('');
  }
  html+='</div>';
  var unqueued=nudge.items.filter(function(i){return !alreadyQueued(i.id);});
  if(unqueued.length>1){
    html+='<div class="actions"><button type="button" id="nudgeRemindAll">Remind all ('+unqueued.length+') →</button></div>';
  }
  html+='<div class="actions"><button type="button" class="secondary" id="nudgeStep1Back">← Back to Home</button></div>';
  html+='</section>';
  $('mainContent').innerHTML='<div class="h38-flow-view">'+html+'</div>';
  wireStep1();
}

function wireStep1(){
  $('mainContent').querySelectorAll('[data-nudge-edit]').forEach(function(b){
    b.onclick=function(){
      var id=b.getAttribute('data-nudge-edit');
      nudge.editingId=id;
      if(nudge.channel[id]==null) nudge.channel[id]='sms';
      if(nudge.message[id]==null) nudge.message[id]=defaultMessage(itemById(id));
      renderStep1();
      var ta=$('nudgeMsg-'+id); if(ta){ta.focus();}
    };
  });
  $('mainContent').querySelectorAll('[data-nudge-cancel]').forEach(function(b){
    b.onclick=function(){nudge.editingId=null;renderStep1();};
  });
  $('mainContent').querySelectorAll('[data-nudge-channel]').forEach(function(b){
    b.onclick=function(){
      var id=b.getAttribute('data-nudge-id');
      nudge.channel[id]=b.getAttribute('data-nudge-channel');
      var ta=$('nudgeMsg-'+id); if(ta)nudge.message[id]=ta.value;
      renderStep1();
      var ta2=$('nudgeMsg-'+id); if(ta2){ta2.focus();ta2.selectionStart=ta2.value.length;}
    };
  });
  $('mainContent').querySelectorAll('[data-nudge-queue]').forEach(function(b){
    b.onclick=function(){
      var id=b.getAttribute('data-nudge-queue');
      var ta=$('nudgeMsg-'+id); if(ta)nudge.message[id]=ta.value;
      queueOne(id).then(function(){nudge.editingId=null;renderStep1();});
    };
  });
  $('mainContent').querySelectorAll('[id^="nudgeKitBtn-"]').forEach(function(b){
    b.onclick=function(){askKit(b.getAttribute('id').replace('nudgeKitBtn-',''));};
  });
  var all=$('nudgeRemindAll');
  if(all) all.onclick=function(){remindAll();};
  $('nudgeStep1Back').onclick=function(){openPage('today');};
}

/* Optional AI assist: Kit drafts the reminder. Manual pre-written message always works. */
async function askKit(id){
  var ta=$('nudgeMsg-'+id); if(ta)nudge.message[id]=ta.value;
  var btn=$('nudgeKitBtn-'+id);
  if(!window.H38_AI_HANDOFF||typeof window.H38_AI_HANDOFF.runTask!=='function'){
    toast('Hank is not available right now — the pre-written message above works fine.',true); return;
  }
  var item=itemById(id), c=customerFor(item.row);
  if(btn){btn.disabled=true;btn.textContent='Hank is drafting…';}
  try{
    var result=await Promise.race([
      window.H38_AI_HANDOFF.runTask('message_draft',{
        kind:'invoice_reminder',
        customerName:c?String(v(c,'Customer Name','name')||''): '',
        invoiceNumber:String(v(item.row,'Invoice Number')||''),
        amountOwed:num(v(item.row,'Balance')),
        daysLate:item.daysLate,
        businessName:bizName(),
        currentDraft:nudge.message[id]||''
      },{onQueued:function(){toast('Hank is drafting a reminder…');}}),
      new Promise(function(_,reject){setTimeout(function(){reject(new Error('Hank took too long.'));},45000);})
    ]);
    var msg=(result&&(result.message||(result.draft&&result.draft.message)))||'';
    if(!String(msg).trim()) throw new Error('Hank returned no text.');
    nudge.message[id]=String(msg).slice(0,300);
    if(ta)ta.value=nudge.message[id];
    toast('Hank drafted a version — review it above before queuing.');
  }catch(err){
    toast('Hank could not draft one ('+(err&&err.message||'unavailable')+'). Use the pre-written message.',true);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='🤖 Ask Hank to draft it';}
  }
}

/* Queue one reminder. Returns a promise. Never sends directly. */
async function queueOne(id){
  var item=itemById(id); if(!item||alreadyQueued(id)) return;
  var c=customerFor(item.row);
  var cname=c?String(v(c,'Customer Name','name')||'Customer'):'Customer';
  var body=(nudge.message[id]!=null?nudge.message[id]:defaultMessage(item));
  if(!String(body).trim()){toast('Write a message first.',true);return;}
  var ch=nudge.channel[id]||'sms';
  try{
    if(ch==='email'){
      await queueEmailReminder(c,item,String(body).trim());
      nudge.queued.push({id:id,name:cname,how:'Email draft saved — send it from 💬 Messages'});
    }else{
      var phone=c?String(v(c,'Phone')||'').trim():'';
      if(!phone) throw new Error('No phone number on this customer. Switch to Email above.');
      if(!window.H38Sms||typeof window.H38Sms.sendSms!=='function') throw new Error('SMS module is still loading. Try again in a moment.');
      await window.H38Sms.sendSms({to:phone,body:String(body).trim().slice(0,320),purpose:'Invoice reminder',category:'follow_up'});
      nudge.queued.push({id:id,name:cname,how:'Text queued — approve it in 💬 Messages'});
    }
    toast('Reminder queued for '+cname+'. Nothing sent yet.');
  }catch(err){
    nudge.failed.push({id:id,name:cname,reason:err&&(err.message||String(err))||'Unknown error'});
    toast('Could not queue for '+cname+': '+(err&&(err.message||String(err))||'error'),true);
  }
}

/* Email draft via the same record shape as the Messages page (app-09.js bindEmailForm). */
async function queueEmailReminder(customer,item,body){
  var to=customer?String(v(customer,'Email')||'').trim():'';
  if(!to) throw new Error('No email address on this customer.');
  var threadId=newId('EMAIL-THREAD'), id=newId('EMAIL-MESSAGE');
  var thread={'Email Thread ID':threadId,'Business ID':state.businessId,'Provider':'Provider Neutral',
    'Subject':'Friendly reminder: invoice '+v(item.row,'Invoice Number')+' is past due','Status':'Draft','Last Message Time':now(),'Record Version':1};
  var message={'Email Message ID':id,'Business ID':state.businessId,'Email Thread ID':threadId,'Direction':'Outbound Draft',
    'To Addresses JSON':JSON.stringify([to]),'Subject':thread['Subject'],'Body Preview':body,'Status':'Draft — Not Sent','Created Time':now(),'Record Version':1};
  await queueOperation('SAVE_EMAIL_DRAFT','Email Message',id,{emailThreadId:threadId,subject:thread['Subject'],toAddress:to,body:body},{collection:'emailThreads',record:thread,idKeys:['Email Thread ID']});
  if(state.snapshot&&state.snapshot.emailMessages) state.snapshot.emailMessages.unshift(message);
}

/* "Remind all": one explicit confirmation, then queue each remaining reminder. */
async function remindAll(){
  var ids=nudge.items.filter(function(i){return !alreadyQueued(i.id);}).map(function(i){return i.id;});
  if(!ids.length) return;
  var ok=true;
  if(window.H38Flow&&typeof window.H38Flow.confirm==='function'){
    ok=await window.H38Flow.confirm({title:'Queue '+ids.length+' reminders?',
      message:'Each reminder is queued for your approval. Nothing is sent until you approve it in Messages.',
      okLabel:'Queue reminders',cancelLabel:'Cancel'});
  }else if(!confirm('Queue '+ids.length+' reminders? Nothing is sent until you approve each one.')) ok=false;
  if(!ok) return;
  for(var k=0;k<ids.length;k++){await queueOne(ids[k]);}
  nudge.remindedAll=true;
  renderStep2();
}

/* ================= STEP 2: DONE ================= */
function renderStep2(){
  nudge.step=2;
  var html=pageHead('Reminders Queued','Here is exactly what happened. Nothing was sent automatically.');
  html+='<section class="card">';
  if(nudge.queued.length){
    html+='<h2>✅ Reminders queued ('+nudge.queued.length+')</h2><div class="list">'+
      nudge.queued.map(function(q){
        return '<div class="row"><div class="row-top"><strong>'+esc(q.name)+'</strong><span class="pill pending">Approval needed</span></div><small>'+esc(q.how)+'</small></div>';
      }).join('')+'</div>';
  }
  if(nudge.failed.length){
    html+='<h2>⚠️ Could not queue ('+nudge.failed.length+')</h2><div class="list">'+
      nudge.failed.map(function(f){
        return '<div class="row"><div class="row-top"><strong>'+esc(f.name)+'</strong><span class="pill bad">Not queued</span></div><small>'+esc(f.reason)+'</small></div>';
      }).join('')+'</div>'+
      '<p class="muted small">Common fix: record texting consent on the customer\'s text thread first (💬 Messages → Customer texts), then run this again.</p>';
  }
  if(!nudge.queued.length&&!nudge.failed.length){
    html+='<p class="muted">Nothing was queued.</p>';
  }
  html+='<p class="muted small">Polite nudge, queued with care. If a balance is still unpaid in a week, come back and nudge again — or give them a call.</p>';
  html+='<div class="actions"><button type="button" id="nudgeDoneHome">Done → Home</button><button type="button" class="secondary" id="nudgeDoneMsgs">Review in 💬 Messages</button></div>';
  html+='</section>';
  $('mainContent').innerHTML='<div class="h38-flow-view">'+html+'</div>';
  $('nudgeDoneHome').onclick=function(){openPage('today');};
  $('nudgeDoneMsgs').onclick=function(){openPage('messages');};
}

function start(){
  nudge={step:1,items:[],editingId:null,channel:{},message:{},queued:[],failed:[],remindedAll:false};
  renderStep1();
  try{window.scrollTo(0,0);}catch(e){}
}

window.H38OverdueNudge={start:start};
})();
