'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const layer=read('commercial-app/profitability-operating-layer.js');
const html=read('commercial-app/index.html');
const sw=read('commercial-app/service-worker.js');
const failures=[];
const check=(name,ok)=>{if(!ok)failures.push(name);};
try{new Function(layer);}catch(error){failures.push(`profitability JavaScript syntax: ${error.message}`);}
check('profitability layer is loaded by Business Office',html.includes('./profitability-operating-layer.js?build=20260901-profitability-operating-layer-1'));
check('profitability layer loads after navigation authority',html.indexOf('profitability-operating-layer.js')>html.indexOf('desktop-navigation-authority.js'));
check('service worker live-first includes profitability layer',/LIVE_FIRST[^;]+profitability-operating-layer\.js/s.test(sw));
check('service worker shell includes profitability layer',/SHELL=\[[\s\S]+\.\/profitability-operating-layer\.js/.test(sw));
check('service worker cache rotated',sw.includes("const CACHE_NAME='h38-business-office-20260901-2355-profitability-1'"));
[
  ['Profit Guard','profitGuard:true'],['back-costing','backCosting:true'],['Business Health','businessHealth:true'],['profit leak detector','profitLeakDetector:true'],['90-day plan','ninetyDayPlan:true'],['six health dimensions',"['Profit','Sales','Operations','Team','Cash','Systems']"],['Price Book assembly cost','direct_cost_per_unit'],['Price Book item cost','unit_cost'],['unknown cost remains incomplete','Cost data needed'],['recorded job expense cost',"realRows('expenses')"],['recorded job time cost',"realRows('timeEntries')"],['overdue cash signal','overdue recorded balances'],['stale job signal','stale open job'],['financial access check','canSeeFinancial()']
].forEach(([name,needle])=>check(name,layer.includes(needle)));
[
  'automaticApproval:false','automaticCustomerSending:false','automaticPurchasing:false','automaticPayment:false','automaticScheduling:false','automaticPublishing:false','ownerActionOnly:true'
].forEach(needle=>check(`safety marker ${needle}`,layer.includes(needle)));
check('no automatic quote mutation',!layer.includes('state.quote.lines.push'));
check('no customer send operation',!/(sendQuote|deliverQuote|SEND_CUSTOMER|sendCustomer)/.test(layer));
check('no payment operation',!/(chargeCustomer|PROCESS_PAYMENT|createPaymentIntent)/.test(layer));
check('no purchase operation',!/(PURCHASE_|placeOrder|buyNow)/.test(layer));
check('no queueOperation writes',!layer.includes('queueOperation('));
if(failures.length){console.error(JSON.stringify({status:'FAIL',failures},null,2));process.exit(1);}
console.log(JSON.stringify({status:'PASS',features:['Profit Guard','job back-costing','Business Health','profit leak detector','90-day owner plan'],externalActions:false},null,2));
