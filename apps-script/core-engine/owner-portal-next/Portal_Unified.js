/** Unified Highway 38 application manifest and package-controlled navigation. */

function h38PortalUnifiedPackModuleEnabled_(moduleKey) {
  if (!moduleKey) return true;
  if (typeof boModuleEnabled_ === 'function') return boModuleEnabled_(moduleKey);
  return true;
}

function h38PortalUnifiedItem_(key, label, type, moduleKey, gate) {
  return {
    key: key,
    label: label,
    type: type || 'native',
    module: moduleKey || key,
    enabled: h38PortalUnifiedPackModuleEnabled_(gate || moduleKey || key)
  };
}

function h38PortalUnifiedBootstrap() {
  var access = h38PortalRequireUnifiedUser_();
  if (access.ownerMode && typeof h38TmEnsureSchema_ === 'function') h38TmEnsureSchema_();
  var serviceUrl = ScriptApp.getService().getUrl();
  var definitions = typeof h38PortalBusinessDefinitions_ === 'function' ? h38PortalBusinessDefinitions_() : (typeof boGetModuleDefinitions_ === 'function' ? boGetModuleDefinitions_() : {});
  var groups = [
    {
      id: 'command',
      label: 'Command Center',
      items: [
        h38PortalUnifiedItem_('today', 'Today', 'native', 'today', 'commandCenter'),
        h38PortalUnifiedItem_('decisions', 'Needs My Decision', 'native', 'decisions', 'commandCenter'),
        h38PortalUnifiedItem_('tasks', 'Tasks', 'native', 'tasks', 'commandCenter'),
        h38PortalUnifiedItem_('active', 'Active Work', 'native', 'active', 'commandCenter')
      ]
    },
    {
      id: 'taskMessaging',
      label: 'Tasks & Messaging',
      items: [
        h38PortalUnifiedItem_('bo:assignedTasks', 'My Tasks', 'business', 'assignedTasks', 'assignedTasks'),
        h38PortalUnifiedItem_('bo:messaging', 'Text Messaging', 'business', 'messaging', 'messaging'),
        h38PortalUnifiedItem_('bo:smsConsent', 'SMS Consent', 'business', 'smsConsent', 'smsConsent'),
        h38PortalUnifiedItem_('bo:messageTemplates', 'Message Templates', 'business', 'messageTemplates', 'messageTemplates')
      ]
    },
    {
      id: 'sales',
      label: 'Sales & Customers',
      items: [
        h38PortalUnifiedItem_('bo:requests', 'New Requests', 'business', 'requests', 'requests'),
        h38PortalUnifiedItem_('bo:customers', 'Customers', 'business', 'customers', 'customers'),
        h38PortalUnifiedItem_('bo:quotes', 'Quotes', 'business', 'quotes', 'quotes')
      ]
    },
    {
      id: 'work',
      label: 'Work & Purchasing',
      items: [
        h38PortalUnifiedItem_('bo:workOrders', 'Work Orders', 'business', 'workOrders', 'workOrders'),
        h38PortalUnifiedItem_('bo:jobs', 'Jobs', 'business', 'jobs', 'jobs'),
        h38PortalUnifiedItem_('bo:purchaseOrders', 'Purchase Orders', 'business', 'purchaseOrders', 'purchaseOrders'),
        h38PortalUnifiedItem_('bo:vendorBills', 'Vendor Bills', 'business', 'vendorBills', 'vendorBills'),
        h38PortalUnifiedItem_('bo:receipts', 'Receipts', 'business', 'receipts', 'receipts'),
        h38PortalUnifiedItem_('bo:expenses', 'Expenses', 'business', 'expenses', 'expenses')
      ]
    },
    {
      id: 'money',
      label: 'Revenue & Accounting',
      items: [
        h38PortalUnifiedItem_('bo:invoices', 'Invoices', 'business', 'invoices', 'invoices'),
        h38PortalUnifiedItem_('bo:payments', 'Payments', 'business', 'payments', 'payments'),
        h38PortalUnifiedItem_('bo:accounting', 'Accounting Preparation', 'business', 'accounting', 'accounting'),
        h38PortalUnifiedItem_('bo:reports', 'Financial Reports', 'business', 'reports', 'reports')
      ]
    },
    {
      id: 'people',
      label: 'People & Tax',
      items: [
        h38PortalUnifiedItem_('bo:time', 'Time Tracking', 'business', 'time', 'time'),
        h38PortalUnifiedItem_('bo:employees', 'Employees', 'business', 'employees', 'employees'),
        h38PortalUnifiedItem_('bo:payroll', 'Payroll Preparation', 'business', 'payroll', 'payroll'),
        h38PortalUnifiedItem_('bo:contractors', 'Contractors / W-9', 'business', 'contractors', 'contractors'),
        h38PortalUnifiedItem_('bo:tax', 'Tax Preparation', 'business', 'tax', 'tax')
      ]
    },
    {
      id: 'documents',
      label: 'Documents',
      items: [
        h38PortalUnifiedItem_('bo:documents', 'Documents / OCR / Upload', 'business', 'documents', 'documents')
      ]
    },
    {
      id: 'growth',
      label: 'Website & Growth',
      items: [
        h38PortalUnifiedItem_('growth', 'Growth Center', 'native', 'growth', 'growth'),
        h38PortalUnifiedItem_('websiteCenter', 'Website Center', 'native', 'websiteCenter', 'website'),
        h38PortalUnifiedItem_('social', 'Social', 'native', 'social', 'social'),
        h38PortalUnifiedItem_('advertising', 'Advertising', 'native', 'advertising', 'advertising')
      ]
    },
    {
      id: 'control',
      label: 'Proof & Control',
      items: [
        h38PortalUnifiedItem_('bo:approvals', 'Approval Queue', 'business', 'approvals', 'approvals'),
        h38PortalUnifiedItem_('proof', 'Proof Log', 'native', 'proof', 'commandCenter'),
        h38PortalUnifiedItem_('errors', 'Error Log', 'native', 'errors', 'commandCenter'),
        h38PortalUnifiedItem_('systemHealth', 'System Health', 'native', 'systemHealth', 'commandCenter'),
        h38PortalUnifiedItem_('settings', 'Settings', 'native', 'settings', 'commandCenter'),
        h38PortalUnifiedItem_('bo:setup', 'Product Controls', 'business', 'setup', 'setup'),
        h38PortalUnifiedItem_('help', 'Help & SOPs', 'native', 'help', 'commandCenter')
      ]
    }
  ];

  groups = groups.map(function (group) {
    return {
      id: group.id,
      label: group.label,
      items: group.items.filter(function (item) { return item.enabled; })
    };
  }).filter(function (group) { return group.items.length > 0; });

  if (!access.ownerMode) {
    var roleAllowed = ['assignedTasks','messageTemplates'];
    if (['Administrator','Staff'].indexOf(access.role) >= 0) roleAllowed = roleAllowed.concat(['messaging','smsConsent']);
    groups = groups.filter(function (group) { return group.id === 'taskMessaging'; }).map(function (group) {
      return {id:group.id,label:group.label,items:group.items.filter(function (item) { return roleAllowed.indexOf(item.module) >= 0; })};
    }).filter(function (group) { return group.items.length > 0; });
  }

  return {
    status: 'PASS',
    singleApp: true,
    nativeBusinessOffice: true,
    packageId: typeof boPackValue_ === 'function' ? boPackValue_('package.id', boPackValue_('packId', 'highway38')) : 'highway38',
    packageName: typeof boPackValue_ === 'function' ? boPackValue_('package.name', 'Complete Business System') : 'Complete Business System',
    serviceUrl: serviceUrl,
    compatibilityBusinessOfficeUrl: serviceUrl + (serviceUrl.indexOf('?') >= 0 ? '&' : '?') + 'app=business-office',
    businessDefinitions: definitions,
    groups: groups,
    externalActionsEnabled: false,
    ownerApprovalRequired: true,
    ownerMode: access.ownerMode,
    user: {id:access.user['User ID'],email:access.user.Email,displayName:access.user['Display Name'],role:access.role},
    defaultModule: access.ownerMode ? 'today' : 'bo:assignedTasks'
  };
}
