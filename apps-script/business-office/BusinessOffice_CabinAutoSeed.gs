/**
 * Owner-controlled Cabin Demo 08 generation bootstrap.
 * Version 3 processes the 21 packages in small resumable batches, verifies every
 * relevant Business Office table, and never performs an external action.
 */
const H38_CABIN_AUTOSEED_VERSION='V3-VERIFIED-ALL-TABLES';
const H38_CABIN_AUTOSEED_BATCH_SIZE=3;

function boCabinAutoSeedProperties_(){return PropertiesService.getScriptProperties();}
function boCabinAutoSeedDeleteTriggers_(){
  ScriptApp.getProjectTriggers().filter(function(trigger){return trigger.getHandlerFunction()==='boRunCabinAutoSeed_';}).forEach(function(trigger){ScriptApp.deleteTrigger(trigger);});
}
function boCabinAutoSeedSchedule_(delayMs){
  boCabinAutoSeedDeleteTriggers_();
  ScriptApp.newTrigger('boRunCabinAutoSeed_').timeBased().after(Math.max(1000,Number(delayMs)||1000)).create();
}
function boCabinAutoSeedStoreOwner_(user){
  boCabinAutoSeedProperties_().setProperty('H38_CABIN_DEMO08_OWNER_JSON',JSON.stringify({userId:user['User ID']||'',email:user.Email||'',businessId:user['Business ID']||boGetBusinessId_(),roleId:user['Role ID']||''}));
}
function boCabinAutoSeedOwner_(){
  var raw=boCabinAutoSeedProperties_().getProperty('H38_CABIN_DEMO08_OWNER_JSON');
  if(!raw)throw new Error('Cabin Demo 08 has no authenticated Owner generation context.');
  var saved=JSON.parse(raw),email=String(saved.email||'').toLowerCase(),user=boReadTable_(H38_BO_SHEETS.USERS,{includeVoided:true}).find(function(row){
    return row.Status==='Active'&&String(row['Business ID']||'')===boGetBusinessId_()&&((saved.userId&&row['User ID']===saved.userId)||(email&&String(row.Email||'').toLowerCase()===email));
  });
  if(!user)throw new Error('Stored Cabin Demo 08 Owner is no longer active.');
  var role=boGetRole_(user['Role ID']);if(!role||role['Role Name']!=='Owner')throw new Error('Stored Cabin Demo 08 user is not an Owner.');
  return user;
}
function boCabinAutoSeedAcceptCoverage_(properties,coverage){
  properties.setProperty('H38_CABIN_DEMO08_GENERATED','YES');properties.setProperty('H38_CABIN_DEMO08_GENERATED_VERSION',H38_CABIN_AUTOSEED_VERSION);properties.setProperty('H38_CABIN_DEMO08_STATUS','PASS');properties.setProperty('H38_CABIN_DEMO08_PROGRESS','21/21');properties.setProperty('H38_CABIN_DEMO08_CURSOR','21');properties.setProperty('H38_CABIN_DEMO08_RESULT_JSON',JSON.stringify(coverage));properties.setProperty('H38_CABIN_DEMO08_COMPLETED_AT',new Date().toISOString());properties.deleteProperty('H38_CABIN_DEMO08_ERROR');
}
function boEnsureCabinDemo08Generation_(owner){
  var properties=boCabinAutoSeedProperties_(),generated=properties.getProperty('H38_CABIN_DEMO08_GENERATED_VERSION');
  if(generated===H38_CABIN_AUTOSEED_VERSION)return {status:'PASS',generated:true};
  try{
    var existingCoverage=boVerifyCabinDemo08TableCoverage_(boCabinDemo_(),boCabinRoot_());
    if(existingCoverage.status==='PASS'){boCabinAutoSeedAcceptCoverage_(properties,existingCoverage);return {status:'PASS',generated:true,coverage:existingCoverage};}
  }catch(coverageError){}
  boCabinAutoSeedStoreOwner_(owner);
  var lock=LockService.getScriptLock();if(!lock.tryLock(3000))return {status:'RUNNING',generated:false};
  try{
    generated=properties.getProperty('H38_CABIN_DEMO08_GENERATED_VERSION');if(generated===H38_CABIN_AUTOSEED_VERSION)return {status:'PASS',generated:true};
    var status=properties.getProperty('H38_CABIN_DEMO08_STATUS')||'';
    if(status!=='RUNNING'&&status!=='SCHEDULED'){
      properties.setProperty('H38_CABIN_DEMO08_CURSOR','0');
      properties.setProperty('H38_CABIN_DEMO08_STATUS','SCHEDULED');
      properties.setProperty('H38_CABIN_DEMO08_SCHEDULED_AT',new Date().toISOString());
      properties.deleteProperty('H38_CABIN_DEMO08_ERROR');
    }
    boCabinAutoSeedSchedule_(1000);
    properties.setProperty('H38_CABIN_DEMO08_TRIGGERED_VERSION',H38_CABIN_AUTOSEED_VERSION);
    return {status:'SCHEDULED',generated:false};
  }finally{lock.releaseLock();}
}

var H38_CABIN_AUTOSEED_BOOTSTRAP=(function(){
  try{
    if(typeof boGetCurrentUser_!=='function'||typeof boGetRole_!=='function')return false;
    var user=boGetCurrentUser_(),role=boGetRole_(user['Role ID']);
    if(!role||role['Role Name']!=='Owner')return false;
    boEnsureCabinDemo08Generation_(user);return true;
  }catch(error){return false;}
})();

function boRunCabinAutoSeed_(){
  var properties=boCabinAutoSeedProperties_(),lock=LockService.getScriptLock();
  if(!lock.tryLock(30000))return {status:'BUSY'};
  try{
    boCabinAutoSeedDeleteTriggers_();
    properties.setProperty('H38_CABIN_DEMO08_STATUS','RUNNING');
    if(!properties.getProperty('H38_CABIN_DEMO08_STARTED_AT'))properties.setProperty('H38_CABIN_DEMO08_STARTED_AT',new Date().toISOString());
    var owner=boCabinAutoSeedOwner_(),cfg=boCabinDemo_(),cursor=Math.max(0,Number(properties.getProperty('H38_CABIN_DEMO08_CURSOR')||0));
    if(cursor===0)boPrepareCabinDemo08Generation_(owner);
    var end=Math.min(cfg.packages.length,cursor+H38_CABIN_AUTOSEED_BATCH_SIZE),results=[];
    for(var index=cursor;index<end;index++)results.push(boGeneratePreparedCabinSubquote_(cfg.packages[index][0],owner));
    properties.setProperty('H38_CABIN_DEMO08_CURSOR',String(end));
    properties.setProperty('H38_CABIN_DEMO08_PROGRESS',String(end)+'/'+String(cfg.packages.length));
    properties.setProperty('H38_CABIN_DEMO08_UPDATED_AT',new Date().toISOString());
    if(end<cfg.packages.length){boCabinAutoSeedSchedule_(5000);return {status:'RUNNING',processed:end,total:cfg.packages.length,batch:results.length,externalActionsPerformed:false};}
    var finalResult=boFinalizeCabinDemo08Generation_(owner);
    boCabinAutoSeedAcceptCoverage_(properties,finalResult.coverage||finalResult);
    properties.setProperty('H38_CABIN_DEMO08_RESULT_JSON',JSON.stringify(finalResult));
    return finalResult;
  }catch(error){
    properties.setProperty('H38_CABIN_DEMO08_STATUS','HOLD');
    properties.setProperty('H38_CABIN_DEMO08_ERROR',String(error&&error.stack||error));
    properties.deleteProperty('H38_CABIN_DEMO08_TRIGGERED_VERSION');
    throw error;
  }finally{lock.releaseLock();}
}

function boRestartCabinDemo08Generation(){
  var owner=boRequireOwner_(),properties=boCabinAutoSeedProperties_();
  ['H38_CABIN_DEMO08_GENERATED','H38_CABIN_DEMO08_GENERATED_VERSION','H38_CABIN_DEMO08_TRIGGERED_VERSION','H38_CABIN_DEMO08_RESULT_JSON','H38_CABIN_DEMO08_ERROR','H38_CABIN_DEMO08_COMPLETED_AT'].forEach(function(key){properties.deleteProperty(key);});
  properties.setProperty('H38_CABIN_DEMO08_CURSOR','0');properties.setProperty('H38_CABIN_DEMO08_STATUS','SCHEDULED');properties.setProperty('H38_CABIN_DEMO08_PROGRESS','0/21');
  boCabinAutoSeedStoreOwner_(owner);boCabinAutoSeedSchedule_(1000);
  return boCabinDemoGenerationStatus();
}

function boCabinDemoGenerationStatus(){
  boRequireOwner_();var properties=boCabinAutoSeedProperties_();
  return {version:H38_CABIN_AUTOSEED_VERSION,status:properties.getProperty('H38_CABIN_DEMO08_STATUS')||'NOT SCHEDULED',progress:properties.getProperty('H38_CABIN_DEMO08_PROGRESS')||'0/21',cursor:Number(properties.getProperty('H38_CABIN_DEMO08_CURSOR')||0),total:21,generatedVersion:properties.getProperty('H38_CABIN_DEMO08_GENERATED_VERSION')||'',generated:properties.getProperty('H38_CABIN_DEMO08_GENERATED_VERSION')===H38_CABIN_AUTOSEED_VERSION,scheduledAt:properties.getProperty('H38_CABIN_DEMO08_SCHEDULED_AT')||'',startedAt:properties.getProperty('H38_CABIN_DEMO08_STARTED_AT')||'',updatedAt:properties.getProperty('H38_CABIN_DEMO08_UPDATED_AT')||'',completedAt:properties.getProperty('H38_CABIN_DEMO08_COMPLETED_AT')||'',result:properties.getProperty('H38_CABIN_DEMO08_RESULT_JSON')||'',error:properties.getProperty('H38_CABIN_DEMO08_ERROR')||'',externalActionsPerformed:false};
}
