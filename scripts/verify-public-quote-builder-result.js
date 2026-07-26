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
const catalog=read('apps-script/business-office/BusinessOffice_UniversalQuoteBuilder.gs');
const web=read('apps-script/business-office/BusinessOffice_Web.gs');
const index=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Index.html');
const client=read('apps-script/business-office/BusinessOffice_UniversalQuoteBuilder_PublicDemo_UI.html');
const sample=read('whole-house-quote-package.html');

need(universal,'id="office-results"','Office result section');
need(universal,'Office-generated public demonstration','Office source label');
need(universal,'?publicUqbDemo=1','sanitized Office public route');
need(universal,'id="uqOfficeDemo"','embedded Office demo');
need(universal,'14</strong>complete phase quotes','14 quote proof');
need(universal,'56</strong>itemized quote lines','56 item proof');
need(universal,'10</strong>attached CAD sheets','10 CAD proof');
need(universal,'The H38 Business Office creates the project','Office-first explanation');
absent(universal,'This is what Quote Builder produced—not just what it can store.','unapproved tangent result board');
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
need(server,'Internal costs, margins, users, vendors, approval history, and private records are excluded.','public sanitization statement');
const quoteSpecs=(server.match(/Object\.freeze\(\{n:'\d{2}',key:/g)||[]).length;
if(quoteSpecs!==14)throw new Error('Expected 14 Office quote specifications; found '+quoteSpecs);
const drawingSpecs=(server.match(/Object\.freeze\(\{n:'(?:G|A|M|P|E|C-S-L)-/g)||[]).length;
if(drawingSpecs!==10)throw new Error('Expected 10 Office drawing specifications; found '+drawingSpecs);

need(web,'if(p.publicUqbDemo)return boRenderUniversalPublicDemo_();','public demo route before authentication');
need(web,'if(p.publicUqbDrawing)return boRenderUniversalPublicDrawing_','public drawing route');
need(web,'if(p.publicUqbQuote)return boRenderUniversalPublicQuote_','public quote route');
need(index,"boInclude_('BusinessOffice_UniversalQuoteBuilder_PublicDemo_UI')",'Owner demo control include');
need(client,'Build / Refresh Public Demo','Owner build button');
need(client,'boUniversalPublicDemoStep','resumable Office generation call');
need(client,'while(!result.complete)','controlled completion loop');

['Rick Krueth','rkrueth@gmail.com','USER-OWNER','RUN-20260725','UQBP-','UQBS-','Internal Cost','Margin'].forEach(marker=>absent(universal,marker,'private marker on public page'));
['Print / Save Complete Package','DEMONSTRATION — NOT A CONTRACT','Revision E'].forEach(label=>need(sample,label,'preserved static source package '+label));
const cad=spawnSync(process.execPath,[path.join(root,'scripts','verify-professional-house-cad.js')],{cwd:root,encoding:'utf8'});
if(cad.status!==0)throw new Error('Professional CAD verification failed:\n'+cad.stdout+'\n'+cad.stderr);

for(const [file,text] of [['server',server],['catalog',catalog]]){
  try{new Function(text);}catch(error){throw new Error(file+' JavaScript syntax failed: '+error.message);}
}
for(const [file,text] of [['client',client]]){
  const blocks=[...text.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  blocks.forEach(block=>{try{new Function(block[1]);}catch(error){throw new Error(file+' JavaScript syntax failed: '+error.message);}});
}
console.log(JSON.stringify({status:'PASS',source:'H38 Business Office',quoteSpecs,drawingSpecs,publicRoute:true,resumable:true,professionalCad:true,externalActions:0},null,2));
