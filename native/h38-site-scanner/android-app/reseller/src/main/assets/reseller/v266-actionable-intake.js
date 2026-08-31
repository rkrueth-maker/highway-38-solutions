'use strict';
window.H38_SCOUT_V300_SINGLE_OWNER_RUNTIME=true;
window.H38_SCOUT_V301_PHYSICAL_RECOVERY=true;
window.H38_SCOUT_V305_PUBLIC_BACKEND_RECOVERY=true;
(function installV300(){
  if(window.H38_SCOUT_V300_INSTALLED)return;
  window.H38_SCOUT_V300_INSTALLED=true;

  const FB_TIMEOUT_MS=75000;
  const HUNT_CACHE='h38.scout.v300.hunt-evidence';
  const HUNT_CACHE_MAX_AGE=14*86400000;
  const FB_TERMINAL=new Set(['PUBLIC_BLOCKED','COMPLETE_WITH_ROWS','COMPLETE_LOCATION_UNPROVEN','COMPLETE_EMPTY','PUBLIC_INDEX_EMPTY','ERROR']);
  const nativeImagePending=new Map();
  const nativeImageFailed=new Set();
  const imageCandidateMap=new Map();
  let facebookRequestSeq=0;
  state.v300=state.v300||{facebookStartedAt:0,facebookStatus:'SESSION_UNKNOWN',facebookTerms:[],huntProviders:[],facebookPublicCandidates:[]};
  if(!Array.isArray(state.v300.facebookPublicCandidates))state.v300.facebookPublicCandidates=[];

  function safeJson(v,f){try{const x=JSON.parse(String(v||''));return x==null?f:x}catch{return f}}
  function b(){try{return bridge()}catch{return null}}
  function fbNative(){
    try{
      const n=b(),raw=n&&typeof n.facebookBrowserCandidates==='function'?n.facebookBrowserCandidates():'[]';
      const all=safeJson(raw,[]),rows=Array.isArray(all)?all:[],system=rows.find(r=>r&&r.h38_system===true)||null,captured=rows.filter(r=>r&&r.h38_system!==true);
      const accepted=captured.filter(r=>r.location_verified===true),outside=captured.filter(r=>txt(r.location_status)==='OUTSIDE_RADIUS'),unproven=captured.filter(r=>r.location_verified!==true&&txt(r.location_status)!=='OUTSIDE_RADIUS');
      return{status:txt(system?.status||''),system,captured,accepted,outside,unproven};
    }catch(e){return{status:'',system:null,captured:[],accepted:[],outside:[],unproven:[]}}
  }
  function mergeFacebookRows(rows){const seen=new Map();for(const r of rows){const k=txt(r?.marketplace_listing_id||r?.listing_id||r?.id||r?.url||`${r?.title||''}|${r?.price||''}`);if(k&&!seen.has(k))seen.set(k,r)}return[...seen.values()]}
  facebookSnapshot=function(){
    const fb=fbNative(),notifications=typeof bridgeRows==='function'?bridgeRows('facebookNotificationCandidates'):[],publicVerified=Array.isArray(state.v240?.facebookRows)?state.v240.facebookRows:[],publicCaptured=Array.isArray(state.v300.facebookPublicCandidates)?state.v300.facebookPublicCandidates:[],captured=mergeFacebookRows([...publicCaptured,...publicVerified,...fb.captured]),accepted=captured.filter(r=>r.location_verified===true),outside=captured.filter(r=>txt(r.location_status)==='OUTSIDE_RADIUS'),unproven=captured.filter(r=>r.location_verified!==true&&txt(r.location_status)!=='OUTSIDE_RADIUS'),status=txt(state.v300.facebookStatus||fb.status||'SESSION_UNKNOWN');
    let alerts=false;try{alerts=b()?.notificationAccessEnabled?.()===true}catch{}
    return{browser:accepted.slice(0,180),captured:captured.slice(0,180),unproven:unproven.slice(0,180),outside:outside.slice(0,180),notifications:notifications.slice(0,120),rows:accepted.slice(0,220),alerts,facebookStatus:status,capturedRows:captured.length,locationUnproven:unproven.length,outsideRadius:outside.length};
  };

  function fbTerms(){try{if(typeof facebookTerms==='function')return facebookTerms().slice(0,4)}catch{}try{if(typeof profitTerms==='function')return profitTerms().slice(0,4)}catch{}return['tools','electronics','appliances','lawn mower']}
  async function startFacebook(force=false){
    if(!requireLocation())return false;
    if(state.facebookPassPending)return true;
    const request=++facebookRequestSeq,terms=fbTerms(),started=Date.now(),priorVerified=Array.isArray(state.v240?.facebookRows)?state.v240.facebookRows.slice():[],priorCaptured=Array.isArray(state.v300.facebookPublicCandidates)?state.v300.facebookPublicCandidates.slice():[];
    state.v300.facebookTerms=terms;state.v300.facebookStartedAt=started;state.v300.facebookStatus='SEARCHING_PUBLIC_INDEX';state.facebookPassPending=true;state.facebookPassStartedAt=started;state.facebookRanking=false;
    if(state.page==='discover')renderDiscover();
    try{
      await ensureDefaultLocation();
      const p=await fn('reseller-facebook-public-v240',{...locationPayload(),location_label:state.location?.label||'',terms,max_results:120,force:!!force},75000);
      if(request!==facebookRequestSeq)return true;
      state.v240=state.v240||{};state.v240.facebook=p;
      const nextVerified=Array.isArray(p?.results)?p.results:[],nextCaptured=Array.isArray(p?.candidates)?p.candidates:nextVerified.slice();
      state.v240.facebookRows=mergeFacebookRows([...priorVerified,...nextVerified]);
      state.v300.facebookPublicCandidates=mergeFacebookRows([...priorCaptured,...nextCaptured,...state.v240.facebookRows]);
      state.v300.facebookStatus=state.v300.facebookPublicCandidates.length?(state.v240.facebookRows.length?'COMPLETE_WITH_ROWS':'COMPLETE_LOCATION_UNPROVEN'):(txt(p?.provider_status)==='PUBLIC_INDEX_EMPTY'?'PUBLIC_INDEX_EMPTY':'COMPLETE_EMPTY');
      if(window.H38V230CacheRows&&state.v240.facebookRows.length)void H38V230CacheRows(state.v240.facebookRows);
      return true;
    }catch(e){if(request===facebookRequestSeq){state.v300.facebookStatus=priorCaptured.length?'COMPLETE_LOCATION_UNPROVEN':'ERROR';error('facebookV305',e)}return false}
    finally{if(request===facebookRequestSeq){state.facebookPassPending=false;state.facebookRanking=false;if(state.page==='discover')renderDiscover()}}
  }
  window.H38V300StartFacebook=startFacebook;
  openFacebookScan=function(){return startFacebook(true)};

  function authenticateFacebook(){notice('Scout v3.0.5 uses public Marketplace sources only. No Facebook sign-in is used.','good')}
  window.H38FacebookConnected=function(){state.facebookPassPending=false;state.facebookRanking=false;state.v300.facebookStatus='PUBLIC_ONLY';if(state.page==='discover')renderDiscover()};

  async function rankFacebookCaptured(){
    const snap=facebookSnapshot(),rows=snap.browser||[];if(!rows.length){state.facebookPassPending=false;return}
    try{if(typeof rankCapturedFacebookRows==='function')await rankCapturedFacebookRows(false)}catch(e){error('facebookRankV300',e)}finally{state.facebookPassPending=false}
  }
  const returnedBase=window.H38ScoutReturned;
  window.H38ScoutReturned=function(){
    try{if(typeof returnedBase==='function')returnedBase()}catch{}
    setTimeout(async()=>{const snap=facebookSnapshot();if(snap.browser.length)await rankFacebookCaptured();if(state.page==='discover')renderDiscover()},180);
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

  function weirdHuntRow(r){const raw=txt(r?.title||r?.name||r?.item_name||r?.product_name),t=raw.toLowerCase().replace(/[^a-z0-9]+/g,'');if(!t)return true;return['1cent','onecent','penny','pennyitem','unknown','na','001','001cent'].includes(t)}
  function cachedHunt(){const x=read(HUNT_CACHE,null);if(!x||!Array.isArray(x.rows)||!x.rows.length||Date.now()-num(x.at)>HUNT_CACHE_MAX_AGE)return[];return cleanRows(x.rows).filter(r=>!huntArtifact(r)&&!weirdHuntRow(r))}
  function saveHunt(rows){if(rows.length)write(HUNT_CACHE,{at:Date.now(),rows:rows.slice(0,500)})}
  loadHunt=async function(force=false){
    if(state.hunt.loading)return;state.hunt.loading=true;renderHunt();const prior=Array.isArray(state.hunt.rows)?state.hunt.rows.slice():[];
    try{
      const settled=await Promise.allSettled([fn('reseller-auto-leads-v064',{...locationPayload(),force:!!force},80000),fn('reseller-auto-leads-v058',{...locationPayload(),force:!!force},65000)]),payloads=settled.filter(x=>x.status==='fulfilled').map(x=>x.value),all=[];
      for(const p of payloads)for(const r of Array.isArray(p?.leads)?p.leads:[])all.push(r);
      let rows=cleanRows(all).filter(r=>!huntArtifact(r)&&!weirdHuntRow(r)),usedCache=false;if(!rows.length){rows=prior.length?cleanRows(prior).filter(r=>!huntArtifact(r)&&!weirdHuntRow(r)):cachedHunt();usedCache=rows.length>0}
      state.hunt.raw=payloads.reduce((n,p)=>n+num(p?.raw_count||(p?.leads||[]).length),0);state.hunt.rows=rows;state.hunt.loaded=true;state.v300.huntProviders=settled.map((x,i)=>({provider:i===0?'reseller-auto-leads-v064':'reseller-auto-leads-v058',status:x.status==='fulfilled'?txt(x.value?.status||'PASS'):'UNAVAILABLE',count:x.status==='fulfilled'&&Array.isArray(x.value?.leads)?x.value.leads.length:0}));state.hunt.sourceHealth={status:rows.length?'PASS':'PARTIAL',actionable:rows.length,providers:state.v300.huntProviders,usedCachedEvidence:usedCache,adapterVersion:'v301-provider-isolated'};if(rows.length&&!usedCache)saveHunt(rows);renderHunt();if(hasPoint()||state.location.zip)void ensureNearbyStores().then(()=>renderHuntListOnly());void hydrateHuntImages();
    }catch(e){const rows=prior.length?prior:cachedHunt();if(rows.length){state.hunt.rows=rows;state.hunt.loaded=true;notice('Live Penny Hunt refresh failed; Scout preserved prior sourced evidence.','warn')}else notice(`Penny Hunt unavailable: ${error('huntV300',e)}`,'bad')}
    finally{state.hunt.loading=false;renderHunt()}
  };

  function fbStatusHtml(){
    const s=facebookSnapshot(),status=txt(s.facebookStatus),age=Date.now()-num(state.v300.facebookStartedAt||0),busy=(status==='COLLECTING'||status==='SCANNING'||status==='SCANNING_PUBLIC'||status==='SEARCHING_PUBLIC_INDEX'||state.facebookPassPending)&&age<FB_TIMEOUT_MS;
    if(s.captured.length)return`<div class="status-line"><span class="dot ${s.browser.length?'live':'warn'}"></span>${s.captured.length} public Facebook Marketplace card${s.captured.length===1?'':'s'} captured. ${s.browser.length} location-proven${s.unproven.length?` · ${s.unproven.length} need location proof`:''}${s.outside.length?` · ${s.outside.length} outside radius`:''}.</div>`;
    if(busy)return'<div class="status-line"><span class="dot loading"></span>Searching public Facebook Marketplace indexes…</div>';
    if(status==='PUBLIC_BLOCKED')return'<div class="status-line"><span class="dot warn"></span>Facebook blocked anonymous Marketplace pages and public indexes returned no usable cards. Scout did not ask for or use a Facebook login.</div>';
    if(status==='PUBLIC_INDEX_EMPTY'||status==='COMPLETE_EMPTY')return'<div class="status-line"><span class="dot warn"></span>No public Marketplace cards were found in this pass. Local Facebook inventory remains unknown—not zero. <button class="mini-btn" data-v300-fb-refresh>Retry public Facebook</button></div>';
    if(status==='ERROR')return'<div class="status-line"><span class="dot warn"></span>Public Facebook acquisition failed; Craigslist, Penny Hunt and auctions remain independent. <button class="mini-btn" data-v300-fb-refresh>Retry public Facebook</button></div>';
    return'<div class="status-line"><span class="dot"></span>Scout uses public Facebook Marketplace discovery only. No Facebook login or saved Facebook session is used.</div>'
  }
  function fbCard(r){const title=txt(r.title||'Facebook Marketplace listing'),img=huntImageHtml(r,title),price=Number(r.price),loc=r.location_verified===true?'LOCATION PROVEN':txt(r.location_status)==='OUTSIDE_RADIUS'?'OUTSIDE RADIUS':'LOCATION NEEDS PROOF';return`<article class="item-card ${img?'':'no-image'}">${img}<div class="item-main"><div class="item-top"><span class="badge ${r.location_verified===true?'good':'warn'}">${loc}</span><span class="badge">Facebook Marketplace</span>${r.freshness_unproven===true?'<span class="badge warn">FRESHNESS UNPROVEN</span>':''}</div><h3>${esc(title)}</h3><div class="price-line"><span class="price">${Number.isFinite(price)&&price>0?dollars(price):'Price unknown'}</span></div><div class="meta">${Number.isFinite(Number(r.distance_miles))?`<span>${Number(r.distance_miles).toFixed(1)} mi</span>`:''}${r.term?`<span>match: ${esc(r.term)}</span>`:''}</div><div class="card-actions">${r.url?`<button class="mini-btn primary" data-v300-open="${esc(r.url)}">Open listing</button>`:''}<button class="mini-btn" data-v300-research="${esc(title)}" data-v300-price="${Number(price||0)}">Research</button></div></div></article>`}
  function decorateDiscover(){
    const p=$('discoverPage');if(!p)return;
    const legacyButton=p.querySelector('#facebookScan'),legacySec=legacyButton?.closest('section.card');if(legacySec)legacySec.remove();
    let sec=p.querySelector('[data-v300-facebook]');if(!sec){sec=document.createElement('section');sec.className='card';sec.dataset.v300Facebook='true';const hero=p.querySelector('.hero');if(hero)hero.insertAdjacentElement('afterend',sec);else p.prepend(sec)}
    const s=facebookSnapshot(),cards=s.captured.slice(0,8);sec.innerHTML=`<div class="section-head"><h2>Facebook Marketplace</h2><span>${s.captured.length} captured</span></div><p class="small muted">Public-only Marketplace discovery. Scout never asks you to sign in to Facebook and no longer opens Facebook automatically. Public indexed listings may be shown with location/freshness warnings until proven.</p>${fbStatusHtml()}${cards.length?`<div class="result-list cols">${cards.map(fbCard).join('')}</div>`:''}<div class="card-actions"><button class="mini-btn" data-v300-fb-refresh>Refresh Facebook</button></div>`;
    sec.querySelectorAll('[data-v300-fb-refresh]').forEach(x=>x.onclick=()=>startFacebook(true));sec.querySelectorAll('[data-v300-open]').forEach(x=>x.onclick=()=>openExternal(x.dataset.v300Open));sec.querySelectorAll('[data-v300-research]').forEach(x=>x.onclick=()=>{setPage('scan');setTimeout(()=>{const q=$('scanHint'),price=$('scanPrice');if(q)q.value=x.dataset.v300Research||'';if(price&&Number(x.dataset.v300Price)>0)price.value=x.dataset.v300Price},30)})
  }
  function decorateHunt(){const p=$('huntPage');if(!p)return;const h=p.querySelector('.page-head h1');if(h)h.textContent='Penny Hunt';const copy=p.querySelector('.page-head p');if(copy)copy.textContent='Penny, near-penny and markdown evidence. Community/crawler sources tell you what is worth checking; physical UPC/register scan remains final local penny truth.';if(state.page==='hunt'&&$('topSubtitle'))$('topSubtitle').textContent='Penny Hunt'}

  const renderDiscoverBase=renderDiscover;renderDiscover=function(){renderDiscoverBase();decorateDiscover()};
  const renderHuntBase=renderHunt;renderHunt=function(){renderHuntBase();decorateHunt()};
  const renderHuntListBase=renderHuntListOnly;renderHuntListOnly=function(){renderHuntListBase();decorateHunt()};
  const runDiscoverBase=runDiscover;runDiscover=async function(){if(state.discover.running)return;const publicPass=startFacebook(false);const basePass=runDiscoverBase();await Promise.allSettled([publicPass,basePass]);renderDiscover()};

  setInterval(()=>{if(state.page!=='discover')return;const started=num(state.v300.facebookStartedAt);if(state.facebookPassPending&&started&&Date.now()-started>=FB_TIMEOUT_MS){state.facebookPassPending=false;state.facebookRanking=false;state.v300.facebookStatus='ERROR';renderDiscover()}},4000);
  const restore=cachedHunt();if(!state.hunt.rows.length&&restore.length){state.hunt.rows=restore;state.hunt.loaded=true;state.hunt.sourceHealth={status:'STALE_EVIDENCE',actionable:restore.length,usedCachedEvidence:true,adapterVersion:'v301-provider-isolated'}}
  if(state.user){if(state.page==='discover')renderDiscover();if(state.page==='hunt')renderHunt()}
})();