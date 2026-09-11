(function(){
'use strict';
const BUILD='20260911-office-reference-samples-1';
let scheduled=false;
const text=value=>String(value==null?'':value).trim();
const esc=value=>typeof window.esc==='function'?window.esc(value):text(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function stateNow(){try{return window.state||null;}catch(_){return null;}}
function businessKey(){
  try{const urlKey=new URLSearchParams(location.search).get('businessKey');if(urlKey)return text(urlKey).toLowerCase();}catch(_){}
  const state=stateNow(),direct=text(state?.businessKey||state?.business?.businessKey||state?.business?.key).toLowerCase();
  if(direct)return direct;
  const row=state?.snapshot?.business||state?.snapshot?.businesses?.[0]||{};
  return text(row['Business Key']||row.businessKey||row.key).toLowerCase();
}
const PROFILES={
  highway38:{
    company:'Highway 38 Solutions',customer:'Jordan Mercer',email:'jordan.mercer@example.com',phone:'(555) 010-1038',property:'Cedar Ridge Workshop',address:'101 Example Lane, Sampletown, MN 00000',project:'Detached Garage Workflow Upgrade',quote:'H38-SAMPLE-Q-1042',job:'H38-SAMPLE-J-1042',invoice:'H38-SAMPLE-I-1042',po:'H38-SAMPLE-PO-1042',staff:'Alex Turner',role:'Field Technician',vendor:'Northline Sample Supply',asset:'Sample Service Truck 01',meeting:'Garage workflow review',schedule:'Site measurement visit',request:'Improve storage, lighting and equipment flow',task:'Confirm wall dimensions and outlet locations',expense:'Sample fasteners and layout materials',inventory:'3/4 in. plywood — SAMPLE-SKU-38',report:'Job margin preview: 34%',accounting:'September sample reconciliation',payroll:'Sample pay period — Sep 1–7',tax:'Q3 sample sales-tax preparation',message:'Customer asked for updated layout notes before the next visit.',field:'North wall measured; photo set attached for reference.',social:'Draft before/after workflow post — sample only',control:'Quote review awaiting Owner approval — sample only',ai:'Drafted a work summary from the sample visit notes.',assistant:'Suggested next step: review dimensions before preparing the quote.',settings:'Reference tenant settings: approved H38 logo, notifications off for sample data.',documents:['Jordan-Mercer-Estimate-SAMPLE.pdf','Cedar-Ridge-Layout-SAMPLE.pdf','Site-Photos-SAMPLE.zip']
  },
  'northern-lakes':{
    company:'Northern Lakes Property Maintenance',customer:'Casey Bennett',email:'casey.bennett@example.com',phone:'(555) 010-2207',property:'Pine Shore Cabin',address:'202 Example Shore Road, Sampletown, MN 00000',project:'Seasonal Property Maintenance',quote:'NL-SAMPLE-Q-2207',job:'NL-SAMPLE-J-2207',invoice:'NL-SAMPLE-I-2207',po:'NL-SAMPLE-PO-2207',staff:'Morgan Reed',role:'Property Technician',vendor:'Lakeside Sample Supply',asset:'Sample Property Service Truck 01',meeting:'Seasonal service review',schedule:'Cabin inspection visit',request:'Spring opening, dock check and exterior inspection',task:'Inspect water system, dock hardware and exterior condition',expense:'Sample service materials',inventory:'Exterior screws — SAMPLE-SKU-NL',report:'Property service completion preview: 82%',accounting:'September sample reconciliation',payroll:'Sample pay period — Sep 1–7',tax:'Q3 sample sales-tax preparation',message:'Customer asked for inspection photos after the seasonal opening.',field:'Dock hardware checked; sample inspection photos attached.',social:'Draft seasonal-maintenance reminder — sample only',control:'Service plan review awaiting Owner approval — sample only',ai:'Drafted a property-condition summary from the sample inspection notes.',assistant:'Suggested next step: review inspection notes before customer delivery.',settings:'Reference tenant settings: approved Northern diamond logo, notifications off for sample data.',documents:['Casey-Bennett-Service-Plan-SAMPLE.pdf','Pine-Shore-Inspection-SAMPLE.pdf','Before-Photos-SAMPLE.zip']
  }
};
const PAGE_COLLECTIONS={today:['customers','jobs','tasks'],customers:['customers','properties','requests'],work:['requests','jobs','tasks'],jobs:['jobs','tasks'],meetings:['meetings'],quotes:['quotes'],schedule:['scheduleEvents'],messages:['conversations','emailThreads','smsThreads','portalThreads'],field:['jobNotes','timeEntries','documents'],money:['invoices','expenses','purchaseOrders'],accounting:['accountingReviews'],payroll:['payrollPrep','payrollRuns'],tax:['taxPrep','taxPeriods'],reports:['jobs','invoices'],people:['users','employees'],inventory:['priceBook','materialRequests','inventoryTransactions'],fleet:['assets','maintenance'],documents:['documents'],files:['documents'],social:['socialPosts'],controls:['quotes','invoices'],ai:['jobs','jobNotes'],assistant:['tasks','jobs'],settings:['businesses']};
function profile(){return businessKey()==='northern-lakes'?PROFILES['northern-lakes']:PROFILES.highway38;}
function rows(name){const value=stateNow()?.snapshot?.[name];return Array.isArray(value)?value:[];}
function pageHasRealData(page){const collections=PAGE_COLLECTIONS[page]||[];return collections.some(name=>rows(name).some(row=>!row?.__h38ReferenceSample&&!/SAMPLE/i.test(text(row?.['Record Type']))));}
function itemsFor(page,p){
  const docs=p.documents.join(' · ');
  const common=[['Sample customer',`${p.customer} · ${p.email} · ${p.phone}`],['Sample property',`${p.property} · ${p.address}`]];
  const map={
    today:[['Current job',`${p.job} · ${p.project}`],['Next task',p.task],['Reference documents',docs]],
    customers:common.concat([['Service request',p.request],['Reference documents',docs]]),
    work:[['Request',p.request],['Job',`${p.job} · ${p.project}`],['Task',p.task],['Assigned to',`${p.staff} · ${p.role}`]],
    jobs:[['Job',`${p.job} · ${p.project}`],['Task',p.task],['Assigned to',`${p.staff} · ${p.role}`]],
    meetings:[['Meeting',p.meeting],['Customer',p.customer],['Agenda','Review scope, questions, documents and next steps']],
    quotes:[['Quote',`${p.quote} · Draft reference`],['Customer',p.customer],['Project',p.project],['Reference document',p.documents[0]]],
    schedule:[['Visit',p.schedule],['Customer',p.customer],['Property',p.property],['Assigned to',p.staff]],
    messages:[['Customer conversation',p.message],['Customer',p.customer],['Email',p.email],['Phone',p.phone]],
    field:[['Field note',p.field],['Job',p.job],['Technician',p.staff],['Photo/document set',p.documents[2]]],
    money:[['Invoice',`${p.invoice} · Draft reference`],['Purchase order',`${p.po} · ${p.vendor}`],['Expense',p.expense],['Customer',p.customer]],
    accounting:[['Review period',p.accounting],['Reference invoice',p.invoice],['Reference expense',p.expense],['Status','Preview only — no posting']],
    payroll:[['Pay period',p.payroll],['Employee',`${p.staff} · ${p.role}`],['Status','Preparation preview only — no funding']],
    tax:[['Tax period',p.tax],['Reference invoice',p.invoice],['Status','Preparation preview only — no filing or payment']],
    reports:[['Customer',p.customer],['Project',p.project],['Report example',p.report],['Reference document',p.documents[1]]],
    people:[['Employee',`${p.staff} · ${p.role}`],['Customer',p.customer],['Access example','Staff sees assigned work; Owner controls approvals']],
    inventory:[['Inventory item',p.inventory],['Material request',p.expense],['Job',p.job]],
    fleet:[['Asset',p.asset],['Assigned work',p.project],['Maintenance example','Oil/service inspection — sample only']],
    documents:[['Customer',p.customer],['Estimate / service plan',p.documents[0]],['Layout / inspection',p.documents[1]],['Photo package',p.documents[2]]],
    files:[['Customer',p.customer],['Estimate / service plan',p.documents[0]],['Layout / inspection',p.documents[1]],['Photo package',p.documents[2]]],
    social:[['Draft content',p.social],['Related customer/project',`${p.customer} · ${p.project}`],['Status','Reference only — not scheduled or posted']],
    controls:[['Approval example',p.control],['Quote',p.quote],['Invoice',p.invoice],['Status','Reference only — no action can be taken here']],
    ai:[['AI example',p.ai],['Source job',p.job],['Reference document',p.documents[1]],['Status','Draft reference only']],
    assistant:[['Assistant example',p.assistant],['Customer',p.customer],['Next task',p.task],['Status','Suggestion only — no external action']],
    settings:[['Company',p.company],['Sample customer',p.customer],['Settings example',p.settings],['Safety','Reference data is fictional, read-only and never stored']]
  };
  return map[page]||common.concat([['Sample project',p.project],['Reference documents',docs]]);
}
function cardHtml(page,p){const items=itemsFor(page,p);return`<details class="card h38-reference-sample" data-h38-reference-sample="${esc(page)}" ${pageHasRealData(page)?'':'open'}><summary><span><strong>Fictional reference example</strong><small>${esc(p.company)} · read-only sample</small></span><span class="pill">SAMPLE</span></summary><div class="h38-reference-grid">${items.map(([label,value])=>`<div><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('')}</div><p class="muted small h38-reference-note">Shows how this workspace looks before you have enough real records. Fictional names and files only. Nothing in this card is saved, sent, approved, scheduled, posted, paid, funded or filed.</p></details>`;}
function enhance(){const main=document.getElementById('mainContent'),page=text(stateNow()?.page||'today').toLowerCase();if(!main)return false;const existing=main.querySelector(':scope > [data-h38-reference-sample]');if(existing&&existing.dataset.h38ReferenceSample===page&&existing.dataset.h38ReferenceCompany===profile().company)return true;existing?.remove();const shell=document.createElement('div');shell.innerHTML=cardHtml(page,profile());const card=shell.firstElementChild;if(!card)return false;card.dataset.h38ReferenceCompany=profile().company;main.appendChild(card);return true;}
function schedule(){if(scheduled)return;scheduled=true;const run=()=>{scheduled=false;enhance();};if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);}
window.addEventListener('h38:office-page-rendered',schedule);window.addEventListener('h38:business-snapshot-updated',schedule);window.addEventListener('pageshow',schedule);window.addEventListener('popstate',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
window.H38_OFFICE_REFERENCE_SAMPLES=Object.freeze({enabled:true,build:BUILD,fictional:true,readOnly:true,persisted:false,externalActions:false,automaticSending:false,automaticApproval:false,automaticScheduling:false,automaticPosting:false,automaticPayment:false,automaticPayrollFunding:false,automaticTaxFiling:false,profiles:Object.freeze(PROFILES),profileFor:key=>key==='northern-lakes'?PROFILES['northern-lakes']:PROFILES.highway38,enhance});
})();