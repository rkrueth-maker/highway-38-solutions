/** Business Office — non-destructive, business-pack-aware self-test suite. */

function boRunSelfTest() {
  const user = boGetCurrentUser_();
  const tests = [];
  function test(name, fn) {
    try {
      const evidence = fn();
      tests.push({ name: name, status: 'PASS', evidence: evidence == null ? '' : evidence });
    } catch (error) {
      tests.push({ name: name, status: 'FAIL', evidence: error.message });
    }
  }

  test('Selected business identity and authorized role', function () {
    const role = boGetRole_(user['Role ID']);
    const allowedRoles = boRoleNames_();
    boAssert_(role && allowedRoles.indexOf(role['Role Name']) >= 0, 'Invalid role for selected business pack.');
    boAssert_(user['Business ID'] === boGetBusinessId_(), 'Authorized user belongs to another business installation.');
    return boBusinessName_() + ' / ' + role['Role Name'] + ' / ' + boPackValue_('packId', '');
  });

  test('Required workbook, storage, and business-pack configuration', function () {
    const result = boValidateInstallation();
    boAssert_(result.valid, 'Installation validation failed: ' + JSON.stringify(result));
    return result.folderChecks.length + ' private folders checked; pack ' + result.packId;
  });

  test('Configured product and bundle counts', function () {
    const rows = boReadTable_(H38_BO_SHEETS.PRODUCTS, { includeVoided: true });
    const products = rows.filter(function (row) { return row['Record Type'] === 'Product' && row.Active === 'Yes'; });
    const bundles = rows.filter(function (row) { return row['Record Type'] === 'Bundle' && row.Active === 'Yes'; });
    const required = boCatalogRequirements_();
    boAssert_(products.length === required.products, 'Expected ' + required.products + ' products; found ' + products.length);
    boAssert_(bundles.length === required.bundles, 'Expected ' + required.bundles + ' bundles; found ' + bundles.length);
    return products.length + ' products / ' + bundles.length + ' bundles / mode ' + required.mode;
  });

  test('Business-record isolation', function () {
    const mismatches = [];
    Object.keys(H38_BO_SHEETS).forEach(function (key) {
      const sheetName = H38_BO_SHEETS[key];
      const headers = boHeaders_(sheetName);
      if (headers.indexOf('Business ID') < 0) return;
      boReadTable_(sheetName, { includeVoided: true, allBusinesses: true }).forEach(function (row) {
        if (row['Business ID'] && row['Business ID'] !== boGetBusinessId_()) mismatches.push(sheetName + ':' + row['Business ID']);
      });
    });
    boAssert_(!mismatches.length, 'Cross-business rows found: ' + mismatches.slice(0, 10).join(', '));
    return 'All business-scoped rows belong to ' + boGetBusinessId_();
  });

  test('Dedicated resource isolation', function () {
    const result = boValidateResourceIsolation();
    boAssert_(result.valid, 'Resource isolation failed: ' + JSON.stringify(result));
    return JSON.stringify(result.resources);
  });

  test('Double-entry ledger balance', function () {
    const result = boValidateLedger();
    boAssert_(result.valid, 'Ledger validation failed.');
    return 'Balance sheet difference ' + result.balanceSheetDifference;
  });

  test('Payroll calculation', function () {
    const result = boCalculatePayrollLine_({ regularHours: 40, overtimeHours: 5, hourlyRate: 20, overtimeMultiplier: 1.5, reimbursements: 50, deductions: 100 });
    boAssert_(result.grossPay === 950, 'Expected gross pay 950; got ' + result.grossPay);
    boAssert_(result.netPreparationAmount === 900, 'Expected prepared net 900; got ' + result.netPreparationAmount);
    boAssert_(result.employerTaxEstimate === 72.68, 'Expected employer estimate 72.68; got ' + result.employerTaxEstimate);
    return JSON.stringify(result);
  });

  test('External action boundaries', function () {
    boAssert_(H38_BO.EXTERNAL_ACTIONS_ENABLED === false && boPackValue_('workflow.externalActionsEnabled', true) === false, 'External actions must remain disabled.');
    boAssert_(H38_BO.DIRECT_PAYMENT_PROCESSING === false && boPackValue_('boundaries.directPaymentProcessing', true) === false, 'Direct payment processing must remain disabled.');
    boAssert_(H38_BO.DIRECT_PAYROLL_FUNDING === false && boPackValue_('boundaries.directPayrollFunding', true) === false, 'Direct payroll funding must remain disabled.');
    boAssert_(H38_BO.DIRECT_TAX_FILING === false && boPackValue_('boundaries.directTaxFiling', true) === false, 'Direct tax filing must remain disabled.');
    return 'All external execution boundaries locked';
  });

  test('Approval gates are closed unless explicitly approved', function () {
    const violations = [];
    boReadTable_(H38_BO_SHEETS.QUOTES, { includeVoided: true }).forEach(function (row) {
      if (row['Send Allowed'] === 'Yes' && row['Approval Status'] !== 'Approved') violations.push('Quote ' + row['Quote ID']);
    });
    boReadTable_(H38_BO_SHEETS.INVOICES, { includeVoided: true }).forEach(function (row) {
      if (row['Send Allowed'] === 'Yes' && row['Approval Status'] !== 'Approved') violations.push('Invoice ' + row['Invoice ID']);
    });
    boReadTable_(H38_BO_SHEETS.PAYROLL_PERIODS, { includeVoided: true }).forEach(function (row) {
      if (row['Export Allowed'] === 'Yes' && row['Approval Status'] !== 'Approved') violations.push('Payroll ' + row['Payroll Period ID']);
    });
    boReadTable_(H38_BO_SHEETS.TAX_PERIODS, { includeVoided: true }).forEach(function (row) {
      if (row['Finalization Allowed'] === 'Yes' && row['Approval Status'] !== 'Approved') violations.push('Tax ' + row['Tax Period ID']);
    });
    boAssert_(!violations.length, 'Approval-gate violations: ' + violations.join(', '));
    return 'No quote, invoice, payroll, or tax action bypasses approval';
  });

  test('Document upload policy', function () {
    boAssert_(H38_BO.ALLOWED_MIME_TYPES.indexOf('application/pdf') >= 0, 'PDF missing.');
    boAssert_(H38_BO.ALLOWED_MIME_TYPES.indexOf('image/jpeg') >= 0, 'JPEG missing.');
    boAssert_(H38_BO.ALLOWED_MIME_TYPES.indexOf('image/png') >= 0, 'PNG missing.');
    boAssert_(H38_BO.MAX_UPLOAD_BYTES === 20 * 1024 * 1024, 'Unexpected upload limit.');
    return 'PDF/JPEG/PNG supported; HEIC controlled; 20 MB limit; originals preserved';
  });

  test('Proof and error logs are installation-scoped', function () {
    const proof = boReadTable_(H38_BO_SHEETS.PROOF_LOG, { includeVoided: true });
    const errors = boReadTable_(H38_BO_SHEETS.ERROR_LOG, { includeVoided: true }).filter(function (row) { return row.Status !== 'Resolved'; });
    const foreign = proof.concat(errors).filter(function (row) { return row['Business ID'] && row['Business ID'] !== boGetBusinessId_(); });
    boAssert_(!foreign.length, 'Foreign proof or error rows found.');
    boAssert_(errors.length === 0, 'Active errors found: ' + errors.length);
    return proof.length + ' proof rows / 0 active errors / no foreign log rows';
  });

  const failed = tests.filter(function (item) { return item.status === 'FAIL'; });
  const result = {
    status: failed.length ? 'HOLD' : 'PASS',
    tests: tests,
    testedAt: boNow_(),
    testedBy: user.Email,
    businessId: boGetBusinessId_(),
    businessName: boBusinessName_(),
    packId: boPackValue_('packId', ''),
    version: H38_BO.VERSION
  };
  boProof_('SELF TEST', 'System', boGetBusinessId_(), result.status, JSON.stringify(result), user.Email);
  return result;
}
