'use strict';
window.H38_V061_RUNTIME_ACTIVE=true;
window.H38_V061_RUNTIME_MARKER='fast-evidence-feed-photo-deferred-v061';
(function(){
  const text=v=>String(v??'').trim();
  const norm=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const digits=v=>text(v).replace(/\D/g,'');
  function artifact(row){const t=text(row?.canonical_title||row?.raw_title||row?.title),p=t.replace(/[^a-z0-9]+/gi,' ').replace(/\s+/g,' ').trim();if(!t||t.length<7||p.length<3)return true;if(/^[\s·•→\-–—★☆⭐]*\d+(?:[.,]\d+)?[\s★☆⭐]*$/u.test(t))return true;if(/^other\s+misc(?:\s+(?:no\s+brand|\d+(?:\s+\d+)?))?$/i.test(p))return true;if(/^page\s+\d+\s+(?:of|\/|-)\s+\d+$/i.test(p))return true;if(/^(?:check|shop|view|open|see|browse|load)\s+(?:amazon|ebay|walmart|target|online|store|stores|price|prices|list|deal|deals|more)$/i.test(p))return true;return /^(?:next|previous|prev|more|details|learn more|buy now|shop now|add to cart|see all|view all|open list|today|yesterday|fd|dg|dt|item|product|unknown|clearance|penny|deal)$/i.test(p)}
  function code(row){for(const v of [row?.upc,row?.gtin,row?.barcode]){const x=digits(v);if(x.length>=7)return x.replace(/^0+/,'')}const x=digits(row?.sku);return x.length>=10?x.replace(/^0+/,''):''}
  function key(row){const r=norm(row?.retailer)||'unknown',c=code(row);if(c)return`${r}|c:${c}`;const s=norm(row?.sku);if(s)return`${r}|s:${s}|${norm(row?.title||row?.canonical_title)}`;return`${r}|t:${norm(row?.title||row?.canonical_title)}|${text(row?.buy_price)}`}
  function quality(row){let q=0;if(code(row))q+=5;if(text(row?.sku))q+=2;if(text(row?.original_price))q+=2;if(text(row?.posted_date||row?.pennied_at))q+=2;if(text(row?.last_seen))q++;q+=Math.min(4,Number(row?.signal_source_count||0)||0);return q}
  function clean(rows){const out=[],idx=new Map();for(const raw of Array.isArray(rows)?rows:[]){if(artifact(raw))continue;const row={...raw},r=norm(row.retailer);if((r==='dollar general'||r==='dollar tree')&&row.image_url){const proof=digits(row.image_match_barcode).replace(/^0+/,'');if(!proof||proof!==code(row)){delete row.image_url;delete row.image_source;delete row.image_reference_url;delete row.image_match_barcode;delete row.image_match_model;delete row.image_match_title}}const k=key(row);if(!idx.has(k)){idx.set(k,out.length);out.push(row);continue}const i=idx.get(k),old=out[i],winner=quality(row)>quality(old)?row:old,loser=winner===row?old:row,a=[...(Array.isArray(winner.signal_sources)?winner.signal_sources:[])],seen=new Set(a.map(x=>text(x?.url||x?.domain||x?.name).toLowerCase()).filter(Boolean));for(const s of Array.isArray(loser.signal_sources)?loser.signal_sources:[]){const sk=text(s?.url||s?.domain||s?.name).toLowerCase();if(sk&&!seen.has(sk)){seen.add(sk);a.push(s)}}out[i]={...winner,signal_sources:a,signal_source_count:Math.max(Number(winner.signal_source_count||0),Number(loser.signal_source_count||0),a.length)}}return out}

  const fnBase=fn;
  fn=async function(name,body,timeout){
    const feeds=new Set(['reseller-auto-leads','reseller-auto-leads-v038','reseller-auto-leads-v044','reseller-auto-leads-v046','reseller-auto-leads-v049','reseller-auto-leads-v051','reseller-auto-leads-v058','reseller-auto-leads-v061-fast']),isFeed=feeds.has(name);
    if(isFeed)name='reseller-auto-leads-v061-fast';
    const out=await fnBase(name,body,timeout);
    if(isFeed&&Array.isArray(out?.leads)){const raw=out.leads.length;out.leads=clean(out.leads);out.count=out.leads.length;out.photo_mode='deferred';diag('fastFeedV061',{raw,actionable:out.leads.length,removed:raw-out.leads.length,adapter:out.adapter_version||'fast-text-evidence-feed-v061',photo_mode:'deferred'})}
    return out;
  };

  const renderClearanceBase=renderClearance;
  renderClearance=function(){renderClearanceBase();const p=$('page-clearance');if(!p)return;const note=p.querySelector('.workflow-head .muted.small');if(note)note.textContent='Fast, searchable penny and clearance evidence. Missing pictures never delay the hunt; open a product only when its identity, date or store evidence is useful.';p.querySelectorAll('.v058-photo-note').forEach(x=>x.remove())};
  if(state.page==='clearance')renderClearance();
})();
