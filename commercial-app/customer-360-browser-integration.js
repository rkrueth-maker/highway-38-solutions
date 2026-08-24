(function(){
'use strict';
const BUILD='20260824-customer-360-browser-integration-1';
let loading=null;
const text=v=>String(v==null?'':v).trim();
function ensureStyle(){if(document.querySelector('link[data-h38-customer-360]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href='./customer-360-authority.css?build=20260824-customer-360-authority-1';link.dataset.h38Customer360='1';document.head.appendChild(link);}
function ensureAuthority(){
  ensureStyle();
  if(window.H38_CUSTOMER_360)return Promise.resolve(window.H38_CUSTOMER_360);
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
    let script=document.querySelector('script[data-h38-customer-360]');
    if(!script){script=document.createElement('script');script.src='./customer-360-authority.js?build=20260824-customer-360-authority-1';script.dataset.h38Customer360='1';document.body.appendChild(script);}
    const finish=()=>window.H38_CUSTOMER_360?resolve(window.H38_CUSTOMER_360):reject(new Error('Customer 360 did not become ready.'));
    script.addEventListener('load',finish,{once:true});script.addEventListener('error',()=>reject(new Error('Customer 360 could not load.')),{once:true});
    if(window.H38_CUSTOMER_360)finish();
  }).finally(()=>{loading=null;});return loading;
}
function customerIntent(command){const q=text(command).toLowerCase();if(!q)return false;if(/^remind\s+me\b|^remember\b|^note\b|^add(?:\s+a)?\s+task\b/.test(q))return false;if(/\b(receipt|expense|mileage|payroll|tax|margin|profit|cost)\b/.test(q))return false;return /^(find|search|pull|open|show)\b/.test(q)||/\bcustomer\b|\bjob\s+on\b/.test(q)||q.split(/\s+/).length<=5;}
function announce(result){const answer=text(result?.answer);if(answer)window.toast?.(answer,false);try{if(answer&&'speechSynthesis'in window){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(answer.slice(0,900));window.speechSynthesis.speak(u);}}catch(_){} }
async function handleAssistantSubmit(event){
  const form=event.target?.closest?.('#paCommandForm');if(!form)return;
  const command=text(new FormData(form).get('command'));if(!customerIntent(command))return;
  let c360;try{c360=await ensureAuthority();}catch(_){return;}
  const snapshot=window.state?.snapshot||{},result=c360.resolveAssistantQuery?.(snapshot,command);if(!result?.matched)return;
  event.preventDefault();event.stopImmediatePropagation();form.reset();
  if(result.confident&&result.customerId){c360.selectedCustomerId=result.customerId;try{window.openPage?.('customers');}catch(_){}announce(result);return;}
  announce(result);
}
function install(){ensureAuthority().catch(error=>console.warn('[H38 Customer 360 loader]',error?.message||error));document.addEventListener('submit',handleAssistantSubmit,true);}
window.H38_CUSTOMER_360_BROWSER=Object.freeze({enabled:true,build:BUILD,ensureAuthority,customerIntent,assistantCustomerFirst:true,internalFinancialSearchExcluded:true,automaticCustomerSending:false,automaticApproval:false,automaticPurchase:false,automaticPayment:false});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
