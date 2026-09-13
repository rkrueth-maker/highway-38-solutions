import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const html = String.raw`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#2e5a36">
<title>H38 Couponing</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f1f6f1;color:#16301c}.wrap{max-width:680px;margin:auto;padding:calc(12px + env(safe-area-inset-top)) 12px calc(32px + env(safe-area-inset-bottom))}.top{display:flex;align-items:center;gap:10px}.top a{text-decoration:none;color:#356543;font-weight:800}.top h1{font-size:25px;margin:0}.card{background:#fff;border:1px solid #d7e5d9;border-radius:18px;padding:14px;margin:10px 0}.nav{display:flex;gap:6px;overflow:auto;padding:4px 0}.nav button{white-space:nowrap;background:#dfece1;color:#1e4b29}.nav button.active{background:#2e5a36;color:#fff}button{border:0;border-radius:12px;padding:11px 13px;background:#2e5a36;color:#fff;font-weight:760;font:inherit}button.secondary{background:#dfece1;color:#1e4b29}button.remove{background:#f4e3e3;color:#7d2b2b;padding:7px 9px}input,select,textarea{width:100%;font:inherit;padding:12px;border:1px solid #cbdacb;border-radius:12px;background:#fff}textarea{min-height:88px}.row{display:flex;gap:8px}.row>*{flex:1}.stack{display:grid;gap:8px}.small{font-size:12px;color:#607564}.status{font-size:13px;color:#55705c;min-height:18px}.item{border-top:1px solid #e1ebe2;padding:11px 0}.item:first-child{border:0}.item h3{margin:0 0 3px;font-size:16px}.price{font-size:20px;font-weight:850}.badge{display:inline-block;font-size:11px;padding:4px 7px;border-radius:999px;background:#e6efe7;margin:2px 4px 2px 0}.hidden{display:none}.empty{text-align:center;padding:22px 8px;color:#6f8272}.trip{border-left:4px solid #2e5a36;padding-left:10px;margin:10px 0}.big{font-size:24px;font-weight:900}.kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.kpi div{background:#eef5ef;border-radius:12px;padding:9px;text-align:center}.kpi strong{display:block;font-size:17px}.toolbar{display:flex;gap:7px;flex-wrap:wrap}.toolbar button{flex:1 1 120px}.scanbox{text-align:center;padding:18px;border:2px dashed #bfd2c1;border-radius:16px}.section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px}.section-title h2{font-size:19px;margin:0}.checkbox{width:auto;transform:scale(1.2);margin-right:8px}.note{padding:10px;border-radius:12px;background:#eef5ef}.warn{background:#fff3d7}
</style>
</head>
<body data-h38-coupon-web="mobile-ux-v6">
<main class="wrap">
<div class="top"><a href="/functions/v1/h38-deals-shell">‹ H38 Deals</a><h1>Couponing</h1></div>
<section id="locked" class="card hidden"><h2>Not enabled</h2><p>This account does not include Couponing.</p></section>
<div id="app" class="hidden">
<section class="card"><div class="section-title"><h2>Savings Copilot</h2><span id="sync" class="small">Loading…</span></div><p class="small">Build your list, record real nearby prices and coupon stacks, then choose the cheapest practical trip.</p><div id="status" class="status"></div></section>
<section class="card"><div class="section-title"><h2>Shopping location</h2><span class="small">Shared across H38 Deals</span></div><div class="row"><input id="zip" inputmode="numeric" maxlength="5" placeholder="ZIP code"><select id="radius"><option>25</option><option selected>50</option><option>75</option><option>100</option></select></div><button id="useLocation" class="secondary" style="width:100%;margin-top:8px">Use phone location</button></section>
<section id="handoff" class="card hidden"><div class="section-title"><h2>Deal brought from H38</h2></div><div id="handoffDetail" class="small"></div><div class="toolbar" style="margin-top:9px"><button id="handoffList" class="secondary">Add to shopping list</button><button id="handoffStack">Prepare coupon stack</button></div><p class="small">Nothing is saved until you choose an action and confirm it.</p></section>
<div class="nav"><button data-view="shop" class="active">SHOP</button><button data-view="save">SAVE</button><button data-view="scan">SCAN</button><button data-view="deals">DEALS</button><button data-view="receipts">RECEIPTS</button></div>
<section id="view" class="card"></section>
</div>
</main>
<input id="handwriteFile" type="file" accept="image/*" capture="environment" hidden>
<input id="receiptFile" type="file" accept="image/*" capture="environment" hidden>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/dist/umd/supabase.min.js" onerror="this.onerror=null;this.src='https://unpkg.com/@supabase/supabase-js@2.95.0/dist/umd/supabase.min.js'"></script>
<script>
const SUPABASE_URL='https://jqukmwtsgcsaruucnqja.supabase.co';
const KEY='sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1';
const sb=supabase.createClient(SUPABASE_URL,KEY);
const $=id=>document.getElementById(id);
const state={view:'shop',list:null,items:[],prices:[],receipts:[],watch:[],plan:null,barcode:'',receiptText:'',loading:false,handoff:null};
const SHARED_LOCATION_KEY='h38-shopping-location-v1';
const money=v=>'$'+Number(v||0).toFixed(2);
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function effective(p){return Math.max(0,Number(p.shelf_price||0)*Math.max(1,Number(p.required_qty||1))-Number(p.sale_discount||0)-Number(p.store_coupon||0)-Number(p.manufacturer_coupon||0)-Number(p.rebate||0)-Number(p.loyalty_value||0));}
function status(t){$('status').textContent=t||'';}
function saveSharedLocation(){const old=readSharedLocation();const row={zip:$('zip').value.trim(),radius:$('radius').value,radiusMiles:Number($('radius').value||50),lat:old.lat,lon:old.lon};if(row.zip){delete row.lat;delete row.lon;}localStorage.setItem(SHARED_LOCATION_KEY,JSON.stringify(row));}
function readSharedLocation(){try{return JSON.parse(localStorage.getItem(SHARED_LOCATION_KEY)||localStorage.getItem('h38-penny-shopping-location-v1')||localStorage.getItem('h38-resale-location-v1')||'{}')||{};}catch(e){return {};}}
function restoreSharedLocation(){const x=readSharedLocation();$('zip').value=x.zip||'';$('radius').value=String(x.radius||x.radiusMiles||50);if(Object.keys(x).length)localStorage.setItem(SHARED_LOCATION_KEY,JSON.stringify(x));}
function acceptSharedLocation(a,b){const lat=Number(a),lon=Number(b);if(!Number.isFinite(lat)||!Number.isFinite(lon)){status('Location was unavailable. Enter a ZIP instead.');return;}localStorage.setItem(SHARED_LOCATION_KEY,JSON.stringify({zip:'',radius:$('radius').value,radiusMiles:Number($('radius').value||50),lat:lat,lon:lon}));$('zip').value='';status('Phone location saved for Deals, Resale and Couponing.');}
function useSharedLocation(){status('Getting phone location…');if(window.AndroidH38Deals&&AndroidH38Deals.requestLocation){AndroidH38Deals.requestLocation();return;}if(navigator.geolocation)navigator.geolocation.getCurrentPosition(function(p){acceptSharedLocation(p.coords.latitude,p.coords.longitude);},function(){status('Location permission was unavailable. Enter a ZIP instead.');},{timeout:12000});else status('Location is unavailable. Enter a ZIP instead.');}
function readHandoff(){const p=new URLSearchParams(location.search),h={item:String(p.get('item')||'').trim(),store:String(p.get('store')||'').trim(),upc:String(p.get('upc')||'').trim(),sku:String(p.get('sku')||'').trim(),buy:String(p.get('buy')||'').trim()};return h.item||h.upc||h.sku?h:null;}
function showHandoff(){state.handoff=readHandoff();if(!state.handoff)return;const h=state.handoff;$('handoff').classList.remove('hidden');$('handoffDetail').textContent=[h.item,h.store,h.upc?'UPC '+h.upc:'',h.sku?'SKU '+h.sku:'',h.buy?'Shelf price $'+h.buy:''].filter(Boolean).join(' · ');$('handoffList').onclick=function(){addItem(h.item||h.upc||h.sku).then(function(){status('Added to shopping list.');}).catch(function(e){status(e.message);});};$('handoffStack').onclick=function(){state.view='deals';render();$('dealItem').value=h.item;$('dealStore').value=h.store;$('dealBarcode').value=h.upc||h.sku;$('dealShelf').value=h.buy;status('Deal copied into the stack builder. Add verified coupons or rebates, then save.');};}
async function gate(){
  const session=(await sb.auth.getSession()).data.session;
  if(!session){location.href='/functions/v1/h38-deals-shell';return false;}
  const q=await sb.from('h38_product_entitlements').select('active,expires_at').eq('product_key','coupon').maybeSingle();
  const ok=!!(q.data&&q.data.active&&(!q.data.expires_at||new Date(q.data.expires_at)>new Date()));
  $('app').classList.toggle('hidden',!ok);$('locked').classList.toggle('hidden',ok);return ok;
}
async function ensureList(){
  const q=await sb.from('coupon_shopping_lists').select('*').in('status',['active','shopping']).order('updated_at',{ascending:false}).limit(1);
  if(q.error)throw q.error;
  if(q.data&&q.data[0]){state.list=q.data[0];return;}
  const ins=await sb.from('coupon_shopping_lists').insert({name:'Shopping List'}).select().single();
  if(ins.error)throw ins.error;state.list=ins.data;
}
async function load(){if(state.loading)return;state.loading=true;
  try{
    $('sync').textContent='Syncing…';await ensureList();
    const res=await Promise.all([
      sb.from('coupon_list_items').select('*').eq('list_id',state.list.id).order('created_at'),
      sb.from('coupon_price_observations').select('*').order('observed_at',{ascending:false}).limit(300),
      sb.from('coupon_receipts').select('*').order('purchased_at',{ascending:false}).limit(50),
      sb.from('coupon_watch_rules').select('*').eq('enabled',true).order('created_at',{ascending:false})
    ]);
    res.forEach(function(x){if(x.error)throw x.error;});
    state.items=res[0].data||[];state.prices=res[1].data||[];state.receipts=res[2].data||[];state.watch=res[3].data||[];
    $('sync').textContent='Saved';render();
  }catch(e){$('sync').textContent='Error';status('Load failed: '+e.message);}finally{state.loading=false;}
}
async function addItem(name){name=String(name||'').trim();if(!name)return;const q=await sb.from('coupon_list_items').insert({list_id:state.list.id,item_name:name});if(q.error)throw q.error;await load();}
async function addMany(text){
  const nl=String.fromCharCode(10);const normalized=String(text||'').split(',').join(nl);const raw=normalized.split(nl);const seen={};
  for(let i=0;i<raw.length&&i<50;i++){let name=raw[i].replace(/^[-*0-9.) ]+/,'').trim();if(name.length<2||name.length>80||seen[name.toLowerCase()])continue;seen[name.toLowerCase()]=true;const q=await sb.from('coupon_list_items').insert({list_id:state.list.id,item_name:name});if(q.error)throw q.error;}
  await load();
}
async function removeItem(id){const q=await sb.from('coupon_list_items').delete().eq('id',id);if(q.error)throw q.error;await load();}
async function toggleItem(id,v){const q=await sb.from('coupon_list_items').update({checked:v,updated_at:new Date().toISOString()}).eq('id',id);if(q.error)throw q.error;const x=state.items.find(function(i){return i.id===id;});if(x)x.checked=v;render();}
function shopView(){
  let rows=state.items.slice(0,100).map(function(i){return '<div class="item"><div class="row"><label style="flex:8"><input class="checkbox" type="checkbox" data-check="'+esc(i.id)+'" '+(i.checked?'checked':'')+'>'+esc(i.item_name)+'</label><button class="remove" data-remove="'+esc(i.id)+'">Remove</button></div></div>';}).join('');
  return '<div class="section-title"><h2>Shopping list</h2><span class="small">'+state.items.filter(function(x){return !x.checked;}).length+' left</span></div><div class="row"><input id="newItem" placeholder="Milk, Tide, hamburger…"><button id="addItem">Add</button></div><div class="toolbar" style="margin-top:8px"><button id="voice" class="secondary">🎙 Speak list</button><button id="handwrite" class="secondary">📷 Scan handwritten</button><button id="recipe" class="secondary">🍲 Import recipe/list</button></div><div id="recipeBox" class="hidden" style="margin-top:8px"><textarea id="recipeText" placeholder="Paste ingredients or a shopping list, one item per line"></textarea><button id="recipeAdd" style="margin-top:6px">Add items</button></div><div style="margin-top:10px">'+(rows||'<div class="empty">Add what you need to buy.</div>')+'</div>';
}
function planHtml(){
  const p=state.plan&&state.plan.best,o=state.plan&&state.plan.one;if(!p)return '<div class="empty">Tap Optimize my list after you have prices saved.</div>';
  const diff=o?Number(o.total||0)-Number(p.total||0):0;
  let trips=(p.stores||[]).map(function(s){let items=(p.items||[]).filter(function(x){return x.store===s;}).map(function(x){return '<div class="item"><b>'+esc(x.item)+'</b><div class="small">'+money(x.cost)+' · saved '+money(x.savings)+' · '+esc(x.confidence||'')+'</div></div>';}).join('');return '<div class="trip"><strong>'+esc(s)+'</strong>'+items+'</div>';}).join('');
  return '<div class="kpi"><div><strong>'+money(p.total)+'</strong><span class="small">Real cost</span></div><div><strong>'+money(p.savings)+'</strong><span class="small">Savings</span></div><div><strong>'+((p.stores||[]).length)+'</strong><span class="small">Stops</span></div></div><p class="small">Items '+money(p.subtotal)+' + estimated travel '+money(p.travel)+'.</p>'+(o&&p.stores&&p.stores.length>1?'<div class="note '+(diff<2?'warn':'')+'">'+(diff<2?'Extra stop saves only '+money(diff)+' — skip it.':'Extra stop saves '+money(diff)+' compared with one store.')+'</div>':'')+trips+'<button id="storeMode">Start Store Mode</button>';
}
function saveView(){
  return '<div class="section-title"><h2>Optimize my list</h2></div><div class="stack"><select id="mode"><option value="single_store" '+(state.list.optimize_mode==='single_store'?'selected':'')+'>Best single store</option><option value="two_stores" '+(state.list.optimize_mode==='two_stores'?'selected':'')+'>Cheapest within 2 stores</option><option value="practical" '+(state.list.optimize_mode==='practical'?'selected':'')+'>Best practical trip</option><option value="maximum_savings" '+(state.list.optimize_mode==='maximum_savings'?'selected':'')+'>Maximum savings</option></select><div class="row"><input id="budget" type="number" step=".01" placeholder="Budget" value="'+esc(state.list.budget==null?'':state.list.budget)+'"><input id="maxStores" type="number" min="1" max="4" value="'+esc(state.list.max_stores||2)+'"></div><textarea id="assistant" placeholder="Get this under $80. No more than two stores. Brand does not matter except Tide."></textarea><div class="row"><button id="applyAssistant" class="secondary">Apply request</button><button id="runOptimize">Optimize my list</button></div></div><div style="margin-top:12px">'+planHtml()+'</div>';
}
function scanView(){
  const code=String(state.barcode||'').replace(/\D/g,'');const matches=code?state.prices.filter(function(p){return String(p.barcode||'').replace(/\D/g,'')===code;}):[];
  return '<div class="section-title"><h2>Scan in store</h2></div><div class="scanbox"><div class="big">'+(state.barcode?esc(state.barcode):'Barcode')+'</div><p class="small">Scan a product to compare saved nearby prices, stacks and price history.</p><button id="scanBarcode">Scan barcode</button><input id="manualBarcode" placeholder="or type UPC" value="'+esc(state.barcode)+'" style="margin-top:8px"></div><div style="margin-top:10px">'+(matches.length?matches.map(priceCard).join(''):(state.barcode?'<div class="empty">No saved offers for this barcode yet. Add one under DEALS.</div>':''))+'</div>';
}
function priceCard(p){const e=effective(p),s=Number(p.shelf_price||0)*Math.max(1,Number(p.required_qty||1))-e,unit=e/Math.max(1,Number(p.package_qty||1));return '<div class="item"><h3>'+esc(p.item_name)+' — '+esc(p.store)+'</h3><span class="badge">'+esc(String(p.confidence||'medium').toUpperCase())+' CONFIDENCE</span><div class="price">'+money(e)+' effective</div><div class="small">Shelf '+money(p.shelf_price)+' · savings '+money(s)+' · '+money(unit)+'/'+esc(p.unit_label||'unit')+'</div><div class="small">Sale −'+money(p.sale_discount)+' · store coupon −'+money(p.store_coupon)+' · manufacturer −'+money(p.manufacturer_coupon)+' · rebate −'+money(p.rebate)+' · loyalty −'+money(p.loyalty_value)+'</div>'+(p.id?'<button class="remove" data-remove-price="'+esc(p.id)+'">Delete price</button>':'')+'</div>';}
function dealsView(){
  const cards=state.prices.slice(0,60).map(priceCard).join('');
  const watches=state.watch.map(function(w){return '<div class="item"><b>'+esc(w.item_name)+'</b><div class="small">Target '+(w.target_effective_price==null?'any strong deal':money(w.target_effective_price))+'</div><button class="remove" data-remove-watch="'+esc(w.id)+'">Remove watch</button></div>';}).join('');
  return '<div class="section-title"><h2>Deal & Coupon Stack Builder</h2></div><div class="stack"><input id="dealItem" placeholder="Item"><input id="dealBarcode" placeholder="UPC / barcode"><div class="row"><input id="dealStore" placeholder="Store"><input id="dealShelf" type="number" step=".01" placeholder="Shelf price"></div><div class="row"><input id="dealSale" type="number" step=".01" placeholder="Sale discount"><input id="dealStoreCoupon" type="number" step=".01" placeholder="Store coupon"></div><div class="row"><input id="dealMfr" type="number" step=".01" placeholder="Manufacturer coupon"><input id="dealRebate" type="number" step=".01" placeholder="Cash back"></div><div class="row"><input id="dealLoyalty" type="number" step=".01" placeholder="Loyalty reward"><input id="dealDistance" type="number" step=".1" placeholder="Miles away"></div><div class="row"><input id="dealPackage" type="number" step=".01" value="1" placeholder="Package units"><select id="dealConfidence"><option value="high">High confidence</option><option value="medium" selected>Medium</option><option value="low">Low</option></select></div><input id="dealSource" placeholder="Source note / expiration"><button id="previewStack" class="secondary">Calculate stack</button><div id="stackPreview" class="small"></div><button id="saveDeal">Save price + stack</button></div><hr style="border:0;border-top:1px solid #e1ebe2;margin:16px 0"><div class="section-title"><h2>Deals for me / Price history</h2></div>'+(cards||'<div class="empty">Add local prices, sales and coupons. Your price history grows automatically.</div>')+'<div class="section-title" style="margin-top:14px"><h2>Watch list</h2></div><div class="row"><input id="watchItem" placeholder="Item to watch"><input id="watchTarget" type="number" step=".01" placeholder="Target price"><button id="addWatch">Watch</button></div>'+watches;
}
function receiptsView(){
  const rows=state.receipts.map(function(r){return '<div class="item"><h3>'+esc(r.store||'Receipt')+'</h3><div class="price">'+money(r.total)+'</div><div class="small">'+new Date(r.purchased_at).toLocaleDateString()+'</div><button class="remove" data-remove-receipt="'+esc(r.id)+'">Delete receipt</button></div>';}).join('');
  return '<div class="section-title"><h2>Receipts</h2></div><div class="scanbox"><p>Take one picture. We read what we can, then you confirm the store and total.</p><button id="scanReceipt">Scan receipt</button></div><div class="row" style="margin-top:10px"><input id="receiptStore" placeholder="Store"><input id="receiptTotal" type="number" step=".01" placeholder="Total"><button id="saveReceipt">Save</button></div><div id="receiptOcr" class="small" style="white-space:pre-wrap;margin-top:8px">'+esc(state.receiptText)+'</div>'+rows;
}
function render(){document.querySelectorAll('.nav button').forEach(function(b){b.classList.toggle('active',b.dataset.view===state.view);});$('view').innerHTML=state.view==='shop'?shopView():state.view==='save'?saveView():state.view==='scan'?scanView():state.view==='deals'?dealsView():receiptsView();wire();}
async function optimize(){
  const items=state.items.filter(function(x){return !x.checked;});if(!items.length){status('Add shopping items first.');return;}if(!state.prices.length){status('Add real store prices/deals first.');state.view='deals';render();return;}
  const mode=$('mode')?$('mode').value:(state.list.optimize_mode||'practical'),max=$('maxStores')?Math.max(1,Math.min(4,Number($('maxStores').value||2))):Number(state.list.max_stores||2),budget=$('budget')&&$('budget').value?Number($('budget').value):null;state.list.optimize_mode=mode;state.list.max_stores=max;state.list.budget=budget;const saved=await sb.from('coupon_shopping_lists').update({optimize_mode:mode,max_stores:max,budget:budget,updated_at:new Date().toISOString()}).eq('id',state.list.id);if(saved.error)throw saved.error;
  const common={items:items,prices:state.prices,travel_cost_per_mile:Number(state.list.travel_cost_per_mile||0.25)};
  const one=await sb.functions.invoke('h38-coupon-api',{body:Object.assign({action:'optimize',max_stores:1,mode:'single_store'},common)});
  const best=await sb.functions.invoke('h38-coupon-api',{body:Object.assign({action:'optimize',max_stores:max,mode:mode},common)});
  if(one.error||best.error)throw one.error||best.error;state.plan={one:one.data&&one.data.best,best:best.data&&best.data.best};render();
}
function dealRow(){return {item_name:$('dealItem').value.trim(),barcode:$('dealBarcode').value.trim(),store:$('dealStore').value.trim(),shelf_price:Number($('dealShelf').value||0),sale_discount:Number($('dealSale').value||0),store_coupon:Number($('dealStoreCoupon').value||0),manufacturer_coupon:Number($('dealMfr').value||0),rebate:Number($('dealRebate').value||0),loyalty_value:Number($('dealLoyalty').value||0),package_qty:Number($('dealPackage').value||1),distance_miles:Number($('dealDistance').value||0),confidence:$('dealConfidence').value,source_note:$('dealSource').value.trim()};}
async function previewStack(){const row=dealRow();const q=await sb.functions.invoke('h38-coupon-api',{body:{action:'stack',price:row}});if(q.error)throw q.error;$('stackPreview').textContent='Effective '+money(q.data.stack.effective)+' · savings '+money(q.data.stack.savings);}
async function saveDeal(){const row=dealRow();if(!row.item_name||!row.store||!row.shelf_price){status('Item, store and shelf price are required.');return;}const q=await sb.from('coupon_price_observations').insert(row);if(q.error)throw q.error;status('Deal saved.');await load();}
async function addWatch(){const item=$('watchItem').value.trim();if(!item)return;const q=await sb.from('coupon_watch_rules').insert({item_name:item,target_effective_price:$('watchTarget').value?Number($('watchTarget').value):null});if(q.error)throw q.error;await load();}
async function saveReceipt(){const store=$('receiptStore').value.trim(),total=Number($('receiptTotal').value||0);if(!store||!Number.isFinite(total)||total<=0){status('Confirm the store and a total greater than $0.');return;}const q=await sb.from('coupon_receipts').insert({store:store,total:total,notes:String(state.receiptText||'').slice(0,4000)});if(q.error)throw q.error;status('Receipt saved.');state.receiptText='';await load();}async function deleteRecord(table,id,label){const q=await sb.from(table).delete().eq('id',id);if(q.error)throw q.error;status(label+' deleted.');await load();}function fillReceipt(text){state.receiptText=text;const lines=text.split(String.fromCharCode(10)).map(function(x){return x.trim();}).filter(Boolean);if($('receiptStore'))$('receiptStore').value=(lines[0]||'').slice(0,60);const nums=[];String(text).replace(/(?:total|amount)\s*[:$]?\s*\$?([0-9]+\.[0-9]{2})/ig,function(_,n){nums.push(Number(n));return _;});if(nums.length&&$('receiptTotal'))$('receiptTotal').value=Math.max.apply(null,nums).toFixed(2);}
function startVoice(){
  if(window.AndroidH38Deals&&AndroidH38Deals.speakList){AndroidH38Deals.speakList();return;}
  const R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R){status('Voice list is not supported on this device.');return;}const r=new R();r.lang='en-US';r.interimResults=false;r.onresult=function(e){addMany(e.results[0][0].transcript).catch(function(x){status(x.message);});};r.onerror=function(e){status('Voice error: '+e.error);};r.start();
}
async function ensureOcr(){if(window.Tesseract)return;await new Promise(function(resolve,reject){const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=resolve;s.onerror=function(){s.onerror=reject;s.src='https://unpkg.com/tesseract.js@5/dist/tesseract.min.js';};document.head.appendChild(s);});}
async function ocrFile(file,target){if(!file)return '';target.textContent='Reading image…';await ensureOcr();const out=await Tesseract.recognize(file,'eng',{logger:function(m){if(m.status==='recognizing text')target.textContent='Reading '+Math.round((m.progress||0)*100)+'%…';}});target.textContent=out.data.text;return out.data.text;}
function wire(){
  if(state.view==='shop'){
    $('addItem').onclick=function(){addItem($('newItem').value).catch(function(e){status(e.message);});};$('newItem').onkeydown=function(e){if(e.key==='Enter')$('addItem').click();};
    document.querySelectorAll('[data-remove]').forEach(function(b){b.onclick=function(){if(confirm('Remove this shopping item?'))removeItem(b.dataset.remove).catch(function(e){status(e.message);});};});document.querySelectorAll('[data-check]').forEach(function(b){b.onchange=function(){toggleItem(b.dataset.check,b.checked).catch(function(e){status(e.message);});};});
    $('recipe').onclick=function(){$('recipeBox').classList.toggle('hidden');};$('recipeAdd').onclick=function(){addMany($('recipeText').value).catch(function(e){status(e.message);});};$('voice').onclick=startVoice;
    $('handwrite').onclick=function(){if(window.AndroidH38Deals&&AndroidH38Deals.takePhoto){AndroidH38Deals.takePhoto('shopping-list');}else $('handwriteFile').click();};
  }
  if(state.view==='save'){
    $('runOptimize').onclick=function(){optimize().catch(function(e){status(e.message);});};
    $('mode').onchange=async function(){const mode=$('mode').value;const max=mode==='single_store'?1:mode==='two_stores'?2:mode==='maximum_savings'?4:Number($('maxStores').value||2);const q=await sb.from('coupon_shopping_lists').update({optimize_mode:mode,max_stores:max,budget:$('budget').value?Number($('budget').value):null,updated_at:new Date().toISOString()}).eq('id',state.list.id);if(q.error){status(q.error.message);return;}state.list.optimize_mode=mode;state.list.max_stores=max;};
    $('applyAssistant').onclick=async function(){const q=await sb.functions.invoke('h38-coupon-api',{body:{action:'assistant',text:$('assistant').value}});if(q.error){status(q.error.message);return;}const x=q.data.intent;state.list.max_stores=x.max_stores;state.list.optimize_mode=x.mode;if(x.budget!=null)state.list.budget=x.budget;const u=await sb.from('coupon_shopping_lists').update({max_stores:x.max_stores,optimize_mode:x.mode,budget:x.budget}).eq('id',state.list.id);if(u.error){status(u.error.message);return;}render();};
    if($('storeMode'))$('storeMode').onclick=function(){state.view='shop';status('Store Mode: check items off as you shop.');render();};
  }
  if(state.view==='scan'){$('scanBarcode').onclick=function(){if(window.AndroidH38Deals&&AndroidH38Deals.scanBarcode)AndroidH38Deals.scanBarcode();else $('manualBarcode').focus();};$('manualBarcode').onchange=function(){state.barcode=$('manualBarcode').value;render();};}
  if(state.view==='deals'){$('previewStack').onclick=function(){previewStack().catch(function(e){status(e.message);});};$('saveDeal').onclick=function(){saveDeal().catch(function(e){status(e.message);});};$('addWatch').onclick=function(){addWatch().catch(function(e){status(e.message);});};document.querySelectorAll('[data-remove-price]').forEach(function(b){b.onclick=function(){if(confirm('Delete this saved price?'))deleteRecord('coupon_price_observations',b.dataset.removePrice,'Price').catch(function(e){status(e.message);});};});document.querySelectorAll('[data-remove-watch]').forEach(function(b){b.onclick=function(){if(confirm('Remove this watch?'))deleteRecord('coupon_watch_rules',b.dataset.removeWatch,'Watch').catch(function(e){status(e.message);});};});}
  if(state.view==='receipts'){$('scanReceipt').onclick=function(){if(window.AndroidH38Deals&&AndroidH38Deals.takePhoto){AndroidH38Deals.takePhoto('receipt');}else $('receiptFile').click();};$('saveReceipt').onclick=function(){saveReceipt().catch(function(e){status(e.message);});};document.querySelectorAll('[data-remove-receipt]').forEach(function(b){b.onclick=function(){if(confirm('Delete this receipt record?'))deleteRecord('coupon_receipts',b.dataset.removeReceipt,'Receipt').catch(function(e){status(e.message);});};});}
}
$('handwriteFile').onchange=async function(e){try{const text=await ocrFile(e.target.files[0],$('status'));await addMany(text);status('Scanned list added. Review item names.');}catch(err){status('List scan failed: '+err.message);}};
$('receiptFile').onchange=async function(e){try{state.view='receipts';render();const text=await ocrFile(e.target.files[0],$('receiptOcr'));fillReceipt(text);status('Receipt read. Confirm store and total, then Save.');}catch(err){status('Receipt scan failed: '+err.message);}};
window.H38NativeBarcodeResult=function(v){state.barcode=String(v||'');state.view='scan';render();};
window.H38NativeSpeechResult=function(v){addMany(String(v||'')).catch(function(e){status(e.message);});};
window.H38NativePhotoResult=function(role,dataUrl){try{fetch(dataUrl).then(function(r){return r.blob();}).then(async function(blob){if(role==='receipt'){state.view='receipts';render();const text=await ocrFile(blob,$('receiptOcr'));fillReceipt(text);status('Receipt read. Confirm store and total.');}else{const text=await ocrFile(blob,$('status'));await addMany(text);status('Scanned list added.');}}).catch(function(e){status('Photo read failed: '+e.message);});}catch(e){status('Photo read failed: '+e.message);}};
window.H38NativePhotoError=function(v){status(String(v||'Photo canceled'));};
document.querySelectorAll('.nav button').forEach(function(b){b.onclick=function(){state.view=b.dataset.view;render();};});
$('zip').onchange=saveSharedLocation;$('radius').onchange=saveSharedLocation;$('useLocation').onclick=useSharedLocation;window.H38NativeLocationResult=acceptSharedLocation;window.H38NativeLocationError=function(v){status(String(v||'Location permission was unavailable. Enter a ZIP instead.'));};restoreSharedLocation();
(async function(){if(await gate()){await load();showHandoff();}})();
</script>
</body>
</html>`;

Deno.serve(() => new Response(html, {headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com; connect-src 'self' https://jqukmwtsgcsaruucnqja.supabase.co wss://jqukmwtsgcsaruucnqja.supabase.co https://cdn.jsdelivr.net https://unpkg.com; worker-src 'self' blob: https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; frame-ancestors 'self'"}}));
