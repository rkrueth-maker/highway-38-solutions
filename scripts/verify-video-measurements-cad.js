const fs=require('fs');
function read(path){return fs.readFileSync(path,'utf8')}
function need(ok,msg){if(!ok)throw new Error(msg)}
function has(source,pattern){return pattern instanceof RegExp?pattern.test(source):source.includes(pattern)}

const index=read('commercial-app/index.html');
const runtime=read('commercial-app/field-visit-video-measurements.js');
const guided=read('commercial-app/field-visit-guided-controller.js');
const recovery=read('commercial-app/field-visit-server-recovery.js');
const cad=read('commercial-app/site-scanner-cad-export.js');
const cadGuard=read('commercial-app/site-scanner-cad-save-guard.js');
const fn=read('supabase/functions/h38-video-measurements/index.ts');

for(const source of [runtime,guided,recovery,cad,cadGuard])new Function(source);

need(index.includes('field-visit-server-recovery.js?build=20260811-server-draft-recovery-1158'),'production loader must install server Site Visit draft recovery before field-visit.js');
need(index.indexOf('field-visit-server-recovery.js')>index.indexOf('field-visit-core.js')&&index.indexOf('field-visit-server-recovery.js')<index.indexOf('field-visit.js?'),'server recovery must wrap restore before the field visit shell captures it');
need(index.includes('field-visit-guided-controller.js?build=20260811-guided-stable-1152'),'production loader must use stable guided controller');
need(index.includes('field-visit-video-measurements.js?build=20260811-video-headless-stable-1154'),'production loader must use headless video measurement engine');
need(index.includes('site-scanner-cad-save-guard.js?build=20260811-cad-save-guard-1156'),'production loader must protect CAD save actions');
need(index.includes('site-scanner-cad-export.js?build=20260811-cad-review-dxf-0143'),'production loader must retain CAD review runtime');

need(!runtime.includes('MutationObserver'),'video measurement engine must not observe DOM mutations');
need(runtime.includes('const HEARTBEAT_MS=2500'),'video measurement engine must use bounded heartbeat');
need(runtime.includes('documentObserver:false'),'video engine must declare document observer disabled');
need(runtime.includes('domWrites:false'),'video engine must be headless and perform no DOM writes');
need(runtime.includes('automaticReviewRefinement:false'),'video estimates must not automatically restart the full AI review');
need(runtime.includes('fullReviewReanalysis:false'),'video estimates must not trigger full review reanalysis');
need(runtime.includes('fullGuidanceRender:false'),'video engine must not own guided controller rendering');
need(runtime.includes('guidedQueueRefinement:true'),'guided controller must own estimate presentation and queue refinement');
need(runtime.includes('automaticMeasurementPass:true'),'video measurement must still run automatically when walkthrough evidence is ready');
need(!runtime.includes('guidance.reanalyze('),'video engine must not call guided full reanalysis');
need(!runtime.includes('H38_FIELD_VISIT_PHOTO_REVIEW?.run'),'video engine must not call photo review as a feedback loop');
need(!runtime.includes('H38_FIELD_VISIT_GUIDANCE?.decorate'),'video engine must not directly rebuild the guided card');
need(runtime.includes("source:'CAMERA_ESTIMATE'")||runtime.includes("'Source':'CAMERA_ESTIMATE'"),'video estimates must retain CAMERA_ESTIMATE source');
need(runtime.includes("verificationStatus:'UNVERIFIED'")||runtime.includes("'Verification Status':'UNVERIFIED'"),'video estimates must remain UNVERIFIED');
need(runtime.includes('samePlaneRequired:true'),'video runtime must declare same-plane requirement');
need(runtime.includes('verifiedReferenceRequired:true'),'video runtime must require verified reference');
need(runtime.includes('fieldVerificationRequired:true'),'video runtime must require field verification');
need(!runtime.includes("'Verification Status':'FIELD_MEASURED'"),'video runtime must never promote an estimate to FIELD_MEASURED');
need(runtime.includes('No additional walkthrough measurement targets remain after verified dimensions and material specifications are removed.'),'verified dimensions and material specs must be removed before video measurement targeting');
need(runtime.includes('existingEstimateFor(x)')||runtime.includes('existingEstimateFor(target)'),'already-estimated targets must not be measured repeatedly');

need(!guided.includes('new MutationObserver'),'guided controller must not rebuild itself from DOM mutations');
need(guided.includes('const HEARTBEAT_MS=2500'),'guided controller must use bounded heartbeat');
need(guided.includes('markup===lastMarkup'),'guided controller must skip unchanged card rewrites');
need(guided.includes('mutationObserver:false'),'guided controller must declare mutation observer disabled');
need(guided.includes('idempotentRender:true'),'guided controller must declare idempotent rendering');
need(guided.includes('automaticMeasurementReanalysis:false'),'measurement changes must not trigger automatic full AI reanalysis');
need(guided.includes('What H38 determined from this walkthrough'),'guided controller must present video measurements inside walkthrough review');
need(guided.includes("source:'CAMERA_ESTIMATE'")||guided.includes("source:'CAMERA_ESTIMATE'"),'guided queue must distinguish camera estimates');
need(guided.includes('OPERATOR VERIFIED · field measurement already confirmed'),'operator-verified narration must display as verified');
const evidenceFn=(guided.match(/function reviewEvidenceKey\(\)\{[\s\S]*?\n\}/)||[''])[0];
need(evidenceFn&&!evidenceFn.includes('measurementIds'),'review evidence key must not change just because measurements were added');

need(recovery.includes('const baseRestore=C.restore.bind(C)'),'server recovery must wrap the existing local restore path');
need(recovery.includes('C.restore=async function'),'server recovery must provide fallback through the normal Site Visit open path');
need(recovery.includes('serverSessionFallback:true'),'recovery must declare active server-session fallback');
need(recovery.includes('localDraftFirst:true'),'existing local draft must remain first authority');
need(recovery.includes('tombstoneSafe:true')&&recovery.includes('H38_FIELD_VISIT_DELETE_TOMBSTONE'),'recovery must not resurrect intentionally deleted Site Visits');
need(recovery.includes("sourceType(row)==='site visit'&&captureSessionId(row)===sid"),'recovery must derive the exact visit identity from saved evidence');
need(recovery.includes("await DB.put('drafts',recovered)"),'recovered server visit must be written back to local drafts');
need(recovery.includes('automaticApproval:false')&&recovery.includes('automaticCustomerSending:false'),'recovery must preserve no-auto-action controls');

need(cadGuard.includes('const COOLDOWN_MS=15000'),'CAD save guard must suppress rapid duplicates');
need(cadGuard.includes('#h38CadSave,#h38CadAttachInternal,#h38CadQuote'),'CAD save guard must protect all visible save/attach buttons');
need(cadGuard.includes('duplicateUiSaveBlocked:true')&&cadGuard.includes('inFlightSaveBlocked:true'),'CAD guard must block duplicate and in-flight actions');
need(cadGuard.includes('automaticAttachment:false'),'CAD guard must not create attachments automatically');

need(has(fn,/sameFrameOnly\s*:\s*true/),'server prompt contract must require same frame');
need(has(fn,/samePlaneOnly\s*:\s*true/),'server prompt contract must require same plane');
need(has(fn,/serverComputesScale\s*:\s*true/),'server must deterministically compute scale instead of accepting an AI dimension');
need(fn.includes('Do not output a dimension value; the server calculates it deterministically'),'AI must locate endpoints, not invent the numeric dimension');
need(fn.includes('Math.min(0.72'),'video estimate confidence must be capped');
need(has(fn,/verificationStatus\s*:\s*"UNVERIFIED"/),'server output must remain unverified');
need(has(fn,/fieldVerificationRequired\s*:\s*true/),'server output must require field verification');
need(has(fn,/exactDimensionsInvented\s*:\s*false/),'Proof Log must state exact dimensions were not invented');
need(has(fn,/collectFrames\s*\(\s*client:\s*Client,\s*businessId:\s*string,\s*captureSessionId:\s*string,\s*quoteId:\s*string,/s),'frame discovery must accept quote identity as a fallback boundary');
need(has(fn,/sourceType\s*===\s*"site visit"\s*&&\s*sourceId\s*===\s*visitId/),'video document must resolve the Site Visit identity used by extracted frames');
need(has(fn,/linkedVisit\s*===\s*visitId/),'quote-linked frame aliases must resolve back to the same Site Visit');
need(has(fn,/collectFrames\(client,\s*businessId,\s*captureSessionId,\s*quoteId\)/),'runtime request must use Site Visit-aware frame discovery');

need(cad.includes("'H38_FIELD_VERIFIED'"),'DXF must have verified measurement layer');
need(cad.includes("'H38_DEVICE_CAPTURED'"),'DXF must have device measurement layer');
need(cad.includes("'H38_VIDEO_ESTIMATE'"),'DXF must have video estimate layer');
need(cad.includes("format:'DXF_R12_ASCII'"),'CAD export must identify DXF R12 format');
need(cad.includes("'Quote',q,'Internal'"),'quote drawing attachment must remain internal by default');
need(cad.includes('automaticApproval:false')&&cad.includes('automaticCustomerSending:false'),'CAD export must preserve owner/no-auto-send controls');

console.log('Stable walkthrough measurement + server recovery + CAD guard verification passed.');
