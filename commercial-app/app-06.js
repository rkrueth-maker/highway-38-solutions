async function logQuoteFollowup(quoteId){
  const quotes=records('quotes');
  const row=quotes.find(r=>rowId(r,'Quote ID','quoteId')===quoteId);
  if(!row){toast('Quote not found.',true);return;}
  const note=prompt('What happened? (e.g. Called — left voicemail, Texted — waiting on reply)');
  if(note===null)return; // cancelled
  const record={...row,'Updated Time':now(),'Followup Note':note||'Follow-up logged','Followup At':now(),'Record Version':num(v(row,'Record Version','recordVersion'))+1};
  await queueOperation('SAVE_QUOTE','Quote',quoteId,{quoteId,...record},{collection:'quotes',record,idKeys:['Quote ID']});
  toast('Follow-up logged. The clock restarts from today.');
  renderQuotes();
}
async function quoteFromPhotos(){
  const q=state.quote;
  const photos=(q.attachments||[]).filter(a=>/\.(jpg|jpeg|png|webp|gif)$/i.test(a.filename||a.name||''));
  if(!photos.length){toast('Add photos first using the Add photo button, then try again.',true);return;}
  if(!confirm('Analyze '+photos.length+' photo'+(photos.length===1?'':'s')+' and draft quote line items? You will review everything before it goes into the quote.'))return;
  const btn=$('quoteFromPhotosButton');
  btn.disabled=true;btn.textContent='Analyzing photos...';
  try{
    if(!window.H38_AI_HANDOFF)throw new Error('AI handoff not available.');
    const result=await window.H38_AI_HANDOFF.runTask('quote_from_photos',{
      businessId:state.businessId,
      quoteId:q.quoteId||'LOCAL-QUOTE',
      projectTitle:q.projectTitle||'',
      scope:q.scope||'',
      photoCount:photos.length,
      photoIds:photos.map(p=>p.id||p.filename).slice(0,10)
    },{timeoutMs:120000});
    const lines=result?.suggestedLines||result?.lines||[];
    if(!lines.length)throw new Error('Hank could not identify quotable work from the photos.');
    q.lines=q.lines||[];
    lines.forEach(line=>{
      q.lines.push({
        quoteLineId:typeof newId==='function'?newId('QUOTE-LINE'):'QL-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),
        description:String(line.description||'Photo-identified work'),
        quantity:Number(line.quantity)||1,
        unit:String(line.unit||'each'),
        unitPrice:Number(line.unitPrice||line.rate)||0,
        rate:Number(line.unitPrice||line.rate)||0,
        costType:String(line.costType||'labor'),
        priceSource:'photo_analysis',
        priceStatus:'Check before sending - from photo analysis',
        rationale:String(line.rationale||'Identified from job site photos')
      });
    });
    q.ownerEdited=true;
    toast(lines.length+' line item'+(lines.length===1?'':'s')+' drafted from photos. Review prices before saving.');
    renderQuotes();
  }catch(error){
    toast('Photo analysis failed: '+(error?.message||String(error)),true);
  }finally{
    btn.disabled=false;btn.textContent='Quote from photos';
  }
}
/* ---- Quotes list / builder split (Q2) + line-source labels (Q3) + add guard (Q1) ----
   The Quotes workspace has two states: 'list' (saved quotes, search, pagination)
   and 'builder' (the quote editor). state.quoteView is sticky so re-renders after
   saves, sends and follow-ups stay in the state the owner is working in. */
function h38QuoteLineSourceLabel(line){
  if(line&&line.inventoryItemId)return 'From your stock list — check the price before sending';
  const source=String((line&&line.priceSource)||'').toLowerCase(),status=String((line&&line.priceStatus)||'').toLowerCase();
  if(source.includes('price book')||source.includes('price catalog')||source.includes('catalog'))return 'Price from your price book — check it before sending';
  if(source.includes('photo'))return 'Spotted in your photos — check the price before sending';
  if(source.includes('hank')||source.includes('ai suggestion')||source.includes('ai ')||source.includes('research')||source.includes('suggestion'))return 'Suggested for you — check the price before sending';
  if(status.includes('manual price'))return 'Needs a price — type one in before sending';
  return 'Price typed in — check it before sending';
}
window.h38QuoteLineSourceLabel=h38QuoteLineSourceLabel;
function h38ShowQuoteList(){state.quoteView='list';renderQuotes();}
function h38ShowQuoteBuilder(){state.quoteView='builder';renderQuotes();}
window.h38ShowQuoteList=h38ShowQuoteList;window.h38ShowQuoteBuilder=h38ShowQuoteBuilder;
/* Q1 guard: one user action must never create two identical lines. The Add
   handlers clear the inputs before pushing and remember the last add's
   signature for a short window; a replayed activation (double-fired click,
   Enter keydown+native click, synthetic re-click) sees cleared inputs or the
   same signature inside the window and is swallowed silently. A deliberate
   second identical line is still possible: retype it after the window. */
const h38LineAddGuard={sig:'',at:0};
function h38LineAddReplay(sig){
  const nowMs=Date.now();
  if(sig&&sig===h38LineAddGuard.sig&&nowMs-h38LineAddGuard.at<900)return true;
  if(!sig&&nowMs-h38LineAddGuard.at<2000)return true;
  return false;
}
function h38LineAddStamp(sig){h38LineAddGuard.sig=sig;h38LineAddGuard.at=Date.now();}
function h38QuoteRowMarkup(row){
const h38Qid=rowId(row,'Quote ID','quoteId'),h38QStatus=String(v(row,'Status')||''),h38QHist=(window.H38Flow&&window.H38Flow.formatStatusHistory)?window.H38Flow.formatStatusHistory(row):'';
return `<div class="row"><div class="row-top"><strong>${esc(v(row,'Project Title','projectTitle'))}</strong>${pill(h38QStatus||'Draft',row.__localPending?'pending':'')}</div><small>${esc(v(row,'Quote Number','quoteNumber')||'Local draft')} · ${money(v(row,'Total','total'))}${/good-better-best/i.test(v(row,'Tier Mode','tierMode')||'')?' · 3 tiers':''} · revision ${esc(v(row,'Revision','revision')||1)}</small>${h38QHist?`<small class="muted">${esc(h38QHist)}</small>`:''}<div class="row-actions"><button data-open-quote="${esc(h38Qid)}">Open draft</button>${/^(draft)?$/i.test(h38QStatus)?`<button class="secondary" data-mark-quote-sent="${esc(h38Qid)}">Mark as sent</button>`:''}${/presented|sent/i.test(h38QStatus)?`<button class="secondary" data-log-followup="${esc(h38Qid)}">📞 Log follow-up</button>`:''}</div></div>`;
}
function h38WireQuoteRowActions(){
document.querySelectorAll('[data-open-quote]').forEach(button=>button.onclick=()=>openQuote(button.dataset.openQuote));
document.querySelectorAll('[data-mark-quote-sent]').forEach(button=>button.onclick=()=>markQuoteSent(button.dataset.markQuoteSent).catch(error=>toast(error?.message||String(error),true)));
document.querySelectorAll('[data-log-followup]').forEach(button=>button.onclick=()=>logQuoteFollowup(button.dataset.logFollowup));
}
function renderQuotes(){if(!state.quote||typeof state.quote!=='object')state.quote={quoteId:'',lines:[],hydrationComplete:true};const customers=records('customers'),allQuotes=records('quotes'),priceBook=records('priceBook');
// In demo tenant, hide broken DEMO-Q quotes (missing line items) — show only working LOCAL- quotes
const isDemoTenant=(typeof businessKey==='function'&&businessKey()==='demo');
const quotes=isDemoTenant?allQuotes.filter(row=>!/^DEMO-Q-/i.test(String(row['Quote ID']||row['quoteId']||''))):allQuotes;const q=state.quote,linkedQuote=q.quoteId?quotes.find(row=>rowId(row,'Quote ID','quoteId')===q.quoteId):null;const h38ContextCid=(window.H38_OWNER_CUSTOMER_WORKFLOW_POLISH&&typeof window.H38_OWNER_CUSTOMER_WORKFLOW_POLISH.deriveContext==='function')?String(window.H38_OWNER_CUSTOMER_WORKFLOW_POLISH.deriveContext().customerId||''):'';const resolvedCustomerId=v(linkedQuote,'Customer ID','customerId')||q.customerId||h38ContextCid||'';if(resolvedCustomerId&&q.customerId!==resolvedCustomerId)q.customerId=resolvedCustomerId;
const view=state.quoteView==='builder'?'builder':'list';
if(view==='list'){
const search=String(state.quoteListSearch||'').toLowerCase().trim();
const customerName=id=>{const row=customers.find(item=>rowId(item,'Customer ID','customerId')===id);return row?v(row,'Customer Name','name'):'';};
const filtered=search?quotes.filter(row=>`${v(row,'Project Title','projectTitle')} ${v(row,'Quote Number','quoteNumber')} ${v(row,'Status','status')} ${customerName(v(row,'Customer ID','customerId'))}`.toLowerCase().includes(search)):quotes;
const pageSize=15,pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));let listPage=num(state.quoteListPage||0);if(listPage>=pageCount)listPage=pageCount-1;if(listPage<0)listPage=0;state.quoteListPage=listPage;
const pageRows=filtered.slice(listPage*pageSize,listPage*pageSize+pageSize);
const draftInProgress=Boolean((q.lines&&q.lines.length)||q.quoteId||q.ownerEdited);
$('mainContent').innerHTML=pageHead('Quotes','Your saved quotes. Open one to keep building, or start a new quote.',`<button id="newQuoteButton" class="primary">＋ New quote</button>`)+`${draftInProgress?`<div class="notice"><strong>Draft in progress${q.projectTitle?`: ${esc(q.projectTitle)}`:''}.</strong> Your work is kept as-is. <button type="button" class="secondary" id="continueQuoteButton">Continue building</button></div>`:''}<section class="card" data-h38-canonical-quotes="1"><h2>Saved quotes</h2><label>Search quotes</label><input id="quoteListSearch" placeholder="Search by project, customer, number or status" value="${esc(state.quoteListSearch||'')}"><div class="list">${pageRows.length?pageRows.map(row=>h38QuoteRowMarkup(row)).join(''):empty(search?'No quotes match that search.':'No quotes yet. Tap ＋ New quote to start your first one.')}</div>${filtered.length>pageSize?`<div class="row-actions"><button type="button" class="secondary" id="quoteListPrev" ${listPage<=0?'disabled':''}>← Previous</button><span class="muted small">Page ${listPage+1} of ${pageCount} · ${filtered.length} quotes</span><button type="button" class="secondary" id="quoteListNext" ${listPage>=pageCount-1?'disabled':''}>Next →</button></div>`:filtered.length?`<p class="muted small">${filtered.length} quote${filtered.length===1?'':'s'}</p>`:''}</section>`;
$('newQuoteButton').onclick=()=>{h38ShowQuoteEntryChooser();};
const continueButton=$('continueQuoteButton');if(continueButton)continueButton.onclick=()=>h38ShowQuoteBuilder();
const searchInput=$('quoteListSearch');if(searchInput)searchInput.oninput=()=>{state.quoteListSearch=searchInput.value;state.quoteListPage=0;const pos=searchInput.selectionStart;renderQuotes();const next=$('quoteListSearch');if(next){next.focus();try{next.setSelectionRange(pos,pos);}catch(_){}}};
const prev=$('quoteListPrev');if(prev)prev.onclick=()=>{state.quoteListPage=Math.max(0,listPage-1);renderQuotes();};
const next=$('quoteListNext');if(next)next.onclick=()=>{state.quoteListPage=Math.min(pageCount-1,listPage+1);renderQuotes();};
h38WireQuoteRowActions();
return;
}
$('mainContent').innerHTML=pageHead('Quotes','Build, measure, photograph and price one quote. Prices from your price book still need your check before sending.',`<button id="backToQuoteListButton" class="secondary">← All quotes</button><button id="newQuoteButton" class="primary">＋ New quote</button>`)+`<div class="grid"><section class="card span7"><h2>Quote draft</h2>${q.quoteId?`<div class="notice"><strong>Saved revision ${esc(q.revision||1)} loaded.</strong> Adjust quantities or prices below, then save as the next revision. AI updates cannot replace this saved revision.</div>`:''}<div class="two"><div><label>Customer</label><select id="quoteCustomer">${optionRows(customers,['Customer ID'],row=>v(row,'Customer Name'),'Generic Quote Customer')}</select></div><div><label>Project title</label><input id="quoteTitle" value="${esc(q.projectTitle||'')}"></div></div><label>Scope</label><textarea id="quoteScope">${esc(q.scope||'')}</textarea><label>Measurements and site notes</label><textarea id="quoteMeasurements">${esc(q.measurementNotes||'')}</textarea><div class="h38-tier-toggle" role="group" aria-label="Quote pricing mode"><button type="button" id="tierModeSingle" aria-pressed="${q.tierMode?'false':'true'}">Single price</button><button type="button" id="tierModeTiers" aria-pressed="${q.tierMode?'true':'false'}">Good / Better / Best</button></div><div id="singlePriceEditor" class="${q.tierMode?'hidden':''}"><h3>Line items</h3><div class="quote-line"><div><label>Description</label><input id="lineDescription"></div><div><label>Qty</label><input id="lineQuantity" type="number" step="0.01" value="1"></div><div><label>Unit</label><input id="lineUnit" value="each"></div><div><label>Unit price</label><input id="linePrice" type="number" step="0.01"></div><button id="addQuoteLine" type="button">Add</button></div><div id="quoteLines" class="list"></div><div class="row-top"><strong>Total</strong><strong id="quoteTotal">${money(0)}</strong></div></div><div id="tierEditor" class="${q.tierMode?'':'hidden'}"></div><div class="actions"><button id="saveQuoteButton">Save draft</button><button class="secondary" id="quotePhotoButton">Add photo</button><button class="secondary" id="quoteFromPhotosButton">Quote from photos</button><input id="quotePhotoInput" type="file" accept="image/*" capture="environment" class="hidden"></div></section>${(window.H38FirstQuoteGuide?window.H38FirstQuoteGuide.render():"")}<section class="card span5"><h2>Your Price Book</h2><input id="priceSearch" placeholder="Search prices"><p class="muted small">${priceBook.length} saved items · works offline · check prices before sending</p><div id="priceResults" class="list"></div></section></div>`;const customer=$('quoteCustomer');if(resolvedCustomerId&&!Array.from(customer.options).some(option=>option.value===resolvedCustomerId)){const row=customers.find(item=>rowId(item,'Customer ID','customerId')===resolvedCustomerId),option=document.createElement('option');option.value=resolvedCustomerId;option.textContent=v(row,'Customer Name','name')||'Saved quote customer';customer.appendChild(option);}customer.value=resolvedCustomerId;$('newQuoteButton').onclick=()=>{h38ShowQuoteEntryChooser();};$('backToQuoteListButton').onclick=()=>h38ShowQuoteList();$('addQuoteLine').onclick=()=>{try{addQuoteLine();}catch(error){toast(error?.message||String(error),true);}};$('saveQuoteButton').onclick=saveQuote;$('tierModeSingle').onclick=()=>h38ToggleTierMode(false);$('tierModeTiers').onclick=()=>h38ToggleTierMode(true);renderTierEditor();$('priceSearch').oninput=renderPriceResults;$('quotePhotoButton').onclick=()=>$('quotePhotoInput').click();
$('quoteFromPhotosButton').onclick=()=>quoteFromPhotos();$('quotePhotoInput').onchange=event=>handleAttachmentFiles(event.target.files,'Quote',state.quote.quoteId||'LOCAL-QUOTE');renderQuoteLines();renderPriceResults();if(window.H38FirstQuoteGuide)window.H38FirstQuoteGuide.wire();}

function addQuoteLine(){const descInput=$('lineDescription'),priceInput=$('linePrice'),qtyInput=$('lineQuantity'),unitInput=$('lineUnit');const description=String(descInput.value||'').trim(),quantity=num(qtyInput.value),unitPrice=num(priceInput.value),unit=unitInput.value||'each';const sig=description?[description,quantity,unit,unitPrice].join('|'):'';if(!description){if(h38LineAddReplay(''))return;throw new Error('Line description is required.');}if(quantity<=0)throw new Error('Quantity must be greater than zero.');if(h38LineAddReplay(sig))return;h38LineAddStamp(sig);descInput.value='';priceInput.value='';state.quote.lines.push({quoteLineId:newId('QUOTE-LINE'),description,quantity,unit,unitPrice,priceSource:'Typed in',priceStatus:'Check before sending',inventoryItemId:(window.H38InventoryModule?window.H38InventoryModule.takePendingItem():'')||undefined});renderQuoteLines();}
function renderQuoteLines(){if(!$('quoteLines'))return;const lines=state.quote.lines||[];$('quoteLines').innerHTML=lines.length?lines.map((line,index)=>`<div class="row quote-edit-row"><div class="two"><div><label>Description</label><input data-line-field="description" data-line-index="${index}" value="${esc(line.description)}"></div><div><label>Unit</label><input data-line-field="unit" data-line-index="${index}" value="${esc(line.unit||'each')}"></div></div><div class="three"><div><label>Quantity</label><input data-line-field="quantity" data-line-index="${index}" type="number" min="0.01" step="0.01" value="${esc(line.quantity)}"></div><div><label>Unit price</label><input data-line-field="unitPrice" data-line-index="${index}" type="number" min="0" step="0.01" value="${esc(line.unitPrice)}"></div><div><label>Line total</label><strong data-line-total="${index}">${money(num(line.quantity)*num(line.unitPrice))}</strong></div></div><div class="row-actions">${line.inventoryItemId?'<small>📦 stock item</small>':''}<small>${esc(h38QuoteLineSourceLabel(line))}</small><button class="secondary" data-remove-line="${index}">Remove</button></div></div>`).join(''):empty('No quote lines.');const refreshTotal=()=>{$('quoteTotal').textContent=money((state.quote.lines||[]).reduce((sum,line)=>sum+num(line.quantity)*num(line.unitPrice),0));document.querySelectorAll('[data-line-total]').forEach(node=>{const index=num(node.dataset.lineTotal),line=state.quote.lines[index];if(line)node.textContent=money(num(line.quantity)*num(line.unitPrice));});};document.querySelectorAll('[data-line-field]').forEach(input=>input.oninput=()=>{const index=num(input.dataset.lineIndex),field=input.dataset.lineField,line=state.quote.lines[index];if(!line)return;if(field==='quantity'||field==='unitPrice'){const value=num(input.value);if(field==='quantity'&&value<=0)return;line[field]=value;}else line[field]=input.value;state.quote.ownerEdited=true;state.quote.ownerEditedAt=new Date().toISOString();refreshTotal();});document.querySelectorAll('[data-remove-line]').forEach(button=>button.onclick=()=>{state.quote.lines.splice(num(button.dataset.removeLine),1);state.quote.ownerEdited=true;state.quote.ownerEditedAt=new Date().toISOString();renderQuoteLines();});refreshTotal();}
function h38PriceBookFilter(searchText){const search=String(searchText||'').toLowerCase().trim();return records('priceBook').filter(row=>!search||`${v(row,'SKU','sku')} ${v(row,'Description','description')}`.toLowerCase().includes(search)).slice(0,80);}
window.h38PriceBookFilter=h38PriceBookFilter;
function renderPriceResults(){if(!$('priceResults'))return;const rows=h38PriceBookFilter($('priceSearch').value);$('priceResults').innerHTML=rows.length?rows.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Description','description'))}</strong><button data-use-price="${esc(rowId(row,'Item ID','itemId'))}">Use</button></div><small>${esc(v(row,'SKU','sku'))} · ${money(v(row,'Selling Price','unitPrice'))} / ${esc(v(row,'Unit of Measure','unit')||'each')}</small></div>`).join(''):empty('No matching cached prices.');document.querySelectorAll('[data-use-price]').forEach(button=>button.onclick=()=>{const row=records('priceBook').find(item=>rowId(item,'Item ID','itemId')===button.dataset.usePrice);$('lineDescription').value=v(row,'Description','description');$('lineUnit').value=v(row,'Unit of Measure','unit')||'each';$('linePrice').value=num(v(row,'Selling Price','unitPrice')).toFixed(2);if(window.H38InventoryModule)window.H38InventoryModule.notePendingItem(row);});}
async function saveQuote(){const title=requireValue($('quoteTitle').value,'Project title is required.'),quoteId=state.quote.quoteId||newId('QUOTE'),tierMode=!!state.quote.tierMode,tiers=tierMode?h38EnsureTiers().map((t,ti)=>({id:t.id||['good','better','best'][ti],name:t.name,description:t.description||'',total:Math.round(h38TierTotal(t)*100)/100,items:(t.items||[]).map(l=>({...l}))})):null,lines=tierMode?[]:(state.quote.lines||[]),total=tierMode?tiers[1].total:lines.reduce((sum,line)=>sum+num(line.quantity)*num(line.unitPrice),0),previousRevision=num(state.quote.revision||0),record={'Quote ID':quoteId,'Business ID':state.businessId,'Customer ID':$('quoteCustomer').value,'Quote Number':state.quote.quoteNumber||`LOCAL-${Date.now()}`,'Project Title':title,'Scope':$('quoteScope').value,'Measurement Notes':$('quoteMeasurements').value,'Status':'Draft','Revision':previousRevision+1,'Previous Revision':previousRevision||'','Tier Mode':tierMode?'Good-Better-Best':'Single','Subtotal':total,'Tax':0,'Total':total,'Created Time':now(),'Updated Time':now(),'Record Version':1,lines,tiers};await queueOperation('SAVE_QUOTE','Quote',quoteId,{quoteId,customerId:$('quoteCustomer').value,projectTitle:title,scope:$('quoteScope').value,measurementNotes:$('quoteMeasurements').value,lines,tiers,tierMode,tax:0},{collection:'quotes',record,idKeys:['Quote ID']});state.quote={...state.quote,quoteId,customerId:$('quoteCustomer').value,projectTitle:title,scope:$('quoteScope').value,measurementNotes:$('quoteMeasurements').value,revision:record.Revision,savedTotal:total,loadedSavedTotal:total,loadedRevision:record.Revision,hydrationComplete:true,savedLineSnapshot:JSON.parse(JSON.stringify(tierMode?tiers:lines)),ownerEdited:false};renderQuotes();
const h38LineCount=tierMode?(tiers||[]).reduce((n,t)=>n+((t.items||[]).length),0):lines.length,h38Thin=!h38LineCount||!total;
toast(`Quote revision ${record.Revision} saved as draft at ${money(total)}${tierMode?' (Better tier total)':''}.`);
if(window.H38FirstQuoteGuide)window.H38FirstQuoteGuide.afterSave(total,h38LineCount);
if(window.H38Flow)window.H38Flow.showNextStep({id:'h38FlowQuoteSaved',signature:'quote-saved:'+quoteId+':'+record.Revision,title:tierMode?('✓ Quote '+(state.quote.quoteNumber||record['Quote Number'])+' saved as draft — 3 options ('+tiers.map(t=>t.name+' '+money(t.total)).join(' · ')+').'):'✓ Quote '+(state.quote.quoteNumber||record['Quote Number'])+' saved as draft.',offline:!navigator.onLine,warning:h38Thin?('This draft '+(!h38LineCount?'has no line items yet':'totals $0')+'. Add lines and prices before sending.'):'',next:'send it to the customer for review.',actions:[{label:'Mark as sent',primary:true,handler:()=>markQuoteSent(quoteId)},{label:'Preview quote',handler:()=>{if(typeof renderQuotePreview==='function')renderQuotePreview();else window.toast('Quote preview is not available right now.',true);}}]});
}

/* ---- Quote send (Phase 3, Pattern 4: draft → presented is a button) ----
   Manual "mark as sent" is the honest path: it records that the owner sent
   the quote through their own channel. Nothing is emailed automatically. */
async function markQuoteSent(quoteId){
  const row=records('quotes').find(r=>rowId(r,'Quote ID','quoteId')===quoteId);
  if(!row){toast('Quote not found.',true);return;}
  const status=String(v(row,'Status')||'');
  if(/presented|sent/i.test(status)){toast('This quote is already marked as sent.',true);return;}
  const qn=v(row,'Quote Number','quoteNumber')||quoteId;
  const flow=window.H38Flow;
  const confirmed=flow&&flow.confirm
    ?await flow.confirm({title:'Mark as sent',message:'Mark quote '+qn+' as sent to the customer? This records that you sent it. Nothing is emailed automatically.',okLabel:'Mark as sent'})
    :confirm('Mark quote '+qn+' as sent to the customer?');
  if(!confirmed)return;
  try{
    const updated={...row,'Status':'Presented','Presented Time':now(),'Sent Time':now(),'Delivery Status':'Sent','Status History':flow?flow.pushStatusHistory(row,status||'Draft','Presented'):(v(row,'Status History')||''),'Updated Time':now(),'Record Version':num(v(row,'Record Version','recordVersion'))+1};
    delete updated.__localPending;
    await queueOperation('SAVE_ENTITY','Quote',quoteId,{entity:'quotes',record:updated},{collection:'quotes',record:updated,idKeys:['Quote ID']},true);
    toast('Quote '+qn+' marked as sent. Next: record the customer decision.');
    renderQuotes();
  }catch(error){toast(error?.message||String(error),true);}
}

/* ---- Good / Better / Best tiered estimates (v2.0) ----
   Manual-first: tiers are built by hand in the editor below.
   The optional H38 AI "Suggest tiers" button degrades gracefully. */
function h38DefaultTiers(){
  return [
    {id:'good',name:'Good',description:'Essential scope — the minimum to get the job done right.',items:[]},
    {id:'better',name:'Better',description:'Recommended — adds preventive work and stronger materials for longer-lasting results.',items:[]},
    {id:'best',name:'Best',description:'Premium — full replacement with extended warranty and top-grade materials.',items:[]}
  ];
}
function h38EnsureTiers(){
  if(!state.quote||typeof state.quote!=='object')state.quote={};
  if(!Array.isArray(state.quote.tiers)||state.quote.tiers.length!==3)state.quote.tiers=h38DefaultTiers();
  state.quote.tiers.forEach((t,ti)=>{if(!t||typeof t!=='object')return;if(!Array.isArray(t.items))t.items=[];if(!t.name)t.name='Tier';if(!t.id)t.id=['good','better','best'][ti]||('tier-'+ti);});
  return state.quote.tiers;
}
function h38TierTotal(tier){
  return (tier&&Array.isArray(tier.items)?tier.items:[]).reduce((sum,line)=>sum+num(line.quantity)*num(line.unitPrice),0);
}
function h38ToggleTierMode(on){
  const q=state.quote||(state.quote={});
  if(!!q.tierMode===!!on)return;
  if(on){
    const tiers=h38DefaultTiers();
    if(Array.isArray(q.lines)&&q.lines.length){
      if(!confirm('Switch to Good / Better / Best? Your current line items move into the Better (recommended) tier. You can then trim Good and expand Best.'))return;
      tiers[1].items=q.lines.map(l=>({...l,quoteLineId:newId('QUOTE-LINE')}));
    }
    q.tierMode=true;q.tiers=tiers;
    toast('Tier mode on. Better is the recommended tier — trim Good, expand Best.');
  }else{
    const better=(q.tiers&&q.tiers[1]&&Array.isArray(q.tiers[1].items))?q.tiers[1].items:[];
    if(!confirm('Switch back to a single price? The Better tier line items become the single-price quote.'))return;
    q.lines=better.map(l=>({...l}));
    q.tierMode=false;q.tiers=null;
    toast('Single-price mode. Better tier items are now the quote lines.');
  }
  q.ownerEdited=true;q.ownerEditedAt=new Date().toISOString();
  renderQuotes();
}
function h38AddTierLine(tierIndex){
  const tiers=h38EnsureTiers(),tier=tiers[tierIndex];
  if(!tier)throw new Error('Tier not found.');
  const descInput=document.querySelector('[data-tier-add-desc="'+tierIndex+'"]'),qtyInput=document.querySelector('[data-tier-add-qty="'+tierIndex+'"]'),priceInput=document.querySelector('[data-tier-add-price="'+tierIndex+'"]'),unitInput=document.querySelector('[data-tier-add-unit="'+tierIndex+'"]');
  const description=String(descInput.value||'').trim(),
    quantity=num(qtyInput.value),
    unit=String(unitInput&&unitInput.value||'each').trim()||'each',
    unitPrice=num(priceInput.value);
  const sig=description?['tier'+tierIndex,description,quantity,unit,unitPrice].join('|'):'';
  if(!description){if(h38LineAddReplay(''))return;throw new Error('Line description is required.');}
  if(quantity<=0)throw new Error('Quantity must be greater than zero.');
  if(h38LineAddReplay(sig))return;
  h38LineAddStamp(sig);
  descInput.value='';priceInput.value='';
  tier.items.push({quoteLineId:newId('QUOTE-LINE'),description,quantity,unit,unitPrice,priceSource:'Typed in',priceStatus:'Check before sending'});
  state.quote.ownerEdited=true;state.quote.ownerEditedAt=new Date().toISOString();
  renderTierEditor();
}
function h38TierSummaryText(tiers){
  return tiers.map(t=>esc(t.name)+' '+money(h38TierTotal(t))).join(' · ');
}
function h38RefreshTierTotals(){
  const tiers=h38EnsureTiers();
  document.querySelectorAll('[data-tier-foot-total]').forEach(node=>{const t=tiers[num(node.dataset.tierFootTotal)];if(t)node.textContent=money(h38TierTotal(t));});
  document.querySelectorAll('[data-tier-line-total]').forEach(node=>{const parts=String(node.dataset.tierLineTotal).split(':').map(Number),t=tiers[parts[0]],line=t&&t.items[parts[1]];if(line)node.textContent=money(num(line.quantity)*num(line.unitPrice));});
  const strip=$('h38TierSummaryTotals');if(strip)strip.innerHTML=h38TierSummaryText(tiers);
  const warn=$('h38TierSummaryWarn');if(warn)warn.hidden=tiers.every(t=>(t.items||[]).length>0);
}
function h38RenderTierPickerResults(tierIndex){
  const host=document.querySelector('[data-tier-results="'+tierIndex+'"]');if(!host)return;
  const searchInput=document.querySelector('[data-tier-search="'+tierIndex+'"]');
  const rows=h38PriceBookFilter(searchInput?searchInput.value:'');
  host.innerHTML=rows.length?rows.map(row=>'<div class="h38-tier-picker-row"><div class="row-top"><strong>'+esc(v(row,'Description','description'))+'</strong><button type="button" class="secondary" data-tier-use="'+tierIndex+':'+esc(rowId(row,'Item ID','itemId'))+'">Add</button></div><small>'+esc(v(row,'SKU','sku'))+' · '+money(v(row,'Selling Price','unitPrice'))+' / '+esc(v(row,'Unit of Measure','unit')||'each')+'</small></div>').join(''):'<p class="muted small">No matching price book items.</p>';
  host.querySelectorAll('[data-tier-use]').forEach(button=>button.onclick=()=>{const parts=String(button.dataset.tierUse).split(':');h38AddTierPriceItem(num(parts[0]),parts.slice(1).join(':'));});
}
function h38AddTierPriceItem(tierIndex,itemId){
  const tiers=h38EnsureTiers(),tier=tiers[tierIndex];if(!tier)throw new Error('Tier not found.');
  const row=records('priceBook').find(item=>rowId(item,'Item ID','itemId')===itemId);if(!row)throw new Error('Price book item not found.');
  tier.items.push({quoteLineId:newId('QUOTE-LINE'),description:v(row,'Description','description'),quantity:1,unit:v(row,'Unit of Measure','unit')||'each',unitPrice:num(v(row,'Selling Price','unitPrice')),priceSource:'Price Book',priceStatus:'Check before sending',inventoryItemId:rowId(row,'Item ID','itemId')||undefined});
  state.quote.ownerEdited=true;state.quote.ownerEditedAt=new Date().toISOString();
  renderTierEditor();
}
function h38CopyTierLines(tierIndex){
  const tiers=h38EnsureTiers(),tier=tiers[tierIndex];if(!tier)return;
  const select=document.querySelector('[data-tier-copy-source="'+tierIndex+'"]');if(!select||!select.value)return;
  let sourceLines=[];
  if(select.value==='single')sourceLines=state.quote.lines||[];
  else{const src=tiers[num(select.value)];sourceLines=src?src.items||[]:[];}
  if(!sourceLines.length){toast('Nothing to copy from that source yet.',true);return;}
  sourceLines.forEach(line=>tier.items.push({...JSON.parse(JSON.stringify(line)),quoteLineId:newId('QUOTE-LINE')}));
  state.quote.ownerEdited=true;state.quote.ownerEditedAt=new Date().toISOString();
  renderTierEditor();
  toast(sourceLines.length+' line'+(sourceLines.length===1?'':'s')+' copied into '+tier.name+'.');
}
function renderTierEditor(){
  const host=$('tierEditor');if(!host)return;
  const tiers=h38EnsureTiers();
  const anyEmpty=tiers.some(t=>!(t.items||[]).length);
  host.innerHTML='<div class="h38-tier-summary" id="h38TierSummary"><strong id="h38TierSummaryTotals">'+h38TierSummaryText(tiers)+'</strong><small>Quote total shows Better until the customer chooses.</small>'+(anyEmpty?'<small class="h38-tier-summary-warn" id="h38TierSummaryWarn">Every option needs at least one line before this quote can be sent.</small>':'<small class="h38-tier-summary-warn" id="h38TierSummaryWarn" hidden>Every option needs at least one line before this quote can be sent.</small>')+'</div>'+
  '<div class="h38-tier-grid">'+tiers.map((tier,ti)=>
    '<section class="h38-tier-card" aria-label="'+esc(tier.name)+' tier">'+
      '<div class="h38-tier-card-head">'+
        '<input class="h38-tier-name" data-tier-name="'+ti+'" value="'+esc(tier.name)+'" aria-label="Tier '+(ti+1)+' name" maxlength="24">'+
        (ti===1?'<span class="h38-tier-popular">Most Popular</span>':'')+
      '</div>'+
      '<div class="h38-tier-body">'+
        '<div><label>What this tier includes <small class="muted">(shown to customer)</small></label>'+
        '<textarea data-tier-desc="'+ti+'" placeholder="Describe this option for the customer">'+esc(tier.description||'')+'</textarea></div>'+
        '<div class="h38-tier-lines">'+((tier.items||[]).length?tier.items.map((line,li)=>
          '<div class="h38-tier-line"><div class="two"><div><label>Description</label><input data-tier-line-field="description" data-tier-line="'+ti+':'+li+'" value="'+esc(line.description)+'"></div><div><label>Unit</label><input data-tier-line-field="unit" data-tier-line="'+ti+':'+li+'" value="'+esc(line.unit||'each')+'"></div></div>'+
          '<div class="three"><div><label>Quantity</label><input data-tier-line-field="quantity" data-tier-line="'+ti+':'+li+'" type="number" min="0.01" step="0.01" value="'+esc(line.quantity)+'"></div><div><label>Unit price</label><input data-tier-line-field="unitPrice" data-tier-line="'+ti+':'+li+'" type="number" min="0" step="0.01" value="'+esc(line.unitPrice)+'"></div><div><label>Line total</label><strong data-tier-line-total="'+ti+':'+li+'">'+money(num(line.quantity)*num(line.unitPrice))+'</strong></div></div>'+
          '<div class="row-actions"><small>'+esc(h38QuoteLineSourceLabel(line))+'</small><button type="button" class="secondary" data-tier-remove="'+ti+':'+li+'">Remove</button></div></div>'
        ).join(''):'<p class="muted small">No line items yet — add the first one below.</p>')+'</div>'+
        '<div class="h38-tier-picker"><label>Price book — tap an item to add it to '+esc(tier.name)+'</label><input data-tier-search="'+ti+'" placeholder="Search prices"><div class="h38-tier-picker-results" data-tier-results="'+ti+'"></div></div>'+
        '<div class="h38-tier-add">'+
          '<div><label>Add line item</label><input data-tier-add-desc="'+ti+'" placeholder="e.g. Water heater install"></div>'+
          '<div class="three"><div><label>Qty</label><input data-tier-add-qty="'+ti+'" type="number" min="0.01" step="0.01" value="1"></div>'+
          '<div><label>Unit</label><input data-tier-add-unit="'+ti+'" value="each"></div>'+
          '<div><label>Unit price</label><input data-tier-add-price="'+ti+'" type="number" min="0" step="0.01" placeholder="0.00"></div></div>'+
          '<button type="button" data-tier-add="'+ti+'">Add to '+esc(tier.name)+'</button>'+
        '</div>'+
        '<div class="h38-tier-copy"><label>Copy lines from…</label><div class="h38-tier-copy-row"><select data-tier-copy-source="'+ti+'">'+tiers.map((other,oi)=>oi===ti?'':'<option value="'+oi+'">'+esc(other.name)+'</option>').join('')+((state.quote.lines&&state.quote.lines.length)?'<option value="single">Single-price lines</option>':'')+'</select><button type="button" class="secondary" data-tier-copy="'+ti+'">Copy</button></div></div>'+
      '</div>'+
      '<div class="h38-tier-foot"><strong>'+esc(tier.name)+' total</strong><strong data-tier-foot-total="'+ti+'">'+money(h38TierTotal(tier))+'</strong></div>'+
    '</section>').join('')+'</div>'+
  '<div class="actions" style="margin-top:10px"><button type="button" class="secondary" id="suggestTiersButton">Suggest tiers with Hank</button></div>'+
  '<p class="muted small">All three tiers save with the quote. The customer presentation highlights <strong>Better</strong> as Most Popular.</p>';
  host.querySelectorAll('[data-tier-name]').forEach(input=>input.oninput=()=>{const t=tiers[num(input.dataset.tierName)];if(t){t.name=String(input.value||'').slice(0,24);state.quote.ownerEdited=true;}});
  host.querySelectorAll('[data-tier-desc]').forEach(input=>input.oninput=()=>{const t=tiers[num(input.dataset.tierDesc)];if(t){t.description=input.value;state.quote.ownerEdited=true;}});
  host.querySelectorAll('[data-tier-line-field]').forEach(input=>input.oninput=()=>{const parts=String(input.dataset.tierLine).split(':').map(Number),t=tiers[parts[0]],line=t&&t.items[parts[1]];if(!line)return;const field=input.dataset.tierLineField;if(field==='quantity'||field==='unitPrice'){const value=num(input.value);if(field==='quantity'&&value<=0)return;line[field]=value;}else line[field]=input.value;state.quote.ownerEdited=true;state.quote.ownerEditedAt=new Date().toISOString();h38RefreshTierTotals();});
  host.querySelectorAll('[data-tier-search]').forEach(input=>input.oninput=()=>h38RenderTierPickerResults(num(input.dataset.tierSearch)));
  host.querySelectorAll('[data-tier-add]').forEach(button=>button.onclick=()=>{try{h38AddTierLine(num(button.dataset.tierAdd));}catch(error){toast(error&&error.message||String(error),true);}});
  host.querySelectorAll('[data-tier-remove]').forEach(button=>button.onclick=()=>{const parts=String(button.dataset.tierRemove).split(':').map(Number);if(tiers[parts[0]])tiers[parts[0]].items.splice(parts[1],1);state.quote.ownerEdited=true;renderTierEditor();});
  host.querySelectorAll('[data-tier-copy]').forEach(button=>button.onclick=()=>h38CopyTierLines(num(button.dataset.tierCopy)));
  tiers.forEach((_,ti)=>h38RenderTierPickerResults(ti));
  const suggest=$('suggestTiersButton');if(suggest)suggest.onclick=h38SuggestTiers;
}
async function h38SuggestTiers(){
  if(!window.H38_AI_HANDOFF||typeof window.H38_AI_HANDOFF.runTask!=='function'){
    toast('Hank is not available in this session. Build the tiers manually — the editor above works without AI.',true);return;
  }
  const tiers=h38EnsureTiers();
  const sourceLines=[...(state.quote.lines||[]),...tiers.reduce((all,t)=>all.concat(t.items||[]),[])];
  if(!sourceLines.length){toast('Add some line items first (single price or any tier), then ask Hank to suggest a split.',true);return;}
  if(!confirm('Ask Hank to suggest a Good / Better / Best split from your '+sourceLines.length+' line item(s)? Nothing changes until you review and approve.'))return;
  const button=$('suggestTiersButton');if(button){button.disabled=true;button.textContent='Asking Hank…';}
  try{
    const result=await window.H38_AI_HANDOFF.runTask('suggest_quote_tiers',{
      businessId:state.businessId,
      projectTitle:state.quote.projectTitle||'',
      scope:state.quote.scope||'',
      lines:sourceLines.map(l=>({description:l.description,quantity:num(l.quantity),unit:l.unit,unitPrice:num(l.unitPrice)}))
    },{timeoutMs:120000});
    const suggested=result&&result.tiers;
    if(!Array.isArray(suggested)||suggested.length!==3)throw new Error('Hank did not return three tiers.');
    if(!confirm('Hank suggested a tier split. Apply it? Your current tier contents will be replaced — this is still a draft, nothing is sent.'))return;
    const names=['Good','Better','Best'];
    state.quote.tiers=suggested.map((t,ti)=>({id:['good','better','best'][ti],name:String((t&&t.name)||names[ti]).slice(0,24),description:String((t&&t.description)||''),items:Array.isArray(t&&t.items)?t.items.map(l=>({quoteLineId:newId('QUOTE-LINE'),description:String(l.description||'Suggested work'),quantity:Math.max(0.01,num(l.quantity||1)),unit:String(l.unit||'each'),unitPrice:num(l.unitPrice||0),priceSource:'Hank tier suggestion',priceStatus:'Owner review required'})):[]}));
    state.quote.tierMode=true;state.quote.ownerEdited=true;
    toast('AI tier suggestion applied. Review every line before saving — prices need owner review.');
    renderQuotes();
  }catch(error){
    toast('Tier suggestions are not available from Hank right now ('+((error&&error.message)||'no result')+'). The manual tier editor works without AI.',true);
  }finally{if(button){button.disabled=false;button.textContent='Suggest tiers with Hank';}}
}

// Unified quote entry chooser - one button, clear choices
function h38ShowQuoteEntryChooser(){
  let d=document.getElementById('h38QuoteEntryDialog');
  if(!d){
    d=document.createElement('dialog');
    d.id='h38QuoteEntryDialog';
    d.className='h38-quote-entry-dialog';
    d.innerHTML=`<div class="h38-quote-entry-shell">
      <div class="h38-quote-entry-head">
        <div><h2>New quote</h2><p>How do you want to start? Nothing is sent until you approve it.</p></div>
        <button type="button" class="icon-button" data-h38-close aria-label="Close">×</button>
      </div>
      <div class="h38-quote-entry-grid">
        <button type="button" data-qe="blank"><span>📝</span><strong>Start blank</strong><small>Type it up yourself</small></button>
        <button type="button" data-qe="hank"><span>🤖</span><strong>Build with Hank</strong><small>AI drafts from your price book</small></button>
        <button type="button" data-qe="photos"><span>📷</span><strong>From photos</strong><small>Snap the job, build the quote</small></button>
        <button type="button" data-qe="measure"><span>📐</span><strong>Photos & Measure</strong><small>Walkthrough with measurements</small></button>
      </div>
    </div>
    <style>
    .h38-quote-entry-dialog{width:min(480px,calc(100vw - 20px));border:0;border-radius:18px;padding:0}
    .h38-quote-entry-dialog::backdrop{background:rgba(0,0,0,.5)}
    .h38-quote-entry-shell{padding:20px;display:grid;gap:16px}
    .h38-quote-entry-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
    .h38-quote-entry-head h2{margin:0}
    .h38-quote-entry-head p{margin:4px 0 0;color:#607285;font-size:.9rem}
    .h38-quote-entry-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .h38-quote-entry-grid button{display:grid;gap:4px;padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;cursor:pointer;text-align:left}
    .h38-quote-entry-grid button:hover{border-color:#0b2438;background:#f8fafc}
    .h38-quote-entry-grid button span{font-size:28px}
    .h38-quote-entry-grid button strong{font-size:1rem}
    .h38-quote-entry-grid button small{color:#607285;font-size:.82rem}
    </style>`;
    d.querySelector('[data-h38-close]').onclick=()=>d.close();
    d.querySelectorAll('[data-qe]').forEach(b=>b.onclick=()=>{d.close();h38StartQuote(b.dataset.qe);});
    document.body.appendChild(d);
  }
  if(!d.open)d.showModal();
}

function h38StartQuote(mode){
  // Reset to blank quote first
  state.quote={quoteId:'',lines:[],tierMode:false,tiers:null,hydrationComplete:true};
  state.quoteView='builder';
  renderQuotes();
  try{
    if(mode==='hank'&&typeof h38BuildAiQuoteDraft==='function'){
      setTimeout(()=>h38BuildAiQuoteDraft(),300);
    }else if(mode==='photos'){
      // #quotePhotoInput is removed by quote-mobile-stabilization, whose
      // gallery/camera buttons are the canonical photo intake. Use them;
      // fall back to the raw input when stabilization is not active.
      setTimeout(()=>{const target=document.getElementById('h38ChooseQuotePhotosAction')||document.getElementById('quotePhotoButton')||document.getElementById('quotePhotoInput');target?.click();},300);
    }else if(mode==='measure'&&typeof renderMeasure==='function'){
      setTimeout(()=>renderMeasure(),300);
    }else{
      try{document.getElementById('quoteCustomer')?.focus?.({preventScroll:true});}catch(_){}
    }
    window.toast?.('Started a new quote.');
  }catch(e){}
}
