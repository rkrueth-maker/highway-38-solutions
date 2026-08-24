'use strict';
window.H38_V059_RUNTIME_ACTIVE=true;
window.H38_V059_RUNTIME_MARKER='maintenance-selftest-feed-hygiene-photo-proof-v059';
(function(){
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const digits=v=>text(v).replace(/\D/g,'');
  const CACHE='h38.resellerScout.imageCache.v057',CURSOR='h38.resellerScout.photoCursor.v057',MIG='h38.resellerScout.cacheProofMigration.v059';
  const TESTKEY='h38.resellerScout.maintenance.v059';
  state.v059Maintenance=state.v059Maintenance||{running:false,tests:[],at:0};

  function artifact(row){
    const t=text(row?.canonical_title||row?.raw_title||row?.title),p=t.replace(/[^a-z0-9]+/gi,' ').replace(/\s+/g,' ').trim();
    if(!t||t.length<7||p.length<3)return true;
    if(/^[\s·•→\-–—★☆⭐]*\d+(?:[.,]\d+)?[\s★☆⭐]*$/u.test(t))return true;
    if(/^other\s+misc(?:\s+(?:no\s+brand|\d+(?:\s+\d+)?))?$/i.test(p))return true;
    if(/^page\s+\d+\s+(?:of|\/|-)\s+\d+$/i.test(p))return true;
    if(/^(?:check|shop|view|open|see|browse|load)\s+(?:amazon|ebay|walmart|target|online|store|stores|price|prices|list|deal|deals|more)$/i.test(p))return true;
    if(/^(?:next|previous|prev|more|details|learn more|buy now|shop now|add to cart|see all|view all|open list)$/i.test(p))return true;
    return /^(?:today|yesterday|\d+\s+(?:minutes?|hours?|days?|weeks?)\s+ago|fd|dg|dt|item|product|unknown|clearance|penny|deal)$/i.test(p)||/(?:deep tool savings|daily deals|weekly deals|current weekly list|surprise penny list)$/i.test(p);
  }
  function code(row){for(const v of [row?.upc,row?.gtin,row?.barcode]){const x=digits(v);if(x.length>=7)return x}const x=digits(row?.sku);return x.length>=10?x:''}
  function sameCode(a,b){const x=digits(a).replace(/^0+/,''),y=digits(b).replace(/^0+/,'');return !!x&&x===y}
  function rowKey(row){const r=norm(row?.retailer)||'unknown',c=code(row);if(c)return `${r}|c:${c.replace(/^0+/,'')}`;const s=norm(row?.sku);if(s)return `${r}|s:${s}|${norm(row?.title||row?.canonical_title)}`;return `${r}|t:${norm(row?.title||row?.canonical_title)}|${text(row?.buy_price)}`}
  function quality(row){let q=0;if(/^https?:\/\//i.test(text(row?.image_url)))q+=6;if(code(row))q+=5;if(text(row?.sku))q+=2;if(text(row?.original_price))q+=2;if(text(row?.posted_date||row?.pennied_at))q+=2;if(text(row?.last_seen))q+=1;q+=Math.min(4,Number(row?.signal_source_count||0)||0);return q}
  function dedupe(rows){
    const out=[],idx=new Map();
    for(const row of Array.isArray(rows)?rows:[]){
      if(artifact(row))continue;
      const k=rowKey(row);if(!k){out.push(row);continue}
      if(!idx.has(k)){idx.set(k,out.length);out.push(row);continue}
      const i=idx.get(k),old=out[i],winner=quality(row)>quality(old)?row:old,loser=winner===row?old:row;
      const a=[...(Array.isArray(winner.signal_sources)?winner.signal_sources:[])],seen=new Set(a.map(x=>text(x?.url||x?.domain||x?.name).toLowerCase()).filter(Boolean));
      for(const s of Array.isArray(loser.signal_sources)?loser.signal_sources:[]){const sk=text(s?.url||s?.domain||s?.name).toLowerCase();if(sk&&!seen.has(sk)){seen.add(sk);a.push(s)}}
      out[i]={...winner,signal_sources:a,signal_source_count:Math.max(Number(winner.signal_source_count||0),Number(loser.signal_source_count||0),a.length),ui_merged_evidence_rows:Number(old?.ui_merged_evidence_rows||1)+1};
    }
    return out;
  }
  function sanitizeImages(rows){let stripped=0;for(const row of rows){const r=norm(row?.retailer);if(r!=='dollar general'&&r!=='dollar tree')continue;const u=text(row?.image_url);if(!u)continue;const c=code(row),m=text(row?.image_match_barcode);if(!c||!sameCode(c,m)){delete row.image_url;delete row.image_source;delete row.image_reference_url;delete row.image_match_barcode;delete row.image_match_model;delete row.image_match_title;stripped++}}return stripped}
  function migrateCache(){if(localStorage.getItem(MIG))return;try{localStorage.removeItem(CACHE);localStorage.removeItem(CURSOR);localStorage.setItem(MIG,new Date().toISOString())}catch(e){}}
  migrateCache();

  const fnBase=fn;
  fn=async function(name,body,timeout){
    const feed=new Set(['reseller-auto-leads','reseller-auto-leads-v038','reseller-auto-leads-v044','reseller-auto-leads-v046','reseller-auto-leads-v049','reseller-auto-leads-v051','reseller-auto-leads-v058']),isFeed=feed.has(name);
    const out=await fnBase(name,body,timeout);
    if(isFeed&&Array.isArray(out?.leads)){
      state.v059RawLeadCount=out.leads.length;
      const rows=dedupe(out.leads.map(x=>({...x}))),stripped=sanitizeImages(rows);
      out.leads=rows;out.count=rows.length;out.v059_artifacts_removed=state.v059RawLeadCount-rows.length;out.v059_unproven_images_removed=stripped;
      diag('feedHygieneV059',{raw:state.v059RawLeadCount,actionable:rows.length,removed:out.v059_artifacts_removed,unproven_images_removed:stripped});
    }
    return out;
  };

  const loadBase=loadClearance;
  loadClearance=async function(force){const x=await loadBase(force);if(Array.isArray(state.leads)){const raw=state.leads.length;state.leads=dedupe(state.leads.map(r=>({...r})));const stripped=sanitizeImages(state.leads);diag('feedStateV059',{raw,actionable:state.leads.length,unproven_images_removed:stripped});if(state.page==='clearance')renderClearance();if(state.page==='stores')renderStores()}return x};

  function addMaintenanceButton(){const p=$('page-more');if(!p||state.subpage||p.querySelector('#openMaintenance'))return;const s=document.createElement('section');s.className='card';s.innerHTML='<div class="workflow-head"><div><h2>Maintenance</h2><div class="muted small">Run Scout against its real runtime, auth, storage, feed, photo-proof, stores, Deals, auctions, Research, and native-bridge boundaries.</div></div><button id="openMaintenance">Self-test</button></div>';p.appendChild(s);$('openMaintenance').onclick=renderMaintenance}
  const renderMoreBase=renderMore;
  renderMore=function(){renderMoreBase();setTimeout(addMaintenanceButton,0)};

  function badge(status){return status==='pass'?'good':status==='fail'?'bad':status==='warn'?'warn':'verified'}
  function renderMaintenance(){
    state.subpage='maintenance';const p=$('page-more'),m=state.v059Maintenance,tests=m.tests||[];
    p.innerHTML=`<section class="card"><div class="workflow-head"><div><h2>Maintenance / Self-Test</h2><div class="muted small">This path tests the same production services Scout uses. Missing information stays unknown; the test never invents inventory, price, photo, or resale evidence.</div></div><button id="maintBack" class="secondary">More</button></div><div class="actions"><button id="maintRun" ${m.running?'disabled':''}>${m.running?'Running…':'Run full self-test'}</button><button id="maintReload" class="secondary">Reload Scout</button></div>${m.at?`<div class="small muted" style="margin-top:7px">Last run ${esc(new Date(m.at).toLocaleString())}</div>`:''}<div id="maintRows" style="margin-top:10px">${tests.length?tests.map(t=>`<div class="diag-row"><strong>${esc(t.name)} <span class="badge ${badge(t.status)}">${esc(t.status.toUpperCase())}</span></strong><div class="small muted">${esc(t.detail||'')}</div></div>`).join(''):'<div class="empty">Self-test has not run yet.</div>'}</div></section>`;
    $('maintBack').onclick=()=>{state.subpage=null;renderMore()};$('maintRun').onclick=runMaintenance;$('maintReload').onclick=()=>{const b=bridge();if(b?.reloadScout)b.reloadScout();else location.reload()};
  }
  function push(name,status,detail){state.v059Maintenance.tests.push({name,status,detail});state.v059Maintenance.at=Date.now();renderMaintenance()}
  function pointBody(){return typeof locationBody==='function'?locationBody():{lat:Number(state.location?.lat),lon:Number(state.location?.lon),radiusMiles:radius(),postal:state.location?.zip||''}}
  async function runMaintenance(){
    if(state.v059Maintenance.running)return;
    state.v059Maintenance={running:true,tests:[],at:Date.now()};renderMaintenance();
    try{
      const markers=['H38_V049_RUNTIME_ACTIVE','H38_V051_RUNTIME_ACTIVE','H38_V053_RUNTIME_ACTIVE','H38_V056_RUNTIME_ACTIVE','H38_V058_RUNTIME_ACTIVE','H38_V059_RUNTIME_ACTIVE'],missing=markers.filter(k=>window[k]!==true);
      push('Runtime chain',missing.length?'fail':'pass',missing.length?`Missing ${missing.join(', ')}`:'v049 → v051 → v053 → v056 → v058 → v059 active.');

      const b=bridge();push('Native bridge',b&&typeof b.build==='function'&&typeof b.takePhoto==='function'&&typeof b.scanBarcode==='function'?'pass':'fail',b?.build?.()||'Native bridge unavailable.');
      try{localStorage.setItem(TESTKEY,'ok');const ok=localStorage.getItem(TESTKEY)==='ok';localStorage.removeItem(TESTKEY);push('Local persistence',ok?'pass':'fail',ok?'Read/write/delete passed.':'Storage round-trip failed.')}catch(e){push('Local persistence','fail',text(e?.message||e))}
      try{const {data,error}=await sb.auth.getSession();push('Authentication',!error&&data?.session?.access_token?'pass':'fail',error?.message||(!data?.session?'No active session.':'Signed-in session available.'))}catch(e){push('Authentication','fail',text(e?.message||e))}
      push('Location',hasPoint()||state.location?.zip?'pass':'warn',hasPoint()?`${Number(state.location.lat).toFixed(4)}, ${Number(state.location.lon).toFixed(4)} · ${radius()} mi`:state.location?.zip?`ZIP ${state.location.zip} · ${radius()} mi`:'Not set; location-dependent probes are skipped and labeled WARN.');

      try{
        const p=await fn('reseller-auto-leads-v058',{...pointBody()},65000),rows=Array.isArray(p?.leads)?p.leads:[],bad=rows.filter(artifact),dup=rows.length-new Set(rows.map(rowKey)).size,unproven=rows.filter(r=>{const k=norm(r?.retailer);return(k==='dollar general'||k==='dollar tree')&&r?.image_url&&!sameCode(code(r),r?.image_match_barcode)}),ok=rows.length>0&&!bad.length&&!dup&&!unproven.length;
        push('Penny / clearance feed',ok?'pass':'fail',`${rows.length} actionable · ${bad.length} navigation/action artifacts · ${dup} duplicate identities · ${unproven.length} DG/DT photos without exact barcode proof.`);
        const health=p?.visual_source_health||{},unavailable=Object.entries(health).filter(([,v])=>v?.status!=='available').map(([k])=>k);
        push('Photo providers',unavailable.length?'warn':'pass',Object.keys(health).length?Object.entries(health).map(([k,v])=>`${k}: ${v?.status||'unknown'} (${Number(v?.indexed||0)} indexed)`).join(' · '):'No provider-health payload returned.');
      }catch(e){push('Penny / clearance feed','fail',text(e?.message||e));push('Photo providers','warn','Feed probe did not complete, so provider health could not be confirmed.')}

      try{
        if(hasPoint()){
          const p=await fn('reseller-nearby-stores',{lat:Number(state.location.lat),lon:Number(state.location.lon),radiusMiles:radius()},45000),rows=Array.isArray(p?.stores)?p.stores:null,invalid=(rows||[]).filter(s=>typeof validStore==='function'&&!validStore(s));
          if(!rows)push('Retailer store discovery','fail','Store endpoint did not return a stores array.');
          else push('Retailer store discovery',invalid.length?'fail':rows.length?'pass':'warn',`${rows.length} nearby retailer locations · ${invalid.length} invalid/blocked store rows${p?.stale?' · last-good cache used':''}.`);
        }else push('Retailer store discovery','warn','Phone coordinates not set; normal retailer-store probe skipped.');
      }catch(e){push('Retailer store discovery','fail',text(e?.message||e))}

      try{
        if(hasPoint()||state.location?.zip){
          const p=await fn('reseller-opportunity-scan-v4',{sources:['Craigslist'],terms:['Milwaukee'],facebookCandidates:[],...pointBody()},60000),sum=p?.source_summary||{},s=sum.Craigslist||{},responded=Array.isArray(p?.opportunities)&&typeof p?.source_summary==='object';
          push('Deals opportunity engine',!responded?'fail':p?.status==='PASS'?'pass':'warn',`${Number(s.attempts||0)} source attempts · ${Number(s.search_hits||0)} listings found · ${Number(s.detail_verified||0)} detail checked · ${Number(s.comp_verified||0)} sold-comp verified · ${Number(s.qualified||0)} profit-supported · ${Number(s.failed||0)} source errors.`);
        }else push('Deals opportunity engine','warn','Location not set; Deals source probe skipped.');
      }catch(e){push('Deals opportunity engine','fail',text(e?.message||e))}

      try{
        if(hasPoint()||state.location?.zip){const p=await fn('reseller-nearby-sources',{...pointBody()},45000),rows=Array.isArray(p?.sources)?p.sources:Array.isArray(p?.stores)?p.stores:null;if(!rows)push('Resale source discovery','fail','Source endpoint returned no sources array.');else push('Resale source discovery',rows.length?'pass':'warn',`${rows.length} sourcing destinations returned; missing phone/web/address remains allowed when the source does not publish it.`)}
        else push('Resale source discovery','warn','Location not set; source probe skipped.');
      }catch(e){push('Resale source discovery','fail',text(e?.message||e))}

      try{
        if(hasPoint()||state.location?.zip){const p=await fn('reseller-auction-discovery',{...pointBody(),filter:'near'},45000),s=p?.summary||{},rows=Array.isArray(p?.auctions)?p.auctions:null;if(!rows)push('Auction discovery','fail','Auction endpoint returned no auctions array.');else push('Auction discovery',p?.status==='PASS'?'pass':'warn',`${Number(s.discovered||0)} discovered · ${Number(s.within_radius||0)} within radius · ${Number(s.shown||0)} shown · ${Number(s.failures||0)} source errors.`)}
        else push('Auction discovery','warn','Location not set; auction probe skipped.');
      }catch(e){push('Auction discovery','fail',text(e?.message||e))}

      try{const p=await fn('reseller-item-research-v047',{mode:'identify',hint:'H38 maintenance probe item'},45000);push('Research identify stage',p?.stage==='identify'&&p?.identification?'pass':'warn',p?.warning||p?.market?.message||'Identify endpoint responded.')}catch(e){push('Research identify stage','fail',text(e?.message||e))}

      const failed=state.v059Maintenance.tests.filter(t=>t.status==='fail').length,warned=state.v059Maintenance.tests.filter(t=>t.status==='warn').length;
      push('Overall',failed?'fail':warned?'warn':'pass',failed?`${failed} required checks failed.`:warned?`Required checks passed; ${warned} conditional/source checks need attention.`:'All required maintenance checks passed.');
    }finally{state.v059Maintenance.running=false;state.v059Maintenance.at=Date.now();renderMaintenance();diag('maintenanceV059',{at:state.v059Maintenance.at,tests:state.v059Maintenance.tests})}
  }

  const renderDiagBase=renderDiagnostics;
  renderDiagnostics=function(){renderDiagBase();const p=$('page-more');if(!p)return;const sec=document.createElement('section');sec.className='card';sec.innerHTML='<div class="workflow-head"><div><h3>Maintenance path</h3><div class="small muted">Run live production checks before physical acceptance.</div></div><button id="diagMaintenance">Run self-test</button></div>';p.appendChild(sec);$('diagMaintenance').onclick=renderMaintenance};

  if(state.page==='more'&&!state.subpage)setTimeout(addMaintenanceButton,0);
})();
