(function(){
'use strict';
const BUILD='20260806-2145';
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
const runtime={stream:null,busy:false,watchTimer:0,reviewStarting:false};
const text=v=>String(v==null?'':v);
const esc=v=>typeof C.esc==='function'?C.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function planKey(type){const x=text(type).toLowerCase();if(x.includes('garage')||x.includes('shop'))return'garage';if(x.includes('interior')||x.includes('room'))return'interior';if(x.includes('fence')||x.includes('linear'))return'fence';if(x.includes('yard')||x.includes('landscape')||x.includes('patio')||x.includes('concrete'))return'landscape';if(x.includes('exterior')||x.includes('building'))return'exterior';return'custom'}
function visit(){return S.visit||null}
function newGuide(key){return{version:BUILD,planKey:key,photoIndex:0,measurementIndex:0,completedMeasurements:[],unknownMeasurements:[],pendingMeasurementId:'',photoReviewStatus:'NOT_STARTED',photoReviewError:'',aiMeasurements:[],aiReview:null,startedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
function guide(){
  const v=visit();if(!v)return null;const key=planKey(v.projectType);
  if(!v.guidedCapture||v.guidedCapture.planKey!==key)v.guidedCapture=newGuide(key);
  const g=v.guidedCapture;
  g.version=BUILD;
  if(!Array.isArray(g.completedMeasurements))g.completedMeasurements=[];
  if(!Array.isArray(g.unknownMeasurements))g.unknownMeasurements=[];
  if(!Array.isArray(g.aiMeasurements))g.aiMeasurements=[];
  if(!g.photoReviewStatus)g.photoReviewStatus='NOT_STARTED';
  if(g.photoReviewError==null)g.photoReviewError='';
  return g;
}
function activePlan(){const g=guide();return g?PLANS[g.planKey]||PLANS.custom:PLANS.custom}
function measurementPlan(){const g=guide(),p=activePlan();return g?.photoReviewStatus==='COMPLETE'?g.aiMeasurements:p.measures}
async function persist(){const v=visit();if(!v||!window.H38DB?.put)return;v.updatedAt=new Date().toISOString();if(v.guidedCapture)v.guidedCapture.updatedAt=v.updatedAt;const id=`FIELD-VISIT:${v.businessId}:${v.quoteId||'UNASSIGNED'}`;await window.H38DB.put('drafts',Object.assign({id},v))}
function notify(message,bad){if(typeof C.toast==='function')C.toast(message,!!bad);else if(typeof window.toast==='function')window.toast(message,!!bad)}
function stopCamera(){runtime.stream?.getTracks?.().forEach(track=>track.stop());runtime.stream=null;$('fieldGuideCamera')?.remove()}
function currentPhoto(){const g=guide(),p=activePlan();return g&&p.photos[g.photoIndex]||null}
function currentMeasure(){const g=guide(),list=measurementPlan();return g&&list[g.measurementIndex]||null}
function phase(){const g=guide(),p=activePlan(),list=measurementPlan();if(!g)return'idle';if(g.photoIndex<p.photos.length)return'photos';if(!['COMPLETE','SKIPPED'].includes(g.photoReviewStatus))return'photo-review';if(g.measurementIndex<list.length)return'measurements';return'complete'}
function cameraMarkup(prompt){return `<section id="fieldGuideCamera" class="field-guide-camera" role="dialog" aria-modal="true" aria-label="Site camera"><header><button id="fieldGuideCloseCamera" type="button" aria-label="Close camera">×</button><div><strong>${esc(prompt[1])}</strong><small>${esc(prompt[2])}</small></div></header><div class="field-guide-viewfinder"><video id="fieldGuideVideo" autoplay playsinline muted></video><div class="field-guide-frame"></div></div><footer><button id="fieldGuideCapture" class="field-guide-shutter" type="button" aria-label="Take photo"><span></span></button><button id="fieldGuideFallback" type="button">Use phone camera picker</button></footer></section>`}
async function openCamera(){if(runtime.busy)return;const prompt=currentPhoto();if(!prompt)return;runtime.busy=true;try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Live camera is unavailable on this device.');document.body.insertAdjacentHTML('beforeend',cameraMarkup(prompt));$('fieldGuideCloseCamera').onclick=stopCamera;$('fieldGuideFallback').onclick=()=>{stopCamera();openFallback()};runtime.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});const video=$('fieldGuideVideo');video.srcObject=runtime.stream;await video.play();$('fieldGuideCapture').onclick=captureFrame}catch(error){stopCamera();notify(`Camera could not start: ${error.message}`,true);openFallback()}finally{runtime.busy=false}}
function openFallback(){const input=$('fieldPhotoInput');if(!input)return;input.removeAttribute('multiple');input.setAttribute('accept','image/*');input.setAttribute('capture','environment');input.value='';input.click()}
async function captureFrame(){if(runtime.busy)return;runtime.busy=true;const video=$('fieldGuideVideo');try{if(!video||!video.videoWidth)throw Error('Camera is not ready yet.');const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d',{alpha:false}).drawImage(video,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.88));if(!blob)throw Error('Photo could not be captured.');const file=new File([blob],`site-photo-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});stopCamera();await savePhotoFiles([file])}catch(error){notify(error.message||error,true)}finally{runtime.busy=false}}
async function savePhotoFiles(files){
  const list=Array.from(files||[]).filter(file=>file?.type?.startsWith('image/')).slice(0,1);if(!list.length)return;
  const g=guide(),p=activePlan(),before=g.photoIndex;g.photoIndex=Math.min(p.photos.length,g.photoIndex+1);
  try{
    await C.photos(list);await persist();
    if(g.photoIndex<p.photos.length)notify('Photo saved. The next required photo is ready.');
    else{
      notify(navigator.onLine?'Required photos complete. AI is reviewing them to plan the measurements.':'Required photos complete. Connect to run AI review, or use the standard measurement list.');
      renderGuide();
      if(navigator.onLine)setTimeout(startPhotoReview,250);
    }
    renderGuide();
  }catch(error){g.photoIndex=before;await persist();notify(error.message||error,true)}
}
function labelFromRequest(request,index){const cleaned=text(request).replace(/^measure\s+/i,'').trim();return(cleaned.split(/[.;]/)[0]||`Requested measurement ${index+1}`).slice(0,110)}
function normalizeAiMeasurements(review){
  const source=Array.isArray(review?.missingMeasurements)?review.missingMeasurements:[];
  return source.map((item,index)=>{
    const instruction=typeof item==='string'?item:text(item?.request||item?.instruction||item?.description||item?.label);
    const label=typeof item==='object'&&item?text(item.label||item.name||labelFromRequest(instruction,index)):labelFromRequest(instruction,index);
    const slug=label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||`request-${index+1}`;
    return[`ai-${index+1}-${slug}`,label,instruction||`Enter ${label}.`];
  }).filter(item=>item[1]&&item[2]);
}
async function applyPhotoReview(review){
  const g=guide();if(!g)return;
  g.aiReview={
    detectedObjects:Array.isArray(review?.detectedObjects)?review.detectedObjects:[],
    visibleConditions:Array.isArray(review?.visibleConditions)?review.visibleConditions:[],
    workAreas:Array.isArray(review?.workAreas)?review.workAreas:[],
    risksAndClearances:Array.isArray(review?.risksAndClearances)?review.risksAndClearances:[],
    scopeDraft:text(review?.scopeDraft),confidence:text(review?.confidence||'low')
  };
  g.aiMeasurements=normalizeAiMeasurements(review);
  g.photoReviewStatus='COMPLETE';g.photoReviewError='';g.measurementIndex=0;g.pendingMeasurementId='';
  await persist();renderGuide();
}
async function setPhotoReviewState(status){const g=guide();if(!g)return;g.photoReviewStatus=status;g.photoReviewError='';await persist();renderGuide()}
async function failPhotoReview(message){const g=guide();if(!g)return;g.photoReviewStatus='FAILED';g.photoReviewError=text(message);await persist();renderGuide()}
async function startPhotoReview(){
  const g=guide();if(!g||runtime.reviewStarting||g.photoReviewStatus==='RUNNING'||g.photoReviewStatus==='COMPLETE')return;
  runtime.reviewStarting=true;g.photoReviewStatus='RUNNING';g.photoReviewError='';await persist();renderGuide();
  try{
    const reviewer=window.H38_FIELD_VISIT_PHOTO_REVIEW;
    if(!reviewer?.run)throw Error('Photo review is still loading. Try again in a moment.');
    await reviewer.run();
  }catch(error){await failPhotoReview(error?.message||String(error));notify(error?.message||String(error),true)}
  finally{runtime.reviewStarting=false;}
}
async function useStandardMeasurements(){const g=guide();if(!g)return;g.photoReviewStatus='SKIPPED';g.photoReviewError='';g.aiMeasurements=[];g.measurementIndex=0;g.pendingMeasurementId='';await persist();renderGuide();notify('Using the standard job-type measurement list. AI photo review can be run later from Advanced Scanner tools.')}
function markUnknown(){const g=guide(),m=currentMeasure();if(!g||!m)return;if(!g.unknownMeasurements.some(x=>x.id===m[0]))g.unknownMeasurements.push({id:m[0],label:m[1],instruction:m[2],status:'UNKNOWN_FIELD_MEASUREMENT',markedAt:new Date().toISOString()});g.pendingMeasurementId='';g.measurementIndex++;persist().then(renderGuide)}
function prepareMeasurement(){const g=guide(),m=currentMeasure(),form=$('fieldManual');if(!g||!m||!form)return;g.pendingMeasurementId=m[0];const details=form.closest('details');if(details)details.open=true;form.elements.label.value=m[1];form.elements.measurementNotes.value=`Guided request: ${m[2]}`;persist();form.scrollIntoView({behavior:'smooth',block:'center'});form.elements.feet.focus()}
function monitorMeasurement(form){if(form.dataset.fieldGuideBound)return;form.dataset.fieldGuideBound='1';form.addEventListener('submit',()=>{const g=guide(),m=currentMeasure();if(!g||!m)return;const promptId=g.pendingMeasurementId||m[0],before=S.measurements.length;clearInterval(runtime.watchTimer);let checks=0;runtime.watchTimer=setInterval(async()=>{checks++;if(S.measurements.length>before){clearInterval(runtime.watchTimer);if(!g.completedMeasurements.includes(promptId))g.completedMeasurements.push(promptId);g.pendingMeasurementId='';g.measurementIndex=Math.min(measurementPlan().length,g.measurementIndex+1);await persist();renderGuide()}else if(checks>40)clearInterval(runtime.watchTimer)},250)},true)}
function photoReviewMarkup(g){
  if(g.photoReviewStatus==='RUNNING')return `<section id="fieldGuideCard" class="field-guide-card"><div class="field-guide-progress"><span>Photos complete</span><strong>AI site review</strong></div><h2>Reviewing the site photos…</h2><p>H38 is identifying visible conditions and deciding which measurements still need direct field confirmation.</p><small>Keep this screen open. Exact dimensions are never guessed.</small></section>`;
  if(g.photoReviewStatus==='FAILED')return `<section id="fieldGuideCard" class="field-guide-card"><div class="field-guide-progress"><span>Photos saved</span><strong>Review needs attention</strong></div><h2>Photo review did not finish</h2><p>${esc(g.photoReviewError||'The online review was unavailable.')}</p><div class="field-guide-two"><button id="fieldGuideRunReview" class="field-primary" type="button">Retry Photo Review</button><button id="fieldGuideStandardMeasures" class="field-secondary" type="button">Use Standard Measurements</button></div><small>Your photos remain private and saved. Nothing was lost.</small></section>`;
  return `<section id="fieldGuideCard" class="field-guide-card"><div class="field-guide-progress"><span>Photos complete</span><strong>Plan measurements</strong></div><h2>Review photos before measuring</h2><p>H38 will inspect the captured views and ask for the smallest useful set of measurements it cannot safely determine from the pictures.</p><div class="field-guide-two"><button id="fieldGuideRunReview" class="field-primary" type="button">✨ Review Photos & Plan Measurements</button><button id="fieldGuideStandardMeasures" class="field-secondary" type="button">Use Standard Measurements</button></div><small>AI observations remain owner-review required. Exact dimensions are never invented.</small></section>`;
}
function progressMarkup(){
  const g=guide(),p=activePlan(),list=measurementPlan(),mode=phase();if(!g)return'';
  if(mode==='photos'){const x=p.photos[g.photoIndex];return `<section id="fieldGuideCard" class="field-guide-card"><div class="field-guide-progress"><span>Guided capture</span><strong>Photo ${g.photoIndex+1} of ${p.photos.length}</strong></div><h2>${esc(x[1])}</h2><p>${esc(x[2])}</p><button id="fieldGuideTakePhoto" class="field-primary" type="button">📷 Open Camera</button><small>One required view at a time. Photos stay private and save to this visit.</small></section>`}
  if(mode==='photo-review')return photoReviewMarkup(g);
  if(mode==='measurements'){const x=list[g.measurementIndex],ai=g.photoReviewStatus==='COMPLETE';return `<section id="fieldGuideCard" class="field-guide-card"><div class="field-guide-progress"><span>${ai?'AI photo review complete':'Photos complete'}</span><strong>Measurement ${g.measurementIndex+1} of ${list.length}</strong></div><h2>${esc(x[1])}</h2><p>${esc(x[2])}</p><div class="field-guide-two"><button id="fieldGuideEnterMeasure" class="field-primary" type="button">Enter This Measurement</button><button id="fieldGuideUnknown" class="field-secondary" type="button">Cannot Measure — Mark Unknown</button></div><small>${ai?'This request came from the actual site photos. ':' '}Unknowns remain visible for owner review; no dimension is guessed.</small></section>`}
  return `<section id="fieldGuideCard" class="field-guide-card field-guide-complete"><div class="field-guide-progress"><span>Guided capture complete</span><strong>${p.photos.length} photos · ${g.completedMeasurements.length} measured</strong></div><h2>Review the visit</h2><p>${g.unknownMeasurements.length?`${g.unknownMeasurements.length} measurement${g.unknownMeasurements.length===1?' is':'s are'} marked unknown and must remain visible during quote review.`:g.photoReviewStatus==='COMPLETE'&&!list.length?'AI found no additional direct measurement request from the supplied photos and existing field data.':'Required field prompts are complete.'}</p><button id="fieldGuideReview" class="field-primary" type="button">Continue to Review</button></section>`
}
function reviewMarkup(){
  const g=guide(),p=activePlan(),unknown=g?.unknownMeasurements||[],ai=g?.aiReview,list=measurementPlan();if(!g)return'';
  const conditions=ai?.visibleConditions?.slice(0,4)||[];
  return `<section id="fieldGuideReviewCard" class="field-card field-guide-review"><h2>Guided site completeness</h2><div class="field-guide-summary"><div><strong>${Math.min(g.photoIndex,p.photos.length)}/${p.photos.length}</strong><span>Required photos</span></div><div><strong>${g.completedMeasurements.length}</strong><span>Confirmed measurements</span></div><div class="${unknown.length?'warn':''}"><strong>${unknown.length}</strong><span>Unknown measurements</span></div></div>${ai?`<div class="notice"><strong>AI photo review:</strong> ${esc(ai.confidence||'low')} confidence · ${list.length} targeted measurement request${list.length===1?'':'s'}.</div>${conditions.length?`<div class="field-guide-unknowns"><strong>Visible conditions</strong>${conditions.map(x=>`<span>${esc(typeof x==='string'?x:JSON.stringify(x))}</span>`).join('')}</div>`:''}`:'<p>Standard project-type guidance was used.</p>'}${unknown.length?`<div class="field-guide-unknowns"><strong>Still unknown</strong>${unknown.map(x=>`<span>${esc(x.label)}</span>`).join('')}</div>`:'<p>All guided prompts have a field result.</p>'}<small>Owner review remains required. Nothing is automatically approved or sent.</small></section>`
}
function bindInput(input){if(!input||input.dataset.fieldGuideBound)return;input.dataset.fieldGuideBound='1';input.removeAttribute('multiple');input.addEventListener('change',event=>{event.stopImmediatePropagation();const files=event.target.files;event.target.value='';savePhotoFiles(files)},true)}
function renderGuide(){
  if(!S.open||!visit())return;guide();const captureButton=$('fieldPhotos'),input=$('fieldPhotoInput');
  if(captureButton&&!captureButton.dataset.fieldGuideBound){captureButton.dataset.fieldGuideBound='1';captureButton.textContent='📷 Take Next Guided Photo';captureButton.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();openCamera()},true)}
  bindInput(input);const form=$('fieldManual');if(form)monitorMeasurement(form);
  const capturePanel=captureButton?.closest('.field-panel');
  if(capturePanel){
    capturePanel.querySelector('#fieldGuideCard')?.remove();const anchor=capturePanel.querySelector('.field-device-card')||capturePanel.querySelector('.field-capture-actions');anchor?.insertAdjacentHTML('beforebegin',progressMarkup());
    $('fieldGuideTakePhoto')?.addEventListener('click',openCamera);$('fieldGuideRunReview')?.addEventListener('click',startPhotoReview);$('fieldGuideStandardMeasures')?.addEventListener('click',useStandardMeasurements);$('fieldGuideEnterMeasure')?.addEventListener('click',prepareMeasurement);$('fieldGuideUnknown')?.addEventListener('click',markUnknown);$('fieldGuideReview')?.addEventListener('click',()=>{S.tab='review';window.H38_FIELD_VISIT_UI?.render()});
  }
  const reviewPanel=$('fieldAttach')?.closest('.field-panel');if(reviewPanel){reviewPanel.querySelector('#fieldGuideReviewCard')?.remove();reviewPanel.querySelector('.field-summary-grid')?.insertAdjacentHTML('afterend',reviewMarkup())}
}
function start(){new MutationObserver(()=>requestAnimationFrame(renderGuide)).observe(document.body,{childList:true,subtree:true});addEventListener('h38:native-scanner-ready',renderGuide);renderGuide()}
window.H38_FIELD_VISIT_GUIDANCE={build:BUILD,render:renderGuide,openCamera,planKey,guide,visit,persist,applyPhotoReview,setPhotoReviewState,failPhotoReview,startPhotoReview,measurementPlan,automaticApproval:false,automaticCustomerSending:false,unknownsAreNeverGuessed:true,photoReviewBeforeMeasurements:true};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
