'use strict';
window.H38_V053_RUNTIME_ACTIVE=true;
window.H38_V053_RUNTIME_MARKER='store-split-age-refresh-store-noise-v053';
(function(){
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toLowerCase().replace(/\b(?:the|a|an)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const retailerKey=v=>{const s=norm(v?.retailer??v);if(s.includes('home depot'))return'home depot';if(s.includes('dollar general'))return'dollar general';if(s.includes('dollar tree'))return'dollar tree';if(s.includes('family dollar'))return'family dollar';if(s.includes('lowe'))return'lowes';return s};
  const signalRaw=l=>text(l?.last_penny_report_at||l?.last_seen||l?.posted_date||l?.penny_date||'');
  const signalLabel=l=>text(l?.last_penny_report_label||l?.last_seen_label||signalRaw(l));
  function age(l){
    const raw=signalRaw(l),direct=Date.parse(raw);
    if(Number.isFinite(direct))return{known:true,days:Math.max(0,Math.floor((Date.now()-direct)/86400000)),ms:direct};
    const label=signalLabel(l).toLowerCase().trim();
    if(!label)return{known:false,days:null,ms:0};
    if(/^(?:today|new|just now)$/.test(label))return{known:true,days:0,ms:Date.now()};
    if(label==='yesterday')return{known:true,days:1,ms:Date.now()-86400000};
    let m=label.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\s*ago/);if(m)return{known:true,days:0,ms:Date.now()-Number(m[1])*60000};
    m=label.match(/(\d+)\s*(?:h|hr|hrs|hour|hours)\s*ago/);if(m)return{known:true,days:0,ms:Date.now()-Number(m[1])*3600000};
    m=label.match(/(\d+)\s*(?:d|day|days)\s*ago/);if(m){const d=Number(m[1]);return{known:true,days:d,ms:Date.now()-d*86400000}}
    m=label.match(/(\d+)\s*(?:w|wk|wks|week|weeks)\s*ago/);if(m){const d=Number(m[1])*7;return{known:true,days:d,ms:Date.now()-d*86400000}}
    return{known:false,days:null,ms:0};
  }
  function agePass(l,f){const a=age(l);switch(f){case'48h':return a.known&&a.days<=2;case'7d':return a.known&&a.days<=7;case'8-14':return a.known&&a.days>=8&&a.days<=14;case'15-30':return a.known&&a.days>=15&&a.days<=30;case'31+':return a.known&&a.days>=31;case'unknown':return!a.known;default:return true}}
  function ageText(l){const a=age(l);if(!a.known)return'UNKNOWN';if(a.days===0)return'TODAY';if(a.days===1)return'1d';return a.days+'d'}
  function leadFor(node){const id=text(node?.dataset?.v049Id);return(state.leads||[]).find(x=>text(x.id)===id)||null}
  function addStyle(){if(document.getElementById('h38-v053-style'))return;const s=document.createElement('style');s.id='h38-v053-style';s.textContent=`
    .v053-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:8px}.v053-controls select{min-height:42px;width:100%}.v053-age-note{margin-top:6px}.v053-retailer-group{margin:7px 0;padding:0;overflow:hidden}.v053-retailer-group>summary{padding:10px 11px;cursor:pointer;list-style:none}.v053-retailer-group>summary::-webkit-details-marker{display:none}.v053-retailer-body{padding:4px 8px 8px}.v053-store-context{margin:7px 0 9px}.v053-refreshing{opacity:.85}.v053-age-unknown{opacity:.65}.v053-store-visibility{margin-top:8px;display:flex;gap:7px;align-items:center}.v053-store-visibility select{min-height:42px;flex:1}.v053-hidden{display:none!important}@media(max-width:520px){.v053-controls{grid-template-columns:1fr}}
  `;document.head.appendChild(s)}
  addStyle();
  if(!text(state.v053AgeFilter))state.v053AgeFilter='all';
  if(!text(state.v053GroupMode))state.v053GroupMode='retailer';
  if(!text(state.v053StoreVisibility))state.v053StoreVisibility='leads';

  const renderClearanceV053Base=renderClearance;
  function enhanceClearance(){
    const p=$('page-clearance');if(!p)return;
    const header=p.querySelector('section.compact-head-v048')||p.querySelector('section.card');
    const host=p.children?.[1];if(!header||!host)return;
    const sort=$('v049Sort');if(sort){if(![...sort.options].some(o=>o.value==='newest'))sort.insertAdjacentHTML('beforeend','<option value="newest">Newest signal first</option><option value="oldest">Oldest signal first</option>');sort.value=state.clearanceSortV048||'priority'}
    let controls=header.querySelector('.v053-controls');if(!controls){controls=document.createElement('div');controls.className='v053-controls';const anchor=header.querySelector('.hunt-controls')||header;anchor.insertAdjacentElement('afterend',controls)}
    const stores=(state.stores||[]).filter(s=>s?.store_key&&s?.retailer),storeOpts=stores.map(s=>`<option value="${esc(s.store_key)}">${esc(s.store_name||s.retailer)} · ${Number.isFinite(Number(s.distance_miles))?Number(s.distance_miles).toFixed(1)+' mi':esc(s.store_address||'')}</option>`).join('');
    controls.innerHTML=`<label class="small"><strong>Signal age</strong><select id="v053Age"><option value="all">All ages</option><option value="48h">Today / 48h</option><option value="7d">7 days or newer</option><option value="8-14">8–14 days</option><option value="15-30">15–30 days</option><option value="31+">31+ days</option><option value="unknown">Unknown date</option></select></label><label class="small"><strong>Split penny list</strong><select id="v053Group"><option value="retailer">By retailer</option><option value="store">By nearby store</option></select></label>${state.v053GroupMode==='store'?`<label class="small" style="grid-column:1/-1"><strong>Nearby store</strong><select id="v053Store"><option value="">Choose a store</option>${storeOpts}</select></label>`:''}`;
    $('v053Age').value=state.v053AgeFilter;$('v053Group').value=state.v053GroupMode;if($('v053Store'))$('v053Store').value=state.v053SelectedStore||'';
    $('v053Age').onchange=e=>{state.v053AgeFilter=e.target.value;renderClearance()};$('v053Group').onchange=e=>{state.v053GroupMode=e.target.value;if(e.target.value!=='store')state.v053SelectedStore='';renderClearance()};if($('v053Store'))$('v053Store').onchange=e=>{state.v053SelectedStore=e.target.value;renderClearance()};
    let nodes=[...p.querySelectorAll('details[data-v049-id]')],items=nodes.map(node=>({node,lead:leadFor(node)})).filter(x=>x.lead);
    for(const x of items){const badge=x.node.querySelector('.age-v048');if(badge){badge.textContent=ageText(x.lead);badge.classList.toggle('v053-age-unknown',!age(x.lead).known)}}
    items=items.filter(x=>agePass(x.lead,state.v053AgeFilter));
    if(state.clearanceSortV048==='newest')items.sort((a,b)=>{const aa=age(a.lead),bb=age(b.lead);if(aa.known!==bb.known)return aa.known?-1:1;return bb.ms-aa.ms});
    else if(state.clearanceSortV048==='oldest')items.sort((a,b)=>{const aa=age(a.lead),bb=age(b.lead);if(aa.known!==bb.known)return aa.known?-1:1;return aa.ms-bb.ms});
    nodes.forEach(n=>n.remove());host.innerHTML='';
    const note=document.createElement('div');note.className='card v053-age-note small muted';note.innerHTML=`Showing <strong>${items.length}</strong> item${items.length===1?'':'s'} for this tab/search at the selected signal age. Age uses the last crawler signal; a true penny-start date remains separate and stays Unknown unless a source published it.${state.v053Refreshing?' <strong>Refreshing… current results stay visible until the refresh finishes.</strong>':''}`;host.appendChild(note);
    const refresh=$('refreshClearance');if(refresh&&state.v053Refreshing){refresh.disabled=true;refresh.textContent='Refreshing…';header.classList.add('v053-refreshing')}
    if(!items.length){const d=document.createElement('div');d.className='card empty';d.textContent='No actionable products match this tab, search, and age filter.';host.appendChild(d);return}
    if(state.v053GroupMode==='store'){
      let selected=stores.find(s=>s.store_key===state.v053SelectedStore);if(!selected){selected=stores.find(s=>items.some(x=>retailerKey(x.lead)===retailerKey(s)));if(selected)state.v053SelectedStore=selected.store_key}
      if(!selected){const d=document.createElement('div');d.className='card empty';d.innerHTML='Load Nearby Stores to split this list by physical store. The underlying retailer leads remain available by retailer.';host.appendChild(d);return}
      const matches=items.filter(x=>retailerKey(x.lead)===retailerKey(selected));const ctx=document.createElement('div');ctx.className='card v053-store-context';ctx.innerHTML=`<strong>${esc(selected.store_name||selected.retailer)}</strong><div class="small muted">${esc(selected.store_address||'')}${Number.isFinite(Number(selected.distance_miles))?' · '+Number(selected.distance_miles).toFixed(1)+' mi':''}</div><div class="notice small" style="margin-top:7px"><strong>${matches.length} chain-wide ${esc(selected.retailer)} candidate${matches.length===1?'':'s'} for this store.</strong> This is a hunt list, not confirmed local inventory. Store/web Check evidence remains independent and cannot erase crawler penny evidence.</div>`;host.appendChild(ctx);for(const x of matches)host.appendChild(x.node);if(!matches.length){const d=document.createElement('div');d.className='card empty';d.textContent='No candidates for this store’s retailer match the current tab/search/age filter.';host.appendChild(d)}
    }else{
      const groups=new Map();for(const x of items){const name=text(x.lead.retailer)||'Other retailer';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(x)}
      let i=0;for(const [name,rows] of groups){const d=document.createElement('details');d.className='card v053-retailer-group';d.dataset.v053Retailer=retailerKey(name);if(state.v053OpenRetailer===d.dataset.v053Retailer||(!state.v053OpenRetailer&&i===0))d.open=true;d.innerHTML=`<summary><div class="store-sum"><div><strong>${esc(name)}</strong><div class="small muted">${rows.length} matching candidate${rows.length===1?'':'s'} · filtered by signal age</div></div><strong>${rows.length}</strong></div></summary><div class="v053-retailer-body"></div>`;const body=d.querySelector('.v053-retailer-body');for(const x of rows)body.appendChild(x.node);d.ontoggle=()=>{if(d.open)state.v053OpenRetailer=d.dataset.v053Retailer};host.appendChild(d);i++}
    }
  }
  renderClearance=function(){let restore=null;if(state.v053Refreshing&&(!Array.isArray(state.leads)||!state.leads.length)&&Array.isArray(state.v053RefreshSnapshot)&&state.v053RefreshSnapshot.length){restore=state.leads;state.leads=state.v053RefreshSnapshot}renderClearanceV053Base();if(restore!==null)state.leads=restore;enhanceClearance()};
  const loadClearanceV053Base=loadClearance;
  loadClearance=async function(force){state.v053RefreshSnapshot=Array.isArray(state.leads)?state.leads.slice():[];state.v053Refreshing=true;if(state.page==='clearance')renderClearance();try{return await loadClearanceV053Base(force)}finally{state.v053Refreshing=false;state.v053RefreshSnapshot=[];if(state.page==='clearance')renderClearance()}};

  const renderStoresV053Base=renderStores;
  function enhanceStores(){const p=$('page-stores');if(!p)return;const header=p.querySelector('section.compact-head-v048')||p.querySelector('section.card');if(!header)return;let ctl=header.querySelector('.v053-store-visibility');if(!ctl){ctl=document.createElement('div');ctl.className='v053-store-visibility';(header.querySelector('.filters')||header).insertAdjacentElement('afterend',ctl)}ctl.innerHTML=`<span class="small"><strong>Show</strong></span><select id="v053StoreVisibility"><option value="leads">Retailers with deals</option><option value="all">All nearby retailers</option></select>`;$('v053StoreVisibility').value=state.v053StoreVisibility;$('v053StoreVisibility').onchange=e=>{state.v053StoreVisibility=e.target.value;renderStores()};const groups=[...p.querySelectorAll('[data-v049-retailer]')];let shown=0;for(const g of groups){const zero=/\b0 actionable chain-wide lead/i.test(text(g.querySelector('summary')?.textContent));const hide=state.v053StoreVisibility==='leads'&&zero;g.classList.toggle('v053-hidden',hide);if(!hide)shown++}let info=header.querySelector('.v053-store-count-note');if(!info){info=document.createElement('div');info.className='tiny muted v053-store-count-note';header.appendChild(info)}info.textContent=state.v053StoreVisibility==='leads'?`${shown} retailer group${shown===1?'':'s'} with actionable leads shown. Zero-lead nearby retailers are still available under “All nearby retailers.”`:`${groups.length} nearby retailer group${groups.length===1?'':'s'} shown.`}
  renderStores=function(){renderStoresV053Base();enhanceStores()};

  if(state.page==='clearance')renderClearance();else if(state.page==='stores')renderStores();
})();
