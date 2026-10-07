(function(){
'use strict';
// H38 AI-Assisted Onboarding: guided business setup with Muse/personal AI.
// Every step works manually. AI assist is optional and results are always
// reviewable before saving. H38 AI (Kit) remains as fallback.
// Nothing executes automatically.
const BUILD='20261007-ai-onboarding-2';
const text=v=>String(v==null?'':v).trim();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const businessId=()=>text(window.state?.businessId);

const STEPS=[
  {id:'welcome',title:'Welcome',subtitle:'Choose how you want to set up'},
  {id:'profile',title:'Business Profile',subtitle:'Name, contact, and business type'},
  {id:'services',title:'Services',subtitle:'What you offer and pricing'},
  {id:'customers',title:'Customers',subtitle:'Import or add your customer list'},
  {id:'team',title:'Team',subtitle:'Add team members (optional)'},
  {id:'review',title:'Review',subtitle:'Check everything before you start'},
];

let currentStep=0;
let onboardingData={
  useAI:true,
  businessName:'',businessType:'',phone:'',email:'',address:'',
  services:[],
  customers:[],
  team:[],
};

function stepIndicator(){
  return `<div class="h38-onboard-steps">${STEPS.map((s,i)=>`
    <button type="button" class="h38-onboard-step ${i===currentStep?'active':''} ${i<currentStep?'done':''}"
      data-onboard-goto="${i}" ${i>currentStep?'disabled':''}>
      <span class="h38-onboard-num">${i<currentStep?'✓':i+1}</span>
      <span><strong>${esc(s.title)}</strong><small>${esc(s.subtitle)}</small></span>
    </button>`).join('')}</div>`;
}

function renderWelcome(){
  return `<div class="card"><h2>Set up your Business Office</h2>
    <p class="muted">We'll get your business ready in a few steps. You choose how much help you want.</p>
    <div class="h38-onboard-choice">
      <button type="button" class="h38-onboard-card" data-onboard-ai="true">
        <span>✨</span><strong>AI-assisted setup</strong>
        <small>Your personal AI (Muse) helps fill in services, organize customer lists, and suggest pricing. You review everything before it's saved.</small>
      </button>
      <button type="button" class="h38-onboard-card" data-onboard-ai="false">
        <span>📝</span><strong>Manual setup</strong>
        <small>Enter everything yourself, step by step. No AI involved. The H38 assistant stays available if you want help later.</small>
      </button>
    </div>
    <p class="muted small">Nothing is sent, charged, or published automatically. You approve every save.</p>
  </div>`;
}

function renderProfile(){
  const d=onboardingData;
  return `<div class="card"><h2>Business Profile</h2>
    <div class="two">
      <div><label>Business name</label><input name="businessName" value="${esc(d.businessName)}" required placeholder="Highway 38 Solutions"></div>
      <div><label>Business type</label><select name="businessType">
        <option value="">Select type...</option>
        ${['General Contractor','Home Services','Lawn Care & Landscaping','Snow Removal','Plumbing','Electrical','HVAC','Painting','Roofing','Cleaning Services','Machine Shop','Other'].map(t=>`<option ${d.businessType===t?'selected':''}>${t}</option>`).join('')}
      </select></div>
    </div>
    <div class="two">
      <div><label>Phone</label><input name="phone" type="tel" value="${esc(d.phone)}" placeholder="(218) 555-0100"></div>
      <div><label>Email</label><input name="email" type="email" value="${esc(d.email)}" placeholder="you@business.com"></div>
    </div>
    <label>Address</label><input name="address" value="${esc(d.address)}" placeholder="123 Main St, Grand Rapids, MN">
    ${d.useAI?'<p class="muted small">✨ AI will suggest services based on your business type in the next step.</p>':''}
    <div class="actions"><button type="button" class="secondary" data-onboard-nav="back">Back</button><button data-onboard-nav="next">Continue</button></div>
  </div>`;
}

function renderServices(){
  const d=onboardingData;
  const tradeId = (window.H38TradePackages && typeof window.H38TradePackages.suggestFor==='function')
    ? window.H38TradePackages.suggestFor(d.businessType) : null;
  const tradePkg = tradeId ? window.H38TradePackages.packages[tradeId] : null;
  return `<div class="card"><h2>Services</h2>
    <p class="muted">What services do you offer? ${d.useAI?'AI can suggest common services for your business type.':''}</p>
    ${tradePkg?`<div class="notice" style="margin-bottom:12px"><strong>${esc(tradePkg.name)} starter package available.</strong><br><span class="muted small">${tradePkg.priceBook.length} common services with typical pricing, plus checklists and quote language — ready to load.</span><div class="actions" style="margin-top:8px"><button type="button" data-onboard-load-trade="${esc(tradeId)}">Load ${esc(tradePkg.name)} starter package</button></div></div>`:''}
    ${d.useAI?'<div class="actions" style="margin-bottom:12px"><button type="button" class="secondary" data-onboard-ai-services>✨ Suggest services with AI</button></div><div id="h38AiServices"></div>':''}
    <div id="h38ServiceList">${d.services.map((s,i)=>serviceRow(s,i)).join('')}</div>
    <div class="actions" style="margin-top:8px"><button type="button" class="secondary" data-onboard-add-service>+ Add service</button></div>
    <div class="actions"><button type="button" class="secondary" data-onboard-nav="back">Back</button><button data-onboard-nav="next">Continue</button></div>
  </div>`;
}

function serviceRow(s,i){
  return `<div class="h38-onboard-row" data-service="${i}">
    <input value="${esc(s.name||'')}" placeholder="Service name" data-sfield="name">
    <input value="${esc(s.price||'')}" placeholder="Price" data-sfield="price">
    <button type="button" class="icon-button" data-onboard-del-service="${i}" aria-label="Remove">×</button>
  </div>`;
}

function renderCustomers(){
  const d=onboardingData;
  return `<div class="card"><h2>Customers</h2>
    <p class="muted">Add your customer list. ${d.useAI?'AI can help organize a pasted list or photo description.':''}</p>
    ${d.useAI?`<div class="h38-onboard-ai-box">
      <label>Paste your customer list (names, phones, addresses — any format)</label>
      <textarea id="h38CustomerPaste" rows="4" placeholder="John Smith, 555-0100, 123 Oak St&#10;Jane Doe, 555-0200..."></textarea>
      <div class="actions"><button type="button" class="secondary" data-onboard-ai-customers>✨ Organize with AI</button></div>
      <div id="h38AiCustomers"></div>
    </div>`:''}
    <div id="h38CustomerList">${d.customers.map((c,i)=>customerRow(c,i)).join('')||'<p class="muted">No customers yet.</p>'}</div>
    <div class="actions" style="margin-top:8px"><button type="button" class="secondary" data-onboard-add-customer>+ Add customer</button></div>
    <div class="actions"><button type="button" class="secondary" data-onboard-nav="back">Back</button><button data-onboard-nav="next">Continue</button></div>
  </div>`;
}

function customerRow(c,i){
  return `<div class="h38-onboard-row" data-customer="${i}">
    <input value="${esc(c.name||'')}" placeholder="Name" data-cfield="name">
    <input value="${esc(c.phone||'')}" placeholder="Phone" data-cfield="phone">
    <button type="button" class="icon-button" data-onboard-del-customer="${i}" aria-label="Remove">×</button>
  </div>`;
}

function renderTeam(){
  const d=onboardingData;
  return `<div class="card"><h2>Team <span class="muted">(optional)</span></h2>
    <p class="muted">Add team members who'll use the Office. You can always add more later.</p>
    <div id="h38TeamList">${d.team.map((t,i)=>`
      <div class="h38-onboard-row" data-team="${i}">
        <input value="${esc(t.name||'')}" placeholder="Name" data-tfield="name">
        <input value="${esc(t.email||'')}" placeholder="Email" data-tfield="email" type="email">
        <button type="button" class="icon-button" data-onboard-del-team="${i}" aria-label="Remove">×</button>
      </div>`).join('')||'<p class="muted">No team members yet. Skip this step if it\'s just you.</p>'}</div>
    <div class="actions" style="margin-top:8px"><button type="button" class="secondary" data-onboard-add-team>+ Add team member</button></div>
    <div class="actions"><button type="button" class="secondary" data-onboard-nav="back">Back</button><button data-onboard-nav="next">Continue</button></div>
  </div>`;
}

function renderReview(){
  const d=onboardingData;
  return `<div class="card"><h2>Review & Launch</h2>
    <p class="muted">Check everything looks right. Nothing is saved until you confirm.</p>
    <div class="h38-onboard-review">
      <section><h3>Business</h3><p><strong>${esc(d.businessName||'—')}</strong><br>${esc(d.businessType||'')}<br>${esc(d.phone||'')}<br>${esc(d.email||'')}<br>${esc(d.address||'')}</p></section>
      <section><h3>Services (${d.services.length})</h3>${d.services.map(s=>`<p>${esc(s.name)}${s.price?' — '+esc(s.price):''}</p>`).join('')||'<p class="muted">None</p>'}</section>
      <section><h3>Customers (${d.customers.length})</h3>${d.customers.map(c=>`<p>${esc(c.name)}${c.phone?' — '+esc(c.phone):''}</p>`).join('')||'<p class="muted">None</p>'}</section>
      <section><h3>Team (${d.team.length})</h3>${d.team.map(t=>`<p>${esc(t.name)}${t.email?' — '+esc(t.email):''}</p>`).join('')||'<p class="muted">None</p>'}</section>
    </div>
    ${d.businessType==='Machine Shop'?`<div class="card" style="margin-top:12px"><label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><input type="checkbox" id="h38OnboardEnableShop" style="margin-top:4px"><span><strong>Enable the Machine Shop module</strong><br><span class="muted small">Adds the Machine Shop workspace: RFQ intake, supplier quote comparison, purchase orders, QC checks, shipping and reorder tracking. You can turn it off anytime in Settings → Owner Controls.</span></span></label></div>`:''}
    <div class="actions"><button type="button" class="secondary" data-onboard-nav="back">Back</button><button data-onboard-finish class="primary">✓ Launch my Office</button></div>
    <p class="muted small">This saves your business profile, services, customers, and team. You can change anything later in Settings.</p>
  </div>`;
}

function render(){
  const main=document.getElementById('mainContent');
  if(!main)return;
  const step=STEPS[currentStep];
  let body='';
  if(step.id==='welcome')body=renderWelcome();
  else if(step.id==='profile')body=renderProfile();
  else if(step.id==='services')body=renderServices();
  else if(step.id==='customers')body=renderCustomers();
  else if(step.id==='team')body=renderTeam();
  else if(step.id==='review')body=renderReview();
  
  main.innerHTML=`<div class="page-head"><div><span class="kicker">SETUP</span><h1>Business Onboarding</h1><p>Step ${currentStep+1} of ${STEPS.length}: ${esc(step.title)}</p></div></div>
    ${stepIndicator()}${body}`;
  bind();
}

function collectCurrentStep(){
  const step=STEPS[currentStep];
  if(step.id==='profile'){
    document.querySelectorAll('#mainContent [name]').forEach(el=>{
      onboardingData[el.name]=el.value;
    });
  }else if(step.id==='services'){
    onboardingData.services=[];
    document.querySelectorAll('#h38ServiceList [data-service]').forEach(row=>{
      const name=row.querySelector('[data-sfield="name"]')?.value||'';
      const price=row.querySelector('[data-sfield="price"]')?.value||'';
      if(name)onboardingData.services.push({name,price});
    });
  }else if(step.id==='customers'){
    onboardingData.customers=[];
    document.querySelectorAll('#h38CustomerList [data-customer]').forEach(row=>{
      const name=row.querySelector('[data-cfield="name"]')?.value||'';
      const phone=row.querySelector('[data-cfield="phone"]')?.value||'';
      if(name)onboardingData.customers.push({name,phone});
    });
  }else if(step.id==='team'){
    onboardingData.team=[];
    document.querySelectorAll('#h38TeamList [data-team]').forEach(row=>{
      const name=row.querySelector('[data-tfield="name"]')?.value||'';
      const email=row.querySelector('[data-tfield="email"]')?.value||'';
      if(name)onboardingData.team.push({name,email});
    });
  }
}

function bind(){
  document.querySelectorAll('[data-onboard-goto]').forEach(b=>b.onclick=()=>{
    const i=parseInt(b.dataset.onboardGoto,10);
    if(i<currentStep){collectCurrentStep();currentStep=i;render();}
  });
  document.querySelectorAll('[data-onboard-ai]').forEach(b=>b.onclick=()=>{
    onboardingData.useAI=b.dataset.onboardAi==='true';
    currentStep=1;render();
    toast(onboardingData.useAI?'AI-assisted setup. You review everything.':'Manual setup. H38 assistant available if needed.');
  });
  document.querySelectorAll('[data-onboard-nav]').forEach(b=>b.onclick=()=>{
    collectCurrentStep();
    if(b.dataset.onboardNav==='next'&&currentStep<STEPS.length-1)currentStep++;
    else if(b.dataset.onboardNav==='back'&&currentStep>0)currentStep--;
    render();
  });
  document.querySelector('[data-onboard-add-service]')?.addEventListener('click',()=>{
    collectCurrentStep();onboardingData.services.push({name:'',price:''});render();
  });
  document.querySelectorAll('[data-onboard-del-service]').forEach(b=>b.onclick=()=>{
    collectCurrentStep();onboardingData.services.splice(parseInt(b.dataset.onboardDelService,10),1);render();
  });
  document.querySelector('[data-onboard-add-customer]')?.addEventListener('click',()=>{
    collectCurrentStep();onboardingData.customers.push({name:'',phone:''});render();
  });
  document.querySelectorAll('[data-onboard-del-customer]').forEach(b=>b.onclick=()=>{
    collectCurrentStep();onboardingData.customers.splice(parseInt(b.dataset.onboardDelCustomer,10),1);render();
  });
  document.querySelector('[data-onboard-add-team]')?.addEventListener('click',()=>{
    collectCurrentStep();onboardingData.team.push({name:'',email:''});render();
  });
  document.querySelectorAll('[data-onboard-del-team]').forEach(b=>b.onclick=()=>{
    collectCurrentStep();onboardingData.team.splice(parseInt(b.dataset.onboardDelTeam,10),1);render();
  });
  document.querySelector('[data-onboard-ai-services]')?.addEventListener('click',suggestServices);
  document.querySelector('[data-onboard-ai-customers]')?.addEventListener('click',organizeCustomers);
  document.querySelector('[data-onboard-finish]')?.addEventListener('click',finish);
  document.querySelector('[data-onboard-load-trade]')?.addEventListener('click',(e)=>{
    collectCurrentStep();
    const tradeId=e.currentTarget.dataset.onboardLoadTrade;
    const pkg=window.H38TradePackages&&window.H38TradePackages.packages[tradeId];
    if(!pkg){toast('Trade package not found.',true);return;}
    /* Add price book items as services (skip duplicates by name) */
    const existing=new Set(onboardingData.services.map(s=>(s.name||'').toLowerCase().trim()));
    let added=0;
    for(const item of pkg.priceBook){
      const name=item.description||'';
      if(!name||existing.has(name.toLowerCase().trim()))continue;
      const price=item.priceLow===item.priceHigh
        ? '$'+item.priceLow
        : '$'+item.priceLow+'–$'+item.priceHigh;
      onboardingData.services.push({name:name,price:price+' / '+(item.unit||'each')});
      existing.add(name.toLowerCase().trim());
      added++;
    }
    /* Stash the full package for post-onboarding load (price book, checklists, etc.) */
    onboardingData.tradePackageId=tradeId;
    render();
    toast(added+' '+pkg.name+' services loaded. Review and edit as needed.');
  });
}

async function suggestServices(){
  const box=document.getElementById('h38AiServices');
  if(!box)return;
  const businessType=onboardingData.businessType||'General Contractor';
  box.innerHTML='<p class="muted">✨ Asking your AI for service suggestions...</p>';
  try{
    if(!window.H38_AI_HANDOFF)throw Error('AI handoff not available. Add services manually.');
    const result=await window.H38_AI_HANDOFF.runTask('onboarding_services',{businessId:businessId(),businessType,text:'Suggest 8-10 common services with typical pricing for a '+businessType+' business.'});
    const services=result.services||[];
    if(!services.length)throw Error('No suggestions returned.');
    box.innerHTML=`<div class="h38-ai-suggestions"><p><strong>Suggested services:</strong></p>
      ${services.map((s,i)=>`<label class="h38-ai-sug"><input type="checkbox" checked data-ai-sug="${i}"><span><strong>${esc(s.name)}</strong>${s.price?' — '+esc(s.price):''}</span></label>`).join('')}
      <div class="actions"><button type="button" class="secondary" data-ai-add-selected>Add selected</button></div></div>`;
    box.querySelector('[data-ai-add-selected]').onclick=()=>{
      box.querySelectorAll('[data-ai-sug]:checked').forEach(cb=>{
        const s=services[parseInt(cb.dataset.aiSug,10)];
        if(s)onboardingData.services.push({name:s.name,price:s.price||''});
      });
      collectCurrentStep();render();
      toast('Services added. Review and edit as needed.');
    };
  }catch(e){
    box.innerHTML=`<p class="notice warn">AI unavailable: ${esc(e.message)}. Add services manually below.</p>`;
  }
}

async function organizeCustomers(){
  const box=document.getElementById('h38AiCustomers');
  const input=document.getElementById('h38CustomerPaste');
  if(!box||!input)return;
  const pasted=text(input.value);
  if(!pasted){toast('Paste your customer list first.',true);return;}
  box.innerHTML='<p class="muted">✨ Asking your AI to organize...</p>';
  try{
    if(!window.H38_AI_HANDOFF)throw Error('AI handoff not available.');
    const result=await window.H38_AI_HANDOFF.runTask('onboarding_customers',{businessId:businessId(),text:pasted});
    const customers=result.customers||[];
    if(!customers.length)throw Error('No customers found in the text.');
    box.innerHTML=`<div class="h38-ai-suggestions"><p><strong>Found ${customers.length} customers:</strong></p>
      ${customers.map((c,i)=>`<label class="h38-ai-sug"><input type="checkbox" checked data-ai-cust="${i}"><span>${esc(c.name)}${c.phone?' — '+esc(c.phone):''}</span></label>`).join('')}
      <div class="actions"><button type="button" class="secondary" data-ai-add-cust>Add selected</button></div></div>`;
    box.querySelector('[data-ai-add-cust]').onclick=()=>{
      box.querySelectorAll('[data-ai-cust]:checked').forEach(cb=>{
        const c=customers[parseInt(cb.dataset.aiCust,10)];
        if(c)onboardingData.customers.push({name:c.name,phone:c.phone||''});
      });
      collectCurrentStep();render();
      toast('Customers added. Review and edit as needed.');
    };
  }catch(e){
    box.innerHTML=`<p class="notice warn">AI unavailable: ${esc(e.message)}.</p>`;
  }
}

function showSaveResult(result){
  render();
  const card=document.querySelector('#mainContent .card:last-of-type')||document.getElementById('mainContent');
  if(!card)return;
  const panel=document.createElement('div');
  panel.className='notice warn';
  panel.style.marginTop='12px';
  panel.innerHTML=`<strong>${result.saved} of ${result.total} records saved.</strong><br>${result.failed.map(f=>esc(f)).join('<br>')}<div class="actions" style="margin-top:8px"><button type="button" data-onboard-retry-save>Retry save</button></div><p class="muted small">Records that saved stay saved — retrying only re-sends the full list safely (same record IDs, no duplicates). Anything queued but not yet synced shows in the sync badge at the top and stays safe on this device.</p>`;
  card.appendChild(panel);
  panel.querySelector('[data-onboard-retry-save]').onclick=()=>finish();
  toast('Some records did not save. See the list and tap Retry save.',true);
  panel.scrollIntoView({block:'nearest'});
}

async function finish(){
  collectCurrentStep();
  if(!onboardingData.businessName){toast('Business name is required.',true);currentStep=1;render();return;}
  try{
    toast('Saving your business setup...');
    // Save via existing queue operations. Every record is attempted and any
    // failure is reported on the review step — never silently swallowed.
    const failed=[];
    let saved=0,total=0;
    if(typeof window.queueOperation!=='function'){
      failed.push('The Office save system is unavailable right now. Reconnect, then tap Launch again — nothing was saved.');
    }else{
      const bid=businessId(),stamp=new Date().toISOString();
      const nextId=prefix=>{try{if(window.H38DB&&typeof window.H38DB.newId==='function')return window.H38DB.newId(prefix);}catch(_){}return prefix+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);};
      for(const s of onboardingData.services){
        if(!text(s.name))continue;total++;
        s._saveId=s._saveId||nextId('SVC');
        // services collection, matching the canonical SAVE_ENTITY mapping
        // (SAVE_SERVICE has no operational mapping and would fail at sync).
        const record={'Service ID':s._saveId,'Business ID':bid,'Service Name':s.name,'Price':text(s.price),'Status':'Active','Created Time':stamp,'Updated Time':stamp,'Record Version':1};
        try{await window.queueOperation('SAVE_ENTITY','Service',s._saveId,{entity:'services',record},{collection:'services',record,idKeys:['Service ID']},true);saved++;}
        catch(e){failed.push(`Service "${s.name}" — ${e&&e.message||e}`);}
      }
      for(const c of onboardingData.customers){
        if(!text(c.name))continue;total++;
        c._saveId=c._saveId||nextId('CUST');
        const record={'Customer ID':c._saveId,'Business ID':bid,'Customer Name':c.name,'Phone':c.phone||'','Status':'Active','Created Time':stamp,'Updated Time':stamp,'Record Version':1};
        try{await window.queueOperation('SAVE_CUSTOMER','Customer',c._saveId,{customerId:c._saveId,customerName:c.name,phone:c.phone||'',businessId:bid},{collection:'customers',record,idKeys:['Customer ID']},true);saved++;}
        catch(e){failed.push(`Customer "${c.name}" — ${e&&e.message||e}`);}
      }
    }
    if(failed.length){showSaveResult({saved,total,failed});return;}
    if(total)toast(`✓ Your Office is ready! ${saved} of ${total} records saved.`);
    else toast('✓ Your Office is ready!');
    /* Load full trade package (price book, checklists, job types, quote notes)
       if one was selected during onboarding. */
    try{
      if(onboardingData.tradePackageId && window.H38TradePackages &&
         typeof window.H38TradePackages.load==='function'){
        const result=await window.H38TradePackages.load(onboardingData.tradePackageId).catch(e=>({error:e.message}));
        if(result&&!result.error){
          toast('Trade package loaded: '+result.added+' price book items added'+(result.skipped?' ('+result.skipped+' already present)':'')+'.');
        }
      }
    }catch(e){/* package load is best-effort; services were already saved above */}
    // Machine-shop opt-in: only when the owner explicitly checked the box on the
    // review step. The machine_shop module setting defaults OFF everywhere else.
    try{
      if(document.getElementById('h38OnboardEnableShop')?.checked &&
         window.H38OwnerControls && typeof window.H38OwnerControls.setMachineShop==='function'){
        await window.H38OwnerControls.setMachineShop(true).catch(()=>{});
      }
    }catch(e){/* module can be enabled later in Settings → Owner Controls */}
    if(window.openPage)window.openPage('today');
  }catch(e){
    toast('Save failed: '+e.message,true);
  }
}

function toast(msg,bad){
  if(typeof window.toast==='function')window.toast(msg,!!bad);
}

function start(){
  currentStep=0;
  onboardingData={useAI:true,businessName:'',businessType:'',phone:'',email:'',address:'',services:[],customers:[],team:[]};
  render();
}

// Register as a page
if(window.H38_PAGES)window.H38_PAGES.onboarding={render:start,title:'Onboarding'};
window.H38_ONBOARDING=Object.freeze({build:BUILD,start});

})();
