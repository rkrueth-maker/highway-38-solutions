#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(process.argv[2]||'dist/northern-lakes-business-office');
function fail(message){console.error('FAIL — '+message);process.exitCode=1;}
function requireFile(name){const file=path.join(root,name);if(!fs.existsSync(file)){fail('missing '+name);return '';}return fs.readFileSync(file,'utf8');}
const pack=requireFile('BusinessOffice_00_Pack.gs');
const web=requireFile('BusinessOffice_Web.gs');
const quote=requireFile('BusinessOffice_QuoteBuilder.gs');
const index=requireFile('BusinessOffice_QuoteBuilder_Index.html');
const aiClient=requireFile('BusinessOffice_QuoteBuilder_AI_Visual_Client.html');
const aiServer=requireFile('BusinessOffice_QuoteBuilder_AI_Visual.gs');
const required=[
  [pack,/packId:'northern-lakes'/,'Northern Lakes pack ID'],
  [pack,/business:\s*Object\.freeze\(\{id:'NLPS'/,'NLPS business ID'],
  [pack,/NLPS_BUSINESS_OFFICE_SPREADSHEET_ID/,'dedicated spreadsheet key'],
  [pack,/NLPS_BUSINESS_OFFICE_DEPLOYMENT_ID/,'dedicated deployment key'],
  [pack,/namespace:'NLPS'/,'NLPS namespace'],
  [web,/buildAiQuoteDraft/,'AI draft API route'],
  [web,/createAiCompletionVisual/,'AI visual API route'],
  [web,/BusinessOffice_QuoteBuilder_AI_Visual_Client/,'AI client included in full Business Office'],
  [quote,/boPrepareAiQuoteDraft_/,'shared AI draft staging'],
  [index,/BusinessOffice_QuoteBuilder_AI_Visual_Client/,'AI client included in direct Quote Builder'],
  [aiClient,/Take Picture/,'camera-only control'],
  [aiClient,/Upload Photos/,'upload-only control'],
  [aiClient,/Build Quote with AI/,'AI quote action'],
  [aiClient,/Create Completion Visual/,'AI visual action'],
  [aiClient,/Owner review required\./i,'owner review notice'],
  [aiServer,/boBuildAiQuoteDraft_/,'shared AI quote engine'],
  [aiServer,/boCreateAiCompletionVisual_/,'shared AI completion visual engine'],
  [aiServer,/Owner Review Required/,'owner review gate'],
  [aiServer,/AI Concept Rendering — Proposed Appearance Only/,'concept disclaimer']
];
required.forEach(([source,pattern,label])=>{if(!pattern.test(source))fail('missing '+label);});
const all=fs.readdirSync(root).filter(n=>/\.(?:gs|html|json)$/.test(n)).map(n=>fs.readFileSync(path.join(root,n),'utf8')).join('\n');
if(/H38_BUSINESS_OFFICE_SPREADSHEET_ID|H38_BUSINESS_OFFICE_DEPLOYMENT_ID/.test(pack))fail('Highway 38 storage or deployment key leaked into Northern Lakes pack');
if(!process.exitCode)console.log(JSON.stringify({status:'PASS',installation:'Northern Lakes Business Office',businessId:'NLPS',isolated:true,quoteBuilder:'shared engine',cameraUploadSplit:true,aiDraft:true,completionVisual:true,ownerApprovalRequired:true,assembledFiles:fs.readdirSync(root).length},null,2));
