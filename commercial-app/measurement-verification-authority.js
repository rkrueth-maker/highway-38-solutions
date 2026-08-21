(function(){
'use strict';
const BUILD='20260821-measurement-verification-authority-1';
const VERIFIED_STATUSES=Object.freeze([
  'FIELD_MEASURED_AND_CHECKED',
  'FIELD_MEASURED',
  'OPERATOR_VERIFIED',
  'FIELD_VERIFIED',
  'VERIFIED_BY_OPERATOR',
  'VERIFIED'
]);
const VERIFIED_SET=new Set(VERIFIED_STATUSES);
const text=value=>String(value==null?'':value);
const value=(row,...keys)=>{const source=row?.payload&&typeof row.payload==='object'?row.payload:row;for(const key of keys){if(source&&source[key]!==undefined&&source[key]!==null&&source[key]!=='')return source[key];}return'';};
const unique=items=>Array.from(new Set((items||[]).filter(Boolean)));
function status(rowOrStatus){return text(typeof rowOrStatus==='string'?rowOrStatus:value(rowOrStatus,'Verification Status','verificationStatus','status')).trim().toUpperCase();}
function isVerified(rowOrStatus){return rowOrStatus?.fieldVerified===true||VERIFIED_SET.has(status(rowOrStatus));}
function normalizeUnit(raw){const unit=text(raw).toLowerCase().trim().replace(/[^a-z]/g,'');if(['in','inch','inches'].includes(unit))return'in';if(['ft','foot','feet'].includes(unit))return'ft';if(['lf','linearfoot','linearfeet'].includes(unit))return'lf';if(['sf','squarefoot','squarefeet'].includes(unit))return'sf';return unit;}
const LABEL_STOP=new Set(['verify','verified','measure','measured','measurement','measurements','field','dimension','dimensions','required','needed','need','confirm','record','walkthrough','estimate','estimated','with','using','android','laser','tape','device','camera','the','a','an','to','of','for','from','and','or','in','at']);
function normalizeLabel(raw){return text(raw).toLowerCase().replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(token=>token&&!LABEL_STOP.has(token)).join(' ').trim();}
function labelTokens(raw){return normalizeLabel(raw).split(' ').filter(Boolean);}
function labelMatch(label,request){const a=normalizeLabel(label),b=normalizeLabel(request);if(!a||!b)return false;if(a===b)return true;if(a.length>=7&&b.includes(a))return true;const aa=labelTokens(a),bb=new Set(labelTokens(b));if(!aa.length)return false;const common=aa.filter(token=>bb.has(token)).length;const coverage=common/aa.length;return aa.length===1?coverage===1&&b.split(' ').length<=3:coverage>=0.67&&common>=2;}
function numericValues(raw){const matches=text(raw).match(/-?\d+(?:\.\d+)?/g)||[];return matches.map(Number).filter(Number.isFinite);}
function scalar(row){const amount=Number(value(row,'Value','value'));return Number.isFinite(amount)&&amount>0?amount:null;}
function measurementId(row){return text(value(row,'Site Measurement ID','measurementId','Measurement ID','id')).trim();}
function rowLabel(row){return text(value(row,'Label','label','Measurement Label','measurementLabel')).trim();}
function rowUnit(row){return normalizeUnit(value(row,'Unit','unit'));}
function rowSession(row){return text(value(row,'Capture Session ID','captureSessionId')).trim();}
function sameNumber(a,b){return Math.abs(Number(a)-Number(b))<0.01;}
function missingResolved(item,row){if(!isVerified(row))return false;const request=typeof item==='string'?item:text(item?.request||item?.label||item?.detail||item?.statement),rid=text(item?.measurementId||item?.['Site Measurement ID']||'').trim(),mid=measurementId(row);if(rid&&mid&&rid===mid)return true;const label=rowLabel(row);if(!labelMatch(label,request))return false;const nums=numericValues(request),amount=scalar(row);if(nums.length&&amount!==null&&!nums.some(number=>sameNumber(number,amount)))return false;const requestedUnit=normalizeUnit((text(request).match(/\b(?:in|inch(?:es)?|ft|feet|foot|lf|sf)\b/i)||[])[0]);const unit=rowUnit(row);if(requestedUnit&&unit&&requestedUnit!==unit)return false;return true;}
function currentVisit(){return window.H38_FIELD_VISIT_CORE?.state?.visit||null;}
function snapshotRows(name){return Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];}
function currentRows(){const C=window.H38_FIELD_VISIT_CORE,v=currentVisit(),sid=text(v?.sessionId),qid=text(v?.quoteId),local=Array.isArray(C?.state?.measurements)?C.state.measurements:[],server=snapshotRows('siteMeasurements').filter(row=>{const rs=rowSession(row),rq=text(value(row,'Quote ID','quoteId'));return(sid&&rs===sid)||(qid&&rq===qid);});const spoken=[];for(const source of [v?.walkthroughMeasurementCandidates,v?.walkthroughSpokenMeasurements,v?.walkthroughVoice?.spokenMeasurements,v?.walkthroughProfessionalNotes?.spokenMeasurements])if(Array.isArray(source))spoken.push(...source);const seen=new Set();return[...local,...server,...spoken].filter(row=>{if(!isVerified(row))return false;const key=[measurementId(row),normalizeLabel(rowLabel(row)),scalar(row),rowUnit(row),rowSession(row)].join('|');if(seen.has(key))return false;seen.add(key);return true;});}
function filterMissing(list,rows=currentRows()){if(!Array.isArray(list)||!list.length||!rows.length)return Array.isArray(list)?list:[];return list.filter(item=>!rows.some(row=>missingResolved(item,row)));}
function reviewMatchesVisit(review,v=currentVisit()){if(!review||!v)return false;const sid=text(value(review,'Capture Session ID','captureSessionId')),vid=text(value(review,'Site Visit ID','siteVisitId')),qid=text(value(review,'Quote ID','quoteId'));return Boolean((v.sessionId&&sid===text(v.sessionId))||(v.visitId&&vid===text(v.visitId))||(v.quoteId&&qid===text(v.quoteId)));}
function suppressCurrentVisitMissing(){const v=currentVisit(),verified=currentRows();if(!v||!verified.length)return{verified:verified.length,removed:0};let removed=0;for(const review of snapshotRows('siteAiReviews')){if(!reviewMatchesVisit(review,v))continue;for(const key of ['Missing Measurements','missingMeasurements']){if(!Array.isArray(review[key]))continue;const before=review[key].length;review[key]=filterMissing(review[key],verified);removed+=before-review[key].length;}}
  const ai=v.walkthroughAi;if(ai){if(Array.isArray(ai.missingMeasurements)){const before=ai.missingMeasurements.length;ai.missingMeasurements=filterMissing(ai.missingMeasurements,verified);removed+=before-ai.missingMeasurements.length;}if(ai.review){for(const key of ['Missing Measurements','missingMeasurements']){if(!Array.isArray(ai.review[key]))continue;const before=ai.review[key].length;ai.review[key]=filterMissing(ai.review[key],verified);removed+=before-ai.review[key].length;}}}
  return{verified:verified.length,removed};}
function decorateReviewWording(){const card=document.getElementById('h38GuidedController');if(!card)return;for(const section of card.querySelectorAll('.h38-guided-section')){const heading=section.querySelector(':scope > strong');if(!heading)continue;const label=text(heading.textContent).trim();if(label==='Photos H38 still needs'){heading.textContent='Additional photos H38 recommends';const empty=section.querySelector('.h38-guided-empty');if(empty)empty.textContent='No additional photos needed.';}if(label==='Measurements H38 still needs'){heading.textContent='Measurements still unverified';const empty=section.querySelector('.h38-guided-empty');if(empty)empty.textContent='No additional measurements needed.';}}}
let busy=false;function reconcile(){if(busy)return;busy=true;try{suppressCurrentVisitMissing();decorateReviewWording();}finally{busy=false;}}
const observer=new MutationObserver(()=>queueMicrotask(reconcile));observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('h38:walkthrough-measurements-updated',reconcile);
window.addEventListener('h38:business-snapshot-updated',reconcile);
[0,250,900,2200].forEach(delay=>setTimeout(reconcile,delay));
window.H38_MEASUREMENT_VERIFICATION=Object.freeze({build:BUILD,VERIFIED_STATUSES,isVerified,normalizeUnit,normalizeLabel,labelMatch,missingResolved,currentRows,filterMissing,suppressCurrentVisitMissing,reconcile,fieldMeasuredIsVerified:true,structuredIdentityMatching:true,scalarLabelValueUnitMatching:true,automaticApproval:false});
})();