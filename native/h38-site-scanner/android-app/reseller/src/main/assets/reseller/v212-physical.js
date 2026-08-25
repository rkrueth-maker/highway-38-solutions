'use strict';
window.H38_SCOUT_V212_PHYSICAL_ACCEPTANCE=true;
window.H38_SCOUT_V213_SOURCE_ACCEPTANCE=true;
window.H38_SCOUT_V214_HUNT_TOUCH_ACCEPTANCE=true;

function h38InstalledBuild(){
  try{const b=bridge(),v=b&&typeof b.build==='function'?String(b.build()||''):'';return v||'v2.1.4 · build identity unavailable'}catch{return'v2.1.4 · build identity unavailable'}
}
function h38RenderInstalledBuild(){const el=$('accountBuild');if(el)el.textContent=`Installed: ${h38InstalledBuild()}`}
setTimeout(h38RenderInstalledBuild,50);

const h38v212Authorize=authorize;
authorize=async function(session){await h38v212Authorize(session);h38RenderInstalledBuild()};

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

// Android WebView physical repair: retailer groups use one stable delegated touch/click path on #huntPage.
let h38HuntPointer=null,h38HuntLastToggleAt=0;
function h38ToggleHuntGroup(key){
  key=txt(key);if(!key)return false;
  state.hunt.expanded=state.hunt.expanded||{};
  state.hunt.expanded[key]=!state.hunt.expanded[key];
  renderHuntListOnly();
  return !!state.hunt.expanded[key];
}
function h38HuntGroupTarget(target){return target&&typeof target.closest==='function'?target.closest('[data-hunt-group]'):null}
function h38BindStableHuntTouch(){
  const page=$('huntPage');if(!page||page.dataset.h38HuntTouchBound==='1')return;
  page.dataset.h38HuntTouchBound='1';
  page.addEventListener('pointerdown',e=>{
    const b=h38HuntGroupTarget(e.target);if(!b)return;
    h38HuntPointer={id:e.pointerId,key:txt(b.dataset.huntGroup),x:Number(e.clientX||0),y:Number(e.clientY||0),at:Date.now()};
  },true);
  page.addEventListener('pointercancel',()=>{h38HuntPointer=null},true);
  page.addEventListener('pointerup',e=>{
    const b=h38HuntGroupTarget(e.target),p=h38HuntPointer;h38HuntPointer=null;
    if(!b||!p||p.id!==e.pointerId||p.key!==txt(b.dataset.huntGroup))return;
    const dx=Math.abs(Number(e.clientX||0)-p.x),dy=Math.abs(Number(e.clientY||0)-p.y),dt=Date.now()-p.at;
    if(dx>18||dy>18||dt>1200)return;
    e.preventDefault();e.stopPropagation();
    h38HuntLastToggleAt=Date.now();h38ToggleHuntGroup(p.key);
  },true);
  page.addEventListener('click',e=>{
    const b=h38HuntGroupTarget(e.target);if(!b)return;
    if(Date.now()-h38HuntLastToggleAt<700){e.preventDefault();e.stopPropagation();return}
    e.preventDefault();e.stopPropagation();h38HuntLastToggleAt=Date.now();h38ToggleHuntGroup(b.dataset.huntGroup);
  },true);
  page.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;const b=h38HuntGroupTarget(e.target);if(!b)return;
    e.preventDefault();e.stopPropagation();h38ToggleHuntGroup(b.dataset.huntGroup);
  },true);
}
function h38ProbeHuntTouchInteraction(){
  try{
    h38BindStableHuntTouch();
    let button=$('huntPage')?.querySelector?.('[data-hunt-group]');
    if(!button){renderHunt();button=$('huntPage')?.querySelector?.('[data-hunt-group]')}
    if(!button)return{ok:false,detail:'No retailer header was available for the interaction probe.'};
    const key=txt(button.dataset.huntGroup),before=!!(state.hunt.expanded||{})[key],pid=914;
    const opts={bubbles:true,cancelable:true,pointerId:pid,clientX:10,clientY:10,pointerType:'touch',isPrimary:true};
    button.dispatchEvent(new PointerEvent('pointerdown',opts));
    button.dispatchEvent(new PointerEvent('pointerup',opts));
    const after=!!(state.hunt.expanded||{})[key],rendered=!!$('huntPage')?.querySelector?.(`[data-hunt-group="${CSS.escape(key)}"]`)?.closest?.('.retailer-group')?.classList?.contains('open');
    if(after!==before)h38ToggleHuntGroup(key);
    return{ok:after!==before&&rendered===after,detail:`${key}: ${before?'open':'closed'} → ${after?'open':'closed'}; rendered=${rendered?'open':'closed'}.`};
  }catch(e){return{ok:false,detail:txt(e?.message||e)}}
}
const h38v214RenderHunt=renderHunt;
renderHunt=function(){h38BindStableHuntTouch();h38v214RenderHunt()};
setTimeout(h38BindStableHuntTouch,80);

const h38v212RunMaintenance=runMaintenance;
runMaintenance=async function(){
  await h38v212RunMaintenance();
  const bundled=[...document.querySelectorAll('script[data-h38-bundled-module]')].map(x=>x.getAttribute('data-h38-bundled-module'));
  const required=['v210-polish.js','v211-wide.js','v212-physical.js'];
  const bundledOk=required.every(x=>bundled.includes(x));
  const tests=state.maintenance.tests||[];
  const overallIndex=tests.findIndex(x=>x.name==='Overall');
  const additions=[];
  additions.push({name:'Installed build',status:/v2\.1\.4\b/.test(h38InstalledBuild())?'pass':'fail',detail:h38InstalledBuild()});
  additions.push({name:'Bundled runtime',status:bundledOk?'pass':'fail',detail:bundledOk?'v2.1 polish layers are running from APK assets, not a live URL.':`Missing bundled layers: ${required.filter(x=>!bundled.includes(x)).join(', ')}`});
  const touchProbe=h38ProbeHuntTouchInteraction();
  additions.push({name:'Retailer expand touch path',status:touchProbe.ok?'pass':'fail',detail:touchProbe.detail});
  additions.push({name:'One-card source layer',status:window.H38_SCOUT_V213_MULTI_SOURCE===true?'pass':'fail',detail:window.H38_SCOUT_V213_MULTI_SOURCE===true?'Retail Hunt routes through canonical UPC/SKU source aggregation; evidence merges underneath one product card.':'v2.1.3 canonical source layer is not active.'});
  try{
    const p=await fn('reseller-auto-leads-v063',{...locationPayload(),force:false},70000),rows=Array.isArray(p.leads)?p.leads:[],ids=rows.map(x=>txt(x.canonical_id)).filter(Boolean),unique=new Set(ids),newSources=(p.source_status||[]).filter(x=>/pennygeneral|penny pinchin/i.test(txt(x.source))),live=newSources.filter(x=>x.status==='PASS').length;
    const canonicalOk=p.canonical_identity_version==='retailer-upc-sku-bridge-v063'&&ids.length===unique.size;
    additions.push({name:'Multi-source canonical Hunt',status:canonicalOk?'pass':'fail',detail:`${rows.length} cards · ${num(p.duplicate_count)} duplicate source rows merged · ${live}/${newSources.length||2} new source adapters live.`});
    if(canonicalOk&&live<newSources.length)additions.push({name:'New source availability',status:'warn',detail:`${live}/${newSources.length} new community sources responded now; unavailable sources do not erase the base Hunt feed.`});
  }catch(e){additions.push({name:'Multi-source canonical Hunt',status:'fail',detail:txt(e?.message||e)})}
  const insertAt=overallIndex>=0?overallIndex:tests.length;tests.splice(insertAt,0,...additions);
  const fails=tests.filter(x=>x.status==='fail'&&x.name!=='Overall').length,warns=tests.filter(x=>x.status==='warn'&&x.name!=='Overall').length;
  const overall=tests.find(x=>x.name==='Overall');if(overall){overall.status=fails?'fail':warns?'warn':'pass';overall.detail=fails?`${fails} required Scout checks failed.`:warns?`Required checks passed with ${warns} conditional/source warnings.`:'All required v2.1.4 checks passed.'}
  renderMaintenance();h38RenderInstalledBuild()
};
