/**
 * Unified Highway 38 application bootstrap.
 *
 * Visible navigation is generated exclusively from the canonical module
 * contract through Portal_Module_Registry.js. This file owns access filtering,
 * capability ownership, the browser module index, and the single startup RPC.
 */

function h38PortalUnifiedPackModuleEnabled_(moduleKey) {
  if (!moduleKey) return true;
  if (typeof boModuleEnabled_ === 'function') return boModuleEnabled_(moduleKey);
  return true;
}

function h38PortalUnifiedCapabilityOwner_(capability) {
  if (typeof h38UnifiedShellCapabilityOwner_ === 'function') return h38UnifiedShellCapabilityOwner_(capability);
  if (capability === 'quotes') {
    return h38PortalUnifiedPackModuleEnabled_('quoteBuilder') && h38PortalUnifiedPackModuleEnabled_('quotes') ? 'quoteBuilder' : 'legacyQuotes';
  }
  return capability;
}

function h38PortalUnifiedItem_(key, label, type, moduleKey, gate, extras) {
  var item = {
    key:key,
    label:label,
    type:type || 'native',
    module:moduleKey || key,
    gate:gate || moduleKey || key,
    enabled:h38PortalUnifiedPackModuleEnabled_(gate || moduleKey || key)
  };
  Object.keys(extras || {}).forEach(function(name){ item[name] = extras[name]; });
  return item;
}

function h38PortalUnifiedCanViewItem_(access, item) {
  if (!item.enabled) return false;
  if (typeof h38FieldRoleKnown_ === 'function' && h38FieldRoleKnown_(access.role)) return h38FieldRoleCanView_(access,item.gate || item.module);
  if (typeof h38PortalApplicationRoleCanView_ === 'function') return h38PortalApplicationRoleCanView_(access,item.gate || item.module);
  if (access.ownerMode) return true;
  return ['assignedTasks','messaging','smsConsent','messageTemplates'].indexOf(item.module) >= 0;
}

function h38PortalUnifiedBuildGroups_(access, quoteCapabilityOwner) {
  if (typeof h38PortalModuleRegistry_ !== 'function') throw new Error('Unified module registry is unavailable.');
  return h38PortalModuleRegistry_(quoteCapabilityOwner).map(function(group){
    return {
      id:group.id,
      label:group.label,
      icon:group.icon || '',
      items:(group.items || []).map(function(source){
        return h38PortalUnifiedItem_(source.key,source.label,source.type,source.module,source.gate,{
          icon:source.icon || '',
          keywords:source.keywords || '',
          secondary:source.secondary === true,
          capability:source.capability || '',
          dependencies:(source.dependencies||[]).slice(),
          loadStrategy:source.loadStrategy||'on-demand',
          cacheTtlSeconds:Number(source.cacheTtlSeconds||0),
          dataOwner:source.dataOwner||'',
          disablePolicy:source.disablePolicy||'soft-disable-preserve-records'
        });
      }).filter(function(item){ return h38PortalUnifiedCanViewItem_(access,item); })
    };
  }).filter(function(group){ return group.items.length > 0; });
}

function h38PortalUnifiedBootstrap() {
  var access = h38PortalRequireUnifiedUser_();
  var serviceUrl = ScriptApp.getService().getUrl();
  var definitions = typeof h38PortalBusinessDefinitions_ === 'function' ? h38PortalBusinessDefinitions_() : (typeof boGetModuleDefinitions_ === 'function' ? boGetModuleDefinitions_() : {});
  var shellRegistry = typeof h38UnifiedShellRegistry === 'function' ? h38UnifiedShellRegistry() : null;
  var quoteCapabilityOwner = shellRegistry && shellRegistry.capabilityOwners ? shellRegistry.capabilityOwners.quotes : h38PortalUnifiedCapabilityOwner_('quotes');
  var disabledLegacyCapabilities = shellRegistry && shellRegistry.disabledLegacyCapabilities ? shellRegistry.disabledLegacyCapabilities : {quotes:quoteCapabilityOwner === 'quoteBuilder'};
  var groups = h38PortalUnifiedBuildGroups_(access,quoteCapabilityOwner);
  var defaultModule = access.ownerMode ? 'today' : 'bo:assignedTasks';
  var allKeys = [];
  var moduleIndex = {};
  groups.forEach(function(group){
    group.items.forEach(function(item){
      allKeys.push(item.key);
      moduleIndex[item.key] = {
        key:item.key,
        label:item.label,
        icon:item.icon,
        type:item.type,
        module:item.module,
        gate:item.gate,
        groupId:group.id,
        groupLabel:group.label,
        keywords:item.keywords,
        secondary:item.secondary,
        capability:item.capability,
        dependencies:item.dependencies,
        loadStrategy:item.loadStrategy,
        cacheTtlSeconds:item.cacheTtlSeconds,
        dataOwner:item.dataOwner,
        disablePolicy:item.disablePolicy
      };
    });
  });
  if (allKeys.indexOf(defaultModule) < 0) defaultModule = allKeys[0] || 'today';
  return {
    status:'PASS',
    version:typeof H38_APP_UX_VERSION_ !== 'undefined' ? H38_APP_UX_VERSION_ : 'unified',
    shellVersion:shellRegistry ? shellRegistry.version : '',
    architectureVersion:typeof H38_PORTAL_ARCHITECTURE_VERSION !== 'undefined' ? H38_PORTAL_ARCHITECTURE_VERSION : 'registry-v1',
    moduleContractVersion:typeof H38_UNIFIED_MODULE_CONTRACT_VERSION !== 'undefined' ? H38_UNIFIED_MODULE_CONTRACT_VERSION : '',
    singleApp:true,
    nativeBusinessOffice:true,
    adaptiveNavigation:true,
    packageId:typeof boPackValue_ === 'function' ? boPackValue_('package.id',boPackValue_('packId','highway38')) : 'highway38',
    packageName:typeof boPackValue_ === 'function' ? boPackValue_('package.name','Complete Business System') : 'Complete Business System',
    serviceUrl:serviceUrl,
    compatibilityBusinessOfficeUrl:serviceUrl + (serviceUrl.indexOf('?') >= 0 ? '&' : '?') + 'app=business-office',
    businessDefinitions:definitions,
    applicationRegistry:shellRegistry,
    capabilityOwners:{quotes:quoteCapabilityOwner},
    disabledLegacyCapabilities:disabledLegacyCapabilities,
    quoteBuilderEnabled:quoteCapabilityOwner === 'quoteBuilder',
    groups:groups,
    moduleIndex:moduleIndex,
    externalActionsEnabled:false,
    ownerApprovalRequired:true,
    ownerMode:access.ownerMode,
    user:{id:access.user['User ID'],email:access.user.Email,displayName:access.user['Display Name'],role:access.role},
    defaultModule:defaultModule,
    spaces:groups.map(function(group){ return group.label; })
  };
}

function h38PortalStartupBootstrapLite_(){
  var access=h38PortalRequireUnifiedUser_();
  if(!access.ownerMode){
    var unified=h38PortalUnifiedBootstrap();
    return {
      release:(typeof H38_BO!=='undefined'?H38_BO.VERSION:'Unified')+' · Role workspace',
      installed:{installed:true,reason:'Business Office role access is active.'},catalog:{status:'Role controlled'},
      modules:unified.groups.reduce(function(list,group){return list.concat(group.items.map(function(item){return item.module;}));},[]),
      fieldRole:typeof h38FieldRoleKnown_==='function'&&h38FieldRoleKnown_(access.role)?h38FieldRoleProfile_(access.role):null,
      safety:{ownerOnly:false,roleAware:true,selectedRecordOnly:true,bulkExecution:false,automaticRetry:false,liveExternalActions:false,triggers:false},user:unified.user,dashboard:{deferred:true}
    };
  }
  var installed=h38PortalInstalledStatus_();
  var catalog=installed.installed?(typeof h38PortalNavigationCached_==='function'?h38PortalNavigationCached_('startup:catalog',90,function(){return h38PortalCatalogStatus_();},false):h38PortalCatalogStatus_()):{status:'HOLD'};
  var integrations=typeof h38PortalNavigationCached_==='function'?h38PortalNavigationCached_('startup:integrations',90,function(){return h38PortalIntegrationStatus_();},false):h38PortalIntegrationStatus_();
  return {
    appName:H38_PORTAL_NEXT.APP_NAME,release:H38_PORTAL_NEXT.RELEASE,timezone:H38_PORTAL_NEXT.TIMEZONE,access:access,installed:installed,catalog:catalog,
    modules:H38_PORTAL_NEXT.MODULES,statuses:H38_PORTAL_STATUS,expenseCategories:H38_PORTAL_EXPENSE_CATEGORIES,approvalMatrix:H38_PORTAL_APPROVAL_MATRIX,
    integrations:integrations,dashboard:{deferred:true},
    safety:{testMode:H38_PORTAL_NEXT.TEST_MODE,liveExternalActions:H38_PORTAL_NEXT.LIVE_EXTERNAL_ACTIONS_ENABLED,selectedRecordOnly:true,bulkExecution:false,triggers:false},timestamp:h38PortalNow_()
  };
}

function h38PortalStartupPhase_(phases,name,callback){
  var started=Date.now();
  var value=callback();
  phases[name]=Date.now()-started;
  return value;
}

/** One browser round trip for the complete shell startup payload. */
function h38PortalStartupBundle(){
  var started=Date.now();
  var phases={};
  var payload={
    status:'PASS',
    bootstrap:h38PortalStartupPhase_(phases,'bootstrap',function(){return h38PortalStartupBootstrapLite_();}),
    schema:h38PortalStartupPhase_(phases,'schema',function(){return h38PortalClientSchema();}),
    experience:h38PortalStartupPhase_(phases,'experience',function(){return h38PortalUxControlCenter();}),
    savedViews:h38PortalStartupPhase_(phases,'savedViews',function(){return h38PortalSavedViews();}),
    unified:h38PortalStartupPhase_(phases,'unified',function(){return h38PortalUnifiedBootstrap();}),
    performance:{rpcCount:1,serverElapsedMs:0,phaseMs:phases,payloadCharacters:0,secondaryModulesDeferred:true,schemaChecksDeferred:true,requestScopedReadCache:true,persistentNavigationCache:true,calendarDeferred:true,growthDeferred:true}
  };
  payload.performance.serverElapsedMs=Date.now()-started;
  payload.performance.payloadCharacters=JSON.stringify(payload).length;
  return payload;
}
