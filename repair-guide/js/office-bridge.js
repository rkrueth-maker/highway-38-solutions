(function(){
'use strict';
// H38 Repair Guide <-> Office bridge (optional integration seam).
// FULLY DORMANT unless the URL carries ?office_business=<uuid>.
// Even then, Office features only activate after a server-side check that
// the business enabled the integration (business_module_settings,
// module_key 'repair_guide'). The URL parameter alone never enables anything,
// and a signed-in user who is not a member of that business gets no row
// back (RLS), so the bridge stays off.
var params=new URLSearchParams(location.search);
var OFFICE_BUSINESS=(params.get('office_business')||'').trim();
if(!OFFICE_BUSINESS) return; // standalone mode: zero behavior change for Kael's testing
var OFFICE_JOB=(params.get('job')||'').trim();

var SUPABASE_URL='https://jqukmwtsgcsaruucnqja.supabase.co';
var SUPABASE_KEY='sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1';
var SESSION_KEY='h38-repair-guide-session';
var LINK_KEY='h38-rg-office-links-'+OFFICE_BUSINESS;
var BUILD='20261004-repair-guide-1';

var active=false;
var verifiedToken=null;
var uid=null;

function $(id){return document.getElementById(id);}
function esc(s){var d=document.createElement('div');d.textContent=String(s==null?'':s);return d.innerHTML;}
function newId(prefix){
  try{if(window.crypto&&crypto.randomUUID)return prefix+'-'+crypto.randomUUID().toUpperCase();}catch(e){}
  return prefix+'-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,10).toUpperCase();
}
function nowIso(){return new Date().toISOString();}
function officeBase(){
  try{if(location.hostname&&/highway38solutions\.com$/.test(location.hostname))return location.origin;}catch(e){}
  return 'https://highway38solutions.com';
}
function officeUrl(shortcut){return officeBase()+'/commercial-app/?shortcut='+encodeURIComponent(shortcut||'work');}

// ---- minimal auth (self-contained; mirrors app.js) ----
function getSession(){
  try{
    var raw=localStorage.getItem(SESSION_KEY);
    if(!raw)return null;
    var s=JSON.parse(raw);
    if(!s.access_token||!s.expires_at)return null;
    if(Date.now()>s.expires_at*1000-60000)return null;
    return s;
  }catch(e){return null;}
}
function tokenUid(token){try{return JSON.parse(atob(token.split('.')[1])).sub||null;}catch(e){return null;}}
async function getAccessToken(){
  var s=getSession();
  if(!s)return null;
  uid=tokenUid(s.access_token);
  return s.access_token;
}
async function api(path,options){
  var token=await getAccessToken();
  if(!token)throw new Error('Please sign in to the Repair Guide first, then retry.');
  var opts=options||{};
  var res=await fetch(SUPABASE_URL+'/rest/v1/'+path,{
    method:opts.method||'GET',
    body:opts.body,
    headers:Object.assign({'apikey':SUPABASE_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json','Prefer':'return=representation'},opts.headers||{})
  });
  if(!res.ok){
    var t=await res.text();
    throw new Error('Office request failed ('+res.status+'): '+t.substring(0,180));
  }
  return res.json();
}

// ---- server-authoritative verification ----
async function verify(){
  var token=await getAccessToken();
  if(token&&token===verifiedToken)return active;
  verifiedToken=token;
  active=false;
  if(!token)return false;
  try{
    var rows=await api('business_module_settings?business_id=eq.'+encodeURIComponent(OFFICE_BUSINESS)+'&module_key=eq.repair_guide&select=enabled');
    active=!!(rows&&rows[0]&&rows[0].enabled===true);
  }catch(e){active=false;}
  if(active)onActivate();
  return active;
}

// ---- small modal helper (3-option choice / customer picker) ----
function modal(html){
  return new Promise(function(resolve){
    var ov=document.createElement('div');
    ov.setAttribute('data-h38-bridge-modal','1');
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-end;justify-content:center;padding:16px;';
    ov.innerHTML='<div style="background:#10231a;border:1px solid #2e7d32;border-radius:14px;max-width:520px;width:100%;max-height:80vh;overflow:auto;padding:18px;color:#e8f5e9;">'+html+'</div>';
    var done=function(val){try{document.body.removeChild(ov);}catch(e){}resolve(val);};
    ov.addEventListener('click',function(e){if(e.target===ov)done(null);});
    ov.querySelectorAll('[data-mv]').forEach(function(b){b.addEventListener('click',function(){done(b.getAttribute('data-mv'));});});
    document.body.appendChild(ov);
    var first=ov.querySelector('input');
    if(first)setTimeout(function(){try{first.focus();}catch(e){}},50);
  });
}

// ---- payload builders (pure; exposed for tests) ----
function diagOf(result){var r=result||{};return r.diagnosis||r;}
function buildJobPayload(stash,customer,uidOverride){
  var d=diagOf(stash&&stash.result),input=(stash&&stash.input)||{};
  var issues=((d.likelyIssues||[]).map(function(x){return x&&x.issue;}).filter(Boolean));
  var topIssue=issues[0]||'';
  var id=newId('JOB');
  var now=nowIso();
  var who=uidOverride||uid;
  return {
    business_id:OFFICE_BUSINESS,collection:'jobs',record_key:id,
    record_status:'active',created_by:who,updated_by:who,
    payload:{
      'Job ID':id,
      'Business ID':OFFICE_BUSINESS,
      'Customer ID':customer?customer.id:'',
      'Job Number':'RG-'+Date.now().toString(36).toUpperCase(),
      'Project Title':'Repair diagnosis'+(topIssue?': '+topIssue:''),
      'Status':'Lead',
      'Source':'Repair Guide',
      'Details':['Vehicle/unit: '+(input.unitInfo||'—'),'Symptoms: '+(input.symptoms||'—'),'',
        'Likely issues:',issues.map(function(x,i){return (i+1)+'. '+x;}).join('\n')||'—','',
        'Check plan:',(d.checkPlan||[]).join('\n')||'—','',
        'Fix plan:',(d.fixPlan||[]).join('\n')||'—','',
        'Estimate: '+(d.totalEstimate||d.timeEstimate||'TBD')].join('\n'),
      'Repair Guide Diagnosis':{
        category:input.category||'',symptoms:input.symptoms||'',unitInfo:input.unitInfo||'',
        topIssue:topIssue,issues:issues,checkPlan:d.checkPlan||[],fixPlan:d.fixPlan||[],
        timeEstimate:d.timeEstimate||'',totalEstimate:d.totalEstimate||'',
        partsEstimate:d.partsEstimate||[],sentAt:now
      },
      'Owner Review Required':true,
      'Created Time':now,'Updated Time':now,'Record Version':1
    }
  };
}
function buildQuotePayload(stash,customer,jobPayload,uidOverride){
  var d=diagOf(stash&&stash.result);
  var parts=d.partsEstimate||[];
  if(!parts.length)return null;
  var id=newId('QUOTE');
  var now=nowIso();
  var who=uidOverride||uid;
  var lines=parts.map(function(p,i){
    return {
      'Line ID':id+'-L'+(i+1),
      description:(p.part||'Part')+' — Guide estimate '+(p.estimatedCost||'TBD'),
      quantity:1,unit:'each',unitPrice:0,extended:0,
      priceSource:'Repair Guide estimate (unconfirmed)',
      priceStatus:'Owner review required',
      notes:'Price is unconfirmed estimate text from the Repair Guide. Owner must confirm pricing before sending to the customer.'
    };
  });
  return {
    business_id:OFFICE_BUSINESS,collection:'quotes',record_key:id,
    record_status:'active',created_by:who,updated_by:who,
    payload:{
      'Quote ID':id,
      'Business ID':OFFICE_BUSINESS,
      'Customer ID':customer?customer.id:'',
      'Quote Number':'RG-'+Date.now().toString(36).toUpperCase(),
      'Project Title':jobPayload.payload['Project Title'],
      'Scope':'Parts estimate from a Repair Guide diagnosis. All prices are unconfirmed — owner review required before this quote goes anywhere.',
      'Status':'Draft',
      'Revision':1,
      'Source':'Repair Guide',
      'Job ID':jobPayload.payload['Job ID'],
      'Owner Review Required':true,
      'Subtotal':0,'Tax':0,'Total':0,
      lines:lines,
      'Created Time':now,'Updated Time':now,'Record Version':1
    }
  };
}

// ---- customers: search + link (match, never auto-create, never duplicate) ----
function payloadText(p){
  p=p||{};
  return {name:p['Customer Name']||p['Name']||p['Full Name']||'',phone:p['Phone']||p['Phone Number']||p['Mobile']||''};
}
async function searchCustomers(q){
  var rows=await api('business_records?business_id=eq.'+encodeURIComponent(OFFICE_BUSINESS)+'&collection=eq.customers&select=record_key,payload&limit=200');
  var needle=String(q||'').toLowerCase();
  return (rows||[]).map(function(r){
    var t=payloadText(r.payload);
    return {id:r.record_key,name:t.name,phone:t.phone};
  }).filter(function(c){
    if(!c.name&&!c.phone)return false;
    if(!needle)return true;
    return (c.name+' '+c.phone).toLowerCase().indexOf(needle)>=0;
  }).slice(0,8);
}
function readLinks(){try{return JSON.parse(localStorage.getItem(LINK_KEY)||'{}');}catch(e){return{};}}
function writeLinks(m){try{localStorage.setItem(LINK_KEY,JSON.stringify(m));}catch(e){}}
function vehicleKey(v){return String((v&&v.name)||'')+'|'+String((v&&v.vehicle)||'');}
async function pickCustomer(hintVehicle){
  var links=readLinks();
  var hintKey=hintVehicle?vehicleKey(hintVehicle):'';
  var linked=hintKey&&links[hintKey];
  var searchHtml='<input id="h38cQ" type="text" placeholder="Type a name or phone…" style="width:100%;padding:12px;border-radius:8px;border:1px solid #2e7d32;background:#0a1a10;color:#e8f5e9;margin:8px 0;">'+
    '<div id="h38cList"></div>'+
    '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">'+
    '<button class="secondary-btn" data-mv="__skip">Skip — no customer</button>'+
    '<button class="secondary-btn" data-mv="">Cancel</button></div>';
  var intro='<h3 style="margin-top:0">Link an Office customer</h3>'+
    (linked?'<p class="small">Currently linked: <strong>'+esc(linked.name||linked.id)+'</strong></p>':'<p class="small muted">Optional. Matches existing Office customers — nothing is created automatically.</p>');
  var p=modal(intro+searchHtml);
  var qEl=document.getElementById('h38cQ'),listEl=document.getElementById('h38cList');
  var render=function(items){
    listEl.innerHTML=items.length?items.map(function(c,i){
      return '<button class="secondary-btn" data-ci="'+i+'" style="display:block;width:100%;text-align:left;margin:6px 0;">'+esc(c.name||'(no name)')+(c.phone?'<br><small>'+esc(c.phone)+'</small>':'')+'</button>';
    }).join(''):'<p class="small muted">No matches. Try another spelling, or skip.</p>';
    listEl.querySelectorAll('[data-ci]').forEach(function(b){
      b.addEventListener('click',function(){
        var c=items[Number(b.getAttribute('data-ci'))];
        if(hintKey){var m=readLinks();m[hintKey]={id:c.id,name:c.name,phone:c.phone};writeLinks(m);}
        var ov=document.querySelector('[data-h38-bridge-modal]');
        if(ov)ov.parentNode.removeChild(ov);
        finish(c);
      });
    });
  };
  var finish=null;
  var wrapped=new Promise(function(res){finish=res;});
  var doSearch=function(){
    var q=qEl.value.trim();
    listEl.innerHTML='<p class="small muted">Searching…</p>';
    searchCustomers(q).then(render).catch(function(e){listEl.innerHTML='<p class="small" style="color:#ef9a9a">'+esc(e.message||'Search failed')+'</p>';});
  };
  var deb=null;
  qEl.addEventListener('input',function(){clearTimeout(deb);deb=setTimeout(doSearch,350);});
  doSearch();
  var mv=await p;
  if(mv==='__skip')return null;
  if(mv===null||mv==='')return undefined; // cancelled
  return await wrapped;
}

// ---- send flows ----
function sendBarHtml(kind){
  return '<div data-h38-sendbar="'+kind+'" style="margin-top:14px;padding:12px;border:1px dashed #2e7d32;border-radius:10px;">'+
    '<button class="secondary-btn" data-h38-send="'+kind+'">🏢 Send to Office</button> '+
    '<a class="secondary-btn" style="text-decoration:none;display:inline-block" target="_blank" rel="noopener" href="'+esc(officeUrl('work'))+'">Open Office →</a>'+
    '<div data-h38-sendstatus style="margin-top:8px" class="small"></div></div>';
}
function statusEl(bar){return bar.querySelector('[data-h38-sendstatus]');}
async function handleSend(kind,bar){
  var stash=kind==='parts'?window.H38_LAST_PARTS:window.H38_LAST_DIAGNOSIS;
  if(!stash||!stash.result){statusEl(bar).textContent='Nothing to send yet.';return;}
  var choice=await modal(
    '<h3 style="margin-top:0">Send to Office</h3>'+
    '<p class="small">This creates draft records in the Office for <strong>owner review</strong>. Nothing is sent to the customer.</p>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">'+
    '<button class="primary-btn" style="width:auto" data-mv="job">Send job draft</button>'+
    (kind==='diagnosis'?'<button class="primary-btn" style="width:auto" data-mv="jobquote">Send job + quote draft</button>':'')+
    '<button class="secondary-btn" data-mv="">Cancel</button></div>');
  if(!choice)return;
  var hintVehicle=null;
  if(kind==='diagnosis'&&stash.input&&stash.input.unitInfo){
    try{
      var g=JSON.parse(localStorage.getItem('h38-repair-guide-garage')||'[]');
      hintVehicle=(g||[]).find(function(x){return x&&(x.vehicle||x.name)&&((stash.input.unitInfo||'').indexOf(x.vehicle)>=0||(x.vehicle||'').indexOf(stash.input.unitInfo)>=0);})||null;
    }catch(e){}
  }
  var customer=await pickCustomer(hintVehicle);
  if(customer===undefined)return; // cancelled
  var st=statusEl(bar);
  st.textContent='Sending…';
  try{
    var jobPayload=buildJobPayload(stash,customer||null);
    var jobRows=await api('business_records',{method:'POST',body:JSON.stringify([jobPayload])});
    var msg='✓ Job draft sent to the Office.';
    if(choice==='jobquote'){
      var quotePayload=buildQuotePayload(stash,customer||null,jobPayload);
      if(quotePayload){
        await api('business_records',{method:'POST',body:JSON.stringify([quotePayload])});
        msg='✓ Job + quote drafts sent to the Office.';
      }else{
        msg='✓ Job draft sent. (No parts estimate, so no quote draft.)';
      }
    }
    st.innerHTML=esc(msg)+' <a target="_blank" rel="noopener" href="'+esc(officeUrl(choice==='jobquote'?'quotes':'work'))+'">View in Office →</a>';
  }catch(e){
    st.innerHTML='<span style="color:#ef9a9a">'+esc('Could not send: '+(e.message||e))+'</span>';
  }
}
function injectSendBars(){
  [['diagnosisResult','diagnosis'],['partsResult','parts']].forEach(function(pair){
    var box=$(pair[0]);
    if(!box||box.hidden)return;
    if(box.querySelector('[data-h38-sendbar]'))return;
    var wrap=document.createElement('div');
    wrap.innerHTML=sendBarHtml(pair[1]);
    box.appendChild(wrap);
    var btn=wrap.querySelector('[data-h38-send]');
    btn.addEventListener('click',function(){handleSend(pair[1],wrap);});
  });
}

// ---- garage: link vehicles to Office customers ----
function injectGarageLinks(){
  var list=$('garageList');
  if(!list||$('h38GarageLinks'))return;
  var sec=document.createElement('div');
  sec.id='h38GarageLinks';
  sec.style.cssText='margin-top:14px;padding:12px;border:1px dashed #2e7d32;border-radius:10px;';
  var garage=[];
  try{garage=JSON.parse(localStorage.getItem('h38-repair-guide-garage')||'[]');}catch(e){garage=[];}
  var links=readLinks();
  var rows=(garage||[]).map(function(vh,i){
    var key=vehicleKey(vh);
    var linked=links[key];
    return '<div class="row" style="margin-bottom:8px"><div class="row-top"><strong>'+esc(vh.name||vh.vehicle||('Vehicle '+(i+1)))+'</strong>'+
      '<span class="small">'+(linked?('🔗 '+esc(linked.name||linked.id)):'<span class="muted">not linked</span>')+'</span></div>'+
      '<div><button class="secondary-btn" data-h38-linkv="'+i+'">'+(linked?'Change link':'Link Office customer')+'</button></div></div>';
  }).join('');
  sec.innerHTML='<h3 style="margin-top:0">🏢 Office customer links</h3>'+
    '<p class="small muted">Match each vehicle to an existing Office customer. Matching only — vehicles and customers are never created or duplicated here.</p>'+
    (rows||'<p class="small muted">Add a vehicle above first.</p>')+
    '<div style="margin-top:8px"><a class="small" target="_blank" rel="noopener" href="'+esc(officeUrl('customers'))+'">Open Office customers →</a></div>';
  list.appendChild(sec);
  sec.querySelectorAll('[data-h38-linkv]').forEach(function(b){
    b.addEventListener('click',async function(){
      var vh=garage[Number(b.getAttribute('data-h38-linkv'))];
      var c=await pickCustomer(vh);
      if(c===undefined)return;
      if(c===null){var m=readLinks();delete m[vehicleKey(vh)];writeLinks(m);}
      sec.parentNode.removeChild(sec);
      injectGarageLinks();
    });
  });
}

// ---- Office -> Guide: view a linked diagnosis (?job=<record_key>) ----
async function showLinkedDiagnosis(){
  var home=$('homeScreen');
  if(!home||$('h38LinkedDiag'))return;
  var card=document.createElement('div');
  card.id='h38LinkedDiag';
  card.style.cssText='margin:12px 0;padding:12px;border:1px solid #2e7d32;border-radius:10px;background:#0d1f14;';
  card.innerHTML='<p class="small muted">Loading linked diagnosis…</p>';
  home.insertBefore(card,home.firstChild);
  try{
    var rows=await api('business_records?business_id=eq.'+encodeURIComponent(OFFICE_BUSINESS)+'&collection=eq.jobs&record_key=eq.'+encodeURIComponent(OFFICE_JOB)+'&select=payload&limit=1');
    var diag=rows&&rows[0]&&rows[0].payload&&rows[0].payload['Repair Guide Diagnosis'];
    if(!diag){card.innerHTML='<p class="small">No linked diagnosis found on that Office job.</p>';return;}
    card.innerHTML='<h3 style="margin-top:0">🔧 Linked diagnosis</h3>'+
      '<p><strong>'+esc(diag.topIssue||'Diagnosis')+'</strong>'+(diag.unitInfo?' <span class="small muted">'+esc(diag.unitInfo)+'</span>':'')+'</p>'+
      (diag.symptoms?'<p class="small"><strong>Symptoms:</strong> '+esc(diag.symptoms)+'</p>':'')+
      (diag.issues&&diag.issues.length?'<p class="small"><strong>Likely issues:</strong></p><ul class="small">'+diag.issues.slice(0,5).map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul>':'')+
      (diag.totalEstimate||diag.timeEstimate?'<p class="small"><strong>Estimate:</strong> '+esc(diag.totalEstimate||diag.timeEstimate)+'</p>':'')+
      '<div><a class="secondary-btn" style="text-decoration:none;display:inline-block" target="_blank" rel="noopener" href="'+esc(officeUrl('work'))+'">Open Office job →</a></div>';
  }catch(e){
    card.innerHTML='<p class="small" style="color:#ef9a9a">'+esc('Could not load the linked diagnosis: '+(e.message||e))+'</p>';
  }
}

// ---- activation: banner + observers ----
function injectHomeBanner(){
  var home=$('homeScreen');
  if(!home||$('h38OfficeBanner'))return;
  var b=document.createElement('div');
  b.id='h38OfficeBanner';
  b.style.cssText='margin:12px 0;padding:12px;border:1px solid #2e7d32;border-radius:10px;background:#0d1f14;';
  b.innerHTML='<div class="row-top"><strong>🏢 Office mode</strong><span class="small muted">connected</span></div>'+
    '<p class="small">Diagnoses can be sent to the Office as job/quote drafts for owner review. '+
    '<a target="_blank" rel="noopener" href="'+esc(officeUrl('work'))+'">Open Office →</a></p>';
  home.insertBefore(b,home.firstChild);
}
function onActivate(){
  injectHomeBanner();
  injectSendBars();
  injectGarageLinks();
  if(OFFICE_JOB)showLinkedDiagnosis();
  if(!onActivate._obs){
    onActivate._obs=true;
    var watch=function(id,fn,opts){
      var el=$(id);
      if(!el)return;
      try{
        new MutationObserver(function(){if(active)fn();}).observe(el,opts||{attributes:true,attributeFilter:['hidden','class','style'],childList:false,subtree:false});
      }catch(e){}
    };
    watch('diagnosisResult',injectSendBars);
    watch('partsResult',injectSendBars);
    // Re-inject only when the app's own render wiped our section (guard prevents loops).
    watch('garageList',function(){if(!$('h38GarageLinks'))injectGarageLinks();},{childList:true,subtree:false});
    watch('homeScreen',function(){injectHomeBanner();if(OFFICE_JOB)showLinkedDiagnosis();});
  }
}

// ---- boot: verify on load and whenever the home screen appears (login may come later) ----
function boot(){
  verify();
  var home=$('homeScreen');
  if(home){
    try{
      // Screens toggle via the `active` class; login may happen after boot.
      new MutationObserver(function(){
        if(home.classList.contains('active'))verify();
      }).observe(home,{attributes:true,attributeFilter:['class']});
    }catch(e){}
  }
  document.addEventListener('visibilitychange',function(){if(!document.hidden)verify();});
}
window.H38RepairBridge={
  verify:verify,
  isActive:function(){return active;},
  buildJobPayload:buildJobPayload,
  buildQuotePayload:buildQuotePayload,
  searchCustomers:searchCustomers,
  officeUrl:officeUrl,
  businessId:function(){return OFFICE_BUSINESS;},
  BUILD:BUILD
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
else boot();
})();
