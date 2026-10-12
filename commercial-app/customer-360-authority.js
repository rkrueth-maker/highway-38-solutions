(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.H38_CUSTOMER_360=api;if(root.document)api.install(root);}
})(typeof window!=='undefined'?window:null,function(){
'use strict';
const BUILD='20260922-customer-workspace-layout-authority-5';
const INTERNAL_FINANCIAL=new Set(['expenses','purchases','purchaseOrders','vendorBills','payroll','payrollRuns','tax','taxRecords','contractorCostChecklists','contractorPricingPolicy','priceBookCostHistory','internalCosting']);
const INTERNAL_BUSINESS=new Set(['usageLogs','trialBenchmarks','aiRecommendations','proofLog','errorLog','moduleSettings','providers','quickActions','aiKnowledge','roles','users','inventoryTransactions','assets','maintenance','socialMetrics']);
const CUSTOMER_COLLECTIONS=['customers','properties','requests','jobs','workOrders','tasks','scheduleEvents','conversations','messages','emailThreads','emailMessages','smsThreads','smsMessages','portalThreads','portalMessages','quotes','quoteRevisions','meetings','siteCaptureSessions','siteMeasurements','checklists','changeOrders','timeEntries','jobNotes','dailyLogs','documents','invoices','payments','materialRequests','assignments','inspections','recurringPlans','followUps','communicationLogs'];
const CHILD_LABELS={properties:'Locations',requests:'Requests',jobs:'Jobs',workOrders:'Work orders',tasks:'Tasks',scheduleEvents:'Schedule',conversations:'Conversations',messages:'Messages',emailThreads:'Email',emailMessages:'Email',smsThreads:'SMS',smsMessages:'SMS',portalThreads:'Portal',portalMessages:'Portal',quotes:'Quotes',quoteRevisions:'Quote revisions',meetings:'Meetings',siteCaptureSessions:'Site visits',siteMeasurements:'Measurements',checklists:'Checklists',changeOrders:'Change orders',timeEntries:'Time',jobNotes:'Notes',dailyLogs:'Daily logs',documents:'Files',invoices:'Invoices',payments:'Payments',materialRequests:'Materials',assignments:'Assignments',inspections:'Inspections',recurringPlans:'Recurring work',followUps:'Follow-ups',communicationLogs:'Communications'};
const ID_KEYS={
  customers:['Customer ID','customerId','id'],properties:['Property ID','propertyId','id'],requests:['Request ID','requestId','id'],jobs:['Job ID','jobId','id'],workOrders:['Work Order ID','workOrderId','id'],tasks:['Task ID','taskId','id'],scheduleEvents:['Schedule Event ID','scheduleEventId','id'],conversations:['Conversation ID','conversationId','id'],messages:['Message ID','messageId','id'],emailThreads:['Email Thread ID','emailThreadId','id'],emailMessages:['Email Message ID','emailMessageId','id'],smsThreads:['SMS Thread ID','smsThreadId','id'],smsMessages:['SMS Message ID','smsMessageId','id'],portalThreads:['Portal Thread ID','portalThreadId','id'],portalMessages:['Portal Message ID','portalMessageId','id'],quotes:['Quote ID','quoteId','id'],quoteRevisions:['Quote Revision ID','quoteRevisionId','Revision ID','revisionId','id'],meetings:['Meeting ID','meetingId','id'],siteCaptureSessions:['Site Visit ID','visitId','Session ID','sessionId','id'],siteMeasurements:['Measurement ID','measurementId','id'],checklists:['Checklist ID','checklistId','id'],changeOrders:['Change Order ID','changeOrderId','id'],timeEntries:['Time Entry ID','timeEntryId','id'],jobNotes:['Job Note ID','jobNoteId','Note ID','noteId','id'],dailyLogs:['Daily Log ID','dailyLogId','id'],documents:['Document ID','documentId','id'],invoices:['Invoice ID','invoiceId','id'],payments:['Payment ID','paymentId','id'],materialRequests:['Material Request ID','materialRequestId','id'],assignments:['Assignment ID','assignmentId','id'],inspections:['Inspection ID','inspectionId','id'],recurringPlans:['Recurring Plan ID','recurringPlanId','id'],followUps:['Follow-up ID','followUpId','id'],communicationLogs:['Communication Log ID','communicationLogId','id']
};
const DIRECT_CUSTOMER_KEYS=['Customer ID','customerId'];
const PARENT_LINKS=[
  ['Property ID','propertyId','properties'],['Job ID','jobId','jobs'],['Quote ID','quoteId','quotes'],['Request ID','requestId','requests'],['Meeting ID','meetingId','meetings'],['Site Visit ID','visitId','siteCaptureSessions'],['Capture Session ID','captureSessionId','siteCaptureSessions'],['Invoice ID','invoiceId','invoices'],['Conversation ID','conversationId','conversations'],['Portal Thread ID','portalThreadId','portalThreads']
];
const SOURCE_KEYS=['Source ID','sourceId','Related ID','relatedId','Parent ID','parentId','Reference ID','referenceId'];
function text(v){return String(v==null?'':v).trim();}
function value(row,...keys){for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';}
function rows(snapshot,name){return Array.isArray(snapshot?.[name])?snapshot[name]:[];}
function idFor(collection,row){const keys=ID_KEYS[collection]||['id'];return text(value(row,...keys));}
function normalizeToken(token){let t=text(token).toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'');if(t.length>4&&t.endsWith('s'))t=t.slice(0,-1);const map={hwy:'highway',hiway:'highway',route:'highway',rt:'highway',rd:'road',st:'street',ave:'avenue',av:'avenue',ln:'lane',dr:'drive',ct:'court',blvd:'boulevard'};return map[t]||t;}
function tokens(input){return text(input).toLowerCase().replace(/\bshow me\b|\bpull up\b|\bpull\b|\bfind\b|\bsearch\b|\bopen\b|\bcustomer\b|\bjob\b|\bon\b|\bfor\b|\bthe\b/g,' ').split(/[^a-z0-9'’]+/).map(normalizeToken).filter(t=>t.length>1);}
function searchableString(value){return tokens(typeof value==='string'?value:JSON.stringify(value||{})).join(' ');}
function unique(list){return Array.from(new Set(list.filter(Boolean)));}
function collectionAllowed(collection){return !INTERNAL_FINANCIAL.has(collection)&&!INTERNAL_BUSINESS.has(collection);}
function buildGraph(snapshot){
  const index={};const customerByKey={};const provenance={};
  CUSTOMER_COLLECTIONS.forEach(collection=>{index[collection]=new Map();rows(snapshot,collection).forEach(row=>{const id=idFor(collection,row);if(id)index[collection].set(id,row);});});
  rows(snapshot,'customers').forEach(row=>{const id=idFor('customers',row);if(id){customerByKey[`customers:${id}`]=id;provenance[`customers:${id}`]='DIRECT_CUSTOMER';}});
  const direct=(collection,row)=>text(value(row,...DIRECT_CUSTOMER_KEYS));
  CUSTOMER_COLLECTIONS.forEach(collection=>rows(snapshot,collection).forEach(row=>{const id=idFor(collection,row),cid=direct(collection,row);if(id&&cid){customerByKey[`${collection}:${id}`]=cid;provenance[`${collection}:${id}`]='DIRECT_CUSTOMER';}}));
  const relationshipHints=new Map();
  CUSTOMER_COLLECTIONS.forEach(collection=>rows(snapshot,collection).forEach(row=>{
    const cid=direct(collection,row);if(!cid)return;
    for(const [a,b,parentCollection] of PARENT_LINKS){const parentId=text(value(row,a,b));if(!parentId)continue;const key=`${parentCollection}:${parentId}`;if(!relationshipHints.has(key))relationshipHints.set(key,new Set());relationshipHints.get(key).add(cid);}
  }));
  relationshipHints.forEach((ids,key)=>{if(ids.size===1&&!customerByKey[key]){customerByKey[key]=Array.from(ids)[0];provenance[key]='UNIQUE_CHILD_CUSTOMER_HINT';}});
  function resolveParent(collection,row){
    const directId=direct(collection,row);if(directId)return{customerId:directId,via:'DIRECT_CUSTOMER'};
    for(const [a,b,parentCollection] of PARENT_LINKS){const parentId=text(value(row,a,b));if(!parentId)continue;const cid=customerByKey[`${parentCollection}:${parentId}`];if(cid)return{customerId:cid,via:`${parentCollection}:${parentId}`};}
    const sourceId=text(value(row,...SOURCE_KEYS));
    if(sourceId){for(const parentCollection of ['quotes','jobs','siteCaptureSessions','meetings','requests','invoices','properties','conversations']){const cid=customerByKey[`${parentCollection}:${sourceId}`];if(cid)return{customerId:cid,via:`${parentCollection}:${sourceId}`};}}
    return null;
  }
  for(let pass=0;pass<8;pass++){
    let changed=0;
    CUSTOMER_COLLECTIONS.forEach(collection=>{if(collection==='customers')return;rows(snapshot,collection).forEach(row=>{const id=idFor(collection,row);if(!id||customerByKey[`${collection}:${id}`])return;const found=resolveParent(collection,row);if(found){customerByKey[`${collection}:${id}`]=found.customerId;provenance[`${collection}:${id}`]=found.via;changed++;}});});
    if(!changed)break;
  }
  function customerIdFor(collection,row){const directId=direct(collection,row);if(directId)return directId;const id=idFor(collection,row);if(id&&customerByKey[`${collection}:${id}`])return customerByKey[`${collection}:${id}`];const found=resolveParent(collection,row);return found?.customerId||'';}
  return{index,customerByKey,provenance,customerIdFor};
}
function enrichSnapshot(snapshot){const graph=buildGraph(snapshot);let enriched=0;CUSTOMER_COLLECTIONS.forEach(collection=>{if(!collectionAllowed(collection)||collection==='customers')return;rows(snapshot,collection).forEach(row=>{if(text(value(row,...DIRECT_CUSTOMER_KEYS)))return;const cid=graph.customerIdFor(collection,row);if(!cid)return;row['Customer ID']=cid;row['Customer Link Source']=graph.provenance[`${collection}:${idFor(collection,row)}`]||'DERIVED_RELATIONSHIP';enriched++;});});return{graph:buildGraph(snapshot),enriched};}
function enrichRecord(snapshot,collection,record){if(!record||typeof record!=='object'||!collectionAllowed(collection)||collection==='customers')return record;const clone={...record};if(text(value(clone,...DIRECT_CUSTOMER_KEYS)))return clone;const temp={...snapshot,[collection]:[...rows(snapshot,collection),clone]};const graph=buildGraph(temp);const cid=graph.customerIdFor(collection,clone);if(cid){clone['Customer ID']=cid;clone['Customer Link Source']=graph.provenance[`${collection}:${idFor(collection,clone)}`]||'DERIVED_RELATIONSHIP';}return clone;}
function enrichOperation(snapshot,operation){if(!operation||typeof operation!=='object')return operation;const out={...operation,payload:operation.payload&&typeof operation.payload==='object'?{...operation.payload}:operation.payload};const embedded=out.payload?.__h38Record;if(embedded?.collection&&embedded?.record){const record=enrichRecord(snapshot,text(embedded.collection),embedded.record);out.payload={...out.payload,__h38Record:{...embedded,record}};if(record['Customer ID']&&!out.payload.customerId)out.payload.customerId=record['Customer ID'];return out;}
  const entity=text(out.payload?.entity||'');const rawRecord=out.payload?.record;if(entity&&rawRecord&&typeof rawRecord==='object'){const record=enrichRecord(snapshot,entity,rawRecord);out.payload={...out.payload,record};if(record['Customer ID']&&!out.payload.customerId)out.payload.customerId=record['Customer ID'];return out;}
  const jobId=text(out.payload?.jobId),quoteId=text(out.payload?.quoteId),customerId=text(out.payload?.customerId);if(!customerId&&(jobId||quoteId)){const graph=buildGraph(snapshot);const parent=jobId?graph.index.jobs?.get(jobId):graph.index.quotes?.get(quoteId);const cid=parent?graph.customerIdFor(jobId?'jobs':'quotes',parent):'';if(cid)out.payload={...out.payload,customerId:cid};}return out;
}
function enrichOperations(snapshot,operations){return(Array.isArray(operations)?operations:[]).map(op=>enrichOperation(snapshot,op));}
function customerBundle(snapshot,customerId){const graph=buildGraph(snapshot);const groups={};CUSTOMER_COLLECTIONS.forEach(collection=>{if(collection==='customers'||!collectionAllowed(collection))return;const matched=rows(snapshot,collection).filter(row=>graph.customerIdFor(collection,row)===customerId);if(matched.length)groups[collection]=matched;});const customer=rows(snapshot,'customers').find(row=>idFor('customers',row)===customerId)||null;return{customerId,customer,groups,graph};}
function latestRecord(bundle){let latest=null;Object.entries(bundle.groups||{}).forEach(([collection,list])=>list.forEach(row=>{const raw=value(row,'Updated Time','updatedAt','Created Time','createdAt','Start Time','startTime');const time=new Date(raw||0).getTime();if(!Number.isFinite(time))return;if(!latest||time>latest.time)latest={collection,row,time};}));return latest;}
function bundleSearchText(bundle){const parts=[bundle.customer];Object.values(bundle.groups||{}).forEach(list=>parts.push(...list));return searchableString(parts);}
function customerReason(bundle,queryTokens){const c=bundle.customer||{};const name=searchableString(value(c,'Customer Name','name'));const props=bundle.groups.properties||[];const jobs=bundle.groups.jobs||[];const quotes=bundle.groups.quotes||[];const meetings=bundle.groups.meetings||[];const sources=[['name',name],['address',searchableString(props)],['job',searchableString(jobs)],['quote',searchableString(quotes)],['meeting',searchableString(meetings)]];let best='customer history',score=-1;for(const [label,hay] of sources){const hits=queryTokens.filter(t=>hay.includes(t)).length;if(hits>score){score=hits;best=label;}}return best;}
function searchCustomers(snapshot,query){const qt=unique(tokens(query));if(!qt.length)return[];const phrase=qt.join(' ');const results=[];rows(snapshot,'customers').forEach(customer=>{const cid=idFor('customers',customer);if(!cid)return;const bundle=customerBundle(snapshot,cid);const name=searchableString(value(customer,'Customer Name','name'));const all=bundleSearchText(bundle);let score=0;if(name===phrase)score+=80;if(name.includes(phrase)||phrase.includes(name))score+=45;for(const t of qt){if(name.includes(t))score+=18;if(all.includes(t))score+=5;}if(qt.every(t=>all.includes(t)))score+=20;const propertyText=searchableString(bundle.groups.properties||[]);if(qt.every(t=>propertyText.includes(t)))score+=25;const jobText=searchableString(bundle.groups.jobs||[]);if(qt.every(t=>jobText.includes(t)))score+=18;if(score>0)results.push({customerId:cid,score,reason:customerReason(bundle,qt),bundle});});return results.sort((a,b)=>b.score-a.score||text(value(a.bundle.customer,'Customer Name')).localeCompare(text(value(b.bundle.customer,'Customer Name'))));}
function customerServiceAddress(c){const street=[value(c,'Service Address','Address'),value(c,'Service Address 2','Address 2')].map(text).filter(Boolean).join(', '),locality=[value(c,'Service City','City'),value(c,'Service State','State'),value(c,'Service ZIP','ZIP')].map(text).filter(Boolean).join(' ');return[street,locality].filter(Boolean).join(', ');}
function customerPrimaryRate(c){for(const field of ['Recurring Service Rate','Mowing Rate','Plowing Rate','Property Maintenance Rate','Hourly Rate','Flat Rate','Minimum Charge','Equipment Rate','Travel / Service Call Charge','Contract Pricing']){const amount=text(value(c,field));if(amount)return`${field}: ${amount}`;}return'';}
function summaryCounts(bundle){const g=bundle.groups||{},propertyCount=(g.properties||[]).length,directAddress=customerServiceAddress(bundle.customer||{});return{locations:propertyCount||(directAddress?1:0),jobs:(g.jobs||[]).length,quotes:(g.quotes||[]).length,siteVisits:(g.siteCaptureSessions||[]).length,meetings:(g.meetings||[]).length,files:(g.documents||[]).length,followUps:(g.followUps||[]).filter(r=>!/DONE|CLOSED|COMPLETE|CANCEL/.test(text(value(r,'Status','status')).toUpperCase())).length,invoices:(g.invoices||[]).length};}
function customerSummary(bundle){const c=bundle.customer||{},name=text(value(c,'Customer Name','name'))||'Customer',counts=summaryCounts(bundle),properties=bundle.groups.properties||[],primary=properties[0],address=text(value(primary,'Address','address')),latest=latestRecord(bundle);const parts=[`${counts.locations} location${counts.locations===1?'':'s'}`,`${counts.jobs} job${counts.jobs===1?'':'s'}`,`${counts.quotes} quote${counts.quotes===1?'':'s'}`,`${counts.siteVisits} site visit${counts.siteVisits===1?'':'s'}`,`${counts.meetings} meeting${counts.meetings===1?'':'s'}`,`${counts.files} file${counts.files===1?'':'s'}`];if(counts.followUps)parts.push(`${counts.followUps} open follow-up${counts.followUps===1?'':'s'}`);if(counts.invoices)parts.push(`${counts.invoices} invoice${counts.invoices===1?'':'s'}`);let answer=`${name}${address?` — ${address}`:''}. ${parts.join(', ')}.`;if(latest){const label=CHILD_LABELS[latest.collection]||latest.collection,desc=text(value(latest.row,'Project Title','Title','Subject','File Name','Purpose','Description','Body'));answer+=` Latest ${label.toLowerCase()}: ${desc||'updated record'}.`;}answer+=' Internal cost, margin, purchasing, payroll and tax data are not included in this customer pull.';return answer;}
function resolveAssistantQuery(snapshot,query){const ranked=searchCustomers(snapshot,query);if(!ranked.length)return{matched:false,confident:false,results:[]};const top=ranked[0],second=ranked[1];const confident=top.score>=24&&(!second||top.score-second.score>=8||top.score>=55);return{matched:true,confident,customerId:confident?top.customerId:'',answer:confident?customerSummary(top.bundle):`I found ${ranked.slice(0,3).map(r=>text(value(r.bundle.customer,'Customer Name','name'))).join(', ')}. Add a little more of the name, address, or job so I open the right customer.`,results:ranked.slice(0,5),bundle:confident?top.bundle:null};}
function recordTitle(collection,row){return text(value(row,'Project Title','Title','Subject','Task Title','Quote Number','Invoice Number','File Name','Purpose','Description','Body','Checklist Name'))||idFor(collection,row)||CHILD_LABELS[collection]||collection;}
function safeEsc(root,value){return typeof root.esc==='function'?root.esc(value):text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function canViewCustomerMoney(state){
  const u=state?.snapshot?.user||{},p=u.permissions||{},role=text(value(u,'roleName','Role Name','roleId','Role')).toLowerCase();
  return !!(u.owner||p.all||p.manageFinancial||p.viewFinancial||['owner','administrator','admin','bookkeeper'].includes(role));
}
/* ---- Flow redesign (2026-10-10): Pattern 2 empty states ----
 * Every "No X saved" is now an inline add (M7 model via H38Flow.inlineAdder),
 * never dead text. Wire via wireCustomerInlineAdds after the workspace renders. */
const C360_CONTACT_FIELDS=[
  {field:'Email',label:'Email',short:'email',inputType:'email',placeholder:'you@example.com',keys:['Email','email']},
  {field:'Alternate Email',label:'Alternate email',short:'alt email',inputType:'email',placeholder:'you@example.com',keys:['Alternate Email']},
  {field:'Phone',label:'Phone',short:'phone',inputType:'tel',placeholder:'(218) 555-0100',keys:['Phone','phone']},
  {field:'Mobile Phone',label:'Mobile phone',short:'mobile',inputType:'tel',placeholder:'(218) 555-0100',keys:['Mobile Phone']},
  {field:'Alternate Phone',label:'Alternate phone',short:'alt phone',inputType:'tel',placeholder:'(218) 555-0100',keys:['Alternate Phone']}
];
const C360_RATE_FIELDS=['Hourly Rate','Flat Rate','Recurring Service Rate','Mowing Rate','Plowing Rate','Property Maintenance Rate','Minimum Charge','Discount','Material Markup','Equipment Rate','Travel / Service Call Charge','Contract Pricing','Previous Quote Price','Previous Invoice Price'];
function c360InlineSlot(esc,field,label,short,inputType,placeholder){
  return `<div class="h38-c360-detail-line h38-inline-slot" data-h38-inline-field="${esc(field)}" data-h38-inline-empty="No ${esc(short)} saved." data-h38-inline-add="Add ${esc(short)}" data-h38-inline-type="${esc(inputType)}" data-h38-inline-placeholder="${esc(placeholder)}" data-h38-inline-label="${esc(label)}"></div>`;
}
function customerOverviewCard(c,esc){
  const join=(parts,separator=', ')=>parts.map(text).filter(Boolean).join(separator);
  const line=(label,content)=>content?`<div class="h38-c360-detail-line"><span>${esc(label)}</span><strong>${esc(content)}</strong></div>`:'';
  const billingStreet=join([value(c,'Billing Address'),value(c,'Billing Address 2')]);
  const billingLocality=join([value(c,'Billing City'),value(c,'Billing State'),value(c,'Billing ZIP')],' ');
  const contact=C360_CONTACT_FIELDS.map(def=>{
    const content=text(value(c,...def.keys));
    return content?line(def.label,content):c360InlineSlot(esc,def.field,def.label,def.short,def.inputType,def.placeholder);
  }).join('')+line('Preferred contact',value(c,'Preferred Contact Method'));
  const serviceAddress=customerServiceAddress(c);
  const addresses=(serviceAddress?line('Service address',serviceAddress):c360InlineSlot(esc,'Service Address','Service address','address','text','Street address, city, state ZIP'))+line('Billing address',join([billingStreet,billingLocality]));
  return `<section class="card h38-c360-customer-details" data-h38-customer-details><h3>Customer details</h3><div class="h38-c360-detail-columns h38-c360-detail-columns-two"><div><h4>Contact</h4>${contact}</div><div><h4>Addresses</h4>${addresses}</div></div></section>`;
}
function customerRatesCard(c,esc){
  const line=(label,content)=>content?`<div class="h38-c360-detail-line"><span>${esc(label)}</span><strong>${esc(content)}</strong></div>`:'';
  const rates=C360_RATE_FIELDS.map(field=>line(field,value(c,field))).filter(Boolean).join('');
  return `<section class="card h38-c360-rates"><h3>Customer pricing</h3>${rates||'<div class="h38-inline-slot" data-h38-inline-rate></div>'}</section>`;
}
/* Save one customer field through the offline queue (M7/M10 model). */
function saveCustomerField(snapshot,customerId,field,fieldValue){
  const customer=rows(snapshot,'customers').find(row=>idFor('customers',row)===text(customerId));
  if(!customer)return Promise.reject(new Error('The customer record could not be found.'));
  const r={};for(const k in customer)r[k]=customer[k];
  r[field]=fieldValue;
  r['Updated Time']=new Date().toISOString();
  r['Record Version']=Math.max(1,Number(value(r,'Record Version','recordVersion'))+1);
  delete r.__localPending;
  const q=window.queueOperation||(typeof queueOperation==='function'?queueOperation:null);
  if(!q)return Promise.reject(new Error('Customer save is unavailable right now.'));
  return q('SAVE_ENTITY','Customer',text(customerId),{entity:'customers',record:r},{collection:'customers',record:r,idKeys:['Customer ID']});
}
/* Wire the inline add slots rendered by customerOverviewCard/customerRatesCard. */
function wireCustomerInlineAdds(root,workspace,snapshot,customerId){
  const flow=window.H38Flow;
  if(!flow||typeof flow.inlineAdder!=='function')return;
  workspace.querySelectorAll('[data-h38-inline-field]').forEach(slot=>{
    flow.inlineAdder(slot,{
      emptyText:slot.dataset.h38InlineEmpty||'None saved.',
      addLabel:slot.dataset.h38InlineAdd||'Add',
      inputType:slot.dataset.h38InlineType||'text',
      placeholder:slot.dataset.h38InlinePlaceholder||'',
      saveLabel:'Save',
      validate:slot.dataset.h38InlineType==='email'?(entered=>/^\S+@\S+\.\S+$/.test(entered)?null:'Enter a valid email address.'):null,
      onSave:async entered=>{
        await saveCustomerField(snapshot,customerId,slot.dataset.h38InlineField,entered);
        window.toast?.(`${slot.dataset.h38InlineLabel||'Value'} saved.`);
        renderCustomersNow(root);
      }
    });
  });
  const rateSlot=workspace.querySelector('[data-h38-inline-rate]');
  if(rateSlot){
    flow.inlineAdder(rateSlot,{
      emptyText:'No customer-specific rates saved.',
      addLabel:'Add a rate',
      saveLabel:'Save rate',
      selectOptions:C360_RATE_FIELDS.map(field=>({value:field,label:field})),
      onSave:async picked=>{
        await saveCustomerField(snapshot,customerId,picked.field,picked.value);
        window.toast?.(`${picked.field} saved (${picked.value}).`);
        renderCustomersNow(root);
      }
    });
  }
}
function customerBalanceCard(groups,esc){
  const invoices=groups.invoices||[],payments=groups.payments||[];
  const amount=(row,...keys)=>{const n=Number(value(row,...keys));return Number.isFinite(n)?n:0;};
  const billed=invoices.reduce((sum,row)=>sum+amount(row,'Total','Amount','Invoice Total'),0);
  const paid=payments.reduce((sum,row)=>sum+amount(row,'Amount','Payment Amount'),0);
  const explicit=invoices.reduce((sum,row)=>sum+amount(row,'Balance Due','Balance'),0);
  const balance=explicit||Math.max(0,billed-paid);
  const money=n=>Number(n||0).toLocaleString(undefined,{style:'currency',currency:'USD'});
  return `<section class="card h38-c360-balance"><h3>Customer balance</h3><div class="h38-c360-stats h38-c360-money-stats"><div><strong>${esc(money(billed))}</strong><span>Invoiced</span></div><div><strong>${esc(money(paid))}</strong><span>Paid</span></div><div><strong>${esc(money(balance))}</strong><span>Balance</span></div></div></section>`;
}
function renderCustomer360(root){
  const state=root.state;if(!state?.snapshot)return;
  const main=root.document.getElementById('mainContent');if(!main)return;
  const snapshot=state.snapshot,customers=rows(snapshot,'customers'),selected=text(api.selectedCustomerId)||idFor('customers',customers[0]||{});
  if(selected)api.selectedCustomerId=selected;
  const result=selected?customerBundle(snapshot,selected):null,c=result?.customer||null,g=result?.groups||{},esc=v=>safeEsc(root,v),counts=result?summaryCounts(result):null,customerName=text(value(c,'Customer Name','name'))||'Select a customer';
  main.querySelectorAll(':scope > .h38-c360,:scope > .h38-c360-grid,:scope > .h38-c360-workspace,:scope > .h38-c360-master-detail,:scope > .h38-c360-setup-dialog').forEach(node=>node.remove());
  const oldCards=Array.from(main.querySelectorAll('.grid > .card'));
  const setupCards=oldCards.filter(card=>['Add customer','Add or update customer','Add property'].includes(text(card.querySelector('h2')?.textContent)));
  oldCards.forEach(card=>card.remove());
  const grid=main.querySelector('.grid');
  const head=main.querySelector('.page-head');
  if(head){const p=head.querySelector('p');if(p)p.textContent='One customer workspace. Overview, Work, Money and Files keep the customer story together without stacked legacy sections.';}
  const phone=text(value(c,'Phone','phone','Mobile Phone')),address=customerServiceAddress(c)||text(value((g.properties||[])[0],'Address','address','Service Address'));
  const master=root.document.createElement('div');master.className='h38-c360-master-detail';master.dataset.h38CanonicalCustomerLayout='1';
  if(Number(root.innerWidth||0)>900){master.style.display='grid';master.style.gridTemplateColumns='minmax(230px,290px) minmax(0,1fr)';master.style.width='100%';master.style.minWidth='0';}
  const directory=root.document.createElement('aside');directory.className='card h38-c360-directory-rail';directory.dataset.h38CustomerDirectoryHost='1';directory.innerHTML='<div class="h38-customer-directory-head"><div><span class="h38-c360-kicker">CUSTOMERS</span><h2>Customer directory</h2></div><button type="button" class="secondary" data-h38-new-customer>+ Add</button></div><div class="h38-c360-search"><label for="h38Customer360Search">Find customer, address or job</label><input id="h38Customer360Search" autocomplete="off" placeholder="Name, address or job"><div id="h38Customer360Matches"></div></div><div data-h38-customer-directory-list></div>';
  const newCustomerBtn=directory.querySelector('[data-h38-new-customer]');
  if(newCustomerBtn)newCustomerBtn.addEventListener('click',()=>{openCustomerSetupDialog(root);});
  const detail=root.document.createElement('div');detail.className='h38-c360-detail';detail.dataset.h38CustomerDetailHost='1';if(Number(root.innerWidth||0)>900){detail.style.display='block';detail.style.width='100%';detail.style.minWidth='0';}master.append(directory,detail);
  /* Pattern 4: customer status is a transition, not a label. Active ⇄ Inactive
   * both have a UI action; inactive records are kept, never deleted. */
  const customerStatus=text(value(c,'Status','status'))||'Active';
  const top=root.document.createElement('section');top.className='card h38-c360 full';
  top.innerHTML=`<div class="h38-c360-head"><div><span class="h38-c360-kicker">CUSTOMER 360</span><h2>${esc(customerName)}</h2>${c?`<div class="h38-c360-status-line"><span class="pill">${esc(customerStatus)}</span><button type="button" class="secondary" data-h38-customer-status>${customerStatus==='Active'?'Mark inactive':'Reactivate'}</button></div>`:''}<p>${c?esc([value(c,'Email'),phone,address].filter(Boolean).join(' · ')||'No customer details yet'):'Choose a customer to open the complete workspace.'}</p></div></div>${result?`<div class="h38-c360-stats"><div><strong>${counts.locations}</strong><span>Locations</span></div><div><strong>${counts.jobs}</strong><span>Jobs</span></div><div><strong>${counts.quotes}</strong><span>Quotes</span></div><div><strong>${counts.siteVisits}</strong><span>Site visits</span></div><div><strong>${counts.meetings}</strong><span>Meetings</span></div><div><strong>${counts.files}</strong><span>Files</span></div></div><div class="h38-c360-actions">${phone?'<button type="button" data-c360-action="call">Call</button>':''}${phone?'<button type="button" data-c360-action="text">Text</button>':''}<button type="button" data-c360-action="message">Communications</button>${address?'<button type="button" class="secondary" data-c360-action="navigate">Navigate</button>':''}<button type="button" class="secondary" data-c360-action="quote">Start quote</button><button type="button" class="secondary" data-c360-action="site">Site visit</button><button type="button" class="secondary" data-c360-action="meeting">Meeting</button></div>`:''}`;
  detail.appendChild(top);if(grid)grid.before(master);else main.appendChild(master);
  const statusButton=top.querySelector('[data-h38-customer-status]');
  if(statusButton&&c){
    statusButton.addEventListener('click',()=>{
      const toInactive=customerStatus==='Active',target=toInactive?'Inactive':'Active';
      const flow=window.H38Flow;
      if(!flow||typeof flow.ask!=='function'){window.toast?.('Customer status change is unavailable right now.',true);return;}
      flow.ask({
        id:'h38CustomerStatus',
        signature:['customer-status',selected,customerStatus].join('|'),
        title:toInactive?'Mark this customer inactive?':'Reactivate this customer?',
        detail:toInactive?'Inactive customers stay in the system but leave the active list. Nothing is deleted.':'The customer returns to the active list.',
        actions:[
          {label:toInactive?'Mark inactive':'Reactivate',primary:true,handler:async()=>{
            document.getElementById('h38CustomerStatus')?.remove();
            await saveCustomerField(snapshot,selected,'Status',target);
            window.toast?.(`Customer ${toInactive?'marked inactive':'reactivated'}.`);
            renderCustomersNow(root);
          }},
          {label:'Keep as is',handler:()=>document.getElementById('h38CustomerStatus')?.remove()}
        ]
      });
    });
  }
  if(result){
    const section=(title,collection,limit=8,listOverride=null)=>{
      const list=Array.isArray(listOverride)?listOverride:(g[collection]||[]);
      return `<section class="card" data-c360-section="${esc(collection)}"><h3>${esc(title)}</h3>${list.length?`<div class="h38-c360-list">${list.slice(0,limit).map(row=>{const documentAction=collection==='documents'?`<button type="button" class="secondary" data-h38-open-document-id="${esc(idFor(collection,row))}" ${text(value(row,'Storage Path','storagePath'))?'':`disabled title="The original file is not attached to this record."`}>Open file</button>`:'';return`<div class="h38-c360-row"><strong>${esc(recordTitle(collection,row))}</strong><small>${esc(text(value(row,'Status','status','Updated Time','Created Time','Start Time','Address','address')))}</small>${documentAction}</div>`;}).join('')}</div>`:`<p class="muted small">None yet.</p>`}</section>`;
    };
    const activeJobs=(g.jobs||[]).filter(row=>!/COMPLETE|CLOSED|CANCEL|VOID/.test(text(value(row,'Status','status')).toUpperCase()));
    const upcoming=(g.scheduleEvents||[]).filter(row=>{const when=new Date(value(row,'Start Time','startTime','Scheduled Time','scheduledAt')||0).getTime();return Number.isFinite(when)&&when>=Date.now()-3600000;}).sort((a,b)=>new Date(value(a,'Start Time','startTime')||0)-new Date(value(b,'Start Time','startTime')||0)).slice(0,3);
    const needs=(g.followUps||[]).filter(row=>!/DONE|CLOSED|COMPLETE|CANCEL/.test(text(value(row,'Status','status')).toUpperCase()));
    const docs=g.documents||[],visitReports=docs.filter(row=>/visit report|site visit report/i.test(text(value(row,'Document Type','File Name','Title')))),meetingReports=docs.filter(row=>/meeting report/i.test(text(value(row,'Document Type','File Name','Title')))),photos=docs.filter(row=>/^image\//i.test(text(value(row,'Mime Type','MIME Type')))||/photo|before|after|image/i.test(text(value(row,'Document Type'))));
    const moneyAllowed=canViewCustomerMoney(state),tabKeys=['overview','work',...(moneyAllowed?['money']:[]),'files'],requested=tabKeys.includes(text(api.selectedTab))?text(api.selectedTab):'overview';api.selectedTab=requested;
    const workspace=root.document.createElement('section');workspace.className='h38-c360-workspace';workspace.dataset.customerId=selected;
    const tabs=`<div class="h38-c360-tabs" role="tablist" aria-label="Customer 360 sections">${tabKeys.map(key=>`<button type="button" role="tab" data-c360-tab="${key}" aria-selected="${key===requested?'true':'false'}">${key==='overview'?'Overview':key==='work'?'Work':key==='money'?'Money':'Files'}</button>`).join('')}</div>`;
    const overview=`<div class="h38-c360-panel" role="tabpanel" data-c360-panel="overview" ${requested==='overview'?'':'hidden'}>${customerOverviewCard(c,esc)}${section('Locations','properties',8)}${section('Active work','jobs',6,activeJobs)}${section('Next appointment','scheduleEvents',3,upcoming)}${section('Needs Attention','followUps',6,needs)}</div>`;
    const work=`<div class="h38-c360-panel" role="tabpanel" data-c360-panel="work" ${requested==='work'?'':'hidden'}>${section('Requests','requests')}${section('Site visits','siteCaptureSessions')}${section('Visit reports','documents',6,visitReports)}${section('Quotes','quotes')}${section('Jobs','jobs')}${section('Work orders','workOrders')}${section('Tasks','tasks')}${section('Recurring services','recurringPlans')}${section('Measurements','siteMeasurements')}</div>`;
    const money=moneyAllowed?`<div class="h38-c360-panel" role="tabpanel" data-c360-panel="money" ${requested==='money'?'':'hidden'}>${customerBalanceCard(g,esc)}${customerRatesCard(c,esc)}${section('Quotes','quotes')}${section('Invoices','invoices')}${section('Payments','payments')}</div>`:'';
    const files=`<div class="h38-c360-panel" role="tabpanel" data-c360-panel="files" ${requested==='files'?'':'hidden'}>${section('Documents','documents')}${section('Photos','documents',8,photos)}${section('Meeting reports','documents',8,meetingReports)}${section('Visit reports','documents',8,visitReports)}${section('Meetings','meetings')}</div>`;
    workspace.innerHTML=tabs+overview+work+money+files;detail.appendChild(workspace);
    wireCustomerInlineAdds(root,workspace,snapshot,selected);
    workspace.querySelectorAll('[data-c360-tab]').forEach(button=>button.onclick=()=>{const key=button.dataset.c360Tab;api.selectedTab=key;workspace.querySelectorAll('[data-c360-tab]').forEach(node=>node.setAttribute('aria-selected',String(node===button)));workspace.querySelectorAll('[data-c360-panel]').forEach(panel=>panel.hidden=panel.dataset.c360Panel!==key);});
  }
  if(setupCards.length){const dialog=root.document.createElement('dialog');dialog.className='h38-c360-setup-dialog';dialog.setAttribute('aria-label','Customer setup');dialog.innerHTML='<div class="h38-c360-setup-head"><div><span class="h38-c360-kicker">CUSTOMER SETUP</span><h2>Add customer</h2></div><button type="button" class="secondary" data-h38-close-customer-setup aria-label="Close customer setup">Close</button></div><div class="h38-c360-setup-grid"></div>';const holder=dialog.querySelector('.h38-c360-setup-grid');setupCards.forEach(card=>{const title=text(card.querySelector('h2')?.textContent);if(/add property/i.test(title)){const details=root.document.createElement('details');details.className='h38-optional-property';const summary=root.document.createElement('summary');summary.textContent='Add a property (optional)';details.appendChild(summary);details.appendChild(card);holder.appendChild(details);}else holder.appendChild(card);});dialog.querySelector('[data-h38-close-customer-setup]').onclick=()=>dialog.close();dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});main.appendChild(dialog);}
  if(grid&&!grid.children.length)grid.remove();
  const input=root.document.getElementById('h38Customer360Search'),matches=root.document.getElementById('h38Customer360Matches');
  if(input&&matches){input.addEventListener('input',()=>{const found=searchCustomers(snapshot,input.value).slice(0,5);matches.innerHTML=input.value.trim()?found.map(item=>`<button type="button" data-c360-customer="${esc(item.customerId)}"><strong>${esc(value(item.bundle.customer,'Customer Name','name'))}</strong><small>${esc(item.reason)}</small></button>`).join(''):'';matches.querySelectorAll('[data-c360-customer]').forEach(button=>button.onclick=()=>{api.selectedCustomerId=button.dataset.c360Customer;api.selectedTab='overview';renderCustomersNow(root);});});}
  main.querySelectorAll('[data-c360-action]').forEach(button=>button.onclick=()=>{const action=button.dataset.c360Action,cid=api.selectedCustomerId;if(action==='call'&&phone){if(root.H38_COMMUNICATIONS?.startCall)root.H38_COMMUNICATIONS.startCall({customerId:cid,phone,name:customerName});else root.toast?.('Native communications are unavailable in this session.',true);}else if(action==='text'&&phone){root.H38_COMMUNICATIONS?.startText({customerId:cid,phone,name:customerName});}else if(action==='navigate'&&address){root.open?.(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,'_blank','noopener');}else if(action==='quote'){if(state.quote)state.quote.customerId=cid;else state.quote={quoteId:'',lines:[],customerId:cid,hydrationComplete:true};root.openPage?.('quotes');}else if(action==='site'){if(typeof root.H38_FIELD_VISIT?.open==='function')root.H38_FIELD_VISIT.open({customerId:cid,quoteId:''});else root.openPage?.('field');}else if(action==='meeting'){if(typeof root.H38_CONVERSATION_MEETING_ASSISTANT?.startMeeting==='function')root.H38_CONVERSATION_MEETING_ASSISTANT.startMeeting({meetingType:'Customer Meeting',customerId:cid});else root.openPage?.('meetings');}else if(action==='message'){if(root.H38_COMMUNICATIONS?.open)root.H38_COMMUNICATIONS.open({customerId:cid});else root.openPage?.('messages');}});
}
function renderCustomersNow(root){try{if(root.state?.page!=='customers')root.openPage?.('customers');else{const base=api._baseRenderCustomers;if(base)base();renderCustomer360(root);}}catch(e){console.warn('[H38 Customer 360 render]',e);}}
function openCustomerSetupDialog(root){
  const doc=(root&&root.document)||document;
  const dialog=doc.querySelector('.h38-c360-setup-dialog');
  if(!dialog)return false;
  try{
    if(!dialog.open)dialog.showModal();
    const field=dialog.querySelector('#customerForm [name="customerName"],#customerForm input:not([type="hidden"]),#customerForm select,#customerForm textarea');
    if(field){try{field.focus({preventScroll:true});}catch(_){try{field.focus();}catch(__){}}}
    return true;
  }catch(e){return false;}
}
function patchRender(root){if(api._renderPatched)return;const base=root.renderCustomers;if(typeof base!=='function')return;api._baseRenderCustomers=base;const wrapped=function(){const result=base.apply(this,arguments);try{renderCustomer360(root);}catch(e){console.warn('[H38 Customer 360]',e);}return result;};wrapped.__h38Customer360=true;root.renderCustomers=wrapped;api._renderPatched=true;}
function patchBridge(root){const Bridge=root.H38Bridge;if(!Bridge?.prototype||typeof Bridge.prototype.request!=='function')return false;const current=Bridge.prototype.request;if(current.__h38Customer360)return true;const previous=current;const wrapped=async function(action,args,timeout){if(action==='completionSync'&&args&&Array.isArray(args.operations)){args={...args,operations:enrichOperations(root.state?.snapshot||{},args.operations)};}return previous.call(this,action,args,timeout);};wrapped.__h38Customer360=true;wrapped.__h38Customer360Base=previous;Bridge.prototype.request=wrapped;return true;}
function install(root){if(api.installed)return api;api.installed=true;const hydrate=()=>{const snapshot=root.state?.snapshot;if(snapshot){const result=enrichSnapshot(snapshot);api.lastEnriched=result.enriched;}};const boot=()=>{hydrate();patchRender(root);patchBridge(root);};if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();root.addEventListener?.('h38:business-snapshot-updated',()=>{hydrate();patchRender(root);patchBridge(root);if(root.state?.page==='customers')renderCustomersNow(root);});root.addEventListener?.('online',()=>patchBridge(root));let ticks=0;const timer=setInterval(()=>{boot();if(++ticks>60)clearInterval(timer);},250);return api;}
const api={BUILD,INTERNAL_FINANCIAL,INTERNAL_BUSINESS,CUSTOMER_COLLECTIONS,collectionAllowed,buildGraph,enrichSnapshot,enrichRecord,enrichOperation,enrichOperations,customerBundle,searchCustomers,resolveAssistantQuery,customerSummary,summaryCounts,canViewMoney:canViewCustomerMoney,install,renderNow:root=>renderCustomersNow(root||window),openCustomerSetup:root=>openCustomerSetupDialog(root||window),selectedCustomerId:'',selectedTab:'overview',lastEnriched:0,automaticCustomerSending:false,automaticApproval:false,automaticPurchase:false,automaticPayment:false,internalFinancialExcludedFromCustomer360:true};
return api;
});
