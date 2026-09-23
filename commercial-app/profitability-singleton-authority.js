(function(){
'use strict';
const BUILD='20260923-profitability-singleton-authority-2-fail-soft';
let queued=false,observer=null;
function guards(){try{return Array.from(document.querySelectorAll('[data-h38-profit-guard="true"],#h38ProfitGuard')).filter((node,index,list)=>list.indexOf(node)===index);}catch(_){return[];}}
function dedupe(){
  queued=false;
  try{
    const nodes=guards();if(nodes.length<=1)return;
    const keep=nodes[nodes.length-1];
    nodes.forEach(node=>{if(node!==keep&&node?.isConnected)node.remove();});
    if(keep?.isConnected&&keep.id!=='h38ProfitGuard')keep.id='h38ProfitGuard';
  }catch(error){console.warn('[H38 Profit Guard singleton]',error?.message||error);}
}
function schedule(){
  if(queued)return;queued=true;
  try{(typeof queueMicrotask==='function'?queueMicrotask:callback=>Promise.resolve().then(callback))(dedupe);}catch(_){queued=false;setTimeout(dedupe,0);}
}
function install(){
  try{
    if(document.documentElement&&typeof MutationObserver==='function'){
      observer=new MutationObserver(records=>{try{if(Array.from(records||[]).some(record=>record?.type==='childList'))schedule();}catch(error){console.warn('[H38 Profit Guard observer]',error?.message||error);}});
      observer.observe(document.documentElement,{childList:true,subtree:true});
    }
    ['h38:business-snapshot-updated','h38:office-page-rendered'].forEach(name=>window.addEventListener(name,()=>schedule()));
    schedule();
  }catch(error){console.warn('[H38 Profit Guard singleton install]',error?.message||error);}
}
window.H38_PROFITABILITY_SINGLETON_AUTHORITY=Object.freeze({build:BUILD,enabled:true,singleProfitGuard:true,asyncRenderRaceDeduped:true,failSoftObserver:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false,automaticPublishing:false});
install();
})();