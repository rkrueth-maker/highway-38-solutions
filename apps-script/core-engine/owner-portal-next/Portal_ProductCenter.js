/** Owner-only Product Center pack preview and explicit enable controls. */
var H38_PRODUCT_CENTER_VERSION_='2026.07.21-phases-2-3';

function h38PortalProductCenterOwner_(){
  var access=h38PortalRequireUnifiedUser_();
  boAssert_(access&&access.ownerMode===true,'Owner access is required for Product Center.');
  return access;
}

function h38PortalProductCenterCatalogMap_(){
  var map={};
  (typeof boGetProductPackCatalog_==='function'?boGetProductPackCatalog_():[]).forEach(function(pack){map[pack.key]=pack;});
  return map;
}

function h38PortalProductCenterPackClosure_(packKey,catalogMap,seen){
  seen=seen||{};
  if(seen[packKey])return [];
  seen[packKey]=true;
  var pack=catalogMap[packKey];
  boAssert_(pack,'Unknown product pack or add-on: '+packKey);
  var ordered=[];
  (pack.dependencies||[]).forEach(function(dependency){ordered=ordered.concat(h38PortalProductCenterPackClosure_(dependency,catalogMap,seen));});
  ordered.push(packKey);
  return ordered;
}

function h38PortalProductCenterModuleMap_(architecture){
  return architecture&&architecture.moduleAvailability||{};
}

function h38PortalProductCenterPackRecordCount_(pack){
  return (pack.includedModules||[]).reduce(function(total,module){return total+(Number(module.recordCount)||0);},0);
}

function h38PortalProductCenterPackLastUsed_(pack){
  var used=(pack.includedModules||[]).filter(function(module){return module.lastUsed;}).sort(function(a,b){return String(b.lastUsed).localeCompare(String(a.lastUsed));});
  return used.length?{at:used[0].lastUsed,by:used[0].lastUsedBy||'',module:used[0].label||used[0].key}:{at:'',by:'',module:''};
}

function h38PortalProductCenterPackSummary_(pack){
  return Object.assign({},pack,{
    recordCount:h38PortalProductCenterPackRecordCount_(pack),
    roleVisibility:(pack.roleVisibility||[]).slice(),
    dependencies:(pack.dependencies||[]).slice(),
    lastUsed:h38PortalProductCenterPackLastUsed_(pack),
    existingRecordsWarning:'Existing records, documents, proof, errors, permissions, and audit history remain preserved.',
    possibleCostImpact:'No purchase occurs in Product Center. Any licensing or third-party cost remains a separate Owner decision.'
  });
}

function h38PortalProductCenter(){
  var access=h38PortalProductCenterOwner_();
  var architecture=h38PortalProductArchitecture();
  var packs=(architecture.packs||[]).map(h38PortalProductCenterPackSummary_);
  return {
    status:'PASS',
    version:H38_PRODUCT_CENTER_VERSION_,
    ownerMode:true,
    user:architecture.user,
    installedPacks:packs.filter(function(pack){return pack.kind!=='addon'&&(pack.installedState==='installed'||pack.installedState==='included');}),
    availablePacks:packs.filter(function(pack){return pack.kind!=='addon'&&pack.installedState!=='installed'&&pack.installedState!=='included';}),
    specialistAddOns:packs.filter(function(pack){return pack.kind==='addon';}),
    allPacks:packs,
    moduleAvailability:architecture.moduleAvailability,
    legacyProducts:architecture.legacyProducts,
    legacyAliases:architecture.legacyAliases,
    legacyRoutesPreserved:true,
    existingRecordsPreserved:true,
    advancedModuleControlsAvailable:true,
    automaticDisableAllowed:false,
    packChangesRequireExactOwnerConfirmation:true,
    noPurchaseOccurs:true,
    externalActionsOccurred:false,
    accessVerifiedFor:access.user.Email
  };
}

function h38PortalPreviewProductChange(packKey,action){
  h38PortalProductCenterOwner_();
  packKey=boNormalizeText_(packKey);
  action=boNormalizeText_(action||'ENABLE').toUpperCase();
  boAssert_(action==='ENABLE','Product Center never disables modules automatically. Use Advanced Module Controls for an individually reviewed disable action.');
  var center=h38PortalProductCenter();
  var catalogMap=h38PortalProductCenterCatalogMap_();
  var orderedPackKeys=h38PortalProductCenterPackClosure_(packKey,catalogMap,{});
  var moduleMap=h38PortalProductCenterModuleMap_(center);
  var moduleKeys=[];
  orderedPackKeys.forEach(function(key){moduleKeys=moduleKeys.concat(catalogMap[key].modules||[]);});
  moduleKeys=moduleKeys.filter(function(key,index,list){return list.indexOf(key)===index;});
  var modules=moduleKeys.map(function(key){return moduleMap[key]||{key:key,label:key,enabled:false,installed:false,virtual:true,recordCount:0,roles:['Owner'],dependencies:[]};});
  var enableModules=modules.filter(function(module){return module.enabled!==true&&module.virtual!==true;});
  var configurationRequired=modules.filter(function(module){return module.enabled!==true&&module.virtual===true;});
  var roles=[];
  modules.forEach(function(module){roles=roles.concat(module.roles||[]);});
  roles=roles.filter(function(role,index,list){return list.indexOf(role)===index;});
  return {
    status:'PASS',
    action:'ENABLE',
    packKey:packKey,
    pack:catalogMap[packKey],
    dependencyPacks:orderedPackKeys.filter(function(key){return key!==packKey;}),
    packsToEnable:orderedPackKeys,
    modulesReviewed:modules,
    modulesToEnable:enableModules.map(function(module){return module.key;}),
    configurationRequired:configurationRequired.map(function(module){return module.key;}),
    existingRecordCountReviewed:modules.reduce(function(total,module){return total+(Number(module.recordCount)||0);},0),
    rolesWithAccess:roles,
    permissionImpact:'No role or credential is changed. Existing permission checks continue to control access to every included module.',
    dataImpact:'Existing records and history stay in place. Enabling only restores permitted navigation and new-work capability.',
    migrationSteps:[
      'Review included modules, dependency packs, roles, records, and last-used information.',
      'Type the exact confirmation ENABLE PACK.',
      'Enable only currently disabled, non-virtual modules.',
      'Rebuild navigation from the existing role and permission model.',
      'Record the change in Proof Log.'
    ],
    possibleCostImpact:'No purchase, billing, subscription, or vendor action occurs. Any separate licensing decision remains Owner-controlled.',
    exactConfirmation:'ENABLE PACK',
    ownerApprovalRequired:true,
    automaticDisable:false,
    externalActionsOccurred:false
  };
}

function h38PortalProductCenterDirectEnable_(moduleKey,access){
  var overrides=h38PortalApplicationReadJson_(H38_APP_MODULE_OVERRIDES_KEY_,{});
  var prior=overrides[moduleKey]||{};
  overrides[moduleKey]={
    enabled:true,
    preservedRecordCount:prior.preservedRecordCount||h38PortalProductArchitectureRecordCount_(moduleKey),
    disabledAt:'',
    disabledBy:'',
    updatedAt:boNow_(),
    updatedBy:access.user.Email
  };
  h38PortalApplicationWriteJson_(H38_APP_MODULE_OVERRIDES_KEY_,overrides);
  return true;
}

function h38PortalApplyProductChange(packKey,action,confirmation){
  var access=h38PortalProductCenterOwner_();
  var preview=h38PortalPreviewProductChange(packKey,action);
  boAssert_(String(confirmation||'').trim().toUpperCase()===preview.exactConfirmation,'Type ENABLE PACK to apply this Product Center change.');
  var meta=typeof h38PortalApplicationModuleMeta_==='function'?h38PortalApplicationModuleMeta_():{};
  var changed=[];
  preview.modulesToEnable.forEach(function(moduleKey){
    if(meta[moduleKey]&&typeof h38PortalSetModuleOverride==='function')h38PortalSetModuleOverride(moduleKey,true,false);
    else h38PortalProductCenterDirectEnable_(moduleKey,access);
    changed.push(moduleKey);
  });
  if(typeof BO_PACK_CACHE_!=='undefined')BO_PACK_CACHE_=null;
  if(typeof boProof_==='function')boProof_('PRODUCT_PACK_ENABLED','Product Pack',preview.packKey,'PASS','Owner confirmed ENABLE PACK. Enabled modules: '+(changed.join(', ')||'none')+'. No existing module was disabled and no purchase occurred.',access.user.Email);
  return {
    status:'PASS',
    packKey:preview.packKey,
    changedModules:changed,
    configurationRequired:preview.configurationRequired,
    existingRecordsPreserved:true,
    permissionsPreserved:true,
    noModuleDisabled:true,
    noPurchaseOccurred:true,
    ownerConfirmed:true,
    productCenter:h38PortalProductCenter(),
    externalActionsOccurred:false
  };
}
