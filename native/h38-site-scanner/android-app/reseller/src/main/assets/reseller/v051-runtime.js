'use strict';
window.H38_V051_RUNTIME_ACTIVE=true;
window.H38_V051_RUNTIME_MARKER='progressive-photo-cache-v051-v057-all-retailers';
window.H38_V054_ARTIFACT_FIX_ACTIVE=true;
window.H38_V055_ARTIFACT_FIX_ACTIVE=true;
window.H38_V057_PHOTO_FIX_ACTIVE=true;
(function(){
  const CACHE_KEY='h38.resellerScout.imageCache.v057';
  const CURSOR_KEY='h38.resellerScout.photoCursor.v057';
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const digits=v=>text(v).replace(/\D/g,'');
  function identity(row){const c=digits(row?.upc||row?.gtin||row?.barcode||row?.sku);if(c.length>=7)return c;for(const v of [row?.model,row?.model_number,row?.manufacturer_model,row?.sku]){const x=text(v).replace(/[^a-z0-9._-]+/gi,'').toLowerCase();if(x.length>=5&&!/^\d+$/.test(x))return x}return''}
  function key(row){const id=identity(row);return id?`${norm(row?.retailer)||'unknown'}|${id}`:''}
  const loadCache=()=>{try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch(e){return{}}};
  const saveCache=c=>{try{localStorage.setItem(CACHE_KEY,JSON.stringify(Object.fromEntries(Object.entries(c||{}).slice(-500))))}catch(e){}};
  const loadCursor=()=>{try{return Math.max(0,Number(localStorage.getItem(CURSOR_KEY)||0)||0)}catch(e){return 0}};
  const saveCursor=v=>{try{localStorage.setItem(CURSOR_KEY,String(Math.max(0,Number(v)||0)))}catch(e){}};
  const knownKeys=()=>Object.entries(loadCache()).filter(([,v])=>/^https?:\/\//i.test(text(v?.url))).map(([k])=>k).slice(0,500);
  function applyCache(rows){const c=loadCache();return(Array.isArray(rows)?rows:[]).map(r=>{const k=key(r),h=k?c[k]:null;if(!h||r?.image_url||!/^https?:\/\//i.test(text(h.url)))return r;return{...r,image_url:h.url,image_source:h.source||'Cached verified image',image_reference_url:h.reference_url||'',image_match_barcode:h.barcode||'',image_match_model:h.model||''}})}
  function remember(rows){const c=loadCache();let changed=false;for(const r of Array.isArray(rows)?rows:[]){const k=key(r),u=text(r?.image_url);if(!k||!/^https?:\/\//i.test(u))continue;const n={url:u,source:text(r?.image_source||'Verified source image'),reference_url:text(r?.image_reference_url||''),barcode:text(r?.image_match_barcode||''),model:text(r?.image_match_model||'')};if(JSON.stringify(c[k]||{})!==JSON.stringify(n)){c[k]=n;changed=true}}if(changed)saveCache(c)}
  function artifact(row){
    const t=text(row?.canonical_title||row?.raw_title||row?.title),plain=t.replace(/[^a-z0-9]+/gi,' ').replace(/\s+/g,' ').trim();
    if(t.length<7||plain.length<3)return true;
    if(/^[\s·•→\-–—★☆⭐]*\d+(?:[.,]\d+)?[\s★☆⭐]*$/u.test(t))return true;
    if(/^other\s+misc(?:\s+(?:no\s+brand|\d+(?:\s+\d+)?))?$/i.test(plain))return true;
    return /^(?:today|yesterday|\d+\s+(?:minutes?|hours?|days?|weeks?)\s+ago|fd|dg|dt|item|product|unknown|clearance|penny|deal)$/i.test(plain)||/^(?:home depot|dollar general|dollar tree|family dollar)\s+(?:deep|daily|weekly|tool|deal|deals|clearance|penny)/i.test(plain)||/(?:deep tool savings|daily deals|weekly deals|current weekly list|surprise penny list)$/i.test(plain)
  }
  function cleanState(){if(Array.isArray(state?.leads))state.leads=state.leads.filter(r=>!artifact(r))}

  const fnV051Base=fn;
  fn=async function(name,body,timeout){
    const feed=['reseller-auto-leads','reseller-auto-leads-v038','reseller-auto-leads-v044','reseller-auto-leads-v046','reseller-auto-leads-v049','reseller-auto-leads-v051'].includes(name);
    if(feed){name='reseller-auto-leads-v051';body={...(body&&typeof body==='object'?body:{}),known_image_keys:knownKeys(),photo_offset:loadCursor()}}
    const out=await fnV051Base(name,body,timeout);
    if(feed&&Array.isArray(out?.leads)){if(Number.isFinite(Number(out.photo_next_offset)))saveCursor(Number(out.photo_next_offset));out.leads=applyCache(out.leads);remember(out.leads);if(state?.diagnostics)state.diagnostics.photoRecovery={eligible:Number(out.photo_queue_eligible_count||0),attempted:Number(out.photo_attempted_count||0),enriched:Number(out.photo_enriched_count||0),coverage:out.photo_coverage_by_retailer||{},next:Number(out.photo_next_offset||0)}}
    return out;
  };

  const loadClearanceV051Base=loadClearance;
  loadClearance=async function(force){const out=await loadClearanceV051Base(force);cleanState();if(state.page==='clearance')renderClearance();if(state.page==='stores')renderStores();return out};
  cleanState();
  if(state.page==='clearance')renderClearance();else if(state.page==='stores')renderStores();
})();
