(function(){
'use strict';
const BUILD='20260923-profitability-singleton-authority-1';
let queued=false;
function guards(){return Array.from(document.querySelectorAll('[data-h38-profit-guard="true"],#h38ProfitGuard')).filter((node,index,list)=>list.indexOf(node)===index);}
function dedupe(){
  queued=false;
  const nodes=guards();if(nodes.length<=1)return;
  const keep=nodes[nodes.length-1];
  nodes.forEach(node=>{if(node!==keep)node.remove();});
  if(keep.id!=='h38ProfitGuard')keep.id='h38ProfitGuard';
}
function schedule(){if(queued)return;queued=true;queueMicrotask(dedupe);}
const observer=new MutationObserver(records=>{if(records.some(record=>record.type==='childList'))schedule();});
observer.observe(document.documentElement,{childList:true,subtree:true});
['h38:business-snapshot-updated','h38:office-page-rendered'].forEach(name=>window.addEventListener(name,schedule));
schedule();
window.H38_PROFITABILITY_SINGLETON_AUTHORITY=Object.freeze({build:BUILD,enabled:true,singleProfitGuard:true,asyncRenderRaceDeduped:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false,automaticPublishing:false});
})();