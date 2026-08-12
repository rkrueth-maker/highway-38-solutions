'use strict';

const H38_APPROVED_LOGO='/assets/highway38-logo.png?v=20260720-exact-0cbc4514';
const H38_PUBLIC_EMAIL='highway38solutions@gmail.com';

function h38CurrentQuoteRecord(){
  const quoteId=String(state.quote&&state.quote.quoteId||'');
  return records('quotes').find(row=>rowId(row,'Quote ID','quoteId')===quoteId)||{};
}
function h38QuoteIsDemo(row){
  return /\bDEMO\b/i.test([v(row,'Status','status'),v(row,'Quote Number','quoteNumber'),v(row,'Project Title','projectTitle'),state.quote&&state.quote.projectTitle,state.quote&&state.quote.scope].join(' '));
}
function h38QuotePreviewLine(line){
  const quantity=num(v(line,'Quantity','quantity'));
  const unitPrice=num(v(line,'Unit Price','unitPrice'));
  return `<tr><td>${esc(v(line,'Description','description'))}</td><td>${esc(quantity)}</td><td>${esc(v(line,'Unit','unit')||'each')}</td><td>${money(unitPrice)}</td><td>${money(quantity*unitPrice)}</td></tr>`;
}
function h38AiPriceSourceLabel(line){
  const source=String(line?.priceSource||'').toLowerCase();
  if(line?.catalogId||source==='price_book'||source.includes('price book')||source.includes('price catalog'))return 'Price Book — owner review';
  if(source==='local_research'||source.includes('web research')||source.includes('local research'))return 'Current web research — owner review';
  if(num(line?.rate||line?.unitPrice)>0)return 'Current researched pricing — owner review';
  return 'Owner review required';
}
function h38NormalizeResearchedPriceSources(){
  if(!state.quote||!Array.isArray(state.quote.lines))return;
  state.quote.lines.forEach(line=>{
    const source=String(line?.priceSource||'');
    if(num(line?.unitPrice)>0&&(source==='AI suggestion — manual price required'||source==='Site Visit AI suggestion — manual price required'))line.priceSource='Current web research — owner review';
  });
}
function h38MissingCostSuggestions(){
  if(!state.quote)return[];
  const quoteId=String(state.quote.quoteId||'');
  const cache=window.H38_QUOTE_MISSING_COST_CACHE||{};
  const cached=quoteId&&Array.isArray(cache[quoteId])?cache[quoteId]:[];
  if(!Array.isArray(state.quote.possibleMissingCosts)||(!state.quote.possibleMissingCosts.length&&cached.length))state.quote.possibleMissingCosts=cached;
  return Array.isArray(state.quote.possibleMissingCosts)?state.quote.possibleMissingCosts:[];
}
function h38MissingCostById(id){return h38MissingCostSuggestions().find(item=>String(item?.suggestionId||'')===String(id||''));}
function h38SetMissingCostDecision(item,decision){
  if(!item)return;
  item.decision=decision;
  const quoteId=String(state.quote?.quoteId||'');
  if(quoteId&&window.H38_QUOTE_MISSING_COST_CACHE)window.H38_QUOTE_MISSING_COST_CACHE[quoteId]=h38MissingCostSuggestions();
}
function h38AddMissingCostToQuote(item){
  if(!item||!state.quote)return;
  const rate=num(item.rate),quantity=Math.max(.01,num(item.quantity||1));
  if(rate<=0){toast('H38 will not add an unpriced cost suggestion. Re-run the quote audit so current pricing can be researched.',true);return;}
  if(!Array.isArray(state.quote.lines))state.quote.lines=[];
  state.quote.lines.push({quoteLineId:newId('QUOTE-LINE'),description:String(item.description||'Possible missing expense'),quantity,unit:String(item.unit||'each'),unitPrice:rate,priceSource:h38AiPriceSourceLabel(item),priceStatus:'Owner review required'});
  state.quote.ownerEdited=true;
  h38SetMissingCostDecision(item,'ADDED');
  toast(`${item.description||'Missing cost'} added to the editable draft. Review it, then save the quote when ready.`);
  renderQuotes();
}
function h38AddMissingCostReviewPanel(){
  const main=$('mainContent');if(!main||!state.quote)return;
  main.querySelector('#h38MissingCostReview')?.remove();
  const all=h38MissingCostSuggestions(),pending=all.filter(item=>!item?.decision||item.decision==='PENDING');
  if(!pending.length)return;
  const panel=document.createElement('section');panel.id='h38MissingCostReview';panel.className='card h38-missing-cost-review';
  panel.innerHTML=`<div class="row-top"><div><span class="h38-missing-cost-kicker">OWNER COST CHECK</span><h2>Possible missing costs</h2></div><span class="pill pending">${pending.length} to review</span></div><p class="muted">H38 compared the scope and current estimate for likely expenses that may be missing. These are owner-only suggestions. Nothing is added, saved, approved, or shown to the customer unless you choose <strong>Add to quote</strong> and later save the draft.</p><div class="list">${pending.map(item=>{const quantity=Math.max(.01,num(item.quantity||1)),rate=num(item.rate),amount=quantity*rate;return `<div class="row h38-missing-cost-row" data-cost-id="${esc(item.suggestionId||'')}"><div class="row-top"><strong>${esc(item.description||'Possible missing expense')}</strong><strong>${money(amount)}</strong></div><small>${esc(quantity)} ${esc(item.unit||'each')} × ${money(rate)} · ${esc(h38AiPriceSourceLabel(item))} · ${esc(String(item.confidence||'low'))} confidence</small><p>${esc(item.reason||'H38 did not find an equivalent cost in the current draft.')}</p><div class="actions"><button type="button" data-cost-action="add">Add to quote</button><button type="button" class="secondary" data-cost-action="ignore">Ignore</button><button type="button" class="secondary" data-cost-action="na">Not applicable</button></div></div>`;}).join('')}</div>`;
  const grid=main.querySelector('.grid');if(grid)grid.insertAdjacentElement('beforebegin',panel);else main.querySelector('.page-head')?.insertAdjacentElement('afterend',panel);
  panel.querySelectorAll('button[data-cost-action]').forEach(button=>button.addEventListener('click',()=>{
    const row=button.closest('[data-cost-id]'),item=h38MissingCostById(row?.dataset?.costId),action=button.dataset.costAction;
    if(!item)return;
    if(action==='add'){h38AddMissingCostToQuote(item);return;}
    if(action==='ignore'){h38SetMissingCostDecision(item,'IGNORED');toast(`${item.description||'Cost'} left out of this draft.`);renderQuotes();return;}
    if(action==='na'){h38SetMissingCostDecision(item,'NOT_APPLICABLE');toast(`${item.description||'Cost'} marked not applicable.`);renderQuotes();}
  }));
}
function renderQuotePreview(){
  const row=h38CurrentQuoteRecord();
  const quoteId=String(state.quote&&state.quote.quoteId||rowId(row,'Quote ID','quoteId'));
  if(!quoteId){toast('Save the quote before opening the printable customer preview.',true);return;}
  const lines=state.quote&&Array.isArray(state.quote.lines)?state.quote.lines:[];
  const subtotal=lines.reduce((sum,line)=>sum+num(v(line,'Quantity','quantity'))*num(v(line,'Unit Price','unitPrice')),0);
  const tax=num(v(row,'Tax','tax'));
  const total=subtotal+tax;
  const customer=customerName(v(row,'Customer ID','customerId')||state.quote.customerId);
  const quoteNumber=v(row,'Quote Number','quoteNumber')||state.quote.quoteNumber||quoteId;
  const title=v(row,'Project Title','projectTitle')||state.quote.projectTitle||'Quote';
  const scope=v(row,'Scope','scope')||state.quote.scope||'';
  const measurements=v(row,'Measurement Notes','measurementNotes')||state.quote.measurementNotes||'';
  const revision=v(row,'Revision','revision')||state.quote.revision||1;
  const status=v(row,'Status','status')||'Draft';
  const demo=h38QuoteIsDemo(row);
  $('mainContent').innerHTML=pageHead('Customer Quote Preview','Review the customer-facing document, then print or save it as a PDF. Internal price sources and owner notes are not shown.',`<button id="backToQuoteFromPreview" class="secondary">← Back to Quote</button><button id="printQuoteButton">Print / Save PDF</button>`)+`<article id="quotePreviewDocument" class="quote-document" data-quote-id="${esc(quoteId)}" data-demo-record="${demo?'true':'false'}">
    <header class="quote-document-header">
      <div class="quote-brand"><img class="quote-logo" src="${H38_APPROVED_LOGO}" alt="Highway 38 Solutions"><div><strong>HIGHWAY 38 SOLUTIONS</strong><span>Professional Quote</span></div></div>
      <div class="quote-document-number"><span>Quote</span><strong>${esc(quoteNumber)}</strong><small>Revision ${esc(revision)}</small></div>
    </header>
    ${demo?'<div class="demo-banner">DEMO RECORD — NO FUNDS MOVED — FICTIONAL WEBSITE EXAMPLE</div>':''}
    <section class="quote-document-body">
      <div class="quote-document-title"><div><small>Prepared for</small><strong>${esc(customer)}</strong><h1>${esc(title)}</h1></div><div class="quote-status"><span>Status</span><strong>${esc(status)}</strong></div></div>
      <section class="quote-copy"><h2>Scope of work</h2><p>${esc(scope).replace(/\n/g,'<br>')}</p></section>
      ${measurements?`<section class="quote-copy"><h2>Measurements and site notes</h2><p>${esc(measurements).replace(/\n/g,'<br>')}</p></section>`:''}
      <section class="quote-copy"><h2>Itemized quote</h2><div class="quote-table-wrap"><table class="quote-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${lines.map(h38QuotePreviewLine).join('')}</tbody></table></div></section>
      <section class="quote-totals"><div><span>Subtotal</span><strong>${money(subtotal)}</strong></div>${tax?`<div><span>Tax</span><strong>${money(tax)}</strong></div>`:''}<div class="grand"><span>Quote total</span><strong id="quotePreviewTotal">${money(total)}</strong></div></section>
      <section class="quote-boundary"><strong>Owner review required.</strong> Verify measurements, quantities, taxes, pricing, permits, utilities, specifications, access, selections and customer terms before approval or delivery. Nothing is automatically approved or sent.</section>
    </section>
    <footer class="quote-document-footer"><strong>Highway 38 Solutions</strong><span>${H38_PUBLIC_EMAIL}</span></footer>
  </article>`;
  $('backToQuoteFromPreview').onclick=renderQuotes;
  $('printQuoteButton').onclick=()=>window.print();
}

async function h38BuildAiQuoteDraft(){
  const customer=$('quoteCustomer');
  const projectTitle=$('quoteTitle');
  const scope=$('quoteScope');
  const measurements=$('quoteMeasurements');
  if(!navigator.onLine||!state.bridgeReady){toast('AI quote drafting needs an online secure Office connection.',true);return;}
  if(!customer||!customer.value){toast('Select a customer first.',true);return;}
  if(!String(scope?.value||'').trim()&&!String(measurements?.value||'').trim()){toast('Add scope, site notes, measurements or a saved quote photo first.',true);return;}
  const button=$('h38AiQuoteDraftButton');if(button){button.disabled=true;button.textContent='Working…';}
  try{
    const result=await state.bridge.request('aiBuildQuoteDraft',{businessId:state.businessId,customerId:customer.value,quoteId:state.quote?.quoteId||'',projectTitle:projectTitle?.value||'',scope:scope?.value||'',measurementNotes:measurements?.value||'',notes:'Use linked quote photos and CAD documents when available. Price Catalog must be searched first.'},180000);
    if(result.status!=='PASS')throw new Error(result.message||'AI quote draft did not complete.');
    const draft=result.draft||{},suggested=Array.isArray(draft.suggestedLines)?draft.suggestedLines:[];
    state.quote.projectTitle=draft.projectTitle||projectTitle?.value||state.quote.projectTitle||'';
    state.quote.scope=draft.scope||scope?.value||state.quote.scope||'';
    state.quote.customerId=customer.value;
    state.quote.lines=suggested.map(line=>({quoteLineId:newId('QUOTE-LINE'),description:String(line.description||'Suggested work item'),quantity:Math.max(0.01,num(line.quantity||1)),unit:String(line.unit||'each'),unitPrice:num(line.rate||line.unitPrice||0),priceSource:h38AiPriceSourceLabel(line),priceStatus:'Owner review required'}));
    state.quote.possibleMissingCosts=Array.isArray(draft.possibleMissingCosts)?draft.possibleMissingCosts:[];
    state.quote.measurementNotes=[measurements?.value||'',...(draft.photoObservations||[]).map(item=>`AI photo observation: ${item}`),...(draft.missingInformation||[]).map(item=>`Needs confirmation: ${item}`)].filter(Boolean).join('\n');
    const costCount=state.quote.possibleMissingCosts.filter(item=>!item?.decision||item.decision==='PENDING').length;
    toast(`${result.provider||'AI'} draft loaded with current pricing.${costCount?` ${costCount} possible missing cost${costCount===1?'':'s'} flagged for owner review.`:''} Nothing approved or sent.`);
    renderQuotes();
  }catch(error){toast(error.message||String(error),true);if(button){button.disabled=false;button.textContent='✨ Build with H38 AI';}}
}
function h38CadUpload(){
  const quoteId=state.quote?.quoteId||'';
  if(!quoteId){toast('Save the quote before linking a CAD file.',true);return;}
  $('h38CadInput')?.click();
}
async function h38RunAiMeasurement(){
  const quoteId=state.quote?.quoteId||'';
  if(!quoteId){toast('Save or open a quote before AI-assisted measuring.',true);return;}
  if(!navigator.onLine||!state.bridgeReady){toast('AI-assisted measuring needs an online secure Office connection.',true);return;}
  const name=String($('h38AiMeasurementName')?.value||'').trim(),referenceSize=num($('h38AiReferenceSize')?.value),referenceUnit=String($('h38AiReferenceUnit')?.value||'').trim(),notes=String($('h38AiMeasurementNotes')?.value||'').trim();
  if(!name||referenceSize<=0||!referenceUnit){toast('Enter the requested measurement and a known reference size and unit.',true);return;}
  const button=$('h38AiMeasureButton');if(button){button.disabled=true;button.textContent='Estimating…';}
  try{
    const result=await state.bridge.request('aiMeasurePhoto',{businessId:state.businessId,quoteId,measurementName:name,measurementType:'Length',referenceSize,referenceUnit,notes},180000);
    if(result.status==='HOLD'){toast(result.message||'AI measurement is on hold.',true);return;}
    if(result.status!=='PASS')throw new Error(result.message||'AI measurement failed.');
    toast(`AI estimate: ${result.value} ${result.unit}. Field verification required.`);
    await loadBusiness(state.businessId,true);renderMeasure();
  }catch(error){toast(error.message||String(error),true);}
  finally{if(button){button.disabled=false;button.textContent='✨ Estimate from quote photo';}}
}
function h38AddQuoteAiTools(){
  const tools=document.querySelector('.page-tools');if(!tools)return;
  if(!$('h38AiQuoteDraftButton')){const ai=document.createElement('button');ai.id='h38AiQuoteDraftButton';ai.type='button';ai.textContent='✨ Build with H38 AI';ai.onclick=h38BuildAiQuoteDraft;tools.prepend(ai);}
  if(!$('h38CadButton')){const cad=document.createElement('button');cad.id='h38CadButton';cad.type='button';cad.className='secondary';cad.textContent='📐 Add CAD';cad.onclick=h38CadUpload;tools.appendChild(cad);const input=document.createElement('input');input.id='h38CadInput';input.type='file';input.className='hidden';input.accept='.dxf,.dwg,.dwt,.dws,application/dxf,application/acad,image/vnd.dxf';input.onchange=event=>handleAttachmentFiles(event.target.files,'Quote',state.quote?.quoteId||'LOCAL-QUOTE','Internal');tools.appendChild(input);}
}
function h38AddMeasureAiPanel(){
  const main=$('mainContent');if(!main||$('h38AiMeasurePanel'))return;
  const panel=document.createElement('section');panel.id='h38AiMeasurePanel';panel.className='card';panel.innerHTML=`<h2>✨ AI-assisted photo measuring</h2><p class="muted">Uses the latest image linked to this saved quote and a known-size reference. Every result is an estimate marked <strong>Needs verification</strong>. CAD dimensions remain separate source data.</p><div class="three"><div><label>Measurement needed</label><input id="h38AiMeasurementName" placeholder="Driveway width"></div><div><label>Known reference size</label><input id="h38AiReferenceSize" type="number" min="0.01" step="0.01" placeholder="12"></div><div><label>Reference unit</label><input id="h38AiReferenceUnit" placeholder="in"></div></div><label>Photo context</label><textarea id="h38AiMeasurementNotes" placeholder="Reference object, camera angle, points to estimate, and assumptions"></textarea><div class="actions"><button id="h38AiMeasureButton" type="button">✨ Estimate from quote photo</button><button id="h38MeasureCadButton" type="button" class="secondary">📐 Add CAD file</button><input id="h38MeasureCadInput" type="file" class="hidden" accept=".dxf,.dwg,.dwt,.dws,application/dxf,application/acad,image/vnd.dxf"></div><div class="notice warn">AI photo estimates cannot replace direct, device, CAD-source, engineering or field-verified dimensions for ordering, permits or critical construction.</div>`;
  main.prepend(panel);
  $('h38AiMeasureButton').onclick=h38RunAiMeasurement;
  $('h38MeasureCadButton').onclick=()=>{if(!state.quote?.quoteId){toast('Save the quote before linking CAD.',true);return;}$('h38MeasureCadInput').click();};
  $('h38MeasureCadInput').onchange=event=>handleAttachmentFiles(event.target.files,'Quote',state.quote?.quoteId||'LOCAL-QUOTE','Internal');
}

const h38DeliveryBaseRenderQuotes=renderQuotes;
renderQuotes=function(){
  h38DeliveryBaseRenderQuotes();
  const customer=$('quoteCustomer');
  if(customer&&!customer.value){
    const generic=Array.from(customer.options).find(option=>option.textContent.trim()==='Generic Quote Customer');
    if(generic){customer.value=generic.value;state.quote.customerId=generic.value;}
  }
  h38NormalizeResearchedPriceSources();
  h38AddQuoteAiTools();
  h38AddMissingCostReviewPanel();
  const tools=document.querySelector('.page-tools');
  if(tools&&state.quote&&state.quote.quoteId&&Array.isArray(state.quote.lines)&&state.quote.lines.length){
    const button=document.createElement('button');
    button.id='previewQuoteButton';button.type='button';button.className='secondary';button.textContent='Preview / Print PDF';button.onclick=renderQuotePreview;tools.appendChild(button);
  }
};
const h38DeliveryBaseRenderMeasure=renderMeasure;
renderMeasure=function(){h38DeliveryBaseRenderMeasure();h38AddMeasureAiPanel();};

if(!document.getElementById('h38MissingCostReviewStyle')){const style=document.createElement('style');style.id='h38MissingCostReviewStyle';style.textContent='.h38-missing-cost-review{display:grid;gap:.75rem;border:2px solid #b56a00;background:#fffaf2;margin-bottom:.85rem}.h38-missing-cost-kicker{font-size:.7rem;font-weight:950;letter-spacing:.08em;color:#8a4f00}.h38-missing-cost-row{background:#fff;border:1px solid #ead7bb;border-radius:12px;padding:.7rem}.h38-missing-cost-row p{margin:.4rem 0;line-height:1.4}.h38-missing-cost-row .actions{margin-top:.45rem}';document.head.appendChild(style);}
window.H38_QUOTE_OWNER_COST_REVIEW={enabled:true,suggestions:h38MissingCostSuggestions,add:h38AddMissingCostToQuote,priceSourceLabel:h38AiPriceSourceLabel,ownerOnly:true,automaticAdd:false,automaticSave:false,automaticApproval:false,customerVisible:false};
document.body.dataset.approvedLogo='assets/highway38-logo.png?v=20260720-exact-0cbc4514';
