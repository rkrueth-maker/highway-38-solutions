from pathlib import Path

root = Path(__file__).resolve().parent
assets = root / 'src/main/assets/reseller'
data = assets / 'v240-data.js'
gradle = root / 'build.gradle'

s = data.read_text()
if 'H38_SCOUT_V329_POST_LOGIN_SOURCE_AUTHORITY=true' in s:
    raise SystemExit('v3.0.29 authority already present')
if 'H38_SCOUT_V328_SOURCE_QUALITY=true' not in s:
    raise SystemExit('expected v3.0.28 source authority missing')

patch = r'''

// v3.0.29 restoration: reinstate the post-login sourcing authority that was lost in recovery.
// IMPORTANT: v200-app.js and MainActivity.java remain byte-identical to the physical-PASS login baseline.
window.H38_SCOUT_V329_POST_LOGIN_SOURCE_AUTHORITY=true;
(function H38InstallV329PostLoginSources(){
  function install(){
    if(window.H38_SCOUT_V329_INSTALLED)return;
    if(!window.H38_SCOUT_V263_PHYSICAL_BUNDLE_AUTHORITY||typeof renderDiscover!=='function'||typeof renderHunt!=='function'||typeof facebookSnapshot!=='function'){setTimeout(install,250);return;}
    window.H38_SCOUT_V329_INSTALLED=true;
    state.v329=state.v329||{facebook:[],nativeFacebook:0,publicFacebook:0,facebookRanked:0,dgNamed:0,dgExactImages:0,dgImageMisses:0,dgRemoved:0,huntProvider:'NOT_RUN',syncingFacebook:false,hydratingDg:false};
    const FB_TERMS=['power tools','Milwaukee tools','DeWalt tools','Snap-on tools','generator','air compressor','welder','shop equipment','lawn mower','snowblower','chainsaw','pressure washer','refrigerator','freezer','washer dryer','gaming console'];
    const authRe=/(?:session expired|jwt(?: token)? expired|invalid jwt|sign in again|not authenticated|unauthorized|http\s*401|\b401\b)/i;
    const code=v=>digits(v).replace(/^0+/,'');
    const isDG=r=>retailerKey(r?.retailer)==='dollar general';
    function unique(rows){const m=new Map();for(const r of rows||[]){if(!r)continue;const k=txt(r.marketplace_listing_id||r.listing_id||r.id||r.url||r.source_url||`${r.title||''}|${r.price||''}|${r.location_label||''}`);if(k&&!m.has(k))m.set(k,r)}return[...m.values()]}
    function badName(v){const s=txt(v).replace(/\s+/g,' ').trim(),n=norm(s);return !s||s.length<4||/^(?:dollar general(?: inventory checker)?|inventory checker|search|clearance|penny|item|product|unknown|n\/a|permalink|read more|view product)$/i.test(s)||/^(?:1\s*(?:¢|cent|cents?)|one cent)$/i.test(s)||/^first seen at (?:a )?penny/i.test(s)||/^penny date unknown$/i.test(s)||/href\s*=|<\/?[a-z][^>]*>|https?:\/\/www\.dollargeneral\.com\/p\//i.test(s)||/^(?:today|yesterday|\d+\s+(?:minutes?|hours?|days?|weeks?)\s+ago)$/i.test(s)||/^(?:first seen|seen)\s+at\s+(?:a\s+)?penny/.test(n)}
    function bestName(r){for(const x of [r?.source_identity_title,r?.product_name,r?.item_name,r?.name,r?.canonical_title,r?.title,r?.raw_title,...((r?.signal_sources||[]).flatMap(x=>[x?.source_identity_title,x?.product_name,x?.item_name,x?.title,x?.name]))]){const v=txt(x).replace(/\s+/g,' ').trim();if(v&&!badName(v)&&!/^dollar general\b/i.test(v))return v}return''}
    function exactImageProof(r){const item=itemCode(r),proof=code(r?.image_match_barcode||r?.image_proof_barcode||r?.image_barcode);if(item&&proof&&item===proof)return true;return /exact[_ -]?barcode|exact[_ -]?upc/i.test(txt(r?.image_source_proof||r?.image_delivery_source))&&!!item}
    function cleanDgRow(raw){if(!isDG(raw))return raw;const r={...raw},name=bestName(r);if(!name)return null;r.title=name;r.canonical_title=name;r.h38_identity_clean=true;const exact=exactImageProof(r);if(!exact){r.image_data_url='';r.image_url='';r.image='';r.thumbnail='';r.thumbnail_url='';r.product_image_url='';r.primary_image_url='';r.source_image_url='';r.photo_url='';r.h38_unproven_image_removed=true}else r.h38_exact_image=true;return r}
    function cleanDgRows(rows){let removed=0,named=0,exact=0;const out=[];for(const raw of rows||[]){if(!isDG(raw)){out.push(raw);continue}const r=cleanDgRow(raw);if(!r){removed++;continue}named++;if(exactImageProof(r)&&txt(r.image_data_url))exact++;out.push(r)}state.v329.dgRemoved=removed;state.v329.dgNamed=named;state.v329.dgExactImages=exact;return out}
    async function session(){let {data,error}=await h38sb.auth.getSession();if(error)throw error;let x=data?.session;if(x?.access_token&&(!x.expires_at||x.expires_at*1000>Date.now()+90000))return x;const r=await h38sb.auth.refreshSession();if(r.error||!r.data?.session?.access_token)throw(r.error||Error('Session refresh failed'));return r.data.session}
    async function call(name,body={},timeout=80000,retry=true){const x=await session(),c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(`${H38_BASE}/functions/v1/${name}`,{method:'POST',headers:{Authorization:`Bearer ${x.access_token}`,apikey:H38_KEY,'Content-Type':'application/json'},body:JSON.stringify(body||{}),signal:c.signal}),p=await r.json().catch(()=>({}));if(!r.ok){const e=Error(p.error||p.message||`${name} HTTP ${r.status}`);if(retry&&(r.status===401||authRe.test(e.message))){await h38sb.auth.refreshSession();return call(name,body,timeout,false)}throw e}return p}finally{clearTimeout(timer)}}
    function updateDgQuality(){const rows=(state.hunt.rows||[]).filter(isDG);state.v329.dgNamed=rows.length;state.v329.dgExactImages=rows.filter(r=>!!txt(r.image_data_url)&&exactImageProof(r)).length;state.v329.dgImageMisses=rows.length-state.v329.dgExactImages}
    async function hydrateDgExact(){if(state.v329.hydratingDg)return;state.v329.hydratingDg=true;try{let rows=(state.hunt.rows||[]).filter(r=>isDG(r)&&!txt(r.image_data_url)&&itemCode(r)).slice(0,72);for(let i=0;i<rows.length;i+=8){const batch=rows.slice(i,i+8).map(r=>({key:itemKey(r),retailer:r.retailer,barcode:r.upc||r.gtin||r.barcode||'',proof:'',image_url:'',reference_url:r.source_item_url||r.image_reference_url||bestLeadSourceUrl(r)||''}));let p;try{p=await call('reseller-image-delivery-v201',{items:batch},45000)}catch(e){error('v329DgExactImages',e);continue}const map=new Map((p?.images||[]).map(x=>[txt(x.key),x]));let changed=false;state.hunt.rows=(state.hunt.rows||[]).map(r=>{if(!isDG(r))return r;const x=map.get(itemKey(r));if(!x?.data_url)return r;changed=true;return{...r,image_data_url:x.data_url,image_url:'',image_match_barcode:itemCode(r),image_source_proof:'exact_barcode_v201',image_delivery_source:x.image_source||x.source_url||'exact barcode image',h38_exact_image:true}});updateDgQuality();if(changed&&state.page==='hunt')renderHunt()}updateDgQuality()}finally{state.v329.hydratingDg=false;if(state.page==='hunt')renderHunt()}}
    async function loadHuntV329(force=false){if(state.hunt.loading)return;state.hunt.loading=true;const prior=(state.hunt.rows||[]).slice();try{if(typeof window.H38V263BootstrapStores==='function')await window.H38V263BootstrapStores(force);let p=null,last=null;for(const provider of ['reseller-auto-leads-v065','reseller-auto-leads-v064','reseller-auto-leads-v063']){try{p=await call(provider,{...locationPayload(),force:!!force},provider.endsWith('v065')?105000:90000);state.v329.huntProvider=provider;break}catch(e){last=e;error(`v329-${provider}`,e)}}if(!p)throw(last||Error('Retail Hunt sources unavailable'));let rows=cleanRows(p.leads||[]).filter(r=>!huntArtifact(r));rows=cleanDgRows(rows);if(!rows.length&&prior.length)rows=cleanDgRows(prior).filter(Boolean);state.hunt.raw=Number(p.raw_count)||(Array.isArray(p.leads)?p.leads.length:0);state.hunt.rows=rows;state.hunt.loaded=true;state.hunt.sourceHealth={status:rows.length?'PASS':'PARTIAL',actionable:rows.length,provider:state.v329.huntProvider,adapterVersion:txt(p.adapter_version||''),dgImageCount:Number(p.dg_image_count||0),dgDirectImagesRecovered:Number(p.dg_direct_product_images_recovered||0),dgDirectTitlesRecovered:Number(p.dg_direct_product_titles_recovered||0),warnings:p.dg_source_warnings||p.warnings||[]};updateDgQuality();renderHunt();if(hasPoint()||state.location.zip)void ensureNearbyStores().then(()=>renderHuntListOnly());void hydrateDgExact()}catch(e){if(prior.length){state.hunt.rows=cleanDgRows(prior).filter(Boolean);state.hunt.loaded=true;notice('Retail Hunt refresh failed; keeping the last proven rows.','warn')}else notice(`Retail Hunt unavailable: ${error('huntV329',e)}`,'bad')}finally{state.hunt.loading=false;renderHunt()}}
    function nativeFacebookRows(){try{const s=facebookSnapshot()||{};return unique([...(s.browser||[]),...(s.captured||[]),...(s.rows||[])]).filter(r=>r?.location_verified===true||r?.distance_verified===true||r?.card_location_verified===true)}catch{return[]}}
    function publicFacebookRows(){return unique([...(state.v327?.fb||[]),...(state.v240?.facebookRows||[])]).filter(r=>r?.public_only===true||txt(r?.provider_status)||txt(r?.provider)||txt(r?.source).toLowerCase().includes('facebook'))}
    function syncFacebookRows(){const native=nativeFacebookRows(),pub=publicFacebookRows(),all=unique([...native,...pub]);state.v329.nativeFacebook=native.length;state.v329.publicFacebook=pub.length;state.v329.facebook=all;state.v327=state.v327||{};state.v327.fb=all;state.v240=state.v240||{};state.v240.facebookRows=all;return all}
    async function rankFacebook(){if(state.v329.syncingFacebook)return;const rows=syncFacebookRows();if(!rows.length)return;state.v329.syncingFacebook=true;try{const p=await call('reseller-opportunity-scan-v060',{sources:['Facebook Marketplace'],terms:FB_TERMS.slice(0,12),facebookCandidates:rows,...locationPayload()},80000);state.v329.facebookRanked=(p?.opportunities||[]).length+(p?.candidates||[]).length;state.discover.deals=typeof mergeDealPayload==='function'?mergeDealPayload([state.discover.deals||{},p],FB_TERMS):p}catch(e){error('v329FacebookRank',e)}finally{state.v329.syncingFacebook=false;if(state.page==='discover')renderDiscover()}}
    function restoreFacebookControl(){const b=$('facebookScan');if(!b)return;const sec=b.closest('section.card');b.disabled=false;b.textContent='Run Facebook Marketplace scan';b.onclick=()=>{try{openFacebookScan()}catch(e){error('v329OpenFacebook',e);notice('Facebook Marketplace browser could not open.','bad')}};if(sec){const p=sec.querySelector('p.small');if(p)p.textContent='Primary: the signed-in Marketplace browser on this phone captures verified local listing cards. Public Facebook search is supplemental only.';const head=sec.querySelector('.section-head span');if(head)head.textContent=`${state.v329.nativeFacebook} device · ${state.v329.publicFacebook} public`;let x=sec.querySelector('[data-v329-facebook-authority]');if(!x){x=document.createElement('div');x.dataset.v329FacebookAuthority='true';x.className='status-line';sec.appendChild(x)}x.innerHTML=`<span class="dot ${state.v329.nativeFacebook?'live':state.v329.publicFacebook?'warn':''}"></span><strong>FACEBOOK SOURCING</strong> · ${state.v329.nativeFacebook} verified from phone browser · ${state.v329.publicFacebook} public fallback · ${state.v329.facebookRanked} ranked`}}
    function decorateDg(){const p=$('huntPage');if(!p)return;let n=p.querySelector('[data-v329-dg]');if(!n){n=document.createElement('div');n.dataset.v329Dg='true';n.className='status-line';p.prepend(n)}n.innerHTML=`<span class="dot ${state.v329.dgExactImages?'live':state.v329.hydratingDg?'loading':'warn'}"></span><strong>DG IDENTITY</strong> · ${state.v329.dgNamed} named · ${state.v329.dgExactImages} exact barcode photos · ${state.v329.dgImageMisses} intentionally photo-less · ${state.v329.dgRemoved} junk removed · ${esc(state.v329.huntProvider)}`}
    const priorRenderDiscover=renderDiscover;renderDiscover=function(){syncFacebookRows();priorRenderDiscover();syncFacebookRows();restoreFacebookControl()};
    const priorRenderHunt=renderHunt;renderHunt=function(){state.hunt.rows=cleanDgRows(state.hunt.rows||[]).filter(Boolean);updateDgQuality();priorRenderHunt();decorateDg()};
    loadHunt=loadHuntV329;
    const priorSetPage=setPage;setPage=function(page){const out=priorSetPage.apply(this,arguments);if(page==='hunt'&&!state.hunt.loaded&&!state.hunt.loading)setTimeout(()=>{if(state.page==='hunt'&&!state.hunt.loaded&&!state.hunt.loading)void loadHuntV329(false)},80);return out};
    function returned(){const before=state.v329.nativeFacebook;syncFacebookRows();if(state.v329.nativeFacebook>before||state.v329.nativeFacebook>0)void rankFacebook();if(state.page==='discover')renderDiscover()}
    window.addEventListener('focus',()=>setTimeout(returned,700));document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(returned,700)});
    setTimeout(()=>{syncFacebookRows();if(state.page==='discover')renderDiscover();if(state.page==='hunt'){if(!state.hunt.loaded&&!state.hunt.loading)void loadHuntV329(false);else{renderHunt();void hydrateDgExact()}}},350);
  }
  setTimeout(install,1450);
})();
'''

data.write_text(s + patch)

g = gradle.read_text()
if "versionCode 328" not in g or "versionName '3.0.28'" not in g:
    raise SystemExit('expected v3.0.28 version missing')
g = g.replace('versionCode 328', 'versionCode 329', 1).replace("versionName '3.0.28'", "versionName '3.0.29'", 1)
gradle.write_text(g)

print('V329_RESTORE_WORKING_SOURCES_APPLIED')
