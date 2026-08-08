(function(){
'use strict';
const BUILD='20260807-2306';
let lastSearchTrigger=null;

function searchDialog(){return document.getElementById('h38OfficeSearchDialog');}
function resetSearch(dialog){
  const input=dialog?.querySelector('#h38OfficeSearchInput');
  const results=dialog?.querySelector('#h38OfficeSearchResults');
  if(input){input.value='';input.blur();}
  if(results)results.innerHTML='<p class="muted">Type at least two characters.</p>';
}
function closeSearch(reason='close'){
  const dialog=searchDialog();
  if(!dialog||!dialog.open)return false;
  resetSearch(dialog);
  try{dialog.close(reason);}catch(_){dialog.removeAttribute('open');}
  const target=lastSearchTrigger||document.getElementById('h38OfficeSearchButton');
  setTimeout(()=>{try{target?.focus?.({preventScroll:true});}catch(_){}},0);
  return true;
}
function polishSearch(){
  const dialog=searchDialog();
  if(!dialog||dialog.dataset.h38OfficePolished==='1')return;
  dialog.dataset.h38OfficePolished='1';
  const shell=dialog.querySelector('.h38-search-shell');
  shell?.setAttribute('role','search');
  const input=dialog.querySelector('#h38OfficeSearchInput');
  if(input){input.setAttribute('aria-label','Search Business Office');input.setAttribute('enterkeyhint','search');}
  const close=dialog.querySelector('header button');
  if(close){
    close.type='button';
    close.removeAttribute('value');
    close.classList.add('h38-search-close');
    close.setAttribute('aria-label','Close Business Office search');
    close.innerHTML='<span aria-hidden="true">×</span><span class="h38-search-close-label">Close</span>';
    close.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();closeSearch('close');});
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeSearch('cancel');});
  dialog.addEventListener('click',event=>{if(event.target===dialog)closeSearch('backdrop');});
  dialog.addEventListener('close',()=>resetSearch(dialog));
}
function bindSearchTrigger(button){
  if(!button||button.dataset.h38OfficePolishTrigger==='1')return;
  button.dataset.h38OfficePolishTrigger='1';
  button.setAttribute('aria-haspopup','dialog');
  button.setAttribute('title','Search Business Office');
  button.addEventListener('click',()=>{lastSearchTrigger=button;queueMicrotask(polishSearch);});
}
function polishTouchTargets(){
  bindSearchTrigger(document.getElementById('h38OfficeSearchButton'));
  bindSearchTrigger(document.getElementById('h38AssistantSearch'));
  bindSearchTrigger(document.getElementById('h38OpenLifecycleSearch'));
  const assistant=document.getElementById('personalAssistantButton');
  if(assistant){assistant.setAttribute('title','Open Personal Assistant');assistant.classList.add('h38-polish-touch');}
  document.getElementById('h38OfficeSearchButton')?.classList.add('h38-polish-touch');
}
function apply(){polishSearch();polishTouchTargets();}

const observer=new MutationObserver(apply);
observer.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&searchDialog()?.open){event.preventDefault();closeSearch('escape');}},true);
apply();

window.H38_OFFICE_POLISH=Object.freeze({
  enabled:true,
  build:BUILD,
  searchExitGuaranteed:true,
  closeSearch,
  quoteAiChanged:false
});
})();
