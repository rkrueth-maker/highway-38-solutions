(function(){
  'use strict';
  const form=document.getElementById('concept-form'),output=document.getElementById('builder-output');
  if(!form||!output)return;
  const split=value=>String(value||'').split(/\n|,/).map(x=>x.trim()).filter(Boolean);
  const slug=value=>String(value||'business').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const unique=arr=>Array.from(new Set(arr.filter(Boolean)));
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function formData(){const data={};new FormData(form).forEach((v,k)=>data[k]=String(v).trim());return data;}
  function generate(d){
    const skills=split(d.skills),customers=split(d.customers),assets=split(d.assets),restrictions=split(d.restrictions),risks=split(d.risks),expansion=split(d.expansion);
    const model=unique(split(d.model));
    const contact=d.contact||'Owner-reviewed email and scheduled calls';
    const offers=[
      {level:'Free',name:`${d.businessName||'Business'} readiness checklist`,purpose:'Collect qualified interest and identify missing information.'},
      {level:'Starter',name:`${d.primaryProblem||'Problem'} snapshot`,purpose:'Turn one bounded problem into facts, gaps, risks, and next actions.'},
      {level:'Core',name:`${d.primaryOutcome||'Done-for-you result'}`,purpose:'Deliver the primary customer outcome with fixed inputs and boundaries.'},
      {level:'Managed',name:`${d.businessName||'Business'} care plan`,purpose:'Provide bounded recurring updates, reviews, or maintenance.'}
    ];
    const tasks=[
      ['BCB-T001','Confirm business name, legal-use wording, and public divisions','Owner decision'],
      ['BCB-T002','Validate first customer segment with five real conversations','Research'],
      ['BCB-T003','Approve starter offer scope, price logic, boundaries, and revision rule','Owner decision'],
      ['BCB-T004','Build intake fields and privacy notice','Operations'],
      ['BCB-T005','Create one public-safe proof item and one free lead magnet','Marketing'],
      ['BCB-T006','Configure selected-record quote, payment, and delivery approval gates','Business OS'],
      ['BCB-T007','Run launch checklist and rollback-protected release','QA']
    ].map(([id,title,type])=>({id,title,type,status:'Needs owner review'}));
    const packageData={
      metadata:{schema:'H38-BCB-1.0',generatedAt:new Date().toISOString(),status:'OWNER_REVIEW_REQUIRED',automaticExternalActions:false},
      businessSummary:{name:d.businessName||'Unnamed concept',idea:d.idea,serviceArea:d.serviceArea,model,ownerSkills:skills,assets,timeAvailable:d.time,budget:d.budget,revenueGoal:d.revenueGoal,contactPreference:contact},
      customerSegments:customers.map((name,i)=>({id:`SEG-${String(i+1).padStart(2,'0')}`,name,problem:d.primaryProblem,desiredOutcome:d.primaryOutcome,buyingRisk:'Clarify urgency, authority, budget, and proof required.'})),
      offers,
      pricingLogic:{method:'Value and bounded-scope review',rules:['Price one defined outcome, not unlimited time.','Separate required inputs, deliverables, exclusions, turnaround, revisions, and payment.','Use deposits only when work length or unrestricted delivery risk justifies them.','Require owner approval before publishing prices or charging.']},
      leadMagnet:{name:`${d.primaryProblem||'Business'} quick scorecard`,format:'Browser scorecard plus downloadable CSV',conversionPath:'Free tool → starter snapshot → core offer → bounded care plan'},
      addOns:['Additional area or workflow','Additional option','Editable source','Additional revision','Rush only when capacity is confirmed','Implementation check-in'],
      recurringContracts:[{name:`${d.businessName||'Business'} Care`,included:'Two bounded requests or updates per month',exclusions:'New projects, unlimited support, regulated advice, and unreviewed external actions',cancellation:'Cancel before the next billing date'}],
      sitemap:['Home','Services','Free Tool','Proof','About','Resources','Start a Project','Customer Portal'],
      pageOutlines:{home:['Clear result-focused hero','Customer path selector','How it works','Proof','Free tool','Offers','Boundaries','Start action'],services:['Offer families','Fixed deliverables','Compare/help-me-choose','Add-ons','Care plan'],start:['Outcome','Problem','Inputs available','Timing','Budget','Privacy acknowledgement']},
      intakeQuestions:['What finished result do you want?','What is happening now?','Who is affected?','What files, photos, measurements, or examples exist?','What must not change?','What timing and budget constraints exist?','What approvals or licensed work may be required?'],
      productRecords:offers.map((o,i)=>({id:`${slug(d.businessName).toUpperCase().slice(0,6)||'BIZ'}-P${String(i+1).padStart(3,'0')}`,name:o.name,level:o.level,status:'Draft',approval:'Owner review required'})),
      sopList:['Lead intake and privacy','Fit review','Scope and quote','Payment and start authorization','Production and QA','Owner approval','Delivery','Revision','Follow-up','Expense and profitability','Backup and recovery','Incident and error handling'],
      businessOSConfiguration:{modules:['Tasks','Leads','Customers','Jobs','Quotes','Invoices','Payments','Expenses','Communications','Proof','Errors','Settings'],externalActions:'Disabled until credentials, owner approval, and duplicate protection pass tests',tenantKey:slug(d.businessName),theme:'Highway 38 Core Engine — configurable'},
      launchPlan30Days:[
        {days:'1–5',focus:'Decisions and proof',actions:['Approve name/use wording','Confirm first segment','Select one starter and one core offer','Prepare one public-safe proof item']},
        {days:'6–10',focus:'Offer and intake',actions:['Lock scope/price logic','Build intake','Build free lead magnet','Create response templates']},
        {days:'11–20',focus:'System and testing',actions:['Configure Business OS','Test quote/payment/delivery gates','Create launch content','Run privacy and mobile checks']},
        {days:'21–30',focus:'Controlled launch',actions:['Publish verified pages','Invite limited real requests','Review metrics and errors','Approve next expansion']}
      ],
      socialThemes:['Problem clarity','Before/after process','Tool demonstration','Proof and boundaries','Offer explanation','Owner-controlled workflow'],
      expenseCategories:['Software','Advertising','Materials','Supplies','Equipment','Contractors','Payment fees','Insurance','Legal','Accounting','Website and hosting','Phone and internet','Training','Miscellaneous'],
      restrictions,risks,expansionIdeas:expansion,
      missingInformation:['Legal entity and approved public name','Validated customer demand','Approved price and payment rules','Provider accounts and credentials','Public-safe proof permissions','Tax, insurance, licensing, and local requirements as applicable'].filter(x=>!String(d.confirmed||'').toLowerCase().includes(x.toLowerCase())),
      recommendedDecisions:['Approve the smallest sellable starter outcome.','Choose the first customer segment and service area.','Approve what requires owner review before external action.','Choose payment, email, analytics, and customer-auth providers.','Approve public-safe proof only after privacy review.'],
      tasks
    };
    return packageData;
  }
  function markdown(p){
    const lines=[`# ${p.businessSummary.name} — Launch-Ready Business Package`,``, `Status: ${p.metadata.status}`,`Generated: ${p.metadata.generatedAt}`,``,`## Business summary`,p.businessSummary.idea||'No idea supplied.',``,`## Customer segments`];
    p.customerSegments.forEach(x=>lines.push(`- **${x.name}** — ${x.problem||'Problem to validate'} → ${x.desiredOutcome||'Outcome to define'}`));
    lines.push('','## Offer ladder');p.offers.forEach(x=>lines.push(`- **${x.level}: ${x.name}** — ${x.purpose}`));
    lines.push('','## 30-day launch plan');p.launchPlan30Days.forEach(x=>lines.push(`### Days ${x.days}`, ...x.actions.map(a=>`- ${a}`)));
    lines.push('','## Created tasks');p.tasks.forEach(x=>lines.push(`- ${x.id} — ${x.title} [${x.status}]`));
    lines.push('','## Missing information');p.missingInformation.forEach(x=>lines.push(`- ${x}`));
    lines.push('','## Safety state','No publication, charging, advertising, legal entity creation, or customer-facing execution was performed. Owner review is required.');
    return lines.join('\n');
  }
  function render(p){
    output.className='eco-result eco-safe';
    output.innerHTML=`<div class="eco-actions"><button class="eco-button eco-button--primary" id="download-json">Download JSON package</button><button class="eco-button eco-button--outline" id="download-md">Download Markdown brief</button><button class="eco-button eco-button--outline" id="save-draft">Save draft in this browser</button></div><div class="eco-alert"><b>Owner review required.</b> This generated package did not publish, charge, advertise, create a legal entity, contact anyone, or change a live system.</div><h2>${esc(p.businessSummary.name)}</h2><div class="eco-status"><div class="eco-stat"><b>Segments</b><strong>${p.customerSegments.length}</strong></div><div class="eco-stat"><b>Offers</b><strong>${p.offers.length}</strong></div><div class="eco-stat"><b>SOPs</b><strong>${p.sopList.length}</strong></div><div class="eco-stat"><b>Tasks</b><strong>${p.tasks.length}</strong></div></div><h3>Offer ladder</h3><div class="eco-grid">${p.offers.map(x=>`<article class="eco-card"><span class="eco-chip">${esc(x.level)}</span><h3>${esc(x.name)}</h3><p>${esc(x.purpose)}</p></article>`).join('')}</div><h3>Created tasks</h3><table class="eco-table"><thead><tr><th>ID</th><th>Task</th><th>Type</th><th>Status</th></tr></thead><tbody>${p.tasks.map(x=>`<tr><td>${esc(x.id)}</td><td>${esc(x.title)}</td><td>${esc(x.type)}</td><td>${esc(x.status)}</td></tr>`).join('')}</tbody></table><h3>Missing information</h3><ul>${p.missingInformation.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
    const download=(name,text,type)=>{const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);};
    document.getElementById('download-json').onclick=()=>download(`${slug(p.businessSummary.name)}-business-package.json`,JSON.stringify(p,null,2),'application/json');
    document.getElementById('download-md').onclick=()=>download(`${slug(p.businessSummary.name)}-launch-brief.md`,markdown(p),'text/markdown');
    document.getElementById('save-draft').onclick=()=>{localStorage.setItem('h38BusinessConceptDraft',JSON.stringify(p));alert('Draft package saved in this browser only.');};
  }
  form.addEventListener('submit',event=>{event.preventDefault();const p=generate(formData());render(p);output.scrollIntoView({behavior:'smooth'});});
})();
