(function(){
'use strict';
const BUILD='20260918-business-office-workflow-polish-1';
let installed=false,layoutObserver=null,layoutOrderQueued=false,customerTab='overview';
const text=v=>String(v==null?'':v).trim();
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const office=()=>window.state||{};
const snapshot=()=>office().snapshot||{};
const signedIn=()=>!!snapshot().user;
const financial=()=>{const u=snapshot().user;return !!(u?.owner||u?.permissions?.all||u?.permissions?.manageFinancial||u?.permissions?.viewFinancial);};
const canCreate=()=>{const u=snapshot().user;return !!(u?.owner||u?.permissions?.all||Object.entries(u?.permissions||{}).some(([key,enabled])=>enabled===true&&/^(manage|capture)/.test(key)));};
function clearSignedOutPolish(){
  ['h38CustomerReadyToday','h38CustomerReadyHero','h38CustomerReadyCards','h38CustomerReadyVisitSummary','h38NewActionButton','h38QuickCreateDialog'].forEach(id=>document.getElementById(id)?.remove());
}
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
  if(action==='message'){openPage('messages');return;}
  if(action==='job'){openPage('work');return;}
  if(action==='expense'||action==='invoice'){openPage('money');return;}
  if(action==='assistant'){document.getElementById('globalAiButton')?.click();return;}
}
function quickDialog(){
  let dialog=document.getElementById('h38QuickCreateDialog');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='h38QuickCreateDialog';dialog.className='h38-quick-create-dialog';
  dialog.innerHTML=`<form method="dialog"><div class="h38-quick-head"><div><small>CREATE</small><h2>What are you working on?</h2><p>Start from the customer or task. H38 prepares work but does not approve, send, schedule, purchase, or move money automatically.</p></div><button value="cancel" class="icon-button" aria-label="Close">×</button></div><div class="h38-quick-grid"><button type="button" data-h38-quick="customer"><span>👤</span><strong>Customer</strong><small>Add or open customer setup</small></button><button type="button" data-h38-quick="quote"><span>🧾</span><strong>Quote</strong><small>Start an editable draft</small></button><button type="button" data-h38-quick="site"><span>📍</span><strong>Site Visit</strong><small>Capture field evidence</small></button><button type="button" data-h38-quick="meeting"><span>🗣️</span><strong>Meeting</strong><small>Record or type the conversation</small></button><button type="button" data-h38-quick="job"><span>🧰</span><strong>Job</strong><small>Open active work</small></button><button type="button" data-h38-quick="expense"><span>🧮</span><strong>Expense</strong><small>Open job costs</small></button><button type="button" data-h38-quick="invoice"><span>💵</span><strong>Invoice</strong><small>Open customer billing</small></button><button type="button" data-h38-quick="assistant"><span>✨</span><strong>Ask H38</strong><small>Find or prepare anything</small></button></div></form>`;
  if(!financial())dialog.querySelectorAll('[data-h38-quick="expense"],[data-h38-quick="invoice"]').forEach(node=>node.remove());
  dialog.querySelectorAll('[data-h38-quick]').forEach(button=>button.onclick=()=>{dialog.close();route(button.dataset.h38Quick);});
  document.body.appendChild(dialog);return dialog;
}
function ensureQuickCreate(){
  if(!signedIn()){clearSignedOutPolish();return;}
  if(!canCreate()){document.getElementById('h38NewActionButton')?.remove();document.getElementById('h38QuickCreateDialog')?.remove();return;}
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
  for(const collection of collections.filter(name=>name!=='invoices'||financial()))for(const row of rows(collection)){const time=dateValue(row);if(!time)continue;out.push({collection,row,time});}
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
  if(!signedIn()){clearSignedOutPolish();return;}
  if(office().page!=='today')return;const main=document.getElementById('mainContent');if(!main)return;
  document.getElementById('h38CustomerReadyToday')?.remove();
  const m=attentionMetrics(),nowMs=Date.now(),todayEnd=new Date();todayEnd.setHours(23,59,59,999);
  const schedule=m.schedule.slice().sort((a,b)=>new Date(value(a,'Start Time','startTime','Scheduled Time','scheduledAt')||0)-new Date(value(b,'Start Time','startTime','Scheduled Time','scheduledAt')||0));
  const nextEvent=schedule.find(row=>new Date(value(row,'Start Time','startTime','Scheduled Time','scheduledAt')||0).getTime()>=nowMs)||schedule[0]||null;
  const todayJobs=m.jobs.filter(row=>{const raw=value(row,'Start Date','startDate','Scheduled Date','scheduledDate','Due Date','dueDate');if(!raw)return true;const d=new Date(raw);return Number.isFinite(d.getTime())&&d.getTime()<=todayEnd.getTime();}).slice(0,6);
  const firstFollow=m.followUps[0]||null,firstQuote=m.quotes[0]||null,firstInvoice=financial()?(m.invoices[0]||null):null,firstJob=todayJobs[0]||m.jobs[0]||null;
  let primary={title:'Review today\'s work',why:'Open the work list and keep the next customer commitment moving.',page:'work',button:'Open work',customerId:''};
  if(firstFollow)primary={title:text(value(firstFollow,'Title','Subject','Description'))||'Customer follow-up',why:'This follow-up needs attention now.',page:'customers',button:'Open customer',customerId:text(value(firstFollow,'Customer ID','customerId'))};
  else if(firstQuote)primary={title:text(value(firstQuote,'Project Title','Quote Number'))||'Review quote',why:`Quote status: ${text(value(firstQuote,'Status','status'))||'Needs review'}.`,page:'quotes',button:'Review quote',customerId:text(value(firstQuote,'Customer ID','customerId'))};
  else if(firstInvoice)primary={title:text(value(firstInvoice,'Invoice Number','Title'))||'Check invoice',why:'Open billing has an item that still needs review.',page:'money',button:'Check invoice',customerId:text(value(firstInvoice,'Customer ID','customerId'))};
  else if(firstJob)primary={title:text(value(firstJob,'Project Title','Job Number'))||'Open active job',why:`${customerName(value(firstJob,'Customer ID','customerId'))} - ${text(value(firstJob,'Status','status'))||'Active work'}`,page:'work',button:'Open job',customerId:text(value(firstJob,'Customer ID','customerId'))};
  const eventJobId=text(value(nextEvent,'Related Record ID','relatedRecordId','Job ID','jobId'));
  const eventJob=eventJobId?rows('jobs').find(row=>idFor(row,'Job ID','jobId','id')===eventJobId):null;
  const eventCustomerId=text(value(nextEvent,'Customer ID','customerId')||value(eventJob,'Customer ID','customerId'));
  const eventCustomer=eventCustomerId?rows('customers').find(row=>idFor(row,'Customer ID','customerId','id')===eventCustomerId):null;
  const eventLocation=text(value(nextEvent,'Location','location','Address','address'));
  const eventPhone=text(value(eventCustomer,'Phone','phone','Mobile Phone','mobilePhone'));
  const eventTitle=text(value(nextEvent,'Title','title'))||'Scheduled work';
  const eventTime=value(nextEvent,'Start Time','startTime','Scheduled Time','scheduledAt');
  const attention=[
    ...m.followUps.slice(0,2).map(row=>({label:text(value(row,'Title','Subject','Description'))||'Follow-up',detail:'Follow-up needs attention',page:'customers',customerId:text(value(row,'Customer ID','customerId'))})),
    ...m.quotes.slice(0,2).map(row=>({label:text(value(row,'Project Title','Quote Number'))||'Quote',detail:text(value(row,'Status','status'))||'Needs review',page:'quotes',customerId:text(value(row,'Customer ID','customerId'))})),
    ...(financial()?m.invoices.slice(0,2).map(row=>({label:text(value(row,'Invoice Number','Title'))||'Invoice',detail:'Open billing item',page:'money',customerId:text(value(row,'Customer ID','customerId'))})):[])
  ].slice(0,5);
  const section=document.createElement('section');section.id='h38CustomerReadyToday';section.className='h38-ready-today h38-today-workspace';
  section.innerHTML=`<section class="h38-today-primary card"><div><span class="h38-eyebrow">NEXT ACTION</span><h2>${esc(primary.title)}</h2><p>${esc(primary.why)}</p></div><button type="button" class="primary" data-h38-ready-page="${esc(primary.page)}" data-h38-ready-customer="${esc(primary.customerId)}">${esc(primary.button)}</button></section>
  <section class="h38-today-section card"><div class="h38-ready-section-head"><div><span class="h38-eyebrow">UP NEXT</span><h2>${nextEvent?esc(eventTitle):'Nothing scheduled next'}</h2></div><button type="button" class="link" data-h38-ready-page="schedule">Schedule</button></div>${nextEvent?`<div class="h38-up-next"><strong>${esc(eventTime?new Date(eventTime).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'Time not set')}</strong><span>${esc(eventCustomerId?customerName(eventCustomerId):'Customer not linked')}</span><span>${esc(eventLocation||'Location not set')}</span><span class="pill neutral">${esc(value(nextEvent,'Status','status')||'Scheduled')}</span></div><div class="h38-context-actions">${eventPhone?`<a class="secondary" href="tel:${esc(eventPhone.replace(/[^\d+]/g,''))}">Call</a>`:''}${eventLocation?`<button type="button" class="secondary" data-h38-navigate="${esc(eventLocation)}">Navigate</button>`:''}<button type="button" class="primary" data-h38-ready-page="schedule">Open</button></div>`:'<div class="h38-ready-empty"><strong>No jobs scheduled next.</strong><span>New scheduled work will appear here.</span></div>'}</section>
  <section class="h38-today-section card"><div class="h38-ready-section-head"><div><span class="h38-eybrow">TODAY'S WORK</span><h2>Customer work</h2></div><button type="button" class="link" data-h38-ready-page="work">All work</button></div><div class="h38-today-list">${todayJobs.length?todayJobs.map(job=>`<button type="button" data-h38-ready-page="work"><strong>${esc(value(job,'Project Title','Job Number')||'Job')}</strong><span>${esc(customerName(value(job,'Customer ID','customerId'))})</span><small>${esc(value(job,'Status','status')||'Open')}</small></button>`).join(''):'<div class="h38-ready-empty"><strong>No active jobs for today.</strong><span>Scheduled or active work will appear here.</span></div>'}</div></section>
  <section class="h38-today-section card"><div class="h38-ready-section-head"><div><span class="h38-eyebrow">NEEDS ATTENTION</span><h2>Only items requiring intervention</h2></div></div><div class="h38-attention-list">${attention.length?attention.map(item=>`<button type="button" data-h38-ready-page="${esc(item.page)}" data-h38-ready-customer="${esc(item.customerId||'')}"><strong>${esc(item.label)}</strong><small>${esc(item.detail)}</small></button>`).join(''):'<div class="h38-ready-empty"><strong>Nothing urgent.</strong><span>No approval, overdue, blocked, billing, or follow-up items need intervention.</span></div>'}</div></section>`;
  const pageHead=main.querySelector('.page-head');
  if(pageHead){const title=pageHead.querySelector('h1');if(title)title.textContent='Today';let p=pageHead.querySelector('p');if(!p){p=document.createElement('p');pageHead.appendChild(p);}p.textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});pageHead.insertAdjacentElement('afterend',section);}else main.prepend(section);
  section.querySelectorAll('[data-h38-ready-page]').forEach(button=>button.onclick=()=>{const customerId=text(button.dataset.h38ReadyCustomer);if(customerId&&window.H38_CUSTOMER_360)window.H38_CUSTOMER_360.selectedCustomerId=customerId;openPage(button.dataset.h38ReadyPage);});
  section.querySelectorAll('[data-h38-navigate]').forEach(button=>button.onclick=()=>{const destination=button.dataset.h38Navigate;if(destination)window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`,'_blank','noopener');});
  window.H38_OFFICE_SCALE_WORKFLOW?.enhance?.();
}function invoiceBalance(list){return(list||[]).reduce((sum,row)=>{const direct=Number(value(row,'Balance Due','balanceDue','Amount Due','amountDue'));if(Number.isFinite(direct)&&direct)return sum+direct;const status=upper(value(row,'Status','status'));if(/PAID|VOID/.test(status))return sum;const total=Number(value(row,'Total','total','Amount','amount'))||0,paid=Number(value(row,'Amount Paid','amountPaid','Paid','paid'))||0;return sum+Math.max(0,total-paid);},0);}
function nextCustomerAction(bundle){
  const groups=bundle?.groups||{},follow=activeRowsFor(groups.followUps).find(row=>!/DONE|COMPLETE|CLOSED/.test(upper(value(row,'Status','status'))));if(follow)return{text:'Follow up',detail:text(value(follow,'Title','Subject','Description'))||'Customer follow-up is open',action:'meeting'};
  const quote=latest(groups.quotes||[]);if(quote&&!/ACCEPT|DECLIN|VOID|EXPIRE/.test(upper(value(quote,'Status','status'))))return{text:'Review quote',detail:`${text(value(quote,'Project Title','Quote Number'))||'Quote'} · ${text(value(quote,'Status','status'))||'Draft'}`,action:'quote'};
  const job=latest(groups.jobs||[]);if(job&&!/COMPLETE|CLOSED/.test(upper(value(job,'Status','status'))))return{text:'Open active job',detail:`${text(value(job,'Project Title','Job Number'))||'Job'} · ${text(value(job,'Status','status'))}`,action:'job'};
  return{text:'Start next work',detail:'No urgent customer action is open.',action:'quote'};
}
function activeRowsFor(list){return(list||[]).filter(row=>!/CANCEL|VOID|ARCHIV|DELET/.test(upper(value(row,'Status','status'))));}
function customerSectionKey(section){
  const title=text(section?.querySelector('h3')?.textContent).toLowerCase();
  if(/customer billing|invoice|payment|balance/.test(title))return'money';
  if(/files|photos|meetings|conversation|document|evidence/.test(title))return'files';
  if(/jobs|requests|quotes|site visits|measurements|tasks|follow-ups/.test(title))return'work';
  return'overview';
}
function installCustomerTabs(grid){
  if(!grid)return;
  const allowed=['overview','work',...(financial()?['money']:[]),'files'];
  if(!allowed.includes(customerTab))customerTab='overview';
  let tabs=grid.querySelector(':scope > .h38-customer-tabs');
  if(!tabs){
    tabs=document.createElement('div');tabs.className='h38-customer-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Customer 360 sections');
    const hero=grid.querySelector(':scope > #h38CustomerReadyHero');if(hero)hero.insertAdjacentElement('afterend',tabs);else grid.prepend(tabs);
  }
  tabs.innerHTML=allowed.map(key=>`<button type="button" role="tab" data-h38-customer-tab="${key}" class="${customerTab===key?'active':''}">${key[0].toUpperCase()+key.slice(1)}</button>`).join('');
  const apply=key=>{
    customerTab=allowed.includes(key)?key:'overview';grid.dataset.h38CustomerTab=customerTab;
    grid.querySelectorAll(':scope > section.card:not(#h38CustomerReadyHero)').forEach(section=>{const pane=customerSectionKey(section);section.dataset.h38CustomerPane=pane;section.hidden=pane!==customerTab;});
    tabs.querySelectorAll('[data-h38-customer-tab]').forEach(button=>{const active=button.dataset.h38CustomerTab===customerTab;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));});
  };
  tabs.querySelectorAll('[data-h38-customer-tab]').forEach(button=>button.onclick=()=>apply(button.dataset.h38CustomerTab));
  apply(customerTab);
}
function enhanceCustomer360(){
  if(!signedIn()){clearSignedOutPolish();return;}
  if(office().page!=='customers')return;const c360=window.H38_CUSTOMER_360,grid=document.querySelector('.h38-c360-grid');if(!c360?.customerBundle||!grid)return;
  document.getElementById('h38CustomerReadyHero')?.remove();document.getElementById('h38CustomerReadyCards')?.remove();
  const cid=selectedCustomerId();if(!cid)return;const bundle=c360.customerBundle(snapshot(),cid);if(!bundle?.customer)return;const groups=bundle.groups||{};
  const action=nextCustomerAction(bundle),job=latest(groups.jobs||[]),visit=latest(groups.siteCaptureSessions||[]),meeting=latest(groups.meetings||[]),balance=invoiceBalance(groups.invoices||[]);
  const property=(groups.properties||[])[0]||{},address=text(value(property,'Address','address')||value(bundle.customer,'Service Address','serviceAddress')),phone=text(value(bundle.customer,'Phone','phone','Mobile Phone','mobilePhone'));
  const hero=document.createElement('section');hero.id='h38CustomerReadyHero';hero.className='h38-customer-ready-hero card';
  hero.innerHTML=`<div class="h38-customer-ready-head"><div><span class="h38-eyebrow">CUSTOMER 360</span><h2>${esc(value(bundle.customer,'Customer Name','name')||'Customer')}</h2><p>${esc(address||'Customer history, property, work, conversations and billing in one place.')}</p></div><div class="h38-customer-context-actions">${phone?`<a class="secondary" href="tel:${esc(phone.replace(/[^\d+]/g,''))}">Call</a>`:''}<button type="button" class="secondary" data-h38-customer-action="message">Message</button>${address?`<button type="button" class="secondary" data-h38-customer-navigate="${esc(address)}">Navigate</button>`:''}</div></div><div class="h38-customer-ready-actions"><button type="button" class="primary" data-h38-customer-action="${esc(action.action)}">${esc(action.text)}</button><button type="button" class="secondary" data-h38-customer-action="site">Site visit</button></div>`;
  const cards=document.createElement('section');cards.id='h38CustomerReadyCards';cards.className='h38-customer-ready-cards card';cards.setAttribute('aria-label','Customer summary');
  cards.innerHTML=`<article><small>Next action</small><strong>${esc(action.text)}</strong><span>${esc(action.detail)}</span></article><article><small>Active work</small><strong>${esc(job?value(job,'Project Title','Job Number'):'No active job')}</strong><span>${esc(job?value(job,'Status','status'):'Ready for new work')}</span></article><article><small>Last site visit</small><strong>${esc(visit?value(visit,'Project Title','Site Visit ID','Capture Session ID'):'No visit yet')}</strong><span>${visit?new Date(dateValue(visit)).toLocaleDateString():'Start one when field evidence is needed'}</span></article><article><small>Recent activity</small><strong>${esc(meeting?value(meeting,'Title','Meeting Type'):'No conversation saved')}</strong><span>${meeting?new Date(dateValue(meeting)).toLocaleDateString():'Customer activity will appear here'}</span></article><article data-h38-financial-summary><small>Customer balance</small><strong>${money(balance)}</strong><span>${balance>0?'Open customer billing':'Nothing currently due'}</span></article>`;
  if(!financial())cards.querySelector('[data-h38-financial-summary]')?.remove();
  grid.prepend(hero);installCustomerTabs(grid);document.getElementById('mainContent')?.appendChild(cards);
  hero.querySelectorAll('[data-h38-customer-action]').forEach(button=>button.onclick=()=>route(button.dataset.h38CustomerAction,cid));
  hero.querySelectorAll('[data-h38-customer-navigate]')).forEach(button=>button.onclick=()=>{const destination=button.dataset.h38CustomerNavigate;if(destination)window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`,'_blank','noopener');});
}
function visitCounts(v){
  const arrays=keys=>keys.reduce((n,k)=>n+(Array.isArray(v?.[k])?v[k].length:0),0);
  const photos=arrays(['photos','photoAttachmentIds','detailPhotoIds','manualDetailPhotos']);
  const walkthroughs=arrays(['videoAttachmentIds','walkthroughs']);
  const measurements=arrays(['measurements','spokenMeasurements','manualMeasurements']);
  const missing=arrays(['missingMeasurements','unknowns','questionsToAsk']);return{photos,walkthroughs,measurements,missing};
}
function enhanceVisitDock(){
  if(!signedIn()){clearSignedOutPolish();return;}
  const v=window.H38_FIELD_VISIT_CORE?.state?.visit||window.H38_FIELD_VISIT?.state?.visit;let card=document.getElementById('h38CustomerReadyVisitSummary');if(!v){card?.remove();return;}const dock=document.getElementById('h38MeetingVisitDock');if(!dock)return;
  const c=visitCounts(v),fingerprint=[text(v.sessionId||v.visitId),c.photos,c.walkthroughs,c.measurements,c.missing].join(':');if(card?.dataset.fp===fingerprint)return;if(!card){card=document.createElement('section');card.id='h38CustomerReadyVisitSummary';card.className='h38-visit-ready-summary';dock.insertAdjacentElement('beforebegin',card);}card.dataset.fp=fingerprint;
  card.innerHTML=`<div><span class="h38-eyebrow">SITE VISIT</span><strong>${esc(v.projectTitle||'Capture summary')}</strong></div><div class="h38-visit-ready-counts"><span><b>${c.photos}</b> photos</span><span><b>${c.walkthroughs}</b> walkthroughs</span><span><b>${c.measurements}</b> measurements</span><span class="${c.missing?'warn':''}"><b>${c.missing}</b> open questions</span></div>`;
}
function enforceCustomerLayout(){
  if(office().page!=='customers')return;const main=document.getElementById('mainContent');if(!main)return;
  const head=main.querySelector('.page-head'),customer360=main.querySelector('.h38-c360.full'),cards=document.getElementById('h38CustomerReadyCards');
  if(customer360&&head&&head.nextElementSibling!==customer360)head.insertAdjacentElement('afterend',customer360);
  if(cards&&main.lastElementChild!==cards)main.appendChild(cards);
}
function queueCustomerLayout(){
  if(layoutOrderQueued)return;layoutOrderQueued=true;setTimeout(()=>{layoutOrderQueued=false;enforceCustomerLayout();},0);
}
function observeCustomerLayout(){
  const main=document.getElementById('mainContent');if(!main||layoutObserver)return;
  layoutObserver=new MutationObserver(queueCustomerLayout);layoutObserver.observe(main,{childList:true,subtree:true});
}
function polishEmptyStates(){
  const main=document.getElementById('mainContent');if(!main)return;main.querySelectorAll('.empty,.muted').forEach(node=>{const t=text(node.textContent);if(!t)return;if(/^No records\.?$/i.test(t))node.textContent='Nothing here yet. New work will appear when it is created.';if(/^No data\.?$/i.test(t))node.textContent='Nothing to show yet.';});
}
function wrapRenderer(name,enhancer){const current=window[name];if(typeof current!=='function'||current.__h38CustomerReadiness)return;const previous=current;const wrapped=function(){const result=previous.apply(this,arguments);setTimeout(()=>{enhancer();polishEmptyStates();enforceCustomerLayout();},0);return result;};wrapped.__h38CustomerReadiness=true;wrapped.__h38CustomerReadinessBase=previous;window[name]=wrapped;}
function install(){
  if(installed||!window.state||!document.getElementById('mainContent'))return false;installed=true;ensureQuickCreate();observeCustomerLayout();wrapRenderer('renderToday',enhanceToday);wrapRenderer('renderCustomers',enhanceCustomer360);
  const open=window.openPage;if(typeof open==='function'&&!open.__h38CustomerReadiness){const previous=open;const wrapped=function(page){const result=previous.apply(this,arguments);setTimeout(()=>{ensureQuickCreate();if(page==='today')enhanceToday();if(page==='customers')enhanceCustomer360();polishEmptyStates();enforceCustomerLayout();},40);return result;};wrapped.__h38CustomerReadiness=true;wrapped.__h38CustomerReadinessBase=previous;window.openPage=wrapped;}
  window.addEventListener('h38:auth-cleared',clearSignedOutPolish);
  window.addEventListener('h38:business-snapshot-updated',()=>{if(office().page==='today')enhanceToday();if(office().page==='customers'){enhanceCustomer360();queueCustomerLayout();}});
  setInterval(()=>{ensureQuickCreate();enhanceVisitDock();},900);
  if(office().page==='today')setTimeout(enhanceToday,0);if(office().page==='customers')setTimeout(enhanceCustomer360,0);
  window.H38_CUSTOMER_READINESS_POLISH=Object.freeze({build:BUILD,customerFirst:true,universalNew:true,todayCommandCenter:true,customerSummary:true,customer360PinnedTop:true,customerCardsPinnedBottom:true,siteVisitSummary:true,assistantPromptExamples:true,ownerControlPreserved:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,automaticPayment:false,automaticScheduling:false});
  window.dispatchEvent(new CustomEvent('h38:customer-readiness-polish-ready',{detail:{build:BUILD}}));return true;
}
let attempts=0;const timer=setInterval(()=>{if(install()||++attempts>80)clearInterval(timer);},100);install();
})();
