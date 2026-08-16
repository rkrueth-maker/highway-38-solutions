(function(){
'use strict';
const BUILD='20260816-native-walkthrough-photos-1';
const RESUME_KEY='h38:field-visit-resume-step';
const CHUNK_BYTES=256*1024;
let busy=false,retryTimer=0;
const text=v=>String(v==null?'':v);
function C(){return window.H38_FIELD_VISIT_CORE;}
function bridge(){try{return window.AndroidH38Native||null;}catch(_){return null;}}
function nativeAndroid(){return /H38SiteScannerAndroid\//.test(String(navigator.userAgent||''))||!!bridge();}
function toast(message,bad){try{window.toast?.(message,!!bad);}catch(_){} }
function hammer(message){try{window.H38_WORKING_HAMMER?.start?.(message);}catch(_){} }
function unhammer(){try{window.H38_WORKING_HAMMER?.stop?.();}catch(_){} }
function remembered(){try{const raw=localStorage.getItem(RESUME_KEY);if(!raw)return null;const value=JSON.parse(raw);return Date.now()-Number(value?.time||0)<600000?value:null;}catch(_){return null;}}
function sameVisit(visit,expected){if(!visit||!expected?.visitId)return false;if(text(visit.visitId)!==text(expected.visitId))return false;if(expected.sessionId&&text(visit.sessionId)!==text(expected.sessionId))return false;if(expected.businessId&&text(visit.businessId)&&text(visit.businessId)!==text(expected.businessId))return false;return true;}
function info(){try{return JSON.parse(text(bridge()?.getRecoveredWalkthroughPhotosInfo?.()||'{}'));}catch(_){return{};}}
function decodeBase64(value){const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
function yieldUi(){return new Promise(resolve=>setTimeout(resolve,0));}
async function readPhoto(meta){const b=bridge(),index=Number(meta?.index),size=Number(meta?.size||0);if(!b?.readRecoveredWalkthroughPhotoChunk||!Number.isInteger(index)||index<0||size<1)throw Error('Walkthrough photo recovery data is unavailable.');const parts=[];let offset=0;while(offset<size){hammer(`Recovering walkthrough photo ${index+1}…`);const encoded=text(b.readRecoveredWalkthroughPhotoChunk(index,offset,Math.min(CHUNK_BYTES,size-offset)));if(!encoded)throw Error(`Walkthrough photo ${index+1} stopped recovering at ${offset} bytes.`);const bytes=decodeBase64(encoded);if(!bytes.length)throw Error(`Walkthrough photo ${index+1} returned an empty block.`);parts.push(bytes);offset+=bytes.length;await yieldUi();}return new File(parts,text(meta.name)||`h38-walkthrough-photo-${Date.now()}-${index+1}.jpg`,{type:text(meta.mime)||'image/jpeg',lastModified:Number(meta.capturedAt||Date.now())});}
async function currentAttachmentMap(visit){const rows=await window.H38DB?.all?.('attachments')||[],map=new Map();for(const row of rows){if(text(row?.relatedRecordId)!==text(visit.visitId))continue;if(!text(row?.mimeType).startsWith('image/'))continue;const name=text(row?.fileName),id=text(row?.attachmentId||row?.id);if(name&&id)map.set(name,id);}return map;}
async function recoverNow(){if(busy||!nativeAndroid())return false;const details=info(),photos=Array.isArray(details.photos)?details.photos:[];if(details.ready!==true||!photos.length)return false;const core=C(),visit=core?.state?.visit,expected=remembered();if(!visit?.visitId||!visit?.sessionId||(expected?.visitId&&!sameVisit(visit,expected))){schedule(300);return false;}if(!window.H38DB?.all||typeof core.photos!=='function'){schedule(500);return false;}busy=true;hammer('Saving walkthrough photos to this Site Visit…');try{let existing=await currentAttachmentMap(visit),missing=photos.filter(meta=>!existing.has(text(meta.name)));if(missing.length){const files=[];for(const meta of missing)files.push(await readPhoto(meta));const before=new Set(visit.attachmentIds||[]);await core.photos(files);existing=await currentAttachmentMap(visit);const added=(visit.attachmentIds||[]).filter(id=>!before.has(id));if(added.length<missing.length){throw Error('One or more walkthrough photos did not finish saving. H38 kept the native originals for another recovery attempt.');}}
      const resolved=photos.map(meta=>existing.get(text(meta.name))).filter(Boolean);if(resolved.length!==photos.length)throw Error('Walkthrough photos are still finishing their Site Visit save.');if(!Array.isArray(visit.intentionalPhotoIds))visit.intentionalPhotoIds=[];for(const id of resolved)if(!visit.intentionalPhotoIds.includes(id))visit.intentionalPhotoIds.push(id);await core.saveDraft?.();core.state.render?.();bridge()?.confirmRecoveredWalkthroughPhotosConsumed?.();toast(`${resolved.length} walkthrough photo${resolved.length===1?'':'s'} saved to this Site Visit. Use Add to Quote on the ones you want the customer to see.`);return true;}catch(error){console.warn('[H38 native walkthrough photo recovery]',error?.message||error);toast(error?.message||String(error),true);schedule(900);return false;}finally{busy=false;unhammer();}}
function schedule(delay=120){clearTimeout(retryTimer);retryTimer=setTimeout(()=>void recoverNow(),delay);}
window.addEventListener('focus',()=>schedule(100));
window.addEventListener('pageshow',()=>schedule(120));
window.addEventListener('h38:native-scanner-ready',()=>schedule(140));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(100);});
setTimeout(()=>schedule(0),250);
window.H38_ANDROID_WALKTHROUGH_PHOTO_RECOVERY=Object.freeze({build:BUILD,recoverNow,nativeStillCapture:true,videoContinuesWhilePhotoTaken:true,explicitAddToQuote:true,automaticCustomerPhotoSelection:false,automaticApproval:false,automaticCustomerSending:false});
})();
