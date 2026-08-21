'use strict';
const H38_PHYSICAL_ACCEPTANCE_REPAIR_V037=true;

// Page-specific notices must not follow the owner into an unrelated workflow.
const setPageV037=setPage;
setPage=function(page,opts={}){notice('');return setPageV037(page,opts)};

// Clear stale notices before opening native capture tools.
const takePhotoV037=takePhoto;
takePhoto=function(role){notice('');return takePhotoV037(role)};

// Camera cancellation is informational and should not poison the next workflow.
window.H38NativePhotoError=text=>{
  const value=String(text||'Photo capture failed.');
  const cancelled=/cancel/i.test(value);
  notice(cancelled?'Photo canceled.':value,cancelled?'warn':'bad');
  if(cancelled)setTimeout(()=>{if($('globalNotice')?.textContent==='Photo canceled.')notice('')},2500);
};

function clearanceRetailerGroupV037(key,g){
  const stores=state.stores.filter(s=>retailerKeyV036(s.retailer)===key).sort((a,b)=>num(a.distance_miles)-num(b.distance_miles));
  const verifiedTotal=g.leads.filter(l=>stores.some(s=>state.stock[stockKey(l,s)]?.store_bound)).length;
  const localTotal=g.leads.filter(l=>stores.some(s=>state.stock[stockKey(l,s)]?.store_bound&&Number(state.stock[stockKey(l,s)]?.current_price)===.01)).length;
  const storeRows=stores.map(s=>{
    const viewKey=s.store_key+'|'+state.clearanceFilter;
    const verifiedHere=g.leads.filter(l=>state.stock[stockKey(l,s)]?.store_bound);
    const localHere=verifiedHere.filter(l=>Number(state.stock[stockKey(l,s)]?.current_price)===.01);
    const showAll=!!state.clearanceShowAll[viewKey];
    const shown=showAll?g.leads:g.leads.slice(0,12);
    return `<details class="store" data-clear-store="${esc(s.store_key)}" ${state.clearanceOpenStore===viewKey?'open':''}>
      <summary><div class="store-sum"><div><strong>${esc(s.store_name||s.retailer)}</strong><div class="small muted">${esc(s.store_address||'')}</div><div class="tiny muted">${verifiedHere.length} verified${localHere.length?' · '+localHere.length+' local 1¢':''}</div></div><strong>${Number.isFinite(Number(s.distance_miles))?Number(s.distance_miles).toFixed(1)+' mi':'—'}</strong></div></summary>
      <div class="store-body">
        <div class="actions"><button class="secondary" data-store-session="${esc(s.store_key)}">Open store setup</button>${flyer(s.retailer)?`<button class="secondary" data-open="${esc(flyer(s.retailer))}">Ad / flyer</button>`:''}</div>
        ${verifiedHere.length?`<h3 style="margin-top:12px">Verified at this store</h3>${verifiedHere.map(l=>clearanceStoreItemV036(l,s)).join('')}`:''}
        <details class="candidate-queue"><summary><strong>${g.leads.length} retailer candidates to check here</strong><div class="tiny muted">Not store inventory until verification succeeds.</div></summary><div class="store-body">${shown.map(l=>clearanceStoreItemV036(l,s)).join('')}${g.leads.length>12?`<button class="secondary" data-clear-show="${esc(viewKey)}">${showAll?'Show first 12':'Show all '+g.leads.length+' candidates'}</button>`:''}</div></details>
      </div>
    </details>`;
  }).join('');
  const unmatched=!stores.length?`<details class="store"><summary><div class="store-sum"><div><strong>Unmatched / retailer-wide candidates</strong><div class="small muted">${g.leads.length} candidates · no matching nearby store loaded</div></div></div></summary><div class="store-body">${g.leads.slice(0,12).map(l=>clearanceStoreItemV036(l,null)).join('')}</div></details>`:'';
  return `<section class="card"><div class="section-head"><h3>${esc(g.name)}</h3><span class="badge">${stores.length} stores · ${g.leads.length} retailer candidates${verifiedTotal?' · '+verifiedTotal+' verified':''}${localTotal?' · '+localTotal+' local 1¢':''}</span></div>${storeRows||unmatched}</section>`;
}

renderClearance=function(){
  const p=$('page-clearance');if(!p)return;
  const rows=clearanceRowsV036();
  const verified=state.leads.filter(l=>matchingStores(l).some(s=>state.stock[stockKey(l,s)]?.store_bound)).length;
  const local=state.leads.filter(l=>matchingStores(l).some(s=>Number(state.stock[stockKey(l,s)]?.current_price)===.01&&state.stock[stockKey(l,s)]?.store_bound)).length;
  const groups=new Map();
  for(const l of rows){const key=retailerKeyV036(l.retailer)||'unknown';if(!groups.has(key))groups.set(key,{name:retailerLabelV036(l.retailer),leads:[]});groups.get(key).leads.push(l)}
  p.innerHTML=`<section class="card"><div class="workflow-head"><div><h2>Penny & Clearance</h2><div class="muted small">Retailer → physical store → collapsible candidate queue. Retailer candidates are never presented as local inventory until a store-bound check succeeds.</div></div><button id="refreshClearance" class="secondary">Refresh</button></div><div class="stats" style="margin-top:10px"><div class="stat"><strong>${state.leads.filter(isPenny).length}</strong><span>PENNY CANDIDATES</span></div><div class="stat"><strong>${state.leads.length}</strong><span>ALL CLEARANCE</span></div><div class="stat"><strong>${verified}</strong><span>STORE VERIFIED</span></div><div class="stat"><strong>${local}</strong><span>LOCAL 1¢</span></div></div><div class="tabs"><button data-cfilter="penny">Penny</button><button data-cfilter="all">All Clearance</button><button data-cfilter="verified">Verified Local</button></div></section>${groups.size?[...groups.entries()].map(([key,g])=>clearanceRetailerGroupV037(key,g)).join(''):'<section class="card"><div class="empty">No candidates match this view yet.</div></section>'}`;
  p.querySelectorAll('[data-cfilter]').forEach(b=>{b.classList.toggle('active',b.dataset.cfilter===state.clearanceFilter);b.onclick=()=>{state.clearanceFilter=b.dataset.cfilter;renderClearance()}});
  $('refreshClearance').onclick=()=>loadClearance(true);
  p.querySelectorAll('[data-clear-store]').forEach(d=>d.ontoggle=()=>{if(d.open)state.clearanceOpenStore=d.getAttribute('data-clear-store')+'|'+state.clearanceFilter});
  p.querySelectorAll('[data-clear-show]').forEach(b=>b.onclick=e=>{e.preventDefault();state.clearanceShowAll[b.dataset.clearShow]=!state.clearanceShowAll[b.dataset.clearShow];state.clearanceOpenStore=b.dataset.clearShow;renderClearance()});
  p.querySelectorAll('[data-store-session]').forEach(b=>b.onclick=()=>openRetailerSession(b.dataset.storeSession));
  bindStoreCandidateVerifyV036(p);bindOpen(p);
};
