import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const html = String.raw\`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b2438">
<title>Today's Best · H38 Deals</title>
<style>
*{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f3f6f8;color:#102331}
.wrap{max-width:760px;margin:auto;padding:calc(12px + env(safe-area-inset-top)) 12px calc(30px + env(safe-area-inset-bottom))}
.top{display:flex;align-items:center;gap:10px;min-width:0}.back{color:#0b2438;text-decoration:none;font-weight:800;padding:10px 2px;white-space:nowrap}.grow{flex:1;min-width:0}.top h1{font-size:24px;margin:0;overflow-wrap:anywhere}.muted{color:#61727d}.small{font-size:12px}.hidden{display:none!important}
.card{background:#fff;border:1px solid #dce4e9;border-radius:18px;padding:14px;margin:10px 0;box-shadow:0 5px 18px rgba(11,36,56,.05);min-width:0}
.hero{background:#0b2438;color:#fff}.hero .muted{color:#c8d6df}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}.stat{background:rgba(255,255,255,.1);border-radius:12px;padding:10px 7px;text-align:center;min-width:0}.stat b{display:block;font-size:20px}.stat span{display:block;font-size:10px;overflow-wrap:anywhere}
button,.btn,input,select{font:inherit}button,.btn{min-height:44px;border:0;border-radius:12px;padding:10px 13px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px}.primary{background:#0b2438;color:#fff}.secondary{background:#e7edf1;color:#102331}.good{background:#e4f5e8;color:#155b2a}.warn{background:#fff1de;color:#824600}.danger{background:#fde8e8;color:#8d2222}.btnrow{display:flex;gap:8px;flex-wrap:wrap;min-width:0}.btnrow>*{flex:1 1 120px;max-width:100%}
input,select{width:100%;min-width:0;border:1px solid #cbd6dd;border-radius:12px;padding:11px 12px;background:#fff;color:#102331}
.controls{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}.location{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
.tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;position:sticky;top:0;z-index:4;background:#f3f6f8;padding:7px 0}.tab{min-width:0;padding:9px 4px;font-size:12px;background:#e6edf1;color:#24404f}.tab.active{background:#0b2438;color:#fff}
.deal{position:relative}.deal h3{margin:3px 0 5px;font-size:18px;overflow-wrap:anywhere}.eyebrow{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.04em;color:#647680;overflow-wrap:anywhere}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:10px 0}.metric{border:1px solid #e1e7eb;border-radius:11px;padding:8px;min-width:0}.metric b{display:block;font-size:15px;overflow-wrap:anywhere}.metric span{font-size:10px;color:#687984}.truth{font-size:11px;font-weight:850;padding:5px 8px;border-radius:999px;background:#edf2f5;display:inline-block;max-width:100%;overflow-wrap:anywhere}.source{overflow-wrap:anywhere}.source a{color:#155d86}.actionstate{font-size:11px;font-weight:850;margin-left:6px}.history{margin-top:8px;padding:10px;background:#f6f8fa;border-radius:12px;font-size:12px;overflow-wrap:anywhere}.history table{width:100%;border-collapse:collapse}.history td{padding:4px;border-bottom:1px solid #e5eaed}
.coverage summary{cursor:pointer;font-weight:800}.warning{padding:8px 0;border-bottom:1px solid #eef1f3;font-size:12px;overflow-wrap:anywhere}
.formgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.formgrid .wide{grid-column:1/-1}.watchrow,.queuerow{border-top:1px solid #e7ecef;padding:10px 0;min-width:0}.watchrow:first-child,.queuerow:first-child{border-top:0}.watchrow strong,.queuerow strong{overflow-wrap:anywhere}
.status{min-height:20px;font-size:12px;margin:8px 0}.error{color:#9a2424}.success{color:#17622c}.empty{text-align:center;padding:28px 12px;color:#6b7c86}
.auth{max-width:440px;margin:30px auto}.auth input{margin:6px 0}.spinner{display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
@media(max-width:520px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.controls{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.tabs{gap:3px}.tab{font-size:11px;padding:9px 2px}.formgrid{grid-template-columns:1fr}.formgrid .wide{grid-column:auto}}
</style>
</head>
<body>
<main class="wrap">
<div class="top"><a class="back" href="/functions/v1/h38-deals-shell">‹ H38 Deals</a><div class="grow"><h1>Today's Best</h1><div class="small muted">One ranked view across Penny, Resale, Couponing and watches.</div></div></div>

<section id="auth" class="card auth hidden">
<h2>Sign in</h2><p class="muted">Use the same H38 Deals account.</p>
<form id="login"><input id="email" type="email" autocomplete="username" placeholder="Email" required><input id="password" type="password" autocomplete="current-password" placeholder="Password" required><button class="primary" type="submit">Sign in</button></form>
<div id="authStatus" class="status"></div>
</section>

<section id="app" class="hidden">
<section class="card hero">
<div class="top"><div class="grow"><div class="eyebrow" style="color:#bad0dc">H38 Deal Engine</div><h2 style="margin:3px 0">Best opportunities first</h2><div id="refreshed" class="small muted">Loading…</div></div><button id="refresh" class="secondary" type="button">Refresh</button></div>
<div class="stats"><div class="stat"><b id="sActive">–</b><span>ACTIVE</span></div><div class="stat"><b id="sWatch">–</b><span>WATCH HITS</span></div><div class="stat"><b id="sProfit">–</b><span>KNOWN PROFIT</span></div><div class="stat"><b id="sQueue">–</b><span>SOURCING</span></div></div>
</section>

<section class="card">
<div class="location"><input id="zip" inputmode="numeric" maxlength="5" placeholder="ZIP for source refresh (optional)"><button id="useLocation" class="secondary" type="button">Use phone location</button></div>
<div class="btnrow" style="margin-top:8px"><button id="refreshSources" class="primary" type="button">Refresh sources + engine</button><button id="openPenny" class="secondary" type="button">Penny</button><button id="openResale" class="secondary" type="button">Resale</button><button id="openCoupon" class="secondary" type="button">Couponing</button></div>
<div id="status" class="status" aria-live="polite"></div>
</section>

<details class="card coverage"><summary>Source coverage & truth</summary><div id="coverage" class="small muted" style="margin-top:8px">Loading…</div></details>

<div class="tabs" role="tablist">
<button class="tab active" data-tab="best" type="button">Best</button>
<button class="tab" data-tab="resell" type="button">Resell</button>
<button class="tab" data-tab="savings" type="button">Savings</button>
<button class="tab" data-tab="watches" type="button">Watches</button>
<button class="tab" data-tab="queue" type="button">Queue</button>
</div>

<section id="dealControls" class="card">
<div class="controls"><input id="search" placeholder="Filter title or retailer"><select id="sort"><option value="score">Sort: best score</option><option value="discount">Sort: discount</option><option value="profit">Sort: profit</option><option value="roi">Sort: ROI</option><option value="newest">Sort: newest</option><option value="closest">Sort: closest</option></select></div>
<div id="segmentNote" class="small muted" style="margin-top:8px"></div>
</section>
<section id="deals"></section>

<section id="watchesPane" class="hidden">
<div class="card"><h3 style="margin-top:0">Unified watch</h3><p class="small muted">A watch is shared across the household and mirrored into the existing Resale/Couponing watch systems where applicable.</p>
<form id="watchForm" class="formgrid">
<input id="watchQuery" class="wide" placeholder="Product, keyword, category or rule label">
<input id="watchRetailer" placeholder="Retailer (optional)">
<select id="watchArea"><option value="all">All H38 Deals</option><option value="penny">Penny</option><option value="resale">Resale</option><option value="coupon">Couponing</option><option value="watch">Web/Amazon watch</option></select>
<select id="watchMode"><option value="keyword">Keyword</option><option value="specific">Specific item</option><option value="category">Category</option><option value="rule">Rule only</option></select>
<input id="watchMax" inputmode="decimal" placeholder="Max buy price">
<input id="watchDiscount" inputmode="decimal" placeholder="Min discount %">
<input id="watchProfit" inputmode="decimal" placeholder="Min profit $">
<input id="watchRoi" inputmode="decimal" placeholder="Min ROI %">
<button class="primary wide" type="submit">Save watch</button>
</form></div>
<div id="watchList" class="card"></div>
</section>

<section id="queuePane" class="hidden"><div id="queueList" class="card"></div></section>
</section>
</main>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.min.js"></script>
<script>
'use strict';
const SUPABASE_URL='https://jqukmwtsgcsaruucnqja.supabase.co';
const KEY='sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1';
const sb=window.supabase.createClient(SUPABASE_URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
const $=id=>document.getElementById(id);
let data=null,currentTab='best',geo=null,busy=false;
const money=v=>v==null||v===''?'—':('$'+Number(v).toFixed(2));
const pct=v=>v==null||v===''?'—':(Number(v).toFixed(0)+'%');
const ago=v=>{const ms=Date.now()-Date.parse(v||'');if(!Number.isFinite(ms))return'unknown';const h=Math.max(0,Math.round(ms/3600000));return h<1?'just now':h<24?h+'h ago':Math.round(h/24)+'d ago'};
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=v=>/^https:\\/\\//i.test(String(v||''))?String(v):'';
function setStatus(msg,type){$('status').textContent=msg||'';$('status').className='status '+(type||'')}
async function invoke(body){const r=await sb.functions.invoke('h38-deal-engine-api',{body});if(r.error)throw new Error(r.error.message||'Deal Engine request failed');if(r.data&&r.data.error)throw new Error(r.data.detail||r.data.error);return r.data}
function setBusy(on,label){busy=on;$('refresh').disabled=on;$('refreshSources').disabled=on;if(label)setStatus(label)}
function metric(label,value){return '<div class="metric"><b>'+esc(value)+'</b><span>'+esc(label)+'</span></div>'}
function card(row){
 const profit=row.estimated_profit==null?'—':money(row.estimated_profit),roi=row.roi_percent==null?'—':pct(row.roi_percent);
 const source=safeUrl(row.source_url)?'<a href="'+esc(row.source_url)+'" target="_blank" rel="noopener">Open source</a>':'No direct source link';
 const action=row.user_action?'<span class="actionstate">'+esc(row.user_action.toUpperCase())+'</span>':'';
 const watch=row.watch_hit?'<span class="truth good">WATCH HIT</span>':'';
 return '<article class="card deal" data-key="'+esc(row.canonical_key)+'">'+
   '<div class="eyebrow">'+esc(row.retailer||row.source_name||row.product_area)+' · '+esc(row.product_area)+'</div>'+
   '<h3>'+esc(row.title)+'</h3>'+
   '<div>'+watch+' <span class="truth">'+esc(row.evidence_status)+'</span>'+action+'</div>'+
   '<div class="metrics">'+metric('BUY',money(row.observed_price))+metric('DISCOUNT',pct(row.discount_percent))+metric('NET PROFIT',profit)+metric('ROI',roi)+'</div>'+
   '<div class="small muted">Score <b>'+esc(row.display_score)+'</b>/100 · confidence '+pct(row.confidence_score)+' · observed '+esc(ago(row.observed_at))+(row.distance_miles!=null?' · '+Number(row.distance_miles).toFixed(1)+' mi':'')+'</div>'+
   (row.availability_label?'<p class="small muted">'+esc(row.availability_label)+'</p>':'')+
   '<div class="small source">'+source+'</div>'+
   '<div class="btnrow" style="margin-top:10px"><button class="good act" data-action="buy" type="button">Buy</button><button class="secondary act" data-action="watch" type="button">Watch</button><button class="danger act" data-action="pass" type="button">Pass</button><button class="secondary hist" type="button">History</button></div>'+
   '<div class="history hidden"></div></article>';
}
function segmentRows(){
 if(!data)return[];
 if(currentTab==='best')return data.segments.best||[];
 if(currentTab==='resell')return data.segments.resell||[];
 if(currentTab==='savings')return data.segments.savings||[];
 return[];
}
function sorted(rows){
 const q=$('search').value.trim().toLowerCase(),sort=$('sort').value;
 let out=rows.filter(x=>!q||(String(x.title||'')+' '+String(x.retailer||'')).toLowerCase().includes(q));
 const val=(x,k)=>x[k]==null?-Infinity:Number(x[k]);
 if(sort==='discount')out.sort((a,b)=>val(b,'discount_percent')-val(a,'discount_percent'));
 else if(sort==='profit')out.sort((a,b)=>val(b,'estimated_profit')-val(a,'estimated_profit'));
 else if(sort==='roi')out.sort((a,b)=>val(b,'roi_percent')-val(a,'roi_percent'));
 else if(sort==='newest')out.sort((a,b)=>Date.parse(b.first_seen_at)-Date.parse(a.first_seen_at));
 else if(sort==='closest')out.sort((a,b)=>(a.distance_miles==null?Infinity:Number(a.distance_miles))-(b.distance_miles==null?Infinity:Number(b.distance_miles)));
 else out.sort((a,b)=>Number(b.display_score||0)-Number(a.display_score||0));
 return out;
}
function renderDeals(){
 if(['watches','queue'].includes(currentTab))return;
 const rows=sorted(segmentRows());$('deals').innerHTML=rows.length?rows.map(card).join(''):'<div class="card empty">No current opportunities match this view.</div>';
 const notes={best:'Highest evidence-weighted opportunities. Missing profit is never guessed.',resell:'Only opportunities with enough cost/resale evidence to calculate net profit.',savings:'Largest evidence-backed discounts; local stock/price may still require verification.'};
 $('segmentNote').textContent=notes[currentTab]||'';
 document.querySelectorAll('.act').forEach(btn=>btn.addEventListener('click',dealAction));
 document.querySelectorAll('.hist').forEach(btn=>btn.addEventListener('click',showHistory));
}
function renderCoverage(){
 const warnings=(data&&data.state&&data.state.warnings)||[],counts=(data&&data.state&&data.state.source_counts)||{};
 const areas=counts.areas||{},retailers=counts.retailers||{};
 let h='<div><b>Normalized now:</b> '+esc(JSON.stringify(areas))+'</div>';
 const top=Object.entries(retailers).sort((a,b)=>b[1]-a[1]).slice(0,8);
 if(top.length)h+='<div style="margin-top:6px"><b>Top retailer coverage:</b> '+top.map(x=>esc(x[0])+' '+esc(x[1])).join(' · ')+'</div>';
 if(warnings.length)h+='<div style="margin-top:8px">'+warnings.map(x=>'<div class="warning">'+esc(x)+'</div>').join('')+'</div>';
 else h+='<div class="success" style="margin-top:8px">No source warnings reported.</div>';
 $('coverage').innerHTML=h;
}
function renderWatches(){
 const rows=data&&data.watches||[];
 $('watchList').innerHTML='<h3 style="margin-top:0">Shared watches ('+rows.length+')</h3>'+(rows.length?rows.map(w=>'<div class="watchrow"><strong>'+esc(w.query_text||'Rule')+'</strong><div class="small muted">'+esc(w.retailer||'All retailers')+' · '+esc(w.product_area)+' · '+esc(w.watch_mode)+(w.max_buy_price!=null?' · max '+money(w.max_buy_price):'')+(w.min_discount_percent!=null?' · '+pct(w.min_discount_percent)+'+ off':'')+(w.min_expected_profit!=null?' · '+money(w.min_expected_profit)+'+ profit':'')+(w.min_roi_percent!=null?' · '+pct(w.min_roi_percent)+'+ ROI':'')+'</div><button class="danger deleteWatch" data-id="'+esc(w.id)+'" type="button" style="margin-top:7px">Delete</button></div>').join(''):'<div class="empty">No watches yet.</div>');
 document.querySelectorAll('.deleteWatch').forEach(b=>b.addEventListener('click',async()=>{try{setStatus('Deleting watch…');await invoke({action:'watch_delete',id:b.dataset.id});await load(false);setStatus('Watch deleted.','success')}catch(e){setStatus(String(e.message||e),'error')}}));
}
function renderQueue(){
 const rows=data&&data.queue||[];
 $('queueList').innerHTML='<h3 style="margin-top:0">Sourcing queue ('+rows.length+')</h3>'+(rows.length?rows.map(q=>'<div class="queuerow"><strong>'+esc(q.canonical_key.replace(/^[^:]+:/,''))+'</strong><div class="small muted">Qty '+esc(q.quantity)+' · estimated '+money(q.estimated_cost)+' · updated '+esc(ago(q.updated_at))+'</div><div class="controls" style="margin-top:7px"><select class="queueStatus" data-id="'+esc(q.id)+'"><option value="planned"'+(q.status==='planned'?' selected':'')+'>Planned</option><option value="purchased"'+(q.status==='purchased'?' selected':'')+'>Purchased</option><option value="listed"'+(q.status==='listed'?' selected':'')+'>Listed</option><option value="sold"'+(q.status==='sold'?' selected':'')+'>Sold</option><option value="cancelled"'+(q.status==='cancelled'?' selected':'')+'>Cancelled</option></select><input class="queueCost" data-id="'+esc(q.id)+'" inputmode="decimal" placeholder="Actual cost" value="'+esc(q.actual_cost==null?'':q.actual_cost)+'"></div></div>').join(''):'<div class="empty">Nothing queued to buy.</div>');
 document.querySelectorAll('.queueStatus').forEach(el=>el.addEventListener('change',()=>saveQueue(el.dataset.id)));
 document.querySelectorAll('.queueCost').forEach(el=>el.addEventListener('change',()=>saveQueue(el.dataset.id)));
}
async function saveQueue(id){const s=document.querySelector('.queueStatus[data-id="'+CSS.escape(id)+'"]'),c=document.querySelector('.queueCost[data-id="'+CSS.escape(id)+'"]');try{setStatus('Updating sourcing queue…');await invoke({action:'queue_update',id,status:s.value,actual_cost:c.value===''?null:Number(c.value)});await load(false);setStatus('Queue updated.','success')}catch(e){setStatus(String(e.message||e),'error')}}
async function dealAction(e){
 const article=e.currentTarget.closest('.deal'),key=article.dataset.key,action=e.currentTarget.dataset.action;
 try{setStatus(action==='buy'?'Adding to sourcing queue…':action==='pass'?'Passing opportunity…':'Creating shared watch…');await invoke({action:'action',canonical_key:key,action});await load(false);setStatus(action==='buy'?'Added to sourcing queue.':action==='pass'?'Passed.':'Watch created.','success')}catch(err){setStatus(String(err.message||err),'error')}
}
async function showHistory(e){
 const article=e.currentTarget.closest('.deal'),box=article.querySelector('.history');if(!box.classList.contains('hidden')){box.classList.add('hidden');return}
 box.classList.remove('hidden');box.textContent='Loading history…';
 try{const h=await invoke({action:'history',canonical_key:article.dataset.key});if(!h.rows.length){box.textContent='No prior price/change history yet.';return}
 box.innerHTML='<b>'+esc(h.summary.observations)+' recorded change'+(h.summary.observations===1?'':'s')+'</b> · low '+money(h.summary.lowest_price)+' · high '+money(h.summary.highest_price)+'<table>'+h.rows.slice(0,12).map(r=>'<tr><td>'+esc(new Date(r.observed_at).toLocaleDateString())+'</td><td>'+money(r.observed_price)+'</td><td>'+pct(r.discount_percent)+'</td><td>'+esc(r.opportunity_score)+'</td></tr>').join('')+'</table>';
 }catch(err){box.textContent=String(err.message||err)}
}
function render(){
 if(!data)return;
 $('sActive').textContent=data.counts.active;$('sWatch').textContent=data.counts.watch_hits;$('sProfit').textContent=data.counts.resell_known_profit;$('sQueue').textContent=data.counts.queue;
 $('refreshed').textContent='Engine refreshed '+(data.state&&data.state.last_refresh_at?ago(data.state.last_refresh_at):'now');
 renderCoverage();renderWatches();renderQueue();renderDeals();
}
async function load(force,sourceRefresh){
 if(busy)return;setBusy(true,sourceRefresh?'Refreshing source feeds and Deal Engine…':force?'Refreshing Deal Engine…':'Loading opportunities…');
 try{
  const last=localStorage.getItem('h38DealEngineLastSeen')||new Date(Date.now()-24*3600000).toISOString();
  const body=force?{action:'refresh',since:last,refresh_sources:!!sourceRefresh,location:geo||($('zip').value?{zip:$('zip').value}:null)}:{action:'overview',since:last};
  data=await invoke(body);render();localStorage.setItem('h38DealEngineLastSeen',new Date().toISOString());setStatus(sourceRefresh?'Sources checked and engine rebuilt.':'','success');
 }catch(e){setStatus(String(e.message||e),'error')}
 finally{setBusy(false)}
}
function showTab(tab){
 currentTab=tab;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 const special=tab==='watches'||tab==='queue';$('dealControls').classList.toggle('hidden',special);$('deals').classList.toggle('hidden',special);$('watchesPane').classList.toggle('hidden',tab!=='watches');$('queuePane').classList.toggle('hidden',tab!=='queue');if(!special)renderDeals();if(tab==='watches')renderWatches();if(tab==='queue')renderQueue();
}
$('refresh').addEventListener('click',()=>load(true,false));$('refreshSources').addEventListener('click',()=>load(true,true));$('search').addEventListener('input',renderDeals);$('sort').addEventListener('change',renderDeals);
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
$('openPenny').addEventListener('click',()=>location.href='/functions/v1/h38-penny-web');$('openResale').addEventListener('click',()=>location.href='/functions/v1/h38-resale-web');$('openCoupon').addEventListener('click',()=>location.href='/functions/v1/h38-coupon-web');
$('useLocation').addEventListener('click',()=>{if(!navigator.geolocation){setStatus('Phone location is unavailable in this browser.','error');return}setStatus('Getting phone location…');navigator.geolocation.getCurrentPosition(p=>{geo={lat:p.coords.latitude,lon:p.coords.longitude,radiusMiles:50};setStatus('Phone location ready for the next source refresh.','success')},e=>setStatus('Location was not available: '+e.message,'error'),{enableHighAccuracy:true,timeout:12000,maximumAge:300000})});
$('watchForm').addEventListener('submit',async e=>{e.preventDefault();try{setStatus('Saving shared watch…');await invoke({action:'watch_save',watch:{query_text:$('watchQuery').value,retailer:$('watchRetailer').value,product_area:$('watchArea').value,watch_mode:$('watchMode').value,max_buy_price:$('watchMax').value||null,min_discount_percent:$('watchDiscount').value||null,min_expected_profit:$('watchProfit').value||null,min_roi_percent:$('watchRoi').value||null}});e.target.reset();await load(false);showTab('watches');setStatus('Shared watch saved.','success')}catch(err){setStatus(String(err.message||err),'error')}});
$('login').addEventListener('submit',async e=>{e.preventDefault();$('authStatus').textContent='Signing in…';const r=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(r.error){$('authStatus').textContent=r.error.message;$('authStatus').className='status error'}else{boot()}});
async function boot(){
 const s=await sb.auth.getSession();if(!s.data.session){$('auth').classList.remove('hidden');$('app').classList.add('hidden');return}
 $('auth').classList.add('hidden');$('app').classList.remove('hidden');await load(false,false);
}
boot();
</script>
</body>
</html>\`;

Deno.serve(() => new Response(html, {
  headers: {
    "Content-Type": "text/html; charset=UTF-8",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; connect-src 'self' https://jqukmwtsgcsaruucnqja.supabase.co wss://jqukmwtsgcsaruucnqja.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'self'",
  },
}));