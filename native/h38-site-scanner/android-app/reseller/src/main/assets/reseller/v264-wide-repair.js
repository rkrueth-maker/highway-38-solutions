'use strict';
window.H38_SCOUT_V264_WIDE_REPAIR=true;
(function installV264WideRepair(){
  if(window.H38_SCOUT_V264_WIDE_REPAIR_INSTALLED===true)return;
  window.H38_SCOUT_V264_WIDE_REPAIR_INSTALLED=true;
  state.v264=state.v264||{facebookLoading:false,lastFacebookAt:0,lastFacebookStatus:'NOT_RUN'};

  // Public Facebook is the only accepted Facebook acquisition authority. Old native
  // browser/notification rows may still exist on a phone from prior builds, but they
  // must not leak into Discover after the UI promises no Facebook login.
  const snapshotBeforeV264=facebookSnapshot;
  facebookSnapshot=function(){
    const base=snapshotBeforeV264(),rows=(state.v240?.facebookRows||[]).filter(r=>r&&r.location_verified===true);
    return{...base,browser:[],notifications:[],rows,alerts:false,publicRows:rows.length,publicOnly:true};
  };

  function facebookTermsV264(){
    try{if(typeof facebookTerms==='function')return facebookTerms().slice(0,4)}catch{}
    try{if(typeof profitTerms==='function')return profitTerms().slice(0,4)}catch{}
    return['tools','lawn mower','electronics','appliances'];
  }
  function facebookProviderSummary(f){
    const names={facebook_guest:'FB guest',google_index:'Google',bing_index:'Bing',duckduckgo_index:'DDG',apify:'Apify'},m=new Map();
    for(const d of Array.isArray(f?.diagnostics)?f.diagnostics:[]){
      const k=txt(d?.provider||'public'),x=m.get(k)||{raw:0,verified:0,gated:false,http:new Set()};
      x.raw+=num(d?.raw_count);x.verified+=num(d?.verified_count);x.gated=x.gated||d?.gated===true;if(d?.http_status)x.http.add(String(d.http_status));m.set(k,x);
    }
    return[...m.entries()].map(([k,x])=>`${names[k]||k}: ${x.verified}/${x.raw}${x.gated?' gated':''}`).join(' · ');
  }
  function facebookStatusCopy(f,rows){
    const s=txt(f?.provider_status||f?.status||'READY');
    if(rows.length)return`${rows.length} location-proven public Marketplace listing${rows.length===1?'':'s'} ready for resale ranking.`;
    if(s==='PUBLIC_LOCATION_UNPROVEN')return'Public Marketplace item URLs were found, but their location evidence did not prove the selected Scout area. Scout held them out.';
    if(s==='PUBLIC_INDEX_EMPTY')return'Public sources answered, but no indexable Marketplace item URLs were returned. Local Facebook inventory remains unknown—not zero.';
    if(s==='PROVIDER_UNAVAILABLE')return'Public Facebook sources were unavailable in this pass. Local Facebook inventory remains unknown.';
    return'No location-proven public Facebook listings are available from this pass. Local inventory remains unknown.';
  }
  async function rankFacebookV264(rows,terms){
    if(!rows.length)return null;
    const p=await fn('reseller-opportunity-scan-v060',{sources:['Facebook Marketplace'],terms:terms.slice(0,4),facebookCandidates:rows,...locationPayload()},70000);
    state.discover.deals=mergeDealPayload([state.discover.deals||{},p],terms);
    if(window.H38V230CacheRows)void H38V230CacheRows([...(p.opportunities||[]),...(p.candidates||[])]);
    return p;
  }
  async function runFacebookPublicOnlyV264(force=true){
    if(state.v264.facebookLoading)return;
    state.v264.facebookLoading=true;renderDiscover();
    try{
      if(typeof window.H38V263ResolveLocation==='function'&&!await window.H38V263ResolveLocation()){notice('Scout could not prove the selected location before the Facebook public search.','warn');return}
      if(!requireLocation())return;
      const terms=facebookTermsV264(),p=await fn('reseller-facebook-public-v240',{...locationPayload(),location_label:txt(state.location?.label||''),terms,max_results:120,force:!!force},85000);
      state.v240=state.v240||{};state.v240.facebook=p;
      state.v240.facebookRows=(Array.isArray(p?.results)?p.results:[]).filter(r=>r&&r.location_verified===true);
      state.v264.lastFacebookAt=Date.now();state.v264.lastFacebookStatus=txt(p?.provider_status||p?.status||'PARTIAL');
      if(window.H38V230CacheRows&&state.v240.facebookRows.length)void H38V230CacheRows(state.v240.facebookRows);
      await rankFacebookV264(state.v240.facebookRows,terms);
      if(!state.v240.facebookRows.length)notice(facebookStatusCopy(p,[]),'warn');
    }catch(e){
      state.v240=state.v240||{};state.v240.facebook={status:'PARTIAL',engine:'H38_FACEBOOK_PUBLIC_V264',provider_status:'PROVIDER_UNAVAILABLE',authentication:'NO_FACEBOOK_LOGIN',results:[],warning:error('facebookPublicOnlyV264',e)};state.v240.facebookRows=[];
      state.v264.lastFacebookStatus='PROVIDER_UNAVAILABLE';notice('Public Facebook search is unavailable right now. Scout kept inventory unknown and did not open a Facebook login.','warn');
    }finally{state.v264.facebookLoading=false;renderDiscover()}
  }
  window.H38V264RunFacebookPublicOnly=runFacebookPublicOnlyV264;

  function decorateFacebookV264(){
    const b=$('facebookScan');if(!b)return;const sec=b.closest('section.card');if(!sec)return;
    sec.querySelectorAll('[data-v230-facebook-ledger],[data-v240-fb],[data-v261-facebook-status],[data-v264-facebook-status]').forEach(x=>x.remove());
    const rows=state.v240?.facebookRows||[],f=state.v240?.facebook,loading=!!state.v264.facebookLoading;
    b.textContent=loading?'Searching public Facebook…':'Search public Facebook';b.disabled=loading;b.onclick=()=>void runFacebookPublicOnlyV264(true);
    const alerts=$('facebookAlerts');if(alerts)alerts.remove();
    const head=sec.querySelector('.section-head span');if(head)head.textContent=`${rows.length} public · no Facebook login`;
    const copy=sec.querySelector('p.small');if(copy)copy.textContent='Public-only Marketplace discovery. This button checks Facebook public sources only; it does not rerun auctions, Retail Hunt, Home Depot, or Dollar General.';
    const status=document.createElement('div');status.dataset.v264FacebookStatus='true';const provider=txt(f?.provider_status||f?.status||'READY'),summary=facebookProviderSummary(f);
    status.innerHTML=`<div class="status-line" style="margin-top:10px"><span class="dot ${loading?'loading':rows.length?'live':provider==='PROVIDER_UNAVAILABLE'?'warn':''}"></span>${loading?`Searching public Facebook for ${esc(state.location?.label||state.location?.zip||'selected area')}…`:`${esc(f?.engine||'H38_FACEBOOK_PUBLIC_V264')} · ${esc(provider)} · ${rows.length} location-proven`}</div>${!loading?`<div class="small muted">${esc(facebookStatusCopy(f,rows))}</div>${summary?`<div class="small muted">${esc(summary)}</div>`:''}`:''}`;
    sec.appendChild(status);
  }

  const bestSourceBeforeV264=bestLeadSourceUrl;
  bestLeadSourceUrl=function(r){
    const direct=txt(r?.source_item_url);if(/^https?:\/\//i.test(direct))return direct;
    const signal=(Array.isArray(r?.signal_sources)?r.signal_sources:[]).map(s=>txt(s?.item_url)).find(u=>/^https?:\/\//i.test(u));
    return signal||bestSourceBeforeV264(r);
  };
  function sourceIsExact(r,url){return txt(r?.source_item_url)===txt(url)||txt(r?.source_item_scope)==='exact_product'||(Array.isArray(r?.signal_sources)&&r.signal_sources.some(s=>txt(s?.item_url)===txt(url)))}
  function decorateHuntV264(){
    const p=$('huntPage');if(!p)return;const base=huntBaseRows(),penny=base.filter(isPenny).length,near=base.filter(isNearPenny).length;
    const head=p.querySelector('.page-head p');if(head)head.textContent='Community/crawler penny, near-penny and markdown leads grouped by retailer. These are sourcing leads—not local store inventory. Physical UPC/register scan remains final penny truth.';
    const useful=p.querySelector('[data-hunt-tab="useful"]'),pb=p.querySelector('[data-hunt-tab="penny"]'),nb=p.querySelector('[data-hunt-tab="near"]');if(useful)useful.textContent=`All leads ${base.length}`;if(pb)pb.textContent=`Penny leads ${penny}`;if(nb)nb.textContent=`Near-penny leads ${near}`;
    p.querySelectorAll('.item-card[data-lead]').forEach(card=>{const r=state.hunt.rows.find(x=>itemKey(x)===card.dataset.lead),btn=card.querySelector('[data-open]');if(!r||!btn)return;btn.textContent=sourceIsExact(r,btn.dataset.open)?'Exact source':'Source list'});
  }
  const openLeadBeforeV264=openLeadDetail;
  openLeadDetail=async function(key){
    const r=state.hunt.rows.find(x=>itemKey(x)===key);const promise=openLeadBeforeV264(key);
    const decorate=()=>{const btn=$('detailCard')?.querySelector('[data-open]');if(btn&&r)btn.textContent=sourceIsExact(r,btn.dataset.open)?'Open exact source':'Open source list'};
    setTimeout(decorate,0);setTimeout(decorate,350);try{await promise}finally{decorate()}
  };

  // v064 keeps the accepted v063 lead/dedupe truth but attaches exact product routes
  // where the source actually exposes a deterministic item URL.
  loadHunt=async function(force=false){
    if(state.hunt.loading)return;state.hunt.loading=true;renderHunt();
    try{
      const p=await fn('reseller-auto-leads-v064',{...locationPayload(),force:!!force},75000),rows=cleanRows(p.leads||[]).filter(r=>!huntArtifact(r));
      state.hunt.raw=Number(p.raw_count)||(Array.isArray(p.leads)?p.leads.length:0);state.hunt.rows=rows;state.hunt.loaded=true;
      state.hunt.sourceHealth={status:p.status||'PASS',warnings:p.warnings||[],raw:state.hunt.raw,actionable:rows.length,duplicatesMerged:Number(p.duplicate_count||0),sourceStatus:p.source_status||[],canonicalIdentity:p.canonical_identity_version||'',exactSources:Number(p.exact_source_count||0),adapterVersion:p.adapter_version||''};
      renderHunt();if(hasPoint()||state.location.zip)void ensureNearbyStores().then(()=>renderHuntListOnly());void hydrateHuntImages();
    }catch(e){notice(`Retail Hunt unavailable: ${error('huntV264',e)}`,'bad');renderHunt()}
    finally{state.hunt.loading=false;renderHunt()}
  };

  const renderDiscoverBeforeV264=renderDiscover;
  renderDiscover=function(){renderDiscoverBeforeV264();decorateFacebookV264()};
  const renderHuntBeforeV264=renderHunt;
  renderHunt=function(){renderHuntBeforeV264();decorateHuntV264()};
  const renderHuntListBeforeV264=renderHuntListOnly;
  renderHuntListOnly=function(){renderHuntListBeforeV264();decorateHuntV264()};

  // Re-render once so an already-restored session immediately reflects the v264 authority.
  if(state.user){if(state.page==='discover')renderDiscover();if(state.page==='hunt')renderHunt()}
})();
