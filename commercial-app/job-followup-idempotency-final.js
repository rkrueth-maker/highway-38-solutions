(function(){
'use strict';
const BUILD='20260821-followup-idempotency-final-1';
const text=value=>String(value==null?'':value).trim();
const value=(row,...keys)=>{const source=row?.payload&&typeof row.payload==='object'?row.payload:row;for(const key of keys){if(source&&source[key]!==undefined&&source[key]!==null&&source[key]!=='')return source[key];}return'';};
const normalize=value=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const now=()=>new Date().toISOString();
const uid=prefix=>typeof window.newId==='function'?window.newId(prefix):`${prefix}-${crypto.randomUUID().toUpperCase()}`;
const rows=name=>Array.isArray(window.state?.snapshot?.[name])?window.state.snapshot[name]:[];
function id(row,...keys){return text(value(row,...keys));}
function open(row){return !/complete|done|closed|cancel|archive|deleted/i.test(text(value(row,'Status','status')));}
function relatedId(item){return text(item?.quoteId||item?.invoiceId||value(item?.record,'Request ID','requestId')||item?.jobId||'');}
function relatedType(item){return text(item?.kind).toUpperCase();}
function suggested(item){return item.kind==='QUOTE'?'Check whether the customer has questions about the proposal and whether a revision is needed.':item.kind==='INVOICE'?'Confirm the customer received the invoice and ask whether anything is blocking payment.':item.kind==='REQUEST'?'Review the request and contact the customer to confirm scope and timing.':`Resolve: ${text(item.detail)}`;}
function businessId(){return text(window.state?.businessId);}
async function save(collection,type,key,record,idKeys){if(typeof window.queueOperation!=='function')throw new Error('Secure offline save queue is unavailable.');await window.queueOperation('SAVE_ENTITY',type,key,{entity:collection,record},{collection,record,idKeys},true);}
function existingFollowUp(item){const type=relatedType(item),rid=relatedId(item),bid=businessId();return rows('followUps').find(row=>open(row)&&(!bid||text(value(row,'Business ID','businessId'))===bid)&&text(value(row,'Related Type','relatedType')).toUpperCase()===type&&text(value(row,'Related ID','relatedId'))===rid)||null;}
function existingTask(item,followId){const jobId=text(item?.jobId),title=normalize(`Follow up: ${text(item?.title)}`),rid=relatedId(item),type=relatedType(item);return rows('tasks').find(row=>open(row)&&((followId&&text(value(row,'Follow-up ID','followUpId'))===followId)||(rid&&text(value(row,'Related ID','relatedId'))===rid&&text(value(row,'Related Type','relatedType')).toUpperCase()===type)||(jobId&&text(value(row,'Job ID','jobId'))===jobId&&normalize(value(row,'Task Title','taskTitle'))===title)))||null;}
async function prepare(item){
  if(!item)return null;const bid=businessId(),rid=relatedId(item),type=relatedType(item);if(!bid||!rid||!type)throw new Error('The follow-up source identity is incomplete.');
  let follow=existingFollowUp(item),followId=id(follow,'Follow-up ID','followUpId');
  if(follow){const updated={...follow,'Suggested Action':suggested(item),'Title':text(item.title)||text(value(follow,'Title','title')),'Updated Time':now(),'Record Version':Math.max(1,Number(value(follow,'Record Version','recordVersion')||1))+1};await save('followUps','Follow-up',followId,updated,['Follow-up ID','followUpId']);follow=updated;}
  else{followId=uid('FOLLOWUP');follow={'Follow-up ID':followId,'Business ID':bid,'Job ID':text(item.jobId),'Customer ID':text(item.customerId),'Related Type':type,'Related ID':rid,'Title':text(item.title),'Suggested Action':suggested(item),'Status':'Open — Internal Draft','Due Time':now(),'Created Time':now(),'Updated Time':now(),'Record Version':1};await save('followUps','Follow-up',followId,follow,['Follow-up ID','followUpId']);}
  let task=existingTask(item,followId),taskId=id(task,'Task ID','taskId');
  if(task){const updated={...task,'Follow-up ID':followId,'Related Type':type,'Related ID':rid,'Updated Time':now(),'Record Version':Math.max(1,Number(value(task,'Record Version','recordVersion')||1))+1};await save('tasks','Task',taskId,updated,['Task ID','taskId']);task=updated;}
  else{taskId=uid('TASK');task={'Task ID':taskId,'Business ID':bid,'Job ID':text(item.jobId),'Follow-up ID':followId,'Related Type':type,'Related ID':rid,'Task Title':`Follow up: ${text(item.title)}`,'Assigned User ID':text(window.state?.snapshot?.user?.userId),'Priority':Number(item.priority)===1?'High':'Normal','Status':'Open','Due Time':now(),'Created Time':now(),'Updated Time':now(),'Record Version':1};await save('tasks','Task',taskId,task,['Task ID','taskId']);}
  return{followUpId:followId,taskId,reusedFollowUp:Boolean(existingFollowUp(item)),reusedTask:Boolean(existingTask(item,followId))};
}
function itemFromButton(button){const api=window.H38_JOB_LIFECYCLE;if(!api?.attention)return null;const list=api.attention(),index=Number(button.dataset.lifeFollow);return Number.isInteger(index)?list[index]||null:null;}
document.addEventListener('click',event=>{const button=event.target instanceof Element?event.target.closest('[data-life-follow]'):null;if(!button)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();const item=itemFromButton(button);button.disabled=true;void prepare(item).then(()=>{window.toast?.('Internal follow-up ready. Existing open follow-up/task reused when present; nothing sent.');window.renderToday?.();}).catch(error=>window.toast?.(error?.message||String(error),true)).finally(()=>{if(button.isConnected)button.disabled=false;});},true);
function exportApi(){const api=window.H38_JOB_LIFECYCLE;if(api&&!api.__h38FollowupIdempotency){api.prepareFollowUp=prepare;api.__h38FollowupIdempotency=BUILD;}}
[0,250,900].forEach(delay=>setTimeout(exportApi,delay));
window.H38_JOB_FOLLOWUP_IDEMPOTENCY_FINAL=Object.freeze({enabled:true,build:BUILD,prepare,identity:['Business ID','Related Type','Related ID'],reuseOpenFollowUp:true,reuseOpenTask:true,noAutomaticDuplicateDeletion:true,automaticCustomerSending:false,automaticApproval:false});
})();