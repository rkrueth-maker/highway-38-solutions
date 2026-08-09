/**
 * Browser-safe configuration for the production Business Office.
 *
 * Supabase Auth, Row Level Security, tenant memberships, and the operational
 * record layer are the only supported Office runtime. No legacy Office fallback
 * is exposed or used.
 */
(function h38RepairStaleAuthCache(){
  const build='20260809-1848';
  const marker='h38:auth-cache-repair';
  try{
    if(sessionStorage.getItem(marker)===build)return;
    sessionStorage.setItem(marker,build);
  }catch(_){return;}
  if(!('serviceWorker' in navigator)&&!('caches' in window))return;
  try{document.documentElement.style.visibility='hidden';}catch(_){}
  (async()=>{
    try{
      if('serviceWorker' in navigator){
        const registrations=await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(reg=>reg.unregister().catch(()=>false)));
      }
      if('caches' in window){
        const keys=await caches.keys();
        await Promise.all(keys.filter(key=>key.startsWith('h38-business-office-')).map(key=>caches.delete(key)));
      }
    }catch(_){}
    location.reload();
  })();
})();

window.H38_BUSINESS_OFFICE_SUPABASE = Object.freeze({
  enabled: true,
  stage: 'supabase-production-only',
  standardOffice: true,
  projectRef: 'jqukmwtsgcsaruucnqja',
  url: 'https://jqukmwtsgcsaruucnqja.supabase.co',
  publishableKey: 'sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1',
  authRedirectUrl: 'https://highway38solutions.com/commercial-app/',
  offlineAuthorizationMaxAgeMs: 12 * 60 * 60 * 1000,
  productionPromotionAuthorized: false,
  northernLakesEnabled: false,
  clientTenantsEnabled: true,
  legacyOfficeEnabled: false,
  externalActionsEnabled: false
});
