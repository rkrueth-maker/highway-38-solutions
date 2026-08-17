(function(){
'use strict';
const BUILD='20260817-review-terminal-guard-1';
const MAX_WORK_MS=60000;
const POLL_MS=2000;
const PREFIX='h38:walkthrough-review-start:';
const C=window.H38_FIELD_VISIT_CORE;
if(!C)return;
const text=v=>String(v==null?'':v);
function visit(){return C.state?.visit||null;}
function reviewRows(){return Array.isArray(window.state?.snapshot?.siteAiReviews)?window.state.snapshot.siteAiReviews:[];}
function latestReview(v=visit()){
  if(!v?.sessionId)return null;
  return reviewRows().filter(row=>text(row?.['Capture Session ID']||row?.captureSessionId)===text(v.sessionId)&&text(row?.['Record Status']||row?.recordStatus||'active').toLowerCase()!=='deleted')
    .sort((a,b)=>text(b?.['Updated Time']||b?.updatedAt||b?.['Created Time']||b?.createdAt).localeCompare(text(a?.['Updated Time']||a?.updatedAt||a?.['Created Time']||a?.createdAt)))[0]||null;
}
function evidenceKey(v=visit()){
  if(!v?.sessionId)return'';
  return [text(v.sessionId),(v.videoAttachmentIds||[]).map(text).sort().join(','),(v.walkthroughFrameIds||[]).map(text).sort().join(',')].join('|');
}
function storeKey(v=visit()){const key=evidenceKey(v);return key?PREFIX+key:'';}
function readStarted(v=visit()){
  const key=storeKey(v);if(!key)return 0;
  try{return Number(sessionStorage.getItem(key)||0)||0;}catch(_){return 0;}
}
function ensureStarted(v=visit()){
  const key=storeKey(v);if(!key)return 0;
  let started=readStarted(v);if(started)return started;
  started=Date.now();try{sessionStorage.setItem(key,String(started));}catch(_){}
  return started;
}
function clearStarted(v=visit()){
  const key=storeKey(v);if(!key)return;
  try{sessionStorage.removeItem(key);}catch(_){}
}
function presentTerminal(message){
  const card=document.getElementById('h38GuidedController');if(!card)return;
  card.querySelector('.h38-guided-working')?.remove();
  card.setAttribute('data-h38-review-terminal','1');
  const title=card.querySelector('.h38-guided-title strong');if(title)title.textContent='Review complete';
  const subtitle=card.querySelector('.h38-guided-title small');if(subtitle)subtitle.textContent='No actionable findings from the current evidence.';
  let note=card.querySelector('.h38-review-terminal-note');
  if(!note){note=document.createElement('div');note.className='h38-review-terminal-note';note.style.cssText='margin:12px 0;padding:14px;border-radius:14px;background:#fff;border:1px solid rgba(11,36,56,.18)';note.innerHTML='<strong style="display:block;margin-bottom:5px">Nothing else required from this walkthrough yet</strong><span style="display:block;color:#52616d;line-height:1.35"></span>';card.querySelector('.h38-guided-title')?.insertAdjacentElement('afterend',note);}
  const span=note.querySelector('span');if(span)span.textContent=message;
  card.querySelectorAll('.h38-guided-section p').forEach(p=>{if(/still processing|reading the saved|reviewing walkthrough/i.test(text(p.textContent)))p.textContent='No additional finding was produced from the current evidence.';});
  const next=card.querySelector('.h38-guided-next.done strong');if(next)next.textContent='Add a spoken/typed note, measurement, or detail photo if you want H38 to analyze more.';
}
async function settle(){
  const v=visit(),s=v?.walkthroughAi;if(!C.state?.open||!v?.sessionId||!s||(v.videoAttachmentIds||[]).length<1)return;
  if(latestReview(v)){clearStarted(v);return;}
  const status=text(s.status).toUpperCase();
  if(['COMPLETE','FAILED','NEEDS_INPUT'].includes(status)){
    clearStarted(v);if(status==='NEEDS_INPUT')presentTerminal(text(s.message));return;
  }
  const started=ensureStarted(v);
  if(!started||Date.now()-started<MAX_WORK_MS)return;
  s.status='NEEDS_INPUT';
  s.message='The walkthrough is saved. H38 did not find enough actionable evidence to produce another field recommendation. Add a spoken or typed note, a measurement, or a detail photo only if you want more analysis, then tap Reanalyze current evidence.';
  s.updatedAt=new Date().toISOString();
  clearStarted(v);
  try{await C.saveDraft?.();}catch(_){}
  try{window.H38_FIELD_VISIT_GUIDANCE?.decorate?.(true);}catch(_){}
  setTimeout(()=>presentTerminal(s.message),0);
  try{window.toast?.('Walkthrough saved. No additional field input is required.',false);}catch(_){}
}
const observer=new MutationObserver(()=>{const v=visit();if(v?.walkthroughAi?.status==='NEEDS_INPUT')presentTerminal(text(v.walkthroughAi.message));});
observer.observe(document.body,{childList:true,subtree:true});
setInterval(()=>void settle(),POLL_MS);
['focus','pageshow','online'].forEach(name=>addEventListener(name,()=>setTimeout(()=>void settle(),100)));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>void settle(),100);});
setTimeout(()=>void settle(),500);
window.H38_FIELD_VISIT_REVIEW_TERMINAL_GUARD=Object.freeze({build:BUILD,maxWorkingMs:MAX_WORK_MS,sessionEvidenceClock:true,rerenderCannotReset:true,terminalNeedsInput:true,noInfiniteSpinner:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchasing:false,automaticPayment:false,automaticScheduling:false});
})();
