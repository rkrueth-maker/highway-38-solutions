(function(){
'use strict';
const BUILD='20260806-1835';
const C=window.H38_FIELD_VISIT_CORE;
if(!C)return;
const S=C.state,$=C.$;
const PLANS={
  interior:{
    photos:[
      ['room-entry','Stand in the main entry and photograph the whole room.','Shows the overall layout and work area.'],
      ['opposite-corner','Move to the opposite corner and photograph back toward the entry.','Confirms the room shape and hidden areas.'],
      ['openings','Photograph each door, window, and opening straight on.','Records openings that affect materials and labor.'],
      ['details','Photograph utilities, damage, obstacles, and customer-requested details.','Captures conditions that may change the quote.']
    ],
    measures:[
      ['room-length','Room length','Measure the longest wall-to-wall distance.'],
      ['room-width','Room width','Measure the perpendicular wall-to-wall distance.'],
      ['wall-height','Wall or ceiling height','Measure floor to ceiling at a clear location.'],
      ['opening-size','Critical opening size','Measure the width and height of the main door, window, or opening affecting the work.']
    ]
  },
  garage:{
    photos:[
      ['garage-overview','Photograph the full garage or shop from the main entry.','Shows the complete work area and traffic flow.'],
      ['garage-opposite','Photograph from the opposite rear corner toward the doors.','Confirms the shape, bays, and clearances.'],
      ['garage-walls','Photograph each wall, overhead door, and permanent opening.','Records usable wall space and openings.'],
      ['garage-details','Photograph utilities, equipment, drains, posts, damage, and obstacles.','Captures constraints that affect the work.']
    ],
    measures:[
      ['garage-length','Garage or shop length','Measure the inside length of the work area.'],
      ['garage-width','Garage or shop width','Measure the inside width of the work area.'],
      ['garage-height','Wall or ceiling height','Measure the usable height.'],
      ['garage-door','Main door opening','Measure the clear opening width and height.'],
      ['garage-clearance','Critical clearance','Measure the tightest clearance around equipment, posts, doors, or access.']
    ]
  },
  exterior:{
    photos:[
      ['elevation','Photograph the entire wall or building elevation straight on.','Shows the complete work surface.'],
      ['left-corner','Photograph the left corner and adjoining side.','Records the starting edge and return.'],
      ['right-corner','Photograph the right corner and adjoining side.','Records the ending edge and return.'],
      ['openings-grade','Photograph openings, grade, access, damage, and obstructions.','Captures details that affect installation and access.']
    ],
    measures:[
      ['wall-width','Overall wall or elevation width','Measure corner to corner.'],
      ['wall-height','Overall working height','Measure grade to the top of the work area.'],
      ['opening-size','Critical opening size','Measure each major opening affecting the work.'],
      ['opening-offset','Opening or obstacle offset','Measure from a known corner to the nearest edge of the opening or obstacle.']
    ]
  },
  landscape:{
    photos:[
      ['area-overview','Photograph the entire yard, patio, concrete, or landscape area.','Shows the overall shape and scope.'],
      ['boundaries','Photograph every boundary, corner, and direction change.','Records the outline needed for quantities.'],
      ['grade-drainage','Photograph slope, drainage, low spots, and transitions.','Captures conditions that affect preparation.'],
      ['access-obstacles','Photograph access routes, gates, utilities, trees, structures, and obstacles.','Records equipment access and exclusions.']
    ],
    measures:[
      ['area-length','Main area length','Measure the longest dimension or first boundary segment.'],
      ['area-width','Main area width','Measure the perpendicular dimension or next boundary segment.'],
      ['access-width','Narrowest access width','Measure the tightest gate, path, or equipment access.'],
      ['boundary-extra','Additional boundary segment','Measure any side needed to define a non-rectangular area.']
    ]
  },
  fence:{
    photos:[
      ['fence-start','Photograph the proposed run from the starting point.','Establishes the beginning and direction.'],
      ['fence-end','Photograph back from the ending point toward the start.','Confirms the complete run.'],
      ['fence-corners','Photograph every corner, direction change, and grade break.','Records separate fence segments.'],
      ['fence-gates','Photograph gates, utilities, trees, structures, and obstacles.','Captures openings and conflicts.']
    ],
    measures:[
      ['run-one','First fence run','Measure from the start to the first corner or endpoint.'],
      ['run-two','Next fence run','Measure the next segment after a corner or direction change.'],
      ['gate-width','Gate opening width','Measure each proposed or existing gate opening.'],
      ['fence-offset','Critical offset or clearance','Measure from the fence line to the nearest structure, utility, or obstruction.']
    ]
  },
  custom:{
    photos:[
      ['custom-overview','Photograph the full work area from the best overview position.','Shows the overall scope.'],
      ['custom-opposite','Photograph the work area from the opposite direction.','Reveals areas hidden in the first view.'],
      ['custom-boundaries','Photograph every edge, opening, corner, and direction change.','Defines the limits of the work.'],
      ['custom-details','Photograph damage, utilities, access, obstacles, and requested details.','Captures quote-changing conditions.']
    ],
    measures:[
      ['custom-length','Main length','Measure the longest dimension affecting the work.'],
      ['custom-width','Main width','Measure the perpendicular dimension affecting the work.'],
      ['custom-height','Height or depth','Measure the important vertical or depth dimension.'],
      ['custom-detail','Critical opening, offset, or clearance','Measure the dimension most likely to affect material quantity or installation.']
    ]
  }
};
const runtime={stream:null,busy:false,watchTimer:0};
const text=v=>String(v==null?'':v);
const esc=v=>typeof C.esc==='function'?C.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function planKey(type){const x=text(type).toLowerCase();if(x.includes('garage')||x.includes('shop'))return'garage';if(x.includes('interior')||x.includes('room'))return'interior';if(x.includes('fence')||x.includes('linear'))return'fence';if(x.includes('yard')||x.includes('landscape')||x.includes('patio')||x.includes('concrete'))return'landscape';if(x.includes('exterior')||x.includes('building'))return'exterior';return'custom'}
function visit(){return S.visit||null}
function guide(){const v=visit();if(!v)return null;const key=planKey(v.projectType);if(!v.guidedCapture||v.guidedCapture.planKey!==key){v.guidedCapture={version:BUILD,planKey:key,photoIndex:0,measurementIndex:0,completedMeasurements:[],unknownMeasurements:[],pendingMeasurementId:'',startedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}return v.guidedCapture}
function activePlan(){const g=guide();return g?PLANS[g.planKey]||PLANS.custom:PLANS.custom}
async function persist(){const v=visit();if(!v||!window.H38DB?.put)return;v.updatedAt=new Date().toISOString();if(v.guidedCapture)v.guidedCapture.updatedAt=v.updatedAt;const id=`FIELD-VISIT:${v.businessId}:${v.quoteId||'UNASSIGNED'}`;await window.H38DB.put('drafts',Object.assign({id},v))}
function notify(message,bad){if(typeof C.toast==='function')C.toast(message,!!bad);else if(typeof window.toast==='function')window.toast(message,!!bad)}
function stopCamera(){runtime.stream?.getTracks?.().forEach(track=>track.stop());runtime.stream=null;$('fieldGuideCamera')?.remove()}
function currentPhoto(){const g=guide(),p=activePlan();return g&&p.photos[g.photoIndex]||null}
function currentMeasure(){const g=guide(),p=activePlan();return g&&p.measures[g.measurementIndex]||null}
function phase(){const g=guide(),p=activePlan();if(!g)return'idle';if(g.photoIndex<p.photos.length)return'photos';if(g.measurementIndex<p.measures.length)return'measurements';return'complete'}
function cameraMarkup(prompt){return `<section id="fieldGuideCamera" class="field-guide-camera" role="dialog" aria-modal="true" aria-label="Site camera"><header><button id="fieldGuideCloseCamera" type="button" aria-label="Close camera">×</button><div><strong>${esc(prompt[1])}</strong><small>${esc(prompt[2])}</small></div></header><div class="field-guide-viewfinder"><video id="fieldGuideVideo" autoplay playsinline muted></video><div class="field-guide-frame"></div></div><footer><button id="fieldGuideCapture" class="field-guide-shutter" type="button" aria-label="Take photo"><span></span></button><button id="fieldGuideFallback" type="button">Use phone camera picker</button></footer></section>`}
async function openCamera(){if(runtime.busy)return;const prompt=currentPhoto();if(!prompt)return;runtime.busy=true;try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Live camera is unavailable on this device.');document.body.insertAdjacentHTML('beforeend',cameraMarkup(prompt));$('fieldGuideCloseCamera').onclick=stopCamera;$('fieldGuideFallback').onclick=()=>{stopCamera();openFallback()};runtime.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});const video=$('fieldGuideVideo');video.srcObject=runtime.stream;await video.play();$('fieldGuideCapture').onclick=captureFrame}catch(error){stopCamera();notify(`Camera could not start: ${error.message}`,true);openFallback()}finally{runtime.busy=false}}
function openFallback(){const input=$('fieldPhotoInput');if(!input)return;input.removeAttribute('multiple');input.setAttribute('accept','image/*');input.setAttribute('capture','environment');input.value='';input.click()}
async function captureFrame(){if(runtime.busy)return;runtime.busy=true;const video=$('fieldGuideVideo');try{if(!video||!video.videoWidth)throw Error('Camera is not ready yet.');const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d',{alpha:false}).drawImage(video,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));if(!blob)throw Error('Photo could not be captured.');const file=new File([blob],`site-photo-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});stopCamera();await savePhotoFiles([file])}catch(error){notify(error.message||error,true)}finally{runtime.busy=false}}
async function savePhotoFiles(files){const list=Array.from(files||[]).filter(file=>file?.type?.startsWith('image/')).slice(0,1);if(!list.length)return;const g=guide(),p=activePlan(),before=g.photoIndex;g.photoIndex=Math.min(p.photos.length,g.photoIndex+1);try{await C.photos(list);await persist();notify(g.photoIndex<p.photos.length?'Photo saved. The next required photo is ready.':'Required photos complete. Measurement guidance is ready.');renderGuide()}catch(error){g.photoIndex=before;await persist();notify(error.message||error,true)}}
function markUnknown(){const g=guide(),m=currentMeasure();if(!g||!m)return;if(!g.unknownMeasurements.some(x=>x.id===m[0]))g.unknownMeasurements.push({id:m[0],label:m[1],instruction:m[2],status:'UNKNOWN_FIELD_MEASUREMENT',markedAt:new Date().toISOString()});g.pendingMeasurementId='';g.measurementIndex++;persist().then(renderGuide)}
function prepareMeasurement(){const g=guide(),m=currentMeasure(),form=$('fieldManual');if(!g||!m||!form)return;g.pendingMeasurementId=m[0];const details=form.closest('details');if(details)details.open=true;form.elements.label.value=m[1];form.elements.measurementNotes.value=`Guided request: ${m[2]}`;persist();form.scrollIntoView({behavior:'smooth',block:'center'});form.elements.feet.focus()}
function monitorMeasurement(form){if(form.dataset.fieldGuideBound)return;form.dataset.fieldGuideBound='1';form.addEventListener('submit',()=>{const g=guide(),m=currentMeasure();if(!g||!m)return;const promptId=g.pendingMeasurementId||m[0],before=S.measurements.length;clearInterval(runtime.watchTimer);let checks=0;runtime.watchTimer=setInterval(async()=>{checks++;if(S.measurements.length>before){clearInterval(runtime.watchTimer);if(!g.completedMeasurements.includes(promptId))g.completedMeasurements.push(promptId);g.pendingMeasurementId='';g.measurementIndex=Math.min(activePlan().measures.length,g.measurementIndex+1);await persist();renderGuide()}else if(checks>40)clearInterval(runtime.watchTimer)},250)},true)}
function progressMarkup(){const g=guide(),p=activePlan(),mode=phase();if(!g)return'';if(mode==='photos'){const x=p.photos[g.photoIndex];return `<section id="fieldGuideCard" class="field-guide-card"><div class="field-guide-progress"><span>Guided capture</span><strong>Photo ${g.photoIndex+1} of ${p.photos.length}</strong></div><h2>${esc(x[1])}</h2><p>${esc(x[2])}</p><button id="fieldGuideTakePhoto" class="field-primary" type="button">📷 Open Camera</button><small>One required view at a time. Photos stay private and save to this visit.</small></section>`}if(mode==='measurements'){const x=p.measures[g.measurementIndex];return `<section id="fieldGuideCard" class="field-guide-card"><div class="field-guide-progress"><span>Photos complete</span><strong>Measurement ${g.measurementIndex+1} of ${p.measures.length}</strong></div><h2>${esc(x[1])}</h2><p>${esc(x[2])}</p><div class="field-guide-two"><button id="fieldGuideEnterMeasure" class="field-primary" type="button">Enter This Measurement</button><button id="fieldGuideUnknown" class="field-secondary" type="button">Cannot Measure — Mark Unknown</button></div><small>Unknowns are preserved for owner review. No dimension is guessed.</small></section>`}return `<section id="fieldGuideCard" class="field-guide-card field-guide-complete"><div class="field-guide-progress"><span>Guided capture complete</span><strong>${p.photos.length} photos · ${g.completedMeasurements.length} measured</strong></div><h2>Review the visit</h2><p>${g.unknownMeasurements.length?`${g.unknownMeasurements.length} measurement${g.unknownMeasurements.length===1?' is':'s are'} marked unknown and must remain visible during quote review.`:'Required field prompts are complete.'}</p><button id="fieldGuideReview" class="field-primary" type="button">Continue to Review</button></section>`}
function reviewMarkup(){const g=guide(),p=activePlan();if(!g)return'';const unknown=g.unknownMeasurements||[];return `<section id="fieldGuideReviewCard" class="field-card field-guide-review"><h2>Guided site completeness</h2><div class="field-guide-summary"><div><strong>${Math.min(g.photoIndex,p.photos.length)}/${p.photos.length}</strong><span>Required photos</span></div><div><strong>${g.completedMeasurements.length}</strong><span>Confirmed measurements</span></div><div class="${unknown.length?'warn':''}"><strong>${unknown.length}</strong><span>Unknown measurements</span></div></div>${unknown.length?`<div class="field-guide-unknowns"><strong>Still unknown</strong>${unknown.map(x=>`<span>${esc(x.label)}</span>`).join('')}</div>`:'<p>All guided prompts have a field result.</p>'}<small>Owner review remains required. Nothing is automatically approved or sent.</small></section>`}
function bindInput(input){if(!input||input.dataset.fieldGuideBound)return;input.dataset.fieldGuideBound='1';input.removeAttribute('multiple');input.addEventListener('change',event=>{event.stopImmediatePropagation();const files=event.target.files;event.target.value='';savePhotoFiles(files)},true)}
function renderGuide(){if(!S.open||!visit())return;guide();const captureButton=$('fieldPhotos'),input=$('fieldPhotoInput');if(captureButton&&!captureButton.dataset.fieldGuideBound){captureButton.dataset.fieldGuideBound='1';captureButton.textContent='📷 Take Next Guided Photo';captureButton.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();openCamera()},true)}bindInput(input);const form=$('fieldManual');if(form)monitorMeasurement(form);const capturePanel=captureButton?.closest('.field-panel');if(capturePanel){capturePanel.querySelector('#fieldGuideCard')?.remove();const anchor=capturePanel.querySelector('.field-device-card')||capturePanel.querySelector('.field-capture-actions');anchor?.insertAdjacentHTML('beforebegin',progressMarkup());$('fieldGuideTakePhoto')?.addEventListener('click',openCamera);$('fieldGuideEnterMeasure')?.addEventListener('click',prepareMeasurement);$('fieldGuideUnknown')?.addEventListener('click',markUnknown);$('fieldGuideReview')?.addEventListener('click',()=>{S.tab='review';window.H38_FIELD_VISIT_UI?.render()})}const reviewPanel=$('fieldAttach')?.closest('.field-panel');if(reviewPanel){reviewPanel.querySelector('#fieldGuideReviewCard')?.remove();reviewPanel.querySelector('.field-summary-grid')?.insertAdjacentHTML('afterend',reviewMarkup())}}
function start(){new MutationObserver(()=>requestAnimationFrame(renderGuide)).observe(document.body,{childList:true,subtree:true});addEventListener('h38:native-scanner-ready',renderGuide);renderGuide()}
window.H38_FIELD_VISIT_GUIDANCE={build:BUILD,render:renderGuide,openCamera,planKey,automaticApproval:false,automaticCustomerSending:false,unknownsAreNeverGuessed:true};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();