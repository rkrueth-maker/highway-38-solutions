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

const h38DeliveryBaseRenderQuotes=renderQuotes;
renderQuotes=function(){
  h38DeliveryBaseRenderQuotes();
  const customer=$('quoteCustomer');
  if(customer&&!customer.value){
    const generic=Array.from(customer.options).find(option=>option.textContent.trim()==='Generic Quote Customer');
    if(generic){customer.value=generic.value;state.quote.customerId=generic.value;}
  }
  const tools=document.querySelector('.page-tools');
  if(tools&&state.quote&&state.quote.quoteId&&Array.isArray(state.quote.lines)&&state.quote.lines.length){
    const button=document.createElement('button');
    button.id='previewQuoteButton';button.type='button';button.className='secondary';button.textContent='Preview / Print PDF';button.onclick=renderQuotePreview;tools.appendChild(button);
  }
};

document.body.dataset.approvedLogo='assets/highway38-logo.png?v=20260720-exact-0cbc4514';
