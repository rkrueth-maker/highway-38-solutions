(function(){
'use strict';
const BUILD='20260912-recurring-service-runtime-3';
const text=v=>String(v==null?'':v).trim();
const upper=v=>text(v).toUpperCase();
const state=()=>window.state||{};
const snapshot=()=>state()?.snapshot||{};
const rows=n=>Array.isArray(snapshot()?.[n])?snapshot()[n]:[];
const val=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const truthy=v=>v===true||['true','1','yes','on','enabled'].includes(text(v).toLowerCase());
const jid=row=>text(val(row,'Job ID','jobId','id'));
const cid=row=>text(val(row,'Customer ID','customerId'));
const sid=row=>text(val(row,'Schedule Event ID','scheduleEventId','id'));
const now=()=>new Date().toISOString();
const version=row=>Math.max(1,Number(val(row,'Record Version','recordVersion')||0)+1);
const esc=v=>typeof window.esc==='function'?window.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const setText=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
function recurring(job){return !!job&&(truthy(val(job,'Subscribed Service','subscribedService'))||truthy(val(job,'Recurring Service Visit','recurringServiceVisit'))||upper(val(job,'Lifecycle Mode','lifecycleMode'))==='RECURRING SERVICE');}
function active(job){return recurring(job)&&!/COMPLETE|CLOSED|CANCEL|VOID|ARCHIV|DELET/.test(upper(val(job,'Status','status')));}
function jobById(id){return rows('jobs').find(row=>jid(row)===text(id));}
function customerById(id){return rows('customers').find(row=>text(val(row,'Customer ID','customerId','id'))===text(id))||null;}
function customerName(job){const customer=customerById(cid(job));return text(val(customer,'Customer Name','name'))||text(val(job,'Customer Name','customerName'))||'Customer';}
function financialAllowed(){const user=snapshot()?.user;return !!(user?.owner||user?.permissions?.all||user?.permissions?.manageFinancial||user?.permissions?.viewFinancial);}
function rateLines(job){
  const customer=customerById(cid(job));
  const out=[];
  const add=v=>{const s=text(v);if(s&&!out.includes(s))out.push(s);};
  const arrays=[val(job,'active_rates','Active Rates'),val(customer,'active_rates','Active Rates')];
  for(const item of arrays){if(Array.isArray(item))item.forEach(add);else if(item&&typeof item==='string'&&item.includes('|'))item.split('|').forEach(add);}
  for(const item of [val(job,'Service Rate','serviceRate'),val(job,'Plowing Rate'),val(job,'Rate'),val(customer,'Plowing Rate'),val(customer,'Rate'),val(customer,'Service Rate')])add(item);
  return out.slice(0,4);
}
function actionSignature(job){return [jid(job),upper(val(job,'Status','status')),financialAllowed()?'finance':'no-finance'].join('|');}
function workSignature(job){return [actionSignature(job),text(val(job,'Service Type')),customerName(job),rateLines(job).join('~')].join('|');}
async function save(collection,type,id,record,idKeys){if(typeof window.queueOperation!=='function')throw new Error('Secure save queue is unavailable.');return window.queueOperation('SAVE_ENTITY',type,id,{entity:collection,record},{collection,record,idKeys},true);}
async function setVisitState(job,mode){
  if(!recurring(job))throw new Error('This is not a recurring service visit.');
  const id=jid(job),start=mode==='start',finish=mode==='finish',remove=mode==='remove';
  if(!id||(!start&&!finish&&!remove))throw new Error('Recurring service action is unavailable.');
  const record={...job,'Lifecycle Mode':'Recurring service','Recurring Service Visit':true,'Site Visit Required':false,'Quote Required':false,'Updated Time':now(),'Record Version':version(job)};
  if(start){record.Status='In Progress';record['Started Time']=now();record['Recurring Service Started']=true;record['Removed From Work List']=false;}
  if(finish){record.Status='Complete';record['Completed Time']=now();record['Recurring Service Completed']=true;record['Removed From Work List']=false;}
  if(remove){record.Status='Cancelled';record['Cancelled Time']=now();record['Removed From Work List']=true;record['Deletion Mode']='Soft delete — audit retained';}
  delete record.__localPending;
  await save('jobs','Job',id,record,['Job ID']);
  for(const schedule of rows('scheduleEvents').filter(row=>text(val(row,'Job ID','jobId','Related Record ID','relatedRecordId'))===id)){
    const id2=sid(schedule);if(!id2)continue;
    const updated={...schedule,'Status':start?'In Progress':finish?'Complete':'Cancelled','Updated Time':now(),'Record Version':version(schedule)};delete updated.__localPending;
    await save('scheduleEvents','Schedule Event',id2,updated,['Schedule Event ID']);
  }
  window.toast?.(start?'Recurring service started.':finish?'Recurring service finished.':'Recurring service visit removed from the active work list.');
  window.renderToday?.();window.renderWork?.();
  window.dispatchEvent(new CustomEvent('h38:recurring-service-state-changed',{detail:{jobId:id,mode}}));
}
function selectWork(job){
  window.openPage?.('work');
  setTimeout(()=>{const select=document.getElementById('h38LifecycleJob');if(select&&jid(job)){select.value=jid(job);select.dispatchEvent(new Event('change',{bubbles:true}));window.renderWork?.();select.scrollIntoView?.({block:'center'});}},80);
}
function openCustomer(job,billing=false){
  const customerId=cid(job);if(!customerId){window.toast?.('This service visit has no linked customer.',true);return;}
  if(window.H38_CUSTOMER_360)window.H38_CUSTOMER_360.selectedCustomerId=customerId;
  window.openPage?.('customers');
  setTimeout(()=>{
    if(window.H38_CUSTOMER_360)window.H38_CUSTOMER_360.selectedCustomerId=customerId;
    window.renderCustomers?.();
    if(!billing)return;
    setTimeout(()=>{const form=document.querySelector('[data-h38-customer-invoice]');if(!form){window.toast?.('Customer billing is not available for this account.',true);return;}form.scrollIntoView?.({block:'center'});const input=form.querySelector('[name="service"],input,select,textarea');input?.focus?.();window.toast?.('Billing opened. Review rates and create a draft when ready.');},80);
  },80);
}
function buttons(job){
  const wrap=document.createElement('div');wrap.className='h38-recurring-row-actions';wrap.dataset.h38RecurringActions=jid(job);wrap.dataset.signature=actionSignature(job);
  const inProgress=/IN[ _-]?PROGRESS|STARTED|ACTIVE/.test(upper(val(job,'Status','status')));
  wrap.innerHTML=`${inProgress?'<button type="button" class="primary" data-h38-recurring-finish>Finish visit</button>':'<button type="button" class="primary" data-h38-recurring-start>Start visit</button>'}<button type="button" class="secondary" data-h38-recurring-work>Open work</button>${financialAllowed()?'<button type="button" class="secondary" data-h38-recurring-billing>Billing</button>':''}<button type="button" class="secondary" data-h38-recurring-delete>Remove visit</button>`;
  const run=(mode,e)=>{e.stopPropagation();setVisitState(job,mode).catch(err=>window.toast?.(err.message||String(err),true));};
  wrap.querySelector('[data-h38-recurring-start]')?.addEventListener('click',e=>run('start',e));
  wrap.querySelector('[data-h38-recurring-finish]')?.addEventListener('click',e=>run('finish',e));
  wrap.querySelector('[data-h38-recurring-delete]')?.addEventListener('click',e=>run('remove',e));
  wrap.querySelector('[data-h38-recurring-work]')?.addEventListener('click',e=>{e.stopPropagation();selectWork(job);});
  wrap.querySelector('[data-h38-recurring-billing]')?.addEventListener('click',e=>{e.stopPropagation();openCustomer(job,true);});
  return wrap;
}
function patchToday(){
  document.querySelectorAll('.h38-life-today [data-life-job]').forEach(node=>{
    const job=jobById(node.dataset.lifeJob);if(!recurring(job))return;
    const stage=node.querySelector('.h38-life-stage'),detail=node.querySelector('small');
    setText(stage,/IN[ _-]?PROGRESS|STARTED|ACTIVE/.test(upper(val(job,'Status','status')))?'Recurring service · in progress':'Recurring service');
    setText(detail,'No site visit or quote required. Start the visit, finish it when work is done, then review customer billing.');
    const next=node.nextElementSibling,sig=actionSignature(job);
    if(next?.dataset?.h38RecurringActions===jid(job)){if(next.dataset.signature===sig)return;next.replaceWith(buttons(job));return;}
    node.insertAdjacentElement('afterend',buttons(job));
  });
}
function patchWork(){
  const panel=document.querySelector('.h38-life-work'),select=document.getElementById('h38LifecycleJob');if(!panel||!select)return;
  const job=jobById(select.value),prior=panel.querySelector('[data-h38-recurring-simple]');panel.classList.toggle('h38-recurring-simple',recurring(job));
  if(!recurring(job)){prior?.remove();return;}
  const desc=panel.querySelector('.h38-life-head p');setText(desc,'Recurring service visit · no site visit or quote required.');
  const sig=workSignature(job);if(prior?.dataset?.signature===sig)return;prior?.remove();
  const rates=rateLines(job),box=document.createElement('div');box.className='h38-recurring-service-simple';box.dataset.h38RecurringSimple='1';box.dataset.signature=sig;
  box.innerHTML=`<div><span class="h38-service-status">${esc(text(val(job,'Status'))||'Scheduled')}</span><strong>${esc(text(val(job,'Service Type'))||'Recurring service')}</strong><small>${esc(customerName(job))}</small>${rates.length?`<div class="h38-service-rate-lines">${rates.map(rate=>`<span>${esc(rate)}</span>`).join('')}</div>`:'<small>Saved customer rate</small>'}<p>Use Start visit when work begins. Finish visit closes this service visit. Billing opens Customer 360 without creating or sending an invoice automatically.</p></div>`;
  box.appendChild(buttons(job));panel.querySelector('.h38-life-head')?.insertAdjacentElement('afterend',box);
}
function queueSignature(jobs){return `${financialAllowed()?'finance':'no-finance'}::${jobs.map(job=>[jid(job),val(job,'Status'),val(job,'Updated Time'),rateLines(job).join('~')].join('|')).join('::')}`;}
function renderQueue(){
  const existing=document.getElementById('h38RecurringServiceQueue');
  if(state()?.page!=='today'){existing?.remove();return;}
  const jobs=rows('jobs').filter(active).sort((a,b)=>{
    const ai=/IN[ _-]?PROGRESS|STARTED|ACTIVE/.test(upper(val(a,'Status','status')))?0:1,bi=/IN[ _-]?PROGRESS|STARTED|ACTIVE/.test(upper(val(b,'Status','status')))?0:1;if(ai!==bi)return ai-bi;
    return new Date(val(a,'Scheduled Time','Start Time','Created Time')||0)-new Date(val(b,'Scheduled Time','Start Time','Created Time')||0);
  }).slice(0,8);
  if(!jobs.length){existing?.remove();return;}
  const signature=queueSignature(jobs);if(existing?.dataset?.signature===signature)return;
  const section=document.createElement('section');section.id='h38RecurringServiceQueue';section.className='h38-service-queue card';section.dataset.signature=signature;
  section.innerHTML=`<div class="h38-service-queue-head"><div><span class="h38-eyebrow">SERVICE VISITS</span><h2>Ready to work</h2><p>Start, finish and move to billing without hunting through the Office.</p></div><strong>${jobs.length}</strong></div><div class="h38-service-queue-list"></div>`;
  const list=section.querySelector('.h38-service-queue-list');
  for(const job of jobs){
    const card=document.createElement('article');card.className='h38-service-queue-card';const rates=rateLines(job);
    card.innerHTML=`<div class="h38-service-queue-copy"><span class="h38-service-status">${esc(text(val(job,'Status'))||'Scheduled')}</span><h3>${esc(customerName(job))}</h3><p>${esc(text(val(job,'Service Type'))||'Recurring service')}</p>${rates.length?`<div class="h38-service-rate-lines">${rates.map(rate=>`<span>${esc(rate)}</span>`).join('')}</div>`:''}</div>`;
    card.appendChild(buttons(job));list.appendChild(card);
  }
  if(existing)existing.replaceWith(section);else{const anchor=document.getElementById('h38CustomerReadyToday')||document.querySelector('#mainContent .page-head');anchor?.insertAdjacentElement('afterend',section)||document.getElementById('mainContent')?.prepend(section);}
}
function patchApi(){
  const api=window.H38_JOB_LIFECYCLE;if(!api||api.__h38RecurringSimple)return;
  const simplify=context=>recurring(context?.job)?{...context,stage:'WORK',stageLabel:'Recurring service',next:'Start the visit, finish service, then review billing.',blockers:[],warnings:[]}:context;
  if(typeof api.analyzeJob==='function'){const fn=api.analyzeJob;api.analyzeJob=job=>simplify(fn(job));}
  if(typeof api.all==='function'){const fn=api.all;api.all=()=>fn().map(simplify);}api.__h38RecurringSimple=true;
}
let pending=false;function apply(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;try{patchApi();patchToday();patchWork();renderQueue();}catch(error){console.warn('[H38 recurring service]',error);}});}
function start(){new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('h38:office-page-rendered',apply);window.addEventListener('h38:business-snapshot-updated',apply);window.addEventListener('h38:recurring-service-state-changed',apply);apply();window.H38_RECURRING_SERVICE_RUNTIME=Object.freeze({build:BUILD,bypassesSiteVisit:true,bypassesQuote:true,startFinishRemove:true,finishRemove:true,billingHandoff:true,todayServiceQueue:true,separateSavedRates:true,auditPreservingRemoval:true,stableSignatures:true,legacyDeleteAction:'Delete',automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,automaticPayment:false,automaticScheduling:false});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
