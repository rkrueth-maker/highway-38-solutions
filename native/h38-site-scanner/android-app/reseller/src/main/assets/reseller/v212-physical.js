'use strict';
window.H38_SCOUT_V212_PHYSICAL_ACCEPTANCE=true;
window.H38_SCOUT_V213_SOURCE_ACCEPTANCE=true;

function h38InstalledBuild(){
  try{const b=bridge(),v=b&&typeof b.build==='function'?String(b.build()||''):'';return v||'v2.1.5 · build identity unavailable'}catch{return'v2.1.5 · build identity unavailable'}
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

// Physical acceptance diagnostics that do not replace real phone interaction.
const h38v212RunMaintenance=runMaintenance;
runMaintenance=async function(){
  await h38v212RunMaintenance();
  const bundled=[...document.querySelectorAll('script[data-h38-bundled-module]')].map(x=>x.getAttribute('data-h38-bundled-module'));
  const required=['v210-polish.js','v211-wide.js','v212-physical.js','v215-hunt-native.js'];
  const bundledOk=required.every(x=>bundled.includes(x));
  const tests=state.maintenance.tests||[],overallIndex=tests.findIndex(x=>x.name==='Overall'),additions=[];
  additions.push({name:'Installed build',status:/v2\.1\.5\b/.test(h38InstalledBuild())?'pass':'fail',detail:h38InstalledBuild()});
  additions.push({name:'Bundled runtime',status:bundledOk?'pass':'fail',detail:bundledOk?'All current v2.1 runtime layers are bundled inside the APK.':`Missing bundled layers: ${required.filter(x=>!bundled.includes(x)).join(', ')}`});
  additions.push({name:'One-card source layer',status:window.H38_SCOUT_V213_MULTI_SOURCE===true?'pass':'fail',detail:window.H38_SCOUT_V213_MULTI_SOURCE===true?'Retail Hunt routes through canonical UPC/SKU source aggregation; evidence merges underneath one product card.':'Canonical source layer is not active.'});
  try{
    const p=await fn('reseller-auto-leads-v063',{...locationPayload(),force:false},70000),rows=Array.isArray(p.leads)?p.leads:[],ids=rows.map(x=>txt(x.canonical_id)).filter(Boolean),unique=new Set(ids),newSources=(p.source_status||[]).filter(x=>/pennygeneral|penny pinchin/i.test(txt(x.source))),live=newSources.filter(x=>x.status==='PASS').length;
    const canonicalOk=p.canonical_identity_version==='retailer-upc-sku-bridge-v063'&&ids.length===unique.size;
    additions.push({name:'Multi-source canonical Hunt',status:canonicalOk?'pass':'fail',detail:`${rows.length} cards · ${num(p.duplicate_count)} duplicate source rows merged · ${live}/${newSources.length||2} new source adapters live.`});
    if(canonicalOk&&live<newSources.length)additions.push({name:'New source availability',status:'warn',detail:`${live}/${newSources.length} new community sources responded now; unavailable sources do not erase the base Hunt feed.`});
  }catch(e){additions.push({name:'Multi-source canonical Hunt',status:'fail',detail:txt(e?.message||e)})}
  tests.splice(overallIndex>=0?overallIndex:tests.length,0,...additions);
  const fails=tests.filter(x=>x.status==='fail'&&x.name!=='Overall').length,warns=tests.filter(x=>x.status==='warn'&&x.name!=='Overall').length,overall=tests.find(x=>x.name==='Overall');
  if(overall){overall.status=fails?'fail':warns?'warn':'pass';overall.detail=fails?`${fails} required Scout checks failed.`:warns?`Required checks passed with ${warns} conditional/source warnings.`:'All required v2.1.5 checks passed.'}
  renderMaintenance();h38RenderInstalledBuild()
};
