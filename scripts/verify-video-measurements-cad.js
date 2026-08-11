const fs=require('fs');
function read(path){return fs.readFileSync(path,'utf8')}
function need(ok,msg){if(!ok)throw new Error(msg)}
function has(source,pattern){return pattern instanceof RegExp?pattern.test(source):source.includes(pattern)}
const index=read('commercial-app/index.html');
const runtime=read('commercial-app/field-visit-video-measurements.js');
const cad=read('commercial-app/site-scanner-cad-export.js');
const fn=read('supabase/functions/h38-video-measurements/index.ts');
need(!index.includes('<script src="./field-visit-video-measurements.js'),'recursive video measurement client must remain disabled until its Android renderer is replaced');
need(index.includes('Video measurement client temporarily disabled on Android production while recursive render is replaced.'),'production loader must document the emergency Android disable');
need(index.includes('site-scanner-cad-export.js?build=20260811-cad-review-dxf-0143'),'production loader must retain CAD review runtime');
new Function(runtime);new Function(cad);
need(runtime.includes("source:'CAMERA_ESTIMATE'")||runtime.includes("'Source':'CAMERA_ESTIMATE'"),'video estimates must retain CAMERA_ESTIMATE source');
need(runtime.includes("verificationStatus:'UNVERIFIED'")||runtime.includes("'Verification Status':'UNVERIFIED'"),'video estimates must remain UNVERIFIED');
need(runtime.includes('samePlaneRequired:true'),'video runtime must declare same-plane requirement');
need(runtime.includes('verifiedReferenceRequired:true'),'video runtime must require verified reference');
need(runtime.includes('fieldVerificationRequired:true'),'video runtime must require field verification');
need(!runtime.includes("'Verification Status':'FIELD_MEASURED'"),'video runtime must never promote an estimate to FIELD_MEASURED');
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
console.log('Video measurement backend + CAD review verification passed with Android client safely disabled.');
