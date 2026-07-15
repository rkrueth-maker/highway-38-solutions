/** Business Office Platform — payroll preparation and tax preparation support. */

function boCalculatePayrollLine_(input) {
  const regularHours = Number(input.regularHours || 0);
  const overtimeHours = Number(input.overtimeHours || 0);
  const hourlyRate = boMoney_(input.hourlyRate || 0);
  const overtimeMultiplier = Number(input.overtimeMultiplier || 1.5);
  const salaryPay = boMoney_(input.salaryPay || 0);
  const reimbursements = boMoney_(input.reimbursements || 0);
  const otherPay = boMoney_(input.otherPay || 0);
  const deductions = boMoney_(input.deductions || 0);
  const employerTaxRate = Number(input.employerTaxRate == null ? 0.0765 : input.employerTaxRate);
  const regularPay = boMoney_(regularHours * hourlyRate);
  const overtimePay = boMoney_(overtimeHours * hourlyRate * overtimeMultiplier);
  const grossPay = boMoney_(regularPay + overtimePay + salaryPay + otherPay);
  const netPreparationAmount = boMoney_(grossPay + reimbursements - deductions);
  const employerTaxEstimate = boMoney_(grossPay * employerTaxRate);
  const employerCostEstimate = boMoney_(grossPay + employerTaxEstimate + reimbursements);
  return {
    regularHours: regularHours,
    overtimeHours: overtimeHours,
    regularPay: regularPay,
    overtimePay: overtimePay,
    salaryPay: salaryPay,
    reimbursements: reimbursements,
    otherPay: otherPay,
    grossPay: grossPay,
    deductions: deductions,
    netPreparationAmount: netPreparationAmount,
    employerTaxEstimate: employerTaxEstimate,
    employerCostEstimate: employerCostEstimate
  };
}

function boPreparePayrollPeriod(payload) {
  return boSafeExecute_('Prepare payroll period', function () {
    const user = boRequireRestrictedArea_('payroll');
    boRequirePermission_('Employees, Time, Payroll Preparation', 'Create');
    boAssert_(payload && payload.periodStart && payload.periodEnd && payload.payDate, 'Payroll period dates are required.');
    const periodId = boId_('PAYROLL');
    const period = boAppendRecord_(BO_SHEETS.PAYROLL_PERIODS, {
      'Payroll Period ID': periodId,
      'Period Start': payload.periodStart,
      'Period End': payload.periodEnd,
      'Pay Date': payload.payDate,
      Status: 'Prepared',
      'Approval Status': boApprovalText_('required'),
      'Export Allowed': 'No',
      'Payroll Provider': payload.provider || 'Provider Export Only'
    }, 'Payroll preparation');
    const timeRows = boReadTable_(BO_SHEETS.TIME_ENTRIES).filter(function (row) {
      return row['Approval Status'] === 'Approved' && row.Date >= payload.periodStart && row.Date <= payload.periodEnd;
    });
    const employees = boReadTable_(BO_SHEETS.EMPLOYEES).filter(function (row) { return row.Status === 'Active'; });
    employees.forEach(function (employee) {
      const employeeTime = timeRows.filter(function (row) { return row['Employee ID'] === employee['Employee ID']; });
      const regularHours = employeeTime.reduce(function (sum, row) { return sum + Number(row['Regular Hours'] || 0); }, 0);
      const overtimeHours = employeeTime.reduce(function (sum, row) { return sum + Number(row['Overtime Hours'] || 0); }, 0);
      const deductions = boReadTable_(BO_SHEETS.PAYROLL_DEDUCTIONS).filter(function (row) {
        return row['Employee ID'] === employee['Employee ID'] && (row['Payroll Period ID'] === periodId || row.Status === 'Recurring');
      }).reduce(function (sum, row) { return sum + Number(row.Amount || 0); }, 0);
      const calculated = boCalculatePayrollLine_({
        regularHours: regularHours,
        overtimeHours: overtimeHours,
        hourlyRate: employee['Hourly Rate'],
        overtimeMultiplier: employee['Overtime Multiplier'] || 1.5,
        salaryPay: employee['Pay Type'] === 'Salary' ? Number(employee['Salary Rate'] || 0) : 0,
        reimbursements: 0,
        deductions: deductions
      });
      boAppendRecord_(BO_SHEETS.PAYROLL_LINES, {
        'Payroll Line ID': boId_('PAYLINE'),
        'Payroll Period ID': periodId,
        'Employee ID': employee['Employee ID'],
        'Regular Hours': calculated.regularHours,
        'Overtime Hours': calculated.overtimeHours,
        'Regular Pay': calculated.regularPay,
        'Overtime Pay': calculated.overtimePay,
        'Salary Pay': calculated.salaryPay,
        Reimbursements: calculated.reimbursements,
        'Other Pay': calculated.otherPay,
        'Gross Pay': calculated.grossPay,
        Deductions: calculated.deductions,
        'Net Preparation Amount': calculated.netPreparationAmount,
        'Employer Tax Estimate': calculated.employerTaxEstimate,
        'Employer Cost Estimate': calculated.employerCostEstimate,
        'YTD Gross': calculated.grossPay,
        'YTD Deductions': calculated.deductions,
        'YTD Employer Cost': calculated.employerCostEstimate,
        'Approval Status': boApprovalText_('required'),
        Notes: 'Prepared from approved time entries; no funds moved.'
      }, 'Payroll preparation');
    });
    SpreadsheetApp.flush();
    boProof_('PREPARE PAYROLL', 'Payroll Period', periodId, 'PASS', 'No funds moved; provider export blocked.', user.Email);
    return boFindRecord_(BO_SHEETS.PAYROLL_PERIODS, periodId).record;
  }, 'Payroll Period', payload && payload.periodId);
}

function boExportPayrollProviderCsv(periodId) {
  return boSafeExecute_('Payroll provider export', function () {
    const user = boRequireRestrictedArea_('payroll');
    boRequireRestrictedArea_('export');
    const period = boFindRecord_(BO_SHEETS.PAYROLL_PERIODS, periodId).record;
    boAssert_(period['Approval Status'] === 'Approved', 'Payroll approval is required before export.');
    boAssert_(period['Export Allowed'] === 'Yes', 'Export Allowed must explicitly equal Yes.');
    boAssert_(!BO_PLATFORM.DIRECT_PAYROLL_FUNDING, 'This system does not move payroll funds.');
    const lines = boReadTable_(BO_SHEETS.PAYROLL_LINES).filter(function (row) { return row['Payroll Period ID'] === periodId; });
    const header = ['Employee ID', 'Regular Hours', 'Overtime Hours', 'Gross Pay', 'Reimbursements', 'Deductions', 'Prepared Net Amount', 'Employer Tax Estimate'];
    const csvRows = [header].concat(lines.map(function (line) {
      return [line['Employee ID'], line['Regular Hours'], line['Overtime Hours'], line['Gross Pay'], line.Reimbursements, line.Deductions, line['Net Preparation Amount'], line['Employer Tax Estimate']];
    }));
    const csv = csvRows.map(function (row) {
      return row.map(function (value) { return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    const folder = DriveApp.getFolderById(boGetFolderId_(BO_PLATFORM.EXPORT_FOLDER_PROPERTY));
    const file = folder.createFile('payroll-provider-export-' + periodId + '.csv', csv, MimeType.CSV);
    boUpdateRecord_(BO_SHEETS.PAYROLL_PERIODS, periodId, { 'Export File ID': file.getId(), Status: 'Exported' }, 'Payroll provider export');
    boAppendRecord_(BO_SHEETS.EXPORT_JOBS, {
      'Export Job ID': boId_('EXPORT'),
      'Export Type': 'Payroll Provider CSV',
      'Filter JSON': JSON.stringify({ payrollPeriodId: periodId }),
      Status: 'Complete',
      'File ID': file.getId(),
      'Rows Exported': lines.length,
      'Approval Status': period['Approval Status'],
      'Export Allowed': period['Export Allowed'],
      'Created By': user['User ID']
    }, 'Payroll provider export');
    boProof_('EXPORT PAYROLL', 'Payroll Period', periodId, 'PASS', file.getId() + '; no funds moved.', user.Email);
    return { fileId: file.getId(), fileUrl: file.getUrl(), rows: lines.length, fundsMoved: false };
  }, 'Payroll Period', periodId);
}

function boPrepareSalesTaxPeriod(payload) {
  return boSafeExecute_('Prepare sales tax period', function () {
    const user = boRequireRestrictedArea_('tax');
    boRequirePermission_('Sales Tax and Year-End Preparation', 'Create');
    boAssert_(payload && payload.periodStart && payload.periodEnd && payload.jurisdiction, 'Tax period dates and jurisdiction are required.');
    const invoices = boReadTable_(BO_SHEETS.INVOICES).filter(function (invoice) {
      return invoice['Invoice Date'] >= payload.periodStart && invoice['Invoice Date'] <= payload.periodEnd && invoice.Status !== 'Voided';
    });
    const taxableSales = boMoney_(invoices.reduce(function (sum, invoice) { return sum + Number(invoice.Subtotal || 0); }, 0));
    const taxCollected = boMoney_(invoices.reduce(function (sum, invoice) { return sum + Number(invoice['Tax Amount'] || 0); }, 0));
    const period = boAppendRecord_(BO_SHEETS.TAX_PERIODS, {
      'Tax Period ID': boId_('TAX'),
      'Tax Type': 'Sales Tax',
      Jurisdiction: payload.jurisdiction,
      'Period Start': payload.periodStart,
      'Period End': payload.periodEnd,
      'Due Date': payload.dueDate || '',
      Status: 'Prepared',
      'Approval Status': boApprovalText_('required'),
      'Finalization Allowed': 'No',
      'Taxable Sales': taxableSales,
      'Exempt Sales': 0,
      'Tax Collected': taxCollected,
      'Tax Adjustments': boMoney_(payload.adjustments || 0),
      'Estimated Liability': boMoney_(taxCollected + Number(payload.adjustments || 0)),
      'Payment Recorded': 0,
      'Missing Documents': payload.missingDocuments || ''
    }, 'Sales tax preparation');
    boProof_('PREPARE SALES TAX', 'Tax Period', period['Tax Period ID'], 'PASS', 'Preparation only; no filing.', user.Email);
    return period;
  }, 'Tax Period', payload && payload.periodId);
}

function boFinalizeTaxPreparationReport(periodId) {
  return boSafeExecute_('Finalize tax preparation report', function () {
    const user = boRequireRestrictedArea_('tax');
    boRequireRestrictedArea_('export');
    const period = boFindRecord_(BO_SHEETS.TAX_PERIODS, periodId).record;
    boAssert_(period['Approval Status'] === 'Approved', 'Owner approval is required before report finalization.');
    boAssert_(period['Finalization Allowed'] === 'Yes', 'Finalization Allowed must explicitly equal Yes.');
    boAssert_(!BO_PLATFORM.DIRECT_TAX_FILING, 'This system does not file tax returns.');
    const pdf = boGeneratePdf('Tax Preparation Packet', periodId);
    boUpdateRecord_(BO_SHEETS.TAX_PERIODS, periodId, { Status: 'Finalized', 'Report File ID': pdf.fileId }, 'Tax report finalization');
    boProof_('FINALIZE TAX REPORT', 'Tax Period', periodId, 'PASS', pdf.fileId + '; no filing performed.', user.Email);
    return Object.assign({ filed: false, adviceProvided: false }, pdf);
  }, 'Tax Period', periodId);
}

function boGetTaxPreparationSummary() {
  boRequireRestrictedArea_('tax');
  return {
    taxPrep: boReadTable_(BO_SHEETS.TAX_PREP, { allBusinesses: true, includeVoided: true }),
    salesTax: boReadTable_(BO_SHEETS.SALES_TAX_REPORT, { allBusinesses: true, includeVoided: true }),
    contractors: boReadTable_(BO_SHEETS.CONTRACTORS),
    missingDocuments: boReadTable_(BO_SHEETS.MISSING_DOCUMENTS),
    assets: boReadTable_(BO_SHEETS.ASSETS),
    mileage: boReadTable_(BO_SHEETS.MILEAGE),
    homeOffice: boReadTable_(BO_SHEETS.HOME_OFFICE),
    boundary: BO_PLATFORM.TAX_BOUNDARY
  };
}
