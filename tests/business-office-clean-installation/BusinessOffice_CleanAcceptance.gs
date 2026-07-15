/** Temporary authenticated acceptance controller for a newly provisioned Business Office installation. */
const BO_CLEAN_ACCEPTANCE_TOKEN = '__BO_CLEAN_ACCEPTANCE_TOKEN__';

function boCleanExecute(request) {
  const req = request || {};
  if (!req.token || req.token !== BO_CLEAN_ACCEPTANCE_TOKEN) {
    throw new Error('Unauthorized clean-install acceptance request.');
  }
  const payload = req.payload || {};
  let result;
  if (req.action === 'health') result = boCleanHealth_();
  else if (req.action === 'provisionWorkbook') result = boProvisionNeutralWorkbook_(payload);
  else if (req.action === 'bootstrap') result = boBootstrapInstall(payload);
  else if (req.action === 'callableProof') result = boCleanCallableProof_();
  else if (req.action === 'validate') result = boValidateInstallation();
  else if (req.action === 'selfTest') result = boRunSelfTest();
  else if (req.action === 'render') result = { html: boGetRenderedWebAppHtml() };
  else if (req.action === 'liveAccept') result = boRunCleanLiveAcceptance_(payload);
  else if (req.action === 'backup') result = boCreateBackup('Clean Installation Acceptance');
  else throw new Error('Unsupported clean-install acceptance action: ' + req.action);
  return { ok: true, result: result };
}

function doPost(e) {
  try {
    const request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return ContentService.createTextOutput(JSON.stringify(boCleanExecute(request)))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      error: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : ''
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function boCleanHealth_() {
  const pack = boGetBusinessPack_();
  return {
    status: 'PASS',
    projectId: ScriptApp.getScriptId(),
    installationId: pack.installationId,
    businessId: pack.business.id,
    businessName: pack.branding.businessName,
    version: BO_PLATFORM.VERSION,
    externalActionsEnabled: BO_PLATFORM.EXTERNAL_ACTIONS_ENABLED,
    directPaymentProcessing: BO_PLATFORM.DIRECT_PAYMENT_PROCESSING,
    directPayrollFunding: BO_PLATFORM.DIRECT_PAYROLL_FUNDING,
    directTaxFiling: BO_PLATFORM.DIRECT_TAX_FILING
  };
}

function boCleanCallableProof_() {
  const owner = boRequireOwner_();
  const proofRecordId = 'CALLABLE-' + Utilities.getUuid().slice(0, 12).toUpperCase();
  boProof_('CLEAN CALLABLE PROOF', 'System', boGetBusinessId_(), 'PASS', proofRecordId, owner.Email);
  const proofRows = boReadTable_(BO_SHEETS.PROOF_LOG, { includeVoided: true }).filter(function (row) {
    const action = String(row.Action || row.Operation || '');
    const evidence = String(row.Evidence || row.Details || '');
    return action === 'CLEAN CALLABLE PROOF' && evidence.indexOf(proofRecordId) >= 0;
  });
  const criticalErrors = boReadTable_(BO_SHEETS.ERROR_LOG, { includeVoided: true }).filter(function (row) {
    return row.Status !== 'Resolved' && row.Severity !== 'Warning';
  });
  boAssert_(proofRows.length > 0, 'Authenticated callable proof was not written to the isolated Proof Log.');
  boAssert_(criticalErrors.length === 0, 'Error Log is not clear after authenticated callable proof.');
  return {
    status: 'PASS',
    projectId: ScriptApp.getScriptId(),
    businessId: boGetBusinessId_(),
    authenticatedEmail: owner.Email,
    proofRecordId: proofRecordId,
    proofRows: proofRows.length,
    criticalErrors: criticalErrors.length
  };
}

function boRunCleanLiveAcceptance_(payload) {
  const owner = boRequireOwner_();
  const suffix = Utilities.getUuid().slice(0, 8).toUpperCase();
  const customer = boAppendRecord_(BO_SHEETS.CUSTOMERS, {
    'Customer ID': 'CLEAN-CUSTOMER-' + suffix,
    'Customer Number': 'C-' + suffix,
    'Display Name': 'Clean Installation Test Customer',
    'Customer Type': 'Business',
    Email: 'clean.customer@example.invalid',
    'Payment Terms': 'Net 15',
    'Tax Status': 'Review Required',
    Tags: 'Controlled Clean Installation Test',
    Status: 'Active',
    'Attention Status': 'None',
    Notes: 'Isolated acceptance record; no customer action.'
  }, 'Clean-install acceptance');

  const quote = boAppendRecord_(BO_SHEETS.QUOTES, {
    'Quote ID': 'CLEAN-QUOTE-' + suffix,
    'Quote Number': 'Q-' + suffix,
    'Customer ID': customer['Customer ID'],
    'Project Title': 'Clean Business Office Acceptance',
    'Revision Number': 1,
    'Revision Status': 'Current',
    'Quote Date': Utilities.formatDate(new Date(), boGetTimeZone_(), 'yyyy-MM-dd'),
    Status: 'Prepared',
    'Approval Status': boApprovalText_('required'),
    'Send Allowed': 'No',
    'Customer Action': 'None',
    'Payment Terms': 'Net 15',
    Scope: 'Verify isolated quote and neutral PDF generation.',
    Assumptions: 'Controlled acceptance only.',
    Exclusions: 'No sending, payment, delivery, or publication.',
    Subtotal: 100,
    Discount: 0,
    Tax: 0,
    Deposit: 0,
    Total: 100,
    'Duplicate Key': boGetBusinessId_() + '|CLEAN|' + suffix,
    'Created By': owner['User ID']
  }, 'Clean-install acceptance');

  const document = boUploadDocument(payload.document || {});
  const extraction = boExtractDocument(document['Document ID']);
  let duplicateBlocked = false;
  try {
    boUploadDocument(payload.document || {});
  } catch (duplicateError) {
    duplicateBlocked = /Duplicate upload blocked/i.test(duplicateError.message || String(duplicateError));
  }
  boAssert_(duplicateBlocked, 'Duplicate-upload protection did not block the repeated file.');
  boReadTable_(BO_SHEETS.ERROR_LOG, { includeVoided: true }).filter(function (row) {
    return row.Status !== 'Resolved' && /Duplicate upload blocked/i.test(String(row.Message || ''));
  }).forEach(function (row) {
    boUpdateRecord_(BO_SHEETS.ERROR_LOG, row['Error ID'], {
      Status: 'Resolved',
      'Resolved By': owner.Email,
      'Resolved Time': boNow_(),
      Notes: 'Expected duplicate-protection acceptance result; original upload preserved and duplicate rejected.'
    }, 'Clean-install duplicate-protection acceptance');
  });

  const pdf = boGeneratePdf('Quote', quote['Quote ID']);
  const html = boGetRenderedWebAppHtml();
  const evidenceText = JSON.stringify({ customer: customer, quote: quote, document: document, extraction: extraction, pdf: pdf, html: html });
  const leakage = /Highway\s*38|\bH38\b|rkrueth-maker|highway-38-solutions|AKfyc/i.test(evidenceText);
  boAssert_(!leakage, 'Highway 38 identity or deployment data leaked into the clean installation.');
  boAssert_(customer['Business ID'] === boGetBusinessId_(), 'Customer business isolation failed.');
  boAssert_(quote['Business ID'] === boGetBusinessId_(), 'Quote business isolation failed.');
  boAssert_(document['Business ID'] === boGetBusinessId_(), 'Document business isolation failed.');
  boAssert_(pdf && pdf.fileId && pdf.delivered === false && pdf.sent === false, 'Neutral PDF generation failed or crossed an external-action boundary.');

  const errors = boReadTable_(BO_SHEETS.ERROR_LOG, { includeVoided: true }).filter(function (row) {
    return row.Status !== 'Resolved' && row.Severity !== 'Warning';
  });
  boAssert_(errors.length === 0, 'Critical clean-install errors found: ' + errors.length);
  const proof = boReadTable_(BO_SHEETS.PROOF_LOG, { includeVoided: true });
  boAssert_(proof.length > 0, 'Proof Log did not record clean-install activity.');

  return {
    status: 'PASS',
    projectId: ScriptApp.getScriptId(),
    installationId: boGetInstallationId_(),
    businessId: boGetBusinessId_(),
    businessName: boGetBranding_().businessName,
    customerId: customer['Customer ID'],
    quoteId: quote['Quote ID'],
    documentId: document['Document ID'],
    documentFileId: document['File ID'],
    ocrState: extraction.state || '',
    pdfFileId: pdf.fileId,
    duplicateBlocked: duplicateBlocked,
    proofRows: proof.length,
    criticalErrors: errors.length,
    externalActionsOccurred: false,
    paymentProcessed: false,
    payrollFundsMoved: false,
    taxReturnFiled: false,
    customerMessageSent: false,
    deliveryOccurred: false
  };
}
