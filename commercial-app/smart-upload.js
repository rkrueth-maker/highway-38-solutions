(function(){
'use strict';
const BUILD='20260920-final-real-office-1';
const text=value=>String(value==null?'':value).trim();
const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
const value=(row,...keys)=>{for(const key of keys)if(row?.[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];return'';};
const idFor=(row,...keys)=>text(value(row,...keys));
function classify(file,source='Documents',content=''){
  const name=text(file?.name).toLowerCase(),type=text(file?.type).toLowerCase();
  const evidence=`${name}\n${text(content).toLowerCase()}`;
  let documentType='Customer document',confidence=.58;
  let classificationSource='file metadata';
  if(/\b(receipt|sales receipt|transaction total|subtotal\s*[$:]|change due)\b/.test(evidence)){documentType='Receipt';confidence=.94;}
  else if(/\b(invoice|invoice number|amount due|bill to|remit to)\b/.test(evidence)){documentType='Vendor invoice';confidence=.92;}
  else if(/\b(contract|agreement|terms and conditions|party of the first part)\b/.test(evidence)){documentType='Contract';confidence=.9;}
  else if(/before/.test(name)){documentType='Before photo';confidence=.92;}
  else if(/after|complete/.test(name)){documentType='After photo';confidence=.9;}
  else if(/manual|warranty/.test(name)){documentType='Equipment document';confidence=.84;}
  else if(/quote|estimate/.test(name)){documentType='Quote attachment';confidence=.83;}
  else if(type.startsWith('image/')){documentType='Customer photo';confidence=.65;}
  else if(type==='application/pdf'){documentType='PDF document';confidence=.62;}
  if(content&&documentType!=='Customer document'&&documentType!=='Customer photo'&&documentType!=='PDF document')classificationSource='file content';
  return{documentType,confidence,source,classificationSource,contentPreview:text(content).replace(/\s+/g,' ').slice(0,180),originalName:text(file?.name),mimeType:type||'application/octet-stream'};
}
async function readableContent(file){
  if(!file)return'';
  const type=text(file.type).toLowerCase(),name=text(file.name).toLowerCase();
  if(type.startsWith('text/')||/\.(txt|csv|json|xml|html?|md)$/i.test(name))return text((await file.text()).slice(0,262144));
  if(type==='application/pdf'||/\.pdf$/i.test(name)){
    const bytes=new Uint8Array(await file.slice(0,524288).arrayBuffer()),raw=new TextDecoder('latin1').decode(bytes);
    return text((raw.match(/[\x20-\x7e]{4,}/g)||[]).join(' ').slice(0,262144));
  }
  if(typeof window.H38_SMART_UPLOAD_CONTENT_ANALYZER==='function')return text(await window.H38_SMART_UPLOAD_CONTENT_ANALYZER(file));
  return'';
}
async function analyze(file,options={}){const content=await readableContent(file);return recommendation(file,options,content);}
function selectedContext(options={}){
  const customerId=text(options.customerId||window.H38_CUSTOMER_360?.selectedCustomerId),jobId=text(options.jobId||window.H38_JOB_LIFECYCLE?.selectedJobId?.()),quoteId=text(options.quoteId||window.state?.quote?.quoteId);
  return{customerId,jobId,quoteId};
}
function recommendation(file,options={},content=''){
  const detected=classify(file,options.source,content),context=selectedContext(options),relatedRecordType=context.jobId?'Job':context.quoteId?'Quote':context.customerId?'Customer':'Business',relatedRecordId=context.jobId||context.quoteId||context.customerId||text(window.state?.businessId);
  return{...detected,...context,relatedRecordType,relatedRecordId,requiresConfirmation:detected.confidence<.8||!context.customerId,destination:`${relatedRecordType} ${relatedRecordId||'—'}`};
}
function optionsFor(name,idKeys,labelKeys,selected){return rows(name).map(row=>{const id=idFor(row,...idKeys),label=text(value(row,...labelKeys))||id;return id?`<option value="${id.replace(/"/g,'&quot;')}" ${id===selected?'selected':''}>${label.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</option>`:'';}).join('');}
function review(file,options={}){return new Promise(resolve=>{void analyze(file,options).then(proposed=>{
  const dialog=document.createElement('dialog');dialog.className='h38-smart-upload-dialog';dialog.innerHTML=`<form method="dialog"><header><div><span>SMART UPLOAD</span><h2>Review where this belongs</h2><p>${proposed.originalName}</p></div><button value="cancel" aria-label="Cancel upload">×</button></header><div class="h38-smart-upload-confidence"><strong>${Math.round(proposed.confidence*100)}% confidence</strong><span>${proposed.requiresConfirmation?'Confirmation required':'High-confidence suggestion — still review before saving'} · Based on ${proposed.classificationSource}.</span></div>${proposed.contentPreview?`<div class="notice"><strong>Content found:</strong> ${proposed.contentPreview.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</div>`:''}<label>Document type<input name="documentType" value="${proposed.documentType}"></label><label>Customer<select name="customerId"><option value="">Not linked</option>${optionsFor('customers',['Customer ID','customerId','id'],['Customer Name','name'],proposed.customerId)}</select></label><label>Job<select name="jobId"><option value="">Not linked</option>${optionsFor('jobs',['Job ID','jobId','id'],['Project Title','Job Number'],proposed.jobId)}</select></label><label>Quote<select name="quoteId"><option value="">Not linked</option>${optionsFor('quotes',['Quote ID','quoteId','id'],['Project Title','Quote Number'],proposed.quoteId)}</select></label><div class="notice">The original file is retained. H38 does not silently release, send, approve, purchase, pay, or overwrite a record.</div><footer><button value="cancel" class="secondary">Cancel</button><button type="submit" class="primary">Confirm & save privately</button></footer></form>`;
  document.body.appendChild(dialog);dialog.addEventListener('close',()=>{if(dialog.returnValue!=='confirmed')resolve(null);dialog.remove();},{once:true});dialog.querySelector('form').onsubmit=event=>{event.preventDefault();const data=new FormData(event.currentTarget),customerId=text(data.get('customerId')),jobId=text(data.get('jobId')),quoteId=text(data.get('quoteId')),relatedRecordType=jobId?'Job':quoteId?'Quote':customerId?'Customer':'Business',relatedRecordId=jobId||quoteId||customerId||text(window.state?.businessId);dialog.returnValue='confirmed';dialog.close();resolve({...proposed,documentType:text(data.get('documentType')),customerId,jobId,quoteId,relatedRecordType,relatedRecordId,confirmed:true});};dialog.showModal();
  }).catch(error=>{window.toast?.(`Smart Upload could not inspect this file: ${error?.message||error}`,true);resolve(null);});});}
async function upload(files,options={}){const handler=window.handleAttachmentFiles;if(typeof handler!=='function')throw Error('Document upload is unavailable.');const results=[];for(const file of Array.from(files||[])){const decision=await review(file,options);if(!decision)continue;await handler([file],decision.relatedRecordType,decision.relatedRecordId,'Internal',{customerId:decision.customerId,jobId:decision.jobId,quoteId:decision.quoteId,documentType:decision.documentType,smartUpload:true,classificationConfidence:decision.confidence,uploadSource:options.source||'Documents'});results.push(decision);}return results;}
document.addEventListener('click',event=>{const button=event.target?.closest?.('#uploadDocumentButton');if(!button)return;const input=document.getElementById('documentInput');if(!input?.files?.length)return;event.preventDefault();event.stopImmediatePropagation();void upload(input.files,{source:'Documents'}).then(results=>{if(results.length){input.value='';window.toast?.(`${results.length} file${results.length===1?'':'s'} classified and saved privately.`);}}).catch(error=>window.toast?.(error?.message||String(error),true));},true);
window.H38_SMART_UPLOAD=Object.freeze({build:BUILD,classify,readableContent,analyze,recommendation,review,upload,oneClassificationAuthority:true,contentAwareClassification:true,retainsOriginal:true,confirmationForAmbiguity:true,privateByDefault:true,automaticCustomerRelease:false,automaticCustomerSending:false,automaticApproval:false,automaticPurchase:false,automaticPayment:false});
window.dispatchEvent(new CustomEvent('h38:smart-upload-ready',{detail:{build:BUILD}}));
})();
