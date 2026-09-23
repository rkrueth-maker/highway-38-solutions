(function(){
'use strict';
const BUILD='20260923-profitability-render-dedupe-1';
let sweepGeneration=0;
const IDS=['h38ProfitabilityToday','h38ProfitGuard','h38BusinessHealth','h38BackCosting','h38ProfitLeaks','h38NinetyDayPlan'];
function dedupe(){
  const main=document.getElementById('mainContent');if(!main)return;
  IDS.forEach(id=>{
    const nodes=Array.from(main.querySelectorAll(`[id="${id}"]`));
    if(nodes.length<=1)return;
    nodes.slice(1).forEach(node=>node.remove());
  });
}
function sweep(){
  const generation=++sweepGeneration;
  let pass=0;
  const run=()=>{
    if(generation!==sweepGeneration)return;
    try{dedupe();}catch(error){console.warn('[H38 profitability dedupe]',error?.message||error);}
    pass+=1;
    if(pass<20)setTimeout(run,250);
  };
  run();
}
window.addEventListener('h38:office-page-rendered',sweep);
window.addEventListener('h38:business-snapshot-updated',sweep);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sweep,{once:true});else sweep();
window.H38_PROFITABILITY_RENDER_DEDUPE=Object.freeze({build:BUILD,enabled:true,boundedSweep:true,sweepPasses:20,sweepIntervalMs:250,presentationOnly:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false,automaticPublishing:false});
})();