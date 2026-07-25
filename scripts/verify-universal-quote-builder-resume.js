#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const exists=rel=>fs.existsSync(path.join(root,rel));
const checks=[];
function check(name,condition,evidence=''){
  checks.push({name,status:condition?'PASS':'FAIL',evidence});
  console.log(`${condition?'PASS':'FAIL'}: ${name}${evidence?` — ${evidence}`:''}`);
}
const files={
  resume:'apps-script/business-office/BusinessOffice_UniversalQuoteBuilder_Resume.gs',
  step:'apps-script/business-office/BusinessOffice_UniversalQuoteBuilder_Resume_Step.gs',
  client:'apps-script/business-office/BusinessOffice_UniversalQuoteBuilder_Resume_Client.html',
  index:'apps-script/business-office/BusinessOffice_QuoteBuilder_Index.html'
};
Object.values(files).forEach(file=>check(`required file ${file}`,exists(file)));
if(checks.some(item=>item.status==='FAIL'))process.exit(1);
const resume=read(files.resume),step=read(files.step),client=read(files.client),index=read(files.index),server=resume+'\n'+step;
try{new Function(server);check('resumable Apps Script source parses',true);}catch(error){check('resumable Apps Script source parses',false,error.message);}
const scripts=[...client.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]).join('\n');
try{new Function(scripts);check('resumable client source parses',true);}catch(error){check('resumable client source parses',false,error.message);}
[
  'boUniversalExampleRunStatus','boUniversalLatestIncompleteExampleRun','boUniversalResumeStatusFromContext_',
  'boUniversalResumeEnsureSimple_','boUniversalResumeEnsureHouseProject_','boUniversalResumeEnsureHouseSubquote_',
  'boUniversalResumeEnsureDrawing_','boUniversalResumeEnsureBidPackage_','boUniversalResumeExampleSuiteStep'
].forEach(name=>check(`function ${name}`,new RegExp(`function ${name}\\(`).test(server)));
check('client uses safe step function',client.includes("rpc('boUniversalResumeExampleSuiteStep'"));
check('client does not call monolithic generator',!client.includes("rpc('boUniversalPrepareExampleSuite'")&&!client.includes("rpc('boUniversalResumeExampleSuite'"));
check('latest incomplete run is detected',client.includes("rpc('boUniversalLatestIncompleteExampleRun'"));
check('same run requires confirmation',client.includes('Existing records will be reused and only missing records will be created'));
check('one-click client loops controlled steps',client.includes('for(var step=1;step<=MAX_STEPS;step+=1)')&&client.includes('MAX_STEPS=20'));
check('button is replaced after workspace render',client.includes('MutationObserver')&&client.includes('[data-uqb="examples"]')&&client.includes('Resume / Prepare Example Run'));
check('resume client is included after workspace',index.includes("boInclude_('BusinessOffice_UniversalQuoteBuilder_Resume_Client')")&&index.indexOf('BusinessOffice_UniversalQuoteBuilder_Workspace_Client')<index.indexOf('BusinessOffice_UniversalQuoteBuilder_Resume_Client'));
check('storage initialization occurs before script lock',step.indexOf('boUniversalEnsureStore_();')<step.indexOf('lock.waitLock(30000)'));
check('script lock is always released',step.includes('finally{lock.releaseLock();}'));
check('simple-example batch is bounded',resume.includes('SIMPLE_BATCH:4')&&step.includes('slice(0,H38_UQB_RESUME.SIMPLE_BATCH)'));
check('house-package batch is bounded',resume.includes('HOUSE_BATCH:3')&&step.includes('slice(0,H38_UQB_RESUME.HOUSE_BATCH)'));
check('drawing batch is bounded',resume.includes('DRAWING_BATCH:5')&&step.includes('slice(0,H38_UQB_RESUME.DRAWING_BATCH)'));
check('bid-package batch is bounded',resume.includes('BID_BATCH:3')&&step.includes('slice(0,H38_UQB_RESUME.BID_BATCH)'));
check('expected completion counts are explicit',[
  'projectCount:18','simpleProjects:17','simpleSubquotes:17','simpleItems:17','houseProject:1','houseSubquotes:14','houseItems:14','houseScopes:84','drawings:10','bidPackages:6'
].every(marker=>resume.includes(marker)));
check('projects are reused by run key and project type',resume.includes("row['Run Key']===runKey&&row['Project Type']===example.key")&&resume.includes("row['Run Key']===runKey&&row['Project Type']==='whole_house'"));
check('subquotes are reused by project and trade key',resume.includes("row['Project ID']===project['Project ID']&&row['Area / System / Trade / Phase / Assembly']===spec.key"));
check('items are reused by project subquote and description',resume.includes("row['Subquote ID']===subquoteId&&row.Description===spec.description"));
check('scope sections are reused by subquote and section type',resume.includes("row['Subquote ID']===sub['Subquote ID']&&row['Section Type']===type"));
check('drawings are reused by project and sheet number',resume.includes("row['Project ID']===project['Project ID']&&row['Sheet Number']===drawing.number"));
check('bid packages are reused by project and title',resume.includes("row['Project ID']===project['Project ID']&&row.Title===fullTitle"));
check('completion proof is written',step.includes("'COMPLETE UNIVERSAL EXAMPLE SUITE'")&&step.includes("'RESUME UNIVERSAL EXAMPLE SUITE'"));
check('no external communication or network action',!/(MailApp|GmailApp|sendEmail|UrlFetchApp|fetch\s*\()/i.test(server+client));
check('external actions remain false',resume.includes('externalActionsPerformed:false'));
const failed=checks.filter(item=>item.status==='FAIL');
const result={status:failed.length?'HOLD':'PASS',generatedAt:new Date().toISOString(),architecture:'resumable-idempotent-bounded-example-run',checks:checks.length,failed:failed.length,expected:{projects:18,houseSubquotes:14,scopeSections:84,drawings:10,bidPackages:6},externalActionsPerformed:false,results:checks};
const out=path.join(root,'artifacts','universal-quote-builder-resume');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
process.exit(failed.length?1:0);
