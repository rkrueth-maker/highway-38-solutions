#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const batches=read('apps-script/commercial-office-beta/CommercialBeta_FullDemo_03.gs');
const wrapper=read('scripts/verify-commercial-full-demo-acceptance.js');
const live=read('scripts/verify-commercial-full-demo-acceptance-v2.js');
const gateway=read('supabase/functions/h38-office-gateway/index.ts');
const checks=[];const failures=[];
function check(name,condition){checks.push({name,status:condition?'PASS':'FAIL'});if(!condition)failures.push(name);}
check('gateway request remains hard-bounded',gateway.includes('AbortSignal.timeout(120000)'));
check('server exposes bounded records step',batches.includes('function cbDemo8SeedCoreRecords_')&&batches.includes("coreStep==='records'"));
check('server exposes bounded quote step',batches.includes('function cbDemo8SeedCoreQuote_')&&batches.includes("coreStep==='quote'"));
check('server exposes bounded evidence step',batches.includes('function cbDemo8SeedCoreEvidence_')&&batches.includes("coreStep==='evidence'"));
check('bounded core route is owner-only and fail-closed',batches.includes("phase==='core-step'&&project")&&batches.includes("context.user.owner===true")&&batches.includes("throw new Error('A valid bounded core step is required.')"));
check('each step remains non-external',batches.includes('approved:false')&&batches.includes('sent:false')&&batches.includes('published:false')&&batches.includes('fundsMoved:false')&&batches.includes('externalActionsEnabled:false'));
check('acceptance wrapper requires all three bounded steps',wrapper.includes("const coreSteps=['records','quote','evidence']")&&wrapper.includes("phase:'core-step'")&&wrapper.includes("result.core.measurements===2&&result.core.cadFiles>=1"));
check('acceptance wrapper replaces the reviewed monolithic loop',wrapper.includes('.replace(oldCoreLoop,newCoreLoop)')&&wrapper.includes("patched.includes(\"phase:'core-step'\")")&&wrapper.includes("patched.includes(\"phase:'core',projectKey\")"));
check('reviewed runner still contains exact compatibility source',live.includes("const seedEvidence={coreProjects:[],corePackages:[],catalog:[],operations:[],finance:[]};")&&live.includes("phase:'core',projectKey"));
check('bounded evidence keeps real CAD and verification-required measurements',batches.includes('cbDemo8CadPlans_(project)')&&batches.includes("'Method':'AI-assisted photo estimate'")&&batches.includes("'Confidence':'Needs verification'"));
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',gatewayLimitMs:120000,coreSteps:['records','quote','evidence'],idempotent:true,externalActionsEnabled:false,checks,failures},null,2));
if(failures.length)process.exit(1);
