'use strict';
// Final v3.0.15 source-quality acceptance head: garage safe action + live Discover query authority.
window.H38_SCOUT_V316_GARAGE_SAFE_ACTION=true;
window.H38_SCOUT_V316_DISCOVER_QUERY_GUARD=true;
(function installV316GarageSafeAction(){
  if(window.H38_SCOUT_V316_GARAGE_SAFE_ACTION_INSTALLED)return;
  window.H38_SCOUT_V316_GARAGE_SAFE_ACTION_INSTALLED=true;
  const text=v=>String(v??'').trim();
  const staleQuery=/^(?:dollar general\s+inventory checker|inventory checker)$/i;
  const style=document.createElement('style');
  style.id='h38-v316-garage-safe-action';
  style.textContent=`
    #discoverPage [data-v308-garage]{scroll-margin-bottom:calc(104px + var(--safe-bottom,12px))}
    #discoverPage [data-v308-garage] .garage-primary-action{
      position:sticky;
      bottom:calc(72px + var(--safe-bottom,12px));
      z-index:34;
      margin:6px 0 8px;
      padding:5px 0;
      background:rgba(255,255,255,.97);
      border-radius:12px;
      box-shadow:0 -4px 14px rgba(20,42,58,.06);
    }
    #discoverPage [data-v308-garage] .garage-primary-action .mini-btn{min-height:46px}
  `;
  document.head.appendChild(style);

  function saveLiveDiscoverQuery(allowBlank=false){
    if(state.page!=='discover')return;
    const input=document.getElementById('discoverSearch');
    if(!input)return;
    const live=text(input.value),stored=text(state.discover?.query||'');
    if(live===stored)return;
    // The live field is the owner's authority. In particular, Android accessibility
    // ACTION_SET_TEXT can update WebView text without first dispatching a DOM input
    // event; a background render/observer must never replace that live value.
    if(!live&&!allowBlank&&!staleQuery.test(stored))return;
    state.discover=state.discover||{};
    state.discover.query=live;
    if(state.v315){state.v315.discoverQuery=live;state.v315.queryPinned=true;}
    try{if(typeof write==='function'&&window.H38_KEYS?.discover)write(H38_KEYS.discover,live)}catch{}
  }

  function protectGarage(){
    const sec=document.querySelector('#discoverPage [data-v308-garage]');
    if(!sec)return;
    const action=sec.querySelector('.garage-primary-action');
    const button=sec.querySelector('[data-v308-refresh]');
    if(action)action.setAttribute('data-v316-safe-action','true');
    if(button){
      button.setAttribute('aria-label','Find garage sales');
      button.setAttribute('title','Find garage sales');
      button.style.touchAction='manipulation';
    }
  }

  function protect(){saveLiveDiscoverQuery(false);protectGarage();}
  const priorRenderDiscover=window.renderDiscover;
  if(typeof priorRenderDiscover==='function')window.renderDiscover=function(){saveLiveDiscoverQuery(false);const out=priorRenderDiscover.apply(this,arguments);saveLiveDiscoverQuery(false);protectGarage();return out;};

  const observer=new MutationObserver(protect);
  observer.observe(document.body,{subtree:true,childList:true});
  document.addEventListener('beforeinput',e=>{if(e.target?.id==='discoverSearch')saveLiveDiscoverQuery(true)},true);
  document.addEventListener('input',e=>{if(e.target?.id==='discoverSearch')saveLiveDiscoverQuery(true)},true);
  document.addEventListener('change',e=>{if(e.target?.id==='discoverSearch')saveLiveDiscoverQuery(true)},true);
  document.addEventListener('focusin',e=>{if(e.target?.id==='discoverSearch')saveLiveDiscoverQuery(true)},true);
  document.addEventListener('click',e=>{if(e.target?.id==='discoverGo'||e.target?.closest?.('#discoverGo'))saveLiveDiscoverQuery(true)},true);
  document.addEventListener('scroll',protectGarage,{passive:true});

  // WebView accessibility setText may not emit a DOM input event. A short-interval
  // guard makes the visible field authoritative before asynchronous source renders
  // can restore stale persisted text. It is a single input lookup and is idle off Discover.
  setInterval(()=>saveLiveDiscoverQuery(false),25);
  setTimeout(protect,0);
})();