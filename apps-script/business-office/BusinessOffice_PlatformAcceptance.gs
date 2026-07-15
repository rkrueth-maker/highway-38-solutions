/** Business Office — reusable live acceptance for any configured business installation. */

function boRunPlatformAcceptance(payload) {
  const owner = boRequireOwner_();
  const input = payload || {};
  const acceptanceId = boId_('PLATFORM-ACCEPTANCE');
  const date = Utilities.formatDate(new Date(), boTimeZone_(), 'yyyy-MM-dd');
  const evidence = {
    status: 'PASS',
    acceptanceId: acceptanceId,
    businessId: boGetBusinessId_(),
    businessName: boBusinessName_(),
    packId: boPackValue_('packId', ''),
    testedAt: boNow_(),
    testedBy: owner.Email,
    tests: [],
    created: {}
  };
  const createdRecords = [];

  function run(name, callback) {
    try {
      const result = callback();
      evidence.tests.push({ name: name, status: 'PASS', evidence: result });
      return result;
    } catch (error) {
      evidence.status = 'HOLD';
      evidence.tests.push({ name: name, status: 'FAIL', evidence: error.message });
      throw error;
    }
  }

  function create(sheetName, values) {
    const record = boAppendRecord_(sheetName, values, 'Reusable platform acceptance');
    const headers = boHeaders_(sheetName);
    const key = boPrimaryKeyHeader_(headers);
    createdRecords.push({ sheetName: sheetName, recordId: record[key] });
    return record;
  }

  function extractPdfText(fileId) {
    boAssert_(typeof Drive !== 'undefined' && Drive.Files, 'Advanced Drive service is required for PDF identity verification.');
    const file = DriveApp.getFileById(fileId);
    const converted = Drive.Files.create({ name: 'Acceptance OCR ' + acceptanceId, mimeType: 'application/vnd.google-apps.document' }, file.getBlob(), { ocrLanguage: 'en', fields: 'id' });
    try {
      let lastError = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const text = DocumentApp.openById(converted.id).getBody().getText();
          if (text) return text;
        } catch (error) {
          lastError = error;
        }
        Utilities.sleep(1000);
      }
      throw lastError || new Error('Generated PDF text was empty.');
    } finally {
      DriveApp.getFileById(converted.id).setTrashed(true);
    }
  }

  function resolveExpectedDuplicateErrors(beforeIds) {
    boReadTable_(H38_BO_SHEETS.ERROR_LOG, { includeVoided: true }).forEach(function (row) {
      if (beforeIds[row['Error ID']]) return;
      if (row.Source !== 'Document upload' || !/Duplicate upload blocked/.test(row.Message || '')) return;
      boUpdateRecord_(H38_BO_SHEETS.ERROR_LOG, row['Error ID'], {
        Status: 'Resolved',
        'Resolved By': owner.Email,
        'Resolved Time': boNow_(),
        Notes: 'Expected reusable-platform duplicate-protection acceptance result; no duplicate file was created.'
      }, 'Resolve expected platform duplicate result');
    });
  }

  const identity = run('Configured business identity and resource isolation', function () {
    const pack = boGetPackSnapshot_();
    const isolation = boValidateResourceIsolation();
    boAssert_(isolation.valid, 'Resource isolation failed: ' + JSON.stringify(isolation));
    boAssert_(pack.business.id === boGetBusinessId_(), 'Pack business ID and installation business ID differ.');
    boAssert_(pack.business.publicName === boBusinessName_(), 'Pack business name did not load.');
    return { business: pack.business, branding: pack.branding, mode: pack.deployment.mode, isolation: isolation };
  });

  run('No protected business identity or resource leakage', function () {
    const terms = input.forbiddenTerms || boPackValue_('isolation.forbiddenTerms', []);
    const hits = boScanInstallationForForbiddenTerms_(terms);
    boAssert_(!hits.length, 'Protected business leakage found: ' + JSON.stringify(hits));
    return 'No protected identity or resource ID found in the selected workbook';
  });

  const customer = run('Create isolated customer and vendor records', function () {
    const customerRecord = create(H38_BO_SHEETS.CUSTOMERS, {
      'Customer ID': boId_('CUSTOMER'),
      'Customer Number': 'ACCEPT-' + acceptanceId.slice(-8),
      'Display Name': boBusinessName_() + ' Acceptance Customer',
      'Customer Type': 'Acceptance Test',
      Email: 'acceptance@example.invalid',
      Status: 'Active',
      'Attention Status': 'None',
      Notes: acceptanceId
    });
    const vendorRecord = create(H38_BO_SHEETS.VENDORS, {
      'Vendor ID': boId_('VENDOR'),
      'Vendor Number': 'ACCEPT-' + acceptanceId.slice(-8),
      'Display Name': boBusinessName_() + ' Acceptance Vendor',
      'Vendor Type': 'Acceptance Test',
      Email: 'vendor@example.invalid',
      Status: 'Active',
      Notes: acceptanceId
    });
    evidence.created.customerId = customerRecord['Customer ID'];
    evidence.created.vendorId = vendorRecord['Vendor ID'];
    return { customerId: customerRecord['Customer ID'], vendorId: vendorRecord['Vendor ID'] };
  });

  const quote = run('Create isolated quote, work order, and job', function () {
    const quoteRecord = create(H38_BO_SHEETS.QUOTES, {
      'Quote ID': boId_('QUOTE'),
      'Quote Number': 'ACCEPT-' + acceptanceId.slice(-8),
      'Customer ID': evidence.created.customerId,
      'Project Title': boBusinessName_() + ' Acceptance Project',
      'Revision Number': 1,
      'Quote Date': date,
      Status: 'Prepared',
      'Approval Status': 'Owner Approval Required',
      'Send Allowed': 'No',
      Scope: 'Reusable Business Office acceptance scope',
      Subtotal: 100,
      Tax: 0,
      Total: 100,
      'Duplicate Key': boGetBusinessId_() + '|' + acceptanceId + '|QUOTE'
    });
    const jobId = boId_('JOB');
    const workOrderRecord = create(H38_BO_SHEETS.WORK_ORDERS, {
      'Work Order ID': boId_('WORK-ORDER'),
      'Work Order Number': 'ACCEPT-' + acceptanceId.slice(-8),
      'Quote ID': quoteRecord['Quote ID'],
      'Job ID': jobId,
      'Customer ID': evidence.created.customerId,
      'Work Requested': 'Verify isolated reusable Business Office workflow',
      Scope: 'Acceptance test only',
      Status: 'Open',
      'Approval Status': 'Owner Approval Required',
      'Customer Approval Status': 'Not Requested',
      'Duplicate Key': boGetBusinessId_() + '|' + acceptanceId + '|WORK-ORDER'
    });
    const jobRecord = create(H38_BO_SHEETS.JOBS, {
      'Job ID': jobId,
      'Job Number': 'ACCEPT-' + acceptanceId.slice(-8),
      'Customer ID': evidence.created.customerId,
      'Work Order ID': workOrderRecord['Work Order ID'],
      'Quote ID': quoteRecord['Quote ID'],
      'Project Title': boBusinessName_() + ' Acceptance Project',
      Status: 'Active',
      Stage: 'Acceptance',
      'Approval Status': 'Owner Approval Required',
      'Invoice Status': 'Not Invoiced',
      Revenue: 100,
      'Total Cost': 25,
      Profit: 75,
      'Profit Margin': 75,
      Notes: acceptanceId
    });
    evidence.created.quoteId = quoteRecord['Quote ID'];
    evidence.created.workOrderId = workOrderRecord['Work Order ID'];
    evidence.created.jobId = jobRecord['Job ID'];
    return { quoteId: quoteRecord['Quote ID'], workOrderId: workOrderRecord['Work Order ID'], jobId: jobRecord['Job ID'] };
  });

  run('Create isolated purchasing, expense, invoice, payment, payroll, and tax records', function () {
    const po = create(H38_BO_SHEETS.PURCHASE_ORDERS, {
      'PO ID': boId_('PO'), 'PO Number': 'ACCEPT-' + acceptanceId.slice(-8), 'Vendor ID': evidence.created.vendorId,
      'Job ID': evidence.created.jobId, 'Order Date': date, Status: 'Prepared', 'Approval Status': 'Owner Approval Required',
      'Ordered Status': 'Not Ordered', 'Received Status': 'Not Received', Subtotal: 25, Tax: 0, Shipping: 0, Total: 25,
      'Vendor Bill Status': 'Not Billed', 'Duplicate Key': boGetBusinessId_() + '|' + acceptanceId + '|PO'
    });
    const expense = create(H38_BO_SHEETS.EXPENSES, {
      'Expense ID': boId_('EXPENSE'), 'Vendor ID': evidence.created.vendorId, Date: date,
      Description: boBusinessName_() + ' acceptance expense', 'Expense Category': 'Acceptance', 'Account Code': '5000',
      'Customer ID': evidence.created.customerId, 'Job ID': evidence.created.jobId, 'Payment Method': 'Test Record',
      Subtotal: 25, Tax: 0, Total: 25, Reimbursable: 'No', 'Billable to Customer': 'No',
      'Approval Status': 'Owner Approval Required', 'Posting Status': 'Not Posted',
      'Duplicate Key': boGetBusinessId_() + '|' + acceptanceId + '|EXPENSE'
    });
    const invoice = create(H38_BO_SHEETS.INVOICES, {
      'Invoice ID': boId_('INVOICE'), 'Invoice Number': 'ACCEPT-' + acceptanceId.slice(-8),
      'Customer ID': evidence.created.customerId, 'Job ID': evidence.created.jobId, 'Quote ID': evidence.created.quoteId,
      'Invoice Date': date, 'Due Date': date, Status: 'Prepared', 'Approval Status': 'Owner Approval Required',
      'Send Allowed': 'No', 'Delivery Status': 'Not Delivered', Subtotal: 100, Discount: 0, 'Tax Amount': 0,
      'Deposit Applied': 0, Total: 100, 'Amount Paid': 0, 'Balance Due': 100,
      'Duplicate Key': boGetBusinessId_() + '|' + acceptanceId + '|INVOICE'
    });
    const payment = create(H38_BO_SHEETS.PAYMENTS, {
      'Payment ID': boId_('PAYMENT'), 'Invoice ID': invoice['Invoice ID'], 'Customer ID': evidence.created.customerId,
      'Job ID': evidence.created.jobId, 'Payment Date': date, Amount: 0, 'Payment Method': 'Acceptance Test',
      'Transaction Reference': acceptanceId, Status: 'Recorded', 'Approval Status': 'Owner Approval Required',
      'Posting Status': 'Not Posted', 'Duplicate Key': boGetBusinessId_() + '|' + acceptanceId + '|PAYMENT'
    });
    const payroll = create(H38_BO_SHEETS.PAYROLL_PERIODS, {
      'Payroll Period ID': boId_('PAYROLL'), 'Period Start': date, 'Period End': date, 'Pay Date': date,
      Status: 'Prepared', 'Approval Status': 'Owner Approval Required', 'Export Allowed': 'No',
      'Gross Pay': 0, Reimbursements: 0, Deductions: 0, 'Employer Cost Estimate': 0,
      'Payroll Tax Liability Estimate': 0, 'Payroll Provider': 'Not Connected'
    });
    const tax = create(H38_BO_SHEETS.TAX_PERIODS, {
      'Tax Period ID': boId_('TAX'), 'Tax Type': 'Sales Tax Preparation', Jurisdiction: 'Acceptance Test',
      'Period Start': date, 'Period End': date, 'Due Date': date, Status: 'Prepared',
      'Approval Status': 'Owner Approval Required', 'Finalization Allowed': 'No', 'Taxable Sales': 0,
      'Exempt Sales': 0, 'Tax Collected': 0, 'Tax Adjustments': 0, 'Estimated Liability': 0,
      'Payment Recorded': 'No', 'Missing Documents': 'None'
    });
    evidence.created.poId = po['PO ID'];
    evidence.created.expenseId = expense['Expense ID'];
    evidence.created.invoiceId = invoice['Invoice ID'];
    evidence.created.paymentId = payment['Payment ID'];
    evidence.created.payrollId = payroll['Payroll Period ID'];
    evidence.created.taxId = tax['Tax Period ID'];
    return evidence.created;
  });

  const document = run('Private document upload, OCR review, and approval', function () {
    boAssert_(input.document && input.document.fileName && input.document.mimeType && input.document.base64Data, 'A neutral PDF or image fixture is required.');
    const uploaded = boUploadDocument({
      fileName: input.document.fileName,
      mimeType: input.document.mimeType,
      base64Data: input.document.base64Data,
      documentType: input.document.documentType || 'Receipt',
      sourceType: 'Reusable Platform Acceptance',
      sourceId: acceptanceId,
      accessClassification: 'Private Business'
    });
    evidence.created.documentId = uploaded['Document ID'];
    const extraction = boExtractDocument(uploaded['Document ID']);
    boAssert_(extraction && extraction.state === 'Needs Review', 'OCR did not enter review state.');
    const fields = boReadTable_(H38_BO_SHEETS.OCR_FIELDS, { includeVoided: true }).filter(function (row) { return row['Document ID'] === uploaded['Document ID']; });
    boAssert_(fields.length > 0, 'OCR returned no reviewable fields.');
    fields.forEach(function (field) {
      boReviewOcrField(field['OCR Field ID'], field['Suggested Value'] || field['Extracted Value'] || 'Reviewed', 'Reusable platform acceptance review.');
    });
    boApproveDocument(uploaded['Document ID']);
    return { documentId: uploaded['Document ID'], fields: fields.length, state: extraction.state };
  });

  run('Duplicate document protection', function () {
    const before = {};
    boReadTable_(H38_BO_SHEETS.ERROR_LOG, { includeVoided: true }).forEach(function (row) { before[row['Error ID']] = true; });
    let blocked = false;
    try {
      boUploadDocument({
        fileName: input.document.fileName,
        mimeType: input.document.mimeType,
        base64Data: input.document.base64Data,
        documentType: input.document.documentType || 'Receipt',
        sourceType: 'Reusable Platform Duplicate Test',
        sourceId: acceptanceId,
        accessClassification: 'Private Business'
      });
    } catch (error) {
      blocked = /Duplicate upload blocked/.test(error.message);
    }
    boAssert_(blocked, 'Duplicate file was not blocked.');
    resolveExpectedDuplicateErrors(before);
    return 'Duplicate SHA-256 blocked; expected test error resolved';
  });

  run('Nine branded PDFs use the selected business identity', function () {
    const requested = [
      ['Quote', evidence.created.quoteId],
      ['Work Order', evidence.created.workOrderId],
      ['Purchase Order', evidence.created.poId],
      ['Invoice', evidence.created.invoiceId],
      ['Payment Receipt', evidence.created.paymentId],
      ['Expense Report', evidence.created.expenseId],
      ['Job Cost Report', evidence.created.jobId],
      ['Payroll Summary', evidence.created.payrollId],
      ['Tax Preparation Packet', evidence.created.taxId]
    ];
    const files = requested.map(function (item) {
      const file = boGeneratePdf(item[0], item[1]);
      const text = extractPdfText(file.fileId);
      boAssert_(text.indexOf(boBusinessName_()) >= 0, item[0] + ' PDF is missing selected business identity.');
      (input.forbiddenTerms || boPackValue_('isolation.forbiddenTerms', [])).forEach(function (term) { boAssert_(text.indexOf(String(term)) < 0, item[0] + ' PDF leaked a protected identity or resource marker.'); });
      return { documentType: item[0], fileId: file.fileId, fileUrl: file.fileUrl, identityVerified: true };
    });
    evidence.created.pdfFiles = files;
    return files;
  });

  run('Approval, posting, payroll, tax, and money-movement boundaries', function () {
    const context = boGetClientContext();
    boAssert_(context.boundaries.externalActionsEnabled === false, 'External actions unexpectedly enabled.');
    boAssert_(context.boundaries.directPaymentProcessing === false, 'Direct payment processing unexpectedly enabled.');
    boAssert_(context.boundaries.directPayrollFunding === false, 'Direct payroll funding unexpectedly enabled.');
    boAssert_(context.boundaries.directTaxFiling === false, 'Direct tax filing unexpectedly enabled.');
    boAssert_(boFindRecord_(H38_BO_SHEETS.QUOTES, evidence.created.quoteId, { includeVoided: true }).record['Send Allowed'] === 'No', 'Quote send gate opened.');
    boAssert_(boFindRecord_(H38_BO_SHEETS.INVOICES, evidence.created.invoiceId, { includeVoided: true }).record['Send Allowed'] === 'No', 'Invoice send gate opened.');
    boAssert_(boFindRecord_(H38_BO_SHEETS.PAYROLL_PERIODS, evidence.created.payrollId, { includeVoided: true }).record['Export Allowed'] === 'No', 'Payroll export gate opened.');
    boAssert_(boFindRecord_(H38_BO_SHEETS.TAX_PERIODS, evidence.created.taxId, { includeVoided: true }).record['Finalization Allowed'] === 'No', 'Tax finalization gate opened.');
    return context.boundaries;
  });

  run('Responsive Business Office and enabled modules', function () {
    const context = boGetClientContext();
    const enabled = Object.keys(context.modules || {}).filter(function (key) { return context.modules[key] !== false; });
    boAssert_(enabled.indexOf('documents') >= 0 && enabled.indexOf('accounting') >= 0 && enabled.indexOf('payroll') >= 0 && enabled.indexOf('tax') >= 0, 'Required modules are not enabled.');
    return { enabledModules: enabled, branding: context.business.branding };
  });

  run('Soft-void acceptance records and preserve originals', function () {
    createdRecords.slice().reverse().forEach(function (item) {
      try { boSoftVoidRecord_(item.sheetName, item.recordId, 'Reusable platform acceptance complete'); }
      catch (error) { boError_('Acceptance cleanup', item.sheetName, item.recordId, error, 'Warning'); }
    });
    boVoidDocument(document['Document ID'], 'Reusable platform acceptance complete');
    return createdRecords.length + ' records soft-voided; original uploaded file preserved';
  });

  run('Backup, final validation, proof, and error evidence', function () {
    const backup = boCreateBackup('Reusable Platform Acceptance');
    evidence.created.backup = backup;
    const validation = boValidateInstallation();
    boAssert_(validation.valid, 'Final installation validation failed: ' + JSON.stringify(validation));
    const openErrors = boReadTable_(H38_BO_SHEETS.ERROR_LOG, { includeVoided: true }).filter(function (row) { return row.Status !== 'Resolved' && row.Severity !== 'Warning'; });
    boAssert_(!openErrors.length, 'Active non-warning errors found: ' + openErrors.length);
    return { backup: backup, validation: validation, openErrors: 0 };
  });

  boProof_('REUSABLE PLATFORM ACCEPTANCE', 'System', boGetBusinessId_(), evidence.status, JSON.stringify(evidence), owner.Email);
  return evidence;
}
