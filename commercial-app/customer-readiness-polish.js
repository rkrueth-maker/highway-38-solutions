(function(){
'use strict';
const BUILD='20260825-customer-readiness-polish-1';
let installed=false;
const text=v=>String(v==null?'':v).trim();
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const office=()=>window.state||{};
const snapshot=()=>office().snapshot||{};
const rows=name=>Array.isArray(snapshot()[name])?snapshot()[name]:[];
const esc=v=>typeof window.esc==='function'?window.esc(v):text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const idFor=(row,...keys)=>text(value(row,...keys));
const dateValue=row=>new Date(value(row,'Updated Time','updatedAt','Created Time','createdAt','Occurred At','occurredAt','Start Time','startTime','Due Time','dueTime')||0).getTime()||0;
const latest=list=>(list||[]).slice().sort((a,b)=>dateValue(b)-dateValue(a))[0]||null;
const upper=v=>text(v).toUpperCase();
const money=v=>typeof window.money==='function'?window.money(Number(v)||0):new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(v)||0);
function activeRows(name){return rows(name).filter(row=>!/CANCEL|VOID|ARCHIV|DELET/.test(upper(value(row,'Status','status'))));}
function customerName(id){const row=rows('customers').find(x=>idFor(x,'Customer ID','customerId','id')===text(id));return text(value(row,'Customer Name','name'))||'Customer';}
function openPage(page){if(typeof window.openPage==='function')window.openPage(page);}
function selectedCustomerId(){return text(window.H38_CUSTOMER_360?.selectedCustomerId||'');}
function startQuote(customerId=''){
  const s=office();s.quote={quoteId:'',lines:[],customerId:text(customerId),hydrationComplete:true};openPage('quotes');
}
function startSite(customerId=''){
  if(window.H38_FIELD_VISIT?.open){window.H38_FIELD_VISIT.open({customerId:text(customerId),quoteId:''});return;}
  openPage('field');
}
function startMeeting(customerId=''){
  if(window.H38_CONVERSATION_MEETING_ASSISTANT?.startMeeting){window.H38_CONVERSATION_MEETING_ASSISTANT.startMeeting({meetingType:'Customer Meeting',customerId:text(customerId)});return;}
  openPage('meetings');
}
function route(action,customerId=''){
  if(action==='customer'){openPage('customers');setTimeout(()=>document.querySelector('#mainContent input, #mainContent select, #mainContent textarea')?.focus?.(),60);return;}
  if(action==='quote'){startQuote(customerId);return;}
  if(action==='site'){startSite(customerId);return;}
  if(action==='meeting'){startMeeting(customerId);return;}
  if(action==='job'){openPage('work');return;}
  if(action==='expense'||action==='invoice'){openPage('money');return;}
  if(action==='assistant'){document.getElementById('globalAiButton')?.click();return;}
}
function quickDialog(){
  let dialog=document.getElementById('h38QuickCreateDialog');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='h38QuickCreateDialog';dialog.className='h38-quick-create-dialog';
  dialog.innerHTML=`<form method="dialog"><div class="h38-quick-head"><div><small>CREATE</small><h2>What are you working on?</h2><p>Start from the customer or task. H38 prepares work but does not approve, send, schedule, purchase, or move money automatically.</p></div><button value="cancel" class="icon-button" aria-label="Close">×</button></div><div class="h38-quick-grid"><button type="button" data-h38-quick="customer"><span>👤</span><strong>Customer</strong><small>Add or open customer setup</small></button><button type="button" data-h38-quick="quote"><span>🧾</span><strong>Quote</strong><small>Start an editable draft</small></button><button type="button" data-h38-quick="site"><span>📍</span><strong>Site Visit</strong><small>Capture field evidence</small></button><button type="button" data-h38-quick="meeting"><span>🗣️</span><strong>Meeting</strong><small>Record or type the conversation</small></button><button type="button" data-h38-quick="job"><span>🧰</span><strong>Job</strong><small>Open active work</small></button><button type="button" data-h38-quick="expense"><span>🧮</span><strong>Expense</strong><small>Open job costs</small></button><button type="button" data-h38-quick="invoice"><span>💵</span><strong>Invoice</strong><small>Open customer billing</small></button><button type="button" data-h38-quick="assistant"><span>✨</span><strong>Ask H38</strong><small>Find or prepare anything</small></button></div></form>`;
  dialog.querySelectorAll('[data-h38-quick]').forEach(button=>button.onclick=()=>{dialog.close();route(button.dataset.h38Quick);});
  document.body.appendChild(dialog);return dialog;
}
function ensureQuickCreate(){
  const actions=document.querySelector('.top-actions');if(!actions||document.getElementById('h38NewActionButton'))return;
  const button=document.createElement('button');button.type='button';button.id='h38NewActionButton';button.className='h38-new-action';button.innerHTML='<span>＋</span><strong>New</strong>';button.setAttribute('aria-label','Create new customer work');button.onclick=()=>quickDialog().showModal();
  actions.insertBefore(button,actions.querySelector('#globalAiButton')||actions.firstChild);
}
function attentionMetrics(){
  const now=Date.now();
  const followUps=activeRows('followUps').filter(row=>{const status=upper(value(row,'Status','status'));if(/DONE|COMPLETE|CLOSED/.test(status))return false;const raw=value(row,'Due Time','dueTime','Due Date','dueDate');const when=new Date(raw||0).getTime();return !when||when<=now+86400000;});
  const quotes=activeRows('quotes').filter(row=>/DRAFT|REVIEW|PRESENT|SENT|WAIT|PENDING/.test(upper(value(row,'Status','status')||'DRAFT')));
  const jobs=activeRows('jobs').filter(row=>!/COMPLETE|CLOSED|PAID/.test(upper(value(row,'Status','status'))));
  const invoices=activeRows('invoices').filter(row=>!/PAID|VOID|CLOSED/.test(upper(value(row,'Status','status')))||Number(value(row,'Balance Due','balanceDue','Amount Due','amountDue'))>0);
  const schedule=activeRows('scheduleEvents').filter(row=>{const t=new Date(value(row,'Start Time','startTime','Scheduled Time','scheduledAt')||0).getTime();return t>=now&&t<=now+7*86400000;});
  return{followUps,quotes,jobs,invoices,schedule};
}
function latestActivity(limit=5){
  const collections=['followUps','quotes','jobs','siteCaptureSessions','meetings','invoices','documents'];const out=[];
  for(const collection of collections)for(const row of rows(collection)){const time=dateValue(row);if(!time)continue;out.push({collection,row,time});}
  return out.sort((a,b)=>b.time-a.time).slice(0,limit);
}
function activityLabel(item){
  const labels={followUps:'Follow-up',quotes:'Quote',jobs:'Job',siteCaptureSessions:'Site visit',meetings:'Meeting',invoices:'Invoice',documents:'File'};
  const row=item.row,title=text(value(row,'Project Title','Title','Subject','Task Title','Quote Number','Invoice Number','File Name','Meeting Type'))||labels[item.collection];
  const cid=text(value(row,'Customer ID','customerId'));return`${labels[item.collection]} · ${cid?customerName(cid):title}${title&&cid?` — ${title}`:''}`;
}
function assistantPrompt(command){
  document.getElementById('globalAiButton')?.click();setTimeout(()=>{const input=document.querySelector('#paCommandForm [name="command"]');if(input){input.value=command;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}},80);
}
function enhanceToday(){
  if(office().page!=='today')return;const main=document.getElementById('mainContent');if(!main)return;
  const old=document.getElementById('h38CustomerReadyToday');old?.remove();const m=attentionMetrics(),recent=latestActivity();
  const section=document.createElement('section');section.id='h38CustomerReadyToday';section.className='h38-ready-today';
  section.innerHTML=`<div class="h38-ready-hero"><div><span class="h38-eyebrow">BUSINESS OFFICE</span><h1>What needs attention today?</h1><p>Customer work first. Open the next action without hunting through the whole office.</p></div><div class="h38-ready-hero-actions"><button type="button" class="primary" data-h38-ready-action="customer">Find customer</button><button type="button" class="secondary" data-h38-ready-action="assistant">Ask H38</button></div></div><div class="h38-ready-metrics"><button type="button" data-h38-ready-page="work"><strong>${m.jobs.length}</strong><span>Active jobs</span></button><button type="button" data-h38-ready-page="quotes"><strong>${m.quotes.length}</strong><span>Quotes to review</span></button><button type="button" data-h38-ready-page="today"><strong>${m.followUps.length}</strong><span>Follow-ups</span></button><button type="button" data-h38-ready-page="schedule"><strong>${m.schedule.length}</strong><span>Next 7 days</span></button><button type="button" data-h38-ready-page="money"><strong>${m.invoices.length}</strong><span>Open billing</span></button></div><div class="h38-ready-columns"><section class="card"><div class="h38-ready-section-head"><div><span class="h38-eyebrow">RECENT</span><h2>Customer activity</h2></div><button type="button" class="link" data-h38-ready-page="customers">Customers</button></div><div class="h38-ready-activity">${recent.length?recent.map(item=>`<div><span>${esc(activityLabel(item))}</span><small>${new Date(item.time).toLocaleString()}</small></div>`).join(''):'<div class="h38-ready-empty"><strong>Nothing new yet.</strong><span>New customer work will appear here.</span></div>'}</div></section><section class="card"><span class="h38-eyebrow">ASK BUSINESS OFFICE</span><h2>Use normal language</h2><p class="muted">H38 can find context and prepare work without taking customer or financial action on its own.</p><div class="h38-ready-prompts"><button type="button" data-h38-prompt="What am I waiting on today?">What am I waiting on today?</button><button type="button" data-h38-prompt="Show quotes that need follow-up">Show quotes that need follow-up</button><button type="button" data-h38-prompt="Find customer on Highway 38">Find customer on Highway 38</button><button type="button" data-h38-prompt="What measurements are missing from the current quote?">What measurements are missing?</button></div></section></div><div class="h38-owner-control-strip"><strong>Owner control</strong><span>AI can organize and prepare. Approval, sending, scheduling, purchasing, payments, and commitments remain intentional owner actions.</span></div>`;
  const pageHead=main.querySelector('.page-head');pageHead?.insertAdjacentElement('afterend',section)||main.prepend(section);
  section.querySelectorAll('[data-h38-ready-page]').forEach(button=>button.onclick=()=>openPage(button.dataset.h38ReadyPage));
  section.querySelectorAll('[data-h38-ready-action]').forEach(button=>button.onclick=()=>route(button.dataset.h38ReadyAction));
  section.querySelectorAll('[data-h38-prompt]').forEach(button=>button.onclick=()=>assistantPrompt(button.dataset.h38Prompt));
}
function invoiceBalance(list){return(list||[]).reduce((sum,row)=>{const direct=Number(value(row,'Balance Due','balanceDue','Amount Due','amountDue'));if(Number.isFinite(direct)&&direct)return sum+direct;const status=upper(value(row,'Status','status'));if(/PAID|VOID/.test(status))return sum;const total=Number(value(row,'Total','total','Amount','amount'))||0,paid=Number(value(row,'Amount Paid','amountPaid','Paid','paid'))||0;return sum+Math.max(0,total-paid);},0);}
function nextCustomerAction(bundle){
  const groups=bundle?.groups||{},follow=activeRowsFor(groups.followUps).find(row=>!/DONE|COMPLETE|CLOSED/.test(upper(value(row,'Status','status'))));if(follow)return{text:'Follow up',detail:text(value(follow,'Title','Subject','Description'))||'Customer follow-up is open',action:'meeting'};
  const quote=latest(groups.quotes||[]);if(quote&&!/ACCEPT|DECLIN|VOID|EXPIRE/.test(upper(value(quote,'Status','status'))))return{text:'Review quote',detail:`${text(value(quote,'Project Title','Quote Number'))||'Quote'} · ${text(value(quote,'Status','status'))||'Draft'}`,action:'quote'};
  const job=latest(groups.jobs||[]);if(job&&!/COMPLETE|CLOSED/.test(upper(value(job,'Status','status'))))return{text:'Open active job',detail:`${text(value(job,'Project Title','Job Number'))||'Job'} · ${text(value(job,'Status','status'))}`,action:'job'};
  return{text:'Start next work',detail:'No urgent customer action is open.',action:'quote'};
}
function activeRowsFor(list){return(list||[]).filter(row=>!/CANCEL|VOID|ARCHIV|DELET/.test(upper(value(row,'Status','status'))));}
function enhanceCustomer360(){
  if(office().page!=='customers')return;const c360=window.H38_CUSTOMER_360,grid=document.querySelector('.h38-c360-grid');if(!c360?.customerBundle||!grid)return;
  const existing=document.getElementById('h38CustomerReadyHero');existing?.remove();const cid=selectedCustomerId();if(!cid)return;const bundle=c360.customerBundle(snapshot(),cid);if(!bundle?.customer)return;const groups=bundle.groups||{};
  const action=nextCustomerAction(bundle),job=latest(groups.jobs||[]),visit=latest(groups.siteCaptureSessions||[]),meeting=latest(groups.meetings||[]),balance=invoiceBalance(groups.invoices||[]);
  const hero=document.createElement('section');hero.id='h38CustomerReadyHero';hero.className='h38-customer-ready-hero card';
  hero.innerHTML=`<div class="h38-customer-ready-head"><div><span class="h38-eyebrow">CUSTOMER 360</span><h2>${esc(value(bundle.customer,'Customer Name','name')||'Customer')}</h2><p>${esc(value((groups.properties||[])[0],'Address','address')||'Customer history, property, work, conversations and billing in one place.')}</p></div><div class="h38-customer-ready-actions"><button type="button" class="primary" data-h38-customer-action="${esc(action.action)}">${esc(action.text)}</button><button type="button" class="secondary" data-h38-customer-action="site">Site visit</button><button type="button" class="secondary" data-h38-customer-action="meeting">Meeting</button></div></div><div class="h38-customer-ready-cards"><article><small>Next action</small><strong>${esc(action.text)}</strong><span>${esc(action.detail)}</span></article><article><small>Active work</small><strong>${esc(job?value(job,'Project Title','Job Number'):'No active job')}</strong><span>${esc(job?value(job,'Status','status'):'Ready for new work')}</span></article><article><small>Last site visit</small><strong>${esc(visit?value(visit,'Project Title','Site Visit ID','Capture Session ID'):'No visit yet')}</strong><span>${visit?new Date(dateValue(visit)).toLocaleDateString():'Start one when field evidence is needed'}</span></article><article><small>Last conversation</small><strong>${esc(meeting?value(meeting,'Title','Meeting Type'):'No conversation saved')}</strong><span>${meeting?new Date(dateValue(meeting)).toLocaleDateString():'Typed notes and recollections are supported'}</span></article><article><small>Customer balance</small><strong>${money(balance)}</strong><span>${balance>0?'Open customer billing':'Nothing currently due'}</span></article></div>`;
  grid.prepend(hero);hero.querySelectorAll('[data-h38-customer-action]').forEach(button=>button.onclick=()=>route(button.dataset.h38CustomerAction,cid));
}
function visitCounts(v){
  const arrays=keys=>keys.reduce((n,k)=>n+(Array.isArray(v?.[k])?v[k].length:0),0);
  const photos=arrays(['photos','photoAttachmentIds','detailPhotoIds','manualDetailPhotos']);
  const walkthroughs=arrays(['videoAttachmentIds','walkthroughs']);
  const measurements=arrays(['measurements','spokenMeasurements','manualMeasurements']);
  const missing=arrays(['missingMeasurements','unknowns','questionsToAsk']);return{photos,walkthroughs,measurements,missing};
}
function enhanceVisitDock(){
  const v=window.H38_FIELD_VISIT_CORE?.state?.visit||window.H38_FIELD_VISIT?.state?.visit;let card=document.getElementById('h38CustomerReadyVisitSummary');if(!v){card?.remove();return;}const dock=document.getElementById('h38MeetingVisitDock');if(!dock)return;
  const c=visitCounts(v),fingerprint=[text(v.sessionId||v.visitId),c.photos,c.walkthroughs,c.measurements,c.missing].join(':');if(card?.dataset.fp===fingerprint)return;if(!card){card=document.createElement('section');card.id='h38CustomerReadyVisitSummary';card.className='h38-visit-ready-summary';dock.insertAdjacentElement('beforebegin',card);}card.dataset.fp=fingerprint;
  card.innerHTML=`<div><span class="h38-eyebrow">SITE VISIT</span><strong>${esc(v.projectTitle||'Capture summary')}</strong></div><div class="h38-visit-ready-counts"><span><b>${c.photos}</b> photos</span><span><b>${c.walkthroughs}</b> walkthroughs</span><span><b>${c.measurements}</b> measurements</span><span class="${c.missing?'warn':''}"><b>${c.missing}</b> open questions</span></div>`;
}
function polishEmptyStates(){
  const main=document.getElementById('mainContent');if(!main)return;main.querySelectorAll('.empty,.muted').forEach(node=>{const t=text(node.textContent);if(!t)return;if(/^No records\.?$/i.test(t))node.textContent='Nothing here yet. New work will appear when it is created.';if(/^No data\.?$/i.test(t))node.textContent='Nothing to show yet.';});
}
function wrapRenderer(name,enhancer){const current=window[name];if(typeof current!=='function'||current.__h38CustomerReadiness)return;const previous=current;const wrapped=function(){const result=previous.apply(this,arguments);setTimeout(()=>{enhancer();polishEmptyStates();},0);return result;};wrapped.__h38CustomerReadiness=true;wrapped.__h38CustomerReadinessBase=previous;window[name]=wrapped;}
function install(){
  if(installed||!window.state||!document.getElementById('mainContent'))return false;installed=true;ensureQuickCreate();wrapRenderer('renderToday',enhanceToday);wrapRenderer('renderCustomers',enhanceCustomer360);
  const open=window.openPage;if(typeof open==='function'&&!open.__h38CustomerReadiness){const previous=open;const wrapped=function(page){const result=previous.apply(this,arguments);setTimeout(()=>{ensureQuickCreate();if(page==='today')enhanceToday();if(page==='customers')enhanceCustomer360();polishEmptyStates();},40);return result;};wrapped.__h38CustomerReadiness=true;wrapped.__h38CustomerReadinessBase=previous;window.openPage=wrapped;}
  window.addEventListener('h38:business-snapshot-updated',()=>{if(office().page==='today')enhanceToday();if(office().page==='customers')enhanceCustomer360();});
  setInterval(()=>{ensureQuickCreate();enhanceVisitDock();},900);
  if(office().page==='today')setTimeout(enhanceToday,0);if(office().page==='customers')setTimeout(enhanceCustomer360,0);
  window.H38_CUSTOMER_READINESS_POLISH=Object.freeze({build:BUILD,customerFirst:true,universalNew:true,todayCommandCenter:true,customerSummary:true,siteVisitSummary:true,assistantPromptExamples:true,ownerControlPreserved:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,automaticPayment:false,automaticScheduling:false});
  window.dispatchEvent(new CustomEvent('h38:customer-readiness-polish-ready',{detail:{build:BUILD}}));return true;
}
let attempts=0;const timer=setInterval(()=>{if(install()||++attempts>80)clearInterval(timer);},100);install();
})();
