'use strict';
window.H38_SCOUT_V317_FLIPR_RESALE_FLOW=true;
(function installV317FlipFlow(){
  if(window.H38_SCOUT_V317_FLIPR_INSTALLED)return;
  window.H38_SCOUT_V317_FLIPR_INSTALLED=true;
  const t=v=>String(v??'').trim();
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
  const money=v=>n(v)!==null?'$'+n(v).toFixed(2):'Unknown';
  const pct=v=>n(v)!==null?Math.round(n(v)*100)+'%':'Unknown';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const KEY='h38.scout.v317.flip-session';
  const SETTINGS='h38.scout.v317.flip-settings';
  const defaults={feeRate:.1325,shipping:8,supplies:1,targetProfit:25,targetRoi:.5,condition:'used-good'};
  const readJson=(k,f)=>{try{const x=JSON.parse(localStorage.getItem(k)||'null');return x&&typeof x==='object'?x:f}catch{return f}};
  const writeJson=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
  state.scan=state.scan||{};
  state.scan.flipSession=Array.isArray(state.scan.flipSession)?state.scan.flipSession:readJson(KEY,[]);
  state.scan.flipSettings={...defaults,...readJson(SETTINGS,{})};

  const style=document.createElement('style');
  style.id='h38-v317-flip-style';
  style.textContent=`
    .h38-flip-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}
    .h38-flip-metric{padding:9px;border-radius:10px;background:#f5f8fa;border:1px solid rgba(18,55,76,.12)}
    .h38-flip-metric strong{display:block;font-size:17px}.h38-flip-metric span{display:block;font-size:10px;opacity:.68;margin-top:2px}
    .h38-flip-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.h38-flip-controls label{margin:0}
    .h38-flip-session-row{display:grid;grid-template-columns:1fr auto;gap:8px;padding:8px 0;border-top:1px solid rgba(18,55,76,.09)}
    .h38-flip-decision{font-weight:800}.h38-flip-decision.buy{color:#0a6b3f}.h38-flip-decision.maybe{color:#8b5a00}.h38-flip-decision.skip{color:#9c2635}
    @media(max-width:520px){.h38-flip-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.h38-flip-controls{grid-template-columns:1fr}.chip,.seg button,.mini-btn,.card-actions button{min-height:44px}.page{padding-bottom:130px}.quick-chips,.filter-row,.seg{scroll-padding-inline:10px;-webkit-overflow-scrolling:touch}}
  `;
  document.head.appendChild(style);

  function soldEvidence(){
    const m=state.scan.market||{},sold=m.market||m.evidence?.sold?.[0]||{},flip=m.flip||{};
    const median=n(sold.typical??sold.median??flip.estimated_resale),count=n(sold.sample_count??sold.samples??sold.sold_count),active=n(sold.active_count??m.active_count),verified=String(sold.status||'').toLowerCase()==='verified'||(median!==null&&count>0);
    return {median,count:count||0,active,verified,confidence:t(sold.confidence||m.confidence||state.scan.identification?.confidence||'unknown').toLowerCase(),days:n(sold.freshness_days??sold.age_days)};
  }
  function settingsFromDom(){
    const s={...state.scan.flipSettings};
    const get=(id,fallback)=>{const el=document.getElementById(id),x=n(el?.value);return x===null?fallback:x};
    s.feeRate=clamp(get('h38FlipFee',s.feeRate*100)/100,0,.6);
    s.shipping=Math.max(0,get('h38FlipShipping',s.shipping));
    s.supplies=Math.max(0,get('h38FlipSupplies',s.supplies));
    s.targetProfit=Math.max(0,get('h38FlipProfitTarget',s.targetProfit));
    s.targetRoi=Math.max(0,get('h38FlipRoiTarget',s.targetRoi*100)/100);
    s.condition=t(document.getElementById('h38FlipCondition')?.value||s.condition);
    state.scan.flipSettings=s;writeJson(SETTINGS,s);return s;
  }
  function conditionFactor(c){return ({'new':1,'like-new':.95,'used-good':.85,'used-fair':.65,'parts':.35})[c]||.85}
  function decision(){
    const sold=soldEvidence(),s=state.scan.flipSettings||defaults,buy=n(state.scan.buyPrice),factor=conditionFactor(s.condition),resale=sold.median===null?null:sold.median*factor;
    if(!sold.verified||resale===null)return {status:'RESEARCH',reason:'Sold evidence is not verified yet.',sold,resale:null,buy,profit:null,roi:null,maxOffer:null,score:null};
    const sellingCosts=resale*s.feeRate+s.shipping+s.supplies,net=resale-sellingCosts,profit=buy===null?null:net-buy,roi=buy!==null&&buy>0?profit/buy:null;
    const maxByProfit=net-s.targetProfit,maxByRoi=s.targetRoi>0?net/(1+s.targetRoi):net,maxOffer=Math.max(0,Math.min(maxByProfit,maxByRoi));
    const str=sold.active!==null&&sold.count>0?sold.count/Math.max(1,sold.count+sold.active):null;
    let score=0;score+=clamp((sold.count/20)*25,0,25);score+=str===null?6:clamp(str*25,0,25);score+=sold.confidence==='high'?15:sold.confidence==='medium'?10:5;
    if(profit!==null)score+=clamp((profit/Math.max(1,s.targetProfit))*20,0,20);if(roi!==null)score+=clamp((roi/Math.max(.01,s.targetRoi))*15,0,15);score=Math.round(clamp(score,0,100));
    let status='RESEARCH',reason='Enter a buy price to finish the decision.';
    if(buy!==null){if(profit>=s.targetProfit&&roi!==null&&roi>=s.targetRoi){status='BUY';reason='Meets profit and ROI targets.'}else if(profit>0&&buy<=maxOffer*1.15){status='MAYBE';reason='Positive profit, but below one or more targets.'}else{status='SKIP';reason='Buy price is above the responsible target.'}}
    return {status,reason,sold,resale,buy,profit,roi,maxOffer,score,str,net};
  }
  function sessionSummary(){const rows=state.scan.flipSession||[],profit=rows.reduce((s,r)=>s+(n(r.profit)||0),0),resale=rows.reduce((s,r)=>s+(n(r.resale)||0),0),cost=rows.reduce((s,r)=>s+(n(r.buy)||0),0);return {count:rows.length,profit,resale,cost}}
  function saveCurrent(){const d=decision(),id=state.scan.identification||{};if(!id||(!id.likely_item&&!id.search_query)){notice('Identify the item before adding it to the haul.','warn');return}const row={id:'scan-'+Date.now(),title:t(id.likely_item||id.search_query),upc:t(state.scan.upc),buy:d.buy,resale:d.resale,profit:d.profit,roi:d.roi,score:d.score,status:d.status,confidence:d.sold.confidence,at:new Date().toISOString()};state.scan.flipSession=[row,...(state.scan.flipSession||[])].slice(0,100);writeJson(KEY,state.scan.flipSession);notice(`${row.title} added to this haul.`,'good');renderScan()}
  function clearSession(){state.scan.flipSession=[];writeJson(KEY,[]);renderScan()}
  function quickNext(){try{if(typeof clearScan==='function')clearScan();else{state.scan.photos=[];state.scan.upc='';state.scan.hint='';state.scan.buyPrice='';state.scan.identification=null;state.scan.market=null;renderScan()}}catch{}}
  function resalePanel(){
    const ss=sessionSummary();
    const rows=(state.scan.flipSession||[]).slice(0,8).map(r=>`<div class="h38-flip-session-row"><div><strong>${esc(r.title)}</strong><div class="small muted">${esc(r.status)} · buy ${money(r.buy)} · resale ${money(r.resale)} · profit ${money(r.profit)}</div></div><div><strong>${r.score??'—'}</strong><div class="small muted">score</div></div></div>`).join('');
    return `<section class="card"><div class="item-top"><span class="badge">THIS HAUL</span><span class="badge">${ss.count} items</span></div><div class="h38-flip-grid"><div class="h38-flip-metric"><strong>${money(ss.cost)}</strong><span>TOTAL COST</span></div><div class="h38-flip-metric"><strong>${money(ss.resale)}</strong><span>EST. RESALE</span></div><div class="h38-flip-metric"><strong>${money(ss.profit)}</strong><span>EST. PROFIT</span></div></div>${rows||'<p class="small muted">Add researched items as you move through a thrift store, garage sale, estate sale, auction preview, or clearance aisle.</p>'}${ss.count?'<div class="card-actions"><button class="secondary" id="h38FlipClear">Clear haul</button></div>':''}</section>`;
  }
  function decorateDecision(){
    const card=document.getElementById('profitDecisionCard');if(!card)return;
    card.querySelectorAll('[data-h38-flip-decision-extra]').forEach(x=>x.remove());
    const d=decision(),sold=d.sold,active=sold.active===null?'Unknown':String(Math.round(sold.active)),str=d.str===null?'Unknown':Math.round(d.str*100)+'%';
    const extra=document.createElement('div');extra.dataset.h38FlipDecisionExtra='true';
    extra.innerHTML=`<div class="h38-flip-grid" style="margin-top:10px"><div class="h38-flip-metric"><strong>${money(d.maxOffer)}</strong><span>MAX RESPONSIBLE OFFER</span></div><div class="h38-flip-metric"><strong>${str}</strong><span>SELL-THROUGH</span></div><div class="h38-flip-metric"><strong>${sold.count||0}</strong><span>SOLD COMPS</span></div><div class="h38-flip-metric"><strong>${active}</strong><span>ACTIVE LISTINGS</span></div></div><div class="card-actions" id="h38FlipActions"><button class="secondary" id="h38FlipNext">Scan next</button></div>`;
    card.appendChild(extra);
  }

  const baseRenderScan=window.renderScan;
  window.renderScan=function(){
    if(typeof baseRenderScan==='function')baseRenderScan();
    const p=document.getElementById('scanPage');if(!p)return;
    p.querySelectorAll('#h38FlipDecision,[data-h38-flip-session]').forEach(x=>x.remove());
    const oldResale=p.querySelector('[data-v317-resale]');
    const oldHaul=p.querySelector('[data-v317-haul]');
    const oldAdd=document.getElementById('v317Add');
    decorateDecision();
    const actions=document.getElementById('h38FlipActions');
    if(oldAdd&&actions){oldAdd.className='secondary';oldAdd.textContent='Add to haul';actions.insertBefore(oldAdd,actions.firstChild)}
    if(oldResale)oldResale.remove();
    if(oldHaul)p.appendChild(oldHaul);
    const next=document.getElementById('h38FlipNext');if(next)next.onclick=quickNext;
  };

  let imagePasses=0,imageTimer=0;
  function coverage(){const el=document.querySelector('[data-v316-video-quality]');const x=n(el?.getAttribute('data-v316-coverage'));return x===null?0:x}
  function imageFollowup(){clearTimeout(imageTimer);if(state.page!=='hunt'||typeof window.H38V316RecoverDgImages!=='function')return;if(coverage()>=90||imagePasses>=4)return;imagePasses++;try{void window.H38V316RecoverDgImages(true)}catch{}imageTimer=setTimeout(imageFollowup,12000)}
  const baseRenderHunt=window.renderHunt;
  window.renderHunt=function(){if(typeof baseRenderHunt==='function')baseRenderHunt();if(state.page==='hunt'){imageTimer=setTimeout(imageFollowup,1200);const p=document.getElementById('huntPage');if(p&&!p.querySelector('[data-v317-image-action]')){const b=document.createElement('button');b.className='secondary';b.dataset.v317ImageAction='true';b.textContent='Resolve missing product images';b.onclick=()=>{imagePasses=0;imageFollowup()};const q=p.querySelector('[data-v316-video-quality]');if(q)q.insertAdjacentElement('afterend',b);else p.prepend(b)}}};

  function renderTrackPage(){
    const p=document.getElementById('trackPage');if(!p)return;
    const api=window.H38Track,tracks=api&&typeof api.list==='function'?api.list():[],events=api&&typeof api.events==='function'?api.events():[],decisions=api&&typeof api.decisions==='function'?api.decisions():[];
    const trackRows=tracks.slice(0,30).map(x=>`<section class="card"><div class="item-top"><span class="badge ${x.enabled!==false?'good':'warn'}">${x.enabled!==false?'WATCHING':'PAUSED'}</span>${x.retailer?`<span class="badge">${esc(x.retailer)}</span>`:''}</div><h3 style="margin:8px 0 4px">${esc((x.keywords&&x.keywords[0])||x.upc||x.sku||'Tracked item')}</h3><div class="meta"><span>${x.radius?esc(x.radius)+' mi':'Any distance'}</span><span>${x.maxBuyPrice!=null?'Max '+money(x.maxBuyPrice):'No max buy set'}</span><span>${x.minimumExpectedProfit!=null?'Min profit '+money(x.minimumExpectedProfit):'Profit target not set'}</span></div><div class="card-actions"><button class="secondary" data-h38-track-toggle="${esc(x.id)}">${x.enabled!==false?'Pause':'Resume'}</button><button class="danger-text" data-h38-track-remove="${esc(x.id)}">Remove</button></div></section>`).join('');
    const eventRows=events.slice(0,8).map(x=>`<div class="h38-flip-session-row"><div><strong>${esc(x.title||'Tracked match')}</strong><div class="small muted">${esc(x.recommendedAction||'MATCH')} · ${x.expectedProfit!=null?'profit '+money(x.expectedProfit):'profit not verified'}</div></div><div><strong>${x.dealScore??'—'}</strong><div class="small muted">score</div></div></div>`).join('');
    const buyCount=decisions.filter(x=>String(x.decision||'').toUpperCase()==='BUY').length;
    p.innerHTML=`<div class="page-head"><div><h1>Track</h1><p>Watch exact items or keywords and keep deal decisions together. Scout only promotes a match when the saved buy/profit rules are met.</p></div></div><section class="card"><div class="h38-flip-grid"><div class="h38-flip-metric"><strong>${tracks.filter(x=>x.enabled!==false).length}</strong><span>ACTIVE WATCHES</span></div><div class="h38-flip-metric"><strong>${events.length}</strong><span>MATCH EVENTS</span></div><div class="h38-flip-metric"><strong>${buyCount}</strong><span>BUY DECISIONS</span></div></div></section>${trackRows||'<div class="empty"><strong>No tracked items yet</strong>Add an item from Scan / Research or an opportunity card to start watching it.</div>'}${eventRows?`<section class="card"><div class="item-top"><span class="badge">RECENT MATCHES</span></div>${eventRows}</section>`:''}`;
    p.querySelectorAll('[data-h38-track-toggle]').forEach(b=>b.onclick=()=>{try{api.toggle(b.dataset.h38TrackToggle);renderTrackPage()}catch{}});
    p.querySelectorAll('[data-h38-track-remove]').forEach(b=>b.onclick=()=>{try{api.remove(b.dataset.h38TrackRemove);renderTrackPage()}catch{}});
  }
  const baseSetPage=window.setPage;
  window.setPage=function(page){
    if(page!=='track')return baseSetPage(page);
    state.page='track';
    for(const id of ['discover','hunt','scan','auction','track','more'])show(`${id}Page`,id==='track');
    document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page==='track'));
    const sub=document.getElementById('topSubtitle');if(sub)sub.textContent='Tracked deals';
    show('locationStrip',true);renderLocationStrip();window.scrollTo({top:0,behavior:'instant'});renderTrackPage();
  };
  window.renderTrack=renderTrackPage;

  window.H38V317FlipDecision=decision;
  window.H38V317FlipSession=()=>[...(state.scan.flipSession||[])];
  setTimeout(()=>{if(state.page==='scan')window.renderScan();if(state.page==='hunt')window.renderHunt()},0);
})();
