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
    if(!lines.length)throw new Error('Kit could not identify quotable work from the photos.');
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
        priceStatus:'Owner review required - from photo analysis',
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
function renderQuotes(){if(!state.quote||typeof state.quote!=='object')state.quote={quoteId:'',lines:[],hydrationComplete:true};const customers=records('customers'),allQuotes=records('quotes'),priceBook=records('priceBook');
// In demo tenant, hide broken DEMO-Q quotes (missing line items) — show only working LOCAL- quotes
const isDemoTenant=(typeof businessKey==='function'&&businessKey()==='demo');
const quotes=isDemoTenant?allQuotes.filter(row=>!/^DEMO-Q-/i.test(String(row['Quote ID']||row['quoteId']||''))):allQuotes;const q=state.quote,linkedQuote=q.quoteId?quotes.find(row=>rowId(row,'Quote ID','quoteId')===q.quoteId):null,resolvedCustomerId=v(linkedQuote,'Customer ID','customerId')||q.customerId||'';if(resolvedCustomerId&&q.customerId!==resolvedCustomerId)q.customerId=resolvedCustomerId;$('mainContent').innerHTML=pageHead('Quote Builder','Build, measure, photograph, price, save and reopen one shared quote online or offline. Cached prices always require owner review.',`<button id="quoteMeasureButton" class="secondary">📐 Photos & Measure</button><button id="newQuoteButton" class="secondary">New draft</button>`)+`<div class="grid"><section class="card span7"><h2>Quote draft</h2>${q.quoteId?`<div class="notice"><strong>Saved revision ${esc(q.revision||1)} loaded.</strong> Adjust quantities or prices below, then save as the next revision. AI updates cannot replace this saved revision.</div>`:''}<div class="two"><div><label>Customer</label><select id="quoteCustomer">${optionRows(customers,['Customer ID'],row=>v(row,'Customer Name'),'Generic Quote Customer')}</select></div><div><label>Project title</label><input id="quoteTitle" value="${esc(q.projectTitle||'')}"></div></div><label>Scope</label><textarea id="quoteScope">${esc(q.scope||'')}</textarea><label>Measurements and site notes</label><textarea id="quoteMeasurements">${esc(q.measurementNotes||'')}</textarea><div class="h38-tier-toggle" role="group" aria-label="Quote pricing mode"><button type="button" id="tierModeSingle" aria-pressed="${q.tierMode?'false':'true'}">Single price</button><button type="button" id="tierModeTiers" aria-pressed="${q.tierMode?'true':'false'}">Good / Better / Best</button></div><div id="singlePriceEditor" class="${q.tierMode?'hidden':''}"><h3>Line items</h3><div class="quote-line"><div><label>Description</label><input id="lineDescription"></div><div><label>Qty</label><input id="lineQuantity" type="number" step="0.01" value="1"></div><div><label>Unit</label><input id="lineUnit" value="each"></div><div><label>Unit price</label><input id="linePrice" type="number" step="0.01"></div><button id="addQuoteLine" type="button">Add</button></div><div id="quoteLines" class="list"></div><div class="row-top"><strong>Total</strong><strong id="quoteTotal">${money(0)}</strong></div></div><div id="tierEditor" class="${q.tierMode?'':'hidden'}"></div><div class="actions"><button id="saveQuoteButton">Save draft</button><button class="secondary" id="quotePhotoButton">Add photo</button><button class="secondary" id="quoteFromPhotosButton">Quote from photos</button><input id="quotePhotoInput" type="file" accept="image/*" capture="environment" class="hidden"></div></section>${(window.H38FirstQuoteGuide?window.H38FirstQuoteGuide.render():"")}<section class="card span5"><h2>Cached Price Book</h2><input id="priceSearch" placeholder="Search prices"><p class="muted small">${priceBook.length} cached items · no live research while offline · owner review required</p><div id="priceResults" class="list"></div></section><section class="card"><h2>Saved quotes</h2><div class="list">${quotes.length?quotes.slice(0,100).map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Project Title','projectTitle'))}</strong>${pill(v(row,'Status')||'Draft',row.__localPending?'pending':'')}</div><small>${esc(v(row,'Quote Number','quoteNumber')||'Local draft')} · ${money(v(row,'Total','total'))}${/good-better-best/i.test(v(row,'Tier Mode','tierMode')||'')?' · 3 tiers':''} · revision ${esc(v(row,'Revision','revision')||1)}</small><div class="row-actions"><button data-open-quote="${esc(rowId(row,'Quote ID','quoteId'))}">Open draft</button>${/presented|sent/i.test(v(row,'Status')||'')?`<button class="secondary" data-log-followup="${esc(rowId(row,'Quote ID','quoteId'))}">📞 Log follow-up</button>`:''}</div></div>`).join(''):empty('No quotes yet.')}</div></section></div>`;const customer=$('quoteCustomer');if(resolvedCustomerId&&!Array.from(customer.options).some(option=>option.value===resolvedCustomerId)){const row=customers.find(item=>rowId(item,'Customer ID','customerId')===resolvedCustomerId),option=document.createElement('option');option.value=resolvedCustomerId;option.textContent=v(row,'Customer Name','name')||'Saved quote customer';customer.appendChild(option);}customer.value=resolvedCustomerId;$('quoteMeasureButton').onclick=renderMeasure;$('newQuoteButton').onclick=()=>{state.quote={quoteId:'',lines:[],tierMode:false,tiers:null,hydrationComplete:true};renderQuotes();};$('addQuoteLine').onclick=()=>{try{addQuoteLine();}catch(error){toast(error?.message||String(error),true);}};$('saveQuoteButton').onclick=saveQuote;$('tierModeSingle').onclick=()=>h38ToggleTierMode(false);$('tierModeTiers').onclick=()=>h38ToggleTierMode(true);renderTierEditor();$('priceSearch').oninput=renderPriceResults;$('quotePhotoButton').onclick=()=>$('quotePhotoInput').click();
$('quoteFromPhotosButton').onclick=()=>quoteFromPhotos();$('quotePhotoInput').onchange=event=>handleAttachmentFiles(event.target.files,'Quote',state.quote.quoteId||'LOCAL-QUOTE');document.querySelectorAll('[data-open-quote]').forEach(button=>button.onclick=()=>openQuote(button.dataset.openQuote));
document.querySelectorAll('[data-log-followup]').forEach(button=>button.onclick=()=>logQuoteFollowup(button.dataset.logFollowup));renderQuoteLines();renderPriceResults();if(window.H38FirstQuoteGuide)window.H38FirstQuoteGuide.wire();}
function addQuoteLine(){const description=requireValue($('lineDescription').value,'Line description is required.'),quantity=num($('lineQuantity').value),unitPrice=num($('linePrice').value);if(quantity<=0)throw new Error('Quantity must be greater than zero.');state.quote.lines.push({quoteLineId:newId('QUOTE-LINE'),description,quantity,unit:$('lineUnit').value||'each',unitPrice,priceSource:'Cached or manual',priceStatus:'Owner review required',inventoryItemId:(window.H38InventoryModule?window.H38InventoryModule.takePendingItem():'')||undefined});$('lineDescription').value='';$('linePrice').value='';renderQuoteLines();}
function renderQuoteLines(){if(!$('quoteLines'))return;const lines=state.quote.lines||[];$('quoteLines').innerHTML=lines.length?lines.map((line,index)=>`<div class="row quote-edit-row"><div class="two"><div><label>Description</label><input data-line-field="description" data-line-index="${index}" value="${esc(line.description)}"></div><div><label>Unit</label><input data-line-field="unit" data-line-index="${index}" value="${esc(line.unit||'each')}"></div></div><div class="three"><div><label>Quantity</label><input data-line-field="quantity" data-line-index="${index}" type="number" min="0.01" step="0.01" value="${esc(line.quantity)}"></div><div><label>Unit price</label><input data-line-field="unitPrice" data-line-index="${index}" type="number" min="0" step="0.01" value="${esc(line.unitPrice)}"></div><div><label>Line total</label><strong data-line-total="${index}">${money(num(line.quantity)*num(line.unitPrice))}</strong></div></div><div class="row-actions">${line.inventoryItemId?'<small>📦 stock item</small>':''}<small>Owner review required</small><button class="secondary" data-remove-line="${index}">Remove</button></div></div>`).join(''):empty('No quote lines.');const refreshTotal=()=>{$('quoteTotal').textContent=money((state.quote.lines||[]).reduce((sum,line)=>sum+num(line.quantity)*num(line.unitPrice),0));document.querySelectorAll('[data-line-total]').forEach(node=>{const index=num(node.dataset.lineTotal),line=state.quote.lines[index];if(line)node.textContent=money(num(line.quantity)*num(line.unitPrice));});};document.querySelectorAll('[data-line-field]').forEach(input=>input.oninput=()=>{const index=num(input.dataset.lineIndex),field=input.dataset.lineField,line=state.quote.lines[index];if(!line)return;if(field==='quantity'||field==='unitPrice'){const value=num(input.value);if(field==='quantity'&&value<=0)return;line[field]=value;}else line[field]=input.value;state.quote.ownerEdited=true;state.quote.ownerEditedAt=new Date().toISOString();refreshTotal();});document.querySelectorAll('[data-remove-line]').forEach(button=>button.onclick=()=>{state.quote.lines.splice(num(button.dataset.removeLine),1);state.quote.ownerEdited=true;state.quote.ownerEditedAt=new Date().toISOString();renderQuoteLines();});refreshTotal();}
function renderPriceResults(){if(!$('priceResults'))return;const search=$('priceSearch').value.toLowerCase().trim(),rows=records('priceBook').filter(row=>!search||`${v(row,'SKU','sku')} ${v(row,'Description','description')}`.toLowerCase().includes(search)).slice(0,80);$('priceResults').innerHTML=rows.length?rows.map(row=>`<div class="row"><div class="row-top"><strong>${esc(v(row,'Description','description'))}</strong><button data-use-price="${esc(rowId(row,'Item ID','itemId'))}">Use</button></div><small>${esc(v(row,'SKU','sku'))} · ${money(v(row,'Selling Price','unitPrice'))} / ${esc(v(row,'Unit of Measure','unit')||'each')}</small></div>`).join(''):empty('No matching cached prices.');document.querySelectorAll('[data-use-price]').forEach(button=>button.onclick=()=>{const row=records('priceBook').find(item=>rowId(item,'Item ID','itemId')===button.dataset.usePrice);$('lineDescription').value=v(row,'Description','description');$('lineUnit').value=v(row,'Unit of Measure','unit')||'each';$('linePrice').value=num(v(row,'Selling Price','unitPrice')).toFixed(2);if(window.H38InventoryModule)window.H38InventoryModule.notePendingItem(row);});}
async function saveQuote(){const title=requireValue($('quoteTitle').value,'Project title is required.'),quoteId=state.quote.quoteId||newId('QUOTE'),tierMode=!!state.quote.tierMode,tiers=tierMode?h38EnsureTiers().map(t=>({name:t.name,description:t.description||'',total:Math.round(h38TierTotal(t)*100)/100,items:(t.items||[]).map(l=>({...l}))})):null,lines=tierMode?[]:(state.quote.lines||[]),total=tierMode?tiers[1].total:lines.reduce((sum,line)=>sum+num(line.quantity)*num(line.unitPrice),0),previousRevision=num(state.quote.revision||0),record={'Quote ID':quoteId,'Business ID':state.businessId,'Customer ID':$('quoteCustomer').value,'Quote Number':state.quote.quoteNumber||`LOCAL-${Date.now()}`,'Project Title':title,'Scope':$('quoteScope').value,'Measurement Notes':$('quoteMeasurements').value,'Status':'Draft','Revision':previousRevision+1,'Previous Revision':previousRevision||'','Tier Mode':tierMode?'Good-Better-Best':'Single','Subtotal':total,'Tax':0,'Total':total,'Created Time':now(),'Updated Time':now(),'Record Version':1,lines,tiers};await queueOperation('SAVE_QUOTE','Quote',quoteId,{quoteId,customerId:$('quoteCustomer').value,projectTitle:title,scope:$('quoteScope').value,measurementNotes:$('quoteMeasurements').value,lines,tiers,tierMode,tax:0},{collection:'quotes',record,idKeys:['Quote ID']});state.quote={...state.quote,quoteId,customerId:$('quoteCustomer').value,projectTitle:title,scope:$('quoteScope').value,measurementNotes:$('quoteMeasurements').value,revision:record.Revision,savedTotal:total,loadedSavedTotal:total,loadedRevision:record.Revision,hydrationComplete:true,savedLineSnapshot:JSON.parse(JSON.stringify(tierMode?tiers:lines)),ownerEdited:false};toast(`Quote revision ${record.Revision} saved at ${money(total)}${tierMode?' (Better tier total)':''}. Nothing approved or sent.`);if(window.H38FirstQuoteGuide)window.H38FirstQuoteGuide.afterSave(total,tierMode?(tiers||[]).reduce((n,t)=>n+((t.items||[]).length),0):lines.length);renderQuotes();}

/* ---- Good / Better / Best tiered estimates (v2.0) ----
   Manual-first: tiers are built by hand in the editor below.
   The optional H38 AI "Suggest tiers" button degrades gracefully. */
function h38DefaultTiers(){
  return [
    {name:'Good',description:'Essential scope — the minimum to get the job done right.',items:[]},
    {name:'Better',description:'Recommended — adds preventive work and stronger materials for longer-lasting results.',items:[]},
    {name:'Best',description:'Premium — full replacement with extended warranty and top-grade materials.',items:[]}
  ];
}
function h38EnsureTiers(){
  if(!state.quote||typeof state.quote!=='object')state.quote={};
  if(!Array.isArray(state.quote.tiers)||state.quote.tiers.length!==3)state.quote.tiers=h38DefaultTiers();
  state.quote.tiers.forEach(t=>{if(!t||typeof t!=='object')return;if(!Array.isArray(t.items))t.items=[];if(!t.name)t.name='Tier';});
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
  const description=requireValue(String(document.querySelector('[data-tier-add-desc="'+tierIndex+'"]').value||''),'Line description is required.'),
    quantity=num(document.querySelector('[data-tier-add-qty="'+tierIndex+'"]').value),
    unitPrice=num(document.querySelector('[data-tier-add-price="'+tierIndex+'"]').value);
  if(quantity<=0)throw new Error('Quantity must be greater than zero.');
  tier.items.push({quoteLineId:newId('QUOTE-LINE'),description,quantity,unit:'each',unitPrice,priceSource:'Cached or manual',priceStatus:'Owner review required'});
  state.quote.ownerEdited=true;state.quote.ownerEditedAt=new Date().toISOString();
  renderTierEditor();
}
function renderTierEditor(){
  const host=$('tierEditor');if(!host)return;
  const tiers=h38EnsureTiers();
  host.innerHTML='<div class="h38-tier-grid">'+tiers.map((tier,ti)=>
    '<section class="h38-tier-card" aria-label="'+esc(tier.name)+' tier">'+
      '<div class="h38-tier-card-head">'+
        '<input class="h38-tier-name" data-tier-name="'+ti+'" value="'+esc(tier.name)+'" aria-label="Tier '+(ti+1)+' name" maxlength="24">'+
        (ti===1?'<span class="h38-tier-popular">Most Popular</span>':'')+
      '</div>'+
      '<div class="h38-tier-body">'+
        '<div><label>What this tier includes <small class="muted">(shown to customer)</small></label>'+
        '<textarea data-tier-desc="'+ti+'" placeholder="Describe this option for the customer">'+esc(tier.description||'')+'</textarea></div>'+
        '<div class="h38-tier-lines">'+((tier.items||[]).length?tier.items.map((line,li)=>
          '<div class="h38-tier-line"><div class="row-top"><strong>'+esc(line.description)+'</strong><strong>'+money(num(line.quantity)*num(line.unitPrice))+'</strong></div>'+
          '<small>'+esc(line.quantity)+' '+esc(line.unit||'each')+' × '+money(num(line.unitPrice))+'</small>'+
          '<div class="row-actions"><button type="button" class="secondary" data-tier-remove="'+ti+':'+li+'">Remove</button></div></div>'
        ).join(''):'<p class="muted small">No line items yet — add the first one below.</p>')+'</div>'+
        '<div class="h38-tier-add">'+
          '<div><label>Add line item</label><input data-tier-add-desc="'+ti+'" placeholder="e.g. Water heater install"></div>'+
          '<div class="two"><div><label>Qty</label><input data-tier-add-qty="'+ti+'" type="number" min="0.01" step="0.01" value="1"></div>'+
          '<div><label>Unit price</label><input data-tier-add-price="'+ti+'" type="number" min="0" step="0.01" placeholder="0.00"></div></div>'+
          '<button type="button" data-tier-add="'+ti+'">Add to '+esc(tier.name)+'</button>'+
        '</div>'+
      '</div>'+
      '<div class="h38-tier-foot"><strong>'+esc(tier.name)+' total</strong><strong>'+money(h38TierTotal(tier))+'</strong></div>'+
    '</section>').join('')+'</div>'+
  '<div class="actions" style="margin-top:10px"><button type="button" class="secondary" id="suggestTiersButton">Suggest tiers with H38 AI</button></div>'+
  '<p class="muted small">All three tiers save with the quote. The customer presentation highlights <strong>Better</strong> as Most Popular.</p>';
  host.querySelectorAll('[data-tier-name]').forEach(input=>input.oninput=()=>{const t=tiers[num(input.dataset.tierName)];if(t){t.name=String(input.value||'').slice(0,24);state.quote.ownerEdited=true;}});
  host.querySelectorAll('[data-tier-desc]').forEach(input=>input.oninput=()=>{const t=tiers[num(input.dataset.tierDesc)];if(t){t.description=input.value;state.quote.ownerEdited=true;}});
  host.querySelectorAll('[data-tier-add]').forEach(button=>button.onclick=()=>{try{h38AddTierLine(num(button.dataset.tierAdd));}catch(error){toast(error&&error.message||String(error),true);}});
  host.querySelectorAll('[data-tier-remove]').forEach(button=>button.onclick=()=>{const parts=String(button.dataset.tierRemove).split(':').map(Number);if(tiers[parts[0]])tiers[parts[0]].items.splice(parts[1],1);state.quote.ownerEdited=true;renderTierEditor();});
  const suggest=$('suggestTiersButton');if(suggest)suggest.onclick=h38SuggestTiers;
}
async function h38SuggestTiers(){
  if(!window.H38_AI_HANDOFF||typeof window.H38_AI_HANDOFF.runTask!=='function'){
    toast('H38 AI is not available in this session. Build the tiers manually — the editor above works without AI.',true);return;
  }
  const tiers=h38EnsureTiers();
  const sourceLines=[...(state.quote.lines||[]),...tiers.reduce((all,t)=>all.concat(t.items||[]),[])];
  if(!sourceLines.length){toast('Add some line items first (single price or any tier), then ask H38 AI to suggest a split.',true);return;}
  if(!confirm('Ask H38 AI to suggest a Good / Better / Best split from your '+sourceLines.length+' line item(s)? Nothing changes until you review and approve.'))return;
  const button=$('suggestTiersButton');if(button){button.disabled=true;button.textContent='Asking H38 AI…';}
  try{
    const result=await window.H38_AI_HANDOFF.runTask('suggest_quote_tiers',{
      businessId:state.businessId,
      projectTitle:state.quote.projectTitle||'',
      scope:state.quote.scope||'',
      lines:sourceLines.map(l=>({description:l.description,quantity:num(l.quantity),unit:l.unit,unitPrice:num(l.unitPrice)}))
    },{timeoutMs:120000});
    const suggested=result&&result.tiers;
    if(!Array.isArray(suggested)||suggested.length!==3)throw new Error('H38 AI did not return three tiers.');
    if(!confirm('H38 AI suggested a tier split. Apply it? Your current tier contents will be replaced — this is still a draft, nothing is sent.'))return;
    const names=['Good','Better','Best'];
    state.quote.tiers=suggested.map((t,ti)=>({name:String((t&&t.name)||names[ti]).slice(0,24),description:String((t&&t.description)||''),items:Array.isArray(t&&t.items)?t.items.map(l=>({quoteLineId:newId('QUOTE-LINE'),description:String(l.description||'Suggested work'),quantity:Math.max(0.01,num(l.quantity||1)),unit:String(l.unit||'each'),unitPrice:num(l.unitPrice||0),priceSource:'H38 AI tier suggestion',priceStatus:'Owner review required'})):[]}));
    state.quote.tierMode=true;state.quote.ownerEdited=true;
    toast('AI tier suggestion applied. Review every line before saving — prices need owner review.');
    renderQuotes();
  }catch(error){
    toast('Tier suggestions are not available from H38 AI right now ('+((error&&error.message)||'no result')+'). The manual tier editor works without AI.',true);
  }finally{if(button){button.disabled=false;button.textContent='Suggest tiers with H38 AI';}}
}
