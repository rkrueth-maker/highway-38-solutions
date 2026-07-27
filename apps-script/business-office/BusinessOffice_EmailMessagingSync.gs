/** Business Office — Gmail evidence capture, Communications rows, and idempotent backfill. */
var H38_EMAIL_SYNC_LAST_PROPERTY = 'H38_EMAIL_SYNC_LAST_AT';
var H38_EMAIL_DEMO_LABEL = 'H38 Business Office Demo Evidence';
var H38_EMAIL_MAX_CELL_BODY = 45000;
var H38_EMAIL_STARTUP_INTERVAL_MS = 5 * 60 * 1000;

function boEmailText_(value) {
  return String(value == null ? '' : value).trim();
}

function boEmailClip_(value, limit) {
  value = String(value == null ? '' : value);
  limit = Number(limit) || H38_EMAIL_MAX_CELL_BODY;
  return value.length > limit ? value.slice(0, limit - 30) + '\n[content shortened]' : value;
}

function boEmailAddress_(header) {
  if (typeof boAiAddressFromHeader_ === 'function') return boAiAddressFromHeader_(header);
  var match = String(header || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : '';
}

function boEmailGmailUrl_(threadId) {
  return threadId ? 'https://mail.google.com/mail/u/0/#all/' + encodeURIComponent(threadId) : '';
}

function boEmailFileName_(subject, providerMessageId) {
  var safe = String(subject || 'Email evidence')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
  return (safe || 'Email evidence') + ' — ' + providerMessageId + '.eml';
}

function boEmailExistingMessage_(providerMessageId) {
  return h38TmRead_('MESSAGES', { includeVoided: true }).find(function (row) {
    return row.Channel === 'Email' && row['Provider Message ID'] === providerMessageId;
  }) || null;
}

function boEmailExistingDocument_(providerMessageId) {
  return boReadTable_(H38_BO_SHEETS.DOCUMENTS, { includeVoided: true }).find(function (row) {
    return row['Source Type'] === 'Gmail' && row['Source ID'] === providerMessageId;
  }) || null;
}

function boEmailRecordOrNull_(sheetName, recordId) {
  if (!recordId) return null;
  return boReadTable_(sheetName, { includeVoided: true }).find(function (row) {
    var headers = boHeaders_(sheetName);
    return row[boPrimaryKeyHeader_(headers)] === recordId;
  }) || null;
}

function boEmailFirstByField_(sheetName, field, value) {
  if (!value) return null;
  return boReadTable_(sheetName, { includeVoided: true }).find(function (row) {
    return row[field] === value;
  }) || null;
}

function boEmailFirstByPrefix_(sheetName, prefix) {
  var headers = boHeaders_(sheetName), key = boPrimaryKeyHeader_(headers);
  return boReadTable_(sheetName, { includeVoided: true }).find(function (row) {
    return String(row[key] || '').indexOf(prefix) === 0;
  }) || null;
}

function boEmailProjectKey_(text) {
  text = String(text || '').toLowerCase();
  var map = [
    ['FLOWER', /flower garden/],
    ['DRIVE', /class 5 driveway|driveway/],
    ['POND', /backyard pond|\bpond\b/],
    ['CLEAR', /lot clearing|clearing/],
    ['DECK', /pressure-treated deck|\bdeck\b/],
    ['IRR', /irrigation/],
    ['KIT', /kitchen remodel|\bkitchen\b/]
  ];
  var found = map.find(function (item) { return item[1].test(text); });
  return found ? found[0] : '';
}

function boEmailResolveLinks_(spec) {
  spec = spec || {};
  var context = spec.linkContext || {}, text = [spec.subject, spec.body, spec.raw].join('\n');
  var links = {
    customerId: boEmailText_(spec.customerId),
    requestId: boEmailText_(spec.requestId),
    quoteId: boEmailText_(spec.quoteId),
    workOrderId: boEmailText_(spec.workOrderId),
    jobId: boEmailText_(spec.jobId),
    invoiceId: boEmailText_(spec.invoiceId),
    paymentId: boEmailText_(spec.paymentId),
    linkedRecordType: boEmailText_(context.recordType || spec.linkedRecordType),
    linkedRecordId: boEmailText_(context.recordId || spec.linkedRecordId)
  };
  var patterns = {
    customerId: /\b(H38-DEMO7-[A-Z]+-CUSTOMER-[A-Z0-9-]+)\b/,
    requestId: /\b(H38-DEMO7-[A-Z]+-REQUEST-[A-Z0-9-]+)\b/,
    quoteId: /\b(H38-DEMO7-[A-Z]+-QUOTE-[A-Z0-9-]+)\b/,
    workOrderId: /\b(H38-DEMO7-[A-Z]+-(?:WORK-ORDER|WO)-[A-Z0-9-]+)\b/,
    jobId: /\b(H38-DEMO7-[A-Z]+-JOB-[A-Z0-9-]+)\b/,
    invoiceId: /\b(H38-DEMO7-[A-Z]+-INVOICE-[A-Z0-9-]+)\b/,
    paymentId: /\b(H38-DEMO7-[A-Z]+-PAYMENT-[A-Z0-9-]+)\b/
  };
  Object.keys(patterns).forEach(function (field) {
    var match = text.match(patterns[field]);
    if (!links[field] && match) links[field] = match[1];
  });

  var projectKey = boEmailProjectKey_(text);
  if (projectKey) {
    var prefix = 'H38-DEMO7-' + projectKey + '-';
    var candidates = [
      ['customerId', H38_BO_SHEETS.CUSTOMERS],
      ['requestId', H38_BO_SHEETS.REQUESTS],
      ['quoteId', H38_BO_SHEETS.QUOTES],
      ['workOrderId', H38_BO_SHEETS.WORK_ORDERS],
      ['jobId', H38_BO_SHEETS.JOBS],
      ['invoiceId', H38_BO_SHEETS.INVOICES],
      ['paymentId', H38_BO_SHEETS.PAYMENTS]
    ];
    candidates.forEach(function (item) {
      if (!links[item[0]]) {
        var row = boEmailFirstByPrefix_(item[1], prefix);
        if (row) links[item[0]] = row[boPrimaryKeyHeader_(boHeaders_(item[1]))];
      }
    });
  }

  var quote = links.quoteId ? boEmailRecordOrNull_(H38_BO_SHEETS.QUOTES, links.quoteId) : null;
  if (quote) {
    links.customerId = links.customerId || quote['Customer ID'] || '';
    var workOrder = boEmailFirstByField_(H38_BO_SHEETS.WORK_ORDERS, 'Quote ID', links.quoteId);
    var job = boEmailFirstByField_(H38_BO_SHEETS.JOBS, 'Quote ID', links.quoteId);
    var invoice = boEmailFirstByField_(H38_BO_SHEETS.INVOICES, 'Quote ID', links.quoteId);
    links.workOrderId = links.workOrderId || (workOrder && workOrder['Work Order ID']) || '';
    links.jobId = links.jobId || (job && job['Job ID']) || '';
    links.invoiceId = links.invoiceId || (invoice && invoice['Invoice ID']) || '';
  }
  var jobRow = links.jobId ? boEmailRecordOrNull_(H38_BO_SHEETS.JOBS, links.jobId) : null;
  if (jobRow) {
    links.customerId = links.customerId || jobRow['Customer ID'] || '';
    links.quoteId = links.quoteId || jobRow['Quote ID'] || '';
    links.workOrderId = links.workOrderId || jobRow['Work Order ID'] || '';
    var jobInvoice = boEmailFirstByField_(H38_BO_SHEETS.INVOICES, 'Job ID', links.jobId);
    links.invoiceId = links.invoiceId || (jobInvoice && jobInvoice['Invoice ID']) || '';
  }
  var invoiceRow = links.invoiceId ? boEmailRecordOrNull_(H38_BO_SHEETS.INVOICES, links.invoiceId) : null;
  if (invoiceRow) {
    links.customerId = links.customerId || invoiceRow['Customer ID'] || '';
    links.jobId = links.jobId || invoiceRow['Job ID'] || '';
    links.quoteId = links.quoteId || invoiceRow['Quote ID'] || '';
    var payment = boEmailFirstByField_(H38_BO_SHEETS.PAYMENTS, 'Invoice ID', links.invoiceId);
    links.paymentId = links.paymentId || (payment && payment['Payment ID']) || '';
  }
  if (!links.customerId) {
    var counterparty = String(spec.direction) === 'Outbound' ? boEmailAddress_(spec.to) : boEmailAddress_(spec.from);
    var customer = boReadTable_(H38_BO_SHEETS.CUSTOMERS, { includeVoided: true }).find(function (row) {
      return String(row.Email || '').toLowerCase() === String(counterparty || '').toLowerCase();
    });
    links.customerId = customer ? customer['Customer ID'] : '';
  }

  var typeMap = {
    Customer: links.customerId,
    Request: links.requestId,
    Quote: links.quoteId,
    'Work Order': links.workOrderId,
    Job: links.jobId,
    Invoice: links.invoiceId,
    Payment: links.paymentId
  };
  if (!links.linkedRecordId || !typeMap[links.linkedRecordType]) {
    var preference = ['Quote', 'Job', 'Invoice', 'Request', 'Customer', 'Payment', 'Work Order'];
    var selected = preference.find(function (type) { return !!typeMap[type]; });
    links.linkedRecordType = selected || '';
    links.linkedRecordId = selected ? typeMap[selected] : '';
  }
  return links;
}

function boEmailEvidenceDocument_(spec) {
  var existing = boEmailExistingDocument_(spec.providerMessageId);
  if (existing) return { document: existing, duplicatePrevented: true };
  var raw = String(spec.raw || '');
  if (!raw) {
    raw = [
      'From: ' + boEmailText_(spec.from),
      'To: ' + boEmailText_(spec.to),
      'Cc: ' + boEmailText_(spec.cc),
      'Bcc: ' + boEmailText_(spec.bcc),
      'Subject: ' + boEmailText_(spec.subject),
      'Date: ' + boEmailText_(spec.dateIso),
      'X-Gmail-Message-ID: ' + boEmailText_(spec.providerMessageId),
      'X-Gmail-Thread-ID: ' + boEmailText_(spec.threadId),
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      String(spec.body || '')
    ].join('\r\n');
  }
  var blob = Utilities.newBlob(raw, 'message/rfc822', boEmailFileName_(spec.subject, spec.providerMessageId));
  var folder = DriveApp.getFolderById(boGetFolderId_(H38_BO.DOCUMENT_FOLDER_PROPERTY));
  var file = folder.createFile(blob);
  try {
    var doc = boAppendRecord_(H38_BO_SHEETS.DOCUMENTS, {
      'Document ID': 'EMAIL-DOC-' + spec.providerMessageId,
      'File ID': file.getId(),
      'File URL': file.getUrl(),
      'File Name': file.getName(),
      'MIME Type': 'message/rfc822',
      'Size Bytes': blob.getBytes().length,
      SHA256: h38TmHash_(raw),
      'Source Type': 'Gmail',
      'Source ID': spec.providerMessageId,
      'Document Type': 'Email Evidence',
      'Original File ID': file.getId(),
      'Preview File ID': '',
      'Upload State': 'Approved',
      'OCR State': 'Not Required',
      'Review Status': 'Approved',
      'Approval Status': 'Approved',
      'Posted Status': 'Posted',
      'Export Status': 'Not Exported',
      'Duplicate Key': 'GMAIL|' + spec.providerMessageId,
      'Is Original': 'Yes',
      'Is Voided': 'No',
      'Access Classification': 'Private Customer',
      'Uploaded By': spec.user['User ID'],
      'Uploaded Time': spec.officeTime
    }, 'Gmail evidence capture');
    return { document: doc, duplicatePrevented: false };
  } catch (error) {
    try { file.setTrashed(true); } catch (ignored) {}
    throw error;
  }
}

function boEmailMessageEvent_(message, eventType, evidence, user) {
  var existing = h38TmRead_('MESSAGE_EVENTS', { includeVoided: true }).find(function (row) {
    return row['Message ID'] === message['Message ID'] && row['Event Type'] === eventType && row['Provider Message ID'] === message['Provider Message ID'];
  });
  if (existing) return existing;
  return h38TmAppend_('MESSAGE_EVENTS', {
    'Message ID': message['Message ID'],
    'Event Type': eventType,
    'Provider Status': message['Provider Status'],
    'Provider Message ID': message['Provider Message ID'],
    Result: 'PASS',
    Evidence: evidence,
    'Actor User ID': user['User ID'],
    'Actor Email': user.Email,
    'Event Time': h38TmNow_()
  });
}

function boEmailUpsert_(spec) {
  spec = spec || {};
  boAssert_(spec.providerMessageId, 'Gmail message ID is required for Communications capture.');
  h38TmEnsureSchema_();
  var existing = boEmailExistingMessage_(spec.providerMessageId);
  if (existing && existing['Document ID']) return { message: existing, duplicatePrevented: true };
  var user = spec.user || boGetCurrentUser_();
  var links = boEmailResolveLinks_(spec);
  var evidence = boEmailEvidenceDocument_(Object.assign({}, spec, { user: user }));
  var documentId = evidence.document['Document ID'];
  if (!links.linkedRecordId) {
    links.linkedRecordType = 'Document';
    links.linkedRecordId = documentId;
  }
  var outbound = spec.direction === 'Outbound';
  var notes = [
    'Subject: ' + boEmailText_(spec.subject),
    boEmailGmailUrl_(spec.threadId) ? 'Gmail: ' + boEmailGmailUrl_(spec.threadId) : '',
    spec.internetMessageId ? 'Internet Message-ID: ' + spec.internetMessageId : '',
    'Evidence document: ' + documentId
  ].filter(Boolean).join(' | ');
  var values = {
    'Message ID': existing ? existing['Message ID'] : 'EMAIL-' + spec.providerMessageId,
    Direction: spec.direction,
    Channel: 'Email',
    Provider: 'Gmail',
    'Provider Message ID': spec.providerMessageId,
    'Conversation Key': spec.threadId,
    'Customer ID': links.customerId,
    'Phone Number': '',
    'Normalized Phone': '',
    'Message Body': boEmailClip_(spec.body),
    'Template ID': '',
    Status: outbound ? 'Sent' : 'Received',
    'Approval Status': outbound ? 'Approved' : 'Not Required',
    'Send Allowed': 'No',
    'Approved By User ID': outbound ? user['User ID'] : '',
    'Approved By Email': outbound ? user.Email : '',
    'Approved Time': outbound ? spec.officeTime : '',
    'Sent Time': outbound ? spec.officeTime : '',
    'Delivered Time': '',
    'Failed Time': '',
    'Received Time': outbound ? '' : spec.officeTime,
    'Opted Out Time': '',
    'Linked Record Type': links.linkedRecordType,
    'Linked Record ID': links.linkedRecordId,
    'Task ID': '',
    'Request ID': links.requestId,
    'Quote ID': links.quoteId,
    'Work Order ID': links.workOrderId,
    'Job ID': links.jobId,
    'Invoice ID': links.invoiceId,
    'Payment ID': links.paymentId,
    'Document ID': documentId,
    'Consent ID': '',
    'Duplicate Key': 'GMAIL|' + spec.providerMessageId,
    'Retry Locked': 'Yes',
    'Provider Status': outbound ? 'Sent' : 'Received',
    'Provider Error Code': '',
    'Provider Error Message': '',
    'Provider Price': '',
    'Provider Price Unit': '',
    'Created By User ID': user['User ID'],
    'Created Time': spec.officeTime,
    Notes: notes,
    'Is Voided': 'No'
  };
  var saved = existing
    ? h38TmUpdate_('MESSAGES', existing['Message ID'], values)
    : h38TmAppend_('MESSAGES', values);
  var eventType = outbound ? 'EMAIL_SENT_CAPTURED' : 'EMAIL_RECEIVED_CAPTURED';
  var eventEvidence = 'Gmail message ' + spec.providerMessageId + '; document ' + documentId + '; ' + boEmailGmailUrl_(spec.threadId);
  boEmailMessageEvent_(saved, eventType, eventEvidence, user);
  if (!existing) boProof_('EMAIL CAPTURE', 'Message', saved['Message ID'], 'PASS', eventEvidence, user.Email);
  return { message: saved, document: evidence.document, duplicatePrevented: !!existing };
}

function boEmailMessageSpec_(message, direction, linkContext) {
  var date = message.getDate(), threadId = message.getThread().getId(), raw = '';
  try { raw = message.getRawContent(); } catch (error) { raw = ''; }
  return {
    providerMessageId: message.getId(),
    threadId: threadId,
    internetMessageId: boEmailText_(message.getHeader('Message-ID')),
    direction: direction,
    from: message.getFrom(),
    to: message.getTo(),
    cc: message.getCc(),
    bcc: message.getBcc(),
    subject: message.getSubject(),
    body: message.getPlainBody(),
    raw: raw,
    dateIso: date.toISOString(),
    officeTime: Utilities.formatDate(date, boTimeZone_(), 'yyyy-MM-dd HH:mm:ss'),
    linkContext: linkContext || {},
    user: boGetCurrentUser_()
  };
}

function boEmailDirection_(message, user) {
  var from = boEmailAddress_(message.getFrom()).toLowerCase();
  var owner = String(user.Email || '').toLowerCase();
  return from && owner && from === owner ? 'Outbound' : 'Inbound';
}

function boEmailCaptureGmailMessage_(message, direction, linkContext) {
  var user = boGetCurrentUser_();
  return boEmailUpsert_(boEmailMessageSpec_(message, direction || boEmailDirection_(message, user), linkContext));
}

function boEmailCaptureSentActionSafe_(payload, gmailResult) {
  try {
    var message = null;
    if (gmailResult && gmailResult.id) {
      for (var attempt = 0; attempt < 3 && !message; attempt += 1) {
        try { message = GmailApp.getMessageById(gmailResult.id); } catch (error) {}
        if (!message && attempt < 2) Utilities.sleep(400);
      }
    }
    if (message) return Object.assign({ status: 'PASS' }, boEmailCaptureGmailMessage_(message, 'Outbound', payload.linkContext || {}));
    var now = new Date(), user = boGetCurrentUser_();
    return Object.assign({ status: 'PASS' }, boEmailUpsert_({
      providerMessageId: gmailResult.id,
      threadId: gmailResult.threadId || payload.threadId || '',
      internetMessageId: '',
      direction: 'Outbound',
      from: user.Email,
      to: payload.to,
      cc: '',
      bcc: '',
      subject: payload.subject,
      body: payload.body,
      raw: gmailResult.rawMime || '',
      dateIso: now.toISOString(),
      officeTime: Utilities.formatDate(now, boTimeZone_(), 'yyyy-MM-dd HH:mm:ss'),
      linkContext: payload.linkContext || {},
      user: user
    }));
  } catch (error) {
    boError_('Gmail Communications capture', 'Message', gmailResult && gmailResult.id || '', error, 'Error');
    boProof_('EMAIL CAPTURE', 'Message', gmailResult && gmailResult.id || 'unknown', 'FAIL', String(error && error.message || error), boGetActiveEmail_());
    return { status: 'HOLD', error: String(error && error.message || error), message: null, document: null };
  }
}

function boEmailSyncThreads_(threads, direction, limit) {
  var results = [], seen = {}, max = Math.max(1, Math.min(Number(limit) || 25, 100));
  (threads || []).forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      if (results.length >= max || seen[message.getId()]) return;
      seen[message.getId()] = true;
      var existing = boEmailExistingMessage_(message.getId());
      if (existing && existing['Document ID']) {
        results.push({ messageId: existing['Message ID'], providerMessageId: message.getId(), duplicatePrevented: true });
        return;
      }
      var captured = boEmailCaptureGmailMessage_(message, direction || '', {});
      results.push({
        messageId: captured.message['Message ID'],
        documentId: captured.message['Document ID'],
        providerMessageId: message.getId(),
        duplicatePrevented: captured.duplicatePrevented
      });
    });
  });
  return results;
}

function boEmailSyncDemoEvidence_() {
  var owner = boRequireOwner_();
  boAssertModuleEnabled_('messaging');
  h38TmRequireModule_('messaging', 'Edit');
  var threads = GmailApp.search('label:"' + H38_EMAIL_DEMO_LABEL + '" newer_than:90d', 0, 50);
  if (!threads.length) threads = GmailApp.search('newer_than:90d (subject:"H38 BUSINESS OFFICE DEMO" OR subject:"H38 FULL BUSINESS OFFICE DEMO")', 0, 50);
  var results = boEmailSyncThreads_(threads, '', 100);
  boGetProperties_().setProperty(H38_EMAIL_SYNC_LAST_PROPERTY, new Date().toISOString());
  boProof_('EMAIL SYNC', 'System', 'GMAIL-DEMO-EVIDENCE', 'PASS', 'Captured ' + results.length + ' labeled demo messages into Communications.', owner.Email);
  return { status: 'PASS', scope: 'demo-evidence', captured: results.length, results: results };
}

function boEmailSyncRecent_(options) {
  options = options || {};
  var owner = boRequireOwner_();
  boAssertModuleEnabled_('messaging');
  h38TmRequireModule_('messaging', 'Edit');
  var sentLimit = Math.max(1, Math.min(Number(options.sentLimit) || 15, 50));
  var inboxLimit = Math.max(1, Math.min(Number(options.inboxLimit) || 15, 50));
  var results = [];
  results = results.concat(boEmailSyncThreads_(GmailApp.search('in:sent newer_than:30d', 0, sentLimit), 'Outbound', sentLimit));
  results = results.concat(boEmailSyncThreads_(GmailApp.search('in:inbox newer_than:30d', 0, inboxLimit), 'Inbound', inboxLimit));
  boGetProperties_().setProperty(H38_EMAIL_SYNC_LAST_PROPERTY, new Date().toISOString());
  boProof_('EMAIL SYNC', 'System', 'GMAIL-RECENT', 'PASS', 'Captured/reconciled ' + results.length + ' recent Gmail messages.', owner.Email);
  return { status: 'PASS', scope: 'recent', captured: results.length, results: results };
}

function boEmailSyncStartupSafe_() {
  try {
    var user = boGetCurrentUser_();
    if (h38TmUserRole_(user) !== 'Owner') return { status: 'SKIPPED', reason: 'Owner mailbox sync is owner-only.' };
    var last = Date.parse(boGetProperties_().getProperty(H38_EMAIL_SYNC_LAST_PROPERTY) || '');
    var demoCount = h38TmRead_('MESSAGES', { includeVoided: true }).filter(function (row) {
      return row.Channel === 'Email' && String(row.Notes || '').indexOf('H38 BUSINESS OFFICE DEMO') >= 0;
    }).length;
    if (demoCount >= 10 && Number.isFinite(last) && Date.now() - last < H38_EMAIL_STARTUP_INTERVAL_MS) {
      return { status: 'PASS', skipped: true, demoCount: demoCount, lastSyncAt: new Date(last).toISOString() };
    }
    var demo = boEmailSyncDemoEvidence_();
    return { status: 'PASS', skipped: false, demoCount: demo.captured, lastSyncAt: boGetProperties_().getProperty(H38_EMAIL_SYNC_LAST_PROPERTY) };
  } catch (error) {
    boError_('Startup Gmail Communications sync', 'System', boGetBusinessId_(), error, 'Warning');
    return { status: 'HOLD', error: String(error && error.message || error), externalActionOccurred: false };
  }
}

function boEmailSyncStatus_() {
  var user = boGetCurrentUser_();
  var rows = h38TmRead_('MESSAGES', { includeVoided: true }).filter(function (row) { return row.Channel === 'Email'; });
  return {
    status: 'PASS',
    ownerOnly: true,
    canSync: h38TmUserRole_(user) === 'Owner',
    emailMessages: rows.length,
    demoMessages: rows.filter(function (row) { return String(row.Notes || '').indexOf('H38 BUSINESS OFFICE DEMO') >= 0; }).length,
    lastSyncAt: boGetProperties_().getProperty(H38_EMAIL_SYNC_LAST_PROPERTY) || '',
    evidenceFilesRequired: true,
    duplicateProtection: 'Provider Message ID and GMAIL duplicate key'
  };
}
