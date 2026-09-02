'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const layer=read('commercial-app/profitability-operating-layer.js');
const loader=read('commercial-app/desktop-navigation-authority.js');
const html=read('commercial-app/index.html');
const sw=read('commercial-app/service-worker.js');
const failures=[];
const check=(name,ok)=>{if(!ok)failures.push(name);};
try{new Function(layer);}catch(error){failures.push(`profitability JavaScript syntax: ${error.message}`);}
try{new Function(loader);}catch(error){failures.push(`profitability loader syntax: ${error.message}`);}
check('late loader remains in Business Office',html.includes('./desktop-navigation-authority.js?build='));
check('late loader owns profitability module load',loader.includes('./profitability-operating-layer.js?build=${PROFITABILITY_BUILD}'));
check('late loader uses exact profitability build',loader.includes("const PROFITABILITY_BUILD='20260901-profitability-operating-layer-1'"));
check('late loader prevents duplicate scripts',loader.includes("document.querySelector('script[data-h38-profitability-layer]')"));
check('live-first delivery protects late loader',/LIVE_FIRST[^;]+desktop-navigation-authority\.js/s.test(sw));
[
  ['Profit Guard','profitGuard:true'],['back-costing','backCosting:true'],['Business Health','businessHealth:true'],['profit leak detector','profitLeakDetector:true'],['90-day plan','ninetyDayPlan:true'],['six health dimensions',"['Profit','Sales','Operations','Team','Cash','Systems']"],['Price Book assembly cost','direct_cost_per_unit'],['Price Book item cost','unit_cost'],['unknown cost remains incomplete','Cost data needed'],['recorded job expense cost',"realRows('expenses')"],['recorded job time cost',"realRows('timeEntries')"],['overdue cash signal','overdue recorded balances'],['stale job signal','stale open job'],['financial access check','canSeeFinancial()'],['business-scoped owner settings','h38:profitability:']
].forEach(([name,needle])=>check(name,layer.includes(needle)));
[
  'automaticApproval:false','automaticCustomerSending:false','automaticPurchasing:false','automaticPayment:false','automaticScheduling:false','automaticPublishing:false','ownerActionOnly:true'
].forEach(needle=>check(`safety marker ${needle}`,layer.includes(needle)));
check('no automatic quote mutation',!layer.includes('state.quote.lines.push'));
check('no customer send operation',!/(sendQuote|deliverQuote|SEND_CUSTOMER|sendCustomer)/.test(layer));
check('no payment operation',!/(chargeCustomer|PROCESS_PAYMENT|createPaymentIntent)/.test(layer));
check('no purchase operation',!/(PURCHASE_|placeOrder|buyNow)/.test(layer));
check('no queueOperation writes',!layer.includes('queueOperation('));
check('loader still retired from navigation ownership',loader.includes('retired:true')&&loader.includes('mutatesNavigation:false')&&loader.includes('capturesClicks:false'));
if(failures.length){console.error(JSON.stringify({status:'FAIL',failures},null,2));process.exit(1);}
console.log(JSON.stringify({status:'PASS',features:['Profit Guard','job back-costing','Business Health','profit leak detector','90-day owner plan'],delivery:'late LIVE_FIRST loader',externalActions:false},null,2));
