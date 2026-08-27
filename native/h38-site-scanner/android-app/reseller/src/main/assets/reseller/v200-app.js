'use strict';
window.H38_SCOUT_V252_FACEBOOK_LOCATION_REPAIR=true;
(function installV252FacebookLocationRepair(){
  const priorOpenFacebookScan=typeof openFacebookScan==='function'?openFacebookScan:null;
  function unresolvedZipLabel(label,zip){
    label=txt(label);zip=digits(zip).slice(0,5);
    if(!zip)return false;
    if(!label)return true;
    if(new RegExp('^ZIP\\s*'+zip+'$','i').test(label)||label===zip)return true;
    const stripped=label.replace(/,\s*\d{5}(?:-\d{4})?\s*$/,'').trim();
    return !stripped||/^ZIP\b/i.test(stripped)||/^Current location$/i.test(stripped);
  }
  async function resolveFacebookZipLabel(){
    const zip=digits(state.location?.zip||'').slice(0,5);
    let label=txt(state.location?.label||'');
    if(!zip||!unresolvedZipLabel(label,zip))return{zip,label,resolved:true};
    const p=await fn('reseller-location-geocode',{zip},20000),loc=p?.location||{},city=txt(loc.city),region=txt(loc.state);
    if(!city||!Number.isFinite(Number(loc.lat))||!Number.isFinite(Number(loc.lon)))return{zip,label,resolved:false};
    state.location={mode:'zip',lat:Number(loc.lat),lon:Number(loc.lon),zip,label:[city,region,zip].filter(Boolean).join(', ')};
    rememberLocation();renderLocationStrip();
    return{zip,label:state.location.label,resolved:true};
  }
  if(priorOpenFacebookScan){
    openFacebookScan=async function(){
      if(state.facebookLocationOpening)return;
      state.facebookLocationOpening=true;
      try{
        if(!requireLocation())return;
        const r=await resolveFacebookZipLabel();
        if(r.zip&&(!r.resolved||unresolvedZipLabel(r.label,r.zip))){notice(`Scout could not resolve ZIP ${r.zip} to a Facebook city. Facebook was not opened with an unverified location.`,'warn');return;}
        return priorOpenFacebookScan();
      }catch(e){error('facebookLocationV252',e);notice('Scout could not verify the Facebook search city. Try the Facebook pass again.','warn')}
      finally{state.facebookLocationOpening=false}
    };
  }
})();
(function loadProviderAuthorityThenBootstrap(){
  let started=false,authorityLoading=false;
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
  function loadPublicAuthority(){
    if(window.H38_SCOUT_V261_FACEBOOK_PUBLIC_INSTALLED===true){bootstrapV200();return}
    if(authorityLoading)return;
    authorityLoading=true;
    const a=document.createElement('script');a.src='v261-facebook-public-runtime.js';a.async=false;
    a.onload=()=>{authorityLoading=false;bootstrapV200()};
    a.onerror=()=>{authorityLoading=false;console.warn('Public Facebook authority unavailable; booting accepted core shell');bootstrapV200()};
    document.head.appendChild(a);
  }
  if(window.H38_SCOUT_V240_DATA_ACQUISITION===true){loadPublicAuthority();return}
  const s=document.createElement('script');s.src='v240-data.js';s.async=false;s.onload=loadPublicAuthority;s.onerror=()=>{console.warn('Packaged provider layer unavailable; booting accepted core shell');bootstrapV200()};document.head.appendChild(s);
  setTimeout(()=>{if(!started&&window.H38_SCOUT_V240_DATA_ACQUISITION!==true)bootstrapV200()},5000);
})();