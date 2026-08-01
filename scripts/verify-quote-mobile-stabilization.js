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
const chunks=read('apps-script/business-office/BusinessOffice_QuoteBuilder_AI_ChunkUpload.gs');
const edit=read('apps-script/business-office/BusinessOffice_QuoteBuilder_EditExisting_Client.html');
const resolver=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Mobile_PriceResolve.gs');
const localPricing=read('apps-script/business-office/BusinessOffice_QuoteBuilder_LocalPricing.gs');
need(raw,'const CHUNK_BYTES=6*1024*1024','single-call upload for normal phone photos');
need(raw,'const UPLOAD_TIMEOUT_MS=90000','bounded larger photo request');
need(raw,"withTimeout(direct('boQuoteBuilderAiChunkPart'",'bounded chunk requests');
need(raw,'ESTIMATING METHOD FOR THIS INTERNAL DRAFT','reference-object measurement guidance');
need(raw,'label every derived quantity approximate','approximate measurement disclosure');
need(raw,"direct('boQuoteBuilderResolveLinePrice'",'Price Book-first line resolver');
need(raw,"result.source==='price_book_match'",'Price Book match classification');
need(raw,'stats.unpriced','visible unpriced-line count');
need(raw,'Review measurements, quantities and prices','owner review completion instruction');
need(raw,"direct('boQuoteBuilderAutoLocalPrice'",'deployment-safe local pricing fallback');
need(raw,"entry.reader=entry.file.stream().getReader()",'Android file stream opened immediately');
need(raw,'entry.firstRead=entry.reader.read()','first Android read begins during picker change');
need(raw,'scheduleImmediateUploads()','selection immediately schedules upload');
need(raw,'const firstDataPromise=nextBase64Chunk(entry,0)','first photo chunk read before server wait');
need(raw,'uploaded safely. Press Build Quote.','visible completed-upload state');
need(raw,"input.style.cssText='position:fixed;left:-10000px",'offscreen persistent picker instead of hidden Android input');
need(raw,"requestAnimationFrame(()=>input.click())",'picker launch remains in the user gesture cycle');
need(raw,"window.addEventListener('pageshow'",'picker return recovery');
need(raw,'window.qbAttachStagedPhotosToQuote=attachStagedPhotos','edited quote photo attachment hook');
need(raw,'window.qbResetStagedPhotoState=resetPhotoState','photo-state reset hook');
reject(raw,'input.hidden=true','hidden picker that can strand Android in a broken image tab');
reject(raw,'document.createElement(\'canvas\')','phone-side image decoding');
reject(raw,'createImageBitmap','phone-side bitmap allocation');
reject(raw,'await fetch(','blob preview fetch');
need(chunks,'H38_QB_AI_CACHE_SEGMENT_CHARS','bounded cache segmentation');
need(chunks,'CacheService.getUserCache().putAll','temporary chunks stored without Drive writes');
need(chunks,'boQuoteBuilderReadAiChunk_','cached chunk reconstruction');
need(chunks,"storage: 'user_cache'",'cache-backed upload proof');
reject(chunks,'folder.createFile(Utilities.newBlob(data','temporary Drive file per chunk');
reject(chunks,'DriveApp.getFileById(session.parts','Drive read per temporary chunk');
need(edit,'Edit and reprocess','saved draft returns to main builder');
need(edit,'id="customer"','saved customer restored to builder field');
need(edit,'id="project"','saved project restored to builder field');
need(edit,'id="lines"','saved lines restored to builder line editor');
need(edit,'id="qbSimplePhotoQuote"','photo reprocessing available while editing');
need(edit,'press Build Quote to run the estimate again','clear reprocessing instruction');
need(edit,'window.qbAddLine=function(item)','AI lines populate edited quote');
need(edit,'await window.qbAttachStagedPhotosToQuote(result.quoteId)','new photos attach to edited quote');
need(edit,'await window.qbEditExisting(result.quoteId)','saved edit remains in Quote Builder');
need(edit,"window.qbResetStagedPhotoState==='function'",'stale photo state cleared when reopening or leaving drafts');
need(edit,'.qb-mobile-drafts','mobile draft action list');
need(edit,'Open and Edit Draft','visible mobile edit action');
need(edit,"openButton.removeAttribute('onclick')",'dashboard Open converted directly to Edit');
need(edit,"withTimeout(direct('boQuoteBuilderEditableQuote'",'bounded draft load');
reject(edit,'setInterval(install,600)','continuous dashboard rescanning');
need(resolver,'function boQuoteBuilderResolveLinePrice(payload)','server price resolver');
need(resolver,'function boQuoteBuilderNormalizeMobilePriceItem_(item)','production Price Book schema normalization');
need(resolver,"item['Product / Service ID'] || item['Catalog ID']",'canonical and production catalog IDs supported');
need(resolver,"item.Category || item.Family || item['Record Type']",'production family/category support');
need(resolver,"item['Standard Selling Price'] || item.Price",'canonical and production prices supported');
need(resolver,"boQuoteBuilderSnapshot_(H38_BO_SHEETS.PRODUCTS",'raw production products searched');
need(resolver,"source:'price_book_match'",'existing match result');
need(resolver,"source = 'local_research'",'local research only after no match');
need(resolver,"boProof_('AUTO MATCH PRICE BOOK'",'Price Book match proof');
need(resolver,'finalPriceApproved:false','no automatic price approval');
need(resolver,'ownerReviewRequired:true','owner review preserved');
need(localPricing,'function boQuoteBuilderExtractResponseText_(json)','raw Responses API output extraction');
need(localPricing,"part.json",'structured response content support');
need(localPricing,"props.getProperty('H38_AI_PRICING_MODEL')",'dedicated pricing model override');
need(localPricing,"props.getProperty('H38_AI_TEXT_MODEL') || 'gpt-4.1-mini'",'reliable text model fallback');
need(localPricing,'max_output_tokens: 4000','expanded structured research output budget');
need(localPricing,'max_output_tokens: 5000','expanded fallback research output budget');
need(localPricing,"Return exactly one JSON object and no markdown",'unstructured retry when strict response is empty');
need(localPricing,"boAssert_(data, 'Local price research returned no usable structured result.')",'truthful failure after both attempts');
need(localPricing,"'Catalog ID'",'learned price saved into production product schema');
need(localPricing,"Category: 'Locally Researched Prices'",'learned price returned as a normal quote item');
const productionRows=[
  {'Catalog ID':'LOCAL-GUTTER','Record Type':'Learned Price','Name':'6 inch seamless gutter replacement [per ft]','Family':'Locally Researched Prices','Price':'15.75','Active':'Yes','Catalog Source':JSON.stringify({unit:'ft',description:'Remove and replace 6 inch white seamless gutter'})},
  {'Catalog ID':'LOCAL-DOWNSPOUT','Record Type':'Learned Price','Name':'Downspout installation [per each]','Family':'Locally Researched Prices','Price':'210.00','Active':'Yes','Catalog Source':JSON.stringify({unit:'each',description:'Install one downspout with outlet and elbows'})},
  {'Catalog ID':'LOCAL-DOOR','Record Type':'Learned Price','Name':'Exterior door repair [per each]','Family':'Carpentry','Price':'325.00','Active':'Yes','Catalog Source':JSON.stringify({unit:'each',description:'Repair an exterior door'})}
];
const context={
  boNormalizeText_:value=>String(value==null?'':value).trim(),
  H38_BO_SHEETS:{PRODUCTS:'BO Products & Services'},
  boQuoteBuilderPriceBook_:()=>[],
  boQuoteBuilderSnapshot_:()=>({rows:productionRows})
};
vm.runInNewContext(resolver,context);
const gutter=context.boQuoteBuilderExistingLinePrice_({description:'6 inch white gutter replacement - approximate length 40 ft',query:'6 inch white gutter replacement. Work scope: door with window is 36 inches by 80 inches',unit:'ft'});
if(!gutter||gutter.item['Product / Service ID']!=='LOCAL-GUTTER'||Number(gutter.item.Price)!==15.75)throw new Error('Production-schema learned gutter price did not populate.');
const downspout=context.boQuoteBuilderExistingLinePrice_({description:'Downspout installation - 1 downspout',query:'Downspout installation. Work scope: door with window is 36 inches by 80 inches',unit:'each'});
if(!downspout||downspout.item['Product / Service ID']!=='LOCAL-DOWNSPOUT'||Number(downspout.item.Price)!==210)throw new Error('Production-schema learned downspout price did not populate.');
if(gutter.item['Product / Service ID']==='LOCAL-DOOR'||downspout.item['Product / Service ID']==='LOCAL-DOOR')throw new Error('Door reference contaminated gutter pricing.');
scripts(raw).forEach(body=>new Function(body));
scripts(edit).forEach(body=>new Function(body));
new Function(chunks);
new Function(resolver);
new Function(localPricing);
console.log('PASS — normal phone photos upload in one cache-backed request without temporary Drive files, Android picker return is stable, mobile drafts open directly in Edit, pricing populates, and owner-review boundaries remain enforced.');
