'use strict';
const H38_DEEP_ACCEPTANCE_V038=true;

// Preserve the v0.1.37 safe-area/camera UX fixes while replacing its page logic.
const setPagePreV038=setPage;
setPage=function(page,opts={}){notice('');return setPagePreV038(page,opts)};
const takePhotoPreV038=takePhoto;
takePhoto=function(role){notice('');return takePhotoPreV038(role)};
window.H38NativePhotoError=text=>{const value=String(text||'Photo capture failed.');const cancelled=/cancel/i.test(value);notice(cancelled?'Photo canceled.':value,cancelled?'warn':'bad');if(cancelled)setTimeout(()=>{if($('globalNotice')?.textContent==='Photo canceled.')notice('')},2500)};

const H38_STRICT_LOCATION_V038=true;
const H38_TRUTHFUL_STORE_GROUPS_V038=true;
const H38_INLINE_STOCK_RESULTS_V038=true;
const H38_NONBLOCKING_REFRESH_V038=true;
const H38_FACEBOOK_DIAGNOSTIC_ONLY_V038=true;
const LAST_LOCATION_V038='h38_reseller_last_location_v038';
const STOCK_CACHE_V038='h38_reseller_stock_results_v038';
state.storeOpenRetailerV038=state.storeOpenRetailerV038||'';
state.storeOpenStoreV038=state.storeOpenStoreV038||'';
state.clearanceOpenRetailerV038=state.clearanceOpenRetailerV038||'';
state.storeRefreshTextV038=state.storeRefreshTextV038||'';
state.clearanceRefreshTextV038=state.clearanceRefreshTextV038||'';
state.dealRefreshTextV038=state.dealRefreshTextV038||'';
state.auctionRefreshTextV038=state.auctionRefreshTextV038||'';
state._v038Jobs=state._v038Jobs||{};

function validCoordinateV038(v){return v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v))}
hasPoint=function(){
  const lat=state.location?.lat,lon=state.location?.lon;
  if(!validCoordinateV038(lat)||!validCoordinateV038(lon))return false;
  const a=Number(lat),o=Number(lon);
  if(a===0&&o===0)return false;
  return a>=-90&&a<=90&&o>=-180&&o<=180;
};
locationBody=function(){return{lat:hasPoint()?Number(state.location.lat):null,lon:hasPoint()?Number(state.location.lon):null,postal:String(state.location.zip||''),radiusMiles:radius()}};

function rememberLocationV038(){
  if(!hasPoint()&&!state.location.zip)return;
  write(LAST_LOCATION_V038,{...state.location,at:Date.now()});
  write('h38_reseller_last_location_v036',{...state.location,at:Date.now()});
}
(function hydrateStrictLocationV038(){
  if(!hasPoint()&&state.location?.mode==='none')state.location={mode:'',lat:null,lon:null,zip:'',label:'Location not set'};
  if(hasPoint()||state.location.zip)return;
  const x=read(LAST_LOCATION_V038,read('h38_reseller_last_location_v036',null));
  if(!x||Date.now()-Number(x.at||0)>12*60*60*1000)return;
  const lat=x.lat,lon=x.lon;
  if(validCoordinateV038(lat)&&validCoordinateV038(lon)&&!(Number(lat)===0&&Number(lon)===0)){
    state.location={mode:x.mode||'phone',lat:Number(lat),lon:Number(lon),zip:String(x.zip||''),label:String(x.label||'Last location')};
  }
})();
window.H38NativeLocationResult=(lat,lon)=>{
  done('location');
  if(!validCoordinateV038(lat)||!validCoordinateV038(lon)||(Number(lat)===0&&Number(lon)===0)){
    state.location={mode:'',lat:null,lon:null,zip:'',label:'Location not set'};
    renderLocation();notice('Phone location did not return a usable position. Try again or use ZIP.','bad');return;
  }
  state.location={mode:'phone',lat:Number(lat),lon:Number(lon),zip:'',label:'Current phone location'};
  rememberLocationV038();renderLocation();notice('Phone location ready.','good');resumeLocationWorkflow();
};
applyZip=async function(){
  const zip=$('zipInput').value.replace(/\D/g,'').slice(0,5);
  if(!/^\d{5}$/.test(zip)){$('zipMsg').innerHTML='<div class="notice bad">Enter a 5-digit ZIP.</div>';return}
  busy('zip','Finding ZIP…');
  try{
    const p=await fn('reseller-location-geocode',{zip});
    if(!p?.location||!validCoordinateV038(p.location.lat)||!validCoordinateV038(p.location.lon))throw new Error('ZIP could not be located.');
    state.location={mode:'zip',lat:Number(p.location.lat),lon:Number(p.location.lon),zip,label:[p.location.city,p.location.state,zip].filter(Boolean).join(', ')};
    rememberLocationV038();$('zipModal').classList.add('hidden');$('zipMsg').innerHTML='';renderLocation();notice('ZIP search ready.','good');resumeLocationWorkflow();
  }catch(e){$('zipMsg').innerHTML='<div class="notice bad">'+esc(err('zip',e))+'</div>'}finally{done('zip')}
};
$('applyZip').onclick=applyZip;
renderLocation();

ensureLocation=async function(){
  if(hasPoint()||/^\d{5}$/.test(String(state.location.zip||'')))return true;
  state.location={mode:'',lat:null,lon:null,zip:'',label:'Location not set'};
  renderLocation();notice('Choose phone location or ZIP for this hunt.','warn');$('locationCard').classList.remove('hidden');requestPhoneLocation();return false;
};
startWorkflow=async function(page,sub){
  if(page==='more'&&sub==='research'){renderResearch();return}
  if(['deals','clearance','stores','auctions'].includes(page)&&!hasPoint()&&!/^\d{5}$/.test(String(state.location.zip||''))){await ensureLocation();return}
  if(page==='deals'&&!state.opportunities.length){runDeals(false);return}
  if(page==='clearance'){
    if(!state.stores.length)await loadStores(false);
    if(!state.leads.length)await loadClearance(false);else renderClearance();
    return;
  }
  if(page==='stores'&&!state.stores.length){loadStores(false);return}
  if(page==='auctions'&&!state.auctions.length){loadAuctions(false);return}
};
resumeLocationWorkflow=function(){
  if(!hasPoint()&&!state.location.zip)return;
  if(state.page==='deals')runDeals(false);
  if(state.page==='stores')loadStores(false);
  if(state.page==='auctions')loadAuctions(false);
  if(state.page==='clearance')loadStores(false).then(()=>state.leads.length?renderClearance():loadClearance(false));
};

function leadIdentityV038(l){
  const retailer=retailerKeyV036(l?.retailer)||String(l?.retailer||'').toLowerCase();
  const upc=String(l?.upc||'').replace(/\D/g,'');
  const skuRaw=String(l?.sku||'').trim().toLowerCase();
  const skuDigits=skuRaw.replace(/\D/g,'');
  const sku=(retailer==='home depot'&&skuDigits.length>=5)?skuDigits:skuRaw.replace(/[^a-z0-9]+/g,'');
  let urlKey='';
  try{const u=new URL(String(l?.source_url||''));urlKey=u.hostname.toLowerCase()+u.pathname.replace(/\/$/,'')}catch(e){}
  const title=String(l?.title||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().slice(0,140);
  return retailer+'|'+(upc.length>=7?'u:'+upc:sku?'s:'+sku:urlKey?'url:'+urlKey:'t:'+title);
}
function dedupeLeadsV038(rows){
  const m=new Map();
  for(const l of Array.isArray(rows)?rows:[]){
    const k=leadIdentityV038(l);if(!k||k.endsWith('|t:'))continue;
    const old=m.get(k);
    const rank=x=>(isPenny(x)?100000:0)+(Number(x.deep_discount)?10000:0)+num(x.source_priority)*10+num(x.discount_pct);
    if(!old||rank(l)>rank(old))m.set(k,l);
  }
  return [...m.values()];
}
matchingStores=function(l){const key=retailerKeyV036(l?.retailer);return state.stores.filter(s=>retailerKeyV036(s?.retailer)===key)};
storeCandidates=function(s){const key=retailerKeyV036(s?.retailer);return dedupeLeadsV038(state.leads.filter(l=>retailerKeyV036(l?.retailer)===key))};

function stableStockResultsV038(){
  const out={};
  for(const [k,v] of Object.entries(state.stock||{}))if(k.includes('|')&&v&&typeof v==='object'&&('stock_checked' in v||'store_bound' in v||'status' in v))out[k]=v;
  return out;
}
function persistStockV038(){write(STOCK_CACHE_V038,{at:Date.now(),results:stableStockResultsV038()})}
(function hydrateStockV038(){const x=read(STOCK_CACHE_V038,null);if(x?.results&&Date.now()-Number(x.at||0)<7*24*60*60*1000)Object.assign(state.stock,x.results)})();

function setupSupportedV038(retailer){const k=retailerKeyV036(retailer);return k==='home depot'||k==='dollar general'}
function checkStateV038(l,s){
  const p=state.stock[stockKey(l,s)];
  const price=Number(p?.current_price),checked=!!p&&(p.stock_checked===true||p.status),bound=!!p?.store_bound,local=bound&&price===.01;
  const qty=p?.stock_count!=null?String(p.stock_count):p?.stock_status==='in_stock'?'IN':p?.stock_status==='out_of_stock'?'OUT':'Qty not exposed';
  return{p,price,checked,bound,local,qty,label:local?'LOCAL $0.01':bound?'STORE VERIFIED':checked?'NOT VERIFIED':isPenny(l)?'PENNY CANDIDATE':'CLEARANCE CANDIDATE'};
}
function inlineCheckHtmlV038(l,s){
  const x=checkStateV038(l,s);
  const cls=x.local?'good':x.bound?'verified':x.checked?'warn':isPenny(l)?'penny':'warn';
  const detail=x.local||x.bound?`${money(x.price)} · ${esc(x.qty)}`:x.checked?esc(x.p?.availability_label||x.p?.message||'Retailer did not return store-bound evidence.'):'Retailer-wide candidate; not confirmed at this store.';
  return `<div class="small" data-inline-stock="${esc(stockKey(l,s))}"><span class="badge ${cls}">${esc(x.label)}</span> ${detail}</div>`;
}
function candidateRowV038(l,s){
  return `<div class="watch-row" data-clear-id="${esc(l.id||'')}" data-store-candidate="${esc(stockKey(l,s))}"><strong>${esc(l.title||'Candidate')}</strong><div class="small muted">${l.upc?'UPC '+esc(l.upc):''}${l.sku?(l.upc?' · ':'')+'Model '+esc(l.sku):''}${num(l.discount_pct)>0?' · '+num(l.discount_pct).toFixed(0)+'% reported':''}</div>${inlineCheckHtmlV038(l,s)}<div class="actions"><button class="secondary" data-v038-verify="${esc(l.id||'')}" data-store-key="${esc(s.store_key)}">${checkStateV038(l,s).checked?'Recheck':'Verify'}</button>${l.source_url?`<button class="secondary" data-open="${esc(l.source_url)}">Source</button>`:''}</div></div>`;
}
function requestBodyV038(l,s){return{retailer:s.retailer||l.retailer,title:l.title||'',upc:l.upc||'',sku:l.sku||'',source_url:l.source_url||'',store_key:s.store_key,store_name:s.store_name||s.retailer,store_address:s.store_address||'',store_lat:s.lat??null,store_lon:s.lon??null}}
function completeCheckV038(requestId,p,renderAfter=true){
  const job=state._v038Jobs[requestId];if(!job)return;
  delete state._v038Jobs[requestId];if(job.timer)clearTimeout(job.timer);
  const l=state.leads.find(x=>String(x.id)===String(job.leadId)),s=state.stores.find(x=>x.store_key===job.storeKey);
  if(l&&s){state.stock[stockKey(l,s)]={...p,checked_at:new Date().toISOString()};persistStockV038();diag('stock',{retailer:s.retailer,status:p?.status||'unknown',store_bound:!!p?.store_bound,current_price:p?.current_price??null,stock_count:p?.stock_count??null})}
  if(job.resolve)job.resolve(p||{});
  if(renderAfter){if(state.page==='stores')renderStores();if(state.page==='clearance')renderClearance()}
}
window.H38DeviceStockResult=(requestId,json)=>{let p={};try{p=JSON.parse(String(json||'{}'))}catch(e){p={status:'check_failed',stock_checked:true,store_bound:false,availability_label:'Could not read retailer result.'}}completeCheckV038(requestId,p,true)};
async function checkCandidateAtStoreV038(l,s,renderAfter=true){
  const requestId='v038-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),body=requestBodyV038(l,s);
  if((retailerKeyV036(s.retailer)==='home depot'||retailerKeyV036(s.retailer)==='dollar general')&&bridge()?.startDeviceStockCheck){
    return new Promise(resolve=>{
      const timer=setTimeout(()=>completeCheckV038(requestId,{status:'device_timeout',stock_checked:true,store_bound:false,availability_label:'Retailer device check timed out; no local claim made.'},renderAfter),18000);
      state._v038Jobs[requestId]={leadId:l.id,storeKey:s.store_key,resolve,timer};
      try{bridge().startDeviceStockCheck(requestId,JSON.stringify(body))}catch(e){completeCheckV038(requestId,{status:'device_unavailable',stock_checked:true,store_bound:false,availability_label:'Retailer device check could not start.'},renderAfter)}
    });
  }
  let p;
  try{p=await fn('reseller-stock-check',body,22000)}catch(e){p={status:'check_failed',stock_checked:true,store_bound:false,availability_label:err('stock',e)}}
  state._v038Jobs[requestId]={leadId:l.id,storeKey:s.store_key,resolve:null,timer:null};completeCheckV038(requestId,p,renderAfter);return p;
}
verifyLead=async function(id,button){
  const l=state.leads.find(x=>String(x.id)===String(id));if(!l)return;
  let s=null;
  if(button?.dataset?.storeKey)s=state.stores.find(x=>x.store_key===button.dataset.storeKey);
  if(!s){const card=button?.closest?.('[data-clear-id]'),select=card?.querySelector?.('[data-store-select]');s=state.stores.find(x=>x.store_key===select?.value)||matchingStores(l)[0]}
  if(!s){notice('Load a matching nearby store first.','warn');return}
  if(button&&'disabled' in button){button.disabled=true;button.textContent='Checking…'}
  await checkCandidateAtStoreV038(l,s,true);
};
async function autoCheckStoreV038(storeKey,button){
  const s=state.stores.find(x=>x.store_key===storeKey);if(!s)return;
  const candidates=storeCandidates(s).filter(l=>!checkStateV038(l,s).checked).sort((a,b)=>Number(isPenny(b))-Number(isPenny(a))||num(b.discount_pct)-num(a.discount_pct)).slice(0,5);
  if(!candidates.length){if(button){button.textContent='Top candidates already checked';button.disabled=true}return}
  if(button)button.disabled=true;
  for(let i=0;i<candidates.length;i++){
    if(button)button.textContent=`Checking ${i+1} of ${candidates.length}…`;
    await checkCandidateAtStoreV038(candidates[i],s,false);
  }
  if(state.page==='stores')renderStores();if(state.page==='clearance')renderClearance();
}
function bindVerifyV038(root){
  root.querySelectorAll('[data-v038-verify]').forEach(b=>b.onclick=()=>verifyLead(b.dataset.v038Verify,b));
  root.querySelectorAll('[data-v038-auto]').forEach(b=>b.onclick=()=>autoCheckStoreV038(b.dataset.v038Auto,b));
  root.querySelectorAll('[data-store-session]').forEach(b=>b.onclick=()=>openRetailerSession(b.dataset.storeSession));
  bindOpen(root);
}

loadClearance=async function(force){
  if(!hasPoint()&&!state.location.zip){await ensureLocation();return}
  const btn=$('refreshClearance');
  if(force){if(btn){btn.disabled=true;btn.textContent='Refreshing…'}state.clearanceRefreshTextV038='Refreshing in background…'}else busy('clearance','Loading clearance candidates…','Retail candidates are not local-verified until a selected store exposes price or availability.');
  try{
    const p=await fn('reseller-auto-leads',{},40000),raw=Array.isArray(p.leads)?p.leads:[];
    state.leads=dedupeLeadsV038(raw);
    state.clearanceRefreshTextV038=`${state.leads.length} unique candidates${raw.length!==state.leads.length?' · '+(raw.length-state.leads.length)+' duplicates removed':''}`;
    diag('clearance',{status:'pass',source_status:p.source_status||[],by_retailer:p.by_retailer||{},raw_count:raw.length,unique_count:state.leads.length});
    renderClearance();if(!force)notice(`Loaded ${state.leads.length} unique retail sourcing candidates.`,'good');
  }catch(e){state.clearanceRefreshTextV038='Refresh failed · previous results kept';if(!force)notice('Clearance feed unavailable: '+err('clearance',e),'bad');else err('clearance',e);renderClearance()}finally{if(!force)done('clearance')}
};
loadStores=async function(force){
  if(!hasPoint()){await ensureLocation();return}
  const btn=$('refreshStores');if(force){if(btn){btn.disabled=true;btn.textContent='Refreshing…'}state.storeRefreshTextV038='Refreshing in background…'}else busy('stores','Finding nearby stores…');
  try{
    const p=await fn('reseller-nearby-stores',{lat:Number(state.location.lat),lon:Number(state.location.lon),radiusMiles:radius()});
    const map=new Map();for(const s of (Array.isArray(p.stores)?p.stores:[]).filter(validStore)){const k=String(s.store_key||[retailerKeyV036(s.retailer),s.store_address,Number(s.lat||0).toFixed(4),Number(s.lon||0).toFixed(4)].join('|'));if(!map.has(k))map.set(k,s)}
    state.stores=[...map.values()].sort((a,b)=>num(a.distance_miles)-num(b.distance_miles));
    state.storeRefreshTextV038=`${state.stores.length} nearby stores${p.stale?' · showing last good list':''}`;diag('stores',{status:'pass',count:state.stores.length,warning:p.warning||'',stale:!!p.stale});
    if(state.page==='clearance')renderClearance();else renderStores();if(!force)notice(`Loaded ${state.stores.length} nearby stores.`,'good');
  }catch(e){state.storeRefreshTextV038='Refresh failed · previous stores kept';if(!force)notice('Nearby store lookup unavailable: '+err('stores',e),'bad');else err('stores',e);renderStores()}finally{if(!force)done('stores')}
};

function storeSummaryCountsV038(s,candidates){
  const checked=candidates.filter(l=>checkStateV038(l,s).checked).length,verified=candidates.filter(l=>checkStateV038(l,s).bound).length,local=candidates.filter(l=>checkStateV038(l,s).local).length;
  return{checked,verified,local};
}
function storeBodyV038(s,candidates){
  const c=storeSummaryCountsV038(s,candidates),verifiedRows=candidates.filter(l=>checkStateV038(l,s).bound),top=candidates.slice(0,12);
  return `<div class="store-body"><div class="actions">${setupSupportedV038(s.retailer)?`<button class="secondary" data-store-session="${esc(s.store_key)}">Open store setup</button>`:''}${flyer(s.retailer)?`<button class="secondary" data-open="${esc(flyer(s.retailer))}">Ad / flyer</button>`:''}${candidates.length?`<button data-v038-auto="${esc(s.store_key)}">Auto-check top 5</button>`:''}</div>${!setupSupportedV038(s.retailer)?'<div class="tiny muted" style="margin-top:7px">Direct store-session setup is not supported for this retailer; Scout will not send you to a generic web search.</div>':''}${verifiedRows.length?`<h3 style="margin-top:12px">Verified at this store</h3>${verifiedRows.map(l=>candidateRowV038(l,s)).join('')}`:''}${candidates.length?`<details class="candidate-queue"><summary><strong>${candidates.length} retailer candidates available to check</strong><div class="tiny muted">These are not this store's inventory until a store-bound check succeeds.</div></summary><div class="store-body">${top.map(l=>candidateRowV038(l,s)).join('')}${candidates.length>12?`<div class="tiny muted">Showing first 12 of ${candidates.length}; Auto-check prioritizes the top five.</div>`:''}</div></details>`:'<div class="empty">No retailer candidate feed is loaded for this store.</div>'}</div>`;
}
function retailerGroupV038(name,stores,candidates){
  const key=retailerKeyV036(name),verified=stores.reduce((n,s)=>n+candidates.filter(l=>checkStateV038(l,s).bound).length,0),local=stores.reduce((n,s)=>n+candidates.filter(l=>checkStateV038(l,s).local).length,0),open=state.storeOpenRetailerV038===key;
  return `<details class="card retailer-store-group" data-retailer-group="${esc(key)}" ${open?'open':''}><summary><div class="store-sum"><div><strong>${esc(name)}</strong><div class="small muted">${stores.length} locations · ${candidates.length} retailer candidates${verified?' · '+verified+' store verified':''}${local?' · '+local+' local 1¢':''}</div></div></div></summary><div class="store-body">${stores.map(s=>{const c=storeSummaryCountsV038(s,candidates),openStore=state.storeOpenStoreV038===s.store_key;return `<details class="store" data-v038-store="${esc(s.store_key)}" ${openStore?'open':''}><summary><div class="store-sum"><div><strong>${esc(s.store_name||s.retailer)}</strong><div class="small muted">${esc(s.store_address||'')}</div><div class="tiny muted">${c.verified} verified${c.local?' · '+c.local+' local 1¢':''}${c.checked&&!c.verified?' · '+c.checked+' checked':''}</div></div><strong>${Number.isFinite(Number(s.distance_miles))?Number(s.distance_miles).toFixed(1)+' mi':'—'}</strong></div></summary>${storeBodyV038(s,candidates)}</details>`}).join('')}</div></details>`;
}
renderStores=function(){
  const p=$('page-stores');if(!p)return;
  const names=[...new Set(state.stores.map(s=>s.retailer).filter(Boolean))].sort(),filter=state.storeRetailer;
  let list=filter?state.stores.filter(s=>s.retailer===filter):state.stores.slice();
  const groups=new Map();for(const s of list){const key=s.retailer||'Other';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s)}
  const withCandidates=[],other=[];for(const [name,stores] of groups){const cand=dedupeLeadsV038(state.leads.filter(l=>retailerKeyV036(l.retailer)===retailerKeyV036(name)));(cand.length?withCandidates:other).push({name,stores,cand})}
  const sortGroup=(a,b)=>num(a.stores[0]?.distance_miles)-num(b.stores[0]?.distance_miles);withCandidates.sort(sortGroup);other.sort(sortGroup);
  p.innerHTML=`<section class="card"><div class="workflow-head"><div><h2>Nearby Stores</h2><div class="muted small">Retailer candidate counts are shown once at retailer level. Physical store rows show only checks actually completed for that store.</div><div class="source-status">${esc(state.storeRefreshTextV038||`${state.stores.length} within ${radius()} miles`)}</div></div><button id="refreshStores" class="secondary">Refresh</button></div><div class="filters" style="margin-top:10px"><select id="storeRetailer"><option value="">All retailers</option>${names.map(n=>`<option ${n===filter?'selected':''}>${esc(n)}</option>`).join('')}</select></div></section>${withCandidates.length?`<section class="card"><h3>Stores with Scout candidates</h3><div class="small muted">Expand a retailer, then a physical store. Use Auto-check top 5 instead of verifying every candidate manually.</div></section>${withCandidates.map(g=>retailerGroupV038(g.name,g.stores,g.cand)).join('')}`:''}${other.length?`<details class="card"><summary><strong>Other nearby stores · ${other.reduce((n,g)=>n+g.stores.length,0)} locations</strong><div class="small muted">No active retailer candidate feed loaded.</div></summary><div class="store-body">${other.map(g=>retailerGroupV038(g.name,g.stores,g.cand)).join('')}</div></details>`:''}${!list.length?'<section class="card"><div class="empty">No nearby store list loaded yet.</div></section>':''}`;
  $('refreshStores').onclick=()=>loadStores(true);$('storeRetailer').onchange=e=>{state.storeRetailer=e.target.value;renderStores()};
  p.querySelectorAll('[data-retailer-group]').forEach(d=>d.ontoggle=()=>{if(d.open)state.storeOpenRetailerV038=d.dataset.retailerGroup});
  p.querySelectorAll('[data-v038-store]').forEach(d=>d.ontoggle=()=>{if(d.open)state.storeOpenStoreV038=d.dataset.v038Store});bindVerifyV038(p);
};

function clearanceRetailerV038(key,g){
  const stores=state.stores.filter(s=>retailerKeyV036(s.retailer)===key).sort((a,b)=>num(a.distance_miles)-num(b.distance_miles)),open=state.clearanceOpenRetailerV038===key;
  const verifiedTotal=stores.reduce((n,s)=>n+g.leads.filter(l=>checkStateV038(l,s).bound).length,0),localTotal=stores.reduce((n,s)=>n+g.leads.filter(l=>checkStateV038(l,s).local).length,0);
  const storeRows=stores.map(s=>{const c=storeSummaryCountsV038(s,g.leads),viewKey=s.store_key+'|'+state.clearanceFilter,openStore=state.clearanceOpenStore===viewKey;return `<details class="store" data-clear-store="${esc(s.store_key)}" ${openStore?'open':''}><summary><div class="store-sum"><div><strong>${esc(s.store_name||s.retailer)}</strong><div class="small muted">${esc(s.store_address||'')}</div><div class="tiny muted">${c.verified} verified${c.local?' · '+c.local+' local 1¢':''}${c.checked&&!c.verified?' · '+c.checked+' checked':''}</div></div><strong>${Number.isFinite(Number(s.distance_miles))?Number(s.distance_miles).toFixed(1)+' mi':'—'}</strong></div></summary>${storeBodyV038(s,g.leads)}</details>`}).join('');
  const unmatched=!stores.length?`<details class="store"><summary><strong>Unmatched / retailer-wide candidates · ${g.leads.length}</strong></summary><div class="store-body">${g.leads.slice(0,12).map(l=>`<div class="watch-row"><strong>${esc(l.title||'Candidate')}</strong><div class="small muted">${l.upc?'UPC '+esc(l.upc):''}${l.sku?(l.upc?' · ':'')+'Model '+esc(l.sku):''}</div>${l.source_url?`<button class="secondary" data-open="${esc(l.source_url)}">Source</button>`:''}</div>`).join('')}</div></details>`:'';
  return `<details class="card" data-clear-retailer="${esc(key)}" ${open?'open':''}><summary><div class="store-sum"><div><strong>${esc(g.name)}</strong><div class="small muted">${stores.length} stores · ${g.leads.length} unique retailer candidates${verifiedTotal?' · '+verifiedTotal+' verified':''}${localTotal?' · '+localTotal+' local 1¢':''}</div></div></div></summary><div class="store-body">${storeRows||unmatched}</div></details>`;
}
renderClearance=function(){
  const p=$('page-clearance');if(!p)return;
  const rows=dedupeLeadsV038(clearanceRowsV036()),verified=state.leads.filter(l=>matchingStores(l).some(s=>checkStateV038(l,s).bound)).length,local=state.leads.filter(l=>matchingStores(l).some(s=>checkStateV038(l,s).local)).length;
  const groups=new Map();for(const l of rows){const key=retailerKeyV036(l.retailer)||'unknown';if(!groups.has(key))groups.set(key,{name:retailerLabelV036(l.retailer),leads:[]});groups.get(key).leads.push(l)}
  p.innerHTML=`<section class="card"><div class="workflow-head"><div><h2>Penny & Clearance</h2><div class="muted small">Retailer → physical store → candidate queue. Candidate counts belong to the retailer; physical stores show only store-bound verification.</div><div class="source-status">${esc(state.clearanceRefreshTextV038||'Retail candidates are not local inventory until verified.')}</div></div><button id="refreshClearance" class="secondary">Refresh</button></div><div class="stats" style="margin-top:10px"><div class="stat"><strong>${state.leads.filter(isPenny).length}</strong><span>PENNY CANDIDATES</span></div><div class="stat"><strong>${state.leads.length}</strong><span>UNIQUE CANDIDATES</span></div><div class="stat"><strong>${verified}</strong><span>STORE VERIFIED</span></div><div class="stat"><strong>${local}</strong><span>LOCAL 1¢</span></div></div><div class="tabs"><button data-cfilter="penny">Penny</button><button data-cfilter="all">All Clearance</button><button data-cfilter="verified">Verified Local</button></div></section>${groups.size?[...groups.entries()].map(([key,g])=>clearanceRetailerV038(key,g)).join(''):'<section class="card"><div class="empty">No candidates match this view yet.</div></section>'}`;
  p.querySelectorAll('[data-cfilter]').forEach(b=>{b.classList.toggle('active',b.dataset.cfilter===state.clearanceFilter);b.onclick=()=>{state.clearanceFilter=b.dataset.cfilter;renderClearance()}});$('refreshClearance').onclick=()=>loadClearance(true);
  p.querySelectorAll('[data-clear-retailer]').forEach(d=>d.ontoggle=()=>{if(d.open)state.clearanceOpenRetailerV038=d.dataset.clearRetailer});
  p.querySelectorAll('[data-clear-store]').forEach(d=>d.ontoggle=()=>{if(d.open)state.clearanceOpenStore=d.dataset.clearStore+'|'+state.clearanceFilter});bindVerifyV038(p);
};

runDeals=async function(force){
  if(!hasPoint()&&!state.location.zip){await ensureLocation();return}
  const btn=$('refreshDeals');if(force){if(btn){btn.disabled=true;btn.textContent='Refreshing…'}state.dealRefreshTextV038='Refreshing in background…'}else busy('deals','Finding resale opportunities…','Craigslist and captured Facebook candidates are checked for sold-comp support.');
  try{const p=await fn('reseller-opportunity-scan-v4',{sources:['Craigslist','Facebook Marketplace'],terms:watchTerms(),facebookCandidates:fbRows(),...locationBody()},45000);state.opportunities=Array.isArray(p.opportunities)?p.opportunities:[];state.dealRefreshTextV038=`${state.opportunities.length} profit-supported opportunities`;diag('deals',{status:p.status||'PASS',source_summary:p.source_summary||{},count:state.opportunities.length});renderDeals();if(!force)notice(state.opportunities.length?`Found ${state.opportunities.length} profit-supported resale opportunities.`:'No profit-supported resale opportunities passed evidence checks right now.',state.opportunities.length?'good':'warn')}catch(e){state.dealRefreshTextV038='Refresh failed · previous results kept';if(!force)notice('Deal scan unavailable: '+err('deals',e),'bad');else err('deals',e);renderDeals()}finally{if(!force)done('deals')}
};
renderDeals=function(){const p=$('page-deals');if(!p)return;const diagRun=state.diagnostics.runs.deals?.data||{};p.innerHTML=`<section class="card"><div class="workflow-head"><div><h2>Deals</h2><div class="muted small">Verified resale opportunities only. Manual Facebook browsing is kept under More → Source Connections, not in the normal hunt.</div><div class="source-status">${esc(state.dealRefreshTextV038||'Automatic source scan')}</div></div><button id="refreshDeals" class="secondary">Refresh</button></div></section><section class="card"><div class="stats"><div class="stat"><strong>${state.opportunities.length}</strong><span>PROFIT-SUPPORTED</span></div><div class="stat"><strong>${watches().length}</strong><span>WATCH ITEMS</span></div><div class="stat"><strong>${fbRows().length}</strong><span>FB CAPTURED</span></div><div class="stat"><strong>${radius()}</strong><span>MILE RADIUS</span></div></div></section><section class="card"><h3>Resale opportunities</h3><div>${state.opportunities.length?state.opportunities.map(oppCard).join(''):'<div class="empty">No verified profit-supported opportunities loaded yet.</div>'}</div><div class="source-status">${sourceSummaryHtml(diagRun.source_summary)}</div></section>`;$('refreshDeals').onclick=()=>runDeals(true);bindOpen(p)};

loadAuctions=async function(force){
  if(!hasPoint()&&!state.location.zip){await ensureLocation();return}
  const btn=$('refreshAuctions');if(force){if(btn){btn.disabled=true;btn.textContent='Refreshing…'}state.auctionRefreshTextV038='Refreshing in background…'}else busy('auctions','Finding local auctions…','Auction discovery does not require profit verification.');
  try{const p=await fn('reseller-auction-discovery',{...locationBody(),filter:state.auctionFilter},35000);state.auctions=Array.isArray(p.auctions)?p.auctions:[];state.auctionSummary=p.summary||{};state.auctionRefreshTextV038=`${state.auctions.length} auction events`;diag('auctions',{status:p.status||'PASS',count:state.auctions.length,summary:p.summary||{},source:p.source||'HiBid'});renderAuctions();if(!force)notice(state.auctions.length?`Found ${state.auctions.length} nearby auction events.`:'No matching local auction events were discovered right now.',state.auctions.length?'good':'warn')}catch(e){state.auctionRefreshTextV038='Refresh failed · previous results kept';if(!force)notice('Auction discovery unavailable: '+err('auctions',e),'bad');else err('auctions',e);renderAuctions()}finally{if(!force)done('auctions')}
};
renderAuctions=function(){const p=$('page-auctions');if(!p)return;p.innerHTML=`<section class="card"><div class="workflow-head"><div><h2>Auctions</h2><div class="muted small">Discovery results only; no invented profit, premium or inventory claims.</div><div class="source-status">${esc(state.auctionRefreshTextV038||'HiBid discovery')}</div></div><button id="refreshAuctions" class="secondary">Refresh</button></div><div class="tabs"><button data-afilter="near">Near me</button><button data-afilter="ending">Ending soon</button><button data-afilter="pickup">Online / local pickup</button><button data-afilter="physical">Physical auctions</button></div></section><section class="card"><div>${state.auctions.length?state.auctions.map(auctionCard).join(''):'<div class="empty">No auction events loaded yet.</div>'}</div></section>`;p.querySelectorAll('[data-afilter]').forEach(b=>{b.classList.toggle('active',b.dataset.afilter===state.auctionFilter);b.onclick=()=>{state.auctionFilter=b.dataset.afilter;loadAuctions(true)}});$('refreshAuctions').onclick=()=>loadAuctions(true);bindOpen(p)};

function renderSourceConnectionsV038(){
  state.subpage='sources';$('topSub').textContent='Source Connections';$('locationCard').classList.add('hidden');const p=$('page-more');
  p.innerHTML=`<section class="card"><div class="workflow-head"><div><h2>Source Connections</h2><div class="muted small">Optional source maintenance only. These tools are not part of the normal automatic hunt.</div></div><button id="backMore" class="secondary">More</button></div></section><section class="card"><h3>Facebook Marketplace</h3><div class="small muted">${fbRows().length} captured listing candidates · notification access ${bridge()?.notificationAccessEnabled?.()?'enabled':'not enabled'}</div><div class="actions" style="margin-top:10px"><button id="sourceFacebook" class="secondary">Open Facebook source session</button><button id="sourceNotifications" class="secondary">Notification access</button></div></section>`;
  $('backMore').onclick=()=>{state.subpage=null;renderMore()};$('sourceFacebook').onclick=openFacebook;$('sourceNotifications').onclick=()=>{try{bridge()?.openNotificationAccessSettings?.()}catch(e){notice('Notification settings could not open.','bad')}};
}
renderMore=function(){
  const p=$('page-more');if(!p)return;if(state.subpage==='research'){renderResearch();return}if(state.subpage==='watch'){renderWatch();return}if(state.subpage==='inventory'){renderInventory();return}if(state.subpage==='diagnostics'){renderDiagnostics();return}if(state.subpage==='settings'){renderSettings();return}if(state.subpage==='sources'){renderSourceConnectionsV038();return}
  p.innerHTML=`<section class="card"><h2>More</h2><div class="muted small">Secondary tools stay out of the primary sourcing flow.</div></section><section class="card"><div class="more-grid"><button data-more="research"><strong>Research / Scan Item</strong><span>Photo, barcode, typed model, sold evidence and flip analysis.</span></button><button data-more="watch"><strong>Watch Items</strong><span>Saved hunt rules feed future deal discovery.</span></button><button data-more="inventory"><strong>Inventory</strong><span>Bought, listed and sold items.</span></button><button data-more="settings"><strong>Location & Radius</strong><span>Phone / ZIP and 25–150 mile search radius.</span></button><button data-more="sources"><strong>Source Connections</strong><span>Optional Facebook session and notification access.</span></button><button data-more="diagnostics"><strong>Diagnostics</strong><span>Source boundaries, failures and counts.</span></button><button id="startAnother"><strong>Start Another Hunt</strong><span>Return to the hunt launcher without clearing results.</span></button></div></section>`;p.querySelectorAll('[data-more]').forEach(b=>b.onclick=()=>setPage('more',{subpage:b.dataset.more,start:false}));$('startAnother').onclick=showLauncher;
};

renderDiagnostics=function(){state.subpage='diagnostics';const p=$('page-more'),runs=Object.entries(state.diagnostics.runs).sort((a,b)=>num(b[1].at)-num(a[1].at));p.innerHTML=`<section class="card"><div class="workflow-head"><div><h2>Diagnostics</h2><div class="muted small">Raw coordinates live here only. Unset location can never appear as 0,0.</div></div><button id="backMore" class="secondary">More</button></div><div class="diag-row"><strong>Build</strong><div class="small muted">v0.1.38 · ${esc(String(bridge()?.build?.()||'web'))}</div></div><div class="diag-row"><strong>Location</strong><div class="small muted">${hasPoint()?Number(state.location.lat).toFixed(5)+', '+Number(state.location.lon).toFixed(5):'not set'} · ${radius()} mi · ${esc(state.location.mode||'none')}</div></div><div class="diag-row"><strong>Facebook</strong><div class="small muted">${fbRows().length} captured candidates · optional source connection</div></div>${runs.map(([name,r])=>`<div class="diag-row"><strong>${esc(name)}</strong><div class="small muted">${new Date(r.at).toLocaleString()} · ${esc(JSON.stringify(r.data).slice(0,900))}</div></div>`).join('')}${state.diagnostics.errors.length?`<h3 style="margin-top:12px">Recent errors</h3>${state.diagnostics.errors.map(e=>`<div class="diag-row"><strong>${esc(e.name)}</strong><div class="small muted">${esc(e.text)} · ${new Date(e.at).toLocaleString()}</div></div>`).join('')}`:''}</section>`;$('backMore').onclick=()=>{state.subpage=null;renderMore()}};
