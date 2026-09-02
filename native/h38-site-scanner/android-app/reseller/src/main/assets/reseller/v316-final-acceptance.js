'use strict';
window.H38_SCOUT_V316_FINAL_ACCEPTANCE=true;
(function installV316FinalAcceptance(){
  if(window.H38_SCOUT_V316_FINAL_ACCEPTANCE_INSTALLED)return;
  window.H38_SCOUT_V316_FINAL_ACCEPTANCE_INSTALLED=true;
  const t=v=>String(v??'').replace(/\s+/g,' ').trim();
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
  state.v316final=state.v316final||{lastGoodHunt:[],lastGoodAt:0,restoreCount:0};
  const style=document.createElement('style');
  style.id='h38-v316-final-style';
  style.textContent=`
    [data-v316-source-health]{margin:8px 0 12px;padding:10px;border-radius:12px;background:#f4f7f9;border:1px solid rgba(20,55,75,.12)}
    [data-v316-source-health] .health-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
    [data-v316-decision]{margin-top:7px;padding:7px 9px;border-radius:9px;background:#f7f9fa;font-size:12px;line-height:1.35}
    [data-v316-decision] strong{font-weight:800}
    @media(max-width:520px){#discoverPage .card{padding:11px;margin-bottom:9px}#discoverPage .section-head{gap:6px}#discoverPage .result-list.cols{grid-template-columns:1fr}#discoverPage .small,#discoverPage .muted{line-height:1.3}[data-v316-source-health]{padding:8px;margin:6px 0 9px}}
  `;
  document.head.appendChild(style);

  function snapshotHunt(){
    const rows=Array.isArray(state.hunt?.rows)?state.hunt.rows:[];
    if(rows.length){state.v316final.lastGoodHunt=rows.slice();state.v316final.lastGoodAt=Date.now()}
  }
  function restoreHuntIfTransient(){
    const rows=Array.isArray(state.hunt?.rows)?state.hunt.rows:[];
    const keep=state.v316final.lastGoodHunt||[];
    if(!rows.length&&keep.length&&Date.now()-n(state.v316final.lastGoodAt)<30*60*1000){
      state.hunt=state.hunt||{};state.hunt.rows=keep.slice();state.v316final.restoreCount++;
      try{if(typeof notice==='function')notice('Keeping the last loaded Hunt results while sources refresh.','good')}catch{}
      return true;
    }
    return false;
  }
  function statusClass(v){const s=t(v).toLowerCase();if(/result|live|pass|verified/.test(s))return'good';if(/error|unavailable|fail/.test(s))return'warn';return''}
  function sourceHealth(){
    const p=document.getElementById('discoverPage');if(!p)return;
    let box=p.querySelector('[data-v316-source-health]');
    if(!box){box=document.createElement('div');box.dataset.v316SourceHealth='true';const hero=p.querySelector('.hero');if(hero)hero.insertAdjacentElement('afterend',box);else p.prepend(box)}
    const fb=state.v314||{},garage=state.v308||{},g=garage.garageHealth||{};
    const fbState=fb.facebookRunning?'searching':t(fb.facebookOutcome||'idle');
    const garageRows=Array.isArray(garage.garageRows)?garage.garageRows.length:0;
    const badges=[`Facebook: ${fbState}${n(fb.facebookCandidates)?` · ${n(fb.facebookCandidates)} candidates`:''}`,`Garage/estate: ${garage.garageLoading?'searching':garageRows?garageRows+' leads':'no verified leads this pass'}`];
    for(const [name,x] of Object.entries(g))badges.push(`${name}: ${t(x?.status||'unknown')}${n(x?.count)?` · ${n(x.count)}`:''}`);
    box.innerHTML=`<strong>Source health</strong><div class="small muted">Live acquisition status. Empty means no verified lead was returned in this pass, not that the market is empty.</div><div class="health-row">${badges.map(x=>`<span class="badge ${statusClass(x)}">${typeof esc==='function'?esc(x):x}</span>`).join('')}</div>`;
    box.setAttribute('role','status');box.setAttribute('aria-label','Source health. '+badges.join('. '));
  }
  function money(v){const x=Number(v);return Number.isFinite(x)?'$'+x.toFixed(0):''}
  function decorateDecisionCards(){
    for(const root of document.querySelectorAll('#discoverPage,#huntPage')){
      root.querySelectorAll('.item-card').forEach(card=>{
        if(card.querySelector('[data-v316-decision]'))return;
        const text=t(card.textContent);
        const hasProfit=/\b(?:net profit|profit|roi|expected resale|resale)\b/i.test(text);
        const d=document.createElement('div');d.dataset.v316Decision='true';d.className='small';
        if(hasProfit){d.innerHTML='<strong>Decision:</strong> use the verified asking price, sold-comp evidence, fees and net shown on this card. Weak or missing comps stay research-only.'}
        else d.innerHTML='<strong>Decision:</strong> Profit not verified — research sold comps before buying.';
        const actions=card.querySelector('.card-actions');if(actions)actions.insertAdjacentElement('beforebegin',d);else card.querySelector('.item-main')?.appendChild(d);
      });
    }
  }
  function afterRender(){snapshotHunt();restoreHuntIfTransient();sourceHealth();decorateDecisionCards()}
  for(const name of ['renderDiscover','renderHunt']){
    const base=window[name];if(typeof base!=='function'||base.__h38v316final)continue;
    const wrapped=function(...args){if(name==='renderHunt')restoreHuntIfTransient();const out=base.apply(this,args);queueMicrotask(afterRender);return out};wrapped.__h38v316final=true;window[name]=wrapped;
  }
  if(typeof loadHunt==='function'&&!loadHunt.__h38v316final){
    const base=loadHunt;loadHunt=async function(...args){snapshotHunt();try{return await base.apply(this,args)}finally{restoreHuntIfTransient();if(state.page==='hunt'&&typeof renderHunt==='function')renderHunt()}};loadHunt.__h38v316final=true;
  }
  window.H38V316FinalMetrics=()=>({hunt_rows:Array.isArray(state.hunt?.rows)?state.hunt.rows.length:0,last_good_rows:(state.v316final.lastGoodHunt||[]).length,transient_restores:n(state.v316final.restoreCount),facebook_candidates:n(state.v314?.facebookCandidates),facebook_ranked:n(state.v314?.facebookRanked),garage_rows:Array.isArray(state.v308?.garageRows)?state.v308.garageRows.length:0});
  setInterval(()=>{restoreHuntIfTransient();if(state.page==='discover')sourceHealth();decorateDecisionCards()},1200);
  setTimeout(afterRender,250);
})();
