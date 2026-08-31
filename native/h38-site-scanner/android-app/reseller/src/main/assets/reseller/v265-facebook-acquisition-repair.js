'use strict';
// H38 Reseller Scout v3.0.13 source-quality / phone-polish shim.
// v264 schedules a zero-delay wrapper and v266 installs the V3 owner synchronously.
// Install this repair after both so its repaired Discover and Hunt functions remain final.
window.H38_SCOUT_LEGACY_V265_DISABLED=true;
window.H38_SCOUT_V312_PHYSICAL_REPAIR=true;
window.H38_SCOUT_V313_SOURCE_POLISH=true;
(function scheduleV313Repair(){
  function install(){
    if(window.H38_SCOUT_V313_SOURCE_POLISH_INSTALLED)return;
    if(!window.H38_SCOUT_V300_SINGLE_OWNER_RUNTIME||typeof window.runDiscover!=='function'||typeof window.loadHunt!=='function'){setTimeout(install,250);return;}
    window.H38_SCOUT_V313_SOURCE_POLISH_INSTALLED=true;

    const text=v=>String(v??'').trim();
    const normalize=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
    function decodeText(v){
      let s=String(v??'');
      for(let i=0;i<2;i++){const el=document.createElement('textarea');el.innerHTML=s;s=String(el.value||s)}
      return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\b(?:href|src)\s*=\s*["']?https?:\/\/\S+/gi,' ').replace(/https?:\/\/\S+/gi,' ').replace(/\s+/g,' ').trim();
    }
    function genericDgTitle(v){const s=normalize(decodeText(v));if(!s||s.length<4)return true;return /^(?:permalink|read more|learn more|shop now|click here|details?|view details?|view product|product page|item page|unknown|n a|penny|penny item|penny list|current weekly list|recently pennied|dollar general|dollar general item|dollar general product|dollar general penny item)$/.test(s)}
    function goodDgTitle(v){const s=text(v);return !!s&&!/<\/?a\b|href=|&(?:#\d+|[a-z]+);|https?:\/\/www\.dollargeneral\.com\/p\//i.test(s)&&!genericDgTitle(s)}
    function cleanDgRow(r){
      if(!r||!text(r.retailer).toLowerCase().includes('dollar general'))return r;
      const raw=text(r.title||r.canonical_title||''),candidates=[r.source_identity_title,r.product_name,r.item_name,r.name,r.canonical_title,r.title,r.raw_title].map(decodeText),best=candidates.find(goodDgTitle)||'';
      if(best&&best!==raw)return{...r,raw_title:text(r.raw_title||raw),title:best,canonical_title:best,title_quality:text(r.title_quality||'RESOLVED_CLIENT_EVIDENCE'),name_unresolved:false};
      const dirty=/<\/?a\b|href=|&(?:#\d+|[a-z]+);|https?:\/\/www\.dollargeneral\.com\/p\//i.test(raw),cleaned=dirty?decodeText(raw):raw;
      if(goodDgTitle(cleaned))return cleaned!==raw?{...r,raw_title:text(r.raw_title||raw),title:cleaned,canonical_title:cleaned,title_quality:'RESOLVED_SANITIZED',name_unresolved:false}:r;
      const code=text(r.upc||r.gtin||r.barcode||r.sku).replace(/\D/g,'');
      return{...r,raw_title:text(r.raw_title||raw),title:code?`Product name not resolved · UPC ${code}`:'Product name not resolved',canonical_title:'',title_quality:'UNRESOLVED',name_unresolved:true};
    }

    function queryWords(v){const s=normalize(v),out=s.split(/\s+/).filter(x=>x.length>2),add=(a,b)=>{if(out.includes(a)&&!out.includes(b))out.push(b)};add('fridge','refrigerator');add('refrigerator','fridge');add('freezer','deep freezer');add('tv','television');add('television','tv');add('sofa','couch');add('couch','sofa');return[...new Set(out)]}
    function listingText(r){return normalize(`${r?.title||''} ${r?.text||''} ${r?.description||''} ${r?.category||''} ${r?.subcategory||''}`)}
    function facebookRelevance(r,q){const words=queryWords(q);if(!words.length)return 1;const body=listingText(r);if(!body)return 0;let score=0;for(const w of words)if(body.includes(w))score++;const phrase=normalize(q);if(phrase&&body.includes(phrase))score+=4;return score}
    function sortedFacebookRows(rows,q){return(Array.isArray(rows)?rows.slice():[]).map((r,i)=>({r,i,s:facebookRelevance(r,q)})).sort((a,b)=>b.s-a.s||a.i-b.i).map(x=>x.r)}
    const baseFacebookSnapshotV313=window.facebookSnapshot;
    if(typeof baseFacebookSnapshotV313==='function')window.facebookSnapshot=function(){const s=baseFacebookSnapshotV313(),q=text(state.v300?.facebookTerms?.[0]||state.discover?.query||'');if(!q)return s;return{...s,captured:sortedFacebookRows(s.captured,q),browser:sortedFacebookRows(s.browser,q),unproven:sortedFacebookRows(s.unproven,q),outside:sortedFacebookRows(s.outside,q),rows:sortedFacebookRows(s.rows,q)}};

    function polishFacebookUi(){const sec=document.querySelector('#discoverPage [data-v300-facebook]');if(!sec)return;const q=text(state.v300?.facebookTerms?.[0]||state.discover?.query||''),words=queryWords(q);if(!words.length)return;const snap=typeof window.facebookSnapshot==='function'?window.facebookSnapshot():{captured:[]},captured=Array.isArray(snap.captured)?snap.captured:[],relevant=captured.filter(r=>facebookRelevance(r,q)>0).length;let shown=0;sec.querySelectorAll('.item-card').forEach(card=>{const h=card.querySelector('h3'),match=facebookRelevance({title:h?.textContent||''},q)>0;card.style.display=match?'':'none';if(match)shown++});const head=sec.querySelector('.section-head span');if(head)head.textContent=`${q} · ${relevant} relevant / ${captured.length} captured`;let note=sec.querySelector('.h38-v313-query-note');if(!note){note=document.createElement('div');note.className='h38-v313-query-note small muted';const list=sec.querySelector('.result-list,.facebook-results');(list||sec).insertAdjacentElement('beforebegin',note)}const suppressed=Math.max(0,captured.length-relevant);note.textContent=suppressed?`${relevant} listing${relevant===1?'':'s'} matched the actual listing text for “${q}”. ${suppressed} query-tagged but unrelated public card${suppressed===1?' was':'s were'} excluded from the visible results.`:`${relevant} captured listing${relevant===1?'':'s'} matched “${q}”.`;if(!shown&&relevant>0)note.textContent+=` Relevant cards were captured outside the first visible batch; refresh to re-rank them.`}
    function polishRetailIntel(){for(const block of document.querySelectorAll('#discoverPage [data-v240-intel] .intel-block,#huntPage [data-v240-intel] .intel-block')){const heading=block.querySelector('h3');if(!/Dollar General Remodel Radar/i.test(heading?.textContent||''))continue;block.querySelectorAll('.maintenance-row').forEach(row=>{const h=row.querySelector('strong');if(!h)return;const raw=text(h.textContent),dirty=/href=|https?:|&#\d+;|dollargeneral\.com\/p\//i.test(raw);if(!dirty)return;let cleaned=decodeText(raw);const parts=cleaned.split(/:\s+/).map(text).filter(Boolean);if(parts.length>1)cleaned=parts[parts.length-1];cleaned=cleaned.replace(/\b(?:or|and)\s*$/i,'').trim();const small=text(row.querySelector('small')?.textContent),upc=(small.match(/\bUPC\s+(\d{7,14})/i)||[])[1]||'';h.textContent=cleaned.length>=4&&!/href=|https?:/i.test(cleaned)?cleaned:(upc?`Dollar General remodel indicator · UPC ${upc}`:'Dollar General remodel indicator')})}}

    const priorRunDiscover=window.runDiscover;
    const repairedRunDiscover=async function H38V313RunDiscover(){
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
    const repairedLoadHunt=async function H38V313LoadHunt(force=false){
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
        state.hunt.sourceHealth={status:rows.length?'PASS':'PARTIAL',actionable:rows.length,provider:'reseller-auto-leads-v065',adapterVersion:text(p?.adapter_version||'v065'),dgImageCount:Number(p?.dg_image_count||0),dgDirectImagesRecovered:Number(p?.dg_direct_product_images_recovered||0),dgDirectTitlesRecovered:Number(p?.dg_direct_product_titles_recovered||0),dgUnresolvedTitles:Number(p?.dg_unresolved_title_count||rows.filter(r=>r?.name_unresolved===true).length),warnings:p?.dg_source_warnings||p?.warnings||[]};
        window.H38_SCOUT_V313_LAST_HUNT_PROVIDER='reseller-auto-leads-v065';
        window.H38_SCOUT_V313_LAST_HUNT_AT=Date.now();
        try{if(typeof renderHunt==='function')renderHunt();if(((typeof hasPoint==='function'&&hasPoint())||state.location?.zip)&&typeof ensureNearbyStores==='function')void ensureNearbyStores().then(()=>renderHuntListOnly());if(typeof hydrateHuntImages==='function')void hydrateHuntImages()}catch{}
      }catch(e){
        state.hunt.loading=false;
        window.H38_SCOUT_V313_LAST_HUNT_PROVIDER='v065-fallback';
        return priorLoadHunt.apply(this,arguments);
      }finally{
        state.hunt.loading=false;
        try{if(typeof renderHunt==='function')renderHunt()}catch{}
      }
    };
    window.loadHunt=repairedLoadHunt;

    // Hunt previously only rendered when its bottom-nav tab opened. On a fresh owner
    // session that left the page at "0 shown · 0 loaded" indefinitely because nothing
    // invoked the authoritative v065 feed. Make page entry own the first load.
    const priorSetPageV313=window.setPage;
    if(typeof priorSetPageV313==='function')window.setPage=function(page){
      const result=priorSetPageV313.apply(this,arguments);
      if(page==='hunt'&&!state.hunt?.loaded&&!state.hunt?.loading){
        setTimeout(()=>{if(state.page==='hunt'&&!state.hunt?.loaded&&!state.hunt?.loading&&typeof window.loadHunt==='function')void window.loadHunt(false)},80);
      }
      return result;
    };

    const finalRenderDiscover=window.renderDiscover;
    if(typeof finalRenderDiscover==='function')window.renderDiscover=function(){finalRenderDiscover.apply(this,arguments);polishFacebookUi();polishRetailIntel()};
    const finalRenderHunt=window.renderHunt;
    if(typeof finalRenderHunt==='function')window.renderHunt=function(){finalRenderHunt.apply(this,arguments);polishRetailIntel()};

    window.H38_SCOUT_V313_RUN_DISCOVER=repairedRunDiscover;
    window.H38_SCOUT_V313_LOAD_HUNT=repairedLoadHunt;
    setTimeout(()=>{
      if(window.H38_SCOUT_V313_RUN_DISCOVER)window.runDiscover=window.H38_SCOUT_V313_RUN_DISCOVER;
      if(window.H38_SCOUT_V313_LOAD_HUNT)window.loadHunt=window.H38_SCOUT_V313_LOAD_HUNT;
      try{if(state.page==='discover'&&typeof window.renderDiscover==='function')window.renderDiscover();if(state.page==='hunt'&&typeof window.renderHunt==='function')window.renderHunt()}catch{}
    },1200);
  }
  // Deliberately later than v264's zero-delay wrapper.
  setTimeout(install,700);
})();
