(function(){
'use strict';
const BUILD='20260823-quote-revision-authority-1';
const INTENT_MS=30000;
const text=v=>String(v==null?'':v).trim();
const number=v=>{const n=Number(v==null?0:v);return Number.isFinite(n)?n:0;};
const val=(row,...keys)=>{const src=row?.payload&&typeof row.payload==='object'?row.payload:row;for(const key of keys){if(src&&src[key]!==undefined&&src[key]!==null&&src[key]!=='')return src[key];}return'';};
const rows=name=>typeof window.records==='function'?window.records(name):(Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[]);
const quoteId=row=>text(val(row,'Quote ID','quoteId'));
const clone=value=>{try{return JSON.parse(JSON.stringify(value||{}));}catch(_){return{...(value||{})};}};
const baselines=new Map();
let intent=null,installed=false;
function currentRow(id){return rows('quotes').find(row=>quoteId(row)===text(id))||null;}
function lineShape(line){return{description:text(val(line,'Description','description')).replace(/\s+/g,' '),quantity:number(val(line,'Quantity','quantity')),unit:text(val(line,'Unit','unit')).toLowerCase(),unitPrice:number(val(line,'Unit Price','unitPrice','rate')),costType:text(val(line,'Cost Type','costType')).toLowerCase(),catalogId:text(val(line,'Catalog ID','catalogId')),priceSource:text(val(line,'Price Source','priceSource'))};}
function evidenceIds(id){return rows('documents').filter(row=>{const mime=text(val(row,'Mime Type','mimeType')).toLowerCase();if(!mime.startsWith('image/'))return false;const qid=text(val(row,'Quote ID','quoteId')),sourceType=text(val(row,'Source Type','sourceType')).toLowerCase(),sourceId=text(val(row,'Source ID','sourceId'));return qid===id||(sourceType==='quote'&&sourceId===id);}).map(row=>text(val(row,'Document ID','documentId'))).filter(Boolean).sort();}
function contentShape(row,id=quoteId(row)){const src=row?.payload&&typeof row.payload==='object'?row.payload:row||{},lines=val(src,'lines','Lines','Quote Lines');return{
 customerId:text(val(src,'Customer ID','customerId')),
 projectTitle:text(val(src,'Project Title','projectTitle')),
 scope:text(val(src,'Scope','scope')),
 measurementNotes:text(val(src,'Measurement Notes','measurementNotes')),
 tax:number(val(src,'Tax','tax')),
 lines:(Array.isArray(lines)?lines:[]).map(lineShape),
 actionPictureId:text(val(src,'Action Picture ID','actionPictureId')),
 actionPictureRotation:number(val(src,'Action Picture Rotation Degrees','actionPictureRotationDegrees','Action Photo Rotation')),
 actionPictureOrientation:text(val(src,'Action Picture Orientation','actionPictureOrientation')),
 actionPhotoFile:text(val(src,'Action Photo File','actionPhotoFile')),
 actionPhotoPath:text(val(src,'Action Photo Path','actionPhotoPath')),
 renderSourceFile:text(val(src,'Render Source File','renderSourceFile')),
 renderSourcePath:text(val(src,'Render Source Path','renderSourcePath')),
 renderSourceRotation:number(val(src,'Render Source Rotation','renderSourceRotation')),
 preparedRenderSourceFile:text(val(src,'Prepared Render Source File','preparedRenderSourceFile')),
 preparedRenderSourcePath:text(val(src,'Prepared Render Source Path','preparedRenderSourcePath')),
 preparedFromActionPhoto:text(val(src,'Prepared From Action Photo','preparedFromActionPhoto')),
 preparedFromActionPhotoPath:text(val(src,'Prepared From Action Photo Path','preparedFromActionPhotoPath')),
 renderInstructions:text(val(src,'Render Instructions','renderInstructions')),
 imageSelectionMode:text(val(src,'Image Selection Mode','imageSelectionMode')),
 imageOrientationMode:text(val(src,'Image Orientation Mode','imageOrientationMode')),
 selectedDirectionId:text(val(src,'Selected Direction ID','selectedDirectionId','Quote Direction ID','quoteDirectionId')),
 selectedRenderId:text(val(src,'Selected Render ID','selectedRenderId','Render Document ID','renderDocumentId','Customer Quote Image ID','customerQuoteImageId')),
 evidenceImages:evidenceIds(id)
};}
function fingerprint(row,id=quoteId(row)){return JSON.stringify(contentShape(row,id));}
function setBaseline(id,row=currentRow(id)){id=text(id);if(!id||!row)return null;const base={record:clone(row?.payload&&typeof row.payload==='object'?row.payload:row),fingerprint:fingerprint(row,id),evidence:evidenceIds(id),capturedAt:new Date().toISOString()};baselines.set(id,base);return base;}
function baseline(id){return baselines.get(text(id))||setBaseline(id);}
function markIntent(kind){intent={kind:text(kind)||'save',expires:Date.now()+INTENT_MS};}
function consumeIntent(){const active=intent&&intent.expires>Date.now()?intent:null;intent=null;return active;}
function replace(target,source){for(const key of Object.keys(target||{}))delete target[key];Object.assign(target,source);return target;}
function clearDeliveryLock(record){for(const key of ['Presented Time','Presented To','Presented Email','Customer Portal Quote ID','PDF Storage Path','Locked Revision','Delivery Channel','External Action Occurred'])delete record[key];return record;}
function syncPayload(payload,record,changed){payload.quoteId=record['Quote ID'];payload.quoteNumber=record['Quote Number'];payload.customerId=record['Customer ID'];payload.projectTitle=record['Project Title'];payload.scope=record.Scope;payload.measurementNotes=record['Measurement Notes'];payload.status=record.Status;payload.revision=record.Revision;payload.previousRevision=changed?record['Previous Revision']:'';payload.previousStatus=changed?record['Previous Status']:'';payload.lines=record.lines;payload.ownerReviewRequired=true;payload.externalActionOccurred=false;if(payload.__h38Record)payload.__h38Record.record=record;}
async function saveSnapshot(baseQueue,id,base,reason){if(!base?.record)return;const revision=Math.max(1,Math.trunc(number(val(base.record,'Revision','revision'))||1)),key=`${id}-R${revision}`,stamp=new Date().toISOString(),record={...clone(base.record),'Quote Revision ID':key,'Source Quote ID':id,'Snapshot Revision':revision,'Snapshot Time':stamp,'Snapshot Reason':reason||'Meaningful quote change','Revision Evidence Document IDs':base.evidence||[]};await baseQueue('SAVE_ENTITY','Quote Revision',key,{entity:'quoteRevisions',record,ownerReviewRequired:true,externalActionOccurred:false},{collection:'quoteRevisions',record,idKeys:['Quote Revision ID']},false);}
function mergedRecord(old,candidate,changed){const oldRev=Math.max(1,Math.trunc(number(val(old,'Revision','revision'))||1)),oldStatus=text(val(old,'Status','status')||'Draft'),merged={...clone(old),...clone(candidate)};merged['Quote ID']=quoteId(old)||text(val(candidate,'Quote ID','quoteId'));merged['Business ID']=text(val(candidate,'Business ID','businessId')||val(old,'Business ID','businessId')||window.state?.businessId);merged['Quote Number']=text(val(old,'Quote Number','quoteNumber')||val(candidate,'Quote Number','quoteNumber'));merged['Created Time']=text(val(old,'Created Time','createdTime')||val(candidate,'Created Time','createdTime'));
 if(changed){merged.Revision=oldRev+1;merged['Previous Revision']=oldRev;merged['Previous Status']=oldStatus;merged.Status='Draft';merged['Review Status']='Owner Review Required';merged['Record Version']=Math.max(1,Math.trunc(number(val(old,'Record Version','recordVersion'))||1)+1);clearDeliveryLock(merged);}else{merged.Revision=oldRev;merged.Status=oldStatus;merged['Review Status']=val(old,'Review Status','reviewStatus')||merged['Review Status'];merged['Record Version']=Math.max(1,Math.trunc(number(val(old,'Record Version','recordVersion'))||1));}
 merged['Updated Time']=new Date().toISOString();delete merged.__localPending;return merged;}
function install(){if(installed||typeof window.queueOperation!=='function')return false;installed=true;const baseQueue=window.queueOperation.bind(window);window.queueOperation=async function(action,recordType,recordId,payload,optimistic,flush){if(action!=='SAVE_QUOTE')return baseQueue(action,recordType,recordId,payload,optimistic,flush);const candidate=payload?.__h38Record?.record;if(!candidate||typeof candidate!=='object')return baseQueue(action,recordType,recordId,payload,optimistic,flush);const id=text(val(candidate,'Quote ID','quoteId')||recordId),old=currentRow(id);if(!old){candidate.Revision=1;payload.revision=1;const result=await baseQueue(action,recordType,recordId,payload,optimistic,flush);setTimeout(()=>setBaseline(id,currentRow(id)||candidate),0);return result;}
 const owner=consumeIntent(),base=baseline(id)||{record:clone(old),fingerprint:fingerprint(old,id),evidence:evidenceIds(id)},candidateMerged={...clone(old),...clone(candidate)},changed=fingerprint(candidateMerged,id)!==base.fingerprint,merged=mergedRecord(old,candidate,changed);replace(candidate,merged);syncPayload(payload,candidate,changed);
 if(!owner){candidate.Revision=Math.max(1,Math.trunc(number(val(old,'Revision','revision'))||1));payload.revision=candidate.Revision;payload.previousRevision='';payload.previousStatus='';return{status:'PASS',deferred:true,reason:'INTERNAL_QUOTE_WORKING_COPY_NOT_COMMITTED',quoteId:id,revision:candidate.Revision,externalActionOccurred:false};}
 if(!changed){candidate['Previous Revision']='';payload.previousRevision='';payload.previousStatus='';setBaseline(id,old);return{status:'PASS',unchanged:true,quoteId:id,revision:candidate.Revision,externalActionOccurred:false};}
 await saveSnapshot(baseQueue,id,base,owner.kind==='send'?'Changed before owner send':'Changed on owner save');const result=await baseQueue(action,recordType,recordId,payload,optimistic,flush);baselines.set(id,{record:clone(candidate),fingerprint:fingerprint(candidate,id),evidence:evidenceIds(id),capturedAt:new Date().toISOString()});window.dispatchEvent(new CustomEvent('h38:quote-revision-created',{detail:{quoteId:id,revision:candidate.Revision,previousRevision:candidate['Previous Revision'],reason:owner.kind}}));return result;};
 window.queueOperation.__h38QuoteRevisionAuthority=true;
 const open=window.openQuote;if(typeof open==='function'&&!open.__h38QuoteRevisionAuthority){const wrapped=function(id){const result=open.apply(this,arguments),capture=()=>setTimeout(()=>setBaseline(id,currentRow(id)),0);if(result&&typeof result.then==='function')return result.then(value=>{capture();return value;});capture();return result;};wrapped.__h38QuoteRevisionAuthority=true;window.openQuote=wrapped;}
 document.addEventListener('click',event=>{const button=event.target instanceof Element?event.target.closest('button'):null;if(!button)return;if(button.id==='saveQuoteButton'||/^save(?: quote| revision)?$/i.test(text(button.textContent)))markIntent('save');if(button.id==='h38ApproveSendQuoteButton'||/approve\s*&?\s*send quote/i.test(text(button.textContent)))markIntent('send');},true);
 document.addEventListener('submit',event=>{if(window.state?.page==='quotes'&&event.target instanceof Element&&event.target.closest('#mainContent'))markIntent('save');},true);
 const seed=()=>{const id=text(window.state?.quote?.quoteId);if(id&&!baselines.has(id))setBaseline(id);};window.addEventListener('h38:business-snapshot-updated',seed);window.addEventListener('h38:quote-reproduction-authority-ready',seed);[0,250,900].forEach(delay=>setTimeout(seed,delay));
 window.H38_QUOTE_REVISION_AUTHORITY=Object.freeze({enabled:true,build:BUILD,setBaseline,fingerprint,contentShape,evidenceIds,markOwnerSave:()=>markIntent('save'),markOwnerSend:()=>markIntent('send'),contentChangeOnlyRevisions:true,stableQuoteId:true,stableQuoteNumber:true,immutableRevisionSnapshots:true,internalPrebuildDoesNotBumpRevision:true,internalPrebuildDoesNotOverwriteSavedRevision:true,unchangedSaveKeepsRevision:true,changedSaveCreatesRevision:true,changedSendCreatesRevision:true,historicalRenderMetadataPreserved:true,imageAndRenderChangesCount:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,automaticPayment:false,automaticScheduling:false});return true;}
let ticks=0;const timer=setInterval(()=>{if(install()||++ticks>40)clearInterval(timer);},100);install();
})();
