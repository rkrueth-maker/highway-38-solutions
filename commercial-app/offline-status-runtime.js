(function(){
'use strict';
const BUILD='20261006-offline-field-1';
function register(){
  if(!('serviceWorker' in navigator))return;
  if(!/^https:$/.test(location.protocol)&&location.hostname!=='localhost')return;
  navigator.serviceWorker.register('./offline-sw.js').catch(function(){});
}
function pill(){
  let el=document.querySelector('[data-h38-offline-pill]');
  if(!el){
    el=document.createElement('div');
    el.dataset.h38OfflinePill='1';
    el.style.cssText='position:fixed;left:10px;bottom:10px;z-index:9999;padding:6px 10px;border-radius:999px;font:600 12px system-ui;color:#fff;background:#b3261e;box-shadow:0 2px 8px rgba(0,0,0,.25);display:none';
    document.body.appendChild(el);
  }
  if(navigator.onLine){el.style.display='none';return;}
  el.textContent='📴 Offline — the Office stays open. Anything you save stays on this device until you are back online.';
  el.style.display='block';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){register();pill();},{once:true});else{register();pill();}
window.addEventListener('online',pill);
window.addEventListener('offline',pill);
window.H38_OFFLINE_RUNTIME=Object.freeze({build:BUILD});
})();
