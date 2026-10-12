(function(){
'use strict';
const BUILD='20261012-offline-polish-1';
function register(){
  if(!('serviceWorker' in navigator))return;
  if(!/^https:$/.test(location.protocol)&&location.hostname!=='localhost')return;
  navigator.serviceWorker.register('./offline-sw.js',{updateViaCache:'none'}).then(function(reg){
    // Force update check on every load — don't wait for Chrome's 24h throttle
    if(reg&&reg.update)reg.update().catch(function(){});
  }).catch(function(){});
}
// The offline status banner is owned by offline-mode.js (single offline UX:
// banner + queue counts + sync panel). This runtime previously painted its own
// fixed bottom pill, which sat on top of the phone bottom navigation and ate
// taps while offline; it was removed in the 2026-10-12 offline polish. Only the
// service-worker registration remains here.
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){register();},{once:true});else{register();}
window.H38_OFFLINE_RUNTIME=Object.freeze({build:BUILD});
})();
