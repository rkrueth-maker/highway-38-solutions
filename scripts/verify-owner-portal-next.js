#!/usr/bin/env node
'use strict';
const fs=require('fs');const path=require('path');const vm=require('vm');const cp=require('child_process');
const repo=path.resolve(__dirname,'..');
const root=path.join(repo,'apps-script/core-engine/owner-portal-next');
const deployScript=path.join(repo,'scripts/deploy-owner-portal-next-test.sh');
const runbook=path.join(root,'RUNTIME_TEST_RUNBOOK.md');
const required=['appsscript.json','Portal_Config.js','Portal_Environment.js','Portal_Repository.js','Portal_Catalog.js','Portal_Services.js','Portal_Actions.js','Portal_Adapters.js','Portal_LogApi.js','Portal_SelfTest.js','Portal_TestFixtures.js','Portal_Index.html','README.md'];
const failures=[];const pass=[];
function check(name,condition,detail=''){if(condition)pass.push({name,detail});else failures.push({name,detail});}
required.forEach(f=>check('file '+f,fs.existsSync(path.join(root,f))));
check('runtime deploy script exists',fs.existsSync(deployScript));
check('runtime runbook exists',fs.existsSync(runbook));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'appsscript.json'),'utf8'));
check('manifest timezone',manifest.timeZone==='America/Chicago',manifest.timeZone);
check('manifest webapp owner-only',manifest.webapp&&manifest.webapp.access==='MYSELF',manifest.webapp&&manifest.webapp.access);
check('manifest execution api owner-only',manifest.executionApi&&manifest.executionApi.access==='MYSELF',manifest.executionApi&&manifest.executionApi.access);
const jsFiles=required.filter(f=>f.endsWith('.js'));
const all=jsFiles.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
check('15 product IDs',(all.match(/H38-P\d{3}/g)||[]).filter((v,i,a)=>a.indexOf(v)===i).length===15);
check('9 bundle IDs',(all.match(/H38-B\d{3}/g)||[]).filter((v,i,a)=>a.indexOf(v)===i).length===9);
check('test mode true',/TEST_MODE:\s*true/.test(all));
check('live external false',/LIVE_EXTERNAL_ACTIONS_ENABLED:\s*false/.test(all));
check('no trigger creation',!/ScriptApp\s*\.\s*newTrigger/.test(all));
check('no raw card fields',!/cardNumber|cvv|cvc|fullCard/i.test(all));
check('selected task lock',/LockService\.getDocumentLock/.test(all));
check('proof writer',/function h38PortalWriteProof_/.test(all));
check('error writer',/function h38PortalWriteError_/.test(all));
check('proof reader',/function h38PortalProofLog/.test(all));
check('error reader',/function h38PortalErrorLog/.test(all));
check('catalog mismatch hold',/CATALOG MISMATCH HOLD/.test(all));
check('all modules',['dashboard','tasks','leads','customers','jobs','quotes','invoices','payments','expenses','communications','social','advertising','website','calendar','products','reports','proof','errors','settings'].every(x=>all.includes("'"+x+"'")));
check('environment property key',/H38_PORTAL_SPREADSHEET_ID/.test(all));
check('explicit environment confirmation',/CONFIGURE NON-DEPLOYED TEST ENVIRONMENT/.test(all));
check('no hard-coded live spreadsheet id',!all.includes('1P5_7iUVf-yY9ffUEM7Iy5v10VsjE2LZdX7vNMcoQ1Uo'));
const html=fs.readFileSync(path.join(root,'Portal_Index.html'),'utf8');
check('internal create controls',/createInternal/.test(html));
for(const f of jsFiles){try{new vm.Script(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});pass.push({name:'syntax '+f});}catch(e){failures.push({name:'syntax '+f,detail:e.message});}}
check('mobile viewport',/name="viewport"/.test(html));check('responsive css',/@media\(max-width:800px\)/.test(html));check('global search',/globalSearch/.test(html));check('task workspace',/openTask/.test(html));
const script=(html.match(/<script>([\s\S]*)<\/script>/)||[])[1];try{new vm.Script(script,{filename:'Portal_Index.inline.js'});pass.push({name:'syntax Portal_Index inline script'});}catch(e){failures.push({name:'syntax Portal_Index inline script',detail:e.message});}
const names=[];for(const f of jsFiles){const src=fs.readFileSync(path.join(root,f),'utf8');for(const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g))names.push(m[1]);}
const duplicates=names.filter((n,i,a)=>a.indexOf(n)!==i).filter((n,i,a)=>a.indexOf(n)===i);
check('zero duplicate server functions',duplicates.length===0,duplicates.join(','));
const dangerous=['GmailApp.sendEmail','MailApp.sendEmail','UrlFetchApp.fetch','ScriptApp.newTrigger'];
check('no dangerous external-action patterns',dangerous.every(p=>!all.includes(p)),dangerous.filter(p=>all.includes(p)).join(','));
if(fs.existsSync(deployScript)){
  const deploy=fs.readFileSync(deployScript,'utf8');
  const bash=cp.spawnSync('bash',['-n',deployScript],{encoding:'utf8'});
  check('runtime deploy script syntax',bash.status===0,bash.stderr||bash.stdout);
  check('runtime requires test spreadsheet env',deploy.includes('H38_TEST_SPREADSHEET_ID'));
  check('runtime creates standalone webapp',/clasp create --type webapp/.test(deploy));
  check('runtime pushes candidate source',/clasp push --force/.test(deploy));
  check('runtime creates test deployment',/clasp deploy/.test(deploy));
  check('runtime configures exact TEST gate',deploy.includes('CONFIGURE NON-DEPLOYED TEST ENVIRONMENT'));
  check('runtime runs environment status',deploy.includes('clasp run h38PortalEnvironmentStatus'));
  check('runtime runs self-test',deploy.includes('clasp run h38PortalSelfTest'));
  check('runtime excludes live spreadsheet id',!deploy.includes('1P5_7iUVf-yY9ffUEM7Iy5v10VsjE2LZdX7vNMcoQ1Uo'));
}
const result={status:failures.length?'FAIL':'PASS',passed:pass.length,failed:failures.length,serverFiles:jsFiles.length,namedFunctions:names.length,duplicateFunctions:duplicates,failures};console.log(JSON.stringify(result,null,2));process.exit(failures.length?1:0);
