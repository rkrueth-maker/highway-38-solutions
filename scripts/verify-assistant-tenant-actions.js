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
  'crossTenantRequest','engineAttack','productRequest','cancelPending','requestOwnerReview','data-h38-ai-action-id','data-h38-ai-action-version'
])check('runtime contains '+token,actions.includes(token));
check('AI runtime does not use direct Supabase table writes',!actions.includes(".from('business_records')")&&!actions.includes('.rpc('));
check('AI runtime does not expose unrestricted SQL',!actions.includes('executeSql')&&!actions.includes('unrestrictedSql'));
check('existing proof log preserves AI metadata',data.includes("operation?.payload?.__h38AiProof")&&data.includes('...aiProof'));
check('runtime is loaded in existing Office',index.includes('assistant-tenant-actions.js?build=20260922-tenant-aware-office-actions-2'));
check('runtime loads before assistant command runtime',index.indexOf('assistant-tenant-actions.js')<index.indexOf('assistant-command-runtime.js'));
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',passed,failed:failures.length,failures},null,2));
process.exit(failures.length?1:0);
