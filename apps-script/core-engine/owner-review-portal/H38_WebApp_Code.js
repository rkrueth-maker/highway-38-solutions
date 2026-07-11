/*
 * Highway 38 Owner Review Portal — Secure Private Web App
 * Target script: Owner Review Portal - Rick Approval Dashboard - V6
 * Spreadsheet ID: 1P5_7iUVf-yY9ffUEM7Iy5v10VsjE2LZdX7vNMcoQ1Uo
 *
 * Safety model:
 * - Rick-only private Web App deployment required.
 * - Selected row by queue + row number only.
 * - No triggers.
 * - No bulk execution.
 * - No payment requests.
 * - No final delivery.
 * - No automatic website/social publishing.
 */

var H38_WEBAPP_CONFIG = {
  APP_NAME: 'Highway 38 Owner Review Portal',
  OWNER_EMAILS: ['rkrueth@gmail.com', 'highway38solutions@gmail.com'],
  SPREADSHEET_ID: '1P5_7iUVf-yY9ffUEM7Iy5v10VsjE2LZdX7vNMcoQ1Uo',
  TIMEZONE: 'Etc/GMT',
  MAX_ROWS: 40,
  QUEUES: [
    'Dashboard',
    'New Requests',
    'Job Queue',
    'Email Approval Queue',
    'Quote Approval Queue',
    'Follow-Up Queue',
    'Output Queue',
    'Social Approval Queue',
    'Website Approval Queue',
    'Proof Log',
    'Error Log'
  ]
};

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('H38_WebApp_Index');
  return t.evaluate()
    .setTitle('H38 Owner Review Portal')
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

function h38WebAppInclude(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function h38WebAppBootstrap() {
  var auth = getAccess_();
  var ss = getPortalSpreadsheet_();
  var dashboard = getDashboard_();
  var summary = getQueueSummary_();
  return {
    appName: H38_WEBAPP_CONFIG.APP_NAME,
    auth: auth,
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    dashboard: dashboard,
    queues: H38_WEBAPP_CONFIG.QUEUES,
    summary: summary,
    safety: [
      'Rick-only private Web App deployment required.',
      'Selected row execution only.',
      'No triggers.',
      'No bulk processing.',
      'No payment requests.',
      'No final delivery.',
      'No automatic website/social publishing.'
    ],
    timestamp: now_()
  };
}

function h38WebAppGetQueue(sheetName) {
  assertAccess_();
  assertAllowedSheet_(sheetName);
  var ss = getPortalSpreadsheet_();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  var values = sh.getDataRange().getDisplayValues();
  if (!values.length) return { sheetName: sheetName, headers: [], rows: [] };
  var headers = values[0];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.join('').trim() === '') continue;
    rows.push({ rowNumber: i + 1, values: row, object: rowToObject_(headers, row) });
  }
  rows = rows.slice(Math.max(0, rows.length - H38_WEBAPP_CONFIG.MAX_ROWS));
  return { sheetName: sheetName, headers: headers, rows: rows };
}

function h38WebAppRefreshDashboard() {
  assertAccess_();
  updateDashboard_();
  return { status: 'PASS', message: 'Dashboard refreshed safely.', dashboard: getDashboard_() };
}

function h38WebAppApproveRow(sheetName, rowNumber) {
  assertAccess_();
  assertActionSheet_(sheetName);
  var ctx = getRowContext_(sheetName, rowNumber);
  var decision = defaultApproveDecision_(sheetName);
  setIfHeader_(ctx, 'Approval Status', 'Approved by Rick - Action Allowed');
  setIfHeader_(ctx, 'Rick Decision', decision);
  setAllowedColumn_(ctx, 'Yes');
  setIfHeader_(ctx, 'Next Action', 'Owner approved in private Web App. Execute selected row only.');
  appendNote_(ctx, '[' + now_() + '] Approved in private Owner Portal Web App.');
  return { status: 'PASS', message: 'Row approved for selected-row execution.', sheetName: sheetName, rowNumber: rowNumber, decision: decision };
}

function h38WebAppHoldRow(sheetName, rowNumber) {
  assertAccess_();
  assertActionSheet_(sheetName);
  var ctx = getRowContext_(sheetName, rowNumber);
  setIfHeader_(ctx, 'Approval Status', 'Rick Review Required / Owner Approval Required');
  setIfHeader_(ctx, 'Rick Decision', 'HOLD');
  setAllowedColumn_(ctx, 'No');
  setIfHeader_(ctx, 'Next Action', 'Held by Rick in private Web App.');
  appendNote_(ctx, '[' + now_() + '] Held in private Owner Portal Web App.');
  return { status: 'PASS', message: 'Row placed on hold.', sheetName: sheetName, rowNumber: rowNumber };
}

function h38WebAppExecuteRow(sheetName, rowNumber) {
  assertAccess_();
  assertActionSheet_(sheetName);
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var ctx = getRowContext_(sheetName, rowNumber);
    var result;
    if (sheetName === 'Email Approval Queue') result = executeEmail_(ctx);
    else if (sheetName === 'Quote Approval Queue') result = executeQuote_(ctx);
    else if (sheetName === 'Follow-Up Queue') result = executeFollowUp_(ctx);
    else if (sheetName === 'Output Queue') result = executeOutput_(ctx);
    else if (sheetName === 'Social Approval Queue') result = executeSocial_(ctx);
    else if (sheetName === 'Website Approval Queue') result = executeWebsite_(ctx);
    else throw new Error('Unsupported execution sheet: ' + sheetName);
    updateDashboard_();
    return result;
  } catch (err) {
    return { status: 'HOLD', message: String(err && err.message ? err.message : err) };
  } finally {
    lock.releaseLock();
  }
}

function h38WebAppGetProofLog(jobId) {
  assertAccess_();
  return searchRows_('Proof Log', jobId || '', 100);
}

function h38WebAppGetErrorLog(jobId) {
  assertAccess_();
  return searchRows_('Error Log', jobId || '', 100);
}

function h38WebAppSafetyStatus() {
  var auth = getAccess_();
  return {
    status: auth.allowed ? 'PASS' : 'HOLD',
    auth: auth,
    message: 'Private Owner Review Portal loaded. Selected-row only. No trigger. No bulk. No payment. No final delivery. No auto-publish.'
  };
}

function getAccess_() {
  var active = '';
  var effective = '';
  try { active = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) {}
  try { effective = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e2) {}
  var owners = H38_WEBAPP_CONFIG.OWNER_EMAILS.map(function(x) { return String(x).toLowerCase(); });
  var activeAllowed = active && owners.indexOf(active) !== -1;
  var effectiveAllowed = effective && owners.indexOf(effective) !== -1;
  return {
    allowed: activeAllowed || effectiveAllowed,
    activeUser: active || '(blank)',
    effectiveUser: effective || '(blank)',
    ownerEmails: owners,
    rule: 'Deploy Web App access as Only myself / Rick-only. Code also checks owner email.'
  };
}

function assertAccess_() {
  var a = getAccess_();
  if (!a.allowed) {
    throw new Error('ACCESS HOLD — Rick-only portal. Active user: ' + a.activeUser + ' / Effective user: ' + a.effectiveUser);
  }
}

function getPortalSpreadsheet_() {
  return SpreadsheetApp.openById(H38_WEBAPP_CONFIG.SPREADSHEET_ID);
}

function assertAllowedSheet_(sheetName) {
  if (H38_WEBAPP_CONFIG.QUEUES.indexOf(sheetName) === -1) throw new Error('Sheet not allowed in portal: ' + sheetName);
}

function assertActionSheet_(sheetName) {
  var allowed = ['Email Approval Queue', 'Quote Approval Queue', 'Follow-Up Queue', 'Output Queue', 'Social Approval Queue', 'Website Approval Queue'];
  if (allowed.indexOf(sheetName) === -1) throw new Error('Action not supported for sheet: ' + sheetName);
}

function getRowContext_(sheetName, rowNumber) {
  var ss = getPortalSpreadsheet_();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Sheet not found: ' + sheetName);
  rowNumber = Number(rowNumber);
  if (!rowNumber || rowNumber < 2 || rowNumber > sh.getLastRow()) throw new Error('Invalid row number: ' + rowNumber);
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  var values = sh.getRange(rowNumber, 1, 1, lastCol).getDisplayValues()[0];
  var idx = headerIndex_(headers);
  return { ss: ss, sheet: sh, sheetName: sheetName, rowNumber: rowNumber, headers: headers, idx: idx, values: values, object: rowToObject_(headers, values) };
}

function headerIndex_(headers) {
  var out = {};
  headers.forEach(function(h, i) { out[String(h).trim()] = i + 1; });
  return out;
}

function rowToObject_(headers, values) {
  var obj = {};
  headers.forEach(function(h, i) { obj[String(h).trim()] = values[i] || ''; });
  return obj;
}

function getVal_(ctx, header) {
  var col = ctx.idx[header];
  return col ? String(ctx.sheet.getRange(ctx.rowNumber, col).getDisplayValue() || '') : '';
}

function setIfHeader_(ctx, header, value) {
  var col = ctx.idx[header];
  if (col) ctx.sheet.getRange(ctx.rowNumber, col).setValue(value);
}

function appendNote_(ctx, note) {
  var col = ctx.idx['Notes'];
  if (!col) return;
  var cell = ctx.sheet.getRange(ctx.rowNumber, col);
  var old = String(cell.getDisplayValue() || '');
  cell.setValue(old ? old + '\n' + note : note);
}

function setAllowedColumn_(ctx, value) {
  if (ctx.idx['Send Allowed']) setIfHeader_(ctx, 'Send Allowed', value);
  if (ctx.idx['Delivery Allowed']) setIfHeader_(ctx, 'Delivery Allowed', value);
  if (ctx.idx['Publish Allowed']) setIfHeader_(ctx, 'Publish Allowed', value);
}

function defaultApproveDecision_(sheetName) {
  if (sheetName === 'Email Approval Queue') return 'APPROVE SEND';
  if (sheetName === 'Quote Approval Queue') return 'APPROVE QUOTE SEND';
  if (sheetName === 'Follow-Up Queue') return 'APPROVE FOLLOW-UP SEND';
  if (sheetName === 'Output Queue') return 'APPROVE DELIVERY DRAFT ROUTING';
  if (sheetName === 'Social Approval Queue') return 'APPROVE SOCIAL HANDOFF';
  if (sheetName === 'Website Approval Queue') return 'APPROVE WEBSITE HANDOFF';
  return 'APPROVE';
}

function validateApproval_(ctx, requiredDecision) {
  var approval = getVal_(ctx, 'Approval Status');
  var decision = getVal_(ctx, 'Rick Decision');
  if (approval !== 'Approved by Rick - Action Allowed' || decision !== requiredDecision) {
    return blockError_(ctx, 'APPROVAL_REQUIRED', 'Rick approval is required before executing this row. Approval Status: ' + approval + ' / Rick Decision: ' + decision, 'Execute selected row');
  }
}

function duplicateLock_(ctx) {
  var pieces = [];
  ['Send Allowed', 'Delivery Allowed', 'Publish Allowed', 'Approval Status', 'Sent Time', 'Proof Log ID'].forEach(function(h) {
    var v = getVal_(ctx, h);
    if (v) pieces.push(h + '=' + v);
  });
  var proof = getVal_(ctx, 'Proof Log ID');
  var status = getVal_(ctx, 'Approval Status');
  var sent = getVal_(ctx, 'Sent Time');
  var sendAllowed = getVal_(ctx, 'Send Allowed');
  var delivery = getVal_(ctx, 'Delivery Allowed');
  var publish = getVal_(ctx, 'Publish Allowed');
  var locked = proof || sent || /locked|completed|proof logged/i.test(status) || /locked|sent/i.test(sendAllowed) || /do not deliver/i.test(delivery) || /do not publish|do not deploy/i.test(publish);
  if (locked) {
    return blockError_(ctx, 'DUPLICATE_LOCK', 'Duplicate lock detected: ' + pieces.join(' / '), 'Duplicate send/action prevention');
  }
}

function executeEmail_(ctx) {
  validateApproval_(ctx, 'APPROVE SEND');
  duplicateLock_(ctx);
  var draftRef = getVal_(ctx, 'Gmail Draft Reference');
  var to = getVal_(ctx, 'To');
  var jobId = getVal_(ctx, 'Job ID');
  var draftId = extractDraftId_(draftRef);
  if (!draftId) return blockError_(ctx, 'MISSING_DRAFT', 'Missing Gmail Draft Reference / Draft ID.', 'Gmail draft send');
  var draft = findDraftById_(draftId);
  if (!draft) return blockError_(ctx, 'DRAFT_NOT_FOUND', 'Gmail draft not found: ' + draftId, 'Gmail draft send');
  var msg = draft.send();
  var proofId = makeProofId_(jobId || 'EMAIL');
  setIfHeader_(ctx, 'Approval Status', 'Completed - Proof Logged');
  setIfHeader_(ctx, 'Send Allowed', 'Sent - locked');
  setIfHeader_(ctx, 'Sent Time', now_());
  setIfHeader_(ctx, 'Proof Log ID', proofId);
  setIfHeader_(ctx, 'Next Action', 'Completed - proof logged. Duplicate-send lock active.');
  appendNote_(ctx, 'Sent by private Web App selected-row execution. Gmail Message ID: ' + msg.getId() + ' / Thread ID: ' + msg.getThread().getId());
  appendProof_(proofId, now_(), jobId, ctx.sheetName, 'Private Web App approved Gmail draft send', 'Approved by Rick - Action Allowed', 'APPROVE SEND', 'Rick / Owner Review Portal Web App', 'Draft ID: ' + draftId, 'Gmail Message ID: ' + msg.getId() + ' / Thread ID: ' + msg.getThread().getId(), to, 'N/A', 'No', 'PASS - Email sent and locked', 'H38-WEB-APP', 'No trigger. No bulk processing. Selected row only.');
  return { status: 'PASS', message: 'Approved Gmail draft sent and locked.', proofId: proofId, messageId: msg.getId() };
}

function executeQuote_(ctx) {
  validateApproval_(ctx, 'APPROVE QUOTE SEND');
  duplicateLock_(ctx);
  var jobId = getVal_(ctx, 'Job ID');
  var amount = getVal_(ctx, 'Quote Amount');
  if (!/^\d+(\.\d{1,2})?$/.test(String(amount))) return blockError_(ctx, 'QUOTE_AMOUNT_NOT_NUMERIC', 'Quote Amount must be numeric-only. Found: ' + amount, 'Quote send');
  var draftRef = getVal_(ctx, 'Quote Draft Link') || getVal_(ctx, 'Gmail Draft Reference');
  var draftId = extractDraftId_(draftRef);
  if (!draftId) return blockError_(ctx, 'MISSING_QUOTE_DRAFT', 'Missing Quote Draft Link / Gmail Draft ID.', 'Quote send');
  var draft = findDraftById_(draftId);
  if (!draft) return blockError_(ctx, 'QUOTE_DRAFT_NOT_FOUND', 'Quote Gmail draft not found: ' + draftId, 'Quote send');
  var msg = draft.send();
  var proofId = makeProofId_(jobId || 'QUOTE');
  setIfHeader_(ctx, 'Approval Status', 'Completed - Proof Logged');
  setIfHeader_(ctx, 'Send Allowed', 'Quote Sent - locked');
  setIfHeader_(ctx, 'Sent Time', now_());
  setIfHeader_(ctx, 'Proof Log ID', proofId);
  setIfHeader_(ctx, 'Next Action', 'Quote sent. Wait for customer response. No payment request sent.');
  appendNote_(ctx, 'Quote sent by private Web App selected-row execution. Gmail Message ID: ' + msg.getId() + ' / Thread ID: ' + msg.getThread().getId() + '. No payment request.');
  appendProof_(proofId, now_(), jobId, ctx.sheetName, 'Private Web App approved quote email send', 'Approved by Rick - Action Allowed', 'APPROVE QUOTE SEND', 'Rick / Owner Review Portal Web App', 'Quote Draft ID: ' + draftId, 'Gmail Message ID: ' + msg.getId() + ' / Thread ID: ' + msg.getThread().getId(), getVal_(ctx, 'Customer Name') || getVal_(ctx, 'To'), 'N/A', 'N/A', 'PASS - Quote sent and locked', 'H38-WEB-APP', 'Quote Amount numeric verified. No payment request. No trigger. No bulk processing.');
  return { status: 'PASS', message: 'Quote draft sent and locked.', proofId: proofId, messageId: msg.getId() };
}

function executeFollowUp_(ctx) {
  validateApproval_(ctx, 'APPROVE FOLLOW-UP SEND');
  duplicateLock_(ctx);
  var jobId = getVal_(ctx, 'Job ID');
  var draftRef = getVal_(ctx, 'Draft Link') || getVal_(ctx, 'Gmail Draft Reference');
  var draftId = extractDraftId_(draftRef);
  if (!draftId) return blockError_(ctx, 'MISSING_FOLLOWUP_DRAFT', 'Missing Follow-Up Draft Link / Gmail Draft ID.', 'Follow-up send');
  var draft = findDraftById_(draftId);
  if (!draft) return blockError_(ctx, 'FOLLOWUP_DRAFT_NOT_FOUND', 'Follow-up Gmail draft not found: ' + draftId, 'Follow-up send');
  var msg = draft.send();
  var proofId = makeProofId_(jobId || 'FOLLOW');
  setIfHeader_(ctx, 'Last Touch', now_() + ' / Gmail message ' + msg.getId());
  setIfHeader_(ctx, 'Approval Status', 'Completed - Proof Logged');
  setIfHeader_(ctx, 'Send Allowed', 'Sent - locked');
  setIfHeader_(ctx, 'Sent Time', now_());
  setIfHeader_(ctx, 'Proof Log ID', proofId);
  setIfHeader_(ctx, 'Next Action', 'Follow-up sent. Duplicate-send lock active.');
  appendNote_(ctx, 'Follow-up sent by private Web App selected-row execution. Thread ID: ' + msg.getThread().getId());
  appendProof_(proofId, now_(), jobId, ctx.sheetName, 'Private Web App approved follow-up send', 'Approved by Rick - Action Allowed', 'APPROVE FOLLOW-UP SEND', 'Rick / Owner Review Portal Web App', 'Draft ID: ' + draftId, 'Gmail Message ID: ' + msg.getId() + ' / Thread ID: ' + msg.getThread().getId(), getVal_(ctx, 'Contact / Channel') || getVal_(ctx, 'To'), 'N/A', 'N/A', 'PASS - Follow-up sent and locked', 'H38-WEB-APP', 'No trigger. No bulk processing.');
  return { status: 'PASS', message: 'Follow-up sent and locked.', proofId: proofId, messageId: msg.getId() };
}

function executeOutput_(ctx) {
  validateApproval_(ctx, 'APPROVE DELIVERY DRAFT ROUTING');
  duplicateLock_(ctx);
  var jobId = getVal_(ctx, 'Job ID');
  var draftLink = getVal_(ctx, 'Draft File Link');
  if (!draftLink) return blockError_(ctx, 'MISSING_OUTPUT_DRAFT', 'Missing Draft File Link.', 'Output delivery draft routing');
  var recipient = 'rkrueth@gmail.com';
  var subject = 'H38 Delivery Draft Review - ' + jobId;
  var body = 'Rick review required.\n\nOutput delivery draft created for internal review only.\n\nJob ID: ' + jobId + '\nDraft File: ' + draftLink + '\n\nNo final delivery was sent. No payment request. No trigger.';
  var draft = GmailApp.createDraft(recipient, subject, body);
  var emailQueueId = 'EMAIL-DELIVERY-' + jobId + '-' + shortId_();
  appendEmailQueueRow_(emailQueueId, jobId, 'Delivery draft review - no final delivery', 'Gmail draft ID: ' + draft.getId(), recipient, subject, 'Rick Review Required / Owner Approval Required', '', 'No', 'Rick reviews delivery draft before any customer send.', 'Created by private Web App output routing. No final delivery.');
  var proofId = makeProofId_(jobId || 'OUTPUT');
  setIfHeader_(ctx, 'Approval Status', 'Ready For Delivery Draft');
  setIfHeader_(ctx, 'Delivery Allowed', 'Do Not Deliver');
  setIfHeader_(ctx, 'Proof Log ID', proofId);
  setIfHeader_(ctx, 'Next Action', 'Delivery draft routed to Email Approval Queue for Rick review.');
  appendNote_(ctx, 'Delivery draft created and routed. Email Queue ID: ' + emailQueueId + ' / Gmail draft ID: ' + draft.getId());
  appendProof_(proofId, now_(), jobId, ctx.sheetName, 'Private Web App output delivery draft routed', 'Approved by Rick - Action Allowed', 'APPROVE DELIVERY DRAFT ROUTING', 'Rick / Owner Review Portal Web App', draftLink, 'Gmail draft ID: ' + draft.getId() + ' / Email Queue ID: ' + emailQueueId, recipient, 'N/A', 'No', 'PASS - Delivery draft created and routed', 'H38-WEB-APP', 'No final delivery sent. Email Approval Queue review required.');
  return { status: 'PASS', message: 'Delivery draft created and routed for Rick review.', proofId: proofId, draftId: draft.getId(), emailQueueId: emailQueueId };
}

function executeSocial_(ctx) {
  validateApproval_(ctx, 'APPROVE SOCIAL HANDOFF');
  duplicateLock_(ctx);
  var jobId = getVal_(ctx, 'Job ID');
  var draftCopy = getVal_(ctx, 'Draft Copy Link');
  if (!draftCopy) return blockError_(ctx, 'MISSING_SOCIAL_DRAFT', 'Missing Draft Copy Link.', 'Social handoff');
  var doc = DocumentApp.create('H38 Metricool Handoff - ' + jobId + ' - ' + shortId_());
  doc.getBody().setText('Highway 38 Metricool Handoff\n\nJob ID: ' + jobId + '\nPlatform: ' + getVal_(ctx, 'Platform') + '\nDraft Copy: ' + draftCopy + '\n\nStatus: Handoff prepared only. No automatic publish. No trigger.');
  doc.saveAndClose();
  var proofId = makeProofId_(jobId || 'SOCIAL');
  setIfHeader_(ctx, 'Approval Status', 'Handoff Proof Logged');
  setIfHeader_(ctx, 'Publish Allowed', 'Do Not Publish');
  setIfHeader_(ctx, 'Metricool Status', 'Metricool Package Prepared');
  setIfHeader_(ctx, 'Proof Log ID', proofId);
  setIfHeader_(ctx, 'Next Action', 'Rick reviews Metricool handoff. Do not publish automatically.');
  appendNote_(ctx, 'Metricool handoff prepared: ' + doc.getUrl());
  appendProof_(proofId, now_(), jobId, ctx.sheetName, 'Private Web App social handoff prepared', 'Approved by Rick - Action Allowed', 'APPROVE SOCIAL HANDOFF', 'Rick / Owner Review Portal Web App', draftCopy, doc.getUrl(), getVal_(ctx, 'Platform'), getVal_(ctx, 'Public Safe Check') || 'N/A', getVal_(ctx, 'Customer Data Present') || 'No', 'PASS - Metricool handoff prepared', 'H38-WEB-APP', 'No automatic publish. No trigger. Selected row only.');
  return { status: 'PASS', message: 'Social handoff package prepared. No publish.', proofId: proofId, handoffUrl: doc.getUrl() };
}

function executeWebsite_(ctx) {
  validateApproval_(ctx, 'APPROVE WEBSITE HANDOFF');
  duplicateLock_(ctx);
  var jobId = getVal_(ctx, 'Job ID');
  var publicSafe = getVal_(ctx, 'Public Safe Check');
  var privateSafe = getVal_(ctx, 'Private Data Check');
  var secretsSafe = getVal_(ctx, 'No Secrets Check');
  if (!isSafe_(publicSafe) || !isSafe_(privateSafe) || !isSafe_(secretsSafe)) {
    return blockError_(ctx, 'WEBSITE_SAFETY_CHECK_FAILED', 'Website safety checks must be Safe/Pass/Yes. Public=' + publicSafe + ' Private=' + privateSafe + ' Secrets=' + secretsSafe, 'Website handoff');
  }
  var draftLink = getVal_(ctx, 'Draft / PR Link');
  var doc = DocumentApp.create('H38 GitHub Website Handoff - ' + jobId + ' - ' + shortId_());
  doc.getBody().setText('Highway 38 Website / GitHub Handoff\n\nJob ID: ' + jobId + '\nPage / Asset: ' + getVal_(ctx, 'Page / Asset') + '\nChange Type: ' + getVal_(ctx, 'Change Type') + '\nDraft / PR Link: ' + draftLink + '\n\nStatus: Handoff prepared only. No automatic deployment. No public website update.');
  doc.saveAndClose();
  var proofId = makeProofId_(jobId || 'WEB');
  setIfHeader_(ctx, 'Approval Status', 'Proof Logged');
  setIfHeader_(ctx, 'Publish Allowed', 'Do Not Deploy');
  setIfHeader_(ctx, 'Proof Log ID', proofId);
  setIfHeader_(ctx, 'Next Action', 'Rick reviews GitHub handoff. Do not deploy automatically.');
  appendNote_(ctx, 'GitHub/website handoff prepared: ' + doc.getUrl());
  appendProof_(proofId, now_(), jobId, ctx.sheetName, 'Private Web App website GitHub handoff prepared', 'Approved by Rick - Action Allowed', 'APPROVE WEBSITE HANDOFF', 'Rick / Owner Review Portal Web App', draftLink, doc.getUrl(), 'GitHub Pages / Website', publicSafe, privateSafe, 'PASS - GitHub handoff prepared', 'H38-WEB-APP', 'No automatic deployment. No public website update. Selected row only.');
  return { status: 'PASS', message: 'Website/GitHub handoff package prepared. No deploy.', proofId: proofId, handoffUrl: doc.getUrl() };
}

function appendEmailQueueRow_(emailId, jobId, type, draftRef, to, subject, approvalStatus, rickDecision, sendAllowed, nextAction, notes) {
  var sh = getPortalSpreadsheet_().getSheetByName('Email Approval Queue');
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  var row = new Array(headers.length).fill('');
  var idx = headerIndex_(headers);
  function put(h, v) { if (idx[h]) row[idx[h] - 1] = v; }
  put('Email ID', emailId);
  put('Job ID', jobId);
  put('Email Type', type);
  put('Gmail Draft Reference', draftRef);
  put('From Account', 'rkrueth@gmail.com');
  put('To', to);
  put('Subject', subject);
  put('Subject Prefix', '[DELIVERY REVIEW]');
  put('Customer / Public Recipient', 'No');
  put('Contains Customer Data', 'No');
  put('Approval Status', approvalStatus);
  put('Rick Decision', rickDecision);
  put('Send Allowed', sendAllowed);
  put('Next Action', nextAction);
  put('Notes', notes);
  sh.appendRow(row);
}

function appendProof_(proofId, timestamp, jobId, queueTab, actionType, approvalBefore, decision, approvedBy, evidence, output, recipient, publicSafe, privateSafe, result, createdBy, notes) {
  var sh = getPortalSpreadsheet_().getSheetByName('Proof Log');
  sh.appendRow([proofId, timestamp, jobId, queueTab, actionType, approvalBefore, decision, approvedBy, evidence, output, recipient, publicSafe, privateSafe, result, createdBy, notes]);
}

function blockError_(ctx, errorType, description, blockedAction) {
  var errorId = 'ERR-' + (getVal_(ctx, 'Job ID') || ctx.sheetName.replace(/\s+/g, '-')) + '-' + shortId_();
  var sh = getPortalSpreadsheet_().getSheetByName('Error Log');
  if (sh) {
    sh.appendRow([errorId, now_(), ctx.sheetName, getVal_(ctx, 'Job ID'), errorType, 'High', description, blockedAction, 'Yes', 'Open', '', '', '', 'No customer-facing action completed.']);
  }
  throw new Error(description + ' / Error Log ID: ' + errorId);
}

function extractDraftId_(text) {
  text = String(text || '');
  var m = text.match(/r[-]?[0-9]+/);
  return m ? m[0] : '';
}

function findDraftById_(draftId) {
  var drafts = GmailApp.getDrafts();
  for (var i = 0; i < drafts.length; i++) {
    if (drafts[i].getId() === draftId) return drafts[i];
  }
  return null;
}

function isSafe_(v) {
  return /^(safe|pass|yes|n\/a|public safe)$/i.test(String(v || '').trim());
}

function makeProofId_(jobId) {
  return 'PROOF-' + sanitizeId_(jobId) + '-' + shortId_();
}

function sanitizeId_(s) {
  return String(s || 'H38').replace(/[^A-Za-z0-9\-]/g, '-').substring(0, 80);
}

function shortId_() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
}

function now_() {
  return Utilities.formatDate(new Date(), H38_WEBAPP_CONFIG.TIMEZONE || Session.getScriptTimeZone(), 'yyyy-MM-dd H:mm:ss');
}

function getDashboard_() {
  var ss = getPortalSpreadsheet_();
  var sh = ss.getSheetByName('Dashboard');
  if (!sh) return [];
  return sh.getRange(1, 1, Math.min(12, sh.getLastRow()), Math.min(7, sh.getLastColumn())).getDisplayValues();
}

function getQueueSummary_() {
  var ss = getPortalSpreadsheet_();
  return H38_WEBAPP_CONFIG.QUEUES.map(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return { sheetName: name, status: 'HOLD', rows: 0 };
    return { sheetName: name, status: 'PASS', rows: Math.max(0, sh.getLastRow() - 1) };
  });
}

function searchRows_(sheetName, query, limit) {
  var data = h38WebAppGetQueue(sheetName);
  if (!query) return data.rows.slice(-Number(limit || 50));
  query = String(query).toLowerCase();
  return data.rows.filter(function(r) { return r.values.join(' ').toLowerCase().indexOf(query) !== -1; }).slice(-Number(limit || 50));
}

function updateDashboard_() {
  var ss = getPortalSpreadsheet_();
  var sh = ss.getSheetByName('Dashboard');
  if (!sh) return;
  var now = now_();
  var pending = countMatches_(['New Requests', 'Job Queue', 'Email Approval Queue', 'Quote Approval Queue', 'Follow-Up Queue', 'Output Queue', 'Social Approval Queue', 'Website Approval Queue'], /Rick Review Required|Owner Approval Required|Approved by Rick|Ready/i);
  var completedToday = countMatches_(['Proof Log'], new RegExp(now.substring(0, 10)));
  var readyToSend = countMatches_(['Email Approval Queue', 'Quote Approval Queue', 'Follow-Up Queue'], /APPROVE SEND|APPROVE QUOTE SEND|APPROVE FOLLOW-UP SEND/i);
  var readyDeliver = countMatches_(['Output Queue'], /Ready For Delivery Draft|APPROVE DELIVERY DRAFT ROUTING/i);
  var readySocial = countMatches_(['Social Approval Queue'], /Handoff Proof Logged|APPROVE SOCIAL HANDOFF|Ready/i);
  var readyWebsite = countMatches_(['Website Approval Queue'], /Proof Logged|APPROVE WEBSITE HANDOFF|Ready/i);
  var errors = Math.max(0, (ss.getSheetByName('Error Log') || { getLastRow: function(){return 1;} }).getLastRow() - 1);
  var rows = [
    ['Portal Area', 'Count / Status', 'Source Tab', 'Control Rule', 'Owner Action', 'Last Updated', 'Notes'],
    ['Pending', pending, 'All queues', 'Rick Review Required / Owner Approval Required', 'Review selected rows', now, 'Auto refreshed by private Web App.'],
    ['Completed Today', completedToday, 'Proof Log', 'Proof required', 'Review proof if needed', now, ''],
    ['Ready To Send', readyToSend, 'Email/Quote/Follow-Up', 'Rick approval required', 'Execute selected row only', now, 'No bulk send.'],
    ['Ready To Deliver', readyDeliver, 'Output Queue', 'Draft routing only', 'Route delivery draft', now, 'No auto delivery.'],
    ['Ready For Social', readySocial, 'Social Approval Queue', 'Handoff only', 'Prepare handoff', now, 'No auto publish.'],
    ['Ready For Website', readyWebsite, 'Website Approval Queue', 'Handoff only', 'Prepare handoff', now, 'No auto deploy.'],
    ['Errors', errors, 'Error Log', 'Block unsafe/uncertain actions', 'Resolve manually', now, '']
  ];
  sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function countMatches_(sheetNames, pattern) {
  var ss = getPortalSpreadsheet_();
  var total = 0;
  sheetNames.forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    var values = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getDisplayValues();
    values.forEach(function(r) { if (pattern.test(r.join(' '))) total++; });
  });
  return total;
}
