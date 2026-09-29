'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const actions=read('commercial-app/assistant-tenant-actions.js');
const data=read('commercial-app/supabase-data.js');
const index=read('commercial-app/index.html');
const failures=[];let passed=0;
const check=(label,ok)=>{if(ok){passed++;console.log('PASS '+label);}else{failures.push(label);console.error('FAIL '+label);}};
try{new Function(actions);check('tenant action runtime syntax',true)}catch(error){check('tenant action runtime syntax',false)}
for(const token of [
  'previewApprovalExecutionProof:true','engineMutationAllowed:false','tenantIsolation:true',
  "permitted('manageFinancial')","permitted('manageCustomers')","permitted('editCustomers')",
  "window.queueOperation('SAVE_ENTITY'","window.queueOperation('SAVE_QUOTE'","window.queueOperation('SAVE_FEATURE_REQUEST'",
  '__h38AiProof','Approve &amp; Save','Request owner review','lastCompletion',
  'crossTenantRequest','engineAttack','productRequest','cancelPending','requestOwnerReview','h38AiActionId','h38AiActionVersion','awaitProof','proofVisible'
])check('runtime contains '+token,actions.includes(token));
check('AI runtime does not use direct Supabase table writes',!actions.includes(".from('business_records')")&&!actions.includes('.rpc('));
check('AI runtime does not expose unrestricted SQL',!actions.includes('executeSql')&&!actions.includes('unrestrictedSql'));
check('existing proof log preserves AI metadata',data.includes("operation?.payload?.__h38AiProof")&&data.includes('...aiProof'));
check('runtime is loaded in existing Office',index.includes('assistant-tenant-actions.js?build=20260929-readable-action-preview-8'));
check('runtime loads before assistant command runtime',index.indexOf('assistant-tenant-actions.js')<index.indexOf('assistant-command-runtime.js'));
check('Assistant settle does not perform duplicate bootstrap after Office sync',!actions.includes("await window.sync(false);\n  await refreshAuthoritativeSnapshot();"));
check('Assistant approval refreshes targeted secured proof history after sync',actions.includes('H38_SUPABASE_TRAFFIC_GUARD')&&actions.includes('loadAuditHistory')&&actions.includes('refreshProofHistory'));
const vm=require('node:vm');
let searchCalls=0;
const customers=[{'Customer ID':'TEST-SELECTED','Customer Name':'Reviewed customer'},{'Customer ID':'TEST-OTHER','Customer Name':'Other customer'}];
const context={window:{H38_CUSTOMER_360:{selectedCustomerId:'TEST-SELECTED'}},rows:()=>customers,text:v=>String(v??'').trim(),value:(row,...keys)=>keys.map(key=>row[key]).find(v=>v!==undefined&&v!==null&&v!=='')||'',base:{customerResult:()=>{searchCalls++;return{ambiguous:true,answer:'Service words match multiple customer histories.'};}}};
vm.createContext(context);vm.runInContext(actions.slice(actions.indexOf('function customerId('),actions.indexOf('function rateSpec('))+';this.resolve=resolveCustomer;',context);
check('pronoun pricing uses the reviewed source despite ambiguous service history',context.resolve('Raise their plowing rate to $175 and show me a quote.')?.id==='TEST-SELECTED'&&searchCalls===0);
check('pronoun contact changes use the reviewed source',context.resolve('Change their phone number to 218-555-0177.')?.id==='TEST-SELECTED');
check('named ambiguous customer requests remain fail-closed',context.resolve('Raise Smith plowing rate to $175.')?.ambiguous===true);
context.window.H38_CUSTOMER_360.selectedCustomerId='TEST-NOT-IN-ACTIVE-BUSINESS';
check('pronouns never fall back to unrelated records when the selected source is stale',context.resolve('Raise their plowing rate to $175.')===null);
check('approval preview sits outside bounded chat history',actions.includes("chat.insertAdjacentElement('afterend',card)")&&!actions.includes('chat.appendChild(card);chat.scrollTop=chat.scrollHeight'));
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',passed,failed:failures.length,failures},null,2));
process.exit(failures.length?1:0);
