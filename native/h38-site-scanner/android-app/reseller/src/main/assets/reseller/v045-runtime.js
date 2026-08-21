'use strict';
window.H38_V045_RUNTIME_ACTIVE=true;
window.H38_V046_RUNTIME_ACTIVE=true;
window.H38_V045_RUNTIME_MARKER='runtime-inlined-v046-evidence-first';
(function(){
  const priorFn=fn;
  fn=async function(name,body,timeout){
    if(name==='reseller-auto-leads-v044'||name==='reseller-auto-leads-v038'||name==='reseller-auto-leads') name='reseller-auto-leads-v046';
    return priorFn(name,body,timeout);
  };
  const asNum=v=>Number(v||0)||0;
  const penny=l=>typeof isPenny==='function'&&isPenny(l);
  const near=l=>typeof isNearPennyV042==='function'&&isNearPennyV042(l);
  const srcs=l=>typeof sourceList==='function'?sourceList(l):(Array.isArray(l.signal_sources)?l.signal_sources:[]);
  const lastReport=l=>String(l.last_penny_report_label||l.last_seen_label||l.last_penny_report_at||l.last_seen||'').trim();
  const pennied=l=>String(l.pennied_at||l.source_pennied_at||'').trim();
  const pennyDateText=l=>pennied(l)?pennied(l):'Not published';
  const evidenceTier=l=>{
    if(l.local_penny_confirmed)return 'LOCAL SCAN CONFIRMED';
    const r=asNum(l.community_reports),sourceCount=asNum(l.signal_source_count)||srcs(l).length;
    const d=typeof dateMs==='function'?dateMs(l.last_penny_report_at||l.last_seen||''):0;
    const age=d?Date.now()-d:9e15;
    if(penny(l)&&age<=7*86400000&&(r>=5||sourceCount>=2)) return 'STRONG CRAWLER SIGNAL';
    if(penny(l)&&age<=30*86400000) return 'ACTIVE CRAWLER SIGNAL';
    if(penny(l)) return 'OLDER CRAWLER SIGNAL';
    return near(l)?'CLEARANCE WATCH':'CLEARANCE SIGNAL';
  };
  const tierClass=t=>t.includes('CONFIRMED')?'good':t.includes('STRONG')?'verified':t.includes('OLDER')?'warn':'penny';
  const sourceSummary=l=>{const a=srcs(l);if(!a.length)return '<div class="small muted">No source metadata returned.</div>';return a.map(s=>`<div class="evidence-row"><strong>${esc(s.name||s.domain||'Crawler source')}</strong>${s.observed_at?`<span>${esc(s.observed_at)}</span>`:''}${s.url?`<button class="secondary" data-open="${esc(s.url)}">Open source</button>`:''}</div>`).join('')};
  const storeEvidence=l=>{const hist=typeof checkedHistory==='function'?checkedHistory(l):[];if(!hist.length)return '<div class="small muted">No store/web checks recorded. This does not weaken the crawler signal.</div>';return hist.map(z=>{const x=z.x;return `<div class="evidence-row"><strong>${esc(z.s.store_name||z.s.retailer)}</strong><span class="badge ${x.local?'good':x.bound?'verified':'warn'}">${x.local?'LOCAL $0.01':x.bound?'WEB/STORE '+money(x.price):'CHECKED · NOT BOUND'}</span></div>`}).join('')};
  const compactCard=l=>{
    const tier=evidenceTier(l),reports=asNum(l.community_reports),states=asNum(l.community_states),sources=srcs(l),last=lastReport(l),pd=pennyDateText(l);
    const img=l.image_url?`<img class="hunt-thumb" src="${esc(l.image_url)}" alt="">`:'<div class="hunt-thumb"></div>';
    return `<details class="card penny-compact" data-penny-id="${esc(l.id||'')}"><summary><div class="hunt-grid">${img}<div class="penny-main"><div><span class="badge ${tierClass(tier)}">${tier}</span> <span class="badge">${esc(l.retailer||'')}</span></div><strong>${esc(l.title||'Unnamed product')}</strong>${l.brand?`<div class="small muted">${esc(l.brand)}</div>`:''}<div class="small muted">${l.sku?'SKU '+esc(l.sku):''}${l.upc?(l.sku?' · ':'')+'UPC '+esc(l.upc):''}</div><div class="penny-dates"><span><strong>Date pennied:</strong> ${esc(pd)}</span><span><strong>Last penny report:</strong> ${esc(last||'Unknown')}</span></div><div class="small muted">${reports?reports+' reports · ':''}${states?states+' states · ':''}${sources.length} crawler source${sources.length===1?'':'s'}${asNum(l.original_price)>0?' · ref '+money(l.original_price):''}</div></div></div></summary><div class="penny-detail"><div class="notice small"><strong>Crawler evidence is the discovery signal.</strong> A store/web price does not disprove a penny lead; physical in-store UPC/register scan is final confirmation.</div><h3>Crawler evidence</h3>${sourceSummary(l)}${l.state_summary?`<div class="small"><strong>Reported states:</strong> ${esc(l.state_summary)}</div>`:''}<div class="small"><strong>Date pennied:</strong> ${esc(pd)}${!pennied(l)?' · source has not published a distinct penny-start date':''}</div><div class="small"><strong>Last penny report:</strong> ${esc(last||'Unknown')}</div><h3>Store / web evidence</h3>${storeEvidence(l)}<div class="actions"><button data-v046-hunt="${esc(l.id||'')}">Check nearby store</button><button class="secondary" data-v046-research="${esc(l.id||'')}">Research resale</button>${l.source_url?`<button class="secondary" data-open="${esc(l.source_url)}">Primary source</button>`:''}</div></div></details>`;
  };
  state.clearanceFilterV046=state.clearanceFilterV046||'penny';state.clearanceSortV046=state.clearanceSortV046||'latest';state.clearanceQueryV046=state.clearanceQueryV046||'';
  renderClearance=function(){
    const p=$('page-clearance');if(!p)return;if(typeof dedupeLeadsV038==='function')state.leads=dedupeLeadsV038(state.leads||[]);let rows=state.leads.slice();const f=state.clearanceFilterV046;
    if(f==='penny')rows=rows.filter(penny);if(f==='clearance')rows=rows.filter(x=>!penny(x));if(f==='new')rows=rows.filter(x=>{const d=typeof dateMs==='function'?dateMs(x.last_penny_report_at||x.last_seen||''):0;return d&&Date.now()-d<=2*86400000});if(f==='checked')rows=rows.filter(x=>typeof checkedHistory==='function'&&checkedHistory(x).length);
    const q=String(state.clearanceQueryV046||'').trim().toLowerCase();if(q)rows=rows.filter(l=>[l.title,l.brand,l.sku,l.upc,l.retailer].some(v=>String(v||'').toLowerCase().includes(q)));
    rows.sort((a,b)=>{if(state.clearanceSortV046==='reports')return asNum(b.community_reports)-asNum(a.community_reports);if(state.clearanceSortV046==='value')return asNum(b.original_price)-asNum(a.original_price);const da=typeof dateMs==='function'?dateMs(a.last_penny_report_at||a.last_seen||''):0,db=typeof dateMs==='function'?dateMs(b.last_penny_report_at||b.last_seen||''):0;return db-da||asNum(b.community_reports)-asNum(a.community_reports)});
    const pennyCount=state.leads.filter(penny).length;const recent=state.leads.filter(x=>penny(x)&&typeof dateMs==='function'&&Date.now()-dateMs(x.last_penny_report_at||x.last_seen||'')<=2*86400000).length;
    p.innerHTML=`<section class="card"><div class="workflow-head"><div><h2>Penny & Clearance</h2><div class="muted small">Crawler evidence first. Store scan is final penny confirmation.</div></div><button id="refreshClearance" class="secondary">Refresh</button></div><div class="stats"><div class="stat"><strong>${pennyCount}</strong><span>PENNY SIGNALS</span></div><div class="stat"><strong>${recent}</strong><span>NEW / UPDATED 48H</span></div><div class="stat"><strong>${state.leads.length}</strong><span>UNIQUE ITEMS</span></div></div><div class="hunt-controls"><input id="v046Search" placeholder="Search product, SKU, UPC" value="${esc(state.clearanceQueryV046)}"><select id="v046Sort"><option value="latest">Latest penny reports</option><option value="reports">Most reports</option><option value="value">Highest reference value</option></select></div><div class="tabs"><button data-v046-filter="penny">Penny</button><button data-v046-filter="new">New</button><button data-v046-filter="clearance">Clearance</button><button data-v046-filter="checked">Checked</button><button data-v046-filter="all">All</button></div></section><section>${rows.length?rows.map(compactCard).join(''):'<div class="card empty">No items match this view.</div>'}</section>`;
    $('v046Sort').value=state.clearanceSortV046;$('refreshClearance').onclick=()=>loadClearance(true);$('v046Search').oninput=e=>{state.clearanceQueryV046=e.target.value;renderClearance()};$('v046Sort').onchange=e=>{state.clearanceSortV046=e.target.value;renderClearance()};p.querySelectorAll('[data-v046-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.v046Filter===state.clearanceFilterV046);b.onclick=()=>{state.clearanceFilterV046=b.dataset.v046Filter;renderClearance()}});p.querySelectorAll('[data-v046-research]').forEach(b=>b.onclick=()=>{const l=state.leads.find(x=>String(x.id)===String(b.dataset.v046Research));state.photos=[];state.research=null;setPage('more',{subpage:'research',start:false});setTimeout(()=>{if($('researchItem'))$('researchItem').value=[l?.brand,l?.title,l?.sku].filter(Boolean).join(' ');if($('researchUpc'))$('researchUpc').value=l?.upc||'';if($('researchPrice')&&penny(l))$('researchPrice').value='.01'},30)});p.querySelectorAll('[data-v046-hunt]').forEach(b=>b.onclick=()=>{const l=state.leads.find(x=>String(x.id)===String(b.dataset.v046Hunt));if(!l)return;state.storeRetailer=l.retailer||'';setPage('stores');setTimeout(()=>renderStores(),20)});bindOpen(p);
  };
  const oldLoad=loadClearance;loadClearance=async function(force){const x=await oldLoad(force);if(state.page==='clearance')renderClearance();return x};
})();