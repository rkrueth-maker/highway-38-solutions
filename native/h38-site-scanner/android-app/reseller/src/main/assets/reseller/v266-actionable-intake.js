'use strict';
window.H38_SCOUT_V266_ACTIONABLE_INTAKE=true;
window.H38_SCOUT_V267_POLISH=true;
window.H38_SCOUT_V268_RELIABILITY=true;
(function installV266ActionableIntake(){
  if(window.H38_SCOUT_V266_ACTIONABLE_INTAKE_INSTALLED)return;
  window.H38_SCOUT_V266_ACTIONABLE_INTAKE_INSTALLED=true;
  state.v266=state.v266||{shared:[]};
  function parseShared(text){
    const raw=txt(text),url=(raw.match(/https?:\/\/[^\s]+/i)||[])[0]||'',price=(raw.match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/)||[])[1]||'',lines=raw.split(/\r?\n/).map(txt).filter(Boolean),title=lines.find(x=>!/^https?:/i.test(x)&&!/^\$/.test(x))||'Shared resale listing';
    return{title,price:price?Number(price):null,url,source:/facebook\.com|fb\.com/i.test(raw)?'Facebook Marketplace':'Shared listing',shared_text:raw,location_verified:false,truth:'Shared by you from the source app. Scout does not infer local availability or seller truth from the share alone.',received_at:new Date().toISOString()};
  }
  function openShared(row){
    state.scan.hint=row.title||'';state.scan.buyPrice=row.price==null?'':String(row.price);state.scan.identification={likely_item:row.title||'Shared listing',search_query:row.title||'',confidence:'shared_source'};state.scan.market={marketplace:row.source||'Shared listing',shared_url:row.url||'',shared_text:row.shared_text||''};setPage('scan');renderScan();notice('Shared listing loaded. Verify cost and sold comps before BUY.','good');
  }
  window.H38SharedOpportunity=function(text){
    const row=parseShared(text);state.v266.shared.unshift(row);state.v266.shared=state.v266.shared.slice(0,25);try{localStorage.setItem('h38-v266-shared',JSON.stringify(state.v266.shared))}catch{};openShared(row);
  };
  try{state.v266.shared=JSON.parse(localStorage.getItem('h38-v266-shared')||'[]')}catch{state.v266.shared=[]}

  function scoreLead(r){
    let s=0;const t=typeof leadDate==='function'?leadDate(r):null,age=t?(Date.now()-t)/86400000:999;
    if(txt(r?.source_item_scope)==='exact_product'||/^https?:\/\//i.test(txt(r?.source_item_url)))s+=5;
    if(typeof isPenny==='function'&&isPenny(r))s+=4;else if(typeof isNearPenny==='function'&&isNearPenny(r))s+=3;
    if(age<=2)s+=4;else if(age<=7)s+=2;else if(age<=30)s+=1;
    if(num(r?.signal_source_count||r?.report_count)>=2)s+=2;
    if(typeof itemCode==='function'&&itemCode(r))s+=2;
    if(txt(r?.image_data_url||r?.image_url))s+=1;
    return s;
  }

  const huntRowsBeforeV267=typeof huntRows==='function'?huntRows:null;
  if(huntRowsBeforeV267){huntRows=function(){const rows=huntRowsBeforeV267();if(state.hunt.tab!=='best')return rows;return rows.filter(r=>scoreLead(r)>=8).sort((a,b)=>scoreLead(b)-scoreLead(a)||((leadDate(b)||0)-(leadDate(a)||0)));};}

  const huntDisplayImageBeforeV268=typeof huntDisplayImage==='function'?huntDisplayImage:null;
  if(huntDisplayImageBeforeV268){huntDisplayImage=function(r){
    const existing=huntDisplayImageBeforeV268(r);if(existing)return existing;
    const rk=typeof retailerKey==='function'?retailerKey(r?.retailer):'',u=txt(r?.image_url),proof=typeof sameProof==='function'&&typeof itemCode==='function'&&sameProof(r?.image_match_barcode,itemCode(r));
    if((rk==='dollar general'||rk==='dollar tree')&&proof&&/^https:\/\//i.test(u))return u;
    return'';
  };}
  const huntImageHtmlBeforeV268=typeof huntImageHtml==='function'?huntImageHtml:null;
  if(huntImageHtmlBeforeV268){huntImageHtml=function(r,title){
    const rk=typeof retailerKey==='function'?retailerKey(r?.retailer):'',u=txt(r?.image_data_url||r?.image_url),proof=typeof sameProof==='function'&&typeof itemCode==='function'&&sameProof(r?.image_match_barcode,itemCode(r));
    if((rk==='dollar general'||rk==='dollar tree')&&proof&&/^https:\/\//i.test(u))return `<img class="thumb" loading="lazy" referrerpolicy="no-referrer" src="${esc(u)}" alt="${esc(title)}" onerror="this.remove();this.closest('.item-card')?.classList.add('no-image')">`;
    return huntImageHtmlBeforeV268(r,title);
  };}

  function openFacebookForShare(){
    const b=typeof bridge==='function'?bridge():null,url='https://www.facebook.com/marketplace/';
    try{if(b&&typeof b.openExternalUrl==='function'){b.openExternalUrl(url);return}openExternal(url)}catch{openExternal(url)}
  }
  function decorateFacebook(){
    const b=$('facebookScan');if(!b)return;const sec=b.closest('section.card');if(!sec)return;
    b.textContent='Open Facebook Marketplace';b.disabled=false;b.onclick=openFacebookForShare;
    const head=sec.querySelector('.section-head span');if(head)head.textContent=`${state.v266.shared.length} shared into Scout`;
    const p=sec.querySelector('p.small');if(p)p.innerHTML='<strong>Working path:</strong> open Marketplace, pick a listing, tap Share, then choose <strong>H38 Reseller Scout</strong>. Scout opens the listing directly in Scan for comps, profit and ROI. Public scraping is no longer the primary workflow.';
    sec.querySelectorAll('[data-v264-facebook-status],[data-v265-facebook-status]').forEach(x=>x.remove());
    let box=sec.querySelector('[data-v266-share]');if(!box){box=document.createElement('div');box.dataset.v266Share='true';box.className='truth-note';box.style.marginTop='10px';sec.appendChild(box)}
    const n=state.v266.shared.length;box.innerHTML=`<strong>FACEBOOK → SCOUT</strong><br>1. Open Marketplace &nbsp; 2. Open a listing &nbsp; 3. Share → H38 Reseller Scout${n?`<br><strong>${n}</strong> listing${n===1?'':'s'} received on this phone.`:''}`;
  }

  function addBestTab(){const p=$('huntPage');if(!p)return;const existing=p.querySelector('[data-hunt-tab="best"]');const n=(typeof huntBaseRows==='function'?huntBaseRows():[]).filter(r=>scoreLead(r)>=8).length;if(existing){existing.textContent=`Best leads ${n}`;return}const first=p.querySelector('[data-hunt-tab]');if(!first)return;const b=document.createElement('button');b.className=first.className;b.dataset.huntTab='best';b.textContent=`Best leads ${n}`;first.parentElement.insertBefore(b,first);b.onclick=()=>{state.hunt.tab='best';renderHunt()};}

  function polishDiscover(){
    const p=$('discoverPage');if(!p)return;const all=state.hunt?.rows||[],retail=all.slice().sort((a,b)=>scoreLead(b)-scoreLead(a)).filter(r=>scoreLead(r)>=8).slice(0,5),deals=[...(state.discover?.deals?.opportunities||[])].slice(0,3),auctions=(state.discover?.auctions?.results||[]).slice(0,3),total=deals.length+retail.length+auctions.length;
    let box=p.querySelector('[data-v267-now]');if(!box){box=document.createElement('section');box.dataset.v267Now='true';box.className='card';p.querySelector('.hero')?.insertAdjacentElement('afterend',box)}if(!box)return;
    box.innerHTML=`<div class="section-head"><h2>Best opportunities now</h2><span>${total} prioritized</span></div>${total?`<p class="small muted">Highest-signal candidates first. Verify local stock, penny price and seller claims before buying.</p><div class="result-list cols">${deals.map(dealCard).join('')}${retail.map(compactRetail).join('')}${auctions.map(auctionCard).join('')}</div>`:`<div class="empty"><strong>No high-confidence opportunities yet</strong>Scan an item, open Best leads, check Auctions, or share a Marketplace listing into Scout. Unknown stays unknown.</div>`}`;
    box.querySelectorAll('[data-open]').forEach(x=>x.onclick=()=>openExternal(x.dataset.open));box.querySelectorAll('[data-discover-lead]').forEach(x=>x.onclick=()=>openLeadDetail(x.dataset.discoverLead));
  }

  function polishAuctions(){const p=$('auctionsPage');if(!p)return;const rows=Array.isArray(state.auctions?.rows)?state.auctions.rows:[],loading=!!state.auctions?.loading;let note=p.querySelector('[data-v267-auction-state]');if(!note){note=document.createElement('div');note.dataset.v267AuctionState='true';note.className='truth-note';p.querySelector('.page-head')?.insertAdjacentElement('afterend',note)}if(!note)return;note.innerHTML=loading?'<strong>AUCTIONS</strong><br>Checking supported sources…':rows.length?`<strong>AUCTIONS</strong><br>${rows.length} lot${rows.length===1?'':'s'} loaded. Check source, distance and resale evidence before bidding.`:'<strong>AUCTIONS</strong><br>No usable lots are loaded in this view. That means no matches were returned here—not that local auctions do not exist.';}

  const priorDiscover=renderDiscover;renderDiscover=function(){priorDiscover();decorateFacebook();polishDiscover()};
  const priorHunt=renderHunt;renderHunt=function(){priorHunt();addBestTab()};
  const priorHuntList=renderHuntListOnly;renderHuntListOnly=function(){priorHuntList();addBestTab()};
  if(typeof renderAuctions==='function'){const priorAuctions=renderAuctions;renderAuctions=function(){priorAuctions();polishAuctions()};}
  if(state.user){if(state.page==='discover')renderDiscover();if(state.page==='hunt')renderHunt();if(state.page==='auctions'&&typeof renderAuctions==='function')renderAuctions();}
})();
