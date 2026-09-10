(function(){
'use strict';
const BUILD='20260910-live-customer-navigation-guard-1';
const INTENT_WINDOW_MS=1200;
let lastCustomerIntent=0;
let intendedCustomerId='';
const text=value=>String(value==null?'':value).trim();
function office(){return window.state||{};}
function officeActive(){return (office().shell||'office')==='office';}
function customerResultButton(event){
  const target=event.target instanceof Element?event.target:null;
  return target?.closest?.('#h38Customer360Matches button[data-c360-policy-customer],#h38Customer360Matches button[data-c360-customer]')||null;
}
function navButton(event){
  const target=event.target instanceof Element?event.target:null;
  const button=target?.closest?.('#mainNav button[data-h38-primary],#mainNav button[data-page]')||null;
  if(button)return button;
  const nav=document.getElementById('mainNav');
  const x=Number(event.clientX),y=Number(event.clientY);
  if(!nav||!Number.isFinite(x)||!Number.isFinite(y))return null;
  for(const candidate of nav.querySelectorAll('button[data-h38-primary="customers"],button[data-page="customers"]')){
    const r=candidate.getBoundingClientRect();
    if(r.width>0&&r.height>0&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return candidate;
  }
  return null;
}
function navTarget(button){return text(button?.dataset?.h38Primary||button?.dataset?.page);}
function cancelCustomerIntent(){lastCustomerIntent=0;intendedCustomerId='';}
function renderCustomersDirect(){
  const state=office();
  state.page='customers';
  try{
    if(typeof window.renderCustomers==='function')window.renderCustomers();
    else if(typeof window.renderPage==='function')window.renderPage();
  }catch(error){console.error('[H38 live customer guard render]',error);}
  try{window.renderNav?.();}catch(_){}
}
function forceCustomers(customerId=''){
  if(!officeActive())return false;
  const c360=window.H38_CUSTOMER_360;
  if(customerId&&c360)c360.selectedCustomerId=customerId;
  try{window.openPage?.('customers');}catch(error){console.error('[H38 live customer guard route]',error);}
  if(text(office().page)!=='customers')renderCustomersDirect();
  else if(customerId){try{window.renderCustomers?.();}catch(_){} }
  try{window.H38_OFFICE_NAVIGATION_INTEGRITY?.reconcile?.();}catch(_){}
  return text(office().page)==='customers';
}
function keepCustomerIntent(){
  if(!lastCustomerIntent||Date.now()-lastCustomerIntent>INTENT_WINDOW_MS)return;
  if(text(office().page)==='meetings')forceCustomers(intendedCustomerId);
}
function intercept(event){
  if(!officeActive())return;
  const target=event.target instanceof Element?event.target:null;
  if(target?.closest?.('[data-c360-action="meeting"],#h38ConversationFollowup,[data-meeting-open]')){cancelCustomerIntent();return;}
  const result=customerResultButton(event);
  const button=navButton(event);
  const route=navTarget(button);
  if(button&&route&&route!=='customers'){cancelCustomerIntent();return;}
  if(!result&&route!=='customers')return;
  intendedCustomerId=text(result?.dataset?.c360PolicyCustomer||result?.dataset?.c360Customer||'');
  lastCustomerIntent=Date.now();
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  queueMicrotask(()=>forceCustomers(intendedCustomerId));
  [0,40,120,300,700].forEach(delay=>setTimeout(keepCustomerIntent,delay));
}
window.addEventListener('click',intercept,true);
window.addEventListener('h38:conversation-meeting-assistant-ready',()=>setTimeout(keepCustomerIntent,0));
window.addEventListener('pageshow',()=>setTimeout(keepCustomerIntent,0));
window.H38_LIVE_CUSTOMER_NAVIGATION_GUARD=Object.freeze({
  build:BUILD,
  enabled:true,
  windowCapture:true,
  customerPhysicalIntentPinned:true,
  customerSearchSelectionPinned:true,
  lateMeetingBounceBlocked:true,
  explicitMeetingPreserved:true,
  automaticApproval:false,
  automaticCustomerSending:false,
  automaticPurchase:false,
  automaticPayment:false,
  automaticScheduling:false
});
})();
