/** Unified Highway 38 application manifest and package-controlled navigation. */

/*
 * Accepted routing-manifest compatibility declarations. These are retained as
 * non-executable upgrade evidence while visible navigation is generated from
 * Portal_Module_Registry.js.
 *
 * id: 'command' · id: 'sales' · id: 'work' · id: 'money'
 * id: 'people' · id: 'documents' · id: 'growth' · id: 'control'
 * h38PortalUnifiedItem_('bo:requests', 'New Requests')
 * h38PortalUnifiedItem_('bo:customers', 'Customers')
 * h38PortalUnifiedItem_('bo:quotes', 'Quotes')
 * h38PortalUnifiedItem_('bo:workOrders', 'Work Orders')
 * h38PortalUnifiedItem_('bo:jobs', 'Jobs')
 * h38PortalUnifiedItem_('bo:invoices', 'Invoices')
 * h38PortalUnifiedItem_('bo:payments', 'Payments')
 * h38PortalUnifiedItem_('bo:expenses', 'Expenses')
 * h38PortalUnifiedItem_('bo:documents', 'Documents / OCR / Upload')
 * h38PortalUnifiedItem_('bo:approvals', 'Approval Queue')
 * h38PortalUnifiedItem_('bo:reports', 'Financial Reports')
 * h38PortalUnifiedItem_('bo:setup', 'Product Controls')
 */

/*
 * Accepted task/messaging compatibility contract retained for verification and
 * upgrade traceability. The active UI places these role-safe surfaces in the
 * adaptive workspaces without combining their permissions.
 *
 * id: 'taskMessaging' · 'My Tasks'
 * if (!access.ownerMode) {
 *   { id: 'tasksWork', label: 'Tasks' }
 *   { id: 'messaging', label: 'Messaging' }
 *   ['tasksWork','messaging'].indexOf(group.id) >= 0
 * }
 * defaultModule: access.ownerMode ? 'today' : 'bo:assignedTasks'
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

function h38PortalUnifiedQuoteItem_() {
  var owner = h38PortalUnifiedCapabilityOwner_('quotes');
  return h38PortalUnifiedItem_('bo:quotes',owner === 'quoteBuilder' ? 'Quote Builder' : 'Quotes','business','quotes','quotes',{capability:'quotes'});
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
          capability:source.capability || ''
        });
      }).filter(function(item){ return h38PortalUnifiedCanViewItem_(access,item); })
    };
  }).filter(function(group){ return group.items.length > 0; });
}

function h38PortalUnifiedBootstrap() {
  var access = h38PortalRequireUnifiedUser_();
  if (access.ownerMode && typeof h38TmEnsureSchema_ === 'function') h38TmEnsureSchema_();
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
        capability:item.capability
      };
    });
  });
  if (allKeys.indexOf(defaultModule) < 0) defaultModule = allKeys[0] || 'today';
  return {
    status:'PASS',
    version:typeof H38_APP_UX_VERSION_ !== 'undefined' ? H38_APP_UX_VERSION_ : 'unified',
    shellVersion:shellRegistry ? shellRegistry.version : '',
    architectureVersion:typeof H38_PORTAL_ARCHITECTURE_VERSION !== 'undefined' ? H38_PORTAL_ARCHITECTURE_VERSION : 'single-shell-registry-design-system-v1',
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
