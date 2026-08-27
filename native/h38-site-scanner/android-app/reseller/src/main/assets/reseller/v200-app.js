'use strict';
window.H38_SCOUT_V252_FACEBOOK_LOCATION_REPAIR=true;
(function installV252FacebookLocationRepair(){
  const priorOpenFacebookScan=typeof openFacebookScan==='function'?openFacebookScan:null;
  function unresolvedZipLabel(label,zip){
    label=txt(label);zip=digits(zip).slice(0,5);
    if(!zip)return false;
    if(!label)return true;
    if(new RegExp('^ZIP\\s*'+zip+'$','i').test(label)||label===zip)return true;
    const stripped=label.replace(/,\s*\d{5}(?:-\d{4})?\s*$/,'').trim();
    return !stripped||/^ZIP\b/i.test(stripped)||/^Current location$/i.test(stripped);
  }
  async function resolveFacebookZipLabel(){
    const zip=digits(state.location?.zip||'').slice(0,5);
    let label=txt(state.location?.label||'');
    if(!zip||!unresolvedZipLabel(label,zip))return{zip,label,resolved:true};
    const p=await fn('reseller-location-geocode',{zip},20000),loc=p?.location||{},city=txt(loc.city),region=txt(loc.state);
    if(!city||!Number.isFinite(Number(loc.lat))||!Number.isFinite(Number(loc.lon)))return{zip,label,resolved:false};
    state.location={mode:'zip',lat:Number(loc.lat),lon:Number(loc.lon),zip,label:[city,region,zip].filter(Boolean).join(', ')};
    rememberLocation();renderLocationStrip();
    return{zip,label:state.location.label,resolved:true};
  }
  if(priorOpenFacebookScan){
    openFacebookScan=async function(){
      if(state.facebookLocationOpening)return;
      state.facebookLocationOpening=true;
      try{
        if(!requireLocation())return;
        const r=await resolveFacebookZipLabel();
        if(r.zip&&(!r.resolved||unresolvedZipLabel(r.label,r.zip))){notice(`Scout could not resolve ZIP ${r.zip} to a Facebook city. Facebook was not opened with an unverified location.`,'warn');return;}
        return priorOpenFacebookScan();
      }catch(e){error('facebookLocationV252',e);notice('Scout could not verify the Facebook search city. Try the Facebook pass again.','warn')}
      finally{state.facebookLocationOpening=false}
    };
  }
})();

window.H38InstallV263PhysicalBundleAuthority=function H38InstallV263PhysicalBundleAuthority(){
  if(window.H38_SCOUT_V263_PHYSICAL_BUNDLE_AUTHORITY===true)return;
  if(window.H38_SCOUT_V240_DATA_ACQUISITION!==true)return;
  window.H38_SCOUT_V263_PHYSICAL_BUNDLE_AUTHORITY=true;
  // The native owner shell already embeds v240 before v200-app. Mark the two later
  // authorities satisfied here so Android never depends on remote relative script URLs.
  window.H38_SCOUT_V261_FACEBOOK_PUBLIC_INSTALLED=true;
  window.H38_SCOUT_V262_PHONE_VIDEO_REPAIR_INSTALLED=true;
  state.v263=state.v263||{storeLoading:false,storeStatus:'NOT_RUN',locationSource:''};

  function unresolved(label,zip){
    label=txt(label);zip=digits(zip).slice(0,5);
    if(!zip)return false;
    if(!label)return true;
    return label===zip||new RegExp('^ZIP\\s*'+zip+'$','i').test(label)||/^ZIP\b/i.test(label);
  }
  function accept(zip,loc,source){
    const lat=Number(loc?.lat),lon=Number(loc?.lon),city=txt(loc?.city||loc?.['place name']),region=txt(loc?.state||loc?.state_code||loc?.['state abbreviation']);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||!city)return false;
    state.location={mode:'zip',lat,lon,zip,label:[city,region,zip].filter(Boolean).join(', ')};
    state.v263.locationSource=source;rememberLocation();renderLocationStrip();return true;
  }
  async function resolveLocation(){
    const zip=digits(state.location?.zip||H38_DEFAULT_ZIP).slice(0,5);
    if(hasPoint()&&!unresolved(state.location?.label,zip))return true;
    try{const p=await fn('reseller-location-geocode',{zip},18000);if(accept(zip,p?.location||{},'EDGE_GEOCODE'))return true}catch(e){error('zipEdgeV263',e)}
    if(zip==='55744'){
      state.location={mode:'zip',lat:47.2372,lon:-93.5302,zip,label:'Grand Rapids, MN, 55744'};
      state.v263.locationSource='BUILTIN_SEARCH_CENTROID';rememberLocation();renderLocationStrip();return true;
    }
    return hasPoint();
  }
  function mergeStores(rows){
    state.v240=state.v240||{stores:[]};const m=new Map();
    for(const s of [...(state.v240.stores||[]),...(Array.isArray(rows)?rows:[])]){
      if(!s)continue;const k=txt(s.store_key)||norm(`${s.retailer||s.store_name||''}|${s.store_address||''}|${s.lat||''}|${s.lon||''}`);
      if(k&&!m.has(k))m.set(k,s);
    }
    state.v240.stores=[...m.values()].sort((a,b)=>num(a.distance_miles)-num(b.distance_miles));return state.v240.stores;
  }
  async function bootstrapStores(force=false){
    state.v240=state.v240||{stores:[]};if(state.v240.stores.length&&!force)return state.v240.stores;if(state.v263.storeLoading)return state.v240.stores;
    state.v263.storeLoading=true;state.v263.storeStatus='LOADING';
    try{
      if(!await resolveLocation()){state.v263.storeStatus='LOCATION_UNRESOLVED';return state.v240.stores}
      let rows=[];
      try{const p=await fn('reseller-nearby-stores-v262',{...locationPayload(),radiusMiles:state.radius||50,quickRadiusMiles:Math.min(25,state.radius||50)},26000);rows=Array.isArray(p?.stores)?p.stores:[];state.v263.storeStatus=rows.length?'PASS':txt(p?.status||'NO_STORES')}catch(e){error('nearbyStoresV263Fast',e)}
      if(!rows.length){try{const p=await fn('reseller-nearby-stores',{...locationPayload(),force:!!force},42000);rows=Array.isArray(p?.stores)?p.stores:[];state.v263.storeStatus=rows.length?'PASS':'NO_STORES'}catch(e){error('nearbyStoresV263Durable',e)}}
      return mergeStores(rows);
    }finally{state.v263.storeLoading=false}
  }
  function enforcePublicFacebook(){
    const b=$('facebookScan');if(!b)return;const sec=b.closest('section.card');if(!sec)return;
    b.textContent=state.discover?.running?'Searching public Facebook…':'Search public Facebook';b.disabled=!!state.discover?.running;b.onclick=()=>void runDiscover();
    const alerts=$('facebookAlerts');if(alerts)alerts.remove();
    const p=sec.querySelector('p.small');if(p)p.textContent='Public-only Marketplace discovery. Scout does not require Facebook login, cookies or notification access for deal discovery.';
    const head=sec.querySelector('.section-head span');if(head)head.textContent=`${(state.v240?.facebookRows||[]).length} public · no Facebook login`;
  }
  function decorateLocalHealth(){
    const host=document.querySelector('[data-v240-intel]');if(!host)return;let x=host.querySelector('[data-v263-local-health]');if(!x){x=document.createElement('div');x.dataset.v263LocalHealth='true';host.prepend(x)}
    const stores=state.v240?.stores||[],hd=stores.filter(s=>retailerKey(s.retailer)==='home depot').length,dg=stores.filter(s=>retailerKey(s.retailer)==='dollar general').length,label=txt(state.location?.label||state.location?.zip||'location unresolved');
    x.innerHTML=`<div class="status-line"><span class="dot ${state.v263.storeLoading?'loading':stores.length?'live':'warn'}"></span>${state.v263.storeLoading?'Resolving ZIP and loading nearby stores…':`${esc(label)} · ${stores.length} nearby store${stores.length===1?'':'s'} loaded · HD ${hd} · DG ${dg}`}</div>`;
  }

  const priorRetail=window.H38V240LoadRetailIntel;
  if(typeof priorRetail==='function')window.H38V240LoadRetailIntel=async function(force=false){await resolveLocation();await bootstrapStores(!!force);return priorRetail(false)};
  const priorRender=renderDiscover;
  renderDiscover=function(){priorRender();enforcePublicFacebook();decorateLocalHealth()};
  window.H38V263ResolveLocation=resolveLocation;window.H38V263BootstrapStores=bootstrapStores;
};

(function loadProviderAuthorityThenBootstrap(){
  let started=false,authorityLoading=false,repairLoading=false;
  function bootstrapV200(){if(started)return;started=true;
    $('loginForm').onsubmit=async e=>{e.preventDefault();$('loginMessage').innerHTML='<div class="status-line"><span class="dot loading"></span>Signing in…</div>';const f=new FormData(e.currentTarget),email=txt(f.get('email')),password=String(f.get('password')||'');try{const {data,error}=await h38sb.auth.signInWithPassword({email,password});if(error)throw error;await authorize(data.session)}catch(e){$('loginMessage').innerHTML=`<div class="status-line"><span class="dot warn"></span>${esc(e.message||e)}</div>`}};
    $('homeButton').onclick=()=>{if(state.user)setPage('discover')};
    $('accountButton').onclick=()=>show('accountSheet',true);
    $('closeAccount').onclick=()=>show('accountSheet',false);
    $('openMaintenance').onclick=()=>{show('accountSheet',false);state.moreView='maintenance';setPage('more')};
    $('signOutButton').onclick=async()=>{show('accountSheet',false);await h38sb.auth.signOut();state.user=null;showLogin()};
    document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>setPage(b.dataset.page));
    $('locationButton').onclick=openLocationSheet;
    $('closeLocation').onclick=closeLocationSheet;
    $('usePhoneLocation').onclick=requestPhoneLocation;
    $('useZipLocation').onclick=applyZip;
    $('zipInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();applyZip()}};
    $('radiusSelect').onchange=e=>{setRadius(e.target.value);if(state.page==='auctions'&&state.auctions.loaded)void runAuctionSearch()};
    $('sheetRadius').onchange=e=>{setRadius(e.target.value);if(state.page==='auctions'&&state.auctions.loaded)void runAuctionSearch()};
    $('locationSheet').onclick=e=>{if(e.target===$('locationSheet'))closeLocationSheet()};
    $('accountSheet').onclick=e=>{if(e.target===$('accountSheet'))show('accountSheet',false)};
    $('detailSheet').onclick=e=>{if(e.target===$('detailSheet'))show('detailSheet',false)};
    renderLocationStrip();
    h38sb.auth.getSession().then(({data})=>data.session?authorize(data.session):showLogin()).catch(()=>showLogin());
  }
  function loadPhoneRepair(){
    H38InstallV263PhysicalBundleAuthority();
    if(window.H38_SCOUT_V262_PHONE_VIDEO_REPAIR_INSTALLED===true){bootstrapV200();return}
    if(repairLoading)return;
    repairLoading=true;
    const r=document.createElement('script');r.src='v262-phone-video-repair.js';r.async=false;
    r.onload=()=>{repairLoading=false;bootstrapV200()};
    r.onerror=()=>{repairLoading=false;console.warn('v2.6.2 phone repair unavailable; booting public authority shell');bootstrapV200()};
    document.head.appendChild(r);
  }
  function loadPublicAuthority(){
    H38InstallV263PhysicalBundleAuthority();
    if(window.H38_SCOUT_V261_FACEBOOK_PUBLIC_INSTALLED===true){loadPhoneRepair();return}
    if(authorityLoading)return;
    authorityLoading=true;
    const a=document.createElement('script');a.src='v261-facebook-public-runtime.js';a.async=false;
    a.onload=()=>{authorityLoading=false;loadPhoneRepair()};
    a.onerror=()=>{authorityLoading=false;console.warn('Public Facebook authority unavailable; booting accepted core shell');loadPhoneRepair()};
    document.head.appendChild(a);
  }
  if(window.H38_SCOUT_V240_DATA_ACQUISITION===true){H38InstallV263PhysicalBundleAuthority();loadPublicAuthority();return}
  const s=document.createElement('script');s.src='v240-data.js';s.async=false;s.onload=()=>{H38InstallV263PhysicalBundleAuthority();loadPublicAuthority()};s.onerror=()=>{console.warn('Packaged provider layer unavailable; booting accepted core shell');loadPublicAuthority()};document.head.appendChild(s);
  setTimeout(()=>{if(!started&&window.H38_SCOUT_V240_DATA_ACQUISITION!==true)loadPublicAuthority()},5000);
})();
