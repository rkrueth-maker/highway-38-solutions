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
    state.quote.lines=suggested.map(line=>({quoteLineId:newId('QUOTE-LINE'),description:String(line.description||'Suggested work item'),quantity:Math.max(0.01,num(line.quantity||1)),unit:String(line.unit||'each'),unitPrice:num(line.rate||line.unitPrice||0),priceSource:line.catalogId?'Price Catalog + AI assistance':'AI suggestion — manual price required',priceStatus:'Owner review required'}));
    state.quote.measurementNotes=[measurements?.value||'',...(draft.photoObservations||[]).map(item=>`AI photo observation: ${item}`),...(draft.missingInformation||[]).map(item=>`Needs confirmation: ${item}`)].filter(Boolean).join('\n');
    toast(`${result.provider||'AI'} draft loaded. Price Catalog searched first; nothing approved or sent.`);
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
  h38AddQuoteAiTools();
  const tools=document.querySelector('.page-tools');
  if(tools&&state.quote&&state.quote.quoteId&&Array.isArray(state.quote.lines)&&state.quote.lines.length){
    const button=document.createElement('button');
    button.id='previewQuoteButton';button.type='button';button.className='secondary';button.textContent='Preview / Print PDF';button.onclick=renderQuotePreview;tools.appendChild(button);
  }
};
const h38DeliveryBaseRenderMeasure=renderMeasure;
renderMeasure=function(){h38DeliveryBaseRenderMeasure();h38AddMeasureAiPanel();};

document.body.dataset.approvedLogo='assets/highway38-logo.png?v=20260720-exact-0cbc4514';
