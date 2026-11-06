'use strict';
/* Check-printing verifier (2026-11-06): amount-in-words correctness
 * (including the $1,234.56 edge from the feature spec), MICR line honesty
 * (stored numbers only, blank segments when absent), per-account check
 * sequence derivation, and the full-face sheet render. */
const assert = require('assert');
const CP = require('../commercial-app/check-printing.js');

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log('PASS', name); } catch (e) { console.error('FAIL', name, e.message); throw e; } }

ok('BUILD stamp present', () => assert.equal(CP.BUILD, '20261106-check-printing-1'));

ok('words: $1,234.56 spec edge case', () =>
  assert.equal(CP.amountToWords(1234.56), 'One Thousand Two Hundred Thirty-Four and 56/100'));
ok('words: zero', () => assert.equal(CP.amountToWords(0), 'Zero and 00/100'));
ok('words: one cent', () => assert.equal(CP.amountToWords(0.01), 'Zero and 01/100'));
ok('words: $1.00', () => assert.equal(CP.amountToWords(1), 'One and 00/100'));
ok('words: $19.99', () => assert.equal(CP.amountToWords(19.99), 'Nineteen and 99/100'));
ok('words: $100.10', () => assert.equal(CP.amountToWords(100.10), 'One Hundred and 10/100'));
ok('words: $115.00', () => assert.equal(CP.amountToWords(115), 'One Hundred Fifteen and 00/100'));
ok('words: $21.21 hyphenation', () => assert.equal(CP.amountToWords(21.21), 'Twenty-One and 21/100'));
ok('words: $1,000,000.00', () =>
  assert.equal(CP.amountToWords(1000000), 'One Million and 00/100'));
ok('words: $999,999.99', () =>
  assert.equal(CP.amountToWords(999999.99), 'Nine Hundred Ninety-Nine Thousand Nine Hundred Ninety-Nine and 99/100'));
ok('words: rounding half-up at the cent', () =>
  assert.equal(CP.amountToWords(10.005), 'Ten and 01/100'));
ok('words: rejects non-finite', () => assert.throws(() => CP.amountToWords(NaN), /finite/));

ok('micr: all segments from stored numbers', () =>
  assert.equal(CP.micrLine({ routing: '021000021', account: '123456789', checkNumber: 1001 }),
    '⑆021000021⑆  ⑈123456789⑈  1001'));
ok('micr: missing routing leaves the segment blank (never invented)', () => {
  const line = CP.micrLine({ routing: '', account: '123456789', checkNumber: 1001 });
  assert.ok(!/021|⑆\d/.test(line), 'no routing digits may appear');
  assert.ok(line.includes('⑈123456789⑈'));
});
ok('micr: missing account leaves the segment blank', () => {
  const line = CP.micrLine({ routing: '021000021', account: '', checkNumber: 7 });
  assert.ok(line.includes('⑆021000021⑆'));
  assert.ok(!line.includes('⑈'));
});
ok('micr: non-digits stripped from routing', () =>
  assert.ok(CP.micrLine({ routing: '0210-000 21', account: '', checkNumber: 3 }).includes('⑆021000021⑆')));

const acct = { 'Bank Account ID': 'BANK-1', 'Account Name': 'Operating Checking' };
ok('sequence: saved Next Check Number wins', () =>
  assert.equal(CP.deriveNextNumber({ ...acct, 'Next Check Number': 1042 }, []), 1042));
ok('sequence: derives max+1 for the same account only', () => {
  const rows = [
    { 'Bank Account ID': 'BANK-1', 'Check Number': '1007' },
    { 'Bank Account ID': 'BANK-1', 'Check Number': 1009 },
    { 'Bank Account ID': 'BANK-2', 'Check Number': 5555 }
  ];
  assert.equal(CP.deriveNextNumber(acct, rows), 1010);
});
ok('sequence: unknown account returns 0 (owner enters the first number)', () =>
  assert.equal(CP.deriveNextNumber(acct, []), 0));
ok('sequence: another tenant account does not leak numbers', () =>
  assert.equal(CP.deriveNextNumber(acct, [{ 'Bank Account ID': 'BANK-9', 'Check Number': 42 }]), 0));

ok('sheet: full face carries every required field', () => {
  const html = CP.renderCheckSheet({
    businessName: 'Clearwater Property Services', businessAddressLines: ['PO Box 100', 'Grand Rapids, MN 55744'],
    bankName: 'Operating Checking', date: '2026-11-06', checkNumber: 1010,
    payee: 'North Star Supply Co.', amount: 1234.56, memo: 'Bill NS-1042',
    stubTitle: 'Voucher', stubHtml: '<p>stub</p>', routing: '021000021', account: '123456789'
  });
  for (const needle of ['Clearwater Property Services', 'Grand Rapids, MN 55744', 'Operating Checking',
    'No. 1010', '2026-11-06', 'North Star Supply Co.', '$1,234.56',
    'One Thousand Two Hundred Thirty-Four and 56/100 Dollars', 'Bill NS-1042',
    '⑆021000021⑆', '⑈123456789⑈', 'Authorized signature', 'Voucher'])
    assert.ok(html.includes(needle), 'missing: ' + needle);
});
ok('sheet: absent bank numbers print blank segments', () => {
  const html = CP.renderCheckSheet({
    businessName: 'Biz', businessAddressLines: [], bankName: 'Checking', date: '2026-11-06',
    checkNumber: 5, payee: 'Vendor', amount: 10, memo: '', stubTitle: 'Voucher', stubHtml: ''
  });
  assert.ok(!html.includes('⑆'), 'no routing segment');
  assert.ok(!html.includes('⑈'), 'no account segment');
});
ok('sheet: HTML-escapes payee/memo (no injection from record text)', () => {
  const html = CP.renderCheckSheet({
    businessName: 'Biz', businessAddressLines: [], bankName: 'B', date: '2026-11-06', checkNumber: 1,
    payee: '<script>alert(1)</script>', amount: 1, memo: 'a & b', stubTitle: 'V', stubHtml: ''
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('a &amp; b'));
});
ok('stub: vendor stub shows bill detail and amount', () => {
  const html = CP.vendorStubHtml({ vendorName: 'North Star Supply Co.', billNumber: 'NS-1042', billDate: '2026-10-30', dueDate: '2026-11-15', accountName: 'Operating Checking', memo: 'Bill NS-1042', amount: 1234.56 });
  for (const needle of ['North Star Supply Co.', 'NS-1042', '$1,234.56', 'Operating Checking'])
    assert.ok(html.includes(needle), 'missing: ' + needle);
});
ok('stub: paycheck stub math labels — gross, calculated lines, owner-entered deductions, net', () => {
  const line = { 'Regular Hours': 38, 'Overtime Hours': 2, 'Hourly Rate': 25, 'Gross Pay': 1000,
    'Federal Withholding': 92.31, 'Social Security': 62, 'Medicare': 14.50, 'State Withholding': 31.05,
    'Deductions Detail': [{ name: 'Tool fund', amount: 10 }], 'Net Pay': 790.14, 'YTD Gross': 12000, 'YTD Net': 9500 };
  const html = CP.paycheckStubHtml({ line, employeeName: 'Dana Whitfield', periodLabel: '2026-10-26 – 2026-11-08', payDate: '2026-11-13' });
  for (const needle of ['Dana Whitfield', '40.00', '$1,000.00', 'Federal income tax', '−$92.31',
    'Tool fund (entered by owner)', '$790.14', 'Year-to-date gross', '$12,000.00'])
    assert.ok(html.includes(needle), 'missing: ' + needle);
});

console.log(`\nverify-check-printing: ${passed} checks passed`);
