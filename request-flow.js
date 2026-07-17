(function(){
  'use strict';
  const byId=id=>document.getElementById(id);
  const all=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  const form=byId('intake-form');
  if(!form)return;
  const steps=all('[data-request-step]');
  const stepButtons=all('[data-step-indicator]');
  const outcome=byId('outcome');
  const firstContinue=steps.find(step=>Number(step.dataset.requestStep)===1)?.querySelector('[data-request-next]');
  let current=1;

  function notice(message){
    const node=byId('request-flow-notice');
    if(!node)return;
    node.textContent=message||'';
    node.hidden=!message;
    if(message)node.focus();
  }
  function updateFirstContinue(){
    if(!firstContinue)return;
    const ready=Boolean(outcome&&outcome.value);
    firstContinue.disabled=!ready;
    firstContinue.setAttribute('aria-disabled',String(!ready));
  }
  function showStep(number){
    current=Math.max(1,Math.min(3,Number(number)||1));
    steps.forEach(step=>{step.hidden=Number(step.dataset.requestStep)!==current;});
    stepButtons.forEach(button=>{
      const n=Number(button.dataset.stepIndicator);
      button.classList.toggle('is-active',n===current);
      button.setAttribute('aria-current',n===current?'step':'false');
    });
    notice('');
    if(current===3)updateReview();
    const heading=steps.find(step=>Number(step.dataset.requestStep)===current)?.querySelector('h2');
    if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}
    history.replaceState(null,'',location.pathname+location.search+'#step-'+current);
    window.scrollTo({top:Math.max(0,form.getBoundingClientRect().top+window.scrollY-100),behavior:'smooth'});
  }
  function selectChoice(value){
    if(!outcome)return;
    outcome.value=value;
    outcome.dispatchEvent(new Event('change',{bubbles:true}));
    all('[data-outcome-choice]').forEach(card=>{
      const selected=card.dataset.outcomeChoice===value;
      card.classList.toggle('is-selected',selected);
      const input=card.querySelector('input');if(input)input.checked=selected;
      card.setAttribute('aria-checked',String(selected));
    });
    updateFirstContinue();
  }
  function validateStep(number){
    if(number===1){
      if(!outcome||!outcome.value){notice('Choose the result that best matches what you need.');return false;}
      return true;
    }
    if(number===2){
      const required=[byId('problem'),byId('desired')];
      const missing=required.find(node=>!String(node&&node.value||'').trim());
      if(missing){notice('Describe the current problem and the finished result you want.');missing.focus();return false;}
      return true;
    }
    const required=[byId('name'),byId('email')];
    const missing=required.find(node=>!node||!node.checkValidity());
    if(missing){notice('Enter your name and a valid email address so Highway 38 can review the request.');missing.reportValidity();return false;}
    return true;
  }
  function selectedText(id){const node=byId(id);return node&&node.selectedOptions&&node.selectedOptions[0]?node.selectedOptions[0].textContent:'';}
  function value(id){return String(byId(id)?.value||'').trim();}
  function updateReview(){
    const host=byId('request-review');if(!host)return;
    const product=selectedText('product')||'Highway 38 will recommend the smallest useful service';
    const bundle=byId('bundle')&&byId('bundle').value?selectedText('bundle'):'No bundle selected';
    const system=byId('business-system-interest')&&byId('business-system-interest').value?selectedText('business-system-interest'):'No larger system selected';
    const files=value('files')||'No files or links listed yet; Highway 38 will identify anything needed during review.';
    const summary=[value('problem'),value('desired')].filter(Boolean).join('\n\n');
    host.innerHTML='<dl>'+ 
      '<dt>Selected outcome</dt><dd>'+escapeHtml(selectedText('outcome'))+'</dd>'+ 
      '<dt>Customer summary</dt><dd>'+escapeHtml(summary||'Not entered')+'</dd>'+ 
      '<dt>Files expected</dt><dd>'+escapeHtml(files)+'</dd>'+ 
      '<dt>Contact information</dt><dd>'+escapeHtml([value('name'),value('email'),value('phone'),selectedText('contact')].filter(Boolean).join(' · ')||'Not entered')+'</dd>'+ 
      '<dt>Likely service</dt><dd>'+escapeHtml(product)+'</dd>'+ 
      '<dt>Bundle</dt><dd>'+escapeHtml(bundle)+'</dd>'+ 
      '<dt>Business system</dt><dd>'+escapeHtml(system)+'</dd>'+ 
      '<dt>What happens next</dt><dd>The final button opens one prepared email. Review it and press Send once. Highway 38 then reviews the request and confirms missing information, scope, price, timing, revisions, assumptions, and exclusions before any work or charge begins.</dd>'+ 
      '</dl>';
  }
  function escapeHtml(text){return String(text).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
  function openPreparedEmail(){
    const emailLink=byId('email-summary');
    const href=emailLink&&emailLink.getAttribute('href');
    const submit=byId('request-submit');
    if(!href||!/^mailto:/i.test(href)){
      if(submit){submit.disabled=false;submit.removeAttribute('aria-busy');}
      notice('The request email could not be prepared. Review the fields and try again.');
      return;
    }
    window.location.href=href;
  }

  all('[data-outcome-choice]').forEach(card=>{
    card.addEventListener('click',()=>selectChoice(card.dataset.outcomeChoice));
    card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectChoice(card.dataset.outcomeChoice);}});
  });
  all('[data-request-next]').forEach(button=>button.addEventListener('click',()=>{if(validateStep(current))showStep(current+1);}));
  all('[data-request-back]').forEach(button=>button.addEventListener('click',()=>showStep(current-1)));
  stepButtons.forEach(button=>button.addEventListener('click',()=>{const target=Number(button.dataset.stepIndicator);if(target<current||target===current||validateStep(current))showStep(target);}));
  form.addEventListener('input',()=>{if(current===3)updateReview();});
  form.addEventListener('change',()=>{updateFirstContinue();if(current===3)updateReview();});
  form.addEventListener('submit',event=>{
    if(current!==3){event.preventDefault();if(validateStep(current))showStep(current+1);return;}
    if(!validateStep(3)){event.preventDefault();return;}
    updateReview();
    const submit=byId('request-submit');
    if(submit){submit.disabled=true;submit.setAttribute('aria-busy','true');}
    // commercial.js prepares the approved mailto synchronously in its submit handler.
    // This timer runs immediately afterward and uses the same single customer action.
    setTimeout(openPreparedEmail,0);
  },true);

  const requested=location.hash.match(/step-(\d)/);showStep(requested?Number(requested[1]):1);
  if(outcome&&outcome.value)selectChoice(outcome.value);else updateFirstContinue();
})();