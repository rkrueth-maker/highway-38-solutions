(function(){
'use strict';
const BUILD='20260926-shared-lifecycle-task-ui-1';
const CLOSED=new Set(['DONE','COMPLETE','COMPLETED','CANCELLED','CANCELED','CLOSED','VOID','VOIDED']);
const text=value=>String(value==null?'':value).trim();
const lower=value=>text(value).toLowerCase();
const records=name=>{try{return typeof window.records==='function'?window.records(name):(window.state?.snapshot?.[name]||[]);}catch(_){return[];}};
const val=(row,...keys)=>{for(const key of keys){if(row&&row[key]!=null&&text(row[key])!=='')return row[key];}return'';};
const rid=(row,...keys)=>text(val(row,...keys));
const stateNow=()=>window.state||null;
const authState=()=>window.H38_SUPABASE_AUTH?.getState?.()||{};
const currentUserId=()=>text(authState().userId||stateNow()?.snapshot?.user?.userId||stateNow()?.snapshot?.user?.['User ID']);
function currentRole(){
  const direct=lower(stateNow()?.snapshot?.user?.roleName||stateNow()?.snapshot?.user?.roleId||stateNow()?.snapshot?.user?.role);
  if(direct)return direct;
  const uid=currentUserId();
  const row=records('users').find(user=>rid(user,'User ID','userId')===uid);
  return lower(val(row,'Role Name','Role ID','Role','roleName','roleId','role'));
}
function ownerLike(){return ['owner','administrator','admin'].includes(currentRole());}
function openStatus(row){return !CLOSED.has(text(val(row,'Status','status')).toUpperCase());}
function roleMatches(assignedRole){
  const wanted=lower(assignedRole);
  if(!wanted)return false;
  if(wanted==='owner')return ownerLike();
  if(wanted==='administrator'||wanted==='admin')return ['administrator','admin','owner'].includes(currentRole());
  return wanted===currentRole();
}
function taskVisible(row){
  if(!openStatus(row))return false;
  const assigned=rid(row,'Assigned User ID','assignedUserId'),role=text(val(row,'Assigned Role','assignedRole'));
  if(assigned)return assigned===currentUserId();
  if(role)return roleMatches(role);
  return ownerLike();
}
function dueTime(row){const raw=val(row,'Due Time','Due Date','dueTime','dueDate');const t=new Date(raw||0).getTime();return Number.isFinite(t)&&t>0?t:Number.MAX_SAFE_INTEGER;}
function priorityRank(row){const p=lower(val(row,'Priority','priority'));return p==='urgent'?0:p==='high'?1:p==='normal'?2:3;}
function sortTasks(a,b){const now=Date.now(),ad=dueTime(a),bd=dueTime(b),ao=ad<now?0:1,bo=bd<now?0:1;return ao-bo||priorityRank(a)-priorityRank(b)||ad-bd||text(val(a,'Task Title')).localeCompare(text(val(b,'Task Title')));}
function renderTodayTasks(){
  const card=document.getElementById('supabaseAssignedTasks');if(!card)return false;
  const tasks=records('tasks').filter(taskVisible).sort(sortTasks).slice(0,12);
  const esc=window.esc||((value)=>text(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])));
  const pill=window.pill||((value)=>`<span>${esc(value)}</span>`),dateTime=window.dateTime||((value)=>text(value));
  const jobName=window.jobName||((id)=>text(id));
  const list=tasks.length?tasks.map(row=>`<div class="row" data-h38-owner-task="${esc(rid(row,'Task ID','taskId'))}"><div class="row-top"><strong>${esc(val(row,'Task Title')||'Task')}</strong>${pill(val(row,'Status')||'Open')}</div><small>${esc(jobName(val(row,'Job ID'))||'')}${val(row,'Assigned Role')?' · '+esc(val(row,'Assigned Role')):''} · ${dateTime(val(row,'Due Time','Due Date'))}</small></div>`).join(''):(typeof window.empty==='function'?window.empty('No open tasks assigned to you or your role.'):'<p>No open tasks assigned to you or your role.</p>');
  const body=card.querySelector('.list');if(body)body.innerHTML=list;
  const h2=card.querySelector('h2');if(h2)h2.textContent=ownerLike()?'Owner / assigned tasks':'Assigned tasks';
  return true;
}
function quoteRevision(quote){return text(val(quote,'Revision','revision')||1).replace(/[^A-Za-z0-9._-]/g,'-');}
function quoteLineTaskId(quoteId,revision,index){return`TASK-QUOTE-${text(quoteId).replace(/[^A-Za-z0-9-]/g,'-').slice(0,38)}-R${revision}-${index+1}`;}
function acceptedQuote(row){const status=lower([val(row,'Status'),val(row,'Customer Decision'),val(row,'Customer Action'),val(row,'Approval Status')].join(' '));return /accepted|approved|won/.test(status)&&!/rejected|declined|cancel/.test(status);}
function matchingJob(quote){const explicit=text(val(quote,'Job ID'));if(explicit)return explicit;const cid=text(val(quote,'Customer ID')),title=lower(val(quote,'Project Title'));const found=records('jobs').find(job=>text(val(job,'Customer ID'))===cid&&lower(val(job,'Project Title'))===title);return found?rid(found,'Job ID','jobId'):'';}
let reconciling=false;
async function saveTask(record){
  if(typeof window.queueOperation!=='function')return false;
  const id=rid(record,'Task ID','taskId');
  await window.queueOperation('SAVE_ENTITY','Task',id,{entity:'tasks',record},{collection:'tasks',record,idKeys:['Task ID']});
  return true;
}
async function reconcileQuoteWorkTasks(){
  if(reconciling||typeof window.queueOperation!=='function'||!stateNow()?.businessId)return false;
  const quotes=records('quotes').filter(acceptedQuote),tasks=records('tasks');if(!quotes.length)return false;
  reconciling=true;
  try{
    for(const quote of quotes){
      const qid=rid(quote,'Quote ID','quoteId');if(!qid)continue;
      const revision=quoteRevision(quote),jobId=matchingJob(quote),lines=Array.isArray(quote.lines)&&quote.lines.length?quote.lines:[{description:val(quote,'Scope','Deliverables')||`Complete quoted scope: ${val(quote,'Project Title')||val(quote,'Quote Number')||qid}`,quantity:1,unit:'scope'}];
      const expected=new Set();
      for(let index=0;index<lines.length;index++){
        const line=lines[index]||{},id=quoteLineTaskId(qid,revision,index),key=`${qid}:r${revision}:${index+1}`;expected.add(id);
        const title=text(val(line,'Description','description')||`Quoted work item ${index+1}`);
        const existing=tasks.find(task=>rid(task,'Task ID','taskId')===id||text(val(task,'Quote Checklist Key'))===key);
        if(existing){
          const changes={};
          if(text(val(existing,'Task Title'))!==title)changes['Task Title']=title;
          if(text(val(existing,'Job ID'))!==jobId)changes['Job ID']=jobId;
          if(text(val(existing,'Quote Revision'))!==revision)changes['Quote Revision']=revision;
          if(text(val(existing,'Quote Checklist Key'))!==key)changes['Quote Checklist Key']=key;
          if(!text(val(existing,'Assigned User ID'))&&!text(val(existing,'Assigned Role')))changes['Assigned Role']='Owner';
          if(Object.keys(changes).length){await saveTask({...existing,...changes,'Updated Time':new Date().toISOString(),'Record Version':Math.max(1,Number(val(existing,'Record Version')||0)+1)});}
          continue;
        }
        const record={'Task ID':id,'Business ID':stateNow().businessId,'Customer ID':val(quote,'Customer ID'),'Quote ID':qid,'Job ID':jobId,'Task Title':title,'Task Type':'Quote Work','Assigned User ID':'','Assigned Role':'Owner','Priority':'Normal','Status':'Open','Due Time':'','Quantity':Number(val(line,'Quantity','quantity')||1),'Unit':val(line,'Unit','unit')||'each','Quote Checklist Key':key,'Quote Revision':revision,'Instructions':val(quote,'Scope','Deliverables')||'','Notes':`Generated from accepted quote ${val(quote,'Quote Number')||qid}, revision ${revision}. Internal work checklist; no customer action occurred.`,'Created Time':new Date().toISOString(),'Updated Time':new Date().toISOString(),'Record Version':1};
        await saveTask(record);
      }
      const old=tasks.filter(task=>text(val(task,'Quote ID'))===qid&&text(val(task,'Task Type'))==='Quote Work'&&!expected.has(rid(task,'Task ID','taskId'))&&openStatus(task));
      for(const task of old){await saveTask({...task,'Status':'Completed','Completed Time':new Date().toISOString(),'Completion Reason':`Superseded by quote revision ${revision}`,'Updated Time':new Date().toISOString(),'Record Version':Math.max(1,Number(val(task,'Record Version')||0)+1)});}
    }
    return true;
  }catch(error){console.warn('[H38 shared lifecycle task UI]',error?.message||error);return false;}finally{reconciling=false;}
}
let scheduled=false;
function apply(){scheduled=false;renderTodayTasks();void reconcileQuoteWorkTasks();}
function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(apply);}
function wrap(name){const base=window[name];if(typeof base!=='function'||base.__h38SharedLifecycleWrapped)return;const wrapped=function(){const result=base.apply(this,arguments);schedule();return result;};wrapped.__h38SharedLifecycleWrapped=true;wrapped.__h38SharedLifecycleBase=base;window[name]=wrapped;}
['renderToday','renderWork','renderQuotes'].forEach(wrap);
window.addEventListener('h38:business-snapshot-updated',schedule);window.addEventListener('h38:office-page-rendered',schedule);window.addEventListener('pageshow',schedule);schedule();
window.H38_SHARED_LIFECYCLE_TASK_UI=Object.freeze({enabled:true,build:BUILD,sharedOfficeEngine:true,completedStatusClosed:true,roleAwareToday:true,blankTasksOwnerOnly:true,quoteRevisionAware:true,quoteJobRelink:true,oldQuoteWorkRetired:true,externalActionsOccurred:false,taskVisible,renderTodayTasks,reconcileQuoteWorkTasks});
})();
