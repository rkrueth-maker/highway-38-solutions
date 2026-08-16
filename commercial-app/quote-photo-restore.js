(function(){
'use strict';
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{},auth=window.H38_SUPABASE_AUTH,shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!cfg.enabled||!auth||auth.enabled!==true||!window.supabase||typeof window.renderQuotes!=='function')return;
const baseRender=window.renderQuotes,baseOpen=window.openQuote;let db=null,token=0;
const txt=v=>String(v==null?'':v),val=(r,a,b)=>r?.[a]??r?.[b]??'';
function client(){return shared?.ensure?.()||(db||(db=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},global:{headers:{'x-client-info':'h38-quote-photo-restore-v3-explicit-selection'}}})));}
function quoteId(){return txt(window.state?.quote?.quoteId).trim();}
function photoKey(r){return`${txt(val(r,'File Name','fileName')).toLowerCase()}|${txt(val(r,'File Size','fileSize'))}`;}
function isSelectedQuotePhoto(row,id){
  const type=txt(val(row,'Source Type','sourceType')).toLowerCase(),source=txt(val(row,'Source ID','sourceId'));
  if(type!=='quote'||source!==id)return false;
  if(!txt(val(row,'Mime Type','mimeType')).toLowerCase().startsWith('image/'))return false;
  if(!txt(val(row,'Storage Path','storagePath')))return false;
  const original=txt(val(row,'Original Document ID','originalDocumentId'));
  if(!original)return true;
  const selected=val(row,'Customer Quote Selected','customerQuoteSelected');
  return selected===true||txt(selected).toLowerCase()==='true';
}
function docs(id){
 const rows=Array.isArray(window.state?.snapshot?.documents)?window.state.snapshot.documents:[],seen=new Set();
 return rows.filter(r=>isSelectedQuotePhoto(r,id)).sort((a,b)=>new Date(val(b,'Created Time','createdTime')||0)-new Date(val(a,'Created Time','createdTime')||0)).filter(r=>{const k=photoKey(r);if(seen.has(k))return false;seen.add(k);return true;});
}
async function ensureQuoteLinks(){return 0;}
function target(){const q=document.getElementById('h38QuotePhotoQueue');if(!q)return null;let s=document.getElementById('h38SavedQuotePhotoSection');if(!s){s=document.createElement('div');s.id='h38SavedQuotePhotoSection';s.innerHTML='<h3>Customer quote photos</h3><div class="notice">Site Visit video and extracted frames stay internal. Only photos explicitly marked Add to Quote appear here and in the customer proposal.</div><div id="h38SavedQuotePhotos" class="list"></div>';q.appendChild(s);}return document.getElementById('h38SavedQuotePhotos');}
async function preview(node,row,stamp){const bucket=txt(val(row,'Storage Bucket','storageBucket')||'business-office-files'),path=txt(val(row,'Storage Path','storagePath'));if(!path||!path.startsWith(`${window.state?.businessId||''}/`))return;const{data,error}=await client().storage.from(bucket).createSignedUrl(path,300);if(error||!data?.signedUrl||stamp!==token||!node.isConnected)return;const img=node.querySelector('img'),a=node.querySelector('a');if(img){img.src=data.signedUrl;img.hidden=false;}if(a){a.href=data.signedUrl;a.hidden=false;}}
function render(){const n=target();if(!n)return;const id=quoteId(),rows=docs(id),stamp=++token;if(!id){n.innerHTML='<div class="empty">Save or open a quote to see its selected customer photos.</div>';return;}if(!rows.length){n.innerHTML='<div class="empty">No Site Visit photos are selected for this customer quote yet. Open the Site Visit photo manager and choose Add to Quote.</div>';return;}n.innerHTML=rows.map((r,i)=>{const name=txt(val(r,'File Name','fileName')||`Quote photo ${i+1}`),size=Number(val(r,'File Size','fileSize')||0),created=txt(val(r,'Created Time','createdTime'));return`<div class="row" data-saved-photo="${i}"><div class="row-top"><strong>${window.esc(name)}</strong>${window.pill('on quote','good')}</div><div style="display:flex;gap:.75rem;align-items:center"><img alt="${window.esc(name)}" hidden style="width:96px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #cbd5e1"><small>${Math.max(1,Math.round(size/1024))} KB · selected customer photo${created?` · ${window.dateTime(created)}`:''}</small></div><div class="row-actions"><a class="secondary" target="_blank" rel="noopener noreferrer" hidden>Open photo</a></div></div>`;}).join('');rows.forEach((r,i)=>{const node=n.querySelector(`[data-saved-photo="${i}"]`);if(node)preview(node,r,stamp);});}
function observe(){const n=document.getElementById('h38SelectedQuotePhotos');if(!n||n.dataset.savedPhotoObserver)return;n.dataset.savedPhotoObserver='1';let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;render();});}).observe(n,{childList:true,subtree:true,characterData:true});}
window.renderQuotes=function(){const out=baseRender.apply(this,arguments);render();observe();return out;};
window.openQuote=function(){const out=baseOpen.apply(this,arguments);requestAnimationFrame(()=>requestAnimationFrame(render));return out;};
window.H38_QUOTE_PHOTO_RESTORE=Object.freeze({enabled:true,build:'20260816-explicit-quote-photo-selection-1',relationship:'Quote ID plus explicit photo selection',privateSignedPreviews:true,duplicateDisplaySuppression:true,ensureQuoteLinks,automaticSiteVisitPhotoLinking:false,videoFramesInternalByDefault:true,explicitCustomerPhotoSelection:true,automaticCustomerRelease:false});
})();
