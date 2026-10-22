/* ---- H38 Flow Helpers (2026-10-10) ----
 * Phase 2 → Phase 3 shared building blocks for the Office flow redesign.
 * Implements the Phase 2 pattern helpers so each workflow rebuild reuses
 * the same components instead of inventing its own:
 *
 * - H38Flow.showNextStep  → Pattern 1 post-save panel (what happened + next + one-tap actions)
 * - H38Flow.ask            → Pattern 3 confirmation-needed outcome (non-blocking question panel)
 * - H38Flow.confirm        → Pattern 3 blocking confirm for status transitions (modal dialog)
 * - H38Flow.fail           → Pattern 3 failure panel (what failed + why + fix actions)
 * - H38Flow.inlineAdder    → Pattern 2 inline tier (M7 model: inline input + Save, Enter support)
 * - H38Flow.startQuoteForCustomer → Pattern 2 deep-link tier (M6 model: context + openPage + toast)
 * - H38Flow.startInvoiceFromJob   → Pattern 2 deep-link tier (M6 model: job → prefilled invoice draft)
 * - H38Flow.pushStatusHistory / formatStatusHistory → Pattern 4 status history log
 * - H38Flow.openCustomerSetup     → open the customer/property setup dialog with context
 *
 * Rules:
 * - AI assists, never gates: no AI calls anywhere in this file.
 * - Mobile-first: touch targets ≥44px, no horizontal scroll at 390px.
 * - Offline: helpers never require network; saves go through queueOperation.
 * - Copy voice (Pattern 5): lead with what happened, concrete nouns, no exclamation marks.
 */
(function(){
'use strict';
const BUILD='20261021-cobrand-1';
const STYLE_ID='h38FlowHelpersStyle';
const text=v=>String(v==null?'':v).trim();
const esc=v=>typeof window.esc==='function'?window.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const h38Val=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return '';};
const h38Rid=(row,...keys)=>text(h38Val(row,...keys));
const h38Num=value=>{const n=Number(value||0);return Number.isFinite(n)?n:0;};
const h38Now=()=>new Date().toISOString();

function installStyle(){
  if(document.getElementById(STYLE_ID))return;
  const s=document.createElement('style');
  s.id=STYLE_ID;
  s.textContent=[
    '.h38-flow-panel{border:1px solid var(--border,#d6dde3);border-radius:14px;padding:14px;display:grid;gap:10px;background:#fff;margin-bottom:12px}',
    '.h38-flow-panel h3{margin:0;font-size:1.05rem}',
    '.h38-flow-panel .h38-flow-next{margin:0}',
    '.h38-flow-panel .h38-flow-offline{display:inline-block;font-size:.85rem;background:rgba(0,0,0,.05);border-radius:8px;padding:4px 10px}',
    '.h38-flow-panel .row-actions,.h38-flow-panel .h38-flow-actions{display:flex;gap:8px;flex-wrap:wrap}',
    '.h38-flow-panel button{min-height:44px}',
    '.h38-flow-panel .h38-flow-dismiss{justify-self:start}',
    '.h38-flow-panel-warning{border-color:#d9a441;background:#fffaf0}',
    '.h38-flow-guide-steps{display:grid;gap:6px;margin-top:4px}',
    '.h38-flow-guide-step{display:flex;gap:8px;align-items:flex-start;font-size:.92rem}',
    '.h38-flow-guide-step .h38-flow-guide-check{font-weight:800;min-width:1.2em}',
    '.h38-flow-guide-step.done .h38-flow-guide-check{color:#1a7f37}',
    '.h38-inline-adder{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
    '.h38-inline-adder input,.h38-inline-adder select{min-height:44px;font-size:1rem;border:1px solid var(--border,#d6dde3);border-radius:9px;padding:6px 10px}',
    '.h38-inline-adder button{min-height:44px}',
    '.h38-inline-slot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:2px 0}',
    '.h38-c360-inline-slot .muted,.h38-inline-slot .muted{font-size:.85rem}',
    '.h38-c360-status-line{display:flex;gap:8px;align-items:center;margin:6px 0 4px}',
    '.h38-c360-status-line .pill{font-size:.75rem}',
    '.h38-flash{outline:2px solid #1d6fbf;outline-offset:2px;border-radius:8px}'
  ].join('\n');
  document.head.appendChild(s);
}

function panelRoot(){
  const main=document.getElementById('mainContent');
  if(!main)return null;
  const head=main.querySelector('.h38-screen-head, .page-head');
  return{main,anchor:head};
}

/* Remove any earlier panel with the same id so renders never stack. */
function clearPanel(id){
  document.querySelectorAll('#'+CSS.escape(id)).forEach(node=>node.remove());
}

/* Build the action buttons for a panel. Every button always produces one
 * of the three Pattern 3 outcomes (its handler is responsible). */
function actionButtons(actions){
  return(actions||[]).map((action,index)=>{
    const cls=action.primary?'':' secondary';
    return `<button type="button" class="${cls}" data-h38-flow-action="${index}">${esc(action.label)}</button>`;
  }).join('');
}

function wireActions(panel,actions){
  (actions||[]).forEach((action,index)=>{
    const button=panel.querySelector(`[data-h38-flow-action="${index}"]`);
    if(!button)return;
    button.addEventListener('click',()=>{
      try{
        const result=action.handler&&action.handler();
        if(result&&typeof result.catch==='function')result.catch(error=>window.toast?.(error?.message||String(error),true));
      }catch(error){window.toast?.(error?.message||String(error),true);}
    });
  });
  const dismiss=panel.querySelector('[data-h38-flow-dismiss]');
  if(dismiss)dismiss.addEventListener('click',()=>panel.remove());
}

/* Pattern 1: post-save panel. opts:
 * {title, next, offline, checklist, actions:[{label,handler,primary}], dismissLabel, id, signature} */
function showNextStep(opts){
  installStyle();
  opts=opts||{};
  const id=text(opts.id)||'h38FlowNextStep';
  const root=panelRoot();
  if(!root){window.toast?.(text(opts.title)||'Saved.',false);return null;}
  if(opts.signature){
    const same=root.main.querySelector('#'+CSS.escape(id));
    if(same&&same.dataset.h38FlowSignature===opts.signature)return same;
  }
  clearPanel(id);
  const checklist=(opts.checklist&&opts.checklist.length)?`<div class="h38-flow-guide-steps">${opts.checklist.map(step=>`<div class="h38-flow-guide-step${step.done?' done':''}"><span class="h38-flow-guide-check">${step.done?'✓':'○'}</span><span><strong>${esc(step.label)}</strong>${step.detail?`<br><span class="muted small">${esc(step.detail)}</span>`:''}</span></div>`).join('')}</div>`:'';
  const panel=document.createElement('section');
  panel.className='card h38-flow-panel';
  panel.id=id;
  if(opts.signature)panel.dataset.h38FlowSignature=opts.signature;
  panel.innerHTML=`
    <h3>${esc(text(opts.title)||'Saved.')}</h3>
    ${opts.offline?`<div><span class="h38-flow-offline">📴 Will sync when you're back online.</span></div>`:''}
    ${opts.heading?`<p class="muted small">${esc(opts.heading)}</p>`:''}
    ${checklist}
    ${opts.next?`<p class="h38-flow-next">Next: ${esc(opts.next)}</p>`:''}
    ${opts.warning?`<p class="muted small">⚠ ${esc(opts.warning)}</p>`:''}
    <div class="h38-flow-actions">${actionButtons(opts.actions)}</div>
    <button type="button" class="secondary h38-flow-dismiss" data-h38-flow-dismiss>${esc(text(opts.dismissLabel)||'Dismiss')}</button>`;
  wireActions(panel,opts.actions);
  const{main,anchor}=root;
  if(anchor&&anchor.parentNode===main)anchor.insertAdjacentElement('afterend',panel);
  else main.prepend(panel);
  panel.scrollIntoView?.({block:'nearest'});
  return panel;
}

/* Pattern 3, confirmation-needed: non-blocking question with explicit paths.
 * opts: {title, detail, actions:[{label,handler,primary}], id, signature} */
function ask(opts){
  installStyle();
  opts=opts||{};
  const id=text(opts.id)||'h38FlowAsk';
  const root=panelRoot();
  if(!root){window.toast?.(text(opts.title)||'A choice is needed.',true);return null;}
  if(opts.signature){
    const same=root.main.querySelector('#'+CSS.escape(id));
    if(same&&same.dataset.h38FlowSignature===opts.signature)return same;
  }
  clearPanel(id);
  const panel=document.createElement('section');
  panel.className='card h38-flow-panel h38-flow-panel-warning';
  panel.id=id;
  if(opts.signature)panel.dataset.h38FlowSignature=opts.signature;
  panel.innerHTML=`
    <h3>${esc(text(opts.title)||'A choice is needed.')}</h3>
    ${opts.detail?`<p class="muted small">${esc(opts.detail)}</p>`:''}
    <div class="h38-flow-actions">${actionButtons(opts.actions)}</div>
    <button type="button" class="secondary h38-flow-dismiss" data-h38-flow-dismiss>Not now</button>`;
  wireActions(panel,opts.actions);
  const{main,anchor}=root;
  if(anchor&&anchor.parentNode===main)anchor.insertAdjacentElement('afterend',panel);
  else main.prepend(panel);
  panel.scrollIntoView?.({block:'nearest'});
  return panel;
}

/* Pattern 3, failure: what failed + why + fix actions. No silent outcomes. */
function fail(opts){
  installStyle();
  opts=opts||{};
  const id=text(opts.id)||'h38FlowFail';
  const root=panelRoot();
  if(!root){window.toast?.(text(opts.what)||'That did not work.',true);return null;}
  clearPanel(id);
  const panel=document.createElement('section');
  panel.className='card h38-flow-panel h38-flow-panel-warning';
  panel.id=id;
  panel.innerHTML=`
    <h3>⚠ ${esc(text(opts.what)||'That did not work.')}</h3>
    ${opts.why?`<p class="muted small">${esc(opts.why)}</p>`:''}
    <div class="h38-flow-actions">${actionButtons(opts.fixes)}</div>
    <button type="button" class="secondary h38-flow-dismiss" data-h38-flow-dismiss>Dismiss</button>`;
  wireActions(panel,opts.fixes);
  const{main,anchor}=root;
  if(anchor&&anchor.parentNode===main)anchor.insertAdjacentElement('afterend',panel);
  else main.prepend(panel);
  panel.scrollIntoView?.({block:'nearest'});
  return panel;
}

/* Pattern 2, inline tier (M7 model): renders an inline add control inside a
 * container. Clicking the add button swaps in input + Save/Cancel with Enter
 * support. onSave(value) must return a promise; errors toast and keep the input.
 * With selectOptions, onSave receives {field, value} instead of a plain value.
 * opts: {emptyText, addLabel, inputType, placeholder, saveLabel, selectOptions:[{value,label}], validate, onSave} */
function inlineAdder(container,opts){
  installStyle();
  opts=opts||{};
  if(!container)return;
  const drawPrompt=()=>{
    container.innerHTML=`<span class="muted">${esc(opts.emptyText||'None saved.')}</span> <button type="button" class="secondary" data-inline-add>${esc(opts.addLabel||'Add')}</button>`;
    const add=container.querySelector('[data-inline-add]');
    if(add)add.addEventListener('click',drawEditor);
  };
  const drawEditor=()=>{
    const inputHtml=(opts.selectOptions&&opts.selectOptions.length)
      ?`<select data-inline-input>${opts.selectOptions.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select><input data-inline-value type="${esc(opts.inputType||'text')}" placeholder="${esc(opts.placeholder||'')}" inputmode="${esc(opts.inputType==='tel'?'tel':opts.inputType==='email'?'email':'text')}">`
      :`<input data-inline-input type="${esc(opts.inputType||'text')}" placeholder="${esc(opts.placeholder||'')}" inputmode="${esc(opts.inputType==='tel'?'tel':opts.inputType==='email'?'email':'text')}">`;
    container.innerHTML=`<span class="h38-inline-adder">${inputHtml}<button type="button" data-inline-save>${esc(opts.saveLabel||'Save')}</button><button type="button" class="secondary" data-inline-cancel>Cancel</button></span>`;
    const input=container.querySelector('[data-inline-input]'),save=container.querySelector('[data-inline-save]'),cancel=container.querySelector('[data-inline-cancel]');
    if(input&&!opts.selectOptions)input.value=text(opts.value||'');
    const doSave=async()=>{
      let value=text(input?.value||'');
      if(opts.selectOptions){
        /* Select mode: onSave receives {field, value} so the caller can save
         * to the chosen field. Plain inputs: onSave receives the value string. */
        const field=text(input?.value||'');
        const entered=text(container.querySelector('[data-inline-value]')?.value||'');
        if(!entered){window.toast?.('Enter a value before saving.',true);container.querySelector('[data-inline-value]')?.focus();return;}
        value={field,value:entered};
      }
      if(!value){
        if(opts.validate){const message=opts.validate('');if(message){window.toast?.(message,true);input?.focus();return;}}
        window.toast?.('Enter a value before saving.',true);input?.focus();return;
      }
      if(opts.validate){const message=opts.validate(value);if(message){window.toast?.(message,true);input?.focus();return;}}
      save.disabled=true;
      try{await opts.onSave(value);drawPrompt();}
      catch(error){window.toast?.(error?.message||String(error),true);save.disabled=false;input?.focus();}
    };
    if(save)save.addEventListener('click',doSave);
    if(cancel)cancel.addEventListener('click',drawPrompt);
    if(input)input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();doSave();}if(event.key==='Escape'){event.preventDefault();drawPrompt();}});
    (container.querySelector('[data-inline-value]')||input)?.focus();
  };
  drawPrompt();
}

/* Pattern 2, deep-link tier (M6 model): open quote creation with the customer
 * prefilled. Never sends the user to a blank form. */
function startQuoteForCustomer(customerId){
  const cid=text(customerId);
  if(!cid){window.toast?.('Select a customer first, then start the quote.',true);return;}
  const st=window.state||{};
  if(st.quote)st.quote.customerId=cid;
  else st.quote={quoteId:'',lines:[],customerId:cid,hydrationComplete:true};
  const opener=typeof window.openPage==='function'?window.openPage:(typeof openPage==='function'?openPage:null);
  if(!opener){window.toast?.('The customer is selected. Open Quotes to start the quote.',true);return;}
  opener('quotes');
  window.toast?.('Quote started for this customer. Review and send when you are ready — nothing sends on its own.');
}

/* Select a customer in the Customer 360 workspace (used by dedupe "use existing"). */
function selectCustomer(customerId){
  const cid=text(customerId);
  if(!cid)return;
  if(window.H38_CUSTOMER_360)window.H38_CUSTOMER_360.selectedCustomerId=cid;
  if(typeof window.renderCustomers==='function')window.renderCustomers();
}

/* Open the customer setup dialog (Customer 360 layout) or scroll to the legacy
 * forms. mode: 'customer' | 'property'. Prefills the customer when given. */
function openCustomerSetup(mode,customerId){
  installStyle();
  const cid=text(customerId||'');
  const dialog=document.querySelector('.h38-c360-setup-dialog');
  if(dialog){
    if(typeof dialog.showModal==='function'&&!dialog.open){try{dialog.showModal();}catch(_){dialog.setAttribute('open','');}}
    else dialog.setAttribute('open','');
    const focusField=form=>{
      const el=form&&(form.elements.propertyName||form.elements.address||form.elements.customerName||form.querySelector('input'));
      el?.focus?.({preventScroll:true});
    };
    if(mode==='property'){
      const form=dialog.querySelector('#propertyForm');
      const select=form?.elements.customerId;
      if(select&&cid){
        if(!Array.from(select.options||[]).some(option=>text(option.value)===cid)){
          const name=customerDisplayName(cid);
          const option=document.createElement('option');
          option.value=cid;option.textContent=name;select.appendChild(option);
        }
        select.value=cid;
        if(text(select.value)!==cid)window.toast?.('Could not preselect the customer. Pick it from the list.',true);
      }
      focusField(form);
    }else{
      const form=dialog.querySelector('#customerForm');
      if(form){
        let idInput=form.elements.customerId;
        if(!idInput){idInput=document.createElement('input');idInput.type='hidden';idInput.name='customerId';form.prepend(idInput);}
        const record=cid?customerRecord(cid):null;
        idInput.value=cid;
        if(form.elements.customerName)form.elements.customerName.value=record?customerDisplayName(cid):'';
        if(form.elements.email)form.elements.email.value=text(record&&(record.Email||record.email));
        if(form.elements.phone)form.elements.phone.value=text(record&&(record.Phone||record.phone));
        const submit=form.querySelector('button[type="submit"],button:not([type])');
        if(submit)submit.textContent=cid?'Save customer changes':'Add customer';
        const phone=form.elements.phone||form.elements.customerName;
        phone?.focus?.({preventScroll:true});
      }
    }
    return;
  }
  /* Legacy layout fallback: the forms are inline on the page. */
  const target=document.getElementById(mode==='property'?'propertyForm':'customerForm');
  if(target){
    const select=target.elements&&target.elements.customerId;
    if(select&&cid&&mode==='property'){
      if(!Array.from(select.options||[]).some(option=>text(option.value)===cid)){
        const option=document.createElement('option');option.value=cid;option.textContent=customerDisplayName(cid);select.appendChild(option);
      }
      select.value=cid;
    }
    target.scrollIntoView?.({block:'center'});
    (target.querySelector('input[name="customerName"],input[name="propertyName"],input[name="address"],input')||target)?.focus?.({preventScroll:true});
  }else{
    window.toast?.('The customer setup form is not on this screen.',true);
  }
}

function customerRecord(customerId){
  try{
    const list=(window.state&&window.state.snapshot&&window.state.snapshot.customers)||[];
    return list.find(row=>text(row['Customer ID']||row.customerId||row.id)===text(customerId))||null;
  }catch(_){return null;}
}

function customerDisplayName(customerId){
  const record=customerRecord(customerId);
  return text(record&&(record['Customer Name']||record.name))||'Customer';
}

/* Pattern 3, blocking confirmation: a modal confirm for status transitions
 * (draft→presented, draft→sent). Resolves true when the user confirms.
 * opts: {title, message, okLabel, cancelLabel}. Copies the app's existing
 * dialog confirm structure (one canonical confirm for the redesign). */
function confirmFlow(opts){
  opts=opts||{};
  return new Promise(resolve=>{
    let dialog=document.getElementById('h38FlowConfirmDialog');
    if(!dialog){
      dialog=document.createElement('dialog');
      dialog.id='h38FlowConfirmDialog';
      dialog.innerHTML='<form method="dialog"><h2 id="h38FlowConfirmTitle">Confirm</h2><p id="h38FlowConfirmMessage"></p><div class="actions"><button value="cancel" class="secondary" id="h38FlowConfirmCancel">Cancel</button><button value="ok" class="primary" id="h38FlowConfirmOk">Confirm</button></div></form>';
      document.body.appendChild(dialog);
    }
    dialog.querySelector('#h38FlowConfirmTitle').textContent=text(opts.title)||'Confirm';
    dialog.querySelector('#h38FlowConfirmMessage').textContent=text(opts.message)||'Are you sure?';
    dialog.querySelector('#h38FlowConfirmOk').textContent=text(opts.okLabel)||'Confirm';
    dialog.querySelector('#h38FlowConfirmCancel').textContent=text(opts.cancelLabel)||'Cancel';
    const onClose=()=>{dialog.removeEventListener('close',onClose);resolve(dialog.returnValue==='ok');};
    dialog.addEventListener('close',onClose);
    try{dialog.showModal();}
    catch(_){resolve(typeof window.confirm==='function'?window.confirm(text(opts.message)||'Are you sure?'):false);}
  });
}

/* Pattern 4: append a status transition to the record's Status History log.
 * Returns the JSON string to store in 'Status History'. Offline-safe: the
 * write goes through queueOperation like any other field. */
function pushStatusHistory(record,from,to){
  let history=[];
  try{const raw=record?record['Status History']:'';history=raw?JSON.parse(raw):[];}catch(_){history=[];}
  if(!Array.isArray(history))history=[];
  let by='owner';
  try{const user=window.state&&window.state.snapshot&&window.state.snapshot.user;by=text((user&&(user.email||user.userId))||'owner');}catch(_){}
  history.push({from:text(from),to:text(to),at:h38Now(),by});
  return JSON.stringify(history.slice(-20));
}

/* Compact one-line rendering of the history: "Draft → Sent · Oct 10". */
function formatStatusHistory(record){
  let history=[];
  try{history=JSON.parse((record&&record['Status History'])||'[]');}catch(_){history=[];}
  if(!Array.isArray(history)||!history.length)return '';
  const chain=[text(history[0].from),...history.map(entry=>text(entry.to))].filter(Boolean);
  let date='';
  try{const t=new Date(history[history.length-1].at);if(!isNaN(t))date=t.toLocaleDateString([],{month:'short',day:'numeric'});}catch(_){}
  return chain.join(' → ')+(date?' · '+date:'');
}

/* Pattern 2, deep-link tier (M6 model: recurring-service-runtime openBilling):
 * open the Money page with the invoice draft form prefilled from a job —
 * customer, job, description, and price from the accepted quote when one
 * exists. Never sends the user to a blank form. Works offline (local data). */
function startInvoiceFromJob(jobId){
  const jid=text(jobId);
  if(!jid){window.toast?.('Pick a job first, then create the invoice.',true);return;}
  const snap=(window.state&&window.state.snapshot)||{};
  const jobs=Array.isArray(snap.jobs)?snap.jobs:[];
  const job=jobs.find(row=>h38Rid(row,'Job ID','jobId')===jid);
  if(!job){window.toast?.('That job is not in the current business pack.',true);return;}
  const customerId=h38Rid(job,'Customer ID','customerId');
  const title=h38Val(job,'Project Title','projectTitle')||'Job';
  const quotes=Array.isArray(snap.quotes)?snap.quotes:[];
  const qid=h38Rid(job,'Quote ID','quoteId','Source Quote ID');
  let quote=qid?quotes.find(row=>h38Rid(row,'Quote ID','quoteId')===qid):null;
  if(!quote){
    const clean=value=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const cands=quotes.filter(row=>h38Rid(row,'Customer ID','customerId')===customerId&&clean(h38Val(row,'Project Title','projectTitle'))===clean(title));
    quote=cands.find(row=>/ACCEPT|APPROV/i.test(text(h38Val(row,'Status','status'))+' '+text(h38Val(row,'Customer Decision','customerDecision'))))||cands[0]||null;
  }
  const qTotal=quote?h38Num(h38Val(quote,'Total','total')):0;
  const qNum=quote?h38Val(quote,'Quote Number','quoteNumber'):'';
  window.__h38InvoicePrefill={
    jobId:jid,
    customerId,
    description:qNum?`${title} — per accepted quote ${qNum}`:title,
    quantity:1,
    unitPrice:qTotal>0?qTotal.toFixed(2):''
  };
  const opener=typeof window.openPage==='function'?window.openPage:(typeof openPage==='function'?openPage:null);
  if(!opener){window.toast?.('Open the Money page to create the invoice.',true);return;}
  opener('money');
  let tries=0;
  const ready=()=>{
    const form=document.getElementById('invoiceForm');
    if(!form){if(++tries<40)setTimeout(ready,100);else window.toast?.('The invoice draft form did not finish loading. Open Money and review the draft.',true);return;}
    const prefill=window.__h38InvoicePrefill||{};
    const fill=(name,value)=>{
      if(value===undefined||value===null||value==='')return;
      const el=form.querySelector(`[name="${name}"]`);
      if(!el)return;
      if(el.tagName==='SELECT'){
        const opt=Array.from(el.options||[]).find(o=>text(o.value)===text(value));
        if(opt){el.value=opt.value;el.dispatchEvent(new Event('change',{bubbles:true}));}
      }else el.value=value;
    };
    fill('customerId',prefill.customerId);
    fill('jobId',prefill.jobId);
    fill('description',prefill.description);
    fill('quantity',prefill.quantity);
    fill('unitPrice',prefill.unitPrice);
    delete window.__h38InvoicePrefill;
    form.scrollIntoView?.({block:'center'});
    (form.querySelector('[name="description"]')||form.querySelector('input,select,textarea,button'))?.focus?.();
    window.toast?.(qTotal>0
      ?'Invoice draft opened from the job, priced from the accepted quote. Confirm customer, price and due date before saving.'
      :'Invoice draft opened from the job. Enter the price and due date before saving.');
  };
  setTimeout(ready,120);
}

/* WS4 screen header (spec §3): title + purpose + one primary + <=2
 * secondaries + <details> More. String-returning like pageHead; actions
 * {label,id?,handler?}|{label,page}|{label,focus}; id-only actions keep
 * the renderer's own id wiring (#newQuoteButton convention). */
function headerActions(o){const l=[];if(o&&o.primary)l.push({...o.primary,primary:true});((o&&o.secondary)||[]).slice(0,2).forEach(a=>l.push({...a}));((o&&o.more)||[]).forEach(a=>l.push({...a,more:true}));try{const pa=window.H38_PERSONAL_ASSISTANT;if(pa&&typeof pa.headerMoreAction==='function'){const extra=pa.headerMoreAction(o);if(extra&&extra.label&&!l.some(a=>a&&a.label===extra.label))l.push({...extra,more:true});}}catch(_){}
  /* Resident-agent consult (Rick 2026-10-20: agents pop up in their fields
   * for help): the registered resident agent for this header's page may add
   * ONE More-menu entry — its help pop-out trigger. The hook lives here, in
   * the one place both screenHeader() and bindScreenHeader() call, so the
   * rendered indices and the bound indices can never drift apart. */
  try{const ra=window.H38_RESIDENT_AGENT;if(ra&&typeof ra.headerMoreAction==='function'){const extra=ra.headerMoreAction(o);if(extra&&extra.label&&!l.some(a=>a&&a.label===extra.label))l.push({...extra,more:true});}}catch(_){}
  return l;}
function headerSignature(o){return [text(o&&o.page),text(o&&o.purpose),text(o&&o.primary&&o.primary.label),text(o&&o.status&&o.status.label)].join('|');}
function screenHeader(o){
  o=o||{};const page=text(o.page);let title=text(o.title);
  if(!title&&page){try{const d=window.PAGE_DEFS||(typeof PAGE_DEFS!=='undefined'?PAGE_DEFS:null);if(d&&d[page])title=text(d[page][1]||d[page][0]);}catch(_){}}
  const acts=headerActions(o),btn=(a,i)=>`<button type="button" data-h38-header-action="${i}"${a.id?` id="${esc(a.id)}"`:''}${a.hidden?' hidden':''} class="${a.primary?'primary':'secondary'}${a.className?' '+esc(a.className):''}">${esc(a.label)}</button>`;
  const vis=acts.filter(a=>!a.more),more=acts.filter(a=>a.more);
  const moreHtml=more.length?`<details class="h38-screen-head__more"><summary>More actions</summary><div class="h38-screen-head__more-menu">${more.map(a=>btn(a,acts.indexOf(a))).join('')}</div></details>`:'';
  const status=o.status&&text(o.status.label)?`<span class="pill ${esc(text(o.status.kind))}">${esc(o.status.label)}</span>`:'';
  return `<header class="h38-screen-head page-head" data-h38-page="${esc(page)}" data-h38-header-signature="${esc(headerSignature(o))}"><div class="h38-screen-head__titlerow"><h1>${esc(title)}</h1>${status}</div>${o.purpose?`<p class="h38-screen-head__purpose">${esc(o.purpose)}</p>`:''}<div class="h38-screen-head__actions page-tools">${vis.map(a=>btn(a,acts.indexOf(a))).join('')}${moreHtml}</div></header>`;
}
function bindScreenHeader(root,o){
  const scope=root&&root.querySelector?root:document,header=scope.querySelector('.h38-screen-head');
  if(!header)return null;
  const acts=headerActions(o);
  header.querySelectorAll('[data-h38-header-action]').forEach(node=>{
    const a=acts[Number(node.dataset.h38HeaderAction)];
    if(!a||node.dataset.h38HeaderBound)return;
    if(typeof a.handler!=='function'&&!a.page&&!a.focus)return;
    node.dataset.h38HeaderBound='1';
    node.addEventListener('click',()=>{
      try{
        let r;
        if(typeof a.handler==='function')r=a.handler();
        else if(a.page)window.openPage?.(text(a.page));
        else if(a.focus){const t=document.querySelector(text(a.focus));if(t){t.scrollIntoView?.({behavior:'smooth',block:'center'});(t.querySelector?.('input,select,textarea,button')||t).focus?.({preventScroll:true});}}
        if(r&&typeof r.catch==='function')r.catch(e=>window.toast?.(e?.message||String(e),true));
      }catch(e){window.toast?.(e?.message||String(e),true);}
    });
  });
  return header;
}
/* Enhancer adoption: swap in the header unless an identical-signature
 * one is already there (M1 dedupe — never stack two headers). */
function renderScreenHeader(o){
  const main=document.getElementById('mainContent');if(!main)return null;
  const ex=main.querySelector('.h38-screen-head');
  if(ex&&ex.dataset.h38HeaderSignature===headerSignature(o))return ex;
  const hold=document.createElement('div');hold.innerHTML=screenHeader(o);
  const fresh=hold.firstElementChild,old=main.querySelector('.h38-screen-head, .page-head');
  if(old)old.replaceWith(fresh);else main.prepend(fresh);
  bindScreenHeader(main,o);return fresh;
}
/* Money §5.8: preselect an invoice in #paymentForm, scroll + focus the
 * amount (startInvoiceFromJob polling pattern when Money is unrendered). */
function focusPaymentForInvoice(invoiceId){
  const iid=text(invoiceId);let tries=0;
  const ready=()=>{
    const form=document.getElementById('paymentForm');
    if(!form){
      if(tries===0&&window.state&&window.state.page!=='money')window.openPage?.('money');
      if(++tries<40)setTimeout(ready,100);else window.toast?.('Open Money to record the payment.',true);
      return;
    }
    document.querySelector('[data-h38-create="paymentForm"]')?.click();
    const sel=form.querySelector('[name="invoiceId"]');let ok=false;
    if(sel&&iid){const opt=Array.from(sel.options||[]).find(x=>text(x.value)===iid);if(opt){sel.value=opt.value;ok=true;sel.dispatchEvent(new Event('change',{bubbles:true}));}}
    form.scrollIntoView?.({behavior:'smooth',block:'center'});
    (form.querySelector('[name="amount"]')||sel)?.focus?.({preventScroll:true});
    if(iid&&!ok)window.toast?.('This invoice has no open balance to pay.',true);
  };
  ready();
}

window.H38Flow=Object.freeze({
  build:BUILD,
  screenHeader,
  bindScreenHeader,
  renderScreenHeader,
  focusPaymentForInvoice,
  showNextStep,
  ask,
  confirm:confirmFlow,
  fail,
  inlineAdder,
  startQuoteForCustomer,
  startInvoiceFromJob,
  pushStatusHistory,
  formatStatusHistory,
  selectCustomer,
  openCustomerSetup
});
})();
