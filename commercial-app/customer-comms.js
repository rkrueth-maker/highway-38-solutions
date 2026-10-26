// H38 Customer Communications: "On My Way" texts + Review Requests
// Manual-first, no AI required. All sends go through H38Sms.sendSms(),
// which queues for owner approval — nothing is ever sent directly.
// v2.0 quick wins (2026-10-04).
(function(){
'use strict';

var text=function(v){return String(v==null?'':v).trim();};
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};

// ---------- Business profile (per-tenant, local + queued) ----------
function profileKey(){
  var bid=text(window.state&&window.state.businessId);
  return 'h38-business-profile-'+(bid||'none');
}
var DEFAULT_REVIEW_TEMPLATE='Thanks for choosing [Business]! Would you mind leaving us a quick review? [Link]';
var REVIEW_DELAY_OPTIONS=[
  {key:'immediate',label:'Send immediately'},
  {key:'1h',label:'1 hour after job complete'},
  {key:'3h',label:'3 hours after job complete'},
  {key:'next-morning',label:'Next morning at 9am'},
  {key:'24h',label:'24 hours after job complete'}
];
function getBusinessProfile(){
  var snap=(window.state&&window.state.snapshot&&window.state.snapshot.business)||{};
  var stored={};
  try{stored=JSON.parse(localStorage.getItem(profileKey())||'{}');}catch(e){}
  return {
    businessName:text(snap.businessName)||'your contractor',
    googleReviewLink:text(stored.googleReviewLink||''),
    facebookReviewLink:text(stored.facebookReviewLink||''),
    yelpReviewLink:text(stored.yelpReviewLink||''),
    lastReviewPlatform:text(stored.lastReviewPlatform||''),
    reviewRequestTemplate:text(stored.reviewRequestTemplate||'')||DEFAULT_REVIEW_TEMPLATE,
    reviewRequestDelay:text(stored.reviewRequestDelay||'')||'3h'
  };
}
function persistReviewProfile(stored){
  localStorage.setItem(profileKey(),JSON.stringify(stored));
  if(window.state&&window.state.businessId&&typeof queueOperation==='function'){
    queueOperation('SAVE_BUSINESS_PROFILE','BusinessProfile',window.state.businessId,
      {googleReviewLink:text(stored.googleReviewLink||''),facebookReviewLink:text(stored.facebookReviewLink||''),yelpReviewLink:text(stored.yelpReviewLink||''),lastReviewPlatform:text(stored.lastReviewPlatform||''),reviewRequestTemplate:text(stored.reviewRequestTemplate||'')||DEFAULT_REVIEW_TEMPLATE,reviewRequestDelay:text(stored.reviewRequestDelay||'')||'3h',updatedAt:new Date().toISOString()}
    ).catch(function(){});
  }
}
function storedReviewProfile(){
  var stored={};
  try{stored=JSON.parse(localStorage.getItem(profileKey())||'{}');}catch(e){}
  return stored;
}
function saveGoogleReviewLink(url){
  var stored=storedReviewProfile();
  stored.googleReviewLink=text(url);
  persistReviewProfile(stored);
}
function saveReviewLinks(links){
  var stored=storedReviewProfile();
  if(links&&links.google!==undefined)stored.googleReviewLink=text(links.google);
  if(links&&links.facebook!==undefined)stored.facebookReviewLink=text(links.facebook);
  if(links&&links.yelp!==undefined)stored.yelpReviewLink=text(links.yelp);
  persistReviewProfile(stored);
}
function saveReviewTemplate(template){
  var stored=storedReviewProfile();
  stored.reviewRequestTemplate=text(template)||DEFAULT_REVIEW_TEMPLATE;
  persistReviewProfile(stored);
}
function saveReviewDelay(delayKey){
  var ok=REVIEW_DELAY_OPTIONS.some(function(o){return o.key===delayKey;});
  var stored=storedReviewProfile();
  stored.reviewRequestDelay=ok?delayKey:'3h';
  persistReviewProfile(stored);
}
function getReviewTemplate(){
  return getBusinessProfile().reviewRequestTemplate||DEFAULT_REVIEW_TEMPLATE;
}
function getReviewDelay(){
  return getBusinessProfile().reviewRequestDelay||'3h';
}
// Render the owner-editable template. Placeholders: [Business], [Customer], [Link].
function renderReviewTemplate(customer,profile,platform){
  var tpl=text(getReviewTemplate())||DEFAULT_REVIEW_TEMPLATE;
  var link=text(profile&&profile[platform.linkField]);
  return tpl.split('[Business]').join(profile.businessName||'us')
            .split('[Customer]').join(customerFirstName(customer))
            .split('[Link]').join(link);
}
// Compute the Deliver After timestamp for the auto-send delay, pushing out of
// quiet hours (no texts 9pm–8am local) so a delay never lands overnight.
function reviewDeliverAfter(delayKey){
  var key=text(delayKey)||'3h';
  var target;
  if(key==='immediate')return '';
  var nowMs=Date.now();
  if(key==='1h')target=new Date(nowMs+3600000);
  else if(key==='24h')target=new Date(nowMs+24*3600000);
  else if(key==='next-morning'){target=new Date(nowMs);target.setDate(target.getDate()+1);target.setHours(9,0,0,0);}
  else target=new Date(nowMs+3*3600000); // '3h' default
  var h=target.getHours();
  if(h>=21||h<8){ // quiet hours → push to 8am
    if(h>=21)target.setDate(target.getDate()+1);
    target.setHours(8,0,0,0);
  }
  return target.toISOString();
}
// ---------- Review platforms: rotate Google -> Facebook -> Yelp ----------
var REVIEW_PLATFORMS=[
  {key:'google',label:'Google',linkField:'googleReviewLink',ask:'leaving us a Google review'},
  {key:'facebook',label:'Facebook',linkField:'facebookReviewLink',ask:'leaving us a Facebook review'},
  {key:'yelp',label:'Yelp',linkField:'yelpReviewLink',ask:'leaving us a review on Yelp'}
];
function configuredPlatforms(profile){
  return REVIEW_PLATFORMS.filter(function(p){return text(profile&&profile[p.linkField]);});
}
function nextReviewPlatform(profile){
  var set=configuredPlatforms(profile);
  if(!set.length)return REVIEW_PLATFORMS[0];
  var idx=set.findIndex(function(p){return p.key===text(profile&&profile.lastReviewPlatform);});
  return set[(idx+1)%set.length];
}
function platformByKey(key){
  return REVIEW_PLATFORMS.find(function(p){return p.key===key;})||REVIEW_PLATFORMS[0];
}

// ---------- Feature toggles ----------
function commsFeatureEnabled(id){
  try{
    // Canonical auto-send toggle: the business_module_settings row the
    // h38-review-scheduler edge function reads (server snapshot wins).
    if(id==='auto_send_review_requests'&&window.H38OwnerControls&&typeof window.H38OwnerControls.isAutoSendReviewEnabled==='function'){
      return window.H38OwnerControls.isAutoSendReviewEnabled();
    }
    if(window.H38OwnerControls&&typeof window.H38OwnerControls.isEnabled==='function'){
      return window.H38OwnerControls.isEnabled(id);
    }
  }catch(e){}
  // Fallback defaults if Owner Controls isn't loaded
  return id==='auto_review_requests';
}

// ---------- Customer lookup ----------
function getCustomer(customerId){
  if(typeof records!=='function')return null;
  var list=records('customers')||[];
  return list.find(function(r){
    return String(r['Customer ID']||r.customerId||'')===String(customerId);
  })||null;
}
function getJob(jobId){
  if(typeof records!=='function')return null;
  var list=records('jobs')||[];
  return list.find(function(r){
    return String(r['Job ID']||r.jobId||'')===String(jobId);
  })||null;
}
function customerPhone(customer){
  return text(customer&&(customer['Phone']||customer.phone));
}
function customerFirstName(customer){
  var name=text(customer&&(customer['Customer Name']||customer.name));
  return name.split(' ')[0]||'there';
}

// ---------- Message builders (no AI, pure templates) ----------
function buildOnMyWayMessage(job,customer,profile){
  var tech=text((window.state&&window.state.snapshot&&window.state.snapshot.user&&(window.state.snapshot.user['Display Name']||window.state.snapshot.user.displayName)))||'your tech';
  var addr=text(job['Service Address']||job.serviceAddress||job['Address']||'');
  var eta='';
  try{
    var d=new Date();
    d.setMinutes(d.getMinutes()+30);
    eta=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  }catch(e){}
  var msg='Hi '+customerFirstName(customer)+', this is '+profile.businessName+' — '+tech+' is on the way';
  if(addr)msg+=' to '+addr;
  if(eta)msg+='. ETA '+eta;
  msg+='.';
  return msg;
}
function buildReviewRequestMessage(customer,profile,platformKey){
  var platform=platformKey?platformByKey(platformKey):nextReviewPlatform(profile);
  var link=text(profile&&profile[platform.linkField]);
  var msg='Thanks for choosing '+profile.businessName+'! Would you mind '+platform.ask+'?';
  if(link)msg+=' '+link;
  else msg+=' It really helps our small business.';
  return msg;
}
function buildReviewNudgeMessage(customer,profile,platformKey){
  var platform=platformKey?platformByKey(platformKey):nextReviewPlatform(profile);
  var link=text(profile&&profile[platform.linkField]);
  var msg='Hi '+customerFirstName(customer)+', just a friendly nudge from '+profile.businessName+' — if we earned it, a quick review would mean a lot:';
  if(link)msg+=' '+link;
  else msg+=' Thanks either way for your business.';
  return msg;
}
// Jobs asked 3+ days ago with no nudge yet are due one polite follow-up.
function reviewNudgeCandidates(jobsList,nowMs){
  var cutoff=(nowMs||Date.now())-3*86400000;
  return (jobsList||[]).filter(function(job){
    var asked=Date.parse(text(job['Review Asked At']||job.reviewAskedAt||''));
    if(!asked||asked>cutoff)return false;
    if(text(job['Review Nudged At']||job.reviewNudgedAt))return false;
    return true;
  });
}

// ---------- Preview + queue (never sends directly) ----------
async function previewAndQueueSms(opts){
  opts=opts||{};
  var to=text(opts.to),body=text(opts.body);
  if(!to)throw new Error('No phone number for this customer. Add a phone number to their customer record first.');
  if(!body)throw new Error('Message is empty.');
  var label=opts.customerLabel||to;
  var ok=window.confirm('Send this text to '+label+' ('+to+')?\n\n'+body+'\n\nIt will be queued for owner approval. Nothing is sent until approved.');
  if(!ok)return {sent:false,cancelled:true};
  if(!window.H38Sms||typeof window.H38Sms.sendSms!=='function'){
    throw new Error('SMS module is still loading. Try again in a moment.');
  }
  var result=await window.H38Sms.sendSms({
    to:to,body:body,consentStatus:opts.consentStatus||'Consented',
    purpose:opts.purpose||'Customer text',category:opts.category||'general'
  });
  if(typeof toast==='function')toast('Queued for owner approval ('+(result.segments||1)+' segment(s)). Nothing sent yet.');
  return {sent:false,queued:true,threadId:result.threadId};
}

// ---------- "On My Way" ----------
async function sendOnMyWay(jobId){
  var job=getJob(jobId);
  if(!job)throw new Error('Job not found.');
  var customer=getCustomer(job['Customer ID']||job.customerId);
  if(!customer)throw new Error('Customer not found for this job.');
  var phone=customerPhone(customer);
  if(!phone)throw new Error('No phone number on file for '+text(customer['Customer Name']||'this customer')+'. Add one to their customer record first.');
  var profile=getBusinessProfile();
  var body=buildOnMyWayMessage(job,customer,profile);
  return previewAndQueueSms({
    to:phone,body:body,purpose:'On My Way text',
    customerLabel:text(customer['Customer Name']||'customer'),
    category:'transactional'
  });
}

// ---------- Review requests ----------
function markReviewAsked(job,platformKey){
  var record=Object.assign({},job,{
    'Review Asked':new Date().toLocaleDateString(),
    'Review Asked At':(typeof now==='function'?now():new Date().toISOString()),
    'Review Platform':platformKey||'',
    'Record Version':(parseInt(job['Record Version']||job.recordVersion||0,10)||0)+1
  });
  var jobId=job['Job ID']||job.jobId;
  return queueOperation('SAVE_JOB','Job',jobId,{jobId:jobId,record:record},
    {collection:'jobs',record:record,idKeys:['Job ID']});
}
async function askForReview(jobId){
  var job=getJob(jobId);
  if(!job)throw new Error('Job not found.');
  var customer=getCustomer(job['Customer ID']||job.customerId);
  if(!customer)throw new Error('Customer not found for this job.');
  var phone=customerPhone(customer);
  if(!phone)throw new Error('No phone number on file for '+text(customer['Customer Name']||'this customer')+'. Add one to their customer record first.');
  var profile=getBusinessProfile();
  var platform=nextReviewPlatform(profile);
  var body=buildReviewRequestMessage(customer,profile,platform.key);
  var result=await previewAndQueueSms({
    to:phone,body:body,purpose:'Review request ('+platform.label+')',
    customerLabel:text(customer['Customer Name']||'customer'),
    category:'marketing'
  });
  if(result.queued){
    var stored=storedReviewProfile();
    stored.lastReviewPlatform=platform.key;
    persistReviewProfile(stored);
    await markReviewAsked(job,platform.key);
    if(typeof renderWork==='function')renderWork();
  }
  return result;
}
async function sendReviewNudge(jobId){
  var job=getJob(jobId);
  if(!job)throw new Error('Job not found.');
  var customer=getCustomer(job['Customer ID']||job.customerId);
  if(!customer)throw new Error('Customer not found for this job.');
  var phone=customerPhone(customer);
  if(!phone)throw new Error('No phone number on file for '+text(customer['Customer Name']||'this customer')+'.');
  var profile=getBusinessProfile();
  var askedPlatform=text(job['Review Platform']||'');
  var next=nextReviewPlatform({googleReviewLink:profile.googleReviewLink,facebookReviewLink:profile.facebookReviewLink,yelpReviewLink:profile.yelpReviewLink,lastReviewPlatform:askedPlatform});
  var body=buildReviewNudgeMessage(customer,profile,next.key);
  var result=await previewAndQueueSms({
    to:phone,body:body,purpose:'Review follow-up nudge ('+next.label+')',
    customerLabel:text(customer['Customer Name']||'customer'),
    category:'marketing'
  });
  if(result.queued){
    var record=Object.assign({},job,{
      'Review Nudged At':(typeof now==='function'?now():new Date().toISOString()),
      'Review Nudge Platform':next.key,
      'Record Version':(parseInt(job['Record Version']||job.recordVersion||0,10)||0)+1
    });
    var jid=job['Job ID']||job.jobId;
    await queueOperation('SAVE_JOB','Job',jid,{jobId:jid,record:record},
      {collection:'jobs',record:record,idKeys:['Job ID']});
    if(typeof renderWork==='function')renderWork();
  }
  return result;
}
// ---------- Auto-send review requests (pre-approved by toggle) ----------
// When the owner enables "Auto-send review requests", this whole message
// category is pre-approved: no per-job confirm. Consent, STOP, quiet hours,
// and SMS category preferences are still enforced by H38Sms.sendSms.
async function autoSendReviewRequest(jobId){
  var job=getJob(jobId);
  if(!job)throw new Error('Job not found.');
  if(text(job['Review Asked']||job.reviewAsked))return {skipped:'already-asked'};
  var customer=getCustomer(job['Customer ID']||job.customerId);
  if(!customer)throw new Error('Customer not found for this job.');
  var phone=customerPhone(customer);
  if(!phone)throw new Error('No phone number on file for '+text(customer['Customer Name']||'this customer')+'. Add one to their customer record first.');
  var profile=getBusinessProfile();
  var platform=nextReviewPlatform(profile);
  var body=renderReviewTemplate(customer,profile,platform);
  if(!text(body))throw new Error('Review request message is empty. Set a template in Settings.');
  var delayKey=getReviewDelay();
  var deliverAfter=reviewDeliverAfter(delayKey);
  if(!window.H38Sms||typeof window.H38Sms.sendSms!=='function'){
    throw new Error('SMS module is still loading. Try again in a moment.');
  }
  var result=await window.H38Sms.sendSms({
    to:phone,body:body,consentStatus:'Consented',
    purpose:'Review request ('+platform.label+')',category:'marketing',
    preApproved:true,deliverAfter:deliverAfter
  });
  var stored=storedReviewProfile();
  stored.lastReviewPlatform=platform.key;
  persistReviewProfile(stored);
  var record=Object.assign({},job,{
    'Review Asked':new Date().toLocaleDateString(),
    'Review Asked At':(typeof now==='function'?now():new Date().toISOString()),
    'Review Platform':platform.key,
    'Review Sent Via':'auto',
    'Record Version':(parseInt(job['Record Version']||job.recordVersion||0,10)||0)+1
  });
  var jid=job['Job ID']||job.jobId;
  await queueOperation('SAVE_JOB','Job',jid,{jobId:jid,record:record},
    {collection:'jobs',record:record,idKeys:['Job ID']});
  // Immediate: try to send right away through the pre-approved path.
  // Delayed or offline: stays "Approved — Queued to Send" with Deliver After;
  // processDueReviewSends() picks it up when due.
  var sentNow=false;
  if(!deliverAfter&&window.H38SmsApproval&&typeof window.H38SmsApproval.sendApprovedThread==='function'){
    try{
      var r=await window.H38SmsApproval.sendApprovedThread(result.threadId);
      sentNow=!!(r&&r.sent);
    }catch(e){ sentNow=false; }
  }
  if(typeof toast==='function'){
    toast(deliverAfter
      ?'Review request scheduled for '+text(customer['Customer Name']||'customer')+'.'
      :(sentNow?'Review request sent to '+text(customer['Customer Name']||'customer')+'.':'Review request queued — will send automatically.'));
  }
  if(typeof renderWork==='function')renderWork();
  return {sent:sentNow,queued:!sentNow,threadId:result.threadId,deliverAfter:deliverAfter};
}
// Periodic processor: send due auto review requests. Runs on load and every
// minute while the app is visible. Idempotent: sendApprovedThread flips the
// thread to Sent/Failed, so a re-run never double-sends.
var _rrProcessorRunning=false;
async function processDueReviewSends(){
  if(_rrProcessorRunning)return;
  if(!commsFeatureEnabled('auto_send_review_requests'))return;
  if(typeof document!=='undefined'&&document.hidden)return;
  var approval=window.H38SmsApproval;
  if(!approval||typeof approval.sendApprovedThread!=='function')return;
  var list=[];
  try{ list=(typeof records==='function'?records('smsThreads'):[])||[]; }catch(e){ return; }
  var nowMs=Date.now(),due=[];
  for(var i=0;i<list.length;i++){
    var t=list[i]||{};
    var purpose=text(t['Purpose']||'');
    if(purpose.indexOf('Review request')!==0)continue;
    if(text(t['Status']||'')!=='Approved — Queued to Send')continue;
    var after=text(t['Deliver After']||'');
    if(!after)continue; // immediate ones were sent inline
    var at=Date.parse(after);
    if(!at||at>nowMs)continue;
    due.push(t);
  }
  if(!due.length)return;
  _rrProcessorRunning=true;
  try{
    for(var j=0;j<due.length;j++){
      var tid=text(due[j]['SMS Thread ID']||'');
      if(!tid)continue;
      try{ await approval.sendApprovedThread(tid); }
      catch(e){ /* Failed status recorded; owner sees it in the queue */ }
    }
  }finally{ _rrProcessorRunning=false; }
}
function startReviewSendProcessor(){
  try{
    if(typeof window==='undefined')return;
    if(window.__h38ReviewSendProcessor)return;
    window.__h38ReviewSendProcessor=true;
    // First pass shortly after load (lets the snapshot hydrate), then every minute.
    setTimeout(function(){ try{processDueReviewSends();}catch(e){} },15000);
    setInterval(function(){ try{processDueReviewSends();}catch(e){} },60000);
  }catch(e){}
}
// Called when a job is marked Complete. Prompts once per job (checks Review Asked).
async function maybeAutoAskReview(job){
  if(text(job['Review Asked']||job.reviewAsked))return {skipped:'already-asked'};
  // Auto-send wins when enabled: no per-job prompt, pre-approved category send.
  if(commsFeatureEnabled('auto_send_review_requests')){
    var jid=job['Job ID']||job.jobId;
    try{ return await autoSendReviewRequest(jid); }
    catch(e){
      if(typeof toast==='function')toast('Auto review request: '+(e.message||e),true);
      return {failed:String(e.message||e)};
    }
  }
  if(!commsFeatureEnabled('auto_review_requests'))return {skipped:'disabled'};
  var customer=getCustomer(job['Customer ID']||job.customerId);
  var name=customer?text(customer['Customer Name']||customer.name):'the customer';
  var ok=window.confirm('Job complete. Send a Google review request text to '+name+'?');
  if(!ok)return {skipped:'declined'};
  return askForReview(job['Job ID']||job.jobId);
}
// ---------- Auto invoice draft on job completion ----------
// Rick's call (2026-10-26): "invoice drafts itself the second a job is
// marked done — owner just taps send." So when a job completes, draft its
// invoice in the same invoices collection the Money screen uses, priced
// from the job's quote lines where the job carries them. NOTHING sends:
// the draft is a normal Money draft ("Send Allowed: No") and the send step
// stays exactly the existing owner action in Money.
var AUTO_INVOICE_SOURCE='Auto-draft on job completion';
var moneyNum=function(v){
  if(typeof v==='number')return isFinite(v)?v:0;
  var n=parseFloat(String(v==null?'':v).replace(/[^0-9.\-]/g,''));
  return isFinite(n)?n:0;
};
var round2=function(n){return Math.round(n*100)/100;};
function autoInvoiceEnabled(){
  // Owner Controls toggle, stored server-side per business (FeatureToggles
  // collection). Default ON — including when Owner Controls is not loaded.
  try{
    if(window.H38OwnerControls&&typeof window.H38OwnerControls.isEnabled==='function'){
      return window.H38OwnerControls.isEnabled('auto_invoice_on_complete')!==false;
    }
  }catch(e){}
  return true;
}
function getQuoteById(quoteId){
  var list=[];
  try{ list=(typeof records==='function'?records('quotes'):[])||[]; }catch(e){ return null; }
  for(var i=0;i<list.length;i++){
    if(String(list[i]['Quote ID']||list[i].quoteId||'')===String(quoteId))return list[i];
  }
  return null;
}
function existingJobInvoice(jobId){
  var list=[];
  try{ list=(typeof records==='function'?records('invoices'):[])||[]; }catch(e){ return null; }
  for(var i=0;i<list.length;i++){
    if(String(list[i]['Job ID']||list[i].jobId||'')!==String(jobId))continue;
    var st=text(list[i]['Status']||'').toLowerCase();
    if(!/void|delet|cancel/.test(st))return list[i];
  }
  return null;
}
function autoInvoiceLines(job){
  // Price cascade — never invents a price:
  // quote lines -> quote total -> the job's own stated rate -> $0.
  var title=text(job['Project Title']||job['Job Name']||job['Job Number']||'Job work');
  var quoteId=text(job['Quote ID']||job['Source Quote ID']||job.quoteId||'');
  var quote=quoteId?getQuoteById(quoteId):null;
  if(quote&&Array.isArray(quote.lines)&&quote.lines.length){
    var lines=quote.lines.map(function(l){
      return {
        description:text(l&&l.description)||title,
        quantity:moneyNum(l&&l.quantity)||1,
        unit:text(l&&l.unit)||'each',
        unitPrice:moneyNum(l&&l.unitPrice)
      };
    });
    var subtotal=round2(lines.reduce(function(s,l){return s+l.quantity*l.unitPrice;},0));
    var tax=round2(moneyNum(quote.Tax));
    return {lines:lines,subtotal:subtotal,tax:tax,total:round2(subtotal+tax),priced:subtotal>0||tax>0};
  }
  if(quote){
    var quoteTotal=round2(moneyNum(quote.Total));
    if(quoteTotal>0)return {lines:[{description:title,quantity:1,unit:'each',unitPrice:quoteTotal}],subtotal:quoteTotal,tax:0,total:quoteTotal,priced:true};
  }
  var rate=round2(moneyNum(job['Service Rate']||job['Plowing Rate']||job['Mowing Rate']||job['Rate']||job.serviceRate));
  if(rate>0)return {lines:[{description:title,quantity:1,unit:'each',unitPrice:rate}],subtotal:rate,tax:0,total:rate,priced:true};
  return {lines:[{description:title,quantity:1,unit:'each',unitPrice:0}],subtotal:0,tax:0,total:0,priced:false};
}
async function autoDraftInvoiceForJob(job){
  var jobId=text(job&&((job['Job ID']||job.jobId)));
  if(!jobId||typeof queueOperation!=='function')return {skipped:'unavailable'};
  if(!autoInvoiceEnabled())return {skipped:'disabled'};
  var existing=existingJobInvoice(jobId);
  if(existing)return {skipped:'exists',invoiceId:text(existing['Invoice ID'])};
  var built=autoInvoiceLines(job);
  var id=(typeof window.newId==='function'?window.newId('INVOICE'):'INVOICE-'+Date.now());
  var stamp=(typeof now==='function'?now():new Date().toISOString());
  var record={
    'Invoice ID':id,
    'Business ID':text(window.state&&window.state.businessId),
    'Customer ID':text(job['Customer ID']||job.customerId),
    'Job ID':jobId,
    'Invoice Number':'LOCAL-'+Date.now(),
    'Status':'Draft',
    'Send Allowed':'No',
    'Delivery Status':'Not Sent',
    'Due Date':'',
    'Subtotal':built.subtotal,
    'Tax':built.tax,
    'Total':built.total,
    'Balance':built.total,
    'Source':AUTO_INVOICE_SOURCE,
    lines:built.lines,
    'Created Time':stamp,
    'Updated Time':stamp,
    'Record Version':1
  };
  if(!built.priced){
    record['Notes']='Auto-drafted when this job was marked done. The job and its quote had no price on them, so set the amount here before you send it.';
  }
  await queueOperation('SAVE_INVOICE','Invoice',id,
    {invoiceId:id,customerId:record['Customer ID'],jobId:jobId,dueDate:'',lines:built.lines,tax:built.tax},
    {collection:'invoices',record:record,idKeys:['Invoice ID']});
  // The server lifecycle trigger created a "Prepare invoice" owner task
  // when the job was saved complete (no invoice existed at that moment).
  // Re-saving the job now that the draft exists lets the same reconcile
  // close that task — the owner's next step is reviewing the draft, not
  // preparing one. Best-effort: if this touch fails, the task still
  // closes on the job's next save.
  try{
    var fresh=getJob(jobId)||job;
    var touch=Object.assign({},fresh,{
      'Updated Time':(typeof now==='function'?now():new Date().toISOString()),
      'Record Version':(parseInt(fresh['Record Version']||fresh.recordVersion||0,10)||0)+1
    });
    await queueOperation('SAVE_JOB','Job',jobId,{jobId:jobId,record:touch},
      {collection:'jobs',record:touch,idKeys:['Job ID']});
  }catch(e){/* the Prepare-invoice task closes on the job's next save instead */}
  return {created:true,invoiceId:id,total:built.total,priced:built.priced};
}

async function markJobComplete(jobId){
  var job=getJob(jobId);
  if(!job)throw new Error('Job not found.');
  var record=Object.assign({},job,{
    'Status':'Complete',
    'Updated Time':(typeof now==='function'?now():new Date().toISOString()),
    'Record Version':(parseInt(job['Record Version']||job.recordVersion||0,10)||0)+1
  });
  try{
    await queueOperation('SAVE_JOB','Job',jobId,{jobId:jobId,record:record},
      {collection:'jobs',record:record,idKeys:['Job ID']});
  }catch(error){
    // Lifecycle completion gate refused the write. If what is missing is the
    // required "Completion quality" checklist, create it (or focus the one
    // that exists) and tell the user the exact next step instead of failing.
    var lifecycleApi=window.H38_JOB_LIFECYCLE||window.H38JobLifecycle;
    var blockers=(error&&error.h38GateBlockers)||[];
    var checklistBlocker=blockers.some(function(b){return /checklist/i.test(String(b));});
    if(error&&error.h38GateBlock&&checklistBlocker&&lifecycleApi&&typeof lifecycleApi.ensureCompletionChecklist==='function'){
      var ensured=null;
      try{ensured=await lifecycleApi.ensureCompletionChecklist(jobId);}catch(_){ensured=null;}
      if(typeof lifecycleApi.focusJob==='function')lifecycleApi.focusJob(jobId);
      if(typeof toast==='function')toast(ensured&&ensured.created
        ?'Added the required "Completion quality" checklist for this job. Finish its items in the Job Lifecycle panel, then tap Mark Complete again.'
        :'This job cannot be completed yet. Finish the "Completion quality" checklist in the Job Lifecycle panel, then tap Mark Complete again.',true);
      return {blocked:'completion-checklist',checklistCreated:!!(ensured&&ensured.created)};
    }
    throw error;
  }
  // Auto-draft the invoice (Rick's 2026-10-26 call). A draft failure must
  // never break completion — the job is already saved complete.
  var autoInvoice=null;
  try{autoInvoice=await autoDraftInvoiceForJob(record);}catch(e){autoInvoice={failed:String(e&&e.message||e)};}
  if(typeof toast==='function'){
    if(autoInvoice&&autoInvoice.created){
      toast(autoInvoice.priced
        ?'Job marked complete. Invoice drafted — review & send in Money.'
        :'Job marked complete. Invoice drafted at $0 — set the amount in Money, then review & send.');
    }else if(autoInvoice&&autoInvoice.skipped==='exists'){
      toast('Job marked complete. An invoice already exists for this job — review & send in Money.');
    }else{
      toast('Job marked complete.');
      if(autoInvoice&&autoInvoice.failed)toast('The invoice draft could not be created ('+autoInvoice.failed+'). Prepare the invoice in Money as usual.',true);
    }
  }
  // Auto review prompt (respects the per-tenant toggle)
  try{await maybeAutoAskReview(Object.assign({},record));}catch(e){
    if(typeof toast==='function')toast('Review request: '+(e.message||e),true);
  }
  if(typeof renderWork==='function')renderWork();
}

// ---------- Review request log (tracking) ----------
// Recent review request sends from the SMS threads log: who, when, status.
function reviewRequestsLog(limit){
  var list=[];
  try{ list=(typeof records==='function'?records('smsThreads'):[])||[]; }catch(e){ return []; }
  var out=[];
  for(var i=0;i<list.length;i++){
    var t=list[i]||{};
    var purpose=text(t['Purpose']||'');
    if(purpose.indexOf('Review request')!==0&&purpose.indexOf('Review follow-up')!==0)continue;
    out.push({
      to:text(t['Customer Number']||''),
      purpose:purpose,
      status:text(t['Status']||''),
      body:text(t['Pending Body']||''),
      sentAt:text(t['Sent Time']||t['Last Message Time']||''),
      deliverAfter:text(t['Deliver After']||''),
      threadId:text(t['SMS Thread ID']||'')
    });
  }
  out.sort(function(a,b){return String(b.sentAt).localeCompare(String(a.sentAt));});
  return out.slice(0,limit||20);
}

// ---------- Public API ----------
window.H38CustomerComms={
  getBusinessProfile:getBusinessProfile,
  saveGoogleReviewLink:saveGoogleReviewLink,
  saveReviewLinks:saveReviewLinks,
  saveReviewTemplate:saveReviewTemplate,
  saveReviewDelay:saveReviewDelay,
  getReviewTemplate:getReviewTemplate,
  getReviewDelay:getReviewDelay,
  reviewDelayOptions:function(){return REVIEW_DELAY_OPTIONS.slice();},
  nextReviewPlatform:nextReviewPlatform,
  reviewNudgeCandidates:reviewNudgeCandidates,
  sendReviewNudge:sendReviewNudge,
  buildReviewNudgeMessage:buildReviewNudgeMessage,
  buildOnMyWayMessage:buildOnMyWayMessage,
  buildReviewRequestMessage:buildReviewRequestMessage,
  renderReviewTemplate:renderReviewTemplate,
  sendOnMyWay:sendOnMyWay,
  askForReview:askForReview,
  autoSendReviewRequest:autoSendReviewRequest,
  processDueReviewSends:processDueReviewSends,
  reviewRequestsLog:reviewRequestsLog,
  maybeAutoAskReview:maybeAutoAskReview,
  markJobComplete:markJobComplete,
  autoDraftInvoiceForJob:autoDraftInvoiceForJob,
  autoInvoiceEnabled:autoInvoiceEnabled,
  onMyWayEnabled:function(){return commsFeatureEnabled('on_my_way_texts');},
  autoReviewEnabled:function(){return commsFeatureEnabled('auto_review_requests');},
  autoSendReviewEnabled:function(){return commsFeatureEnabled('auto_send_review_requests');}
};
startReviewSendProcessor();
})();
