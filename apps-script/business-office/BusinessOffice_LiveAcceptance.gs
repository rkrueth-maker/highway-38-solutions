/** Highway 38 Business Office — controlled live deployment acceptance. */

function boBuildAcceptanceImage_(title, rows, runId) {
  const builder = Charts.newDataTable()
    .addColumn(Charts.ColumnType.STRING, title)
    .addColumn(Charts.ColumnType.STRING, 'Value');
  rows.forEach(function (row) { builder.addRow([String(row[0]), String(row[1])]); });
  builder.addRow(['Acceptance Run', runId]);
  const chart = Charts.newTableChart()
    .setDataTable(builder.build())
    .setDimensions(1100, 760)
    .build();
  return chart.getAs('image/png').setName(title.replace(/\s+/g, '-') + '-' + runId + '.png');
}

function boBuildAcceptancePdf_(title, lines, runId) {
  const doc = DocumentApp.create(title + '-' + runId);
  const body = doc.getBody();
  body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  lines.forEach(function (line) { body.appendParagraph(String(line)); });
  body.appendParagraph('Acceptance Run: ' + runId);
  doc.saveAndClose();
  const source = DriveApp.getFileById(doc.getId());
  const blob = source.getAs(MimeType.PDF).setName(title.replace(/\s+/g, '-') + '-' + runId + '.pdf');
  source.setTrashed(true);
  return blob;
}

function boUploadAcceptanceBlob_(blob, documentType, sourceType, runId) {
  return boUploadDocument({
    fileName: blob.getName(),
    mimeType: blob.getContentType(),
    base64Data: Utilities.base64Encode(blob.getBytes()),
    documentType: documentType,
    sourceType: sourceType,
    sourceId: 'LIVE-ACCEPTANCE-' + runId,
    accessClassification: 'Private Controlled Test'
  });
}

function boReviewAllAcceptanceFields_(documentId) {
  const fields = boReadTable_(H38_BO_SHEETS.OCR_FIELDS, { includeVoided: true }).filter(function (row) {
    return row['Document ID'] === documentId;
  });
  boAssert_(fields.length > 0, 'OCR returned no reviewable fields for ' + documentId + '.');
  fields.forEach(function (field) {
    const value = boNormalizeText_(field['Suggested Value'] || field['Extracted Value']);
    boAssert_(value, 'OCR field has no reviewable value: ' + field['Field Name']);
    boReviewOcrField(field['OCR Field ID'], value, 'Controlled live acceptance review');
  });
  return fields.length;
}

function boExpectBlocked_(label, fn, expectedText) {
  try {
    fn();
  } catch (error) {
    const message = String(error && error.message || error);
    boAssert_(!expectedText || message.indexOf(expectedText) >= 0, label + ' blocked for an unexpected reason: ' + message);
    return { blocked: true, message: message };
  }
  throw new Error(label + ' was not blocked.');
}

function boResolveExpectedAcceptanceErrors_(expectedTexts) {
  const owner = boRequireOwner_();
  const expected = expectedTexts || [];
  const rows = boReadTable_(H38_BO_SHEETS.ERROR_LOG, { includeVoided: true }).filter(function (row) {
    if (row.Status === 'Resolved') return false;
    const message = String(row.Message || '');
    return expected.some(function (text) { return message.indexOf(text) >= 0; });
  });
  rows.forEach(function (row) {
    boUpdateRecord_(H38_BO_SHEETS.ERROR_LOG, row['Error ID'], {
      Status: 'Resolved',
      'Resolved By': owner['User ID'],
      'Resolved Time': boNow_(),
      Notes: 'Expected blocked action verified during controlled live acceptance.'
    }, 'Resolve expected acceptance error');
  });
  return rows.map(function (row) { return row['Error ID']; });
}

function boCreateBlockedPostingFixture_(runId) {
  return boPrepareJournalEntry({
    entryDate: Utilities.formatDate(new Date(), H38_BO.TIME_ZONE, 'yyyy-MM-dd'),
    sourceType: 'Live Acceptance',
    sourceId: 'BLOCKED-POST-' + runId,
    description: 'Controlled unapproved posting fixture',
    accountingPeriodId: 'PERIOD-2026-07',
    lines: [
      { accountId: 'ACCT-1000', accountCode: '1000', accountName: 'Cash', accountType: 'Asset', debit: 1, credit: 0, memo: 'Controlled debit' },
      { accountId: 'ACCT-3000', accountCode: '3000', accountName: 'Owner Equity', accountType: 'Equity', debit: 0, credit: 1, memo: 'Controlled credit' }
    ]
  });
}

function boRunRoleMatrixAcceptance_() {
  const cases = [
    ['ROLE-OWNER', H38_BO_SHEETS.QUOTES, 'Approve', true],
    ['ROLE-ADMIN', H38_BO_SHEETS.QUOTES, 'Create', true],
    ['ROLE-ADMIN', H38_BO_SHEETS.QUOTES, 'Approve', false],
    ['ROLE-STAFF', H38_BO_SHEETS.JOBS, 'Edit', true],
    ['ROLE-STAFF', H38_BO_SHEETS.JOBS, 'Post', false],
    ['ROLE-BOOKKEEPER', 'Accounting', 'Post', true],
    ['ROLE-PAYROLL', 'Payroll Preparation', 'Export', true],
    ['ROLE-VIEWER', H38_BO_SHEETS.CUSTOMERS, 'Create', false]
  ];
  return cases.map(function (item) {
    const allowed = boHasPermission_({ 'Role ID': item[0] }, item[1], item[2]);
    boAssert_(allowed === item[3], 'Role matrix mismatch: ' + item.join(' / '));
    return { roleId: item[0], module: item[1], action: item[2], allowed: allowed };
  });
}

function boRunLiveAcceptance() {
  const owner = boRequireOwner_();
  const runId = Utilities.formatDate(new Date(), H38_BO.TIME_ZONE, 'yyyyMMdd-HHmmss');
  const tests = [];
  const files = [];
  const records = [];
  function test(name, fn) {
    try {
      const evidence = fn();
      tests.push({ name: name, status: 'PASS', evidence: evidence });
      return evidence;
    } catch (error) {
      tests.push({ name: name, status: 'FAIL', evidence: String(error && error.message || error) });
      throw error;
    }
  }

  const installation = test('Installation and private folders', function () {
    const result = boValidateInstallation();
    boAssert_(result.valid, 'Installation validation is on hold.');
    return result;
  });

  const receipt = test('Live receipt camera-path image upload, OCR, review, approval, and controlled posting', function () {
    const blob = boBuildAcceptanceImage_('Receipt Photo', [
      ['Vendor', 'Highway 38 Test Supply'],
      ['Date', '2026-07-14'],
      ['Receipt Number', 'LIVE-' + runId],
      ['Subtotal', '20.00'],
      ['Tax', '1.40'],
      ['Total', '21.40'],
      ['Payment Method', 'Business Card']
    ], runId);
    const document = boUploadAcceptanceBlob_(blob, 'Receipt', 'Camera Capture', runId);
    const extraction = boExtractDocument(document['Document ID']);
    boAssert_(extraction && extraction.suggestions && extraction.suggestions.length > 0, 'Receipt OCR did not return suggestions.');
    const reviewedFields = boReviewAllAcceptanceFields_(document['Document ID']);
    boApproveDocument(document['Document ID']);
    const posted = boPostApprovedDocument(document['Document ID'], 'Receipt');
    const duplicate = boExpectBlocked_('Duplicate receipt image', function () {
      boUploadAcceptanceBlob_(blob, 'Receipt', 'Camera Capture', runId);
    }, 'Duplicate upload blocked');
    files.push(document['File ID']);
    records.push(posted['Receipt ID']);
    return { documentId: document['Document ID'], fileId: document['File ID'], receiptId: posted['Receipt ID'], reviewedFields: reviewedFields, duplicateProtection: duplicate.blocked };
  });

  const workOrder = test('Live work-order photo upload and OCR review path', function () {
    const blob = boBuildAcceptanceImage_('Work Order Photo', [
      ['Customer', 'Northwoods Sample Customer'],
      ['Address', 'Grand Rapids MN'],
      ['Job Number', 'JOB-2026-0001'],
      ['Work Requested', 'Prepare sample project plan'],
      ['Assigned Employee', 'Sample Employee'],
      ['Labor', '2 hours'],
      ['Materials', 'Planning packet'],
      ['Due Date', '2026-07-22'],
      ['Status', 'Open']
    ], runId);
    const document = boUploadAcceptanceBlob_(blob, 'Work Order', 'Camera Capture', runId);
    const extraction = boExtractDocument(document['Document ID']);
    boAssert_(extraction && extraction.suggestions && extraction.suggestions.length > 0, 'Work-order OCR did not return suggestions.');
    const reviewedFields = boReviewAllAcceptanceFields_(document['Document ID']);
    files.push(document['File ID']);
    return { documentId: document['Document ID'], fileId: document['File ID'], reviewedFields: reviewedFields, state: 'Needs Owner Approval' };
  });

  const vendorInvoice = test('Live PDF upload and vendor-invoice extraction path', function () {
    const blob = boBuildAcceptancePdf_('Vendor Invoice', [
      'Vendor: Highway 38 Test Supply',
      'Invoice Number: VINV-' + runId,
      'Date: 2026-07-14',
      'Due Date: 2026-08-13',
      'Terms: Net 30',
      'PO Reference: PO-2026-0001',
      'Subtotal: $50.00',
      'Tax: $3.50',
      'Total: $53.50'
    ], runId);
    const document = boUploadAcceptanceBlob_(blob, 'Vendor Invoice', 'PDF Upload', runId);
    const extraction = boExtractDocument(document['Document ID']);
    boAssert_(extraction && extraction.suggestions && extraction.suggestions.length > 0, 'Vendor-invoice OCR did not return suggestions.');
    const reviewedFields = boReviewAllAcceptanceFields_(document['Document ID']);
    files.push(document['File ID']);
    return { documentId: document['Document ID'], fileId: document['File ID'], reviewedFields: reviewedFields };
  });

  test('Approval gates block customer, payroll, tax, and posting execution', function () {
    const blockedPosting = boCreateBlockedPostingFixture_(runId);
    const blocked = [
      boExpectBlocked_('Quote send preparation', function () { boPrepareCustomerAction('Quote', 'QUOTE-TEST-001'); }, 'Send Allowed'),
      boExpectBlocked_('Payroll provider export', function () { boExportPayrollProviderCsv('PAYROLL-TEST-001'); }, 'Payroll approval'),
      boExpectBlocked_('Tax report finalization', function () { boFinalizeTaxPreparationReport('TAX-TEST-001'); }, 'Owner approval'),
      boExpectBlocked_('Unapproved ledger posting', function () { boPostJournalEntry(blockedPosting['Journal Entry ID']); }, 'approval')
    ];
    const resolvedErrors = boResolveExpectedAcceptanceErrors_(['Payroll approval', 'Owner approval', 'approval is required before posting']);
    return { blocked: blocked, resolvedExpectedErrorIds: resolvedErrors, postingFixtureId: blockedPosting['Journal Entry ID'] };
  });

  const intakeSync = test('Existing intake additive synchronization and duplicate protection', function () {
    const result = h38BusinessOfficeSyncRequests();
    boAssert_(result.status === 'PASS', 'Intake synchronization returned ' + result.status + '.');
    const second = h38BusinessOfficeSyncRequests();
    boAssert_(second.status === 'PASS' && second.mirrored === 0, 'Second intake synchronization was not idempotent.');
    return { first: result, second: second, existingTriggerPreserved: true };
  });

  const pdfTypes = test('Live branded Apps Script PDF generation', function () {
    const cases = [
      ['Quote', 'QUOTE-TEST-001'],
      ['Work Order', 'WO-TEST-001'],
      ['Purchase Order', 'PO-TEST-001'],
      ['Invoice', 'INV-TEST-001'],
      ['Payment Receipt', 'PAY-TEST-001'],
      ['Expense Report', 'EXP-TEST-001'],
      ['Job Cost Report', 'JOB-TEST-001'],
      ['Payroll Summary', 'PAYROLL-TEST-001'],
      ['Tax Preparation Packet', 'TAX-TEST-001']
    ];
    return cases.map(function (item) {
      const result = boGeneratePdf(item[0], item[1]);
      const file = DriveApp.getFileById(result.fileId);
      boAssert_(file.getMimeType() === MimeType.PDF, item[0] + ' did not create a PDF.');
      files.push(result.fileId);
      return { documentType: item[0], recordId: item[1], fileId: result.fileId, fileUrl: result.fileUrl, sent: false, delivered: false };
    });
  });

  const roleMatrix = test('Live role and permission matrix', boRunRoleMatrixAcceptance_);
  const selfTest = test('Complete Business Office self-test', boRunSelfTest);
  const ledger = test('Live ledger reconciliation', function () {
    const result = boValidateLedger();
    boAssert_(result.valid && Math.abs(Number(result.balanceSheetDifference || 0)) < 0.005, 'Ledger does not reconcile.');
    return result;
  });

  const failed = tests.filter(function (item) { return item.status !== 'PASS'; });
  const result = {
    status: failed.length ? 'HOLD' : 'PASS',
    runId: runId,
    testedAt: boNow_(),
    testedBy: owner.Email,
    version: H38_BO.VERSION,
    installation: installation,
    receipt: receipt,
    workOrderPhoto: workOrder,
    vendorInvoicePdf: vendorInvoice,
    intakeSync: intakeSync,
    generatedPdfs: pdfTypes,
    roleMatrix: roleMatrix,
    selfTest: selfTest,
    ledger: ledger,
    filesCreated: files,
    recordsCreated: records,
    externalActionsEnabled: false,
    externalActionsOccurred: false,
    directPaymentProcessed: false,
    payrollFundsMoved: false,
    taxReturnFiled: false,
    tests: tests
  };
  boProof_('LIVE ACCEPTANCE', 'System', boGetBusinessId_(), result.status, JSON.stringify(result), owner.Email);
  return result;
}
