/** Business Office Platform — calculated owner dashboard metrics. */

function boDashboardRows_(sheetName, includeControlledTests) {
  const rows = boReadTable_(sheetName, { includeVoided: false });
  return includeControlledTests ? rows : rows.filter(function (row) { return !boDashboardIsControlledTest_(row); });
}

function boDashboardIsControlledTest_(row) {
  const text = Object.keys(row || {}).filter(function (key) { return key !== '__rowNumber'; }).map(function (key) {
    return boNormalizeText_(row[key]);
  }).join('|').toUpperCase();
  return text.indexOf('-TEST-') >= 0 ||
    text.indexOf('LIVE-ACCEPTANCE') >= 0 ||
    text.indexOf('CONTROLLED TEST') >= 0 ||
    text.indexOf('@EXAMPLE.INVALID') >= 0 ||
    /(?:RECEIPT|WORK-ORDER|VENDOR-INVOICE)-\d{8,}\.(?:JPG|JPEG|PNG|PDF)/.test(text);
}

function boDashboardNumber_(value) {
  const normalized = String(value == null ? '' : value).replace(/[$,]/g, '').trim();
  const number = Number(normalized || 0);
  return Number.isFinite(number) ? number : 0;
}

function boDashboardMoney_(value) {
  const amount = boDashboardNumber_(value);
  return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function boDashboardOpen_(value) {
  const status = boNormalizeText_(value).toLowerCase();
  return !/(closed|complete|completed|cancelled|canceled|voided|rejected|inactive)/.test(status);
}

function boDashboardNeedsApproval_(value) {
  const status = boNormalizeText_(value).toLowerCase();
  return !/(approved|not required|complete|completed|posted)/.test(status);
}

function boDashboardCard_(spreadsheet, label, value, detail, sheetName) {
  return {
    'Business Area': label,
    'Live Count': value,
    'What Needs Attention': detail
  };
}

function boGetOwnerDashboard_() {
  boRequirePermission_(BO_SHEETS.DASHBOARD, 'View');
  const spreadsheet = boGetSpreadsheet_();
  const requests = boDashboardRows_(BO_SHEETS.REQUESTS);
  const customers = boDashboardRows_(BO_SHEETS.CUSTOMERS);
  const workOrders = boDashboardRows_(BO_SHEETS.WORK_ORDERS);
  const jobs = boDashboardRows_(BO_SHEETS.JOBS);
  const invoices = boDashboardRows_(BO_SHEETS.INVOICES);
  const payments = boDashboardRows_(BO_SHEETS.PAYMENTS);
  const expenses = boDashboardRows_(BO_SHEETS.EXPENSES);
  const approvals = boDashboardRows_(BO_SHEETS.APPROVALS);
  const documents = boDashboardRows_(BO_SHEETS.DOCUMENTS);
  const payroll = boDashboardRows_(BO_SHEETS.PAYROLL_PERIODS);
  const taxPeriods = boDashboardRows_(BO_SHEETS.TAX_PERIODS);
  const errors = boDashboardRows_(BO_SHEETS.ERROR_LOG, true);

  const newRequests = requests.filter(function (row) {
    return boDashboardOpen_(row.Status) && !row['Customer ID'];
  });
  const activeCustomers = customers.filter(function (row) { return boDashboardOpen_(row.Status || 'Active'); });
  const attentionCustomers = activeCustomers.filter(function (row) {
    const attention = boNormalizeText_(row['Attention Status']).toLowerCase();
    return attention && !/(none|normal|clear|ok)/.test(attention);
  });
  const openWorkOrders = workOrders.filter(function (row) { return boDashboardOpen_(row.Status); });
  const activeJobs = jobs.filter(function (row) { return boDashboardOpen_(row.Status); });
  const jobsAwaitingInvoice = activeJobs.filter(function (row) {
    const status = boNormalizeText_(row['Invoice Status']).toLowerCase();
    return !/(invoiced|paid|complete|completed)/.test(status);
  });
  const outstandingInvoices = invoices.filter(function (row) {
    return boDashboardNumber_(row['Balance Due']) > 0 && boDashboardOpen_(row.Status);
  });
  const overdueInvoices = outstandingInvoices.filter(function (row) { return boDashboardNumber_(row['Overdue Days']) > 0; });
  const outstandingAmount = outstandingInvoices.reduce(function (sum, row) { return sum + boDashboardNumber_(row['Balance Due']); }, 0);
  const paymentAmount = payments.filter(function (row) { return boDashboardOpen_(row.Status || 'Recorded'); }).reduce(function (sum, row) {
    return sum + boDashboardNumber_(row.Amount);
  }, 0);
  const expensesAwaitingApproval = expenses.filter(function (row) {
    return boDashboardNeedsApproval_(row['Approval Status']) || boNormalizeText_(row['Posting Status']).toLowerCase() !== 'posted';
  });
  const expenseApprovalAmount = expensesAwaitingApproval.reduce(function (sum, row) { return sum + boDashboardNumber_(row.Total); }, 0);
  const pendingApprovals = approvals.filter(function (row) {
    return boNormalizeText_(row.Status).toLowerCase() === 'pending' || !boNormalizeText_(row.Decision);
  });
  const documentsNeedingReview = documents.filter(function (row) {
    const review = boNormalizeText_(row['Review Status']).toLowerCase();
    const ocr = boNormalizeText_(row['OCR State']).toLowerCase();
    return review !== 'approved' || /(review|conversion|processing)/.test(ocr);
  });
  const payrollAwaitingApproval = payroll.filter(function (row) {
    return boDashboardNeedsApproval_(row['Approval Status']) || boNormalizeText_(row['Export Allowed']).toLowerCase() !== 'yes';
  });
  const taxAwaitingApproval = taxPeriods.filter(function (row) {
    return boDashboardNeedsApproval_(row['Approval Status']) || boNormalizeText_(row['Finalization Allowed']).toLowerCase() !== 'yes';
  });
  const openErrors = errors.filter(function (row) {
    return boNormalizeText_(row.Status).toLowerCase() !== 'resolved' && boNormalizeText_(row.Severity).toLowerCase() !== 'warning';
  });
  const jobRevenue = activeJobs.reduce(function (sum, row) { return sum + boDashboardNumber_(row.Revenue); }, 0);
  const jobCost = activeJobs.reduce(function (sum, row) { return sum + boDashboardNumber_(row['Total Cost']); }, 0);
  const jobProfit = activeJobs.reduce(function (sum, row) { return sum + boDashboardNumber_(row.Profit); }, 0);

  return [
    boDashboardCard_(spreadsheet, 'New requests', String(newRequests.length), newRequests.length ? boApprovalText_('dashboardReview') : 'No new customer requests are waiting.', BO_SHEETS.REQUESTS),
    boDashboardCard_(spreadsheet, 'Active customers', String(activeCustomers.length), attentionCustomers.length ? attentionCustomers.length + ' customer record(s) need attention.' : 'No customer attention flags are open.', BO_SHEETS.CUSTOMERS),
    boDashboardCard_(spreadsheet, 'Open work orders', String(openWorkOrders.length), openWorkOrders.length ? 'Review due dates, assignments, and completion status.' : 'No work orders are currently open.', BO_SHEETS.WORK_ORDERS),
    boDashboardCard_(spreadsheet, 'Active jobs', String(activeJobs.length), activeJobs.length ? jobsAwaitingInvoice.length + ' active job(s) are not fully invoiced.' : 'No active jobs are currently recorded.', BO_SHEETS.JOBS),
    boDashboardCard_(spreadsheet, 'Jobs awaiting invoice', String(jobsAwaitingInvoice.length), jobsAwaitingInvoice.length ? 'Create or finish invoices for completed billable work.' : 'No jobs are waiting for an invoice.', BO_SHEETS.JOBS),
    boDashboardCard_(spreadsheet, 'Outstanding invoices', boDashboardMoney_(outstandingAmount), outstandingInvoices.length + ' invoice(s) still have a balance due.', BO_SHEETS.INVOICES),
    boDashboardCard_(spreadsheet, 'Overdue invoices', String(overdueInvoices.length), overdueInvoices.length ? 'Review overdue balances before any customer follow-up.' : 'No invoices are marked overdue.', BO_SHEETS.INVOICES),
    boDashboardCard_(spreadsheet, 'Payments recorded', boDashboardMoney_(paymentAmount), payments.length + ' operational payment record(s) are on file.', BO_SHEETS.PAYMENTS),
    boDashboardCard_(spreadsheet, 'Expenses awaiting approval', String(expensesAwaitingApproval.length), boDashboardMoney_(expenseApprovalAmount) + ' is not fully approved and posted.', BO_SHEETS.EXPENSES),
    boDashboardCard_(spreadsheet, 'Documents needing review', String(documentsNeedingReview.length), documentsNeedingReview.length ? 'Review OCR suggestions and approve selected documents.' : 'No uploaded documents are waiting for review.', BO_SHEETS.DOCUMENTS),
    boDashboardCard_(spreadsheet, 'Pending owner approvals', String(pendingApprovals.length), pendingApprovals.length ? 'Approval gates remain closed until you decide.' : 'No approval decisions are waiting.', BO_SHEETS.APPROVALS),
    boDashboardCard_(spreadsheet, 'Payroll preparation', String(payrollAwaitingApproval.length), payrollAwaitingApproval.length ? 'Prepared payroll requires owner approval before export.' : 'No payroll preparation is waiting.', BO_SHEETS.PAYROLL_PERIODS),
    boDashboardCard_(spreadsheet, 'Tax preparation', String(taxAwaitingApproval.length), taxAwaitingApproval.length ? 'Prepared tax records require review; direct filing remains disabled.' : 'No tax preparation period is waiting.', BO_SHEETS.TAX_PERIODS),
    boDashboardCard_(spreadsheet, 'Open system errors', String(openErrors.length), openErrors.length ? 'Resolve active errors before relying on affected workflows.' : 'No active non-warning errors are open.', BO_SHEETS.ERROR_LOG),
    boDashboardCard_(spreadsheet, 'Active-job revenue', boDashboardMoney_(jobRevenue), 'Revenue recorded on active operational jobs.', BO_SHEETS.JOBS),
    boDashboardCard_(spreadsheet, 'Active-job cost', boDashboardMoney_(jobCost), 'Labor, materials, equipment, purchases, and expenses on active jobs.', BO_SHEETS.JOBS),
    boDashboardCard_(spreadsheet, 'Active-job profit', boDashboardMoney_(jobProfit), jobProfit < 0 ? 'Active jobs currently show a loss and need review.' : 'Current active-job revenue minus recorded costs.', BO_SHEETS.JOBS)
  ];
}
