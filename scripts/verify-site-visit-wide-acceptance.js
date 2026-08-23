const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const read=path=>fs.readFileSync(path,'utf8');

const source=read('commercial-app/site-visit-wide-acceptance-final.js');
new vm.Script(source,{filename:'site-visit-wide-acceptance-final.js'});
class Bridge{async request(){return{status:'PASS'}}}
const noop=()=>{};
const document={documentElement:{},body:{classList:{add:noop,remove:noop}},visibilityState:'visible',getElementById:()=>null,querySelector:()=>null,addEventListener:noop,createElement:()=>({style:{},dataset:{},appendChild:noop,setAttribute:noop})};
const quoteId='QUOTE-5F18EFD4-EA8D-4935-ADF0-30C8374B3F1B';
const session='SCAN-E8B07254-932B-4442-9ACF-ED1F51EF4E39';
const snapshot={
 quotes:[{'Quote ID':quoteId,'Project Title':"Amanda's flower garden border",'Scope':'Install a border/edging around the existing flower garden; add black dirt; remove some trees and weeds.','Site Scanner Session ID':session,'Site Visit ID':'VISIT-53536424-F4E0-4EEC-A25D-61562C4BD0A3','Action Picture ID':'ATTACH-AF0EA095-FA2E-4698-B7CC-38CCB5DC0BCE','Action Picture Rotation Degrees':270,'Action Picture Orientation':'LANDSCAPE_CORRECTED_CCW_90'}],
 siteMeasurements:[
  {'Site Measurement ID':'FIELD-PERIMETER','Quote ID':quoteId,'Capture Session ID':session,'Label':'Total linear footage (perimeter length) of the border/edging to be installed','Value':528,'Unit':'in','Source':'MANUAL_LASER','Verification Status':'FIELD_MEASURED','Updated Time':'2026-08-21T20:47:09Z'},
  {'Site Measurement ID':'VIDEO-PERIMETER','Quote ID':quoteId,'Capture Session ID':session,'Label':'Total linear footage (perimeter length) of the border/edging to be installed — measure along the proposed edge (feet).','Value':473.375,'Unit':'in','Source':'CAMERA_ESTIMATE','Verification Status':'UNVERIFIED','Updated Time':'2026-08-21T20:50:53Z'},
  {'Site Measurement ID':'FIELD-WIDTH','Quote ID':quoteId,'Capture Session ID':session,'Label':'Average and minimum/maximum width (depth) of the planting bed at representative locations','Value':264,'Unit':'in','Source':'MANUAL_LASER','Verification Status':'FIELD_MEASURED'},
  {'Site Measurement ID':'FIELD-TOPSOIL','Quote ID':quoteId,'Capture Session ID':session,'Label':'Desired thickness of black dirt/topsoil to add','Value':3,'Unit':'in','Source':'MANUAL_LASER','Verification Status':'FIELD_MEASURED'}
 ],
 documents:[{'Document ID':'ATTACH-AF0EA095-FA2E-4698-B7CC-38CCB5DC0BCE','Quote ID':quoteId,'Capture Session ID':session,'Source Type':'Site Visit','Source ID':'VISIT-53536424-F4E0-4EEC-A25D-61562C4BD0A3','Mime Type':'image/jpeg','Action Picture Rotation Degrees':270,'Action Picture Orientation':'LANDSCAPE_CORRECTED_CCW_90'}],
 jobNotes:[{'Quote ID':quoteId,'Capture Session ID':session,'Body':'Minimum 6 inches maximum 12 inches; show different possibilities and prices.'}],
 siteCaptureSessions:[
  {'Capture Session ID':session,'Site Visit ID':'VISIT-53536424-F4E0-4EEC-A25D-61562C4BD0A3','Quote ID':quoteId,'Project Title':"Amanda's flower garden border",'Customer ID':'GENERIC-QUOTE-CUSTOMER','Status':'COMPLETE','Started Time':'2026-08-20T23:25:02Z'},
  {'Capture Session ID':'LOCAL-ALIAS-SESSION','Project Title':"Amanda's flower garden border",'Status':'LOCAL_DRAFT','Started Time':'2026-08-21T14:43:04Z'}
 ]
};
const fieldCore={state:{open:false,visit:{quoteId,sessionId:session},measurements:[],render:noop}};
const context={console,window:{state:{page:'quotes',businessId:'10b85a89-5834-436d-95b0-c6ee2eb335ad',quote:{quoteId},snapshot},H38Bridge:Bridge,H38_BUSINESS_OFFICE_SUPABASE:{},H38_SUPABASE_SHARED_CLIENT:{ensure:()=>null},H38_FIELD_VISIT_CORE:fieldCore,addEventListener:noop,dispatchEvent:noop,esc:s=>s,H38_QUOTE_ACTION_PHOTO_BY_QUOTE:{}},document,Element:function(){},CustomEvent:function(){},AbortController,fetch:async()=>{throw new Error('network not used')},setTimeout:()=>0,clearTimeout:noop,requestAnimationFrame:cb=>cb(),CSS:{escape:s=>s},crypto};
Object.assign(context.window,{window:context.window,document,setTimeout:context.setTimeout,clearTimeout:context.clearTimeout,requestAnimationFrame:context.requestAnimationFrame,CSS:context.CSS,CustomEvent:context.CustomEvent,fetch:context.fetch,AbortController,crypto});
vm.createContext(context);vm.runInContext(source,context,{filename:'site-visit-wide-acceptance-final.js'});
const api=context.window.H38_SITE_VISIT_WIDE_ACCEPTANCE_FINAL;
assert(api?.enabled);
assert.strictEqual(api.build,'20260821-site-visit-wide-acceptance-final-3-phone');
const canonical=api.canonicalizeMeasurements(snapshot.siteMeasurements);
assert.strictEqual(canonical.find(row=>/perimeter/i.test(row.label)).value,528);
assert.strictEqual(canonical.find(row=>/topsoil/i.test(row.label)).value,3);
assert(api.syncFieldMeasurementState());
assert(fieldCore.state.measurements.length>0);
assert.strictEqual(api.actionPictureInfo(quoteId,{}).sourceId,'ATTACH-AF0EA095-FA2E-4698-B7CC-38CCB5DC0BCE');

const runtime=read('commercial-app/quote-runtime-authority.js');
new vm.Script(runtime,{filename:'quote-runtime-authority.js'});
for(const marker of ['20260822-quote-runtime-authority-2-machine','QUOTE_RESPONSE_BUDGET_MS=60000','QUOTE_PROVIDER_BUDGET_MS=55000','OPTIONS_RESPONSE_BUDGET_MS=80000','function ownerReviewFallback(prepared,reason)','function boundedBuild(promise,prepared)','automaticDraftRepair:true','automaticFailureRecovery:true','automaticMeasurementHydration:true','automaticDirectionsAfterBaseDraft:true','directionsDoNotBlockBaseQuote:true','allQuoteBuildsUseMachine:true','ownerActionStartsMachine:true','if(action===\'aiBuildQuoteDraft\')return buildQuote','void loadDirections(prepared,base,OPTIONS_RESPONSE_BUDGET_MS)'])assert(runtime.includes(marker),`runtime missing ${marker}`);
assert(!runtime.includes("Amanda's flower garden border"));

const identity=read('commercial-app/site-visit-work-dedupe-final.js');
new vm.Script(identity,{filename:'site-visit-work-dedupe-final.js'});
for(const marker of ['20260822-site-visit-work-dedupe-final-8-phone','function localAliasIdentity(identity)','function removeSameTitleLocalAliases(','if(item.clue.local)result-=1000','poisonedLocalDatasetCannotBeatVisibleLocalStatus:true','sameTitlePhysicalLocalAliasRemoved:true'])assert(identity.includes(marker),`identity missing ${marker}`);
assert(!identity.includes('new MutationObserver'));
assert(!identity.includes(".from('business_records').delete"));

const handoff=read('commercial-app/site-visit-quote-handoff-final.js');
new vm.Script(handoff,{filename:'site-visit-quote-handoff-final.js'});
for(const marker of ['20260822-site-visit-quote-handoff-final-5-machine','function canonicalQuoteCandidate()','async function ensureCanonicalQuoteOpen(','async function canonicalHandoff()','handoff:canonicalHandoff','quoteMachineDelegated:true','allQuotesShareRepairMachine:true','boundedOwnerReviewFallbackDelegated:true','canonicalQuoteHandoff:true','localQuoteAliasDomSuppression:true','office.quote.quoteId=quoteIdOf(quote)','const runtime=window.H38_QUOTE_RUNTIME_AUTHORITY'])assert(handoff.includes(marker),`handoff missing ${marker}`);
assert(!handoff.includes('function ownerReviewFallback(args,reason)'));
assert(!handoff.includes('function boundedDraft(promise,args)'));

const manual=read('commercial-app/quote-manual-image-controls.js');
assert(manual.includes('Choose an Action Photo before rendering.'),'recorded legacy manual gate was not found');
const render=read('commercial-app/quote-render-approval.js');
new vm.Script(render,{filename:'quote-render-approval.js'});
for(const marker of ['20260821-render-saved-action-picture-2-phone','function installFinalGenerateCapture()','event.stopImmediatePropagation()','function finalRenderRuntime()','waitForFinalRenderRuntime','savedInternalActionPictureAuthority:true','legacyManualRenderGateBypassed:true','bridgeRenderFallback:false','finalRuntimeRequired:true'])assert(render.includes(marker),`render missing ${marker}`);
assert(!render.includes('window.state?.bridge?.request'));

const quoteAi=read('supabase/functions/h38-quote-ai/index.ts');
for(const marker of ['20260822-owner-bounded-draft-21','const QUOTE_MODEL_TIMEOUT_MS = 55000;','detail: "low"','serverBreakoutSecondPass: false','singleModelPass: true'])assert(quoteAi.includes(marker),`quote ai missing ${marker}`);
assert.strictEqual((quoteAi.match(/draft = await callQuoteModel\(context, photos\)/g)||[]).length,1);
assert(!quoteAi.includes('SERVER REPAIR REQUEST'));
assert(!quoteAi.includes('previousDraft'));
assert(!quoteAi.includes('entity_id: quoteId'));
assert((quoteAi.match(/entity_id: null/g)||[]).length>=2);

const quoteOptions=read('supabase/functions/h38-quote-options/index.ts');
for(const marker of ['20260822-quote-options-directions-2','AbortSignal.timeout(80000)','entity_id:null','details:{quoteId'])assert(quoteOptions.includes(marker),`quote options missing ${marker}`);
assert(!quoteOptions.includes('entity_id:quoteId'));

const reproduction=read('commercial-app/quote-reproduction-authority.js');
new vm.Script(reproduction,{filename:'quote-reproduction-authority.js'});
for(const marker of ['20260823-quote-reproduction-authority-1','historicalQuotesUseMachine:true','savedQuoteNotesHydrated:true','savedMeasurementNotesHydrated:true','savedEstimateHydrated:true','savedImagesReused:true','historicalActionPictureRecovered:true','reproductionFromEvidencePackage:true'])assert(reproduction.includes(marker),`reproduction missing ${marker}`);
const revision=read('commercial-app/quote-revision-authority.js');
new vm.Script(revision,{filename:'quote-revision-authority.js'});
for(const marker of ['20260823-quote-revision-authority-1','collection:\'quoteRevisions\'','INTERNAL_QUOTE_WORKING_COPY_NOT_COMMITTED','contentChangeOnlyRevisions:true','immutableRevisionSnapshots:true','internalPrebuildDoesNotBumpRevision:true','unchangedSaveKeepsRevision:true','changedSaveCreatesRevision:true','changedSendCreatesRevision:true','imageAndRenderChangesCount:true'])assert(revision.includes(marker),`revision missing ${marker}`);

const loader=read('commercial-app/site-visit-quote-wide-pass-loader.js');
for(const marker of ['20260823-site-visit-quote-wide-pass-loader-16-revision','20260822-quote-runtime-authority-2-machine','20260822-site-visit-work-dedupe-final-8-phone','20260822-site-visit-quote-handoff-final-5-machine','site-visit-wide-acceptance-final-3-phone','20260823-spoken-measurement-authority-final-1','20260823-quote-reproduction-authority-1','20260823-quote-revision-authority-1','20260823-site-visit-deep-polish-1','20260823-quote-regression-runner-1',"ASSET_BUILD='20260823-quote-revision-polish-1'",'sharedQuoteRepairMachine:true','allQuotesShareRepairMachine:true','historicalQuotesShareRepairMachine:true','contentChangeOnlyQuoteRevisions:true','immutableQuoteRevisionSnapshots:true','internalPrebuildDoesNotBumpRevision:true','canonicalQuoteHandoff:true','poisonedLocalDatasetSuppression:true','boundedQuoteDraftResponse:true','legacyManualRenderGateBypassed:true'])assert(loader.includes(marker),`loader missing ${marker}`);
const hammer=read('commercial-app/quote-working-hammer.js');
assert(hammer.includes('20260823-quote-working-ui-only-18-revision'));
assert(hammer.includes('site-visit-quote-wide-pass-loader-16-revision'));
assert(hammer.includes('allQuotesShareRepairMachine:true'));
assert(hammer.includes('contentChangeOnlyQuoteRevisions:true'));
const sw=read('commercial-app/service-worker.js');
for(const file of ['quote-runtime-authority.js','quote-render-approval.js','quote-measurement-action-photo-guard.js','site-visit-quote-handoff-final.js','site-visit-work-dedupe-final.js','site-visit-quote-wide-pass-loader.js','quote-reproduction-authority.js','quote-revision-authority.js','quote-regression-runner.js'])assert(sw.includes(file));

console.log('PASS quote machine replay: historical and Site Visit quotes share bounded repair + immutable content-aware revisions + rerender authority');
