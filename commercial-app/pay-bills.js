/* ============================================================================
 * H38 Office — Pay Bills guided flow — Phase 2 Owner Ease Rebuild
 * ----------------------------------------------------------------------------
 * SCRIPT TAG (coordinator adds to index.html, AFTER accounting-workspace.js):
 *   <script src="pay-bills.js"></script>
 *
 * EXPOSES: window.H38PayBills.start()
 *   Called from the Owner Home "Bills due" action card.
 *
 * DATA COLLECTIONS USED (read/write):
 *   vendorBills        (read + write) — bills due (Bill ID, Vendor ID/Name,
 *                                Bill Number, Due Date, Total, Open Balance,
 *                                Status, Approval State); bills are marked
 *                                Paid (manual) or approved for payment (scheduled)
 *   bankAccounts       (read) — configured payment methods
 *                                (Bank Account ID, Account Name, Account Type)
 *   vendorPayments     (write) — one record per bill paid manually
 *                                (Payment Method = "Manual — check/in person")
 *   paymentInstructions(write) — one scheduled instruction per selected bill;
 *                                scheduling records intent only — no money moves
 *
 * EXISTING HELPERS USED (globals from app-01.js / app-02.js / app-19.js):
 *   records(), v(), rowId(), esc(), num(), money(), now(), newId(),
 *   pageHead(), openPage(), toast(), saveParity(), queueOperation(),
 *   dateOnly(), empty(), state
 *
 * DESIGN SOURCE: ~/workspace/your_files/owner-ease-rebuild-design.md §3.3
 * RULES:
 *   - "Mark as paid manually" is always available (checks / in-person payers).
 *   - "Schedule Payments" records payment instructions. Money is NOT moved by
 *     this flow; the confirmation says plainly when money moves.
 *   - No auto-send of money or messages; every step needs an explicit tap.
 *   - Manual mode always works; Kit is an optional reviewer (assists, never gates).
 * ============================================================================ */
(function () {
  'use strict';

  /* ---------------- local state ---------------- */
  var h38PB = {
    step: 1,
    bills: [],          // due bills, sorted by urgency
    selected: {},       // Bill ID -> true
    method: 'manual',   // bank account id OR 'manual'
    kitAdvice: '',
    result: []          // finalized/scheduled entries for the Done screen
  };

  /* ---------------- helpers ---------------- */

  function h38PBToday() { return new Date().toISOString().slice(0, 10); }

  function h38PBBalance(row) {
    var bal = num(v(row, 'Open Balance'));
    return bal > 0 ? bal : num(v(row, 'Total'));
  }

  function h38PBStatus(row) {
    return String(v(row, 'Status', 'Approval State') || '').toUpperCase();
  }

  /* Bills still owed: positive open balance, not paid/void/cancelled/disputed */
  function h38PBDueBills() {
    var today = h38PBToday();
    return (records('vendorBills') || [])
      .filter(function (row) {
        if (h38PBBalance(row) <= 0) return false;
        var s = h38PBStatus(row);
        return !/(PAID|VOID|CANCEL|DISPUTE|DELETE)/.test(s);
      })
      .map(function (row) {
        var due = String(v(row, 'Due Date') || '').slice(0, 10);
        var daysLate = due && due < today ? Math.round((new Date(today) - new Date(due + 'T12:00:00')) / 86400000) : 0;
        return { row: row, id: rowId(row, 'Bill ID'), due: due, daysLate: daysLate, balance: h38PBBalance(row) };
      })
      .sort(function (a, b) {
        if ((a.daysLate > 0) !== (b.daysLate > 0)) return a.daysLate > 0 ? -1 : 1;
        return String(a.due || '9999').localeCompare(String(b.due || '9999'));
      });
  }

  function h38PBDownload(filename, content, mimeType) {
    try {
      var blob = new Blob([content], { type: mimeType || 'text/plain' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    } catch (e) { toast('Download failed: ' + (e && e.message || e), true); }
  }

  async function h38PBAskKit() {
    var btn = $('h38PBAskKit');
    if (btn) { btn.disabled = true; btn.textContent = 'Kit is reviewing…'; }
    try {
      if (!window.H38_AI_HANDOFF || typeof window.H38_AI_HANDOFF.runTask !== 'function')
        throw new Error('Kit review is not available right now.');
      var summary = h38PB.bills.map(function (b) {
        return {
          vendor: v(b.row, 'Vendor Name'), amount: b.balance,
          due: b.due, daysLate: b.daysLate, billNumber: v(b.row, 'Bill Number')
        };
      });
      var result = await window.H38_AI_HANDOFF.runTask('bill_pay_review', {
        businessId: state.businessId, bills: summary
      });
      var text = (result && (result.advice || result.summary || result.review)) || '';
      h38PB.kitAdvice = String(text).trim() || 'Kit reviewed your bills and found nothing unusual.';
    } catch (e) {
      h38PB.kitAdvice = 'Kit could not review this time (' + (e && e.message || e) + '). You can still pay — nothing is blocked.';
    }
    h38PBRenderStep1();
  }

  function h38PBUrgencyTag(b) {
    if (b.daysLate > 0) return '<span class="pill bad">🔴 ' + b.daysLate + ' day' + (b.daysLate === 1 ? '' : 's') + ' late</span>';
    return '<span class="pill warn">🟡 Due ' + (b.due ? esc(dateOnly(b.due)) : '—') + '</span>';
  }

  /* ---------------- Step 1: BILLS DUE ---------------- */

  function h38PBRenderStep1() {
    h38PB.bills = h38PBDueBills();
    h38PB.bills.forEach(function (b) { if (!(b.id in h38PB.selected)) h38PB.selected[b.id] = true; });
    var advice = h38PB.kitAdvice
      ? '<div class="notice"><strong>Kit’s review:</strong> ' + esc(h38PB.kitAdvice) + '</div>' : '';
    var body;
    if (!h38PB.bills.length) {
      body = '<section class="card span12"><h2>🎉 No bills due</h2><p class="muted">Nothing is owed right now. New vendor bills will show up here when they are due.</p>' +
        '<div class="actions"><button class="secondary" id="h38PBDoneEmpty">Done → Home</button></div></section>';
    } else {
      var total = h38PB.bills.reduce(function (s, b) { return s + (h38PB.selected[b.id] ? b.balance : 0); }, 0);
      body = '<section class="card span8"><h2>Bills to Pay</h2>' + advice +
        '<div class="list">' + h38PB.bills.map(function (b) {
          var vendor = esc(v(b.row, 'Vendor Name') || 'Vendor');
          var billNo = esc(v(b.row, 'Bill Number') || b.id);
          return '<div class="row"><div class="row-top"><label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer">' +
            '<input type="checkbox" data-h38pb-check="' + esc(b.id) + '" ' + (h38PB.selected[b.id] ? 'checked' : '') + ' style="width:22px;height:22px;margin-top:2px">' +
            '<span><strong>' + vendor + '</strong><br><small class="muted">Bill ' + billNo + ' · ' + h38PBUrgencyTag(b) + '</small></span>' +
            '</label><span><strong>' + money(b.balance) + '</strong></span></div></div>';
        }).join('') + '</div>' +
        '<div class="stats" style="margin-top:12px"><div class="stat"><strong id="h38PBSelectedTotal">' + money(total) + '</strong><span>Selected to pay</span></div></div>' +
        '<div class="actions" style="margin-top:12px"><button id="h38PBContinue">Continue →</button>' +
        '<button type="button" class="secondary" data-open-page="accounting">Full accounting</button></div></section>' +
        '<section class="card span4"><h2>How this works</h2><p class="muted small">Pick the bills to pay. Next you choose how to pay — from a configured account, or mark as paid manually if you write a check or pay in person. <strong>Nothing moves money until you confirm.</strong></p>' +
        '<div class="actions"><button type="button" class="secondary" data-open-page="today">Cancel</button></div></section>';
    }
    $('mainContent').innerHTML = pageHead('Pay Bills', 'See what is owed, pick what to pay, choose how to pay it.',
      h38PB.bills.length ? '<button class="secondary" id="h38PBAskKit">Ask Kit which to pay first</button>' : '') +
      '<div class="grid">' + body + '</div>';
    var ask = $('h38PBAskKit'); if (ask) ask.onclick = h38PBAskKit;
    var done = $('h38PBDoneEmpty'); if (done) done.onclick = function () { openPage('today'); };
    document.querySelectorAll('[data-h38pb-check]').forEach(function (box) {
      box.onchange = function () {
        h38PB.selected[box.getAttribute('data-h38pb-check')] = box.checked;
        var t = h38PB.bills.reduce(function (s, b) { return s + (h38PB.selected[b.id] ? b.balance : 0); }, 0);
        var el = $('h38PBSelectedTotal'); if (el) el.textContent = money(t);
      };
    });
    var cont = $('h38PBContinue');
    if (cont) cont.onclick = function () {
      var any = h38PB.bills.some(function (b) { return h38PB.selected[b.id]; });
      if (!any) { toast('Select at least one bill to pay.', true); return; }
      h38PB.step = 2; h38PBRenderStep2();
    };
  }

  /* ---------------- Step 2: HOW TO PAY ---------------- */

  function h38PBRenderStep2() {
    var chosen = h38PB.bills.filter(function (b) { return h38PB.selected[b.id]; });
    var total = chosen.reduce(function (s, b) { return s + b.balance; }, 0);
    var accounts = (records('bankAccounts') || []).filter(function (r) {
      return String(v(r, 'Status') || 'Active').toUpperCase() !== 'INACTIVE';
    });
    if (!h38PB.method && accounts.length) h38PB.method = rowId(accounts[0], 'Bank Account ID');
    var methodRows = accounts.map(function (a) {
      var id = rowId(a, 'Bank Account ID');
      var label = v(a, 'Account Name') || 'Account';
      var type = v(a, 'Account Type') || '';
      var isDefault = /checking/i.test(type);
      return '<label class="row" style="display:flex;gap:10px;align-items:flex-start;cursor:pointer">' +
        '<input type="radio" name="h38pbMethod" value="' + esc(id) + '" ' + (h38PB.method === id ? 'checked' : '') + ' style="width:22px;height:22px;margin-top:2px">' +
        '<span><strong>○ ' + esc(label) + '</strong><br><small class="muted">' + esc(type) + (isDefault ? ' · your default' : '') + '</small></span></label>';
    }).join('');
    var methodBlock = accounts.length
      ? '<div class="list">' + methodRows + '</div>'
      : '<div class="notice"><strong>No payment accounts configured.</strong> Add one in Accounting, or use "Mark as paid manually" below.</div>';
    $('mainContent').innerHTML = pageHead('Pay Bills — How to pay', 'Choose where the money comes from.') +
      '<div class="grid"><section class="card span8"><h2>Pay ' + money(total) + ' (' + chosen.length + ' bill' + (chosen.length === 1 ? '' : 's') + ')</h2>' +
      '<div class="list">' + chosen.map(function (b) {
        return '<div class="row"><div class="row-top"><strong>' + esc(v(b.row, 'Vendor Name') || 'Vendor') + '</strong><span>' + money(b.balance) + '</span></div>' +
          '<small class="muted">Due ' + (b.due ? esc(dateOnly(b.due)) : '—') + (b.daysLate > 0 ? ' · ' + b.daysLate + ' days late' : '') + '</small></div>';
      }).join('') + '</div>' +
      '<h2>Pay from</h2>' + methodBlock +
      '<label class="row" style="display:flex;gap:10px;align-items:flex-start;cursor:pointer">' +
      '<input type="radio" name="h38pbMethod" value="manual" ' + (h38PB.method === 'manual' || !accounts.length ? 'checked' : '') + ' style="width:22px;height:22px;margin-top:2px">' +
      '<span><strong>✍️ Mark as paid manually</strong><br><small class="muted">For checks or in-person payments — marks each bill paid, records it in your books. No money moves through the app.</small></span></label>' +
      '<div class="notice warn"><strong>What happens when you confirm:</strong> ' +
      (h38PB.method === 'manual'
        ? 'Each bill is marked paid and recorded in your books. You handle the actual payment yourself.'
        : 'This records payment instructions. Money moves on the bill due dates, not this instant.') +
      '</div>' +
      '<div class="actions" style="margin-top:12px"><button id="h38PBSchedule">' + (h38PB.method === 'manual' ? 'Mark as Paid' : 'Schedule Payments') + '</button>' +
      '<button type="button" class="secondary" id="h38PBBack">← Back</button></div></section>' +
      '<section class="card span4"><h2>Good to know</h2><p class="muted small">Overdue bills are scheduled for today. Bills due later move on their due dates. A confirmation is saved for your records on the next screen.</p></section></div>';
    document.querySelectorAll('input[name="h38pbMethod"]').forEach(function (radio) {
      radio.onchange = function () { h38PB.method = radio.value; h38PBRenderStep2(); };
    });
    $('h38PBBack').onclick = function () { h38PB.step = 1; h38PBRenderStep1(); };
    $('h38PBSchedule').onclick = h38PBConfirm;
  }

  /* ---------------- Confirm: write records ---------------- */

  async function h38PBConfirm() {
    var chosen = h38PB.bills.filter(function (b) { return h38PB.selected[b.id]; });
    if (!chosen.length) { toast('Select at least one bill.', true); return; }
    var manual = h38PB.method === 'manual';
    var methodLabel = 'Manual — check/in person';
    var acct = null;
    if (!manual) {
      acct = (records('bankAccounts') || []).find(function (a) { return rowId(a, 'Bank Account ID') === h38PB.method; });
      if (!acct) { toast('Choose a payment account, or mark as paid manually.', true); return; }
      methodLabel = String(v(acct, 'Account Name') || 'Account');
    }
    var total = chosen.reduce(function (s, b) { return s + b.balance; }, 0);
    var confirmed = confirm((manual ? 'Mark ' : 'Schedule ') + chosen.length + ' bill' + (chosen.length === 1 ? '' : 's') +
      ' (' + money(total) + ')? ' + (manual
        ? 'Each bill will be marked paid in your books. You pay the vendor yourself — no money moves through the app.'
        : 'This records payment instructions for ' + methodLabel + '. Money moves on the bill due dates.'));
    if (!confirmed) return;
    try {
      h38PB.result = [];
      for (var i = 0; i < chosen.length; i++) {
        var b = chosen[i];
        if (manual) {
          var payId = newId('VPAY');
          var payRecord = {
            'Vendor Payment ID': payId, 'Business ID': state.businessId,
            'Vendor Bill ID': b.id, 'Vendor ID': String(v(b.row, 'Vendor ID') || ''),
            'Vendor Name': String(v(b.row, 'Vendor Name') || ''),
            'Amount': b.balance, 'Payment Date': h38PBToday(),
            'Payment Method': methodLabel, 'Status': 'Paid',
            'Notes': 'Marked paid manually from the guided Pay Bills flow. No money moved through the app.',
            'Created Time': now(), 'Updated Time': now(), 'Record Version': 1
          };
          await saveParity('vendorPayments', 'Vendor Payment', payId, payRecord, 'vendorPayments', ['Vendor Payment ID']);
          var paidBill = Object.assign({}, b.row, {
            'Open Balance': 0, 'Status': 'Paid', 'Approval State': 'Approved',
            'Updated Time': now(), 'Record Version': num(v(b.row, 'Record Version')) + 1
          });
          await saveParity('vendorBills', 'Vendor Bill', b.id, paidBill, 'vendorBills', ['Bill ID']);
        } else {
          var instId = newId('PAYINST');
          var scheduledFor = b.daysLate > 0 ? h38PBToday() : (b.due || h38PBToday());
          var inst = {
            'Payment Instruction ID': instId, 'Business ID': state.businessId,
            'Vendor Bill ID': b.id, 'Vendor ID': String(v(b.row, 'Vendor ID') || ''),
            'Vendor Name': String(v(b.row, 'Vendor Name') || ''),
            'Amount': b.balance, 'Scheduled Date': scheduledFor,
            'Funding Account ID': rowId(acct, 'Bank Account ID'),
            'Funding Account Name': String(v(acct, 'Account Name') || ''),
            'Status': 'Scheduled — owner approved',
            'Memo': 'Bill ' + String(v(b.row, 'Bill Number') || b.id),
            'Notes': 'Scheduled from the guided Pay Bills flow. This records intent only — no transfer occurred.',
            'Created Time': now(), 'Updated Time': now(), 'Record Version': 1
          };
          await saveParity('paymentInstructions', 'Payment Instruction', instId, inst, 'paymentInstructions', ['Payment Instruction ID']);
          var apprBill = Object.assign({}, b.row, {
            'Status': 'Approved for Payment Review', 'Approval State': 'Approved',
            'Updated Time': now(), 'Record Version': num(v(b.row, 'Record Version')) + 1
          });
          await saveParity('vendorBills', 'Vendor Bill', b.id, apprBill, 'vendorBills', ['Bill ID']);
          b.scheduledFor = scheduledFor;
        }
        h38PB.result.push(b);
      }
      h38PB.resultMode = manual ? 'manual' : 'scheduled';
      h38PB.resultMethod = methodLabel;
      h38PB.step = 3; h38PBRenderStep3();
      toast(manual ? 'Bills marked as paid.' : 'Payments scheduled.');
    } catch (e) { toast('Could not finish: ' + (e && e.message || e), true); }
  }

  /* ---------------- Step 3: DONE ---------------- */

  function h38PBRenderStep3() {
    var manual = h38PB.resultMode === 'manual';
    var total = h38PB.result.reduce(function (s, b) { return s + b.balance; }, 0);
    $('mainContent').innerHTML = pageHead('Pay Bills — Done', manual ? 'Marked as paid.' : 'Payments scheduled.') +
      '<div class="grid"><section class="card span8"><h2>✅ ' + h38PB.result.length + ' payment' + (h38PB.result.length === 1 ? '' : 's') + ' ' + (manual ? 'recorded' : 'scheduled') + '</h2>' +
      '<div class="list">' + h38PB.result.map(function (b) {
        return '<div class="row"><div class="row-top"><strong>' + esc(v(b.row, 'Vendor Name') || 'Vendor') + '</strong><span>' + money(b.balance) + '</span></div>' +
          '<small class="muted">' + (manual ? 'Marked paid manually' : 'Scheduled for ' + esc(dateOnly(b.scheduledFor))) + '</small></div>';
      }).join('') + '</div>' +
      '<div class="stats" style="margin-top:12px"><div class="stat"><strong>' + money(total) + '</strong><span>Total</span></div>' +
      '<div class="stat"><strong>' + esc(h38PB.resultMethod) + '</strong><span>' + (manual ? 'Method' : 'Paid from') + '</span></div></div>' +
      (manual
        ? '<p class="muted small">Each bill is now marked paid in your books. A confirmation receipt is below for your records.</p>'
        : '<p class="muted small">Money moves on the due dates shown above, not right now. A confirmation is below for your records.</p>') +
      '<div class="actions"><button class="secondary" id="h38PBReceipt">Download receipt</button></div>' +
      '<div class="actions" style="margin-top:10px"><button id="h38PBDone">Done → Home</button></div></section></div>';
    $('h38PBReceipt').onclick = function () {
      var lines = h38PB.result.map(function (b) {
        return [v(b.row, 'Vendor Name') || 'Vendor', 'Bill ' + (v(b.row, 'Bill Number') || b.id),
          money(b.balance), manual ? 'Marked paid manually' : 'Scheduled for ' + dateOnly(b.scheduledFor)].join(' | ');
      });
      var text = ['Highway 38 Office — Bill payment confirmation', 'Date: ' + dateOnly(h38PBToday()),
        (manual ? 'Method: Marked paid manually (check / in person)' : 'Paid from: ' + h38PB.resultMethod),
        '', 'Bills:', ''].concat(lines).join('\n') + '\n\n' +
        (manual ? 'These bills were marked paid manually. No money moved through the app.'
          : 'These payments are scheduled. Money moves on the dates shown above.');
      h38PBDownload('bill-payments-' + h38PBToday() + '.txt', text, 'text/plain');
      toast('Receipt downloaded.');
    };
    $('h38PBDone').onclick = function () { openPage('today'); };
  }

  /* ---------------- public entry ---------------- */

  function h38PBStart() {
    if (!state.businessId) { toast('Open a business first.', true); return; }
    h38PB.step = 1;
    h38PB.selected = {};
    h38PB.method = 'manual';
    h38PB.kitAdvice = '';
    h38PB.result = [];
    h38PB.resultMode = '';
    h38PB.resultMethod = '';
    h38PBRenderStep1();
  }

  window.H38PayBills = { start: h38PBStart };
})();
