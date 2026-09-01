'use strict';
// v3.0.16 wide phone-quality firewall. This is intentionally the last bundled Scout patch.
window.H38_SCOUT_V316_GARAGE_SAFE_ACTION=true;
window.H38_SCOUT_V316_DISCOVER_QUERY_GUARD=true;
window.H38_SCOUT_V316_WIDE_QUALITY=true;
(function installV316WideQuality(){
  if(window.H38_SCOUT_V316_WIDE_QUALITY_INSTALLED)return;
  window.H38_SCOUT_V316_WIDE_QUALITY_INSTALLED=true;
  const text=v=>String(v??'').trim();
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const staleQuery=/^(?:dollar general\s+inventory checker|inventory checker)$/i;
  const BAD_MARKUP=/\b(?:href|src|target|rel|style|class|role|tabindex|aria-[\w-]+|data-[\w-]+)\s*=|<\/?\s*[a-z]|\b(?:noopener|noreferrer|_blank)\b|https?:\/\/|\bwww\./i;
  const BAD_GENERIC=/^(?:dollar general(?: inventory checker)?|inventory checker|search|clearance|penny|item|product|unknown|indicator)$/i;
  const IMAGE_SAMPLE=24,IMAGE_BATCH=8,IMAGE_MAX_PER_PASS=24;
  state.v316=state.v316||{dgInvalidRemoved:0,dgRecovering:false,dgRecoveryTried:0,dgRecoveryDelivered:0,dgLastRecoveryAt:0,returnRestored:false};

  const style=document.createElement('style');
  style.id='h38-v316-wide-quality';
  style.textContent=`
    #discoverPage [data-v308-garage]{scroll-margin-bottom:calc(104px + var(--safe-bottom,12px))}
    #discoverPage [data-v308-garage] .garage-primary-action{position:sticky;bottom:calc(72px + var(--safe-bottom,12px));z-index:34;margin:6px 0 8px;padding:5px 0;background:rgba(255,255,255,.97);border-radius:12px;box-shadow:0 -4px 14px rgba(20,42,58,.06)}
    #discoverPage [data-v308-garage] .garage-primary-action .mini-btn{min-height:46px}
    #discoverPage [data-v308-garage][data-v316-empty='true'] .garage-summary{display:none}
    #discoverPage [data-v308-garage][data-v316-empty='true'] p.small{margin-bottom:4px}
    .h38-v316-quality{margin:8px 0;padding:8px 10px;border:1px solid rgba(23,48,66,.10);border-radius:10px;background:rgba(246,248,249,.92);font-size:12px;line-height:1.4}
    .h38-v316-quality strong{letter-spacing:.02em}
  `;
  document.head.appendChild(style);

  function decode(v){return String(v??'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#0*39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{try{return String.fromCodePoint(/^x/i.test(n)?parseInt(n.slice(1),16):Number(n))}catch{return' '}})}
  function barcode(v){return text(v).replace(/\D/g,'').replace(/^0+(?=\d)/,'')}
  function barcodeTokens(v){return [...new Set(String(v??'').match(/\b\d{11,14}\b/g)||[])]}
  function cleanIdentity(v,expected=''){
    let s=decode(v)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
      .replace(/\b(?:href|src|target|rel|style|class|id|title|role|tabindex|aria-[\w-]+|data-[\w-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,' ')
      .replace(/\b(?:color|background(?:-color)?|font(?:-size|-weight|-family)?|text-decoration|display|margin|padding|width|height)\s*:\s*[^;<>]{0,100};?/gi,' ')
      .replace(/<\/?\s*[a-z][^>\n]{0,240}>?/gi,' ')
      .replace(/https?:\/\/\S+/gi,' ')
      .replace(/\b(?:www\.)?[a-z0-9.-]+\.(?:com|org|net|io|co)\b\S*/gi,' ')
      .replace(/\b(?:_blank|noopener|noreferrer)\b/gi,' ')
      .replace(/[<>]+/g,' ')
      .replace(/\s+/g,' ').trim();
    const want=barcode(expected),tokens=barcodeTokens(s),conflict=tokens.some(x=>want&&barcode(x)!==want);
    if(conflict||(!want&&tokens.length>1))return'';
    for(const x of tokens)s=s.replace(new RegExp(`\\b${x}\\b`,'g'),' ');
    s=s.replace(/\b(?:UPC|GTIN|barcode|SKU)\b\s*[:#-]?\s*/gi,' ').replace(/\s+/g,' ').replace(/^[\s"'=;:,|/\\-]+|[\s"'=;:,|/\\-]+$/g,'').trim();
    if(!s||s.length<4||BAD_MARKUP.test(s)||BAD_GENERIC.test(s))return'';
    return s.slice(0,140);
  }
  function isDg(r){return /dollar\s+general/i.test(text(r?.retailer||r?.source_retailer||r?.store))}
  function rowBarcode(r){return text(r?.upc||r?.gtin||r?.barcode||r?.sku_barcode)}
  function bestDgIdentity(r){const code=rowBarcode(r),vals=[r?.source_identity_title,r?.product_name,r?.item_name,r?.canonical_title,r?.name,r?.raw_title,r?.title];for(const v of vals){const s=cleanIdentity(v,code);if(s&&!/^dollar general\b/i.test(s))return s}for(const source of Array.isArray(r?.signal_sources)?r.signal_sources:[]){for(const v of [source?.source_identity_title,source?.product_name,source?.item_name,source?.name,source?.title]){const s=cleanIdentity(v,code);if(s&&!/^dollar general\b/i.test(s))return s}}return''}
  function displayImage(r){try{if(typeof huntDisplayImage==='function'){const u=text(huntDisplayImage(r));if(u&&!/(?:placeholder|blank|spacer|logo|favicon|sprite|pixel)/i.test(u))return u}}catch{}for(const x of [r?.image_data_url,r?.image_url,r?.image,r?.thumbnail_url,r?.thumbnail,r?.product_image_url,r?.primary_image_url,r?.source_image_url,r?.photo_url,r?.image_front_url]){const u=text(x);if(/^(?:https:\/\/|data:image\/)/i.test(u)&&!/(?:placeholder|blank|spacer|logo|favicon|sprite|pixel)/i.test(u))return u}return''}
  function rowKey(r){try{if(typeof itemKey==='function')return text(itemKey(r))}catch{}return text(r?.id||`${r?.retailer||''}|${rowBarcode(r)}|${r?.title||''}`)}

  function cleanseHuntRows(){
    if(!state.hunt||!Array.isArray(state.hunt.rows))return;
    let removed=0;
    const cleaned=[];
    for(const r of state.hunt.rows){
      if(!isDg(r)){cleaned.push(r);continue}
      const title=bestDgIdentity(r);
      if(!title){removed++;continue}
      cleaned.push({...r,title,canonical_title:title,h38_identity_clean:true,h38_wide_identity_clean:true});
    }
    state.hunt.rows=cleaned;
    state.v316.dgInvalidRemoved+=removed;
  }
  function cleanseRetailIntel(){
    const dg=state.v240?.dg;if(!dg)return;
    if(Array.isArray(dg.indicators))dg.indicators=dg.indicators.map(x=>{const upc=text(x?.upc),name=cleanIdentity(x?.name,upc);return name?{...x,name,identity_status:'SANITIZED'}:null}).filter(Boolean);
    if(Array.isArray(dg.stores))dg.stores=dg.stores.map(s=>({...s,probes:Array.isArray(s?.probes)?s.probes.map(p=>{const upc=text(p?.upc||p?.live_barcode||p?.source_barcode),name=cleanIdentity(p?.name||p?.live_name||p?.source_name,upc);const live=barcode(p?.live_barcode||p?.upc),source=barcode(p?.source_barcode||p?.upc);if(live&&source&&live!==source)return null;return name?{...p,name,identity_status:p?.identity_status==='MISMATCH'?'MISMATCH':text(p?.identity_status||'SANITIZED')}:null}).filter(Boolean):[]}));
  }
  function dgSample(){cleanseHuntRows();const rows=(state.hunt?.rows||[]).filter(isDg).slice(0,IMAGE_SAMPLE),images=rows.filter(r=>!!displayImage(r)).length,coverage=rows.length?Math.round(images*100/rows.length):0;return{rows,images,coverage}}

  function wideStatusNode(host,key){if(!host)return null;let n=host.querySelector(`[data-v316-${key}]`);if(!n){n=document.createElement('div');n.className='h38-v316-quality';n.dataset[`v316${key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())}`]='true';host.prepend(n)}return n}
  function decorateDgWide(){
    const p=document.getElementById('huntPage');if(!p)return;
    const {rows,images,coverage}=dgSample(),n=wideStatusNode(p,'dg-wide-quality');if(!n)return;
    const phase=state.v316.dgRecovering?'RECOVERING':'SETTLED',status=`DG WIDE QUALITY · ${rows.length} sampled · ${images} images · ${coverage}% coverage · ${num(state.v316.dgInvalidRemoved)} invalid removed · ${phase}`;
    n.innerHTML=`<strong>DG WIDE QUALITY</strong> · ${rows.length} sampled · ${images} images · ${coverage}% coverage · ${num(state.v316.dgInvalidRemoved)} invalid removed · ${phase}`;
    n.setAttribute('role','status');n.setAttribute('tabindex','0');n.setAttribute('aria-label',status);n.setAttribute('data-v316-coverage',String(coverage));n.setAttribute('data-v316-settled',state.v316.dgRecovering?'false':'true');
  }
  function verifiedDeals(){const d=state.discover?.deals||{},rows=[...(Array.isArray(d?.opportunities)?d.opportunities:[]),...(Array.isArray(state.v240?.facebook?.opportunities)?state.v240.facebook.opportunities:[])],seen=new Set(),out=[];for(const r of rows){const k=text(r?.url||r?.id||r?.title);if(!k||seen.has(k))continue;seen.add(k);if(r?.profit_verified===true&&text(r?.stage)==='verified_deal'&&num(r?.net_profit)>=25&&num(r?.roi_pct)>=30)out.push(r)}return out}
  function facebookLeadCount(){const rows=[...(Array.isArray(state.v300?.facebookPublicCandidates)?state.v300.facebookPublicCandidates:[]),...(Array.isArray(state.v240?.facebookRows)?state.v240.facebookRows:[])],seen=new Set();for(const r of rows){const k=text(r?.url||r?.id||`${r?.title||''}|${r?.price||''}`);if(k)seen.add(k)}return seen.size}
  function decorateFacebookWide(){
    const sec=document.querySelector('#discoverPage [data-v300-facebook]');if(!sec)return;
    let n=sec.querySelector('[data-v316-facebook-profit-quality]');if(!n){n=document.createElement('div');n.className='h38-v316-quality';n.dataset.v316FacebookProfitQuality='true';const actions=sec.querySelector('.card-actions');if(actions)actions.insertAdjacentElement('beforebegin',n);else sec.appendChild(n)}
    const verified=verifiedDeals(),leads=Math.max(facebookLeadCount(),num(state.v314?.facebookCandidates)),label=verified.length?`FACEBOOK PROFIT QUALITY · ${verified.length} verified deal${verified.length===1?'':'s'} · ${leads} captured leads · verified means sold comps, cost, location, net profit and ROI passed`:`FACEBOOK PROFIT QUALITY · 0 verified profit · ${leads} leads only · candidates are NOT buy-rated until sold comps, cost, location, net profit and ROI pass`;
    n.textContent=label;n.setAttribute('role','status');n.setAttribute('tabindex','0');n.setAttribute('aria-label',label);n.setAttribute('data-v316-verified-deals',String(verified.length));n.setAttribute('data-v316-leads',String(leads));
  }
  function protectGarage(){const sec=document.querySelector('#discoverPage [data-v308-garage]');if(!sec)return;const action=sec.querySelector('.garage-primary-action'),button=sec.querySelector('[data-v308-refresh]'),rows=Array.isArray(state.v308?.garageRows)?state.v308.garageRows:[];sec.dataset.v316Empty=!state.v308?.garageLoading&&!rows.length?'true':'false';if(action)action.setAttribute('data-v316-safe-action','true');if(button){button.setAttribute('aria-label','Find garage sales');button.setAttribute('title','Find garage sales');button.style.touchAction='manipulation'}}

  async function recoverDgImages(force=false){
    if(state.v316.dgRecovering)return;
    const now=Date.now();if(!force&&now-num(state.v316.dgLastRecoveryAt)<5*60*1000)return;
    const sample=dgSample();if(!sample.rows.length||sample.coverage>=60)return;
    const missing=sample.rows.filter(r=>!displayImage(r)&&barcode(rowBarcode(r)).length>=6).slice(0,IMAGE_MAX_PER_PASS);if(!missing.length)return;
    state.v316.dgRecovering=true;state.v316.dgLastRecoveryAt=now;state.v316.dgRecoveryTried+=missing.length;decorateDgWide();
    try{
      for(let i=0;i<missing.length;i+=IMAGE_BATCH){
        const batch=missing.slice(i,i+IMAGE_BATCH).map(r=>({key:rowKey(r),retailer:r.retailer,barcode:rowBarcode(r),proof:r.image_match_barcode||'',image_url:r.image_url||'',reference_url:r.image_reference_url||r.source_url||''}));
        let p=null;try{p=await fn('reseller-image-delivery-v201',{items:batch},45000)}catch(e){try{error('v316DgImageRecovery',e)}catch{}continue}
        const map=new Map((p?.images||[]).map(x=>[text(x?.key),x]));let delivered=0;
        state.hunt.rows=(state.hunt.rows||[]).map(r=>{const x=map.get(rowKey(r));if(x?.data_url){delivered++;return{...r,image_data_url:x.data_url,image_delivery_source:x.image_source||'exact UPC image'}}return r});
        state.v316.dgRecoveryDelivered+=delivered;decorateDgWide();
      }
    }finally{state.v316.dgRecovering=false;decorateDgWide();if(state.page==='hunt'&&typeof renderHunt==='function')setTimeout(()=>renderHunt(),0)}
  }
  window.H38V316RecoverDgImages=recoverDgImages;

  function saveLiveDiscoverQuery(allowBlank=false){if(state.page!=='discover')return;const input=document.getElementById('discoverSearch');if(!input)return;const live=text(input.value),stored=text(state.discover?.query||'');if(live===stored)return;if(!live&&!allowBlank&&!staleQuery.test(stored))return;state.discover=state.discover||{};state.discover.query=live;if(state.v315){state.v315.discoverQuery=live;state.v315.queryPinned=true}try{if(typeof write==='function'&&window.H38_KEYS?.discover)write(H38_KEYS.discover,live)}catch{}}

  const RETURN_KEY='h38-scout-v316-return';
  function snapshotReturn(url=''){try{const snap={page:text(state.page||'discover'),query:text(state.discover?.query||''),scrollY:Math.max(0,Math.round(window.scrollY||document.documentElement.scrollTop||0)),url:text(url),at:Date.now()};sessionStorage.setItem(RETURN_KEY,JSON.stringify(snap));return snap}catch{return null}}
  function restoreReturn(){let snap=null;try{snap=JSON.parse(sessionStorage.getItem(RETURN_KEY)||'null')}catch{}if(!snap||Date.now()-num(snap.at)>30*60*1000)return false;try{sessionStorage.removeItem(RETURN_KEY)}catch{};if(snap.page&&typeof setPage==='function'&&text(state.page)!==snap.page)setPage(snap.page);if(snap.page==='discover'){state.discover=state.discover||{};state.discover.query=text(snap.query);try{if(typeof write==='function'&&window.H38_KEYS?.discover)write(H38_KEYS.discover,state.discover.query)}catch{};if(typeof renderDiscover==='function')renderDiscover()}else if(snap.page==='hunt'&&typeof renderHunt==='function')renderHunt();setTimeout(()=>window.scrollTo(0,num(snap.scrollY)),120);state.v316.returnRestored=true;return true}
  const priorOpenExternal=window.openExternal;
  if(typeof priorOpenExternal==='function')window.openExternal=function(url){snapshotReturn(url);return priorOpenExternal.apply(this,arguments)};
  const priorReturned=window.H38ScoutReturned;
  window.H38ScoutReturned=function(){let out;try{if(typeof priorReturned==='function')out=priorReturned.apply(this,arguments)}finally{setTimeout(()=>{restoreReturn();protectAll()},80)}return out};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(()=>{restoreReturn();protectAll()},80)});

  function protectAll(){cleanseRetailIntel();cleanseHuntRows();saveLiveDiscoverQuery(false);protectGarage();decorateFacebookWide();decorateDgWide()}
  const priorRenderDiscover=window.renderDiscover;if(typeof priorRenderDiscover==='function')window.renderDiscover=function(){saveLiveDiscoverQuery(false);cleanseRetailIntel();const out=priorRenderDiscover.apply(this,arguments);saveLiveDiscoverQuery(false);protectGarage();decorateFacebookWide();return out};
  const priorRenderHunt=window.renderHunt;if(typeof priorRenderHunt==='function')window.renderHunt=function(){cleanseRetailIntel();cleanseHuntRows();const out=priorRenderHunt.apply(this,arguments);decorateDgWide();return out};
  const priorLoadHunt=window.loadHunt;if(typeof priorLoadHunt==='function')window.loadHunt=async function(){const out=await priorLoadHunt.apply(this,arguments);cleanseHuntRows();if(state.page==='hunt')decorateDgWide();void recoverDgImages(false);return out};

  const observer=new MutationObserver(()=>{protectGarage();decorateFacebookWide();if(state.page==='hunt')decorateDgWide()});observer.observe(document.body,{subtree:true,childList:true});
  for(const type of ['beforeinput','input','change','focusin'])document.addEventListener(type,e=>{if(e.target?.id==='discoverSearch')saveLiveDiscoverQuery(true)},true);
  document.addEventListener('click',e=>{if(e.target?.id==='discoverGo'||e.target?.closest?.('#discoverGo'))saveLiveDiscoverQuery(true)},true);
  document.addEventListener('scroll',protectGarage,{passive:true});
  setInterval(()=>saveLiveDiscoverQuery(false),125);
  setTimeout(()=>{protectAll();void recoverDgImages(false)},700);
})();
