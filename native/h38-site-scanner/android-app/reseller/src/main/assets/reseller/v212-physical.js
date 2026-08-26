'use strict';
window.H38_SCOUT_V212_PHYSICAL_ACCEPTANCE=true;
window.H38_SCOUT_V213_SOURCE_ACCEPTANCE=true;
window.H38_SCOUT_V215_NATIVE_HUNT=true;
window.H38_SCOUT_V216_HUNT_RUNTIME=true;

// v2.1.6: v211-wide.js calls this helper while rendering Penny Hunt cards.
// It must exist before app bootstrap or Hunt can fail before retailer disclosures appear.
function strictImageRetailer(v){
  const k=retailerKey(v);
  return k==='dollar general'||k==='dollar tree';
}

function h38InstalledBuild(){
  try{const b=bridge(),v=b&&typeof b.build==='function'?String(b.build()||''):'';return v||'v2.1.6 · build identity unavailable'}catch{return'v2.1.6 · build identity unavailable'}
}
function h38RenderInstalledBuild(){const el=$('accountBuild');if(el)el.textContent=`Installed: ${h38InstalledBuild()}`}
setTimeout(h38RenderInstalledBuild,50);

const h38v212Authorize=authorize;
authorize=async function(session){await h38v212Authorize(session);h38RenderInstalledBuild()};

// Prime exact-UPС recovery for visible penny rows. Image recovery never changes penny truth.
function h38PrimePennyImageRecovery(limit=30){
  try{
    const rows=(state.hunt?.rows||[]).filter(r=>strictImageRetailer(r.retailer)&&!!itemCode(r)&&!r.image_data_url&&!cachedImage(itemKey(r))).slice(0,limit);
    for(const r of rows){const k=itemKey(r);if(k&&!huntImageQueue.includes(k))huntImageQueue.push(k)}
    if(rows.length)void drainHuntImageQueue()
  }catch(e){error('primePennyImages',e)}
}
const h38v212RenderHuntListOnly=renderHuntListOnly;
renderHuntListOnly=function(){h38v212RenderHuntListOnly();setTimeout(()=>h38PrimePennyImageRecovery(30),60)};
const h38v212RenderHunt=renderHunt;
renderHunt=function(){h38v212RenderHunt();setTimeout(()=>h38PrimePennyImageRecovery(30),80)};

// v2.1.5+: native disclosure replaces all custom retailer-group tap toggles.
// The legacy bindHunt looks only for [data-hunt-group]; native rows intentionally never expose that attribute.
huntGroupCard=function(g){
  state.hunt.expanded=state.hunt.expanded||{};
  const open=!!state.hunt.expanded[g.key],p=g.rows.filter(isPenny).length,n=g.rows.filter(isNearPenny).length,stores=huntStoreCount(g.key),preview=g.rows.filter(x=>huntDisplayImage(x)).slice(0,3);
  return `<details class="retailer-group" data-hunt-details="${esc(g.key)}" ${open?'open':''}><summary class="retailer-group-head"><div class="retailer-group-main"><div><strong>${esc(g.name)}</strong><span>${g.rows.length} candidate${g.rows.length===1?'':'s'}${stores?` · ${stores} nearby store${stores===1?'':'s'}`:''}</span></div><div class="group-badges">${p?`<span class="badge penny">${p} penny</span>`:''}${n?`<span class="badge warn">${n} near</span>`:''}</div></div><div class="group-preview">${preview.map(x=>`<img src="${esc(huntDisplayImage(x))}" alt="">`).join('')}<span class="group-chevron" aria-hidden="true"></span></div></summary><div class="retailer-group-items">${g.rows.map(leadCard).join('')}</div></details>`;
};
function h38EnsureNativeHuntStyles(){
  if(document.getElementById('hunt215NativeStyles'))return;
  const s=document.createElement('style');s.id='hunt215NativeStyles';
  s.textContent='details.retailer-group>summary{list-style:none;cursor:pointer;-webkit-tap-highlight-color:rgba(0,137,154,.16);touch-action:manipulation}details.retailer-group>summary::-webkit-details-marker{display:none}details.retailer-group[open]>.retailer-group-head{background:#f8fbfc;border-bottom:1px solid var(--line)}details.retailer-group .group-chevron::before{content:"+"}details.retailer-group[open] .group-chevron::before{content:"−"}';
  document.head.appendChild(s);
}
const h38v215BaseBindHunt=bindHunt;
bindHunt=function(root){
  h38EnsureNativeHuntStyles();h38v215BaseBindHunt(root);
  root.querySelectorAll('details[data-hunt-details]').forEach(d=>{d.ontoggle=()=>{state.hunt.expanded=state.hunt.expanded||{};state.hunt.expanded[d.dataset.huntDetails]=!!d.open}});
};
const h38v215BaseRenderHunt=renderHunt;
renderHunt=function(){h38EnsureNativeHuntStyles();h38v215BaseRenderHunt()};
function h38ProbeNativeHuntDisclosure(){
  try{
    let d=$('huntPage')?.querySelector?.('details[data-hunt-details]');if(!d){renderHunt();d=$('huntPage')?.querySelector?.('details[data-hunt-details]')}
    if(!d)return{ok:false,detail:'No retailer disclosure was available to probe.'};const summary=d.querySelector('summary');if(!summary)return{ok:false,detail:'Retailer disclosure has no native summary control.'};
    const before=!!d.open;summary.click();const after=!!d.open;summary.click();const restored=!!d.open===before;
    return{ok:after!==before&&restored,detail:`${d.dataset.huntDetails}: native summary ${before?'open':'closed'} → ${after?'open':'closed'} → ${d.open?'open':'closed'}.`};
  }catch(e){return{ok:false,detail:txt(e?.message||e)}}
}

// Physical acceptance diagnostics supplement the real phone test; they never replace it.
const h38v212RunMaintenance=runMaintenance;
runMaintenance=async function(){
  await h38v212RunMaintenance();
  const bundled=[...document.querySelectorAll('script[data-h38-bundled-module]')].map(x=>x.getAttribute('data-h38-bundled-module'));
  const required=['v210-polish.js','v211-wide.js','v212-physical.js'];
  const bundledOk=required.every(x=>bundled.includes(x));
  const tests=state.maintenance.tests||[],overallIndex=tests.findIndex(x=>x.name==='Overall'),additions=[];
  additions.push({name:'Installed build',status:/v2\.1\.6\b/.test(h38InstalledBuild())?'pass':'fail',detail:h38InstalledBuild()});
  additions.push({name:'Bundled runtime',status:bundledOk?'pass':'fail',detail:bundledOk?'All current v2.1 runtime layers are bundled inside the APK.':`Missing bundled layers: ${required.filter(x=>!bundled.includes(x)).join(', ')}`});
  additions.push({name:'Penny Hunt runtime dependency',status:typeof strictImageRetailer==='function'?'pass':'fail',detail:typeof strictImageRetailer==='function'?'strictImageRetailer is defined before Hunt renders.':'strictImageRetailer is missing.'});
  const nativeProbe=h38ProbeNativeHuntDisclosure();additions.push({name:'Native Penny Hunt expansion',status:nativeProbe.ok?'pass':'fail',detail:nativeProbe.detail});
  additions.push({name:'One-card source layer',status:window.H38_SCOUT_V213_MULTI_SOURCE===true?'pass':'fail',detail:window.H38_SCOUT_V213_MULTI_SOURCE===true?'Retail Hunt routes through canonical UPC/SKU source aggregation; evidence merges underneath one product card.':'Canonical source layer is not active.'});
  try{
    const p=await fn('reseller-auto-leads-v063',{...locationPayload(),force:false},70000),rows=Array.isArray(p.leads)?p.leads:[],ids=rows.map(x=>txt(x.canonical_id)).filter(Boolean),unique=new Set(ids),newSources=(p.source_status||[]).filter(x=>/pennygeneral|penny pinchin/i.test(txt(x.source))),live=newSources.filter(x=>x.status==='PASS').length;
    const canonicalOk=p.canonical_identity_version==='retailer-upc-sku-bridge-v063'&&ids.length===unique.size;
    additions.push({name:'Multi-source canonical Hunt',status:canonicalOk?'pass':'fail',detail:`${rows.length} cards · ${num(p.duplicate_count)} duplicate source rows merged · ${live}/${newSources.length||2} new source adapters live.`});
    if(canonicalOk&&live<newSources.length)additions.push({name:'New source availability',status:'warn',detail:`${live}/${newSources.length} new community sources responded now; unavailable sources do not erase the base Hunt feed.`});
  }catch(e){additions.push({name:'Multi-source canonical Hunt',status:'fail',detail:txt(e?.message||e)})}
  tests.splice(overallIndex>=0?overallIndex:tests.length,0,...additions);
  const fails=tests.filter(x=>x.status==='fail'&&x.name!=='Overall').length,warns=tests.filter(x=>x.status==='warn'&&x.name!=='Overall').length,overall=tests.find(x=>x.name==='Overall');
  if(overall){overall.status=fails?'fail':warns?'warn':'pass';overall.detail=fails?`${fails} required Scout checks failed.`:warns?`Required checks passed with ${warns} conditional/source warnings.`:'All required v2.1.6 checks passed.'}
  renderMaintenance();h38RenderInstalledBuild()
};

// v2.3.1 phone acceptance repair. Install after the v2.3 inline layer and app bootstrap have run.
window.H38_SCOUT_V231_PHONE_REPAIR=true;
function h38InstallV231AuctionRepair(){
  if(window.__h38V231AuctionInstalled||typeof runAuctionSearch!=='function'||typeof renderAuctions!=='function')return;
  window.__h38V231AuctionInstalled=true;
  const baseRun=runAuctionSearch,baseRender=renderAuctions;
  function healthCounts(){
    const vals=Object.values(state.auctions?.health||{}),responding=vals.filter(x=>x?.status==='live'||x?.status==='partial_live'||x?.status==='no_match'||x?.status==='empty').length,limited=vals.filter(x=>x?.status==='unavailable').length,routes=vals.filter(x=>x?.status==='search_route').length;
    return{responding,limited,routes,total:vals.length};
  }
  renderAuctions=function(){
    baseRender();
    const page=$('auctionPage'),line=page?.querySelector('.status-line');if(!line)return;
    let extra=page.querySelector('[data-v231-auction-status]');if(!extra){extra=document.createElement('div');extra.dataset.v231AuctionStatus='true';extra.className='small muted';line.insertAdjacentElement('afterend',extra)}
    const a=state.auctions||{},h=healthCounts(),elapsed=a.v231StartedAt?Math.max(0,Date.now()-a.v231StartedAt):0,last=a.v231LastResponse;
    if(a.loading)extra.textContent=`Source request running · ${(elapsed/1000).toFixed(1)}s${a.pendingRefresh?' · latest filter change queued':''}. Existing results stay on screen.`;
    else if(last)extra.textContent=`Last source response · ${last.count} row${last.count===1?'':'s'} · ${(last.elapsedMs/1000).toFixed(1)}s · ${last.responding} responding · ${last.limited} unavailable · ${last.routes} route-only.`;
    else extra.textContent='No completed v2.3 source response on this screen yet.';
  };
  runAuctionSearch=async function(){
    state.auctions=state.auctions||{};
    if(state.auctions.loading){state.auctions.pendingRefresh=true;state.auctions.pendingQueuedAt=Date.now();renderAuctions();return;}
    state.auctions.v231StartedAt=Date.now();state.auctions.pendingRefresh=false;
    const promise=baseRun();
    const tick=setInterval(()=>{if(!state.auctions.loading){clearInterval(tick);return}renderAuctions()},1000);
    try{await promise}finally{
      clearInterval(tick);
      const h=healthCounts();state.auctions.v231LastResponse={count:Array.isArray(state.auctions.rows)?state.auctions.rows.length:0,elapsedMs:Math.max(0,Date.now()-state.auctions.v231StartedAt),responding:h.responding,limited:h.limited,routes:h.routes,completedAt:Date.now()};
      const again=state.auctions.pendingRefresh===true;state.auctions.pendingRefresh=false;renderAuctions();if(again)setTimeout(()=>runAuctionSearch(),180);
    }
  };
}
setTimeout(h38InstallV231AuctionRepair,0);
setTimeout(h38InstallV231AuctionRepair,250);
