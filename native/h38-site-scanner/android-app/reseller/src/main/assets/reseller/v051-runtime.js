'use strict';
window.H38_V051_RUNTIME_ACTIVE=true;
window.H38_V051_RUNTIME_MARKER='artifact-filter-progressive-dg-photo-cache-v051-v054-junk-title-fix';
window.H38_V054_ARTIFACT_FIX_ACTIVE=true;
(function(){
  const CACHE_KEY='h38.resellerScout.dgImageCache.v051';
  const text=v=>String(v??'').trim();
  const code=row=>{if(!text(row?.retailer).toLowerCase().includes('dollar general'))return'';const x=text(row?.upc||row?.sku).replace(/\D/g,'');return x.length>=7?x:''};
  const loadCache=()=>{try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch(e){return{}}};
  const saveCache=c=>{try{localStorage.setItem(CACHE_KEY,JSON.stringify(Object.fromEntries(Object.entries(c||{}).slice(-300))))}catch(e){}};
  const knownIds=()=>Object.keys(loadCache()).slice(0,300);
  function applyCache(rows){const c=loadCache();return(Array.isArray(rows)?rows:[]).map(r=>{const k=code(r),h=k?c[k]:null;if(!h||r?.image_url||!h.url)return r;return{...r,image_url:h.url,image_source:h.source||'Cached verified image',image_reference_url:h.reference_url||''}})}
  function remember(rows,checked){const c=loadCache();let changed=false;for(const r of Array.isArray(rows)?rows:[]){const k=code(r),u=text(r?.image_url);if(!k||!/^https?:\/\//i.test(u))continue;const n={url:u,source:text(r?.image_source||'Source image'),reference_url:text(r?.image_reference_url||'')};if(JSON.stringify(c[k]||{})!==JSON.stringify(n)){c[k]=n;changed=true}}for(const raw of Array.isArray(checked)?checked:[]){const k=text(raw).replace(/\D/g,'');if(k.length>=7&&!c[k]){c[k]={miss:true,url:'',source:'Open Facts checked',reference_url:''};changed=true}}if(changed)saveCache(c)}
  function artifact(row){
    const t=text(row?.canonical_title||row?.raw_title||row?.title),plain=t.replace(/[^a-z0-9]+/gi,' ').replace(/\s+/g,' ').trim();
    if(t.length<7||plain.length<3)return true;
    if(/^[\s·•→\-–—★☆⭐]*\d+(?:[.,]\d+)?[\s★☆⭐]*$/u.test(t))return true;
    return /^(?:today|yesterday|\d+\s+(?:minutes?|hours?|days?|weeks?)\s+ago|fd|dg|dt|item|product|unknown|clearance|penny|deal)$/i.test(plain)||/^(?:home depot|dollar general|dollar tree|family dollar)\s+(?:deep|daily|weekly|tool|deal|deals|clearance|penny)/i.test(plain)||/(?:deep tool savings|daily deals|weekly deals|current weekly list|surprise penny list)$/i.test(plain)
  }
  function cleanState(){if(Array.isArray(state?.leads))state.leads=state.leads.filter(r=>!artifact(r))}

  const fnV051Base=fn;
  fn=async function(name,body,timeout){
    const feed=['reseller-auto-leads','reseller-auto-leads-v038','reseller-auto-leads-v044','reseller-auto-leads-v046','reseller-auto-leads-v049','reseller-auto-leads-v051'].includes(name);
    if(feed){name='reseller-auto-leads-v051';body={...(body&&typeof body==='object'?body:{}),known_image_ids:knownIds()}}
    const out=await fnV051Base(name,body,timeout);
    if(feed&&Array.isArray(out?.leads)){out.leads=applyCache(out.leads);remember(out.leads,out?.open_facts_checked_ids)}
    return out;
  };

  const loadClearanceV051Base=loadClearance;
  loadClearance=async function(force){const out=await loadClearanceV051Base(force);cleanState();if(state.page==='clearance')renderClearance();if(state.page==='stores')renderStores();return out};
  cleanState();
  if(state.page==='clearance')renderClearance();else if(state.page==='stores')renderStores();
})();
