/**
 * One-time owner-controlled cabin demonstration generation.
 *
 * This schedules the complete 21-sub-quote package automatically on the first
 * authenticated Owner load after deployment. It is idempotent and performs no
 * customer sends, purchasing, payments, scheduling, or other external actions.
 */
var H38_CABIN_AUTOSEED_BOOTSTRAP = (function(){
  try {
    if (typeof boGetCurrentUser_ !== 'function' || typeof boGetRole_ !== 'function') return false;
    var user = boGetCurrentUser_();
    var role = boGetRole_(user['Role ID']);
    if (!role || role['Role Name'] !== 'Owner') return false;

    var properties = PropertiesService.getScriptProperties();
    if (properties.getProperty('H38_CABIN_DEMO08_GENERATED') === 'YES') return true;
    if (properties.getProperty('H38_CABIN_DEMO08_TRIGGERED') === 'YES') return true;

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) return false;
    try {
      if (properties.getProperty('H38_CABIN_DEMO08_GENERATED') === 'YES' || properties.getProperty('H38_CABIN_DEMO08_TRIGGERED') === 'YES') return true;
      ScriptApp.newTrigger('boRunCabinAutoSeed_').timeBased().after(1000).create();
      properties.setProperty('H38_CABIN_DEMO08_TRIGGERED','YES');
      properties.setProperty('H38_CABIN_DEMO08_STATUS','SCHEDULED');
      properties.setProperty('H38_CABIN_DEMO08_SCHEDULED_AT',new Date().toISOString());
      return true;
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return false;
  }
})();

function boRunCabinAutoSeed_(){
  var properties = PropertiesService.getScriptProperties();
  properties.setProperty('H38_CABIN_DEMO08_STATUS','RUNNING');
  properties.setProperty('H38_CABIN_DEMO08_STARTED_AT',new Date().toISOString());
  try {
    var result = boGenerateAllCabinSubquotes();
    if (!result || Number(result.subquoteCount) !== 21 || Number(result.pdfCount) !== 21) throw new Error('Cabin generator did not return 21 sub-quotes and 21 PDFs.');
    properties.setProperty('H38_CABIN_DEMO08_GENERATED','YES');
    properties.setProperty('H38_CABIN_DEMO08_STATUS','PASS');
    properties.setProperty('H38_CABIN_DEMO08_COMPLETED_AT',new Date().toISOString());
    properties.setProperty('H38_CABIN_DEMO08_RESULT_JSON',JSON.stringify(result));
    if (typeof boProof_ === 'function') boProof_('GENERATE CABIN DEMO 08','Project','H38-DEMO8-CABIN','PASS','Generated master project, 21 linked sub-quotes, 21 PDFs, shared approved visuals, tasks, documents, and proof records. External actions remained disabled.',Session.getActiveUser().getEmail());
    return result;
  } catch (error) {
    properties.setProperty('H38_CABIN_DEMO08_TRIGGERED','NO');
    properties.setProperty('H38_CABIN_DEMO08_STATUS','HOLD');
    properties.setProperty('H38_CABIN_DEMO08_ERROR',String(error && error.stack || error));
    throw error;
  } finally {
    ScriptApp.getProjectTriggers().filter(function(trigger){return trigger.getHandlerFunction()==='boRunCabinAutoSeed_';}).forEach(function(trigger){ScriptApp.deleteTrigger(trigger);});
  }
}

function boCabinDemoGenerationStatus(){
  boRequireOwner_();
  var properties=PropertiesService.getScriptProperties();
  return {
    status:properties.getProperty('H38_CABIN_DEMO08_STATUS')||'NOT SCHEDULED',
    generated:properties.getProperty('H38_CABIN_DEMO08_GENERATED')==='YES',
    scheduledAt:properties.getProperty('H38_CABIN_DEMO08_SCHEDULED_AT')||'',
    startedAt:properties.getProperty('H38_CABIN_DEMO08_STARTED_AT')||'',
    completedAt:properties.getProperty('H38_CABIN_DEMO08_COMPLETED_AT')||'',
    result:properties.getProperty('H38_CABIN_DEMO08_RESULT_JSON')||'',
    error:properties.getProperty('H38_CABIN_DEMO08_ERROR')||'',
    externalActionsPerformed:false
  };
}