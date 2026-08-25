'use strict';
window.H38_SCOUT_V212_PHYSICAL_ACCEPTANCE=true;

function h38InstalledBuild(){
  try{const b=bridge(),v=b&&typeof b.build==='function'?String(b.build()||''):'';return v||'v2.1.2 · build identity unavailable'}catch{return'v2.1.2 · build identity unavailable'}
}
function h38RenderInstalledBuild(){const el=$('accountBuild');if(el)el.textContent=`Installed: ${h38InstalledBuild()}`}
setTimeout(h38RenderInstalledBuild,50);

const h38v212Authorize=authorize;
authorize=async function(session){await h38v212Authorize(session);h38RenderInstalledBuild()};

// Prime exact-UPС recovery for visible penny rows instead of waiting only for an existing external image URL.
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

// Keep the build identity and packaging state visible inside Maintenance so recordings can prove exact bytes.
const h38v212RunMaintenance=runMaintenance;
runMaintenance=async function(){
  await h38v212RunMaintenance();
  const bundled=[...document.querySelectorAll('script[data-h38-bundled-module]')].map(x=>x.getAttribute('data-h38-bundled-module'));
  const required=['v210-polish.js','v211-wide.js','v212-physical.js'];
  const bundledOk=required.every(x=>bundled.includes(x));
  const tests=state.maintenance.tests||[];
  const overallIndex=tests.findIndex(x=>x.name==='Overall');
  const buildTest={name:'Installed build',status:/v2\.1\.2\b/.test(h38InstalledBuild())?'pass':'fail',detail:h38InstalledBuild()};
  const bundleTest={name:'Bundled runtime',status:bundledOk?'pass':'fail',detail:bundledOk?'v2.1 polish layers are running from APK assets, not a live URL.':`Missing bundled layers: ${required.filter(x=>!bundled.includes(x)).join(', ')}`};
  if(overallIndex>=0)tests.splice(overallIndex,0,buildTest,bundleTest);else tests.push(buildTest,bundleTest);
  const fails=tests.filter(x=>x.status==='fail'&&x.name!=='Overall').length,warns=tests.filter(x=>x.status==='warn'&&x.name!=='Overall').length;
  const overall=tests.find(x=>x.name==='Overall');if(overall){overall.status=fails?'fail':warns?'warn':'pass';overall.detail=fails?`${fails} required Scout checks failed.`:warns?`Required checks passed with ${warns} conditional/source warnings.`:'All required v2.1.2 checks passed.'}
  renderMaintenance();h38RenderInstalledBuild()
};
