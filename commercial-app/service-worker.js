const CACHE_NAME='h38-business-office-20260805-0520';
const SHELL=[
  './','./index.html','./recover.html','./manifest.webmanifest',
  './styles.css','./ai-drawer.css','./quote-delivery.css',
  './db.js','./bridge.js','./supabase-config.js','./supabase-auth.js',
  './auth-session-guard.js','./auth-cache-guard.js','./startup-fix.js','./supabase-startup.js',
  './supabase-runtime-globals.js','./supabase-data.js',
  './app-01.js','./app-02.js','./app-03.js','./app-04.js','./app-05.js',
  './app-06.js','./app-07.js','./app-08.js','./app-09.js','./app-10.js',
  './app-11.js','./app-12.js','./app-13.js','./app-14.js','./app-15.js',
  './app-16.js','./app-17.js','./app-18.js','./app-19.js','./app-20.js',
  '../assets/highway38-logo.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('h38-business-office-')&&key!==CACHE_NAME).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request,{cache:'no-store'});
        const cache=await caches.open(CACHE_NAME);
        cache.put('./index.html',response.clone()).catch(()=>{});
        return response;
      }catch(error){
        return (await caches.match('./index.html',{ignoreSearch:true}))||Response.error();
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(request,{ignoreSearch:true});
    if(cached)return cached;
    try{
      const response=await fetch(request,{cache:'no-store'});
      if(response&&response.ok){
        const cache=await caches.open(CACHE_NAME);
        cache.put(request,response.clone()).catch(()=>{});
      }
      return response;
    }catch(error){
      return Response.error();
    }
  })());
});
