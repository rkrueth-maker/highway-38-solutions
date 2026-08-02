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

const recovery=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Details_Recovery.html');
const live=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Mobile_LiveAcceptance.gs');
const edit=read('apps-script/business-office/BusinessOffice_QuoteBuilder_EditExisting_Client.html');
const editServer=read('apps-script/business-office/BusinessOffice_QuoteBuilder_EditExisting.gs');
const aiPublic=read('apps-script/business-office/BusinessOffice_QuoteBuilder_AI_Public.gs');
const priceResolve=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Mobile_PriceResolve.gs');

need(recovery,'id="qbNativeCamera" type="file"','visible native camera input');
need(recovery,'capture="environment"','rear-camera request on native input');
need(recovery,'id="qbNativeGallery" type="file"','visible native gallery input');
need(recovery,'Add one picture at a time. Each picture uploads immediately','clear reliable mobile instruction');
need(recovery,'entry.dataPromise=withTimeout(readDataUrl(file)','file read begins in the native change event');
need(recovery,'base64Data=await entry.dataPromise','queued upload consumes the already-started read');
need(recovery,"try{input.value=''}catch(ignore){}",'picker input remains alive until upload finishes');
need(recovery,"direct('boQuoteBuilderStageAiPhoto'",'single-request canonical private upload');
need(recovery,"direct('boBuildAiQuoteDraft'",'real saved-photo analysis');
need(recovery,"direct('boQuoteBuilderResolveLinePrice'",'Price Book-first pricing');
need(recovery,'applyLines(draft)','AI lines populate the quote');
need(recovery,"direct('boQuoteBuilderAttachStagedAiPhotos'",'saved photo attachment');
need(recovery,"api('quoteBuilderLastCreatedQuote')",'new-quote photo attachment handoff');
need(recovery,"window.addEventListener('pageshow'",'Android return recovery');
need(recovery,"document.addEventListener('visibilitychange'",'picker return recovery');
need(recovery,'event.stopImmediatePropagation()','legacy build handler blocked');
need(recovery,'input.value=\'\'','native picker released after selection');
reject(recovery,'document.createElement(\'input\')','generated file picker');
reject(recovery,'.click()','programmatic file-picker click');
reject(recovery,'boQuoteBuilderAiChunkBegin','cache/chunk upload path');
reject(recovery,'boQuoteBuilderAiChunkPart','cache/chunk upload path');
reject(recovery,'boQuoteBuilderAiChunkFinish','cache/chunk upload path');
reject(recovery,'document.createElement(\'canvas\')','phone-side image decoding');
reject(recovery,'createImageBitmap','phone-side bitmap allocation');

need(edit,'Open and Edit Draft','full-width mobile draft edit action');
need(edit,'window.qbEditExisting=async function','direct draft edit entry');
need(edit,"direct('boQuoteBuilderEditableQuote'",'saved draft server load');
need(edit,'Edit and reprocess','saved draft returns to builder');
need(edit,'id="qbSimplePhotoQuote"','photo reprocessing in edit mode');
need(edit,"direct('boQuoteBuilderUpdateEditableQuote'",'saved draft update');
need(editServer,'boQuoteBuilderDeleteQuoteLineRows_','exact saved-line replacement helper');
need(editServer,"headers.indexOf('Quote ID')",'real Quote ID column lookup');
need(editServer,'rowNumbers.sort(function (a, b) { return b - a; })','bottom-up physical row deletion');
reject(editServer,'deleteRow(row.__rowNumber)','filtered snapshot row deletion');

need(aiPublic,'boQuoteBuilderPreserveRequiredScope_','server-side typed scope preservation');
need(aiPublic,'Explicitly entered by the user and preserved as required scope','typed scope evidence');
need(aiPublic,'gutterguard','leaf guard and gutter guard normalization');
need(aiPublic,"return 'linear foot'",'gutter guard unit selection');
need(aiPublic,'boQuoteBuilderPreserveObservedGutterComponents_','visible downspout preservation');
need(aiPublic,'Include one visible downspout with the new gutter system','dedicated downspout quote line');
need(aiPublic,'boQuoteBuilderHasDedicatedDownspoutLine_','combined gutter/downspout split guard');

need(priceResolve,'boQuoteBuilderPriceSemantics_','line-specific price semantics');
need(priceResolve,'boQuoteBuilderPriceSemanticsCompatible_','incompatible Price Book rejection');
need(priceResolve,"dominant = 'gutter_guard'",'leaf-guard semantic priority');
need(priceResolve,"dominant = 'downspout'",'downspout semantic priority');

need(live,'function boQuoteBuilderRunMobileProductionAcceptance()','live production acceptance entry');
need(live,'const targetUploadBytes = 4800000','normal phone-photo-sized live upload fixture');
need(live,'syntheticUploadBytes','live upload byte-count evidence');
need(live,"['1000007797.jpg', '1000007798.jpg']", 'two real gutter photos');
need(live,"projectTitle: 'Gutters'",'real gutter analysis');
need(live,"boBuildAiQuoteDraft(analysisPayload)",'live AI photo analysis and reprocess');
need(live,'boQuoteBuilderResolveLinePrice({','live pricing resolution');
need(live,"leaf guard reused the gutter catalog item",'distinct leaf-guard catalog assertion');
need(live,"downspout reused the gutter catalog item",'distinct downspout catalog assertion');
need(live,'boQuoteBuilderUpdateEditableQuote','live saved-draft update');
need(live,'duplicateComponents: false','live reprocess duplicate assertion');
need(live,'boQuoteBuilderEditableQuote({ quoteId: quoteId })','live saved-draft edit load');
need(live,"approved: false",'no automatic approval');
need(live,"sent: false",'no automatic send');
need(live,"setTrashed(true)",'synthetic upload cleanup');
need(live,"'Is Voided': 'Yes'",'acceptance document cleanup');
need(live,'boQuoteBuilderMobileAcceptanceRestorePayload_','acceptance quote restoration');

const aiSandbox={console};
vm.runInNewContext(aiPublic,aiSandbox);
const omitted={draft:{photoObservations:['One downspout visible on the right side of the building.'],suggestedLines:[{description:'6-inch white gutters replacement',quantity:44,unit:'linear foot',rate:15}]}};
const preserved=aiSandbox.boQuoteBuilderPreserveRequiredScope_(omitted,{notes:'Scope: Replace existing gutters with 6-inch white gutters and add leaf guard.'});
const leafLine=preserved.draft.suggestedLines.find(line=>/(leaf|gutter)\s*guard/i.test(line.description||''));
const downspoutLine=preserved.draft.suggestedLines.find(line=>/downspout/i.test(line.description||''));
if(!leafLine)throw new Error('Typed leaf guard scope was not added when AI omitted it.');
if(Number(leafLine.quantity)!==44||leafLine.unit!=='linear foot')throw new Error('Leaf guard did not inherit the drafted gutter-run quantity and unit for owner review.');
if(!/manual_entry_required/.test(leafLine.priceStatus||''))throw new Error('Typed leaf guard line did not remain price-review controlled.');
if(!downspoutLine||Number(downspoutLine.quantity)!==1||downspoutLine.unit!=='each')throw new Error('The visible downspout was not preserved as a separate owner-review line.');

aiSandbox.boQuoteBuilderPreserveRequiredScope_(preserved,{notes:'Scope: Replace existing gutters with 6-inch white gutters and add leaf guard.'});
if(preserved.draft.suggestedLines.length!==3)throw new Error('Reprocessing duplicated preserved gutter components.');

const combined={draft:{photoObservations:['One downspout visible.'],suggestedLines:[{description:'Replace gutters and one downspout',quantity:44,unit:'linear foot',rate:15}]}};
aiSandbox.boQuoteBuilderPreserveRequiredScope_(combined,{notes:'Scope: Replace existing gutters with 6-inch white gutters and add leaf guard.'});
const dedicatedDownspouts=combined.draft.suggestedLines.filter(line=>{
  const text=aiSandbox.boQuoteBuilderScopeCanonicalText_(line.description||line.searchQuery||'');
  const d=text.indexOf('downspout'),g=text.indexOf('gutter');
  return d>=0&&(g<0||d<g);
});
if(dedicatedDownspouts.length!==1)throw new Error('A combined gutter/downspout line did not produce one dedicated downspout line.');

const alreadyPresent={draft:{suggestedLines:[{description:'Install gutter guard',quantity:44,unit:'linear foot',rate:0}]}};
aiSandbox.boQuoteBuilderPreserveRequiredScope_(alreadyPresent,{notes:'Scope: Add leaf guard.'});
if(alreadyPresent.draft.suggestedLines.length!==1)throw new Error('Existing gutter guard line was duplicated.');

const assumptionOnly={draft:{suggestedLines:[]}};
aiSandbox.boQuoteBuilderPreserveRequiredScope_(assumptionOnly,{notes:'Known dimensions and assumptions: Door with window is 36 inches by 80 inches.'});
if(assumptionOnly.draft.suggestedLines.length)throw new Error('A measurement assumption was incorrectly converted into required work.');

let priceBook=[
  {'Catalog ID':'CAT-GUTTER',Name:'6-inch white gutters replacement',Family:'Gutters',Price:15,Active:'Yes',Unit:'linear foot'},
  {'Catalog ID':'CAT-GUARD',Name:'Leaf guard installation',Family:'Gutter Accessories',Price:8,Active:'Yes',Unit:'linear foot'},
  {'Catalog ID':'CAT-DOWN',Name:'White downspout replacement',Family:'Gutters',Price:95,Active:'Yes',Unit:'each'}
];
const priceSandbox={
  console,
  H38_BO_SHEETS:{PRODUCTS:'Products'},
  boNormalizeText_:value=>String(value==null?'':value).trim(),
  boQuoteBuilderPriceBook_:()=>priceBook,
  boQuoteBuilderSnapshot_:()=>({rows:[]})
};
vm.runInNewContext(priceResolve,priceSandbox);
const leafMatch=priceSandbox.boQuoteBuilderExistingLinePrice_({description:'Leaf guard installation on all new gutter runs',query:'Leaf guard installation. Work scope: replace gutters and one downspout.',unit:'linear foot'});
const downspoutMatch=priceSandbox.boQuoteBuilderExistingLinePrice_({description:'Include one visible downspout with the new gutter system',query:'Include one visible downspout. Work scope: replace gutters and add leaf guard.',unit:'each'});
const gutterMatch=priceSandbox.boQuoteBuilderExistingLinePrice_({description:'6-inch white gutters replacement',query:'6-inch white gutters replacement. Work scope: add leaf guard and one downspout.',unit:'linear foot'});
if(!leafMatch||leafMatch.item['Product / Service ID']!=='CAT-GUARD')throw new Error('Leaf guard did not match the distinct leaf-guard Price Book item.');
if(!downspoutMatch||downspoutMatch.item['Product / Service ID']!=='CAT-DOWN')throw new Error('Downspout did not match the distinct downspout Price Book item.');
if(!gutterMatch||gutterMatch.item['Product / Service ID']!=='CAT-GUTTER')throw new Error('Gutter did not match the distinct gutter Price Book item.');
priceBook=[priceBook[0]];
const falseGuardMatch=priceSandbox.boQuoteBuilderExistingLinePrice_({description:'Leaf guard installation',query:'Leaf guard installation. Work scope: replace gutters.',unit:'linear foot'});
if(falseGuardMatch)throw new Error('Leaf guard incorrectly reused the bare gutter Price Book item.');
const falseDownspoutMatch=priceSandbox.boQuoteBuilderExistingLinePrice_({description:'Downspout installation',query:'Downspout installation. Work scope: replace gutters.',unit:'each'});
if(falseDownspoutMatch)throw new Error('Downspout incorrectly reused the bare gutter Price Book item.');

scripts(recovery).forEach(body=>new Function(body));
scripts(edit).forEach(body=>new Function(body));
new Function(live);
new Function(priceResolve);
new Function(editServer);
console.log('PASS — native Android photo controls, real photo analysis, typed leaf guard and visible downspout preservation, component-specific Price Book matching, saved-draft reprocessing, Android return recovery, and live production acceptance are wired without programmatic picker clicks.');
