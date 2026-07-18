/** Quote Builder direct-mode server, compact data access, caching, and timing. */

function boIsQuoteBuilderRequest_(event) {
  return !!(event && event.parameter && String(event.parameter.quoteBuilder || '') === '1');
}

function boRenderQuoteBuilderApp_() {
  const started = Date.now();
  const context = boQuoteBuilderAccessContext_();
  const template = HtmlService.createTemplateFromFile('BusinessOffice_QuoteBuilder_Index');
  template.initialContext = JSON.stringify(context).replace(/</g, '\\u003c');
  template.directClient = boInclude_('BusinessOffice_QuoteBuilder_Direct_Client');
  const output = template.evaluate()
    .setTitle('Quote Builder | ' + (context.branding.businessName || 'Highway 38 Solutions'))
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  boQuoteBuilderTiming_('server_render', started, { mode: 'direct' });
  return output;
}

function boQuoteBuilderCacheKey_(name) {
  return ['H38QB', boGetBusinessId_(), name].join(':');
}

function boQuoteBuilderCacheGet_(name) {
  const raw = CacheService.getScriptCache().get(boQuoteBuilderCacheKey_(name));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (error) { return null; }
}

function boQuoteBuilderCachePut_(name, value, ttlSeconds) {
  const raw = JSON.stringify(value);
  if (raw.length < 95000) CacheService.getScriptCache().put(boQuoteBuilderCacheKey_(name), raw, ttlSeconds || 300);
  return value;
}

function boQuoteBuilderInvalidateCache_(scope) {
  const map = {
    all: ['dashboard','customers','priceBook','templates','documents'],
    quotes: ['dashboard'],
    customers: ['customers'],
    products: ['priceBook'],
    templates: ['templates'],
    documents: ['documents']
  };
  const names = map[scope] || map.all;
  CacheService.getScriptCache().removeAll(names.map(boQuoteBuilderCacheKey_));
  if (scope === 'all' || scope === 'access') {
    const email = boGetActiveEmail_();
    if (email) CacheService.getUserCache().remove('H38QB_ACCESS:' + email);
  }
}

function boQuoteBuilderTiming_(stage, started, meta) {
  const entry = {
    time: new Date().toISOString(),
    stage: stage,
    durationMs: Math.max(0, Date.now() - Number(started || Date.now())),
    meta: meta || {}
  };
  console.log('H38_QUOTE_BUILDER_TIMING ' + JSON.stringify(entry));
  try {
    const cache = CacheService.getUserCache();
    const key = 'H38QB_TIMINGS';
    const prior = JSON.parse(cache.get(key) || '[]');
    prior.push(entry);
    cache.put(key, JSON.stringify(prior.slice(-20)), 21600);
  } catch (error) { console.log('H38_QUOTE_BUILDER_TIMING_CACHE ' + error.message); }
  return entry;
}

function boQuoteBuilderPerformance_() {
  boQuoteBuilderRequireAction_('View');
  try { return JSON.parse(CacheService.getUserCache().get('H38QB_TIMINGS') || '[]'); }
  catch (error) { return []; }
}

function boQuoteBuilderAccessContext_() {
  const started = Date.now();
  const email = boGetActiveEmail_();
  boAssert_(email, 'A signed-in Google account is required.');
  const accessKey = 'H38QB_ACCESS:' + email;
  const accessCache = CacheService.getUserCache();
  const raw = accessCache.get(accessKey);
  if (raw) {
    try {
      const cached = JSON.parse(raw);
      boQuoteBuilderTiming_('auth_cache_hit', started, { email: email });
      return cached;
    } catch (error) { accessCache.remove(accessKey); }
  }
  const user = boGetCurrentUser_();
  const role = boGetRole_(user['Role ID']);
  const permissionRows = boGetPermissionRows_(user['Role ID']);
  const allowed = function (moduleName, action) {
    const column = String(action || 'View').replace(/^./, function (c) { return c.toUpperCase(); });
    return permissionRows.some(function (row) {
      return boModuleMatchesPermission_(row.Module, moduleName) && row[column] === 'Yes';
    });
  };
  const branding = boBranding_();
  const context = {
    user: {
      id: user['User ID'], email: user.Email, displayName: user['Display Name'] || user.Email,
      role: role ? role['Role Name'] : '', owner: !!(role && role['Role Name'] === 'Owner')
    },
    permissions: {
      view: allowed(H38_BO_SHEETS.QUOTES, 'View'),
      create: allowed(H38_BO_SHEETS.QUOTES, 'Create'),
      edit: allowed(H38_BO_SHEETS.QUOTES, 'Edit'),
      approve: !!(role && role['Role Name'] === 'Owner'),
      customers: allowed(H38_BO_SHEETS.CUSTOMERS, 'View'),
      priceBook: allowed(H38_BO_SHEETS.PRODUCTS, 'View'),
      templates: allowed(H38_BO_SHEETS.PDF_TEMPLATES, 'View'),
      documents: allowed(H38_BO_SHEETS.DOCUMENTS, 'View')
    },
    branding: {
      businessName: branding.businessName || 'Highway 38 Solutions',
      appName: 'Quote Builder',
      primaryColor: branding.primaryColor || '#173a5e',
      secondaryColor: branding.secondaryColor || '#326a9e',
      logoUrl: branding.logoUrl || ''
    },
    boundaries: {
      customerReleaseRequiresOwnerApproval: true,
      externalActionsEnabled: false,
      aiCanApproveOrPrice: false
    }
  };
  boAssert_(context.permissions.view, 'Your role does not allow Quote Builder access.');
  accessCache.put(accessKey, JSON.stringify(context), 300);
  boQuoteBuilderTiming_('authentication', started, { role: context.user.role });
  return context;
}

function boQuoteBuilderDirectBootstrap_() {
  const started = Date.now();
  const context = boQuoteBuilderAccessContext_();
  boQuoteBuilderTiming_('direct_bootstrap', started, { fields: Object.keys(context.permissions).length });
  return context;
}

function boQuoteBuilderRequireAction_(action) {
  const context = boQuoteBuilderAccessContext_();
  const key = String(action || 'View').toLowerCase();
  const aliases = { view:'view', create:'create', edit:'edit', approve:'approve', customers:'customers', pricebook:'priceBook', templates:'templates', documents:'documents' };
  const permissionKey = aliases[key] || key;
  boAssert_(context.permissions[permissionKey] === true, 'Your role does not allow ' + action + ' access in Quote Builder.');
  return context;
}

function boQuoteBuilderSnapshot_(sheetName, options) {
  const started = Date.now();
  const opts = options || {};
  const sheet = boGetSheet_(sheetName);
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.length ? values[0].map(boNormalizeText_) : [];
  const key = headers.length ? boPrimaryKeyHeader_(headers) : '';
  const rows = values.slice(1).filter(function (row) {
    return row.some(function (value) { return value !== ''; });
  }).map(function (row, index) {
    const record = { __rowNumber: index + 2 };
    headers.forEach(function (header, columnIndex) { if (header) record[header] = row[columnIndex]; });
    return record;
  }).filter(function (record) {
    if (opts.allBusinesses || !Object.prototype.hasOwnProperty.call(record, 'Business ID')) return true;
    return record['Business ID'] === boGetBusinessId_();
  }).filter(function (record) {
    return opts.includeVoided || (record['Is Voided'] !== 'Yes' && record.Status !== 'Voided');
  });
  boQuoteBuilderTiming_('sheet_read', started, { sheet: sheetName, rows: rows.length });
  return { sheet: sheet, headers: headers, key: key, rows: rows, lastRow: values.length };
}

function boQuoteBuilderPrepareRow_(snapshot, values) {
  const payload = Object.assign({}, values || {});
  if (snapshot.headers.indexOf('Business ID') >= 0) payload['Business ID'] = boGetBusinessId_();
  if (snapshot.headers.indexOf('Created Time') >= 0 && !payload['Created Time']) payload['Created Time'] = boNow_();
  if (snapshot.headers.indexOf('Updated Time') >= 0) payload['Updated Time'] = boNow_();
  return boMapRow_(snapshot.headers, payload);
}

function boQuoteBuilderAppendBatch_(snapshot, records) {
  if (!records || !records.length) return [];
  const rows = records.map(function (record) { return boQuoteBuilderPrepareRow_(snapshot, record); });
  snapshot.sheet.getRange(snapshot.lastRow + 1, 1, rows.length, snapshot.headers.length).setValues(rows);
  snapshot.lastRow += rows.length;
  return records;
}

function boQuoteBuilderCustomers_() {
  boQuoteBuilderRequireAction_('customers');
  const cached = boQuoteBuilderCacheGet_('customers');
  if (cached) return cached;
  const snapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.CUSTOMERS);
  const rows = snapshot.rows.filter(function (row) { return boNormalizeText_(row.Status || 'Active') === 'Active'; })
    .map(function (row) { return {
      'Customer ID': row['Customer ID'], 'Display Name': row['Display Name'], Email: row.Email,
      Phone: row.Phone, 'Payment Terms': row['Payment Terms'] || 'Net 15'
    }; }).slice(0, 500);
  return boQuoteBuilderCachePut_('customers', rows, 120);
}

function boQuoteBuilderDocuments_() {
  boQuoteBuilderRequireAction_('documents');
  const cached = boQuoteBuilderCacheGet_('documents');
  if (cached) return cached;
  const snapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.DOCUMENTS);
  const rows = snapshot.rows.sort(function (a, b) {
    return String(b['Uploaded Time'] || b['Created Time']).localeCompare(String(a['Uploaded Time'] || a['Created Time']));
  }).slice(0, 40).map(function (row) { return {
    'Document ID': row['Document ID'], 'File Name': row['File Name'], 'Document Type': row['Document Type'],
    'Source Type': row['Source Type'], 'Source ID': row['Source ID'], 'Review Status': row['Review Status'],
    'Approval Status': row['Approval Status'], 'Uploaded Time': row['Uploaded Time'] || row['Created Time']
  }; });
  return boQuoteBuilderCachePut_('documents', rows, 45);
}

function boQuoteBuilderQuoteDetails_(quoteId) {
  boQuoteBuilderRequireAction_('View');
  boAssert_(quoteId, 'Quote ID is required.');
  const quoteSnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTES, { includeVoided: true });
  const quote = quoteSnapshot.rows.find(function (row) { return row['Quote ID'] === quoteId; });
  boAssert_(quote, 'The quote was not found.');
  const lineSnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTE_LINES, { includeVoided: true });
  const lines = lineSnapshot.rows.filter(function (row) { return row['Quote ID'] === quoteId; }).map(function (row) { return {
    'Quote Line ID': row['Quote Line ID'], 'Line Number': row['Line Number'], Description: row.Description,
    Quantity: row.Quantity, Unit: row.Unit, Rate: row.Rate, Discount: row.Discount,
    Taxable: row.Taxable, 'Tax Rate': row['Tax Rate'], 'Line Total': row['Line Total']
  }; });
  const fields = ['Quote ID','Quote Number','Customer ID','Project Title','Quote Date','Expiration Date','Status','Approval Status','Send Allowed','Customer Action','Payment Terms','Scope','Assumptions','Exclusions','Internal Notes','Customer Notes','Subtotal','Tax','Deposit','Total'];
  const compact = {};
  fields.forEach(function (field) { compact[field] = quote[field] || ''; });
  return { quote: compact, lines: lines };
}

function boQuoteBuilderCompactRow_(row) {
  return {
    'Quote ID': row['Quote ID'], 'Quote Number': row['Quote Number'], 'Customer ID': row['Customer ID'],
    'Project Title': row['Project Title'], Status: row.Status || 'Draft', 'Approval Status': row['Approval Status'],
    Total: row.Total || 0, 'Quote Date': row['Quote Date'], 'Updated Time': row['Updated Time'] || row['Created Time']
  };
}
