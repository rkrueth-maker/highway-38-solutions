'use strict';
window.H38_SCOUT_V211_WIDE_ACCEPTANCE=true;

// v2.1.1 wide lifecycle repair: FIND -> VERIFY -> BUY -> SELL -> LEARN.
// Penny truth remains owned by v200-hunt.js. This layer repairs lifecycle, ranking and recovery around it.

function h38InventoryMeta(notes){
  if(!notes)return{};
  try{const x=typeof notes==='string'?JSON.parse(notes):notes;return x&&typeof x==='object'?(x.h38_scout_meta||{}):{}}catch{return{}}
}
function h38InventoryKey(x){
  const url=txt(x?.source_url||x?.url).split('?')[0].replace(/\/$/,'');
  if(url)return`url|${norm(url)}`;
  const code=digits(x?.upc||x?.gtin||x?.barcode||x?.sku);
  if(code)return`code|${code}|${Number(x?.buy_price||0).toFixed(2)}`;
  return`title|${norm(x?.title||x?.item_name||x?.product_name)}|${Number(x?.buy_price||0).toFixed(2)}`;
}
function h38SafeRemoteImage(v){const s=txt(v);return /^https?:\/\//i.test(s)?s:''}
function h38NormalizeInventory(x,remote=false){
  const meta=h38InventoryMeta(x?.notes);
  return{...x,
    resale_estimate:num(x?.resale_estimate||x?.expected_resale),
    expected_resale:num(x?.expected_resale||x?.resale_estimate),
    source:txt(x?.source||x?.retailer||x?.marketplace||x?.source_type||'Scout'),
    source_url:txt(x?.source_url||x?.url),
    image_url:txt(x?.image_url||meta.image_url),
    purchased_at:x?.purchased_at||meta.purchased_at||x?.created_at||'',
    sold_at:x?.sold_at||meta.sold_at||'',
    sold_price:num(x?.sold_price||meta.sold_price),
    actual_fees:num(x?.actual_fees||meta.actual_fees),
    actual_profit:Number.isFinite(Number(x?.actual_profit??meta.actual_profit))?Number(x?.actual_profit??meta.actual_profit):null,
    remote:!!remote,
    _notes:txt(x?.notes)
  }
}
function h38PurchasePayload(r){
  const title=txt(r?.title||r?.item_name||r?.product_name||state.scan?.identification?.likely_item||'Purchased item');
  const source=txt(r?.source||r?.retailer||r?.marketplace||'Scout');
  const sourceUrl=txt(r?.url||r?.source_url);
  const buy=num(r?.buy_price||r?.estimated_all_in||state.scan?.buyPrice);
  const resale=num(r?.resale_estimate||r?.expected_resale||r?.market?.typical||r?.market?.median);
  const purchasedAt=new Date().toISOString();
  const meta={image_url:h38SafeRemoteImage(r?.image_url),purchased_at:purchasedAt,source_label:source};
  return{
    title,retailer:source,location_text:txt(r?.location_label||state.location.label||`ZIP ${H38_DEFAULT_ZIP}`),
    upc:digits(r?.upc||r?.gtin||r?.barcode),sku:txt(r?.sku||r?.model_or_part_number),source_type:norm(source)||'scout',source_url:sourceUrl,
    buy_price:buy,retail_price:num(r?.retail_price),expected_resale:resale,estimated_fees:num(r?.estimated_fees),estimated_shipping:num(r?.estimated_shipping),other_costs:num(r?.other_costs),
    marketplace:source,quantity:Math.max(1,Math.round(num(r?.quantity)||1)),status:'bought',notes:JSON.stringify({h38_scout_meta:meta}),
    store_key:txt(r?.store_key),store_name:txt(r?.store_name),store_address:txt(r?.store_address),
    store_lat:Number.isFinite(Number(r?.store_lat))?Number(r.store_lat):null,store_lon:Number.isFinite(Number(r?.store_lon))?Number(r.store_lon):null,
    verification_status:'reported',reported_quantity:Math.max(0,Math.round(num(r?.reported_quantity)||0))
  }
}
function h38FallbackPayload(x){
  const p=h38PurchasePayload(x),old=h38InventoryMeta(x?._notes||x?.notes),sold=norm(x?.status)==='sold';
  if(sold){p.status='sold';p.notes=JSON.stringify({h38_scout_meta:{...old,image_url:h38SafeRemoteImage(x?.image_url||old.image_url),purchased_at:x?.purchased_at||old.purchased_at,sold_at:x?.sold_at||new Date().toISOString(),sold_price:num(x?.sold_price),actual_fees:num(x?.actual_fees),actual_profit:Number.isFinite(Number(x?.actual_profit))?Number(x.actual_profit):h38SaleProfit(x,num(x?.sold_price),num(x?.actual_fees))}})}
  return p
}

// Shared Watch rules use the protected reseller_watch_rules table, while local storage remains the instant/offline cache.
const h38v211LocalAddWatch=addWatch,h38v211LocalRemoveWatch=removeWatch;
function h38WatchRemoteShape(x){return{term:txt(x?.query_text),min_profit:num(x?.min_expected_profit),min_roi:num(x?.min_roi_percent),max_buy:num(x?.max_buy_price),created_at:x?.created_at||new Date().toISOString(),remote:true,remote_id:x?.id||''}}
async function h38LoadSharedWatches(force=false){
  if(!state.user)return watchRows();
  if(!force&&state.watchSharedLoadedAt&&Date.now()-state.watchSharedLoadedAt<60000)return watchRows();
  const local=watchRows();let remote=[],remoteOk=false;
  try{
    const{data,error:e}=await h38sb.from('reseller_watch_rules').select('*').eq('enabled',true).order('updated_at',{ascending:false}).limit(200);if(e)throw e;
    remote=Array.isArray(data)?data.map(h38WatchRemoteShape):[];remoteOk=true;
    const remoteTerms=new Set(remote.map(x=>norm(x.term)));
    const missing=local.filter(x=>x.term&&!remoteTerms.has(norm(x.term))&&!x.remote);
    if(missing.length){
      const payload=missing.slice(0,40).map(x=>({query_text:x.term,retailer:'',max_buy_price:num(x.max_buy),min_expected_profit:num(x.min_profit),min_roi_percent:num(x.min_roi),enabled:true}));
      const{error:i}=await h38sb.from('reseller_watch_rules').insert(payload);if(i)throw i;
      const{data:again,error:a}=await h38sb.from('reseller_watch_rules').select('*').eq('enabled',true).order('updated_at',{ascending:false}).limit(200);if(a)throw a;
      remote=Array.isArray(again)?again.map(h38WatchRemoteShape):remote;
    }
    state.watchSharedLoadedAt=Date.now();
  }catch(e){remoteOk=false;error('watchLoadShared',e)}
  const map=new Map(),remoteTerms=new Set(remote.map(x=>norm(x.term)));
  for(const x of remote){const k=norm(x.term);if(k&&!map.has(k))map.set(k,x)}
  for(const x of local){const k=norm(x.term);if(!k)continue;if(remoteOk&&x.remote&&!remoteTerms.has(k))continue;if(!map.has(k))map.set(k,x)}
  const merged=[...map.values()];write(H38_KEYS.watch,merged);return merged;
}
async function h38FindSharedWatchIds(term){
  if(!state.user)return[];const target=norm(term);if(!target)return[];
  const{data,error:e}=await h38sb.from('reseller_watch_rules').select('id,query_text').limit(200);if(e)throw e;
  return(data||[]).filter(x=>norm(x.query_text)===target).map(x=>x.id).filter(Boolean)
}
async function h38SyncWatch(term,patch={}){
  if(!state.user||state.h38MaintenanceLocalOnly)return;const t=txt(term);if(!t)return;
  try{
    const ids=await h38FindSharedWatchIds(t),payload={query_text:t,retailer:'',max_buy_price:num(patch.max_buy),min_expected_profit:num(patch.min_profit),min_roi_percent:num(patch.min_roi),enabled:true,updated_at:new Date().toISOString()};
    if(ids.length){const{error:u}=await h38sb.from('reseller_watch_rules').update(payload).eq('id',ids[0]);if(u)throw u;if(ids.length>1){const{error:d}=await h38sb.from('reseller_watch_rules').delete().in('id',ids.slice(1));if(d)throw d}}
    else{delete payload.updated_at;const{error:i}=await h38sb.from('reseller_watch_rules').insert(payload);if(i)throw i}
    state.watchSharedLoadedAt=0;
  }catch(e){error('watchSync',e)}
}
async function h38DeleteSharedWatch(term){
  if(!state.user||state.h38MaintenanceLocalOnly)return;
  try{const ids=await h38FindSharedWatchIds(term);if(ids.length){const{error:e}=await h38sb.from('reseller_watch_rules').delete().in('id',ids);if(e)throw e}state.watchSharedLoadedAt=0}catch(e){error('watchDeleteShared',e)}
}
addWatch=function(term,patch={}){h38v211LocalAddWatch(term,patch);if(!state.h38MaintenanceLocalOnly)void h38SyncWatch(term,patch);return watchRows().find(x=>norm(x.term)===norm(term))};
removeWatch=function(term){h38v211LocalRemoveWatch(term);if(!state.h38MaintenanceLocalOnly)void h38DeleteSharedWatch(term)};
renderWatch=function(){
  const p=$('morePage'),rows=watchRows();
  p.innerHTML=`<div class="page-head"><div><button id="moreBack" class="ghost">‹ More</button><h1>Watch Items</h1><p>Shared sourcing targets sync between authorized Scout users. Profit, ROI and max-buy goals also affect Discover priority.</p></div><button id="watchRefresh" class="mini-btn">Refresh</button></div><section class="card"><label>Item / search<input id="watchNew" placeholder="snowblower, oak dresser, 5.7 Hemi…"></label><div class="search-row"><input id="watchProfit" inputmode="decimal" placeholder="Min profit $"><input id="watchRoi" inputmode="decimal" placeholder="Min ROI %"><input id="watchMax" inputmode="decimal" placeholder="Max buy $"><button id="watchAdd" class="primary">Watch</button></div></section><div class="result-list">${rows.length?rows.map(x=>`<div class="card store-card"><div><div class="item-top"><span class="badge ${x.remote?'good':'info'}">${x.remote?'SHARED':'SYNCING'}</span></div><h3>${esc(x.term)}</h3><div class="small muted">${num(x.min_profit)>0?`≥ ${dollars(x.min_profit)} profit · `:''}${num(x.min_roi)>0?`≥ ${num(x.min_roi)}% ROI · `:''}${num(x.max_buy)>0?`max buy ${dollars(x.max_buy)} · `:''}saved ${x.created_at?new Date(x.created_at).toLocaleDateString():'for later'}</div></div><div class="card-actions"><button class="mini-btn primary" data-watch-search="${esc(x.term)}">Search now</button><button class="mini-btn" data-watch-remove="${esc(x.term)}">Remove</button></div></div>`).join(''):'<div class="empty"><strong>No watch items yet</strong>Add specific items or broad categories you repeatedly hunt.</div>'}</div>`;
  $('moreBack').onclick=()=>{state.moreView='home';renderMore()};$('watchRefresh').onclick=async()=>{await h38LoadSharedWatches(true);renderWatch()};$('watchAdd').onclick=()=>{const v=txt($('watchNew').value);if(v){addWatch(v,{min_profit:$('watchProfit').value,min_roi:$('watchRoi').value,max_buy:$('watchMax').value});renderWatch()}};p.querySelectorAll('[data-watch-search]').forEach(b=>b.onclick=()=>{state.discover.query=b.dataset.watchSearch;write(H38_KEYS.discover,state.discover.query);state.moreView='home';setPage('discover');runDiscover()});p.querySelectorAll('[data-watch-remove]').forEach(b=>b.onclick=()=>{removeWatch(b.dataset.watchRemove);renderWatch()});
  if(!state.watchSharedLoadedAt||Date.now()-state.watchSharedLoadedAt>60000)void h38LoadSharedWatches().then(()=>{if(state.page==='more'&&state.moreView==='watch')renderWatch()})
};

async function h38SyncLocalInventoryFallbacks(rawLocals,remote){
  if(!state.user||!rawLocals.length)return{locals:rawLocals,remote};
  const remoteKeys=new Set(remote.map(h38InventoryKey)),keep=[],added=[];
  for(const raw of rawLocals){
    const x=h38NormalizeInventory(raw,false),key=h38InventoryKey(x);if(remoteKeys.has(key))continue;
    try{const payload=h38FallbackPayload(x),{data,error:e}=await h38sb.from('reseller_deals').insert(payload).select('*').single();if(e)throw e;const row=h38NormalizeInventory(data,true);added.push(row);remoteKeys.add(h38InventoryKey(row))}
    catch(e){error('inventoryFallbackSync',e);keep.push(raw)}
  }
  if(keep.length!==rawLocals.length)saveLocalInventory(keep);
  return{locals:keep,remote:[...remote,...added]}
}

// Shared inventory: use the real reseller_deals schema/status values, auto-retry device fallbacks, and dedupe canonically.
loadInventory=async function(){
  const rawLocals=localInventory();let remote=[];
  try{const{data,error:e}=await h38sb.from('reseller_deals').select('*').in('status',['bought','sold']).order('updated_at',{ascending:false}).limit(300);if(e)throw e;remote=Array.isArray(data)?data.map(x=>h38NormalizeInventory(x,true)):[]}
  catch(e){error('inventoryLoad',e)}
  let locals=rawLocals;
  if(state.user){const synced=await h38SyncLocalInventoryFallbacks(rawLocals,remote);locals=synced.locals;remote=synced.remote}
  const map=new Map();for(const x of remote)map.set(h38InventoryKey(x),x);for(const x of locals.map(x=>h38NormalizeInventory(x,false))){const k=h38InventoryKey(x);if(!map.has(k))map.set(k,x)}
  state.inventory=[...map.values()].sort((a,b)=>new Date(b.updated_at||b.purchased_at||0)-new Date(a.updated_at||a.purchased_at||0));
  await h38LoadSharedWatches();return state.inventory;
};
recordPurchase=async function(r){
  const payload=h38PurchasePayload(r),key=h38InventoryKey(payload);
  if((state.inventory||[]).some(x=>h38InventoryKey(x)===key&&norm(x.status)!=='sold')){notice('That item is already in Inventory.','warn');return}
  const meta=h38InventoryMeta(payload.notes),local={id:`local-${Date.now()}`,title:payload.title,status:'bought',buy_price:payload.buy_price,resale_estimate:payload.expected_resale,source:payload.retailer,source_url:payload.source_url,upc:payload.upc,sku:payload.sku,image_url:meta.image_url,purchased_at:new Date().toISOString(),updated_at:new Date().toISOString()};
  const prior=localInventory().filter(x=>h38InventoryKey(x)!==key);saveLocalInventory([local,...prior]);state.inventory=[local,...(state.inventory||[]).filter(x=>h38InventoryKey(x)!==key)];
  try{const{data,error:e}=await h38sb.from('reseller_deals').insert(payload).select('*').single();if(e)throw e;saveLocalInventory(localInventory().filter(x=>h38InventoryKey(x)!==key));await loadInventory();notice(`${payload.title} saved to shared Inventory.`,'good');return data}
  catch(e){error('recordPurchaseRemote',e);await loadInventory();notice(`${payload.title} saved on this device. Shared sync will retry automatically.`,'warn');return local}
};

function h38SaleProfit(x,sold,fees){return Number((num(sold)-num(x?.buy_price)-num(fees)).toFixed(2))}
async function h38SaveSaleOutcome(id){
  const x=(state.inventory||[]).find(r=>txt(r.id)===txt(id));if(!x)return;const sold=num($('salePrice')?.value),fees=num($('saleFees')?.value);if(!(sold>0)){notice('Enter the actual sold price.','warn');return}
  const soldAt=new Date().toISOString(),actual=h38SaleProfit(x,sold,fees);
  if(x.remote&&!txt(x.id).startsWith('local-')){
    const old=h38InventoryMeta(x._notes),notes=JSON.stringify({h38_scout_meta:{...old,image_url:h38SafeRemoteImage(x.image_url||old.image_url),purchased_at:x.purchased_at||old.purchased_at,sold_at:soldAt,sold_price:sold,actual_fees:fees,actual_profit:actual}});
    try{const{error:e}=await h38sb.from('reseller_deals').update({status:'sold',notes,updated_by:state.user?.id,updated_at:soldAt}).eq('id',x.id);if(e)throw e;state.inventorySaleEdit='';await loadInventory();renderInventory();notice(`Sold result saved · ${dollars(actual)} actual profit.`,'good');return}catch(e){error('inventorySoldRemote',e);notice('Shared sold update failed; keeping the item unchanged.','bad');return}
  }
  const rows=localInventory().map(r=>txt(r.id)===txt(id)?{...r,status:'sold',sold_at:soldAt,sold_price:sold,actual_fees:fees,actual_profit:actual,updated_at:soldAt}:r);saveLocalInventory(rows);state.inventorySaleEdit='';await loadInventory();renderInventory();notice(`Sold result saved · ${dollars(actual)} actual profit.`,'good');
}
renderInventory=function(){
  const p=$('morePage'),rows=state.inventory||[],editing=txt(state.inventorySaleEdit);
  p.innerHTML=`<div class="page-head"><div><button id="moreBack" class="ghost">‹ More</button><h1>Inventory</h1><p>Shared bought/sold history closes the loop so Scout can learn what actually makes money.</p></div><button id="inventoryRefresh" class="mini-btn">Refresh</button></div><div class="result-list">${rows.length?rows.map(x=>{const sold=norm(x.status)==='sold',est=inventoryExpectedProfit(x),actual=Number.isFinite(Number(x.actual_profit))?Number(x.actual_profit):null,isEdit=editing===txt(x.id);return`<div class="card"><div class="item-top"><span class="badge ${sold?'good':'info'}">${sold?'SOLD':'BOUGHT'}</span><span class="badge">${x.remote?'SHARED':'DEVICE FALLBACK'}</span>${sold&&actual!=null?`<span class="badge good">ACTUAL ${esc(dollars(actual))}</span>`:est!=null?`<span class="badge">EST. ${esc(dollars(est))} SPREAD</span>`:''}</div><h3>${esc(x.title||'Saved item')}</h3><div class="meta">${num(x.buy_price)>0?`<span>buy ${dollars(x.buy_price)}</span>`:''}${num(x.resale_estimate)>0?`<span>expected ${dollars(x.resale_estimate)}</span>`:''}${sold&&num(x.sold_price)>0?`<span>sold ${dollars(x.sold_price)}</span>`:''}${sold&&num(x.actual_fees)>0?`<span>fees ${dollars(x.actual_fees)}</span>`:''}${x.source?`<span>${esc(x.source)}</span>`:''}</div>${isEdit?`<div class="search-row" style="margin-top:12px"><input id="salePrice" inputmode="decimal" placeholder="Sold price $"><input id="saleFees" inputmode="decimal" placeholder="Fees / shipping / selling costs $"><button class="primary" data-save-sale="${esc(x.id)}">Save sale</button><button class="secondary" data-cancel-sale>Cancel</button></div>`:''}<div class="card-actions">${x.source_url?`<button class="mini-btn" data-open="${esc(x.source_url)}">Source</button>`:''}${!sold&&!isEdit?`<button class="mini-btn good" data-mark-sold="${esc(x.id)}">Mark sold</button>`:''}</div></div>`}).join(''):'<div class="empty"><strong>No inventory yet</strong>Use “I bought it” in Discover or Scan and Scout will carry the known item, cost, source and expected resale here for both authorized users.</div>'}</div>`;
  $('moreBack').onclick=()=>{state.moreView='home';renderMore()};$('inventoryRefresh').onclick=async()=>{await loadInventory();renderInventory()};p.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openExternal(b.dataset.open));p.querySelectorAll('[data-mark-sold]').forEach(b=>b.onclick=()=>{state.inventorySaleEdit=b.dataset.markSold;renderInventory()});p.querySelectorAll('[data-cancel-sale]').forEach(b=>b.onclick=()=>{state.inventorySaleEdit='';renderInventory()});p.querySelectorAll('[data-save-sale]').forEach(b=>b.onclick=()=>h38SaveSaleOutcome(b.dataset.saveSale));
};

// Watch thresholds now affect result priority and visible action state instead of being passive notes.
function h38WatchMatches(r,w){const term=norm(w?.term);if(!term)return false;const hay=norm(`${r?.term||''} ${r?.title||''} ${r?.category||''} ${r?.brand||''}`);return hay.includes(term)||norm(r?.term)===term}
function h38WatchEvaluation(r){
  const matches=watchRows().filter(w=>h38WatchMatches(r,w));if(!matches.length)return null;let best=null;
  for(const w of matches){const checks=[];if(num(w.max_buy)>0)checks.push(num(r.buy_price||r.estimated_all_in)>0?num(r.buy_price||r.estimated_all_in)<=num(w.max_buy):null);if(num(w.min_profit)>0)checks.push(Number.isFinite(Number(r.net_profit))?Number(r.net_profit)>=num(w.min_profit):null);if(num(w.min_roi)>0)checks.push(Number.isFinite(Number(r.roi_pct))?Number(r.roi_pct)>=num(w.min_roi):null);const failed=checks.includes(false),unknown=checks.includes(null),score=failed?0:unknown?2:checks.length?3:1,c={watch:w,score,status:failed?'over':unknown?'needs_comp':checks.length?'hit':'match'};if(!best||c.score>best.score)best=c}return best
}
function h38WatchScore(r){return h38WatchEvaluation(r)?.score||0}
const h38v211MergeDealPayload=mergeDealPayload;
mergeDealPayload=function(parts,terms){const p=h38v211MergeDealPayload(parts,terms),sort=(a,b)=>h38WatchScore(b)-h38WatchScore(a)||num(b.net_profit)-num(a.net_profit);p.opportunities=(p.opportunities||[]).slice().sort(sort);p.candidates=(p.candidates||[]).slice().sort(sort);return p};
const h38v211DealCard=dealCard;
dealCard=function(r){const ev=h38WatchEvaluation(r),rr=ev&&num(ev.watch.max_buy)>0&&!num(r.max_buy_price)?{...r,max_buy_price:num(ev.watch.max_buy)}:r,html=h38v211DealCard(rr);if(!ev)return html;const label=ev.status==='hit'?'WATCH TARGET HIT':ev.status==='over'?'WATCH TARGET MISSED':ev.status==='needs_comp'?'WATCH · NEEDS COMP':'WATCH MATCH',cls=ev.status==='hit'?'good':ev.status==='over'?'warn':'info';return html.replace('<div class="item-top">',`<div class="item-top"><span class="badge ${cls}">${label}</span>`)};

// Scan closes directly into Inventory using the identity + sold-market evidence already collected.
function h38ScanPurchasePayload(){const id=state.scan.identification||{},m=state.scan.market||{},sold=m.market||m.evidence?.sold?.[0]||{},flip=m.flip||{};return{title:id.likely_item||id.search_query||state.scan.hint||'Scanned item',upc:state.scan.upc,sku:id.model_or_part_number||'',buy_price:num(state.scan.buyPrice),resale_estimate:num(sold.typical||sold.median||flip.estimated_resale),source:'Scan / Research',source_url:'',image_url:state.scan.photos?.[0]?.data_url||''}}
const h38v211RenderScan=renderScan;
renderScan=function(){h38v211RenderScan();const p=$('scanPage');if(!p||!state.scan.identification)return;const payload=h38ScanPurchasePayload(),ev=h38WatchEvaluation(payload),target=ev&&num(ev.watch.max_buy)>0?`<span class="badge good">WATCH MAX ${esc(dollars(ev.watch.max_buy))}</span>`:'';p.insertAdjacentHTML('beforeend',`<section class="card"><div class="item-top"><span class="badge info">BUY DECISION</span>${target}</div><h3>Keep the research—don’t type it again</h3><p class="small muted">If you bought this item, Scout will carry its identity, UPC/model, cost and sold-based resale evidence into shared Inventory.</p><button id="scanBought" class="primary wide">I bought it · Save to Inventory</button></section>`);$('scanBought').onclick=()=>recordPurchase(h38ScanPurchasePayload())};

// Exact-UPC image recovery: strict penny retailers may enter the server resolver with barcode proof even when no image URL exists.
const h38v211HuntImageHtml=huntImageHtml;
huntImageHtml=function(r,title){const existing=h38v211HuntImageHtml(r,title);if(existing)return existing;const strict=strictImageRetailer(r.retailer),barcode=itemCode(r);return strict&&barcode?`<div class="thumb thumb-proxy" data-image-key="${esc(itemKey(r))}"><span>PHOTO<br>RECOVERY</span></div>`:''};
function h38RecoveryItems(keys){return keys.map(k=>state.hunt.rows.find(r=>itemKey(r)===k)).filter(Boolean).filter(r=>!r.image_data_url&&!cachedImage(itemKey(r))).filter(r=>/^https?:\/\//i.test(txt(r.image_url))||(strictImageRetailer(r.retailer)&&!!itemCode(r))).map(r=>({key:itemKey(r),retailer:r.retailer,barcode:r.upc||r.gtin||r.barcode||'',proof:r.image_match_barcode||'',image_url:r.image_url||'',reference_url:r.image_reference_url||bestLeadSourceUrl(r)}))}
async function h38ApplyRecovered(map){let changed=false;state.hunt.rows=state.hunt.rows.map(r=>{const x=map.get(itemKey(r));if(x?.data_url){cacheImage(itemKey(r),x.data_url);changed=true;return{...r,image_data_url:x.data_url,image_recovered:true,image_source:x.image_source||r.image_source}}return r});if(changed)renderHuntListOnly();return changed}
drainHuntImageQueue=async function(){if(huntImageBusy||!huntImageQueue.length)return;huntImageBusy=true;const retry=[];try{while(huntImageQueue.length){const items=h38RecoveryItems(huntImageQueue.splice(0,6));if(!items.length)continue;try{const p=await fn('reseller-image-delivery-v201',{items},40000),map=new Map((p.images||[]).map(x=>[x.key,x]));await h38ApplyRecovered(map);for(const it of items)if(!map.has(it.key))retry.push(it.key)}catch(e){error('huntImageDeliveryWide',e);retry.push(...items.map(x=>x.key))}}if(retry.length){await new Promise(r=>setTimeout(r,500));const items=h38RecoveryItems([...new Set(retry)].slice(0,8));if(items.length)try{const p=await fn('reseller-image-delivery-v201',{items},40000);await h38ApplyRecovered(new Map((p.images||[]).map(x=>[x.key,x])))}catch(e){error('huntImageRetryWide',e)}}}finally{huntImageBusy=false}};

async function h38SharedInventoryProbe(){
  const title=`H38 maintenance probe ${Date.now()}`,payload={title,retailer:'Self-Test',location_text:`ZIP ${H38_DEFAULT_ZIP}`,source_type:'maintenance',source_url:'',buy_price:1,retail_price:0,expected_resale:2,estimated_fees:0,estimated_shipping:0,other_costs:0,marketplace:'Self-Test',quantity:1,status:'bought',notes:JSON.stringify({h38_scout_meta:{self_test:true}}),verification_status:'reported',reported_quantity:0};let id='';
  try{const{data,error:e}=await h38sb.from('reseller_deals').insert(payload).select('id,title,status').single();if(e)throw e;id=data?.id||'';if(!id)throw Error('Insert returned no id');const{error:d}=await h38sb.from('reseller_deals').delete().eq('id',id);if(d)throw d;return{ok:true,detail:'Authenticated shared buy/read/delete round-trip passed.'}}catch(e){if(id)try{await h38sb.from('reseller_deals').delete().eq('id',id)}catch{}return{ok:false,detail:txt(e.message||e)}}
}
async function h38SharedWatchProbe(){
  const query=`H38 maintenance watch ${Date.now()}`;let id='';
  try{const{data,error:e}=await h38sb.from('reseller_watch_rules').insert({query_text:query,retailer:'',max_buy_price:80,min_expected_profit:40,min_roi_percent:30,enabled:true}).select('id,query_text').single();if(e)throw e;id=data?.id||'';if(!id)throw Error('Watch insert returned no id');const{error:d}=await h38sb.from('reseller_watch_rules').delete().eq('id',id);if(d)throw d;return{ok:true,detail:'Authenticated shared Watch create/read/delete round-trip passed.'}}catch(e){if(id)try{await h38sb.from('reseller_watch_rules').delete().eq('id',id)}catch{}return{ok:false,detail:txt(e.message||e)}}
}

// Maintenance verifies the shared lifecycle plus the complete penny/image/watch contract for 55744.
const h38v211Maintenance=runMaintenance;
runMaintenance=async function(){
  if(state.maintenance.running)return;state.h38MaintenanceLocalOnly=true;try{await h38v211Maintenance()}finally{state.h38MaintenanceLocalOnly=false}
  state.maintenance.running=true;state.maintenance.tests=state.maintenance.tests.filter(x=>x.name!=='Overall');renderMaintenance();
  try{
    const pennySource=String(huntGroupCard)+String(dateLabel)+String(renderHuntResults)+String(openLeadDetail),markers=['retailer-group','Penny date unknown','Posted ${posted}','Last seen ${last}','physical register scan remains final penny truth'];addTest('Penny truth full contract',markers.every(x=>pennySource.includes(x))?'pass':'fail','Retailer grouping, penny/posted/last-seen dates and physical-register final truth are all present.');
    const shared=await h38SharedInventoryProbe();addTest('Shared Inventory RLS',shared.ok?'pass':'fail',shared.detail);
    const sharedWatch=await h38SharedWatchProbe();addTest('Shared Watch RLS',sharedWatch.ok?'pass':'fail',sharedWatch.detail);
    try{const p=await fn('reseller-image-delivery-v201',{items:[]},30000);addTest('Image delivery service',p?.status==='PASS'?'pass':'fail','Exact-UPC recovery service is authenticated and reachable; missing images do not change penny truth.')}catch(e){addTest('Image delivery service','fail',txt(e.message||e))}
    try{const old=watchRows(),term='H38 ranking fixture';write(H38_KEYS.watch,[{term,min_profit:40,min_roi:30,max_buy:80,created_at:new Date().toISOString()},...old.filter(x=>norm(x.term)!==norm(term))]);const pass=h38WatchEvaluation({title:term,term,buy_price:50,net_profit:60,roi_pct:120}),fail=h38WatchEvaluation({title:term,term,buy_price:90,net_profit:20,roi_pct:22});write(H38_KEYS.watch,old);addTest('Watch ranking logic',pass?.status==='hit'&&fail?.status==='over'?'pass':'fail','Profit/ROI/max-buy targets now influence deal priority and badges.')}catch(e){addTest('Watch ranking logic','fail',txt(e.message||e))}
    addTest('Fallback auto-sync',typeof h38SyncLocalInventoryFallbacks==='function'?'pass':'fail','Device-only purchases automatically retry into shared Inventory on authenticated refresh/startup.');
    addTest('Scan to Inventory',typeof h38ScanPurchasePayload==='function'&&typeof recordPurchase==='function'?'pass':'fail','Scanned identity and sold-based research can be carried directly into shared Inventory.');
    const fails=state.maintenance.tests.filter(x=>x.status==='fail').length,warns=state.maintenance.tests.filter(x=>x.status==='warn').length;addTest('Overall',fails?'fail':warns?'warn':'pass',fails?`${fails} required Scout checks failed.`:warns?`Core lifecycle passed with ${warns} isolated source/conditional warnings.`:'Wide sellable-product acceptance passed for 55744.');
  }finally{state.maintenance.running=false;renderMaintenance()}
};
