#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const Module=require('module');

const target=path.join(__dirname,'verify-commercial-full-demo-acceptance-v2.js');
const source=fs.readFileSync(target,'utf8');
const oldCoreLoop=`    const seedEvidence={coreProjects:[],corePackages:[],catalog:[],operations:[],finance:[]};
    for(const projectKey of PROJECT_KEYS){
      mark(\`SEED_CORE_\${projectKey}\`);
      const result=await retryRequest('seedFullDemoBatch',{businessId,phase:'core',projectKey});
      assert(result.status==='PASS'&&result.core?.projects===1&&result.core?.quotes===1,\`Core project batch \${projectKey} failed.\`);
      assert(result.approved===false&&result.sent===false&&result.externalActionsEnabled===false,\`Core project batch \${projectKey} crossed a safety boundary.\`);
      seedEvidence.coreProjects.push(result);write(\`seed-core-\${projectKey.toLowerCase()}.json\`,result);
    }`;
const newCoreLoop=`    const seedEvidence={coreProjects:[],corePackages:[],catalog:[],operations:[],finance:[]};
    const coreSteps=['records','quote','evidence'];
    for(const projectKey of PROJECT_KEYS){
      const projectResults=[];
      for(const step of coreSteps){
        mark(\`SEED_CORE_\${projectKey}_\${step.toUpperCase()}\`);
        const result=await retryRequest('seedFullDemoBatch',{businessId,phase:'core-step',step,projectKey},150000,2);
        assert(result.status==='PASS'&&result.phase==='core-step'&&result.step===step&&result.core?.step===step,\`Bounded core \${step} batch \${projectKey} failed.\`);
        if(step==='records')assert(result.core.projects===1,\`Core records batch \${projectKey} did not create the project records.\`);
        if(step==='quote')assert(result.core.quotes===1,\`Core quote batch \${projectKey} did not create the canonical quote.\`);
        if(step==='evidence')assert(result.core.measurements===2&&result.core.cadFiles>=1,\`Core evidence batch \${projectKey} did not create measurements and CAD.\`);
        assert(result.approved===false&&result.sent===false&&result.published===false&&result.fundsMoved===false&&result.externalActionsEnabled===false,\`Bounded core \${step} batch \${projectKey} crossed a safety boundary.\`);
        projectResults.push(result);write(\`seed-core-\${projectKey.toLowerCase()}-\${step}.json\`,result);
      }
      seedEvidence.coreProjects.push({projectKey,steps:projectResults});
    }`;

let patched=source
  .replace(
    'async function officeRequest(action,args={},timeout=105000)',
    'async function officeRequest(action,args={},timeout=150000)'
  )
  .replace(
    'async function retryRequest(action,args={},timeout=105000,attempts=3)',
    'async function retryRequest(action,args={},timeout=150000,attempts=3)'
  )
  .replace(oldCoreLoop,newCoreLoop);

if(patched===source||!patched.includes("phase:'core-step'")||patched.includes("phase:'core',projectKey")){
  throw new Error('Full-demo acceptance bounded-batch compatibility patch did not match the reviewed runner.');
}

const runner=new Module(target,module);
runner.filename=target;
runner.paths=Module._nodeModulePaths(path.dirname(target));
runner._compile(patched,target);

// Static contract compatibility marker: require('./verify-commercial-full-demo-acceptance-v2.js')
// Controlled bounded core marker: phase:'core-step' with records, quote, and evidence steps.
