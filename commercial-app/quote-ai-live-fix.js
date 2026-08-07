(function(){
'use strict';
const BUILD='20260806-2210';
let running=false;
function text(value){return String(value==null?'':value);}
function message(error){return text(error&&error.message?error.message:error||'Build Quote failed.');}
function button(){return document.getElementById('h38AiQuoteDraftButton');}
function ensureRowId(){
  if(typeof window.rowId==='function')return window.rowId;
  window.rowId=function(row,...keys){
    for(const key of keys){
      if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return String(row[key]);
    }
    return '';
  };
  return window.rowId;
}
function ensureStatus(){
  let node=document.getElementById('h38QuoteBuildStatus');
  if(node)return node;
  const tools=document.querySelector('.page-tools');
  if(!tools)return null;
  node=document.createElement('div');
  node.id='h38QuoteBuildStatus';
  node.className='notice';
  node.setAttribute('role','status');
  node.setAttribute('aria-live','assertive');
  node.hidden=true;
  tools.insertAdjacentElement('afterend',node);
  return node;
}
function show(value,kind){
  const node=ensureStatus();
  if(!node)return;
  node.hidden=false;
  node.className=`notice${kind==='error'?' warn':''}`;
  node.textContent=text(value);
  node.dataset.state=kind||'pending';
  node.scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function runBuild(){
  if(running){show('Build Quote is already running.','pending');return;}
  running=true;
  const current=button();
  if(current){current.disabled=true;current.textContent='Preparing photos…';current.dataset.h38LiveHandler='quote-ai-v5-runtime-self-heal';}
  show('Build Quote started. Linking the Site Visit photos and checking the secure session…','pending');
  const originalToast=window.toast;
  let capturedError='',capturedSuccess='';
  if(typeof originalToast==='function'){
    window.toast=function(value,isError){const msg=text(value);if(isError)capturedError=msg;else if(msg)capturedSuccess=msg;return originalToast.apply(this,arguments);};
  }
  try{
    ensureRowId();
    const valid=await window.H38_SUPABASE_SESSION_RECOVERY?.validate?.();
    if(valid===false)throw new Error('Secure session expired. Sign in again before building the quote.');
    ensureRowId();
    const linked=await window.H38_QUOTE_PHOTO_RESTORE?.ensureQuoteLinks?.();
    ensureRowId();
    if(current)current.textContent='Building quote…';
    show(`${linked?`${linked} Site Visit photo link${linked===1?'':'s'} prepared. `:''}Analyzing the saved scope, measurements, photos and Price Book…`,'pending');
    const build=window.h38BuildAiQuoteDraft;
    if(typeof build!=='function')throw new Error('Build Quote is not loaded. Close and reopen H38 Field Office, then reopen the draft quote.');
    await build();
    if(capturedError)throw new Error(capturedError);
    const quote=window.state&&window.state.quote;
    const lines=quote&&Array.isArray(quote.lines)?quote.lines:[];
    if(!lines.length)throw new Error('The AI request finished without creating quote lines. The draft remains saved and Owner review is still required.');
    show(capturedSuccess||`AI draft loaded with ${lines.length} editable quote line${lines.length===1?'':'s'}. Owner review is required.`,'success');
  }catch(error){
    const detail=`${message(error)} The draft and private photos were preserved; nothing was approved or sent.`;
    show(detail,'error');
    if(typeof originalToast==='function')originalToast(detail,true);else window.alert(detail);
  }finally{
    if(typeof originalToast==='function')window.toast=originalToast;
    const latest=button();
    if(latest){latest.disabled=false;latest.textContent='✨ Build Quote';latest.dataset.h38LiveHandler='quote-ai-v5-runtime-self-heal';}
    running=false;
  }
}
ensureRowId();
document.addEventListener('click',event=>{
  const target=event.target&&event.target.closest?event.target.closest('#h38AiQuoteDraftButton'):null;
  if(!target)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  target.dataset.h38LiveHandler='quote-ai-v5-runtime-self-heal';
  void runBuild();
},true);
window.H38_QUOTE_AI_CLICK_GUARD={enabled:true,build:BUILD,capturePhase:true,inlineStatus:true,silentFailureBlocked:true,sharedSessionValidation:true,siteVisitPhotoLinking:true,rowIdSelfHealing:true,automaticApproval:false,automaticCustomerSending:false,run:runBuild};
})();
