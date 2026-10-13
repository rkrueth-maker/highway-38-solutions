(function(){
'use strict';
const BUILD='20261013-fix-sweep-1';
// Service-worker consolidation (2026-10-13 fix sweep): the canonical worker
// is service-worker.js, registered by supabase-startup.js. This runtime used
// to ALSO register ./offline-sw.js — a second worker for the same scope with
// a competing shell cache. That registration is gone. What remains here is
// cleanup: unregister any legacy registration whose worker script is
// offline-sw.js (registrations pointing at service-worker.js are untouched),
// so existing browsers converge on the canonical worker only.
// The offline status banner is owned by offline-mode.js (single offline UX:
// banner + queue counts + sync panel). This runtime previously painted its
// own fixed bottom pill, which sat on top of the phone bottom navigation and
// ate taps while offline; it was removed in the 2026-10-12 offline polish.
function unregisterLegacyOfflineWorker(){
  if(!('serviceWorker' in navigator)||!navigator.serviceWorker.getRegistrations)return;
  navigator.serviceWorker.getRegistrations().then(function(regs){
    (regs||[]).forEach(function(reg){
      var workers=[reg&&reg.active,reg&&reg.waiting,reg&&reg.installing];
      var legacy=workers.some(function(w){return w&&typeof w.scriptURL==='string'&&w.scriptURL.endsWith('/offline-sw.js');});
      if(legacy&&reg.unregister)reg.unregister().catch(function(){});
    });
  }).catch(function(){});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){unregisterLegacyOfflineWorker();},{once:true});else{unregisterLegacyOfflineWorker();}
window.H38_OFFLINE_RUNTIME=Object.freeze({build:BUILD});
})();
