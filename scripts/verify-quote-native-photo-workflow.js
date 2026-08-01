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
const aiPublic=read('apps-script/business-office/BusinessOffice_QuoteBuilder_AI_Public.gs');

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

need(aiPublic,'boQuoteBuilderPreserveRequiredScope_','server-side typed scope preservation');
need(aiPublic,'Explicitly entered by the user and preserved as required scope','typed scope evidence');
need(aiPublic,"/\\b(?:leaf|gutter)\\s*guards?\\b/",'leaf guard and gutter guard normalization');
need(aiPublic,"return 'linear foot'",'gutter guard unit selection');

need(live,'function boQuoteBuilderRunMobileProductionAcceptance()','live production acceptance entry');
need(live,'const targetUploadBytes = 4800000','normal phone-photo-sized live upload fixture');
need(live,'syntheticUploadBytes','live upload byte-count evidence');
need(live,"['1000007797.jpg', '1000007798.jpg']", 'two real gutter photos');
need(live,"projectTitle: 'Gutters'",'real gutter analysis');
need(live,"boBuildAiQuoteDraft({",'live AI photo analysis');
need(live,'boQuoteBuilderResolveLinePrice({','live pricing resolution');
need(live,'gutter && gutter.rate > 0','nonzero combined gutter-scope rate assertion');
need(live,"/downspout/i.test(gutterCoverage)",'downspout coverage assertion in combined catalog scope');
need(live,'boQuoteBuilderEditableQuote({ quoteId: quoteId })','live saved-draft edit load');
need(live,"approved: false",'no automatic approval');
need(live,"sent: false",'no automatic send');
need(live,"setTrashed(true)",'synthetic upload cleanup');
need(live,"'Is Voided': 'Yes'",'acceptance document cleanup');

const sandbox={console};
vm.runInNewContext(aiPublic,sandbox);
const omitted={draft:{suggestedLines:[{description:'6-inch white gutters replacement',quantity:44,unit:'linear foot',rate:15}]}};
const preserved=sandbox.boQuoteBuilderPreserveRequiredScope_(omitted,{notes:'Scope: Replace existing gutters with 6-inch white gutters and add leaf guard.'});
const leafLine=preserved.draft.suggestedLines.find(line=>/(leaf|gutter)\s*guard/i.test(line.description||''));
if(!leafLine)throw new Error('Typed leaf guard scope was not added when AI omitted it.');
if(Number(leafLine.quantity)!==44||leafLine.unit!=='linear foot')throw new Error('Leaf guard did not inherit the drafted gutter-run quantity and unit for owner review.');
if(!/manual_entry_required/.test(leafLine.priceStatus||''))throw new Error('Typed leaf guard line did not remain price-review controlled.');

const alreadyPresent={draft:{suggestedLines:[{description:'Install gutter guard',quantity:44,unit:'linear foot',rate:0}]}};
sandbox.boQuoteBuilderPreserveRequiredScope_(alreadyPresent,{notes:'Scope: Add leaf guard.'});
if(alreadyPresent.draft.suggestedLines.length!==1)throw new Error('Existing gutter guard line was duplicated.');

const assumptionOnly={draft:{suggestedLines:[]}};
sandbox.boQuoteBuilderPreserveRequiredScope_(assumptionOnly,{notes:'Known dimensions and assumptions: Door with window is 36 inches by 80 inches.'});
if(assumptionOnly.draft.suggestedLines.length)throw new Error('A measurement assumption was incorrectly converted into required work.');

scripts(recovery).forEach(body=>new Function(body));
scripts(edit).forEach(body=>new Function(body));
new Function(live);
console.log('PASS — native Android photo controls, real photo analysis, typed leaf guard preservation, combined gutter/downspout pricing, saved-draft editing, Android return recovery, and live production acceptance are wired without programmatic picker clicks.');
