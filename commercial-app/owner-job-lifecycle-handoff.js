(function(){
'use strict';
const BUILD='20260824-owner-job-lifecycle-handoff-1';
const text=v=>String(v==null?'':v).trim();
const val=(row,...keys)=>{for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return'';};
const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
const id=(row,...keys)=>text(val(row,...keys));
const now=()=>new Date().toISOString();
const newid=p=>typeof window.newId==='function'?window.newId(p):`${p}-${crypto.randomUUID().toUpperCase()}`;
function accepted(row){const s=text(val(row,'Status','status')).toUpperCase(),d=text(val(row,'Customer Decision','customerDecision')).toUpperCase();return /ACCEPT|APPROV|SIGNED/.test(s)||/ACCEPT|APPROV/.test(d);}
function currentQuote(){const qid=text(window.state?.quote?.quoteId);return rows('quotes').find(row=>id(row,'Quote ID','quoteId')===qid)||null;}
function linkedJob(quote){if(!quote)return null;const qid=id(quote,'Quote ID','quoteId'),cid=id(quote,'Customer ID','customerId'),title=text(val(quote,'Project Title','projectTitle')).toLowerCase();return rows('jobs').find(job=>id(job,'Quote ID','quoteId','Source Quote ID')===qid||(cid&&id(job,'Customer ID','customerId')===cid&&text(val(job,'Project Title','projectTitle')).toLowerCase()===title))||null;}
const TEMPLATES=[
  ['PREJOB','Pre-job readiness','Work',['Approved scope and current revision confirmed','Schedule and site access confirmed','Materials and equipment are available or committed','Crew / owner responsibilities are clear','Permits, locates and safety requirements were reviewed when applicable']],
  ['QUALITY','Completion quality','Complete',['Approved scope is complete','Open change orders are resolved before extra work is treated as approved','Final condition and cleanup were checked','Final photos / proof are captured when appropriate','Remaining punch-list items are recorded']],
  ['CLOSEOUT','Closeout','Closed',['Invoice or final billing record is prepared','Payment status is recorded','Customer-facing final documents are staged intentionally','Warranty / maintenance notes are recorded when applicable','Job record has a final next action or is ready to close']]
];
async function save(collection,type,key,record,idKeys){if(typeof window.queueOperation!=='function')throw new Error('Secure offline save queue is unavailable.');await window.queueOperation('SAVE_ENTITY',type,key,{entity:collection,record},{collection,record,idKeys},true);}
async function createFromAcceptedQuote(){
  const quote=currentQuote();if(!quote)throw new Error('Save or open the quote first.');if(!accepted(quote))throw new Error('This quote is not recorded as customer accepted. H38 will not create approved work from an unaccepted quote.');
  const existing=linkedJob(quote);if(existing){window.H38_OWNER_CUSTOMER_WORKFLOW_POLISH?.setContext?.(id(existing,'Customer ID','customerId'),{jobId:id(existing,'Job ID','jobId'),source:'quote-job'});window.openPage?.('work');return existing;}
  const jobId=newid('JOB'),cid=id(quote,'Customer ID','customerId'),qid=id(quote,'Quote ID','quoteId'),job={'Job ID':jobId,'Business ID':window.state?.businessId||'','Customer ID':cid,'Quote ID':qid,'Source Quote ID':qid,'Job Number':`LOCAL-${Date.now()}`,'Project Title':text(val(quote,'Project Title','projectTitle'))||'Approved work','Status':'Approved','Created Time':now(),'Updated Time':now(),'Record Version':1};
  await window.queueOperation('SAVE_JOB','Job',jobId,{jobId,customerId:cid,quoteId:qid,projectTitle:job['Project Title'],status:'Approved'},{collection:'jobs',record:job,idKeys:['Job ID']});
  for(const [type,name,requiredBefore,labels] of TEMPLATES){const checklistId=newid('CHECKLIST'),items=labels.map((label,index)=>({id:`${type}-${index+1}`,label,required:true})),record={'Checklist ID':checklistId,'Business ID':window.state?.businessId||'','Customer ID':cid,'Job ID':jobId,'Quote ID':qid,'Checklist Name':name,'Checklist Type':type,'Status':'Open','Required Before':requiredBefore,'Items JSON':JSON.stringify(items),'Completed Items JSON':'[]','Created Time':now(),'Updated Time':now(),'Record Version':1};await save('checklists','Checklist',checklistId,record,['Checklist ID','checklistId']);}
  window.H38_OWNER_CUSTOMER_WORKFLOW_POLISH?.setContext?.(cid,{jobId,quoteId:qid,source:'accepted-quote'});window.toast?.('Approved quote linked to a new internal job with pre-job, completion and closeout gates. Nothing was scheduled or sent.');window.openPage?.('work');return job;
}
function intercept(event){const button=event.target?.closest?.('[data-quote-job="create"]');if(!button)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();createFromAcceptedQuote().catch(error=>window.toast?.(error.message||String(error),true));}
document.addEventListener('click',intercept,true);
window.H38_OWNER_JOB_HANDOFF=Object.freeze({build:BUILD,accepted,currentQuote,linkedJob,createFromAcceptedQuote,requiredChecklistTemplates:TEMPLATES.map(x=>x[0]),ownerTapRequired:true,automaticScheduling:false,automaticCustomerSending:false,automaticApproval:false,automaticPurchasing:false,automaticPayment:false});
})();
