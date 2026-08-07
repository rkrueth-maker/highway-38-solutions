(function(){
'use strict';
const BUILD='20260806-2100';
const C=window.H38_FIELD_VISIT_CORE;
const DB=window.H38DB;
if(!C||!DB)return;
let syncing=false;
const terminal=new Set(['SYNCED','COMPLETE','COMPLETED']);
const text=value=>String(value==null?'':value);
const operationStatus=operation=>text(operation?.syncStatus||operation?.status).toUpperCase();
const businessId=()=>text(C.business?.()||window.state?.businessId).trim();

async function waitingOperations(){
  const active=businessId();
  const operations=await DB.all('operations');
  return operations
    .filter(operation=>(!operation.businessId||operation.businessId===active)&&!terminal.has(operationStatus(operation)))
    .sort((a,b)=>text(a.localTimestamp).localeCompare(text(b.localTimestamp)));
}

async function saveFailure(operation,message,status='PENDING'){
  operation.syncStatus=status;
  operation.retryCount=Number(operation.retryCount||0)+1;
  operation.lastError=text(message||'Sync failed');
  await DB.put('operations',operation);
}

async function refreshSnapshot(){
  const active=businessId(),app=window.state,bridge=app?.bridge;
  if(!active||!bridge?.request)return;
  try{
    const snapshot=await bridge.request('completionBootstrap',{businessId:active},90000);
    if(!snapshot)return;
    snapshot.id=`business:${active}`;
    snapshot.cachedAt=new Date().toISOString();
    await DB.put('snapshots',snapshot);
    app.snapshot=snapshot;
  }catch(error){
    console.warn('Field visit post-sync refresh:',error?.message||error);
  }
}

async function syncNow(){
  if(syncing){C.toast('The saved field visit is already uploading.');return;}
  if(!navigator.onLine){C.toast('The visit is still safe on this phone. Reconnect before syncing.',true);return;}
  const synchronize=window.H38_SUPABASE_OPERATIONAL?.synchronize;
  if(typeof synchronize!=='function'){
    C.toast('Secure Supabase sync is not ready. Keep this app open and try Sync again.',true);
    return;
  }
  const allWaiting=await waitingOperations();
  const conflicts=allWaiting.filter(operation=>operationStatus(operation)==='CONFLICT');
  const operations=allWaiting.filter(operation=>operationStatus(operation)!=='CONFLICT');
  if(!operations.length){
    await C.pending();
    C.toast(conflicts.length?`${conflicts.length} item${conflicts.length===1?' needs':'s need'} conflict review.`:'Everything is synchronized.');
    return;
  }
  syncing=true;
  let completed=0,failed=0;
  const failures=[];
  try{
    for(let index=0;index<operations.length;index+=4){
      const batch=operations.slice(index,index+4);
      C.toast(`Uploading saved site visit… ${completed} of ${operations.length}`);
      let response;
      try{
        response=await synchronize(batch);
      }catch(error){
        for(const operation of batch)await saveFailure(operation,error?.message||error);
        failed+=batch.length;
        failures.push(text(error?.message||error));
        continue;
      }
      const results=new Map((response?.results||[]).map(result=>[text(result.operationId),result]));
      for(const operation of batch){
        const key=text(operation.operationId||operation.id),result=results.get(key);
        if(result&&['SYNCED','ALREADY_SYNCED'].includes(text(result.status).toUpperCase())){
          await DB.remove('operations',operation.id);
          completed++;
        }else if(result&&text(result.status).toUpperCase()==='CONFLICT'){
          await saveFailure(operation,result.message||'A newer server version needs review.','CONFLICT');
          failed++;
        }else{
          const message=result?.message||'The server did not confirm this queued item.';
          await saveFailure(operation,message);
          failures.push(text(message));
          failed++;
        }
      }
      await C.pending();
    }
    await refreshSnapshot();
    await C.pending();
    if(!failed)C.toast(`${completed} saved item${completed===1?'':'s'} uploaded. Site visit is synchronized.`);
    else C.toast(`${completed} uploaded; ${failed} still waiting. ${failures[0]||'Press Sync to retry.'}`,true);
  }finally{
    syncing=false;
  }
}

function openAdvanced(event){
  const target=event.target instanceof Element?event.target.closest('#fieldAdvanced'):null;
  if(!target)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(!window.H38_SITE_SCANNER?.open){C.toast('Advanced scanner tools are unavailable.',true);return;}
  const quoteId=text(C.state.visit?.quoteId);
  window.H38_FIELD_VISIT_ADVANCED_UNTIL=Date.now()+10*60*1000;
  window.H38_FIELD_VISIT?.close?.();
  if(window.state?.quote&&quoteId)window.state.quote.quoteId=quoteId;
  window.H38_SITE_SCANNER.open('quotes');
}

function interceptClick(event){
  const target=event.target instanceof Element?event.target:null;
  if(!target)return;
  if(target.closest('#fieldSync')){
    event.preventDefault();
    event.stopImmediatePropagation();
    syncNow().catch(error=>{syncing=false;C.toast(error?.message||error,true);});
    return;
  }
  if(target.closest('#fieldAdvanced')){openAdvanced(event);return;}
  if(target.closest('#scannerBack')||target.closest('#mainNav [data-page]'))window.H38_FIELD_VISIT_ADVANCED_UNTIL=0;
}

function loadMeasurementFix(){
  if(window.H38_FIELD_VISIT_MEASUREMENT_FIX||document.querySelector('script[data-h38-field-measurement-fix]'))return;
  const script=document.createElement('script');
  script.src='./field-visit-measurement-fix.js?build=20260806-2100';
  script.dataset.h38FieldMeasurementFix='1';
  document.head.appendChild(script);
}

document.addEventListener('click',interceptClick,true);
loadMeasurementFix();
window.H38_FIELD_VISIT_RECOVERY={build:BUILD,syncNow,waitingOperations,databaseAuthority:'existing Supabase Business Office'};
})();
