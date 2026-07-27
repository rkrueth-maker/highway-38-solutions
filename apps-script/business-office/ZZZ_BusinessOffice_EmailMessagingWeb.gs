/** Final Communications bindings — Email rows are evidence records; SMS actions remain SMS-only. */
var H38_EMAIL_WEB_BINDING_VERSION = '2026-07-27-email-communications-web-v1';

/** Final recent-sync override: Gmail search returns threads, so classify each message by its actual From header. */
function boEmailSyncRecent_(options) {
  options = options || {};
  var owner = boRequireOwner_();
  boAssertModuleEnabled_('messaging');
  h38TmRequireModule_('messaging', 'Edit');
  var sentLimit = Math.max(1, Math.min(Number(options.sentLimit) || 15, 50));
  var inboxLimit = Math.max(1, Math.min(Number(options.inboxLimit) || 15, 50));
  var results = [];
  results = results.concat(boEmailSyncThreads_(GmailApp.search('in:sent newer_than:30d', 0, sentLimit), '', sentLimit));
  results = results.concat(boEmailSyncThreads_(GmailApp.search('in:inbox newer_than:30d', 0, inboxLimit), '', inboxLimit));
  boGetProperties_().setProperty(H38_EMAIL_SYNC_LAST_PROPERTY, new Date().toISOString());
  boProof_('EMAIL SYNC', 'System', 'GMAIL-RECENT', 'PASS', 'Captured/reconciled ' + results.length + ' recent Gmail messages with per-message direction.', owner.Email);
  return { status: 'PASS', scope: 'recent', captured: results.length, results: results };
}

function h38PortalMessagingSyncEmail(options) {
  boAssertModuleEnabled_('messaging');
  h38TmRequireModule_('messaging', 'Edit');
  var user = boRequireOwner_();
  var scope = boNormalizeText_(options && options.scope || 'demo');
  var result = scope === 'recent' ? boEmailSyncRecent_(options || {}) : boEmailSyncDemoEvidence_();
  boProof_('COMMUNICATIONS EMAIL SYNC', 'System', boGetBusinessId_(), 'PASS', scope + '; captured=' + result.captured, user.Email);
  return result;
}

function h38PortalMessagingEmailStatus() {
  boAssertModuleEnabled_('messaging');
  h38TmRequireModule_('messaging', 'View');
  return boEmailSyncStatus_();
}

function h38PortalTaskMessagingSave(moduleKey, recordId, values) {
  if (moduleKey === 'messaging' && recordId) {
    var existing = h38TmFind_('MESSAGES', recordId);
    boAssert_(existing.Channel !== 'Email', 'Captured Gmail evidence is read-only. Open Gmail or the evidence document instead.');
  }
  h38TmValidateWebSave_(moduleKey, recordId || '', values || {});
  return h38TmSave_(moduleKey, recordId || '', values || {});
}

function h38PortalMessagingDecision(messageId, decision, notes) {
  var user = boGetCurrentUser_();
  boAssertModuleEnabled_('messaging');
  h38TmRequireModule_('messaging', 'Edit');
  var message = h38TmFind_('MESSAGES', messageId);
  h38TmRequireMessageAccess_(message, user, false);
  boAssert_(message.Channel === 'SMS', 'Email evidence does not use SMS approval controls.');
  if (boNormalizeText_(decision) === 'Approve') h38TmRequireDocumentedConsent_(message['Normalized Phone']);
  return h38TmApproveMessage_(messageId, decision, notes || '');
}

function h38PortalMessagingSend(messageId) {
  var user = boGetCurrentUser_();
  boAssertModuleEnabled_('messaging');
  h38TmRequireModule_('messaging', 'Edit');
  var message = h38TmFind_('MESSAGES', messageId);
  h38TmRequireMessageAccess_(message, user, false);
  boAssert_(message.Channel === 'SMS', 'Captured email cannot be released through the SMS provider.');
  h38TmRequireDocumentedConsent_(message['Normalized Phone']);
  return h38TmSendMessage_(messageId);
}

function h38PortalMessagingSyncStatus(messageId) {
  boAssertModuleEnabled_('messaging');
  h38TmRequireModule_('messaging', 'Edit');
  var message = h38TmFind_('MESSAGES', messageId);
  boAssert_(message.Channel === 'SMS', 'Gmail evidence status is synchronized through Email Sync.');
  return h38TmSyncMessageStatus_(messageId);
}
