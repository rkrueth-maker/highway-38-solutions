(function(){
'use strict';
const BUILD='20260807-1435';
const text=v=>String(v==null?'':v);
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const field=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const esc=v=>text(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const records=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:(typeof window.records==='function'?window.records(name):[]);
const api=()=>window.H38_SUPABASE_SHARED_CLIENT?.ensure?.();
let busy=false;
let localPdfUrl='';
let displaySource={key:'',url:'',promise:null};

function quoteRecord(){const id=text(window.state?.quote?.quoteId);return records('quotes').find(row=>text(field(row,'Quote ID','quoteId'))===id)||{};}
function quoteId(){return text(window.state?.quote?.quoteId||field(quoteRecord(),'Quote ID','quoteId'));}
function sourceRows(){const id=quoteId();return records('documents').filter(row=>text(field(row,'Source Type','sourceType')).toLowerCase()==='quote'&&text(field(row,'Source ID','sourceId'))===id&&text(field(row,'Mime Type','mimeType')).toLowerCase().startsWith('image/'));}
function originalSource(){const record=quoteRecord(),wanted=text(field(record,'Render Source File','renderSourceFile')).trim(),rows=sourceRows().filter(row=>field(row,'Render Normalized Source','renderNormalizedSource')!==true);if(!rows.length)return null;if(wanted){const exact=rows.find(row=>text(field(row,'File Name','fileName'))===wanted||text(field(row,'Storage Path','storagePath')).endsWith('/'+wanted));if(exact)return exact;}return rows.find(row=>field(row,'Render Source','renderSource')===true)||rows[0];}
function storageInfo(row){return{bucket:text(field(row,'Storage Bucket','storageBucket'))||'business-office-files',path:text(field(row,'Storage Path','storagePath')),fileName:text(field(row,'File Name','fileName')),size:num(field(row,'File Size','fileSize'))};}

function exifOrientation(buffer){
  try{
    const view=new DataView(buffer);
    if(view.byteLength<4||view.getUint16(0,false)!==0xFFD8)return 1;
    let offset=2;
    while(offset+4<=view.byteLength){
      if(view.getUint8(offset)!==0xFF){offset+=1;continue;}
      const marker=view.getUint8(offset+1);
      if(marker===0xDA||marker===0xD9)break;
      if(offset+4>view.byteLength)break;
      const length=view.getUint16(offset+2,false);
      if(length<2||offset+2+length>view.byteLength)break;
      if(marker===0xE1&&length>=10){
        const exif=offset+4;
        if(exif+6<view.byteLength&&view.getUint32(exif,false)===0x45786966&&view.getUint16(exif+4,false)===0){
          const tiff=exif+6;
          const endian=view.getUint16(tiff,false);
          const little=endian===0x4949;
          if(!little&&endian!==0x4D4D)return 1;
          const read16=p=>view.getUint16(p,little),read32=p=>view.getUint32(p,little);
          if(read16(tiff+2)!==0x002A)return 1;
          const ifd=tiff+read32(tiff+4);
          if(ifd+2>view.byteLength)return 1;
          const count=read16(ifd);
          for(let i=0;i<count;i++){
            const entry=ifd+2+i*12;
            if(entry+12>view.byteLength)break;
            if(read16(entry)===0x0112){
              const type=read16(entry+2),items=read32(entry+4);
              let value=1;
              if(type===3&&items===1)value=read16(entry+8);
              return value>=1&&value<=8?value:1;
            }
          }
        }
      }
      offset+=2+length;
    }
  }catch(_){}
  return 1;
}
function orientationLabel(o){return({1:'normal',2:'mirror-horizontal',3:'rotate-180',4:'mirror-vertical',5:'transpose',6:'rotate-90-cw',7:'transverse',8:'rotate-90-ccw'})[o]||'normal';}
async function signedUrl(row,expires=900){const info=storageInfo(row),client=api();if(!client||!info.path)return'';const result=await client.storage.from(info.bucket).createSignedUrl(info.path,expires);if(result.error)throw result.error;return text(result.data?.signedUrl);}
async function sourceBlob(row){const url=await signedUrl(row,900);if(!url)throw new Error('Original jobsite photo could not be opened.');const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error(`Original jobsite photo could not be loaded (${response.status}).`);return response.blob();}
async function canonicalBlob(row){
  const blob=await sourceBlob(row),buffer=await blob.arrayBuffer(),orientation=exifOrientation(buffer);
  if(typeof createImageBitmap!=='function')throw new Error('This phone browser cannot create a deterministic upright jobsite image.');
  let bitmap;
  try{bitmap=await createImageBitmap(new Blob([buffer],{type:blob.type||'image/jpeg'}),{imageOrientation:'none'});}catch(_){throw new Error('This phone browser cannot decode the raw camera orientation safely. No render was created.');}
  const sw=bitmap.width,sh=bitmap.height,swap=orientation>=5&&orientation<=8,ow=swap?sh:sw,oh=swap?sw:sh,max=1800,scale=Math.min(1,max/Math.max(ow,oh));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(ow*scale));canvas.height=Math.max(1,Math.round(oh*scale));
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx){bitmap.close?.();throw new Error('The upright jobsite image canvas could not be created.');}
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(scale,scale);
  switch(orientation){
    case 2:ctx.transform(-1,0,0,1,sw,0);break;
    case 3:ctx.transform(-1,0,0,-1,sw,sh);break;
    case 4:ctx.transform(1,0,0,-1,0,sh);break;
    case 5:ctx.transform(0,1,1,0,0,0);break;
    case 6:ctx.transform(0,1,-1,0,sh,0);break;
    case 7:ctx.transform(0,-1,-1,0,sh,sw);break;
    case 8:ctx.transform(0,-1,1,0,0,sw);break;
    default:break;
  }
  ctx.drawImage(bitmap,0,0);bitmap.close?.();
  const out=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));
  if(!out)throw new Error('The upright jobsite photo could not be encoded.');
  return{blob:out,orientation,label:orientationLabel(orientation),width:canvas.width,height:canvas.height};
}
async function displayUrl(){
  const row=originalSource();if(!row)return'';
  const info=storageInfo(row),key=`${quoteId()}|${info.path}|exif`;
  if(displaySource.key===key&&displaySource.url)return displaySource.url;
  if(displaySource.key===key&&displaySource.promise)return displaySource.promise;
  displaySource.key=key;
  displaySource.promise=(async()=>{const canonical=await canonicalBlob(row);if(displaySource.url)URL.revokeObjectURL(displaySource.url);displaySource.url=URL.createObjectURL(canonical.blob);return displaySource.url;})().finally(()=>{displaySource.promise=null;});
  return displaySource.promise;
}
async function normalizeOriginals(root=document){
  const url=await displayUrl().catch(error=>{console.error('Jobsite orientation normalization failed',error);return'';});if(!url)return;
  root.querySelectorAll?.('.quote-render-images figure,.quote-concept-grid figure').forEach(figure=>{
    const caption=text(figure.querySelector('figcaption')?.textContent).toLowerCase();
    if(!caption.includes('before')&&!caption.includes('original jobsite'))return;
    const img=figure.querySelector('img');if(!img||img.dataset.h38CanonicalSource===displaySource.key)return;
    img.src=url;img.dataset.h38CanonicalSource=displaySource.key;img.style.transform='none';img.style.width='100%';img.style.height='auto';img.style.maxHeight='420px';img.style.objectFit='contain';img.style.imageOrientation='none';
  });
}
async function ensureCanonicalRenderSource(){
  const row=originalSource();if(!row)throw new Error('The exact render source photo is not linked to this quote.');
  const businessId=text(window.state?.businessId),id=quoteId(),client=api();if(!businessId||!id||!client)throw new Error('The secure Business Office is not ready to prepare the render source.');
  const original=storageInfo(row),canonical=await canonicalBlob(row),base=text(original.fileName||'jobsite.jpg').replace(/\.[^.]+$/,''),fileName=`${base}-canonical-exif-${canonical.orientation}.jpg`,path=`${businessId}/Quote/${id}/source-canonical/${fileName}`;
  const upload=await client.storage.from('business-office-files').upload(path,canonical.blob,{contentType:'image/jpeg',upsert:true,cacheControl:'3600'});if(upload.error)throw upload.error;
  let userId=text(window.H38_SUPABASE_AUTH?.getState?.().userId);if(!userId){const session=await client.auth.getSession();userId=text(session.data?.session?.user?.id);}if(!userId)throw new Error('Supabase Auth session is required to prepare the render source.');
  const recordKey=`CANONICAL-RENDER-SOURCE-${id}`,payload={'Document ID':recordKey,'Business ID':businessId,'File Name':fileName,'File Size':canonical.blob.size,'Mime Type':'image/jpeg','Source Type':'Quote','Source ID':id,'Storage Bucket':'business-office-files','Storage Path':path,'Access Classification':'Internal','Status':'Available — Private','Render Source':true,'Render Normalized Source':true,'Canonical Source':true,'Normalized From File':original.fileName,'Normalized From Path':original.path,'Source EXIF Orientation':canonical.orientation,'Source EXIF Meaning':canonical.label,'Canonical Orientation':1,'Canonical Width':canonical.width,'Canonical Height':canonical.height,'Created Time':new Date().toISOString(),'Updated Time':new Date().toISOString(),'Record Version':1};
  const saved=await client.from('business_records').upsert({business_id:businessId,collection:'documents',record_key:recordKey,payload,record_status:'active',created_by:userId,updated_by:userId,updated_at:new Date().toISOString()},{onConflict:'business_id,collection,record_key'});if(saved.error)throw saved.error;
  if(window.state?.snapshot){if(!Array.isArray(window.state.snapshot.documents))window.state.snapshot.documents=[];const list=window.state.snapshot.documents,index=list.findIndex(item=>text(field(item,'Document ID','documentId'))===recordKey);if(index>=0)list[index]=payload;else list.unshift(payload);}
  return{fileName,path,bucket:'business-office-files',orientation:canonical.orientation,label:canonical.label,originalFileName:original.fileName};
}
function installRenderNormalization(){
  const Bridge=window.H38Bridge;if(!Bridge?.prototype||Bridge.prototype.__h38CanonicalExifSource)return;
  const previous=Bridge.prototype.request;
  Bridge.prototype.request=async function(action,args,timeout){
    if(action!=='aiRenderQuoteConcept')return previous.call(this,action,args,timeout);
    const q=window.state?.quote||{},oldName=q.renderSourceFileName,oldPath=q.renderSourcePath,canonical=await ensureCanonicalRenderSource();
    q.renderSourceFileName=canonical.fileName;q.renderSourcePath=canonical.path;
    const next=Object.assign({},args||{}, {renderSourceFileName:canonical.fileName,renderSourcePath:canonical.path,renderSourceRotation:0,h38CanonicalRenderSource:true,notes:[text(args?.notes),`CANONICAL SOURCE: ${canonical.fileName}. This is a physically upright JPEG created from ${canonical.originalFileName} by applying EXIF orientation ${canonical.orientation} (${canonical.label}) exactly once. Do not rotate, mirror, crop, replace, or reconstruct the source. Preserve the same yard, deck, wood pile, trees, grade, lighting, camera position and perspective. Add only the requested retaining wall/stairs/work.`].filter(Boolean).join('\n\n')});
    try{return await previous.call(this,action,next,timeout);}finally{q.renderSourceFileName=oldName;q.renderSourcePath=oldPath;}
  };
  Bridge.prototype.__h38CanonicalExifSource=true;
}

function customerRecord(){const q=window.state?.quote||{},record=quoteRecord(),customerId=text(q.customerId||field(record,'Customer ID','customerId'));return records('customers').find(row=>text(field(row,'Customer ID','customerId'))===customerId)||{};}
function quoteData(){const q=window.state?.quote||{},record=quoteRecord(),customer=customerRecord(),lines=Array.isArray(q.lines)?q.lines:[],addOns=Array.isArray(q.aiOptionalAddOns)?q.aiOptionalAddOns:[],total=lines.reduce((sum,line)=>sum+num(line.quantity)*num(line.unitPrice),0)+num(field(record,'Tax','tax'));return{quoteId:quoteId(),quoteNumber:text(q.quoteNumber||field(record,'Quote Number','quoteNumber')||q.quoteId||'Quote'),revision:Math.max(1,Math.trunc(num(q.revision||field(record,'Revision','revision')||1))),title:text(q.projectTitle||field(record,'Project Title','projectTitle')||'Project Proposal'),scope:text(q.scope||field(record,'Customer Scope','customerScope','Scope','scope')||'Work will be completed as described in the itemized proposal.'),customerName:text(field(customer,'Customer Name','Name','customerName','name')||window.customerName?.(q.customerId)||'Quote Customer'),lines,addOns,total};}
function safeFile(value){return text(value).replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120)||'quote';}
function statusPanel(){let node=document.getElementById('h38RealPdfStatus');if(node)return node;const tools=document.querySelector('.page-tools');if(!tools)return null;node=document.createElement('div');node.id='h38RealPdfStatus';node.className='notice h38-real-pdf-status';node.setAttribute('role','status');node.setAttribute('aria-live','polite');tools.insertAdjacentElement('afterend',node);return node;}
function showStatus(message,error){const node=statusPanel();if(node){node.className=`notice h38-real-pdf-status${error?' warn':''}`;node.textContent=message;}window.toast?.(message,Boolean(error));}
function showPdfLinks(viewUrl,downloadUrl,fileName,server){const node=statusPanel();if(!node)return;node.className='notice h38-real-pdf-status';node.innerHTML=`<strong>${server?'Stored proposal PDF':'PDF created'}.</strong><div class="actions h38-pdf-actions"><a class="btn" id="h38OpenGeneratedPdf" href="${esc(viewUrl)}" target="_blank" rel="noopener">Open PDF</a><a class="btn secondary" href="${esc(downloadUrl||viewUrl)}" target="_blank" rel="noopener" ${server?'':'download="'+esc(fileName)+'"'}>Download PDF</a></div><span class="muted">Open the PDF first, then use the Android PDF viewer Print command if you want a paper copy. Nothing is sent by this button.</span>`;node.scrollIntoView({block:'nearest',behavior:'smooth'});}
async function storedPdf(){const record=quoteRecord(),path=text(field(record,'PDF Storage Path','pdfStoragePath'));if(!path)return null;const client=api();if(!client)throw new Error('Secure storage is not ready.');const [view,download]=await Promise.all([client.storage.from('customer-portal').createSignedUrl(path,600),client.storage.from('customer-portal').createSignedUrl(path,600,{download:true})]);if(view.error)throw view.error;if(!view.data?.signedUrl)throw new Error('Stored proposal PDF could not be opened.');return{viewUrl:view.data.signedUrl,downloadUrl:download.data?.signedUrl||view.data.signedUrl,fileName:path.split('/').pop()||'quote.pdf'};}
function pdfText(value){return text(value).replace(/[^\x20-\x7E]/g,' ');}
async function buildLocalPdf(){
  const d=quoteData();if(!d.quoteId||!d.lines.length)throw new Error('Open a saved quote with line items before creating a PDF.');if(!window.PDFLib?.PDFDocument)throw new Error('PDF engine did not load. Refresh the Business Office and try again.');
  const{PDFDocument,StandardFonts,rgb}=window.PDFLib,pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),pageSize=[612,792],margin=44;let page=pdf.addPage(pageSize),y=744;
  const newPage=()=>{page=pdf.addPage(pageSize);y=744;};const draw=(value,size=10,strong=false)=>{if(y<55)newPage();page.drawText(pdfText(value).slice(0,520),{x:margin,y,size,font:strong?bold:regular,color:rgb(.05,.12,.18)});y-=size+6;};
  page.drawText('HIGHWAY 38 SOLUTIONS',{x:margin,y:752,size:18,font:bold,color:rgb(.05,.12,.18)});y=716;draw(`Quote ${d.quoteNumber} - Revision ${d.revision}`,11,true);draw(`Prepared for: ${d.customerName}`,11,true);draw(d.title,16,true);draw(d.scope,9);y-=8;draw('Itemized proposal',11,true);
  for(const item of d.lines){const qty=num(item.quantity),rate=num(item.unitPrice);draw(`${text(item.customerDescription||item.description||'Project work').slice(0,62)} - ${qty} ${text(item.unit||'each')} - $${(qty*rate).toFixed(2)}`,9);}if(d.addOns.length){y-=6;draw('Optional add-ons - not included in total',11,true);for(const item of d.addOns){const qty=num(item.quantity||1),rate=num(item.unitPrice);draw(`[ ] ${text(item.description||'Optional work').slice(0,58)} - $${(qty*rate).toFixed(2)}`,9);}}y-=8;draw(`PROPOSAL TOTAL: $${d.total.toFixed(2)}`,14,true);
  const source=originalSource();if(source){try{const canonical=await canonicalBlob(source),bytes=new Uint8Array(await canonical.blob.arrayBuffer()),image=await pdf.embedJpg(bytes),p=pdf.addPage(pageSize),scale=Math.min(524/image.width,650/image.height,1),w=image.width*scale,h=image.height*scale;p.drawText('Before - original jobsite',{x:margin,y:744,size:12,font:bold,color:rgb(.05,.12,.18)});p.drawImage(image,{x:margin,y:720-h,width:w,height:h});}catch(error){console.warn('PDF source image skipped',error);}}
  const bytes=await pdf.save(),blob=new Blob([bytes],{type:'application/pdf'});if(localPdfUrl)URL.revokeObjectURL(localPdfUrl);localPdfUrl=URL.createObjectURL(blob);return{viewUrl:localPdfUrl,downloadUrl:localPdfUrl,fileName:`${safeFile(d.quoteNumber)}-revision-${d.revision}.pdf`};
}
async function openPdf(){if(busy)return;busy=true;const button=document.getElementById('h38CreatePdfButton'),target=window.open('about:blank','_blank');if(target)target.opener=null;if(button){button.disabled=true;button.textContent='Opening PDF...';}window.H38_WORKING_HAMMER?.show?.('Opening quote PDF','Using the stored customer PDF when available',button||null);try{const stored=await storedPdf();if(stored){showPdfLinks(stored.viewUrl,stored.downloadUrl,stored.fileName,true);if(target&&!target.closed)target.location.replace(stored.viewUrl);else window.location.assign(stored.viewUrl);return;}const local=await buildLocalPdf();showPdfLinks(local.viewUrl,local.downloadUrl,local.fileName,false);if(target&&!target.closed)target.location.replace(local.viewUrl);}catch(error){try{target?.close();}catch(_){}showStatus(`PDF could not open: ${error.message||error}`,true);}finally{busy=false;if(button){button.disabled=false;button.textContent=text(field(quoteRecord(),'PDF Storage Path','pdfStoragePath'))?'Open PDF':'Create PDF';}window.H38_WORKING_HAMMER?.hide?.(button||null);}}
function preparePdfControl(){const old=document.getElementById('printQuoteButton')||document.getElementById('h38PhonePrintSaveButton')||document.getElementById('h38CreatePdfButton');if(!old)return;old.id='h38CreatePdfButton';old.textContent=text(field(quoteRecord(),'PDF Storage Path','pdfStoragePath'))?'Open PDF':'Create PDF';old.removeAttribute('onclick');let note=document.getElementById('h38PdfHelp');if(!note){note=document.createElement('span');note.id='h38PdfHelp';note.className='muted h38-pdf-help';note.textContent='Opens a real PDF file. Print from the Android PDF viewer.';old.insertAdjacentElement('afterend',note);}}
function refresh(){preparePdfControl();void normalizeOriginals(document);installRenderNormalization();}
const observer=new MutationObserver(()=>refresh());observer.observe(document.documentElement,{subtree:true,childList:true});
document.addEventListener('click',event=>{const button=event.target?.closest?.('#h38CreatePdfButton');if(!button)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();void openPdf();},true);
const style=document.createElement('style');style.textContent='.h38-pdf-help{display:inline-block;max-width:320px;margin-left:8px;vertical-align:middle}.h38-pdf-actions{margin-top:10px}.h38-real-pdf-status a.btn{text-decoration:none}.quote-render-images img,.quote-concept-grid img{image-orientation:none}@media(max-width:640px){.h38-pdf-help{display:block;margin:6px 0 0}}@media print{.h38-pdf-help,.h38-real-pdf-status{display:none!important}}';document.head.appendChild(style);
setTimeout(refresh,0);
window.H38_QUOTE_FINAL_PHONE_FIX=Object.freeze({enabled:true,build:BUILD,storedPdfFirst:true,actualPdfViewer:true,noWindowPrint:true,exifMetadataAuthority:true,manualRotationOverride:false,canonicalRenderSource:true,automaticSending:false,openPdf,ensureCanonicalRenderSource,normalizeOriginals,refresh});
})();
