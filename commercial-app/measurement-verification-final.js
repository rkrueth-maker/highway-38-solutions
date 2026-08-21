(function(){
'use strict';
const BUILD='20260821-measurement-verification-final-1';
const authority=window.H38_MEASUREMENT_VERIFICATION;
if(!authority)return;
let running=false,scheduled=false;
const text=value=>String(value==null?'':value).trim();
const arr=value=>Array.isArray(value)?value:[];
function visit(){return window.H38_FIELD_VISIT_CORE?.state?.visit||null;}
function verified(){return authority.currentRows?.()||[];}
function filter(list,rows){return authority.filterMissing?.(list,rows)||arr(list);}
function reconcileObject(obj,keys,rows){if(!obj||typeof obj!=='object')return 0;let removed=0;for(const key of keys){if(!Array.isArray(obj[key]))continue;const before=obj[key].length;obj[key]=filter(obj[key],rows);removed+=before-obj[key].length;}return removed;}
function reconcileState(){const v=visit(),rows=verified();if(!v||!rows.length)return{removed:0,verified:rows.length};let removed=0;
  removed+=reconcileObject(v,['walkthroughMeasurementCandidates','walkthroughSpokenMeasurements','missingMeasurements','Missing Measurements'],rows);
  removed+=reconcileObject(v.guidedCapture,['aiMeasurements','missingMeasurements','unknownMeasurements'],rows);
  removed+=reconcileObject(v.walkthroughAi,['missingMeasurements','Missing Measurements'],rows);
  removed+=reconcileObject(v.walkthroughAi?.review,['missingMeasurements','Missing Measurements'],rows);
  const snapshot=window.state?.snapshot?.siteAiReviews;for(const review of arr(snapshot)){const sid=text(review?.['Capture Session ID']||review?.captureSessionId),qid=text(review?.['Quote ID']||review?.quoteId);if((v.sessionId&&sid===text(v.sessionId))||(v.quoteId&&qid===text(v.quoteId)))removed+=reconcileObject(review,['Missing Measurements','missingMeasurements'],rows);}
  return{removed,verified:rows.length};}
function rowResolved(raw,rows){return rows.some(row=>authority.missingResolved?.(raw,row));}
function pruneDom(rows){let removed=0;const roots=[document.getElementById('h38GuidedController'),document.getElementById('fieldGuideReviewCard'),document.getElementById('fieldGuideCard')].filter(Boolean);for(const root of roots){root.querySelectorAll('li,.h38-guided-item,.h38-guided-request,.field-guide-unknowns span').forEach(node=>{const raw=text(node.textContent);if(raw&&rowResolved(raw,rows)){node.remove();removed++;}});
    root.querySelectorAll('.h38-guided-section').forEach(section=>{const heading=text(section.querySelector(':scope > strong')?.textContent||section.querySelector('strong')?.textContent);if(!/measurements? (h38 still needs|still unverified)|still unknown/i.test(heading))return;const candidates=Array.from(section.querySelectorAll('li,.h38-guided-item,.h38-guided-request,span')).filter(node=>node!==section.querySelector(':scope > strong'));candidates.forEach(node=>{const raw=text(node.textContent);if(raw&&rowResolved(raw,rows)){node.remove();removed++;}});const remaining=section.querySelectorAll('li,.h38-guided-item,.h38-guided-request').length;if(!remaining){let empty=section.querySelector('.h38-guided-empty');if(!empty){empty=document.createElement('p');empty.className='h38-guided-empty';section.appendChild(empty);}empty.textContent='No additional measurements needed.';}});
  }
  return removed;}
function ensureSummary(rows){const root=document.getElementById('h38GuidedController')||document.getElementById('fieldGuideReviewCard');if(!root)return;let box=document.getElementById('h38VerifiedMeasurementSummary');if(!box){box=document.createElement('div');box.id='h38VerifiedMeasurementSummary';box.className='notice good';root.appendChild(box);}const items=rows.map(row=>`${text(row?.Label||row?.label)}: ${text(row?.Value??row?.value)} ${text(row?.Unit||row?.unit)}`).filter(Boolean).slice(0,8);box.innerHTML=`<strong>Field-verified measurements</strong><br><small>${items.length?items.map(item=>`✓ ${item}`).join(' · '):'No field-verified measurements yet.'}</small>`;}
function run(){if(running)return;running=true;try{authority.reconcile?.();const rows=verified(),state=reconcileState();pruneDom(rows);ensureSummary(rows);if(state.removed>0){try{window.H38_FIELD_VISIT_GUIDANCE?.render?.();}catch(_){}}}finally{running=false;}}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;run();});}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('h38:business-snapshot-updated',schedule);window.addEventListener('h38:walkthrough-measurements-updated',schedule);
[0,250,900,2200].forEach(delay=>setTimeout(schedule,delay));
window.H38_MEASUREMENT_VERIFICATION_FINAL=Object.freeze({enabled:true,build:BUILD,reconcile:run,verifiedMeasurementsWin:true,verifiedPromptsRemovedAcrossStateAndDom:true,unverifiedMeasurementsRemain:true,physicalUiReconciliation:true,automaticApproval:false});
})();