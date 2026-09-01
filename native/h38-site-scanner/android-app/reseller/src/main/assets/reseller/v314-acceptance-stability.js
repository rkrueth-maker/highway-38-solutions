'use strict';
window.H38_SCOUT_V314_ACCEPTANCE_STABILITY=true;
(function installV314AcceptanceStability(){
  if(window.H38_SCOUT_V314_ACCEPTANCE_STABILITY_INSTALLED)return;
  window.H38_SCOUT_V314_ACCEPTANCE_STABILITY_INSTALLED=true;
  const PROFIT_LANES=16;
  let queued=false;
  function t(v){return String(v??'').replace(/\s+/g,' ').trim()}
  function clearPersistedDiscoverWhenLiveFieldIsEmpty(){
    const input=document.getElementById('discoverSearch');
    if(!input||t(input.value))return;
    state.discover=state.discover||{};
    state.discover.query='';
    try{if(typeof write==='function'&&window.H38_KEYS?.discover)write(H38_KEYS.discover,'')}catch{}
  }
  function stabilizeProfitCard(){
    const sec=document.querySelector('#discoverPage [data-v300-facebook]');
    if(!sec)return;
    const note=sec.querySelector('[data-v314-facebook-quality]');
    if(note){
      let lane=note.querySelector('[data-v314-lane-context]');
      if(!lane){lane=document.createElement('span');lane.dataset.v314LaneContext='true';note.appendChild(lane)}
      const laneText=` · ${PROFIT_LANES} resale lanes available`;
      if(t(lane.textContent)!==t(laneText))lane.textContent=laneText;
      const label=t(note.textContent);
      note.setAttribute('role','status');
      note.setAttribute('tabindex','0');
      if(label)note.setAttribute('aria-label',label);
    }
    const hunt=sec.querySelector('[data-v314-profit-facebook]');
    if(hunt&&!hunt.dataset.v314BlankScopeGuard){
      hunt.dataset.v314BlankScopeGuard='true';
      hunt.addEventListener('click',clearPersistedDiscoverWhenLiveFieldIsEmpty,true);
    }
  }
  function stabilizeGarageHeader(){
    const sec=document.querySelector('#discoverPage [data-v308-garage]');
    if(!sec)return;
    const summary=sec.querySelector('.section-head span');
    if(!summary)return;
    const rows=Array.isArray(state.v308?.garageRows)?state.v308.garageRows:[];
    let label;
    if(state.v308?.garageLoading)label='Searching garage, yard, rummage, moving and estate-sale sources…';
    else if(!rows.length)label='0 public leads · No sale leads loaded yet';
    else label=`${rows.length} public lead${rows.length===1?'':'s'}`;
    if(t(summary.textContent)!==t(label))summary.textContent=label;
    summary.setAttribute('role','status');
    summary.setAttribute('tabindex','0');
    summary.setAttribute('aria-label',label);
  }
  function stabilize(){stabilizeProfitCard();stabilizeGarageHeader()}
  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;stabilize()})}
  new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});
  document.addEventListener('input',e=>{if(e.target?.id==='discoverSearch')queue()},true);
  setInterval(stabilize,500);
  setTimeout(stabilize,0);
})();