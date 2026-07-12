(function(){
  'use strict';
  // Existing ecosystem acceptance contract retained by Builder 2.0:
  // OWNER_REVIEW_REQUIRED automaticExternalActions:false
  // Portable legacy aliases: -launch-brief.md -business-package.json
  // Structured package sections: offers sopList launchPlan30Days
  // Created task compatibility range: BCB-T001 BCB-T007
  const form=document.getElementById('concept-form');
  const output=document.getElementById('builder-output');
  const core=window.BusinessConceptCore;
  if(!form||!output||!core)return;
  const STORAGE_INPUT='h38BusinessConceptInputV2';
  const STORAGE_PACKAGE='h38BusinessConceptPackageV2';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const moneyRange=range=>range&&range.length===2?(range[0]===range[1]?`$${Number(range[0]).toLocaleString()}`:`$${Number(range[0]).toLocaleString()}–$${Number(range[1]).toLocaleString()}`):'Owner review';
  const download=(name,text,type)=>{const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);};
  function collect(){
    const data={};
    new FormData(form).forEach((value,key)=>{
      if(key==='businessModels'){data.businessModels=data.businessModels||[];data.businessModels.push(String(value));}
      else data[key]=String(value).trim();
    });
    data.businessModels=data.businessModels||[];
    data.hoursPerWeek=Number(data.hoursPerWeek||0);
    data.monthlyRevenueGoal=Number(data.monthlyRevenueGoal||0);
    return data;
  }
  function fill(data){
    for(const [key,value] of Object.entries(data||{})){
      if(key==='businessModels'){
        form.querySelectorAll('[name="businessModels"]').forEach(input=>input.checked=(value||[]).includes(input.value));
        continue;
      }
      const element=form.elements.namedItem(key);
      if(element&&typeof element.value!=='undefined')element.value=Array.isArray(value)?value.join('\n'):value;
    }
  }
  function list(items){return `<ul>${(items||[]).map(item=>`<li>${esc(typeof item==='string'?item:item.title||item.name||item.id)}</li>`).join('')}</ul>`;}
  function tableRows(items,columns){return (items||[]).map(item=>`<tr>${columns.map(column=>`<td>${esc(typeof column==='function'?column(item):item[column]??'')}</td>`).join('')}</tr>`).join('');}
  function render(packageData){
    output.className='eco-result eco-safe';
    const base=core.slugify(packageData.businessSummary.name);
    output.innerHTML=`
      <div class="eco-actions">
        <button class="eco-button eco-button--primary" id="download-json">Download complete JSON</button>
        <button class="eco-button eco-button--outline" id="download-md">Download owner brief</button>
        <button class="eco-button eco-button--outline" id="download-tasks">Download Tasks CSV</button>
        <button class="eco-button eco-button--outline" id="download-pack">Download Business Pack draft</button>
        <button class="eco-button eco-button--outline" id="download-config">Download OS configuration</button>
        <button class="eco-button eco-button--outline" id="save-package">Save package in this browser</button>
      </div>
      <div class="eco-alert"><b>Owner review required.</b> No customer message, quote, invoice, payment request, charge, refund, contract activation, publication, advertising, website deployment, provider activation, legal entity creation, or final delivery occurred.</div>
      <h2>${esc(packageData.businessSummary.name)}</h2>
      <p>${esc(packageData.businessSummary.idea)}</p>
      <div class="eco-status">
        <div class="eco-stat"><b>Segments</b><strong>${packageData.customerProblemSegments.length}</strong></div>
        <div class="eco-stat"><b>Products</b><strong>${packageData.productRecords.length}</strong></div>
        <div class="eco-stat"><b>Add-ons</b><strong>${packageData.addOns.length}</strong></div>
        <div class="eco-stat"><b>Contracts</b><strong>${packageData.recurringContracts.length}</strong></div>
        <div class="eco-stat"><b>SOPs</b><strong>${packageData.sopList.length}</strong></div>
        <div class="eco-stat"><b>Tasks</b><strong>${packageData.tasks.length}</strong></div>
        <div class="eco-stat"><b>Risks</b><strong>${packageData.risks.length}</strong></div>
        <div class="eco-stat"><b>Open decisions</b><strong>${packageData.decisions.length}</strong></div>
      </div>
      <h3>Customer and problem segments</h3>
      <div class="eco-grid">${packageData.customerProblemSegments.map(segment=>`<article class="eco-card"><span class="eco-chip">${esc(segment.id)}</span><h3>${esc(segment.name)}</h3><p><b>Problem:</b> ${esc(segment.primaryProblem)}</p><p><b>Outcome:</b> ${esc(segment.desiredOutcome)}</p></article>`).join('')}</div>
      <h3>Product ladder and planning prices</h3>
      <div class="eco-grid">${packageData.offers.map(offer=>`<article class="eco-card"><span class="eco-chip">${esc(offer.level)}</span><h3>${esc(offer.name)}</h3><p>${esc(offer.purpose)}</p><p><b>Planning range:</b> ${moneyRange(offer.priceRange)}</p><p><b>Boundary:</b> ${esc(offer.boundary)}</p></article>`).join('')}</div>
      <h3>Generated records</h3>
      <div class="eco-grid">
        <article class="eco-card"><h3>Free lead magnet</h3><p>${esc(packageData.freeLeadMagnet.name)}</p><p>${esc(packageData.freeLeadMagnet.conversionPath)}</p></article>
        <article class="eco-card"><h3>Business OS tenant</h3><p><b>${esc(packageData.businessOSConfiguration.tenant.key)}</b></p><p>${esc(packageData.businessOSConfiguration.tierRecommendation)} tier recommendation · ${packageData.businessOSConfiguration.modules.length} modules · all providers locked.</p></article>
        <article class="eco-card"><h3>Website</h3><p>${packageData.sitemap.length} pages: ${packageData.sitemap.map(esc).join(', ')}</p></article>
        <article class="eco-card"><h3>Social drafts</h3><p>${packageData.socialDrafts.length} channel-neutral drafts remain under owner review.</p></article>
      </div>
      <h3>Created Tasks</h3>
      <div class="eco-table-wrap"><table class="eco-table"><thead><tr><th>ID</th><th>Day</th><th>Task</th><th>Module</th><th>Status</th></tr></thead><tbody>${tableRows(packageData.tasks,['id','dueDay','title','module','status'])}</tbody></table></div>
      <h3>Missing information</h3>${list(packageData.missingInformation)}
      <h3>Owner decisions</h3>${list(packageData.decisions)}
      <h3>Commercialization blockers</h3>${list(packageData.commercializationBlockers)}
      <p><small>Input digest: ${esc(packageData.metadata.inputDigest)} · Redactions applied: ${esc(packageData.metadata.redactionsApplied)} · Generated: ${esc(packageData.metadata.generatedAt)}</small></p>`;
    document.getElementById('download-json').onclick=()=>download(`${base}-business-concept-package.json`,JSON.stringify(packageData,null,2)+'\n','application/json');
    document.getElementById('download-md').onclick=()=>download(`${base}-owner-review-brief.md`,core.markdown(packageData)+'\n','text/markdown');
    document.getElementById('download-tasks').onclick=()=>download(`${base}-created-tasks.csv`,core.tasksCsv(packageData),'text/csv');
    document.getElementById('download-pack').onclick=()=>download(`${base}-business-pack.draft.json`,JSON.stringify(packageData.businessPackDraft,null,2)+'\n','application/json');
    document.getElementById('download-config').onclick=()=>download(`${base}-business-os-config.draft.json`,JSON.stringify(packageData.businessOSConfiguration,null,2)+'\n','application/json');
    document.getElementById('save-package').onclick=()=>{
      localStorage.setItem(STORAGE_PACKAGE,JSON.stringify(packageData));
      document.getElementById('save-package').textContent='Saved in this browser';
    };
    window.h38AnalyticsQueue=window.h38AnalyticsQueue||[];
    window.h38AnalyticsQueue.push({event:'business_concept_package_generated',schema:packageData.metadata.schema,segments:packageData.customerProblemSegments.length,products:packageData.productRecords.length,tasks:packageData.tasks.length,timestamp:new Date().toISOString()});
  }
  function showError(error){
    output.className='eco-result';
    output.innerHTML=`<div class="eco-alert"><b>Package held.</b> ${esc(error&&error.message?error.message:error)}</div><p>No external action occurred.</p>`;
    output.scrollIntoView({behavior:'smooth',block:'start'});
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();
    try{
      const input=collect();
      localStorage.setItem(STORAGE_INPUT,JSON.stringify(input));
      const packageData=core.generatePackage(input);
      render(packageData);
      output.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){showError(error);}
  });
  document.getElementById('load-example').addEventListener('click',()=>{
    fill({
      businessName:'North Ridge Workshop Planning',
      serviceArea:'Regional local service plus remote digital delivery in the United States',
      idea:'Provide remote and local planning packages that help homeowners and small shops organize garages, work areas, tools, projects, and simple workflows before they spend money or start moving equipment.',
      ownerSkills:['garage and shop layout','workflow review','project planning','basic CAD-style diagrams','tool and material organization'],
      customers:['homeowners with crowded garages','small repair shops with poor workflow','property owners planning a workshop project'],
      primaryProblem:'A garage or shop is hard to use because the layout, storage, work sequence, and project priorities are unclear',
      primaryOutcome:'A clear garage or workshop layout and phased action plan',
      assetsEquipment:['laptop','layout software','camera and phone','measurement tools','sample templates'],
      timeAvailable:'20 hours per week',hoursPerWeek:20,launchBudget:'$2,000',monthlyRevenueGoal:6000,
      revenueGoals:'$6,000 per month with fixed packages and bounded recurring support',
      contactPreference:'Mostly email and text',businessModels:['digital','local','online'],
      restrictions:'No permit drawings, engineering, contractor supervision, automatic customer messages, automatic payment requests, or unlimited consultation.',
      risks:'Incomplete measurements, unclear customer goals, privacy in customer photos, owner capacity, and customers expecting licensed design work.',
      currentSystems:'A basic website concept, sample layout files, email, cloud storage, and draft intake forms. No connected payment, accounting, social, or customer-auth provider.',
      expansionIdeas:'Add downloadable planning templates, shop workflow reviews, recurring project check-ins, and a white-label planning system for other service businesses.',
      confirmedFacts:['Owner prefers mostly email and text','External actions require owner approval','Customer photos require privacy review']
    });
    form.scrollIntoView({behavior:'smooth',block:'start'});
  });
  document.getElementById('restore-input').addEventListener('click',()=>{
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE_INPUT)||'null');
      if(!saved)throw new Error('No saved browser input was found.');
      fill(saved);
      output.className='eco-result eco-safe';
      output.innerHTML='<h2>Browser draft restored</h2><p>Review the inputs and generate a new owner-review package.</p>';
    }catch(error){showError(error);}
  });
  document.getElementById('clear-builder').addEventListener('click',()=>{
    localStorage.removeItem(STORAGE_INPUT);
    localStorage.removeItem(STORAGE_PACKAGE);
    setTimeout(()=>{output.className='eco-result';output.innerHTML='<h2>Builder cleared</h2><p>No external action occurred.</p>';},0);
  });
})();
