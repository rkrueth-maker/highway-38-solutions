// H38 Card Vault: card-on-file + one-tap invoice charge + approval-gated auto-charge.
// v2.0 (2026-10-05).
//
// SECURITY MODEL — read before touching:
//   - The vault stores PROCESSOR TOKENS ONLY. Raw card numbers (PAN), CVC,
//     and magnetic-stripe data are NEVER collected, stored, or transmitted by
//     this module. A guard rejects any value that looks like a raw PAN.
//   - Real card entry happens ONLY inside the payment processor's own secure
//     UI (Stripe.js card element), which tokenizes in the browser and hands
//     back a token. The Office never sees the number.
//   - The built-in "H38 Test Payments" provider moves NO real money. It exists
//     for setup, training, and UI testing. Test cards are picked from a list —
//     there is deliberately no free-form card-number field in test mode.
//   - Charging money is an external action. Manual charges require an explicit
//     owner confirm dialog. Auto-charge NEVER executes silently: it writes an
//     approval request and waits for an owner to approve it.
//   - Processor tokens live in the tenant's business_records (paymentMethods
//     collection), which is tenant-scoped like every other record. Tokens are
//     useless without the processor's secret key, which lives only in the
//     edge function — never in the app, the database, or localStorage.
//
// Providers: 'local' (H38 Test Payments, default, no money moves) and
// 'stripe' (live; requires the owner's publishable key in this module's
// settings and STRIPE_SECRET_KEY deployed on the h38-payment-charge
// edge function). The provider interface is pluggable for future processors.
(function(){
'use strict';

var BUILD='20261005-cardvault-1';

// ---------- helpers ----------
function text(v){return String(v==null?'':v).trim();}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function num(v){var n=Number(v);return isFinite(n)?n:0;}
function businessId(){return text(window.state&&window.state.businessId);}
function rows(name){
  try{
    if(typeof records==='function'){var r=records(name);return Array.isArray(r)?r:[];}
  }catch(e){}
  var s=window.state||{};return (s.snapshot&&Array.isArray(s.snapshot[name]))?s.snapshot[name]:[];
}
function val(row){for(var i=1;i<arguments.length;i++){var k=arguments[i];if(row&&row[k]!=null&&String(row[k])!=='')return row[k];}return '';}
function rowId(row){return text(row&& (row['Customer ID']||row['Invoice ID']||row['Payment Method ID']||row['Approval ID']||row.customerId||row.invoiceId||row.id));}
function money(v){return (typeof moneyFmt==='function')?moneyFmt(v):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(num(v));}
function moneyFmt(v){try{if(typeof window.money==='function')return window.money(v);}catch(e){}return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(num(v));}
function nowIso(){try{if(typeof now==='function')return now();}catch(e){}return new Date().toISOString();}
function newRecId(prefix){try{if(typeof newId==='function')return newId(prefix);}catch(e){}return (prefix||'CV')+'-'+Date.now()+'-'+Math.floor(Math.random()*1e6);}
function toastOk(msg){try{if(typeof toast==='function')toast(msg);else alert(msg);}catch(e){alert(msg);}}
function toastErr(msg){try{if(typeof toast==='function')toast(msg,true);else alert(msg);}catch(e){alert(msg);}}
function vaultEnabled(){
  try{
    if(window.H38OwnerControls&&typeof window.H38OwnerControls.isEnabled==='function')
      return window.H38OwnerControls.isEnabled('card_on_file');
  }catch(e){}
  return true; // default ON when Owner Controls is not loaded
}

// ---------- provider abstraction ----------
var PROVIDERS={
  local:{id:'local',name:'H38 Test Payments',desc:'Simulated charges for setup and training. No real money moves.',isTest:true},
  stripe:{id:'stripe',name:'Stripe',desc:'Live card processing via Stripe. Requires owner keys and the payment edge function.',isTest:false}
};
function configKey(){return 'h38-payment-config-'+(businessId()||'none');}
function getConfig(){
  var cfg={provider:'local',stripePublishableKey:''};
  try{
    var raw=localStorage.getItem(configKey());
    if(raw){var p=JSON.parse(raw);if(p&&typeof p==='object')cfg=Object.assign(cfg,p);}
  }catch(e){}
  if(!PROVIDERS[cfg.provider])cfg.provider='local';
  return cfg;
}
function saveConfig(cfg){
  try{localStorage.setItem(configKey(),JSON.stringify(cfg));}catch(e){}
  // Local-only: the sync layer has no SAVE_PAYMENT_CONFIG handler, so queueing
  // it would leave a perpetually-pending op. Config is per-device by design.
}

// ---------- payment methods (token vault) ----------
// Collection: 'paymentMethods'. Token-only storage; see header comment.
function activeMethods(customerId){
  var cid=text(customerId);
  return rows('paymentMethods').filter(function(r){
    return text(val(r,'Customer ID','customerId'))===cid&&text(val(r,'Status')||'Active')==='Active';
  });
}
function defaultMethod(customerId){
  var list=activeMethods(customerId);
  return list.find(function(r){return val(r,'Is Default','isDefault')===true||String(val(r,'Is Default','isDefault'))==='true';})||list[0]||null;
}
function autoChargeEnabled(customerId){
  var m=defaultMethod(customerId);
  if(!m)return false;
  var v=val(m,'Auto Charge','autoCharge');
  return v===true||String(v).toLowerCase()==='true';
}
// PAN guard: refuse anything that looks like a raw card number.
function looksLikePan(value){
  var d=String(value||'').replace(/\D/g,'');
  return d.length>=13&&d.length<=19&&/^\d+$/.test(d);
}
function methodLabel(m){
  if(!m)return 'No card on file';
  return text(val(m,'Card Brand','brand')||'Card')+' \u00b7\u00b7\u00b7\u00b7 '+text(val(m,'Last 4','last4')||'????');
}
async function addMethod(customerId,info){
  info=info||{};
  var provider=text(info.provider||getConfig().provider);
  if(!PROVIDERS[provider])provider='local';
  var token=text(info.token);
  if(!token)throw new Error('Card token is missing. The card was not saved.');
  if(looksLikePan(token))throw new Error('Refusing to store a raw card number. Only processor tokens may be saved.');
  if(looksLikePan(info.last4)&&String(info.last4).replace(/\D/g,'').length>4)
    throw new Error('Refusing to store full card details. Only the last 4 digits may be saved.');
  var brand=text(info.brand||'Card'),last4=text(info.last4||'').replace(/\D/g,'').slice(-4);
  if(!/^\d{4}$/.test(last4))throw new Error('Card last 4 is invalid.');
  var expiry=text(info.expiry||'');
  if(expiry&&!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry))throw new Error('Expiry must be MM/YY.');
  var existing=activeMethods(customerId);
  var id=newRecId('PAYMETHOD');
  var record={
    'Payment Method ID':id,'Business ID':businessId(),'Customer ID':text(customerId),
    'Provider':provider,'Processor Token':token,
    'Card Brand':brand,'Last 4':last4,'Expiry':expiry,
    'Is Default':existing.length===0,'Auto Charge':false,'Status':'Active',
    'Created Time':nowIso(),'Updated Time':nowIso(),'Record Version':1
  };
  await queueOperation('SAVE_ENTITY','PaymentMethod',id,
    {entity:'paymentMethods',record:record},
    {collection:'paymentMethods',record:record,idKeys:['Payment Method ID']});
  return record;
}
async function removeMethod(paymentMethodId){
  var list=rows('paymentMethods');
  var row=list.find(function(r){return text(val(r,'Payment Method ID','paymentMethodId'))===text(paymentMethodId);});
  if(!row)throw new Error('Payment method not found.');
  var updated=Object.assign({},row,{'Status':'Removed','Is Default':false,'Updated Time':nowIso(),
    'Record Version':num(val(row,'Record Version','recordVersion'))+1});
  delete updated.__localPending;
  await queueOperation('SAVE_ENTITY','PaymentMethod',text(paymentMethodId),
    {entity:'paymentMethods',record:updated},
    {collection:'paymentMethods',record:updated,idKeys:['Payment Method ID']});
}
async function setDefaultMethod(paymentMethodId){
  var row=rows('paymentMethods').find(function(r){return text(val(r,'Payment Method ID','paymentMethodId'))===text(paymentMethodId);});
  if(!row)throw new Error('Payment method not found.');
  var cid=text(val(row,'Customer ID','customerId'));
  var jobs=activeMethods(cid).map(function(m){
    var isTarget=text(val(m,'Payment Method ID','paymentMethodId'))===text(paymentMethodId);
    var upd=Object.assign({},m,{'Is Default':isTarget,'Updated Time':nowIso(),
      'Record Version':num(val(m,'Record Version','recordVersion'))+1});
    delete upd.__localPending;
    return queueOperation('SAVE_ENTITY','PaymentMethod',text(val(m,'Payment Method ID','paymentMethodId')),
      {entity:'paymentMethods',record:upd},
      {collection:'paymentMethods',record:upd,idKeys:['Payment Method ID']});
  });
  await Promise.all(jobs);
}
async function setAutoCharge(customerId,enabled){
  var m=defaultMethod(customerId);
  if(!m)throw new Error('Add a card on file before turning on auto-charge.');
  var updated=Object.assign({},m,{'Auto Charge':!!enabled,'Updated Time':nowIso(),
    'Record Version':num(val(m,'Record Version','recordVersion'))+1});
  delete updated.__localPending;
  await queueOperation('SAVE_ENTITY','PaymentMethod',text(val(m,'Payment Method ID','paymentMethodId')),
    {entity:'paymentMethods',record:updated},
    {collection:'paymentMethods',record:updated,idKeys:['Payment Method ID']});
  return updated;
}

// ---------- providers: tokenize + charge ----------
var stripeJsPromise=null;
function loadStripeJs(publishableKey){
  if(!publishableKey)throw new Error('Stripe publishable key is not configured. Add it in the card settings below.');
  if(stripeJsPromise)return stripeJsPromise;
  stripeJsPromise=new Promise(function(resolve,reject){
    var s=document.createElement('script');
    s.src='https://js.stripe.com/v3/';
    s.onload=function(){try{resolve(window.Stripe(publishableKey));}catch(e){reject(new Error('Stripe failed to initialize.'));}};
    s.onerror=function(){reject(new Error('Could not load Stripe.js. Check the network connection.'));};
    document.head.appendChild(s);
  });
  return stripeJsPromise;
}
// Tokenize: local provider uses picked TEST cards (no PAN entry allowed).
var TEST_CARDS=[
  {brand:'Visa',last4:'4242',tokenSuffix:'visa4242',note:'Test approval'},
  {brand:'Visa',last4:'0002',tokenSuffix:'visa0002',note:'Test decline'},
  {brand:'Mastercard',last4:'5555',tokenSuffix:'mc5555',note:'Test approval'},
  {brand:'Amex',last4:'3782',tokenSuffix:'amex3782',note:'Test approval'},
  {brand:'Discover',last4:'6011',tokenSuffix:'disc6011',note:'Test approval'}
];
function localTokenize(pick){
  var card=TEST_CARDS.find(function(c){return c.tokenSuffix===pick;})||TEST_CARDS[0];
  return {token:'test_pm_'+card.tokenSuffix+'_'+Date.now().toString(36),brand:card.brand,last4:card.last4};
}
function supabaseClient(){
  try{
    if(window.H38_SUPABASE_SHARED_CLIENT&&typeof window.H38_SUPABASE_SHARED_CLIENT.ensure==='function')
      return window.H38_SUPABASE_SHARED_CLIENT.ensure();
  }catch(e){}
  return null;
}
async function executeCharge(opts){
  // opts: {paymentMethodId, invoiceId, amount, approvedBy}
  opts=opts||{};
  var method=rows('paymentMethods').find(function(r){return text(val(r,'Payment Method ID','paymentMethodId'))===text(opts.paymentMethodId);});
  if(!method)throw new Error('Payment method not found.');
  if(text(val(method,'Status')||'Active')!=='Active')throw new Error('That card is no longer active.');
  var provider=text(val(method,'Provider','provider')||'local');
  var amount=num(opts.amount);
  if(!(amount>0))throw new Error('Charge amount must be greater than zero.');
  var invoice=rows('invoices').find(function(r){return text(val(r,'Invoice ID','invoiceId'))===text(opts.invoiceId);});
  if(!invoice)throw new Error('Invoice not found.');
  var balance=num(val(invoice,'Balance','Balance Due','Amount Due','Open Balance'));
  if(amount>balance+0.005)throw new Error('Charge amount cannot exceed the open invoice balance of '+moneyFmt(balance)+'.');

  var txn;
  if(provider==='stripe'){
    txn=await stripeCharge(method,invoice,amount,opts);
  }else{
    txn=await localCharge(method,amount);
  }
  // Record the payment + update the invoice (same shape as manual payments).
  var paymentId=newRecId('PAYMENT');
  var methodText='Card on file \u2014 '+text(val(method,'Card Brand','brand'))+' \u00b7\u00b7\u00b7\u00b7 '+text(val(method,'Last 4','last4'))
    +(provider==='local'?' (TEST \u2014 no money moved)':' (Stripe)');
  var paymentRecord={
    'Payment ID':paymentId,'Business ID':businessId(),'Invoice ID':text(val(invoice,'Invoice ID','invoiceId')),
    'Amount':amount,'Method':methodText,'Reference':txn.transactionId,
    'Status':provider==='local'?'Charged \u2014 Test (No Money Moved)':'Charged \u2014 Processor',
    'Payment Method ID':text(val(method,'Payment Method ID','paymentMethodId')),
    'Processed Time':nowIso(),'Processed By':text(opts.approvedBy||''),
    'Created Time':nowIso(),'Updated Time':nowIso(),'Record Version':1
  };
  await queueOperation('SAVE_ENTITY','Payment',paymentId,
    {entity:'payments',record:paymentRecord},
    {collection:'payments',record:paymentRecord,idKeys:['Payment ID']});
  var nextBalance=Math.max(0,balance-amount);
  var updated=Object.assign({},invoice,{
    'Balance':nextBalance,'Balance Due':nextBalance,'Amount Due':nextBalance,'Open Balance':nextBalance,
    'Status':nextBalance<=0.005?'Paid':'Partially Paid',
    'Paid Time':nextBalance<=0.005?nowIso():val(invoice,'Paid Time','paidTime'),
    'Updated Time':nowIso(),'Record Version':num(val(invoice,'Record Version','recordVersion'))+1
  });
  delete updated.__localPending;
  await queueOperation('SAVE_ENTITY','Invoice',text(val(invoice,'Invoice ID','invoiceId')),
    {entity:'invoices',record:updated},
    {collection:'invoices',record:updated,idKeys:['Invoice ID']});
  return {payment:paymentRecord,invoice:updated,method:method,transactionId:txn.transactionId,
    provider:provider,amount:amount,isTest:provider==='local'};
}
function localCharge(method,amount){
  return new Promise(function(resolve,reject){
    setTimeout(function(){
      var last4=text(val(method,'Last 4','last4'));
      if(last4==='0002')return reject(new Error('Test card declined (simulated). Pick the Visa 4242 test card to simulate approval.'));
      resolve({transactionId:'TEST-'+Date.now().toString(36).toUpperCase()});
    },700);
  });
}
async function stripeCharge(method,invoice,amount,opts){
  var cfg=getConfig();
  if(!cfg.stripePublishableKey)throw new Error('Stripe is not configured. Add the publishable key in card settings.');
  var api=supabaseClient();
  if(!api||!api.functions||typeof api.functions.invoke!=='function')
    throw new Error('Secure payment connection is unavailable.');
  var res=await api.functions.invoke('h38-payment-charge',{body:{
    businessId:businessId(),
    invoiceId:text(val(invoice,'Invoice ID','invoiceId')),
    paymentMethodToken:text(val(method,'Processor Token','token')),
    amountCents:Math.round(amount*100),
    currency:'usd',
    description:'H38 invoice '+text(val(invoice,'Invoice Number','invoiceNumber')),
    customerLabel:text(opts.customerLabel||''),
    ownerApproved:!!opts.approvedBy,
    approvedBy:text(opts.approvedBy||'')
  }});
  if(res.error)throw new Error(res.error.message||'Payment processor call failed.');
  var data=res.data||{};
  if(data.status!=='PASS')throw new Error(data.error||'The card charge was not approved by the processor.');
  return {transactionId:text(data.transactionId||data.paymentIntentId||('pi_'+Date.now()))};
}

// ---------- manual one-tap charge (explicit owner confirm) ----------
async function chargeInvoice(invoiceId){
  if(!vaultEnabled()){toastErr('Card charges are turned off in Owner Controls.');return;}
  var invoice=rows('invoices').find(function(r){return text(val(r,'Invoice ID','invoiceId'))===text(invoiceId);});
  if(!invoice){toastErr('Invoice not found.');return;}
  var balance=num(val(invoice,'Balance','Balance Due','Amount Due','Open Balance'));
  if(!(balance>0)){toastErr('This invoice has no open balance.');return;}
  var cid=text(val(invoice,'Customer ID','customerId'));
  var method=defaultMethod(cid);
  if(!method){toastErr('No card on file for this customer. Add one first.');openAddCardModal(cid);return;}
  var provider=text(val(method,'Provider','provider')||'local');
  var label=methodLabel(method);
  var confirmText='Charge '+moneyFmt(balance)+' to '+label+' for invoice '
    +text(val(invoice,'Invoice Number','invoiceNumber')||invoiceId)+'?'
    +(provider==='local'?'\n\nTEST MODE \u2014 no real money moves.':'\n\nThis moves real money via Stripe.')
    +'\n\nNothing happens until you confirm.';
  if(!window.confirm(confirmText))return;
  toastOk('Charging '+label+'\u2026');
  try{
    var userId=text(window.state&&window.state.snapshot&&window.state.snapshot.user&&(window.state.snapshot.user.userId||window.state.snapshot.user['User ID']));
    var result=await executeCharge({paymentMethodId:text(val(method,'Payment Method ID','paymentMethodId')),
      invoiceId:text(invoiceId),amount:balance,approvedBy:userId,customerLabel:customerName(cid)});
    showReceipt(result);
    if(typeof renderMoney==='function')renderMoney();
  }catch(error){
    toastErr(error&&error.message?error.message:String(error));
  }
}
function customerName(cid){
  var c=rows('customers').find(function(r){return text(val(r,'Customer ID','customerId'))===text(cid);});
  return text(c?val(c,'Customer Name','name'):'No customer');
}

// ---------- auto-charge: queue for approval, NEVER silent ----------
function openAutoChargeApprovals(invoice){
  var cid=text(val(invoice,'Customer ID','customerId'));
  var method=defaultMethod(cid);
  if(!method)return null;
  var balance=num(val(invoice,'Balance','Balance Due','Amount Due','Open Balance'));
  var existing=rows('approvals').find(function(r){
    return text(val(r,'Area'))==='Card auto-charge'
      &&text(val(r,'Record ID','recordId'))===text(val(invoice,'Invoice ID','invoiceId'))
      &&/open|pending|await/i.test(text(val(r,'Status')));
  });
  if(existing)return existing;
  var id=newRecId('APPROVAL');
  var record={
    'Approval ID':id,'Business ID':businessId(),'Area':'Card auto-charge',
    'Record Type':'Invoice','Record ID':text(val(invoice,'Invoice ID','invoiceId')),
    'Request':'Auto-charge '+moneyFmt(balance)+' on '+methodLabel(method)+' for invoice '
      +text(val(invoice,'Invoice Number','invoiceNumber'))+' ('+customerName(cid)+'). Due '+text(val(invoice,'Due Date','dueDate'))+'.',
    'Requested By':'auto-charge','Requested Time':nowIso(),'Decision':'','Status':'Open',
    'Charge Payload':{invoiceId:text(val(invoice,'Invoice ID','invoiceId')),amount:balance,
      paymentMethodId:text(val(method,'Payment Method ID','paymentMethodId'))},
    'Created Time':nowIso(),'Updated Time':nowIso(),'Record Version':1
  };
  return queueOperation('SAVE_ENTITY','Approval',id,
    {entity:'approvals',record:record},
    {collection:'approvals',record:record,idKeys:['Approval ID']}).then(function(){return record;});
}
function dueTodayOrPast(dueDate){
  var d=text(dueDate);if(!d)return false;
  var day=d.slice(0,10),today=new Date().toISOString().slice(0,10);
  return day<=today;
}
async function checkAutoCharges(){
  // Runs on Money page render. Queues approvals only — never charges.
  if(!vaultEnabled())return 0;
  var queued=0;
  var targets=rows('invoices').filter(function(inv){
    if(num(val(inv,'Balance','Balance Due','Amount Due','Open Balance'))<=0)return false;
    if(!dueTodayOrPast(val(inv,'Due Date','dueDate')))return false;
    return autoChargeEnabled(text(val(inv,'Customer ID','customerId')));
  });
  for(var i=0;i<targets.length;i++){
    try{var r=await openAutoChargeApprovals(targets[i]);if(r&&text(val(r,'Status'))==='Open')queued++;}catch(e){}
  }
  return queued;
}
async function approveAutoCharge(approvalId){
  var row=rows('approvals').find(function(r){return text(val(r,'Approval ID','approvalId'))===text(approvalId);});
  if(!row){toastErr('Approval request not found.');return;}
  if(!/open|pending|await/i.test(text(val(row,'Status')))){toastErr('This request is no longer open.');return;}
  var payload=val(row,'Charge Payload','chargePayload')||{};
  var userId=text(window.state&&window.state.snapshot&&window.state.snapshot.user&&(window.state.snapshot.user.userId||window.state.snapshot.user['User ID']));
  var ok=window.confirm('Approve this auto-charge?\n\n'+text(val(row,'Request'))
    +'\n\nApproving charges the card now and closes the invoice balance.');
  if(!ok)return;
  try{
    var result=await executeCharge({paymentMethodId:text(payload.paymentMethodId),
      invoiceId:text(payload.invoiceId),amount:num(payload.amount),approvedBy:userId,
      customerLabel:customerName(text(val(result_invoice(row),'Customer ID','customerId')))});
    var closed=Object.assign({},row,{'Status':'Closed','Decision':'Approved \u2014 charged '+text(result.transactionId),
      'Updated Time':nowIso(),'Record Version':num(val(row,'Record Version','recordVersion'))+1});
    delete closed.__localPending;
    await queueOperation('SAVE_ENTITY','Approval',text(approvalId),
      {entity:'approvals',record:closed},
      {collection:'approvals',record:closed,idKeys:['Approval ID']});
    showReceipt(result);
    toastOk('Auto-charge approved and processed.');
    if(typeof renderMoney==='function')renderMoney();
  }catch(error){
    toastErr(error&&error.message?error.message:String(error));
  }
}
function result_invoice(approvalRow){
  var invId=text((val(approvalRow,'Charge Payload','chargePayload')||{}).invoiceId);
  return rows('invoices').find(function(r){return text(val(r,'Invoice ID','invoiceId'))===invId;})||{};
}
async function rejectAutoCharge(approvalId){
  var row=rows('approvals').find(function(r){return text(val(r,'Approval ID','approvalId'))===text(approvalId);});
  if(!row)return;
  var closed=Object.assign({},row,{'Status':'Closed','Decision':'Rejected \u2014 no charge made',
    'Updated Time':nowIso(),'Record Version':num(val(row,'Record Version','recordVersion'))+1});
  delete closed.__localPending;
  await queueOperation('SAVE_ENTITY','Approval',text(approvalId),
    {entity:'approvals',record:closed},
    {collection:'approvals',record:closed,idKeys:['Approval ID']});
  toastOk('Auto-charge request rejected. No charge was made.');
  if(typeof renderMoney==='function')renderMoney();
}

// ---------- UI: modal shell ----------
function ensureStyles(){
  if(document.getElementById('h38-cardvault-css'))return;
  var s=document.createElement('style');s.id='h38-cardvault-css';
  s.textContent='.h38-cv-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9990;display:flex;align-items:center;justify-content:center;padding:16px}'
    +'.h38-cv-modal{background:#fff;border-radius:12px;max-width:520px;width:100%;max-height:90vh;overflow:auto;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.3)}'
    +'.h38-cv-modal h2{margin-top:0}.h38-cv-testcard{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}'
    +'.h38-cv-testcard button{border:2px solid #ddd;border-radius:8px;background:#fff;padding:10px 12px;cursor:pointer;text-align:left}'
    +'.h38-cv-testcard button[aria-pressed="true"]{border-color:#1a73e8;background:#eef4fe}'
    +'.h38-cv-testcard small{display:block;color:#555}'
    +'#h38-cv-stripe-element{border:1px solid #ccc;border-radius:8px;padding:12px;margin:8px 0}'
    +'@media print{body.h38-cv-printing>*{display:none!important}body.h38-cv-printing #h38-cv-print-root{display:block!important}}'
    +'#h38-cv-print-root{display:none}';
  document.head.appendChild(s);
}
function openModal(html){
  ensureStyles();
  closeModal();
  var ov=document.createElement('div');ov.className='h38-cv-overlay';ov.id='h38-cv-overlay';
  ov.innerHTML='<div class="h38-cv-modal" role="dialog" aria-modal="true">'+html+'</div>';
  ov.addEventListener('click',function(e){if(e.target===ov)closeModal();});
  document.body.appendChild(ov);
  var c=ov.querySelector('[data-h38-cv-close]');
  if(c)c.onclick=closeModal;
  return ov;
}
function closeModal(){
  var ov=document.getElementById('h38-cv-overlay');
  if(ov&&ov.parentNode)ov.parentNode.removeChild(ov);
}

// ---------- UI: add-card modal ----------
var addCardState={customerId:'',provider:'local',pick:'visa4242',stripe:null,cardEl:null};
function openAddCardModal(customerId){
  if(!vaultEnabled()){toastErr('Card vault is turned off in Owner Controls.');return;}
  var cid=text(customerId);
  if(!cid){toastErr('Pick a customer first.');return;}
  var cfg=getConfig();
  addCardState={customerId:cid,provider:cfg.provider,pick:'visa4242',stripe:null,cardEl:null};
  var name=customerName(cid);
  var testBanner=cfg.provider==='local'
    ?'<div class="notice"><strong>TEST MODE \u2014 no real money moves.</strong> Pick a test card below. No real card numbers are accepted here.</div>'
    :'<div class="notice">Cards are tokenized securely by Stripe. The Office never sees the card number.</div>';
  openModal(
    '<h2>Add card on file</h2>'
    +'<p class="muted">Customer: <strong>'+esc(name)+'</strong> · via '+esc(PROVIDERS[cfg.provider].name)+'</p>'
    +testBanner
    +'<div id="h38-cv-addbody">'+addCardBodyHtml(cfg)+'</div>'
    +'<div class="actions"><button type="button" class="secondary" data-h38-cv-close>Cancel</button>'
    +'<button type="button" id="h38-cv-savecard">Save card on file</button></div>'
  );
  if(cfg.provider==='stripe')mountStripeElement();
  document.getElementById('h38-cv-savecard').onclick=saveCardFromModal;
  var tb=document.querySelectorAll('#h38-cv-addbody .h38-cv-testcard button');
  for(var i=0;i<tb.length;i++){tb[i].onclick=(function(b){return function(){addCardState.pick=b.getAttribute('data-pick');
    for(var j=0;j<tb.length;j++)tb[j].setAttribute('aria-pressed',tb[j]===b?'true':'false');};})(tb[i]);}
}
function addCardBodyHtml(cfg){
  if(cfg.provider==='stripe'){
    return '<label>Card details</label><div id="h38-cv-stripe-element"></div>'
      +'<p class="muted small">Secured by Stripe. Token only \u2014 the number never touches H38 servers.</p>';
  }
  var btns=TEST_CARDS.map(function(c,i){
    return '<button type="button" data-pick="'+esc(c.tokenSuffix)+'" aria-pressed="'+(i===0?'true':'false')+'">'
      +'<strong>'+esc(c.brand)+' \u00b7\u00b7\u00b7\u00b7 '+esc(c.last4)+'</strong><small>'+esc(c.note)+'</small></button>';
  }).join('');
  return '<label>Test card</label><div class="h38-cv-testcard">'+btns+'</div>'
    +'<div class="two"><div><label>Expiry (MM/YY)</label><input id="h38-cv-exp" value="12/28" maxlength="5"></div>'
    +'<div><label>Cardholder name</label><input id="h38-cv-holder" placeholder="As printed on card"></div></div>'
    +'<p class="muted small">Test mode: the card is picked from the list above. Only the brand, last 4, and expiry are stored \u2014 alongside a processor token, never a card number.</p>';
}
async function mountStripeElement(){
  var cfg=getConfig();
  try{
    var stripe=await loadStripeJs(cfg.stripePublishableKey);
    var elements=stripe.elements();
    var card=elements.create('card');
    var host=document.getElementById('h38-cv-stripe-element');
    if(host){card.mount(host);addCardState.stripe=stripe;addCardState.cardEl=card;}
  }catch(error){
    var host2=document.getElementById('h38-cv-addbody');
    if(host2)host2.innerHTML='<div class="notice warn"><strong>Stripe unavailable:</strong> '+esc(error.message)+'</div>';
    document.getElementById('h38-cv-savecard').disabled=true;
  }
}
async function saveCardFromModal(){
  var btn=document.getElementById('h38-cv-savecard');
  if(btn)btn.disabled=true;
  try{
    var cfg=getConfig(),info={provider:cfg.provider};
    if(cfg.provider==='stripe'){
      if(!addCardState.stripe||!addCardState.cardEl)throw new Error('Stripe card field is not ready.');
      var res=await addCardState.stripe.createPaymentMethod({type:'card',card:addCardState.cardEl});
      if(res.error)throw new Error(res.error.message||'Card could not be tokenized.');
      var pm=res.paymentMethod||{};
      info.token=text(pm.id);
      info.brand=text((pm.card&&pm.card.brand)||'Card');
      info.last4=text(pm.card&&pm.card.last4)||'';
      var em=pm.card&&pm.card.exp_month,ey=pm.card&&pm.card.exp_year;
      info.expiry=(em&&ey)?(String(em).padStart(2,'0')+'/'+String(ey).slice(-2)):'';
    }else{
      var tk=localTokenize(addCardState.pick);
      info.token=tk.token;info.brand=tk.brand;info.last4=tk.last4;
      var expEl=document.getElementById('h38-cv-exp');
      info.expiry=text(expEl&&expEl.value);
    }
    var rec=await addMethod(addCardState.customerId,info);
    closeModal();
    toastOk(methodLabel(rec)+' saved on file.');
    if(typeof renderMoney==='function'&&window.state&&window.state.page==='money')renderMoney();
    if(typeof renderCustomers==='function'&&window.state&&window.state.page==='customers')renderCustomers();
  }catch(error){
    toastErr(error&&error.message?error.message:String(error));
    if(btn)btn.disabled=false;
  }
}

// ---------- UI: receipt ----------
function showReceipt(result){
  var inv=result.invoice||{},m=result.method||{};
  var invNo=text(val(inv,'Invoice Number','invoiceNumber')||val(inv,'Invoice ID','invoiceId'));
  var html='<h2>Payment receipt</h2>'
    +(result.isTest?'<div class="notice"><strong>TEST receipt \u2014 no real money moved.</strong></div>':'')
    +'<div class="list"><div class="row"><div class="row-top"><strong>Amount charged</strong><strong>'+esc(moneyFmt(result.amount))+'</strong></div>'
    +'<small>Invoice '+esc(invNo)+' · '+esc(methodLabel(m))+'</small></div>'
    +'<div class="row"><div class="row-top"><strong>Transaction</strong><span class="small">'+esc(result.transactionId)+'</span></div>'
    +'<small>'+esc(PROVIDERS[result.provider]?PROVIDERS[result.provider].name:result.provider)+' · '+esc(new Date().toLocaleString())+'</small></div></div>'
    +'<div id="h38-cv-print-root" style="display:none"></div>'
    +'<div class="actions"><button type="button" class="secondary" data-h38-cv-close>Close</button>'
    +'<button type="button" id="h38-cv-print">Print receipt</button></div>';
  var ov=openModal(html);
  var printRoot=ov.querySelector('#h38-cv-print-root');
  printRoot.innerHTML='<h2>Payment receipt</h2><p><strong>Amount:</strong> '+esc(moneyFmt(result.amount))
    +'<br><strong>Invoice:</strong> '+esc(invNo)+'<br><strong>Card:</strong> '+esc(methodLabel(m))
    +'<br><strong>Transaction:</strong> '+esc(result.transactionId)+'<br><strong>Date:</strong> '+esc(new Date().toLocaleString())
    +(result.isTest?'<br><strong>TEST \u2014 no real money moved.</strong>':'')+'</p>';
  ov.querySelector('#h38-cv-print').onclick=function(){
    document.body.classList.add('h38-cv-printing');
    printRoot.style.display='block';
    window.print();
    setTimeout(function(){document.body.classList.remove('h38-cv-printing');printRoot.style.display='none';},500);
  };
}

// ---------- UI: Money page integration (render hook) ----------
// Per-invoice-row buttons, rendered by the canonical invoice list template
// (office-scale-workflow.js invoiceRow) and handled here via one delegated
// listener so list re-renders (search, pagination) can never wipe them.
function invoiceActionsHtml(invId,cid){
  if(!vaultEnabled())return '';
  var inv=rows('invoices').find(function(r){return text(val(r,'Invoice ID','invoiceId'))===text(invId);});
  if(!inv)return '';
  if(!(num(val(inv,'Balance','Balance Due','Amount Due','Open Balance'))>0))return '';
  var cfg=getConfig(),m=defaultMethod(cid);
  if(m){
    return '<button type="button" class="secondary" data-h38-charge-card="'+esc(invId)+'"'
      +' title="One-tap charge with owner confirmation'+(cfg.provider==='local'?' (TEST \u2014 no money moves)':'')+'">'
      +'Charge '+esc(methodLabel(m))+'</button>';
  }
  return '<button type="button" class="secondary" data-h38-addcard="'+esc(cid)+'"'
    +' title="Save a card for '+esc(customerName(cid))+'">Add card on file</button>';
}
var vaultClicksBound=false;
function bindVaultClicks(){
  if(vaultClicksBound)return;vaultClicksBound=true;
  document.addEventListener('click',function(event){
    var t=event.target&&event.target.closest?event.target.closest('[data-h38-charge-card],[data-h38-addcard]'):null;
    if(!t||!vaultEnabled())return;
    var charge=t.getAttribute('data-h38-charge-card'),add=t.getAttribute('data-h38-addcard');
    if(charge){event.preventDefault();chargeInvoice(charge).catch(function(e){toastErr(e&&e.message?e.message:String(e));});}
    else if(add){event.preventDefault();openAddCardModal(add);}
  });
}

function enhanceMoneyPage(){
  if(!vaultEnabled())return;
  if(!window.state||window.state.page!=='money')return;
  var cfg=getConfig();
  var cfg=getConfig();
  // 1) Per-invoice-row buttons are rendered by the canonical invoice list
  // template (office-scale-workflow.js invoiceRow) via invoiceActionsHtml(),
  // and handled by one delegated listener so list re-renders (search,
  // pagination) can never wipe them.
  bindVaultClicks();
  // 2) Cards-on-file management card.
  var grid=document.querySelector('#mainContent .grid');
  if(grid&&!document.getElementById('h38-cv-manage')){
    var section=document.createElement('section');
    section.className='card span8';section.id='h38-cv-manage';
    section.innerHTML=cardsManageHtml(cfg);
    grid.appendChild(section);
    bindCardsManage(section);
  }
  // 3) Queue any due auto-charges for approval (never charges).
  checkAutoCharges().then(function(n){
    if(n>0)toastOk(n+' auto-charge request(s) queued for owner approval. Nothing charged yet.');
  }).catch(function(){});
}
function customersWithMethods(){
  var seen={},out=[];
  rows('paymentMethods').forEach(function(m){
    if(text(val(m,'Status')||'Active')!=='Active')return;
    var cid=text(val(m,'Customer ID','customerId'));
    if(!seen[cid]){seen[cid]=true;out.push({customerId:cid,name:customerName(cid)});}});
  return out;
}
function cardsManageHtml(cfg){
  var groups=customersWithMethods();
  var pending=rows('approvals').filter(function(r){
    return text(val(r,'Area'))==='Card auto-charge'&&/open|pending|await/i.test(text(val(r,'Status')));
  });
  var providerOptions=Object.keys(PROVIDERS).map(function(id){
    return '<option value="'+id+'"'+(cfg.provider===id?' selected':'')+'>'+esc(PROVIDERS[id].name)
      +(PROVIDERS[id].isTest?' (test \u2014 no money moves)':'')+'</option>';
  }).join('');
  return '<h2>Cards on file</h2>'
    +'<p class="muted small">Processor tokens only \u2014 card numbers are never stored. '
    +(cfg.provider==='local'?'<strong>TEST MODE: no real money moves.</strong>':'Live via '+esc(PROVIDERS[cfg.provider].name)+'.')
    +'</p>'
    +'<div class="list">'
    +(groups.length?groups.map(function(g){
      var methods=activeMethods(g.customerId);
      var dflt=defaultMethod(g.customerId);
      return '<div class="row"><div class="row-top"><strong>'+esc(g.name)+'</strong>'
        +(autoChargeEnabled(g.customerId)?'<span class="pill">Auto-charge ON</span>':'')+'</div>'
        +methods.map(function(m){
          var mid=text(val(m,'Payment Method ID','paymentMethodId'));
          var isD=dflt&&text(val(dflt,'Payment Method ID','paymentMethodId'))===mid;
          return '<small>'+esc(methodLabel(m))+(text(val(m,'Expiry'))?' · exp '+esc(val(m,'Expiry')):'')
            +(isD?' · <strong>default</strong>':'')
            +' <button type="button" class="secondary" data-h38-cv-makedefault="'+esc(mid)+'"'+(isD?' disabled':'')+'>Make default</button>'
            +' <button type="button" class="secondary" data-h38-cv-removecard="'+esc(mid)+'">Remove</button></small>';
        }).join('')
        +'<div class="row-actions"><button type="button" class="secondary" data-h38-cv-addcard2="'+esc(g.customerId)+'">Add card</button>'
        +'<button type="button" class="secondary" data-h38-cv-autochargetoggle="'+esc(g.customerId)+'" data-h38-cv-autochargestate="'+(autoChargeEnabled(g.customerId)?'1':'0')+'">'
        +(autoChargeEnabled(g.customerId)?'Turn auto-charge OFF':'Turn auto-charge ON')+'</button></div></div>';
    }).join(''):'<p class="muted">No cards on file yet. Open an unpaid invoice above and choose "Add card on file".</p>')
    +'</div>'
    +(pending.length?'<h3>Auto-charge requests awaiting approval</h3><div class="list">'
      +pending.map(function(r){
        var aid=text(val(r,'Approval ID','approvalId'));
        return '<div class="row"><div class="row-top"><strong>'+esc(val(r,'Request'))+'</strong></div>'
          +'<div class="row-actions"><button type="button" data-h38-cv-approve="'+esc(aid)+'">Approve + charge</button>'
          +'<button type="button" class="secondary" data-h38-cv-reject="'+esc(aid)+'">Reject</button></div></div>';
      }).join('')+'</div>':'')
    +'<h3>Payment processor</h3>'
    +'<div class="two"><div><label>Provider</label><select id="h38-cv-provider">'+providerOptions+'</select></div>'
    +'<div><label>Stripe publishable key <small>(public key only)</small></label><input id="h38-cv-pk" value="'+esc(cfg.stripePublishableKey)+'" placeholder="pk_live_\u2026 or pk_test_\u2026" autocomplete="off"></div></div>'
    +'<p class="muted small">Switching to Stripe requires the publishable key above plus the secret key deployed as a Supabase edge-function secret (never in the app). '
    +'The <code>h38-payment-charge</code> function must be deployed before live charges work.</p>'
    +'<div class="actions"><button type="button" class="secondary" id="h38-cv-savecfg">Save processor settings</button></div>';
}
function bindCardsManage(section){
  function q(sel){return section.querySelectorAll(sel);}
  for(var i=0;i<q('[data-h38-cv-makedefault]').length;i++){
    q('[data-h38-cv-makedefault]')[i].onclick=function(e){setDefaultMethod(e.currentTarget.getAttribute('data-h38-cv-makedefault')).then(function(){renderMoney();}).catch(function(err){toastErr(err.message);});};
  }
  for(i=0;i<q('[data-h38-cv-removecard]').length;i++){
    q('[data-h38-cv-removecard]')[i].onclick=function(e){
      if(!window.confirm('Remove this card from the vault? Future charges will need a new card.'))return;
      removeMethod(e.currentTarget.getAttribute('data-h38-cv-removecard')).then(function(){renderMoney();}).catch(function(err){toastErr(err.message);});
    };
  }
  for(i=0;i<q('[data-h38-cv-addcard2]').length;i++){
    q('[data-h38-cv-addcard2]')[i].onclick=function(e){openAddCardModal(e.currentTarget.getAttribute('data-h38-cv-addcard2'));};
  }
  for(i=0;i<q('[data-h38-cv-autochargetoggle]').length;i++){
    q('[data-h38-cv-autochargetoggle]')[i].onclick=function(e){
      var el=e.currentTarget,cid=el.getAttribute('data-h38-cv-autochargetoggle');
      var turningOn=el.getAttribute('data-h38-cv-autochargestate')!=='1';
      if(turningOn&&!window.confirm('Turn ON auto-charge for '+customerName(cid)+'? Due invoices will be queued for OWNER APPROVAL \u2014 nothing charges automatically.'))return;
      setAutoCharge(cid,turningOn).then(function(){toastOk(turningOn?'Auto-charge ON \u2014 due invoices will queue for approval.':'Auto-charge OFF.');renderMoney();}).catch(function(err){toastErr(err.message);});
    };
  }
  for(i=0;i<q('[data-h38-cv-approve]').length;i++){
    q('[data-h38-cv-approve]')[i].onclick=function(e){approveAutoCharge(e.currentTarget.getAttribute('data-h38-cv-approve'));};
  }
  for(i=0;i<q('[data-h38-cv-reject]').length;i++){
    q('[data-h38-cv-reject]')[i].onclick=function(e){rejectAutoCharge(e.currentTarget.getAttribute('data-h38-cv-reject'));};
  }
  var saveBtn=section.querySelector('#h38-cv-savecfg');
  if(saveBtn)saveBtn.onclick=function(){
    var cfg=getConfig();
    cfg.provider=section.querySelector('#h38-cv-provider').value||'local';
    cfg.stripePublishableKey=text(section.querySelector('#h38-cv-pk').value);
    if(cfg.provider==='stripe'&&!/^pk_(test|live)_/.test(cfg.stripePublishableKey)){
      toastErr('That does not look like a Stripe publishable key (starts with pk_test_ or pk_live_).');return;
    }
    saveConfig(cfg);
    toastOk('Processor settings saved. '+(cfg.provider==='stripe'?'Deploy h38-payment-charge with the Stripe secret key before live charges work.':'Test mode \u2014 no real money moves.'));
    renderMoney();
  };
}

// ---------- UI: Controls page hook (approve buttons on auto-charge rows) ----------
function enhanceControlsPage(){
  if(!vaultEnabled())return;
  if(!window.state||window.state.page!=='controls')return;
  var heads=document.querySelectorAll('#mainContent h2');
  var list=null;
  for(var i=0;i<heads.length;i++){
    if(text(heads[i].textContent)==='Approvals'){
      var card=heads[i].closest('section');if(card)list=card.querySelector('.list');
      break;
    }
  }
  if(!list)return;
  var pending=rows('approvals').filter(function(r){
    return text(val(r,'Area'))==='Card auto-charge'&&/open|pending|await/i.test(text(val(r,'Status')));
  });
  if(!pending.length)return;
  var rowsEls=list.querySelectorAll('.row');
  for(i=0;i<rowsEls.length;i++){
    (function(rowEl){
      var strong=rowEl.querySelector('.row-top strong');
      if(!strong||strong.textContent.indexOf('Card auto-charge:')!==0)return;
      if(rowEl.querySelector('[data-h38-cv-approve]'))return;
      var match=pending.find(function(p){return strong.textContent.indexOf(text(val(p,'Request')).slice(0,40))>=0;});
      if(!match)match=pending[0];
      var aid=text(val(match,'Approval ID','approvalId'));
      var div=document.createElement('div');div.className='row-actions';
      div.innerHTML='<button type="button" data-h38-cv-approve="'+esc(aid)+'">Approve + charge</button> '
        +'<button type="button" class="secondary" data-h38-cv-reject="'+esc(aid)+'">Reject</button>';
      rowEl.appendChild(div);
      div.querySelector('[data-h38-cv-approve]').onclick=function(){approveAutoCharge(aid);};
      div.querySelector('[data-h38-cv-reject]').onclick=function(){rejectAutoCharge(aid);};
    })(rowsEls[i]);
  }
}

// ---------- render hooks (explicit, not page-wide observers) ----------
function installHooks(){
  try{
    if(typeof window.renderMoney==='function'&&!window.renderMoney.__h38CardVault){
      var orig=window.renderMoney;
      var wrapped=function(){var r=orig.apply(this,arguments);try{enhanceMoneyPage();}catch(e){console.warn('[card-vault] money hook',e);}return r;};
      wrapped.__h38CardVault=true;
      window.renderMoney=wrapped;
    }
  }catch(e){}
  try{
    if(typeof window.renderControls==='function'&&!window.renderControls.__h38CardVault){
      var origC=window.renderControls;
      var wrappedC=function(){var r=origC.apply(this,arguments);try{enhanceControlsPage();}catch(e){console.warn('[card-vault] controls hook',e);}return r;};
      wrappedC.__h38CardVault=true;
      window.renderControls=wrappedC;
    }
  }catch(e){}
}

// ---------- public API ----------
window.H38CardVault={
  BUILD:BUILD,
  providers:function(){return Object.keys(PROVIDERS).map(function(k){return {id:k,name:PROVIDERS[k].name,isTest:PROVIDERS[k].isTest};});},
  config:getConfig,saveConfig:saveConfig,
  methodsFor:activeMethods,defaultMethod:defaultMethod,methodLabel:methodLabel,
  addMethod:addMethod,removeMethod:removeMethod,setDefault:setDefaultMethod,
  autoChargeEnabled:autoChargeEnabled,setAutoCharge:setAutoCharge,
  chargeInvoice:chargeInvoice,addCardModal:openAddCardModal,
  checkAutoCharges:checkAutoCharges,approveAutoCharge:approveAutoCharge,rejectAutoCharge:rejectAutoCharge,
  invoiceActionsHtml:invoiceActionsHtml,
  enabled:vaultEnabled
};

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installHooks,{once:true});
else installHooks();
})();
