#!/usr/bin/env node
'use strict';
const fs=require('fs');const path=require('path');const vm=require('vm');const cp=require('child_process');
const repo=path.resolve(__dirname,'..');
const root=path.join(repo,'apps-script/core-engine/owner-portal-next');
const testDeployScript=path.join(repo,'scripts/deploy-owner-portal-next-test.sh');
const productionDeployScript=path.join(repo,'scripts/deploy-owner-portal-next-production.sh');
const testRunbook=path.join(root,'RUNTIME_TEST_RUNBOOK.md');
const productionRunbook=path.join(root,'PRODUCTION_INSTALL.md');
const required=['appsscript.json','Portal_Config.js','Portal_Environment.js','Portal_Production.js','Portal_Repository.js','Portal_Catalog.js','Portal_Services.js','Portal_Actions.js','Portal_Adapters.js','Portal_LogApi.js','Portal_SelfTest.js','Portal_TestFixtures.js','Portal_Index.html','README.md'];
const failures=[];const pass=[];
function check(name,condition,detail=''){if(condition)pass.push({name,detail});else failures.push({name,detail});}
required.forEach(f=>check('file '+f,fs.existsSync(path.join(root,f))));
check('test deploy script exists',fs.existsSync(testDeployScript));
check('production deploy script exists',fs.existsSync(productionDeployScript));
check('test runbook exists',fs.existsSync(testRunbook));
check('production runbook exists',fs.existsSync(productionRunbook));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'appsscript.json'),'utf8'));
check('manifest timezone',manifest.timeZone==='America/Chicago',manifest.timeZone);
check('manifest webapp owner-only',manifest.webapp&&manifest.webapp.access==='MYSELF',manifest.webapp&&manifest.webapp.access);
check('manifest execution api owner-only',manifest.executionApi&&manifest.executionApi.access==='MYSELF',manifest.executionApi&&manifest.executionApi.access);
const jsFiles=required.filter(f=>f.endsWith('.js'));
const all=jsFiles.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
check('integrated release identifier',/integrated-business-os/.test(all));
check('15 product IDs',(all.match(/H38-P\d{3}/g)||[]).filter((v,i,a)=>a.indexOf(v)===i).length===15);
check('9 bundle IDs',(all.match(/H38-B\d{3}/g)||[]).filter((v,i,a)=>a.indexOf(v)===i).length===9);
check('environment-aware test mode',/TEST_MODE:\s*H38_PORTAL_ENVIRONMENT\s*!==\s*'PRODUCTION'/.test(all));
check('live external false',/LIVE_EXTERNAL_ACTIONS_ENABLED:\s*false/.test(all));
check('production configuration gate',/function h38PortalConfigureProductionEnvironment/.test(all)&&all.includes('CONFIGURE OWNER-ONLY PRODUCTION ENVIRONMENT'));
check('production installer gate',/function h38PortalInstallProduction/.test(all)&&all.includes('INSTALL OWNER-ONLY PRODUCTION PORTAL'));
check('production readiness check',/function h38PortalProductionReadiness/.test(all));
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
check('test environment confirmation',/CONFIGURE NON-DEPLOYED TEST ENVIRONMENT/.test(all));
check('no hard-coded live spreadsheet id in Apps Script source',!all.includes('1P5_7iUVf-yY9ffUEM7Iy5v10VsjE2LZdX7vNMcoQ1Uo'));
check('client schema endpoint',/function h38PortalClientSchema/.test(all));
check('generic business record save',/function h38PortalSaveBusinessRecord/.test(all));
check('unified task projection',/function h38PortalTaskProjection_/.test(all));
check('full task workspace',/function h38PortalBuildWorkspace_/.test(all)&&/communications:\[\]/.test(all)&&/advertising:\[\]/.test(all)&&/calendar:\[\]/.test(all));
check('job workspace endpoint',/function h38PortalJobWorkspace/.test(all));
check('state-aware task actions',/function h38PortalAvailableActions_/.test(all)&&/h38PortalTaskTerminal_/.test(all));
check('completed actions hidden',/if\(!task \|\| h38PortalTaskTerminal_\(task\.status\)\) return \[\]/.test(all));
check('internal communication draft',/function h38PortalCreateCommunicationDraft/.test(all));
check('manual payment workflow',/function h38PortalRecordPayment/.test(all));
check('expense workflow',/function h38PortalRecordExpense/.test(all));
check('social scheduling workflow',/function h38PortalInternalScheduleSocial_/.test(all));
check('advertising approval workflow',/function h38PortalInternalAdvertisingApproval_/.test(all));
check('website approval workflow',/function h38PortalInternalWebsiteApproval_/.test(all));
const html=fs.readFileSync(path.join(root,'Portal_Index.html'),'utf8');
check('internal form controls',/openCreate/.test(html)&&/submitRecord/.test(html));
check('workspace tabs',/renderWorkspaceSection/.test(html)&&/communications/.test(html)&&/advertising/.test(html)&&/website/.test(html));
check('task filters',/filterTasks/.test(html)&&/taskStatus/.test(html)&&/taskPriority/.test(html));
check('no JSON prompt create UX',!/Paste JSON fields/.test(html));
check('external lock visible',/External actions locked/.test(html));
for(const f of jsFiles){try{new vm.Script(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});pass.push({name:'syntax '+f});}catch(e){failures.push({name:'syntax '+f,detail:e.message});}}
check('mobile viewport',/name="viewport"/.test(html));check('responsive css',/@media\(max-width:800px\)/.test(html));check('global search',/globalSearch/.test(html));check('task workspace',/openTask/.test(html));
const script=(html.match(/<script>([\s\S]*)<\/script>/)||[])[1];try{new vm.Script(script,{filename:'Portal_Index.inline.js'});pass.push({name:'syntax Portal_Index inline script'});}catch(e){failures.push({name:'syntax Portal_Index inline script',detail:e.message});}
const names=[];for(const f of jsFiles){const src=fs.readFileSync(path.join(root,f),'utf8');for(const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g))names.push(m[1]);}
const duplicates=names.filter((n,i,a)=>a.indexOf(n)!==i).filter((n,i,a)=>a.indexOf(n)===i);
check('zero duplicate server functions',duplicates.length===0,duplicates.join(','));
const dangerous=['GmailApp.sendEmail','MailApp.sendEmail','UrlFetchApp.fetch','ScriptApp.newTrigger'];
check('no dangerous external-action patterns',dangerous.every(p=>!all.includes(p)),dangerous.filter(p=>all.includes(p)).join(','));
if(fs.existsSync(productionDeployScript)){
  const deploy=fs.readFileSync(productionDeployScript,'utf8');
  const bash=cp.spawnSync('bash',['-n',productionDeployScript],{encoding:'utf8'});
  check('production deploy script syntax',bash.status===0,bash.stderr||bash.stdout);
  check('production uses existing bound script',deploy.includes('H38_BOUND_SCRIPT_ID'));
  check('production uses existing deployment',deploy.includes('H38_EXISTING_DEPLOYMENT_ID'));
  check('production does not create Apps Script project',!deploy.includes('clasp create'));
  check('production does not create second deployment',deploy.includes('update-deployment')||/clasp deploy\s+-i/.test(deploy));
  check('production backs up bound project',deploy.includes('bound-project-backup.tar.gz')&&deploy.includes('clasp pull'));
  check('production pushes source',/clasp push --force/.test(deploy));
  check('production excludes live spreadsheet id',!deploy.includes('1P5_7iUVf-yY9ffUEM7Iy5v10VsjE2LZdX7vNMcoQ1Uo'));
  check('production keeps external actions locked',deploy.includes('External actions remain disabled'));
}
if(fs.existsSync(testDeployScript)){
  const bash=cp.spawnSync('bash',['-n',testDeployScript],{encoding:'utf8'});check('test deploy script syntax',bash.status===0,bash.stderr||bash.stdout);
}
const installDoc=fs.readFileSync(productionRunbook,'utf8');
check('production runbook bound-only',/existing bound/i.test(installDoc)&&!/creates a separate standalone/i.test(installDoc));
const result={status:failures.length?'FAIL':'PASS',passed:pass.length,failed:failures.length,serverFiles:jsFiles.length,namedFunctions:names.length,duplicateFunctions:duplicates,failures};console.log(JSON.stringify(result,null,2));process.exit(failures.length?1:0);
