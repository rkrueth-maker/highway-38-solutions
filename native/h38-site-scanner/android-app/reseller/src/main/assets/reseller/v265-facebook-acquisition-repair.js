'use strict';
// H38 Reseller Scout v3.0.12 physical-repair shim.
// v264 schedules a zero-delay wrapper and v266 installs the V3 owner synchronously.
// Install this repair after both so its repaired Discover and Hunt functions remain final.
window.H38_SCOUT_LEGACY_V265_DISABLED=true;
window.H38_SCOUT_V312_PHYSICAL_REPAIR=true;
(function scheduleV312Repair(){
  function install(){
    if(window.H38_SCOUT_V312_PHYSICAL_REPAIR_INSTALLED)return;
    if(!window.H38_SCOUT_V300_SINGLE_OWNER_RUNTIME||typeof window.runDiscover!=='function'||typeof window.loadHunt!=='function'){setTimeout(install,250);return;}
    window.H38_SCOUT_V312_PHYSICAL_REPAIR_INSTALLED=true;

    const text=v=>String(v??'').trim();
    function decodeText(v){
      const el=document.createElement('textarea');el.innerHTML=String(v??'');
      return String(el.value||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/https?:\/\/\S+/gi,' ').replace(/\s+/g,' ').trim();
    }
    function cleanDgRow(r){
      if(!r||!text(r.retailer).toLowerCase().includes('dollar general'))return r;
      const raw=text(r.title||r.canonical_title||'');
      const dirty=/<\/?a\b|href=|&(?:#\d+|[a-z]+);|https?:\/\/www\.dollargeneral\.com\/p\//i.test(raw);
      if(!dirty)return r;
      const cleaned=decodeText(raw);
      return cleaned&&cleaned!==raw?{...r,raw_title:text(r.raw_title||raw),title:cleaned,canonical_title:cleaned}:r;
    }

    const priorRunDiscover=window.runDiscover;
    const repairedRunDiscover=async function H38V312RunDiscover(){
      const field=document.getElementById('discoverSearch');
      const typed=text(field?.value??state.discover?.query??'');
      state.discover=state.discover||{};
      state.discover.query=typed;
      try{if(typeof write==='function'&&window.H38_KEYS?.discover)write(H38_KEYS.discover,typed)}catch{}
      if(state.page!=='discover'&&typeof setPage==='function')setPage('discover');
      try{return await priorRunDiscover.apply(this,arguments)}finally{
        state.discover.query=typed;
        if(state.page!=='discover'&&typeof setPage==='function')setPage('discover');
        try{if(typeof renderDiscover==='function')renderDiscover()}catch{}
        const current=document.getElementById('discoverSearch');
        if(current){current.value=typed;current.setAttribute('value',typed);current.setAttribute('aria-label','Discover search');}
      }
    };
    window.runDiscover=repairedRunDiscover;

    const discoverHost=document.getElementById('discoverPage');
    if(discoverHost){
      let pinQueued=false;
      new MutationObserver(()=>{
        if(pinQueued)return;pinQueued=true;
        requestAnimationFrame(()=>{pinQueued=false;if(state.page!=='discover')return;const q=text(state.discover?.query||'');const input=document.getElementById('discoverSearch');if(input&&q&&input.value!==q){input.value=q;input.setAttribute('value',q)}if(input&&!input.getAttribute('aria-label'))input.setAttribute('aria-label','Discover search')});
      }).observe(discoverHost,{childList:true,subtree:true});
    }

    const priorLoadHunt=window.loadHunt;
    const repairedLoadHunt=async function H38V312LoadHunt(force=false){
      if(state.hunt?.loading)return;
      state.hunt=state.hunt||{};
      state.hunt.loading=true;
      try{if(typeof renderHunt==='function')renderHunt()}catch{}
      const prior=Array.isArray(state.hunt.rows)?state.hunt.rows.slice():[];
      try{
        const p=await fn('reseller-auto-leads-v065',{...locationPayload(),force:!!force},90000);
        let rows=Array.isArray(p?.leads)?p.leads.map(cleanDgRow):[];
        try{rows=cleanRows(rows).filter(r=>!huntArtifact(r))}catch{}
        if(!rows.length&&prior.length)rows=prior.map(cleanDgRow);
        state.hunt.raw=Number(p?.raw_count)||(Array.isArray(p?.leads)?p.leads.length:0);
        state.hunt.rows=rows;
        state.hunt.loaded=true;
        state.hunt.sourceHealth={status:rows.length?'PASS':'PARTIAL',actionable:rows.length,provider:'reseller-auto-leads-v065',adapterVersion:text(p?.adapter_version||'v065'),dgImageCount:Number(p?.dg_image_count||0),dgDirectImagesRecovered:Number(p?.dg_direct_product_images_recovered||0),dgDirectTitlesRecovered:Number(p?.dg_direct_product_titles_recovered||0),warnings:p?.dg_source_warnings||p?.warnings||[]};
        window.H38_SCOUT_V312_LAST_HUNT_PROVIDER='reseller-auto-leads-v065';
        window.H38_SCOUT_V312_LAST_HUNT_AT=Date.now();
        try{if(typeof renderHunt==='function')renderHunt();if(((typeof hasPoint==='function'&&hasPoint())||state.location?.zip)&&typeof ensureNearbyStores==='function')void ensureNearbyStores().then(()=>renderHuntListOnly());if(typeof hydrateHuntImages==='function')void hydrateHuntImages()}catch{}
      }catch(e){
        state.hunt.loading=false;
        window.H38_SCOUT_V312_LAST_HUNT_PROVIDER='v065-fallback';
        return priorLoadHunt.apply(this,arguments);
      }finally{
        state.hunt.loading=false;
        try{if(typeof renderHunt==='function')renderHunt()}catch{}
      }
    };
    window.loadHunt=repairedLoadHunt;

    // Expose ownership markers to device diagnostics and reassert once after startup.
    window.H38_SCOUT_V312_RUN_DISCOVER=repairedRunDiscover;
    window.H38_SCOUT_V312_LOAD_HUNT=repairedLoadHunt;
    setTimeout(()=>{
      if(window.H38_SCOUT_V312_RUN_DISCOVER)window.runDiscover=window.H38_SCOUT_V312_RUN_DISCOVER;
      if(window.H38_SCOUT_V312_LOAD_HUNT)window.loadHunt=window.H38_SCOUT_V312_LOAD_HUNT;
    },1200);
  }
  // Deliberately later than v264's zero-delay wrapper.
  setTimeout(install,700);
})();
