(function(){
'use strict';
if(typeof window.renderQuotes!=='function')return;
const previousRenderQuotes=window.renderQuotes;
function message(error){return String(error&&error.message?error.message:error||'Build Quote failed.');}
async function runBuild(){
  const button=document.getElementById('h38AiQuoteDraftButton');
  if(button){button.disabled=true;button.textContent='Starting…';}
  try{
    if(typeof window.h38BuildAiQuoteDraft!=='function')throw new Error('Build Quote is not loaded. Refresh the Business Office and try again.');
    await window.h38BuildAiQuoteDraft();
  }catch(error){
    if(typeof window.toast==='function')window.toast(`${message(error)} The draft was not approved or sent.`,true);
    else window.alert(`${message(error)} The draft was not approved or sent.`);
  }finally{
    const current=document.getElementById('h38AiQuoteDraftButton');
    if(current){current.disabled=false;current.textContent='✨ Build Quote';}
  }
}
function wire(){
  const button=document.getElementById('h38AiQuoteDraftButton');
  if(!button)return;
  button.textContent='✨ Build Quote';
  button.onclick=runBuild;
  button.dataset.h38LiveHandler='quote-ai-v1';
}
window.renderQuotes=function(){previousRenderQuotes();wire();};
wire();
window.H38_QUOTE_AI_LIVE_FIX={enabled:true,build:'20260805-1720',silentFailureBlocked:true};
})();