'use strict';
window.H38_SCOUT_V260_FACEBOOK_PUBLIC_FIRST=true;
(function waitForV240(){
  if(window.H38_SCOUT_V240_DATA_ACQUISITION!==true){setTimeout(waitForV240,40);return}
  if(window.H38_SCOUT_V260_FACEBOOK_PUBLIC_INSTALLED===true)return;
  window.H38_SCOUT_V260_FACEBOOK_PUBLIC_INSTALLED=true;
  state.v260=state.v260||{facebookLoading:false,lastFacebookRunAt:0};

  const priorSnapshot=facebookSnapshot;
  facebookSnapshot=function(){
    const base=priorSnapshot(),rows=(state.v240?.facebookRows||[]).filter(r=>r&&r.location_verified===true);
    return{...base,browser:[],notifications:[],rows,alerts:false,publicRows:rows.length,publicOnly:true};
  };

  async function rankPublicFacebook(rows,terms){
    if(!rows.length)return null;
    const p=await fn('reseller-opportunity-scan-v060',{sources:['Facebook Marketplace'],terms:terms.slice(0,4),facebookCandidates:rows,...locationPayload()},70000);
    state.discover.deals=mergeDealPayload([state.discover.deals||{},p],terms);
    if(window.H38V230CacheRows)void H38V230CacheRows([...(p.opportunities||[]),...(p.candidates||[])]);
    return p;
  }

  async function runFacebookPublicV260(force=true){
    if(state.v260.facebookLoading)return;
    if(!requireLocation())return;
    state.v260.facebookLoading=true;
    state.facebookPassPending=false;
    state.facebookRanking=false;
    renderDiscover();
    try{
      const terms=facebookTerms().slice(0,4),loc={...locationPayload(),location_label:state.location?.label||'',terms,max_results:120,force:!!force};
      const p=await fn('reseller-facebook-public-v240',loc,85000);
      state.v240=state.v240||{};
      state.v240.facebook=p;
      state.v240.facebookRows=(Array.isArray(p.results)?p.results:[]).filter(r=>r&&r.location_verified===true);
      state.v260.lastFacebookRunAt=Date.now();
      if(window.H38V230CacheRows&&state.v240.facebookRows.length)void H38V230CacheRows(state.v240.facebookRows);
      await rankPublicFacebook(state.v240.facebookRows,terms);
      if(!state.v240.facebookRows.length)notice('Public Facebook search returned no location-proven listings. That is not zero local inventory; Scout will not ask you to log into Facebook.','warn');
    }catch(e){
      state.v240=state.v240||{};
      state.v240.facebook={status:'PARTIAL',provider_status:'UNAVAILABLE',authentication:'NO_FACEBOOK_LOGIN',results:[],warning:error('facebookPublicV260',e)};
      state.v240.facebookRows=[];
      notice('Public Facebook search is limited right now. Scout kept the result unknown instead of asking for a Facebook login.','warn');
    }finally{
      state.v260.facebookLoading=false;
      state.facebookPassPending=false;
      state.facebookRanking=false;
      renderDiscover();
    }
  }

  window.H38V260RunFacebookPublic=runFacebookPublicV260;
  openFacebookScan=function(){void runFacebookPublicV260(true)};
  openFacebookAlerts=function(){notice('Facebook login and notification access are not required. Scout uses public Marketplace discovery now.','info')};

  const priorRender=renderDiscover;
  renderDiscover=function(){
    priorRender();
    const button=$('facebookScan'),alerts=$('facebookAlerts');
    if(!button)return;
    const section=button.closest('section.card'),f=state.v240?.facebook,rows=state.v240?.facebookRows||[];
    button.textContent=state.v260.facebookLoading?'Searching public Facebook…':'Search public Facebook';
    button.disabled=!!state.v260.facebookLoading;
    button.onclick=()=>void runFacebookPublicV260(true);
    if(alerts)alerts.style.display='none';
    const head=section?.querySelector('.section-head span');if(head)head.textContent=`${rows.length} public result${rows.length===1?'':'s'} · no Facebook login`;
    const copy=section?.querySelector('p.small');if(copy)copy.textContent='Scout searches public Marketplace pages and public search-index results, then requires distance or city/state evidence before a listing can enter resale ranking. Facebook login, cookies and notification access are not used.';
    let status=section?.querySelector('[data-v260-facebook-status]');if(!status&&section){status=document.createElement('div');status.dataset.v260FacebookStatus='true';section.appendChild(status)}
    if(status){const provider=txt(f?.provider_status||f?.status||'READY'),engine=txt(f?.engine||'H38_FACEBOOK_PUBLIC_V260'),loading=state.v260.facebookLoading;status.innerHTML=`<div class="status-line" style="margin-top:10px"><span class="dot ${loading?'loading':rows.length?'live':provider==='UNAVAILABLE'?'warn':''}"></span>${loading?'Searching public Facebook sources…':`${esc(engine)} · ${esc(provider)} · ${rows.length} location-proven listing${rows.length===1?'':'s'}`}</div>`}
    const legacy=section?.querySelector('[data-v240-fb]');if(legacy)legacy.style.display='none';
    const ledger=section?.querySelector('[data-v230-facebook-ledger]');if(ledger)ledger.style.display='none';
    [...(section?.querySelectorAll('.status-line')||[])].forEach(x=>{if(/Facebook resale pass is open|Ranking captured Facebook|Facebook pass opened/i.test(x.textContent||''))x.style.display='none'});
  };

  state.facebookPassPending=false;
  window.addEventListener('focus',()=>{state.facebookPassPending=false});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')state.facebookPassPending=false});
  if(state.page==='discover')renderDiscover();
})();
