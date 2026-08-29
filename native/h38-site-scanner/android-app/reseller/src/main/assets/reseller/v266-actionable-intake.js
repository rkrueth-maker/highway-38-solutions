'use strict';
window.H38_SCOUT_V300_SINGLE_OWNER_RUNTIME=true;
window.H38_SCOUT_V301_PHYSICAL_RECOVERY=true;
(function installV300(){
  if(window.H38_SCOUT_V300_INSTALLED)return;
  window.H38_SCOUT_V300_INSTALLED=true;

  const FB_TIMEOUT_MS=45000;
  const HUNT_CACHE='h38.scout.v300.hunt-evidence';
  const HUNT_CACHE_MAX_AGE=14*86400000;
  const FB_TERMINAL=new Set(['AUTH_REQUIRED','CHECKPOINT','COMPLETE_WITH_ROWS','COMPLETE_LOCATION_UNPROVEN','COMPLETE_EMPTY','ERROR']);
  const nativeImagePending=new Map();
  const nativeImageFailed=new Set();
  const imageCandidateMap=new Map();
  state.v300=state.v300||{facebookStartedAt:0,facebookStatus:'SESSION_UNKNOWN',facebookTerms:[],huntProviders:[]};

  function safeJson(v,f){try{const x=JSON.parse(String(v||''));return x==null?f:x}catch{return f}}
  function b(){try{return bridge()}catch{return null}}
  function fbNative(){
    try{
      const n=b(),raw=n&&typeof n.facebookBrowserCandidates==='function'?n.facebookBrowserCandidates():'[]';
      const all=safeJson(raw,[]),rows=Array.isArray(all)?all:[],system=rows.find(r=>r&&r.h38_system===true)||null,captured=rows.filter(r=>r&&r.h38_system!==true);
      const accepted=captured.filter(r=>r.location_verified===true),outside=captured.filter(r=>txt(r.location_status)==='OUTSIDE_RADIUS'),unproven=captured.filter(r=>r.location_verified!==true&&txt(r.location_status)!=='OUTSIDE_RADIUS');
      return{status:txt(system?.status||state.v300.facebookStatus||'SESSION_UNKNOWN'),system,captured,accepted,outside,unproven};
    }catch(e){return{status:'ERROR',system:null,captured:[],accepted:[],outside:[],unproven:[]}}
  }
  facebookSnapshot=function(){
    const fb=fbNative(),notifications=typeof bridgeRows==='function'?bridgeRows('facebookNotificationCandidates'):[],publicRows=(state.v240?.facebookRows||[]).filter(r=>r&&r.location_verified===true),seen=new Map();
    for(const r of [...fb.accepted,...publicRows]){const k=txt(r?.marketplace_listing_id||r?.listing_id||r?.id||r?.url||`${r?.title||''}|${r?.price||''}`);if(k&&!seen.has(k))seen.set(k,r)}
    let alerts=false;try{alerts=b()?.notificationAccessEnabled?.()===true}catch{}
    return{browser:fb.accepted.slice(0,180),captured:fb.captured.slice(0,180),unproven:fb.unproven.slice(0,180),outside:fb.outside.slice(0,180),notifications:notifications.slice(0,120),rows:[...seen.values()].slice(0,220),alerts,facebookStatus:fb.status,capturedRows:fb.captured.length,locationUnproven:fb.unproven.length,outsideRadius:fb.outside.length};
  };

  function fbTerms(){try{if(typeof facebookTerms==='function')return facebookTerms().slice(0,4)}catch{}try{if(typeof profitTerms==='function')return profitTerms().slice(0,4)}catch{}return['tools','electronics','appliances','lawn mower']}
  function fbProof(){const loc=locationPayload(),label=txt(state.location?.label||''),postal=txt(loc.postal||state.location?.zip||'');return[label,postal].filter(Boolean).join('|')}
  function startFacebook(force=false){
    if(!requireLocation())return false;
    const n=b();if(!n||typeof n.openFacebookMarketplace!=='function'){state.v300.facebookStatus='ERROR';notice('Facebook Marketplace collection requires the Android Scout app.','warn');return false}
    const snap=fbNative();
    if(!force&&(snap.status==='COLLECTING'||snap.status==='SCANNING'))return true;
    const loc=locationPayload(),terms=fbTerms();state.v300.facebookTerms=terms;state.v300.facebookStartedAt=Date.now();state.v300.facebookStatus='COLLECTING';state.facebookPassPending=true;state.facebookPassStartedAt=state.v300.facebookStartedAt;state.facebookRanking=false;
    if(state.page==='discover')renderDiscover();
    try{n.openFacebookMarketplace(JSON.stringify(terms),Number(loc.lat)||0,Number(loc.lon)||0,state.radius,fbProof(),'');return true}catch(e){state.facebookPassPending=false;state.v300.facebookStatus='ERROR';error('facebookV300',e);if(state.page==='discover')renderDiscover();return false}
  }
  window.H38V300StartFacebook=startFacebook;
  openFacebookScan=function(){return startFacebook(true)};

  function authenticateFacebook(){
    const snap=fbNative(),status=txt(snap.status);
    if(!['AUTH_REQUIRED','CHECKPOINT','COMPLETE_EMPTY','SESSION_UNKNOWN','ERROR'].includes(status)&&snap.captured.length)return;
    const n=b();if(!n||typeof n.openFacebookMarketplace!=='function')return;
    state.v300.facebookStatus='AUTHENTICATING';state.facebookPassPending=false;
    try{n.openFacebookMarketplace(JSON.stringify(['__H38_CONNECT__']),0,0,state.radius||50,fbProof(),'')}catch(e){state.v300.facebookStatus='ERROR';notice(e.message||String(e),'warn')}
  }
  window.H38FacebookConnected=function(){state.facebookPassPending=false;state.facebookRanking=false;state.v300.facebookStatus='AUTHENTICATED';notice('Facebook session saved. Scout is resuming Marketplace automatically.','good');setTimeout(()=>startFacebook(true),350)};

  async function rankFacebookCaptured(){
    const snap=facebookSnapshot(),rows=snap.browser||[];if(!rows.length){state.facebookPassPending=false;return}
    try{if(typeof rankCapturedFacebookRows==='function')await rankCapturedFacebookRows(false)}catch(e){error('facebookRankV300',e)}finally{state.facebookPassPending=false}
  }
  const returnedBase=window.H38ScoutReturned;
  window.H38ScoutReturned=function(){
    try{if(typeof returnedBase==='function')returnedBase()}catch{}
    setTimeout(async()=>{const snap=fbNative();state.v300.facebookStatus=snap.status||'SESSION_UNKNOWN';if(FB_TERMINAL.has(snap.status))state.facebookPassPending=false;if(snap.accepted.length)await rankFacebookCaptured();if(state.page==='discover')renderDiscover()},180);
  };

  function imageCandidates(r){
    const a=[r?.image_data_url,r?.image_url,r?.image,r?.thumbnail_url,r?.thumbnail,r?.product_image_url,r?.product_image,r?.primary_image_url,r?.primary_image,r?.listing_image_url,r?.listing_image,r?.source_image_url,r?.source_image,r?.media_url,r?.photo_url];
    if(Array.isArray(r?.images))a.push(...r.images);if(Array.isArray(r?.image_urls))a.push(...r.image_urls);if(r?.media&&typeof r.media==='object')a.push(r.media.url,r.media.image_url,r.media.thumbnail_url);
    const out=[];for(const v of a){const raw=typeof v==='string'?v:(v&&typeof v==='object'?(v.url||v.src||v.image_url||''):'');const u=txt(raw);if(!/^(?:https:\/\/|data:image\/)/i.test(u))continue;if(/(?:^|[\/_.?&=-])(logo|favicon|sprite|pixel|tracking|placeholder|blank|spacer|avatar|badge|banner|promo|loading)(?:[\/_.?&=-]|$)/i.test(u))continue;if(!out.includes(u))out.push(u)}return out
  }
  window.H38ScoutImageCandidates=imageCandidates;
  window.huntDisplayImage=function(r){return imageCandidates(r)[0]||''};

  function beginNativeImage(key,img){
    const k=txt(key),entry=imageCandidateMap.get(k),n=b();if(!k||!entry||!entry.urls.length||nativeImageFailed.has(k)||!n||typeof n.fetchImageData!=='function'){if(img)img.style.display='none';return}
    const pending=nativeImagePending.get(k)||{index:0,img:img||null};if(pending.index>=entry.urls.length){nativeImagePending.delete(k);nativeImageFailed.add(k);if(img)img.style.display='none';return}
    pending.img=img||pending.img;nativeImagePending.set(k,pending);
    try{n.fetchImageData(k,entry.urls[pending.index])}catch{pending.index++;nativeImagePending.set(k,pending);beginNativeImage(k,pending.img)}
  }
  window.H38V300ImageFallback=function(key,url,img){
    const k=txt(key),entry=imageCandidateMap.get(k);if(!k||!entry){if(img)img.style.display='none';return}
    const current=Number(img?.dataset?.h38ImageIndex||0),next=current+1;
    if(img&&next<entry.urls.length){img.dataset.h38ImageIndex=String(next);img.dataset.h38ImageUrl=entry.urls[next];img.src=entry.urls[next];return}
    beginNativeImage(k,img);
  };
  huntImageHtml=function(r,title){
    const c=imageCandidates(r),data=c.find(x=>/^data:image\//i.test(x))||'',remotes=c.filter(x=>/^https:\/\//i.test(x)),key=itemKey(r);
    if(data)return`<img class="thumb" loading="lazy" src="${esc(data)}" alt="${esc(title)}">`;
    if(remotes.length){imageCandidateMap.set(key,{urls:remotes.slice(0,8)});return`<img class="thumb" loading="lazy" src="${esc(remotes[0])}" alt="${esc(title)}" data-h38-image-key="${esc(key)}" data-h38-image-index="0" data-h38-image-url="${esc(remotes[0])}" onerror="window.H38V300ImageFallback&&window.H38V300ImageFallback(this.dataset.h38ImageKey,this.dataset.h38ImageUrl,this)">`}
    return''
  };
  window.H38NativeImageResult=function(key,dataUrl){
    const k=String(key||''),pending=nativeImagePending.get(k);nativeImagePending.delete(k);if(!/^data:image\//i.test(txt(dataUrl))){if(pending){pending.index++;nativeImagePending.set(k,pending);beginNativeImage(k,pending.img)}return}let changed=false;state.hunt.rows=state.hunt.rows.map(r=>{if(itemKey(r)===k){changed=true;return{...r,image_data_url:dataUrl}}return r});document.querySelectorAll(`img[data-h38-image-key="${CSS.escape(k)}"]`).forEach(img=>{img.src=dataUrl;img.style.display='';img.onerror=null});if(changed&&state.page==='hunt')renderHuntListOnly()
  };
  window.H38NativeImageError=function(key){const k=String(key||''),pending=nativeImagePending.get(k);if(!pending){nativeImageFailed.add(k);return}pending.index++;nativeImagePending.set(k,pending);beginNativeImage(k,pending.img)};

  function cachedHunt(){const x=read(HUNT_CACHE,null);if(!x||!Array.isArray(x.rows)||!x.rows.length||Date.now()-num(x.at)>HUNT_CACHE_MAX_AGE)return[];return cleanRows(x.rows).filter(r=>!huntArtifact(r))}
  function saveHunt(rows){if(rows.length)write(HUNT_CACHE,{at:Date.now(),rows:rows.slice(0,500)})}
  loadHunt=async function(force=false){
    if(state.hunt.loading)return;state.hunt.loading=true;renderHunt();const prior=Array.isArray(state.hunt.rows)?state.hunt.rows.slice():[];
    try{
      const settled=await Promise.allSettled([fn('reseller-auto-leads-v064',{...locationPayload(),force:!!force},80000),fn('reseller-auto-leads-v058',{...locationPayload(),force:!!force},65000)]),payloads=settled.filter(x=>x.status==='fulfilled').map(x=>x.value),all=[];
      for(const p of payloads)for(const r of Array.isArray(p?.leads)?p.leads:[])all.push(r);
      let rows=cleanRows(all).filter(r=>!huntArtifact(r)),usedCache=false;if(!rows.length){rows=prior.length?cleanRows(prior).filter(r=>!huntArtifact(r)):cachedHunt();usedCache=rows.length>0}
      state.hunt.raw=payloads.reduce((n,p)=>n+num(p?.raw_count||(p?.leads||[]).length),0);state.hunt.rows=rows;state.hunt.loaded=true;state.v300.huntProviders=settled.map((x,i)=>({provider:i===0?'reseller-auto-leads-v064':'reseller-auto-leads-v058',status:x.status==='fulfilled'?txt(x.value?.status||'PASS'):'UNAVAILABLE',count:x.status==='fulfilled'&&Array.isArray(x.value?.leads)?x.value.leads.length:0}));state.hunt.sourceHealth={status:rows.length?'PASS':'PARTIAL',actionable:rows.length,providers:state.v300.huntProviders,usedCachedEvidence:usedCache,adapterVersion:'v301-provider-isolated'};if(rows.length&&!usedCache)saveHunt(rows);renderHunt();if(hasPoint()||state.location.zip)void ensureNearbyStores().then(()=>renderHuntListOnly());void hydrateHuntImages();
    }catch(e){const rows=prior.length?prior:cachedHunt();if(rows.length){state.hunt.rows=rows;state.hunt.loaded=true;notice('Live Penny Hunt refresh failed; Scout preserved prior sourced evidence.','warn')}else notice(`Penny Hunt unavailable: ${error('huntV300',e)}`,'bad')}
    finally{state.hunt.loading=false;renderHunt()}
  };

  function fbStatusHtml(){
    const s=facebookSnapshot(),status=txt(s.facebookStatus),age=Date.now()-num(state.v300.facebookStartedAt||0),busy=(status==='COLLECTING'||status==='SCANNING'||state.facebookPassPending)&&age<FB_TIMEOUT_MS;
    if(s.captured.length)return`<div class="status-line"><span class="dot ${s.browser.length?'live':'warn'}"></span>${s.captured.length} Facebook Marketplace card${s.captured.length===1?'':'s'} captured. ${s.browser.length} location-proven${s.unproven.length?` · ${s.unproven.length} need location proof`:''}${s.outside.length?` · ${s.outside.length} outside radius`:''}.</div>`;
    if(status==='AUTH_REQUIRED')return`<div class="status-line"><span class="dot warn"></span>Facebook needs one sign-in before automatic sourcing can continue. <button class="mini-btn primary" data-v300-fb-auth>Sign in once</button></div>`;
    if(status==='CHECKPOINT')return`<div class="status-line"><span class="dot warn"></span>Facebook requires a security checkpoint. <button class="mini-btn primary" data-v300-fb-auth>Complete checkpoint</button></div>`;
    if(busy)return'<div class="status-line"><span class="dot loading"></span>Collecting Facebook Marketplace now…</div>';
    if(status==='COMPLETE_EMPTY')return'<div class="status-line"><span class="dot warn"></span>Facebook returned 0 capturable cards. Repair the saved session once, then Scout will rerun automatically. <button class="mini-btn primary" data-v300-fb-auth>Repair Facebook session</button></div>';
    if(status==='ERROR')return'<div class="status-line"><span class="dot warn"></span>Facebook acquisition failed. Repair the session or retry; Craigslist, Penny Hunt and auctions remain independent. <button class="mini-btn primary" data-v300-fb-auth>Repair Facebook session</button></div>';
    return'<div class="status-line"><span class="dot"></span>Facebook starts automatically with Discover. If no saved session exists, Scout will ask for one sign-in.</div>'
  }
  function fbCard(r){const title=txt(r.title||'Facebook Marketplace listing'),img=huntImageHtml(r,title),price=Number(r.price),loc=r.location_verified===true?'LOCATION PROVEN':txt(r.location_status)==='OUTSIDE_RADIUS'?'OUTSIDE RADIUS':'LOCATION NEEDS PROOF';return`<article class="item-card ${img?'':'no-image'}">${img}<div class="item-main"><div class="item-top"><span class="badge ${r.location_verified===true?'good':'warn'}">${loc}</span><span class="badge">Facebook Marketplace</span></div><h3>${esc(title)}</h3><div class="price-line"><span class="price">${Number.isFinite(price)&&price>0?dollars(price):'Price unknown'}</span></div><div class="meta">${Number.isFinite(Number(r.distance_miles))?`<span>${Number(r.distance_miles).toFixed(1)} mi</span>`:''}${r.term?`<span>match: ${esc(r.term)}</span>`:''}</div><div class="card-actions">${r.url?`<button class="mini-btn primary" data-v300-open="${esc(r.url)}">Open listing</button>`:''}<button class="mini-btn" data-v300-research="${esc(title)}" data-v300-price="${Number(price||0)}">Research</button></div></div></article>`}
  function decorateDiscover(){
    const p=$('discoverPage');if(!p)return;let sec=p.querySelector('[data-v300-facebook]');if(!sec){sec=document.createElement('section');sec.className='card';sec.dataset.v300Facebook='true';const hero=p.querySelector('.hero');if(hero)hero.insertAdjacentElement('afterend',sec);else p.prepend(sec)}
    const s=facebookSnapshot(),cards=s.captured.slice(0,8);sec.innerHTML=`<div class="section-head"><h2>Facebook Marketplace</h2><span>${s.captured.length} captured</span></div><p class="small muted">Automatic session-assisted collection. Scout shows captured cards immediately and labels location proof separately instead of silently discarding them.</p>${fbStatusHtml()}${cards.length?`<div class="result-list cols">${cards.map(fbCard).join('')}</div>`:''}<div class="card-actions"><button class="mini-btn" data-v300-fb-refresh>Refresh Facebook</button></div>`;
    sec.querySelectorAll('[data-v300-fb-auth]').forEach(x=>x.onclick=authenticateFacebook);sec.querySelectorAll('[data-v300-fb-refresh]').forEach(x=>x.onclick=()=>startFacebook(true));sec.querySelectorAll('[data-v300-open]').forEach(x=>x.onclick=()=>openExternal(x.dataset.v300Open));sec.querySelectorAll('[data-v300-research]').forEach(x=>x.onclick=()=>{setPage('scan');setTimeout(()=>{const q=$('scanHint'),price=$('scanPrice');if(q)q.value=x.dataset.v300Research||'';if(price&&Number(x.dataset.v300Price)>0)price.value=x.dataset.v300Price},30)})
  }
  function decorateHunt(){const p=$('huntPage');if(!p)return;const h=p.querySelector('.page-head h1');if(h)h.textContent='Penny Hunt';const copy=p.querySelector('.page-head p');if(copy)copy.textContent='Penny, near-penny and markdown evidence. Community/crawler sources tell you what is worth checking; physical UPC/register scan remains final local penny truth.';if(state.page==='hunt'&&$('topSubtitle'))$('topSubtitle').textContent='Penny Hunt'}

  const renderDiscoverBase=renderDiscover;renderDiscover=function(){renderDiscoverBase();decorateDiscover()};
  const renderHuntBase=renderHunt;renderHunt=function(){renderHuntBase();decorateHunt()};
  const renderHuntListBase=renderHuntListOnly;renderHuntListOnly=function(){renderHuntListBase();decorateHunt()};
  const runDiscoverBase=runDiscover;runDiscover=async function(){if(state.discover.running)return;startFacebook(false);return runDiscoverBase()};

  setInterval(()=>{if(state.page!=='discover')return;const snap=fbNative(),started=num(state.v300.facebookStartedAt);if(state.facebookPassPending&&started&&Date.now()-started>=FB_TIMEOUT_MS){state.facebookPassPending=false;state.facebookRanking=false;state.v300.facebookStatus=snap.status||'ERROR';renderDiscover()}},4000);
  const restore=cachedHunt();if(!state.hunt.rows.length&&restore.length){state.hunt.rows=restore;state.hunt.loaded=true;state.hunt.sourceHealth={status:'STALE_EVIDENCE',actionable:restore.length,usedCachedEvidence:true,adapterVersion:'v301-provider-isolated'}}
  if(state.user){if(state.page==='discover')renderDiscover();if(state.page==='hunt')renderHunt()}
})();