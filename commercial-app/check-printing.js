/* ============================================================================
 * H38 Office — Check Printing (full-face checks on blank check-on-top stock)
 * ----------------------------------------------------------------------------
 * ONE renderer + ONE per-bank-account check-number sequence shared by vendor
 * bill checks and payroll paychecks (Rick, 2026-11-06).
 *
 * The check face prints everything: business name/address (business
 * profile), bank name (the bank account's name), date, check number, payee,
 * amount in figures, amount in WORDS, memo, signature line, and a MICR-style
 * line built ONLY from the routing/account numbers stored on the bank
 * account record. Segments the tenant has not stored print BLANK — bank
 * numbers are never invented.
 *
 * Money never moves through the app. Issuing a check records it: the bill /
 * payroll line is marked paid with a payment record whose method reads
 * "Check #<n>", tied to the bank account, so bank reconciliation sees it.
 * Voiding keeps the full audit trail — nothing is silently deleted.
 *
 * Owner-only: callers gate on the owner role before invoking the flows.
 * No AI step exists in this flow (AI assists, never gates).
 *
 * Pure helpers (amountToWords, micrLine, deriveNextNumber, renderCheckSheet)
 * are Node-requireable for scripts/verify-check-printing.js; the browser
 * flows activate only when the Office globals exist.
 * ============================================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.H38CheckPrint = Object.freeze(api);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  var BUILD = '20261106-check-printing-1';

  /* ---------------- pure helpers ---------------- */

  var ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
    'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
    'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  var SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

  function threeDigits(n) {
    var parts = [];
    var hundreds = Math.floor(n / 100), rest = n % 100;
    if (hundreds) parts.push(ONES[hundreds] + ' Hundred');
    if (rest >= 20) parts.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? '-' + ONES[rest % 10] : ''));
    else if (rest > 0) parts.push(ONES[rest]);
    return parts.join(' ');
  }

  /* Correct English amount-in-words for a check face:
   * 1234.56 -> "One Thousand Two Hundred Thirty-Four and 56/100" */
  function amountToWords(amount) {
    if (amount != null && amount !== '' && !Number.isFinite(Number(amount)))
      throw new Error('Check amount must be a finite number.');
    var n = Number(amount || 0);
    var totalCents = Math.round(Math.abs(n) * 100);
    var dollars = Math.floor(totalCents / 100);
    var centPart = totalCents % 100;
    var words;
    if (dollars === 0) words = 'Zero';
    else {
      var chunks = [], d = dollars, scale = 0;
      while (d > 0) { chunks.push({ n: d % 1000, scale: scale }); d = Math.floor(d / 1000); scale++; }
      words = chunks.reverse().map(function (c) {
        return c.n ? threeDigits(c.n) + (SCALES[c.scale] ? ' ' + SCALES[c.scale] : '') : '';
      }).filter(Boolean).join(' ');
    }
    return words + ' and ' + String(centPart).padStart(2, '0') + '/100';
  }

  /* MICR-style line. Only stored numbers are printed; a missing routing or
   * account number leaves its segment blank — never fabricated. */
  function micrLine(opts) {
    opts = opts || {};
    var routing = String(opts.routing || '').replace(/\D/g, '');
    var account = String(opts.account || '').replace(/[^0-9-]/g, '');
    var number = String(opts.checkNumber == null ? '' : opts.checkNumber);
    var seg = [];
    seg.push(routing ? '⑆' + routing + '⑆' : '');
    seg.push(account ? '⑈' + account + '⑈' : '');
    seg.push(number);
    return seg.join('  ');
  }

  function toNum(v) { var n = Number(v || 0); return Number.isFinite(n) ? n : 0; }

  /* Next check number for a bank account. The account record's saved
   * 'Next Check Number' wins; otherwise derive from numbers already used
   * on that account (checks + payroll checks). Returns 0 when nothing is
   * known — the owner then enters the first number from their stock. */
  function deriveNextNumber(account, issuedRows) {
    var saved = Math.round(toNum(account && account['Next Check Number']));
    if (saved > 0) return saved;
    var acctId = String((account && (account['Bank Account ID'] || account.id)) || '');
    var used = (issuedRows || []).filter(function (r) {
      return String((r && r['Bank Account ID']) || '') === acctId;
    }).map(function (r) { return Math.round(toNum(r && r['Check Number'])); }).filter(function (n) { return n > 0; });
    return used.length ? Math.max.apply(null, used) + 1 : 0;
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function moneyFmt(v) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(toNum(v));
  }

  /* Full-face check sheet: check on top (3.5in), two voucher stubs below.
   * opts: {businessName, businessAddressLines[], bankName, date,
   *        checkNumber, payee, amount, memo, stubTitle, stubHtml,
   *        copyStubHtml, routing, account, voidLabel} */
  function renderCheckSheet(opts) {
    opts = opts || {};
    var amount = toNum(opts.amount);
    var fig = '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var words = amountToWords(amount) + ' Dollars';
    var addr = (opts.businessAddressLines || []).filter(Boolean).map(escHtml).join('<br>');
    var micr = micrLine({ routing: opts.routing, account: opts.account, checkNumber: opts.checkNumber });
    var voidMark = opts.voidLabel
      ? '<div class="h38chk-voidmark">' + escHtml(opts.voidLabel) + '</div>' : '';
    return '<section class="h38chk-sheet">' + voidMark +
      '<div class="h38chk-face">' +
        '<div class="h38chk-biz"><strong>' + escHtml(opts.businessName || '') + '</strong>' +
          (addr ? '<br>' + addr : '') + '</div>' +
        '<div class="h38chk-bank">' + escHtml(opts.bankName || '') + '</div>' +
        '<div class="h38chk-num">No. ' + escHtml(opts.checkNumber == null ? '' : opts.checkNumber) + '</div>' +
        '<div class="h38chk-date"><span class="h38chk-flabel">Date</span> ' + escHtml(opts.date || '') + '</div>' +
        '<div class="h38chk-payeeline"><span class="h38chk-flabel">Pay to the order of</span>' +
          '<span class="h38chk-payee">' + escHtml(opts.payee || '') + '</span>' +
          '<span class="h38chk-amount"><strong>' + fig + '</strong></span></div>' +
        '<div class="h38chk-words">' + escHtml(words) + ' ****</div>' +
        '<div class="h38chk-memo"><span class="h38chk-flabel">Memo</span> ' + escHtml(opts.memo || '') + '</div>' +
        '<div class="h38chk-sig"><div class="h38chk-sigline"></div><span class="h38chk-flabel">Authorized signature</span></div>' +
        '<div class="h38chk-micr">' + escHtml(micr) + '</div>' +
      '</div>' +
      '<div class="h38chk-stub"><div class="h38chk-stubhead"><strong>' + escHtml(opts.stubTitle || 'Voucher') + '</strong>' +
        '<span>Check #' + escHtml(opts.checkNumber == null ? '' : opts.checkNumber) + ' · ' + escHtml(opts.date || '') + '</span></div>' +
        (opts.stubHtml || '') + '</div>' +
      '<div class="h38chk-stub"><div class="h38chk-stubhead"><strong>' + escHtml(opts.copyStubTitle || 'Business copy') + '</strong>' +
        '<span>Keep for your records</span></div>' +
        (opts.copyStubHtml || opts.stubHtml || '') + '</div>' +
    '</section>';
  }

  /* Voucher stub for a vendor bill payment. */
  function vendorStubHtml(o) {
    var rows = [
      ['Vendor', o.vendorName], ['Bill number', o.billNumber], ['Bill date', o.billDate],
      ['Due date', o.dueDate], ['Paid from', o.accountName], ['Memo', o.memo]
    ].filter(function (r) { return r[1]; }).map(function (r) {
      return '<tr><td>' + escHtml(r[0]) + '</td><td>' + escHtml(r[1]) + '</td></tr>';
    }).join('');
    return '<table class="h38chk-table"><tbody>' + rows +
      '<tr class="total"><td><strong>Amount paid</strong></td><td><strong>' + moneyFmt(o.amount) + '</strong></td></tr></tbody></table>';
  }

  /* Voucher stub for a paycheck: pay detail from the stored payroll line. */
  function paycheckStubHtml(o) {
    var line = o.line || {};
    var wh = [
      ['Federal income tax', line['Federal Withholding']],
      ['Social Security', line['Social Security']],
      ['Medicare', line['Medicare']],
      ['Additional Medicare', line['Additional Medicare']],
      ['State income tax', line['State Withholding']],
      ['Other withholding', line['Other Withholding']]
    ].filter(function (r) { return toNum(r[1]) !== 0; });
    var ded = (Array.isArray(line['Deductions Detail']) ? line['Deductions Detail'] : [])
      .map(function (d) { return [String(d.name || 'Deduction') + ' (entered by owner)', d.amount]; });
    var rows = [
      ['Employee', o.employeeName], ['Pay period', o.periodLabel], ['Pay date', o.payDate],
      ['Hours', (toNum(line['Regular Hours']) + toNum(line['Overtime Hours'])).toFixed(2) +
        ' (regular ' + toNum(line['Regular Hours']).toFixed(2) + ' @ ' + moneyFmt(line['Hourly Rate']) +
        (toNum(line['Overtime Hours']) > 0 ? ', overtime ' + toNum(line['Overtime Hours']).toFixed(2) : '') + ')'],
      ['Gross pay', moneyFmt(line['Gross Pay'])]
    ].map(function (r) { return '<tr><td>' + escHtml(r[0]) + '</td><td>' + escHtml(r[1]) + '</td></tr>'; }).join('');
    var whRows = wh.concat(ded).map(function (r) {
      return '<tr><td>' + escHtml(r[0]) + '</td><td>−' + moneyFmt(r[1]) + '</td></tr>';
    }).join('');
    var ytd = toNum(line['YTD Gross']) > 0
      ? '<tr><td>Year-to-date gross</td><td>' + moneyFmt(line['YTD Gross']) + '</td></tr>' +
        '<tr><td>Year-to-date net</td><td>' + moneyFmt(line['YTD Net']) + '</td></tr>' : '';
    return '<table class="h38chk-table"><tbody>' + rows + whRows +
      '<tr class="total"><td><strong>Net pay</strong></td><td><strong>' + moneyFmt(line['Net Pay']) + '</strong></td></tr>' +
      ytd + '</tbody></table>' +
      '<p class="h38chk-note">Withholding lines are the calculated lines stored on this pay run. ' +
      'Deduction lines marked "entered by owner" were entered by the owner, not calculated by the Office.</p>';
  }

  var api = {
    BUILD: BUILD,
    amountToWords: amountToWords,
    micrLine: micrLine,
    deriveNextNumber: deriveNextNumber,
    renderCheckSheet: renderCheckSheet,
    vendorStubHtml: vendorStubHtml,
    paycheckStubHtml: paycheckStubHtml
  };

  /* ---------------- browser flows (Office globals) ---------------- */
  if (typeof window === 'undefined' || typeof document === 'undefined') return api;

  function g(name) { return typeof window[name] === 'function' ? window[name] : null; }
  function recs(name) { var r = g('records'); return r ? (r(name) || []) : []; }
  function val(row, key, alt) { var f = g('v'); return f ? f(row, key, alt) : (row ? row[key] : ''); }
  function rid(row, key) { var f = g('rowId'); return f ? f(row, key) : String((row && (row[key] || row.id)) || ''); }
  function escS(s) { var f = g('esc'); return f ? f(s) : escHtml(s); }
  function numG(v) { var f = g('num'); return f ? f(v) : toNum(v); }
  function nowG() { var f = g('now'); return f ? f() : new Date().toISOString(); }
  function newIdG(p) { var f = g('newId'); return f ? f(p) : p + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7); }
  function toastG(msg, isErr) { var f = g('toast'); if (f) f(msg, isErr); }
  async function saveG(collection, recordType, id, record, idKeys) {
    var sp = g('saveParity');
    if (!sp) throw new Error('Office save is unavailable.');
    return sp(collection, recordType, id, record, collection, idKeys);
  }
  async function syncG() { try { var s = g('sync'); if (s) await s(false); } catch (e) {} }
  function todayStr() { return new Date().toISOString().slice(0, 10); }

  function businessIdentity() {
    var snap = (window.state && window.state.snapshot) || {};
    var biz = snap.business || {};
    // The saved profile (guided setup) hydrates as snapshot.businessProfile[],
    // not through records('businessProfile'); check both, in that order.
    var profile = (Array.isArray(snap.businessProfile) && snap.businessProfile[0]) ||
      recs('businessProfile')[0] || {};
    var name = biz.businessName || val(profile, 'Business Name', 'businessName') || val(profile, 'Name') || '';
    var address = String(val(profile, 'Address', 'Business Address') ||
      val(profile, 'address', 'Street Address') || val(profile, 'streetAddress', 'street') || '');
    var lines = address ? address.split(/\n|,/).map(function (s) { return s.trim(); }).filter(Boolean) : [];
    if (!lines.length) {
      var street = String(val(profile, 'Street', 'street') || val(profile, 'Address Line 1', 'addressLine1') || '');
      var city = String(val(profile, 'City', 'city') || ''), st = String(val(profile, 'State', 'state') || ''),
        zip = String(val(profile, 'ZIP', 'zip') || val(profile, 'Zip', 'zipCode') || '');
      var line2 = [city, st].filter(Boolean).join(', ') + (zip ? ' ' + zip : '');
      lines = [street, line2.trim()].filter(Boolean);
    }
    return { name: String(name || ''), addressLines: lines };
  }

  function dialogForm(opts) {
    return new Promise(function (resolve) {
      var dialog = document.getElementById('h38CheckPrintDialog');
      if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'h38CheckPrintDialog';
        document.body.appendChild(dialog);
      }
      dialog.innerHTML = '<form method="dialog"><h2>' + escS(opts.title) + '</h2>' + opts.bodyHtml +
        '<div class="actions"><button value="cancel" class="secondary">Cancel</button>' +
        '<button value="ok" class="primary">' + escS(opts.okLabel || 'Continue') + '</button></div></form>';
      var onClose = function () {
        dialog.removeEventListener('close', onClose);
        resolve(dialog.returnValue === 'ok' ? dialog.querySelector('form') : null);
      };
      dialog.addEventListener('close', onClose);
      dialog.showModal();
    });
  }

  function printSheets(sheetsHtml) {
    var rootEl = document.getElementById('h38CheckPrintRoot');
    if (!rootEl) {
      rootEl = document.createElement('div');
      rootEl.id = 'h38CheckPrintRoot';
      document.body.appendChild(rootEl);
    }
    rootEl.innerHTML = sheetsHtml;
    document.body.classList.add('h38-printing-checkface');
    var cleanup = function () {
      document.body.classList.remove('h38-printing-checkface');
      rootEl.innerHTML = '';
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(function () { try { window.print(); } catch (e) { cleanup(); } }, 300);
    setTimeout(function () { if (document.body.classList.contains('h38-printing-checkface')) cleanup(); }, 60000);
  }

  function accountOptionsHtml(accounts, selectedId) {
    return accounts.map(function (a) {
      var id = rid(a, 'Bank Account ID');
      return '<option value="' + escS(id) + '"' + (id === selectedId ? ' selected' : '') + '>' +
        escS(val(a, 'Account Name') || id) + ' (' + escS(val(a, 'Account Type') || 'Account') + ')</option>';
    }).join('');
  }
  function activeAccounts() {
    return recs('bankAccounts').filter(function (r) {
      return String(val(r, 'Status') || 'Active').toUpperCase() !== 'INACTIVE';
    });
  }
  function allIssuedRows() {
    return recs('checks').concat(recs('payrollChecks'));
  }

  /* Ask the owner for the bank account, check date, check number, and the
   * (optional) stored routing/account numbers used on the MICR line.
   * Returns null on cancel, else {account, date, firstNumber, routing,
   * accountNumber}. Numbers shown come from the account record only. */
  async function askCheckDetails(opts) {
    var accounts = activeAccounts();
    if (!accounts.length) { toastG('Add a bank account in Accounting first.', true); return null; }
    var count = opts.count || 1;
    var form = await dialogForm({
      title: opts.title || 'Print check',
      okLabel: opts.okLabel || 'Review check',
      bodyHtml:
        '<p class="muted small">' + escS(opts.intro || '') + '</p>' +
        '<label>Pay from</label><select id="h38chkAccount">' + accountOptionsHtml(accounts, accounts[0] && rid(accounts[0], 'Bank Account ID')) + '</select>' +
        '<div class="two"><div><label>Check date</label><input id="h38chkDate" type="date" value="' + escS(opts.date || todayStr()) + '"></div>' +
        '<div><label>' + (count > 1 ? 'First check number' : 'Check number') + '</label><input id="h38chkNumber" type="number" min="1" step="1"></div></div>' +
        '<div class="two"><div><label>Routing number (for the MICR line)</label><input id="h38chkRouting" type="text" inputmode="numeric" autocomplete="off" placeholder="Stored on the account"></div>' +
        '<div><label>Account number (for the MICR line)</label><input id="h38chkAcctNum" type="text" inputmode="numeric" autocomplete="off" placeholder="Stored on the account"></div></div>' +
        '<p class="muted small">Routing and account numbers print only if they are stored here — the Office never invents bank numbers. They are saved to the bank account record when you issue.</p>'
    });
    if (!form) return null;
    var acctSel = form.querySelector('#h38chkAccount');
    var account = accounts.find(function (a) { return rid(a, 'Bank Account ID') === acctSel.value; });
    if (!account) { toastG('Choose a bank account.', true); return null; }
    var number = parseInt(form.querySelector('#h38chkNumber').value, 10);
    if (!number || number < 1) {
      number = deriveNextNumber(account, allIssuedRows());
      if (!number) { toastG('Enter the check number from your check stock.', true); return null; }
    }
    return {
      account: account,
      date: form.querySelector('#h38chkDate').value || todayStr(),
      firstNumber: number,
      routing: form.querySelector('#h38chkRouting').value.replace(/\D/g, ''),
      accountNumber: form.querySelector('#h38chkAcctNum').value.replace(/[^0-9-]/g, '')
    };
  }

  /* Prefill the dialog's number/routing fields for the chosen account —
   * wired by the callers after the dialog exists is not possible (dialog
   * resolves on close), so the dialog re-asks with account onchange via a
   * light DOM hook: we simply re-run askCheckDetails when the account
   * changes is overkill; instead the initial render uses the FIRST account
   * and the issue step re-reads stored values from whichever account was
   * picked, preferring stored values over typed ones when typed is blank. */

  async function persistAccountDetails(account, details, usedNumber) {
    var id = rid(account, 'Bank Account ID');
    var updated = Object.assign({}, account, {
      'Next Check Number': usedNumber + 1,
      'Updated Time': nowG(),
      'Record Version': numG(val(account, 'Record Version')) + 1
    });
    if (details.routing) updated['Routing Number'] = details.routing;
    if (details.accountNumber) updated['Account Number'] = details.accountNumber;
    await saveG('bankAccounts', 'Bank Account', id, updated, ['Bank Account ID', 'id']);
    return updated;
  }

  /* Preview + confirm gate: renders the sheets, owner reviews on screen
   * (preview matches print), then confirms "Print & mark issued". The
   * browser print dialog opens from the same render. Returns true when the
   * owner confirmed and printing was invoked. */
  async function previewAndConfirm(sheetsHtml, confirmText) {
    var form = await dialogForm({
      title: 'Review check',
      okLabel: 'Print & mark issued',
      bodyHtml: '<p class="muted small">' + escS(confirmText) + '</p>' +
        '<div class="h38chk-preview">' + sheetsHtml + '</div>'
    });
    if (!form) return false;
    printSheets(sheetsHtml);
    return true;
  }

  /* ---------------- vendor bill checks ---------------- */

  /* Issue the prepared check (checks collection) for a vendor bill:
   * renders the full-face check, and on confirm records the payment,
   * marks the bill paid, posts the ledger entry, and advances the
   * account's check sequence by exactly one. */
  async function issueVendorCheck(checkRow, billRow, engine) {
    var amount = numG(val(checkRow, 'Amount'));
    if (!(amount > 0)) { toastG('Check amount must be greater than zero.', true); return false; }
    var details = await askCheckDetails({
      title: 'Print check',
      intro: 'Pay ' + (val(checkRow, 'Payee') || 'vendor') + ' — ' + '$' + amount.toFixed(2) + '. The check prints on blank check-on-top stock.',
      date: String(val(checkRow, 'Payment Date') || todayStr()).slice(0, 10)
    });
    if (!details) return false;
    var account = details.account;
    var acctId = rid(account, 'Bank Account ID');
    var routing = details.routing || String(val(account, 'Routing Number') || '').replace(/\D/g, '');
    var acctNum = details.accountNumber || String(val(account, 'Account Number') || '').replace(/[^0-9-]/g, '');
    var checkNumber = details.firstNumber;
    var biz = businessIdentity();
    var billNumber = String(val(billRow, 'Bill Number') || val(checkRow, 'Memo') || '');
    var memo = String(val(checkRow, 'Memo') || ('Bill ' + billNumber));
    var stub = vendorStubHtml({
      vendorName: String(val(checkRow, 'Payee') || ''), billNumber: billNumber,
      billDate: String(val(billRow, 'Bill Date') || '').slice(0, 10),
      dueDate: String(val(billRow, 'Due Date') || '').slice(0, 10),
      accountName: String(val(account, 'Account Name') || ''), memo: memo, amount: amount
    });
    var sheet = renderCheckSheet({
      businessName: biz.name, businessAddressLines: biz.addressLines,
      bankName: String(val(account, 'Account Name') || ''),
      date: details.date, checkNumber: checkNumber,
      payee: String(val(checkRow, 'Payee') || ''), amount: amount, memo: memo,
      stubTitle: 'Voucher — ' + String(val(checkRow, 'Payee') || 'Vendor'), stubHtml: stub,
      routing: routing, account: acctNum
    });
    var ok = await previewAndConfirm(sheet,
      'Check #' + checkNumber + ' for $' + amount.toFixed(2) + ' to ' + String(val(checkRow, 'Payee') || 'the vendor') +
      '. When you confirm, the bill is marked paid and the payment is recorded as Check #' + checkNumber +
      ' on ' + String(val(account, 'Account Name') || 'the account') + '. No money moves through the app — the paper check is the payment.');
    if (!ok) return false;
    var stamp = nowG();
    var checkId = rid(checkRow, 'Check ID');
    var issuedCheck = Object.assign({}, checkRow, {
      'Bank Account ID': acctId, 'Check Number': String(checkNumber),
      'Payment Date': details.date, 'Status': 'Issued', 'Negotiable': true,
      'Issued By': (window.state && window.state.snapshot && window.state.snapshot.user && window.state.snapshot.user.userId) || '',
      'Issued Time': stamp, 'Updated Time': stamp,
      'Record Version': numG(val(checkRow, 'Record Version')) + 1
    });
    await saveG('checks', 'Prepared Check', checkId, issuedCheck, ['Check ID', 'id']);
    var payId = newIdG('VPAY');
    var payment = {
      'Vendor Payment ID': payId, 'Business ID': window.state && window.state.businessId,
      'Vendor Bill ID': rid(billRow, 'Bill ID'), 'Vendor ID': String(val(billRow, 'Vendor ID') || ''),
      'Vendor Name': String(val(billRow, 'Vendor Name') || val(checkRow, 'Payee') || ''),
      'Amount': amount, 'Payment Date': details.date,
      'Payment Method': 'Check #' + checkNumber, 'Bank Account ID': acctId,
      'Check ID': checkId, 'Check Number': String(checkNumber),
      'Status': 'Paid', 'Notes': 'Paid by printed check from the Office. The paper check is the payment.',
      'Created Time': stamp, 'Updated Time': stamp, 'Record Version': 1
    };
    await saveG('vendorPayments', 'Vendor Payment', payId, payment, ['Vendor Payment ID']);
    var openBal = numG(val(billRow, 'Open Balance'));
    if (!(openBal > 0)) openBal = numG(val(billRow, 'Total'));
    var newBal = Math.max(0, Math.round((openBal - amount) * 100) / 100);
    var paidBill = Object.assign({}, billRow, {
      'Open Balance': newBal,
      'Status': newBal <= 0 ? 'Paid' : 'Partially Paid',
      'Approval State': 'Approved', 'Updated Time': stamp,
      'Record Version': numG(val(billRow, 'Record Version')) + 1
    });
    await saveG('vendorBills', 'Vendor Bill', rid(billRow, 'Bill ID'), paidBill, ['Bill ID', 'id']);
    if (engine && typeof engine.vendorPaymentPosting === 'function') {
      try {
        var tx = engine.vendorPaymentPosting({
          businessId: window.state.businessId, paymentId: payId, date: details.date,
          amount: amount, vendorId: String(val(billRow, 'Vendor ID') || ''),
          billIds: [rid(billRow, 'Bill ID')], memo: 'Check #' + checkNumber + ' — ' + memo
        });
        var txRecord = Object.assign({}, tx, {
          id: tx.id, 'Transaction ID': tx.id, 'Business ID': tx.businessId,
          'Transaction Date': tx.date, 'Transaction Type': tx.type,
          'Source Type': tx.sourceType, 'Source ID': tx.sourceId, 'Memo': tx.memo,
          'Status': tx.status, 'Total': tx.total, 'Lines': tx.lines,
          'Created Time': stamp, 'Record Version': 1
        });
        await saveG('accountingTransactions', 'Accounting Transaction', tx.id, txRecord, ['Transaction ID', 'id']);
      } catch (e) { /* payment record stands; ledger mirror is best-effort like the posting bridge */ }
    }
    await persistAccountDetails(account, { routing: routing, accountNumber: acctNum }, checkNumber);
    await syncG();
    toastG('Check #' + checkNumber + ' issued and recorded.');
    return true;
  }

  /* Void an issued vendor check: check + payment marked Void (audit trail
   * kept), the bill reopens, and the ledger entry is reversed. */
  async function voidVendorCheck(checkRow, billRow, engine) {
    var reasonForm = await dialogForm({
      title: 'Void check #' + val(checkRow, 'Check Number'),
      okLabel: 'Void check',
      bodyHtml: '<p class="muted small">Voiding keeps the check and payment in your records as Void, reopens the bill, and reverses the ledger entry. The paper check must be destroyed.</p>' +
        '<label>Reason</label><input id="h38chkVoidReason" type="text" placeholder="e.g. printed on wrong stock, amount wrong">'
    });
    if (!reasonForm) return false;
    var reason = reasonForm.querySelector('#h38chkVoidReason').value.trim() || 'Voided by owner';
    var stamp = nowG();
    var checkId = rid(checkRow, 'Check ID');
    var payments = recs('vendorPayments').filter(function (p) {
      return String(val(p, 'Check ID') || '') === checkId && String(val(p, 'Status')) !== 'Void';
    });
    var voidedCheck = Object.assign({}, checkRow, {
      'Status': 'Void', 'Negotiable': false, 'Void Reason': reason,
      'Voided By': (window.state && window.state.snapshot && window.state.snapshot.user && window.state.snapshot.user.userId) || '',
      'Voided Time': stamp, 'Updated Time': stamp,
      'Record Version': numG(val(checkRow, 'Record Version')) + 1
    });
    await saveG('checks', 'Prepared Check', checkId, voidedCheck, ['Check ID', 'id']);
    var restored = 0;
    for (var i = 0; i < payments.length; i++) {
      var p = payments[i];
      restored += numG(val(p, 'Amount'));
      await saveG('vendorPayments', 'Vendor Payment', rid(p, 'Vendor Payment ID'),
        Object.assign({}, p, { 'Status': 'Void', 'Void Reason': reason, 'Updated Time': stamp, 'Record Version': numG(val(p, 'Record Version')) + 1 }),
        ['Vendor Payment ID']);
      if (engine && typeof engine.reverse === 'function') {
        try {
          var orig = recs('accountingTransactions').find(function (t) {
            return String(val(t, 'Source ID') || t.id || '') === rid(p, 'Vendor Payment ID') ||
              String(val(t, 'Transaction ID') || '') === 'GL-VENDOR-PAYMENT-' + rid(p, 'Vendor Payment ID');
          });
          if (orig) {
            var rev = engine.reverse({
              id: val(orig, 'Transaction ID') || orig.id, businessId: orig.businessId || window.state.businessId,
              date: String(val(orig, 'Transaction Date') || '').slice(0, 10), type: val(orig, 'Transaction Type'),
              status: val(orig, 'Status') || 'Posted', lines: orig.Lines || orig.lines || []
            }, { date: todayStr(), memo: 'Void of check #' + val(checkRow, 'Check Number') + ' — ' + reason });
            var revRecord = Object.assign({}, rev, {
              id: rev.id, 'Transaction ID': rev.id, 'Business ID': rev.businessId,
              'Transaction Date': rev.date, 'Transaction Type': rev.type,
              'Source Type': rev.sourceType, 'Source ID': rev.sourceId, 'Memo': rev.memo,
              'Status': rev.status, 'Total': rev.total, 'Lines': rev.lines,
              'Created Time': stamp, 'Record Version': 1
            });
            await saveG('accountingTransactions', 'Accounting Transaction', rev.id, revRecord, ['Transaction ID', 'id']);
          }
        } catch (e) { /* audit records stand even if the reversal mirror fails */ }
      }
    }
    if (billRow) {
      var total = numG(val(billRow, 'Total'));
      var curBal = numG(val(billRow, 'Open Balance'));
      var newBal = Math.min(total || curBal + restored, curBal + restored);
      var reopened = Object.assign({}, billRow, {
        'Open Balance': Math.round(newBal * 100) / 100,
        'Status': 'Approved for Payment Review', 'Approval State': 'Approved',
        'Updated Time': stamp, 'Record Version': numG(val(billRow, 'Record Version')) + 1
      });
      await saveG('vendorBills', 'Vendor Bill', rid(billRow, 'Bill ID'), reopened, ['Bill ID', 'id']);
    }
    await syncG();
    toastG('Check #' + val(checkRow, 'Check Number') + ' voided. The bill is open again.');
    return true;
  }

  /* ---------------- paychecks (full-face) ---------------- */

  /* Issue full-face paychecks for the selected finalized payroll lines.
   * items: [{line, employee}] — numbers allocate from the chosen bank
   * account's sequence, shared with vendor checks. Writes the payrollChecks
   * register row AND a payrollPayments record per check, and stamps the
   * line with its payment id so it cannot be paid twice. */
  async function issuePaychecks(period, items) {
    if (!items || !items.length) { toastG('No pay lines selected.', true); return false; }
    var details = await askCheckDetails({
      title: 'Print paychecks',
      intro: items.length + ' paycheck(s) on blank check-on-top stock. Numbers come from the bank account sequence, shared with vendor checks.',
      date: String(val(period, 'Pay Date') || todayStr()).slice(0, 10),
      count: items.length
    });
    if (!details) return false;
    var account = details.account;
    var acctId = rid(account, 'Bank Account ID');
    var routing = details.routing || String(val(account, 'Routing Number') || '').replace(/\D/g, '');
    var acctNum = details.accountNumber || String(val(account, 'Account Number') || '').replace(/[^0-9-]/g, '');
    var biz = businessIdentity();
    var periodLabel = String(val(period, 'Period Start') || '').slice(0, 10) + ' – ' + String(val(period, 'Period End') || '').slice(0, 10);
    var n = details.firstNumber;
    var sheets = [], prepared = [];
    for (var i = 0; i < items.length; i++) {
      var line = items[i].line, emp = items[i].employee || {};
      var net = numG(val(line, 'Net Pay'));
      var empName = String(val(emp, 'Display Name') || val(line, 'Employee ID') || 'Employee');
      var stub = paycheckStubHtml({ line: line, employeeName: empName, periodLabel: periodLabel, payDate: details.date });
      var memo = 'Payroll — ' + periodLabel;
      sheets.push(renderCheckSheet({
        businessName: biz.name, businessAddressLines: biz.addressLines,
        bankName: String(val(account, 'Account Name') || ''),
        date: details.date, checkNumber: n, payee: empName, amount: net, memo: memo,
        stubTitle: 'Pay stub — ' + empName, stubHtml: stub, routing: routing, account: acctNum
      }));
      prepared.push({ line: line, emp: emp, empName: empName, net: net, checkNumber: n, memo: memo });
      n++;
    }
    var totalNet = prepared.reduce(function (s, p) { return s + p.net; }, 0);
    var ok = await previewAndConfirm(sheets.join(''),
      prepared.length + ' paycheck(s), checks #' + prepared[0].checkNumber + '–#' + prepared[prepared.length - 1].checkNumber +
      ', net total $' + totalNet.toFixed(2) + '. Confirming records each payment and marks the pay lines paid by check. No money moves through the app.');
    if (!ok) return false;
    var stamp = nowG();
    var userId = (window.state && window.state.snapshot && window.state.snapshot.user && window.state.snapshot.user.userId) || '';
    for (var j = 0; j < prepared.length; j++) {
      var p2 = prepared[j];
      var checkId = newIdG('PAYCHECK');
      var register = {
        'Payroll Check ID': checkId, 'Business ID': window.state.businessId,
        'Payroll Period ID': rid(period, 'Payroll Period ID'), 'Payroll Line ID': rid(p2.line, 'Payroll Line ID'),
        'Employee ID': String(val(p2.line, 'Employee ID') || ''), 'Bank Account ID': acctId,
        'Check Number': p2.checkNumber, 'Check Date': details.date, 'Payee Name': p2.empName,
        'Amount': p2.net, 'Memo': p2.memo, 'Print Mode': 'Full-face (blank stock)',
        'Status': 'Printed', 'Print Count': 1, 'Printed By': userId, 'Printed Time': stamp,
        'Last Printed Time': stamp, 'Voided By': '', 'Voided Time': '', 'Void Reason': '',
        'Replaces Check ID': '', 'Replaced By Check ID': '',
        'Created Time': stamp, 'Updated Time': stamp, 'Record Version': 1
      };
      await saveG('payrollChecks', 'Payroll Check', checkId, register, ['Payroll Check ID']);
      var payId = newIdG('PAYPAY');
      var payment = {
        'Payroll Payment ID': payId, 'Business ID': window.state.businessId,
        'Payroll Period ID': rid(period, 'Payroll Period ID'), 'Payroll Line ID': rid(p2.line, 'Payroll Line ID'),
        'Employee ID': String(val(p2.line, 'Employee ID') || ''), 'Employee Name': p2.empName,
        'Bank Account ID': acctId, 'Check Number': String(p2.checkNumber), 'Payroll Check ID': checkId,
        'Payment Method': 'Check #' + p2.checkNumber, 'Amount': p2.net,
        'Gross Pay': numG(val(p2.line, 'Gross Pay')), 'Payment Date': details.date,
        'Status': 'Issued', 'Created Time': stamp, 'Updated Time': stamp, 'Record Version': 1
      };
      await saveG('payrollPayments', 'Payroll Payment', payId, payment, ['Payroll Payment ID']);
      var paidLine = Object.assign({}, p2.line, {
        'Check Payment ID': payId, 'Paid By': 'Check #' + p2.checkNumber,
        'Updated Time': stamp, 'Record Version': numG(val(p2.line, 'Record Version')) + 1
      });
      await saveG('payrollLines', 'Payroll Line', rid(p2.line, 'Payroll Line ID'), paidLine, ['Payroll Line ID']);
    }
    await persistAccountDetails(account, { routing: routing, accountNumber: acctNum }, n - 1);
    await syncG();
    toastG(prepared.length + ' paycheck(s) printed and recorded.');
    return true;
  }

  /* Void a full-face paycheck: register + payment marked Void, the pay
   * line's payment link is cleared so the line can be paid again (the
   * run's own double-pay guard still applies). Audit trail kept. */
  async function voidPaycheck(checkRow) {
    var stamp = nowG();
    var payments = recs('payrollPayments').filter(function (p) {
      return String(val(p, 'Payroll Check ID') || '') === rid(checkRow, 'Payroll Check ID') && String(val(p, 'Status')) !== 'Void';
    });
    for (var i = 0; i < payments.length; i++) {
      var p = payments[i];
      await saveG('payrollPayments', 'Payroll Payment', rid(p, 'Payroll Payment ID'),
        Object.assign({}, p, { 'Status': 'Void', 'Updated Time': stamp, 'Record Version': numG(val(p, 'Record Version')) + 1 }),
        ['Payroll Payment ID']);
      var line = recs('payrollLines').find(function (l) { return rid(l, 'Payroll Line ID') === String(val(p, 'Payroll Line ID') || ''); });
      if (line && String(val(line, 'Check Payment ID') || '') === rid(p, 'Payroll Payment ID')) {
        await saveG('payrollLines', 'Payroll Line', rid(line, 'Payroll Line ID'),
          Object.assign({}, line, { 'Check Payment ID': '', 'Paid By': '', 'Updated Time': stamp, 'Record Version': numG(val(line, 'Record Version')) + 1 }),
          ['Payroll Line ID']);
      }
    }
    await syncG();
    return true;
  }

  /* A payroll line is already paid by check when it carries a live
   * (non-void) payroll payment or an active register check. */
  function linePaidByCheck(periodId, lineId) {
    var pays = recs('payrollPayments').filter(function (p) {
      return String(val(p, 'Payroll Line ID') || '') === String(lineId) && String(val(p, 'Status')) !== 'Void';
    });
    if (pays.length) return pays[0];
    var reg = recs('payrollChecks').filter(function (c) {
      return String(val(c, 'Payroll Period ID') || '') === String(periodId) &&
        String(val(c, 'Payroll Line ID') || '') === String(lineId) && String(val(c, 'Status')) !== 'Void';
    });
    return reg.length ? reg[0] : null;
  }

  api.issueVendorCheck = issueVendorCheck;
  api.voidVendorCheck = voidVendorCheck;
  api.issuePaychecks = issuePaychecks;
  api.voidPaycheck = voidPaycheck;
  api.linePaidByCheck = linePaidByCheck;
  api.businessIdentity = businessIdentity;
  api.printSheets = printSheets;
  return api;
});
