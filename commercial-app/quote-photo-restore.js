(function(){
'use strict';
const cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{},auth=window.H38_SUPABASE_AUTH,shared=window.H38_SUPABASE_SHARED_CLIENT;
if(!cfg.enabled||!auth||auth.enabled!==true||!window.supabase||typeof window.renderQuotes!=='function')return;
const baseRender=window.renderQuotes,baseOpen=window.openQuote;let db=null,token=0,linking=false;
const txt=v=>String(v==null?'':v),val=(r,a,b)=>r?.[a]??r?.[b]??'';
function client(){return shared?.ensure?.()||(db||(db=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},global:{headers:{'x-client-info':'h38-quote-photo-restore-v2'}}})));}
function quoteId(){return txt(window.state?.quote?.quoteId).trim();}
function quoteRecord(id){return (window.state?.snapshot?.quotes||[]).find(r=>txt(val(r,'Quote ID','quoteId'))===id)||{};}
function visitIds(id){
 const row=quoteRecord(id),ids=new Set(),direct=txt(val(row,'Site Visit ID','siteVisitId')).trim(),notes=txt(val(row,'Measurement Notes','measurementNotes')||window.state?.quote?.measurementNotes);
 if(direct)ids.add(direct);
 for(const match of notes.matchAll(/H38 Field Visit:\s*(VISIT-[A-Z0-9-]+)/gi))ids.add(match[1].toUpperCase());
 return ids;
}
function photoKey(r){return`${txt(val(r,'File Name','fileName')).toLowerCase()}|${txt(val(r,'File Size','fileSize'))}`;}
function docs(id){
 const rows=Array.isArray(window.state?.snapshot?.documents)?window.state.snapshot.documents:[],seen=new Set(),visits=visitIds(id);
 return rows.filter(r=>{
   const type=txt(val(r,'Source Type','sourceType')).toLowerCase(),source=txt(val(r,'Source ID','sourceId'));
   const related=(type==='quote'&&source===id)||(type==='site visit'&&visits.has(source.toUpperCase()));
   return related&&txt(val(r,'Mime Type','mimeType')).toLowerCase().startsWith('image/')&&txt(val(r,'Storage Path','storagePath'));
 }).sort((a,b)=>new Date(val(b,'Created Time','createdTime')||0)-new Date(val(a,'Created Time','createdTime')||0)).filter(r=>{const k=photoKey(r);if(seen.has(k))return false;seen.add(k);return true;});
}
function aliasKey(original,id){return`QUOTE-LINK-${txt(original).replace(/[^A-Za-z0-9-]/g,'-')}-${id.replace(/^QUOTE-/,'').slice(0,8)}`;}
async function ensureQuoteLinks(){
 const id=quoteId();if(!id||linking)return 0;
 const all=Array.isArray(window.state?.snapshot?.documents)?window.state.snapshot.documents:[],visits=visitIds(id);
 if(!visits.size)return 0;
 const directKeys=new Set(all.filter(r=>txt(val(r,'Source Type','sourceType')).toLowerCase()==='quote'&&txt(val(r,'Source ID','sourceId'))===id).map(photoKey));
 const sources=all.filter(r=>txt(val(r,'Source Type','sourceType')).toLowerCase()==='site visit'&&visits.has(txt(val(r,'Source ID','sourceId')).toUpperCase())&&txt(val(r,'Mime Type','mimeType')).toLowerCase().startsWith('image/')&&!directKeys.has(photoKey(r)));
 if(!sources.length)return 0;
 linking=true;
 try{
   const api=client(),sessionResult=await api.auth.getSession();
   if(sessionResult.error||!sessionResult.data?.session?.user)return 0;
   const userId=sessionResult.data.session.user.id,businessId=txt(window.state?.businessId);
   const records=sources.map(source=>{
     const original=txt(val(source,'Document ID','documentId'));
     const recordKey=aliasKey(original,id);
     const payload={...source,'Document ID':recordKey,'Source Type':'Quote','Source ID':id,'Linked Site Visit ID':txt(val(source,'Source ID','sourceId')),'Original Document ID':original,'Updated Time':new Date().toISOString()};
     return{business_id:businessId,collection:'documents',record_key:recordKey,payload,record_status:'active',created_by:userId,updated_by:userId};
   });
   const{error}=await api.from('business_records').upsert(records,{onConflict:'business_id,collection,record_key'});
   if(error)throw error;
   records.forEach(record=>{if(!all.some(row=>txt(val(row,'Document ID','documentId'))===record.record_key))all.unshift(record.payload);});
   render();
   return records.length;
 }catch(error){console.warn('Quote Site Visit photo link:',error?.message||error);return 0;}
 finally{linking=false;}
}
function target(){const q=document.getElementById('h38QuotePhotoQueue');if(!q)return null;let s=document.getElementById('h38SavedQuotePhotoSection');if(!s){s=document.createElement('div');s.id='h38SavedQuotePhotoSection';s.innerHTML='<h3>Saved with this quote</h3><div class="notice">Private quote and Site Visit photos stay linked to this draft and return when you reopen it.</div><div id="h38SavedQuotePhotos" class="list"></div>';q.appendChild(s);}return document.getElementById('h38SavedQuotePhotos');}
async function preview(node,row,stamp){const bucket=txt(val(row,'Storage Bucket','storageBucket')||'business-office-files'),path=txt(val(row,'Storage Path','storagePath'));if(!path||!path.startsWith(`${window.state?.businessId||''}/`))return;const{data,error}=await client().storage.from(bucket).createSignedUrl(path,300);if(error||!data?.signedUrl||stamp!==token||!node.isConnected)return;const img=node.querySelector('img'),a=node.querySelector('a');if(img){img.src=data.signedUrl;img.hidden=false;}if(a){a.href=data.signedUrl;a.hidden=false;}}
function render(){const n=target();if(!n)return;const id=quoteId(),rows=docs(id),stamp=++token;if(!id){n.innerHTML='<div class="empty">Save or open a quote to see its photos.</div>';return;}if(!rows.length){n.innerHTML='<div class="empty">No saved photos are linked to this quote yet.</div>';return;}n.innerHTML=rows.map((r,i)=>{const name=txt(val(r,'File Name','fileName')||`Quote photo ${i+1}`),size=Number(val(r,'File Size','fileSize')||0),created=txt(val(r,'Created Time','createdTime'));return`<div class="row" data-saved-photo="${i}"><div class="row-top"><strong>${window.esc(name)}</strong>${window.pill('saved','good')}</div><div style="display:flex;gap:.75rem;align-items:center"><img alt="${window.esc(name)}" hidden style="width:96px;height:72px;object-fit:cover;border-radius:8px;border:1px solid #cbd5e1"><small>${Math.max(1,Math.round(size/1024))} KB · private Supabase photo${created?` · ${window.dateTime(created)}`:''}</small></div><div class="row-actions"><a class="secondary" target="_blank" rel="noopener noreferrer" hidden>Open photo</a></div></div>`;}).join('');rows.forEach((r,i)=>{const node=n.querySelector(`[data-saved-photo="${i}"]`);if(node)preview(node,r,stamp);});}
function observe(){const n=document.getElementById('h38SelectedQuotePhotos');if(!n||n.dataset.savedPhotoObserver)return;n.dataset.savedPhotoObserver='1';let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;render();});}).observe(n,{childList:true,subtree:true,characterData:true});}
window.renderQuotes=function(){const out=baseRender.apply(this,arguments);render();observe();void ensureQuoteLinks();return out;};
window.openQuote=function(){const out=baseOpen.apply(this,arguments);requestAnimationFrame(()=>requestAnimationFrame(()=>{render();void ensureQuoteLinks();}));return out;};
window.H38_QUOTE_PHOTO_RESTORE=Object.freeze({enabled:true,build:'20260806-2115',relationship:'Quote ID plus attached Site Visit ID',privateSignedPreviews:true,duplicateDisplaySuppression:true,ensureQuoteLinks,automaticCustomerRelease:false});
})();
