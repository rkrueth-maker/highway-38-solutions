#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const need=(text,marker,label)=>{if(!text.includes(marker))throw new Error('Missing '+label+': '+marker);};
const absent=(text,marker,label)=>{if(text.includes(marker))throw new Error('Unexpected '+label+': '+marker);};
const universal=read('universal-quote-builder.html');
const server=read('apps-script/business-office/BusinessOffice_UniversalQuoteBuilder_PublicDemo.gs');
const examples=read('apps-script/business-office/BusinessOffice_UniversalQuoteBuilder_PublicExamples.gs');
const publicRoute=read('apps-script/business-office/ZZZ_BusinessOffice_UniversalQuoteBuilder_PublicRoute.gs');
const catalog=read('apps-script/business-office/BusinessOffice_UniversalQuoteBuilder.gs');
const web=read('apps-script/business-office/BusinessOffice_Web.gs');
const index=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Index.html');
const client=read('apps-script/business-office/BusinessOffice_UniversalQuoteBuilder_PublicDemo_UI.html');
const sample=read('whole-house-quote-package.html');

need(universal,'Universal Quote Builder overview','overview section');
need(universal,'Complete quote examples matched to their CAD drawings','matched examples heading');
need(universal,'View full quote','full quote promise');
need(universal,'View full-size CAD sheets','full-size CAD promise');
need(universal,'Print or save the package','complete package promise');
need(universal,'?publicUqbDemo=1','sanitized public example route');
need(universal,'id="uqOfficeDemo"','embedded public examples');
need(universal,'Public examples only:','public-only boundary');
absent(universal,'What Office creates','tangent result section');
absent(universal,'This is what Quote Builder produced—not just what it can store.','unapproved tangent result board');
absent(universal,'What Quote Builder produced','result-board wording');
absent(universal,'Whole-House Renovation and Property Improvement','renovation scope drift');
absent(universal,'$342,815','obsolete renovation total');

need(catalog,"VERSION:'2026-07-26-universal-v2'",'current UQB catalog version');
need(catalog,'New-house construction from lot clearing to closeout','ground-up catalog example');
need(catalog,'H38_UQB_PUBLIC_DEMO','shared Office demo definition');
absent(catalog,'Whole-House Renovation and Property Improvement','stale house scope');

['boUniversalPublicDemoStep','boUniversalPublicDemoStatus','boRenderUniversalPublicDemo_','boRenderUniversalPublicDrawing_','boRenderUniversalPublicQuote_'].forEach(fn=>need(server,'function '+fn,'Office demo function '+fn));
need(server,"PROPERTY_PROJECT:'H38_UQB_PUBLIC_DEMO_PROJECT_ID'",'published project pointer');
need(server,"PROJECT_TITLE:'New-House Construction — Lot Clearing to Closeout'",'locked project title');
need(server,'TOTAL:602050','coordinated Office total');
need(server,'UrlFetchApp.fetch','CAD attachment import through Office');
need(server,'DocumentApp.create','Office PDF generation');
need(server,"boUqbPublicDemoUpsert_('PROJECTS'",'persistent project record');
need(server,"boUqbPublicDemoUpsert_('SUBQUOTES'",'persistent subquote records');
need(server,"boUqbPublicDemoUpsert_('ITEMS'",'persistent item records');
need(server,"boUqbPublicDemoUpsert_('SCOPES'",'persistent scope records');
need(server,"boUqbPublicDemoUpsert_('DRAWINGS'",'persistent drawing records');
need(server,'H38_BO_SHEETS.DOCUMENTS','Business Office document records');
need(server,"externalActionsPerformed:false",'no external action proof');
need(server,"'Customer Visible':'Yes'",'customer visibility control');
const quoteSpecs=(server.match(/Object\.freeze\(\{n:'\d{2}',key:/g)||[]).length;
if(quoteSpecs!==14)throw new Error('Expected 14 Office quote specifications; found '+quoteSpecs);
const drawingSpecs=(server.match(/Object\.freeze\(\{n:'(?:G|A|M|P|E|C-S-L)-/g)||[]).length;
if(drawingSpecs!==10)throw new Error('Expected 10 Office drawing specifications; found '+drawingSpecs);

need(examples,'H38_UQB_PUBLIC_EXAMPLE_PACKAGES','matched package registry');
need(examples,'function boRenderUniversalPublicExamples_','public examples renderer');
need(examples,'function boRenderUniversalPublicExamplePackage_','complete package renderer');
need(examples,'function boUqbPublicExampleSafeSvg_','safe full-size CAD renderer');
need(examples,'View full quote','per-example full quote action');
need(examples,'View full-size CAD sheets','per-example CAD action');
need(examples,'Print / save complete package','per-example package action');
need(examples,'No live customers, private Highway 38 records','public-only explanation');
need(examples,"@page cad{size:17in 11in landscape",'full-size CAD print page');
need(examples,"row['Customer Visible']==='Yes'",'public quote visibility filter');
const packageSpecs=(examples.match(/Object\.freeze\(\{key:'/g)||[]).length;
if(packageSpecs!==7)throw new Error('Expected 7 matched public example packages; found '+packageSpecs);
const matchedSheets=[...examples.matchAll(/sheets:\[([^\]]+)\]/g)].flatMap(match=>(match[1].match(/'[^']+'/g)||[]));
if(matchedSheets.length!==10)throw new Error('Expected all 10 CAD sheets to be assigned exactly once; found '+matchedSheets.length);
if(new Set(matchedSheets).size!==10)throw new Error('A CAD sheet is duplicated across public example packages.');

need(publicRoute,"h38UnifiedShellParameter_(event,'publicUqbPackage')",'public package route');
need(publicRoute,"h38UnifiedShellParameter_(event,'view')",'public package view selector');
need(publicRoute,'boRenderUniversalPublicExamples_','matched examples route');
need(publicRoute,'boRenderUniversalPublicExamplePackage_','complete package route');
need(publicRoute,'return null;','private-route fallthrough');

need(web,'if(p.publicUqbDemo)return boRenderUniversalPublicDemo_();','preserved standalone public demo route');
need(web,'if(p.publicUqbDrawing)return boRenderUniversalPublicDrawing_','public drawing route');
need(web,'if(p.publicUqbQuote)return boRenderUniversalPublicQuote_','public quote route');
need(index,"boInclude_('BusinessOffice_UniversalQuoteBuilder_PublicDemo_UI')",'Owner demo control include');
need(client,'Build / Refresh Public Demo','Owner build button');
need(client,'boUniversalPublicDemoStep','resumable Office generation call');
need(client,'while(!result.complete)','controlled completion loop');

['Rick Krueth','rkrueth@gmail.com','USER-OWNER','RUN-20260725','UQBP-','UQBS-'].forEach(marker=>{
  absent(universal,marker,'private marker on public page');
  absent(examples,marker,'private marker in public example renderer');
});
['Print / Save Complete Package','DEMONSTRATION — NOT A CONTRACT','Revision E'].forEach(label=>need(sample,label,'preserved static source package '+label));
const cad=spawnSync(process.execPath,[path.join(root,'scripts','verify-professional-house-cad.js')],{cwd:root,encoding:'utf8'});
if(cad.status!==0)throw new Error('Professional CAD verification failed:\n'+cad.stdout+'\n'+cad.stderr);

for(const [file,text] of [['server',server],['catalog',catalog],['examples',examples],['publicRoute',publicRoute]]){
  try{new Function(text);}catch(error){throw new Error(file+' JavaScript syntax failed: '+error.message);}
}
for(const [file,text] of [['client',client]]){
  const blocks=[...text.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  blocks.forEach(block=>{try{new Function(block[1]);}catch(error){throw new Error(file+' JavaScript syntax failed: '+error.message);}});
}
console.log(JSON.stringify({status:'PASS',source:'public demonstration records only',quoteSpecs,drawingSpecs,matchedPackages:packageSpecs,matchedSheets:matchedSheets.length,publicRoute:true,resumable:true,professionalCad:true,externalActions:0},null,2));
