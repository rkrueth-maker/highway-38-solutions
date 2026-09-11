(function(){
'use strict';
const BUILD='20260911-office-scale-task-guard-1';
function text(value){return String(value==null?'':value).trim();}
function taskId(row){return text(row?.['Task ID']||row?.taskId);}
function checklistKey(row){return text(row?.['Quote Checklist Key']);}
function dedupeTasks(){const rows=window.state?.snapshot?.tasks;if(!Array.isArray(rows)||rows.length<2)return 0;const seenIds=new Set(),seenKeys=new Set(),next=[];let removed=0;for(const row of rows){const id=taskId(row),key=checklistKey(row);if((id&&seenIds.has(id))||(key&&seenKeys.has(key))){removed++;continue;}if(id)seenIds.add(id);if(key)seenKeys.add(key);next.push(row);}if(removed)window.state.snapshot.tasks=next;return removed;}
function wrapQueue(){const base=window.queueOperation;if(typeof base!=='function'||base.__h38ScaleTaskGuard)return;const wrapped=async function(){const args=Array.from(arguments),result=await base.apply(this,args);if(args[0]==='SAVE_ENTITY'&&args[1]==='Task'){setTimeout(dedupeTasks,0);setTimeout(dedupeTasks,60);}return result;};wrapped.__h38ScaleTaskGuard=true;wrapped.__h38ScaleTaskGuardBase=base;window.queueOperation=wrapped;}
wrapQueue();window.addEventListener('h38:business-snapshot-updated',dedupeTasks);document.addEventListener('h38:business-snapshot-updated',dedupeTasks);window.addEventListener('pageshow',()=>{wrapQueue();dedupeTasks();});
window.H38_OFFICE_SCALE_TASK_GUARD=Object.freeze({enabled:true,build:BUILD,optimisticTaskDedupe:true,externalActions:false,dedupeTasks});
})();