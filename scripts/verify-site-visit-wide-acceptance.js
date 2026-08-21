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
  {'Site Measurement ID':'FIELD-WIDTH','Quote ID':quoteId,'Capture Session ID':session,'Label':'Average and minimum/maximum width (depth) of the planting bed at representative locations','Value':264,'Unit':'in','Source':'MANUAL_LASER','Verification Status':'FIELD_MEASURED'}
 ],
 documents:[{'Document ID':'ATTACH-AF0EA095-FA2E-4698-B7CC-38CCB5DC0BCE','Quote ID':quoteId,'Source Type':'Site Visit','Action Picture Rotation Degrees':270,'Action Picture Orientation':'LANDSCAPE_CORRECTED_CCW_90'}],
 jobNotes:[{'Quote ID':quoteId,'Capture Session ID':session,'Body':'Minimum 6 inches maximum 12 inches; show different possibilities and prices. 7 ft to front edge and 9 ft left and right from sprinkler.'}],
 siteCaptureSessions:[
  {'Capture Session ID':session,'Quote ID':quoteId,'Project Title':"Amanda's flower garden border",'Customer ID':'GENERIC-QUOTE-CUSTOMER','Started Time':'2026-08-20T23:25:02Z'},
  {'Capture Session ID':'SCAN-CONTINUATION','Quote ID':quoteId,'Project Title':"Amanda's flower garden border",'Customer ID':'GENERIC-QUOTE-CUSTOMER','Started Time':'2026-08-21T20:40:00Z'}
 ]
};
const context={console,window:{state:{page:'quotes',businessId:'10b85a89-5834-436d-95b0-c6ee2eb335ad',quote:{quoteId},snapshot},H38Bridge:Bridge,H38_BUSINESS_OFFICE_SUPABASE:{},H38_SUPABASE_SHARED_CLIENT:{ensure:()=>null},addEventListener:noop,dispatchEvent:noop,esc:s=>s,H38_QUOTE_ACTION_PHOTO_BY_QUOTE:{}},document,MutationObserver,Element:function(){},CustomEvent:function(){},AbortController,fetch:async()=>{throw new Error('network not used')},setTimeout:()=>0,clearTimeout:noop,requestAnimationFrame:cb=>cb(),CSS:{escape:s=>s},crypto};
context.window.window=context.window;context.window.document=document;context.window.MutationObserver=MutationObserver;context.window.setTimeout=context.setTimeout;context.window.clearTimeout=context.clearTimeout;context.window.requestAnimationFrame=context.requestAnimationFrame;context.window.CSS=context.CSS;context.window.CustomEvent=context.CustomEvent;context.window.fetch=context.fetch;context.window.AbortController=AbortController;context.window.crypto=crypto;
vm.createContext(context);vm.runInContext(source,context,{filename:'site-visit-wide-acceptance-final.js'});
const api=context.window.H38_SITE_VISIT_WIDE_ACCEPTANCE_FINAL;
assert(api&&api.enabled,'wide acceptance authority did not load');
assert.strictEqual(api.build,'20260821-site-visit-wide-acceptance-final-2','event-driven final authority build is not active');
assert.strictEqual(api.eventDrivenReconciliation,true,'wide acceptance reconciliation must be event driven');
assert.strictEqual(api.documentMutationObserver,false,'document-wide mutation observer must stay disabled');
assert.strictEqual(api.jobsMutationObserver,false,'Jobs mutation observer must stay disabled');
assert(!source.includes('MutationObserver'),'wide acceptance authority must not use DOM mutation observers');
const canonical=api.canonicalizeMeasurements(snapshot.siteMeasurements);
const perimeter=canonical.find(row=>/perimeter/i.test(row.label));
assert(perimeter,'perimeter missing from canonical measurements');
assert.strictEqual(perimeter.value,528,'later camera estimate displaced field-measured perimeter');
assert.strictEqual(perimeter.verificationStatus,'FIELD_MEASURED');
assert(api.requestResolved('Verify total linear footage perimeter length 473.375 in again',[perimeter]),'verified perimeter did not suppress a later conflicting estimate prompt');
const action=api.actionPictureInfo(quoteId,{});
assert.strictEqual(action.sourceId,'ATTACH-AF0EA095-FA2E-4698-B7CC-38CCB5DC0BCE');
assert.strictEqual(action.rotation,270);
assert.strictEqual(action.orientation,'LANDSCAPE_CORRECTED_CCW_90');
const sessions=snapshot.siteCaptureSessions;
assert.strictEqual(api.projectKey(sessions[0]),api.projectKey(sessions[1]),'continuation did not group under the same project/quote');
assert(source.includes("void loadDirections(prepared,base,timeout)"),'quote build still blocks on option generation');
assert(source.includes('AI pricing was unavailable. Keep this editable instead of failing the quote.'),'editable quote fallback missing');
assert(!/drywall|sheetrock|insulation material and labor/i.test(source),'landscape final authority contains trade-specific acceptance contamination');
const video=fs.readFileSync('supabase/functions/h38-video-measurements/index.ts','utf8');
assert(video.includes('video-reference-scale-v2-field-authority'),'video measurement backend did not advance to field-authority engine');
assert(video.includes('filterTargetsAgainstVerified'),'backend does not filter field-verified targets before AI');
assert(video.includes('NO_UNVERIFIED_TARGETS'),'backend lacks verified-target short circuit');
assert(video.includes('suppressVerifiedEstimates'),'backend does not suppress a matching camera estimate after AI');
assert(video.includes('supersededByFieldMeasurementId'),'suppressed camera evidence is not linked to field authority');
assert(video.includes('fieldMeasuredWins: true'),'backend proof/response does not declare field authority');
assert(video.includes('cameraEstimateCannotReopenVerifiedDimension: true'),'backend does not declare no-reopen rule');
const identity=fs.readFileSync('commercial-app/site-visit-work-dedupe-final.js','utf8');
assert(identity.includes('site-visit-work-dedupe-final-3'),'event-driven identity authority did not advance');
assert(!identity.includes('MutationObserver'),'Site Visit identity authority must not observe Jobs DOM mutations');
assert(identity.includes('eventDrivenJobsReconciliation:true'),'identity authority is not event driven');
const grouping=fs.readFileSync('commercial-app/site-visit-work-list-grouping-repair.js','utf8');
assert(grouping.includes('retiredToUnifiedWideAcceptance:true'),'legacy grouping authority was not retired');
assert(!grouping.includes('MutationObserver'),'legacy grouping repair still watches DOM mutations');
const sw=fs.readFileSync('commercial-app/service-worker.js','utf8');
assert(sw.includes("h38-business-office-20260821-1605"),'service worker live-first cache authority missing');
assert(sw.includes("site-visit-wide-acceptance-final.js"),'final authority is not live-first/pre-cached');
const loader=fs.readFileSync('commercial-app/site-visit-quote-wide-pass-loader.js','utf8');
assert(loader.includes("site-visit-quote-wide-pass-loader-7"),'wide pass loader build did not advance');
assert(loader.includes("site-visit-work-dedupe-final-3"),'wide pass loader does not load event-driven identity authority');
assert(loader.includes("site-visit-wide-acceptance-final-2"),'wide pass loader does not load the event-driven final authority');
const hammer=fs.readFileSync('commercial-app/quote-working-hammer.js','utf8');
assert(hammer.includes('site-visit-quote-wide-pass-loader-7'),'quote working hammer can still load the stale wide-pass loader');
console.log('PASS site-visit-wide-acceptance Amanda replay + backend field authority + event-driven Jobs reconciliation');
