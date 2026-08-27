'use strict';
window.H38_SCOUT_V261_FACEBOOK_RENDER_AUTHORITY=true;
(function installV261FacebookPublicAuthority(){
  if(window.H38_SCOUT_V261_FACEBOOK_PUBLIC_INSTALLED===true)return;
  window.H38_SCOUT_V261_FACEBOOK_PUBLIC_INSTALLED=true;
  state.v261=state.v261||{facebookLoading:false,lastFacebookRunAt:0,lastArea:''};

  const priorSnapshot=facebookSnapshot;
  facebookSnapshot=function(){
    const base=priorSnapshot(),rows=(state.v240?.facebookRows||[]).filter(r=>r&&r.location_verified===true);
    return{...base,browser:[],notifications:[],rows,alerts:false,publicRows:rows.length,publicOnly:true};
  };

  async function ensurePublicFacebookArea(){
    if(!requireLocation())return false;
    const zip=digits(state.location?.zip||'').slice(0,5);
    const unresolved=zip&&(!hasPoint()||!txt(state.location?.label)||new RegExp('^ZIP\\s*'+zip+'$','i').test(txt(state.location.label))||txt(state.location.label)===zip);
    if(unresolved){
      try{
        const p=await fn('reseller-location-geocode',{zip},20000),loc=p?.location||{},city=txt(loc.city),region=txt(loc.state);
        if(city&&Number.isFinite(Number(loc.lat))&&Number.isFinite(Number(loc.lon))){
          state.location={mode:'zip',lat:Number(loc.lat),lon:Number(loc.lon),zip,label:[city,region,zip].filter(Boolean).join(', ')};
          rememberLocation();renderLocationStrip();
        }
      }catch(e){error('facebookPublicAreaV261',e)}
    }else if(!hasPoint()&&zip){
      try{await ensureDefaultLocation()}catch(e){error('facebookPublicAreaDefaultV261',e)}
    }
    if(zip&&!hasPoint()){
      notice(`Scout could not resolve ZIP ${zip} before public Facebook search. No Facebook login fallback was opened.`,'warn');
      return false;
    }
    state.v261.lastArea=txt(state.location?.label||zip||'Current location');
    return true;
  }

  function publicTerms(){
    try{if(typeof facebookTerms==='function')return facebookTerms().slice(0,4)}catch{}
    try{if(typeof profitTerms==='function')return profitTerms().slice(0,4)}catch{}
    return ['tools','lawn mower','electronics','appliances'];
  }

  async function rankPublicFacebook(rows,terms){
    if(!rows.length)return null;
    const p=await fn('reseller-opportunity-scan-v060',{sources:['Facebook Marketplace'],terms:terms.slice(0,4),facebookCandidates:rows,...locationPayload()},70000);
    state.discover.deals=mergeDealPayload([state.discover.deals||{},p],terms);
    if(window.H38V230CacheRows)void H38V230CacheRows([...(p.opportunities||[]),...(p.candidates||[])]);
    return p;
  }

  async function runFacebookPublicV261(force=true){
    if(state.v261.facebookLoading)return;
    state.v261.facebookLoading=true;
    state.facebookPassPending=false;
    state.facebookRanking=false;
    renderDiscover();
    try{
      if(!await ensurePublicFacebookArea())return;
      const terms=publicTerms(),loc={...locationPayload(),location_label:txt(state.location?.label||''),terms,max_results:120,force:!!force};
      const p=await fn('reseller-facebook-public-v240',loc,85000);
      state.v240=state.v240||{};
      state.v240.facebook=p;
      state.v240.facebookRows=(Array.isArray(p.results)?p.results:[]).filter(r=>r&&r.location_verified===true);
      state.v261.lastFacebookRunAt=Date.now();
      if(window.H38V230CacheRows&&state.v240.facebookRows.length)void H38V230CacheRows(state.v240.facebookRows);
      await rankPublicFacebook(state.v240.facebookRows,terms);
      if(!state.v240.facebookRows.length)notice('Public Facebook search returned no location-proven listings. That is not zero local inventory, and Scout did not ask for a Facebook login.','warn');
    }catch(e){
      state.v240=state.v240||{};
      state.v240.facebook={status:'PARTIAL',engine:'H38_FACEBOOK_PUBLIC_V261',provider_status:'PROVIDER_UNAVAILABLE',authentication:'NO_FACEBOOK_LOGIN',device_fallback_required:false,results:[],warning:error('facebookPublicV261',e)};
      state.v240.facebookRows=[];
      notice('Public Facebook search is limited right now. Scout kept the result unknown and did not open a Facebook login.','warn');
    }finally{
      state.v261.facebookLoading=false;
      state.facebookPassPending=false;
      state.facebookRanking=false;
      renderDiscover();
    }
  }

  window.H38V261RunFacebookPublic=runFacebookPublicV261;
  openFacebookScan=function(){void runFacebookPublicV261(true)};
  openFacebookAlerts=function(){notice('Facebook login, cookies and notification access are not used for Scout discovery.','info')};

  function enforcePublicCard(){
    const button=$('facebookScan');if(!button)return;
    const section=button.closest('section.card');if(!section)return;
    section.dataset.v261FacebookAuthority='true';
    const rows=state.v240?.facebookRows||[],f=state.v240?.facebook,loading=!!state.v261.facebookLoading;
    button.textContent=loading?'Searching public Facebook…':'Search public Facebook';
    button.disabled=loading;
    button.onclick=()=>void runFacebookPublicV261(true);
    const alerts=$('facebookAlerts');if(alerts)alerts.remove();
    section.querySelectorAll('[data-v230-facebook-ledger],[data-v240-fb],[data-v260-facebook-status],[data-v261-facebook-status]').forEach(x=>x.remove());
    const head=section.querySelector('.section-head span');if(head)head.textContent=`${rows.length} public · no Facebook login`;
    const copy=section.querySelector('p.small');if(copy)copy.textContent='Public-only Marketplace discovery. Scout searches logged-out/public sources and requires distance or matching city/state evidence before a listing can enter resale ranking. Facebook login, cookies and notification access are not used.';
    const status=document.createElement('div');status.dataset.v261FacebookStatus='true';const provider=txt(f?.provider_status||f?.status||'READY'),engine=txt(f?.engine||'H38_FACEBOOK_PUBLIC_V261');status.innerHTML=`<div class="status-line" style="margin-top:10px"><span class="dot ${loading?'loading':rows.length?'live':provider==='PROVIDER_UNAVAILABLE'?'warn':''}"></span>${loading?`Searching public Facebook for ${esc(state.v261.lastArea||state.location?.label||state.location?.zip||'selected area')}…`:`${esc(engine)} · ${esc(provider)} · ${rows.length} location-proven listing${rows.length===1?'':'s'}`}</div>`;section.appendChild(status);
  }

  const priorRender=renderDiscover;
  renderDiscover=function(){priorRender();enforcePublicCard()};
  state.facebookPassPending=false;
  window.addEventListener('focus',()=>{state.facebookPassPending=false});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')state.facebookPassPending=false});
})();
