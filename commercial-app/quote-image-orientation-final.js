(function(){
'use strict';
const BUILD='20260821-quote-image-orientation-final-1';
const Bridge=window.H38Bridge;
if(!Bridge||!Bridge.prototype)return;
const previousRequest=Bridge.prototype.request;
const text=value=>String(value==null?'':value).trim();
const value=(row,...keys)=>{const source=row?.payload&&typeof row.payload==='object'?row.payload:row;for(const key of keys){if(source&&source[key]!==undefined&&source[key]!==null&&source[key]!=='')return source[key];}return'';};
const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
const core=()=>window.H38_SITE_VISIT_QUOTE_E2E_CORE;
function quoteRecord(id){return rows('quotes').find(row=>text(value(row,'Quote ID','quoteId'))===text(id))||null;}
function currentQuoteId(){return text(window.state?.quote?.quoteId);}
function sourceId(id=currentQuoteId(),args={}){const runtime=window.H38_QUOTE_RUNTIME_AUTHORITY,resolved=text(runtime?.actionPictureId?.(id,args));if(resolved)return resolved;return text(core()?.resolveActionPictureId?.({quoteId:id,args,quote:quoteRecord(id),documents:rows('documents'),map:window.H38_QUOTE_ACTION_PHOTO_BY_QUOTE||{},visit:window.H38_FIELD_VISIT_CORE?.state?.visit})||value(quoteRecord(id),'Action Picture ID','actionPictureId'));}
function rotation(id=currentQuoteId(),source=sourceId(id)){return Number(core()?.actionPictureRotation?.({quoteId:id,sourceId:source,quote:quoteRecord(id),documents:rows('documents')})||0);}
function instruction(degrees){return text(core()?.rotationInstruction?.(degrees)||'Use the source image in its stored orientation.');}
function applyImage(img,degrees){if(!img)return;const d=Number(core()?.normalizeRotation?.(degrees)??0);img.dataset.h38Rotation=String(d);img.style.transform=`rotate(${d}deg)`;img.style.transformOrigin='center center';img.style.objectFit='contain';img.style.maxWidth='100%';img.style.maxHeight='100%';const parent=img.parentElement;if(parent){parent.style.overflow='hidden';parent.style.display='grid';parent.style.placeItems='center';if(d===90||d===270)parent.style.aspectRatio='4 / 3';}}
function selectedCustomerPhotos(id){return rows('documents').filter(row=>text(value(row,'Source Type','sourceType')).toLowerCase()==='quote'&&text(value(row,'Source ID','sourceId'))===id&&text(value(row,'Mime Type','mimeType')).toLowerCase().startsWith('image/')&&(value(row,'Customer Quote Selected','customerQuoteSelected')===true||text(value(row,'Customer Quote Selected','customerQuoteSelected')).toLowerCase()==='true')).sort((a,b)=>text(value(a,'Created Time','createdTime')).localeCompare(text(value(b,'Created Time','createdTime')));}
function apply(){const id=currentQuoteId();if(!id)return;const degrees=rotation(id),panel=document.getElementById('h38ActionPictureFinal');if(panel)applyImage(panel.querySelector('.h38-action-preview img'),degrees);const selected=selectedCustomerPhotos(id);document.querySelectorAll('.h38-customer-photo-section figure').forEach((figure,index)=>{const row=selected[index];if(!row)return;applyImage(figure.querySelector('img'),Number(value(row,'Action Picture Rotation Degrees','actionPictureRotationDegrees','Image Rotation Degrees','imageRotationDegrees')||0));});}
let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply();});}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('h38:business-snapshot-updated',schedule);[0,300,1000].forEach(delay=>setTimeout(schedule,delay));
Bridge.prototype.request=async function(action,args,timeout){if(action==='aiRenderQuoteConcept'){const prepared={...(args||{})},id=text(prepared.quoteId||currentQuoteId()),source=sourceId(id,prepared),degrees=rotation(id,source);if(source)prepared.actionPhotoDocumentId=source;prepared.actionPhotoRotationDegrees=degrees;prepared.actionPhotoOrientationInstruction=instruction(degrees);if(degrees)prepared.ownerWorkRequest=[text(prepared.ownerWorkRequest),`SOURCE ACTION PICTURE ORIENTATION: ${instruction(degrees)}`].filter(Boolean).join('\n');return previousRequest.call(this,action,prepared,timeout);}return previousRequest.call(this,action,args,timeout);};
Bridge.prototype.request.__h38QuoteImageOrientationFinal=true;Bridge.prototype.request.__h38QuoteImageOrientationBase=previousRequest;
window.H38_QUOTE_IMAGE_ORIENTATION_FINAL=Object.freeze({enabled:true,build:BUILD,sourceId,rotation,apply,renderUsesSavedActionPicture:true,rotationMetadataDoesNotOverwriteOriginal:true,customerSelectionIndependentOfRender:true,automaticApproval:false,automaticCustomerSending:false});
})();
