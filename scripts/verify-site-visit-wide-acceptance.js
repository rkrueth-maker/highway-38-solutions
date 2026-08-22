const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const source=fs.readFileSync('commercial-app/site-visit-wide-acceptance-final.js','utf8');
new vm.Script(source,{filename:'site-visit-wide-acceptance-final.js'});
class Bridge{async request(){return{status:'PASS'}}}
class MutationObserver{constructor(cb){this.cb=cb}observe(){}disconnect(){}}
const noop=()=>{};
const document={documentElement:{},body:{classList:{add:noop,remove:noop}},visibilityState:'visible',getElementById:()=>null,querySelector:()=>null,addEventListener:noop,createElement:()=>({style:{},dataset:{},appendChild:noop,setAttribute:noop})};
const quoteId='QUOTE-5F18EFD4-EA8D-4935-ADF0-30C8374B3F1B';
const session='SCAN-E8B07254-932B-4442-9ACF-ED1F51EF4E39';
const snapshot={
 quotes:[{'Quote ID':quoteId,'Project Title':"Amanda's flower garden border",'Scope':'Install a border/edging around the existing flower garden; add black dirt; remove some trees and weeds.','Site Scanner Session ID':session,'Action Picture ID':'ATTACH-AF0EA095-FA2E-4698-B7CC-38CCB5DC0BCE','Action Picture Rotation Degrees':270,'Action Picture Orientation':'LANDSCAPE_CORRECTED_CCW_90'}],
 siteMeasurements:[
  {'Site Measurement ID':'FIELD-PERIMETER','Quote ID':quoteId,'Capture Session ID':session,'Label':'Total linear footage (perimeter length) of the border/edging to be installed','Value':528,'Unit':'in','Source':'MANUAL_LASER','Verification Status':'FIELD_MEASURED','Updated Time':'2026-08-21T20:47:09Z'},
  {'Site Measurement ID':'VIDEO-PERIMETER','Quote ID':quoteId,'Capture Session ID':session,'Label':'Total linear footage (perimeter length) of the border/edging to be installed — measure along the proposed edge (feet).','Value':473.375,'Unit':'in','Source':'CAMERA_ESTIMATE','Verification Status':'UNVERIFIED','Updated Time':'2026-08-21T20:50:53Z'},
  {'Site Measurement ID':'FIELD-WIDTH','Quote ID':quoteId,'Capture Session ID':session,'Label':'Average and minimum/maximum width (depth) of the planting bed at representative locations','Value':264,'Unit':'in','Source':'MANUAL_LASER','Verification Status':'FIELD_MEASURED'},
  {'Site Measurement ID':'VIDEO-TOPSOIL','Quote ID':quoteId,'Capture Session ID':session,'Label':'Desired thickness of black dirt/topsoil to add','Value':264,'Unit':'in','Source':'CAMERA_ESTIMATE','Verification Status':'UNVERIFIED'},
  {'Site Measurement ID':'FIELD-TOPSOIL','Quote ID':quoteId,'Capture Session ID':session,'Label':'Desired thickness of black dirt/topsoil to add','Value':3,'Unit':'in','Source':'MANUAL_LASER','Verification Status':'FIELD_MEASURED'}
 ],
 documents:[{'Document ID':'ATTACH-AF0EA095-FA2E-4698-B7CC-38CCB5DC0BCE','Quote ID':quoteId,'Source Type':'Site Visit','Action Picture Rotation Degrees':270,'Action Picture Orientation':'LANDSCAPE_CORRECTED_CCW_90'}],
 jobNotes:[{'Quote ID':quoteId,'Capture Session ID':session,'Body':'Minimum 6 inches maximum 12 inches; show different possibilities and prices. 7 ft to front edge and 9 ft left and right from sprinkler.'}],
 siteCaptureSessions:[
  {'Capture Session ID':session,'Quote ID':quoteId,'Project Title':"Amanda's flower garden border",'Customer ID':'GENERIC-QUOTE-CUSTOMER','Started Time':'2026-08-20T23:25:02Z'},
  {'Capture Session ID':'SCAN-CONTINUATION','Quote ID':quoteId,'Project Title':"Amanda's flower garden border",'Customer ID':'GENERIC-QUOTE-CUSTOMER','Started Time':'2026-08-21T20:40:00Z'}
 ]
};
const fieldCore={state:{open:false,visit:{quoteId,sessionId},measurements:[],render:noop}};
const context={console,window:{state:{page:'quotes',businessId:'10b85a89-5834-436d-95b0-c6ee2eb335ad',quote:{quoteId},snapshot},H38Bridge:Bridge,H38_BUSINESS_OFFICE_SUPABASE:{},H38_SUPABASE_SHARED_CLIENT:{ensure:()=>null},H38_FIELD_VISIT_CORE:fieldCore,addEventListener:noop,dispatchEvent:noop,esc:s=>s,H38_QUOTE_ACTION_PHOTO_BY_QUOTE:{}},document,MutationObserver,Element:function(){},CustomEvent:function(){},AbortController,fetch:async()=>{throw new Error('network not used')},setTimeout:()=>0,clearTimeout:noop,requestAnimationFrame:cb=>cb(),CSS:{escape:s=>s},crypto};
context.window.window=context.window;context.window.document=document;context.window.MutationObserver=MutationObserver;context.window.setTimeout=context.setTimeout;context.window.clearTimeout=context.clearTimeout;context.window.requestAnimationFrame=context.requestAnimationFrame;context.window.CSS=context.CSS;context.window.CustomEvent=context.CustomEvent;context.window.fetch=context.fetch;context.window.AbortController=AbortController;context.window.crypto=crypto;
vm.createContext(context);vm.runInContext(source,context,{filename:'site-visit-wide-acceptance-final.js'});
const api=context.window.H38_SITE_VISIT_WIDE_ACCEPTANCE_FINAL;
assert(api&&api.enabled,'wide acceptance authority did not load');
assert.strictEqual(api.build,'20260821-site-visit-wide-acceptance-final-3-phone','physical phone final authority build is not active');
assert.strictEqual(api.eventDrivenReconciliation,true,'wide acceptance reconciliation must be event driven');
assert.strictEqual(api.documentMutationObserver,false,'document-wide mutation observer must stay disabled');
assert.strictEqual(api.jobsMutationObserver,false,'Jobs mutation observer must stay disabled');
assert.strictEqual(api.fieldMeasurementStateHydration,true,'field measurement UI hydration must be active');
assert.strictEqual(api.guidedCameraEstimateSupersession,true,'guided camera estimate supersession must be active');
assert(!source.includes('new MutationObserver'),'wide acceptance authority must not construct DOM mutation observers');
assert(!source.includes("main.querySelectorAll('.row')"),'wide acceptance must not depend on .row Jobs markup');
const canonical=api.canonicalizeMeasurements(snapshot.siteMeasurements);
const perimeter=canonical.find(row=>/perimeter/i.test(row.label));
assert(perimeter,'perimeter missing from canonical measurements');
assert.strictEqual(perimeter.value,528,'later camera estimate displaced field-measured perimeter');
assert.strictEqual(perimeter.verificationStatus,'FIELD_MEASURED');
const topsoil=canonical.find(row=>/thickness of black dirt/i.test(row.label));
assert(topsoil,'topsoil thickness missing from canonical measurements');
assert.strictEqual(topsoil.value,3,'camera scale estimate displaced field-measured topsoil thickness');
assert(api.requestResolved('Verify total linear footage perimeter length 473.375 in again',[perimeter]),'verified perimeter did not suppress a later conflicting estimate prompt');
assert(api.syncFieldMeasurementState(),'open field state did not hydrate from authoritative snapshot');
assert(fieldCore.state.measurements.length>0,'Capture footer would still show zero measurements');
assert.strictEqual(fieldCore.state.measurements.find(row=>/perimeter/i.test(row.label)).value,528,'hydrated Capture state did not keep field perimeter authority');
const action=api.actionPictureInfo(quoteId,{});
assert.strictEqual(action.sourceId,'ATTACH-AF0EA095-FA2E-4698-B7CC-38CCB5DC0BCE');
assert.strictEqual(action.rotation,270);
assert.strictEqual(action.orientation,'LANDSCAPE_CORRECTED_CCW_90');
const sessions=snapshot.siteCaptureSessions;
assert.strictEqual(api.projectKey(sessions[0]),api.projectKey(sessions[1]),'continuation did not group under the same project/quote');
assert(source.includes("void loadDirections(prepared,base,timeout)"),'quote build still blocks on option generation');
assert(source.includes('AI pricing was unavailable. Keep this editable instead of failing the quote.'),'editable quote fallback missing');
assert(!/drywall|sheetrock|insulation material and labor/i.test(source),'landscape final authority contains trade-specific acceptance contamination');
const guided=fs.readFileSync('commercial-app/field-visit-guided-controller.js','utf8');
new vm.Script(guided,{filename:'field-visit-guided-controller.js'});
assert(guided.includes('20260821-guided-field-authority-2'),'guided walkthrough field authority did not advance');
assert(guided.includes('function verifiedMeasurementForLabel(label)'),'guided review cannot resolve camera estimates against field measurements');
assert(guided.includes('if(verifiedMeasurementForLabel(label))continue'),'superseded camera estimates can still be rendered active');
assert(guided.includes('verifiedMeasurementForLabel(item)'),'stale AI missing-measurement targets can still reopen verified dimensions');
assert(guided.includes('Field measurements always win.'),'guided UI does not communicate field measurement precedence');
const video=fs.readFileSync('supabase/functions/h38-video-measurements/index.ts','utf8');
assert(video.includes('video-reference-scale-v2-field-authority'),'video measurement backend did not advance to field-authority engine');
assert(video.includes('filterTargetsAgainstVerified'),'backend does not filter field-verified targets before AI');
assert(video.includes('NO_UNVERIFIED_TARGETS'),'backend lacks verified-target short circuit');
assert(video.includes('suppressVerifiedEstimates'),'backend does not suppress a matching camera estimate after AI');
assert(video.includes('supersededByFieldMeasurementId'),'suppressed camera evidence is not linked to field authority');
assert(video.includes('fieldMeasuredWins: true'),'backend proof/response does not declare field authority');
assert(video.includes('cameraEstimateCannotReopenVerifiedDimension: true'),'backend does not declare no-reopen rule');
const identity=fs.readFileSync('commercial-app/site-visit-work-dedupe-final.js','utf8');
assert(identity.includes('site-visit-work-dedupe-final-5-phone'),'physical-card identity authority did not advance');
assert(!identity.includes('new MutationObserver'),'Site Visit identity authority must not observe Jobs DOM mutations');
assert(!identity.includes("main.querySelectorAll('.row')"),'Site Visit identity authority still depends on .row Jobs markup');
assert(identity.includes('eventDrivenJobsReconciliation:true'),'identity authority is not event driven');
assert(identity.includes('physicalCardStructureSupported:true'),'identity authority does not support the recorded phone card structure');
assert(identity.includes('physicalCardRawTitleFallback:true'),'identity authority cannot match the physical card by server project title text');
assert(identity.includes('jobsNavigationReconciliation:true'),'Jobs navigation does not explicitly trigger identity reconciliation');
assert(identity.includes('function cardForButton(button)'),'identity authority has no physical card resolver');
const grouping=fs.readFileSync('commercial-app/site-visit-work-list-grouping-repair.js','utf8');
assert(grouping.includes('retiredToUnifiedWideAcceptance:true'),'legacy grouping authority was not retired');
assert(!grouping.includes('new MutationObserver'),'legacy grouping repair still watches DOM mutations');
const auth=fs.readFileSync('commercial-app/supabase-quote-ai-auth-fix.js','utf8');
assert(auth.includes('quote-ai-phone-fallback-2'),'physical-phone Quote AI fallback did not advance');
assert(auth.includes('legacyFailClosedPricingRetired:true'),'legacy fail-closed pricing gate is still authoritative');
assert(auth.includes('zeroRateDraftBlocked:false'),'manual-required rates can still block the quote');
assert(auth.includes('policyCannotCreateProjectScope:true'),'system policy can still manufacture project scope');
assert(!auth.includes('No zero-quantity, zero-rate, or blended insulation/drywall draft was loaded.'),'recorded red error path still exists');
const handoff=fs.readFileSync('commercial-app/site-visit-quote-handoff-final.js','utf8');
assert(handoff.includes('site-visit-quote-handoff-final-2-phone'),'phone quote handoff did not advance');
assert(handoff.includes('linkedSessionFallback:true'),'quote handoff cannot recover missing scanner-session linkage');
assert(handoff.includes('genericQuoteButtonRoutedToCanonicalRuntime:true'),'normal Build with H38 AI button is not captured');
const sw=fs.readFileSync('commercial-app/service-worker.js','utf8');
assert(sw.includes("h38-business-office-20260821-1605"),'service worker live-first cache authority missing');
assert(sw.includes("field-visit-guided-controller.js"),'guided field authority is not live-first');
assert(sw.includes("site-visit-wide-acceptance-final.js"),'final authority is not live-first/pre-cached');
assert(sw.includes("supabase-quote-ai-auth-fix.js"),'static Quote AI fallback is not live-first');
const loader=fs.readFileSync('commercial-app/site-visit-quote-wide-pass-loader.js','utf8');
assert(loader.includes("site-visit-quote-wide-pass-loader-9-phone"),'wide pass loader build did not advance');
assert(loader.includes("site-visit-work-dedupe-final-5-phone"),'wide pass loader does not load physical-card identity authority');
assert(loader.includes("site-visit-quote-handoff-final-2-phone"),'wide pass loader does not load phone quote handoff');
assert(loader.includes("site-visit-wide-acceptance-final-3-phone"),'wide pass loader does not load the field-hydrating final authority');
const hammer=fs.readFileSync('commercial-app/quote-working-hammer.js','utf8');
assert(hammer.includes('site-visit-quote-wide-pass-loader-9-phone'),'quote working hammer can still load the stale wide-pass loader');
console.log('PASS site-visit-wide-acceptance Amanda replay + field-over-camera UI authority + physical Jobs/Quote phone repair');
