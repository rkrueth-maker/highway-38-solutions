#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
function read(file){return fs.readFileSync(path.join(root,file),'utf8');}
function write(file,text){fs.writeFileSync(path.join(root,file),text);console.log('updated '+file);}
function replaceOnce(text,needle,replacement,label){
  if(text.includes(replacement))return text;
  if(!text.includes(needle))throw new Error('Missing patch marker for '+label);
  return text.replace(needle,replacement);
}

let universal=read('universal-quote-builder.html');
if(!universal.includes('.uq-result-board{')){
  const css='.uq-result-board{display:grid;grid-template-columns:.9fr 1.1fr;gap:22px;align-items:stretch}.uq-result-list{display:grid;grid-template-columns:1fr 1fr;gap:12px}.uq-result-card{background:#fff;border:1px solid var(--uq-line);border-radius:15px;padding:17px}.uq-result-card strong{display:block;font-size:1.75rem;color:var(--uq-green);margin-bottom:3px}.uq-result-card span{display:block;font-weight:900;color:var(--uq-navy)}.uq-result-card p{margin:6px 0 0;color:#52636c;line-height:1.45}.uq-result-preview{background:linear-gradient(145deg,#0b1f34,#173a5e);color:#fff;border-radius:20px;padding:26px;display:grid;align-content:space-between;box-shadow:0 18px 40px rgba(11,31,52,.16)}.uq-result-preview .doc-label{font-size:.75rem;text-transform:uppercase;letter-spacing:.1em;color:#cddde8;font-weight:900}.uq-result-preview h3{font-size:2rem;margin:8px 0}.uq-result-preview p{color:#dce8f1;line-height:1.55}.uq-result-preview .doc-total{font-size:2.65rem;color:#ff9b52;font-weight:950}.uq-result-preview .doc-lines{display:grid;gap:7px;margin:17px 0}.uq-result-preview .doc-lines div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.15);padding-bottom:6px}.uq-safety-note{margin-top:18px;padding:14px 16px;border:1px solid #e2c879;background:#fff3d8;border-radius:12px;line-height:1.5}@media(max-width:850px){.uq-result-board{grid-template-columns:1fr}}@media(max-width:620px){.uq-result-list{grid-template-columns:1fr}}';
  universal=universal.replace('</style>',css+'</style>');
}
const heroOld='<div class="pi-actions"><a class="pi-btn primary" href="#house">Open the House Demonstration</a><a class="pi-btn secondary" href="quote-builder.html">See Quote Builder Pricing</a></div>';
const heroNew='<div class="pi-actions"><a class="pi-btn primary" href="#result">See What It Produced</a><a class="pi-btn secondary" href="quote-builder-sample-proposal.html">Open Printable Sample</a><a class="pi-btn secondary" href="quote-builder.html">See Quote Builder Pricing</a></div>';
universal=replaceOnce(universal,heroOld,heroNew,'Universal hero actions');
const disclaimer='<div class="uq-disclaimer"><strong>Representative demonstrations.</strong> Values, customers, addresses, drawings, and technical assumptions shown here are hypothetical planning examples. They are not accepted contracts, official prices, permit documents, stamped engineering, or guaranteed estimates.</div>';
const resultSection=disclaimer+'<section class="uq-section alt" id="result"><div class="uq-inner"><div class="uq-head"><span class="uq-kicker">Completed demonstration result</span><h2>This is what Quote Builder produced—not just what it can store.</h2><p>The completed representative run turned one coordinated property project into customer, estimating, technical, purchasing, execution, and approval-ready outputs while keeping every external action locked.</p></div><div class="uq-result-board"><div class="uq-result-list"><article class="uq-result-card"><strong>1</strong><span>Master customer proposal</span><p>Readable scope, total, allowances, assumptions, exclusions, terms, and revision identity.</p></article><article class="uq-result-card"><strong>14</strong><span>Trade sub-quotes</span><p>Independently manageable packages linked to the same customer, property, project, and revision.</p></article><article class="uq-result-card"><strong>10</strong><span>Drawing records</span><p>Sheet numbers, classifications, revisions, review status, and professional-review requirements.</p></article><article class="uq-result-card"><strong>6</strong><span>Bid packages</span><p>Comparison-ready scope for cabinets, plumbing, electrical, HVAC, concrete, and landscaping.</p></article><article class="uq-result-card"><strong>18</strong><span>Cross-industry scenarios</span><p>Services, construction, repair, manufacturing, fabrication, automation, and coordinated projects.</p></article><article class="uq-result-card"><strong>0</strong><span>Automatic external actions</span><p>No sending, purchasing, payment, scheduling, approval, or work start occurred automatically.</p></article></div><article class="uq-result-preview"><div><span class="doc-label">Customer-facing sample output</span><h3>Whole-House Renovation and Property Improvement</h3><p>A sanitized proposal generated from the same completed demonstration structure. Protected internal costs, margins, vendors, users, and approval records are excluded.</p><div class="doc-lines"><div><span>Direct trade planning</span><strong>$287,150</strong></div><div><span>Allowances</span><strong>$24,500</strong></div><div><span>Contingency</span><strong>$31,165</strong></div></div><div class="doc-total">$342,815</div></div><div class="pi-actions"><a class="pi-btn primary" href="quote-builder-sample-proposal.html">View Printable Customer Copy</a><a class="pi-btn secondary" href="#house">Explore the Working Package</a></div></article></div><div class="uq-safety-note"><strong>Printing is useful when it is controlled.</strong> Customers should be able to print or save the exact approved customer-facing revision. Drafts and demonstrations must remain clearly marked, and internal cost, margin, vendor pricing, approval history, and private records must never appear in the customer copy.</div></div></section>';
universal=replaceOnce(universal,disclaimer,resultSection,'completed result section');
write('universal-quote-builder.html',universal);

let library=read('sample-library-now.html');
const libraryOld='<div class="pi-actions"><a class="pi-btn primary" href="universal-quote-builder.html">Open Universal Demonstration</a><a class="pi-btn secondary" href="quote-builder.html">See the Product</a></div>';
const libraryNew='<div class="pi-actions"><a class="pi-btn primary" href="universal-quote-builder.html#result">See What It Produced</a><a class="pi-btn secondary" href="quote-builder-sample-proposal.html">Print Sample Quote</a><a class="pi-btn secondary" href="quote-builder.html">See the Product</a></div>';
library=replaceOnce(library,libraryOld,libraryNew,'sample library actions');
write('sample-library-now.html',library);

let product=read('quote-builder.html');
const productOld='<div class="pi-actions"><a class="pi-btn primary" href="universal-quote-builder.html">Open the Whole-House Demonstration</a></div>';
const productNew='<div class="pi-actions"><a class="pi-btn primary" href="universal-quote-builder.html#result">See the Completed Result</a><a class="pi-btn secondary" href="quote-builder-sample-proposal.html">View Printable Sample Quote</a></div>';
product=replaceOnce(product,productOld,productNew,'Quote Builder product actions');
write('quote-builder.html',product);

const routeFile='scripts/config/public-website-routes.json';
const routes=JSON.parse(read(routeFile));
routes.version='2026-07-25-public-quote-result-v2';
if(!routes.demonstrations.some(item=>item.path==='quote-builder-sample-proposal.html')){
  routes.demonstrations.splice(1,0,{path:'quote-builder-sample-proposal.html',label:'Printable Quote Builder Sample Proposal',canonical:'https://rkrueth-maker.github.io/highway-38-solutions/quote-builder-sample-proposal.html',shell:'document',visibility:'public'});
}
write(routeFile,JSON.stringify(routes,null,2)+'\n');
