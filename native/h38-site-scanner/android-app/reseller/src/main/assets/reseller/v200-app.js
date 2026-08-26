'use strict';
(function loadV240ThenBootstrap(){
  let started=false;
  function bootstrapV200(){if(started)return;started=true;
    $('loginForm').onsubmit=async e=>{e.preventDefault();$('loginMessage').innerHTML='<div class="status-line"><span class="dot loading"></span>Signing in…</div>';const f=new FormData(e.currentTarget),email=txt(f.get('email')),password=String(f.get('password')||'');try{const {data,error}=await h38sb.auth.signInWithPassword({email,password});if(error)throw error;await authorize(data.session)}catch(e){$('loginMessage').innerHTML=`<div class="status-line"><span class="dot warn"></span>${esc(e.message||e)}</div>`}};
    $('homeButton').onclick=()=>{if(state.user)setPage('discover')};
    $('accountButton').onclick=()=>show('accountSheet',true);
    $('closeAccount').onclick=()=>show('accountSheet',false);
    $('openMaintenance').onclick=()=>{show('accountSheet',false);state.moreView='maintenance';setPage('more')};
    $('signOutButton').onclick=async()=>{show('accountSheet',false);await h38sb.auth.signOut();state.user=null;showLogin()};
    document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>setPage(b.dataset.page));
    $('locationButton').onclick=openLocationSheet;
    $('closeLocation').onclick=closeLocationSheet;
    $('usePhoneLocation').onclick=requestPhoneLocation;
    $('useZipLocation').onclick=applyZip;
    $('zipInput').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();applyZip()}};
    $('radiusSelect').onchange=e=>{setRadius(e.target.value);if(state.page==='auctions'&&state.auctions.loaded)void runAuctionSearch()};
    $('sheetRadius').onchange=e=>{setRadius(e.target.value);if(state.page==='auctions'&&state.auctions.loaded)void runAuctionSearch()};
    $('locationSheet').onclick=e=>{if(e.target===$('locationSheet'))closeLocationSheet()};
    $('accountSheet').onclick=e=>{if(e.target===$('accountSheet'))show('accountSheet',false)};
    $('detailSheet').onclick=e=>{if(e.target===$('detailSheet'))show('detailSheet',false)};
    renderLocationStrip();
    h38sb.auth.getSession().then(({data})=>data.session?authorize(data.session):showLogin()).catch(()=>showLogin());
  }
  if(window.H38_SCOUT_V240_DATA_ACQUISITION===true){bootstrapV200();return}
  const s=document.createElement('script');s.src='v240-data.js';s.async=false;s.onload=bootstrapV200;s.onerror=()=>{console.warn('Packaged provider layer unavailable; booting accepted core shell');bootstrapV200()};document.head.appendChild(s);setTimeout(bootstrapV200,5000);
})();
