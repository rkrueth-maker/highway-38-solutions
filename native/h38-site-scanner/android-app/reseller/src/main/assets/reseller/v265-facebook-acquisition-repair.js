'use strict';
window.H38_SCOUT_V265_FACEBOOK_ACQUISITION_REPAIR=true;
(function installV265FacebookAcquisitionRepair(){
  if(window.H38_SCOUT_V265_FACEBOOK_ACQUISITION_REPAIR_INSTALLED===true)return;
  window.H38_SCOUT_V265_FACEBOOK_ACQUISITION_REPAIR_INSTALLED=true;
  window.H38V265RunFacebookPublicOnly=window.H38V264RunFacebookPublicOnly;

  function aggregateDiagnostics(f){
    const order=['facebook_guest','google_index','bing_index','duckduckgo_index','apify'];
    const names={facebook_guest:'FB guest',google_index:'Google',bing_index:'Bing',duckduckgo_index:'DDG',apify:'Apify'};
    const map=new Map(order.map(k=>[k,{raw:0,verified:0,gated:false,unavailable:false,reported:false}]));
    for(const d of Array.isArray(f?.diagnostics)?f.diagnostics:[]){
      const k=txt(d?.provider||'');if(!map.has(k))continue;
      const x=map.get(k);x.reported=true;x.raw+=num(d?.raw_count);x.verified+=num(d?.verified_count);x.gated=x.gated||d?.gated===true;x.unavailable=x.unavailable||d?.unavailable===true;
    }
    return order.filter(k=>k!=='apify'||map.get(k).reported).map(k=>{
      const x=map.get(k);let suffix='';
      if(x.unavailable)suffix=' unavailable';else if(x.gated)suffix=' gated';else if(!x.reported)suffix=' not reported';
      return`${names[k]}: ${x.verified}/${x.raw}${suffix}`;
    }).join(' · ');
  }
  function copy(f,rows){
    const s=txt(f?.provider_status||f?.status||'READY');
    if(rows.length)return`${rows.length} location-proven public Marketplace listing${rows.length===1?'':'s'} ready for resale ranking.`;
    if(s==='PUBLIC_LOCATION_UNPROVEN')return'Public Marketplace URLs were found, but their returned evidence did not prove the selected Scout area. Scout held them out.';
    if(s==='PUBLIC_INDEX_EMPTY')return'Public sources answered, but no indexable Marketplace item URLs were returned. Local Facebook inventory remains unknown—not zero.';
    if(s==='PROVIDER_UNAVAILABLE')return'Public Facebook sources were unavailable in this pass. Local Facebook inventory remains unknown.';
    return'No location-proven public Facebook listings are available from this pass. Local inventory remains unknown.';
  }
  function decorateV265(){
    const b=$('facebookScan');if(!b)return;const sec=b.closest('section.card');if(!sec)return;
    sec.querySelectorAll('[data-v264-facebook-status],[data-v265-facebook-status]').forEach(x=>x.remove());
    const rows=(state.v240?.facebookRows||[]).filter(r=>r&&r.location_verified===true),f=state.v240?.facebook,loading=!!state.v264?.facebookLoading;
    b.textContent=loading?'Searching public Facebook…':'Search public Facebook';b.disabled=loading;
    if(typeof window.H38V264RunFacebookPublicOnly==='function')b.onclick=()=>void window.H38V264RunFacebookPublicOnly(true);
    const head=sec.querySelector('.section-head span');if(head)head.textContent=`${rows.length} public · no Facebook login`;
    const status=document.createElement('div');status.dataset.v265FacebookStatus='true';const provider=txt(f?.provider_status||f?.status||'READY');
    status.innerHTML=`<div class="status-line" style="margin-top:10px"><span class="dot ${loading?'loading':rows.length?'live':provider==='PROVIDER_UNAVAILABLE'?'warn':''}"></span>${loading?`Searching public Facebook for ${esc(state.location?.label||state.location?.zip||'selected area')}…`:`${esc(f?.engine||'H38_FACEBOOK_PUBLIC_V265')} · ${esc(provider)} · ${rows.length} location-proven`}</div>${!loading?`<div class="small muted">${esc(copy(f,rows))}</div><div class="small muted">${esc(aggregateDiagnostics(f))}</div>`:''}`;
    sec.appendChild(status);
  }

  const renderBefore=renderDiscover;
  renderDiscover=function(){renderBefore();decorateV265()};
  if(state.user&&state.page==='discover')renderDiscover();
})();

setTimeout(function installV282EvidenceRepair(){
  if(window.H38_SCOUT_V282_EVIDENCE_REPAIR)return;
  window.H38_SCOUT_V282_EVIDENCE_REPAIR=true;

  function rawFacebookRows(){try{const b=bridge(),raw=b&&typeof b.facebookBrowserCandidates==='function'?b.facebookBrowserCandidates():'[]',rows=JSON.parse(String(raw||'[]'));return Array.isArray(rows)?rows:[]}catch{return[]}}
  function fbState(){const raw=rawFacebookRows(),system=raw.find(r=>r?.h38_system===true)||null,rows=raw.filter(r=>r?.h38_system!==true&&r?.location_verified===true);return{status:txt(system?.status||''),rows}}
  function connectFacebook(){const b=bridge();if(!b||typeof b.openFacebookMarketplace!=='function'){notice('Facebook connection requires the Android Scout app.','warn');return}try{b.openFacebookMarketplace(JSON.stringify(['__H38_CONNECT__']),0,0,state.radius||50,txt(state.location?.label||state.location?.zip||''),'')}catch(e){notice(e.message||String(e),'warn')}}
  window.H38FacebookConnected=function(){state.facebookPassPending=false;state.facebookRanking=false;notice('Facebook connected. Scout is starting an automatic Marketplace pass.','good');setTimeout(()=>window.H38V270OpenFacebookScan?.(),250)};

  const imageBefore=typeof huntImageHtml==='function'?huntImageHtml:null;
  if(imageBefore)huntImageHtml=function(r,title){
    const rk=retailerKey(r?.retailer),u=txt(r?.image_data_url||r?.image_url),retailImage=(rk==='dollar general'||rk==='dollar tree'||rk==='family dollar')&&/^https:\/\//i.test(u);
    if(retailImage)return`<img class="thumb" loading="lazy" src="${esc(u)}" alt="${esc(title)}" onerror="this.remove();this.closest('.item-card')?.classList.add('no-image')">`;
    return imageBefore(r,title);
  };

  function patchDiscoverTruth(){
    const p=$('discoverPage');if(!p)return;const line=p.querySelector('[data-v270-facebook]');if(!line)return;const fb=fbState(),started=num(state.facebookPassStartedAt)>0,busy=!!state.facebookPassPending||!!state.facebookRanking;
    if(fb.status==='AUTH_REQUIRED'){
      state.facebookPassPending=false;state.facebookRanking=false;
      line.innerHTML=`<span class="dot warn"></span>Facebook needs a one-time connection before automatic Marketplace hunting can work. <button class="mini-btn primary" data-v282-connect>Connect Facebook once</button>`;
      line.querySelector('[data-v282-connect]')?.addEventListener('click',connectFacebook);
      return;
    }
    if(fb.rows.length){line.innerHTML=`<span class="dot live"></span>${fb.rows.length} location-proven Facebook Marketplace listing${fb.rows.length===1?'':'s'} captured by Scout.`;return}
    if(busy){line.innerHTML='<span class="dot loading"></span>Scout is hunting Facebook Marketplace in the background.';return}
    if(started){line.innerHTML='<span class="dot warn"></span>Facebook returned 0 usable Marketplace listings in this pass. Craigslist results below do not count as Facebook success.';return}
    line.innerHTML='<span class="dot"></span>Facebook has not produced a usable Marketplace listing yet.';
  }

  const discoverBefore=renderDiscover;
  renderDiscover=function(){discoverBefore();patchDiscoverTruth()};
  const huntBefore=renderHunt;
  renderHunt=function(){huntBefore()};
  const huntListBefore=renderHuntListOnly;
  renderHuntListOnly=function(){huntListBefore()};
  if(state.user){if(state.page==='discover')renderDiscover();if(state.page==='hunt')renderHunt()}
},0);
