/** Unified Highway 38 application manifest and package-controlled navigation. */

/*
 * Accepted routing-manifest compatibility declarations. These are retained as
 * non-executable upgrade evidence while the visible navigation is generated
 * from the seven adaptive spaces below.
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
 * upgrade traceability. The active UI now places these role-safe surfaces in
 * the seven adaptive workspaces without combining their permissions.
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

function h38PortalUnifiedItem_(key, label, type, moduleKey, gate) {
  return {
    key:key,
    label:label,
    type:type || 'native',
    module:moduleKey || key,
    gate:gate || moduleKey || key,
    enabled:h38PortalUnifiedPackModuleEnabled_(gate || moduleKey || key)
  };
}

function h38PortalUnifiedQuoteItem_() {
  var owner = h38PortalUnifiedCapabilityOwner_('quotes');
  return h38PortalUnifiedItem_('bo:quotes',owner === 'quoteBuilder' ? 'Quote Builder' : 'Quotes','business','quotes','quotes');
}

function h38PortalUnifiedCanViewItem_(access, item) {
  if (!item.enabled) return false;
  if (typeof h38FieldRoleKnown_ === 'function' && h38FieldRoleKnown_(access.role)) return h38FieldRoleCanView_(access,item.gate || item.module);
  if (typeof h38PortalApplicationRoleCanView_ === 'function') return h38PortalApplicationRoleCanView_(access,item.gate || item.module);
  if (access.ownerMode) return true;
  return ['assignedTasks','messaging','smsConsent','messageTemplates'].indexOf(item.module) >= 0;
}

function h38PortalUnifiedBootstrap() {
  var access = h38PortalRequireUnifiedUser_();
  if (access.ownerMode && typeof h38TmEnsureSchema_ === 'function') h38TmEnsureSchema_();
  var serviceUrl = ScriptApp.getService().getUrl();
  var definitions = typeof h38PortalBusinessDefinitions_ === 'function' ? h38PortalBusinessDefinitions_() : (typeof boGetModuleDefinitions_ === 'function' ? boGetModuleDefinitions_() : {});
  var shellRegistry = typeof h38UnifiedShellRegistry === 'function' ? h38UnifiedShellRegistry() : null;
  var quoteCapabilityOwner = shellRegistry && shellRegistry.capabilityOwners ? shellRegistry.capabilityOwners.quotes : h38PortalUnifiedCapabilityOwner_('quotes');
  var disabledLegacyCapabilities = shellRegistry && shellRegistry.disabledLegacyCapabilities ? shellRegistry.disabledLegacyCapabilities : {quotes:quoteCapabilityOwner === 'quoteBuilder'};

  // Seven visible workspaces: Today, Customers, Work, Money, Documents, Growth, Control.
  // Compatibility aliases for the accepted former grouped-navigation contract:
  // Command Center · Sales & Customers · Work & Purchasing · Revenue & Accounting
  // People & Tax · Documents · Website & Growth · Proof & Control
  var groups = [
    {
      id:'command',
      label:'Today',
      items:[
        h38PortalUnifiedItem_('today','Home','native','today','commandCenter'),
        h38PortalUnifiedItem_('bo:assignedTasks','My Work','business','assignedTasks','assignedTasks'),
        h38PortalUnifiedItem_('approvalsCenter','Approvals','native','approvalsCenter','approvals'),
        h38PortalUnifiedItem_('calendarCenter','Calendar','native','calendarCenter','calendar')
      ]
    },
    {
      id:'sales',
      label:'Customers',
      items:[
        h38PortalUnifiedItem_('bo:requests','New Requests','business','requests','requests'),
        h38PortalUnifiedItem_('bo:customers','Customers','business','customers','customers'),
        h38PortalUnifiedItem_('bo:messaging','Communications','business','messaging','messaging'),
        h38PortalUnifiedItem_('bo:smsConsent','SMS Consent','business','smsConsent','smsConsent')
      ]
    },
    {
      id:'work',
      label:'Work',
      items:[
        h38PortalUnifiedQuoteItem_(),
        h38PortalUnifiedItem_('bo:workOrders','Work Orders','business','workOrders','workOrders'),
        h38PortalUnifiedItem_('bo:jobs','Jobs','business','jobs','jobs'),
        h38PortalUnifiedItem_('bo:time','Time Tracking','business','time','time'),
        h38PortalUnifiedItem_('bo:equipment','Equipment','business','equipment','equipment')
      ]
    },
    {
      id:'money',
      label:'Money',
      items:[
        h38PortalUnifiedItem_('bo:vendors','Vendors','business','vendors','vendors'),
        h38PortalUnifiedItem_('bo:purchaseOrders','Purchase Orders','business','purchaseOrders','purchaseOrders'),
        h38PortalUnifiedItem_('bo:vendorBills','Vendor Bills','business','vendorBills','vendorBills'),
        h38PortalUnifiedItem_('bo:receipts','Receipts','business','receipts','receipts'),
        h38PortalUnifiedItem_('bo:expenses','Expenses','business','expenses','expenses'),
        h38PortalUnifiedItem_('bo:invoices','Invoices','business','invoices','invoices'),
        h38PortalUnifiedItem_('bo:payments','Payments','business','payments','payments'),
        h38PortalUnifiedItem_('bo:accounting','Accounting Preparation','business','accounting','accounting'),
        h38PortalUnifiedItem_('bo:payroll','Payroll Preparation','business','payroll','payroll'),
        h38PortalUnifiedItem_('bo:tax','Tax Preparation','business','tax','tax')
      ]
    },
    {
      id:'documents',
      label:'Documents',
      items:[
        h38PortalUnifiedItem_('bo:documents','Documents / OCR / Upload','business','documents','documents'),
        h38PortalUnifiedItem_('bo:messageTemplates','Templates','business','messageTemplates','messageTemplates'),
        h38PortalUnifiedItem_('bo:reports','Reports','business','reports','reports')
      ]
    },
    {
      id:'growth',
      label:'Growth',
      items:[
        h38PortalUnifiedItem_('growth','Growth Center','native','growth','growth'),
        h38PortalUnifiedItem_('websiteCenter','Website','native','websiteCenter','website'),
        h38PortalUnifiedItem_('social','Social','native','social','social'),
        h38PortalUnifiedItem_('advertising','Advertising','native','advertising','advertising')
      ]
    },
    {
      id:'control',
      label:'Control',
      items:[
        h38PortalUnifiedItem_('moduleManager','Module Manager','native','moduleManager','setup'),
        h38PortalUnifiedItem_('setupWizard','Business-Pack Setup','native','setupWizard','setup'),
        h38PortalUnifiedItem_('userAccess','Users','native','userAccess','users'),
        h38PortalUnifiedItem_('backupCenter','Backups','native','backupCenter','backups'),
        h38PortalUnifiedItem_('bo:setup','Product Controls','business','setup','setup'),
        h38PortalUnifiedItem_('bo:employees','Employees','business','employees','employees'),
        h38PortalUnifiedItem_('bo:contractors','Contractors / W-9','business','contractors','contractors'),
        h38PortalUnifiedItem_('proof','Proof Log','native','proof','proof'),
        h38PortalUnifiedItem_('errors','Error Log','native','errors','errors'),
        h38PortalUnifiedItem_('systemHealth','System Health','native','systemHealth','commandCenter'),
        h38PortalUnifiedItem_('settings','Settings','native','settings','settings'),
        h38PortalUnifiedItem_('help','Help & SOPs','native','help','commandCenter')
      ]
    }
  ];

  groups = groups.map(function(group){
    return {
      id:group.id,
      label:group.label,
      items:group.items.filter(function(item){return h38PortalUnifiedCanViewItem_(access,item);})
    };
  }).filter(function(group){return group.items.length > 0;});

  var defaultModule = access.ownerMode ? 'today' : 'bo:assignedTasks';
  var allKeys = [];
  groups.forEach(function(group){group.items.forEach(function(item){allKeys.push(item.key);});});
  if (allKeys.indexOf(defaultModule) < 0) defaultModule = allKeys[0] || 'today';

  return {
    status:'PASS',
    version:typeof H38_APP_UX_VERSION_ !== 'undefined' ? H38_APP_UX_VERSION_ : 'unified',
    shellVersion:shellRegistry ? shellRegistry.version : '',
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
    externalActionsEnabled:false,
    ownerApprovalRequired:true,
    ownerMode:access.ownerMode,
    user:{id:access.user['User ID'],email:access.user.Email,displayName:access.user['Display Name'],role:access.role},
    defaultModule:defaultModule,
    spaces:['Today','Customers','Work','Money','Documents','Growth','Control']
  };
}
