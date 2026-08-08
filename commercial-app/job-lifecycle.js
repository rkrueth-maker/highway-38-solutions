(function(){
'use strict';
const BUILD='20260807-2225';
const STAGES=[
  ['INTAKE','Intake'],
  ['SITE_VISIT','Site Visit'],
  ['ESTIMATE','Estimate'],
  ['PROPOSAL','Proposal'],
  ['APPROVAL','Approval'],
  ['SCHEDULE','Schedule'],
  ['PREJOB','Pre-job'],
  ['WORK','Work'],
  ['QUALITY','Quality Check'],
  ['INVOICE','Invoice'],
  ['PAYMENT','Payment'],
  ['CLOSEOUT','Closeout'],
  ['WARRANTY','Warranty / Follow-up']
];
const COLLECTION_LABELS={
  customers:'Customer',requests:'Request',jobs:'Job',tasks:'Task',scheduleEvents:'Schedule',
  quotes:'Quote',siteCaptureSessions:'Site Visit',siteMeasurements:'Measurement',checklists:'Checklist',
  changeOrders:'Change Order',timeEntries:'Time',dailyLogs:'Daily Log',expenses:'Expense',
  invoices:'Invoice',payments:'Payment',documents:'Document',portalMessages:'Portal Message',
  materialRequests:'Material Request',maintenance:'Maintenance',mileageEntries:'Mileage',
  recurringPlans:'Recurring Plan',followUps:'Follow-up'
};
const CHECKLIST_TEMPLATES={
  ESTIMATE:{
    name:'Estimate readiness',
    requiredBefore:'Proposal',
    items:[
      'Scope of work is clear',
      'Critical measurements are field verified or clearly marked missing',
      'Hidden conditions and assumptions are documented',
      'Materials, labor, equipment and overhead were reviewed',
      'Customer-facing scope contains no internal AI or pricing-review wording'
    ]
  },
  PREJOB:{
    name:'Pre-job readiness',
    requiredBefore:'Work',
    items:[
      'Approved scope and current revision confirmed',
      'Schedule and site access confirmed',
      'Materials and equipment are available or committed',
      'Crew / owner responsibilities are clear',
      'Permits, locates and safety requirements were reviewed when applicable'
    ]
  },
  QUALITY:{
    name:'Completion quality',
    requiredBefore:'Complete',
    items:[
      'Approved scope is complete',
      'Open change orders are resolved before extra work is treated as approved',
      'Final condition and cleanup were checked',
      'Final photos / proof are captured when appropriate',
      'Remaining punch-list items are recorded'
    ]
  },
  CLOSEOUT:{
    name:'Closeout',
    requiredBefore:'Closed',
    items:[
      'Invoice or final billing record is prepared',
      'Payment status is recorded',
      'Customer-facing final documents are staged intentionally',
      'Warranty / maintenance notes are recorded when applicable',
      'Job record has a final next action or is ready to close'
    ]
  }
};

const app=()=>window.state || (typeof state!=='undefined'?state:null);
const rec=name=>typeof window.records==='function'?window.records(name):(app()?.snapshot?.[name]||[]);
const val=(row,...keys)=>{
  if(typeof window.v==='function')return window.v(row,...keys);
  for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}
  return '';
};
const rid=(row,...keys)=>{
  if(typeof window.rowId==='function')return String(window.rowId(row,...keys)||'');
  return String(val(row,...keys)||'');
};
const num=value=>{const n=Number(value||0);return Number.isFinite(n)?n:0;};
const text=value=>String(value==null?'':value);
const upper=value=>text(value).trim().toUpperCase();
const esc=value=>typeof window.esc==='function'?window.esc(value):text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const moneyValue=value=>typeof window.money==='function'?window.money(value):Number(value||0).toLocaleString(undefined,{style:'currency',currency:'USD'});
const dateOnlyValue=value=>typeof window.dateOnly==='function'?window.dateOnly(value):(value?new Date(value).toLocaleDateString():'Not set');
const dateTimeValue=value=>typeof window.dateTime==='function'?window.dateTime(value):(value?new Date(value).toLocaleString():'Not set');
const now=()=>new Date().toISOString();
const uid=prefix=>typeof window.newId==='function'?window.newId(prefix):`${prefix}-${crypto.randomUUID().toUpperCase()}`;
const dayMs=86400000;
const jobId=row=>rid(row,'Job ID','jobId');
const customerId=row=>rid(row,'Customer ID','customerId');
const quoteId=row=>rid(row,'Quote ID','quoteId');
const invoiceId=row=>rid(row,'Invoice ID','invoiceId');
const checklistId=row=>rid(row,'Checklist ID','checklistId');
const changeOrderId=row=>rid(row,'Change Order ID','changeOrderId');

function parseJson(value,fallback){
  if(value==null||value==='')return fallback;
  if(Array.isArray(value)||typeof value==='object')return value;
  try{return JSON.parse(value);}catch(_){return fallback;}
}
function sameTitle(a,b){
  const clean=v=>text(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const x=clean(a),y=clean(b);
  return !!x&&!!y&&(x===y||x.includes(y)||y.includes(x));
}
function ageDays(value){
  const t=new Date(value||0).getTime();
  return Number.isFinite(t)&&t>0?Math.max(0,(Date.now()-t)/dayMs):0;
}
function latest(rows){
  return rows.slice().sort((a,b)=>new Date(val(b,'Updated Time','updatedAt','Created Time','createdAt')||0)-new Date(val(a,'Updated Time','updatedAt','Created Time','createdAt')||0))[0]||null;
}
function rowMatchesJob(row,job,allowCustomerTitle=false){
  const jid=jobId(job),explicit=text(val(row,'Job ID','jobId'));
  if(explicit)return explicit===jid;
  if(!allowCustomerTitle)return false;
  const cid=customerId(job),rowCid=text(val(row,'Customer ID','customerId'));
  if(cid&&rowCid&&cid!==rowCid)return false;
  const jobTitle=val(job,'Project Title','projectTitle'),rowTitle=val(row,'Project Title','projectTitle','Title','title');
  return !!cid&&rowCid===cid&&sameTitle(jobTitle,rowTitle);
}
function quoteRowsForJob(job){
  return rec('quotes').filter(row=>rowMatchesJob(row,job,true));
}
function quoteAccepted(row){
  const s=upper(val(row,'Status','status')),decision=upper(val(row,'Customer Decision','customerDecision'));
  return /ACCEPT|APPROV|SIGNED/.test(s)||/ACCEPT|APPROV/.test(decision);
}
function quotePresented(row){
  const s=upper(val(row,'Status','status'));
  return /PRESENT|SENT|DELIVER|VIEWED|ACCEPT|APPROV|SIGNED/.test(s);
}
function quoteRejected(row){
  const s=upper(val(row,'Status','status')),decision=upper(val(row,'Customer Decision','customerDecision'));
  return /DECLIN|REJECT|VOID|EXPIRED/.test(s)||/DECLIN|REJECT/.test(decision);
}
function checklistComplete(row){
  const s=upper(val(row,'Status','status'));
  if(/COMPLETE|DONE|PASS/.test(s))return true;
  const items=parseJson(val(row,'Items JSON','items'),[]);
  const done=parseJson(val(row,'Completed Items JSON','completedItems'),[]);
  return items.length>0&&done.length>=items.length;
}
function checklistRowsForJob(job){return rec('checklists').filter(row=>rowMatchesJob(row,job,false));}
function openChangeOrders(job){
  return rec('changeOrders').filter(row=>rowMatchesJob(row,job,false)&&!/APPROV|ACCEPT|COMPLETE|CANCEL|DECLIN|REJECT|VOID/.test(upper(val(row,'Status','status'))));
}
function invoiceRowsForJob(job){return rec('invoices').filter(row=>rowMatchesJob(row,job,false));}
function scheduleRowsForJob(job){return rec('scheduleEvents').filter(row=>rowMatchesJob(row,job,false));}
function siteRowsForJob(job,quotes){
  const qids=new Set(quotes.map(quoteId).filter(Boolean));
  const cid=customerId(job);
  return rec('siteCaptureSessions').filter(row=>{
    const q=text(val(row,'Quote ID','quoteId')),c=text(val(row,'Customer ID','customerId'));
    return (q&&qids.has(q))||(!q&&cid&&c===cid&&sameTitle(val(job,'Project Title'),val(row,'Project Title')));
  });
}
function paymentRowsForInvoices(invoices){
  const ids=new Set(invoices.map(invoiceId).filter(Boolean));
  return rec('payments').filter(row=>ids.has(text(val(row,'Invoice ID','invoiceId'))));
}
function jobCosting(job,quotes){
  const accepted=latest(quotes.filter(quoteAccepted)),best=accepted||quotes.slice().sort((a,b)=>num(val(b,'Total','total'))-num(val(a,'Total','total')))[0]||null;
  const quotedRevenue=num(val(best,'Total','total','Amount','amount'));
  const invoices=invoiceRowsForJob(job);
  const invoiceTotal=invoices.reduce((sum,row)=>sum+num(val(row,'Total','total')),0);
  const revenue=quotedRevenue||invoiceTotal;
  const expenses=rec('expenses').filter(row=>rowMatchesJob(row,job,false));
  const expenseTotal=expenses.reduce((sum,row)=>sum+num(val(row,'Amount','amount'))+num(val(row,'Tax','tax')),0);
  const times=rec('timeEntries').filter(row=>rowMatchesJob(row,job,false));
  const hours=times.reduce((sum,row)=>sum+num(val(row,'Hours','hours','Total Hours','totalHours')),0);
  const laborCost=times.reduce((sum,row)=>sum+num(val(row,'Labor Cost','laborCost','Cost Amount','costAmount','Cost','cost')),0);
  const laborUnpriced=hours>0&&laborCost===0;
  const materialRequests=rec('materialRequests').filter(row=>rowMatchesJob(row,job,false));
  const committed=materialRequests.reduce((sum,row)=>sum+num(val(row,'Estimated Cost','estimatedCost','Total Cost','totalCost','Amount','amount')),0);
  const knownCost=expenseTotal+laborCost;
  const projectedKnown=revenue-knownCost;
  const knownMargin=revenue?projectedKnown/revenue*100:0;
  return {revenue,quotedRevenue,invoiceTotal,expenseTotal,hours,laborCost,laborUnpriced,committed,knownCost,projectedKnown,knownMargin};
}
function requiredChecklist(job,requiredBefore){
  return checklistRowsForJob(job).filter(row=>upper(val(row,'Required Before','requiredBefore'))===upper(requiredBefore));
}
function lifecycle(job){
  const jid=jobId(job),status=upper(val(job,'Status','status'));
  const quotes=quoteRowsForJob(job),accepted=quotes.filter(quoteAccepted),presented=quotes.filter(quotePresented).filter(row=>!quoteRejected(row));
  const site=siteRowsForJob(job,quotes),schedules=scheduleRowsForJob(job),checklists=checklistRowsForJob(job),changes=openChangeOrders(job),invoices=invoiceRowsForJob(job);
  const payments=paymentRowsForInvoices(invoices),cost=jobCosting(job,quotes);
  const futureSchedule=schedules.filter(row=>new Date(val(row,'Start Time','startTime')||0).getTime()>=Date.now()-12*3600000);
  const workStarted=/IN PROGRESS|STARTED|WORKING/.test(status)||rec('dailyLogs').some(row=>rowMatchesJob(row,job,false))||rec('timeEntries').some(row=>rowMatchesJob(row,job,false));
  const jobComplete=/COMPLETE|CLOSED|DONE/.test(status);
  const balance=invoices.reduce((sum,row)=>sum+num(val(row,'Balance','balance','Balance Due','balanceDue')),0);
  let stage='INTAKE',next='Review the request and define the job.',blockers=[],warnings=[];
  if(!quotes.length){
    if(!site.length){stage='SITE_VISIT';next='Capture the site or add the critical measurements needed to estimate.';}
    else{stage='ESTIMATE';next='Build the internal estimate from the verified site information.';}
  }else{
    const newest=latest(quotes),total=num(val(newest,'Total','total'));
    if(!quotePresented(newest)&&!quoteAccepted(newest)){
      stage=total>0?'PROPOSAL':'ESTIMATE';
      next=total>0?'Review the proposal and present it when ready.':'Finish quantities, pricing and missing measurements.';
    }else if(!accepted.length){
      stage='APPROVAL';next='Follow up on the presented proposal or prepare the requested revision.';
    }else if(!futureSchedule.length&&!workStarted&&!jobComplete){
      stage='SCHEDULE';next='Schedule the approved work.';
    }else if(!workStarted&&!jobComplete){
      const pre=requiredChecklist(job,'Work');
      const incomplete=pre.filter(row=>!checklistComplete(row));
      stage=incomplete.length?'PREJOB':'WORK';
      next=incomplete.length?'Finish the required pre-job checklist.':'Start the scheduled work and record field progress.';
      if(incomplete.length)blockers.push(`${incomplete.length} required pre-job checklist${incomplete.length===1?'':'s'} incomplete`);
    }else if(!jobComplete){
      stage='WORK';next='Continue work, record progress and resolve changes before completion.';
    }else{
      const quality=requiredChecklist(job,'Complete'),qualityIncomplete=quality.filter(row=>!checklistComplete(row));
      if(qualityIncomplete.length||changes.length){
        stage='QUALITY';next='Resolve completion blockers before closing the work.';
        if(qualityIncomplete.length)blockers.push(`${qualityIncomplete.length} completion checklist${qualityIncomplete.length===1?'':'s'} incomplete`);
        if(changes.length)blockers.push(`${changes.length} open change order${changes.length===1?'':'s'}`);
      }else if(!invoices.length){
        stage='INVOICE';next='Prepare the final invoice or billing record.';
      }else if(balance>0){
        stage='PAYMENT';next='Record payment status and follow up on any balance due.';
      }else{
        const close=requiredChecklist(job,'Closed'),closeIncomplete=close.filter(row=>!checklistComplete(row));
        if(closeIncomplete.length){
          stage='CLOSEOUT';next='Finish closeout documents, warranty notes and final records.';
          blockers.push(`${closeIncomplete.length} closeout checklist${closeIncomplete.length===1?'':'s'} incomplete`);
        }else{
          stage='WARRANTY';next='Job is financially closed; keep warranty / maintenance follow-up visible.';
        }
      }
    }
  }
  if(changes.length&&stage!=='QUALITY')warnings.push(`${changes.length} unresolved change order${changes.length===1?'':'s'}`);
  if(cost.laborUnpriced)warnings.push(`${cost.hours.toFixed(1)} labor hour${cost.hours===1?'':'s'} recorded without labor cost`);
  const stageLabel=STAGES.find(([key])=>key===stage)?.[1]||stage;
  return {job,jid,stage,stageLabel,next,blockers,warnings,quotes,accepted,presented,site,schedules,checklists,changes,invoices,payments,balance,cost};
}
function allLifecycle(){
  return rec('jobs').filter(row=>!/CANCEL|ARCHIV/.test(upper(val(row,'Status','status')))).map(lifecycle);
}
function attention(){
  const items=[];
  const requests=rec('requests').filter(row=>/NEW|OPEN/.test(upper(val(row,'Status','status')))&&ageDays(val(row,'Updated Time','Created Time'))>=1);
  requests.forEach(row=>items.push({kind:'REQUEST',priority:3,title:val(row,'Subject')||'New request',detail:`Unworked request · ${Math.floor(ageDays(val(row,'Updated Time','Created Time')))} day(s) old`,customerId:val(row,'Customer ID'),record:row}));
  rec('quotes').filter(row=>quotePresented(row)&&!quoteAccepted(row)&&!quoteRejected(row)&&ageDays(val(row,'Updated Time','Presented Time','Created Time'))>=3).forEach(row=>items.push({kind:'QUOTE',priority:2,title:val(row,'Project Title')||val(row,'Quote Number')||'Presented quote',detail:`Presented quote needs follow-up · ${Math.floor(ageDays(val(row,'Updated Time','Presented Time','Created Time')))} day(s)`,quoteId:quoteId(row),customerId:val(row,'Customer ID'),record:row}));
  rec('invoices').filter(row=>num(val(row,'Balance','Balance Due'))>0&&val(row,'Due Date')&&new Date(val(row,'Due Date')).getTime()<Date.now()).forEach(row=>items.push({kind:'INVOICE',priority:1,title:val(row,'Invoice Number')||'Invoice',detail:`Overdue balance ${moneyValue(val(row,'Balance','Balance Due'))}`,invoiceId:invoiceId(row),customerId:val(row,'Customer ID'),record:row}));
  allLifecycle().filter(x=>x.blockers.length).forEach(x=>items.push({kind:'JOB',priority:1,title:val(x.job,'Project Title')||val(x.job,'Job Number'),detail:`${x.stageLabel}: ${x.blockers.join(' · ')}`,jobId:x.jid,customerId:customerId(x.job),record:x.job}));
  return items.sort((a,b)=>a.priority-b.priority).slice(0,50);
}
function searchSnapshot(query){
  const q=text(query).trim().toLowerCase();
  if(q.length<2)return [];
  const collections=['customers','requests','jobs','tasks','scheduleEvents','quotes','siteCaptureSessions','siteMeasurements','checklists','changeOrders','dailyLogs','timeEntries','expenses','mileageEntries','invoices','payments','documents','portalMessages','materialRequests','maintenance','recurringPlans','followUps'];
  const results=[];
  collections.forEach(collection=>{
    rec(collection).forEach(row=>{
      let hay='';
      try{hay=JSON.stringify(row).toLowerCase();}catch(_){hay='';}
      if(!hay.includes(q))return;
      const label=COLLECTION_LABELS[collection]||collection;
      const title=val(row,'Customer Name','Subject','Project Title','Task Title','Title','Checklist Name','Description','Invoice Number','File Name','Purpose','Plan Name','Body')||rid(row,'Job ID','Quote ID','Invoice ID','id')||label;
      const subtitle=[val(row,'Status','status'),val(row,'Job Number'),val(row,'Quote Number'),val(row,'Due Date','Due Time')].filter(Boolean).join(' · ');
      results.push({collection,label,title:text(title),subtitle:text(subtitle),row});
    });
  });
  return results.slice(0,80);
}
async function saveEntity(collection,type,key,record,idKeys){
  if(typeof window.queueOperation!=='function')throw new Error('Secure offline save queue is unavailable.');
  await window.queueOperation('SAVE_ENTITY',type,key,{entity:collection,record},{collection,record,idKeys},true);
  return record;
}
async function saveChecklist(record){
  return saveEntity('checklists','Checklist',checklistId(record),record,['Checklist ID','checklistId']);
}
function templateRecord(job,type){
  const template=CHECKLIST_TEMPLATES[type],id=uid('CHECKLIST'),items=template.items.map((label,index)=>({id:`${type}-${index+1}`,label,required:true}));
  return {'Checklist ID':id,'Business ID':app()?.businessId,'Job ID':jobId(job),'Checklist Name':template.name,'Checklist Type':type,'Status':'Open','Required Before':template.requiredBefore,'Items JSON':JSON.stringify(items),'Completed Items JSON':'[]','Created Time':now(),'Updated Time':now(),'Record Version':1};
}
async function addChecklist(job,type){
  const template=CHECKLIST_TEMPLATES[type];
  if(!template)throw new Error('Checklist template is unavailable.');
  const existing=checklistRowsForJob(job).find(row=>upper(val(row,'Checklist Type'))===type);
  if(existing)throw new Error(`${template.name} already exists for this job.`);
  await saveChecklist(templateRecord(job,type));
}
async function toggleChecklistItem(id,itemId){
  const row=rec('checklists').find(x=>checklistId(x)===id);
  if(!row)throw new Error('Checklist no longer exists.');
  const items=parseJson(val(row,'Items JSON'),[]),done=parseJson(val(row,'Completed Items JSON'),[]);
  const next=done.includes(itemId)?done.filter(x=>x!==itemId):[...done,itemId];
  const updated={...row,'Completed Items JSON':JSON.stringify(next),'Status':items.length&&next.length>=items.length?'Complete':'Open','Updated Time':now(),'Record Version':num(val(row,'Record Version'))+1};
  delete updated.__localPending;
  await saveChecklist(updated);
}
async function createChangeOrder(job,data){
  const id=uid('CHANGE'),quotes=quoteRowsForJob(job),q=latest(quotes.filter(quoteAccepted))||latest(quotes);
  const record={'Change Order ID':id,'Business ID':app()?.businessId,'Job ID':jobId(job),'Quote ID':q?quoteId(q):'','Title':text(data.title).trim()||'Job change','Description':text(data.description).trim(),'Amount':num(data.amount),'Status':'Draft — Owner Review Required','Customer Approval Required':true,'Created Time':now(),'Updated Time':now(),'Record Version':1};
  await saveEntity('changeOrders','Change Order',id,record,['Change Order ID','changeOrderId']);
}
async function createFollowUp(item){
  const id=uid('FOLLOWUP'),job=item.jobId?rec('jobs').find(row=>jobId(row)===item.jobId):null;
  const suggested=item.kind==='QUOTE'?'Check whether the customer has questions about the proposal and whether a revision is needed.':item.kind==='INVOICE'?'Confirm the customer received the invoice and ask whether anything is blocking payment.':item.kind==='REQUEST'?'Review the request and contact the customer to confirm scope and timing.':`Resolve: ${item.detail}`;
  const record={'Follow-up ID':id,'Business ID':app()?.businessId,'Job ID':item.jobId||'','Customer ID':item.customerId||customerId(job||{}),'Related Type':item.kind,'Related ID':item.quoteId||item.invoiceId||rid(item.record,'Request ID')||item.jobId||'','Title':item.title,'Suggested Action':suggested,'Status':'Open — Internal Draft','Due Time':now(),'Created Time':now(),'Updated Time':now(),'Record Version':1};
  await saveEntity('followUps','Follow-up',id,record,['Follow-up ID','followUpId']);
  const taskId=uid('TASK'),task={'Task ID':taskId,'Business ID':app()?.businessId,'Job ID':item.jobId||'','Task Title':`Follow up: ${item.title}`,'Assigned User ID':app()?.snapshot?.user?.userId||'','Priority':item.priority===1?'High':'Normal','Status':'Open','Due Time':now(),'Created Time':now(),'Updated Time':now(),'Record Version':1};
  await saveEntity('tasks','Task',taskId,task,['Task ID','taskId']);
}
function nextRecurringDate(date,every,unit){
  const d=date?new Date(`${text(date).slice(0,10)}T12:00:00`):new Date();
  const n=Math.max(1,Math.round(num(every)||1));
  if(unit==='Days')d.setDate(d.getDate()+n);
  else if(unit==='Weeks')d.setDate(d.getDate()+n*7);
  else if(unit==='Months')d.setMonth(d.getMonth()+n);
  else d.setFullYear(d.getFullYear()+n);
  return d.toISOString().slice(0,10);
}
async function createRecurringPlan(job,data){
  const id=uid('RECUR'),record={'Recurring Plan ID':id,'Business ID':app()?.businessId,'Job ID':jobId(job),'Customer ID':customerId(job),'Plan Name':text(data.planName).trim()||val(job,'Project Title')||'Recurring service','Every':Math.max(1,Math.round(num(data.every)||1)),'Unit':data.unit||'Weeks','Next Visit Date':data.nextDate,'Status':'Active','Created Time':now(),'Updated Time':now(),'Record Version':1};
  await saveEntity('recurringPlans','Recurring Plan',id,record,['Recurring Plan ID','recurringPlanId']);
}
async function generateRecurringVisit(plan){
  const jid=text(val(plan,'Job ID')),job=rec('jobs').find(row=>jobId(row)===jid);
  if(!job)throw new Error('Recurring plan job is missing.');
  const start=text(val(plan,'Next Visit Date'));
  if(!start)throw new Error('Set the next visit date first.');
  const scheduleId=uid('SCHEDULE'),record={'Schedule Event ID':scheduleId,'Business ID':app()?.businessId,'Job ID':jid,'Customer ID':customerId(job),'Title':val(plan,'Plan Name')||val(job,'Project Title'),'Start Time':`${start}T08:00`,'End Time':`${start}T10:00`,'Location':'','Status':'Planned','Created Time':now(),'Updated Time':now(),'Record Version':1};
  await saveEntity('scheduleEvents','Schedule Event',scheduleId,record,['Schedule Event ID','scheduleEventId']);
  const updated={...plan,'Last Generated Date':start,'Next Visit Date':nextRecurringDate(start,val(plan,'Every'),val(plan,'Unit')),'Updated Time':now(),'Record Version':num(val(plan,'Record Version'))+1};
  delete updated.__localPending;
  await saveEntity('recurringPlans','Recurring Plan',rid(plan,'Recurring Plan ID','recurringPlanId'),updated,['Recurring Plan ID','recurringPlanId']);
}
function checklistHtml(context){
  const rows=context.checklists;
  const templates=Object.keys(CHECKLIST_TEMPLATES);
  return `<div class="h38-life-checklists">${rows.length?rows.map(row=>{
    const items=parseJson(val(row,'Items JSON'),[]),done=parseJson(val(row,'Completed Items JSON'),[]),id=checklistId(row);
    return `<details class="h38-life-checklist" ${!checklistComplete(row)?'open':''}><summary><strong>${esc(val(row,'Checklist Name'))}</strong><span>${done.length}/${items.length} · ${esc(val(row,'Required Before'))}</span></summary><div>${items.map(item=>`<label class="h38-life-check"><input type="checkbox" data-life-check="${esc(id)}" data-life-item="${esc(item.id)}" ${done.includes(item.id)?'checked':''}><span>${esc(item.label)}</span></label>`).join('')}</div></details>`;
  }).join(''):'<p class="muted small">No required checklists have been attached yet.</p>'}<div class="h38-life-template-actions">${templates.map(type=>`<button type="button" class="secondary" data-add-life-checklist="${type}" ${rows.some(row=>upper(val(row,'Checklist Type'))===type)?'disabled':''}>+ ${esc(CHECKLIST_TEMPLATES[type].name)}</button>`).join('')}</div></div>`;
}
function lifecycleProgress(context){
  const index=Math.max(0,STAGES.findIndex(([key])=>key===context.stage));
  return `<div class="h38-life-progress" aria-label="Job lifecycle">${STAGES.map(([key,label],i)=>`<span class="${i<index?'done':i===index?'current':''}" title="${esc(label)}">${i+1}</span>`).join('')}</div>`;
}
function costingHtml(cost){
  return `<div class="h38-life-cost-grid"><div><strong>${moneyValue(cost.revenue)}</strong><span>Quoted / billed revenue</span></div><div><strong>${moneyValue(cost.knownCost)}</strong><span>Known actual cost</span></div><div><strong>${cost.hours.toFixed(1)}</strong><span>Labor hours</span></div><div><strong>${moneyValue(cost.projectedKnown)}</strong><span>${cost.laborUnpriced?'Known margin before unpriced labor':'Known gross profit'}</span></div><div><strong>${cost.revenue?cost.knownMargin.toFixed(1)+'%':'—'}</strong><span>Known margin</span></div><div><strong>${moneyValue(cost.committed)}</strong><span>Material commitments</span></div></div>${cost.laborUnpriced?`<div class="notice warn">Labor hours exist but no labor cost is stored. H38 will not invent a labor rate.</div>`:''}`;
}
function portalHtml(context){
  const jid=context.jid,cid=customerId(context.job);
  const docs=rec('documents').filter(row=>text(val(row,'Job ID'))===jid||(!val(row,'Job ID')&&text(val(row,'Source ID'))===jid));
  const customerDocs=docs.filter(row=>/CUSTOMER AVAILABLE|CUSTOMER RELEASED|SHARED/.test(upper(val(row,'Access Classification'))));
  const internalDocs=docs.length-customerDocs.length;
  const lastPortal=latest(rec('portalMessages').filter(row=>text(val(row,'Job ID'))===jid||(!val(row,'Job ID')&&text(val(row,'Customer ID'))===cid)));
  return `<div class="h38-life-portal"><div class="stats"><div class="stat"><strong>${customerDocs.length}</strong><span>Customer available files</span></div><div class="stat"><strong>${internalDocs}</strong><span>Internal / unreleased files</span></div></div><p class="muted small">${lastPortal?`Last portal message: ${dateTimeValue(val(lastPortal,'Created Time'))}`:'No job status message prepared for the customer portal yet.'}</p><button type="button" class="secondary" id="h38PreparePortalUpdate">Prepare portal update</button><p class="muted small">This prepares an internal portal draft only. It does not send or release anything automatically.</p></div>`;
}
async function preparePortalUpdate(context){
  const id=uid('PORTAL-MESSAGE'),cid=customerId(context.job);
  const body=`Project update: ${val(context.job,'Project Title')||'Job'} is at ${context.stageLabel}. Next expected step: ${context.next}`;
  const record={'Portal Message ID':id,'Business ID':app()?.businessId,'Portal Thread ID':`PORTAL-JOB-${context.jid}`,'Customer ID':cid,'Job ID':context.jid,'Body':body,'Direction':'Outbound Draft','Status':'Draft — Customer Release Required','Created By':app()?.snapshot?.user?.userId||'','Created Time':now(),'Record Version':1};
  await saveEntity('portalMessages','Portal Message',id,record,['Portal Message ID','portalMessageId']);
}
function jobOptions(selected){
  return rec('jobs').filter(row=>!/CANCEL|ARCHIV/.test(upper(val(row,'Status')))).map(row=>`<option value="${esc(jobId(row))}" ${jobId(row)===selected?'selected':''}>${esc(val(row,'Job Number')||'Job')} — ${esc(val(row,'Project Title')||'Untitled')}</option>`).join('');
}
let selectedJob='';
function workPanel(){
  const jobs=rec('jobs').filter(row=>!/CANCEL|ARCHIV/.test(upper(val(row,'Status'))));
  if(!jobs.length)return `<section class="card h38-life-work"><h2>Job Lifecycle</h2><p>No jobs yet. Create a job to use lifecycle controls.</p></section>`;
  if(!jobs.some(row=>jobId(row)===selectedJob))selectedJob=jobId(jobs[0]);
  const job=jobs.find(row=>jobId(row)===selectedJob)||jobs[0],context=lifecycle(job),changes=rec('changeOrders').filter(row=>rowMatchesJob(row,job,false)),plans=rec('recurringPlans').filter(row=>rowMatchesJob(row,job,false));
  const blockers=[...context.blockers,...context.warnings];
  return `<section class="card h38-life-work"><div class="h38-life-head"><div><span class="h38-life-kicker">JOB LIFECYCLE</span><h2>${esc(val(job,'Project Title')||'Job')}</h2><p>${esc(context.stageLabel)} · ${esc(context.next)}</p></div><div><label for="h38LifecycleJob">Job</label><select id="h38LifecycleJob">${jobOptions(selectedJob)}</select></div></div>${lifecycleProgress(context)}<div class="h38-life-columns"><div><h3>Next action</h3><div class="h38-life-next"><strong>${esc(context.next)}</strong>${blockers.length?`<ul>${blockers.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<p class="good-text">No lifecycle blockers detected.</p>'}</div><h3>Required checklists</h3>${checklistHtml(context)}</div><div><h3>Job costing</h3>${costingHtml(context.cost)}<h3>Customer portal staging</h3>${portalHtml(context)}</div></div><div class="h38-life-columns"><div><h3>Change order draft</h3><form id="h38ChangeOrderForm"><label>Title</label><input name="title" placeholder="Additional work"><label>Description</label><textarea name="description" required></textarea><label>Estimated customer amount</label><input name="amount" type="number" step="0.01"><div class="actions"><button>Prepare change order</button></div></form><div class="list">${changes.length?changes.map(row=>`<div class="row"><div class="row-top"><strong>${esc(val(row,'Title')||'Change')}</strong>${typeof window.pill==='function'?window.pill(val(row,'Status')):`<span>${esc(val(row,'Status'))}</span>`}</div><small>${moneyValue(val(row,'Amount'))} · ${esc(val(row,'Description'))}</small></div>`).join(''):'<p class="muted small">No change orders.</p>'}</div></div><div><h3>Recurring / multi-visit work</h3><form id="h38RecurringForm"><label>Plan name</label><input name="planName" placeholder="${esc(val(job,'Project Title')||'Recurring service')}"><div class="two"><div><label>Every</label><input name="every" type="number" min="1" value="1"></div><div><label>Unit</label><select name="unit"><option>Weeks</option><option>Months</option><option>Days</option><option>Years</option></select></div></div><label>Next visit</label><input name="nextDate" type="date" required><div class="actions"><button>Save recurring plan</button></div></form><div class="list">${plans.length?plans.map(row=>`<div class="row"><div class="row-top"><strong>${esc(val(row,'Plan Name'))}</strong><button type="button" class="secondary" data-generate-recurring="${esc(rid(row,'Recurring Plan ID','recurringPlanId'))}">Create next visit</button></div><small>Every ${esc(val(row,'Every'))} ${esc(val(row,'Unit'))} · next ${dateOnlyValue(val(row,'Next Visit Date'))}</small></div>`).join(''):'<p class="muted small">No recurring plan.</p>'}</div></div></div></section>`;
}
function bindWorkPanel(){
  const jobSelect=document.getElementById('h38LifecycleJob');
  if(jobSelect)jobSelect.onchange=()=>{selectedJob=jobSelect.value;window.renderWork();};
  document.querySelectorAll('[data-add-life-checklist]').forEach(button=>button.onclick=async()=>{
    try{const job=rec('jobs').find(row=>jobId(row)===selectedJob);await addChecklist(job,button.dataset.addLifeChecklist);if(typeof window.toast==='function')window.toast('Checklist attached.');window.renderWork();}catch(error){window.toast?.(error.message,true);}
  });
  document.querySelectorAll('[data-life-check]').forEach(input=>input.onchange=async()=>{
    try{await toggleChecklistItem(input.dataset.lifeCheck,input.dataset.lifeItem);window.renderWork();}catch(error){window.toast?.(error.message,true);}
  });
  const changeForm=document.getElementById('h38ChangeOrderForm');
  if(changeForm)changeForm.onsubmit=async event=>{
    event.preventDefault();
    try{const job=rec('jobs').find(row=>jobId(row)===selectedJob);const data=Object.fromEntries(new FormData(changeForm));await createChangeOrder(job,data);window.toast?.('Change order draft saved. Nothing sent or approved.');window.renderWork();}catch(error){window.toast?.(error.message,true);}
  };
  const recurringForm=document.getElementById('h38RecurringForm');
  if(recurringForm)recurringForm.onsubmit=async event=>{
    event.preventDefault();
    try{const job=rec('jobs').find(row=>jobId(row)===selectedJob);const data=Object.fromEntries(new FormData(recurringForm));await createRecurringPlan(job,data);window.toast?.('Recurring plan saved.');window.renderWork();}catch(error){window.toast?.(error.message,true);}
  };
  document.querySelectorAll('[data-generate-recurring]').forEach(button=>button.onclick=async()=>{
    try{const plan=rec('recurringPlans').find(row=>rid(row,'Recurring Plan ID','recurringPlanId')===button.dataset.generateRecurring);await generateRecurringVisit(plan);window.toast?.('Next recurring visit created on the schedule.');window.renderWork();}catch(error){window.toast?.(error.message,true);}
  });
  const portal=document.getElementById('h38PreparePortalUpdate');
  if(portal)portal.onclick=async()=>{
    try{const job=rec('jobs').find(row=>jobId(row)===selectedJob);await preparePortalUpdate(lifecycle(job));window.toast?.('Portal update prepared as a draft. Nothing sent.');window.renderWork();}catch(error){window.toast?.(error.message,true);}
  };
}
function todayPanel(){
  const contexts=allLifecycle(),needs=attention(),active=contexts.filter(x=>!['WARRANTY'].includes(x.stage));
  const blockers=contexts.filter(x=>x.blockers.length).length,followCount=needs.filter(x=>['QUOTE','INVOICE','REQUEST'].includes(x.kind)).length;
  return `<section class="card h38-life-today"><div class="h38-life-head"><div><span class="h38-life-kicker">OPERATING CONTROL</span><h2>Job lifecycle & next actions</h2><p>The Office is watching for the next required step; no customer or financial action happens automatically.</p></div><button type="button" class="secondary" id="h38OpenLifecycleSearch">Search Office</button></div><div class="stats"><div class="stat"><strong>${active.length}</strong><span>Active jobs</span></div><div class="stat"><strong>${blockers}</strong><span>Jobs blocked</span></div><div class="stat"><strong>${followCount}</strong><span>Follow-ups due</span></div><div class="stat"><strong>${rec('recurringPlans').filter(r=>upper(val(r,'Status'))==='ACTIVE').length}</strong><span>Recurring plans</span></div></div><div class="h38-life-columns"><div><h3>Jobs needing a next step</h3><div class="list">${contexts.slice(0,12).map(x=>`<button type="button" class="row h38-life-job-row" data-life-job="${esc(x.jid)}"><div class="row-top"><strong>${esc(val(x.job,'Project Title')||val(x.job,'Job Number'))}</strong><span class="h38-life-stage">${esc(x.stageLabel)}</span></div><small>${esc(x.next)}</small></button>`).join('')||'<p class="muted small">No active jobs.</p>'}</div></div><div><h3>Follow-up queue</h3><div class="list">${needs.slice(0,12).map((item,index)=>`<div class="row"><div class="row-top"><strong>${esc(item.title)}</strong><button type="button" class="secondary" data-life-follow="${index}">Prepare</button></div><small>${esc(item.detail)}</small></div>`).join('')||'<p class="muted small">No overdue follow-ups or lifecycle blockers.</p>'}</div></div></div></section>`;
}
function bindTodayPanel(){
  const needs=attention();
  document.querySelectorAll('[data-life-job]').forEach(button=>button.onclick=()=>{selectedJob=button.dataset.lifeJob;window.openPage?.('work');});
  document.querySelectorAll('[data-life-follow]').forEach(button=>button.onclick=async()=>{
    try{const item=needs[Number(button.dataset.lifeFollow)];if(!item)return;await createFollowUp(item);window.toast?.('Internal follow-up and task prepared. Nothing sent.');window.renderToday();}catch(error){window.toast?.(error.message,true);}
  });
  const search=document.getElementById('h38OpenLifecycleSearch');if(search)search.onclick=openSearch;
}
function moneyPanel(){
  const jobs=rec('jobs');
  return `<section class="card h38-life-money"><div class="h38-life-head"><div><span class="h38-life-kicker">FIELD COST CAPTURE</span><h2>Receipt & mileage</h2><p>Attach real costs to the job while they are fresh. H38 records miles; it does not invent a reimbursement or tax rate.</p></div></div><div class="h38-life-columns"><form id="h38ReceiptForm"><h3>Receipt / expense</h3><label>Job</label><select name="jobId"><option value="">No job</option>${jobs.map(row=>`<option value="${esc(jobId(row))}">${esc(val(row,'Project Title')||val(row,'Job Number'))}</option>`).join('')}</select><label>Receipt photo</label><input name="receipt" type="file" accept="image/*,application/pdf"><div class="two"><div><label>Vendor</label><input name="vendor"></div><div><label>Date</label><input name="expenseDate" type="date"></div></div><div class="two"><div><label>Amount</label><input name="amount" type="number" step="0.01" required></div><div><label>Category</label><input name="category" value="Materials / field purchase"></div></div><label>Description</label><input name="description" placeholder="Blocks, fuel, supplies…"><div class="actions"><button>Save expense + receipt</button></div></form><form id="h38MileageForm"><h3>Mileage</h3><label>Job</label><select name="jobId"><option value="">No job</option>${jobs.map(row=>`<option value="${esc(jobId(row))}">${esc(val(row,'Project Title')||val(row,'Job Number'))}</option>`).join('')}</select><div class="two"><div><label>Date</label><input name="tripDate" type="date" required></div><div><label>Miles</label><input name="miles" type="number" min="0" step="0.1" required></div></div><label>Purpose</label><input name="purpose" required placeholder="Site visit, material pickup…"><div class="two"><div><label>From</label><input name="origin"></div><div><label>To</label><input name="destination"></div></div><div class="actions"><button>Record mileage</button></div></form></div><div class="list">${rec('mileageEntries').slice(0,20).map(row=>`<div class="row"><div class="row-top"><strong>${esc(val(row,'Purpose'))}</strong><span>${num(val(row,'Miles')).toFixed(1)} mi</span></div><small>${dateOnlyValue(val(row,'Trip Date'))} · ${esc(val(row,'Origin'))}${val(row,'Destination')?` → ${esc(val(row,'Destination'))}`:''}</small></div>`).join('')||'<p class="muted small">No mileage recorded.</p>'}</div></section>`;
}
function bindMoneyPanel(){
  const receipt=document.getElementById('h38ReceiptForm');
  if(receipt)receipt.onsubmit=async event=>{
    event.preventDefault();
    try{
      const data=Object.fromEntries(new FormData(receipt)),id=uid('EXPENSE'),record={'Expense ID':id,'Business ID':app()?.businessId,'Job ID':data.jobId,'Category':data.category,'Vendor':data.vendor,'Description':data.description||data.vendor||'Receipt expense','Expense Date':data.expenseDate,'Amount':num(data.amount),'Status':'Recorded — Accounting Review','Created Time':now(),'Updated Time':now(),'Record Version':1};
      await saveEntity('expenses','Expense',id,record,['Expense ID','expenseId']);
      const file=receipt.elements.receipt?.files?.[0];
      if(file&&typeof window.handleAttachmentFiles==='function')await window.handleAttachmentFiles([file],'Expense',id,'Internal');
      window.toast?.('Expense and receipt saved.');window.renderMoney();
    }catch(error){window.toast?.(error.message,true);}
  };
  const mileage=document.getElementById('h38MileageForm');
  if(mileage)mileage.onsubmit=async event=>{
    event.preventDefault();
    try{const data=Object.fromEntries(new FormData(mileage)),id=uid('MILEAGE'),record={'Mileage ID':id,'Business ID':app()?.businessId,'Job ID':data.jobId,'Trip Date':data.tripDate,'Miles':num(data.miles),'Purpose':data.purpose,'Origin':data.origin,'Destination':data.destination,'Status':'Recorded','Created Time':now(),'Updated Time':now(),'Record Version':1};await saveEntity('mileageEntries','Mileage',id,record,['Mileage ID','mileageId']);window.toast?.('Mileage recorded.');window.renderMoney();}catch(error){window.toast?.(error.message,true);}
  };
}
function assistantBrief(){
  const needs=attention(),contexts=allLifecycle(),blocked=contexts.filter(x=>x.blockers.length),due=needs.filter(x=>['QUOTE','INVOICE','REQUEST'].includes(x.kind));
  return `<section class="card h38-life-assistant"><div class="h38-life-head"><div><span class="h38-life-kicker">ASSISTANT READY</span><h2>Business context</h2><p>H38 AI can read this operating state and prepare work, while sending, approval, purchase and payment actions remain gated.</p></div></div><div class="stats"><div class="stat"><strong>${contexts.length}</strong><span>Jobs in lifecycle</span></div><div class="stat"><strong>${blocked.length}</strong><span>Blocked</span></div><div class="stat"><strong>${due.length}</strong><span>Customer follow-ups</span></div><div class="stat"><strong>${rec('mileageEntries').length}</strong><span>Mileage entries</span></div></div><div class="actions"><button type="button" class="secondary" data-assistant-question="What should I do today?">What should I do today?</button><button type="button" class="secondary" data-assistant-question="Which jobs are blocked and why?">Show blocked jobs</button><button type="button" class="secondary" data-assistant-question="Which quotes or invoices need follow-up?">Show follow-ups</button><button type="button" class="secondary" id="h38AssistantSearch">Search everything</button></div></section>`;
}
function bindAssistantBrief(){
  document.querySelectorAll('[data-assistant-question]').forEach(button=>button.onclick=()=>{
    const form=document.getElementById('aiForm'),textarea=form?.querySelector('[name="question"]');
    if(textarea){textarea.value=button.dataset.assistantQuestion;textarea.focus();}
  });
  const search=document.getElementById('h38AssistantSearch');if(search)search.onclick=openSearch;
}
let searchDialog=null;
function ensureSearch(){
  if(searchDialog)return searchDialog;
  searchDialog=document.createElement('dialog');searchDialog.id='h38OfficeSearchDialog';searchDialog.className='h38-office-search';
  searchDialog.innerHTML=`<form method="dialog" class="h38-search-shell"><header><div><strong>Search Business Office</strong><small>Customers, jobs, quotes, field records, money, documents and follow-up.</small></div><button value="cancel" class="icon-button" aria-label="Close">×</button></header><input id="h38OfficeSearchInput" type="search" autocomplete="off" placeholder="Search customer, job, quote, invoice, note…"><div id="h38OfficeSearchResults" class="h38-search-results"></div></form>`;
  document.body.appendChild(searchDialog);
  const input=document.getElementById('h38OfficeSearchInput');
  input.addEventListener('input',()=>renderSearch(input.value));
  return searchDialog;
}
function openSearch(){
  const dialog=ensureSearch(),input=document.getElementById('h38OfficeSearchInput');
  if(!dialog.open)dialog.showModal();
  input.value='';renderSearch('');setTimeout(()=>input.focus(),30);
}
function renderSearch(query){
  const node=document.getElementById('h38OfficeSearchResults');if(!node)return;
  const results=searchSnapshot(query);
  node.innerHTML=query.length<2?'<p class="muted">Type at least two characters.</p>':results.length?results.map((item,index)=>`<button type="button" data-search-result="${index}"><strong>${esc(item.label)} · ${esc(item.title)}</strong><small>${esc(item.subtitle)}</small></button>`).join(''):'<p class="muted">No matching Office records.</p>';
  node.querySelectorAll('[data-search-result]').forEach(button=>button.onclick=()=>{
    const item=results[Number(button.dataset.searchResult)];
    if(item?.collection==='jobs'){selectedJob=jobId(item.row);searchDialog.close();window.openPage?.('work');return;}
    const pageMap={customers:'customers',requests:'work',tasks:'work',scheduleEvents:'schedule',quotes:'quotes',siteCaptureSessions:'field',siteMeasurements:'measure',checklists:'work',changeOrders:'work',dailyLogs:'field',timeEntries:'field',expenses:'money',mileageEntries:'money',invoices:'money',payments:'money',documents:'documents',portalMessages:'messages',materialRequests:'inventory',maintenance:'fleet',recurringPlans:'work',followUps:'today'};
    searchDialog.close();window.openPage?.(pageMap[item?.collection]||'today');
  });
}
function installSearchButton(){
  if(document.getElementById('h38OfficeSearchButton'))return;
  const ai=document.getElementById('globalAiButton'),container=ai?.parentElement;
  if(!container)return;
  const button=document.createElement('button');button.id='h38OfficeSearchButton';button.className='icon-button';button.type='button';button.setAttribute('aria-label','Search Business Office');button.textContent='⌕';button.onclick=openSearch;
  container.insertBefore(button,ai);
}
function enrichAi(){
  if(typeof window.aiContext==='function'&&!window.aiContext.__h38Lifecycle){
    const original=window.aiContext;
    const wrapped=function(){
      const base=original();
      const contexts=allLifecycle().slice(0,30).map(x=>({jobId:x.jid,title:val(x.job,'Project Title'),stage:x.stageLabel,next:x.next,blockers:x.blockers,warnings:x.warnings,cost:{revenue:x.cost.revenue,knownCost:x.cost.knownCost,hours:x.cost.hours,knownMargin:x.cost.knownMargin}}));
      return {...base,operatingControl:{jobs:contexts,followUps:attention().slice(0,20).map(x=>({kind:x.kind,title:x.title,detail:x.detail})),authority:{read:'automatic',prepare:'drafts/internal records allowed',external:'explicit owner/customer authorization required'}}};
    };
    wrapped.__h38Lifecycle=true;window.aiContext=wrapped;
  }
  if(typeof window.localAi==='function'&&!window.localAi.__h38Lifecycle){
    const fallback=window.localAi;
    const wrapped=function(question){
      const q=text(question).toLowerCase();
      if(/what.*do today|what should i do|next.*today/.test(q)){
        const list=attention().slice(0,8);
        return list.length?`Today's priority queue:\n${list.map((x,i)=>`${i+1}. ${x.title} — ${x.detail}`).join('\n')}`:'No overdue follow-ups or lifecycle blockers are visible in the cached Office.';
      }
      if(/blocked|blocker/.test(q)){
        const list=allLifecycle().filter(x=>x.blockers.length||x.warnings.length).slice(0,10);
        return list.length?list.map(x=>`${val(x.job,'Project Title')}: ${[...x.blockers,...x.warnings].join('; ')}. Next: ${x.next}`).join('\n\n'):'No job blockers are visible in the cached Office.';
      }
      if(/follow.?up|quote.*invoice.*need/.test(q)){
        const list=attention().filter(x=>['QUOTE','INVOICE','REQUEST'].includes(x.kind)).slice(0,10);
        return list.length?list.map(x=>`${x.title}: ${x.detail}`).join('\n'):'No overdue quote, invoice or request follow-up is visible.';
      }
      if(/margin|profit|cost/.test(q)){
        const list=allLifecycle().slice(0,10);
        return list.length?list.map(x=>`${val(x.job,'Project Title')}: revenue ${moneyValue(x.cost.revenue)}, known cost ${moneyValue(x.cost.knownCost)}, ${x.cost.revenue?x.cost.knownMargin.toFixed(1)+'% known margin':'margin unavailable'}${x.cost.laborUnpriced?' (labor hours are unpriced)':''}`).join('\n'):'No jobs are available for costing.';
      }
      if(/^find |^search |show me everything/.test(q)){
        const term=question.replace(/^(find|search|show me everything (about|for)?)\s*/i,'').trim(),results=searchSnapshot(term).slice(0,12);
        return results.length?results.map(x=>`${x.label}: ${x.title}${x.subtitle?' — '+x.subtitle:''}`).join('\n'):`I did not find "${term}" in the cached Office.`;
      }
      return fallback(question);
    };
    wrapped.__h38Lifecycle=true;window.localAi=wrapped;
  }
}
function completionGate(){
  if(typeof window.queueOperation!=='function'||window.queueOperation.__h38LifecycleGate)return;
  const original=window.queueOperation;
  const wrapped=async function(action,recordType,recordId,payload,optimistic,autoSync){
    const record=optimistic?.record||payload?.record||payload?.__h38Record?.record||null;
    const type=upper(recordType),status=upper(val(record||{},'Status','status')||payload?.status);
    if((type==='JOB'||/JOB/.test(type))&&/COMPLETE|CLOSED/.test(status)){
      const existing=rec('jobs').find(row=>jobId(row)===text(recordId))||record;
      if(existing){
        const quality=requiredChecklist(existing,'Complete').filter(row=>!checklistComplete(row)),close=requiredChecklist(existing,'Closed').filter(row=>!checklistComplete(row)),changes=openChangeOrders(existing);
        const blockers=[];
        if(/COMPLETE/.test(status)&&quality.length)blockers.push(`${quality.length} required completion checklist(s)`);
        if(/CLOSED/.test(status)&&close.length)blockers.push(`${close.length} required closeout checklist(s)`);
        if(changes.length)blockers.push(`${changes.length} unresolved change order(s)`);
        if(blockers.length)throw new Error(`Job cannot be marked ${status.toLowerCase()} yet: ${blockers.join(', ')}.`);
      }
    }
    return original(action,recordType,recordId,payload,optimistic,autoSync);
  };
  wrapped.__h38LifecycleGate=true;window.queueOperation=wrapped;
}
function wrapRenderers(){
  if(typeof window.renderToday==='function'&&!window.renderToday.__h38Lifecycle){
    const original=window.renderToday,wrapped=function(){original();const grid=document.querySelector('#mainContent > .grid');if(grid)grid.insertAdjacentHTML('beforebegin',todayPanel());bindTodayPanel();};wrapped.__h38Lifecycle=true;window.renderToday=wrapped;
  }
  if(typeof window.renderWork==='function'&&!window.renderWork.__h38Lifecycle){
    const original=window.renderWork,wrapped=function(){original();const grid=document.querySelector('#mainContent > .grid');if(grid)grid.insertAdjacentHTML('beforebegin',workPanel());bindWorkPanel();};wrapped.__h38Lifecycle=true;window.renderWork=wrapped;
  }
  if(typeof window.renderMoney==='function'&&!window.renderMoney.__h38Lifecycle){
    const original=window.renderMoney,wrapped=function(){original();const grid=document.querySelector('#mainContent > .grid');if(grid)grid.insertAdjacentHTML('beforebegin',moneyPanel());bindMoneyPanel();};wrapped.__h38Lifecycle=true;window.renderMoney=wrapped;
  }
  if(typeof window.renderAi==='function'&&!window.renderAi.__h38Lifecycle){
    const original=window.renderAi,wrapped=function(){original();const grid=document.querySelector('#mainContent > .grid');if(grid)grid.insertAdjacentHTML('beforebegin',assistantBrief());bindAssistantBrief();};wrapped.__h38Lifecycle=true;window.renderAi=wrapped;
  }
}
function start(){
  wrapRenderers();installSearchButton();enrichAi();completionGate();
  window.H38_JOB_LIFECYCLE={
    build:BUILD,stages:STAGES.map(([key,label])=>({key,label})),analyzeJob:lifecycle,all:allLifecycle,
    attention,search:searchSnapshot,openSearch,prepareFollowUp:createFollowUp,
    authority:{readAutomatic:true,prepareInternalDrafts:true,externalActionsRequireExplicitAuthorization:true},
    features:{nextAction:true,requiredChecklists:true,completionGates:true,changeOrders:true,jobCosting:true,followUpQueue:true,receiptCapture:true,mileage:true,portalStaging:true,recurringWork:true,globalSearch:true,assistantContext:true},
    automaticCustomerSending:false,automaticApproval:false,automaticPurchasing:false,automaticPayment:false
  };
  if(app()?.snapshot&&typeof window.renderPage==='function')window.renderPage();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();