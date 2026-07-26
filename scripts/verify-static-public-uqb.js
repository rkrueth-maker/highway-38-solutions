#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exists=file=>fs.existsSync(path.join(root,file));
const need=(text,marker,label)=>{if(!text.includes(marker))throw new Error(`Missing ${label}: ${marker}`);};
const absent=(text,marker,label)=>{if(text.includes(marker))throw new Error(`Unexpected ${label}: ${marker}`);};

const page=read('sample-library-now.html');
const redirect=read('universal-quote-builder.html');
const viewer=read('universal-quote-builder-example.html');
const dataSource=read('assets/js/uqb-public-examples.js');
const context={window:{}};
vm.createContext(context);
vm.runInContext(dataSource,context,{filename:'assets/js/uqb-public-examples.js'});
const data=context.window.H38_UQB_PUBLIC_EXAMPLES;
if(!data)throw new Error('Public UQB dataset did not initialize.');

const houseIndex=page.indexOf('data-project="cabin"');
const examplesIndex=page.indexOf('id="universal-quote-builder-examples"');
if(houseIndex<0)throw new Error('Whole-building house example is missing.');
if(examplesIndex<0)throw new Error('Embedded Universal Quote Builder examples are missing.');
if(examplesIndex<=houseIndex)throw new Error('Universal Quote Builder examples must appear directly after the house example.');

need(page,'Universal Quote Builder overview','overview beneath house');
need(page,'Complete quote examples matched to their CAD drawings','matched examples heading');
need(page,'View full quote','full quote action');
need(page,'View full-size CAD sheets','full-size CAD action');
need(page,'Print / save complete package','complete package action');
need(page,'assets/js/uqb-public-examples.js','public dataset include');
need(page,'universal-quote-builder-example.html?example=','static viewer route');
need(page,'does not connect to, read, or expose private Highway 38','private-record boundary');
need(page,'directly beneath the house example','placement statement');
absent(page,'class="universal-card"','separate Universal Quote Builder showcase card');
absent(page,'See What It Produced','tangent result-board action');
absent(page,'script.google.com','authenticated Apps Script dependency');
absent(page,'<iframe','public iframe dependency');
absent(page,'What Office creates','tangent result board');
absent(page,'What Quote Builder produced','tangent result board');

need(redirect,'sample-library-now.html#universal-quote-builder-examples','compatibility redirect to embedded examples');

need(viewer,'Print / Save PDF','print/save control');
need(viewer,'@page quote{size:letter portrait','letter quote print contract');
need(viewer,'@page cad{size:17in 11in landscape','full-size CAD print contract');
need(viewer,"mode!=='cad'",'quote/package mode');
need(viewer,"mode!=='quote'",'CAD/package mode');
need(viewer,'Open original SVG','full-size original CAD action');
need(viewer,'does not read or expose private Highway 38 records','viewer private-record boundary');
absent(viewer,'script.google.com','viewer Apps Script dependency');

if(data.version!=='2026-07-26-static-public-v1')throw new Error('Unexpected public dataset version.');
if(!Array.isArray(data.packages)||data.packages.length!==7)throw new Error(`Expected 7 public packages; found ${data.packages&&data.packages.length}.`);
const drawingKeys=Object.keys(data.drawings||{});
if(drawingKeys.length!==10)throw new Error(`Expected 10 public CAD sheets; found ${drawingKeys.length}.`);
const assigned=data.packages.flatMap(item=>item.sheets||[]);
if(assigned.length!==10||new Set(assigned).size!==10)throw new Error('Every public CAD sheet must be assigned exactly once.');
assigned.forEach(sheet=>{if(!data.drawings[sheet])throw new Error(`Missing drawing record ${sheet}.`);});
data.packages.forEach(item=>{
  if(!item.key||!item.title||!item.quoteTitle||!item.summary)throw new Error('A public package is missing presentation content.');
  if(!Array.isArray(item.scope)||item.scope.length!==4)throw new Error(`${item.key} must contain four scope lines.`);
  if(!Array.isArray(item.items)||item.items.length!==4)throw new Error(`${item.key} must contain four itemized price lines.`);
  const total=item.items.reduce((sum,line)=>sum+Number(line[4]||0),0);
  if(total!==Number(item.total))throw new Error(`${item.key} itemized total does not equal package total.`);
});

drawingKeys.forEach(sheet=>{
  const drawing=data.drawings[sheet];
  if(!drawing.asset.startsWith('assets/quote-builder/whole-house-cad/'))throw new Error(`${sheet} does not use the approved public CAD directory.`);
  if(!exists(drawing.asset))throw new Error(`Missing public CAD asset ${drawing.asset}.`);
});

const publicText=page+'\n'+redirect+'\n'+viewer+'\n'+dataSource;
['rkrueth@gmail.com','USER-OWNER','businessOfficeSpreadsheetId','rootFolderId','documentFolderId','pdfFolderId','backendSpreadsheetId','Internal Cost','Target Margin','Vendor ID','Approval ID'].forEach(marker=>absent(publicText,marker,'private marker in public UQB files'));

const result={
  status:'PASS',
  architecture:'static-public-github-pages',
  placement:'directly-beneath-whole-building-house-example',
  datasetVersion:data.version,
  publicPackages:data.packages.length,
  publicCadSheets:drawingKeys.length,
  matchedCadSheets:assigned.length,
  fullQuoteViews:true,
  fullSizeCadViews:true,
  printableCompletePackages:true,
  privateRecordsRead:false,
  authenticatedServiceRequired:false,
  externalActionsPerformed:false
};
const out=path.join(root,'artifacts','static-public-uqb');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
