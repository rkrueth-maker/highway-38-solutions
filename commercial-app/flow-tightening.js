(function(){
'use strict';
const BUILD='20260826-flow-first-frame-stability-2';
const NAV_ORDER=['today','work','customers','quotes','schedule','messages','field','documents','money','accounting','reports','people','inventory','fleet','payroll','tax','social','controls','ai','settings'];
let installed=false;
let preferredJobId='';
let workEnhanceScheduled=false;
const text=value=>String(value==null?'':value);
const upper=value=>text(value).trim().toUpperCase();
const value=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const recordId=(row,...keys)=>text(value(row,...keys));
const html=value=>typeof window.esc==='function'?window.esc(value):text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const rows=name=>typeof window.records==='function'?window.records(name):(window.state?.snapshot?.[name]||[]);
const allowed=()=>{try{return typeof window.allowedPages==='function'?window.allowedPages():[];}catch(_){return[];}};
const pageLabel=key=>{try{return typeof PAGE_DEFS!=='undefined'&&PAGE_DEFS[key]?PAGE_DEFS[key][1]:key;}catch(_){return key;}};
const pageIcon=key=>{try{return typeof PAGE_DEFS!=='undefined'&&PAGE_DEFS[key]?PAGE_DEFS[key][0]:'•';}catch(_){return'•';}};
function officeState(){try{return typeof state!=='undefined'?state:window.state;}catch(_){return window.state;}}
function activeBusiness(){const s=officeState();return text(s?.businessId);}
function activeUser(){const s=officeState();return text(s?.snapshot?.user?.userId||s?.snapshot?.user?.id);}
function toastSafe(message,bad){if(typeof window.toast==='function')window.toast(message,!!bad);}
function latest(list){return(list||[]).slice().sort((a,b)=>new Date(value(b,'Updated Time','updatedAt','Created Time','createdAt')||0)-new Date(value(a,'Updated Time','updatedAt','Created Time','createdAt')||0))[0]||null;}
function sameTitle(a,b){const clean=x=>text(x).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(),x=clean(a),y=clean(b);return!!x&&!!y&&(x===y||x.includes(y)||y.includes(x));}
function findJob(id){return rows('jobs').find(row=>recordId(row,'Job ID','jobId')===text(id))||null;}
function selectedJob(){const selected=text(document.getElementById('h38LifecycleJob')?.value||preferredJobId);return findJob(selected)||rows('jobs').find(row=>!/CANCEL|ARCHIV/.test(upper(value(row,'Status','status'))))||null;}
function jobForVisit(visit){
  if(!visit)return null;
  const quoteId=text(visit.quoteId),customerId=text(visit.customerId),title=text(visit.projectTitle);
  return rows('jobs').find(row=>{
    const directQuote=text(value(row,'Quote ID','quoteId'));
    if(quoteId&&directQuote===quoteId)return true;
    const cid=text(value(row,'Customer ID','customerId'));
    return !!customerId&&cid===customerId&&sameTitle(value(row,'Project Title','projectTitle'),title);
  })||null;
}
function openPageSafe(page,focusId){
  const pages=allowed();if(!pages.includes(page)){toastSafe(`${pageLabel(page)} is not available for this role.`,true);return;}
  if(typeof window.openPage==='function')window.openPage(page);
  if(focusId)setTimeout(()=>{const node=document.getElementById(focusId);if(node){node.scrollIntoView({behavior:'smooth',block:'start'});node.querySelector?.('input,select,textarea,button')?.focus?.({preventScroll:true});}},30);
}
function startSiteVisit(customerId='',quoteId=''){
  const job=selectedJob();
  const jid=job?recordId(job,'Job ID','jobId'):'';if(jid)preferredJobId=jid;
  const context=job&&window.H38_JOB_LIFECYCLE?.analyzeJob?window.H38_JOB_LIFECYCLE.analyzeJob(job):null;
  const q=quoteId||recordId(latest(context?.quotes||[]),'Quote ID','quoteId');
  const c=customerId||text(value(job,'Customer ID','customerId'));
  if(window.H38_FIELD_VISIT?.open){window.H38_FIELD_VISIT.open({customerId:c,quoteId:q});return;}
  openPageSafe('field');
}
function compactRenderNav(baseRenderNav){
  const isMobile=!!window.matchMedia?.('(max-width: 760px)').matches;
  if(!isMobile){baseRenderNav();return;}
  if(window.H38_MOBILE_RUNTIME_STABILITY?.mobilePrimaryNavigationSingleAuthority||window.H38_MOBILE_FIRST_FRAME_AUTHORITY?.mobilePrimaryNavigationSingleAuthority)return;
  const s=officeState();if(!s||s.shell!=='office'){baseRenderNav();return;}
  const pages=new Set(allowed()),nav=document.getElementById('mainNav');if(!nav)return;
  const keys=NAV_ORDER.filter(key=>pages.has(key));
  nav.classList.add('h38-operator-scroll-nav');
  nav.innerHTML=keys.map(key=>`<button type="button" data-page="${html(key)}" class="${s.page===key?'active':''}"><span class="nav-icon">${pageIcon(key)}</span><span>${html(pageLabel(key))}</span></button>`).join('');
  nav.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>window.openPage(button.dataset.page));
  requestAnimationFrame(()=>{
    const active=nav.querySelector('[data-page].active');
    if(!active||nav.scrollWidth<=nav.clientWidth)return;
    const target=Math.max(0,active.offsetLeft-(nav.clientWidth-active.clientWidth)/2);
    nav.scrollTo({left:target,behavior:'auto'});
  });
}
function moneyForJob(jobId){preferredJobId=text(jobId);openPageSafe('money');setTimeout(()=>{document.querySelectorAll('#h38ReceiptForm [name="jobId"],#h38MileageForm [name="jobId"]').forEach(select=>{if(Array.from(select.options).some(option=>option.value===preferredJobId))select.value=preferredJobId;});},40);}
function quoteForJob(job,context){
  preferredJobId=recordId(job,'Job ID','jobId');const q=latest(context?.quotes||[]);
  openPageSafe('quotes');
  if(q&&typeof window.openQuote==='function')setTimeout(()=>window.openQuote(recordId(q,'Quote ID','quoteId')),20);
  else{const s=officeState();if(s?.quote){s.quote.customerId=text(value(job,'Customer ID','customerId'));s.quote.projectTitle=text(value(job,'Project Title','projectTitle'));}}
}
function nextActionFor(context){
  const stage=upper(context?.stage);
  if(stage==='SITE_VISIT')return'site';
  if(['ESTIMATE','PROPOSAL','APPROVAL'].includes(stage))return'quote';
  if(stage==='SCHEDULE')return'schedule';
  if(['PREJOB','WORK','QUALITY'].includes(stage))return'field';
  if(['INVOICE','PAYMENT'].includes(stage))return'money';
  return'work';
}
function enhanceChangeOrders(job){
  const form=document.getElementById('h38ChangeOrderForm');if(!form||!job)return;
  const list=form.parentElement?.querySelector('.list');if(!list)return;
  const jid=recordId(job,'Job ID','jobId'),changes=rows('changeOrders').filter(row=>recordId(row,'Job ID','jobId')===jid);
  list.innerHTML=changes.length?changes.map(row=>{
    const id=recordId(row,'Change Order ID','changeOrderId'),status=text(value(row,'Status','status')||'Draft'),final=/CUSTOMER\s+(APPROV|DECLIN)|CANCEL|VOID/.test(upper(status));
    return`<div class="row h38-change-row"><div class="row-top"><strong>${html(value(row,'Title','title')||'Change')}</strong><span class="pill ${final?'good':'pending'}">${html(status)}</span></div><small>${typeof window.money==='function'?window.money(value(row,'Amount','amount')):html(value(row,'Amount','amount'))} · ${html(value(row,'Description','description'))}</small>${final?'':`<div class="row-actions"><button type="button" data-h38-change="approved" data-change-id="${html(id)}">Record customer approved</button><button type="button" class="secondary" data-h38-change="declined" data-change-id="${html(id)}">Record customer declined</button></div>`}</div>`;
  }).join(''):'<p class="muted small">No change orders.</p>';
  list.querySelectorAll('[data-h38-change]').forEach(button=>button.onclick=()=>recordChangeDecision(button.dataset.changeId,button.dataset.h38Change));
}
async function recordChangeDecision(id,decision){
  const row=rows('changeOrders').find(item=>recordId(item,'Change Order ID','changeOrderId')===text(id));if(!row)return;
  const approved=decision==='approved',verb=approved?'approved':'declined';
  if(!window.confirm(`Record that the customer ${verb} this change order? This records the decision only. Nothing is sent and no payment or purchase occurs.`))return;
  try{
    const updated={...row,'Status':approved?'Customer Approved — Owner Recorded':'Customer Declined — Owner Recorded','Customer Decision':approved?'Approved':'Declined','Customer Decision Recorded By':activeUser(),'Customer Decision Time':new Date().toISOString(),'Updated Time':new Date().toISOString(),'Record Version':Number(value(row,'Record Version','recordVersion')||0)+1};delete updated.__localPending;
    await window.queueOperation('SAVE_ENTITY','Change Order',id,{entity:'changeOrders',record:updated},{collection:'changeOrders',record:updated,idKeys:['Change Order ID','changeOrderId']},true);
    toastSafe(`Customer ${verb} decision recorded. Nothing was sent.`);window.renderWork?.();
  }catch(error){toastSafe(error?.message||String(error),true);}
}
function workFingerprint(job,context,expenses,documents){
  const jid=recordId(job,'Job ID','jobId');
  const changes=rows('changeOrders').filter(row=>recordId(row,'Job ID','jobId')===jid).map(row=>`${recordId(row,'Change Order ID','changeOrderId')}:${text(value(row,'Status','status'))}:${text(value(row,'Updated Time','updatedAt'))}`).sort();
  return JSON.stringify({jid,stage:context?.stageLabel||'',next:context?.next||'',blockers:[...(context?.blockers||[]),...(context?.warnings||[])],site:context?.site?.length||0,quotes:context?.quotes?.length||0,checklists:context?.checklists?.length||0,invoices:context?.invoices?.length||0,expenses:expenses.length,documents:documents.length,changes});
}
function enhanceWork(){
  const main=document.getElementById('mainContent');if(!main||officeState()?.page!=='work')return;
  const job=selectedJob();if(!job)return;
  preferredJobId=recordId(job,'Job ID','jobId');
  const context=window.H38_JOB_LIFECYCLE?.analyzeJob?window.H38_JOB_LIFECYCLE.analyzeJob(job):null;
  const blockers=[...(context?.blockers||[]),...(context?.warnings||[])],expenses=rows('expenses').filter(row=>recordId(row,'Job ID','jobId')===preferredJobId),documents=rows('documents').filter(row=>recordId(row,'Job ID','jobId')===preferredJobId||recordId(row,'Source ID','sourceId')===preferredJobId);
  const fingerprint=workFingerprint(job,context,expenses,documents);
  let section=document.getElementById('h38JobCommandHome');
  if(section?.dataset.h38WorkFingerprint===fingerprint)return;
  const next=nextActionFor(context),stage=context?.stageLabel||value(job,'Status','status')||'Job';
  const isNew=!section;
  if(!section){section=document.createElement('section');section.id='h38JobCommandHome';section.className='h38-job-command-home';}
  section.dataset.h38WorkFingerprint=fingerprint;
  section.innerHTML=`<div class="h38-job-command-head"><div><span>JOB HOME</span><h2>${html(value(job,'Project Title','projectTitle')||value(job,'Job Number','jobNumber')||'Job')}</h2><p>${html(stage)} · ${html(context?.next||'Keep this job moving from one place.')}</p></div><button type="button" data-job-command="${next}" class="h38-job-next">Do next step</button></div>${blockers.length?`<div class="h38-job-alert"><strong>Needs attention</strong><span>${html(blockers.join(' · '))}</span></div>`:''}<div class="h38-job-command-grid"><button type="button" data-job-command="site"><span>📍</span><strong>Site</strong><small>${context?.site?.length||0} visits</small></button><button type="button" data-job-command="quote"><span>🧾</span><strong>Quote</strong><small>${context?.quotes?.length||0} revisions</small></button><button type="button" data-job-command="work"><span>🧰</span><strong>Work</strong><small>${context?.checklists?.length||0} checklists</small></button><button type="button" data-job-command="money"><span>💵</span><strong>Money</strong><small>${context?.invoices?.length||0} invoices · ${expenses.length} costs</small></button><button type="button" data-job-command="files"><span>📁</span><strong>Files</strong><small>${documents.length} linked</small></button><button type="button" data-job-command="messages"><span>💬</span><strong>Messages</strong><small>Customer context</small></button></div>`;
  if(isNew){const head=main.querySelector('.page-head');head?.insertAdjacentElement('afterend',section);}
  section.querySelectorAll('[data-job-command]').forEach(button=>button.onclick=()=>runJobCommand(button.dataset.jobCommand,job,context));
  main.querySelectorAll('.grid > .card').forEach(card=>{const heading=card.querySelector('h2')?.textContent?.trim();if(['New request','New job','Assign task'].includes(heading))card.classList.add('h38-tight-secondary');});
  enhanceChangeOrders(job);
}
function scheduleWorkEnhance(){
  if(workEnhanceScheduled||officeState()?.page!=='work')return;
  workEnhanceScheduled=true;
  try{enhanceWork();}finally{workEnhanceScheduled=false;}
}
function runJobCommand(command,job,context){
  preferredJobId=recordId(job,'Job ID','jobId');
  if(command==='site'||command==='field'){startSiteVisit(text(value(job,'Customer ID','customerId')),recordId(latest(context?.quotes||[]),'Quote ID','quoteId'));return;}
  if(command==='quote'){quoteForJob(job,context);return;}
  if(command==='schedule'){openPageSafe('schedule');return;}
  if(command==='money'){moneyForJob(preferredJobId);return;}
  if(command==='files'){openPageSafe('documents');return;}
  if(command==='messages'){openPageSafe('messages');return;}
  document.querySelector('.h38-life-work')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function enhanceCustomers(){
  const main=document.getElementById('mainContent');if(!main)return;
  const section=Array.from(main.querySelectorAll('.card')).find(card=>card.querySelector('h2')?.textContent?.trim()==='Customers');if(!section)return;
  const customers=rows('customers');section.querySelectorAll('.list > .row').forEach((node,index)=>{
    const customer=customers[index];if(!customer||node.querySelector('[data-h38-customer-quick]'))return;
    const id=recordId(customer,'Customer ID','customerId'),actions=document.createElement('div');actions.className='row-actions';actions.dataset.h38CustomerQuick='1';
    actions.innerHTML=`<button type="button" data-customer-quote="${html(id)}">Start quote</button><button type="button" data-customer-site="${html(id)}">Site visit</button>`;node.appendChild(actions);
  });
  section.querySelectorAll('[data-customer-quote]').forEach(button=>button.onclick=()=>{const s=officeState();if(s)s.quote={quoteId:'',lines:[],customerId:button.dataset.customerQuote,hydrationComplete:true};openPageSafe('quotes');});
  section.querySelectorAll('[data-customer-site]').forEach(button=>button.onclick=()=>startSiteVisit(button.dataset.customerSite,''));
}
function enhanceMoney(){
  if(!preferredJobId)return;
  document.querySelectorAll('#h38ReceiptForm [name="jobId"],#h38MileageForm [name="jobId"]').forEach(select=>{if(Array.from(select.options||[]).some(option=>option.value===preferredJobId))select.value=preferredJobId;});
}
async function createDailyLogDraft(){
  const C=window.H38_FIELD_VISIT_CORE,visit=C?.state?.visit;if(!visit)return;
  const job=jobForVisit(visit);if(!job){toastSafe('Create or link the job before making a Daily Log from this Site Visit.',true);return;}
  const jid=recordId(job,'Job ID','jobId'),id=`DAILY-${crypto.randomUUID().toUpperCase()}`,measurements=(C.state.measurements||[]).map(row=>`${text(value(row,'Label','label'))}: ${text(value(row,'Value','value'))} ${text(value(row,'Unit','unit'))}`).filter(Boolean),summary=text(visit.notes||visit.scope||'Site Visit captured.').trim();
  const record={'Daily Log ID':id,'Business ID':activeBusiness(),'Job ID':jid,'Customer ID':text(visit.customerId),'Quote ID':text(visit.quoteId),'Site Visit ID':text(visit.visitId),'Capture Session ID':text(visit.sessionId),'Work Date':new Date().toISOString().slice(0,10),'Status':'Draft — Owner Review Required','Summary':summary,'Measurement Summary':measurements.join('; '),'Photo Count':Array.isArray(visit.attachmentIds)?visit.attachmentIds.length:0,'Video Count':Array.isArray(visit.videoAttachmentIds)?visit.videoAttachmentIds.length:0,'Created By':activeUser(),'Created Time':new Date().toISOString(),'Updated Time':new Date().toISOString(),'Record Version':1,'Automatic Customer Sending':false,'Automatic Approval':false};
  try{await window.queueOperation('SAVE_ENTITY','Daily Log',id,{entity:'dailyLogs',record},{collection:'dailyLogs',record,idKeys:['Daily Log ID','dailyLogId']},true);toastSafe('Daily Log draft created from this Site Visit. Nothing was shared.');decorateFieldVisit();}catch(error){toastSafe(error?.message||String(error),true);}
}
function decorateFieldVisit(){
  const app=document.getElementById('h38FieldVisitApp'),summary=app?.querySelector('.field-summary-grid');if(!app||!summary||document.getElementById('h38CreateDailyLogFromVisit'))return;
  const C=window.H38_FIELD_VISIT_CORE,visit=C?.state?.visit;if(!visit?.sessionId)return;
  const card=document.createElement('section');card.className='field-card h38-flow-daily-log';card.innerHTML='<div><strong>Use this capture again</strong><span>Create an internal Daily Log draft from the same notes, measurements, photos and walkthrough evidence.</span></div><button id="h38CreateDailyLogFromVisit" type="button" class="field-secondary">Create Daily Log draft</button>';
  summary.insertAdjacentElement('afterend',card);card.querySelector('button').onclick=createDailyLogDraft;
}
function install(){
  if(installed)return;installed=true;document.body.classList.add('h38-flow-tightening');
  if(!document.getElementById('h38ScrollableNavStyle')){const style=document.createElement('style');style.id='h38ScrollableNavStyle';style.textContent='@media(max-width:760px){body.h38-flow-tightening .main-nav.h38-operator-scroll-nav{display:flex!important;justify-content:flex-start!important;gap:4px!important;overflow-x:auto!important;overflow-y:hidden!important;-webkit-overflow-scrolling:touch;scrollbar-width:none;scroll-snap-type:x proximity}body.h38-flow-tightening .main-nav.h38-operator-scroll-nav::-webkit-scrollbar{display:none}body.h38-flow-tightening .main-nav.h38-operator-scroll-nav button{flex:0 0 76px!important;min-width:76px!important;max-width:76px!important;padding:5px 3px!important;scroll-snap-align:start}body.h38-flow-tightening .main-nav.h38-operator-scroll-nav .h38-nav-add,[data-h38-nav-action="add"],[data-h38-nav-action="more"]{display:none!important}}';document.head.appendChild(style);}
  if(typeof window.renderNav==='function'){
    const base=window.renderNav;window.renderNav=function(){return compactRenderNav(base);};window.renderNav();
  }
  if(typeof window.renderWork==='function'){
    const base=window.renderWork;window.renderWork=function(){const result=base.apply(this,arguments);scheduleWorkEnhance();return result;};
  }
  if(typeof window.renderCustomers==='function'){
    const base=window.renderCustomers;window.renderCustomers=function(){const result=base.apply(this,arguments);enhanceCustomers();return result;};
  }
  if(typeof window.renderMoney==='function'){
    const base=window.renderMoney;window.renderMoney=function(){const result=base.apply(this,arguments);setTimeout(enhanceMoney,0);return result;};
  }
  const observer=new MutationObserver(()=>{decorateFieldVisit();});observer.observe(document.documentElement,{childList:true,subtree:true});
  scheduleWorkEnhance();if(officeState()?.page==='customers')enhanceCustomers();decorateFieldVisit();
  window.H38_FLOW_TIGHTENING=Object.freeze({build:BUILD,enabled:true,primaryNavigation:'desktop-native-mobile-delegated',desktopNavigationUsesBaseRenderer:true,primaryNavDelegatedToFinalMobileRuntime:true,mobileNavVerticalScrollIntoView:false,workEnhanceDocumentObserver:false,workEnhanceRenderBoundary:true,workEnhanceSynchronous:true,customerEnhanceSynchronous:true,postPaintJobsCustomerMutation:false,preStartupMobileNavRespected:true,plusLauncher:false,moreLauncher:false,jobHome:true,jobsPageStableEnhancement:true,changeOrderDecisionRecording:true,dailyLogFromSiteVisit:true,searchChanged:false,quoteAiChanged:false,automaticCustomerSending:false,automaticApproval:false,automaticPurchasing:false,automaticPayment:false});
}
function waitForOffice(attempt=0){if(typeof window.renderNav==='function'&&typeof window.openPage==='function'){install();return;}if(attempt<80)setTimeout(()=>waitForOffice(attempt+1),50);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>waitForOffice(),{once:true});else waitForOffice();
})();