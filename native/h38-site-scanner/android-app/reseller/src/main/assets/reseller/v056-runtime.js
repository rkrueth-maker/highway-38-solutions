'use strict';
window.H38_V056_RUNTIME_ACTIVE=true;
window.H38_V056_RUNTIME_MARKER='stores-resale-sources-v056';
(function(){
  const text=v=>String(v??'').trim();
  const n=v=>Number(v||0)||0;
  if(!Array.isArray(state.resaleSources))state.resaleSources=[];
  if(!text(state.v056StoreView))state.v056StoreView='deals';
  if(!text(state.v056SourceCategory))state.v056SourceCategory='all';
  state.v056SourceStatus=state.v056SourceStatus||'';

  function addStyle(){
    if(document.getElementById('h38-v056-style'))return;
    const s=document.createElement('style');s.id='h38-v056-style';s.textContent=`
      .v056-store-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:8px}.v056-store-tabs button{min-height:42px}.v056-source-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:8px}.v056-source-grid{display:grid;gap:8px}.v056-source-card{padding:10px 11px}.v056-source-top{display:flex;justify-content:space-between;gap:9px;align-items:flex-start}.v056-source-top strong{display:block}.v056-source-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}.v056-source-actions button{width:auto}.v056-source-filter{min-height:42px;width:100%;margin-top:8px}.v056-truth{margin-top:8px}.v056-hidden{display:none!important}@media(max-width:520px){.v056-store-tabs{grid-template-columns:1fr}.v056-source-top{display:block}.v056-source-top>strong{margin-top:6px}}
    `;document.head.appendChild(s);
  }
  addStyle();

  async function loadResaleSources(force){
    if(!hasPoint())return;
    const key='resaleSources';
    busy(key,force?'Refreshing resale sourcing places…':'Finding resale sourcing places…','Antique, thrift, ReStore, pawn, consignment and salvage locations are destinations only; inventory is not inferred.');
    state.v056SourceStatus='loading';
    try{
      const p=await fn('reseller-nearby-sources',{lat:Number(state.location.lat),lon:Number(state.location.lon),radiusMiles:radius()},22000);
      state.resaleSources=Array.isArray(p.sources)?p.sources:[];
      state.v056SourceStatus=p.warning?String(p.warning):'';
      diag('resaleSources',{status:p.status||'PASS',count:state.resaleSources.length,coverage_tiles_done:p.coverage_tiles_done||0,coverage_tiles_total:p.coverage_tiles_total||0,warning:p.warning||''});
    }catch(e){
      state.v056SourceStatus='Resale-source lookup unavailable: '+String(e?.message||e||'unknown error');
      err('resaleSources',e);
    }finally{
      done(key);
      if(state.page==='stores')renderStores();
    }
  }

  const loadStoresV056Base=loadStores;
  loadStores=async function(force){
    const result=await loadStoresV056Base(force);
    if(hasPoint())await loadResaleSources(force);
    return result;
  };

  function mapsUrl(s){
    const lat=Number(s?.lat),lon=Number(s?.lon);
    if(Number.isFinite(lat)&&Number.isFinite(lon))return`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat+','+lon)}`;
    const q=[s?.source_name,s?.source_address].map(text).filter(Boolean).join(' ');
    return q?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`:'';
  }
  function sourceRows(){
    let rows=(state.resaleSources||[]).slice();
    if(state.v056SourceCategory!=='all')rows=rows.filter(s=>text(s.source_category)===state.v056SourceCategory);
    return rows.sort((a,b)=>n(a.distance_miles)-n(b.distance_miles)||text(a.source_name).localeCompare(text(b.source_name)));
  }
  function sourceCard(s){
    const dist=Number(s.distance_miles),distance=Number.isFinite(dist)?dist.toFixed(1)+' mi':'—',map=mapsUrl(s),site=/^https?:\/\//i.test(text(s.website))?text(s.website):'';
    return `<article class="card v056-source-card" data-v056-source="${esc(s.source_key||'')}"><div class="v056-source-top"><div><span class="badge">${esc(s.source_category||'Resale source')}</span><strong>${esc(s.source_name||'Resale source')}</strong><div class="small muted">${esc(s.source_address||'Address not published in map data')}</div></div><strong>${esc(distance)}</strong></div>${s.opening_hours?`<div class="tiny muted" style="margin-top:6px">Hours data: ${esc(s.opening_hours)}</div>`:''}<div class="notice small v056-truth"><strong>Sourcing destination only.</strong> Scout does not know this location's inventory, prices, condition, or resale value until you inspect/scan an item.</div><div class="v056-source-actions">${map?`<button class="secondary" data-open="${esc(map)}">Directions</button>`:''}${site?`<button class="secondary" data-open="${esc(site)}">Website</button>`:''}<button data-v056-scan="${esc(s.source_key||'')}">Scan item here</button></div></article>`;
  }
  function renderSourceSection(p){
    const old=p.querySelector('.v056-source-section');if(old)old.remove();
    if(state.v056StoreView==='deals')return;
    const cats=[...new Set((state.resaleSources||[]).map(s=>text(s.source_category)).filter(Boolean))].sort();
    const rows=sourceRows(),section=document.createElement('section');section.className='v056-source-section';
    section.innerHTML=`<div class="card"><div class="v056-source-head"><div><h3>Nearby resale sources</h3><div class="small muted">Antique/vintage, Habitat ReStore, thrift/charity, consignment, pawn, flea, salvage/reuse, liquidation/surplus and other secondhand sourcing places found from map data.</div></div><span class="badge">${rows.length}</span></div><select id="v056SourceCategory" class="v056-source-filter"><option value="all">All source types</option>${cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select>${state.v056SourceStatus?`<div class="tiny muted" style="margin-top:6px">${esc(state.v056SourceStatus)}</div>`:''}</div><div class="v056-source-grid">${rows.length?rows.map(sourceCard).join(''):'<div class="card empty">No resale-source places are loaded for this radius yet. Refresh Stores to continue filling nearby map coverage.</div>'}</div>`;
    p.appendChild(section);
    const sel=$('v056SourceCategory');if(sel){sel.value=state.v056SourceCategory;sel.onchange=e=>{state.v056SourceCategory=e.target.value;renderStores()}}
    section.querySelectorAll('[data-v056-scan]').forEach(b=>b.onclick=()=>{const s=(state.resaleSources||[]).find(x=>text(x.source_key)===text(b.dataset.v056Scan));state.v056ActiveSource=s||null;setPage('more',{subpage:'research',start:false});notice(`Scanning at ${text(s?.source_name)||'resale source'} — location inventory is not assumed; research this item from its actual photo/barcode and price.`,'good')});
    if(typeof bindOpen==='function')bindOpen(section);
  }

  const renderStoresV056Base=renderStores;
  renderStores=function(){
    if(state.v056StoreView==='deals')state.v053StoreVisibility='leads';
    else state.v053StoreVisibility='all';
    renderStoresV056Base();
    const p=$('page-stores');if(!p)return;
    const header=p.querySelector('section.compact-head-v048')||p.querySelector('section.card');if(!header)return;
    const oldCtl=header.querySelector('.v053-store-visibility');if(oldCtl)oldCtl.classList.add('v056-hidden');
    let tabs=header.querySelector('.v056-store-tabs');if(!tabs){tabs=document.createElement('div');tabs.className='v056-store-tabs';(oldCtl||header).insertAdjacentElement('afterend',tabs)}
    tabs.innerHTML=`<button data-v056-view="deals">Deals</button><button data-v056-view="sources">Resale Sources</button><button data-v056-view="all">All Nearby</button>`;
    tabs.querySelectorAll('[data-v056-view]').forEach(b=>{b.classList.toggle('active',b.dataset.v056View===state.v056StoreView);b.onclick=()=>{state.v056StoreView=b.dataset.v056View;renderStores()}});
    const groups=[...p.querySelectorAll('[data-v049-retailer]')];if(state.v056StoreView==='sources')groups.forEach(g=>g.classList.add('v056-hidden'));
    let note=header.querySelector('.v056-view-note');if(!note){note=document.createElement('div');note.className='tiny muted v056-view-note';header.appendChild(note)}
    note.textContent=state.v056StoreView==='deals'?'Deal retailers with actionable crawler leads. Store checks stay separate from crawler evidence.':state.v056StoreView==='sources'?'Nearby sourcing destinations. No inventory or deal is claimed until you inspect or scan an item.':'Deal retailers plus nearby resale-source destinations; evidence types remain separate.';
    renderSourceSection(p);
  };

  if(state.page==='stores')renderStores();
})();
