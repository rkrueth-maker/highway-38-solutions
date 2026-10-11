/* ---- H38 Send Task Flow — Phase 4: Tasks & Delegation (2026-10-11) ----
 *
 * SCRIPT TAGS (coordinator wires these into index.html, AFTER tasks-page.js):
 *   <script src="./tasks-page.js?build=20261011-tasks-1"></script>
 *   <script src="./send-task.js?build=20261011-tasks-1"></script>
 *
 * DATA COLLECTIONS USED:
 *   tasks        — creates the task record (same fields as tasks-page.js)
 *   users        — team member recipients (Assigned User ID, app notification)
 *   customers    — contact recipients (name, phone, email)
 *   smsThreads   — queued texts (via window.H38Sms.sendSms; status
 *                  'Queued — Owner Approval Required', approved in Messages)
 *   emailThreads / emailMessages — email draft (owner reviews/sends in Messages)
 *   notifications — in-app notification row for team members
 *
 * DELIVERY GUARANTEES:
 *   - SMS is NEVER auto-sent. Step 2's [Send Task] is the owner's explicit
 *     confirmation; the text then still goes through the existing Messages
 *     approval queue (Approve & Send in Messages). Nudges work the same way.
 *   - Every "Mark Done" link carries a unique per-task Completion Token.
 *     The token is validated by the h38-task-complete edge function (no login).
 *
 * EXPOSED:
 *   window.H38SendTask.start()                      — guided 3-step flow
 *   window.H38SendTask.startWithRecipient(name,phone) — pre-filled (e.g. Customer page)
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
function Htoast(msg,bad){ var f=g('toast'); if(f) f(msg,bad); }
function Hnow(){ var f=g('now'); return f?f():new Date().toISOString(); }
function HnewId(p){ var f=g('newId'); if(f) return f(p); return (p||'ID')+'-'+Math.random().toString(36).slice(2,10).toUpperCase(); }
function Hqueue(op,label,id,args,opts){ var f=g('queueOperation'); if(!f) throw new Error('The Office save queue is not ready.'); return f(op,label,id,args,opts); }
function HbizId(){ try{ return (typeof state!=='undefined'&&state.businessId)||''; }catch(e){ return ''; } }
function Hrecords(name){ var f=g('records'); try{ return (f?f(name):[])||[]; }catch(e){ return []; } }
function Hconfirm(o){ try{ if(window.H38Flow&&window.H38Flow.confirm) return window.H38Flow.confirm(o); }catch(e){} return Promise.resolve(window.confirm(o.title+'\n\n'+o.message)); }
function senderName(){ try{ var s=state.snapshot||{}; return text((s.user&&(s.user.displayName||s.user.email))||(s.business&&s.business.ownerName))||'Your office'; }catch(e){ return 'Your office'; } }
function bizName(){ try{ var s=state.snapshot||{}; return text(s.business&&s.business.businessName)||'Highway 38 Solutions'; }catch(e){ return 'Highway 38 Solutions'; } }
function completeUrl(token){
  var page=(window.H38TasksPage&&window.H38TasksPage.completeUrl)
    ?window.H38TasksPage.completeUrl(token)
    :(function(){ try{ return new URL('task-complete.html',location.href).href+'?token='+encodeURIComponent(token); }catch(e){ return 'task-complete.html?token='+encodeURIComponent(token); } })();
  return page;
}

var TEMPLATES=[
  {id:'signin', label:'Sign into service', text:'Sign into [service name]', linkHint:'Paste the sign-in page link below'},
  {id:'photos', label:'Send photos', text:'Send photos of [what]', linkHint:''},
  {id:'approve', label:'Approve document', text:'Review and approve: [document]', linkHint:'Paste the document link below'},
  {id:'call', label:'Call me', text:'Give me a call when you can', linkHint:''},
  {id:'confirm', label:'Confirm appointment', text:'Confirm [date/time] works for you', linkHint:''},
  {id:'hours', label:'Submit hours', text:'Submit your hours for [this week]', linkHint:''},
  {id:'custom', label:'Custom', text:'', linkHint:''}
];

/* ---- flow state ---- */
var S=null;
function freshState(){ return {step:1,title:'',template:'custom',recipient:null,due:'',priority:'Normal',link:'',method:'sms',newName:'',newPhone:'',sentResult:null}; }

/* ---- recipients ---- */
function teamMembers(){
  var rows=Hrecords('users');
  var out=[];
  for(var i=0;i<rows.length;i++){
    var r=rows[i];
    if(/^(ARCHIVED|INACTIVE)$/i.test(text(Hv(r,'Status')))) continue;
    var id=HrowId(r,'User ID','userId');
    var name=text(Hv(r,'Display Name','displayName','Email'))||id||'Team member';
    out.push({kind:'user',id:id,name:name,phone:text(Hv(r,'Phone','phone')),email:text(Hv(r,'Email','email'))});
  }
  return out;
}
function contacts(){
  var rows=Hrecords('customers');
  var out=[];
  for(var i=0;i<rows.length;i++){
    var r=rows[i];
    if(/^(ARCHIVED|INACTIVE)$/i.test(text(Hv(r,'Status')))) continue;
    var phone=text(Hv(r,'Phone','phone')),email=text(Hv(r,'Email','email'));
    if(!phone&&!email) continue;
    out.push({kind:'contact',id:HrowId(r,'Customer ID','customerId'),name:text(Hv(r,'Customer Name','name'))||'Contact',phone:phone,email:email});
  }
  return out.slice(0,60);
}
function methodsFor(rec){
  if(!rec) return [];
  var m=[];
  if(rec.kind==='user') m.push({id:'app',label:'App notification',hint:'They see it in Tasks'});
  if(rec.phone) m.push({id:'sms',label:'Text message',hint:'They tap a link to mark done'});
  if(rec.email) m.push({id:'email',label:'Email',hint:'Drafted in Messages for your review'});
  return m;
}

/* ---- overlay shell ---- */
function close(){
  var el=document.getElementById('h38SendTaskOverlay');
  if(el&&el.parentNode) el.parentNode.removeChild(el);
  S=null;
}
function open(){
  close();
  var el=document.createElement('div');
  el.id='h38SendTaskOverlay';
  el.innerHTML='<style>'
    +'#h38SendTaskOverlay{position:fixed;inset:0;z-index:9999;background:#f0f4f8;overflow-y:auto;-webkit-overflow-scrolling:touch}'
    +'#h38SendTaskOverlay .st-wrap{max-width:520px;margin:0 auto;padding:16px 16px 48px}'
    +'#h38SendTaskOverlay .st-top{display:flex;align-items:center;gap:10px;margin-bottom:14px}'
    +'#h38SendTaskOverlay .st-back{background:none;border:0;color:#0b6aa2;font-size:15px;font-weight:700;cursor:pointer;padding:8px 4px}'
    +'#h38SendTaskOverlay .st-steps{font-size:13px;color:#687e8d;font-weight:700}'
    +'#h38SendTaskOverlay .card{background:#fff;border-radius:16px;padding:18px;box-shadow:0 4px 20px rgba(0,0,0,.08);margin-bottom:14px}'
    +'#h38SendTaskOverlay h2{font-size:19px;margin-bottom:4px;color:#0b2438}'
    +'#h38SendTaskOverlay .sub{font-size:14px;color:#687e8d;margin-bottom:14px}'
    +'#h38SendTaskOverlay label.flabel{display:block;font-weight:650;font-size:14px;margin:14px 0 6px;color:#3d5261}'
    +'#h38SendTaskOverlay textarea,#h38SendTaskOverlay input[type=text],#h38SendTaskOverlay input[type=tel],#h38SendTaskOverlay input[type=date],#h38SendTaskOverlay input[type=url]{width:100%;padding:12px;border:1.5px solid #cbd7df;border-radius:10px;font:inherit;font-size:15px;background:#fff}'
    +'#h38SendTaskOverlay textarea{min-height:84px;resize:vertical}'
    +'#h38SendTaskOverlay .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}'
    +'#h38SendTaskOverlay .chip{border:1.5px solid #cbd7df;background:#f4f8fb;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:700;color:#0b2438;cursor:pointer}'
    +'#h38SendTaskOverlay .chip.on{background:#0b6aa2;border-color:#0b6aa2;color:#fff}'
    +'#h38SendTaskOverlay .rec{border:1.5px solid #e1e9ef;border-radius:12px;padding:12px;margin-bottom:8px;cursor:pointer;display:flex;gap:10px;align-items:center;background:#fff}'
    +'#h38SendTaskOverlay .rec.on{border-color:#0b6aa2;background:#f2f8fc}'
    +'#h38SendTaskOverlay .rec .avatar{width:38px;height:38px;border-radius:50%;background:#dbe6ee;color:#0b2438;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:15px;flex:none}'
    +'#h38SendTaskOverlay .rec .who{flex:1;min-width:0}'
    +'#h38SendTaskOverlay .rec .who b{display:block;font-size:15px;color:#0b2438}'
    +'#h38SendTaskOverlay .rec .who small{color:#687e8d;font-size:12px}'
    +'#h38SendTaskOverlay .radio{display:flex;gap:10px;align-items:flex-start;border:1.5px solid #e1e9ef;border-radius:12px;padding:12px;margin-bottom:8px;cursor:pointer;background:#fff}'
    +'#h38SendTaskOverlay .radio.on{border-color:#0b6aa2;background:#f2f8fc}'
    +'#h38SendTaskOverlay .radio input{margin-top:3px}'
    +'#h38SendTaskOverlay .btn{display:block;width:100%;padding:14px;background:#0b6aa2;color:#fff;border:0;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer;margin-top:14px}'
    +'#h38SendTaskOverlay .btn.ghost{background:#e8eef3;color:#0b2438}'
    +'#h38SendTaskOverlay .ok{background:#e8f7ee;border:1px solid #b6dec4;color:#126132;padding:18px;border-radius:14px;text-align:center}'
    +'#h38SendTaskOverlay .ok h2{color:#126132;margin-bottom:8px}'
    +'#h38SendTaskOverlay .note{font-size:13px;color:#687e8d;margin-top:10px}'
    +'#h38SendTaskOverlay .summary{background:#f4f8fb;border-radius:12px;padding:12px;font-size:14px;color:#0b2438;margin-bottom:4px}'
    +'</style>'
    +'<div class="st-wrap" id="h38SendTaskBody"></div>';
  document.body.appendChild(el);
  return el;
}
function body(){ return document.getElementById('h38SendTaskBody'); }

/* ---- step 1: what + who ---- */
function renderStep1(){
  var b=body(); if(!b) return;
  var team=teamMembers(),cts=contacts();
  var sel=S.recipient;
  function recRow(r){
    var key=r.kind+':'+r.id;
    var on=sel&&sel.kind===r.kind&&String(sel.id)===String(r.id);
    var initial=(r.name||'?').trim().charAt(0).toUpperCase()||'?';
    var sub=r.kind==='user'?'Team member':(r.phone||r.email||'Contact');
    return '<div class="rec'+(on?' on':'')+'" data-rec="'+Hesc(key)+'">'
      +'<div class="avatar">'+Hesc(initial)+'</div>'
      +'<div class="who"><b>'+Hesc(r.name)+'</b><small>'+Hesc(sub)+'</small></div></div>';
  }
  b.innerHTML='<div class="st-top"><button type="button" class="st-back" id="stCancel">✕ Cancel</button>'
    +'<div class="st-steps">Step 1 of 3</div></div>'
    +'<div class="card"><h2>Send a Task</h2><p class="sub">Say what needs doing, then pick who does it.</p>'
    +'<label class="flabel">Quick templates</label><div class="chips">'
    +TEMPLATES.map(function(t){return '<button type="button" class="chip'+(S.template===t.id?' on':'')+'" data-tpl="'+t.id+'">'+Hesc(t.label)+'</button>';}).join('')
    +'</div>'
    +'<label class="flabel" for="stTitle">What needs doing?</label>'
    +'<textarea id="stTitle" maxlength="500" placeholder="e.g. Sign into Bouncie">'+Hesc(S.title)+'</textarea>'
    +'<label class="flabel">Send to</label>'
    +'<div id="stTeam">'+(team.length?team.map(recRow).join(''):'<p class="note">No team members found.</p>')+'</div>'
    +(cts.length?'<label class="flabel">Contacts</label><div id="stContacts">'+cts.map(recRow).join('')+'</div>':'')
    +'<label class="flabel">Someone new (by text)</label>'
    +'<div class="rec'+(sel&&sel.kind==='new'?' on':'')+'" data-rec="new:">'
    +'<div class="avatar">+</div><div class="who"><b>Someone new</b><small>Enter a name and phone number</small></div></div>'
    +'<div id="stNewFields" style="'+(sel&&sel.kind==='new'?'':'display:none')+'">'
    +'<input type="text" id="stNewName" maxlength="80" placeholder="Their name" value="'+Hesc(S.newName)+'" style="margin-bottom:8px">'
    +'<input type="tel" id="stNewPhone" maxlength="30" placeholder="Phone number" value="'+Hesc(S.newPhone)+'">'
    +'</div>'
    +'<button type="button" class="btn" id="stNext">Continue →</button></div>';
  document.getElementById('stCancel').addEventListener('click',close);
  b.querySelectorAll('[data-tpl]').forEach(function(ch){
    ch.addEventListener('click',function(){
      var t=TEMPLATES.filter(function(x){return x.id===ch.getAttribute('data-tpl');})[0];
      if(!t) return;
      S.template=t.id;
      if(t.text&&!S.title) document.getElementById('stTitle').value=t.text;
      b.querySelectorAll('[data-tpl]').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-tpl')===t.id);});
    });
  });
  function pickRecipient(key){
    if(key==='new:'){ S.recipient={kind:'new',id:'',name:'',phone:'',email:''}; }
    else{
      var parts=key.split(':'),kind=parts[0],id=parts.slice(1).join(':');
      var pool=kind==='user'?team:cts;
      var found=null;
      for(var i=0;i<pool.length;i++){ if(String(pool[i].id)===String(id)){ found=pool[i]; break; } }
      if(found) S.recipient=found;
    }
    var ms=methodsFor(S.recipient).map(function(m){return m.id;});
    if(ms.indexOf(S.method)<0) S.method=ms[0]||'sms';
    renderStep1();
  }
  b.querySelectorAll('[data-rec]').forEach(function(el){
    el.addEventListener('click',function(){ pickRecipient(el.getAttribute('data-rec')); });
  });
  var nn=document.getElementById('stNewName'),np=document.getElementById('stNewPhone');
  if(nn) nn.addEventListener('input',function(){ S.newName=nn.value; if(S.recipient&&S.recipient.kind==='new') S.recipient.name=nn.value; });
  if(np) np.addEventListener('input',function(){ S.newPhone=np.value; if(S.recipient&&S.recipient.kind==='new') S.recipient.phone=np.value; });
  document.getElementById('stNext').addEventListener('click',function(){
    S.title=text(document.getElementById('stTitle').value);
    if(!S.title){ Htoast('Tell them what needs doing first.',true); document.getElementById('stTitle').focus(); return; }
    var rec=S.recipient;
    if(!rec){ Htoast('Pick who this task goes to.',true); return; }
    if(rec.kind==='new'){
      rec.name=text(S.newName)||text(document.getElementById('stNewName').value);
      rec.phone=text(S.newPhone)||text(document.getElementById('stNewPhone').value);
      if(!rec.name){ Htoast('Add their name.',true); return; }
      if(!rec.phone){ Htoast('Add their phone number so we can text them.',true); return; }
    }
    var ms=methodsFor(rec).map(function(m){return m.id;});
    if(!ms.length){ Htoast('There is no way to reach '+rec.name+' — add a phone or email.',true); return; }
    if(ms.indexOf(S.method)<0) S.method=ms[0];
    S.step=2; renderStep2();
  });
}

/* ---- step 2: details ---- */
function renderStep2(){
  var b=body(); if(!b) return;
  var rec=S.recipient;
  var methods=methodsFor(rec);
  b.innerHTML='<div class="st-top"><button type="button" class="st-back" id="stBack">← Back</button>'
    +'<div class="st-steps">Step 2 of 3</div></div>'
    +'<div class="card"><h2>Details</h2><p class="sub">Everything here is optional.</p>'
    +'<div class="summary">“'+Hesc(S.title)+'”<br>→ '+Hesc(rec.name)+'</div>'
    +'<label class="flabel" for="stDue">Due (optional)</label>'
    +'<input type="date" id="stDue" value="'+Hesc(S.due)+'">'
    +'<label class="flabel">Priority</label>'
    +'<div class="radio'+(S.priority==='Normal'?' on':'')+'" data-prio="Normal"><input type="radio" name="stPrio" '+(S.priority==='Normal'?'checked':'')+'><div><b>Normal</b></div></div>'
    +'<div class="radio'+(S.priority==='Urgent'?' on':'')+'" data-prio="Urgent"><input type="radio" name="stPrio" '+(S.priority==='Urgent'?'checked':'')+'><div><b>Urgent</b><br><small style="color:#687e8d">Shows red on the Tasks page</small></div></div>'
    +'<label class="flabel" for="stLink">Helpful link (optional)</label>'
    +'<input type="url" id="stLink" maxlength="500" placeholder="https://…" value="'+Hesc(S.link)+'">'
    +'<label class="flabel">How should '+Hesc(rec.name.split(' ')[0])+' get this?</label>'
    +methods.map(function(m){
      return '<div class="radio'+(S.method===m.id?' on':'')+'" data-method="'+m.id+'"><input type="radio" name="stMethod" '+(S.method===m.id?'checked':'')+'><div><b>'+Hesc(m.label)+'</b><br><small style="color:#687e8d">'+Hesc(m.hint)+'</small></div></div>';
    }).join('')
    +'<p class="note">Texts and emails are queued for your approval in Messages first — nothing goes out on its own.</p>'
    +'<button type="button" class="btn" id="stSend">Send Task</button></div>';
  document.getElementById('stBack').addEventListener('click',function(){ S.step=1; renderStep1(); });
  b.querySelectorAll('[data-prio]').forEach(function(el){
    el.addEventListener('click',function(){
      S.priority=el.getAttribute('data-prio');
      b.querySelectorAll('[data-prio]').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-prio')===S.priority);});
    });
  });
  b.querySelectorAll('[data-method]').forEach(function(el){
    el.addEventListener('click',function(){
      S.method=el.getAttribute('data-method');
      b.querySelectorAll('[data-method]').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-method')===S.method);});
    });
  });
  document.getElementById('stSend').addEventListener('click',function(){
    S.due=document.getElementById('stDue').value;
    S.link=text(document.getElementById('stLink').value);
    void doSend();
  });
}

/* ---- send ---- */
async function doSend(){
  var rec=S.recipient;
  var methodLabel={sms:'text message',email:'email',app:'app notification'}[S.method]||S.method;
  var ok=await Hconfirm({
    title:'Send this task?',
    message:'"'+S.title+'" → '+rec.name+' via '+methodLabel+'.'+(S.method==='sms'?' The text is queued for your approval in Messages first.':''),
    okLabel:'Send Task',cancelLabel:'Not yet'
  });
  if(!ok) return;
  var b=body();
  b.innerHTML='<div class="st-wrap"><div class="card"><h2>Sending…</h2><p class="sub">Saving the task and queueing the '+Hesc(methodLabel)+'.</p></div></div>';

  try{
    var taskId=HnewId('TASK');
    var token=HnewId('TOKEN');
    var stamp=Hnow();
    var sentBy=senderName(),bname=bizName();
    var record={
      'Task ID':taskId,'Business ID':HbizId(),'Job ID':'',
      'Task Title':S.title,'Assigned User ID':rec.kind==='user'?rec.id:'',
      'Assigned Contact Name':rec.kind==='user'?'':rec.name,
      'Assigned Phone':rec.phone||'','Assigned Email':rec.email||'',
      'Delivery Method':S.method,'Completion Token':token,
      'Link URL':S.link,'Priority':S.priority,'Template':S.template,
      'Status':'Open','Sent At':stamp,'Sent By Name':sentBy,'Business Name':bname,
      'Viewed At':'','Completed At':'','Nudge Count':0,
      'Due Time':S.due?new Date(S.due+'T23:59:00').toISOString():'',
      'Created Time':stamp,'Updated Time':stamp,'Record Version':1
    };
    await Hqueue('SAVE_TASK','Task',taskId,{taskId:taskId},{collection:'tasks',record:record,idKeys:['Task ID']});
    try{
      var snap=(typeof state!=='undefined'&&state.snapshot)||null;
      if(snap&&Array.isArray(snap.tasks)) snap.tasks.unshift(Object.assign({},record));
    }catch(e){}

    var note='';
    if(S.method==='sms'){
      var link=completeUrl(token);
      var smsBody=sentBy+' ('+bname+') sent you a task: '+S.title+'. Tap to view: '+link;
      var sendSms=(window.H38Sms&&window.H38Sms.sendSms)||null;
      if(!sendSms) throw new Error('Texting is not set up yet. Ask Kit to connect it, then send again.');
      await sendSms({to:rec.phone,body:smsBody,purpose:'Task: '+S.title,category:'Task'});
      note='Your text to '+rec.name+' is queued in Messages — approve it there and the task goes out.';
    }else if(S.method==='email'){
      await queueEmailDraft(rec,record,token,sentBy,bname);
      note='An email draft is waiting in Messages — review and send it when ready.';
    }else{
      await queueAppNotification(rec,record);
      note=rec.name+' will see it in Tasks with a notification badge.';
    }
    S.sentResult={to:rec.name,method:methodLabel,note:note,title:S.title};
    S.step=3; renderStep3();
  }catch(err){
    Htoast(err&&err.message?err.message:String(err),true);
    S.step=2; renderStep2();
  }
}

/* Email: reuse the app-09 draft shape — owner reviews & sends from Messages. */
async function queueEmailDraft(rec,record,token,sentBy,bname){
  var threadId=HnewId('EMAIL-THREAD'),msgId=HnewId('EMAIL-MESSAGE');
  var link=completeUrl(token);
  var subject='Task from '+sentBy+': '+record['Task Title'];
  var body='Hi '+rec.name+',\n\n'+sentBy+' ('+bname+') sent you a task:\n\n'+record['Task Title']
    +(record['Link URL']?'\n\nHelpful link: '+record['Link URL']:'')
    +'\n\nTap here when it is done: '+link
    +'\n\nThanks!';
  var thread={'Email Thread ID':threadId,'Business ID':HbizId(),'Provider':'Provider Neutral',
    'Subject':subject,'To Addresses JSON':JSON.stringify([rec.email]),
    'Status':'Draft','Last Message Time':Hnow(),'Record Version':1};
  var message={'Email Message ID':msgId,'Business ID':HbizId(),'Email Thread ID':threadId,
    'Direction':'Outbound Draft','To Addresses JSON':JSON.stringify([rec.email]),
    'Subject':subject,'Body Preview':body,'Status':'Draft — Not Sent',
    'Created Time':Hnow(),'Record Version':1};
  await Hqueue('SAVE_EMAIL_DRAFT','Email Message',msgId,{emailThreadId:threadId},
    {collection:'emailThreads',record:thread,idKeys:['Email Thread ID']});
  await Hqueue('SAVE_EMAIL_MESSAGE','Email Message',msgId,{emailThreadId:threadId},
    {collection:'emailMessages',record:message,idKeys:['Email Message ID']});
  try{
    var snap=(typeof state!=='undefined'&&state.snapshot)||null;
    if(snap&&Array.isArray(snap.emailMessages)) snap.emailMessages.unshift(message);
  }catch(e){}
}

/* App: notify a team member in-app via the notifications collection. */
async function queueAppNotification(rec,record){
  var nid=HnewId('NOTIF');
  var note={'Notification ID':nid,'Business ID':HbizId(),'User ID':rec.id,
    'Title':'New task: '+record['Task Title'],
    'Body':record['Sent By Name']+' sent you a task'+(record['Priority']==='Urgent'?' (URGENT)':'')+'. Open Tasks to mark it done.',
    'Link':'tasks','Status':'Unread','Created Time':Hnow(),'Record Version':1};
  await Hqueue('SAVE_NOTIFICATION','Notification',nid,{notificationId:nid},
    {collection:'notifications',record:note,idKeys:['Notification ID']});
}

/* ---- step 3: done ---- */
function renderStep3(){
  var b=body(); if(!b) return;
  var r=S.sentResult||{to:'',method:'',note:'',title:''};
  b.innerHTML='<div class="st-top"><div class="st-steps">Step 3 of 3</div></div>'
    +'<div class="ok"><h2>✅ Task sent to '+Hesc(r.to)+'</h2>'
    +'<p style="margin-top:8px">“'+Hesc(r.title)+'”<br>Sent via '+Hesc(r.method)+'.</p>'
    +'<p class="note">'+Hesc(r.note)+'</p>'
    +'<p class="note">We\'ll let you know when it\'s done.</p></div>'
    +'<button type="button" class="btn" id="stDoneTasks">View Tasks</button>'
    +'<button type="button" class="btn ghost" id="stDoneClose">Done</button>';
  document.getElementById('stDoneTasks').addEventListener('click',function(){
    close();
    try{ if(window.H38TasksPage&&window.H38TasksPage.render) window.H38TasksPage.render(); }catch(e){}
  });
  document.getElementById('stDoneClose').addEventListener('click',close);
}

/* ---- public API ---- */
function start(){
  S=freshState();
  open();
  renderStep1();
}
function startWithRecipient(name,phone){
  S=freshState();
  S.newName=text(name); S.newPhone=text(phone);
  S.recipient={kind:'new',id:'',name:text(name),phone:text(phone),email:''};
  var ms=methodsFor(S.recipient).map(function(m){return m.id;});
  S.method=ms[0]||'sms';
  open();
  renderStep1();
}

window.H38SendTask={
  start:start,
  startWithRecipient:startWithRecipient,
  close:close,
  BUILD:BUILD
};
})();
