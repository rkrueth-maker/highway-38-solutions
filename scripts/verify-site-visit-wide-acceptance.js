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
 siteCaptureSessions:[{'Capture Session ID':session,'Site Visit ID':'VISIT-53536424-F4E0-4EEC-A25D-61562C4BD0A3','Quote ID':quoteId,'Project Title':"Amanda's flower garden border",'Customer ID':'GENERIC-QUOTE-CUSTOMER','Started Time':'2026-08-20T23:25:02Z'}]
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

const guided=read('commercial-app/field-visit-guided-controller.js');
new vm.Script(guided,{filename:'field-visit-guided-controller.js'});
for(const marker of ['20260821-guided-field-authority-2','fieldMeasurementSupersedesCameraEstimate:true','staleReviewTargetsSuppressed:true'])assert(guided.includes(marker));

const identity=read('commercial-app/site-visit-work-dedupe-final.js');
new vm.Script(identity,{filename:'site-visit-work-dedupe-final.js'});
for(const marker of ['site-visit-work-dedupe-final-6-phone','function workSurface()','physicalCardRawTitleFallback:true','minimalOpenCardDetection:true','boundedLateMobileRenderRetries:true','2600,4500'])assert(identity.includes(marker),`identity missing ${marker}`);
assert(!identity.includes("main.querySelectorAll('.row')"));
assert(!identity.includes('buttons.some(isDeleteButton)'));
assert(!identity.includes('new MutationObserver'));

const handoff=read('commercial-app/site-visit-quote-handoff-final.js');
new vm.Script(handoff,{filename:'site-visit-quote-handoff-final.js'});
for(const marker of ['site-visit-quote-handoff-final-3-phone','function canonicalLinkedSession(','function canonicalEvidence(','function hydrateCanonicalOpenVisit(','captureSessionId:sid','sessionId:sid','siteVisitId:visitId','sourceType===\'site visit\'','canonicalReopenIdentity:true','reopenHydratesEvidence:true'])assert(handoff.includes(marker),`handoff missing ${marker}`);

const guard=read('commercial-app/quote-measurement-action-photo-guard.js');
new vm.Script(guard,{filename:'quote-measurement-action-photo-guard.js'});
for(const marker of ['20260821-quote-measurement-action-photo-guard-5-phone','function savedQuoteActionPhotoId(quoteId)',"'Action Picture ID','actionPictureId'",'savedQuoteActionPictureAuthority:true','internalActionPictureIndependentOfCustomerSelection:true','systemPolicyCannotCreateScope:true'])assert(guard.includes(marker),`guard missing ${marker}`);

const render=read('commercial-app/quote-render-approval.js');
new vm.Script(render,{filename:'quote-render-approval.js'});
for(const marker of ['20260821-render-saved-action-picture-1-phone','async function requestRender(payload)','wide?.renderQuote','runtime?.renderQuote','savedInternalActionPictureAuthority:true','customerPhotoSelectionIndependent:true','directFinalRuntimeRouting:true'])assert(render.includes(marker),`render missing ${marker}`);

const auth=read('commercial-app/supabase-quote-ai-auth-fix.js');
for(const marker of ['quote-ai-phone-fallback-2','legacyFailClosedPricingRetired:true','zeroRateDraftBlocked:false','policyCannotCreateProjectScope:true'])assert(auth.includes(marker));
assert(!auth.includes('No zero-quantity, zero-rate, or blended insulation/drywall draft was loaded.'));

const loader=read('commercial-app/site-visit-quote-wide-pass-loader.js');
for(const marker of ['site-visit-quote-wide-pass-loader-10-phone','site-visit-work-dedupe-final-6-phone','site-visit-quote-handoff-final-3-phone','site-visit-wide-acceptance-final-3-phone',"ASSET_BUILD='20260821-2136'",'canonicalQuoteReopen:true','savedActionPictureRenderAuthority:true'])assert(loader.includes(marker),`loader missing ${marker}`);
const hammer=read('commercial-app/quote-working-hammer.js');
assert(hammer.includes('site-visit-quote-wide-pass-loader-10-phone'));
const sw=read('commercial-app/service-worker.js');
for(const file of ['quote-render-approval.js','quote-measurement-action-photo-guard.js','site-visit-quote-handoff-final.js','site-visit-work-dedupe-final.js','site-visit-quote-wide-pass-loader.js'])assert(sw.includes(file));

console.log('PASS site-visit-wide-acceptance Amanda replay: third phone Jobs + canonical reopen + saved Action Picture render authority');
