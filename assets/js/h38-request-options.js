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
  const outcomeDefault={quote:'quote-builder',business:'business-office',configured:'configured-system',unsure:'business-snapshot'};
  const isCustomDigital=()=>outcome?.value==='custom-digital';
  function offerLabel(item){if(!item)return '';return `${item.name} — ${item.priceLabel}${item.setupLabel?` · ${item.setupLabel}`:''}`;}
  function renderOffers(){if(!offerSelect)return;const current=offerSelect.value;offerSelect.innerHTML='<option value="">Recommend the right path</option>'+pricing.offers.map(item=>`<option value="${item.id}">${offerLabel(item)}</option>`).join('');if(offerById(current))offerSelect.value=current;}
  function selectedOffer(){return offerById(offerSelect?.value);}
  function renderOfferNote(){if(!note)return;const item=selectedOffer();if(!item){note.textContent=isCustomDigital()?'Custom Digital Service — quoted by scope for the requested website, web app, mobile app, portal, internal tool, automation, or integration.':pricing.aiPolicy;return;}const extra=item.id==='business-snapshot'?item.creditPolicy:pricing.aiPolicy;note.innerHTML=`<strong>${item.name}: ${item.priceLabel}</strong>${item.setupLabel?` · ${item.setupLabel}`:''}<br>${extra}`;}
  function selectOfferForOutcome(force){if(!offerSelect)return;const suggested=outcomeDefault[outcome?.value]||'';if(isCustomDigital()){offerSelect.value='';renderOfferNote();return;}if(suggested&&(force||!offerSelect.value))offerSelect.value=suggested;renderOfferNote();}
  function installAssurance(){const anchor=byId('intake-assurance-anchor');if(!anchor||anchor.children.length)return;anchor.innerHTML='<details class="intake-assurance intake-assurance--compact"><summary>How product, service, price, and next steps are confirmed</summary><div class="assurance-grid"><div><strong>1. Fit review</strong><span>Your request is matched to Quote Builder, Business Office, Configured Business System, the separate Business Snapshot diagnostic, a Custom Digital Service, or other project work.</span></div><div><strong>2. Scope confirmation</strong><span>Setup or implementation, custom-build scope, payment terms, deliverables, turnaround, exclusions, usage allowances, third-party requirements, and any custom work are confirmed before work begins.</span></div><div><strong>3. Owner control</strong><span>No subscription, payment request, quote send, customer communication, deployment, or other external action occurs automatically.</span></div></div></details>';}
  function selectedPathLabel(){const item=selectedOffer();if(item)return offerLabel(item);if(isCustomDigital())return 'Custom Digital Service — scope-priced project';return 'Recommend the right path';}
  function summaryText(){return ['HIGHWAY 38 REQUEST SUMMARY',`Result needed: ${selectedText('outcome')||'Owner review required'}`,`Selected offer: ${selectedPathLabel()}`,`Name: ${fieldValue('name')}`,`Email: ${fieldValue('email')}`,`Phone: ${fieldValue('phone')}`,`Preferred contact: ${selectedText('contact')}`,`Current problem: ${fieldValue('problem')}`,`Finished result: ${fieldValue('desired')}`,`Timing: ${selectedText('timing')}`,`Project / implementation budget: ${selectedText('budget')}`,`Files or links: ${fieldValue('files')}`,`Details and constraints: ${fieldValue('details')}`,'',isCustomDigital()?'Custom Digital Services are quoted after the requested result, users, data, integrations, deployment, third-party requirements, and acceptance criteria are reviewed.':pricing.aiPolicy,'Submitting creates a secure request for owner review. It creates no charge, subscription, purchase, payment, quote send, work start, deployment, or other automatic external action.'].join('\n');}
  function refreshSummary(){const text=summaryText();if(summary)summary.textContent=text;if(copy){copy.hidden=false;copy.dataset.summary=text;}if(email){email.href=`mailto:${encodeURIComponent('highway38solutions@gmail.com')}?subject=${encodeURIComponent('Highway 38 request')}&body=${encodeURIComponent(text)}`;}}
  function applyQuerySelection(){const query=new URLSearchParams(location.search);const requested=query.get('offer');const service=query.get('service');if(service==='custom-digital'&&outcome){outcome.value='custom-digital';offerSelect.value='';renderOfferNote();return;}if(offerById(requested)){offerSelect.value=requested;const reverse=Object.entries(outcomeDefault).find(([,id])=>id===requested);if(reverse&&outcome)outcome.value=reverse[0];}else selectOfferForOutcome(false);renderOfferNote();}
  outcome?.addEventListener('change',()=>{selectOfferForOutcome(true);refreshSummary();});
  offerSelect?.addEventListener('change',()=>{renderOfferNote();refreshSummary();});
  form.addEventListener('input',refreshSummary);form.addEventListener('change',refreshSummary);
  copy?.addEventListener('click',async()=>{const text=copy.dataset.summary||summaryText();try{await navigator.clipboard.writeText(text);copy.textContent='Copied';setTimeout(()=>{copy.textContent='Copy Summary';},1600);}catch(_){copy.hidden=true;}});
  renderOffers();installAssurance();applyQuerySelection();refreshSummary();window.H38RequestOptions={refreshSummary,selectedOffer};
})();
