/** Business Office Platform — connected customer, quote, job, purchasing, and invoice workflows. */

function boCreateCustomerFromRequest(requestId) {
  return boSafeExecute_('Create customer from request', function () {
    const user = boRequirePermission_(BO_SHEETS.CUSTOMERS, 'Create');
    const request = boFindRecord_(BO_SHEETS.REQUESTS, requestId).record;
    const duplicateKey = boGetBusinessId_() + '|' + boNormalizeText_(request.Email).toLowerCase();
    const existing = boReadTable_(BO_SHEETS.CUSTOMERS, { includeVoided: true }).find(function (row) {
      return boNormalizeText_(row.Email).toLowerCase() === boNormalizeText_(request.Email).toLowerCase() && row.Status !== 'Voided';
    });
    if (existing) return existing;
    const contact = boAppendRecord_(BO_SHEETS.CONTACTS, {
      'Contact ID': boId_('CONTACT'),
      'Party Type': 'Customer',
      Name: request.Name,
      'Title / Role': 'Primary Contact',
      Email: request.Email,
      Phone: request.Phone,
      'Preferred Contact': request['Preferred Contact'] || 'Email',
      Status: 'Active',
      Notes: 'Created from request ' + requestId
    }, 'Request conversion');
    const customer = boAppendRecord_(BO_SHEETS.CUSTOMERS, {
      'Customer ID': boId_('CUST'),
      'Customer Number': boGetNextNumber_('Customer'),
      'Display Name': request.Name,
      'Customer Type': 'Individual',
      'Primary Contact ID': contact['Contact ID'],
      Email: request.Email,
      Phone: request.Phone,
      'Payment Terms': 'Net 15',
      'Tax Status': 'Review Required',
      Tags: 'Request Conversion',
      Status: 'Active',
      'Attention Status': 'Needs Attention',
      Notes: 'Duplicate key ' + duplicateKey
    }, 'Request conversion');
    boUpdateRecord_(BO_SHEETS.REQUESTS, requestId, {
      'Customer ID': customer['Customer ID'],
      'Next Action': 'Prepare quote'
    }, 'Request conversion');
    boProof_('CREATE CUSTOMER', 'Request', requestId, 'PASS', customer['Customer ID'], user.Email);
    return customer;
  }, 'Request', requestId);
}

function boCreateQuote(payload) {
  return boSafeExecute_('Create quote', function () {
    const user = boRequirePermission_(BO_SHEETS.QUOTES, 'Create');
    boAssert_(payload && payload.customerId, 'Customer selection is required.');
    boAssert_(Array.isArray(payload.lines) && payload.lines.length, 'At least one quote line is required.');
    const customer = boFindRecord_(BO_SHEETS.CUSTOMERS, payload.customerId).record;
    const quoteId = boId_('QUOTE');
    const quoteNumber = boGetNextNumber_('Quote');
    const quote = boAppendRecord_(BO_SHEETS.QUOTES, {
      'Quote ID': quoteId,
      'Quote Number': quoteNumber,
      'Customer ID': customer['Customer ID'],
      'Job ID': payload.jobId || '',
      'Project Title': payload.projectTitle || 'Customer project',
      'Revision Number': 1,
      'Revision Status': 'Current',
      'Quote Date': payload.quoteDate || Utilities.formatDate(new Date(), boGetTimeZone_(), 'yyyy-MM-dd'),
      'Expiration Date': payload.expirationDate || '',
      Status: 'Draft',
      'Approval Status': boApprovalText_('required'),
      'Send Allowed': 'No',
      'Customer Action': 'Not Sent',
      'Payment Terms': payload.paymentTerms || customer['Payment Terms'] || 'Net 15',
      Scope: payload.scope || '',
      Assumptions: payload.assumptions || '',
      Exclusions: payload.exclusions || '',
      'Internal Notes': payload.internalNotes || '',
      'Customer Notes': payload.customerNotes || '',
      Deposit: boMoney_(payload.deposit || 0),
      'Duplicate Key': boGetBusinessId_() + '|' + quoteNumber + '|1',
      'Created By': user['User ID']
    }, 'Quote creation');
    payload.lines.forEach(function (line, index) {
      const quantity = Number(line.quantity || 0);
      const rate = boMoney_(line.rate || 0);
      const discount = boMoney_(line.discount || 0);
      const taxable = line.taxable === true || line.taxable === 'Yes' ? 'Yes' : 'No';
      const taxRate = Number(line.taxRate || 0);
      const subtotal = boMoney_(quantity * rate - discount);
      const taxAmount = taxable === 'Yes' ? boMoney_(subtotal * taxRate) : 0;
      boAppendRecord_(BO_SHEETS.QUOTE_LINES, {
        'Quote Line ID': boId_('QL'),
        'Quote ID': quoteId,
        'Line Number': index + 1,
        'Product / Service ID': line.catalogId || '',
        Description: line.description || '',
        Quantity: quantity,
        Unit: line.unit || 'each',
        Rate: rate,
        Discount: discount,
        Taxable: taxable,
        'Tax Rate': taxRate,
        'Line Subtotal': subtotal,
        'Tax Amount': taxAmount,
        'Line Total': boMoney_(subtotal + taxAmount),
        'Account Code': line.accountCode || '4000',
        'Job Cost Category': line.jobCostCategory || 'Service Revenue',
        Notes: line.notes || ''
      }, 'Quote creation');
    });
    SpreadsheetApp.flush();
    boProof_('CREATE QUOTE', 'Quote', quoteId, 'PASS', quoteNumber, user.Email);
    return boFindRecord_(BO_SHEETS.QUOTES, quoteId).record;
  }, 'Quote', payload && payload.quoteId);
}

function boReviseQuote(quoteId, changes) {
  return boSafeExecute_('Revise quote', function () {
    const user = boRequirePermission_(BO_SHEETS.QUOTES, 'Edit');
    const original = boFindRecord_(BO_SHEETS.QUOTES, quoteId).record;
    boAssert_(original['Revision Status'] === 'Current', 'Only the current quote revision can be revised.');
    const newId = boId_('QUOTE');
    const nextRevision = Number(original['Revision Number'] || 1) + 1;
    boUpdateRecord_(BO_SHEETS.QUOTES, quoteId, { 'Revision Status': 'Superseded', Status: 'Revised' }, 'Quote revision');
    const newQuote = Object.assign({}, original, changes || {}, {
      'Quote ID': newId,
      'Revision Number': nextRevision,
      'Revision Status': 'Current',
      Status: 'Draft',
      'Approval Status': boApprovalText_('required'),
      'Send Allowed': 'No',
      'Customer Action': 'Not Sent',
      'PDF File ID': '',
      'Duplicate Key': boGetBusinessId_() + '|' + original['Quote Number'] + '|' + nextRevision,
      'Created By': user['User ID']
    });
    delete newQuote.__rowNumber;
    boAppendRecord_(BO_SHEETS.QUOTES, newQuote, 'Quote revision');
    boReadTable_(BO_SHEETS.QUOTE_LINES).filter(function (line) { return line['Quote ID'] === quoteId; }).forEach(function (line) {
      const copy = Object.assign({}, line, { 'Quote Line ID': boId_('QL'), 'Quote ID': newId });
      delete copy.__rowNumber;
      boAppendRecord_(BO_SHEETS.QUOTE_LINES, copy, 'Quote revision');
    });
    boProof_('REVISE QUOTE', 'Quote', newId, 'PASS', 'Revision ' + nextRevision, user.Email);
    return boFindRecord_(BO_SHEETS.QUOTES, newId).record;
  }, 'Quote', quoteId);
}

function boApproveSelectedRecord(recordType, recordId, approvalType, decision, notes) {
  return boSafeExecute_('Owner approval', function () {
    const owner = boRequireOwner_();
    boAssert_(['Approved', 'Rejected'].indexOf(decision) >= 0, 'Decision must be Approved or Rejected.');
    const approval = boReadTable_(BO_SHEETS.APPROVALS, { includeVoided: true }).find(function (row) {
      return row['Record Type'] === recordType && row['Record ID'] === recordId && row['Approval Type'] === approvalType && row.Status === 'Pending';
    });
    const values = {
      'Record Type': recordType,
      'Record ID': recordId,
      'Approval Type': approvalType,
      'Required Role': 'Owner',
      Status: decision === 'Approved' ? 'Complete' : 'Rejected',
      Decision: decision,
      'Decision By': owner['User ID'],
      'Decision Time': boNow_(),
      'Allowed Flag': decision === 'Approved' ? 'Yes' : 'No',
      Notes: notes || ''
    };
    if (approval) boUpdateRecord_(BO_SHEETS.APPROVALS, approval['Approval ID'], values, 'Owner approval');
    else boAppendRecord_(BO_SHEETS.APPROVALS, Object.assign({ 'Approval ID': boId_('APP') }, values), 'Owner approval');
    boApplyApprovalToRecord_(recordType, recordId, approvalType, decision);
    boProof_('OWNER APPROVAL', recordType, recordId, 'PASS', approvalType + ': ' + decision, owner.Email);
    return values;
  }, recordType, recordId);
}

function boApplyApprovalToRecord_(recordType, recordId, approvalType, decision) {
  const approved = decision === 'Approved';
  const map = {
    Quote: { sheet: BO_SHEETS.QUOTES, patch: { 'Approval Status': decision, 'Send Allowed': approved ? 'Yes' : 'No' } },
    Invoice: { sheet: BO_SHEETS.INVOICES, patch: { 'Approval Status': decision, 'Send Allowed': approved ? 'Yes' : 'No' } },
    'Work Order': { sheet: BO_SHEETS.WORK_ORDERS, patch: { 'Approval Status': decision } },
    'Purchase Order': { sheet: BO_SHEETS.PURCHASE_ORDERS, patch: { 'Approval Status': decision } },
    Expense: { sheet: BO_SHEETS.EXPENSES, patch: { 'Approval Status': decision } },
    'Payroll Period': { sheet: BO_SHEETS.PAYROLL_PERIODS, patch: { 'Approval Status': decision, 'Export Allowed': approved ? 'Yes' : 'No' } },
    'Tax Period': { sheet: BO_SHEETS.TAX_PERIODS, patch: { 'Approval Status': decision, 'Finalization Allowed': approved ? 'Yes' : 'No' } },
    'Journal Entry': { sheet: BO_SHEETS.JOURNAL_ENTRIES, patch: { 'Approval Status': decision, 'Posting Allowed': approved ? 'Yes' : 'No' } }
  };
  const target = map[recordType];
  if (target) boUpdateRecord_(target.sheet, recordId, target.patch, 'Approval propagation: ' + approvalType);
}

function boConvertQuoteToWorkOrderAndJob(quoteId) {
  return boSafeExecute_('Quote conversion', function () {
    const user = boRequirePermission_(BO_SHEETS.JOBS, 'Create');
    const quote = boFindRecord_(BO_SHEETS.QUOTES, quoteId).record;
    boAssert_(quote['Approval Status'] === 'Approved', 'The quote must be approved before conversion.');
    const existingJob = boReadTable_(BO_SHEETS.JOBS, { includeVoided: true }).find(function (row) {
      return row['Quote ID'] === quoteId && row.Status !== 'Voided';
    });
    if (existingJob) return { job: existingJob, workOrder: boFindRecord_(BO_SHEETS.WORK_ORDERS, existingJob['Work Order ID']).record, duplicatePrevented: true };
    const jobId = boId_('JOB');
    const workOrderId = boId_('WO');
    const jobNumber = boGetNextNumber_('Job');
    const workOrderNumber = boGetNextNumber_('Work Order');
    const workOrder = boAppendRecord_(BO_SHEETS.WORK_ORDERS, {
      'Work Order ID': workOrderId,
      'Work Order Number': workOrderNumber,
      'Quote ID': quoteId,
      'Job ID': jobId,
      'Customer ID': quote['Customer ID'],
      'Work Requested': quote['Project Title'],
      Scope: quote.Scope,
      'Assigned User ID': user['User ID'],
      Priority: 'Normal',
      Status: 'Open',
      'Approval Status': boApprovalText_('required'),
      'Customer Approval Status': 'Pending',
      'Completion Checklist': 'Inputs; Work; QA; Owner review',
      'Duplicate Key': boGetBusinessId_() + '|' + quoteId + '|WORK-ORDER',
      'Created By': user['User ID']
    }, 'Quote conversion');
    const job = boAppendRecord_(BO_SHEETS.JOBS, {
      'Job ID': jobId,
      'Job Number': jobNumber,
      'Customer ID': quote['Customer ID'],
      'Work Order ID': workOrderId,
      'Quote ID': quoteId,
      'Project Title': quote['Project Title'],
      Status: 'Active',
      Stage: 'Planning',
      Priority: 'Normal',
      'Assigned User ID': user['User ID'],
      'Approval Status': boApprovalText_('required'),
      'Invoice Status': 'Awaiting Invoice',
      'Job Cost Status': 'Open',
      Notes: 'Created from approved quote ' + quote['Quote Number']
    }, 'Quote conversion');
    boUpdateRecord_(BO_SHEETS.QUOTES, quoteId, { 'Job ID': jobId, Status: 'Converted' }, 'Quote conversion');
    boProof_('QUOTE TO JOB', 'Quote', quoteId, 'PASS', jobNumber + ' / ' + workOrderNumber, user.Email);
    return { job: job, workOrder: workOrder, duplicatePrevented: false };
  }, 'Quote', quoteId);
}

function boCreateInvoiceFromJob(jobId) {
  return boSafeExecute_('Job invoice creation', function () {
    const user = boRequirePermission_(BO_SHEETS.INVOICES, 'Create');
    const job = boFindRecord_(BO_SHEETS.JOBS, jobId).record;
    const existing = boReadTable_(BO_SHEETS.INVOICES, { includeVoided: true }).find(function (row) {
      return row['Job ID'] === jobId && row.Status !== 'Voided';
    });
    if (existing) return existing;
    const invoiceId = boId_('INV');
    const invoiceNumber = boGetNextNumber_('Invoice');
    const invoice = boAppendRecord_(BO_SHEETS.INVOICES, {
      'Invoice ID': invoiceId,
      'Invoice Number': invoiceNumber,
      'Customer ID': job['Customer ID'],
      'Job ID': jobId,
      'Quote ID': job['Quote ID'],
      'Invoice Date': Utilities.formatDate(new Date(), boGetTimeZone_(), 'yyyy-MM-dd'),
      'Due Date': '',
      'Payment Terms': 'Net 15',
      Status: 'Draft',
      'Approval Status': boApprovalText_('required'),
      'Send Allowed': 'No',
      'Delivery Status': 'Not Sent',
      'Deposit Applied': 0,
      'Duplicate Key': boGetBusinessId_() + '|' + jobId + '|INVOICE',
      'Created By': user['User ID']
    }, 'Job invoice creation');
    const quoteLines = boReadTable_(BO_SHEETS.QUOTE_LINES).filter(function (line) { return line['Quote ID'] === job['Quote ID']; });
    quoteLines.forEach(function (line, index) {
      boAppendRecord_(BO_SHEETS.INVOICE_LINES, {
        'Invoice Line ID': boId_('INVL'),
        'Invoice ID': invoiceId,
        'Line Number': index + 1,
        'Source Type': 'Quote',
        'Source ID': job['Quote ID'],
        Description: line.Description,
        Quantity: Number(line.Quantity || 0),
        Unit: line.Unit,
        Rate: boMoney_(line.Rate),
        Discount: boMoney_(line.Discount),
        Taxable: line.Taxable,
        'Tax Rate': Number(line['Tax Rate'] || 0),
        'Line Subtotal': boMoney_(line['Line Subtotal']),
        'Tax Amount': boMoney_(line['Tax Amount']),
        'Line Total': boMoney_(line['Line Total']),
        'Revenue Account': line['Account Code'] || '4000',
        'Job ID': jobId,
        Notes: line.Notes || ''
      }, 'Job invoice creation');
    });
    boUpdateRecord_(BO_SHEETS.JOBS, jobId, { 'Invoice Status': 'Draft Invoice Created' }, 'Job invoice creation');
    boProof_('JOB TO INVOICE', 'Job', jobId, 'PASS', invoiceNumber, user.Email);
    return boFindRecord_(BO_SHEETS.INVOICES, invoiceId).record;
  }, 'Job', jobId);
}

function boMatchVendorBillToPurchaseOrder(billId, purchaseOrderId) {
  return boSafeExecute_('Vendor bill matching', function () {
    const user = boRequirePermission_(BO_SHEETS.VENDOR_BILLS, 'Edit');
    const bill = boFindRecord_(BO_SHEETS.VENDOR_BILLS, billId).record;
    const po = boFindRecord_(BO_SHEETS.PURCHASE_ORDERS, purchaseOrderId).record;
    boAssert_(bill['Vendor ID'] === po['Vendor ID'], 'The vendor bill and purchase order have different vendors.');
    const tolerance = 0.02;
    const difference = Math.abs(Number(bill.Total || 0) - Number(po.Total || 0));
    boAssert_(difference <= tolerance, 'The vendor bill total does not match the purchase order within tolerance.');
    boUpdateRecord_(BO_SHEETS.VENDOR_BILLS, billId, { 'PO ID': purchaseOrderId, Status: 'Matched' }, 'Vendor bill matching');
    boUpdateRecord_(BO_SHEETS.PURCHASE_ORDERS, purchaseOrderId, { 'Vendor Bill Status': 'Matched' }, 'Vendor bill matching');
    boProof_('MATCH VENDOR BILL', 'Vendor Bill', billId, 'PASS', purchaseOrderId, user.Email);
    return { billId: billId, purchaseOrderId: purchaseOrderId, difference: difference, matched: true };
  }, 'Vendor Bill', billId);
}

function boConvertReceiptToExpense(receiptId) {
  return boSafeExecute_('Receipt to expense', function () {
    const user = boRequirePermission_(BO_SHEETS.EXPENSES, 'Create');
    const receipt = boFindRecord_(BO_SHEETS.RECEIPTS, receiptId).record;
    boAssert_(receipt['Approval Status'] === 'Approved', 'Receipt review and approval are required before expense creation.');
    const existing = boReadTable_(BO_SHEETS.EXPENSES, { includeVoided: true }).find(function (row) {
      return row['Receipt ID'] === receiptId && row.Status !== 'Voided';
    });
    if (existing) return existing;
    const expense = boAppendRecord_(BO_SHEETS.EXPENSES, {
      'Expense ID': boId_('EXP'),
      'Receipt ID': receiptId,
      'Vendor ID': receipt['Vendor ID'],
      Date: receipt.Date,
      Description: 'Expense from receipt ' + (receipt['Receipt Number'] || receiptId),
      'Expense Category': receipt['Expense Category'],
      'Account Code': receipt['Account Code'],
      'Customer ID': receipt['Customer ID'],
      'Job ID': receipt['Job ID'],
      'Payment Method': receipt['Payment Method'],
      Subtotal: boMoney_(receipt.Subtotal),
      Tax: boMoney_(receipt.Tax),
      Total: boMoney_(receipt.Total),
      Reimbursable: receipt.Reimbursable,
      'Billable to Customer': receipt['Billable to Customer'],
      'Approval Status': boApprovalText_('required'),
      'Posting Status': 'Not Posted',
      'Duplicate Key': boGetBusinessId_() + '|' + receiptId,
      'Correction Version': 1
    }, 'Receipt to expense');
    boProof_('RECEIPT TO EXPENSE', 'Receipt', receiptId, 'PASS', expense['Expense ID'], user.Email);
    return expense;
  }, 'Receipt', receiptId);
}

function boRecordPayment(payload) {
  return boSafeExecute_('Record payment', function () {
    const user = boRequirePermission_(BO_SHEETS.PAYMENTS, 'Create');
    const invoice = boFindRecord_(BO_SHEETS.INVOICES, payload.invoiceId).record;
    const amount = boMoney_(payload.amount);
    boAssert_(amount > 0, 'Payment amount must be greater than zero.');
    boAssert_(amount <= Number(invoice['Balance Due'] || 0) + 0.01, 'Payment exceeds the invoice balance.');
    const payment = boAppendRecord_(BO_SHEETS.PAYMENTS, {
      'Payment ID': boId_('PAY'),
      'Invoice ID': invoice['Invoice ID'],
      'Customer ID': invoice['Customer ID'],
      'Job ID': invoice['Job ID'],
      'Payment Date': payload.paymentDate || Utilities.formatDate(new Date(), boGetTimeZone_(), 'yyyy-MM-dd'),
      Amount: amount,
      'Payment Method': payload.paymentMethod || 'Other',
      'Transaction Reference': payload.transactionReference || '',
      'Deposit Account': payload.depositAccount || '1000',
      Status: 'Recorded',
      'Approval Status': boApprovalText_('required'),
      'Posting Status': 'Not Posted',
      'Duplicate Key': boGetBusinessId_() + '|' + boNormalizeText_(payload.transactionReference || payload.invoiceId + '|' + amount),
      Notes: payload.notes || ''
    }, 'Payment record');
    boProof_('RECORD PAYMENT', 'Invoice', invoice['Invoice ID'], 'PASS', payment['Payment ID'], user.Email);
    return payment;
  }, 'Invoice', payload && payload.invoiceId);
}

function boPrepareCustomerAction(recordType, recordId) {
  const map = {
    Quote: { sheet: BO_SHEETS.QUOTES, allowed: 'Send Allowed' },
    Invoice: { sheet: BO_SHEETS.INVOICES, allowed: 'Send Allowed' },
    'Payment Receipt': { sheet: BO_SHEETS.PAYMENTS, allowed: 'Delivery Allowed' }
  };
  const target = map[recordType];
  boAssert_(target, 'Unsupported customer action type.');
  const user = boRequireRestrictedArea_('send');
  const record = boFindRecord_(target.sheet, recordId).record;
  boAssert_(record[target.allowed] === 'Yes', target.allowed + ' must explicitly equal Yes.');
  boAssert_(!BO_PLATFORM.EXTERNAL_ACTIONS_ENABLED, 'External actions remain locked in this build.');
  const packageData = { recordType: recordType, recordId: recordId, approved: true, externalActionPerformed: false };
  boProof_('PREPARE CUSTOMER ACTION', recordType, recordId, 'PASS', 'Prepared only; no customer message sent.', user.Email);
  return packageData;
}
