'use strict';
const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const exporter=read('commercial-app/office-document-export.js');
const css=read('commercial-app/office-document-export.css');
const loader=read('commercial-app/live-customer-navigation-guard-20260910.js');
const quotePrint=read('commercial-app/quote-print-safe.js');
const nlPack=JSON.parse(read('business-packs/northern-lakes/supabase-business-pack.json'));
function has(text,needle,message){assert(text.includes(needle),message||`Missing: ${needle}`);}
const pages=['customers','work','meetings','schedule','messages','field','money','accounting','payroll','tax','reports','people','inventory','fleet','documents'];
for(const page of pages)has(exporter,`'${page}'`,`Office PDF export must cover ${page}`);
for(const [kind,label] of [['invoice','Invoice PDF'],['purchase','PO PDF'],['accounting','Review PDF'],['payroll','Payroll PDF'],['tax','Tax PDF']]){
  has(exporter,`kind==='${kind}'`,`Missing ${kind} record document builder`);
  has(exporter,label,`Missing ${label} control`);
}
has(exporter,'Print / Save PDF','Missing page Print / Save PDF control');
has(exporter,"approvedLogoOnly:true",'Office document export must be approved-logo only');
has(exporter,"highway38:'assets/highway38-logo.png'",'H38 approved stationery logo path is not pinned');
has(exporter,"'northern-lakes':'businesses/northern-lakes/assets/diamond-logo.svg'",'Northern Lakes approved stationery logo path is not pinned');
has(exporter,'The approved business logo is not loaded. Reopen the business before printing.','Logo mismatch must fail closed');
assert.equal(nlPack.branding.canonicalLogoPath,'businesses/northern-lakes/assets/diamond-logo.svg','Northern Lakes canonical logo drifted');
assert.equal(nlPack.branding.singleApprovedLogo,true,'Northern Lakes must remain single-approved-logo');
has(css,'@page{size:letter portrait;margin:.5in}','Stationery must have a deterministic letter print contract');
has(css,'.h38-office-stationery-head img','Stationery logo styling missing');
has(loader,'office-document-export.css?build=20260911-office-document-export-1','Office export stylesheet is not loaded');
has(loader,'office-document-export.js?build=20260911-office-document-export-1','Office export runtime is not loaded');
has(quotePrint,'H38_SAFE_QUOTE_PRINT','Specialized quote PDF path must remain intact');
has(quotePrint,'Print dialog opened. Choose Save as PDF or your printer.','Quote Save-as-PDF behavior missing');
for(const forbidden of ['queueOperation(','SAVE_INVOICE','RECORD_PAYMENT','SAVE_PURCHASE','fileTax','submitTax','approvePayment','sendCustomer']){
  assert(!exporter.includes(forbidden),`Document exporter must not perform external/business mutation: ${forbidden}`);
}
has(exporter,'automaticSending:false','Exporter must not send automatically');
has(exporter,'automaticApproval:false','Exporter must not approve automatically');
console.log(JSON.stringify({status:'PASS',acceptance:'OFFICE_DOCUMENT_EXPORT_AND_STATIONERY',pageExports:pages.length,recordExports:['invoice','purchase-order','accounting-review','payroll-prep','tax-prep'],approvedLogos:{highway38:'assets/highway38-logo.png',northernLakes:nlPack.branding.canonicalLogoPath},quoteSpecialized:true,externalActionsOccurred:false},null,2));
