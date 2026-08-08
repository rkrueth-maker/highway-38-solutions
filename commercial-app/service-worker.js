const CACHE_NAME='h38-business-office-20260807-2225';
const FIELD_RECOVERY_BUILD='20260807-2132';
const SUPABASE_CDN='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
const LIVE_FIRST=new Set(['index.html','manifest.webmanifest','runtime-rowid-fix.js','supabase-config.js','supabase-single-client.js','supabase-session-recovery.js','auth-cache-guard.js','supabase-startup.js','supabase-final-startup.js','supabase-quote-ai.js','supabase-quote-ai-auth-fix.js','quote-mobile-stabilization.js','quote-ai-live-fix.js','quote-working-hammer.js','quote-total-lock.js','quote-drift-control.js','quote-render-approval.js','quote-final-acceptance-fix.js','quote-final-phone-fix.js','quote-manual-image-controls.js','quote-print-safe.js','print-safe.css','quote-photo-restore.js','supabase-quote-delivery.js','quote-pdf-send-live-fix.js','quote-delivery-final-fix.js','site-scanner.js','site-scanner.css','site-scanner-mobile-guidance.js','field-visit-core.js','field-visit-ui.js','native-office-launch-guard.js','field-visit.js','field-visit-video.js','field-visit-recovery.js','field-visit-measurement-fix.js','field-visit-photo-review.js','field-visit.css','field-visit-guidance.js','field-visit-guidance.css','auth-autofill.js','auth-autofill.css','supabase-no-legacy-office.js','job-lifecycle.js','job-lifecycle.css','app-15.js']);
const SHELL=[
  './','./index.html','./recover.html','./manifest.webmanifest',
  './styles.css','./ai-drawer.css','./quote-delivery.css','./print-safe.css','./site-scanner.css','./field-visit.css','./field-visit-guidance.css','./auth-autofill.css','./job-lifecycle.css',
  './db.js','./bridge.js','./supabase-config.js','./supabase-single-client.js','./supabase-auth.js','./supabase-invite-activation.js',
  './auth-session-guard.js','./supabase-session-recovery.js','./auth-cache-guard.js','./startup-fix.js','./supabase-startup.js',
  './supabase-runtime-globals.js','./supabase-data.js','./supabase-client-branding.js',
  './supabase-operation-coverage.js','./supabase-ai-fallback.js','./supabase-storage-provider.js',
  './supabase-client-installer.js','./supabase-portal-hydration.js','./supabase-final-startup.js',
  './supabase-client-quote-branding.js','./supabase-quote-ai.js','./supabase-quote-ai-auth-fix.js','./quote-mobile-stabilization.js',
  './quote-ai-live-fix.js','./quote-working-hammer.js','./quote-total-lock.js','./quote-drift-control.js','./quote-render-approval.js','./quote-final-acceptance-fix.js','./quote-final-phone-fix.js','./quote-manual-image-controls.js','./quote-print-safe.js','./quote-photo-restore.js','./supabase-quote-delivery.js','./quote-pdf-send-live-fix.js','./quote-delivery-final-fix.js','./site-scanner.js','./site-scanner-mobile-guidance.js','./field-visit-core.js','./field-visit-ui.js','./native-office-launch-guard.js','./field-visit.js','./field-visit-video.js','./field-visit-recovery.js','./field-visit-measurement-fix.js','./field-visit-photo-review.js','./field-visit-guidance.js','./auth-autofill.js','./supabase-no-legacy-office.js','./job-lifecycle.js',
  './app-01.js','./runtime-rowid-fix.js','./app-02.js','./app-03.js','./app-04.js','./app-05.js',
  './app-06.js','./app-07.js','./app-08.js','./app-09.js','./app-10.js',
  './app-11.js','./app-12.js','./app-13.js','./app-14.js','./app-15.js',
  './app-16.js','./app-17.js','./app-18.js','./app-19.js','./app-20.js',
  '../assets/highway38-logo.png',SUPABASE_CDN
];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('h38-business-office-')&&key!==CACHE_NAME).map(key=>caches.delete(key)));await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;const url=new URL(request.url),sameOrigin=url.origin===self.location.origin,isSupabaseClient=request.url===SUPABASE_CDN;if(!sameOrigin&&!isSupabaseClient)return;
  const file=url.pathname.split('/').pop()||'index.html';
  if(sameOrigin&&(request.mode==='navigate'||LIVE_FIRST.has(file))){event.respondWith((async()=>{try{const response=await fetch(request,{cache:'no-store'}),cache=await caches.open(CACHE_NAME);cache.put(request.mode==='navigate'?'./index.html':request,response.clone()).catch(()=>{});return response;}catch(error){return(await caches.match(request.mode==='navigate'?'./index.html':request,{ignoreSearch:true}))||Response.error();}})());return;}
  event.respondWith((async()=>{const cached=await caches.match(request,{ignoreSearch:true});if(cached)return cached;try{const response=await fetch(request,{cache:'no-store'});if(response&&response.ok){const cache=await caches.open(CACHE_NAME);cache.put(request,response.clone()).catch(()=>{});}return response;}catch(error){return Response.error();}})());
});