'use strict';
// H38 Reseller Scout v3.0.12 physical-repair shim.
// This file loads before v266; install after the single V3 owner runtime so it can
// repair two physical boundaries without reviving the retired v2.8 acquisition owner.
window.H38_SCOUT_LEGACY_V265_DISABLED=true;
window.H38_SCOUT_V312_PHYSICAL_REPAIR=true;
(function scheduleV312Repair(){
  function install(){
    if(window.H38_SCOUT_V312_PHYSICAL_REPAIR_INSTALLED)return;
    if(!window.H38_SCOUT_V300_SINGLE_OWNER_RUNTIME||typeof window.runDiscover!=='function'||typeof window.loadHunt!=='function'){setTimeout(install,120);return;}
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

    // Keep an explicit Discover query pinned through every asynchronous source render.
    // Earlier layers could rebuild the page while Facebook/auction/retail requests were
    // finishing and leave the visible search field blank even though the request used it.
    const priorRunDiscover=window.runDiscover;
    window.runDiscover=async function H38V312RunDiscover(){
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
    const discoverHost=document.getElementById('discoverPage');
    if(discoverHost){
      let pinQueued=false;
      new MutationObserver(()=>{
        if(pinQueued)return;pinQueued=true;
        requestAnimationFrame(()=>{pinQueued=false;if(state.page!=='discover')return;const q=text(state.discover?.query||'');const input=document.getElementById('discoverSearch');if(input&&q&&input.value!==q){input.value=q;input.setAttribute('value',q)}if(input&&!input.getAttribute('aria-label'))input.setAttribute('aria-label','Discover search')});
      }).observe(discoverHost,{childList:true,subtree:true});
    }

    // Use the v065 recovery wrapper as the authoritative live Hunt feed. v065 preserves
    // v064 source isolation, then follows exact DollarGeneral.com product URLs already
    // present in source evidence to recover the real published title/photo. It never
    // invents an image and never treats a product page as local penny-price proof.
    const priorLoadHunt=window.loadHunt;
    window.loadHunt=async function H38V312LoadHunt(force=false){
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
        try{if(typeof renderHunt==='function')renderHunt();if((hasPoint?.()||state.location?.zip)&&typeof ensureNearbyStores==='function')void ensureNearbyStores().then(()=>renderHuntListOnly());if(typeof hydrateHuntImages==='function')void hydrateHuntImages()}catch{}
      }catch(e){
        state.hunt.loading=false;
        // Preserve the already-proven v300 fallback path if the new wrapper itself is unavailable.
        return priorLoadHunt.apply(this,arguments);
      }finally{
        state.hunt.loading=false;
        try{if(typeof renderHunt==='function')renderHunt()}catch{}
      }
    };
  }
  setTimeout(install,0);
  setTimeout(install,300);
})();
