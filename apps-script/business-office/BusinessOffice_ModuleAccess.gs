/** Business Office package-module enforcement. Disabled modules are rejected server-side. */
function boAssertModuleEnabled_(moduleKey){
  moduleKey=boNormalizeText_(moduleKey);
  if(!moduleKey||moduleKey==='dashboard')return true;
  if(typeof boGetUnifiedModule_==='function'){
    var contract=boGetUnifiedModule_(moduleKey);
    boAssert_(contract,'UNKNOWN MODULE — '+moduleKey+' is not declared in the canonical module contract.');
    moduleKey=contract.module;
  }
  boAssert_(boModuleEnabled_(moduleKey),'MODULE NOT INCLUDED — '+moduleKey+' is not enabled by the installed business package.');
  return true;
}
function boRequireModules_(moduleKeys){(moduleKeys||[]).forEach(function(moduleKey){boAssertModuleEnabled_(moduleKey);});return true;}
function boModuleFromRecordType_(recordType){return typeof boModuleFromRecordTypeContract_==='function'?boModuleFromRecordTypeContract_(recordType):'';}
function boGuardApiRequest_(action,args){
  boAssert_(typeof boModulesForApiAction_==='function','Canonical API action contract is unavailable.');
  boRequireModules_(boModulesForApiAction_(boNormalizeText_(action),args||{}));
  return true;
}
