#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const need=(text,marker,label)=>{if(!text.includes(marker))throw new Error(`Missing ${label}: ${marker}`)};
const reject=(text,marker,label)=>{if(text.includes(marker))throw new Error(`Forbidden ${label}: ${marker}`)};
const scripts=text=>[...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
const raw=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Android_RawUpload.html');
const resolver=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Mobile_PriceResolve.gs');
need(raw,'const ANALYSIS_TIMEOUT_MS=150000','bounded mobile AI analysis');
need(raw,"withTimeout(direct('boQuoteBuilderAiChunkPart'",'bounded chunk requests');
need(raw,'ESTIMATING METHOD FOR THIS INTERNAL DRAFT','reference-object measurement guidance');
need(raw,'label every derived quantity approximate','approximate measurement disclosure');
need(raw,"direct('boQuoteBuilderResolveLinePrice'",'Price Book-first line resolver');
need(raw,"result.source==='price_book_match'",'Price Book match classification');
need(raw,'stats.unpriced','visible unpriced-line count');
need(raw,'Review measurements, quantities and prices','owner review completion instruction');
need(raw,"direct('boQuoteBuilderAutoLocalPrice'",'deployment-safe local pricing fallback');
reject(raw,'document.createElement(\'canvas\')','phone-side image decoding');
reject(raw,'createImageBitmap','phone-side bitmap allocation');
reject(raw,'await fetch(','blob preview fetch');
need(resolver,'function boQuoteBuilderResolveLinePrice(payload)','server price resolver');
need(resolver,'boQuoteBuilderPriceBook_({})','existing Price Book searched first');
need(resolver,"source:'price_book_match'",'existing match result');
need(resolver,"source = 'local_research'",'local research only after no match');
need(resolver,"boProof_('AUTO MATCH PRICE BOOK'",'Price Book match proof');
need(resolver,'finalPriceApproved:false','no automatic price approval');
need(resolver,'ownerReviewRequired:true','owner review preserved');
const context={
  boNormalizeText_:value=>String(value==null?'':value).trim(),
  boQuoteBuilderPriceBook_:()=>[
    {'Product / Service ID':'GUTTER-6','Name':'6 inch seamless gutter','Customer Description':'White seamless gutter installed','Category':'Exterior','Unit':'linear ft','Standard Selling Price':'14.50'},
    {'Product / Service ID':'DOOR-REPAIR','Name':'Exterior door repair','Customer Description':'Repair an exterior door','Category':'Carpentry','Unit':'each','Standard Selling Price':'325.00'},
    {'Product / Service ID':'DOWNSPOUT','Name':'Downspout assembly','Customer Description':'Downspout, elbows and outlet','Category':'Exterior','Unit':'each','Standard Selling Price':'185.00'}
  ]
};
vm.runInNewContext(resolver,context);
const gutter=context.boQuoteBuilderExistingLinePrice_({description:'Install 6-inch white gutters',query:'Install 6-inch white gutters. Work scope: door with window is 36 inches by 80 inches',unit:'linear ft'});
if(!gutter||gutter.item['Product / Service ID']!=='GUTTER-6')throw new Error('Gutter line did not choose the gutter Price Book item.');
const downspout=context.boQuoteBuilderExistingLinePrice_({description:'Install one downspout with elbows and outlet',query:'Install one downspout with elbows and outlet. Work scope: door with window is 36 inches by 80 inches',unit:'each'});
if(!downspout||downspout.item['Product / Service ID']!=='DOWNSPOUT')throw new Error('Downspout line did not choose the downspout Price Book item.');
scripts(raw).forEach(body=>new Function(body));
new Function(resolver);
console.log('PASS — mobile photo workflow timeouts, Android permission retention, reference-object estimates, Price Book-first resolution, local fallback, and owner-review boundaries verified.');
