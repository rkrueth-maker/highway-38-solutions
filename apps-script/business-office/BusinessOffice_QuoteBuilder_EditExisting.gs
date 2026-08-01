/** Editable saved-quote support for the direct Quote Builder. */

function boQuoteBuilderEditDate_(value) {
  const raw = boNormalizeText_(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return us[3] + '-' + String(us[1]).padStart(2, '0') + '-' + String(us[2]).padStart(2, '0');
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, boTimeZone_(), 'yyyy-MM-dd');
  return '';
}

function boQuoteBuilderEditableStatus_(status) {
  const normalized = boNormalizeText_(status || 'Draft');
  return ['Accepted', 'Converted', 'Voided'].indexOf(normalized) < 0;
}

function boQuoteBuilderEditableQuote(payload) {
  payload = payload || {};
  const quoteId = boNormalizeText_(payload.quoteId || payload);
  return boSafeExecute_('Load editable quote', function () {
    boQuoteBuilderRequireAction_('Edit');
    boAssert_(quoteId, 'Quote ID is required.');
    const quoteSnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTES, { includeVoided: true });
    const quote = quoteSnapshot.rows.find(function (row) {
      return row['Quote ID'] === quoteId && row['Is Voided'] !== 'Yes' && row.Status !== 'Voided';
    });
    boAssert_(quote, 'The quote was not found.');
    boAssert_(boQuoteBuilderEditableStatus_(quote.Status), 'Accepted or converted quotes cannot be changed in place. Duplicate the quote to create a new revision.');

    const lineSnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTE_LINES, { includeVoided: true });
    const lines = lineSnapshot.rows.filter(function (row) {
      return row['Quote ID'] === quoteId && row['Is Voided'] !== 'Yes' && row.Status !== 'Voided';
    }).sort(function (a, b) {
      return Number(a['Line Number'] || 0) - Number(b['Line Number'] || 0);
    }).map(function (row) {
      return {
        lineId: row['Quote Line ID'],
        catalogId: row['Product / Service ID'] || '',
        description: row.Description || '',
        quantity: Number(String(row.Quantity || 0).replace(/[$,]/g, '')) || 0,
        unit: row.Unit || 'each',
        rate: Number(String(row.Rate || 0).replace(/[$,]/g, '')) || 0,
        discount: Number(String(row.Discount || 0).replace(/[$,]/g, '')) || 0,
        taxable: row.Taxable === 'Yes' || row.Taxable === true,
        taxRate: Number(String(row['Tax Rate'] || 0).replace(/[$,%]/g, '')) || 0,
        accountCode: row['Account Code'] || '4000',
        jobCostCategory: row['Job Cost Category'] || 'Service Revenue',
        notes: row.Notes || ''
      };
    });

    const customerSnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.CUSTOMERS);
    const customers = customerSnapshot.rows.filter(function (row) {
      return boNormalizeText_(row.Status || 'Active') === 'Active';
    }).map(function (row) {
      return {
        customerId: row['Customer ID'],
        displayName: row['Display Name'] || row.Email || row['Customer ID'],
        paymentTerms: row['Payment Terms'] || 'Net 15'
      };
    }).slice(0, 500);

    return {
      editToken: quote['Updated Time'] || quote['Created Time'] || quote['Quote Date'] || '',
      quote: {
        quoteId: quote['Quote ID'],
        quoteNumber: quote['Quote Number'],
        customerId: quote['Customer ID'],
        projectTitle: quote['Project Title'] || '',
        quoteDate: boQuoteBuilderEditDate_(quote['Quote Date']),
        expirationDate: boQuoteBuilderEditDate_(quote['Expiration Date']),
        status: quote.Status || 'Draft',
        approvalStatus: quote['Approval Status'] || 'Owner Approval Required',
        paymentTerms: quote['Payment Terms'] || 'Net 15',
        scope: quote.Scope || '',
        assumptions: quote.Assumptions || '',
        exclusions: quote.Exclusions || '',
        customerNotes: quote['Customer Notes'] || '',
        internalNotes: quote['Internal Notes'] || '',
        deposit: Number(String(quote.Deposit || 0).replace(/[$,]/g, '')) || 0
      },
      lines: lines.length ? lines : [{ description: '', quantity: 1, unit: 'each', rate: 0, discount: 0, taxable: false, taxRate: 0 }],
      customers: customers
    };
  }, 'Quote', quoteId);
}

function boQuoteBuilderNormalizeEditLine_(line, index, quoteId) {
  line = line || {};
  const quantity = Number(line.quantity || 0);
  const rate = boMoney_(line.rate || 0);
  const discount = boMoney_(line.discount || 0);
  const taxable = line.taxable === true || line.taxable === 'Yes';
  let taxRate = Number(line.taxRate || 0);
  if (taxRate > 1) taxRate = taxRate / 100;
  const lineSubtotal = boMoney_(Math.max(0, quantity * rate - discount));
  const taxAmount = taxable ? boMoney_(lineSubtotal * taxRate) : 0;
  return {
    'Quote Line ID': boNormalizeText_(line.lineId) || boId_('QL'),
    'Quote ID': quoteId,
    'Line Number': index + 1,
    'Product / Service ID': boNormalizeText_(line.catalogId),
    Description: boNormalizeText_(line.description),
    Quantity: quantity,
    Unit: boNormalizeText_(line.unit) || 'each',
    Rate: rate,
    Discount: discount,
    Taxable: taxable ? 'Yes' : 'No',
    'Tax Rate': taxRate,
    'Line Subtotal': lineSubtotal,
    'Tax Amount': taxAmount,
    'Line Total': boMoney_(lineSubtotal + taxAmount),
    'Account Code': boNormalizeText_(line.accountCode) || '4000',
    'Job Cost Category': boNormalizeText_(line.jobCostCategory) || 'Service Revenue',
    Notes: boNormalizeText_(line.notes),
    Status: 'Active',
    'Is Voided': 'No'
  };
}

function boQuoteBuilderUpdateEditableQuote(payload) {
  payload = payload || {};
  const quoteId = boNormalizeText_(payload.quoteId);
  return boSafeExecute_('Update editable quote', function () {
    const access = boQuoteBuilderRequireAction_('Edit');
    boAssert_(quoteId, 'Quote ID is required.');
    boAssert_(payload.customerId, 'Customer selection is required.');
    boAssert_(boNormalizeText_(payload.projectTitle), 'Project title is required.');
    boAssert_(Array.isArray(payload.lines), 'Quote lines are required.');

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const quoteSnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTES, { includeVoided: true });
      const quote = quoteSnapshot.rows.find(function (row) {
        return row['Quote ID'] === quoteId && row['Is Voided'] !== 'Yes' && row.Status !== 'Voided';
      });
      boAssert_(quote, 'The quote was not found.');
      boAssert_(boQuoteBuilderEditableStatus_(quote.Status), 'Accepted or converted quotes cannot be changed in place. Duplicate the quote to create a new revision.');
      const currentToken = quote['Updated Time'] || quote['Created Time'] || quote['Quote Date'] || '';
      if (payload.editToken) boAssert_(String(payload.editToken) === String(currentToken), 'This quote changed after you opened it. Reopen the quote before saving your edits.');

      const customerSnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.CUSTOMERS);
      const customer = customerSnapshot.rows.find(function (row) {
        return row['Customer ID'] === payload.customerId && row['Is Voided'] !== 'Yes' && row.Status !== 'Voided';
      });
      boAssert_(customer, 'The selected customer was not found.');

      const submitted = payload.lines.map(function (line, index) {
        return boQuoteBuilderNormalizeEditLine_(line, index, quoteId);
      }).filter(function (line) {
        return line.Description && Number(line.Quantity || 0) > 0;
      });
      boAssert_(submitted.length, 'At least one quote line is required.');

      let subtotal = 0;
      let tax = 0;
      submitted.forEach(function (line) {
        subtotal += Number(line['Line Subtotal'] || 0);
        tax += Number(line['Tax Amount'] || 0);
      });
      subtotal = boMoney_(subtotal);
      tax = boMoney_(tax);
      const total = boMoney_(subtotal + tax);

      const updatedQuote = boUpdateRecord_(H38_BO_SHEETS.QUOTES, quoteId, {
        'Customer ID': payload.customerId,
        'Project Title': boNormalizeText_(payload.projectTitle),
        'Quote Date': boNormalizeText_(payload.quoteDate),
        'Expiration Date': boNormalizeText_(payload.expirationDate),
        'Payment Terms': boNormalizeText_(payload.paymentTerms) || customer['Payment Terms'] || 'Net 15',
        Scope: boNormalizeText_(payload.scope),
        Assumptions: boNormalizeText_(payload.assumptions),
        Exclusions: boNormalizeText_(payload.exclusions),
        'Customer Notes': boNormalizeText_(payload.customerNotes),
        'Internal Notes': boNormalizeText_(payload.internalNotes),
        Deposit: boMoney_(payload.deposit || 0),
        Subtotal: subtotal,
        Tax: tax,
        Total: total,
        Status: 'Draft',
        'Approval Status': 'Owner Approval Required',
        'Send Allowed': 'No',
        'Customer Action': 'Not Sent',
        'PDF File ID': ''
      }, 'Quote Builder owner edit');

      const lineSnapshot = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTE_LINES, { includeVoided: true });
      const oldLines = lineSnapshot.rows.filter(function (row) { return row['Quote ID'] === quoteId; });
      oldLines.slice().sort(function (a, b) { return b.__rowNumber - a.__rowNumber; }).forEach(function (row) {
        lineSnapshot.sheet.deleteRow(row.__rowNumber);
      });
      const refreshedLines = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTE_LINES, { includeVoided: true });
      boQuoteBuilderAppendBatch_(refreshedLines, submitted);
      SpreadsheetApp.flush();

      boAudit_('REPLACE', H38_BO_SHEETS.QUOTE_LINES, quoteId, oldLines, submitted, 'Quote Builder owner edit');
      boProof_('EDIT QUOTE', 'Quote', quoteId, 'PASS', (updatedQuote['Quote Number'] || quoteId) + '; ' + submitted.length + ' lines; returned to Draft for owner review.', access.user.email);
      boQuoteBuilderInvalidateCache_('quotes');
      return {
        quoteId: quoteId,
        quoteNumber: updatedQuote['Quote Number'] || '',
        status: 'Draft',
        approvalStatus: 'Owner Approval Required',
        subtotal: subtotal,
        tax: tax,
        total: total,
        lineCount: submitted.length
      };
    } finally {
      lock.releaseLock();
    }
  }, 'Quote', quoteId);
}
