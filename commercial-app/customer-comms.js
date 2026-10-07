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
function getBusinessProfile(){
  var snap=(window.state&&window.state.snapshot&&window.state.snapshot.business)||{};
  var stored={};
  try{stored=JSON.parse(localStorage.getItem(profileKey())||'{}');}catch(e){}
  return {
    businessName:text(snap.businessName)||'your contractor',
    googleReviewLink:text(stored.googleReviewLink||''),
    facebookReviewLink:text(stored.facebookReviewLink||''),
    yelpReviewLink:text(stored.yelpReviewLink||''),
    lastReviewPlatform:text(stored.lastReviewPlatform||'')
  };
}
function persistReviewProfile(stored){
  localStorage.setItem(profileKey(),JSON.stringify(stored));
  if(window.state&&window.state.businessId&&typeof queueOperation==='function'){
    queueOperation('SAVE_BUSINESS_PROFILE','BusinessProfile',window.state.businessId,
      {googleReviewLink:text(stored.googleReviewLink||''),facebookReviewLink:text(stored.facebookReviewLink||''),yelpReviewLink:text(stored.yelpReviewLink||''),lastReviewPlatform:text(stored.lastReviewPlatform||''),updatedAt:new Date().toISOString()}
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
// Called when a job is marked Complete. Prompts once per job (checks Review Asked).
async function maybeAutoAskReview(job){
  if(!commsFeatureEnabled('auto_review_requests'))return {skipped:'disabled'};
  if(text(job['Review Asked']||job.reviewAsked))return {skipped:'already-asked'};
  var customer=getCustomer(job['Customer ID']||job.customerId);
  var name=customer?text(customer['Customer Name']||customer.name):'the customer';
  var ok=window.confirm('Job complete. Send a Google review request text to '+name+'?');
  if(!ok)return {skipped:'declined'};
  return askForReview(job['Job ID']||job.jobId);
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
  if(typeof toast==='function')toast('Job marked complete.');
  // Auto review prompt (respects the per-tenant toggle)
  try{await maybeAutoAskReview(Object.assign({},record));}catch(e){
    if(typeof toast==='function')toast('Review request: '+(e.message||e),true);
  }
  if(typeof renderWork==='function')renderWork();
}

// ---------- Public API ----------
window.H38CustomerComms={
  getBusinessProfile:getBusinessProfile,
  saveGoogleReviewLink:saveGoogleReviewLink,
  saveReviewLinks:saveReviewLinks,
  nextReviewPlatform:nextReviewPlatform,
  reviewNudgeCandidates:reviewNudgeCandidates,
  sendReviewNudge:sendReviewNudge,
  buildReviewNudgeMessage:buildReviewNudgeMessage,
  buildOnMyWayMessage:buildOnMyWayMessage,
  buildReviewRequestMessage:buildReviewRequestMessage,
  sendOnMyWay:sendOnMyWay,
  askForReview:askForReview,
  maybeAutoAskReview:maybeAutoAskReview,
  markJobComplete:markJobComplete,
  onMyWayEnabled:function(){return commsFeatureEnabled('on_my_way_texts');},
  autoReviewEnabled:function(){return commsFeatureEnabled('auto_review_requests');}
};
})();
