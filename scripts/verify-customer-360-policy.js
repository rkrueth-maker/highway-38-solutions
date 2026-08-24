const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const source=fs.readFileSync('commercial-app/customer-360-browser-integration-v2.js','utf8');
const sandbox={
  console,
  setInterval:()=>0,
  clearInterval:()=>{},
  setTimeout:(fn)=>{fn();return 0;},
  navigator:{},
  location:{},
  SpeechSynthesisUtterance:function(){},
  window:{state:{snapshot:{}},addEventListener:()=>{},speechSynthesis:{cancel:()=>{},speak:()=>{}}},
  document:{readyState:'loading',addEventListener:()=>{},querySelector:()=>null,getElementById:()=>null,head:{appendChild:()=>{}},body:{appendChild:()=>{}},createElement:()=>({addEventListener:()=>{},dataset:{}})}
};
sandbox.window.window=sandbox.window;sandbox.window.document=sandbox.document;sandbox.window.navigator=sandbox.navigator;sandbox.window.SpeechSynthesisUtterance=sandbox.SpeechSynthesisUtterance;
vm.createContext(sandbox);vm.runInContext(source,sandbox);
const P=sandbox.window.H38_CUSTOMER_360_BROWSER;
assert(P&&P.enabled,'policy should install');
const customers=[
 {'Customer ID':'C-SMITH-1','Customer Name':'Smith','Internal Only':false},
 {'Customer ID':'C-SMITH-2','Customer Name':'Smith','Internal Only':false},
 {'Customer ID':'C-JOHN','Customer Name':'Johnson','Internal Only':false},
 {'Customer ID':'C-TEST','Customer Name':'Recovered Customer Portal Test','Internal Only':true,'Test Data':true}
];
const properties=[
 {'Property ID':'P-SMITH-1','Customer ID':'C-SMITH-1','Address':'101 Pine Rd'},
 {'Property ID':'P-SMITH-2','Customer ID':'C-SMITH-2','Address':'202 Oak Rd'},
 {'Property ID':'P-JOHN','Customer ID':'C-JOHN','Address':'129 Hwy 38'}
];
const jobs=[
 {'Job ID':'J-SMITH-1','Customer ID':'C-SMITH-1','Project Title':'Deck repair'},
 {'Job ID':'J-SMITH-2','Customer ID':'C-SMITH-2','Project Title':'Roof repair'},
 {'Job ID':'J-JOHN','Customer ID':'C-JOHN','Project Title':'Gutter repair'}
];
sandbox.window.state.snapshot={customers,properties,jobs,quotes:[],siteCaptureSessions:[],jobNotes:[],documents:[],followUps:[]};
function bundle(cid){return{customerId:cid,customer:customers.find(c=>c['Customer ID']===cid),groups:{properties:properties.filter(x=>x['Customer ID']===cid),jobs:jobs.filter(x=>x['Customer ID']===cid)}};}
const c360={
 collectionAllowed:c=>!['expenses','purchases','payroll','taxRecords'].includes(c),
 customerBundle:(_,cid)=>bundle(cid),
 customerSummary:b=>`${b.customer['Customer Name']} summary`,
 searchCustomers:(_,q)=>{
  const s=String(q).toLowerCase();
  if(s.includes('smith'))return[{customerId:'C-SMITH-1',score:80,reason:'name',bundle:bundle('C-SMITH-1')},{customerId:'C-SMITH-2',score:80,reason:'name',bundle:bundle('C-SMITH-2')}];
  if(s.includes('johnson'))return[{customerId:'C-JOHN',score:90,reason:'name',bundle:bundle('C-JOHN')}];
  if(s.includes('recovered'))return[{customerId:'C-TEST',score:90,reason:'name',bundle:bundle('C-TEST')}];
  return[];
 }
};
sandbox.window.H38_CUSTOMER_360=c360;
assert.deepEqual(Array.from(P.visibleCustomers()).map(x=>x['Customer ID']),['C-SMITH-1','C-SMITH-2','C-JOHN']);
let r=P.resolveVisibleQuery(c360,'Smiths');
assert.equal(r.matched,true);assert.equal(r.confident,false,'duplicate Smith must require disambiguation');
r=P.resolveVisibleQuery(c360,'Johnson');assert.equal(r.confident,true);assert.equal(r.customerId,'C-JOHN');
r=P.resolveVisibleQuery(c360,'Johnsn');assert.equal(r.confident,true,'one-character typo should resolve');assert.equal(r.customerId,'C-JOHN');
r=P.resolveVisibleQuery(c360,'job on hiway 38');assert.equal(r.confident,true);assert.equal(r.customerId,'C-JOHN');
r=P.resolveVisibleQuery(c360,'Recovered Customer Portal Test');assert.equal(r.matched,false,'internal test customer should stay hidden');
const expense={action:'SAVE_ENTITY',payload:{entity:'expenses',record:{'Expense ID':'E-1','Quote ID':'Q-1'}}};
const untouched=P.supplementOperation(expense);assert.equal(untouched.payload.record['Customer ID'],undefined,'finance record must not receive customer supplement');
sandbox.window.state.snapshot.quotes=[{'Quote ID':'Q-1','Customer ID':'C-JOHN'}];
const doc={action:'SAVE_ENTITY',payload:{entity:'documents',record:{'Document ID':'D-1','Quote ID':'Q-1'}}};
const linked=P.supplementOperation(doc);assert.equal(linked.payload.record['Customer ID'],'C-JOHN','operational child should inherit unique source customer');
console.log(JSON.stringify({status:'PASS',build:P.build,checks:['duplicate surname ambiguity','internal test hidden','one-character typo','hiway normalization','finance isolation','operational source inheritance']},null,2));
