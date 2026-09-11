(function(){
'use strict';
const BUILD='20260911-office-document-export-1';
const EXPORT_PAGES=new Set(['customers','work','meetings','schedule','messages','field','money','accounting','payroll','tax','reports','people','inventory','fleet','documents']);
const APPROVED_LOGOS={
  highway38:/\/assets\/highway38-logo\.png(?:\?|$)/i,
  'northern-lakes':/\/businesses\/northern-lakes\/assets\/diamond-logo\.svg(?:\?|$)/i
};
let scheduled=false,printing=false;
const text=value=>String(value==null?'':value).trim();
const esc=value=>text(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function officeState(){try{return window.state||null;}catch(_){return null;}}
function snapshot(){return officeState()?.snapshot||null;}
function rows(name){try{return typeof window.records==='function'?window.records(name):Array.isArray(snapshot()?.[name])?snapshot()[name]:[];}catch(_){return Array.isArray(snapshot()?.[name])?snapshot()[name]:[];}}
function value(row,...keys){for(const key of keys){if(row&&row[key]!=null&&text(row[key])!=='')return row[key];}return'';}
function currency(value){const number=Number(value||0);return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number.isFinite(number)?number:0);}
function date(value){if(!value)return'';const parsed=new Date(value);return Number.isNaN(parsed.getTime())?text(value).slice(0,10):parsed.toLocaleDateString();}
function businessKey(){return text(snapshot()?.business?.businessKey||snapshot()?.businessKey).toLowerCase();}
function approvedBrand(){
  const business=snapshot()?.business||{},key=businessKey(),logo=document.getElementById('approvedOfficeLogo'),src=text(logo?.getAttribute('src'));
  const pattern=APPROVED_LOGOS[key];
  if(!pattern||!pattern.test(src))throw new Error('The approved business logo is not loaded. Reopen the business before printing.');
  return{key,name:text(business.businessName||business.displayName)|| (key==='northern-lakes'?'Northern Lakes Property Maintenance LLC':'Highway 38 Solutions'),logo:src};
}
function findSection(title){const wanted=text(title).toLowerCase();return Array.from(document.querySelectorAll('#mainContent section.card')).find(card=>text(card.querySelector('h2')?.textContent).toLowerCase()===wanted)||null;}
function status(message,error=false){if(typeof window.toast==='function')window.toast(message,error);}
function cleanVisiblePage(){
  const source=document.getElementById('mainContent');if(!source)return'';
  const clone=source.cloneNode(true);
  clone.querySelectorAll('form,.actions,button,input,select,textarea,dialog,iframe,[hidden],.h38-access-strip,.h38-access-context,.page-tools,.quick-grid,.notice.warn').forEach(node=>node.remove());
  clone.querySelectorAll('[contenteditable="true"]').forEach(node=>node.removeAttribute('contenteditable'));
  clone.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
  return clone.innerHTML;
}
function line(label,val){const content=text(val);if(!content)return'';return`<div class="h38-doc-field"><span>${esc(label)}</span><strong>${esc(content)}</strong></div>`;}
function table(title,pairs){return`<section class="h38-doc-block"><h2>${esc(title)}</h2><div class="h38-doc-fields">${pairs.map(([label,val])=>line(label,val)).join('')}</div></section>`;}
function customerName(id){const row=rows('customers').find(item=>text(value(item,'Customer ID','customerId'))===text(id));return value(row,'Customer Name','name')||id;}
function vendorName(id){const row=rows('vendors').find(item=>text(value(item,'Vendor ID','vendorId'))===text(id));return value(row,'Vendor Name','name')||id;}
function jobName(id){const row=rows('jobs').find(item=>text(value(item,'Job ID','jobId'))===text(id));return value(row,'Project Title','Job Name','title')||id;}
function recordDocument(kind,row){
  if(kind==='invoice')return{
    title:`Invoice ${text(value(row,'Invoice Number'))||''}`.trim(),
    subtitle:'Customer invoice draft / record',
    body:table('Invoice details',[
      ['Invoice number',value(row,'Invoice Number')],['Customer',customerName(value(row,'Customer ID'))],['Job',jobName(value(row,'Job ID'))],['Invoice date',date(value(row,'Invoice Date','Created Time'))],['Due date',date(value(row,'Due Date'))],['Status',value(row,'Status')],['Subtotal',currency(value(row,'Subtotal'))],['Tax',currency(value(row,'Tax','Tax Amount'))],['Total',currency(value(row,'Total'))],['Amount paid',currency(value(row,'Amount Paid'))],['Balance due',currency(value(row,'Balance','Balance Due'))]
    ])
  };
  if(kind==='purchase')return{
    title:`Purchase Order ${text(value(row,'Order Number'))||''}`.trim(),
    subtitle:'Purchase order draft / internal approval record',
    body:table('Purchase order details',[
      ['Order number',value(row,'Order Number')],['Vendor',vendorName(value(row,'Vendor ID'))],['Job',jobName(value(row,'Job ID'))],['Order date',date(value(row,'Order Date','Created Time'))],['Expected date',date(value(row,'Expected Date'))],['Description',value(row,'Description')],['Status',value(row,'Approval Status','Status')],['Subtotal',currency(value(row,'Subtotal'))],['Tax',currency(value(row,'Tax'))],['Total',currency(value(row,'Total'))]
    ])
  };
  if(kind==='accounting')return{
    title:`Accounting Review ${text(value(row,'Period Name'))||''}`.trim(),
    subtitle:'Accounting-preparation record',
    body:table('Review period',[
      ['Period',value(row,'Period Name')],['Start',date(value(row,'Period Start'))],['End',date(value(row,'Period End'))],['Status',value(row,'Review Status','Status')],['Missing documents',value(row,'Missing Documents')]
    ])
  };
  if(kind==='payroll')return{
    title:'Payroll Preparation',subtitle:'Preparation record — not payment authorization',
    body:table('Payroll period',[
      ['Period start',date(value(row,'Period Start'))],['Period end',date(value(row,'Period End'))],['Pay date',date(value(row,'Pay Date'))],['Provider',value(row,'Provider')],['Status',value(row,'Approval Status','Status')],['Gross pay',currency(value(row,'Gross Pay'))],['Deductions',currency(value(row,'Deductions'))],['Prepared net',currency(value(row,'Prepared Net Amount'))],['Employer tax estimate',currency(value(row,'Employer Tax Estimate'))],['Employer cost estimate',currency(value(row,'Employer Cost Estimate'))]
    ])
  };
  if(kind==='tax')return{
    title:'Tax Preparation',subtitle:'Preparation record — no filing or payment authorization',
    body:table('Tax period',[
      ['Tax type',value(row,'Tax Type')],['Jurisdiction',value(row,'Jurisdiction')],['Period start',date(value(row,'Period Start'))],['Period end',date(value(row,'Period End'))],['Due date',date(value(row,'Due Date'))],['Status',value(row,'Approval Status','Status')],['Taxable amount',currency(value(row,'Taxable Amount'))],['Tax collected',currency(value(row,'Tax Collected'))],['Adjustments',currency(value(row,'Adjustments'))],['Estimated liability',currency(value(row,'Estimated Liability'))]
    ])
  };
  return null;
}
function cleanup(){document.getElementById('h38SafePrintRoot')?.remove();document.body.classList.remove('h38-printing');document.body.removeAttribute('aria-busy');printing=false;}
function printDocument(documentSpec){
  if(printing)return;
  let brand;try{brand=approvedBrand();}catch(error){status(error.message||String(error),true);return;}
  printing=true;cleanup();printing=true;
  const root=document.createElement('main');root.id='h38SafePrintRoot';root.className='h38-office-document-root';root.setAttribute('aria-label','Print-ready business document');
  const title=documentSpec?.title||text(document.querySelector('#mainContent h1')?.textContent)||'Business Office Record';
  const subtitle=documentSpec?.subtitle||'Business Office record';
  const body=documentSpec?.body||cleanVisiblePage();
  root.innerHTML=`<article class="h38-office-stationery" data-business-key="${esc(brand.key)}"><header class="h38-office-stationery-head"><img src="${esc(brand.logo)}" alt="${esc(brand.name)} approved logo"><div><strong>${esc(brand.name)}</strong><span>Business Office</span></div></header><section class="h38-office-document-title"><p>${esc(subtitle)}</p><h1>${esc(title)}</h1><small>Generated ${esc(new Date().toLocaleString())}</small></section><div class="h38-office-document-body">${body}</div><footer><span>${esc(brand.name)}</span><span>Business Office record</span></footer></article>`;
  document.body.appendChild(root);document.body.classList.add('h38-printing');document.body.setAttribute('aria-busy','true');
  const done=()=>setTimeout(cleanup,250);window.addEventListener('afterprint',done,{once:true});
  setTimeout(()=>{try{window.focus();if(window.AndroidH38Native&&typeof window.AndroidH38Native.printCurrentPage==='function'){window.AndroidH38Native.printCurrentPage();status('Print dialog opened. Choose Save as PDF or your printer.');setTimeout(()=>{if(printing)cleanup();},8000);}else{window.print();status('Print dialog opened. Choose Save as PDF or your printer.');}}catch(error){cleanup();status(`Print could not open: ${error.message||error}`,true);}},100);
  setTimeout(()=>{if(printing)cleanup();},45000);
}
function pageButton(){
  const state=officeState(),page=text(state?.page);if(!EXPORT_PAGES.has(page))return;
  const head=document.querySelector('#mainContent .page-head');if(!head||head.querySelector('[data-h38-page-pdf]'))return;
  let tools=head.querySelector('.page-tools,.actions');if(!tools){tools=document.createElement('div');tools.className='page-tools';head.appendChild(tools);}
  const button=document.createElement('button');button.type='button';button.className='secondary';button.dataset.h38PagePdf=page;button.textContent='Print / Save PDF';button.addEventListener('click',()=>printDocument({title:text(document.querySelector('#mainContent h1')?.textContent)||'Business Office Record',subtitle:'Business Office page snapshot'}));tools.appendChild(button);
}
function decorateRows(sectionTitle,collection,kind,label){
  const section=findSection(sectionTitle),data=rows(collection);if(!section||!data.length)return;
  const rendered=Array.from(section.querySelectorAll('.list > .row,.list > button.row'));rendered.forEach((node,index)=>{if(index>=data.length||node.querySelector(`[data-h38-record-pdf="${kind}"]`))return;const button=document.createElement('button');button.type='button';button.className='secondary h38-record-pdf';button.dataset.h38RecordPdf=kind;button.textContent=label;button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const spec=recordDocument(kind,data[index]);if(spec)printDocument(spec);});node.appendChild(button);});
}
function enhance(){
  pageButton();const page=text(officeState()?.page);
  if(page==='money')decorateRows('Invoices','invoices','invoice','Invoice PDF');
  if(page==='accounting'){decorateRows('Purchase orders','purchaseOrders','purchase','PO PDF');decorateRows('Review periods','accountingPeriods','accounting','Review PDF');}
  if(page==='payroll')decorateRows('Payroll periods','payrollPeriods','payroll','Payroll PDF');
  if(page==='tax')decorateRows('Tax periods','taxPeriods','tax','Tax PDF');
}
function schedule(){if(scheduled)return;scheduled=true;const run=()=>{scheduled=false;enhance();};if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);}
window.addEventListener('h38:office-page-rendered',schedule);
window.addEventListener('h38:business-snapshot-updated',schedule);
window.addEventListener('pageshow',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
setTimeout(schedule,500);setTimeout(schedule,1400);
window.H38_OFFICE_DOCUMENT_EXPORT=Object.freeze({build:BUILD,enabled:true,pages:Array.from(EXPORT_PAGES),approvedLogoOnly:true,approvedLogos:Object.freeze({highway38:'assets/highway38-logo.png','northern-lakes':'businesses/northern-lakes/assets/diamond-logo.svg'}),quotePdfRemainsSpecialized:true,automaticSending:false,automaticApproval:false,printPage:()=>printDocument(null),printRecord:(kind,row)=>{const spec=recordDocument(kind,row);if(spec)printDocument(spec);return Boolean(spec);},enhance});
})();
