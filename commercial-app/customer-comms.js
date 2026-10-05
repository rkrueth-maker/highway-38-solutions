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
    googleReviewLink:text(stored.googleReviewLink||'')
  };
}
function saveGoogleReviewLink(url){
  var key=profileKey(),stored={};
  try{stored=JSON.parse(localStorage.getItem(key)||'{}');}catch(e){}
  stored.googleReviewLink=text(url);
  localStorage.setItem(key,JSON.stringify(stored));
  if(window.state&&window.state.businessId&&typeof queueOperation==='function'){
    queueOperation('SAVE_BUSINESS_PROFILE','BusinessProfile',window.state.businessId,
      {googleReviewLink:stored.googleReviewLink,updatedAt:new Date().toISOString()}
    ).catch(function(){});
  }
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
function buildReviewRequestMessage(customer,profile){
  var msg='Thanks for choosing '+profile.businessName+'! Would you mind leaving us a Google review?';
  if(profile.googleReviewLink)msg+=' '+profile.googleReviewLink;
  else msg+=' It really helps our small business.';
  return msg;
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
function markReviewAsked(job){
  var record=Object.assign({},job,{
    'Review Asked':new Date().toLocaleDateString(),
    'Review Asked At':(typeof now==='function'?now():new Date().toISOString()),
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
  var body=buildReviewRequestMessage(customer,profile);
  var result=await previewAndQueueSms({
    to:phone,body:body,purpose:'Review request',
    customerLabel:text(customer['Customer Name']||'customer'),
    category:'marketing'
  });
  if(result.queued){
    await markReviewAsked(job);
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
  await queueOperation('SAVE_JOB','Job',jobId,{jobId:jobId,record:record},
    {collection:'jobs',record:record,idKeys:['Job ID']});
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
