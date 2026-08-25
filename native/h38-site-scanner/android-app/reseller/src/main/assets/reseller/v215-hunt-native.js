'use strict';
window.H38_SCOUT_V215_NATIVE_HUNT=true;

// v2.1.5 physical repair: retailer expansion is owned by native HTML <details>/<summary>.
// Do not put data-hunt-group on these elements; the legacy v200 per-button onclick must never bind to them.
const h38v215BaseHuntGroupCard=huntGroupCard;
huntGroupCard=function(g){
  state.hunt.expanded=state.hunt.expanded||{};
  const open=!!state.hunt.expanded[g.key],p=g.rows.filter(isPenny).length,n=g.rows.filter(isNearPenny).length,stores=huntStoreCount(g.key),preview=g.rows.filter(x=>huntDisplayImage(x)).slice(0,3);
  return `<details class="retailer-group" data-hunt-details="${esc(g.key)}" ${open?'open':''}><summary class="retailer-group-head"><div class="retailer-group-main"><div><strong>${esc(g.name)}</strong><span>${g.rows.length} candidate${g.rows.length===1?'':'s'}${stores?` · ${stores} nearby store${stores===1?'':'s'}`:''}</span></div><div class="group-badges">${p?`<span class="badge penny">${p} penny</span>`:''}${n?`<span class="badge warn">${n} near</span>`:''}</div></div><div class="group-preview">${preview.map(x=>`<img src="${esc(huntDisplayImage(x))}" alt="">`).join('')}<span class="group-chevron" aria-hidden="true"></span></div></summary><div class="retailer-group-items">${g.rows.map(leadCard).join('')}</div></details>`;
};

function h38EnsureNativeHuntStyles(){
  if(document.getElementById('hunt215NativeStyles'))return;
  const s=document.createElement('style');s.id='hunt215NativeStyles';
  s.textContent='details.retailer-group>summary{list-style:none;cursor:pointer;-webkit-tap-highlight-color:rgba(0,137,154,.16);touch-action:manipulation}details.retailer-group>summary::-webkit-details-marker{display:none}details.retailer-group[open]>.retailer-group-head{background:#f8fbfc;border-bottom:1px solid var(--line)}details.retailer-group .group-chevron::before{content:"+"}details.retailer-group[open] .group-chevron::before{content:"−"}details.retailer-group:not([open])>.retailer-group-items{display:none}';
  document.head.appendChild(s);
}

const h38v215BaseBindHunt=bindHunt;
bindHunt=function(root){
  h38EnsureNativeHuntStyles();
  h38v215BaseBindHunt(root);
  root.querySelectorAll('details[data-hunt-details]').forEach(d=>{
    d.ontoggle=()=>{state.hunt.expanded=state.hunt.expanded||{};state.hunt.expanded[d.dataset.huntDetails]=!!d.open};
  });
};

const h38v215BaseRenderHunt=renderHunt;
renderHunt=function(){
  h38EnsureNativeHuntStyles();
  h38v215BaseRenderHunt();
};

function h38ProbeNativeHuntDisclosure(){
  try{
    let d=$('huntPage')?.querySelector?.('details[data-hunt-details]');
    if(!d){renderHunt();d=$('huntPage')?.querySelector?.('details[data-hunt-details]')}
    if(!d)return{ok:false,detail:'No retailer disclosure was available to probe.'};
    const summary=d.querySelector('summary');if(!summary)return{ok:false,detail:'Retailer disclosure has no native summary control.'};
    const before=!!d.open;summary.click();const after=!!d.open;summary.click();const restored=!!d.open===before;
    return{ok:after!==before&&restored,detail:`${d.dataset.huntDetails}: native summary ${before?'open':'closed'} → ${after?'open':'closed'} → ${d.open?'open':'closed'}.`};
  }catch(e){return{ok:false,detail:txt(e?.message||e)}}
}

const h38v215BaseMaintenance=runMaintenance;
runMaintenance=async function(){
  await h38v215BaseMaintenance();
  const tests=state.maintenance.tests||[],probe=h38ProbeNativeHuntDisclosure(),overallIndex=tests.findIndex(x=>x.name==='Overall');
  const row={name:'Native Penny Hunt expansion',status:probe.ok?'pass':'fail',detail:probe.detail};
  const old=tests.findIndex(x=>x.name==='Native Penny Hunt expansion');if(old>=0)tests.splice(old,1);
  tests.splice(overallIndex>=0?overallIndex:tests.length,0,row);
  const fails=tests.filter(x=>x.status==='fail'&&x.name!=='Overall').length,warns=tests.filter(x=>x.status==='warn'&&x.name!=='Overall').length,overall=tests.find(x=>x.name==='Overall');
  if(overall){overall.status=fails?'fail':warns?'warn':'pass';overall.detail=fails?`${fails} required Scout checks failed.`:warns?`Required checks passed with ${warns} conditional/source warnings.`:'All required v2.1.5 checks passed.'}
  renderMaintenance();
};
