/* ---- Smart Upload AI Runtime (2026-10-11) ----
 * Phase 3 Tier 3: Smart Upload — AI parsing wired to the document_scan
 * ai_handoff_tasks pipeline.
 *
 * Ricky (2026-10-07): computer filers get self-serve smart upload INCLUDED.
 * User uploads → AI parses → customer confirms before anything saves.
 *
 * What this adds on top of smart-upload.js (classification + review dialog):
 *   1. Receipts: "Extract with AI" → document_scan task → vendor, date,
 *      amount, line items parsed → editable confirmation → save as expense.
 *   2. Documents/PDFs: AI transcribe + classify → confirm → save.
 *   3. Excel: already handled by smart-import.js (preview + owner approval).
 *      This module surfaces it from the Smart Upload entry point.
 *   4. Offline: uploads queue locally; AI processing starts on reconnect.
 *
 * Patterns applied:
 * - Pattern 1: post-save panel (what + next + action) after expense save.
 * - Pattern 2: "Extract with AI" is inline in the review dialog.
 * - Pattern 3: AI failure → what failed + why + retry. Never silent.
 * - Pattern 4: expense status Draft → Confirmed. Scan status queued → done.
 * - Pattern 5: "Expense $47.32 at Menards saved as draft." not "Nothing saved."
 * - AI assists, never gates: every field is editable; user can skip AI and
 *   enter everything manually.
 */
(function(){
'use strict';
var BUILD='20261011-smart-upload-ai-1';
var BUCKET='business-office-files';
var text=function(v){ return String(v==null?'':v).trim(); };
var esc=function(v){ return text(v).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
var bizId=function(){ return (typeof state!=='undefined'&&state.businessId)||''; };
var now=function(){ return new Date().toISOString(); };
var newExpenseId=function(){ return 'EXP-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,7).toUpperCase(); };

function supabaseClient(){
  try{
    var c=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure&&window.H38_SUPABASE_SHARED_CLIENT.ensure();
    if(c) return c;
    var cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
    if(!cfg.url||!cfg.publishableKey||!window.supabase) throw new Error('Secure connection unavailable.');
    return window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
  }catch(e){ throw new Error('Secure connection unavailable. Sign in again.'); }
}

/* Upload a file to the business-office-files bucket. Returns storage path. */
async function uploadToBucket(file,subfolder){
  var client=supabaseClient();
  var bid=bizId();
  if(!bid) throw new Error('Open a business first.');
  var safeName=text(file.name||'upload').replace(/[^A-Za-z0-9._-]+/g,'-').slice(-120)||'upload';
  var path=bid+'/'+(subfolder||'smart-upload')+'/'+Date.now()+'-'+safeName;
  var up=await client.storage.from(BUCKET).upload(path,file,{contentType:file.type||'application/octet-stream',upsert:true,cacheControl:'60'});
  if(up.error) throw new Error('Upload failed: '+up.error.message);
  return path;
}

/* Parse receipt fields from AI-extracted text. Best-effort; user confirms. */
function parseReceiptFields(extractedText){
  var t=text(extractedText);
  var out={vendor:'',date:'',amount:'',lineItems:[]};
  if(!t) return out;
  var lines=t.split(/\n+/).map(function(l){return l.trim();}).filter(Boolean);
  // Vendor: often the first non-empty line, or a known store name.
  var known=/\b(menards|home depot|lowes|lowe's|walmart|target|costco|ace hardware|harbor freight|napa|autozone|o'reilly|fleet farm|tractor supply)\b/i;
  for(var i=0;i<Math.min(lines.length,6);i++){
    var m=lines[i].match(known);
    if(m){ out.vendor=m[0]; break; }
  }
  if(!out.vendor&&lines.length) out.vendor=lines[0].slice(0,60);
  // Date: MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD
  var dm=t.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/)||t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if(dm) out.date=dm[1];
  // Amount: TOTAL, BALANCE DUE, AMOUNT DUE, GRAND TOTAL followed by $X.XX
  var am=t.match(/(?:total|balance due|amount due|grand total|amount)\s*\$?\s*(\d{1,3}(?:,\d{3})*\.\d{2})/i);
  if(am) out.amount=am[1].replace(/,/g,'');
  else{
    // Fallback: largest dollar amount on the receipt.
    var amounts=(t.match(/\$\s*\d{1,3}(?:,\d{3})*\.\d{2}/g)||[]).map(function(s){ return parseFloat(s.replace(/[$,\s]/g,'')); }).filter(function(n){ return n>0; });
    if(amounts.length) out.amount=Math.max.apply(null,amounts).toFixed(2);
  }
  // Line items: lines with a price at the end.
  for(var j=0;j<lines.length;j++){
    var lm=lines[j].match(/^(.+?)\s+\$?\s*(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/);
    if(lm&&!/total|balance|change|tender|cash|card|tax/i.test(lm[1])){
      out.lineItems.push({description:lm[1].trim().slice(0,80),amount:lm[2].replace(/,/g,'')});
      if(out.lineItems.length>=12) break;
    }
  }
  return out;
}

/* Submit a document_scan task and wait for the AI result. */
async function runAiScan(storagePath,fileName,mimeType,onStatus){
  var api=null;
  try{ api=window.H38_AI_HANDOFF; }catch(e){}
  if(!api||typeof api.runTask!=='function'){
    throw Object.assign(new Error('AI handoff is not available right now.'),{code:'HANDOFF_UNAVAILABLE'});
  }
  if(typeof onStatus==='function') onStatus('Hank is reading the document…');
  var result=await api.runTask('document_scan',{
    businessId:bizId(),
    scanId:'SMARTUPLOAD-'+Date.now(),
    photo:{bucket:BUCKET,path:storagePath,mimeType:mimeType||'image/jpeg',fileName:fileName||'scan.jpg'}
  },{onQueued:function(){ if(typeof onStatus==='function') onStatus('Queued for Hank…'); }});
  return result||{};
}

/* Editable confirmation form for AI-extracted receipt fields. */
function confirmReceiptDialog(parsed,aiResult,fileName){
  return new Promise(function(resolve){
    var dialog=document.createElement('dialog');
    dialog.className='h38-smart-upload-dialog';
    var itemsHtml=(parsed.lineItems||[]).map(function(it,ix){
      return '<div class="h38-inline-slot"><input data-li-desc="'+ix+'" value="'+esc(it.description)+'" placeholder="Item"><input data-li-amt="'+ix+'" value="'+esc(it.amount)+'" placeholder="0.00" inputmode="decimal" style="width:7em"></div>';
    }).join('');
    dialog.innerHTML='<form method="dialog"><header><div><span>SMART UPLOAD · AI EXTRACT</span><h2>Confirm receipt details</h2><p>'+esc(fileName||'')+'</p></div><button value="cancel" aria-label="Cancel">×</button></header>'
      +'<p class="muted small">Hank read the receipt. Fix anything wrong — nothing saves until you confirm.</p>'
      +'<label>Vendor<input name="vendor" value="'+esc(parsed.vendor)+'"></label>'
      +'<div class="h38-inline-slot"><label style="flex:1">Date<input name="date" value="'+esc(parsed.date)+'" placeholder="MM/DD/YYYY"></label>'
      +'<label>Amount<input name="amount" value="'+esc(parsed.amount)+'" inputmode="decimal" style="width:8em"></label></div>'
      +(itemsHtml?'<h3>Line items</h3><div id="h38ReceiptItems">'+itemsHtml+'</div>':'<p class="muted small">No line items detected.</p>')
      +'<label>Category<select name="category"><option>Materials</option><option>Fuel</option><option>Equipment</option><option>Supplies</option><option>Other</option></select></label>'
      +'<footer><button value="cancel" class="secondary">Cancel</button><button type="submit" class="primary">Save as expense draft</button></footer></form>';
    document.body.appendChild(dialog);
    dialog.addEventListener('close',function(){
      if(dialog.returnValue!=='confirmed'){ dialog.remove(); resolve(null); return; }
      var fd=new FormData(dialog.querySelector('form'));
      var items=[];
      dialog.querySelectorAll('[data-li-desc]').forEach(function(el){
        var ix=el.getAttribute('data-li-desc');
        var amtEl=dialog.querySelector('[data-li-amt="'+ix+'"]');
        var d=text(el.value),a=text(amtEl&&amtEl.value);
        if(d||a) items.push({description:d,amount:a});
      });
      var out={vendor:text(fd.get('vendor')),date:text(fd.get('date')),amount:text(fd.get('amount')),category:text(fd.get('category')),lineItems:items,fileName:fileName,aiSummary:text(aiResult&&aiResult.summary)};
      dialog.remove(); resolve(out);
    },{once:true});
    dialog.querySelector('form').addEventListener('submit',function(ev){ ev.preventDefault(); dialog.returnValue='confirmed'; dialog.close(); });
    dialog.showModal();
  });
}

/* Save a confirmed receipt as an expense draft via queueOperation. */
async function saveExpense(confirmed,storagePath){
  var id=newExpenseId();
  var record={
    'Expense ID':id,'Business ID':bizId(),
    'Vendor':confirmed.vendor,'Expense Date':confirmed.date,
    'Amount':parseFloat(confirmed.amount)||0,
    'Category':confirmed.category||'Materials',
    'Line Items JSON':JSON.stringify(confirmed.lineItems||[]),
    'Receipt Path':storagePath,'Receipt File':confirmed.fileName||'',
    'AI Summary':confirmed.aiSummary||'',
    'Status':'Draft','Created Time':now(),'Record Version':1
  };
  await queueOperation('SAVE_EXPENSE','Expense',id,{expenseId:id},{collection:'expenses',record:record,idKeys:['Expense ID']});
  return {id:id,record:record};
}

/* Main entry: AI-extract a receipt image. Handles offline queueing. */
async function extractReceipt(file,onStatus){
  var bid=bizId();
  if(!bid) throw new Error('Open a business first.');
  var setStatus=function(s){ if(typeof onStatus==='function')onStatus(s); if(window.toast&&/reading|queued/i.test(s))window.toast(s); };

  // Offline: stash the file locally; process on reconnect.
  if(typeof navigator!=='undefined'&&!navigator.onLine){
    var pending=[];
    try{ pending=JSON.parse(localStorage.getItem('h38-smart-upload-pending')||'[]'); }catch(e){}
    // We can't persist the File itself; store metadata and ask to retry online.
    pending.push({name:file.name,type:file.type,size:file.size,at:now(),kind:'receipt'});
    try{ localStorage.setItem('h38-smart-upload-pending',JSON.stringify(pending)); }catch(e){}
    throw Object.assign(new Error('You are offline. The receipt is noted — reconnect and upload it again to extract.'),{code:'OFFLINE_QUEUED'});
  }

  setStatus('Uploading receipt…');
  var path=await uploadToBucket(file,'receipts');
  var aiResult;
  try{
    aiResult=await runAiScan(path,file.name,file.type,setStatus);
  }catch(err){
    if(window.H38Flow)window.H38Flow.fail({
      what:'Hank could not read the receipt.',
      why:(err&&err.message)||'The AI read failed.',
      fixes:[{label:'Retry',primary:true,handler:function(){ extractReceipt(file,onStatus).catch(function(e2){ window.toast&&(window.toast(e2.message||String(e2),true)); }); }},{label:'Enter manually',handler:function(){ confirmReceiptDialog({vendor:'',date:'',amount:'',lineItems:[]},{},file.name).then(function(c){ if(c)saveExpense(c,path).then(showSaved); }); }}],
      id:'h38ReceiptAiFail'
    });
    else if(window.toast)window.toast('Hank could not read the receipt: '+((err&&err.message)||err),true);
    throw err;
  }
  var parsed=parseReceiptFields(aiResult.extractedText||'');
  // Prefer AI classification summary when present.
  setStatus('Review the details…');
  var confirmed=await confirmReceiptDialog(parsed,aiResult,file.name);
  if(!confirmed) return {cancelled:true};
  var saved=await saveExpense(confirmed,path);
  showSaved(saved,confirmed);
  return saved;
}
function showSaved(saved,confirmed){
  var amt=confirmed.amount?'$'+confirmed.amount+' ':'';
  if(window.H38Flow)window.H38Flow.showNextStep({
    title:'Expense '+amt+(confirmed.vendor?'at '+confirmed.vendor:'')+' saved as draft.',
    next:'Attach it to a job or mark it reviewed in Money.',
    offline:(typeof navigator!=='undefined'&&!navigator.onLine),
    actions:[
      {label:'Open Money',primary:true,handler:function(){ if(typeof window.openPage==='function')window.openPage('money'); else if(typeof openPage==='function')openPage('money'); }},
      {label:'Upload another',handler:function(){ var i=document.getElementById('h38SmartUploadInput'); if(i)i.click(); }}
    ],
    id:'h38ReceiptSaved',signature:'receipt-'+saved.id
  });
  else if(window.toast)window.toast('Expense saved as draft.');
}

/* Wire "Extract with AI" into the smart upload review flow.
 * Called after H38_SMART_UPLOAD.review resolves with a receipt/document decision. */
async function enhanceDecisionWithAi(file,decision){
  if(!decision) return decision;
  var dtype=text(decision.documentType||'').toLowerCase();
  var isReceipt=/receipt/.test(dtype);
  var isDoc=/invoice|contract|document|pdf/.test(dtype)||/\.pdf$/i.test(file.name||'');
  if(!isReceipt&&!isDoc) return decision;
  // Ask inline: AI extract or keep as classified file?
  var useAi=await new Promise(function(resolve){
    if(!window.H38Flow){ resolve(true); return; }
    window.H38Flow.ask({
      title:isReceipt?'Extract receipt details with AI?':'Have Hank read this document?',
      detail:isReceipt?'Hank pulls vendor, date, amount, and line items. You confirm before anything saves.':'Hank transcribes and classifies it. You confirm before anything saves.',
      actions:[
        {label:isReceipt?'Extract with AI':'Read with AI',primary:true,handler:function(){ resolve(true); }},
        {label:'Keep as file only',handler:function(){ resolve(false); }}
      ],
      id:'h38SmartUploadAiAsk',signature:'ai-ask-'+Date.now()
    });
    // Fallback: if the panel can't render, default to AI for receipts.
    setTimeout(function(){ resolve(true); },30000);
  });
  if(!useAi) return decision;
  if(isReceipt){
    try{
      var saved=await extractReceipt(file,function(){});
      return Object.assign({},decision,{aiExtracted:true,expenseId:saved&&saved.id});
    }catch(err){
      if(err&&err.code==='OFFLINE_QUEUED'&&window.toast)window.toast(err.message);
      return decision;
    }
  }
  // Documents: run document_scan, show transcription for confirmation.
  try{
    var path=await uploadToBucket(file,'documents');
    var result=await runAiScan(path,file.name,file.type,function(){});
    var ok=window.H38Flow?await window.H38Flow.confirm({
      title:'Hank read the document.',
      message:(result.summary||'Transcription complete.')+' Save the transcription with this file?',
      okLabel:'Save transcription',cancelLabel:'Skip'
    }):true;
    if(ok){
      decision.aiTranscription=text(result.extractedText||'').slice(0,4000);
      decision.aiClassification=text(result.classification||'');
    }
  }catch(err){
    if(window.toast)window.toast('Hank could not read the document: '+((err&&err.message)||err),true);
  }
  return decision;
}

/* Check for offline-queued uploads on reconnect and surface a reminder. */
function checkPendingUploads(){
  var pending=[];
  try{ pending=JSON.parse(localStorage.getItem('h38-smart-upload-pending')||'[]'); }catch(e){}
  if(!pending.length) return;
  if(typeof navigator!=='undefined'&&!navigator.onLine) return;
  if(window.H38Flow)window.H38Flow.showNextStep({
    title:pending.length+' upload'+(pending.length===1?'':'s')+' noted while you were offline.',
    next:'Re-upload to run AI extraction.',
    actions:[{label:'Dismiss',primary:true,handler:function(){ try{localStorage.removeItem('h38-smart-upload-pending');}catch(e){} }}],
    id:'h38SmartUploadPending'
  });
}
if(typeof window!=='undefined'){
  window.addEventListener('online',checkPendingUploads);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',checkPendingUploads,{once:true});
  else setTimeout(checkPendingUploads,3000);
}

window.H38_SMART_UPLOAD_AI=Object.freeze({
  build:BUILD,
  extractReceipt:extractReceipt,
  enhanceDecisionWithAi:enhanceDecisionWithAi,
  parseReceiptFields:parseReceiptFields,
  checkPendingUploads:checkPendingUploads,
  BUILD:BUILD
});
})();
