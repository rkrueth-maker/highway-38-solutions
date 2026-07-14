/** Highway 38 Business Office — double-entry preparation, posting, periods, corrections, voids, and reports. */

function boCalculateEntryTotals_(lines) {
  const totals = (lines || []).reduce(function (acc, line) {
    acc.debit += boMoney_(line.debit || line.Debit || 0);
    acc.credit += boMoney_(line.credit || line.Credit || 0);
    return acc;
  }, { debit: 0, credit: 0 });
  totals.debit = boMoney_(totals.debit);
  totals.credit = boMoney_(totals.credit);
  totals.difference = boMoney_(totals.debit - totals.credit);
  totals.balanced = Math.abs(totals.difference) < 0.005;
  return totals;
}

function boPrepareJournalEntry(payload) {
  return boSafeExecute_('Prepare journal entry', function () {
    const user = boRequireRestrictedArea_('posting');
    boRequirePermission_(H38_BO_SHEETS.JOURNAL_ENTRIES, 'Create');
    boAssert_(payload && Array.isArray(payload.lines) && payload.lines.length >= 2, 'A journal entry requires at least two lines.');
    const totals = boCalculateEntryTotals_(payload.lines);
    boAssert_(totals.balanced, 'Journal entry debits and credits must balance. Difference: ' + totals.difference);
    const entryId = boId_('JE');
    const entryNumber = boGetNextNumber_('Journal Entry');
    const entry = boAppendRecord_(H38_BO_SHEETS.JOURNAL_ENTRIES, {
      'Journal Entry ID': entryId,
      'Entry Number': entryNumber,
      'Entry Date': payload.entryDate || Utilities.formatDate(new Date(), H38_BO.TIME_ZONE, 'yyyy-MM-dd'),
      'Source Type': payload.sourceType || 'Manual',
      'Source ID': payload.sourceId || '',
      Description: payload.description || '',
      Status: 'Prepared',
      'Approval Status': 'Owner Approval Required',
      'Posting Allowed': 'No',
      'Accounting Period ID': payload.accountingPeriodId,
      'Correction Version': 1,
      'Total Debit': totals.debit,
      'Total Credit': totals.credit,
      'Balance Difference': totals.difference,
      Balanced: 'Yes',
      'Created By': user['User ID']
    }, 'Journal preparation');
    payload.lines.forEach(function (line, index) {
      const account = boFindAccount_(line.accountCode || line['Account Code']);
      boAppendRecord_(H38_BO_SHEETS.JOURNAL_LINES, {
        'Journal Line ID': boId_('JL'),
        'Journal Entry ID': entryId,
        'Line Number': index + 1,
        'Account ID': account['Account ID'],
        'Account Code': account['Account Code'],
        'Account Name': account['Account Name'],
        'Account Type': account['Account Type'],
        Debit: boMoney_(line.debit || line.Debit || 0),
        Credit: boMoney_(line.credit || line.Credit || 0),
        'Customer ID': line.customerId || '',
        'Vendor ID': line.vendorId || '',
        'Job ID': line.jobId || '',
        'Employee ID': line.employeeId || '',
        'Contractor ID': line.contractorId || '',
        'Tax Period ID': line.taxPeriodId || '',
        Memo: line.memo || ''
      }, 'Journal preparation');
    });
    boProof_('PREPARE JOURNAL', 'Journal Entry', entryId, 'PASS', entryNumber + ' balanced', user.Email);
    return entry;
  }, 'Journal Entry', payload && payload.entryId);
}

function boFindAccount_(accountCode) {
  const account = boReadTable_(H38_BO_SHEETS.CHART_OF_ACCOUNTS, { includeVoided: true }).find(function (row) {
    return row['Account Code'] === String(accountCode) && row.Active === 'Yes';
  });
  boAssert_(account, 'Active account not found: ' + accountCode);
  return account;
}

function boGetAccountingPeriod_(periodId) {
  const period = boFindRecord_(H38_BO_SHEETS.ACCOUNTING_PERIODS, periodId, { includeVoided: true }).record;
  boAssert_(period.Status === 'Open', 'Accounting period is locked or closed: ' + periodId);
  return period;
}

function boPostJournalEntry(entryId) {
  return boSafeExecute_('Post journal entry', function () {
    const user = boRequireRestrictedArea_('posting');
    boRequirePermission_(H38_BO_SHEETS.JOURNAL_ENTRIES, 'Post');
    const entry = boFindRecord_(H38_BO_SHEETS.JOURNAL_ENTRIES, entryId, { includeVoided: true }).record;
    boAssert_(entry['Approval Status'] === 'Approved', 'Owner approval is required before posting.');
    boAssert_(entry['Posting Allowed'] === 'Yes', 'Posting Allowed must explicitly equal Yes.');
    boAssert_(entry.Balanced === 'Yes' && Math.abs(Number(entry['Balance Difference'] || 0)) < 0.005, 'Journal entry is not balanced.');
    boGetAccountingPeriod_(entry['Accounting Period ID']);
    boAssert_(entry.Status !== 'Posted', 'Journal entry is already posted.');
    const updated = boUpdateRecord_(H38_BO_SHEETS.JOURNAL_ENTRIES, entryId, {
      Status: 'Posted',
      'Posted By': user['User ID'],
      'Posted Time': boNow_()
    }, 'Ledger posting');
    boProof_('POST JOURNAL', 'Journal Entry', entryId, 'PASS', 'Balanced, approved, open period.', user.Email);
    return updated;
  }, 'Journal Entry', entryId);
}

function boPrepareInvoicePosting(invoiceId) {
  const invoice = boFindRecord_(H38_BO_SHEETS.INVOICES, invoiceId).record;
  boAssert_(invoice['Approval Status'] === 'Approved', 'Invoice approval is required before accounting preparation.');
  const lines = [
    { accountCode: '1100', debit: invoice.Total, customerId: invoice['Customer ID'], jobId: invoice['Job ID'], memo: 'Invoice receivable' },
    { accountCode: '4000', credit: boMoney_(Number(invoice.Total || 0) - Number(invoice['Tax Amount'] || 0)), customerId: invoice['Customer ID'], jobId: invoice['Job ID'], memo: 'Invoice revenue' }
  ];
  if (Number(invoice['Tax Amount'] || 0) > 0) {
    lines.push({ accountCode: '2100', credit: invoice['Tax Amount'], customerId: invoice['Customer ID'], jobId: invoice['Job ID'], memo: 'Sales tax liability' });
  }
  return boPrepareJournalEntry({
    entryDate: invoice['Invoice Date'],
    sourceType: 'Invoice',
    sourceId: invoiceId,
    description: 'Post invoice ' + invoice['Invoice Number'],
    accountingPeriodId: boResolveAccountingPeriod_(invoice['Invoice Date']),
    lines: lines
  });
}

function boPrepareExpensePosting(expenseId) {
  const expense = boFindRecord_(H38_BO_SHEETS.EXPENSES, expenseId).record;
  boAssert_(expense['Approval Status'] === 'Approved', 'Expense approval is required before accounting preparation.');
  return boPrepareJournalEntry({
    entryDate: expense.Date,
    sourceType: 'Expense',
    sourceId: expenseId,
    description: 'Post expense ' + expenseId,
    accountingPeriodId: boResolveAccountingPeriod_(expense.Date),
    lines: [
      { accountCode: expense['Account Code'], debit: expense.Total, vendorId: expense['Vendor ID'], jobId: expense['Job ID'], memo: expense.Description },
      { accountCode: '1000', credit: expense.Total, vendorId: expense['Vendor ID'], jobId: expense['Job ID'], memo: 'Cash or card outflow preparation' }
    ]
  });
}

function boPreparePaymentPosting(paymentId) {
  const payment = boFindRecord_(H38_BO_SHEETS.PAYMENTS, paymentId).record;
  boAssert_(payment['Approval Status'] === 'Approved', 'Payment record approval is required before accounting preparation.');
  return boPrepareJournalEntry({
    entryDate: payment['Payment Date'],
    sourceType: 'Payment',
    sourceId: paymentId,
    description: 'Post payment ' + paymentId,
    accountingPeriodId: boResolveAccountingPeriod_(payment['Payment Date']),
    lines: [
      { accountCode: payment['Deposit Account'] || '1000', debit: payment.Amount, customerId: payment['Customer ID'], jobId: payment['Job ID'], memo: 'Payment received' },
      { accountCode: '1100', credit: payment.Amount, customerId: payment['Customer ID'], jobId: payment['Job ID'], memo: 'Reduce receivable' }
    ]
  });
}

function boResolveAccountingPeriod_(dateValue) {
  const date = new Date(dateValue);
  boAssert_(!isNaN(date.getTime()), 'Valid accounting date is required.');
  const period = boReadTable_(H38_BO_SHEETS.ACCOUNTING_PERIODS, { includeVoided: true }).find(function (row) {
    const start = new Date(row['Start Date']);
    const end = new Date(row['End Date']);
    return row.Status === 'Open' && date >= start && date <= end;
  });
  boAssert_(period, 'No open accounting period includes ' + dateValue + '.');
  return period['Accounting Period ID'];
}

function boReverseJournalEntry(entryId, reason) {
  return boSafeExecute_('Reverse journal entry', function () {
    const user = boRequireRestrictedArea_('posting');
    const entry = boFindRecord_(H38_BO_SHEETS.JOURNAL_ENTRIES, entryId, { includeVoided: true }).record;
    boAssert_(entry.Status === 'Posted', 'Only posted journal entries can be reversed.');
    boAssert_(!entry['Reversal Entry ID'], 'This journal entry already has a reversal.');
    const lines = boReadTable_(H38_BO_SHEETS.JOURNAL_LINES, { includeVoided: true }).filter(function (line) {
      return line['Journal Entry ID'] === entryId;
    }).map(function (line) {
      return {
        accountCode: line['Account Code'],
        debit: Number(line.Credit || 0),
        credit: Number(line.Debit || 0),
        customerId: line['Customer ID'],
        vendorId: line['Vendor ID'],
        jobId: line['Job ID'],
        employeeId: line['Employee ID'],
        contractorId: line['Contractor ID'],
        taxPeriodId: line['Tax Period ID'],
        memo: 'Reversal: ' + (reason || line.Memo || '')
      };
    });
    const reversal = boPrepareJournalEntry({
      entryDate: Utilities.formatDate(new Date(), H38_BO.TIME_ZONE, 'yyyy-MM-dd'),
      sourceType: 'Reversal',
      sourceId: entryId,
      description: 'Reverse ' + entry['Entry Number'] + ': ' + boNormalizeText_(reason),
      accountingPeriodId: boResolveAccountingPeriod_(Utilities.formatDate(new Date(), H38_BO.TIME_ZONE, 'yyyy-MM-dd')),
      lines: lines
    });
    boUpdateRecord_(H38_BO_SHEETS.JOURNAL_ENTRIES, entryId, { 'Reversal Entry ID': reversal['Journal Entry ID'] }, 'Journal reversal');
    boProof_('PREPARE REVERSAL', 'Journal Entry', entryId, 'PASS', reversal['Journal Entry ID'], user.Email);
    return reversal;
  }, 'Journal Entry', entryId);
}

function boLockAccountingPeriod(periodId, notes) {
  const owner = boRequireOwner_();
  const period = boFindRecord_(H38_BO_SHEETS.ACCOUNTING_PERIODS, periodId, { includeVoided: true }).record;
  boAssert_(period.Status === 'Open', 'Accounting period is not open.');
  const unposted = boReadTable_(H38_BO_SHEETS.JOURNAL_ENTRIES, { includeVoided: true }).filter(function (entry) {
    return entry['Accounting Period ID'] === periodId && entry.Status !== 'Posted' && entry.Status !== 'Voided';
  });
  boAssert_(!unposted.length, 'The accounting period contains unposted journal entries.');
  const updated = boUpdateRecord_(H38_BO_SHEETS.ACCOUNTING_PERIODS, periodId, {
    Status: 'Locked',
    'Locked By': owner['User ID'],
    'Locked Time': boNow_(),
    Notes: notes || ''
  }, 'Accounting period lock');
  boProof_('LOCK PERIOD', 'Accounting Period', periodId, 'PASS', 'Period locked after unposted-entry check.', owner.Email);
  return updated;
}

function boGetAccountingReports() {
  boRequirePermission_('Accounting Reports', 'View');
  return {
    profitAndLoss: boReadTable_(H38_BO_SHEETS.PNL, { allBusinesses: true, includeVoided: true }),
    balanceSheet: boReadTable_(H38_BO_SHEETS.BALANCE_SHEET, { allBusinesses: true, includeVoided: true }),
    cashFlow: boReadTable_(H38_BO_SHEETS.CASH_FLOW, { allBusinesses: true, includeVoided: true }),
    arAging: boReadTable_(H38_BO_SHEETS.AR_AGING, { allBusinesses: true, includeVoided: true }),
    apAging: boReadTable_(H38_BO_SHEETS.AP_AGING, { allBusinesses: true, includeVoided: true }),
    jobProfitability: boReadTable_(H38_BO_SHEETS.JOB_PROFITABILITY, { allBusinesses: true, includeVoided: true })
  };
}

function boValidateLedger() {
  boRequirePermission_('Accounting Reports', 'View');
  const entries = boReadTable_(H38_BO_SHEETS.JOURNAL_ENTRIES, { includeVoided: true });
  const invalid = entries.filter(function (entry) {
    return entry.Status !== 'Voided' && (entry.Balanced !== 'Yes' || Math.abs(Number(entry['Balance Difference'] || 0)) >= 0.005);
  });
  const pnl = boGetSheet_(H38_BO_SHEETS.PNL).getRange('A1:B8').getDisplayValues();
  const balanceSheet = boGetSheet_(H38_BO_SHEETS.BALANCE_SHEET).getRange('A1:B9').getDisplayValues();
  const difference = Number(balanceSheet[8][1] || 0);
  return {
    valid: invalid.length === 0 && Math.abs(difference) < 0.005,
    invalidEntries: invalid.map(function (entry) { return entry['Journal Entry ID']; }),
    balanceSheetDifference: difference,
    pnl: pnl,
    balanceSheet: balanceSheet
  };
}
