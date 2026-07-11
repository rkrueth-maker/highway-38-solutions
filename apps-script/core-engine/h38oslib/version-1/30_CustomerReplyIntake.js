 /************************************************************
 * H38 V6 - Customer Reply Intake Module
 *
 * Manual/menu-run only.
 * No automatic customer response.
 * No payment request.
 * No final output delivery.
 * No website/social publishing.
 * No triggers.
 *
 * Add this menu item inside the existing onOpen() menu chain:
 *
 * .addSeparator()
 * .addItem('Check Customer Replies', 'h38CheckCustomerReplies')
 ************************************************************/

const H38_REPLY_MODULE = {
  EMAIL_SHEET: 'Email Approval Queue',
  FOLLOWUP_SHEET: 'Follow-Up Queue',
  QUOTE_SHEET: 'Quote Approval Queue',
  JOB_SHEET: 'Job Queue',
  PROOF_SHEET: 'Proof Log',
  ERROR_SHEET: 'Error Log',
  SEARCH_DAYS: 30,
  TIMEZONE: Session.getScriptTimeZone() || 'America/Chicago'
};

function h38CheckCustomerReplies() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const emailSheet = ss.getSheetByName(H38_REPLY_MODULE.EMAIL_SHEET);
  let checked = 0;
  let processed = 0;
  let skipped = 0;

  try {
    if (!emailSheet) throw new Error('Email Approval Queue sheet not found.');

    const emailRows = h38ReplyGetSheetObjects_(emailSheet);

    for (let i = 0; i < emailRows.length; i++) {
      const rowObj = emailRows[i];
      const jobId = h38ReplyText_(rowObj['Job ID']);
      const subject = h38ReplyText_(rowObj['Subject']);
      const sentTime = h38ReplyText_(rowObj['Sent Time']);
      const sendAllowed = h38ReplyUpper_(rowObj['Send Allowed']);

      if (!jobId || !subject || !sentTime) {
        skipped++;
        continue;
      }

      if (sendAllowed.indexOf('SENT') < 0 || sendAllowed.indexOf('LOCKED') < 0) {
        skipped++;
        continue;
      }

      checked++;

      const reply = h38ReplyFindLatestUnprocessedReply_(ss, rowObj);
      if (!reply) continue;

      h38ReplyRouteReply_(ss, emailSheet, rowObj.__rowNumber, rowObj, reply);
      processed++;
    }

    SpreadsheetApp.getUi().alert(
      'H38 reply intake complete.\n\n' +
      'Sent rows checked: ' + checked + '\n' +
      'Replies routed: ' + processed + '\n' +
      'Rows skipped: ' + skipped + '\n\n' +
      'No customer emails sent. No payment requested. No final delivery. No publish.'
    );
  } catch (err) {
    h38ReplyAppendError_(ss, {
      jobId: 'H38-V6-REPLY-INTAKE',
      sourceTab: H38_REPLY_MODULE.EMAIL_SHEET,
      errorType: 'Reply intake module failure',
      severity: 'High',
      description: h38ReplyErrorMessage_(err),
      blockedAction: 'Customer reply intake scan',
      proofLogId: '',
      notes: 'No customer response, payment, final delivery, or publish was performed.'
    });
    SpreadsheetApp.getUi().alert('H38 reply intake blocked: ' + h38ReplyErrorMessage_(err));
  }
}

function h38ReplyFindLatestUnprocessedReply_(ss, emailRow) {
  const subject = h38ReplyText_(emailRow['Subject']);
  const jobId = h38ReplyText_(emailRow['Job ID']);
  const sentDate = h38ReplyParseDate_(emailRow['Sent Time']);
  const knownSentMessageId = h38ReplyExtractMessageIdFromRow_(emailRow);

  if (!subject || !sentDate) return null;

  const query = 'subject:"' + h38ReplyEscapeGmailQuery_(subject) + '" newer_than:' + H38_REPLY_MODULE.SEARCH_DAYS + 'd -in:drafts';
  const threads = GmailApp.search(query, 0, 10);
  const candidates = [];

  for (let t = 0; t < threads.length; t++) {
    const messages = threads[t].getMessages();

    for (let m = 0; m < messages.length; m++) {
      const msg = messages[m];
      const msgId = msg.getId();
      const msgDate = msg.getDate();

      if (!msgDate || msgDate.getTime() <= sentDate.getTime()) continue;
      if (knownSentMessageId && msgId === knownSentMessageId) continue;
      if (h38ReplyMessageAlreadyLogged_(ss, msgId)) continue;

      const body = h38ReplySafeBody_(msg);
      if (!body) continue;

      candidates.push({
        jobId: jobId,
        messageId: msgId,
        threadId: threads[t].getId(),
        date: msgDate,
        from: msg.getFrom(),
        to: msg.getTo(),
        subject: msg.getSubject(),
        body: body,
        snippet: h38ReplySnippet_(body),
        classification: h38ReplyClassify_(body)
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort(function(a, b) {
    return b.date.getTime() - a.date.getTime();
  });

  return candidates[0];
}

function h38ReplyRouteReply_(ss, emailSheet, emailRowNumber, emailRow, reply) {
  const now = h38ReplyNow_();
  const jobId = h38ReplyText_(emailRow['Job ID']);
  const proofId = 'PROOF-REPLY-' + h38ReplyCleanId_(jobId) + '-' + h38ReplyShortId_();
  const classification = reply.classification.type;
  const label = reply.classification.label;
  const recommendation = reply.classification.nextAction;

  h38ReplyAppendFollowUp_(ss, {
    'Follow-Up ID': 'FOLLOWUP-REPLY-' + h38ReplyCleanId_(jobId) + '-' + h38ReplyShortId_(),
    'Job ID': jobId,
    'Contact / Channel': reply.from,
    'Follow-Up Type': 'Customer reply received - ' + label,
    'Due Date': now,
    'Draft Link': '',
    'Last Touch': now + ' / Gmail message ' + reply.messageId,
    'Approval Status': 'Rick Review Required / Owner Approval Required',
    'Rick Decision': '',
    'Send Allowed': 'No',
    'Proof Log ID': proofId,
    'Next Action': recommendation,
    'Notes': 'Reply summary: ' + reply.snippet
  });

  h38ReplyUpdateQuoteQueue_(ss, jobId, label, recommendation, proofId, reply);
  h38ReplyUpdateJobQueue_(ss, jobId, label, recommendation, proofId, reply);

  h38ReplySetRowByHeaders_(emailSheet, emailRowNumber, {
    'Next Action': recommendation,
    'Notes': h38ReplyAppendNote_(h38ReplyText_(emailRow['Notes']), 'Reply intake: ' + label + '. Gmail message ' + reply.messageId)
  });

  h38ReplyAppendProof_(ss, {
    'Proof ID': proofId,
    'Timestamp': now,
    'Job ID': jobId,
    'Queue Tab': 'Gmail / Follow-Up Queue',
    'Action Type': 'Customer reply intake classification',
    'Approval Status Before': h38ReplyText_(emailRow['Approval Status']),
    'Rick Decision': 'REPLY CLASSIFIED - ' + classification,
    'Approved By': 'Apps Script Reply Intake Module',
    'Evidence Link': 'Gmail message ID: ' + reply.messageId + ' / Thread ID: ' + reply.threadId,
    'Output / Message Link': 'No outbound message created',
    'Recipient / Channel': reply.from,
    'Public Safe Check': 'N/A',
    'Private Data Check': h38ReplyText_(emailRow['Contains Customer Data']) || 'Review recorded',
    'Result': 'PASS - Reply routed for Rick review',
    'Created By': 'Apps Script Reply Intake Module',
    'Notes': 'Classification: ' + label + '. No automatic response, payment, final delivery, or publish.'
  });
}

function h38ReplyClassify_(body) {
  const text = h38ReplyUpper_(body);

  if (h38ReplyRegex_(text, ['\\bNO\\b', 'DECLINE', 'NOT INTERESTED', 'CANCEL', '\\bPASS\\b', 'DO NOT', 'STOP'])) {
    return {
      type: 'DECLINED',
      label: 'Declined / stop / not interested',
      nextAction: 'Rick reviews decline and decides whether to close the job or draft a polite closeout.'
    };
  }

  if (h38ReplyRegex_(text, ['CHANGE', 'REVISE', 'REVISION', 'EDIT', 'DIFFERENT', 'INSTEAD', 'ADD ', 'REMOVE', 'UPDATE', 'CAN YOU', 'COULD YOU'])) {
    return {
      type: 'CHANGES_REQUESTED',
      label: 'Changes requested',
      nextAction: 'Rick reviews requested changes and decides whether to revise scope, quote, or draft a response.'
    };
  }

  if (h38ReplyRegex_(text, ['APPROVE', 'APPROVED', '\\bYES\\b', 'GO AHEAD', 'SOUNDS GOOD', '\\bOK\\b', 'OKAY', 'ACCEPT', 'ACCEPTED', 'CONFIRM', 'PROCEED'])) {
    return {
      type: 'CONFIRMED',
      label: 'Confirmed / approved by customer',
      nextAction: 'Rick reviews confirmation. Do not request payment or start work until Rick approves the next action.'
    };
  }

  if (text.indexOf('?') >= 0 || h38ReplyRegex_(text, ['QUESTION', '\\bHOW\\b', '\\bWHAT\\b', '\\bWHEN\\b', '\\bWHERE\\b', '\\bWHY\\b', 'COST', 'PRICE', 'PAYMENT', 'TIMELINE', 'DUE'])) {
    return {
      type: 'QUESTION',
      label: 'Question / unclear next step',
      nextAction: 'Rick reviews the question and drafts a response if needed.'
    };
  }

  return {
    type: 'UNCLEAR',
    label: 'Unclear reply',
    nextAction: 'Rick reviews the reply and classifies the next action manually.'
  };
}

function h38ReplyAppendFollowUp_(ss, map) {
  const sheet = ss.getSheetByName(H38_REPLY_MODULE.FOLLOWUP_SHEET);
  if (!sheet) throw new Error('Follow-Up Queue sheet not found.');
  h38ReplyAppendByHeaders_(sheet, map);
}

function h38ReplyUpdateQuoteQueue_(ss, jobId, label, recommendation, proofId, reply) {
  const sheet = ss.getSheetByName(H38_REPLY_MODULE.QUOTE_SHEET);
  if (!sheet) return;
  const row = h38ReplyFindRowByValue_(sheet, 'Job ID', jobId);
  if (!row) return;

  h38ReplySetRowByHeaders_(sheet, row, {
    'Approval Status': 'Rick Review Required / Owner Approval Required',
    'Rick Decision': 'CUSTOMER REPLY - ' + label,
    'Send Allowed': 'No',
    'Proof Log ID': proofId,
    'Next Action': recommendation,
    'Notes': 'Latest reply message ' + reply.messageId + ': ' + reply.snippet
  });
}

function h38ReplyUpdateJobQueue_(ss, jobId, label, recommendation, proofId, reply) {
  const sheet = ss.getSheetByName(H38_REPLY_MODULE.JOB_SHEET);
  if (!sheet) return;
  const row = h38ReplyFindRowByValue_(sheet, 'Job ID', jobId);
  if (!row) return;

  h38ReplySetRowByHeaders_(sheet, row, {
    'Workflow Stage': 'Customer replied',
    'Work Status': 'Rick review required',
    'Approval Status': 'Rick Review Required / Owner Approval Required',
    'Rick Decision': 'CUSTOMER REPLY - ' + label,
    'Blocker': 'Owner review before next action',
    'Next Action': recommendation,
    'Updated At': h38ReplyNow_(),
    'Notes': 'Reply routed by intake module. Message ' + reply.messageId + '. Proof ' + proofId + '.'
  });
}

function h38ReplyAppendProof_(ss, map) {
  const sheet = ss.getSheetByName(H38_REPLY_MODULE.PROOF_SHEET);
  if (!sheet) throw new Error('Proof Log sheet not found.');
  h38ReplyAppendByHeaders_(sheet, map);
}

function h38ReplyAppendError_(ss, error) {
  const sheet = ss.getSheetByName(H38_REPLY_MODULE.ERROR_SHEET);
  if (!sheet) return;

  h38ReplyAppendByHeaders_(sheet, {
    'Error ID': 'ERR-REPLY-' + h38ReplyCleanId_(error.jobId) + '-' + h38ReplyShortId_(),
    'Timestamp': h38ReplyNow_(),
    'Source Tab': error.sourceTab,
    'Job ID': error.jobId,
    'Error Type': error.errorType,
    'Severity': error.severity,
    'Description': error.description,
    'Blocked Action': error.blockedAction,
    'Owner Review Needed': 'Yes',
    'Resolution Status': 'Open',
    'Fixed By': '',
    'Fixed Time': '',
    'Proof Log ID': error.proofLogId || '',
    'Notes': error.notes || ''
  });
}

function h38ReplyMessageAlreadyLogged_(ss, messageId) {
  const proofSheet = ss.getSheetByName(H38_REPLY_MODULE.PROOF_SHEET);
  if (!proofSheet || !messageId) return false;

  const values = proofSheet.getDataRange().getValues();
  const needle = String(messageId);

  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      if (String(values[r][c] || '').indexOf(needle) >= 0) return true;
    }
  }
  return false;
}

function h38ReplyExtractMessageIdFromRow_(rowObj) {
  const parts = [
    h38ReplyText_(rowObj['Gmail Draft Reference']),
    h38ReplyText_(rowObj['Proof Log ID']),
    h38ReplyText_(rowObj['Notes'])
  ].join(' ');

  const matches = parts.match(/\b[0-9a-f]{12,30}\b/gi);
  if (!matches || matches.length === 0) return '';
  return matches[matches.length - 1];
}

function h38ReplyGetSheetObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(function(h) { return String(h || '').trim(); });
  const rows = [];

  for (let r = 1; r < values.length; r++) {
    const obj = { __rowNumber: r + 1 };
    let hasAny = false;

    for (let c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      obj[headers[c]] = values[r][c];
      if (values[r][c] !== '' && values[r][c] !== null) hasAny = true;
    }

    if (hasAny) rows.push(obj);
  }

  return rows;
}

function h38ReplyAppendByHeaders_(sheet, map) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) {
    return String(h || '').trim();
  });
  const row = headers.map(function(header) {
    return map[header] === undefined ? '' : map[header];
  });
  sheet.appendRow(row);
}

function h38ReplySetRowByHeaders_(sheet, rowNumber, map) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) {
    return String(h || '').trim();
  });
  Object.keys(map).forEach(function(header) {
    const col = headers.indexOf(header) + 1;
    if (col > 0) sheet.getRange(rowNumber, col).setValue(map[header]);
  });
}

function h38ReplyFindRowByValue_(sheet, headerName, value) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0].map(function(h) { return String(h || '').trim(); });
  const col = headers.indexOf(headerName);
  if (col < 0) return null;

  for (let r = 1; r < values.length; r++) {
    if (String(values[r][col] || '').trim() === String(value || '').trim()) return r + 1;
  }
  return null;
}

function h38ReplyRegex_(text, patterns) {
  for (let i = 0; i < patterns.length; i++) {
    const re = new RegExp(patterns[i], 'i');
    if (re.test(text)) return true;
  }
  return false;
}

function h38ReplySafeBody_(msg) {
  try {
    return msg.getPlainBody() || '';
  } catch (err) {
    try {
      return msg.getBody().replace(/<[^>]*>/g, ' ') || '';
    } catch (err2) {
      return '';
    }
  }
}

function h38ReplyParseDate_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  const parsed = new Date(String(value));
  return isNaN(parsed.getTime()) ? null : parsed;
}

function h38ReplySnippet_(body) {
  return String(body || '').replace(/\s+/g, ' ').trim().slice(0, 350);
}

function h38ReplyAppendNote_(oldNote, newNote) {
  const base = String(oldNote || '').trim();
  const stamp = '[' + h38ReplyNow_() + '] ' + newNote;
  return base ? base + '\n' + stamp : stamp;
}

function h38ReplyEscapeGmailQuery_(value) {
  return String(value || '').replace(/"/g, '\\"');
}

function h38ReplyText_(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function h38ReplyUpper_(value) {
  return h38ReplyText_(value).toUpperCase();
}

function h38ReplyNow_() {
  return Utilities.formatDate(new Date(), H38_REPLY_MODULE.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function h38ReplyShortId_() {
  return Utilities.getUuid().slice(0, 8).toUpperCase();
}

function h38ReplyCleanId_(value) {
  return String(value || 'UNKNOWN').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 50) || 'UNKNOWN';
}

function h38ReplyErrorMessage_(err) {
  return err && err.message ? err.message : String(err);
}

