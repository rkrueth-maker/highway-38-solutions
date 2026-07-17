/**
 * Highway 38 unified-application UX services.
 *
 * Adds persistent module controls, setup-wizard state, role-aware navigation,
 * command-launcher metadata, module usage, system status, user access summaries,
 * and backup-center summaries. Disabling a module hides its UI, stops new work,
 * and preserves all existing records, audit history, proof, and errors.
 */
var H38_APP_UX_VERSION_ = '2026.07.16-complete';
var H38_APP_MODULE_OVERRIDES_KEY_ = 'H38_UNIFIED_MODULE_OVERRIDES_JSON';
var H38_APP_SETUP_KEY_ = 'H38_UNIFIED_SETUP_WIZARD_JSON';
var H38_APP_USAGE_KEY_ = 'H38_UNIFIED_MODULE_USAGE_JSON';
var H38_APP_DRAFT_STATUS_KEY_ = 'H38_UNIFIED_DRAFT_STATUS_JSON';

function h38PortalApplicationReadJson_(key, fallback) {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function h38PortalApplicationWriteJson_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(value || {}));
  return value;
}

function h38PortalModuleOverrideEnabled_(moduleKey, fallback) {
  var overrides = h38PortalApplicationReadJson_(H38_APP_MODULE_OVERRIDES_KEY_, {});
  if (Object.prototype.hasOwnProperty.call(overrides, moduleKey)) return overrides[moduleKey].enabled !== false;
  return fallback !== false;
}

function h38PortalApplicationModuleMeta_() {
  return {
    commandCenter:{label:'Today',purpose:'Daily decisions, deadlines, workload, business health, and exceptions.',group:'today',dependencies:[],essential:true},
    assignedTasks:{label:'My Work',purpose:'Assigned tasks and current work for the signed-in user.',group:'today',dependencies:[],essential:true},
    approvals:{label:'Approvals',purpose:'Selected-record approval, revision, hold, and rejection decisions.',group:'today',dependencies:[],essential:true},
    calendar:{label:'Calendar',purpose:'Appointments, due dates, follow-ups, and operating deadlines.',group:'today',dependencies:['jobs']},
    requests:{label:'Requests',purpose:'New customer requests and intake review.',group:'customers',dependencies:[]},
    customers:{label:'Customers',purpose:'Unified customer records, balances, work, communications, and files.',group:'customers',dependencies:[],essential:true},
    messaging:{label:'Communications',purpose:'Customer and team messages with consent and approval controls.',group:'customers',dependencies:['customers']},
    smsConsent:{label:'SMS Consent',purpose:'Customer text-message consent evidence and status.',group:'customers',dependencies:['customers','messaging']},
    messageTemplates:{label:'Message Templates',purpose:'Controlled reusable communication templates.',group:'customers',dependencies:['messaging']},
    quotes:{label:'Quotes',purpose:'Scope, price, terms, revisions, and approvals.',group:'work',dependencies:['customers']},
    workOrders:{label:'Work Orders',purpose:'Approved scope translated into exact work.',group:'work',dependencies:['quotes','customers']},
    jobs:{label:'Jobs',purpose:'Operational stage, assignments, due dates, next actions, and profitability.',group:'work',dependencies:['customers']},
    time:{label:'Time Tracking',purpose:'Labor by employee, job, work order, and date.',group:'work',dependencies:['jobs','employees']},
    purchaseOrders:{label:'Purchase Orders',purpose:'Controlled purchasing connected to vendors and jobs.',group:'money',dependencies:['vendors','jobs']},
    vendors:{label:'Vendors',purpose:'Vendor, contractor, payment-term, and tax-document records.',group:'money',dependencies:[]},
    vendorBills:{label:'Vendor Bills',purpose:'Bills, PO matching, balances, and payment preparation.',group:'money',dependencies:['vendors']},
    receipts:{label:'Receipts',purpose:'Receipt evidence, OCR, categorization, and job links.',group:'money',dependencies:['documents']},
    expenses:{label:'Expenses',purpose:'Expense evidence, categories, approvals, and posting state.',group:'money',dependencies:[]},
    invoices:{label:'Invoices',purpose:'Invoice aging, delivery state, balances, and approval controls.',group:'money',dependencies:['customers']},
    payments:{label:'Payments',purpose:'Received-payment records and reconciliation status.',group:'money',dependencies:['invoices']},
    accounting:{label:'Accounting',purpose:'Balanced accounting-preparation entries and reports.',group:'money',dependencies:['expenses','invoices','payments']},
    payroll:{label:'Payroll Preparation',purpose:'Payroll periods, approvals, and controlled exports.',group:'money',dependencies:['employees','time']},
    tax:{label:'Tax Preparation',purpose:'Tax-document and report preparation without direct filing.',group:'money',dependencies:['accounting','documents']},
    documents:{label:'Files',purpose:'Files, photographs, OCR review, templates, and generated documents.',group:'documents',dependencies:[],essential:true},
    reports:{label:'Reports',purpose:'Financial, workload, exception, and business-health views.',group:'documents',dependencies:[]},
    growth:{label:'Growth Center',purpose:'Lead, website, social, advertising, and conversion visibility.',group:'growth',dependencies:[]},
    website:{label:'Website',purpose:'Controlled website changes, evidence, tests, commits, and deployment approvals.',group:'growth',dependencies:[]},
    social:{label:'Social',purpose:'Draft, schedule, approval, and publishing preparation.',group:'growth',dependencies:[]},
    advertising:{label:'Advertising',purpose:'Campaign planning, budgets, approvals, and results.',group:'growth',dependencies:[]},
    employees:{label:'Employees',purpose:'Employee records, access, payroll configuration, and status.',group:'control',dependencies:[]},
    contractors:{label:'Contractors',purpose:'Contractor and W-9 preparation records.',group:'control',dependencies:['vendors']},
    setup:{label:'Products & Setup',purpose:'Products, bundles, installation, and operating configuration.',group:'control',dependencies:[],essential:true},
    backups:{label:'Backups',purpose:'Backup history and controlled restore preparation.',group:'control',dependencies:[],essential:true},
    users:{label:'Users',purpose:'Role, permission, and access-administration visibility.',group:'control',dependencies:[],essential:true},
    proof:{label:'Proof Log',purpose:'Evidence of controlled actions and verification results.',group:'control',dependencies:[],essential:true},
    errors:{label:'Error Log',purpose:'Incidents, recovery state, and corrective actions.',group:'control',dependencies:[],essential:true},
    settings:{label:'Settings',purpose:'Business, safety, integration, and application settings.',group:'control',dependencies:[],essential:true}
  };
}

function h38PortalApplicationBusinessModule_(moduleKey) {
  return !!(typeof H38_BO_MODULES !== 'undefined' && H38_BO_MODULES[moduleKey]);
}

function h38PortalApplicationRecordCount_(moduleKey) {
  try {
    if (moduleKey === 'assignedTasks' && typeof h38PortalTaskProjection_ === 'function') return h38PortalTaskProjection_({}).length;
    if (moduleKey === 'proof' && typeof h38PortalProofLog === 'function') return (h38PortalProofLog('') || []).length;
    if (moduleKey === 'errors' && typeof h38PortalErrorLog === 'function') return (h38PortalErrorLog('') || []).length;
    if (moduleKey === 'users') return boReadTable_(H38_BO_SHEETS.USERS,{includeVoided:true}).length;
    if (moduleKey === 'backups') return boReadTable_(H38_BO_SHEETS.BACKUP_LOG,{includeVoided:true}).length;
    if (h38PortalApplicationBusinessModule_(moduleKey)) {
      var sheetName = H38_BO_MODULES[moduleKey];
      return boReadTable_(sheetName,{includeVoided:true}).length;
    }
    if (typeof h38PortalList === 'function') return (h38PortalList(moduleKey,{}) || []).length;
  } catch (error) {}
  return 0;
}

function h38PortalApplicationRoleCanView_(access, moduleKey) {
  if (!access || !access.user) return false;
  if (access.ownerMode) return true;
  var nativeByRole = {
    Administrator:['commandCenter','assignedTasks','approvals','calendar','requests','customers','messaging','smsConsent','messageTemplates','quotes','workOrders','jobs','time','vendors','purchaseOrders','vendorBills','receipts','expenses','invoices','payments','documents','reports','growth','website','social','advertising','proof','errors'],
    Staff:['commandCenter','assignedTasks','calendar','requests','customers','messaging','messageTemplates','quotes','workOrders','jobs','time','documents'],
    Bookkeeper:['commandCenter','assignedTasks','customers','vendors','purchaseOrders','vendorBills','receipts','expenses','invoices','payments','accounting','documents','reports'],
    Payroll:['commandCenter','assignedTasks','time','employees','payroll','documents','reports'],
    Viewer:['commandCenter','assignedTasks','customers','jobs','quotes','invoices','documents','reports']
  };
  if ((nativeByRole[access.role] || []).indexOf(moduleKey) < 0) return false;
  if (!h38PortalApplicationBusinessModule_(moduleKey)) return true;
  try {
    var definitions = h38PortalBusinessDefinitions_();
    var name = definitions[moduleKey] ? definitions[moduleKey].title : moduleKey;
    return boHasPermission_(access.user,name,'View') || boHasPermission_(access.user,moduleKey,'View');
  } catch (error) {
    return false;
  }
}

function h38PortalApplicationRolesForModule_(moduleKey) {
  var roles = [];
  try {
    var activeRoles = boReadTable_(H38_BO_SHEETS.ROLES,{includeVoided:true}).filter(function(row){return row.Active === 'Yes';});
    var permissions = boReadTable_(H38_BO_SHEETS.PERMISSIONS,{includeVoided:true});
    activeRoles.forEach(function(role){
      if (role['Role Name'] === 'Owner') { roles.push('Owner'); return; }
      var allowed = permissions.some(function(row){
        return row['Role ID'] === role['Role ID'] && row.View === 'Yes' && boModuleMatchesPermission_(row.Module,moduleKey);
      });
      if (allowed) roles.push(role['Role Name']);
    });
  } catch (error) {
    roles = ['Owner'];
  }
  return roles.filter(function(value,index,list){return list.indexOf(value) === index;});
}

function h38PortalModuleManager() {
  var access = h38PortalRequireUnifiedUser_();
  var meta = h38PortalApplicationModuleMeta_();
  var overrides = h38PortalApplicationReadJson_(H38_APP_MODULE_OVERRIDES_KEY_, {});
  var usage = h38PortalApplicationReadJson_(H38_APP_USAGE_KEY_, {});
  var pack = typeof boGetPackSnapshot_ === 'function' ? boGetPackSnapshot_() : {modules:{}};
  var modules = Object.keys(meta).map(function(moduleKey){
    var packEnabled = !Object.prototype.hasOwnProperty.call(pack.modules || {},moduleKey) || pack.modules[moduleKey] !== false;
    var enabled = h38PortalModuleOverrideEnabled_(moduleKey,packEnabled);
    var override = overrides[moduleKey] || {};
    return {
      key:moduleKey,
      label:meta[moduleKey].label,
      purpose:meta[moduleKey].purpose,
      group:meta[moduleKey].group,
      enabled:enabled,
      packEnabled:packEnabled,
      essential:meta[moduleKey].essential === true,
      dependencies:(meta[moduleKey].dependencies || []).slice(),
      roles:h38PortalApplicationRolesForModule_(moduleKey),
      canView:h38PortalApplicationRoleCanView_(access,moduleKey),
      recordCount:Object.prototype.hasOwnProperty.call(override,'preservedRecordCount') && !enabled ? override.preservedRecordCount : h38PortalApplicationRecordCount_(moduleKey),
      recordsPreserved:true,
      lastUsed:usage[moduleKey] && usage[moduleKey].lastUsed || '',
      lastUsedBy:usage[moduleKey] && usage[moduleKey].lastUsedBy || '',
      integrationStatus:'Ready',
      disabledAt:override.disabledAt || '',
      disabledBy:override.disabledBy || ''
    };
  });
  return {
    status:'PASS',
    version:H38_APP_UX_VERSION_,
    ownerMode:access.ownerMode,
    user:{id:access.user['User ID'],email:access.user.Email,displayName:access.user['Display Name'],role:access.role},
    groups:['today','customers','work','money','documents','growth','control'],
    modules:modules,
    externalActionsOccurred:false,
    recordsPreserved:true
  };
}

function h38PortalSetModuleOverride(moduleKey, enabled, cascade) {
  var access = h38PortalRequireUnifiedUser_();
  boAssert_(access.ownerMode,'Owner approval is required to change installed modules.');
  moduleKey = boNormalizeText_(moduleKey);
  enabled = enabled !== false;
  var meta = h38PortalApplicationModuleMeta_();
  boAssert_(meta[moduleKey],'Unknown module: ' + moduleKey);
  boAssert_(!(meta[moduleKey].essential && !enabled),'Essential safety and operating modules cannot be disabled.');
  var overrides = h38PortalApplicationReadJson_(H38_APP_MODULE_OVERRIDES_KEY_, {});
  var manager = h38PortalModuleManager();
  var enabledKeys = manager.modules.filter(function(item){return item.enabled;}).map(function(item){return item.key;});
  var dependents = Object.keys(meta).filter(function(key){return (meta[key].dependencies || []).indexOf(moduleKey) >= 0 && enabledKeys.indexOf(key) >= 0;});
  if (!enabled && dependents.length && cascade !== true) {
    return {status:'HOLD',module:moduleKey,dependents:dependents,message:'Disable dependent modules first or confirm a cascade. No module was changed.',externalActionsOccurred:false};
  }
  var targets = [moduleKey].concat(!enabled && cascade === true ? dependents : []);
  targets.forEach(function(key){
    var prior = overrides[key] || {};
    overrides[key] = {
      enabled:enabled,
      preservedRecordCount:enabled ? prior.preservedRecordCount || h38PortalApplicationRecordCount_(key) : h38PortalApplicationRecordCount_(key),
      disabledAt:enabled ? '' : boNow_(),
      disabledBy:enabled ? '' : access.user.Email,
      updatedAt:boNow_(),
      updatedBy:access.user.Email
    };
  });
  h38PortalApplicationWriteJson_(H38_APP_MODULE_OVERRIDES_KEY_,overrides);
  if (typeof BO_PACK_CACHE_ !== 'undefined') BO_PACK_CACHE_ = null;
  if (typeof boProof_ === 'function') boProof_(enabled ? 'MODULE_ENABLED' : 'MODULE_DISABLED','Module',moduleKey,'PASS','Module navigation and new record creation changed. Existing records and audit history were preserved.',access.user.Email);
  return h38PortalModuleManager();
}

function h38PortalTouchModule(moduleKey) {
  var access = h38PortalRequireUnifiedUser_();
  moduleKey = boNormalizeText_(moduleKey);
  var usage = h38PortalApplicationReadJson_(H38_APP_USAGE_KEY_, {});
  usage[moduleKey] = {lastUsed:boNow_(),lastUsedBy:access.user.Email};
  h38PortalApplicationWriteJson_(H38_APP_USAGE_KEY_,usage);
  return {status:'PASS',module:moduleKey,lastUsed:usage[moduleKey].lastUsed,externalActionsOccurred:false};
}

function h38PortalApplicationRecommendedModules_(businessType, goals) {
  var selected = ['commandCenter','assignedTasks','approvals','customers','jobs','documents','proof','errors','settings','setup','backups','users'];
  var goalMap = {
    leads:['requests','growth'],quotes:['requests','quotes'],schedule:['workOrders','jobs','calendar','time'],purchasing:['vendors','purchaseOrders','vendorBills','receipts','expenses'],
    invoicing:['quotes','jobs','invoices','payments'],accounting:['expenses','invoices','payments','accounting','reports','documents'],payroll:['employees','time','payroll','documents'],
    tax:['accounting','tax','documents','reports'],social:['growth','social'],website:['growth','website'],advertising:['growth','advertising'],messaging:['messaging','smsConsent','messageTemplates']
  };
  (goals || []).forEach(function(goal){selected = selected.concat(goalMap[goal] || []);});
  if (/service|repair|consult/i.test(String(businessType || ''))) selected = selected.concat(['requests','quotes','workOrders','jobs','invoices','payments']);
  if (/manufactur/i.test(String(businessType || ''))) selected = selected.concat(['vendors','purchaseOrders','workOrders','jobs','time','expenses']);
  if (/retail/i.test(String(businessType || ''))) selected = selected.concat(['customers','vendors','receipts','expenses','invoices','payments']);
  return selected.filter(function(value,index,list){return list.indexOf(value) === index;});
}

function h38PortalSetupWizardState() {
  var access = h38PortalRequireUnifiedUser_();
  var saved = h38PortalApplicationReadJson_(H38_APP_SETUP_KEY_, {});
  var goals = saved.goals || [];
  return {
    status:'PASS',
    ownerMode:access.ownerMode,
    businessTypes:['Service business','Consulting','Manufacturing support','Repair','Retail','Custom configuration'],
    goalOptions:[
      {id:'leads',label:'Manage leads'},{id:'quotes',label:'Quote work'},{id:'schedule',label:'Schedule jobs'},{id:'purchasing',label:'Track purchases'},
      {id:'invoicing',label:'Invoice customers'},{id:'accounting',label:'Prepare accounting'},{id:'payroll',label:'Prepare payroll'},
      {id:'tax',label:'Prepare tax records'},{id:'messaging',label:'Track customer messages'},{id:'social',label:'Manage social'},
      {id:'website',label:'Manage website'},{id:'advertising',label:'Manage advertising'}
    ],
    roleOptions:['Owner','Administrator','Staff','Viewer','Bookkeeper','Payroll','Customer'],
    saved:saved,
    recommendedModules:h38PortalApplicationRecommendedModules_(saved.businessType || '',goals),
    readiness:[
      {id:'permissions',label:'Permissions tested',complete:saved.readiness && saved.readiness.permissions === true},
      {id:'email',label:'Email destination verified',complete:saved.readiness && saved.readiness.email === true},
      {id:'payments',label:'Payment integration status reviewed',complete:saved.readiness && saved.readiness.payments === true},
      {id:'backups',label:'Backups enabled',complete:saved.readiness && saved.readiness.backups === true},
      {id:'testTransaction',label:'Test transaction completed',complete:saved.readiness && saved.readiness.testTransaction === true}
    ],
    externalActionsOccurred:false
  };
}

function h38PortalSaveSetupWizard(payload) {
  var access = h38PortalRequireUnifiedUser_();
  boAssert_(access.ownerMode,'Owner approval is required to save production setup choices.');
  payload = payload || {};
  var saved = {
    businessType:boNormalizeText_(payload.businessType),
    goals:Array.isArray(payload.goals) ? payload.goals.map(boNormalizeText_).filter(Boolean) : [],
    roles:Array.isArray(payload.roles) ? payload.roles.map(boNormalizeText_).filter(Boolean) : [],
    readiness:payload.readiness || {},
    completed:payload.completed === true,
    updatedAt:boNow_(),
    updatedBy:access.user.Email
  };
  saved.recommendedModules = h38PortalApplicationRecommendedModules_(saved.businessType,saved.goals);
  h38PortalApplicationWriteJson_(H38_APP_SETUP_KEY_,saved);
  if (typeof boProof_ === 'function') boProof_('SETUP_WIZARD_SAVED','Setup','Unified application','PASS','Business type, goals, roles, recommended modules, and production-readiness checks were saved without external action.',access.user.Email);
  return h38PortalSetupWizardState();
}

function h38PortalUserAccessSnapshot() {
  var access = h38PortalRequireUnifiedUser_();
  boAssert_(access.ownerMode || access.role === 'Administrator','User access administration is restricted.');
  var roles = boReadTable_(H38_BO_SHEETS.ROLES,{includeVoided:true});
  var permissions = boReadTable_(H38_BO_SHEETS.PERMISSIONS,{includeVoided:true});
  var users = boReadTable_(H38_BO_SHEETS.USERS,{includeVoided:true}).map(function(user){
    var role = roles.filter(function(item){return item['Role ID'] === user['Role ID'];})[0] || {};
    return {
      id:user['User ID'],displayName:user['Display Name'],email:user.Email,status:user.Status,role:role['Role Name'] || '',
      payrollAccess:user['Payroll Access'],taxAccess:user['Tax Access'],postingAccess:user['Posting Access'],customerSendAccess:user['Customer Send Access'],
      exportAccess:user['Export Access'],userAdminAccess:user['User Access Admin']
    };
  });
  return {status:'PASS',users:users,roles:roles,permissions:permissions,externalActionsOccurred:false};
}

function h38PortalBackupCenter() {
  var access = h38PortalRequireUnifiedUser_();
  boAssert_(access.ownerMode || access.role === 'Administrator','Backup visibility is restricted.');
  var rows = boReadTable_(H38_BO_SHEETS.BACKUP_LOG,{includeVoided:true});
  rows.sort(function(a,b){return String(b['Created Time'] || b.Timestamp || '').localeCompare(String(a['Created Time'] || a.Timestamp || ''));});
  return {
    status:'PASS',
    backups:rows.slice(0,100),
    lastBackup:rows[0] || null,
    restoreBoundary:'Restore preparation requires owner review and never overwrites production automatically.',
    externalActionsOccurred:false
  };
}

function h38PortalCreateManualBackup(label) {
  var access = h38PortalRequireUnifiedUser_();
  boAssert_(access.ownerMode,'Owner approval is required to create a manual backup.');
  boAssertModuleEnabled_('backups');
  var result = boCreateBackup(boNormalizeText_(label) || 'Manual unified-app backup');
  return {status:'PASS',backup:result,externalActionsOccurred:false};
}

function h38PortalApplicationCommandCatalog() {
  var bootstrap = h38PortalUnifiedBootstrap();
  var commands = [];
  (bootstrap.groups || []).forEach(function(group){
    (group.items || []).forEach(function(item){commands.push({id:'go:'+item.key,label:'Go to ' + item.label,kind:'navigate',module:item.key,group:group.label});});
  });
  if (bootstrap.ownerMode) {
    [
      ['create:customer','Create customer','customers'],['create:task','Create task','assignedTasks'],['create:quote','Start quote','quotes'],
      ['create:expense','Record expense','expenses'],['create:invoice','Create invoice','invoices'],['open:approvals','Open approval center','approvals'],
      ['open:errors','Open error log','errors'],['open:module-manager','Open module manager','moduleManager']
    ].forEach(function(item){commands.push({id:item[0],label:item[1],kind:item[0].indexOf('create:') === 0 ? 'create' : 'navigate',module:item[2],group:'Actions'});});
  }
  return {status:'PASS',commands:commands,externalActionsOccurred:false};
}

function h38PortalApplicationSystemStatus() {
  var access = h38PortalRequireUnifiedUser_();
  var openErrors = 0;
  try { openErrors = (h38PortalErrorLog('') || []).filter(function(row){return !/resolved|closed/i.test(String(row['Resolution Status'] || row.Status || ''));}).length; } catch (error) {}
  return {
    status:openErrors ? 'ATTENTION' : 'NORMAL',
    label:openErrors ? 'Attention needed' : 'All systems normal',
    openErrors:openErrors,
    generatedAt:boNow_(),
    userRole:access.role,
    externalActionsEnabled:false,
    synchronization:'Current',
    externalActionsOccurred:false
  };
}
