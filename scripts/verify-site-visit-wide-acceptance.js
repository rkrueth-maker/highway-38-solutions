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
 quotes:[{'Quote ID':quoteId,'Project Title':"Amanda's flower garden border",'Scope':'Install a border/edging around the existing flower garden; add black dirt; remove some trees and weeds.','Site Scanner Session ID':session,'Action Picture ID':'ATTACH-AF0EA095-FA2E-4698-B7CC-38CCB5DC0BCE','Action Picture Rotation Degrees':270,'Action Picture Orientation':'LANDSCAPE_CORRECTED_CCW_90'}],
 siteMeasurements:[
  {'Site Measurement ID':'FIELD-PERIMETER','Quote ID':quoteId,'Capture Session ID':session,'Label':'Total linear footage (perimeter length) of the border/edging to be installed','Value':528,'Unit':'in','Source':'MANUAL_LASER','Verification Status':'FIELD_MEASURED','Updated Time':'2026-08-21T20:47:09Z'},
  {'Site Measurement ID':'VIDEO-PERIMETER','Quote ID':quoteId,'Capture Session ID':session,'Label':'Total linear footage (perimeter length) of the border/edging to be installed — measure along the proposed edge (feet).','Value':473.375,'Unit':'in','Source':'CAMERA_ESTIMATE','Verification Status':'UNVERIFIED','Updated Time':'2026-08-21T20:50:53Z'},
  {'Site Measurement ID':'FIELD-WIDTH','Quote ID':quoteId,'Capture Session ID':session,'Label':'Average and minimum/maximum width (depth) of the planting bed at representative locations','Value':264,'Unit':'in','Source':'MANUAL_LASER','Verification Status':'FIELD_MEASURED'},
  {'Site Measurement ID':'VIDEO-TOPSOIL','Quote ID':quoteId,'Capture Session ID':session,'Label':'Desired thickness of black dirt/topsoil to add','Value':264,'Unit':'in','Source':'CAMERA_ESTIMATE','Verification Status':'UNVERIFIED'},
  {'Site Measurement ID':'FIELD-TOPSOIL','Quote ID':quoteId,'Capture Session ID':session,'Label':'Desired thickness of black dirt/topsoil to add','Value':3,'Unit':'in','Source':'MANUAL_LASER','Verification Status':'FIELD_MEASURED'}
 ],
 documents:[{'Document ID':'ATTACH-AF0EA095-FA2E-4698-B7CC-38CCB5DC0BCE','Quote ID':quoteId,'Source Type':'Site Visit','Action Picture Rotation Degrees':270,'Action Picture Orientation':'LANDSCAPE_CORRECTED_CCW_90'}],
 jobNotes:[{'Quote ID':quoteId,'Capture Session ID':session,'Body':'Minimum 6 inches maximum 12 inches; show different possibilities and prices.'}],
 siteCaptureSessions:[
  {'Capture Session ID':session,'Quote ID':quoteId,'Project Title':"Amanda's flower garden border",'Customer ID':'GENERIC-QUOTE-CUSTOMER','Started Time':'2026-08-20T23:25:02Z'},
  {'Capture Session ID':'SCAN-CONTINUATION','Quote ID':quoteId,'Project Title':"Amanda's flower garden border",'Customer ID':'GENERIC-QUOTE-CUSTOMER','Started Time':'2026-08-21T20:40:00Z'}
 ]
};
const fieldCore={state:{open:false,visit:{quoteId,sessionId:session},measurements:[],render:noop}};
const context={console,window:{state:{page:'quotes',businessId:'10b85a89-5834-436d-95b0-c6ee2eb335ad',quote:{quoteId},snapshot},H38Bridge:Bridge,H38_BUSINESS_OFFICE_SUPABASE:{},H38_SUPABASE_SHARED_CLIENT:{ensure:()=>null},H38_FIELD_VISIT_CORE:fieldCore,addEventListener:noop,dispatchEvent:noop,esc:s=>s,H38_QUOTE_ACTION_PHOTO_BY_QUOTE:{}},document,Element:function(){},CustomEvent:function(){},AbortController,fetch:async()=>{throw new Error('network not used')},setTimeout:()=>0,clearTimeout:noop,requestAnimationFrame:cb=>cb(),CSS:{escape:s=>s},crypto};
Object.assign(context.window,{window:context.window,document,setTimeout:context.setTimeout,clearTimeout:context.clearTimeout,requestAnimationFrame:context.requestAnimationFrame,CSS:context.CSS,CustomEvent:context.CustomEvent,fetch:context.fetch,AbortController,crypto});
vm.createContext(context);vm.runInContext(source,context,{filename:'site-visit-wide-acceptance-final.js'});
const api=context.window.H38_SITE_VISIT_WIDE_ACCEPTANCE_FINAL;
assert(api?.enabled,'wide acceptance authority did not load');
assert.strictEqual(api.build,'20260821-site-visit-wide-acceptance-final-3-phone');
assert.strictEqual(api.fieldMeasurementStateHydration,true);
assert.strictEqual(api.guidedCameraEstimateSupersession,true);
assert(!source.includes('new MutationObserver'));
assert(!source.includes("main.querySelectorAll('.row')"));
const canonical=api.canonicalizeMeasurements(snapshot.siteMeasurements);
const perimeter=canonical.find(row=>/perimeter/i.test(row.label));
assert.strictEqual(perimeter.value,528,'473.375 camera perimeter displaced 528 field perimeter');
assert.strictEqual(perimeter.verificationStatus,'FIELD_MEASURED');
assert.strictEqual(canonical.find(row=>/thickness of black dirt/i.test(row.label)).value,3,'camera topsoil estimate displaced field value');
assert(api.requestResolved('Verify total linear footage perimeter length 473.375 in again',[perimeter]));
assert(api.syncFieldMeasurementState(),'field state did not hydrate');
assert(fieldCore.state.measurements.length>0,'Capture footer would still show zero measurements');
assert.strictEqual(fieldCore.state.measurements.find(row=>/perimeter/i.test(row.label)).value,528);
const action=api.actionPictureInfo(quoteId,{});
assert.strictEqual(action.sourceId,'ATTACH-AF0EA095-FA2E-4698-B7CC-38CCB5DC0BCE');
assert.strictEqual(action.rotation,270);
assert.strictEqual(action.orientation,'LANDSCAPE_CORRECTED_CCW_90');
assert.strictEqual(api.projectKey(snapshot.siteCaptureSessions[0]),api.projectKey(snapshot.siteCaptureSessions[1]));
assert(source.includes('AI pricing was unavailable. Keep this editable instead of failing the quote.'));
assert(!/drywall|sheetrock|insulation material and labor/i.test(source));

const guided=read('commercial-app/field-visit-guided-controller.js');
new vm.Script(guided,{filename:'field-visit-guided-controller.js'});
for(const marker of ['20260821-guided-field-authority-2','function verifiedMeasurementForLabel(label)','function supersededCameraRows()','if(verifiedMeasurementForLabel(label))continue','verifiedMeasurementForLabel(item)','Field measurements always win.','fieldMeasurementSupersedesCameraEstimate:true','staleReviewTargetsSuppressed:true'])assert(guided.includes(marker),`guided authority missing ${marker}`);
assert(!guided.includes('new MutationObserver'));

const identity=read('commercial-app/site-visit-work-dedupe-final.js');
new vm.Script(identity,{filename:'site-visit-work-dedupe-final.js'});
for(const marker of ['site-visit-work-dedupe-final-5-phone','physicalCardStructureSupported:true','physicalCardRawTitleFallback:true','jobsNavigationReconciliation:true','function cardForButton(button)','function rawServerTitle(raw)'])assert(identity.includes(marker),`identity authority missing ${marker}`);
assert(!identity.includes("main.querySelectorAll('.row')"));
assert(!identity.includes('new MutationObserver'));

const video=read('supabase/functions/h38-video-measurements/index.ts');
for(const marker of ['video-reference-scale-v2-field-authority','filterTargetsAgainstVerified','NO_UNVERIFIED_TARGETS','suppressVerifiedEstimates','supersededByFieldMeasurementId','fieldMeasuredWins: true','cameraEstimateCannotReopenVerifiedDimension: true'])assert(video.includes(marker),`backend field authority missing ${marker}`);
const auth=read('commercial-app/supabase-quote-ai-auth-fix.js');
for(const marker of ['quote-ai-phone-fallback-2','legacyFailClosedPricingRetired:true','zeroRateDraftBlocked:false','policyCannotCreateProjectScope:true'])assert(auth.includes(marker),`quote fallback missing ${marker}`);
assert(!auth.includes('No zero-quantity, zero-rate, or blended insulation/drywall draft was loaded.'));
const handoff=read('commercial-app/site-visit-quote-handoff-final.js');
for(const marker of ['site-visit-quote-handoff-final-2-phone','linkedSessionFallback:true','genericQuoteButtonRoutedToCanonicalRuntime:true'])assert(handoff.includes(marker),`quote handoff missing ${marker}`);
const sw=read('commercial-app/service-worker.js');
for(const file of ['field-visit-guided-controller.js','site-visit-work-dedupe-final.js','site-visit-wide-acceptance-final.js','supabase-quote-ai-auth-fix.js'])assert(sw.includes(file),`live-first asset missing ${file}`);
const loader=read('commercial-app/site-visit-quote-wide-pass-loader.js');
for(const marker of ['site-visit-quote-wide-pass-loader-9-phone','site-visit-work-dedupe-final-5-phone','site-visit-quote-handoff-final-2-phone','site-visit-wide-acceptance-final-3-phone'])assert(loader.includes(marker),`loader missing ${marker}`);
const hammer=read('commercial-app/quote-working-hammer.js');
assert(hammer.includes('site-visit-quote-wide-pass-loader-9-phone'));
console.log('PASS Amanda physical replay: Jobs identity + field-over-camera + hydrated measurement count + quote safety');
