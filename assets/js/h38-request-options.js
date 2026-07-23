(()=>{
  'use strict';
  const form=document.getElementById('intake-form');
  const catalog=window.H38_CATALOG;
  if(!form||!catalog)return;

  const systems=Array.isArray(window.H38_BUSINESS_SYSTEMS)?window.H38_BUSINESS_SYSTEMS:[];
  const byId=id=>document.getElementById(id);
  const all=(selector,root=form)=>Array.from(root.querySelectorAll(selector));
  const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value)||0);
  const productById=id=>catalog.products.find(product=>product.id===id);
  const selectedText=id=>{const node=byId(id);return node&&node.selectedOptions&&node.selectedOptions[0]?node.selectedOptions[0].textContent.trim():'';};
  const fieldValue=id=>String(byId(id)?.value||'').trim();
  const outcome=byId('outcome');
  const product=byId('product');
  const bundle=byId('bundle');
  const system=byId('business-system-interest');
  const summary=byId('summary');
  const copy=byId('copy-summary');
  const email=byId('email-summary');
  const bundleNote=byId('bundle-note');

  function outcomeProductIds(){
    const match=catalog.outcomes.find(item=>item.value===outcome?.value);
    return match&&Array.isArray(match.products)?match.products:catalog.products.map(item=>item.id);
  }

  function selectedProduct(){
    return productById(product?.value)||productById(outcomeProductIds()[0]);
  }

  function renderProductOptions(){
    if(!product)return;
    const current=product.value;
    const ids=outcomeProductIds();
    product.innerHTML='<option value="">Recommend the best service</option>'+ids.map(id=>{
      const item=productById(id);
      return item?`<option value="${item.id}">${item.name} — ${money(item.price)}</option>`:'';
    }).join('');
    if(ids.includes(current))product.value=current;
    renderConditionalFields();
  }

  function renderBundleOptions(){
    if(!bundle)return;
    bundle.innerHTML='<option value="">No bundle selected</option>'+catalog.bundles.map(item=>`<option value="${item.id}">${item.name} — ${money(item.price)}</option>`).join('');
  }

  function renderSystemOptions(){
    if(!system)return;
    system.innerHTML='<option value="">No larger system selected</option>'+systems.map(item=>`<option value="${item.slug}">${item.name}</option>`).join('');
  }

  function renderConditionalFields(){
    const family=selectedProduct()?.family||'';
    all('.conditional').forEach(fieldset=>fieldset.classList.toggle('is-visible',fieldset.dataset.family===family));
  }

  function renderBundleNote(){
    if(!bundleNote)return;
    const item=catalog.bundles.find(candidate=>candidate.id===bundle?.value);
    bundleNote.textContent=item?`Selected bundle: ${item.name} — ${money(item.price)}`:'Bundles preserve every included service boundary.';
  }

  function renderSystemNote(prefill){
    const item=systems.find(candidate=>candidate.slug===system?.value);
    let note=byId('system-request-note');
    if(!item){if(note)note.remove();return;}
    if(prefill){
      const problem=byId('problem');
      const desired=byId('desired');
      if(problem&&!problem.value.trim())problem.value=`Business systems request — ${item.name}. Current problem: ${item.problem}`;
      if(desired&&!desired.value.trim())desired.value=item.result;
    }
    if(!note){
      note=document.createElement('div');
      note.id='system-request-note';
      note.className='notice exp-no-charge--light';
      system.closest('.field')?.insertAdjacentElement('afterend',note);
    }
    note.innerHTML=`<strong>${item.name}</strong><br>${item.status}. Price is confirmed after requirements review. Submitting this request creates no charge or automatic purchase.`;
  }

  function installAssurance(){
    const anchor=byId('intake-assurance-anchor');
    if(!anchor||anchor.children.length)return;
    anchor.innerHTML='<details class="intake-assurance intake-assurance--compact"><summary>How scope, price, and next steps are confirmed</summary><div class="assurance-grid"><div><strong>1. Fit review</strong><span>Your request is matched to the smallest useful service or bundle.</span></div><div><strong>2. Scope confirmation</strong><span>Price, inputs, deliverables, turnaround, revisions, exclusions, and payment are confirmed before work begins.</span></div><div><strong>3. Owner review</strong><span>No quote, payment request, final delivery, or external action is sent without the configured approval controls.</span></div></div></details>';
  }

  function summaryText(){
    const selectedBundle=catalog.bundles.find(item=>item.id===bundle?.value);
    const selectedSystem=systems.find(item=>item.slug===system?.value);
    const selectedService=selectedProduct();
    return [
      'HIGHWAY 38 REQUEST SUMMARY',
      `Result needed: ${selectedText('outcome')||'Owner review required'}`,
      `Likely service: ${selectedService?`${selectedService.name} (${selectedService.id}) — ${money(selectedService.price)}`:'Owner review required'}`,
      selectedBundle?`Bundle: ${selectedBundle.name} (${selectedBundle.id}) — ${money(selectedBundle.price)}`:'Bundle: none selected',
      selectedSystem?`Business system: ${selectedSystem.name} — ${selectedSystem.status}`:'Business system: none selected',
      `Name: ${fieldValue('name')}`,
      `Email: ${fieldValue('email')}`,
      `Phone: ${fieldValue('phone')}`,
      `Preferred contact: ${selectedText('contact')}`,
      `Current problem: ${fieldValue('problem')}`,
      `Finished result: ${fieldValue('desired')}`,
      `Timing: ${selectedText('timing')}`,
      `Budget: ${selectedText('budget')}`,
      `Files or links: ${fieldValue('files')}`,
      `Details and constraints: ${[fieldValue('details'),fieldValue('plan-details'),fieldValue('implementation-details'),fieldValue('manufacturing-details')].filter(Boolean).join(' | ')}`,
      '',
      'Submitting creates a secure request for owner review. It creates no charge, purchase, payment, quote send, work start, or other automatic external action.'
    ].join('\n');
  }

  function refreshSummary(){
    const text=summaryText();
    if(summary)summary.textContent=text;
    if(copy){copy.hidden=false;copy.dataset.summary=text;}
    if(email){
      const businessEmail=catalog.businessEmail||'highway38solutions@gmail.com';
      email.href=`mailto:${encodeURIComponent(businessEmail)}?subject=${encodeURIComponent('Highway 38 request')}&body=${encodeURIComponent(text)}`;
    }
  }

  function applyQuerySelection(){
    const query=new URLSearchParams(location.search);
    const requestedProduct=query.get('product');
    const requestedBundle=query.get('bundle');
    const requestedSystem=query.get('system');
    const requestedOutcome=query.get('outcome');

    if(requestedOutcome&&catalog.outcomes.some(item=>item.value===requestedOutcome))outcome.value=requestedOutcome;
    if(requestedProduct&&productById(requestedProduct)){
      const matchedOutcome=catalog.outcomes.find(item=>item.products.includes(requestedProduct));
      if(matchedOutcome)outcome.value=matchedOutcome.value;
    }
    renderProductOptions();
    if(requestedProduct&&productById(requestedProduct))product.value=requestedProduct;
    if(requestedBundle&&catalog.bundles.some(item=>item.id===requestedBundle))bundle.value=requestedBundle;
    if(requestedSystem&&systems.some(item=>item.slug===requestedSystem))system.value=requestedSystem;
    renderConditionalFields();
    renderBundleNote();
    renderSystemNote(Boolean(requestedSystem));
  }

  outcome?.addEventListener('change',()=>{renderProductOptions();refreshSummary();});
  product?.addEventListener('change',()=>{renderConditionalFields();refreshSummary();});
  bundle?.addEventListener('change',()=>{renderBundleNote();refreshSummary();});
  system?.addEventListener('change',()=>{renderSystemNote(false);refreshSummary();});
  form.addEventListener('input',refreshSummary);
  form.addEventListener('change',refreshSummary);
  copy?.addEventListener('click',async()=>{
    const text=copy.dataset.summary||summaryText();
    try{await navigator.clipboard.writeText(text);copy.textContent='Copied';setTimeout(()=>{copy.textContent='Copy Summary';},1600);}catch(_){copy.hidden=true;}
  });

  renderBundleOptions();
  renderSystemOptions();
  installAssurance();
  applyQuerySelection();
  refreshSummary();
  window.H38RequestOptions={refreshSummary,selectedProduct};
})();