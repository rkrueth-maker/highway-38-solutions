(function(){
  'use strict';

  const BUILD='20260818-private-reseller-scout-1';
  const ALLOWED_USER_IDS=new Set([
    'ccf25333-47cd-42ca-a20b-cdbc63a8a695',
    '6dd51b31-5974-4691-b8b8-83e5877528c0'
  ]);
  const DEAL_TABLE='reseller_deals';
  const WATCH_TABLE='reseller_watch_rules';
  let deals=[];
  let rules=[];
  let feed=[];
  let loading=false;
  let scanStream=null;
  let scanTimer=null;

  const userId=()=>String(state?.snapshot?.authUserId||state?.snapshot?.user?.userId||window.H38DB?.getUserScope?.()||'');
  const allowed=()=>ALLOWED_USER_IDS.has(userId());
  const client=()=>window.H38_SUPABASE_SHARED_CLIENT?.ensure?.()||null;
  const n=value=>Number(value||0);
  const pct=value=>`${Math.round(n(value))}%`;

  function scoreDeal(input){
    const buy=Math.max(0,n(input.buy_price));
    const resale=Math.max(0,n(input.expected_resale));
    const fees=Math.max(0,n(input.estimated_fees));
    const shipping=Math.max(0,n(input.estimated_shipping));
    const other=Math.max(0,n(input.other_costs));
    const retail=Math.max(0,n(input.retail_price));
    const profit=resale-buy-fees-shipping-other;
    const roi=buy>0?(profit/buy)*100:profit>0?999:0;
    const margin=resale>0?(profit/resale)*100:0;
    const discount=retail>0?Math.max(0,(1-buy/retail)*100):0;
    let score=0;
    score+=Math.min(30,Math.max(0,profit/2));
    score+=Math.min(30,Math.max(0,roi/5));
    score+=Math.min(20,Math.max(0,discount/4));
    score+=resale>0?10:0;
    score+=String(input.upc||'').trim()?5:0;
    score+=String(input.source_url||'').trim()?5:0;
    score=Math.round(Math.min(100,score));
    const decision=profit>=40&&roi>=75?'BUY':profit>=15&&roi>=35?'WATCH':'SKIP';
    const penny=buy>0&&buy<=0.10;
    return {profit,roi,margin,discount,score,decision,penny};
  }

  function dealCard(row){
    const calc=scoreDeal(row);
    const id=esc(row.id||'');
    return `<article class="row reseller-deal-row">
      <div class="row-top"><strong>${esc(row.title||'Untitled find')}</strong>${pill(calc.decision,calc.decision==='BUY'?'online':calc.decision==='WATCH'?'warn':'')}</div>
      <small>${esc(row.retailer||'Unknown retailer')}${row.location_text?` · ${esc(row.location_text)}`:''}${row.upc?` · UPC ${esc(row.upc)}`:''}</small>
      <div class="stats reseller-mini-stats">
        <div class="stat"><strong>${money(row.buy_price)}</strong><span>Buy</span></div>
        <div class="stat"><strong>${money(row.expected_resale)}</strong><span>Resale est.</span></div>
        <div class="stat"><strong>${money(calc.profit)}</strong><span>Profit est.</span></div>
        <div class="stat"><strong>${pct(calc.roi)}</strong><span>ROI</span></div>
        <div class="stat"><strong>${calc.score}</strong><span>Flip score</span></div>
      </div>
      <div class="row-actions">
        <button type="button" data-reseller-status="bought" data-id="${id}">Bought</button>
        <button type="button" data-reseller-status="sold" data-id="${id}">Sold</button>
        <button type="button" data-reseller-edit="${id}">Edit</button>
        <button type="button" class="secondary" data-reseller-delete="${id}">Delete</button>
      </div>
      ${row.notes?`<small>${esc(row.notes)}</small>`:''}
    </article>`;
  }

  function feedCard(item,index){
    const title=String(item.title||'Deal');
    const extracted=extractPrice(`${title} ${item.description||''}`);
    return `<article class="row reseller-feed-row">
      <div class="row-top"><strong>${esc(title)}</strong>${item.hot?pill('Popular','warn'):pill('Fresh')}</div>
      <small>${esc(item.source||'Deal feed')} · ${item.published_at?dateTime(item.published_at):'recent'}</small>
      ${item.description?`<p class="muted small">${esc(stripHtml(item.description)).slice(0,360)}</p>`:''}
      <div class="row-actions">
        <button type="button" data-feed-score="${index}" data-price="${extracted||''}">Score / Save</button>
        ${item.link?`<a class="secondary button-link" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">Open source</a>`:''}
      </div>
    </article>`;
  }

  function watchRow(row){
    const parts=[];
    if(row.retailer)parts.push(row.retailer);
    if(n(row.max_buy_price)>0)parts.push(`max ${money(row.max_buy_price)}`);
    if(n(row.min_expected_profit)>0)parts.push(`profit ≥ ${money(row.min_expected_profit)}`);
    if(n(row.min_roi_percent)>0)parts.push(`ROI ≥ ${pct(row.min_roi_percent)}`);
    return `<div class="row"><div class="row-top"><strong>${esc(row.query_text||'Any deal')}</strong>${pill(row.enabled===false?'Off':'Watching',row.enabled===false?'':'online')}</div><small>${esc(parts.join(' · ')||'No extra filters')}</small><div class="row-actions"><button data-watch-toggle="${esc(row.id)}">${row.enabled===false?'Enable':'Pause'}</button><button class="secondary" data-watch-delete="${esc(row.id)}">Delete</button></div></div>`;
  }

  function render(){
    if(!allowed()){
      $('mainContent').innerHTML=pageHead('Private Reseller Scout','This workspace is restricted.')+`<section class="card"><h2>Not authorized</h2><p>This private workspace is available only to the two approved H38 owner accounts.</p></section>`;
      return;
    }
    const best=deals.map(scoreDeal).sort((a,b)=>b.profit-a.profit)[0];
    const buys=deals.filter(row=>scoreDeal(row).decision==='BUY').length;
    $('mainContent').innerHTML=pageHead('Reseller Scout','Private sourcing workspace for Rick and Amanda.',`<button type="button" class="secondary" id="resellerRefresh">↻ Refresh</button>`)+`
      <div class="grid reseller-scout">
        <section class="card"><div class="stats">
          <div class="stat"><strong>${deals.length}</strong><span>Saved finds</span></div>
          <div class="stat"><strong>${buys}</strong><span>Buy signals</span></div>
          <div class="stat"><strong>${best?money(best.profit):'$0.00'}</strong><span>Best profit est.</span></div>
          <div class="stat"><strong>${rules.filter(x=>x.enabled!==false).length}</strong><span>Watch rules</span></div>
        </div></section>

        <section class="card span7"><h2>Score a store find</h2>
          <form id="resellerDealForm" class="form-grid">
            <input type="hidden" name="id">
            <label>Item / description<input name="title" required placeholder="Milwaukee M18 drill kit"></label>
            <label>Retailer<input name="retailer" placeholder="Home Depot"></label>
            <label>Store / location<input name="location_text" placeholder="Grand Rapids, MN"></label>
            <label>UPC / barcode<div class="field-inline"><input id="resellerUpc" name="upc" inputmode="numeric" placeholder="UPC"><button type="button" id="resellerScanButton">Scan</button></div></label>
            <label>Buy price<input name="buy_price" type="number" min="0" step="0.01" value="0"></label>
            <label>Normal retail<input name="retail_price" type="number" min="0" step="0.01" value="0"></label>
            <label>Expected resale<input name="expected_resale" type="number" min="0" step="0.01" value="0"></label>
            <label>Marketplace fees<input name="estimated_fees" type="number" min="0" step="0.01" value="0"></label>
            <label>Shipping<input name="estimated_shipping" type="number" min="0" step="0.01" value="0"></label>
            <label>Other costs<input name="other_costs" type="number" min="0" step="0.01" value="0"></label>
            <label>Marketplace<select name="marketplace"><option value="">Undecided</option><option>eBay</option><option>Amazon</option><option>Facebook Marketplace</option><option>Local</option><option>Other</option></select></label>
            <label>Source URL<input name="source_url" type="url" placeholder="https://..."></label>
            <label class="span2">Notes<textarea name="notes" rows="2" placeholder="Shelf count, condition, model, coupon requirements"></textarea></label>
            <div class="span2"><div id="resellerLiveScore" class="notice">Enter the buy price and expected resale to calculate the flip.</div></div>
            <div class="span2 row-actions"><button class="primary" type="submit">Save shared find</button><button type="button" class="secondary" id="resellerClearForm">Clear</button></div>
          </form>
          <div id="resellerScanner" class="reseller-scanner" hidden><video id="resellerScanVideo" playsinline muted></video><p class="muted small">Point the camera at a UPC/EAN barcode.</p><button type="button" id="resellerStopScan">Stop camera</button></div>
        </section>

        <section class="card span5"><h2>Watch rules</h2>
          <form id="resellerWatchForm" class="form-grid compact">
            <label class="span2">Keywords<input name="query_text" required placeholder="Milwaukee, clearance, open box"></label>
            <label>Retailer<input name="retailer" placeholder="Any"></label>
            <label>Max buy<input name="max_buy_price" type="number" min="0" step="0.01"></label>
            <label>Min profit<input name="min_expected_profit" type="number" min="0" step="0.01"></label>
            <label>Min ROI %<input name="min_roi_percent" type="number" min="0" step="1"></label>
            <div class="span2"><button type="submit">Add watch rule</button></div>
          </form>
          <div class="list" id="resellerWatchList">${rules.length?rules.map(watchRow).join(''):empty('No shared watch rules yet.')}</div>
        </section>

        <section class="card span7"><div class="row-top"><h2>Live deal feed</h2><small>DealNews RSS · source links preserved</small></div><div class="list" id="resellerFeed">${feed.length?feed.map(feedCard).join(''):empty(loading?'Loading current deals…':'No feed loaded yet.')}</div></section>
        <section class="card span5"><h2>Shared saved finds</h2><div class="list" id="resellerDeals">${deals.length?deals.map(dealCard).join(''):empty('No saved finds. Score a product or save one from the feed.')}</div></section>
      </div>`;
    bind();
  }

  function bind(){
    const form=$('resellerDealForm');
    form?.addEventListener('input',()=>updateLiveScore(form));
    form?.addEventListener('submit',saveDeal);
    $('resellerClearForm')?.addEventListener('click',()=>{form.reset();form.elements.id.value='';updateLiveScore(form);});
    $('resellerRefresh')?.addEventListener('click',()=>refresh(true));
    $('resellerScanButton')?.addEventListener('click',startBarcodeScan);
    $('resellerStopScan')?.addEventListener('click',stopBarcodeScan);
    $('resellerWatchForm')?.addEventListener('submit',saveWatch);
    document.querySelectorAll('[data-reseller-status]').forEach(button=>button.onclick=()=>setDealStatus(button.dataset.id,button.dataset.resellerStatus));
    document.querySelectorAll('[data-reseller-delete]').forEach(button=>button.onclick=()=>deleteDeal(button.dataset.resellerDelete));
    document.querySelectorAll('[data-reseller-edit]').forEach(button=>button.onclick=()=>editDeal(button.dataset.resellerEdit));
    document.querySelectorAll('[data-feed-score]').forEach(button=>button.onclick=()=>scoreFeedItem(Number(button.dataset.feedScore),button.dataset.price));
    document.querySelectorAll('[data-watch-toggle]').forEach(button=>button.onclick=()=>toggleWatch(button.dataset.watchToggle));
    document.querySelectorAll('[data-watch-delete]').forEach(button=>button.onclick=()=>deleteWatch(button.dataset.watchDelete));
    updateLiveScore(form);
  }

  function updateLiveScore(form){
    if(!form)return;
    const data=Object.fromEntries(new FormData(form).entries());
    const calc=scoreDeal(data);
    const node=$('resellerLiveScore');
    if(!node)return;
    node.innerHTML=`<strong>${calc.decision}</strong> · Flip score ${calc.score}/100 · est. profit ${money(calc.profit)} · ROI ${pct(calc.roi)} · margin ${pct(calc.margin)}${calc.penny?' · possible penny-price candidate':''}`;
    node.className=`notice ${calc.decision==='SKIP'?'warn':''}`;
  }

  async function refresh(showToast=false){
    if(!allowed())return;
    loading=true;
    if(showToast)toast('Refreshing private reseller data…');
    render();
    try{
      await Promise.all([loadDeals(),loadRules(),loadFeed()]);
      if(showToast)toast('Reseller Scout refreshed.');
    }catch(error){
      toast(error.message||String(error),true);
    }finally{
      loading=false;
      if(state.page==='reseller')render();
    }
  }

  async function loadDeals(){
    const sb=client();if(!sb)throw new Error('Secure Supabase client is not ready.');
    const {data,error}=await sb.from(DEAL_TABLE).select('*').order('updated_at',{ascending:false}).limit(50);
    if(error)throw new Error(`Saved finds unavailable: ${error.message}`);
    deals=Array.isArray(data)?data:[];
  }

  async function loadRules(){
    const sb=client();if(!sb)throw new Error('Secure Supabase client is not ready.');
    const {data,error}=await sb.from(WATCH_TABLE).select('*').order('created_at',{ascending:false}).limit(50);
    if(error)throw new Error(`Watch rules unavailable: ${error.message}`);
    rules=Array.isArray(data)?data:[];
  }

  async function loadFeed(){
    const sb=client();if(!sb)throw new Error('Secure Supabase client is not ready.');
    const {data:{session}}=await sb.auth.getSession();
    if(!session?.access_token)throw new Error('Secure session is required for the live deal feed.');
    const base=String(window.H38_BUSINESS_OFFICE_SUPABASE?.url||'').replace(/\/$/,'');
    const response=await fetch(`${base}/functions/v1/reseller-deal-feed`,{headers:{Authorization:`Bearer ${session.access_token}`}});
    if(!response.ok){const text=await response.text();throw new Error(`Deal feed unavailable (${response.status}): ${text.slice(0,160)}`);}
    const payload=await response.json();
    feed=Array.isArray(payload?.items)?payload.items:[];
  }

  async function saveDeal(event){
    event.preventDefault();
    if(!allowed())return;
    const form=event.currentTarget;
    const data=Object.fromEntries(new FormData(form).entries());
    data.title=String(data.title||'').trim();
    if(!data.title)throw new Error('Item description is required.');
    ['buy_price','retail_price','expected_resale','estimated_fees','estimated_shipping','other_costs'].forEach(key=>data[key]=Math.max(0,n(data[key])));
    const sb=client();if(!sb)throw new Error('Secure Supabase client is not ready.');
    const id=String(data.id||'');delete data.id;
    data.updated_by=userId();
    let result;
    if(id)result=await sb.from(DEAL_TABLE).update(data).eq('id',id).select().single();
    else result=await sb.from(DEAL_TABLE).insert({...data,created_by:userId()}).select().single();
    if(result.error)throw new Error(result.error.message);
    form.reset();form.elements.id.value='';toast(id?'Shared find updated.':'Shared find saved.');await loadDeals();render();
  }

  async function setDealStatus(id,status){
    const sb=client();const {error}=await sb.from(DEAL_TABLE).update({status,updated_by:userId()}).eq('id',id);if(error){toast(error.message,true);return;}await loadDeals();render();
  }
  async function deleteDeal(id){
    if(!confirm('Delete this private saved find?'))return;
    const sb=client();const {error}=await sb.from(DEAL_TABLE).delete().eq('id',id);if(error){toast(error.message,true);return;}await loadDeals();render();
  }
  function editDeal(id){
    const row=deals.find(x=>String(x.id)===String(id));const form=$('resellerDealForm');if(!row||!form)return;
    Object.keys(row).forEach(key=>{if(form.elements[key])form.elements[key].value=row[key]??'';});
    form.elements.id.value=row.id;updateLiveScore(form);form.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function scoreFeedItem(index,price){
    const item=feed[index],form=$('resellerDealForm');if(!item||!form)return;
    form.elements.id.value='';form.elements.title.value=stripHtml(item.title||'');form.elements.source_url.value=item.link||'';
    if(price)form.elements.buy_price.value=price;
    form.elements.notes.value=`Source: ${item.source||'DealNews'}${item.published_at?` · ${item.published_at}`:''}`;
    updateLiveScore(form);form.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function saveWatch(event){
    event.preventDefault();const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries());
    data.query_text=String(data.query_text||'').trim();if(!data.query_text){toast('Watch keywords are required.',true);return;}
    ['max_buy_price','min_expected_profit','min_roi_percent'].forEach(key=>data[key]=Math.max(0,n(data[key])));
    data.created_by=userId();
    const sb=client(),{error}=await sb.from(WATCH_TABLE).insert(data);if(error){toast(error.message,true);return;}form.reset();await loadRules();render();
  }
  async function toggleWatch(id){const row=rules.find(x=>String(x.id)===String(id));if(!row)return;const sb=client(),{error}=await sb.from(WATCH_TABLE).update({enabled:row.enabled===false}).eq('id',id);if(error){toast(error.message,true);return;}await loadRules();render();}
  async function deleteWatch(id){const sb=client(),{error}=await sb.from(WATCH_TABLE).delete().eq('id',id);if(error){toast(error.message,true);return;}await loadRules();render();}

  async function startBarcodeScan(){
    if(!allowed())return;
    if(!('BarcodeDetector' in window)){toast('Barcode camera scanning is not supported here. Enter the UPC manually.',true);return;}
    try{
      stopBarcodeScan();
      scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      const wrap=$('resellerScanner'),video=$('resellerScanVideo');wrap.hidden=false;video.srcObject=scanStream;await video.play();
      const detector=new BarcodeDetector({formats:['upc_a','upc_e','ean_13','ean_8','code_128']});
      const tick=async()=>{
        if(!scanStream||state.page!=='reseller')return stopBarcodeScan();
        try{const codes=await detector.detect(video);if(codes?.length){const value=String(codes[0].rawValue||'');$('resellerUpc').value=value;stopBarcodeScan();toast(`Barcode captured: ${value}`);return;}}catch(error){}
        scanTimer=setTimeout(tick,300);
      };tick();
    }catch(error){stopBarcodeScan();toast(`Camera unavailable: ${error.message}`,true);}
  }
  function stopBarcodeScan(){if(scanTimer){clearTimeout(scanTimer);scanTimer=null;}if(scanStream){scanStream.getTracks().forEach(track=>track.stop());scanStream=null;}const wrap=$('resellerScanner');if(wrap)wrap.hidden=true;const video=$('resellerScanVideo');if(video)video.srcObject=null;}

  function extractPrice(text){const matches=String(text||'').match(/\$\s*([0-9]{1,5}(?:,[0-9]{3})*(?:\.\d{1,2})?)/);return matches?Number(matches[1].replace(',','')):0;}
  function stripHtml(text){const doc=document.createElement('div');doc.innerHTML=String(text||'');return doc.textContent||doc.innerText||'';}

  window.H38_RESELLER_SCOUT=Object.freeze({build:BUILD,allowed,render,refresh,stop:stopBarcodeScan,scoreDeal});
})();
