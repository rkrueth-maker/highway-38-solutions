(()=>{
  'use strict';
  const form=document.getElementById('intake-form');
  const pricing=window.H38_PRICING;
  if(!form||!pricing)return;

  const byId=id=>document.getElementById(id);
  const fieldValue=id=>String(byId(id)?.value||'').trim();
  const selectedText=id=>{const node=byId(id);return node&&node.selectedOptions&&node.selectedOptions[0]?node.selectedOptions[0].textContent.trim():'';};
  const offerSelect=byId('offer');
  const outcome=byId('outcome');
  const summary=byId('summary');
  const copy=byId('copy-summary');
  const email=byId('email-summary');
  const note=byId('offer-note');
  const offerById=id=>pricing.offers.find(item=>item.id===id);

  const outcomeDefault={
    quote:'quote-builder',
    business:'business-office',
    configured:'configured-system',
    unsure:'business-snapshot'
  };

  function offerLabel(item){
    if(!item)return '';
    return `${item.name} — ${item.priceLabel}${item.setupLabel?` · ${item.setupLabel}`:''}`;
  }

  function renderOffers(){
    if(!offerSelect)return;
    const current=offerSelect.value;
    offerSelect.innerHTML='<option value="">Recommend the right path</option>'+pricing.offers.map(item=>`<option value="${item.id}">${offerLabel(item)}</option>`).join('');
    if(offerById(current))offerSelect.value=current;
  }

  function selectedOffer(){return offerById(offerSelect?.value);}

  function renderOfferNote(){
    if(!note)return;
    const item=selectedOffer();
    if(!item){note.textContent=pricing.aiPolicy;return;}
    const extra=item.id==='business-snapshot'?item.creditPolicy:pricing.aiPolicy;
    note.innerHTML=`<strong>${item.name}: ${item.priceLabel}</strong>${item.setupLabel?` · ${item.setupLabel}`:''}<br>${extra}`;
  }

  function selectOfferForOutcome(force){
    if(!offerSelect)return;
    const suggested=outcomeDefault[outcome?.value]||'';
    if(suggested&&(force||!offerSelect.value))offerSelect.value=suggested;
    renderOfferNote();
  }

  function installAssurance(){
    const anchor=byId('intake-assurance-anchor');
    if(!anchor||anchor.children.length)return;
    anchor.innerHTML='<details class="intake-assurance intake-assurance--compact"><summary>How product, price, and next steps are confirmed</summary><div class="assurance-grid"><div><strong>1. Fit review</strong><span>Your request is matched to Quote Builder, Business Office, Custom Business System, or the separate Business Snapshot diagnostic.</span></div><div><strong>2. Scope confirmation</strong><span>Setup or implementation, payment terms, deliverables, turnaround, exclusions, usage allowances, and any custom work are confirmed before work begins.</span></div><div><strong>3. Owner control</strong><span>No subscription, payment request, quote send, customer communication, or external action occurs automatically.</span></div></div></details>';
  }

  function summaryText(){
    const item=selectedOffer();
    return [
      'HIGHWAY 38 REQUEST SUMMARY',
      `Result needed: ${selectedText('outcome')||'Owner review required'}`,
      `Selected offer: ${item?offerLabel(item):'Recommend the right path'}`,
      `Name: ${fieldValue('name')}`,
      `Email: ${fieldValue('email')}`,
      `Phone: ${fieldValue('phone')}`,
      `Preferred contact: ${selectedText('contact')}`,
      `Current problem: ${fieldValue('problem')}`,
      `Finished result: ${fieldValue('desired')}`,
      `Timing: ${selectedText('timing')}`,
      `Implementation or setup budget: ${selectedText('budget')}`,
      `Files or links: ${fieldValue('files')}`,
      `Details and constraints: ${fieldValue('details')}`,
      '',
      pricing.aiPolicy,
      'Submitting creates a secure request for owner review. It creates no charge, subscription, purchase, payment, quote send, work start, or other automatic external action.'
    ].join('\n');
  }

  function refreshSummary(){
    const text=summaryText();
    if(summary)summary.textContent=text;
    if(copy){copy.hidden=false;copy.dataset.summary=text;}
    if(email){email.href=`mailto:${encodeURIComponent('highway38solutions@gmail.com')}?subject=${encodeURIComponent('Highway 38 request')}&body=${encodeURIComponent(text)}`;}
  }

  function applyQuerySelection(){
    const query=new URLSearchParams(location.search);
    const requested=query.get('offer');
    if(offerById(requested)){
      offerSelect.value=requested;
      const reverse=Object.entries(outcomeDefault).find(([,id])=>id===requested);
      if(reverse&&outcome)outcome.value=reverse[0];
    }else selectOfferForOutcome(false);
    renderOfferNote();
  }

  outcome?.addEventListener('change',()=>{selectOfferForOutcome(true);refreshSummary();});
  offerSelect?.addEventListener('change',()=>{renderOfferNote();refreshSummary();});
  form.addEventListener('input',refreshSummary);
  form.addEventListener('change',refreshSummary);
  copy?.addEventListener('click',async()=>{
    const text=copy.dataset.summary||summaryText();
    try{await navigator.clipboard.writeText(text);copy.textContent='Copied';setTimeout(()=>{copy.textContent='Copy Summary';},1600);}catch(_){copy.hidden=true;}
  });

  renderOffers();
  installAssurance();
  applyQuerySelection();
  refreshSummary();
  window.H38RequestOptions={refreshSummary,selectedOffer};
})();
