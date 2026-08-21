'use strict';
function renderDiagnosticsIfOpen(){if(state.page==='more'&&state.subpage==='diagnostics')renderDiagnostics()}
function renderDiagnostics(){state.subpage='diagnostics';const p=$('page-more'),runs=Object.entries(state.diagnostics.runs).sort((a,b)=>num(b[1].at)-num(a[1].at));p.innerHTML=`<section class="card"><div class="workflow-head"><div><h2>Diagnostics</h2><div class="muted small">Source failures stay here instead of leaking into shopping pages.</div></div><button id="backMore" class="secondary">More</button></div><div class="diag-row"><strong>Build</strong><div class="small muted">${esc(String(bridge()?.build?.()||'web'))}</div></div><div class="diag-row"><strong>Location</strong><div class="small muted">${hasPoint()?Number(state.location.lat).toFixed(5)+', '+Number(state.location.lon).toFixed(5):'not set'} · ${radius()} mi · ${esc(state.location.mode||'none')}</div></div><div class="diag-row"><strong>Facebook</strong><div class="small muted">${fbRows().length} captured listing candidates · notification access ${bridge()?.notificationAccessEnabled?.()?'enabled':'not enabled'}</div></div>${runs.map(([name,r])=>`<div class="diag-row"><strong>${esc(name)}</strong><div class="small muted">${new Date(r.at).toLocaleString()} · ${esc(JSON.stringify(r.data).slice(0,900))}</div></div>`).join('')}${state.diagnostics.errors.length?`<h3 style="margin-top:12px">Recent errors</h3>${state.diagnostics.errors.map(e=>`<div class="diag-row"><strong>${esc(e.name)}</strong><div class="small muted">${esc(e.text)} · ${new Date(e.at).toLocaleString()}</div></div>`).join('')}`:''}</section>`;$('backMore').onclick=()=>{state.subpage=null;renderMore()}}
function renderSettings(){state.subpage='settings';const p=$('page-more');p.innerHTML=`<section class="card"><div class="workflow-head"><div><h2>Location & Radius</h2><div class="muted small">Location applies to Deals, Stores, Auctions, Facebook, Craigslist and retailer checks where supported.</div></div><button id="backMore" class="secondary">More</button></div><div class="notice">${esc(state.location.label||'Location not set')} · ${radius()} miles</div><div class="actions"><button id="settingsPhone">Use Phone Location</button><button id="settingsZip" class="secondary">ZIP Search</button></div><label class="field">Radius<select id="settingsRadius"><option value="25">25 miles</option><option value="50">50 miles</option><option value="100">100 miles</option><option value="150">150 miles</option></select></label></section>`;$('settingsRadius').value=String(radius());$('settingsRadius').onchange=e=>{$('radius').value=e.target.value;write(LAST_RADIUS,Number(e.target.value));notice('Radius updated.','good')};$('settingsPhone').onclick=requestPhoneLocation;$('settingsZip').onclick=()=>$('zipModal').classList.remove('hidden');$('backMore').onclick=()=>{state.subpage=null;renderMore()}}
function bindOpen(root){root.querySelectorAll('[data-open]').forEach(b=>b.onclick=e=>{e.preventDefault();openExternal(b.dataset.open)})}
function renderResearchBindings(){const b=$('addInventory');if(b)b.onclick=addResearchInventory}
const oldResearchHtml=researchHtml;researchHtml=function(r){const html=oldResearchHtml(r);setTimeout(renderResearchBindings,0);return html};
window.H38SharedOpportunity=text=>{const s=String(text||'').trim();if(!s)return;setPage('more',{subpage:'research',start:false});state.research=null;setTimeout(()=>{const q=$('researchItem');if(q)q.value=s;notice('Shared listing text added to Research Item.','good')},50)};
window.H38HandleBack=()=>{if($('zipModal')&&!$('zipModal').classList.contains('hidden')){$('zipModal').classList.add('hidden');return true}if(state.page==='more'&&state.subpage){state.subpage=null;renderMore();return true}if(state.page){showLauncher();return true}return false};
$('loginForm').onsubmit=async e=>{e.preventDefault();$('loginMsg').innerHTML='<div class="notice">Signing in…</div>';const f=new FormData(e.currentTarget),{data,error}=await sb.auth.signInWithPassword({email:String(f.get('email')||'').trim(),password:String(f.get('password')||'')});if(error){$('loginMsg').innerHTML='<div class="notice bad">'+esc(error.message)+'</div>';return}await authorize(data.session)};
$('signOut').onclick=async()=>{await sb.auth.signOut();showLogin()};$('topResearch').onclick=()=>setPage('more',{subpage:'research',start:false});document.querySelectorAll('[data-launch]').forEach(b=>b.onclick=()=>{const x=b.dataset.launch;if(x==='research')setPage('more',{subpage:'research'});else setPage(x)});document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>setPage(b.dataset.nav));$('phoneLocation').onclick=requestPhoneLocation;$('zipLocation').onclick=()=>$('zipModal').classList.remove('hidden');$('cancelZip').onclick=()=>$('zipModal').classList.add('hidden');$('applyZip').onclick=applyZip;$('radius').value=String(read(LAST_RADIUS,50));$('radius').onchange=e=>{write(LAST_RADIUS,Number(e.target.value));if(state.page==='stores'&&hasPoint())loadStores(true);if(state.page==='auctions'&&(hasPoint()||state.location.zip))loadAuctions(true)};
sb.auth.getSession().then(({data})=>data.session?authorize(data.session):showLogin());

// v0.1.36 physical-phone repair: retailer/store/candidate grouping, durable location,
// cleaner store discovery, optional Facebook tooling, and strict retailer boundaries.
const H38_CLEARANCE_STORE_FIRST_V036=true;
const LAST_LOCATION_V036='h38_reseller_last_location_v036';
state.clearanceShowAll=state.clearanceShowAll||{};
state.clearanceOpenStore=state.clearanceOpenStore||'';

function retailerKeyV036(value){
  const s=String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  if(!s)return'';
  const rules=[
    ['home depot','home depot'],['dollar general','dollar general'],['dollar tree','dollar tree'],['family dollar','family dollar'],
    ['l m fleet supply','l&m fleet supply'],['fleet farm','fleet farm'],['harbor freight','harbor freight'],['tractor supply','tractor supply'],
    ['northern tool','northern tool'],['ace hardware','ace hardware'],['walmart','walmart'],['target','target'],['menards','menards'],
    ['lowe','lowes'],['best buy','best buy'],['walgreens','walgreens'],['cvs','cvs'],['kohls','kohls'],['jcpenney','jcpenney'],
    ['tj maxx','tj maxx'],['marshalls','marshalls'],['ross','ross'],['burlington','burlington'],['five below','five below'],
    ['aldi','aldi'],['costco','costco'],['sams club','sams club'],['pet smart','petsmart'],['petsmart','petsmart'],['petco','petco'],
    ['michaels','michaels'],['hobby lobby','hobby lobby'],['joann','joann'],['dunhams','dunhams'],['runnings','runnings'],['homegoods','homegoods'],
    ['oreilly','oreilly auto parts'],['napa','napa auto parts'],['autozone','autozone'],['advance auto','advance auto parts'],['carquest','carquest'],['auto value','auto value']
  ];
  for(const [needle,key] of rules)if(s.includes(needle))return key;
  return s;
}
function retailerLabelV036(value){const raw=String(value||'Retailer').trim();return raw||'Retailer'}
matchingStores=function(l){const key=retailerKeyV036(l?.retailer);return state.stores.filter(s=>retailerKeyV036(s?.retailer)===key)};
storeCandidates=function(s){const key=retailerKeyV036(s?.retailer);return state.leads.filter(l=>retailerKeyV036(l?.retailer)===key)};

function rememberLocationV036(){
  if(!hasPoint()&&!state.location.zip)return;
  write(LAST_LOCATION_V036,{...state.location,at:Date.now()});
}
(function hydrateLocationV036(){
  if(hasPoint()||state.location.zip)return;
  const x=read(LAST_LOCATION_V036,null);
  if(!x||Date.now()-Number(x.at||0)>12*60*60*1000)return;
  const lat=Number(x.lat),lon=Number(x.lon);
  if(Number.isFinite(lat)&&Number.isFinite(lon))state.location={mode:x.mode||'phone',lat,lon,zip:String(x.zip||''),label:String(x.label||'Last location')};
})();
window.H38NativeLocationResult=(lat,lon)=>{done('location');state.location={mode:'phone',lat:Number(lat),lon:Number(lon),zip:'',label:'Current phone location'};rememberLocationV036();renderLocation();notice('Phone location ready.','good');resumeLocationWorkflow()};
applyZip=async function(){const zip=$('zipInput').value.replace(/\D/g,'').slice(0,5);if(!/^\d{5}$/.test(zip)){$('zipMsg').innerHTML='<div class="notice bad">Enter a 5-digit ZIP.</div>';return}busy('zip','Finding ZIP…');try{const p=await fn('reseller-location-geocode',{zip});if(!p?.location||!Number.isFinite(Number(p.location.lat)))throw new Error('ZIP could not be located.');state.location={mode:'zip',lat:Number(p.location.lat),lon:Number(p.location.lon),zip,label:[p.location.city,p.location.state,zip].filter(Boolean).join(', ')};rememberLocationV036();$('zipModal').classList.add('hidden');$('zipMsg').innerHTML='';renderLocation();notice('ZIP search ready.','good');resumeLocationWorkflow()}catch(e){$('zipMsg').innerHTML='<div class="notice bad">'+esc(err('zip',e))+'</div>'}finally{done('zip')}};
$('applyZip').onclick=applyZip;
renderLocation();

startWorkflow=async function(page,sub){
  if(page==='deals'&&!state.opportunities.length){if(await ensureLocation())runDeals(false);return}
  if(page==='clearance'){
    if(!hasPoint()&&!state.location.zip){await ensureLocation();return}
    if(!state.stores.length)await loadStores(false);
    if(!state.leads.length)await loadClearance(false);else renderClearance();
    return;
  }
  if(page==='stores'&&!state.stores.length){if(await ensureLocation())loadStores(false);return}
  if(page==='auctions'&&!state.auctions.length){if(await ensureLocation())loadAuctions(false);return}
  if(page==='more'&&sub==='research')renderResearch();
};
resumeLocationWorkflow=function(){
  if(state.page==='deals')runDeals(false);
  if(state.page==='stores')loadStores(false);
  if(state.page==='auctions')loadAuctions(false);
  if(state.page==='clearance')loadStores(false).then(()=>state.leads.length?renderClearance():loadClearance(false));
};

function leadStateAtStoreV036(l,s){
  const st=s?state.stock[stockKey(l,s)]:null,price=Number(st?.current_price),verified=!!(st?.stock_checked&&st?.store_bound),localPenny=verified&&price===0.01;
  return{st,price,verified,localPenny,label:localPenny?'LOCAL $0.01':verified?'STORE VERIFIED':isPenny(l)?'PENNY CANDIDATE':'CLEARANCE CANDIDATE',badge:localPenny?'good':verified?'verified':isPenny(l)?'penny':'warn'};
}
function clearanceStoreItemV036(l,s){
  const x=leadStateAtStoreV036(l,s),qty=x.verified?(x.st?.stock_count!=null?String(x.st.stock_count):(x.st?.stock_status==='in_stock'?'IN':x.st?.stock_status==='out_of_stock'?'OUT':'Qty not exposed')):'Not verified';
  return `<div class="watch-row" data-clear-id="${esc(l.id||'')}"><div><span class="badge ${x.badge}">${x.label}</span><strong style="display:block;margin-top:5px">${esc(l.title||'Clearance item')}</strong><div class="small muted">${l.upc?'UPC '+esc(l.upc):''}${l.sku?(l.upc?' · ':'')+'Model '+esc(l.sku):''}${num(l.discount_pct)>0?' · reported '+num(l.discount_pct).toFixed(0)+'% off':''}${num(l.original_price)>0?' · ref '+money(l.original_price):''}</div>${s?`<div class="small muted">${x.verified?(money(x.price)+' · '+esc(qty)):'Retailer-wide candidate; not confirmed at this store.'}</div>`:'<div class="small muted">Retailer-wide candidate; no nearby matching store loaded.</div>'}</div><div class="actions">${s?`<button class="secondary" data-store-candidate-verify="${esc(l.id||'')}" data-store-key="${esc(s.store_key)}">Verify</button>`:''}${l.source_url?`<button class="secondary" data-open="${esc(l.source_url)}">Source</button>`:''}</div></div>`;
}
function clearanceRowsV036(){
  let rows=state.leads.slice();
  if(state.clearanceFilter==='penny')rows=rows.filter(isPenny);
  if(state.clearanceFilter==='verified')rows=rows.filter(l=>matchingStores(l).some(s=>state.stock[stockKey(l,s)]?.store_bound));
  return rows.sort((a,b)=>Number(isPenny(b))-Number(isPenny(a))||num(b.discount_pct)-num(a.discount_pct));
}
function bindStoreCandidateVerifyV036(root){
  root.querySelectorAll('[data-store-candidate-verify]').forEach(b=>b.onclick=()=>{
    const s=state.stores.find(x=>x.store_key===b.dataset.storeKey),l=state.leads.find(x=>String(x.id)===String(b.dataset.storeCandidateVerify));
    if(!s||!l)return;
    const fake={closest:()=>({querySelector:()=>({value:s.store_key})}),disabled:false,textContent:''};
    verifyLead(l.id,fake);
  });
}
renderClearance=function(){
  const p=$('page-clearance');if(!p)return;
  const rows=clearanceRowsV036(),verified=state.leads.filter(l=>matchingStores(l).some(s=>state.stock[stockKey(l,s)]?.store_bound)).length,local=state.leads.filter(l=>matchingStores(l).some(s=>Number(state.stock[stockKey(l,s)]?.current_price)===.01&&state.stock[stockKey(l,s)]?.store_bound)).length;
  const groups=new Map();for(const l of rows){const key=retailerKeyV036(l.retailer)||'unknown';if(!groups.has(key))groups.set(key,{name:retailerLabelV036(l.retailer),leads:[]});groups.get(key).leads.push(l)}
  const body=[...groups.entries()].map(([key,g])=>{
    const stores=state.stores.filter(s=>retailerKeyV036(s.retailer)===key).sort((a,b)=>num(a.distance_miles)-num(b.distance_miles));
    const storeHtml=stores.length?stores.map(s=>{
      const all=g.leads,viewKey=s.store_key+'|'+state.clearanceFilter,showAll=!!state.clearanceShowAll[viewKey],shown=showAll?all:all.slice(0,12),verifiedHere=all.filter(l=>state.stock[stockKey(l,s)]?.store_bound).length,localHere=all.filter(l=>state.stock[stockKey(l,s)]?.store_bound&&Number(state.stock[stockKey(l,s)]?.current_price)===.01).length;
      return `<details class="store" data-clear-store="${esc(s.store_key)}" ${state.clearanceOpenStore===viewKey?'open':''}><summary><div class="store-sum"><div><strong>${esc(s.store_name||s.retailer)}</strong><div class="small muted">${esc(s.store_address||'')}</div><div class="tiny muted">${all.length} candidates · ${verifiedHere} verified${localHere?' · '+localHere+' local 1¢':''}</div></div><strong>${Number.isFinite(Number(s.distance_miles))?Number(s.distance_miles).toFixed(1)+' mi':'—'}</strong></div></summary><div class="store-body"><div class="notice small">Candidate queue is retailer-matched but <strong>not store inventory</strong> until each item returns STORE VERIFIED or LOCAL $0.01.</div><div class="actions"><button class="secondary" data-store-session="${esc(s.store_key)}">Open store setup</button>${flyer(s.retailer)?`<button class="secondary" data-open="${esc(flyer(s.retailer))}">Ad / flyer</button>`:''}</div>${shown.map(l=>clearanceStoreItemV036(l,s)).join('')}${all.length>12&&!showAll?`<button class="secondary" data-show-clearance="${esc(viewKey)}">Show all ${all.length} candidates</button>`:''}</div></details>`;
    }).join(''):`<details class="store"><summary><div class="store-sum"><div><strong>Unmatched / retailer-wide candidates</strong><div class="tiny muted">${g.leads.length} candidates · no matching nearby store loaded</div></div></div></summary><div class="store-body"><div class="notice warn small">These stay outside any physical store until Scout loads a matching ${esc(g.name)} location.</div>${g.leads.slice(0,12).map(l=>clearanceStoreItemV036(l,null)).join('')}${g.leads.length>12?`<div class="small muted">${g.leads.length-12} more hidden until a matching store is loaded.</div>`:''}</div></details>`;
    return `<div class="store-group"><h3><span>${esc(g.name)}</span><span class="badge">${stores.length} stores · ${g.leads.length} candidates</span></h3>${storeHtml}</div>`;
  }).join('');
  p.innerHTML=`<section class="card"><div class="workflow-head"><div><h2>Penny & Clearance</h2><div class="muted small">Store-first sourcing. Retailers stay separated; candidates remain unverified until an exact physical-store check succeeds.</div></div><button id="refreshClearance" class="secondary">Refresh</button></div><div class="stats" style="margin-top:10px"><div class="stat"><strong>${state.leads.filter(isPenny).length}</strong><span>PENNY CANDIDATES</span></div><div class="stat"><strong>${state.leads.length}</strong><span>ALL CLEARANCE</span></div><div class="stat"><strong>${verified}</strong><span>STORE VERIFIED</span></div><div class="stat"><strong>${local}</strong><span>LOCAL 1¢</span></div></div><div class="tabs"><button data-cfilter="penny">Penny</button><button data-cfilter="all">All Clearance</button><button data-cfilter="verified">Verified Local</button></div></section><section class="card">${rows.length?body:'<div class="empty">No candidates match this view yet.</div>'}</section>`;
  p.querySelectorAll('[data-cfilter]').forEach(b=>{b.classList.toggle('active',b.dataset.cfilter===state.clearanceFilter);b.onclick=()=>{state.clearanceFilter=b.dataset.cfilter;state.clearanceOpenStore='';renderClearance()}});
  $('refreshClearance').onclick=async()=>{if(!state.stores.length&&await ensureLocation())await loadStores(true);await loadClearance(true)};
  p.querySelectorAll('[data-show-clearance]').forEach(b=>b.onclick=()=>{state.clearanceShowAll[b.dataset.showClearance]=true;state.clearanceOpenStore=b.dataset.showClearance;renderClearance()});
  p.querySelectorAll('[data-store-session]').forEach(b=>b.onclick=()=>openRetailerSession(b.dataset.storeSession));
  bindStoreCandidateVerifyV036(p);bindOpen(p);
};

flyer=function(retailer){const m={'Dollar General':'https://www.dollargeneral.com/deals/weekly-ads','Home Depot':'https://www.homedepot.com/SpecialBuy/SpecialBuyOfTheDay','L&M Fleet Supply':'https://www.landmsupply.com/weekly-ad','Walmart':'https://www.walmart.com/shop/deals','Menards':'https://www.menards.com/main/flyer.html','O\'Reilly Auto Parts':'https://www.oreillyauto.com/specials','Harbor Freight':'https://www.harborfreight.com/coupons-deals.html','Fleet Farm':'https://www.fleetfarm.com/sitewide/weekly-ad'};return m[retailer]||''};
function huntStoreV036(s){const k=retailerKeyV036(s?.retailer);return new Set(['home depot','dollar general','dollar tree','family dollar','l&m fleet supply','fleet farm','harbor freight','tractor supply','northern tool','ace hardware','walmart','target','menards','lowes','best buy','walgreens','cvs','kohls','jcpenney','tj maxx','marshalls','ross','burlington','five below','aldi','costco','sams club','petsmart','petco','michaels','hobby lobby','joann','dunhams','runnings','homegoods']).has(k)}
storeDetail=function(s){const cand=storeCandidates(s),watched=watches().filter(w=>cand.some(l=>String(l.title||'').toLowerCase().includes(String(w.term||'').toLowerCase()))),shown=cand.slice(0,8);return`<details class="store"><summary><div class="store-sum"><div><strong>${esc(s.store_name||s.retailer)}</strong><div class="small muted">${esc(s.store_address||'')}</div><div class="tiny muted">${cand.length} candidates${watched.length?' · '+watched.length+' watched matches':''}</div></div><strong>${Number.isFinite(Number(s.distance_miles))?Number(s.distance_miles).toFixed(1)+' mi':'—'}</strong></div></summary><div class="store-body"><div class="actions">${flyer(s.retailer)?`<button class="secondary" data-open="${esc(flyer(s.retailer))}">Ad / flyer</button>`:''}<button class="secondary" data-store-session="${esc(s.store_key)}">Open store setup</button></div>${shown.length?`<h3 style="margin-top:11px">Store Hunt</h3>${shown.map(l=>clearanceStoreItemV036(l,s)).join('')}${cand.length>shown.length?`<div class="small muted">${cand.length-shown.length} more candidates are available under Penny & Clearance.</div>`:''}`:`<div class="empty">No current candidate queue for this retailer.</div>`}</div></details>`};
renderStores=function(){
  const p=$('page-stores');if(!p)return;const names=[...new Set(state.stores.map(s=>s.retailer).filter(Boolean))].sort(),filter=state.storeRetailer;let list=filter?state.stores.filter(s=>s.retailer===filter):state.stores.slice();
  list.sort((a,b)=>(storeCandidates(b).length-storeCandidates(a).length)||num(a.distance_miles)-num(b.distance_miles));
  const primary=list.filter(s=>storeCandidates(s).length||huntStoreV036(s)),other=list.filter(s=>!primary.includes(s));
  const grouped={};for(const s of primary)(grouped[s.retailer]||(grouped[s.retailer]=[])).push(s);
  const primaryHtml=Object.entries(grouped).map(([name,rows])=>`<div class="store-group"><h3><span>${esc(name)}</span><span class="badge">${rows.length} locations</span></h3>${rows.map(storeDetail).join('')}</div>`).join('');
  const otherHtml=other.length?`<details class="store-group"><summary><strong>Other nearby stores · ${other.length}</strong></summary><div style="margin-top:8px">${other.map(s=>`<div class="watch-row"><div><strong>${esc(s.store_name||s.retailer)}</strong><div class="small muted">${esc(s.store_address||'')}</div></div><strong>${Number.isFinite(Number(s.distance_miles))?Number(s.distance_miles).toFixed(1)+' mi':'—'}</strong></div>`).join('')}</div></details>`:'';
  p.innerHTML=`<section class="card"><div class="workflow-head"><div><h2>Nearby Stores</h2><div class="muted small">${state.stores.length} within ${radius()} miles. Reseller-relevant chains and stores with candidate queues stay up front; unrelated nearby stores are collapsed.</div></div><button id="refreshStores" class="secondary">Refresh</button></div><div class="filters" style="margin-top:10px"><select id="storeRetailer"><option value="">All retailers</option>${names.map(n=>`<option ${n===filter?'selected':''}>${esc(n)}</option>`).join('')}</select><select id="storeSort"><option value="distance" selected>Best hunt / distance</option></select></div></section><section class="card">${primary.length?primaryHtml:'<div class="empty">No supported hunt stores loaded yet.</div>'}${otherHtml}</section>`;
  $('refreshStores').onclick=()=>loadStores(true);$('storeRetailer').onchange=e=>{state.storeRetailer=e.target.value;renderStores()};
  p.querySelectorAll('[data-store-session]').forEach(b=>b.onclick=()=>openRetailerSession(b.dataset.storeSession));bindStoreCandidateVerifyV036(p);bindOpen(p);
};

renderDeals=function(){const p=$('page-deals');if(!p)return;const diagRun=state.diagnostics.runs.deals?.data||{};p.innerHTML=`<section class="card"><div class="workflow-head"><div><h2>Deals</h2><div class="muted small">What looks worth buying to resell. Search hits stay hidden until listing detail and sold evidence support the economics.</div></div><div class="actions"><button id="refreshDeals" class="secondary">Refresh</button></div></div></section><section class="card"><div class="stats"><div class="stat"><strong>${state.opportunities.length}</strong><span>PROFIT-SUPPORTED</span></div><div class="stat"><strong>${watches().length}</strong><span>WATCH ITEMS</span></div><div class="stat"><strong>${fbRows().length}</strong><span>FB CAPTURED</span></div><div class="stat"><strong>${radius()}</strong><span>MILE RADIUS</span></div></div></section><section class="card"><h3>Resale opportunities</h3><div id="dealRows">${state.opportunities.length?state.opportunities.map(oppCard).join(''):'<div class="empty">No verified profit-supported opportunities loaded yet.</div>'}</div><div class="source-status">${sourceSummaryHtml(diagRun.source_summary)}</div><details class="store" style="margin-top:10px"><summary><strong>Facebook source tools</strong><span class="small muted"> optional capture / connection</span></summary><div class="store-body"><div class="small muted">Scout uses already captured Facebook candidates automatically. Open this only when you want to refresh the authenticated source session.</div><button id="openFb" class="secondary">Open Facebook session</button></div></details></section>`;$('refreshDeals').onclick=()=>runDeals(true);$('openFb').onclick=openFacebook;bindOpen(p)};

window.H38NativeBarcodeError=text=>{state._awaitBarcode='';notice(String(text||'Barcode scan failed.')+' You can also type the UPC/model below.','warn');const e=$('researchUpc');if(e)e.focus()};
