'use strict';
window.H38_SCOUT_V262_PHONE_VIDEO_REPAIR=true;
(function installV262PhoneVideoRepair(){
  if(window.H38_SCOUT_V262_PHONE_VIDEO_REPAIR_INSTALLED===true)return;
  window.H38_SCOUT_V262_PHONE_VIDEO_REPAIR_INSTALLED=true;

  state.v262=state.v262||{
    storeBootstrapLoading:false,
    storeBootstrapAt:0,
    storeBootstrapStatus:'NOT_RUN',
    storeBootstrapSource:'',
    resolvedLocationSource:''
  };

  function unresolvedZipLabel(label,zip){
    label=txt(label);zip=digits(zip).slice(0,5);
    if(!zip)return false;
    if(!label)return true;
    return label===zip||new RegExp('^ZIP\\s*'+zip+'$','i').test(label)||/^ZIP\b/i.test(label);
  }

  function acceptResolvedLocation(zip,loc,source){
    const lat=Number(loc?.lat),lon=Number(loc?.lon),city=txt(loc?.city||loc?.['place name']),region=txt(loc?.state||loc?.state_code||loc?.['state abbreviation']);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||!city)return false;
    state.location={mode:'zip',lat,lon,zip,label:[city,region,zip].filter(Boolean).join(', ')};
    state.v262.resolvedLocationSource=source;
    rememberLocation();
    renderLocationStrip();
    return true;
  }

  async function directZipFallback(zip){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
    try{
      const r=await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`,{headers:{accept:'application/json'},signal:controller.signal});
      const p=await r.json().catch(()=>({})),place=Array.isArray(p?.places)?p.places[0]:null;
      if(!r.ok||!place)return false;
      return acceptResolvedLocation(zip,{
        lat:place.latitude,
        lon:place.longitude,
        city:place['place name'],
        state:place['state abbreviation']||place.state
      },'DIRECT_ZIP');
    }catch(e){
      error('zipDirectV262',e);
      return false;
    }finally{clearTimeout(timer)}
  }

  async function ensureResolvedPointV262(){
    const zip=digits(state.location?.zip||H38_DEFAULT_ZIP).slice(0,5);
    if(hasPoint()&&!unresolvedZipLabel(state.location?.label,zip))return true;

    try{
      const p=await fn('reseller-location-geocode',{zip},20000);
      if(acceptResolvedLocation(zip,p?.location||{},'EDGE_GEOCODE'))return true;
    }catch(e){error('zipEdgeV262',e)}

    if(await directZipFallback(zip))return true;

    if(zip==='55744'){
      // Last-resort built-in ZIP centroid for the default Scout area.
      // This is only a search origin, never store/price/inventory proof.
      state.location={mode:'zip',lat:47.2372,lon:-93.5302,zip,label:'Grand Rapids, MN, 55744'};
      state.v262.resolvedLocationSource='BUILTIN_ZIP_CENTROID';
      rememberLocation();
      renderLocationStrip();
      return true;
    }

    return hasPoint();
  }

  function mergeStoresV262(rows){
    state.v240=state.v240||{stores:[]};
    const m=new Map();
    for(const s of [...(state.v240.stores||[]),...(Array.isArray(rows)?rows:[])]){
      if(!s)continue;
      const key=txt(s.store_key)||norm(`${s.retailer||s.store_name||''}|${s.store_address||''}|${s.lat||''}|${s.lon||''}`);
      if(key&&!m.has(key))m.set(key,s);
    }
    state.v240.stores=[...m.values()].sort((a,b)=>num(a.distance_miles)-num(b.distance_miles));
    return state.v240.stores;
  }

  async function bootstrapNearbyStoresV262(force=false){
    state.v240=state.v240||{stores:[]};
    if(state.v240.stores.length&&!force)return state.v240.stores;
    if(state.v262.storeBootstrapLoading)return state.v240.stores;

    state.v262.storeBootstrapLoading=true;
    state.v262.storeBootstrapStatus='LOADING';
    try{
      if(!await ensureResolvedPointV262()){
        state.v262.storeBootstrapStatus='LOCATION_UNRESOLVED';
        return state.v240.stores;
      }
      const p=await fn('reseller-nearby-stores-v262',{...locationPayload(),quickRadiusMiles:Math.min(20,state.radius||50)},25000);
      const rows=Array.isArray(p?.stores)?p.stores:[];
      mergeStoresV262(rows);
      state.v262.storeBootstrapAt=Date.now();
      state.v262.storeBootstrapStatus=rows.length?'PASS':txt(p?.status||'NO_STORES');
      state.v262.storeBootstrapSource=txt(p?.provider||p?.source||'central quick scan');
      return state.v240.stores;
    }catch(e){
      state.v262.storeBootstrapStatus='UNAVAILABLE';
      error('nearbyStoresV262',e);
      return state.v240.stores;
    }finally{
      state.v262.storeBootstrapLoading=false;
    }
  }

  function enforcePublicFacebookV262(){
    const b=$('facebookScan');if(!b)return;
    const sec=b.closest('section.card');if(!sec)return;
    b.textContent=state.v261?.facebookLoading?'Searching public Facebook…':'Search public Facebook';
    b.disabled=!!state.v261?.facebookLoading;
    if(typeof window.H38V261RunFacebookPublic==='function')b.onclick=()=>void window.H38V261RunFacebookPublic(true);
    const alerts=$('facebookAlerts');if(alerts)alerts.remove();
    const p=sec.querySelector('p.small');
    if(p)p.textContent='Public-only Marketplace discovery. Scout does not require Facebook login, cookies or notification access for deal discovery.';
    const head=sec.querySelector('.section-head span');
    if(head)head.textContent=`${(state.v240?.facebookRows||[]).length} public · no Facebook login`;
  }

  function decorateLocalHealthV262(){
    const host=document.querySelector('[data-v240-intel]');if(!host)return;
    let x=host.querySelector('[data-v262-local-health]');
    if(!x){x=document.createElement('div');x.dataset.v262LocalHealth='true';host.prepend(x)}
    const stores=state.v240?.stores||[],label=txt(state.location?.label||state.location?.zip||'location unresolved');
    const hd=stores.filter(s=>retailerKey(s.retailer)==='home depot').length;
    const dg=stores.filter(s=>retailerKey(s.retailer)==='dollar general').length;
    x.innerHTML=`<div class="status-line"><span class="dot ${state.v262.storeBootstrapLoading?'loading':stores.length?'live':'warn'}"></span>${state.v262.storeBootstrapLoading?'Resolving ZIP and loading nearby stores…':`${esc(label)} · ${stores.length} nearby store${stores.length===1?'':'s'} loaded · HD ${hd} · DG ${dg}`}</div>`;
  }

  const priorRetail=window.H38V240LoadRetailIntel;
  if(typeof priorRetail==='function'){
    window.H38V240LoadRetailIntel=async function(force=false){
      await ensureResolvedPointV262();
      await bootstrapNearbyStoresV262(!!force);
      // Do not let the slower durable scan erase a successful central bootstrap.
      return priorRetail(false);
    };
  }

  const priorRender=renderDiscover;
  renderDiscover=function(){
    priorRender();
    enforcePublicFacebookV262();
    decorateLocalHealthV262();
  };

  window.H38V262ResolveLocation=ensureResolvedPointV262;
  window.H38V262BootstrapStores=bootstrapNearbyStoresV262;
})();
