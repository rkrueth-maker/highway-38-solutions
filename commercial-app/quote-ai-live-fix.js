(function(){
'use strict';
if(window.H38_QUOTE_AI_CLICK_GUARD&&window.H38_QUOTE_AI_CLICK_GUARD.enabled)return;
let running=false;
function text(value){return String(value==null?'':value);}
function message(error){return text(error&&error.message?error.message:error||'Build Quote failed.');}
function button(){return document.getElementById('h38AiQuoteDraftButton');}
function ensureStatus(){
  let node=document.getElementById('h38QuoteBuildStatus');
  if(node)return node;
  const tools=document.querySelector('.page-tools');
  if(!tools)return null;
  node=document.createElement('div');
  node.id='h38QuoteBuildStatus';
  node.className='notice';
  node.setAttribute('role','status');
  node.setAttribute('aria-live','polite');
  node.hidden=true;
  tools.insertAdjacentElement('afterend',node);
  return node;
}
function show(value,kind){
  const node=ensureStatus();
  if(!node)return;
  node.hidden=false;
  const nextClass=`notice${kind==='error'?' warn':''}`;
  if(node.className!==nextClass)node.className=nextClass;
  const nextText=text(value);
  if(node.textContent!==nextText)node.textContent=nextText;
  node.dataset.state=kind||'pending';
}
async function runBuild(){
  if(running){show('Build Quote is already running.','pending');return;}
  running=true;
  const current=button();
  if(current){current.disabled=true;current.textContent='Starting…';current.dataset.h38LiveHandler='quote-ai-v3-capture';}
  show('Build Quote started. Saving the draft and preparing the AI request…','pending');
  const originalToast=window.toast;
  let capturedError='';
  let capturedSuccess='';
  if(typeof originalToast==='function'){
    window.toast=function(value,isError){
      const msg=text(value);
      if(isError)capturedError=msg;
      else if(msg)capturedSuccess=msg;
      return originalToast.apply(this,arguments);
    };
  }
  try{
    const build=window.h38BuildAiQuoteDraft;
    if(typeof build!=='function')throw new Error('Build Quote is not loaded. Close this Business Office window, reopen it, and try again.');
    await build();
    if(capturedError)throw new Error(capturedError);
    const quote=window.state&&window.state.quote;
    const lines=quote&&Array.isArray(quote.lines)?quote.lines:[];
    if(!lines.length)throw new Error('The AI request finished without creating quote lines. The draft remains saved and Owner review is still required.');
    show(capturedSuccess||`AI draft loaded with ${lines.length} editable quote line${lines.length===1?'':'s'}. Owner review is required.`,'success');
  }catch(error){
    const detail=`${message(error)} The draft was preserved and nothing was approved or sent.`;
    show(detail,'error');
    if(typeof originalToast==='function')originalToast(detail,true);
    else window.alert(detail);
  }finally{
    if(typeof originalToast==='function')window.toast=originalToast;
    const latest=button();
    if(latest){latest.disabled=false;latest.textContent='✨ Build Quote';latest.dataset.h38LiveHandler='quote-ai-v3-capture';}
    running=false;
  }
}
document.addEventListener('click',event=>{
  const target=event.target&&event.target.closest?event.target.closest('#h38AiQuoteDraftButton'):null;
  if(!target)return;
  event.preventDefault();
  event.stopPropagation();
  if(typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
  target.dataset.h38LiveHandler='quote-ai-v3-capture';
  void runBuild();
},true);
window.H38_QUOTE_AI_CLICK_GUARD={enabled:true,build:'20260805-1725',capturePhase:true,inlineStatus:true,silentFailureBlocked:true,recursiveObserver:false,run:runBuild};
})();