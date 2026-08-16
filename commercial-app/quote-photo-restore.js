(function(){
'use strict';
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{},auth=window.H38_SUPABASE_AUTH,shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!cfg.enabled||!auth||auth.enabled!==true||!window.supabase||typeof window.renderQuotes!=='function')return;
const baseRender=window.renderQuotes,baseOpen=window.openQuote,basePreview=typeof window.renderQuotePreview==='function'?window.renderQuotePreview:null;let db=null,token=0,customerToken=0,customerScheduled=false;
const txt=v=>String(v==null?'':v),val=(r,a,b)=>r?.[a]??r?.[b]??'';
function client(){return shared?.ensure?.()||(db||(db=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},global:{headers:{'x-client-info':'h38-quote-photo-restore-v4-customer-selection'}}})));}
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
 return rows.filter(r=>isSelectedQuotePhoto(r,id)).sort((a,b)=>new Date(val(a,'Created Time','createdTime')||0)-new Date(val(b,'Created Time','createdTime')||0)).filter(r=>{const k=photoKey(r);if(seen.has(k))return false;seen.add(k);return true;});
}
async function ensureQuoteLinks(){return 0;}
function target(){const q=document.getElementById('h38QuotePhotoQueue');if(!q)return null;let s=document.getElementById('h38SavedQuotePhotoSection');if(!s){s=document.createElement('div');s.id='h38SavedQuotePhotoSection';s.innerHTML='<h3>Customer quote photos</h3><div class="notice">Site Visit video and extracted frames stay internal. Only photos explicitly marked Add to Quote appear here and in the customer proposal.</div><div id="h38SavedQuotePhotos" class="list"></div>';q.appendChild(s);}return document.getElementById('h38SavedQuotePhotos');}
async function signedUrl(row){const bucket=txt(val(row,'Storage Bucket','storageBucket')||'business-office-files'),path=txt(val(row,'Storage Path','storagePath'));if(!path||!path.startsWith(`${window.state?.businessId||''}/`))return'';const{data,error}=await client().storage.from(bucket).createSignedUrl(path,300);return error?'':txt(data?.signedUrl);}
async function preview(node,row,stamp){const url=await signedUrl(row);if(!url||stamp!==token||!node.isConnected)return;const img=node.querySelector('img'),a=node.querySelector('a');if(img){img.src=url;img.hidden=false;}if(a){a.href=url;a.hidden=false;}}
function render(){const n=target();if(!n)return;const id=quoteId(),rows=docs(id),stamp=++token;if(!id){n.innerHTML='<div class="empty">Save or open a quote to see its selected customer photos.</div>';return;}if(!rows.length){n.innerHTML='<div class="empty">No Site Visit photos are selected for this customer quote yet. Open the Site Visit photo manager and choose Add to Quote.</div>';return;}n.innerHTML=rows.map((r,i)=>{const name=txt(val(r,'File Name','fileName')||`Quote photo ${i+1}`),size=Number(val(r,'File Size','fileSize')||0),created=txt(val(r,'Created Time','createdTime'));return`<div class="row" data-saved-photo="${i}"><div class="row-top"><strong>${window.esc(name)}</strong>${window.pill('on quote','good')}</div><div style="display:flex;gap:.75rem;align-items:center"><img alt="${window.esc(name)}" hidden style="width:96px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #cbd5e1"><small>${Math.max(1,Math.round(size/1024))} KB · selected customer photo${created?` · ${window.dateTime(created)}`:''}</small></div><div class="row-actions"><a class="secondary" target="_blank" rel="noopener noreferrer" hidden>Open photo</a></div></div>`;}).join('');rows.forEach((r,i)=>{const node=n.querySelector(`[data-saved-photo="${i}"]`);if(node)void preview(node,r,stamp);});}
function customerTargets(){return Array.from(document.querySelectorAll('#quotePreviewDocument,#h38LiveCustomerQuote .h38-live-document'));}
async function renderCustomerPhotos(){
  customerScheduled=false;const id=quoteId(),rows=docs(id),stamp=++customerToken,signature=rows.map(row=>txt(val(row,'Original Document ID','originalDocumentId')||val(row,'Document ID','documentId'))).join('|');
  for(const doc of customerTargets()){
    let section=doc.querySelector('.h38-customer-photo-section');
    if(!rows.length){section?.remove();continue;}
    if(section?.dataset.photoSignature===signature)continue;
    section?.remove();section=document.createElement('section');section.className='quote-copy h38-customer-photo-section';section.dataset.photoSignature=signature;section.innerHTML=`<h2>Project photos</h2><div class="h38-customer-photo-grid">${rows.map((row,index)=>`<figure data-customer-photo="${index}"><div class="h38-customer-photo-placeholder">Loading photo…</div></figure>`).join('')}</div>`;
    const itemized=Array.from(doc.querySelectorAll('.quote-copy')).find(node=>/itemized quote/i.test(txt(node.querySelector('h2')?.textContent)));const scope=Array.from(doc.querySelectorAll('.quote-copy')).find(node=>/scope of work/i.test(txt(node.querySelector('h2')?.textContent)));
    if(itemized)itemized.insertAdjacentElement('beforebegin',section);else if(scope)scope.insertAdjacentElement('afterend',section);else doc.appendChild(section);
    rows.forEach(async(row,index)=>{const url=await signedUrl(row),figure=section.querySelector(`[data-customer-photo="${index}"]`);if(!url||stamp!==customerToken||!figure?.isConnected)return;const name=txt(val(row,'File Name','fileName')||`Project photo ${index+1}`);figure.innerHTML=`<img src="${url}" alt="${window.esc(name)}" loading="eager" decoding="sync">`;});
  }
}
function scheduleCustomerPhotos(){if(customerScheduled)return;customerScheduled=true;requestAnimationFrame(()=>void renderCustomerPhotos());}
function observe(){const n=document.getElementById('h38SelectedQuotePhotos');if(n&&!n.dataset.savedPhotoObserver){n.dataset.savedPhotoObserver='1';let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;render();scheduleCustomerPhotos();});}).observe(n,{childList:true,subtree:true,characterData:true});}const main=document.getElementById('mainContent');if(main&&!main.dataset.h38CustomerPhotoObserver){main.dataset.h38CustomerPhotoObserver='1';new MutationObserver(scheduleCustomerPhotos).observe(main,{childList:true,subtree:true});}}
window.renderQuotes=function(){const out=baseRender.apply(this,arguments);render();observe();scheduleCustomerPhotos();return out;};
window.openQuote=function(){const out=baseOpen.apply(this,arguments);requestAnimationFrame(()=>requestAnimationFrame(()=>{render();observe();scheduleCustomerPhotos();}));return out;};
if(basePreview)window.renderQuotePreview=function(){const out=basePreview.apply(this,arguments);observe();scheduleCustomerPhotos();return out;};
const style=document.createElement('style');style.textContent='.h38-customer-photo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.h38-customer-photo-grid figure{margin:0;border-radius:10px;overflow:hidden;background:#eef3f6}.h38-customer-photo-grid img{display:block;width:100%;height:220px;object-fit:cover}.h38-customer-photo-placeholder{display:grid;place-items:center;min-height:160px;color:#617482;font-size:.82rem}@media(max-width:620px){.h38-customer-photo-grid{grid-template-columns:1fr}.h38-customer-photo-grid img{height:auto;max-height:320px}}@media print{.h38-customer-photo-grid{grid-template-columns:repeat(2,1fr)}.h38-customer-photo-grid figure{break-inside:avoid;page-break-inside:avoid}.h38-customer-photo-grid img{height:2.25in;object-fit:cover}}';document.head.appendChild(style);
window.H38_QUOTE_PHOTO_RESTORE=Object.freeze({enabled:true,build:'20260816-explicit-quote-photo-selection-2',relationship:'Quote ID plus explicit photo selection',privateSignedPreviews:true,duplicateDisplaySuppression:true,ensureQuoteLinks,automaticSiteVisitPhotoLinking:false,videoFramesInternalByDefault:true,explicitCustomerPhotoSelection:true,selectedPhotosRenderOnCustomerProposal:true,selectedPhotosRenderInPrintSource:true,automaticCustomerRelease:false});
})();
