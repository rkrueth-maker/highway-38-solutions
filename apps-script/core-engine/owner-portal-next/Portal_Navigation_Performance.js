/** Whole-navigation performance services. Every request remains permission checked and read only. */
var H38_PORTAL_NAVIGATION_REQUEST_CACHE_ = {};
var H38_PORTAL_NAVIGATION_CACHE_EPOCH_KEY_ = 'H38_NAVIGATION_CACHE_EPOCH_V3';

function h38PortalNavigationCacheStore_() {
  try { return CacheService.getUserCache(); } catch (error) { return null; }
}

function h38PortalNavigationCacheEpoch_() {
  try {
    return PropertiesService.getUserProperties().getProperty(H38_PORTAL_NAVIGATION_CACHE_EPOCH_KEY_) || '1';
  } catch (error) {
    return '1';
  }
}

function h38PortalNavigationBusinessKey_() {
  try { return typeof boGetBusinessId_ === 'function' ? boGetBusinessId_() : 'default'; }
  catch (error) { return 'default'; }
}

function h38PortalNavigationCacheKey_(scope) {
  var safeBusiness = String(h38PortalNavigationBusinessKey_() || 'default').replace(/[^A-Za-z0-9._-]/g,'_').slice(0,48);
  var safeScope = String(scope || 'surface').replace(/[^A-Za-z0-9:._|-]/g,'_').slice(0,150);
  return ['H38NAV3',safeBusiness,h38PortalNavigationCacheEpoch_(),safeScope].join(':');
}

function h38PortalNavigationCacheGet_(scope) {
  var key = h38PortalNavigationCacheKey_(scope);
  if (Object.prototype.hasOwnProperty.call(H38_PORTAL_NAVIGATION_REQUEST_CACHE_,key)) return H38_PORTAL_NAVIGATION_REQUEST_CACHE_[key];
  var store = h38PortalNavigationCacheStore_();
  if (!store) return null;
  try {
    var raw = store.get(key);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    H38_PORTAL_NAVIGATION_REQUEST_CACHE_[key] = parsed;
    return parsed;
  } catch (error) {
    return null;
  }
}

function h38PortalNavigationCachePut_(scope,value,ttlSeconds) {
  var key = h38PortalNavigationCacheKey_(scope);
  H38_PORTAL_NAVIGATION_REQUEST_CACHE_[key] = value;
  var store = h38PortalNavigationCacheStore_();
  if (!store) return value;
  try {
    var raw = JSON.stringify(value);
    if (raw.length < 90000) store.put(key,raw,Math.max(5,Math.min(Number(ttlSeconds || 30),600)));
  } catch (error) {}
  return value;
}

function h38PortalNavigationCached_(scope,ttlSeconds,loader,force) {
  if (!force) {
    var cached = h38PortalNavigationCacheGet_(scope);
    if (cached != null) return cached;
  }
  return h38PortalNavigationCachePut_(scope,loader(),ttlSeconds);
}

function h38PortalNavigationInvalidate() {
  h38PortalRequireUnifiedUser_();
  try {
    PropertiesService.getUserProperties().setProperty(H38_PORTAL_NAVIGATION_CACHE_EPOCH_KEY_,String(Date.now()) + '-' + Utilities.getUuid());
  } catch (error) {}
  H38_PORTAL_NAVIGATION_REQUEST_CACHE_ = {};
  return {status:'PASS',externalActionsOccurred:false};
}

function h38PortalNavigationSurfaceBatch(requests) {
  h38PortalRequireUnifiedUser_();
  var list = Array.isArray(requests) ? requests.slice(0, 8) : [];
  return {
    status: 'PASS',
    items: list.map(function(request) {
      var route = String(request && request.route || '').trim();
      try {
        return {route: route, status: 'PASS', data: h38PortalNavigationSurfaceData_(route, request && request.options || {})};
      } catch (error) {
        return {route: route, status: 'HOLD', message: String(error && error.message || error)};
      }
    }),
    externalActionsOccurred: false
  };
}

function h38PortalNavigationBusinessModule_(route,options) {
  var module = route.slice(3);
  var query = String(options.query || '');
  var filters = options.filters || {};
  var limit = Math.min(Math.max(Number(options.limit || 50),1),100);
  var hasFilters = Object.keys(filters).length > 0;
  var loader = function(){ return h38PortalBusinessModule(module,{query:query,filters:filters,limit:limit}); };
  if (query || hasFilters) return loader();
  return h38PortalNavigationCached_('bo:' + module + ':' + limit,15,loader,false);
}

function h38PortalNavigationGrowthData_() {
  return h38PortalNavigationCached_('native:growth',45,function(){
    var leads = h38PortalList('leads',{}) || [];
    var social = h38PortalList('social',{}) || [];
    var advertising = h38PortalList('advertising',{}) || [];
    return {
      summary:{
        leads:leads.length,
        socialDrafts:social.filter(function(row){return !/Published|Archived|Cancelled/i.test(String(row.Status || ''));}).length,
        advertisingPlans:advertising.filter(function(row){return !/Complete|Rejected|Archived/i.test(String(row.Status || ''));}).length
      },
      leads:leads.slice(0,50),social:social.slice(0,30),advertising:advertising.slice(0,30),externalActionsOccurred:false
    };
  },false);
}

function h38PortalNavigationWebsiteData_() {
  return h38PortalNavigationCached_('native:website',60,function(){
    var rows = h38PortalList('website',{}) || [];
    return {records:rows.filter(function(row){return !/Complete|Rejected|Rolled back/i.test(String(row.Status || ''));}).slice(0,75),externalActionsOccurred:false};
  },false);
}

function h38PortalNavigationSystemHealthData_() {
  return h38PortalNavigationCached_('native:system-health',90,function(){
    var installed = h38PortalInstalledStatus_();
    var integrations = h38PortalIntegrationStatus_();
    return {
      installed:installed,
      catalog:installed.installed ? h38PortalCatalogStatus_() : {status:'HOLD'},
      integrations:integrations,
      blockers:integrations.filter(function(item){return !/AVAILABLE|READY/i.test(String(item.status || ''));}),
      safety:{ownerOnly:true,selectedRecordOnly:true,bulkExecution:false,automaticRetry:false,liveExternalActions:false,triggers:false},
      externalActionsOccurred:false
    };
  },false);
}

function h38PortalNavigationSurfaceData_(route, options) {
  options = options || {};
  if (route.indexOf('bo:') === 0) return h38PortalNavigationBusinessModule_(route,options);
  if (route === 'approvalsCenter') return h38PortalApplicationApprovalCenter();
  if (route === 'calendarCenter') return h38PortalApplicationCalendar();
  if (route === 'moduleManager') return h38PortalNavigationCached_('native:module-manager',30,function(){return h38PortalModuleManager();},false);
  if (route === 'setupWizard') return h38PortalNavigationCached_('native:setup-wizard',30,function(){return h38PortalSetupWizardState();},false);
  if (route === 'userAccess') return h38PortalNavigationCached_('native:user-access',30,function(){return h38PortalUserAccessSnapshot();},false);
  if (route === 'backupCenter') return h38PortalNavigationCached_('native:backups',15,function(){return h38PortalBackupCenter();},false);
  if (route === 'help') return h38PortalNavigationCached_('native:help',300,function(){return h38PortalHelpCenter();},false);
  if (route === 'tasks') return h38PortalNavigationCached_('native:tasks',15,function(){return h38PortalTasks({});},false);
  if (route === 'proof') return h38PortalNavigationCached_('native:proof',15,function(){return h38PortalProofLog('');},false);
  if (route === 'errors') return h38PortalNavigationCached_('native:errors',15,function(){return h38PortalErrorLog('');},false);
  if (route === 'growth') return h38PortalNavigationGrowthData_();
  if (route === 'websiteCenter') return h38PortalNavigationWebsiteData_();
  if (route === 'systemHealth') return h38PortalNavigationSystemHealthData_();
  if (route === 'social' || route === 'advertising') return h38PortalNavigationCached_('native:' + route,30,function(){return h38PortalList(route,{});},false);
  throw new Error('Route does not require server prefetch: ' + route);
}
