// H38 SMS provider seam — BUILD 20261004-sms-seam-2
// Single sendSms() abstraction for the Office. The provider (telnyx|twilio|plivo)
// lives behind config; nothing here holds API keys or sends directly.
//
// KIT-THROUGH DESIGN (Ricky, 2026-10-04): texting runs through Kit, the in-Office
// AI. Kit composes and personalizes every message from real business records
// (H38SmsTemplates + H38SmsTriggers in sms-triggers.js), using owner-approved
// templates; the SMS provider is only the delivery pipe with the business number.
// Stop rules: explicit consent required, STOP/HELP honored, per-category customer
// preferences, quiet hours (no delivery 9pm-8am local).
//
// Flow:
//   1. Trigger (or UI) calls H38SmsTemplates.compose(template, recordData),
//      then H38Sms.sendSms({to, body, category, ...}).
//   2. This module validates: gateway toggle ON, provider connected, E.164 number,
//      explicit customer consent (blocks Opted Out / Unknown), category preference,
//      segment limits, quiet hours (sets Deliver After).
//   3. It writes an smsThreads row with Status 'Queued — Owner Approval Required'
//      via the canonical queueOperation path. NOTHING IS SENT YET.
//   4. After an owner approves (Lane 2 external action), the approved executor
//      calls the Supabase edge function h38-send-sms, which performs the actual
//      provider HTTP call with the API key from server-side secrets.
// The browser never sees provider credentials.
//
// INTERIM PATH (testing only): {via:'phone-bridge'} sends short (<=100 char)
// messages through Ricky's paired phone via window.H38PhoneBridge. This exposes
// his PERSONAL number and breaks on longer messages — never for customers.
(function(){
'use strict';
var BUILD='20261004-sms-seam-2';
var SUPPORTED_PROVIDERS=['telnyx','twilio','plivo'];
var MAX_SEGMENTS=5;

// ---- Owner-approved templates (smsTemplates collection) ----
// Fields: 'Template ID','Business ID','Template Name','Category','Body','Status'
// ('Draft'|'Approved'|'Archived'),'Approved By','Approved At','Created Time'.
// Only Approved templates may be used by triggers/Kit. Categories:
// 'reminder' | 'on_my_way' | 'follow_up' | 'quote_followup'.
var TEMPLATE_PLACEHOLDERS=['customer_name','first_name','job_date','job_time','tech_name','business_name','quote_total','job_address','quote_number'];
var SMS_TEMPLATES_DEFAULTS=[
 {name:'Appointment reminder',category:'reminder',body:'Hi {first_name}, this is {business_name} confirming your appointment on {job_date} at {job_time}. Reply STOP to opt out.'},
 {name:'On my way',category:'on_my_way',body:'Hi {first_name}, {tech_name} from {business_name} is on the way - ETA about {job_time}. Reply STOP to opt out.'},
 {name:'Quote follow-up',category:'follow_up',body:'Hi {first_name}, following up on your {business_name} quote {quote_number} for {quote_total}. Any questions? Reply STOP to opt out.'},
 {name:'Job follow-up',category:'follow_up',body:'Hi {first_name}, thanks for choosing {business_name}! If you were happy with the work, a Google review would mean a lot. Reply STOP to opt out.'}
];
function smsTemplates(){ try{ return records('smsTemplates')||[]; }catch(e){ return []; } }
function templateRowId(r){ try{ return rowId(r,'Template ID','templateId'); }catch(e){ return String(v(r,'Template ID')||''); } }
function getTemplate(idOrName){
  // Accepts a template row (returned as-is), an ID, or a name.
  if(idOrName&&typeof idOrName==='object'){
    try{ if(v(idOrName,'Template Name')!=null) return idOrName; }catch(e){}
  }
  var rows=smsTemplates(), key=String(idOrName||'').toLowerCase();
  for(var i=0;i<rows.length;i++){
    if(String(templateRowId(rows[i])).toLowerCase()===key||String(v(rows[i],'Template Name')||'').toLowerCase()===key) return rows[i];
  }
  return null;
}
function approvedTemplateFor(category){
  var rows=smsTemplates();
  for(var i=0;i<rows.length;i++){
    if(String(v(rows[i],'Category')||'').toLowerCase()===String(category||'').toLowerCase()
      &&String(v(rows[i],'Status')||'').toLowerCase()==='approved') return rows[i];
  }
  return null;
}
// Render a template against record data. Unknown {placeholders} are left intact;
// placeholders with no data are reported in `missing` (never silently blanked
// into a customer message — the caller decides).
function composeTemplate(idOrName,data){
  var tpl=getTemplate(idOrName);
  if(!tpl) throw new Error('SMS template not found: '+idOrName);
  data=data||{};
  var body=String(v(tpl,'Body')||''), missing=[];
  body=body.replace(/\{([a-z_]+)\}/gi,function(m,key){
    var k=String(key).toLowerCase();
    if(TEMPLATE_PLACEHOLDERS.indexOf(k)<0) return m; // not ours — leave alone
    if(data[k]==null||data[k]===''){ if(missing.indexOf(k)<0) missing.push(k); return m; }
    return String(data[k]);
  });
  return {body:body,missing:missing,template:tpl};
}
async function seedDefaultTemplates(){
  if(typeof state==='undefined'||!state.businessId) throw new Error('Open a business first.');
  var existing=smsTemplates();
  var added=0;
  for(var i=0;i<SMS_TEMPLATES_DEFAULTS.length;i++){
    var d=SMS_TEMPLATES_DEFAULTS[i];
    var dup=false;
    for(var j=0;j<existing.length;j++){ if(String(v(existing[j],'Template Name')||'').toLowerCase()===d.name.toLowerCase()){ dup=true; break; } }
    if(dup) continue;
    var id=newId('SMS-TEMPLATE');
    var record={'Template ID':id,'Business ID':state.businessId,'Template Name':d.name,'Category':d.category,'Body':d.body,'Status':'Draft','Approved By':'','Approved At':'','Created Time':now(),'Record Version':1};
    await queueOperation('SAVE_SMS_TEMPLATE','SMS Template',id,{templateId:id},{collection:'smsTemplates',record:record,idKeys:['Template ID']});
    added++;
  }
  return {added:added};
}
async function saveTemplate(input){
  if(typeof state==='undefined'||!state.businessId) throw new Error('Open a business first.');
  var id=input.id||newId('SMS-TEMPLATE');
  var record={'Template ID':id,'Business ID':state.businessId,
    'Template Name':String(input.name||'').slice(0,80)||'Untitled template',
    'Category':String(input.category||'reminder'),
    'Body':String(input.body||'').slice(0,1000),
    'Status':input.status||'Draft',
    'Approved By':input.approvedBy||'','Approved At':input.approvedAt||'',
    'Created Time':now(),'Record Version':num(input.recordVersion||0)+1};
  await queueOperation('SAVE_SMS_TEMPLATE','SMS Template',id,{templateId:id},{collection:'smsTemplates',record:record,idKeys:['Template ID']});
  return id;
}
async function setTemplateStatus(idOrName,status,approver){
  var tpl=getTemplate(idOrName);
  if(!tpl) throw new Error('SMS template not found: '+idOrName);
  status=String(status||'');
  if(['Approved','Archived','Draft'].indexOf(status)<0) throw new Error('Bad template status.');
  var id=templateRowId(tpl);
  var record={'Template ID':id,'Business ID':v(tpl,'Business ID')||((typeof state!=='undefined'&&state.businessId)||''),
    'Template Name':v(tpl,'Template Name'),'Category':v(tpl,'Category'),'Body':v(tpl,'Body'),
    'Status':status,
    'Approved By':status==='Approved'?(approver||((typeof state!=='undefined'&&state.snapshot&&state.snapshot.user&&state.snapshot.user.userId)||'')):'',
    'Approved At':status==='Approved'?now():'',
    'Created Time':v(tpl,'Created Time')||now(),'Record Version':num(v(tpl,'Record Version'))+1};
  await queueOperation('SAVE_SMS_TEMPLATE','SMS Template',id,{templateId:id},{collection:'smsTemplates',record:record,idKeys:['Template ID']});
  return true;
}

// ---- Quiet hours: no delivery 9pm-8am local. Drafts queue with Deliver After. ----
function deliveryAllowed(at){
  var h=(at instanceof Date?at:new Date(at||Date.now())).getHours();
  return h>=8&&h<21;
}
function nextDeliveryTime(from){
  var d=new Date(from||Date.now());
  if(d.getHours()>=21){ d.setDate(d.getDate()+1); }
  d.setHours(8,0,0,0);
  if(deliveryAllowed(new Date())) return new Date();
  return d;
}

// ---- Customer lookup + per-category SMS preferences ----
function digitsOf(s){ return String(s==null?'':s).replace(/\D/g,''); }
function findCustomerByPhone(numberE164){
  var want=digitsOf(numberE164), last10=want.slice(-10);
  var customers=[];
  try{ customers=records('customers')||[]; }catch(e){}
  for(var i=0;i<customers.length;i++){
    var phones=[v(customers[i],'Phone'),v(customers[i],'Mobile Phone')];
    for(var j=0;j<phones.length;j++){
      var d=digitsOf(phones[j]);
      if(d&&d.slice(-10)===last10) return customers[i];
    }
  }
  return null;
}
// 'SMS Preferences' on the customer record: 'None' blocks everything,
// 'Reminders Only' allows reminder/on_my_way, anything else/missing allows all.
function categoryAllowed(numberE164,category){
  var cust=findCustomerByPhone(numberE164);
  if(!cust) return true;
  var pref=String(v(cust,'SMS Preferences')||'').toLowerCase();
  if(!pref||pref==='all') return true;
  if(pref==='none') return false;
  if(pref.indexOf('reminder')>=0) return category==='reminder'||category==='on_my_way';
  return true;
}

// ---- Interim phone bridge (TESTING ONLY) ----
// Short (<=100 char) sends through Ricky's paired phone via the device bridge.
// Exposes his PERSONAL number and fails on longer messages. Never for customers.
var PHONE_BRIDGE_MAX=100;
function sendViaPhoneBridge(to,body){
  var bridge=null;
  try{ bridge=window.H38PhoneBridge; }catch(e){}
  if(!bridge||typeof bridge.sendSms!=='function'){
    throw new Error('Phone bridge is not available on this device. The interim path needs the paired phone bridge.');
  }
  var text=String(body==null?'':body);
  if(text.length>PHONE_BRIDGE_MAX){
    throw new Error('Phone bridge can only send '+PHONE_BRIDGE_MAX+' characters or less (device limitation). This message is '+text.length+'.');
  }
  return bridge.sendSms(to,text);
}

// ---- Inbound STOP: mark consent Opted Out on matching threads ----
async function handleInboundStop(fromNumber){
  var want=digitsOf(fromNumber).slice(-10);
  if(!want) return {updated:0};
  var threads=[];
  try{ threads=records('smsThreads')||[]; }catch(e){}
  var updated=0;
  for(var i=0;i<threads.length;i++){
    if(digitsOf(v(threads[i],'Customer Number')).slice(-10)===want){
      var tid=null;
      try{ tid=rowId(threads[i],'SMS Thread ID','threadId'); }catch(e){}
      if(!tid) continue;
      var record=Object.assign({},threads[i],{'Consent Status':'Opted Out','Record Version':num(v(threads[i],'Record Version'))+1});
      await queueOperation('SMS_OPT_OUT','SMS Thread',tid,{threadId:tid},{collection:'smsThreads',record:record,idKeys:['SMS Thread ID']});
      updated++;
    }
  }
  return {updated:updated};
}

// ---- Messages-page UI helpers (rendered by app-09.js, guarded) ----
function templatesCard(){
  try{
    var rows=smsTemplates().slice(0,50);
    var list=rows.length?rows.map(function(r){
      var id=esc(templateRowId(r)), nm=esc(v(r,'Template Name')), cat=esc(v(r,'Category')), st=String(v(r,'Status')||'Draft');
      var btns=st==='Draft'
        ? '<button class="secondary" data-approve-template="'+id+'">Approve</button>'
        : (st==='Approved' ? '<button class="secondary" data-archive-template="'+id+'">Archive</button>' : '');
      return '<div class="row"><div class="row-top"><strong>'+nm+'</strong>'+pill(st)+'</div><small>'+cat+' · '+esc(String(v(r,'Body')||'').slice(0,90))+'…</small><div class="row-actions">'+btns+'</div></div>';
    }).join(''):'<p class="muted">No templates yet. Load the defaults below, edit them, then approve.</p>';
    return '<section class="card span5"><h2>Message templates</h2>'
      +'<p class="muted small">Kit drafts texts from <strong>Approved</strong> templates only. Approve a template when the wording is right.</p>'
      +'<div class="list">'+list+'</div>'
      +'<div class="actions"><button type="button" class="secondary" id="smsLoadDefaults">Load default templates</button></div>'
      +'<form id="smsTemplateForm"><label>Template name</label><input name="tplName" required maxlength="80">'
      +'<label>Category</label><select name="tplCategory"><option value="reminder">Appointment reminder</option><option value="on_my_way">On my way</option><option value="follow_up">Follow-up</option></select>'
      +'<label>Message <small>Placeholders: '+TEMPLATE_PLACEHOLDERS.map(function(p){return '{'+p+'}';}).join(' ')+'</small></label>'
      +'<textarea name="tplBody" required maxlength="1000"></textarea>'
      +'<div class="actions"><button>Save as draft</button></div></form></section>';
  }catch(e){ return ''; }
}
function queueCard(){
  try{
    var rows=threads().filter(function(r){ return /queued/i.test(String(v(r,'Status')||'')); }).slice(0,50);
    var list=rows.length?rows.map(function(r){
      return '<div class="row"><div class="row-top"><strong>'+esc(v(r,'Customer Number'))+'</strong>'+pill(v(r,'Status'))+'</div>'
        +'<small>'+esc(v(r,'Purpose')||'')+' · '+esc(v(r,'Category')||'')+' · '+esc(String(v(r,'Pending Body')||'').slice(0,90))+'…'
        +(v(r,'Deliver After')?' · <em>after '+esc(v(r,'Deliver After'))+'</em>':'')+'</small></div>';
    }).join(''):'<p class="muted">Nothing waiting. Kit\'s drafts and your send requests land here.</p>';
    return '<section class="card span7"><h2>Approval queue</h2>'+'<div class="list">'+list+'</div>'
      +'<p class="muted small">Nothing here has been sent. Sending happens only after owner approval.</p></section>';
  }catch(e){ return ''; }
}
function threads(){
  try{ return records('smsThreads')||[]; }catch(e){ return []; }
}
function bindTemplatesUI(){
  try{
    var ld=document.getElementById('smsLoadDefaults');
    if(ld) ld.onclick=function(){ seedDefaultTemplates().then(function(r){ toast('Loaded '+r.added+' default template(s) as drafts.'); renderMessages(); }).catch(function(e){ toast(e.message||String(e),true); }); };
    var f=document.getElementById('smsTemplateForm');
    if(f) f.onsubmit=function(ev){ ev.preventDefault(); var fd=new FormData(f), d=Object.fromEntries(fd.entries());
      saveTemplate({name:d.tplName,category:d.tplCategory,body:d.tplBody,status:'Draft'})
        .then(function(){ toast('Template saved as draft.'); renderMessages(); })
        .catch(function(e){ toast(e.message||String(e),true); }); };
    var ap=document.querySelectorAll('[data-approve-template]');
    ap.forEach(function(b){ b.onclick=function(){ setTemplateStatus(b.getAttribute('data-approve-template'),'Approved').then(function(){ toast('Template approved. Kit can now use it.'); renderMessages(); }).catch(function(e){ toast(e.message||String(e),true); }); }; });
    var ar=document.querySelectorAll('[data-archive-template]');
    ar.forEach(function(b){ b.onclick=function(){ setTemplateStatus(b.getAttribute('data-archive-template'),'Archived').then(function(){ renderMessages(); }).catch(function(e){ toast(e.message||String(e),true); }); }; });
  }catch(e){}
}

// ---- Owner Controls toggle (registered without editing owner-controls.js) ----
var SMS_TOGGLE={
  id:'sms_gateway',
  title:'SMS sending (gateway)',
  desc:'Send customer texts through the configured SMS provider. Each send needs owner approval; consent and STOP rules are enforced. Off until you connect a provider.',
  icon:'💬',
  default:false,
  category:'Messages'
};
function registerToggle(){
  try{
    var oc=window.H38OwnerControls;
    if(oc&&oc.FEATURES&&!oc.FEATURES.some(function(f){return f&&f.id===SMS_TOGGLE.id;})){
      oc.FEATURES.push(SMS_TOGGLE);
    }
  }catch(e){}
}

function smsGatewayEnabled(){
  try{
    var oc=window.H38OwnerControls;
    if(oc&&typeof oc.isEnabled==='function') return !!oc.isEnabled(SMS_TOGGLE.id);
  }catch(e){}
  return false; // safe default: customer-facing stays OFF
}

// ---- Provider config: canonical source is the providers collection ----
// Row shape: 'Provider Type'='sms', 'Provider Name' in telnyx|twilio|plivo,
// 'From Number' (E.164), 'Connection Status'.
function smsProviderConfig(){
  var rows=[];
  try{ rows=records('providers')||[]; }catch(e){}
  var row=null;
  for(var i=0;i<rows.length;i++){
    if(String(v(rows[i],'Provider Type')||'').toLowerCase()==='sms'){ row=rows[i]; break; }
  }
  var name=row?String(v(row,'Provider Name')||'').toLowerCase().trim():'';
  if(SUPPORTED_PROVIDERS.indexOf(name)<0) name='';
  var status=row?String(v(row,'Connection Status')||'Not Connected'):'Not Connected';
  var s=status.toLowerCase();
  var connected=!!row&&s.indexOf('connect')>=0&&s.indexOf('not')<0&&s.indexOf('setup required')<0;
  return {
    row:row,
    provider:name||'telnyx', // recommended default; actual send requires a connected row
    fromNumber:row?String(v(row,'From Number')||'').trim():'',
    status:status,
    connected:connected
  };
}

// ---- E.164 normalization (US) ----
function normalizeE164(to){
  var d=String(to==null?'':to).replace(/\D/g,'');
  if(d.length===11&&d.charAt(0)==='1'){/* ok */}
  else if(d.length===10){ d='1'+d; }
  else{ throw new Error('Enter a valid 10-digit US mobile number.'); }
  return '+'+d;
}
function digitsOnly(s){ return String(s==null?'':s).replace(/\D/g,''); }

// ---- Consent: explicit opt-in required; Opted Out / Unknown block sending ----
function smsConsentFor(numberE164){
  var want=digitsOnly(numberE164);
  var threads=[];
  try{ threads=records('smsThreads')||[]; }catch(e){}
  for(var i=0;i<threads.length;i++){
    if(digitsOnly(v(threads[i],'Customer Number'))===want){
      return String(v(threads[i],'Consent Status')||'Unknown');
    }
  }
  return 'Unknown';
}

// ---- Segment estimate (GSM-7 vs UCS-2) ----
var GSM7="@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
function smsSegmentCount(body){
  var text=String(body==null?'':body);
  if(!text) return 0;
  var gsm=true;
  for(var i=0;i<text.length;i++){ if(GSM7.indexOf(text.charAt(i))<0){ gsm=false; break; } }
  var per=gsm?(text.length<=160?160:153):(text.length<=70?70:67);
  return Math.max(1,Math.ceil(text.length/per));
}

// ---- The seam: validate + queue for owner approval. Never sends directly. ----
async function sendSms(opts){
  opts=opts||{};
  if(!smsGatewayEnabled()){
    throw new Error('SMS sending is OFF. Enable it in Settings → Owner Controls → SMS sending (gateway).');
  }
  var cfg=smsProviderConfig();
  var to=normalizeE164(opts.to);
  var body=String(opts.body==null?'':opts.body).trim();
  if(!body) throw new Error('Message body is required.');
  var consent=String(opts.consentStatus||smsConsentFor(to)||'Unknown');
  if(/opted\s*out|\bstop\b/i.test(consent)){
    throw new Error('This number opted out. Sending is blocked.');
  }
  if(!/consent/i.test(consent)){
    throw new Error('Customer consent is required before any SMS can be sent. Record consent on the customer text thread first.');
  }
  var category=String(opts.category||'general').toLowerCase();
  if(!categoryAllowed(to,category)){
    throw new Error("This customer's SMS preferences block this kind of message.");
  }
  if(typeof state==='undefined'||!state.businessId) throw new Error('Open a business first.');

  // Interim testing path: paired-phone bridge (personal number, <=100 chars).
  if(opts.via==='phone-bridge'){
    sendViaPhoneBridge(to,body); // throws when unavailable or too long
    var pbThreadId=opts.threadId||newId('SMS-THREAD');
    var pbPurpose=String(opts.purpose||'Customer text');
    var pbThread={'SMS Thread ID':pbThreadId,'Business ID':state.businessId,'Provider':'phone-bridge',
      'Customer Number':to,'Consent Status':'Consented','Status':'Sent via phone (testing)',
      'Pending Body':body,'Segments':smsSegmentCount(body),'Purpose':pbPurpose,'Category':category,
      'Last Message Time':now(),'Record Version':1};
    await queueOperation('SEND_SMS_PHONE','SMS Message',newId('SMS-MESSAGE'),
      {smsThreadId:pbThreadId,to:to,body:body,via:'phone-bridge',purpose:pbPurpose},
      {collection:'smsThreads',record:pbThread,idKeys:['SMS Thread ID']});
    if(typeof toast==='function') toast("Sent from the paired phone's personal number — testing only.",true);
    return {sent:true,via:'phone-bridge',threadId:pbThreadId};
  }

  if(!cfg.connected){
    throw new Error('SMS provider is not connected. Add a provider row (Provider Type = sms) in Settings before sending.');
  }
  var segments=smsSegmentCount(body);
  if(segments>MAX_SEGMENTS){
    throw new Error('Message is too long ('+segments+' segments). Keep it under '+MAX_SEGMENTS+' segments.');
  }
  var deliverAfter=deliveryAllowed(new Date())?'':nextDeliveryTime().toISOString();

  var msgId=newId('SMS-MESSAGE');
  var threadId=opts.threadId||newId('SMS-THREAD');
  var purpose=String(opts.purpose||'Customer text');
  var thread={
    'SMS Thread ID':threadId,
    'Business ID':state.businessId,
    'Provider':cfg.provider,
    'Customer Number':to,
    'Consent Status':'Consented',
    'Status':'Queued — Owner Approval Required',
    'Pending Body':body,
    'Segments':segments,
    'Purpose':purpose,
    'Category':category,
    'Deliver After':deliverAfter,
    'Last Message Time':now(),
    'Record Version':1
  };
  await queueOperation('SEND_SMS','SMS Message',msgId,{
    smsThreadId:threadId,
    to:to,
    body:body,
    segments:segments,
    provider:cfg.provider,
    purpose:purpose,
    category:category,
    deliverAfter:deliverAfter,
    consentStatus:'Consented',
    queuedBy:(state.snapshot&&state.snapshot.user&&state.snapshot.user.userId)||''
  },{collection:'smsThreads',record:thread,idKeys:['SMS Thread ID']});
  if(typeof toast==='function') toast('Text queued for owner approval. Nothing sent yet.');
  return {queued:true,threadId:threadId,segments:segments,provider:cfg.provider,status:'Queued — Owner Approval Required'};
}

// Convenience for the reminders engine: is an SMS send even possible right now?
function smsReady(){
  var cfg=smsProviderConfig();
  return {enabled:smsGatewayEnabled(),provider:cfg.provider,connected:cfg.connected,status:cfg.status};
}

registerToggle();

window.H38Sms={
  sendSms:sendSms,
  smsGatewayEnabled:smsGatewayEnabled,
  smsProviderConfig:smsProviderConfig,
  smsConsentFor:smsConsentFor,
  smsSegmentCount:smsSegmentCount,
  normalizeE164:normalizeE164,
  smsReady:smsReady,
  // Kit-through layer
  templates:{
    list:smsTemplates,
    get:getTemplate,
    approvedFor:approvedTemplateFor,
    compose:composeTemplate,
    seedDefaults:seedDefaultTemplates,
    save:saveTemplate,
    setStatus:setTemplateStatus,
    placeholders:TEMPLATE_PLACEHOLDERS.slice()
  },
  deliveryAllowed:deliveryAllowed,
  nextDeliveryTime:nextDeliveryTime,
  findCustomerByPhone:findCustomerByPhone,
  categoryAllowed:categoryAllowed,
  sendViaPhoneBridge:sendViaPhoneBridge,
  handleInboundStop:handleInboundStop,
  PHONE_BRIDGE_MAX:PHONE_BRIDGE_MAX,
  templatesCard:templatesCard,
  queueCard:queueCard,
  bindTemplatesUI:bindTemplatesUI,
  SUPPORTED_PROVIDERS:SUPPORTED_PROVIDERS,
  BUILD:BUILD
};
})();
