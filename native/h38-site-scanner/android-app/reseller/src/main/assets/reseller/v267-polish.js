'use strict';
window.H38_SCOUT_V267_POLISH=true;
(function(){
  if(window.H38_SCOUT_V267_POLISH_INSTALLED)return;
  window.H38_SCOUT_V267_POLISH_INSTALLED=true;
  function scoreLead(r){
    let s=0;const url=txt(r?.source_item_url||bestLeadSourceUrl(r));const t=leadDate(r);const age=t?(Date.now()-t)/86400000:999;
    if(txt(r?.source_item_scope)==='exact_product'||/^https?:\/\//i.test(txt(r?.source_item_url)))s+=5;
    if(isPenny(r))s+=4;else if(isNearPenny(r))s+=3;
    if(age<=2)s+=4;else if(age<=7)s+=2;else if(age<=30)s+=1;
    if(num(r?.signal_source_count||r?.report_count)>=2)s+=2;
    if(itemCode(r))s+=2;
    if(txt(r?.image_data_url||r?.image_url))s+=1;
    if(/^https?:\/\//i.test(url))s+=1;
    return s;
  }
  const baseHuntRows=huntRows;
  huntRows=function(){const rows=baseHuntRows();if(state.hunt.tab!=='best')return rows;return rows.filter(r=>scoreLead(r)>=8).sort((a,b)=>scoreLead(b)-scoreLead(a)||(leadDate(b)||0)-(leadDate(a)||0));};
  function addBestTab(){const p=$('huntPage');if(!p)return;const tabs=p.querySelector('.tabs,.tab-row,[data-hunt-tabs]')||p.querySelector('[data-hunt-tab]')?.parentElement;if(!tabs||tabs.querySelector('[data-hunt-tab="best"]'))return;const b=document.createElement('button');b.className='chip';b.dataset.huntTab='best';const n=huntBaseRows().filter(r=>scoreLead(r)>=8).length;b.textContent=`Best leads ${n}`;tabs.insertBefore(b,tabs.firstChild);b.onclick=()=>{state.hunt.tab='best';renderHunt()};}
  function polishDiscover(){const p=$('discoverPage');if(!p)return;const retail=(state.hunt?.rows||[]).slice().sort((a,b)=>scoreLead(b)-scoreLead(a)).filter(r=>scoreLead(r)>=8).slice(0,5);let box=p.querySelector('[data-v267-now]');if(!box){box=document.createElement('section');box.dataset.v267Now='true';box.className='card';const hero=p.querySelector('.hero');hero?.insertAdjacentElement('afterend',box)}
    const deals=[...(state.discover?.deals?.opportunities||[])].slice(0,3),auctions=(state.discover?.auctions?.results||[]).slice(0,3),total=deals.length+retail.length+auctions.length;
    box.innerHTML=`<div class="section-head"><h2>Best opportunities now</h2><span>${total} prioritized</span></div>${total?`<p class="small muted">Highest-signal items first. Source evidence is prioritized; local stock, penny price and seller claims still require the normal verification steps.</p><div class="result-list cols">${deals.map(dealCard).join('')}${retail.map(compactRetail).join('')}${auctions.map(auctionCard).join('')}</div>`:`<div class="empty"><strong>No high-confidence opportunities yet</strong>Use Scan, Retail Hunt, Auctions, or Share a Marketplace listing into Scout. Unknown stays unknown instead of becoming fake profit.</div>`}`;
    box.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openExternal(b.dataset.open));box.querySelectorAll('[data-discover-lead]').forEach(b=>b.onclick=()=>openLeadDetail(b.dataset.discoverLead));
  }
  function polishAuctions(){const p=$('auctionsPage');if(!p)return;const hasRows=Array.isArray(state.auctions?.rows)?state.auctions.rows.length:0;const loading=!!state.auctions?.loading;let note=p.querySelector('[data-v267-auction-state]');if(!note){note=document.createElement('div');note.dataset.v267AuctionState='true';note.className='truth-note';const head=p.querySelector('.page-head');head?.insertAdjacentElement('afterend',note)}if(!note)return;const health=state.auctions?.sourceHealth||{};note.innerHTML=loading?'<strong>AUCTIONS</strong><br>Checking supported auction sources…':hasRows?`<strong>AUCTIONS</strong><br>${hasRows} lot${hasRows===1?'':'s'} loaded. Review source, distance and resale evidence before bidding.`:`<strong>AUCTIONS</strong><br>${health.warning||health.error?'Auction provider returned no usable rows or reported an error.':'No matching auction lots loaded in this view.'}`;}
  const rd=renderDiscover;renderDiscover=function(){rd();polishDiscover()};
  const rh=renderHunt;renderHunt=function(){rh();addBestTab()};
  const rhl=renderHuntListOnly;renderHuntListOnly=function(){rhl();addBestTab()};
  if(typeof renderAuctions==='function'){const ra=renderAuctions;renderAuctions=function(){ra();polishAuctions()};}
  if(state.user){if(state.page==='discover')renderDiscover();if(state.page==='hunt')renderHunt();if(state.page==='auctions'&&typeof renderAuctions==='function')renderAuctions();}
})();
