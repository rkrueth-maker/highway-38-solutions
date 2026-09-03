'use strict';
window.H38_SCOUT_V240_DATA_ACQUISITION=true;
(function(){
  state.v240=state.v240||{intelLoading:false,intelLoaded:false,stores:[],hd:null,dg:null,facebook:null,facebookRows:[]};
  const baseFacebookSnapshotV240=facebookSnapshot;
  facebookSnapshot=function(){const base=baseFacebookSnapshotV240(),m=new Map();for(const r of [...(state.v240.facebookRows||[]),...(base.rows||[])]){const k=txt(r?.url||r?.id||`${r?.title||''}|${r?.price||''}`);if(k&&!m.has(k))m.set(k,r)}return{...base,rows:[...m.values()].slice(0,220),publicRows:(state.v240.facebookRows||[]).length}}
  function evidenceBadge(level){const x=txt(level).toUpperCase();if(x==='LIVE VERIFIED')return'<span class="badge good">LIVE VERIFIED</span>';if(x.includes('LIVE'))return'<span class="badge info">LIVE PARTIAL</span>';if(x.includes('COMMUNITY'))return'<span class="badge warn">COMMUNITY SIGNAL</span>';if(x.includes('CONFIG'))return'<span class="badge">PROVIDER SETUP</span>';return`<span class="badge">${esc(x||'UNKNOWN')}</span>`}
  function hdIntelHtml(){const p=state.v240.hd;if(!p)return'<div class="small muted">Home Depot local checks have not run yet.</div>';const rows=Array.isArray(p.readings)?p.readings:[],pennies=rows.flatMap(r=>Array.isArray(r.store_readings)?r.store_readings:[]).filter(x=>x.penny_signal===true).length;return`<div class="intel-block"><div class="section-head"><h3>Home Depot Local Penny Engine</h3><span>${esc(p.provider_status||p.status||'')}</span></div><div class="meta"><span>${rows.length} candidate${rows.length===1?'':'s'} checked</span><span>${num(p.verified_count)} exact-store verified</span>${pennies?`<span>${pennies} store penny signal${pennies===1?'':'s'}</span>`:''}</div>${rows.slice(0,4).map(r=>`<div class="maintenance-row"><div><strong>${esc(r.title||r.canonical_title||r.sku||'Home Depot candidate')}</strong><small>${r.zip_price!=null?`ZIP price ${dollars(r.zip_price)} · `:''}${Array.isArray(r.store_inventory)?`${r.store_inventory.length} store inventory reading${r.store_inventory.length===1?'':'s'} · `:''}physical register remains final penny truth</small></div>${evidenceBadge(r.evidence_level)}</div>`).join('')}${p.provider_status==='CONFIG_REQUIRED'?'<div class="small muted">Store-data provider is not configured yet; Scout preserved the community penny leads without inventing local price or stock.</div>':''}</div>`}
  function dgIntelHtml(){const p=state.v240.dg;if(!p)return'<div class="small muted">Dollar General remodel radar has not run yet.</div>';const stores=Array.isArray(p.stores)?p.stores:[],community=Array.isArray(p.community_candidates)?p.community_candidates:[];return`<div class="intel-block"><div class="section-head"><h3>Dollar General Remodel Radar</h3><span>${esc(p.provider_status||p.status||'')}</span></div><div class="meta"><span>${num(p.indicator_count)} current indicator UPCs</span><span>${community.length} MN community signal${community.length===1?'':'s'}</span></div>${stores.slice(0,5).map(s=>`<div class="maintenance-row"><div><strong>${esc(s.name||[s.city,s.state].filter(Boolean).join(', ')||`DG ${s.store_id||''}`)}</strong><small>${num(s.score)}/100 · ${num(s.indicator_hits)} deep indicator hit${num(s.indicator_hits)===1?'':'s'}${s.cold_case_signal?' · cooler/freezer signal':''}</small></div><span class="badge ${num(s.score)>=60?'good':num(s.score)>=35?'warn':'info'}">${esc(s.label||'RADAR')}</span></div>`).join('')}${!stores.length?`<div class="small muted">${p.provider_status==='CONFIG_REQUIRED'?'Store-specific DG price provider is not configured; current indicator/community intelligence is still loaded.':'No store-specific remodel cluster was proven in this pass.'}</div>`:''}</div>`}
  function intelSection(){return`<section class="card" data-v240-intel><div class="section-head"><h2>Local Retail Intelligence</h2><button id="v240IntelRefresh" class="mini-btn">Refresh</button></div><p class="small muted">Store-specific evidence is kept separate from community leads. Weak evidence never becomes a fake penny or remodel confirmation.</p>${state.v240.intelLoading?'<div class="status-line"><span class="dot loading"></span>Checking Home Depot and Dollar General signals…</div>':''}${hdIntelHtml()}${dgIntelHtml()}</section>`}
  async function loadStoresV240(force=false){if(state.v240.stores.length&&!force)return state.v240.stores;try{const p=await fn('reseller-nearby-stores',{...locationPayload(),force},50000);state.v240.stores=Array.isArray(p.stores)?p.stores:[]}catch(e){error('v240Stores',e);state.v240.stores=[]}return state.v240.stores}
  window.H38V240LoadRetailIntel=async function(force=false){if(state.v240.intelLoading)return;state.v240.intelLoading=true;if(state.page==='discover')renderDiscover();if(state.page==='hunt')renderHunt();try{await ensureDefaultLocation();const stores=await loadStoresV240(force),hd=(state.hunt.rows||[]).filter(r=>retailerKey(r.retailer)==='home depot').slice(0,3),dgStores=stores.filter(s=>retailerKey(s.retailer)==='dollar general'),hdStores=stores.filter(s=>retailerKey(s.retailer)==='home depot'),loc={...locationPayload(),location_label:state.location.label||'',force};const [a,b]=await Promise.allSettled([fn('reseller-home-depot-local-v240',{...loc,candidates:hd,nearby_stores:hdStores,deep_verify:true},70000),fn('reseller-dg-remodel-radar-v240',{...loc,nearby_stores:dgStores},80000)]);state.v240.hd=a.status==='fulfilled'?a.value:{status:'PARTIAL',provider_status:'UNAVAILABLE',readings:[],provider_detail:txt(a.reason?.message||a.reason)};state.v240.dg=b.status==='fulfilled'?b.value:{status:'PARTIAL',provider_status:'UNAVAILABLE',stores:[],provider_detail:txt(b.reason?.message||b.reason)};state.v240.intelLoaded=true}finally{state.v240.intelLoading=false;if(state.page==='discover')renderDiscover();if(state.page==='hunt')renderHunt()}}
  async function loadFacebookPublicV240(terms){try{const p=await fn('reseller-facebook-public-v240',{...locationPayload(),location_label:state.location.label||'',terms,max_results:120},75000);state.v240.facebook=p;state.v240.facebookRows=Array.isArray(p.results)?p.results:[];if(window.H38V230CacheRows&&state.v240.facebookRows.length)void H38V230CacheRows(state.v240.facebookRows);return p}catch(e){state.v240.facebook={status:'PARTIAL',provider_status:'UNAVAILABLE',results:[],warning:error('facebookPublicV240',e)};state.v240.facebookRows=[];return state.v240.facebook}}
  const baseRenderDiscoverV240=renderDiscover;
  renderDiscover=function(){baseRenderDiscoverV240();const fb=$('facebookScan');if(fb){fb.textContent='Open Facebook fallback';const section=fb.closest('section.card'),p=section?.querySelector('p.small');if(p)p.textContent='Scout searches public Marketplace data from the backend first. This signed-in Facebook browser is only a fallback for restricted listings or seller contact.';if(section&&!section.querySelector('[data-v240-fb]')){const x=document.createElement('div');x.dataset.v240Fb='true';const f=state.v240.facebook,rows=state.v240.facebookRows||[];x.innerHTML=`<div class="status-line" style="margin-top:10px"><span class="dot ${rows.length?'live':f?.provider_status==='AUTH_GATED'?'warn':''}"></span>${f?`Backend Marketplace: ${esc(f.provider_status||f.status||'PARTIAL')} · ${rows.length} public listing${rows.length===1?'':'s'} · Facebook login ${f.authentication==='NO_FACEBOOK_LOGIN'?'not used':'not required for public pass'}`:'Backend Marketplace runs automatically with Discover.'}</div>`;section.appendChild(x)}}if(!$('discoverPage')?.querySelector('[data-v240-intel]')){const host=$('discoverPage');if(host){const wrap=document.createElement('div');wrap.innerHTML=intelSection();const node=wrap.firstElementChild,fbSection=fb?.closest('section.card');if(fbSection&&node)fbSection.insertAdjacentElement('afterend',node);else if(node)host.prepend(node);const b=$('v240IntelRefresh');if(b)b.onclick=()=>H38V240LoadRetailIntel(true)}}if(state.user&&!state.v240.intelLoaded&&!state.v240.intelLoading)setTimeout(()=>H38V240LoadRetailIntel(false),0)}
  const baseRenderHuntV240=renderHunt;
  renderHunt=function(){baseRenderHuntV240();const p=$('huntPage');if(p&&!p.querySelector('[data-v240-intel]')){const x=document.createElement('section');x.className='card';x.dataset.v240Intel='true';x.innerHTML=`<div class="section-head"><h2>Store Intelligence</h2><button id="v240HuntRefresh" class="mini-btn">Refresh</button></div>${hdIntelHtml()}${dgIntelHtml()}`;p.appendChild(x);const b=$('v240HuntRefresh');if(b)b.onclick=()=>H38V240LoadRetailIntel(true)}}
  const baseRunDiscoverV240=runDiscover;
  runDiscover=async function(){if(state.discover.running)return;if(!requireLocation())return;const terms=profitTerms(),publicPromise=loadFacebookPublicV240(terms.slice(0,4)),basePromise=baseRunDiscoverV240();await Promise.allSettled([basePromise,publicPromise]);if(state.v240.facebookRows.length){try{const p=await fn('reseller-opportunity-scan-v060',{sources:['Facebook Marketplace'],terms:terms.slice(0,4),facebookCandidates:state.v240.facebookRows,...locationPayload()},70000);state.discover.deals=mergeDealPayload([state.discover.deals||{},p],terms);if(window.H38V230CacheRows)void H38V230CacheRows([...(p.opportunities||[]),...(p.candidates||[])])}catch(e){error('v240FacebookRank',e)}}await H38V240LoadRetailIntel(false);renderDiscover()}
})();

window.H38_SCOUT_V250_PROVIDER_HARDENING=true;
(function(){
  state.v250=state.v250||{deviceLoading:false,deviceRuns:0,hdChecks:[],dgChecks:[],lastDeviceAt:0};
  const pending=new Map();
  const previousDeviceResult=window.H38DeviceStockResult;
  window.H38DeviceStockResult=function(id,json){
    const p=pending.get(String(id||''));
    if(p){pending.delete(String(id));let row={};try{row=typeof json==='string'?JSON.parse(json):json||{}}catch(e){row={status:'device_unavailable',availability_label:String(e)}}p.resolve(row);return}
    if(typeof previousDeviceResult==='function')return previousDeviceResult(id,json);
  };
  function nativeDeviceReady(){return !!(window.AndroidH38Reseller&&typeof AndroidH38Reseller.startDeviceStockCheck==='function')}
  function deviceCheck(body,timeout=33000){return new Promise(resolve=>{if(!nativeDeviceReady()){resolve({status:'device_unavailable',store_bound:false,availability_label:'Native retailer verifier unavailable.'});return}const id='v250-'+Date.now()+'-'+Math.random().toString(36).slice(2),timer=setTimeout(()=>{if(pending.has(id)){pending.delete(id);resolve({status:'device_unavailable',store_bound:false,availability_label:'Device retailer check timed out.'})}},timeout);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)}});try{AndroidH38Reseller.startDeviceStockCheck(id,JSON.stringify({...body,auto_store_setup:true}))}catch(e){clearTimeout(timer);pending.delete(id);resolve({status:'device_unavailable',store_bound:false,availability_label:String(e)})}})}
  function nearest(retailer,limit=2){return(state.v240.stores||[]).filter(s=>retailerKey(s.retailer)===retailer).sort((a,b)=>num(a.distance_miles)-num(b.distance_miles)).slice(0,limit)}
  function hdStoreId(s){const z=(txt(s.store_address).match(/\b\d{5}\b/)||[])[0]||'';if(z==='55744')return'2834';if(z==='56601')return'2830';if(z==='56425')return'2818';if(z==='55811')return'2817';return''}
  function communityNear(store,rows){const a=norm(`${store.store_address||''} ${store.store_name||''}`);return(rows||[]).some(x=>{const z=txt(x.postal||'');const c=norm(x.city||x.label||'');return(z&&a.includes(z))||(c&&a.includes(c))})}
  function scoreDgDevice(store,probes,community,all){let score=community?30:0,deep=0,moderate=0,cold=false;for(const p of probes){let r=Number(p.markdown_ratio);if(!Number.isFinite(r)&&p.current_price!=null){const peers=all.filter(x=>x.upc===p.upc&&x.store_key!==store.store_key&&x.store_bound&&Number(x.current_price)>0).map(x=>Number(x.current_price));const ref=peers.length?Math.max(...peers):0;if(ref>0)r=Number(p.current_price)/ref}if(Number.isFinite(r)&&r<=.55){score+=18;deep++}else if(Number.isFinite(r)&&r<=.75){score+=8;moderate++}if(/pot pie|frozen|freezer|refriger/i.test(txt(p.name))&&Number.isFinite(r)&&r<=.6){score+=18;cold=true}}if(deep>=3)score+=18;else if(deep>=2)score+=10;if(probes.length>=3)score+=5;score=Math.min(100,score);let label='NO REMODEL SIGNAL';if(score>=80)label='PENNY WINDOW CANDIDATE';else if(score>=60)label='REMODEL LIKELY';else if(score>=35)label='REMODEL POSSIBLE';else if(community)label='COMMUNITY SIGNAL';return{...store,score,label,indicator_hits:deep,moderate_hits:moderate,cold_case_signal:cold,community_signal:community,evidence_level:deep>=2?'LIVE PARTIAL':community?'COMMUNITY SIGNAL':probes.some(x=>x.store_bound)?'LIVE PARTIAL':'DEVICE SETUP REQUIRED',probes,truth:'Device/store markdown evidence is probabilistic remodel evidence, not an official remodel schedule. Physical register scan remains final penny truth.'}}
  async function runHdDevice(){const p=state.v240.hd||{},needs=!num(p.verified_count)&&['CONFIG_REQUIRED','UNAVAILABLE','LIVE_PARTIAL','PARTIAL'].includes(txt(p.provider_status||p.status).toUpperCase());if(!needs||!nativeDeviceReady())return;const store=nearest('home depot',1)[0],candidates=(state.hunt.rows||[]).filter(r=>retailerKey(r.retailer)==='home depot').slice(0,2);if(!store||!candidates.length)return;const out=[];for(const c of candidates){const r=await deviceCheck({retailer:'Home Depot',title:c.title||c.canonical_title||'',upc:c.upc||'',sku:c.sku||'',source_url:c.source_url||'',store_name:store.store_name||'',store_address:store.store_address||'',store_id:hdStoreId(store),postal:(txt(store.store_address).match(/\b\d{5}\b/)||[])[0]||''});out.push({...r,title:c.title||c.canonical_title||'',sku:c.sku||'',upc:c.upc||'',store_name:store.store_name,store_address:store.store_address})}state.v250.hdChecks=out;const verified=out.filter(x=>x.store_bound).length,readings=out.map(x=>({title:x.title,sku:x.sku,upc:x.upc,evidence_level:x.store_bound?'LIVE VERIFIED':'DEVICE SETUP REQUIRED',store_readings:[{store_id:x.store_id,store_name:x.store_name,store_address:x.store_address,price:x.current_price,regular_price:x.regular_price,markdown_ratio:x.markdown_ratio,quantity:x.stock_count,stock_status:x.stock_status,penny_signal:x.penny_price_detected===true,evidence_level:x.store_bound?'LIVE VERIFIED':'DEVICE SETUP REQUIRED',source_mode:x.source_mode,availability_label:x.availability_label}],local_verified:!!x.store_bound}));state.v240.hd={...p,status:verified?'PASS':'PARTIAL',provider_status:verified?'DEVICE_LIVE':'DEVICE_SETUP_REQUIRED',provider_detail:verified?'No paid provider required: verified from retailer pages in the on-device WebView session.':'Device verifier ran, but the exact store/product pair was not yet proven. Use Verify once if the retailer has not saved the store.',readings,verified_count:verified,partial_count:out.filter(x=>!x.store_bound).length,device_fallback:true}}
  async function runDgDevice(){const p=state.v240.dg||{},needs=!Array.isArray(p.stores)||!p.stores.length||['CONFIG_REQUIRED','UNAVAILABLE','LIVE_PARTIAL','PARTIAL'].includes(txt(p.provider_status||p.status).toUpperCase());if(!needs||!nativeDeviceReady())return;const stores=nearest('dollar general',2),inds=(Array.isArray(p.indicators)?p.indicators:[]).filter(x=>txt(x.upc)).slice(0,3);if(!stores.length||!inds.length)return;const all=[];for(const s of stores)for(const i of inds){const r=await deviceCheck({retailer:'Dollar General',title:i.name||`DG remodel indicator ${i.upc}`,upc:i.upc,store_name:s.store_name||'',store_address:s.store_address||'',postal:(txt(s.store_address).match(/\b\d{5}\b/)||[])[0]||''});all.push({...r,upc:i.upc,name:i.name||'',store_key:s.store_key||s.store_address,store_name:s.store_name,store_address:s.store_address})}state.v250.dgChecks=all;const community=Array.isArray(p.community_candidates)?p.community_candidates:[],scored=stores.map(s=>scoreDgDevice(s,all.filter(x=>x.store_key===(s.store_key||s.store_address)),communityNear(s,community),all));const bound=all.filter(x=>x.store_bound).length;state.v240.dg={...p,status:bound?'PASS':'PARTIAL',provider_status:bound?'DEVICE_LIVE':'DEVICE_SETUP_REQUIRED',provider_detail:bound?'No paid DG provider required: remodel indicators were checked through the on-device retailer session.':'Current indicators/community intelligence loaded, but DG did not expose an exact selected-store product reading yet.',stores:scored,device_fallback:true,device_bound_checks:bound}}
  function decorateV250(){const host=document.querySelector('[data-v240-intel]');if(host){let x=host.querySelector('[data-v250-device]');if(!x){x=document.createElement('div');x.dataset.v250Device='true';host.appendChild(x)}const hd=state.v240.hd,dg=state.v240.dg;x.innerHTML=`<div class="status-line" style="margin-top:10px"><span class="dot ${state.v250.deviceLoading?'loading':(hd?.provider_status==='DEVICE_LIVE'||dg?.provider_status==='DEVICE_LIVE')?'live':''}"></span>${state.v250.deviceLoading?'Device retailer fallback is checking exact store pages…':`No-key fallback: Home Depot ${esc(hd?.provider_status||'not run')} · DG ${esc(dg?.provider_status||'not run')}`}</div>`}const fb=$('facebookScan');if(fb){fb.textContent='Run signed-in Facebook pass';const sec=fb.closest('section.card'),p=sec?.querySelector('p.small');if(p)p.textContent='Public Marketplace search is best-effort. The signed-in device pass is the reliable fallback and its WebView cookies are now explicitly persisted on this phone; Scout never exports Facebook cookies or credentials.'}}
  const baseRetail=window.H38V240LoadRetailIntel;
  window.H38V240LoadRetailIntel=async function(force=false){await baseRetail(force);if(state.v250.deviceLoading)return;state.v250.deviceLoading=true;state.v250.deviceRuns++;if(state.page==='discover')renderDiscover();if(state.page==='hunt')renderHunt();try{await runHdDevice();await runDgDevice();state.v250.lastDeviceAt=Date.now()}finally{state.v250.deviceLoading=false;if(state.page==='discover')renderDiscover();if(state.page==='hunt')renderHunt()}}
  const rd=renderDiscover;renderDiscover=function(){rd();decorateV250()};
  const rh=renderHunt;renderHunt=function(){rh();decorateV250()};
})();

// v3.0.26 source recovery: preserve the v2.6.3 physical-PASS login/native shell and
// restore only post-login sourcing capabilities removed by the whole-module rollback.
window.H38_SCOUT_V326_SOURCE_RECOVERY=true;
(function installV326SourceRecovery(){
  if(window.H38_SCOUT_V326_SOURCE_RECOVERY_INSTALLED)return;
  window.H38_SCOUT_V326_SOURCE_RECOVERY_INSTALLED=true;
  state.v326=state.v326||{
    facebookLoading:false,facebookLoaded:false,facebookCandidates:[],facebookStatus:'NOT_RUN',
    garageLoading:false,garageLoaded:false,garageRows:[],garageHealth:{},garageStatus:'NOT_RUN',
    huntProviders:[]
  };

  const baseFn=fn;
  function authFailure(e){
    return /(?:session expired|jwt(?: token)? expired|invalid jwt|sign in again|not authenticated|unauthorized|http\s*401|\b401\b)/i.test(String(e?.message||e||''));
  }
  fn=async function(name,body={},timeout=45000){
    try{return await baseFn(name,body,timeout)}
    catch(e){
      if(!authFailure(e))throw e;
      try{
        const {data,error:refreshError}=await h38sb.auth.refreshSession();
        if(refreshError||!data?.session?.access_token)throw e;
        return await baseFn(name,body,timeout);
      }catch(refreshFailure){throw refreshFailure}
    }
  };

  function uniqueRows(rows){
    const seen=new Map();
    for(const r of Array.isArray(rows)?rows:[]){
      if(!r||typeof r!=='object')continue;
      const key=txt(r.marketplace_listing_id||r.listing_id||r.id||r.url||r.source_url||`${r.title||r.name||''}|${r.price||''}|${r.location_label||''}`);
      if(key&&!seen.has(key))seen.set(key,r);
    }
    return [...seen.values()];
  }
  function currentTerms(){
    const typed=txt($('discoverSearch')?.value??state.discover?.query);
    if(typed)return[typed];
    try{if(typeof profitTerms==='function'){const x=profitTerms().map(txt).filter(Boolean);if(x.length)return x.slice(0,6)}}catch{}
    return['tools','electronics','appliances','lawn mower','generator','toolbox'];
  }
  function sourceLink(r,label='Open source'){
    const u=txt(r?.url||r?.source_url||r?.listing_url);
    return /^https:\/\//i.test(u)?`<a class="mini-btn" href="${esc(u)}" target="_blank" rel="noopener">${esc(label)}</a>`:'';
  }
  function priceLabel(r){
    const p=Number(r?.price??r?.current_price??r?.sale_price);
    return Number.isFinite(p)&&p>=0?`$${p.toFixed(2)}`:'Price not captured';
  }

  async function loadFacebookV326(force=false){
    if(state.v326.facebookLoading||!requireLocation())return;
    state.v326.facebookLoading=true;state.v326.facebookStatus='SEARCHING';decorateDiscoverV326();
    try{
      if(typeof window.H38V263ResolveLocation==='function')await window.H38V263ResolveLocation();
      const p=await fn('reseller-facebook-public-v240',{
        ...locationPayload(),
        location_label:txt(state.location?.label),
        terms:currentTerms(),
        max_results:120,
        force:!!force
      },80000);
      state.v240=state.v240||{};
      state.v240.facebook=p;
      const verified=uniqueRows(p?.results||[]);
      const captured=uniqueRows([...(p?.candidates||[]),...verified]);
      state.v240.facebookRows=verified;
      state.v326.facebookCandidates=captured;
      state.v326.facebookLoaded=true;
      state.v326.facebookStatus=captured.length?(verified.length?'PASS':'LOCATION_UNPROVEN'):txt(p?.provider_status||p?.status||'EMPTY');
    }catch(e){
      state.v326.facebookStatus=`ERROR: ${String(e?.message||e)}`;
      error('facebookV326',e);
    }finally{
      state.v326.facebookLoading=false;
      if(state.page==='discover')renderDiscover();
    }
  }
  window.H38V326LoadFacebook=loadFacebookV326;

  async function loadGarageV326(force=false){
    if(state.v326.garageLoading||!requireLocation())return;
    state.v326.garageLoading=true;state.v326.garageStatus='SEARCHING';decorateDiscoverV326();
    try{
      if(typeof window.H38V263ResolveLocation==='function')await window.H38V263ResolveLocation();
      const p=await fn('reseller-garage-sales-v308',{
        ...locationPayload(),
        location_label:txt(state.location?.label),
        postal:digits(state.location?.zip||'').slice(0,5),
        force:!!force
      },80000);
      state.v326.garageRows=uniqueRows(p?.results||[]);
      state.v326.garageHealth=p?.source_health||{};
      state.v326.garageLoaded=true;
      state.v326.garageStatus=txt(p?.status||'PARTIAL');
    }catch(e){
      state.v326.garageStatus=`ERROR: ${String(e?.message||e)}`;
      error('garageV326',e);
    }finally{
      state.v326.garageLoading=false;
      if(state.page==='discover')renderDiscover();
    }
  }
  window.H38V326LoadGarage=loadGarageV326;

  function facebookDetailHtml(){
    const verified=uniqueRows(state.v240?.facebookRows||[]);
    const captured=uniqueRows(state.v326.facebookCandidates||[]);
    const unproven=captured.filter(r=>r.location_verified!==true&&txt(r.location_status)!=='OUTSIDE_RADIUS');
    const shown=uniqueRows([...verified,...unproven]).slice(0,12);
    const status=state.v326.facebookLoading?'Searching public Marketplace…':
      captured.length?`${verified.length} location-proven · ${captured.length} public captured`:
      state.v326.facebookLoaded?`No public cards captured · ${esc(state.v326.facebookStatus)}`:'Not searched yet';
    return `<section class="card" data-v326-facebook-results>
      <div class="section-head"><strong>Facebook Marketplace results</strong><span>${status}</span></div>
      <p class="small muted">Location-proven cards are separated from public cards whose local location still needs proof. Captured cards are not presented as verified local deals.</p>
      ${shown.length?`<div class="result-list">${shown.map(r=>`<div class="item-card">
        <div class="item-main"><strong>${esc(txt(r.title||r.name||'Marketplace listing'))}</strong>
        <div class="small">${esc(priceLabel(r))} · ${r.location_verified===true?'LOCAL LOCATION PROVEN':'LOCATION NEEDS PROOF'}${txt(r.location_label)?` · ${esc(txt(r.location_label))}`:''}</div></div>
        <div class="item-actions">${sourceLink(r,'Open listing')}</div>
      </div>`).join('')}</div>`:`<div class="empty"><strong>${state.v326.facebookLoading?'Searching…':'No Facebook cards yet'}</strong><span>Run the public Facebook search for this location.</span></div>`}
    </section>`;
  }
  function garageHtml(){
    const rows=state.v326.garageRows||[],health=state.v326.garageHealth||{};
    const live=Object.values(health).filter(x=>x&&['live','partial_live'].includes(txt(x.status).toLowerCase())).length;
    const status=state.v326.garageLoading?'Searching local sales…':
      state.v326.garageLoaded?`${rows.length} sale${rows.length===1?'':'s'} · ${live} live source${live===1?'':'s'}`:'Not searched yet';
    return `<section class="card" data-v326-garage>
      <div class="section-head"><strong>Garage & estate sales</strong><span>${status}</span></div>
      <p class="small muted">Current public garage, yard, moving and estate-sale events near the selected location. Sale events are not assigned resale profit until actual items are identified.</p>
      <button id="v326GarageRefresh" class="secondary wide">${state.v326.garageLoading?'Searching…':'Refresh garage & estate sales'}</button>
      ${rows.length?`<div class="result-list">${rows.slice(0,16).map(r=>`<div class="item-card">
        <div class="item-main"><strong>${esc(txt(r.title||r.event_type||'Local sale'))}</strong>
        <div class="small">${esc(txt(r.event_type||'SALE'))}${txt(r.location_label)?` · ${esc(txt(r.location_label))}`:''}${Number.isFinite(Number(r.distance_miles))?` · ${Number(r.distance_miles).toFixed(1)} mi`:''}${txt(r.event_time||r.date_label)?` · ${esc(txt(r.event_time||r.date_label))}`:''}</div></div>
        <div class="item-actions">${sourceLink(r,'Open sale')}</div>
      </div>`).join('')}</div>`:`<div class="empty"><strong>${state.v326.garageLoading?'Searching…':'No current sale rows returned'}</strong><span>${esc(state.v326.garageStatus)}</span></div>`}
    </section>`;
  }
  function decorateDiscoverV326(){
    const p=$('discoverPage');if(!p)return;
    const fbButton=$('facebookScan');
    if(fbButton){
      fbButton.textContent=state.v326.facebookLoading?'Searching public Facebook…':'Search public Facebook';
      fbButton.disabled=state.v326.facebookLoading;
      fbButton.onclick=()=>void loadFacebookV326(true);
      const sec=fbButton.closest('section.card'),head=sec?.querySelector('.section-head span');
      if(head){
        const verified=(state.v240?.facebookRows||[]).length,captured=(state.v326.facebookCandidates||[]).length;
        head.textContent=`${verified} local-proven · ${captured} captured`;
      }
    }
    p.querySelector('[data-v326-facebook-results]')?.remove();
    p.querySelector('[data-v326-garage]')?.remove();
    const fbSection=fbButton?.closest('section.card');
    if(fbSection)fbSection.insertAdjacentHTML('afterend',facebookDetailHtml()+garageHtml());
    else p.insertAdjacentHTML('beforeend',facebookDetailHtml()+garageHtml());
    const g=$('v326GarageRefresh');if(g){g.disabled=state.v326.garageLoading;g.onclick=()=>void loadGarageV326(true)}
  }

  const baseRenderDiscover=renderDiscover;
  renderDiscover=function(){
    baseRenderDiscover();
    decorateDiscoverV326();
    if(state.user&&state.page==='discover'){
      if(!state.v326.facebookLoaded&&!state.v326.facebookLoading)setTimeout(()=>void loadFacebookV326(false),80);
      if(!state.v326.garageLoaded&&!state.v326.garageLoading)setTimeout(()=>void loadGarageV326(false),140);
    }
  };

  function weirdHuntRow(r){
    const raw=txt(r?.title||r?.name||r?.item_name||r?.product_name),t=raw.toLowerCase().replace(/[^a-z0-9]+/g,'');
    return !t||['1cent','onecent','penny','pennyitem','unknown','na','001','001cent'].includes(t);
  }
  loadHunt=async function(force=false){
    if(state.hunt.loading)return;
    state.hunt.loading=true;renderHunt();
    const prior=Array.isArray(state.hunt.rows)?state.hunt.rows.slice():[];
    try{
      const calls=[
        ['reseller-auto-leads-v064',80000],
        ['reseller-auto-leads-v058',65000]
      ];
      const settled=await Promise.allSettled(calls.map(([name,timeout])=>fn(name,{...locationPayload(),force:!!force},timeout)));
      const payloads=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
      let all=[];for(const p of payloads)all.push(...(Array.isArray(p?.leads)?p.leads:[]));
      if(!all.length){
        try{const p=await fn('reseller-auto-leads-v063',{...locationPayload(),force:!!force},70000);payloads.push(p);all.push(...(Array.isArray(p?.leads)?p.leads:[]))}catch(e){error('huntV326Fallback',e)}
      }
      let rows=cleanRows(all).filter(r=>!huntArtifact(r)&&!weirdHuntRow(r));
      if(!rows.length&&prior.length)rows=cleanRows(prior).filter(r=>!huntArtifact(r)&&!weirdHuntRow(r));
      state.hunt.raw=payloads.reduce((n,p)=>n+num(p?.raw_count||(p?.leads||[]).length),0);
      state.hunt.rows=rows;state.hunt.loaded=true;
      state.v326.huntProviders=settled.map((x,i)=>({
        provider:i===0?'reseller-auto-leads-v064':'reseller-auto-leads-v058',
        status:x.status==='fulfilled'?txt(x.value?.status||'PASS'):'UNAVAILABLE',
        count:x.status==='fulfilled'&&Array.isArray(x.value?.leads)?x.value.leads.length:0
      }));
      state.hunt.sourceHealth={
        status:rows.length?'PASS':'PARTIAL',
        actionable:rows.length,
        providers:state.v326.huntProviders,
        recovery:'v3.0.26 source-only recovery; login shell unchanged'
      };
      renderHunt();
      if(hasPoint()||state.location.zip)void ensureNearbyStores().then(()=>renderHuntListOnly());
      void hydrateHuntImages();
    }catch(e){
      if(prior.length){state.hunt.rows=prior;state.hunt.loaded=true;notice('Live Hunt refresh failed; prior sourced evidence was preserved.','warn')}
      else notice(`Retail Hunt unavailable: ${error('huntV326',e)}`,'bad');
    }finally{state.hunt.loading=false;renderHunt()}
  };

  setTimeout(()=>{if(state.user&&state.page==='discover')renderDiscover()},250);
})();
