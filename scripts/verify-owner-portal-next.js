#!/usr/bin/env node
'use strict';
const fs=require('fs');const path=require('path');const vm=require('vm');
const root=path.resolve(__dirname,'../apps-script/core-engine/owner-portal-next');
const required=['appsscript.json','Portal_Config.js','Portal_Repository.js','Portal_Catalog.js','Portal_Services.js','Portal_Actions.js','Portal_Adapters.js','Portal_SelfTest.js','Portal_TestFixtures.js','Portal_Index.html','README.md'];
const failures=[];const pass=[];
function check(name,condition,detail=''){if(condition)pass.push({name,detail});else failures.push({name,detail});}
required.forEach(f=>check('file '+f,fs.existsSync(path.join(root,f))));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'appsscript.json'),'utf8'));
check('manifest timezone',manifest.timeZone==='America/Chicago',manifest.timeZone);
check('manifest owner-only',manifest.webapp&&manifest.webapp.access==='MYSELF',manifest.webapp&&manifest.webapp.access);
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
check('catalog mismatch hold',/CATALOG MISMATCH HOLD/.test(all));
check('all modules',['dashboard','tasks','leads','customers','jobs','quotes','invoices','payments','expenses','communications','social','advertising','website','calendar','products','reports','proof','errors','settings'].every(x=>all.includes("'"+x+"'")));
for(const f of jsFiles){try{new vm.Script(fs.readFileSync(path.join(root,f),'utf8'),{filename:f});pass.push({name:'syntax '+f});}catch(e){failures.push({name:'syntax '+f,detail:e.message});}}
const html=fs.readFileSync(path.join(root,'Portal_Index.html'),'utf8');
check('mobile viewport',/name="viewport"/.test(html));check('responsive css',/@media\(max-width:800px\)/.test(html));check('global search',/globalSearch/.test(html));check('task workspace',/openTask/.test(html));
const script=(html.match(/<script>([\s\S]*)<\/script>/)||[])[1];try{new vm.Script(script,{filename:'Portal_Index.inline.js'});pass.push({name:'syntax Portal_Index inline script'});}catch(e){failures.push({name:'syntax Portal_Index inline script',detail:e.message});}
const result={status:failures.length?'FAIL':'PASS',passed:pass.length,failed:failures.length,failures};console.log(JSON.stringify(result,null,2));process.exit(failures.length?1:0);
