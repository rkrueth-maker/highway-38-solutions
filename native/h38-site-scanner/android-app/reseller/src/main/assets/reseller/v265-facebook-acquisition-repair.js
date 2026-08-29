'use strict';
window.H38_SCOUT_V265_FACEBOOK_ACQUISITION_REPAIR=true;
window.H38_SCOUT_V285_FULL_WEEK_RECOVERY=true;

setTimeout(function installV285FullWeekRecovery(){
  if(window.H38_SCOUT_V285_FULL_WEEK_RECOVERY_INSTALLED)return;
  window.H38_SCOUT_V285_FULL_WEEK_RECOVERY_INSTALLED=true;
  state.v285=state.v285||{facebookStartedAt:0,facebookStatus:'SESSION_UNKNOWN',huntProviders:[]};

  const HUNT_CACHE='h38.scout.v285.hunt-evidence';
  const HUNT_CACHE_MAX_AGE=14*86400000;
  const FB_TERMINAL=new Set(['AUTH_REQUIRED','COMPLETE_WITH_ROWS','COMPLETE_LOCATION_UNPROVEN','COMPLETE_EMPTY','CHECKPOINT','ERROR']);

  function safeJson(v,f){try{const x=JSON.parse(String(v||''));return x==null?f:x}catch{return f}}
  function nativeFacebookState(){
    try{
      const b=bridge(),raw=b&&typeof b.facebookBrowserCandidates==='function'?b.facebookBrowserCandidates():'[]',all=safeJson(raw,[]),rows=Array.isArray(all)?all:[],system=rows.find(r=>r&&r.h38_system===true)||null,captured=rows.filter(r=>r&&r.h38_system!==true),accepted=captured.filter(r=>r.location_verified===true),outside=captured.filter(r=>txt(r.location_status)==='OUTSIDE_RADIUS'),unproven=captured.filter(r=>r.location_verified!==true&&txt(r.location_status)!=='OUTSIDE_RADIUS');
      return{status:txt(system?.status||state.v285.facebookStatus||'SESSION_UNKNOWN'),system,captured,accepted,outside,unproven};
    }catch{return{status:txt(state.v285.facebookStatus||'SESSION_UNKNOWN'),system:null,captured:[],accepted:[],outside:[],unproven:[]}}
  }

  facebookSnapshot=function(){
    const fb=nativeFacebookState(),notifications=typeof bridgeRows==='function'?bridgeRows('facebookNotificationCandidates'):[],publicRows=(state.v240?.facebookRows||[]).filter(r=>r&&r.location_verified===true),seen=new Map();
    for(const r of [...fb.accepted,...publicRows]){const k=txt(r?.marketplace_listing_id||r?.listing_id||r?.url||r?.id||`${r?.title||''}|${r?.price||''}`);if(k&&!seen.has(k))seen.set(k,r)}
    let alerts=false;try{alerts=bridge()?.notificationAccessEnabled?.()===true}catch{}
    return{browser:fb.accepted.slice(0,180),notifications:notifications.slice(0,120),rows:[...seen.values()].slice(0,220),alerts,publicRows:publicRows.length,publicOnly:false,facebookStatus:fb.status,capturedRows:fb.captured.length,locationUnproven:fb.unproven.length,outsideRadius:fb.outside.length};
  };

  function facebookTerms285(){try{if(typeof facebookTerms==='function')return facebookTerms().slice(0,4)}catch{}try{if(typeof profitTerms==='function')return profitTerms().slice(0,4)}catch{}return['tools','lawn mower','electronics','appliances']}
  function startFacebookAutomatic(){
    if(!requireLocation())return false;const b=bridge();if(!b||typeof b.openFacebookMarketplace!=='function')return false;const loc=locationPayload(),proof=[txt(state.location?.label||''),txt(loc.postal||state.location?.zip||'')].filter(Boolean).join('|');state.facebookPassPending=true;state.facebookRanking=false;state.facebookPassStartedAt=Date.now();state.v285.facebookStartedAt=state.facebookPassStartedAt;state.v285.facebookStatus='COLLECTING';if(state.page==='discover')renderDiscover();
    try{b.openFacebookMarketplace(JSON.stringify(facebookTerms285()),Number(loc.lat)||0,Number(loc.lon)||0,state.radius,proof,'');return true}catch(e){state.facebookPassPending=false;state.v285.facebookStatus='ERROR';error('facebookAutomaticV285',e);if(state.page==='discover')renderDiscover();return false}
  }
  window.H38V270OpenFacebookScan=startFacebookAutomatic;

  function startFacebookAuthentication(){
    const fb=nativeFacebookState();if(fb.status!=='AUTH_REQUIRED'&&fb.status!=='CHECKPOINT')return;
    const b=bridge();if(!b||typeof b.openFacebookMarketplace!=='function'){notice('Facebook sign-in requires the Android Scout app.','warn');return}
    state.v285.facebookStatus='AUTHENTICATING';try{b.openFacebookMarketplace(JSON.stringify(['__H38_CONNECT__']),0,0,state.radius||50,txt(state.location?.label||state.location?.zip||''),'')}catch(e){state.v285.facebookStatus='ERROR';notice(e.message||String(e),'warn')}
  }
  window.H38FacebookConnected=function(){state.facebookPassPending=false;state.facebookRanking=false;state.v285.facebookStatus='AUTHENTICATED';notice('Facebook session saved. Scout is resuming Marketplace automatically.','good');setTimeout(startFacebookAutomatic,350)};

  const returnedBefore285=window.H38ScoutReturned;
  window.H38ScoutReturned=function(){
    try{if(typeof returnedBefore285==='function')returnedBefore285()}catch{}
    setTimeout(async()=>{const fb=nativeFacebookState();state.v285.facebookStatus=fb.status||'SESSION_UNKNOWN';if(FB_TERMINAL.has(fb.status))state.facebookPassPending=false;
      if(fb.accepted.length){try{if(typeof rankCapturedFacebookRows==='function')await rankCapturedFacebookRows(false)}catch(e){error('facebookRankV285',e)}state.facebookPassPending=false}
      if(state.page==='discover')renderDiscover();
    },220);
  };

  function facebookStatusHtml(){
    const fb=nativeFacebookState(),started=num(state.v285.facebookStartedAt||state.facebookPassStartedAt),age=started?Date.now()-started:0,busy=(state.facebookPassPending||state.facebookRanking||fb.status==='COLLECTING'||fb.status==='SCANNING')&&age<50000;
    if(fb.accepted.length){const held=fb.unproven.length+fb.outside.length;return`<span class="dot live"></span>${fb.accepted.length} location-proven Facebook Marketplace listing${fb.accepted.length===1?'':'s'} captured automatically.${held?` ${held} additional card${held===1?' was':'s were'} withheld for location proof.`:''}`}
    if(fb.status==='AUTH_REQUIRED')return`<span class="dot warn"></span>Facebook needs a one-time sign-in before automatic Marketplace sourcing can continue. <button class="mini-btn primary" data-v285-fb-auth>Sign in once</button>`;
    if(fb.status==='CHECKPOINT')return`<span class="dot warn"></span>Facebook requires a security checkpoint before Scout can continue. <button class="mini-btn primary" data-v285-fb-auth>Complete checkpoint</button>`;
    if(busy)return'<span class="dot loading"></span>Scout is collecting Facebook Marketplace automatically.';
    if(fb.captured.length)return`<span class="dot warn"></span>Scout acquired ${fb.captured.length} Facebook listing card${fb.captured.length===1?'':'s'}, but none passed selected-area proof. Acquisition succeeded; local acceptance is zero.`;
    if(fb.status==='COMPLETE_EMPTY')return'<span class="dot warn"></span>Facebook loaded but the parser captured 0 Marketplace item cards. Scout is not treating that as proof of zero local inventory.';
    if(fb.status==='ERROR')return'<span class="dot warn"></span>Facebook acquisition failed in this pass. Other Scout providers remain available.';
    return'<span class="dot"></span>Facebook Marketplace runs automatically with Discover when a saved session is available.';
  }
  function patchFacebookTruth(){const p=$('discoverPage');if(!p)return;const line=p.querySelector('[data-v270-facebook]');if(!line)return;line.innerHTML=facebookStatusHtml();line.querySelector('[data-v285-fb-auth]')?.addEventListener('click',startFacebookAuthentication)}

  function usableImage(u){const x=txt(u);if(!/^(?:https:\/\/|data:image\/)/i.test(x))return false;return !/(?:^|[\/_.?&=-])(logo|favicon|sprite|pixel|tracking|placeholder|blank|spacer|avatar|badge|banner|promo)(?:[\/_.?&=-]|$)/i.test(x)}
  function imageCandidates(r){const f=[r?.image_data_url,r?.image_url,r?.image,r?.thumbnail_url,r?.thumbnail,r?.product_image_url,r?.product_image,r?.primary_image_url,r?.primary_image,r?.listing_image_url,r?.listing_image,r?.source_image_url,r?.source_image,r?.media_url,r?.photo_url];if(Array.isArray(r?.images))f.push(...r.images);if(Array.isArray(r?.image_urls))f.push(...r.image_urls);if(r?.media&&typeof r.media==='object')f.push(r.media.url,r.media.image_url,r.media.thumbnail_url);const out=[];for(const v of f){const u=txt(typeof v==='string'?v:(v&&typeof v==='object'?(v.url||v.src||v.image_url||''):''));if(usableImage(u)&&!out.includes(u))out.push(u)}return out}
  window.H38ScoutImageCandidates=imageCandidates;
  const imageBefore285=typeof huntImageHtml==='function'?huntImageHtml:null;
  if(imageBefore285)huntImageHtml=function(r,title){const u=imageCandidates(r)[0]||'';if(u)return`<img class="thumb" loading="lazy" src="${esc(u)}" alt="${esc(title)}" referrerpolicy="no-referrer" onerror="this.remove();this.closest('.item-card')?.classList.add('no-image')">`;return imageBefore285(r,title)};

  function cachedHunt(){const x=read(HUNT_CACHE,null);if(!x||!Array.isArray(x.rows)||!x.rows.length||Date.now()-num(x.at)>HUNT_CACHE_MAX_AGE)return[];return cleanRows(x.rows).filter(r=>!huntArtifact(r))}
  function saveHunt(rows){if(!Array.isArray(rows)||!rows.length)return;write(HUNT_CACHE,{at:Date.now(),rows:rows.slice(0,400)})}
  function mergeHuntProviderRows(payloads){const rows=[];for(const p of payloads){for(const r of Array.isArray(p?.leads)?p.leads:[])rows.push(r)}return cleanRows(rows).filter(r=>!huntArtifact(r))}
  function huntHealth(payloads,settled,rows,usedCache){const sourceStatus=[],warnings=[],providers=[];payloads.forEach((p,i)=>{providers.push({provider:i===0?'reseller-auto-leads-v064':'reseller-auto-leads-v058',status:p?.status||'PASS',count:Array.isArray(p?.leads)?p.leads.length:0});if(Array.isArray(p?.source_status))sourceStatus.push(...p.source_status);if(Array.isArray(p?.warnings))warnings.push(...p.warnings)});settled.forEach((x,i)=>{if(x.status==='rejected')providers.push({provider:i===0?'reseller-auto-leads-v064':'reseller-auto-leads-v058',status:'UNAVAILABLE',count:0,error:txt(x.reason?.message||x.reason)})});state.v285.huntProviders=providers;return{status:rows.length?'PASS':'PARTIAL',warnings,raw:payloads.reduce((n,p)=>n+num(p?.raw_count||(p?.leads||[]).length),0),actionable:rows.length,duplicatesMerged:0,sourceStatus,canonicalIdentity:'provider-isolated-v285',exactSources:rows.filter(r=>txt(r?.source_item_scope)==='exact_product').length,adapterVersion:'full-week-recovery-v285',providers,usedCachedEvidence:!!usedCache}}

  const loadHuntBefore285=loadHunt;
  loadHunt=async function(force=false){
    if(state.hunt.loading)return;state.hunt.loading=true;renderHunt();const prior=Array.isArray(state.hunt.rows)?state.hunt.rows.slice():[];let settled=[],payloads=[],rows=[],usedCache=false;
    try{
      settled=await Promise.allSettled([fn('reseller-auto-leads-v064',{...locationPayload(),force:!!force},80000),fn('reseller-auto-leads-v058',{...locationPayload(),force:!!force},65000)]);
      payloads=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);rows=mergeHuntProviderRows(payloads);
      if(!rows.length){const fallback=prior.length?prior:cachedHunt();if(fallback.length){rows=cleanRows(fallback).filter(r=>!huntArtifact(r));usedCache=true}}
      state.hunt.raw=payloads.reduce((n,p)=>n+num(p?.raw_count||(p?.leads||[]).length),0);state.hunt.rows=rows;state.hunt.loaded=true;state.hunt.sourceHealth=huntHealth(payloads,settled,rows,usedCache);if(rows.length&&!usedCache)saveHunt(rows);renderHunt();if(hasPoint()||state.location.zip)void ensureNearbyStores().then(()=>renderHuntListOnly());void hydrateHuntImages();
      if(!rows.length)notice('Penny Hunt sources returned no usable product evidence in this pass. Other Scout providers remain available.','warn');else if(usedCache)notice('Live Penny Hunt sources were unavailable; Scout preserved the last sourced product evidence instead of erasing it.','warn');
    }catch(e){const fallback=prior.length?prior:cachedHunt();if(fallback.length){state.hunt.rows=fallback;state.hunt.loaded=true;usedCache=true;notice('Penny Hunt refresh failed; prior sourced evidence was preserved.','warn')}else notice(`Penny Hunt unavailable: ${error('huntV285',e)}`,'bad')}
    finally{state.hunt.loading=false;renderHunt()}
  };
  window.H38V285LoadHunt=loadHunt;

  const restore=cachedHunt();if(!state.hunt.rows.length&&restore.length){state.hunt.rows=restore;state.hunt.loaded=true;state.hunt.sourceHealth={status:'STALE_EVIDENCE',actionable:restore.length,usedCachedEvidence:true,adapterVersion:'full-week-recovery-v285'}}
  function patchPennyHuntIdentity(){const p=$('huntPage');if(!p)return;const h=p.querySelector('.page-head h1');if(h)h.textContent='Penny Hunt';const copy=p.querySelector('.page-head p');if(copy)copy.textContent='Penny, near-penny and markdown product evidence. Community/crawler sources identify what is worth checking; physical UPC/register scan remains final local penny truth.';if(state.page==='hunt'&&$('topSubtitle'))$('topSubtitle').textContent='Penny Hunt'}

  const renderDiscoverBefore285=renderDiscover;renderDiscover=function(){renderDiscoverBefore285();patchFacebookTruth()};
  const renderHuntBefore285=renderHunt;renderHunt=function(){renderHuntBefore285();patchPennyHuntIdentity()};
  const renderHuntListBefore285=renderHuntListOnly;renderHuntListOnly=function(){renderHuntListBefore285();patchPennyHuntIdentity()};
  const runDiscoverBefore285=runDiscover;runDiscover=async function(){const task=runDiscoverBefore285();return task};

  setInterval(()=>{if(state.page==='discover'){const started=num(state.v285.facebookStartedAt||state.facebookPassStartedAt);if(state.facebookPassPending&&started&&Date.now()-started>50000){state.facebookPassPending=false;state.facebookRanking=false;state.v285.facebookStatus=nativeFacebookState().status||'ERROR';renderDiscover()}}},5000);
  if(state.user){if(state.page==='discover')renderDiscover();if(state.page==='hunt')renderHunt()}
},0);
