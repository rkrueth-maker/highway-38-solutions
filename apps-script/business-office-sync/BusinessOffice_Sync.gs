/**
 * Highway 38 Business Office — additive intake synchronization.
 * Reads existing private Backend Requests and mirrors only missing IDs into the
 * private Business Office. It never intercepts intake or performs a customer action.
 */

function h38BusinessOfficeBootstrapSync(config) {
  const supplied = config || {};
  const activeEmail = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const ownerEmail = String(supplied.ownerEmail || '').trim().toLowerCase();
  if (!ownerEmail || activeEmail !== ownerEmail) throw new Error('SYNC INSTALL HOLD — the signed-in Google account must match the configured Owner email.');
  const required = ['H38_BACKEND_SPREADSHEET_ID', 'H38_BUSINESS_OFFICE_SPREADSHEET_ID', 'H38_BUSINESS_OFFICE_DEFAULT_BUSINESS_ID'];
  required.forEach(function (key) { if (!String(supplied[key] || '').trim()) throw new Error('SYNC INSTALL HOLD — missing ' + key + '.'); });
  const properties = PropertiesService.getScriptProperties();
  required.forEach(function (key) { properties.setProperty(key, String(supplied[key]).trim()); });
  properties.setProperty('H38_BUSINESS_OFFICE_SYNC_OWNER_EMAIL', ownerEmail);
  properties.setProperty('H38_BUSINESS_OFFICE_SYNC_EXTERNAL_ACTIONS', 'FALSE');
  const trigger = h38BusinessOfficeInstallSyncTrigger({ confirmation: 'INSTALL BUSINESS OFFICE REQUEST SYNC' });
  return { status: 'PASS', backendSpreadsheetId: supplied.H38_BACKEND_SPREADSHEET_ID, businessOfficeSpreadsheetId: supplied.H38_BUSINESS_OFFICE_SPREADSHEET_ID, trigger: trigger, externalActionsEnabled: false };
}

function h38BusinessOfficeMirrorRequest_(request) {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('H38_BUSINESS_OFFICE_SPREADSHEET_ID');
  if (!spreadsheetId) return { status: 'SKIPPED', reason: 'Business Office property not configured.' };
  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const sheet = spreadsheet.getSheetByName('BO Requests');
    if (!sheet) throw new Error('Missing BO Requests sheet.');
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const requestId = h38BoPick_(request, ['requestId', 'Request ID', 'id']);
    if (!requestId) throw new Error('Request ID is required for Business Office mirroring.');
    const idIndex = headers.indexOf('Request ID');
    if (idIndex < 0) throw new Error('BO Requests does not contain Request ID.');
    const existingIds = sheet.getLastRow() > 1 ? sheet.getRange(2, idIndex + 1, sheet.getLastRow() - 1, 1).getDisplayValues().flat() : [];
    if (existingIds.indexOf(requestId) >= 0) return { status: 'DUPLICATE_PREVENTED', requestId: requestId };
    const values = {
      'Request ID': requestId,
      'Business ID': properties.getProperty('H38_BUSINESS_OFFICE_DEFAULT_BUSINESS_ID') || 'H38',
      'Received Time': h38BoPick_(request, ['receivedTime', 'Received Time', 'createdTime']) || h38BoNow_(),
      Source: h38BoPick_(request, ['source', 'Source']) || 'Integrated Intake', Status: 'New',
      'Approval Status': 'Owner Approval Required', 'Owner Decision': '',
      Name: h38BoPick_(request, ['name', 'Name', 'customerName']), Email: h38BoPick_(request, ['email', 'Email']), Phone: h38BoPick_(request, ['phone', 'Phone']),
      'Preferred Contact': h38BoPick_(request, ['preferredContact', 'Preferred Contact']) || 'Email',
      'Desired Outcome': h38BoPick_(request, ['desiredOutcome', 'Desired Outcome', 'outcome']),
      'Product / Bundle ID': h38BoPick_(request, ['productId', 'Product / Bundle ID', 'productOrBundleId']),
      Problem: h38BoPick_(request, ['problem', 'Problem', 'projectProblem']), 'Finished Result': h38BoPick_(request, ['finishedResult', 'Finished Result']),
      'Files or Links': h38BoPick_(request, ['filesOrLinks', 'Files or Links']), 'Project Details': h38BoPick_(request, ['projectDetails', 'Project Details', 'details']),
      Budget: h38BoPick_(request, ['budget', 'Budget']), Timing: h38BoPick_(request, ['timing', 'Timing']), 'Lead ID': h38BoPick_(request, ['leadId', 'Lead ID']),
      'Customer ID': '', 'Job ID': '', 'Next Action': 'Owner reviews selected record', 'Duplicate Key': 'H38|' + requestId,
      'Created Time': h38BoNow_(), 'Updated Time': h38BoNow_()
    };
    sheet.appendRow(headers.map(function (header) { return values[header] == null ? '' : values[header]; }));
    h38BoAppendProof_(spreadsheet, requestId, 'MIRROR INTAKE REQUEST', 'PASS', 'Integrated intake mirrored to BO Requests.');
    return { status: 'PASS', requestId: requestId };
  } catch (error) {
    try { h38BoAppendError_(SpreadsheetApp.openById(spreadsheetId), request, error); } catch (loggingError) { console.error(loggingError); }
    return { status: 'HOLD', error: error.message };
  }
}

function h38BusinessOfficeSyncRequests() {
  const backendSpreadsheetId = PropertiesService.getScriptProperties().getProperty('H38_BACKEND_SPREADSHEET_ID');
  if (!backendSpreadsheetId) return { status: 'HOLD', reason: 'Backend spreadsheet property not configured.' };
  const sheet = SpreadsheetApp.openById(backendSpreadsheetId).getSheetByName('Backend Requests');
  if (!sheet || sheet.getLastRow() < 2) return { status: 'PASS', mirrored: 0, duplicates: 0, holds: 0 };
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.shift();
  const result = { status: 'PASS', mirrored: 0, duplicates: 0, holds: 0 };
  values.forEach(function (row) {
    const request = {}; headers.forEach(function (header, index) { request[header] = row[index]; });
    const mirror = h38BusinessOfficeMirrorRequest_(request);
    if (mirror.status === 'PASS') result.mirrored += 1;
    else if (mirror.status === 'DUPLICATE_PREVENTED') result.duplicates += 1;
    else if (mirror.status !== 'SKIPPED') result.holds += 1;
  });
  if (result.holds) result.status = 'HOLD';
  return result;
}

function h38BusinessOfficeSyncRequestById(requestId) {
  if (!requestId) throw new Error('Request ID is required.');
  const backendSpreadsheetId = PropertiesService.getScriptProperties().getProperty('H38_BACKEND_SPREADSHEET_ID');
  if (!backendSpreadsheetId) return { status: 'HOLD', reason: 'Backend spreadsheet property not configured.' };
  const sheet = SpreadsheetApp.openById(backendSpreadsheetId).getSheetByName('Backend Requests');
  if (!sheet || sheet.getLastRow() < 2) return { status: 'HOLD', reason: 'Backend Requests is empty.' };
  const values = sheet.getDataRange().getDisplayValues(), headers = values[0], idIndex = headers.indexOf('Request ID');
  if (idIndex < 0) throw new Error('Backend Requests is missing Request ID.');
  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (String(values[rowIndex][idIndex]) !== String(requestId)) continue;
    const request = {}; headers.forEach(function (header, index) { request[header] = values[rowIndex][index]; });
    return h38BusinessOfficeMirrorRequest_(request);
  }
  return { status: 'HOLD', reason: 'Request not found.' };
}

function h38BusinessOfficeInstallSyncTrigger(options) {
  if (!(options && options.confirmation === 'INSTALL BUSINESS OFFICE REQUEST SYNC')) throw new Error('INSTALL HOLD — exact confirmation required.');
  ScriptApp.getProjectTriggers().forEach(function (trigger) { if (trigger.getHandlerFunction() === 'h38BusinessOfficeSyncRequests') ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger('h38BusinessOfficeSyncRequests').timeBased().everyMinutes(5).create();
  return { status: 'PASS', handler: 'h38BusinessOfficeSyncRequests', intervalMinutes: 5 };
}

function h38BusinessOfficeSyncAcceptance() {
  const first = h38BusinessOfficeSyncRequests();
  if (first.status !== 'PASS') throw new Error('Initial request sync failed: ' + JSON.stringify(first));
  const second = h38BusinessOfficeSyncRequests();
  if (second.status !== 'PASS' || second.mirrored !== 0) throw new Error('Duplicate-safe repeat sync failed: ' + JSON.stringify(second));
  return { status: 'PASS', first: first, repeat: second, externalActionsEnabled: false };
}

function h38BoPick_(record, keys) { for (let i = 0; i < keys.length; i += 1) { const value = (record || {})[keys[i]]; if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim(); } return ''; }
function h38BoNow_() { return Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd HH:mm:ss'); }
function h38BoAppendProof_(spreadsheet, recordId, action, result, evidence) { const sheet = spreadsheet.getSheetByName('BO Proof Log'); if (sheet) sheet.appendRow(['PROOF-' + Utilities.getUuid().slice(0, 8).toUpperCase(), 'H38', h38BoNow_(), 'SYSTEM', 'Integrated Intake Sync', 'Request', recordId, action, action, result, evidence, 'No customer-facing action.']); }
function h38BoAppendError_(spreadsheet, request, error) { const sheet = spreadsheet.getSheetByName('BO Error Log'); if (sheet) sheet.appendRow(['ERROR-' + Utilities.getUuid().slice(0, 8).toUpperCase(), 'H38', h38BoNow_(), 'Integrated Intake Sync', 'Request', h38BoPick_(request, ['requestId', 'Request ID', 'id']), 'Warning', error.message || String(error), error.stack || '', 'Open', '', '', 'Original intake preserved even when mirror is unavailable.']); }
