(function(){
  'use strict';
  const H38={
    state(host,options={}){
      if(typeof host==='string')host=document.querySelector(host);
      if(!host)return;
      const kind=options.kind||'info';
      const icon={loading:'…',empty:'○',success:'✓',warning:'!',error:'×',offline:'↯',permission:'🔒',session:'⌛'}[kind]||'•';
      host.innerHTML='<section class="h38-state" data-h38-state="'+kind+'" role="'+(kind==='error'?'alert':'status')+'"><div class="h38-state__icon" aria-hidden="true">'+icon+'</div><h2>'+escapeHtml(options.title||stateTitle(kind))+'</h2><p>'+escapeHtml(options.message||'')+'</p>'+(options.actionLabel?'<button class="btn btn-primary" type="button" data-h38-state-action>'+escapeHtml(options.actionLabel)+'</button>':'')+'</section>';
      const action=host.querySelector('[data-h38-state-action]');if(action&&typeof options.onAction==='function')action.addEventListener('click',options.onAction);
    },
    skeleton(host,count=4){if(typeof host==='string')host=document.querySelector(host);if(!host)return;host.innerHTML=Array.from({length:count},(_,i)=>'<div class="h38-skeleton" aria-hidden="true" style="height:'+(i===0?'2.2rem':'1rem')+';margin-bottom:.8rem;width:'+(i===0?'48%':(88-i*7)+'%')+'"></div>').join('');host.setAttribute('aria-busy','true');},
    clearBusy(host){if(typeof host==='string')host=document.querySelector(host);if(host)host.removeAttribute('aria-busy');},
    markDirty(form){if(!form||form.dataset.h38DirtyBound)return;form.dataset.h38DirtyBound='true';form.addEventListener('input',()=>{form.dataset.h38Dirty='true';});form.addEventListener('submit',()=>{form.dataset.h38Dirty='false';});window.addEventListener('beforeunload',event=>{if(form.dataset.h38Dirty==='true'){event.preventDefault();event.returnValue='';}});},
    saveDraft(key,value){try{localStorage.setItem('h38:draft:'+key,JSON.stringify({savedAt:new Date().toISOString(),value}));return true;}catch(_){return false;}},
    loadDraft(key){try{const item=JSON.parse(localStorage.getItem('h38:draft:'+key)||'null');return item&&item.value;}catch(_){return null;}},
    clearDraft(key){try{localStorage.removeItem('h38:draft:'+key);}catch(_){} }
  };
  function stateTitle(kind){return {loading:'Loading',empty:'Nothing here yet',success:'Complete',warning:'Needs attention',error:'Something went wrong',offline:'You are offline',permission:'Access is limited',session:'Session expired'}[kind]||'Status';}
  function escapeHtml(value){return String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function renderOffline(){let node=document.getElementById('h38OfflineBanner');if(navigator.onLine){if(node)node.remove();return;}if(!node){node=document.createElement('div');node.id='h38OfflineBanner';node.className='h38-offline-banner';node.setAttribute('role','status');document.body.appendChild(node);}node.textContent='Offline — open work is preserved on this device. Reconnect before submitting.';}
  window.H38Platform=H38;
  window.addEventListener('online',renderOffline);window.addEventListener('offline',renderOffline);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderOffline,{once:true});else renderOffline();
})();