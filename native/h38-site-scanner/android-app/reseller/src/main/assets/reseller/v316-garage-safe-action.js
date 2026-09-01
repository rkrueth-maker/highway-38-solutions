'use strict';
window.H38_SCOUT_V316_GARAGE_SAFE_ACTION=true;
(function installV316GarageSafeAction(){
  if(window.H38_SCOUT_V316_GARAGE_SAFE_ACTION_INSTALLED)return;
  window.H38_SCOUT_V316_GARAGE_SAFE_ACTION_INSTALLED=true;
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
  function protect(){
    const sec=document.querySelector('#discoverPage [data-v308-garage]');
    if(!sec)return;
    const action=sec.querySelector('.garage-primary-action');
    const button=sec.querySelector('[data-v308-refresh]');
    if(action){action.setAttribute('data-v316-safe-action','true')}
    if(button){
      button.setAttribute('aria-label','Find garage sales');
      button.setAttribute('title','Find garage sales');
      button.style.touchAction='manipulation';
    }
  }
  const observer=new MutationObserver(protect);
  observer.observe(document.body,{subtree:true,childList:true});
  document.addEventListener('scroll',protect,{passive:true});
  setTimeout(protect,0);
})();
