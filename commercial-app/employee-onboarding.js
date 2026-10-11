/* H38 Employee Onboarding — "Add Team Member" guided flow (Owner Ease rebuild, Phase 3, design §3.7).
 *
 * Script tag to add (coordinator handles index.html):
 *   <script src="employee-onboarding.js"></script>
 *
 * Data collections used (read/write):
 *   users      — invite queued via SAVE_USER (same operation the Settings "Add business
 *                user" form uses; the server creates a business_memberships invite
 *                with status 'invited' and returns a users record)
 *   roles      — read to map the three plain-language access levels onto this
 *                business's role IDs (falls back to 'staff' / 'administrator')
 *   smsThreads — written by H38Sms.sendSms for the optional welcome text
 *                (queued for owner approval, never sent directly)
 *
 * The invite mechanism: the Office's real invite system is email-based — the new
 * member gets a secure activation link for their invited email (see
 * supabase-invite-activation.js). This flow collects the email because the
 * backend requires it, and optionally queues a welcome text to their phone.
 * Every outbound message goes through the owner approval queue; nothing sends
 * automatically.
 *
 * Entry point: window.H38EmployeeOnboarding.start()
 *   Step 1: BASIC INFO — name, email (invite destination), phone, job role.
 *   Step 2: ACCESS LEVEL — three plain-language options.
 *   Step 3: DONE — "Invite sent!" with what happens next.
 */
(function(){
'use strict';

var ob={step:1,name:'',email:'',phone:'',jobRole:'Crew',access:'field_office',sendText:false,sent:null};

var ACCESS_LEVELS=[
  {key:'field',title:'Field only',desc:'See their own jobs and clock in/out. Nothing else.',fallbackRole:'staff'},
  {key:'field_office',title:'Field + office',desc:'Jobs, schedule, customers and quotes. No money, no settings.',fallbackRole:'staff'},
  {key:'full',title:'Full access',desc:'Everything — including money, payroll and settings.',fallbackRole:'administrator'}
];

/* Map a plain-language access level to this business's Role ID. */
function roleIdFor(access){
  var level=ACCESS_LEVELS.find(function(l){return l.key===access;})||ACCESS_LEVELS[1];
  try{
    var roles=records('roles')||[];
    var needles=access==='field'?['field','crew','staff','worker','viewer']
      :access==='full'?['admin','administrator','owner']
      :['office','manager','staff','member'];
    for(var n=0;n<needles.length;n++){
      for(var i=0;i<roles.length;i++){
        var name=String(v(roles[i],'Role Name')||'').toLowerCase();
        if(name.indexOf(needles[n])>=0) return String(v(roles[i],'Role ID')||name);
      }
    }
  }catch(e){}
  return level.fallbackRole;
}

function stepHeader(step,of,title){
  return '<p class="muted small">Step '+step+' of '+of+'</p><h2>'+esc(title)+'</h2>';
}
function bizName(){
  return (typeof state!=='undefined'&&state.snapshot&&state.snapshot.business)
    ? (String(v(state.snapshot.business,'Business Name','businessName','name')||'').trim()||'your business')
    : 'your business';
}

/* ================= STEP 1: BASIC INFO ================= */
function renderStep1(){
  var html=pageHead('Add Team Member','Invite someone to your team. They set up their own account — you just send the invite.');
  html+='<section class="card">'+stepHeader(1,3,'Who are you adding?');
  html+='<label>Name</label><input id="obName" value="'+esc(ob.name)+'" placeholder="Kael Krueth" autocomplete="off">';
  html+='<label>Email <small class="muted">(the invite goes here)</small></label><input id="obEmail" type="email" value="'+esc(ob.email)+'" placeholder="kael@example.com" autocomplete="off">';
  html+='<label>Phone <small class="muted">(for the welcome text)</small></label><input id="obPhone" type="tel" value="'+esc(ob.phone)+'" placeholder="(218) 555-0100" autocomplete="off">';
  html+='<label>Job role</label><select id="obJobRole">'+['Crew','Foreman','Technician','Office','Manager','Other'].map(function(r){
    return '<option'+(ob.jobRole===r?' selected':'')+'>'+r+'</option>';}).join('')+'</select>';
  html+='<div class="actions"><button type="button" id="obToStep2">Continue →</button>'+
    '<button type="button" class="secondary" id="obBackHome">← Home</button></div></section>';
  $('mainContent').innerHTML=html;
  $('obName').oninput=function(e){ob.name=e.target.value;};
  $('obEmail').oninput=function(e){ob.email=e.target.value;};
  $('obPhone').oninput=function(e){ob.phone=e.target.value;};
  $('obJobRole').onchange=function(e){ob.jobRole=e.target.value;};
  $('obToStep2').onclick=function(){
    ob.name=$('obName').value.trim(); ob.email=$('obEmail').value.trim(); ob.phone=$('obPhone').value.trim();
    if(!ob.name){toast('Enter their name.',true);return;}
    if(!ob.email||ob.email.indexOf('@')<0){toast('Enter their email — that is where the invite goes.',true);return;}
    if(!ob.phone){toast('Enter their phone number — you may want to text them the invite.',true);return;}
    renderStep2();
  };
  $('obBackHome').onclick=function(){openPage('today');};
}

/* ================= STEP 2: ACCESS LEVEL ================= */
function renderStep2(){
  var html=pageHead('Add Team Member','What can '+esc(ob.name)+' do in the app?');
  html+='<section class="card">'+stepHeader(2,3,'What can they do in the app?');
  html+='<div class="list">'+ACCESS_LEVELS.map(function(l){
    return '<label class="row"><div class="row-top"><strong><input type="radio" name="obAccess" value="'+l.key+'"'+(ob.access===l.key?' checked':'')+' style="width:auto"> '+esc(l.title)+'</strong></div><small>'+esc(l.desc)+'</small></label>';
  }).join('')+'</div>';
  html+='<label class="row" style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="obSendText"'+(ob.sendText?' checked':'')+' style="width:auto;margin-top:4px"><span><strong>Also queue a welcome text to their phone.</strong><br><small class="muted">It still needs your approval in 💬 Messages before anything is sent.</small></span></label>';
  html+='<div class="actions"><button type="button" id="obSendInvite">Send Invite →</button>'+
    '<button type="button" class="secondary" id="obBack1">← Back</button></div></section>';
  $('mainContent').innerHTML=html;
  $('mainContent').querySelectorAll('input[name="obAccess"]').forEach(function(r){
    r.onchange=function(){ob.access=r.value;};
  });
  $('obSendText').onchange=function(e){ob.sendText=e.target.checked;};
  $('obBack1').onclick=function(){renderStep1();};
  $('obSendInvite').onclick=sendInvite;
}

/* Explicit confirmation, then queue the membership invite (and optional welcome text). */
async function sendInvite(){
  var level=ACCESS_LEVELS.find(function(l){return l.key===ob.access;})||ACCESS_LEVELS[1];
  var ok=true;
  if(window.H38Flow&&typeof window.H38Flow.confirm==='function'){
    ok=await window.H38Flow.confirm({title:'Send invite to '+ob.name+'?',
      message:ob.email+' will get an activation link. Access level: '+level.title+'.'+(ob.sendText?'\nA welcome text will also be queued for your approval.':''),
      okLabel:'Send invite',cancelLabel:'Cancel'});
  }else if(!confirm('Send invite to '+ob.name+' ('+ob.email+') with '+level.title+' access?')) ok=false;
  if(!ok) return;
  var sent={name:ob.name,email:ob.email,phone:ob.phone,level:level.title,textQueued:false,textError:''};
  try{
    /* Same SAVE_USER operation as Settings → "Add business user". */
    await queueOperation('SAVE_USER','User',newId('USER'),{email:ob.email,displayName:ob.name,roleId:roleIdFor(ob.access)});
  }catch(err){
    toast('Could not queue the invite: '+(err&&err.message||err),true);
    return;
  }
  if(ob.sendText){
    if(window.H38Sms&&typeof window.H38Sms.sendSms==='function'){
      try{
        await window.H38Sms.sendSms({to:ob.phone,
          body:'You have been invited to join '+bizName()+' on the H38 Office app. Check '+ob.email+' for your activation link.',
          purpose:'Employee invite',category:'general'});
        sent.textQueued=true;
      }catch(err){sent.textError=err&&(err.message||String(err))||'text not queued';}
    }else sent.textError='SMS module is not loaded.';
  }
  ob.sent=sent;
  ob.step=3;
  renderStep3();
}

/* ================= STEP 3: DONE ================= */
function renderStep3(){
  var s=ob.sent||{name:'',email:'',phone:'',level:''};
  var html=pageHead('Team Member Invited','Here is exactly what happened.');
  html+='<section class="card"><h2>✅ Invite sent!</h2>';
  html+='<p><strong>'+esc(s.name)+'</strong> was invited with <strong>'+esc(s.level)+'</strong> access.</p>';
  html+='<div class="list"><div class="row"><div class="row-top"><strong>📧 Activation email</strong><span class="pill good">Invite queued</span></div>'+
    '<small>Sent to '+esc(s.email)+'. They get a secure link to set up their own account — no password for you to manage. They will appear on your team list once they sign in.</small></div>';
  if(s.textQueued){
    html+='<div class="row"><div class="row-top"><strong>📱 Welcome text</strong><span class="pill pending">Approval needed</span></div>'+
      '<small>Queued — approve it in 💬 Messages before it goes out.</small></div>';
  }else if(ob.sendText&&s.textError){
    html+='<div class="row"><div class="row-top"><strong>📱 Welcome text</strong><span class="pill bad">Not queued</span></div>'+
      '<small>'+esc(s.textError)+'. You can text them yourself from 💬 Messages.</small></div>';
  }
  html+='</div>';
  html+='<div class="actions"><button type="button" id="obDoneHome">Done → Home</button>'+
    '<button type="button" class="secondary" id="obAddAnother">＋ Add another</button></div></section>';
  $('mainContent').innerHTML=html;
  $('obDoneHome').onclick=function(){openPage('today');};
  $('obAddAnother').onclick=function(){
    ob={step:1,name:'',email:'',phone:'',jobRole:'Crew',access:'field_office',sendText:false,sent:null};
    renderStep1();
  };
}

function start(){
  ob={step:1,name:'',email:'',phone:'',jobRole:'Crew',access:'field_office',sendText:false,sent:null};
  renderStep1();
  try{window.scrollTo(0,0);}catch(e){}
}

window.H38EmployeeOnboarding={start:start};
})();
