/**
 * Owner-controlled Cabin Demo 08 generation bootstrap.
 * Version 2 requires all 21 packages to exist across the linked Business Office
 * tables and requires 21 generated PDFs. No external action is performed.
 */
const H38_CABIN_AUTOSEED_VERSION='V2-COMPLETE-TABLE-COVERAGE';

var H38_CABIN_AUTOSEED_BOOTSTRAP=(function(){
  try{
    if(typeof boGetCurrentUser_!=='function'||typeof boGetRole_!=='function')return false;
    var user=boGetCurrentUser_(),role=boGetRole_(user['Role ID']);
    if(!role||role['Role Name']!=='Owner')return false;
    var properties=PropertiesService.getScriptProperties();
    if(properties.getProperty('H38_CABIN_DEMO08_GENERATED_VERSION')===H38_CABIN_AUTOSEED_VERSION)return true;
    if(properties.getProperty('H38_CABIN_DEMO08_TRIGGERED_VERSION')===H38_CABIN_AUTOSEED_VERSION)return true;
    var lock=LockService.getScriptLock();if(!lock.tryLock(1000))return false;
    try{
      if(properties.getProperty('H38_CABIN_DEMO08_GENERATED_VERSION')===H38_CABIN_AUTOSEED_VERSION||properties.getProperty('H38_CABIN_DEMO08_TRIGGERED_VERSION')===H38_CABIN_AUTOSEED_VERSION)return true;
      ScriptApp.newTrigger('boRunCabinAutoSeed_').timeBased().after(1000).create();
      properties.setProperty('H38_CABIN_DEMO08_TRIGGERED_VERSION',H38_CABIN_AUTOSEED_VERSION);
      properties.setProperty('H38_CABIN_DEMO08_STATUS','SCHEDULED');
      properties.setProperty('H38_CABIN_DEMO08_SCHEDULED_AT',new Date().toISOString());
      return true;
    }finally{lock.releaseLock();}
  }catch(error){return false;}
})();

function boRunCabinAutoSeed_(){
  var properties=PropertiesService.getScriptProperties();
  properties.setProperty('H38_CABIN_DEMO08_STATUS','RUNNING');
  properties.setProperty('H38_CABIN_DEMO08_STARTED_AT',new Date().toISOString());
  try{
    var result=boGenerateAllCabinSubquotes();
    var checks={subquotes:Number(result&&result.subquoteCount),pdfs:Number(result&&result.pdfCount),quotes:Number(result&&result.quoteRecordCount),approvals:Number(result&&result.approvalCount),tasks:Number(result&&result.workOrderCount),purchaseOrders:Number(result&&result.purchaseOrderCount),proof:Number(result&&result.proofCount)};
    if(checks.subquotes!==21||checks.pdfs!==21||checks.quotes!==22||checks.approvals!==22||checks.tasks!==21||checks.purchaseOrders!==21||checks.proof!==21)throw new Error('Cabin generator incomplete: '+JSON.stringify(checks));
    properties.setProperty('H38_CABIN_DEMO08_GENERATED','YES');
    properties.setProperty('H38_CABIN_DEMO08_GENERATED_VERSION',H38_CABIN_AUTOSEED_VERSION);
    properties.setProperty('H38_CABIN_DEMO08_STATUS','PASS');
    properties.setProperty('H38_CABIN_DEMO08_COMPLETED_AT',new Date().toISOString());
    properties.setProperty('H38_CABIN_DEMO08_RESULT_JSON',JSON.stringify(result));
    if(typeof boProof_==='function')boProof_('GENERATE CABIN DEMO 08','Project','H38-DEMO8-CABIN','PASS','Generated master project, all 21 sub-quotes, 21 PDFs, approvals, tasks, purchase-planning records, documents, proof, activity, and backup records. External actions remained disabled.',Session.getActiveUser().getEmail());
    return result;
  }catch(error){
    properties.deleteProperty('H38_CABIN_DEMO08_TRIGGERED_VERSION');
    properties.setProperty('H38_CABIN_DEMO08_STATUS','HOLD');
    properties.setProperty('H38_CABIN_DEMO08_ERROR',String(error&&error.stack||error));
    throw error;
  }finally{
    ScriptApp.getProjectTriggers().filter(function(trigger){return trigger.getHandlerFunction()==='boRunCabinAutoSeed_';}).forEach(function(trigger){ScriptApp.deleteTrigger(trigger);});
  }
}

function boCabinDemoGenerationStatus(){
  boRequireOwner_();
  var properties=PropertiesService.getScriptProperties();
  return {version:H38_CABIN_AUTOSEED_VERSION,status:properties.getProperty('H38_CABIN_DEMO08_STATUS')||'NOT SCHEDULED',generatedVersion:properties.getProperty('H38_CABIN_DEMO08_GENERATED_VERSION')||'',generated:properties.getProperty('H38_CABIN_DEMO08_GENERATED_VERSION')===H38_CABIN_AUTOSEED_VERSION,scheduledAt:properties.getProperty('H38_CABIN_DEMO08_SCHEDULED_AT')||'',startedAt:properties.getProperty('H38_CABIN_DEMO08_STARTED_AT')||'',completedAt:properties.getProperty('H38_CABIN_DEMO08_COMPLETED_AT')||'',result:properties.getProperty('H38_CABIN_DEMO08_RESULT_JSON')||'',error:properties.getProperty('H38_CABIN_DEMO08_ERROR')||'',externalActionsPerformed:false};
}
