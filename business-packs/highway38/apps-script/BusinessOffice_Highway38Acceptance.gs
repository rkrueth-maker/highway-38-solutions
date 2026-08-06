/** Highway 38 Business Office — deployed live acceptance tests. */

function boRunLiveAcceptance(payload) {
  const owner = boRequireOwner_();
  const data = payload || {};
  const evidence = { status: 'PASS', testedAt: boNow_(), testedBy: owner.Email, tests: [], created: {} };
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
  function uploadFixture(key, documentType, sourceType, sourceId, accessClassification) {
    const fixture = data[key];
    boAssert_(fixture && fixture.fileName && fixture.mimeType && fixture.base64Data, 'Missing fixture: ' + key);
    return boUploadDocument({
      fileName: fixture.fileName,
      mimeType: fixture.mimeType,
      base64Data: fixture.base64Data,
      documentType: documentType,
      sourceType: sourceType,
      sourceId: sourceId || '',
      accessClassification: accessClassification || 'Private Business'
    });
  }
  function extractReviewApprove(document) {
    const extraction = boExtractDocument(document['Document ID']);
    boAssert_(extraction && extraction.state === 'Needs Review', 'OCR extraction did not enter review state.');
    const fields = boReadTable_(H38_BO_SHEETS.OCR_FIELDS, { includeVoided: true }).filter(function (row) { return row['Document ID'] === document['Document ID']; });
    boAssert_(fields.length > 0, 'OCR returned no reviewable fields for ' + document['Document ID']);
    fields.forEach(function (field) {
      const approved = field['Suggested Value'] || field['Extracted Value'] || 'Manual Review Required';
      boReviewOcrField(field['OCR Field ID'], approved, 'Automated live acceptance review using extracted fixture text.');
    });
    const approvedDocument = boApproveDocument(document['Document ID']);
    return { extraction: extraction, fieldCount: fields.length, document: approvedDocument };
  }

  const receipt = run('Live receipt-photo upload', function () {
    const document = uploadFixture('receiptImage', 'Receipt', 'Mobile Camera Capture Test', 'LIVE-ACCEPTANCE-RECEIPT', 'Private Financial');
    evidence.created.receiptDocumentId = document['Document ID'];
    return document;
  });
  run('Receipt-photo OCR extraction and human review gate', function () { return extractReviewApprove(receipt); });
  const postedReceipt = run('Approved receipt data posting', function () {
    const record = boPostApprovedDocument(receipt['Document ID'], 'Receipt');
    boUpdateRecord_(H38_BO_SHEETS.RECEIPTS, record['Receipt ID'], {
      'Vendor ID': 'VEND-TEST-001', 'Customer ID': 'CUST-TEST-001', 'Job ID': 'JOB-TEST-001',
      'Expense Category': 'Materials', 'Account Code': '5100', 'Payment Method': 'Business Card',
      Reimbursable: 'No', 'Billable to Customer': 'Yes', 'Approval Status': 'Approved', 'Posting Status': 'Posted'
    }, 'Live acceptance receipt classification');
    evidence.created.receiptId = record['Receipt ID'];
    return boFindRecord_(H38_BO_SHEETS.RECEIPTS, record['Receipt ID']).record;
  });
  run('Receipt-to-expense conversion', function () {
    const expense = boConvertReceiptToExpense(postedReceipt['Receipt ID']);
    evidence.created.expenseId = expense['Expense ID'];
    return expense;
  });

  const workOrder = run('Live work-order camera image upload', function () {
    const document = uploadFixture('workOrderImage', 'Work Order', 'Mobile Camera Capture Test', 'WO-TEST-001', 'Private Customer');
    evidence.created.workOrderDocumentId = document['Document ID'];
    return document;
  });
  run('Work-order-photo OCR extraction and review', function () { return extractReviewApprove(workOrder); });

  const vendorInvoice = run('Live vendor-invoice PDF upload', function () {
    const document = uploadFixture('vendorInvoicePdf', 'Vendor Invoice', 'Vendor Invoice Upload Test', 'BILL-TEST-001', 'Private Financial');
    evidence.created.vendorInvoiceDocumentId = document['Document ID'];
    return document;
  });
  run('Vendor-invoice PDF OCR extraction and review', function () { return extractReviewApprove(vendorInvoice); });

  run('Duplicate upload protection', function () {
    const before = boReadTable_(H38_BO_SHEETS.ERROR_LOG, { includeVoided: true });
    let blocked = false;
    try { uploadFixture('receiptImage', 'Receipt', 'Duplicate Test', 'LIVE-ACCEPTANCE-DUPLICATE', 'Private Financial'); }
    catch (error) { blocked = /Duplicate upload blocked/.test(error.message); }
    boAssert_(blocked, 'Duplicate file was not blocked.');
    const beforeIds = {}; before.forEach(function (row) { beforeIds[row['Error ID']] = true; });
    boReadTable_(H38_BO_SHEETS.ERROR_LOG, { includeVoided: true }).forEach(function (row) {
      if (beforeIds[row['Error ID']]) return;
      if (row.Source !== 'Document upload' || !/Duplicate upload blocked/.test(row.Message || '')) return;
      boUpdateRecord_(H38_BO_SHEETS.ERROR_LOG, row['Error ID'], {
        Status: 'Resolved', 'Resolved By': owner.Email, 'Resolved Time': boNow_(),
        Notes: 'Expected live-acceptance duplicate-protection result; no duplicate file was created.'
      }, 'Resolve expected duplicate acceptance result');
    });
    return 'Duplicate SHA-256 blocked and expected test error resolved';
  });

  run('Approval gates remain closed', function () {
    const quote = boFindRecord_(H38_BO_SHEETS.QUOTES, 'QUOTE-TEST-001', { includeVoided: true }).record;
    const invoice = boFindRecord_(H38_BO_SHEETS.INVOICES, 'INV-TEST-001', { includeVoided: true }).record;
    const payroll = boFindRecord_(H38_BO_SHEETS.PAYROLL_PERIODS, 'PAYROLL-TEST-001', { includeVoided: true }).record;
    const tax = boFindRecord_(H38_BO_SHEETS.TAX_PERIODS, 'TAX-TEST-001', { includeVoided: true }).record;
    boAssert_(quote['Send Allowed'] === 'No', 'Quote send gate opened unexpectedly.');
    boAssert_(invoice['Send Allowed'] === 'No', 'Invoice send gate opened unexpectedly.');
    boAssert_(payroll['Export Allowed'] === 'No', 'Payroll export gate opened unexpectedly.');
    boAssert_(tax['Finalization Allowed'] === 'No', 'Tax finalization gate opened unexpectedly.');
    return 'Quote, invoice, payroll, and tax gates closed';
  });

  const pdfTypes = [['Quote','QUOTE-TEST-001'],['Work Order','WO-TEST-001'],['Purchase Order','PO-TEST-001'],['Invoice','INV-TEST-001'],['Payment Receipt','PAY-TEST-001'],['Expense Report','EXP-TEST-001'],['Job Cost Report','JOB-TEST-001'],['Payroll Summary','PAYROLL-TEST-001'],['Tax Preparation Packet','TAX-TEST-001']];
  run('Live branded Apps Script PDF generation', function () {
    const files = pdfTypes.map(function (item) { return boGeneratePdf(item[0], item[1]); });
    files.forEach(function (file) { boAssert_(file && file.fileId && file.fileUrl && file.sent === false && file.delivered === false, 'PDF generation evidence is incomplete.'); });
    evidence.created.pdfFiles = files;
    return files;
  });

  run('Core customer, vendor, quote, work-order, job, purchase, invoice, payment, and job-cost records', function () {
    const required = [[H38_BO_SHEETS.CUSTOMERS,'CUST-TEST-001'],[H38_BO_SHEETS.VENDORS,'VEND-TEST-001'],[H38_BO_SHEETS.QUOTES,'QUOTE-TEST-001'],[H38_BO_SHEETS.WORK_ORDERS,'WO-TEST-001'],[H38_BO_SHEETS.JOBS,'JOB-TEST-001'],[H38_BO_SHEETS.PURCHASE_ORDERS,'PO-TEST-001'],[H38_BO_SHEETS.VENDOR_BILLS,'BILL-TEST-001'],[H38_BO_SHEETS.INVOICES,'INV-TEST-001'],[H38_BO_SHEETS.PAYMENTS,'PAY-TEST-001']];
    required.forEach(function (item) { boFindRecord_(item[0], item[1], { includeVoided: true }); });
    const job = boFindRecord_(H38_BO_SHEETS.JOBS, 'JOB-TEST-001', { includeVoided: true }).record;
    boAssert_(Number(job.Revenue) === 1070, 'Job revenue mismatch.');
    boAssert_(Number(job['Total Cost']) >= 1164, 'Job cost did not include connected labor and expense data.');
    boAssert_(Number(job.Profit) === Number(job.Revenue) - Number(job['Total Cost']), 'Job profit formula mismatch.');
    const bill = boFindRecord_(H38_BO_SHEETS.VENDOR_BILLS, 'BILL-TEST-001', { includeVoided: true }).record;
    const purchaseOrder = boFindRecord_(H38_BO_SHEETS.PURCHASE_ORDERS, 'PO-TEST-001', { includeVoided: true }).record;
    boAssert_(Number(bill.Total) === Number(purchaseOrder.Total), 'Controlled vendor bill and purchase order totals must match before acceptance.');
    const matched = boMatchVendorBillToPurchaseOrder('BILL-TEST-001', 'PO-TEST-001');
    boAssert_(matched.matched === true, 'Vendor bill matching failed.');
    return {
      records: required.length,
      jobRevenue: job.Revenue,
      totalCost: job['Total Cost'],
      profit: job.Profit,
      vendorBillTotal: bill.Total,
      purchaseOrderTotal: purchaseOrder.Total,
      matchDifference: matched.difference
    };
  });

  run('Role and permission enforcement', function () {
    const users = boReadTable_(H38_BO_SHEETS.USERS, { includeVoided: true });
    const roles = boReadTable_(H38_BO_SHEETS.ROLES, { includeVoided: true }).filter(function (row) { return row.Active === 'Yes'; });
    boAssert_(roles.length === 6, 'Expected six active roles.');
    boAssert_(users.some(function (row) { return row.Email.toLowerCase() === owner.Email.toLowerCase(); }), 'Owner user record missing.');
    const testUsers = { owner:{'Role ID':'ROLE-OWNER'}, admin:{'Role ID':'ROLE-ADMIN'}, staff:{'Role ID':'ROLE-STAFF'}, bookkeeper:{'Role ID':'ROLE-BOOKKEEPER'}, payroll:{'Role ID':'ROLE-PAYROLL'}, viewer:{'Role ID':'ROLE-VIEWER'} };
    boAssert_(boHasPermission_(testUsers.owner, 'All Modules', 'Configure'), 'Owner configuration access missing.');
    boAssert_(boHasPermission_(testUsers.staff, 'Quotes', 'Create'), 'Staff quote-create access missing.');
    boAssert_(!boHasPermission_(testUsers.staff, 'Accounting', 'Post'), 'Staff posting must be denied.');
    boAssert_(boHasPermission_(testUsers.bookkeeper, 'Accounting', 'Post'), 'Bookkeeper approved posting access missing.');
    boAssert_(boHasPermission_(testUsers.payroll, 'Payroll Preparation', 'Create'), 'Payroll preparation access missing.');
    boAssert_(!boHasPermission_(testUsers.payroll, 'Invoices', 'Send'), 'Payroll customer-send access must be denied.');
    boAssert_(boHasPermission_(testUsers.viewer, 'Operational Records', 'View'), 'Viewer read access missing.');
    boAssert_(!boHasPermission_(testUsers.viewer, 'Operational Records', 'Create'), 'Viewer create access must be denied.');
    boAssert_(!boHasPermission_(testUsers.admin, 'User Access', 'Configure'), 'Administrator user-access configuration must be denied by default.');
    return 'Six-role permission matrix verified';
  });

  run('Accounting, payroll, tax, proof, error, and rollback evidence', function () {
    const ledger = boValidateLedger();
    boAssert_(ledger.valid, 'Ledger does not balance.');
    const payroll = boCalculatePayrollLine_({ regularHours:40, overtimeHours:5, hourlyRate:20, overtimeMultiplier:1.5, reimbursements:50, deductions:100 });
    boAssert_(payroll.grossPay === 950 && payroll.netPreparationAmount === 900, 'Payroll calculation mismatch.');
    const tax = boFindRecord_(H38_BO_SHEETS.TAX_PERIODS, 'TAX-TEST-001', { includeVoided: true }).record;
    boAssert_(Number(tax['Estimated Liability']) === 70, 'Tax preparation liability mismatch.');
    const backup = boCreateBackup('Live Acceptance');
    evidence.created.backup = backup;
    const openErrors = boReadTable_(H38_BO_SHEETS.ERROR_LOG, { includeVoided: true }).filter(function (row) { return row.Status !== 'Resolved' && row.Severity !== 'Warning'; });
    boAssert_(openErrors.length === 0, 'Active non-warning errors found: ' + openErrors.length);
    return { ledger: ledger, payroll: payroll, taxLiability: 70, backup: backup };
  });

  boProof_('LIVE ACCEPTANCE', 'System', boGetBusinessId_(), evidence.status, JSON.stringify(evidence), owner.Email);
  return evidence;
}
