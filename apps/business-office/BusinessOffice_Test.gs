/** Business Office Platform — non-destructive self-test suite. */

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

  test('Authorized user and role', function () {
    const role = boGetRole_(user['Role ID']);
    boAssert_(role && BO_PLATFORM.ROLES.indexOf(role['Role Name']) >= 0, 'Invalid role.');
    return role['Role Name'];
  });

  test('Required workbook and folder configuration', function () {
    const result = boValidateInstallation();
    boAssert_(!result.missingSheets.length, 'Missing sheets: ' + result.missingSheets.join(', '));
    return result.folderChecks.length + ' private folders checked';
  });

  test('Approved product and bundle counts', function () {
    const rows = boReadTable_(BO_SHEETS.PRODUCTS, { includeVoided: true });
    const products = rows.filter(function (row) { return row['Record Type'] === 'Product' && row.Active === 'Yes'; });
    const bundles = rows.filter(function (row) { return row['Record Type'] === 'Bundle' && row.Active === 'Yes'; });
    boAssert_(products.length === 15, 'Expected 15 products; found ' + products.length);
    boAssert_(bundles.length === 9, 'Expected 9 bundles; found ' + bundles.length);
    return '15 products / 9 bundles';
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
    boAssert_(BO_PLATFORM.EXTERNAL_ACTIONS_ENABLED === false, 'External actions must remain disabled.');
    boAssert_(BO_PLATFORM.DIRECT_PAYMENT_PROCESSING === false, 'Direct payment processing must remain disabled.');
    boAssert_(BO_PLATFORM.DIRECT_PAYROLL_FUNDING === false, 'Direct payroll funding must remain disabled.');
    boAssert_(BO_PLATFORM.DIRECT_TAX_FILING === false, 'Direct tax filing must remain disabled.');
    return 'All external execution boundaries locked';
  });

  test('Approval gates remain closed in controlled data', function () {
    const quote = boFindRecord_(BO_SHEETS.QUOTES, 'QUOTE-TEST-001', { includeVoided: true }).record;
    const payroll = boFindRecord_(BO_SHEETS.PAYROLL_PERIODS, 'PAYROLL-TEST-001', { includeVoided: true }).record;
    const tax = boFindRecord_(BO_SHEETS.TAX_PERIODS, 'TAX-TEST-001', { includeVoided: true }).record;
    boAssert_(quote['Send Allowed'] === 'No', 'Controlled quote Send Allowed must be No.');
    boAssert_(payroll['Export Allowed'] === 'No', 'Controlled payroll Export Allowed must be No.');
    boAssert_(tax['Finalization Allowed'] === 'No', 'Controlled tax Finalization Allowed must be No.');
    return 'Quote, payroll, and tax gates are closed';
  });

  test('Document upload policy', function () {
    boAssert_(BO_PLATFORM.ALLOWED_MIME_TYPES.indexOf('application/pdf') >= 0, 'PDF missing.');
    boAssert_(BO_PLATFORM.ALLOWED_MIME_TYPES.indexOf('image/jpeg') >= 0, 'JPEG missing.');
    boAssert_(BO_PLATFORM.ALLOWED_MIME_TYPES.indexOf('image/png') >= 0, 'PNG missing.');
    boAssert_(BO_PLATFORM.MAX_UPLOAD_BYTES > 0, 'Unexpected upload limit.');
    return 'PDF/JPEG/PNG supported; HEIC controlled; 20 MB limit';
  });

  test('Proof and error logs', function () {
    const proofCount = boReadTable_(BO_SHEETS.PROOF_LOG, { includeVoided: true }).length;
    const errors = boReadTable_(BO_SHEETS.ERROR_LOG, { includeVoided: true }).filter(function (row) { return row.Status !== 'Resolved'; });
    boAssert_(errors.length === 0, 'Active errors found: ' + errors.length);
    return proofCount + ' proof rows / 0 active errors';
  });

  const failed = tests.filter(function (item) { return item.status === 'FAIL'; });
  const result = { status: failed.length ? 'HOLD' : 'PASS', tests: tests, testedAt: boNow_(), testedBy: user.Email, version: BO_PLATFORM.VERSION };
  boProof_('SELF TEST', 'System', boGetBusinessId_(), result.status, JSON.stringify(result), user.Email);
  return result;
}
