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

setTimeout(function installV284FacebookAndImageRecovery(){
  if(window.H38_SCOUT_V284_FACEBOOK_AND_IMAGE_RECOVERY)return;
  window.H38_SCOUT_V282_EVIDENCE_REPAIR=true;
  window.H38_SCOUT_V283_FACEBOOK_SESSION_PIPELINE=true;
  window.H38_SCOUT_V284_FACEBOOK_AND_IMAGE_RECOVERY=true;

  function rawFacebookRows(){
    try{
      const b=bridge(),raw=b&&typeof b.facebookBrowserCandidates==='function'?b.facebookBrowserCandidates():'[]',rows=JSON.parse(String(raw||'[]'));
      return Array.isArray(rows)?rows:[];
    }catch{return[]}
  }
  function fbState(){
    const raw=rawFacebookRows(),system=raw.find(r=>r?.h38_system===true)||null,captured=raw.filter(r=>r?.h38_system!==true),rows=captured.filter(r=>r?.location_verified===true),unproven=captured.filter(r=>r?.location_verified!==true&&txt(r?.location_status)!=='OUTSIDE_RADIUS'),outside=captured.filter(r=>txt(r?.location_status)==='OUTSIDE_RADIUS');
    return{status:txt(system?.status||''),rows,captured,unproven,outside,system};
  }

  facebookSnapshot=function(){
    const fb=fbState(),notifications=typeof bridgeRows==='function'?bridgeRows('facebookNotificationCandidates'):[],publicRows=(state.v240?.facebookRows||[]).filter(r=>r&&r.location_verified===true),by=new Map();
    for(const r of [...fb.rows,...publicRows]){
      const k=txt(r?.url||r?.id||`${r?.title||''}|${r?.price||''}`);
      if(k&&!by.has(k))by.set(k,r);
    }
    let alerts=false;try{alerts=bridge()?.notificationAccessEnabled?.()===true}catch{}
    return{browser:fb.rows.slice(0,180),notifications:notifications.slice(0,120),rows:[...by.values()].slice(0,220),alerts,publicRows:publicRows.length,publicOnly:false,facebookStatus:fb.status,capturedRows:fb.captured.length,locationUnproven:fb.unproven.length,outsideRadius:fb.outside.length};
  };

  function connectFacebook(){
    const b=bridge();
    if(!b||typeof b.openFacebookMarketplace!=='function'){notice('Facebook connection requires the Android Scout app.','warn');return}
    state.facebookPassPending=false;state.facebookRanking=false;
    try{b.openFacebookMarketplace(JSON.stringify(['__H38_CONNECT__']),0,0,state.radius||50,txt(state.location?.label||state.location?.zip||''),'')}catch(e){notice(e.message||String(e),'warn')}
  }
  window.H38FacebookConnected=function(){
    state.facebookPassPending=false;state.facebookRanking=false;
    notice('Facebook connected. Scout is starting an automatic Marketplace pass.','good');
    setTimeout(()=>window.H38V270OpenFacebookScan?.(),350);
  };

  function usableImage(u){
    const x=txt(u);
    return /^(?:https:\/\/|data:image\/)/i.test(x)&&!/(?:^|[\/_.?&=-])(logo|favicon|sprite|pixel|tracking|placeholder|blank|spacer)(?:[\/_.?&=-]|$)/i.test(x);
  }
  function imageCandidates(r){
    const fields=[r?.image_data_url,r?.image_url,r?.image,r?.thumbnail_url,r?.thumbnail,r?.product_image_url,r?.product_image,r?.primary_image_url,r?.primary_image,r?.source_image_url,r?.source_image,r?.media_url,r?.photo_url];
    if(Array.isArray(r?.images))fields.push(...r.images);
    if(Array.isArray(r?.image_urls))fields.push(...r.image_urls);
    if(r?.media&&typeof r.media==='object')fields.push(r.media.url,r.media.image_url,r.media.thumbnail_url);
    return fields.map(v=>typeof v==='string'?v:(v&&typeof v==='object'?(v.url||v.src||v.image_url||''):'')).map(txt).filter(usableImage);
  }
  window.H38ScoutImageCandidates=imageCandidates;

  const imageBefore=typeof huntImageHtml==='function'?huntImageHtml:null;
  if(imageBefore)huntImageHtml=function(r,title){
    const u=imageCandidates(r)[0]||'';
    if(u)return`<img class="thumb" loading="lazy" src="${esc(u)}" alt="${esc(title)}" referrerpolicy="no-referrer" onerror="this.remove();this.closest('.item-card')?.classList.add('no-image')">`;
    return imageBefore(r,title);
  };

  function facebookButton(label,action){return` <button class="mini-btn primary" data-v284-facebook-action="${action}">${label}</button>`}
  function patchDiscoverTruth(){
    const p=$('discoverPage');if(!p)return;
    const line=p.querySelector('[data-v270-facebook]');if(!line)return;
    const fb=fbState(),started=num(state.facebookPassStartedAt)>0,age=started?Date.now()-num(state.facebookPassStartedAt):0,busy=!!state.facebookPassPending||!!state.facebookRanking;
    if(busy&&age>40000){state.facebookPassPending=false;state.facebookRanking=false}
    if(fb.status==='AUTH_REQUIRED'){
      line.innerHTML=`<span class="dot warn"></span>Facebook needs a one-time connection before automatic Marketplace hunting can work.${facebookButton('Connect Facebook once','connect')}`;
    }else if(fb.rows.length){
      const held=fb.unproven.length+fb.outside.length;
      line.innerHTML=`<span class="dot live"></span>${fb.rows.length} location-proven Facebook Marketplace listing${fb.rows.length===1?'':'s'} captured by Scout.${held?` ${held} additional card${held===1?' was':'s were'} withheld for location proof.`:''}`;
    }else if((!!state.facebookPassPending||!!state.facebookRanking||fb.status==='SCANNING')&&age<=40000){
      line.innerHTML='<span class="dot loading"></span>Scout is hunting Facebook Marketplace in the background.';
    }else if(fb.captured.length){
      line.innerHTML=`<span class="dot warn"></span>Facebook yielded ${fb.captured.length} listing card${fb.captured.length===1?'':'s'}, but ${fb.unproven.length} lacked selected-area proof and ${fb.outside.length} were outside the radius. Scout withheld them instead of calling inventory zero.${facebookButton('Run Facebook again','retry')}`;
    }else if(fb.status==='COMPLETE_EMPTY'){
      line.innerHTML=`<span class="dot warn"></span>Facebook loaded, but Scout captured 0 Marketplace item cards. Local inventory remains unknown.${facebookButton('Connect / refresh Facebook','connect')}`;
    }else if(started&&age>40000){
      line.innerHTML=`<span class="dot warn"></span>Facebook did not finish a usable pass. Scout stopped the stale hunt instead of pretending it worked.${facebookButton('Connect / refresh Facebook','connect')}`;
    }else if(started){
      line.innerHTML=`<span class="dot warn"></span>Facebook produced no usable Marketplace cards in this pass. Craigslist results below do not count as Facebook success.${facebookButton('Run Facebook again','retry')}`;
    }else{
      line.innerHTML=`<span class="dot"></span>Facebook is ready to be connected for automatic Marketplace hunting.${facebookButton('Connect Facebook once','connect')}`;
    }
    line.querySelector('[data-v284-facebook-action="connect"]')?.addEventListener('click',connectFacebook);
    line.querySelector('[data-v284-facebook-action="retry"]')?.addEventListener('click',()=>window.H38V270OpenFacebookScan?.());
  }

  const discoverBefore=renderDiscover;
  renderDiscover=function(){discoverBefore();patchDiscoverTruth()};
  setInterval(()=>{if(state.page==='discover'&&state.facebookPassPending&&Date.now()-num(state.facebookPassStartedAt)>40000)renderDiscover()},5000);
  if(state.user){if(state.page==='discover')renderDiscover();if(state.page==='hunt')renderHunt()}
},0);
