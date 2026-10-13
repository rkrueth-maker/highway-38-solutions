/* ---- H38 Quick Start: Photo → Quote — "First Value in 60 Seconds" (2026-10-11) ----
 *
 * Alternative entry point for brand-new owners: experience the magic FIRST
 * (photo → Kit drafts quote lines → review → send), then run the 6-step
 * setup wizard afterwards. The wizard is untouched — this is an entry ramp,
 * not a replacement.
 *
 * Flow:
 *   0. Photo prompt — "📸 Take a photo of the job — Kit will build your
 *      first quote" (+ business name / customer name, 2 fields max).
 *   1. Build lines — Kit tries the AI handoff (quote_build with the photo
 *      storage path); static suggestion packs by business type always
 *      guarantee progress. Tap suggestions to add. Manual add supported.
 *   2. Review — editable lines, totals, project title, notes.
 *   3. Done — saved/sent summary + "Complete Setup →" (lazy-loads the
 *      6-step wizard) + setup reminders (AI receptionist, Stripe).
 *
 * Principles:
 * - AI assists, never gates: everything works manually. Photo upload
 *   failing never blocks; the local preview + manual entry carry the flow.
 * - Real quotes: saved through the canonical queueOperation SAVE_QUOTE
 *   path into the quotes collection (same record shape as Quote Builder).
 * - "Send" is honest: marks Presented/Sent exactly like the Quote Builder's
 *   mark-as-sent, after owner confirmation. Nothing is emailed automatically.
 * - No dead ends: every screen has a clear next action + a way home.
 * - Mobile-first: .h38-flow-view tokens, ≥52px touch targets.
 */
(function(){
'use strict';
var BUILD='20261013-recordings-polish-1';
var BUCKET='business-office-files';
var ONBOARDING_BUILD='20261013-recordings-polish-1';

var text=function(v){ return String(v==null?'':v).trim(); };
var esc=function(v){ return text(v).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
var num=function(v){ var n=parseFloat(v); return isFinite(n)?n:0; };
var money=function(v){ try{ if(typeof window.money==='function') return window.money(v); }catch(e){}
  return '$'+num(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','); };
var bizId=function(){ try{ return (typeof state!=='undefined'&&state.businessId)||''; }catch(e){ return ''; } };
var businessType=function(){
  try{ return String((typeof state!=='undefined'&&state.snapshot&&state.snapshot.business&&state.snapshot.business.businessType)||'').toLowerCase(); }
  catch(e){ return ''; }
};
var nowIso=function(){ return new Date().toISOString(); };
var newId=function(prefix){
  try{ if(window.H38DB&&typeof window.H38DB.newId==='function') return window.H38DB.newId(prefix); }catch(e){}
  return prefix+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,8).toUpperCase();
};
function toast(msg,bad){ try{ if(typeof window.toast==='function') window.toast(msg,!!bad); }catch(e){} }
function goHome(){ try{ if(window.openPage) window.openPage('today'); }catch(e){} }
function root(){ return document.getElementById('mainContent')||document.body; }

/* ---------- Static line-item suggestion packs (fallback + always available) ---------- */
var SUGGESTION_PACKS={
  'lawn-snow':[
    {description:'Mowing — standard lot',quantity:1,unit:'visit',unitPrice:55},
    {description:'Plowing — driveway, per visit',quantity:1,unit:'visit',unitPrice:65},
    {description:'Fall cleanup',quantity:1,unit:'job',unitPrice:175},
    {description:'Salt application — walkways',quantity:1,unit:'job',unitPrice:45},
    {description:'Trimming — edges and beds',quantity:1,unit:'job',unitPrice:75},
    {description:'Leaf removal',quantity:1,unit:'job',unitPrice:140}
  ],
  'shop':[
    {description:'Diagnostic fee',quantity:1,unit:'each',unitPrice:95},
    {description:'Oil change',quantity:1,unit:'each',unitPrice:49},
    {description:'Brake pads — front',quantity:1,unit:'set',unitPrice:250},
    {description:'Brake pads — rear',quantity:1,unit:'set',unitPrice:230},
    {description:'Tire rotation',quantity:1,unit:'each',unitPrice:35},
    {description:'Battery replacement',quantity:1,unit:'each',unitPrice:220}
  ],
  'contractor':[
    {description:'Labor — general repair',quantity:2,unit:'hr',unitPrice:85},
    {description:'Drywall patch & paint',quantity:1,unit:'job',unitPrice:120},
    {description:'Faucet replacement',quantity:1,unit:'each',unitPrice:180},
    {description:'Light fixture replacement',quantity:1,unit:'each',unitPrice:145},
    {description:'Door lock replacement',quantity:1,unit:'each',unitPrice:95},
    {description:'Deck board replacement',quantity:1,unit:'job',unitPrice:220}
  ]
};
SUGGESTION_PACKS['default']=SUGGESTION_PACKS['contractor'];
SUGGESTION_PACKS['']=SUGGESTION_PACKS['contractor'];

function packFor(){
  var t=businessType();
  if(/lawn|snow|plow|mow/i.test(t)) return SUGGESTION_PACKS['lawn-snow'];
  if(/shop|repair|auto|mechanic/i.test(t)) return SUGGESTION_PACKS['shop'];
  return SUGGESTION_PACKS['contractor'];
}

/* ---------- Flow state ---------- */
var D=null;
function reset(){
  var preBiz='';
  try{ preBiz=String((typeof state!=='undefined'&&state.snapshot&&state.snapshot.business&&(state.snapshot.business.businessName||state.snapshot.business.name))||''); }catch(e){}
  D={step:0,businessName:preBiz,customerName:'',photo:{file:null,dataUrl:'',path:''},
     aiStatus:'',suggestions:[],lines:[],title:'',notes:'',
     quoteId:'',quoteNumber:'',total:0,sent:false,aiDone:false};
}

/* ---------- Supabase helpers (pattern from smart-upload-ai.js) ---------- */
function supabaseClient(){
  try{
    var c=window.H38_SUPABASE_SHARED_CLIENT&&window.H38_SUPABASE_SHARED_CLIENT.ensure&&window.H38_SUPABASE_SHARED_CLIENT.ensure();
    if(c) return c;
    var cfg=window.H38_BUSINESS_OFFICE_SUPABASE||{};
    if(!cfg.url||!cfg.publishableKey||!window.supabase) throw new Error('Secure connection unavailable.');
    return window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
  }catch(e){ throw new Error('Secure connection unavailable. Sign in again.'); }
}
async function uploadPhoto(file){
  var client=supabaseClient();
  var bid=bizId();
  if(!bid) throw new Error('Open a business first.');
  var safe=text(file.name||'job-photo').replace(/[^A-Za-z0-9._-]+/g,'-').slice(-120)||'job-photo';
  var path=bid+'/quick-start/'+Date.now()+'-'+safe;
  var up=await client.storage.from(BUCKET).upload(path,file,{contentType:file.type||'image/jpeg',upsert:true,cacheControl:'60'});
  if(up.error) throw new Error('Upload failed: '+up.error.message);
  return path;
}
function readAsDataUrl(file){
  return new Promise(function(res,rej){
    var r=new FileReader(); r.onload=function(){res(r.result);}; r.onerror=function(){rej(new Error('Could not read the photo.'));}; r.readAsDataURL(file);
  });
}

/* ---------- AI suggestions (quote_build handoff + static fallback) ---------- */
function mergeSuggestions(list,source){
  (list||[]).forEach(function(l){
    var desc=text(l.description||l.name);
    if(!desc) return;
    var dup=D.suggestions.some(function(s){ return text(s.description).toLowerCase()===desc.toLowerCase(); });
    if(!dup) D.suggestions.push({description:desc.slice(0,80),quantity:Math.max(0.01,num(l.quantity||l.qty||1)),
      unit:text(l.unit)||'each',unitPrice:num(l.unitPrice||l.price||0),source:source});
  });
}
function fireAiSuggest(){
  if(D.aiDone) return;
  D.aiStatus='Hank is looking at the photo…';
  renderSuggestions();
  var api=null;
  try{ api=window.H38_AI_HANDOFF; }catch(e){}
  if(!api||typeof api.runTask!=='function'){
    D.aiStatus='Hank is offline right now — tap the common jobs below.';
    D.aiDone=true; renderSuggestions(); return;
  }
  var btype=businessType()||'contractor';
  var hint='Quick-start photo quote for a '+btype+' business'+(D.businessName?(' ('+D.businessName+')'):'')+'.'+
    (D.photo.path?(' Job photo uploaded to storage path: '+D.photo.path+'. Describe what you see and draft 4-8 quote line items.')
                 :(' No photo was uploaded; draft from common jobs.'))+
    ' Return {suggestedLines:[{description,quantity,unit,unitPrice}]}.';
  api.runTask('quote_build',{
    businessId:bizId(),
    businessType:btype,
    projectTitle:D.title||('Job for '+(D.customerName||'customer')),
    scope:'Quick-start photo quote. '+(D.notes||''),
    photoPath:D.photo.path||'',
    text:hint
  },{timeoutMs:45000}).then(function(result){
    var lines=(result&&(result.draft&&result.draft.suggestedLines))||(result&&result.suggestedLines)||[];
    if(lines.length){
      D.suggestions=D.suggestions.filter(function(s){return s.source!=='static';});
      mergeSuggestions(lines,'ai');
      D.aiStatus='Hank drafted lines from the photo — tap to add:';
    }else{
      D.aiStatus='Hank came up empty — the common jobs below work great.';
    }
  }).catch(function(){
    D.aiStatus='Hank could not reach the photo — the common jobs below work great.';
  }).finally(function(){
    D.aiDone=true;
    if(D.step===1) renderSuggestions();
  });
}

/* ---------- Save: real quote record via canonical SAVE_QUOTE path ---------- */
async function findOrCreateCustomer(){
  var name=text(D.customerName)||'Walk-in Customer';
  var bid=bizId();
  if(!bid) throw new Error('Open a business first.');
  try{
    var rows=(typeof records==='function'?records('customers'):[])||[];
    for(var i=0;i<rows.length;i++){
      var n=String(rows[i]['Customer Name']||rows[i].customerName||'').trim().toLowerCase();
      if(n&&n===name.toLowerCase()) return String(rows[i]['Customer ID']||rows[i].customerId||'');
    }
  }catch(e){}
  var custId=newId('CUST'),stamp=nowIso();
  var record={'Customer ID':custId,'Business ID':bid,'Customer Name':name,'Phone':'','Status':'Active','Created Time':stamp,'Updated Time':stamp,'Record Version':1};
  await window.queueOperation('SAVE_CUSTOMER','Customer',custId,{customerId:custId,customerName:name,phone:'',businessId:bid},{collection:'customers',record:record,idKeys:['Customer ID']},true);
  return custId;
}
async function saveQuote(asSent){
  if(typeof window.queueOperation!=='function') throw new Error('The save system is unavailable. Reconnect and try again.');
  if(!D.lines.length) throw new Error('Add at least one line item first.');
  var bid=bizId();
  if(!bid) throw new Error('Open a business first.');
  var custId=await findOrCreateCustomer();
  var quoteId=newId('QUOTE'),stamp=nowIso();
  var lines=D.lines.map(function(l){
    return {quoteLineId:l.id||newId('QUOTE-LINE'),description:text(l.description)||'Work',quantity:Math.max(0.01,num(l.qty)),
      unit:text(l.unit)||'each',unitPrice:num(l.price),priceSource:'Quick start — owner reviewed',priceStatus:'Owner reviewed'};
  });
  var total=lines.reduce(function(s,l){return s+num(l.quantity)*num(l.unitPrice);},0);
  var qn='QS-'+Date.now().toString(36).toUpperCase();
  var title=text(D.title)||('Quote for '+text(D.customerName||'customer'));
  var record={'Quote ID':quoteId,'Business ID':bid,'Customer ID':custId,'Quote Number':qn,
    'Project Title':title,'Scope':text(D.notes),'Measurement Notes':'',
    'Status':asSent?'Presented':'Draft','Tier Mode':'Single',
    'Subtotal':Math.round(total*100)/100,'Tax':0,'Total':Math.round(total*100)/100,
    'Created Time':stamp,'Updated Time':stamp,'Record Version':1,'Source':'Quick Start',
    'Photo Path':D.photo.path||'',lines:lines};
  if(asSent){ record['Presented Time']=stamp; record['Sent Time']=stamp; record['Delivery Status']='Sent'; }
  await window.queueOperation('SAVE_QUOTE','Quote',quoteId,
    {quoteId:quoteId,customerId:custId,projectTitle:title,scope:text(D.notes),lines:lines,tax:0},
    {collection:'quotes',record:record,idKeys:['Quote ID']});
  D.quoteId=quoteId; D.quoteNumber=qn; D.total=total; D.sent=!!asSent;
}

/* ---------- Onboarding wizard launch (lazy, same modules as desktop nav) ---------- */
function loadAsset(kind,path,datasetKey){
  return new Promise(function(resolve,reject){
    var attr='data-'+datasetKey;
    if(document.querySelector(kind==='css'?('link['+attr+']'):('script['+attr+']'))) return resolve(true);
    var node;
    if(kind==='css'){ node=document.createElement('link'); node.rel='stylesheet'; node.href=path+'?build='+ONBOARDING_BUILD; }
    else{ node=document.createElement('script'); node.src=path+'?build='+ONBOARDING_BUILD; node.async=false; }
    node.setAttribute(attr,'true');
    node.onload=function(){resolve(true);};
    node.onerror=function(){reject(new Error('Business setup failed to load ('+path+').'));};
    document.head.appendChild(node);
  });
}
var onboardingLoad=null;
async function openCompleteSetup(){
  if(window.H38_ONBOARDING&&typeof window.H38_ONBOARDING.start==='function'){ window.H38_ONBOARDING.start(); return; }
  toast('Loading business setup…');
  try{
    if(!onboardingLoad) onboardingLoad=(async function(){
      await loadAsset('css','./ai-onboarding.css','h38AiOnboardingQsCss');
      await loadAsset('script','./ai-onboarding.js','h38AiOnboardingQsJs');
      if(!(window.H38_ONBOARDING&&typeof window.H38_ONBOARDING.start==='function')) throw new Error('Business setup loaded but did not start.');
      return true;
    })();
    await onboardingLoad;
    window.H38_ONBOARDING.start();
  }catch(e){
    onboardingLoad=null;
    toast((e&&e.message)||'Business setup is not available right now.',true);
  }
}

/* ---------- Rendering ---------- */
function head(title,sub){
  return '<header class="page-head"><h1>'+esc(title)+'</h1><p>'+esc(sub)+'</p></header>';
}
function stepDots(){
  var labels=['Photo','Lines','Review','Done'];
  return '<div class="h38-qs-steps" aria-hidden="true">'+labels.map(function(l,i){
    return '<span class="h38-qs-dot'+(i===D.step?' on':'')+(i<D.step?' done':'')+'"></span>';
  }).join('')+'</div>';
}
function render(){
  var el=root();
  el.innerHTML='<div class="h38-flow-view h38-qs">'+stepDots()+(D.step===0?viewPhoto():D.step===1?viewLines():D.step===2?viewReview():viewDone())+'</div>';
  if(el.scrollTo) el.scrollTo(0,0);
  window.scrollTo(0,0);
  wire();
}

function viewPhoto(){
  return head('⚡ Quick Start','Your first quote in 60 seconds — no setup needed.')+
  '<section class="card h38-qs-photo-card">'+
    '<div class="h38-qs-camera" id="qsDrop" role="button" tabindex="0" aria-label="Take or upload a photo of the job">'+
      '<span class="h38-qs-camera-emoji" aria-hidden="true">📸</span>'+
      '<strong>Take a photo of the job</strong>'+
      '<p class="muted">Hank will build your first quote from it.</p>'+
    '</div>'+
    '<input type="file" id="qsFileTake" accept="image/*" capture="environment" hidden>'+
    '<input type="file" id="qsFilePick" accept="image/*" hidden>'+
    '<div class="h38-cta-row">'+
      '<button type="button" class="primary" id="qsTake">📷 Take Photo</button>'+
      '<button type="button" class="secondary" id="qsPick">🖼 Upload</button>'+
    '</div>'+
    '<div class="h38-qs-fields">'+
      '<label>Business name<input id="qsBiz" type="text" autocomplete="organization" value="'+esc(D.businessName)+'" placeholder="Your business"></label>'+
      '<label>Customer name<input id="qsCust" type="text" autocomplete="off" value="'+esc(D.customerName)+'" placeholder="Who is this quote for?"></label>'+
    '</div>'+
    '<button type="button" class="linklike" id="qsSkip">No photo handy? Describe the job instead →</button>'+
  '</section>'+
  '<button type="button" class="secondary h38-qs-back" id="qsHome">← Home</button>';
}

function suggestionRow(s,idx,added){
  return '<button type="button" class="h38-qs-sug'+(added?' added':'')+'" data-sug="'+idx+'" '+(added?'disabled':'')+'>'+
    '<span class="h38-qs-sug-desc">'+esc(s.description)+(s.source==='ai'?'<span class="h38-qs-ai-tag">Hank</span>':'')+'</span>'+
    '<span class="h38-qs-sug-meta">'+num(s.quantity)+' × '+esc(s.unit)+' · '+money(s.unitPrice)+'</span>'+
    '<span class="h38-qs-sug-add" aria-hidden="true">'+(added?'✓':'＋')+'</span></button>';
}

function viewLines(){
  var photo=D.photo.dataUrl
    ? '<img class="h38-qs-thumb" src="'+D.photo.dataUrl+'" alt="Job photo">'
    : '<div class="h38-qs-thumb h38-qs-thumb-none" aria-hidden="true">📝</div>';
  return head('What should we quote?','Tap to add lines. Everything is editable.')+
  '<section class="card">'+
    '<div class="h38-qs-photo-row">'+photo+
      '<div><strong>'+esc(D.businessName||'Your business')+'</strong>'+
      '<p class="muted" style="margin:2px 0 0">Quote for '+esc(D.customerName||'customer')+'</p></div>'+
    '</div>'+
    '<p class="h38-qs-ai-status" id="qsAiStatus">'+esc(D.aiStatus||'Getting suggestions…')+'</p>'+
    '<div class="h38-qs-sugs" id="qsSugs">'+D.suggestions.map(function(s,i){return suggestionRow(s,i,false);}).join('')+'</div>'+
    '<div class="h38-qs-manual">'+
      '<strong>Add your own line</strong>'+
      '<div class="h38-qs-manual-row">'+
        '<input id="qsMDesc" type="text" placeholder="Description" autocomplete="off">'+
        '<input id="qsMQty" type="number" min="0" step="0.5" value="1" inputmode="decimal" aria-label="Quantity">'+
        '<input id="qsMPrice" type="number" min="0" step="0.01" value="" placeholder="$" inputmode="decimal" aria-label="Price">'+
      '</div>'+
      '<button type="button" class="secondary" id="qsMAdd">＋ Add line</button>'+
    '</div>'+
    '<div class="h38-qs-picked" id="qsPicked"></div>'+
    '<div class="h38-cta-row">'+
      '<button type="button" class="secondary" id="qsBack1">← Photo</button>'+
      '<button type="button" class="primary" id="qsToReview">Review Quote →</button>'+
    '</div>'+
  '</section>';
}

function renderSuggestions(){
  if(D.step!==1) return;
  var box=document.getElementById('qsSugs');
  if(box) box.innerHTML=D.suggestions.length
    ? D.suggestions.map(function(s,i){return suggestionRow(s,i,!!s.added);}).join('')
    : '<p class="muted">No suggestions yet.</p>';
  var st=document.getElementById('qsAiStatus');
  if(st) st.textContent=D.aiStatus;
  wireSuggestionButtons();
  renderPicked();
}
function renderPicked(){
  var box=document.getElementById('qsPicked');
  if(!box) return;
  var total=D.lines.reduce(function(s,l){return s+num(l.qty)*num(l.price);},0);
  box.innerHTML=D.lines.length
    ? '<strong>Quote so far ('+D.lines.length+') — '+money(total)+'</strong>'+
      D.lines.map(function(l,i){
        return '<div class="h38-qs-line"><span>'+esc(l.description)+'<small> '+num(l.qty)+' × '+money(l.price)+'</small></span>'+
        '<button type="button" class="h38-qs-x" data-rm="'+i+'" aria-label="Remove line">✕</button></div>';
      }).join('')
    : '<p class="muted" style="margin:0">Nothing added yet — tap a suggestion or add your own line.</p>';
}

function lineEditorRow(l,i){
  return '<div class="h38-qs-edit" data-line="'+i+'">'+
    '<input type="text" data-f="description" value="'+esc(l.description)+'" aria-label="Description" autocomplete="off">'+
    '<div class="h38-qs-edit-nums">'+
      '<input type="number" data-f="qty" min="0" step="0.5" value="'+num(l.qty)+'" inputmode="decimal" aria-label="Quantity">'+
      '<span aria-hidden="true">×</span>'+
      '<input type="number" data-f="price" min="0" step="0.01" value="'+num(l.price)+'" inputmode="decimal" aria-label="Unit price">'+
    '</div>'+
    '<div class="h38-qs-edit-foot"><strong>'+money(num(l.qty)*num(l.price))+'</strong>'+
    '<button type="button" class="h38-qs-x" data-rm="'+i+'" aria-label="Remove line">Remove</button></div>'+
  '</div>';
}

function viewReview(){
  var total=D.lines.reduce(function(s,l){return s+num(l.qty)*num(l.price);},0);
  return head('Review your quote','Check the lines, then save or send.')+
  '<section class="card">'+
    '<label class="h38-qs-label">Project title<input id="qsTitle" type="text" value="'+esc(D.title||('Quote for '+text(D.customerName||'customer')))+'" autocomplete="off"></label>'+
    '<label class="h38-qs-label">Customer<input id="qsCust2" type="text" value="'+esc(D.customerName)+'" autocomplete="off"></label>'+
    '<div class="h38-qs-edits" id="qsEdits">'+D.lines.map(lineEditorRow).join('')+'</div>'+
    '<label class="h38-qs-label">Notes for the customer (optional)<textarea id="qsNotes" rows="2" placeholder="Scope, timing, anything they should know">'+esc(D.notes)+'</textarea></label>'+
    '<div class="h38-qs-total"><span>Total</span><strong>'+money(total)+'</strong></div>'+
    '<div class="h38-cta-row">'+
      '<button type="button" class="secondary" id="qsSave">Save Draft</button>'+
      '<button type="button" class="primary" id="qsSend">Send Quote →</button>'+
    '</div>'+
    '<button type="button" class="linklike" id="qsBack2">← Back to line items</button>'+
  '</section>';
}

function viewDone(){
  return head('🎉 Your first quote is ready!','That was the hard part. The rest is easy.')+
  '<section class="card h38-qs-done">'+
    '<div class="h38-qs-done-total"><small>'+esc(D.sent?'Sent':'Saved as draft')+'</small><strong>'+money(D.total)+'</strong></div>'+
    '<p><strong>'+esc(D.quoteNumber)+'</strong> · '+esc(D.customerName||'customer')+' · '+D.lines.length+' line item'+(D.lines.length===1?'':'s')+'</p>'+
    '<div class="h38-qs-remind">'+
      '<strong>Setup reminders</strong>'+
      '<label><input type="checkbox" disabled> Get AI receptionist set up</label>'+
      '<label><input type="checkbox" disabled> Get Stripe configured &amp; proven</label>'+
      '<small class="muted">Not blockers — just worth doing while you set up.</small>'+
    '</div>'+
    '<div class="h38-cta-row"><button type="button" class="primary" id="qsSetup">Complete Setup →</button></div>'+
    '<p class="muted" style="text-align:center;margin:10px 0 0">The full 6-step business setup — services, customers, team.</p>'+
    '<div class="h38-cta-row">'+
      '<button type="button" class="secondary" id="qsViewQuote">View Quote</button>'+
      '<button type="button" class="secondary" id="qsHome2">← Home</button>'+
    '</div>'+
  '</section>';
}

/* ---------- Wiring ---------- */
function syncInputs(){
  var b=document.getElementById('qsBiz'); if(b) D.businessName=b.value;
  var c=document.getElementById('qsCust'); if(c) D.customerName=c.value;
  var c2=document.getElementById('qsCust2'); if(c2) D.customerName=c2.value;
  var t=document.getElementById('qsTitle'); if(t) D.title=t.value;
  var n=document.getElementById('qsNotes'); if(n) D.notes=n.value;
  var box=document.getElementById('qsEdits');
  if(box){
    box.querySelectorAll('[data-line]').forEach(function(row){
      var i=parseInt(row.getAttribute('data-line'),10),l=D.lines[i];
      if(!l) return;
      l.description=row.querySelector('[data-f="description"]').value;
      l.qty=num(row.querySelector('[data-f="qty"]').value);
      l.price=num(row.querySelector('[data-f="price"]').value);
    });
  }
}
function wireSuggestionButtons(){
  document.querySelectorAll('#qsSugs [data-sug]').forEach(function(btn){
    btn.onclick=function(){
      var i=parseInt(btn.getAttribute('data-sug'),10),s=D.suggestions[i];
      if(!s||s.added) return;
      s.added=true;
      D.lines.push({id:newId('QUOTE-LINE'),description:s.description,qty:s.quantity,unit:s.unit,price:s.unitPrice});
      renderSuggestions();
    };
  });
  document.querySelectorAll('#qsPicked [data-rm]').forEach(function(btn){
    btn.onclick=function(){
      var i=parseInt(btn.getAttribute('data-rm'),10);
      if(D.lines[i]){ var s=D.suggestions.find(function(x){return x.description===D.lines[i].description&&x.added;}); if(s) s.added=false; }
      D.lines.splice(i,1); renderSuggestions();
    };
  });
}
function handleFile(file){
  if(!file) return;
  readAsDataUrl(file).then(function(dataUrl){
    D.photo.file=file; D.photo.dataUrl=String(dataUrl);
    D.photo.path='';
    uploadPhoto(file).then(function(path){ D.photo.path=path; }).catch(function(){ /* local preview carries on */ });
    D.step=1;
    D.suggestions=[];
    packFor().forEach(function(p){ D.suggestions.push({description:p.description,quantity:p.quantity,unit:p.unit,unitPrice:p.unitPrice,source:'static'}); });
    D.aiStatus=''; D.aiDone=false; D.lines=[];
    render();
    fireAiSuggest();
  }).catch(function(){ toast('Could not read that photo. Try another, or describe the job.',true); });
}
function wire(){
  var on=function(id,fn){ var el=document.getElementById(id); if(el) el.onclick=fn; };
  if(D.step===0){
    on('qsHome',goHome);
    var take=document.getElementById('qsFileTake'),pick=document.getElementById('qsFilePick');
    var openTake=function(){ syncInputs(); take.click(); };
    var openPick=function(){ syncInputs(); pick.click(); };
    on('qsTake',openTake); on('qsPick',openPick);
    var drop=document.getElementById('qsDrop');
    if(drop){ drop.onclick=openTake; drop.onkeydown=function(e){ if(e.key==='Enter'||e.key===' '){e.preventDefault();openTake();} }; }
    if(take) take.onchange=function(){ syncInputs(); handleFile(take.files&&take.files[0]); take.value=''; };
    if(pick) pick.onchange=function(){ syncInputs(); handleFile(pick.files&&pick.files[0]); pick.value=''; };
    on('qsSkip',function(){ syncInputs(); D.step=1; D.suggestions=[]; D.aiStatus=''; D.aiDone=false; D.lines=[];
      packFor().forEach(function(p){ D.suggestions.push({description:p.description,quantity:p.quantity,unit:p.unit,unitPrice:p.unitPrice,source:'static'}); });
      render(); fireAiSuggest(); });
  }
  if(D.step===1){
    wireSuggestionButtons();
    renderPicked();
    on('qsMAdd',function(){
      var desc=text(document.getElementById('qsMDesc').value);
      var qty=num(document.getElementById('qsMQty').value)||1;
      var price=num(document.getElementById('qsMPrice').value);
      if(!desc){ toast('Give the line a short description.',true); return; }
      D.lines.push({id:newId('QUOTE-LINE'),description:desc,qty:qty,unit:'each',price:price});
      document.getElementById('qsMDesc').value=''; document.getElementById('qsMPrice').value='';
      renderPicked();
    });
    on('qsBack1',function(){ D.step=0; render(); });
    on('qsToReview',function(){
      if(!D.lines.length){ toast('Tap a suggestion or add a line first.',true); return; }
      D.step=2; render();
    });
  }
  if(D.step===2){
    document.querySelectorAll('#qsEdits [data-rm]').forEach(function(btn){
      btn.onclick=function(){ syncInputs(); D.lines.splice(parseInt(btn.getAttribute('data-rm'),10),1);
        if(!D.lines.length){ D.step=1; render(); return; }
        D.step=2; render(); };
    });
    ['qsTitle','qsCust2','qsNotes'].forEach(function(id){
      var el=document.getElementById(id);
      if(el) el.oninput=function(){ D.step=2; renderKeepFocus(id); };
    });
    var busy=false;
    var finish=function(asSent,btn,label){
      if(busy) return; busy=true;
      syncInputs();
      btn.disabled=true; btn.textContent='Saving…';
      var proceed=Promise.resolve(true);
      if(asSent){
        var qn=text(D.title)||'this quote';
        proceed=Promise.resolve(
          (window.H38Flow&&window.H38Flow.confirm)
            ? window.H38Flow.confirm({title:'Send quote',message:'Mark '+qn+' as sent to '+(text(D.customerName)||'the customer')+'? This records that you sent it. Nothing is emailed automatically.',okLabel:'Send quote'})
            : confirm('Mark this quote as sent to '+(text(D.customerName)||'the customer')+'? Nothing is emailed automatically.')
        );
      }
      proceed.then(function(ok){
        if(!ok){ busy=false; btn.disabled=false; btn.textContent=label; return; }
        return saveQuote(asSent).then(function(){
          D.step=3; render();
          toast(asSent?'Quote marked as sent.':'Draft saved.');
        });
      }).catch(function(err){
        toast('Save failed: '+(err&&err.message||err),true);
        busy=false; btn.disabled=false; btn.textContent=label;
      });
    };
    on('qsSave',function(){ finish(false,this,'Save Draft'); });
    on('qsSend',function(){ finish(true,this,'Send Quote →'); });
    on('qsBack2',function(){ syncInputs(); D.step=1; render(); });
  }
  if(D.step===3){
    on('qsSetup',openCompleteSetup);
    on('qsHome2',goHome);
    on('qsViewQuote',function(){
      try{
        if(typeof window.openQuote==='function'){ window.openPage&&window.openPage('quotes'); window.openQuote(D.quoteId); return; }
        if(window.openPage) window.openPage('quotes');
      }catch(e){ if(window.openPage) window.openPage('quotes'); }
    });
  }
}
/* Keep focus while typing in review editors: re-render would lose caret, so
   update totals in place instead of a full re-render. */
function renderKeepFocus(changedId){
  syncInputs();
  var total=D.lines.reduce(function(s,l){return s+num(l.qty)*num(l.price);},0);
  var t=document.querySelector('.h38-qs-total strong');
  if(t) t.textContent=money(total);
  var el=document.getElementById(changedId);
  if(el&&document.activeElement!==el){ /* noop */ }
}

function start(){
  reset();
  try{ if(window.openPage) {} }catch(e){}
  render();
}

window.H38QuickStart=Object.freeze({build:BUILD,start:start});
})();
