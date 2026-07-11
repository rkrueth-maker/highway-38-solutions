/**
 * HIGHWAY 38 CORE ENGINE — OWNER-APPROVED EMAIL SEND EXECUTION
 * Exact menu function name: h38OwnerApprovedSendSelectedDraft
 *
 * Selected-row only.
 * Email Approval Queue only.
 * Sends only an existing Gmail draft.
 * Requires Rick Decision = APPROVE SEND and Send Allowed = Yes.
 *
 * Does not send quotes.
 * Does not request payment.
 * Does not publish social.
 * Does not deploy website.
 * Does not deliver final work.
 * Does not create triggers.
 */

function h38OwnerApprovedSendSelectedDraft() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const context = { ss, sheet, jobId: '', emailId: '', queue: 'Email Approval Queue' };

  try {
    if (sheet.getName() !== 'Email Approval Queue') {
      throw new Error('This function only runs from Email Approval Queue.');
    }

    const activeRange = sheet.getActiveRange();
    if (!activeRange) throw new Error('No selected row found.');

    const row = activeRange.getRow();
    if (row <= 1) throw new Error('Select a data row, not the header row.');

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
    const values = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
    const rowObj = h38BuildRowObject_(headers, values);

    context.row = row;
    context.headers = headers;
    context.rowObj = rowObj;
    context.jobId = h38GetFirst_(rowObj, ['Job ID', 'JobID', 'Job Id']);
    context.emailId = h38GetFirst_(rowObj, ['Email ID', 'EmailID']);

    const jobId = context.jobId;
    const draftRef = h38GetFirst_(rowObj, ['Gmail Draft Ref', 'Gmail Draft ID', 'Draft ID']);
    const toEmail = h38GetFirst_(rowObj, ['To', 'Customer Email', 'Recipient Email', 'Email']);
    const status = h38GetFirst_(rowObj, ['Status', 'Approval Status']);
    const rickDecision = h38GetFirst_(rowObj, ['Rick Decision']);
    const sendAllowed = h38GetFirst_(rowObj, ['Send Allowed']);
    const sentTime = h38GetFirst_(rowObj, ['Sent Time', 'Sent Timestamp', 'Sent At']);
    const sendLock = h38GetFirst_(rowObj, ['Send Lock', 'Duplicate Lock', 'Execution Lock', 'Lock']);
    const proofLogId = h38GetFirst_(rowObj, ['Proof Log ID']);

    if (!jobId) throw new Error('Missing Job ID.');
    if (!draftRef) throw new Error('Missing Gmail Draft Ref / Draft ID.');
    if (!toEmail) throw new Error('Missing To / Customer Email.');
    if (String(rickDecision).trim() !== 'APPROVE SEND') throw new Error('Rick Decision must be APPROVE SEND.');
    if (String(sendAllowed).trim() !== 'Yes') throw new Error('Send Allowed must be Yes.');
    if (String(status).trim() === 'Sent - locked') throw new Error('Already Sent - locked.');
    if (sentTime) throw new Error('Sent Time already exists. Duplicate send blocked.');
    if (sendLock && String(sendLock).trim().toUpperCase() === 'LOCKED') throw new Error('Duplicate/send lock is already LOCKED.');
    if (proofLogId && String(proofLogId).indexOf('PROOF-SENT') === 0) throw new Error('Proof Log ID already exists. Duplicate send blocked.');

    const draftId = h38ExtractDraftId_(draftRef);
    const draft = GmailApp.getDraft(draftId);
    if (!draft) throw new Error('Gmail draft not found for Draft ID: ' + draftId);

    const message = draft.getMessage();
    const draftTo = String(message.getTo() || '').toLowerCase();
    const expectedTo = String(toEmail || '').toLowerCase();
    if (draftTo.indexOf(expectedTo) === -1 && expectedTo.indexOf(draftTo) === -1) {
      throw new Error('Draft recipient does not match selected row. Draft To: ' + message.getTo());
    }

    const proofId = h38CreateEmailProofId_(jobId);

    draft.send();

    h38SetIfHeaderExists_(sheet, headers, row, 'Status', 'Sent - locked');
    h38SetIfHeaderExists_(sheet, headers, row, 'Approval Status', 'Sent - locked');
    h38SetIfHeaderExists_(sheet, headers, row, 'Sent Time', new Date());
    h38SetIfHeaderExists_(sheet, headers, row, 'Sent Timestamp', new Date());
    h38SetIfHeaderExists_(sheet, headers, row, 'Proof Log ID', proofId);
    h38SetIfHeaderExists_(sheet, headers, row, 'Next Action', 'No further action unless Rick requests follow-up');
    h38SetIfHeaderExists_(sheet, headers, row, 'Send Lock', 'LOCKED');
    h38SetIfHeaderExists_(sheet, headers, row, 'Duplicate Lock', 'LOCKED');

    h38WriteProofLog_(ss, [
      new Date(),
      jobId,
      context.emailId,
      'Email Approval Queue',
      'APPROVED_EMAIL_DRAFT_SENT',
      proofId,
      draftId,
      toEmail,
      Session.getActiveUser().getEmail(),
      'Sent only after Rick Decision = APPROVE SEND and Send Allowed = Yes'
    ]);

    SpreadsheetApp.getUi().alert(
      'Approved Gmail draft sent.\n\n' +
      'Job ID: ' + jobId + '\n' +
      'Proof ID: ' + proofId + '\n\n' +
      'No quote sent.\nNo payment requested.\nNo final delivery.\nNo website/social publish.\nNo trigger.'
    );
  } catch (error) {
    h38WriteErrorLog_(ss, [
      new Date(),
      context.jobId || '',
      context.emailId || '',
      'Email Approval Queue',
      'APPROVED_EMAIL_SEND_BLOCKED',
      error.message || String(error),
      'No email sent unless Rick Decision = APPROVE SEND and Send Allowed = Yes'
    ]);

    SpreadsheetApp.getUi().alert(
      'Approved email send blocked.\n\n' +
      'Reason: ' + (error.message || String(error)) + '\n\n' +
      'No email sent.\nNo quote approved.\nNo payment requested.\nNo final delivery.\nNo website/social publish.\nNo trigger.'
    );
  }
}

function h38BuildRowObject_(headers, values) {
  const rowObj = {};
  headers.forEach((header, i) => {
    rowObj[String(header).trim()] = values[i];
  });
  return rowObj;
}

function h38GetFirst_(rowObj, possibleHeaders) {
  for (const header of possibleHeaders) {
    if (Object.prototype.hasOwnProperty.call(rowObj, header)) {
      const value = rowObj[header];
      if (value !== '' && value !== null && value !== undefined) return value;
    }
  }
  return '';
}

function h38ExtractDraftId_(draftRef) {
  const raw = String(draftRef || '').trim();
  const match = raw.match(/(?:Draft ID|Gmail draft ID|Gmail Draft ID|Draft)\s*:?\s*([A-Za-z0-9_-]+)/i);
  return match ? match[1] : raw;
}

function h38CreateEmailProofId_(jobId) {
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  return 'PROOF-SENT-' + jobId + '-' + stamp;
}

function h38SetIfHeaderExists_(sheet, headers, row, headerName, value) {
  const idx = headers.indexOf(headerName);
  if (idx >= 0) sheet.getRange(row, idx + 1).setValue(value);
}

function h38WriteProofLog_(ss, row) {
  const sheet = ss.getSheetByName('Proof Log');
  if (sheet) sheet.appendRow(row);
}

function h38WriteErrorLog_(ss, row) {
  const sheet = ss.getSheetByName('Error Log');
  if (sheet) sheet.appendRow(row);
}
