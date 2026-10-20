/* ============================================================================
 * H38 Office — Guided Payroll ("Run Payroll") — Phase 2 Owner Ease Rebuild
 * ----------------------------------------------------------------------------
 * SCRIPT TAG (coordinator adds to index.html, AFTER app-19.js):
 *   <script src="guided-payroll.js"></script>
 *
 * EXPOSES: window.H38GuidedPayroll.start()
 *   Called from the Owner Home "Payroll ready to run" action card.
 *
 * DATA COLLECTIONS USED (read/write):
 *   employees       (read) — active employees, Display Name, Pay Type,
 *                            Hourly Rate, Salary Rate, Overtime Multiplier, User ID
 *   timeEntries     (read + write) — hours per employee in the pay period;
 *                            writes corrective/manual entries when the owner
 *                            fixes hours
 *   payrollPeriods  (write) — WS3: one DRAFT run built by payroll-run.js on
 *                            finalize (same builder + taxes as the Payroll
 *                            page); review/finalize/post happen there
 *   payrollLines    (write) — one stored line per employee in that run
 *   tasks           (write) — "Send reminder" creates a submit-hours task
 *
 * EXISTING HELPERS USED (globals from app-01.js / app-02.js / app-19.js):
 *   records(), v(), rowId(), esc(), num(), money(), now(), newId(),
 *   pageHead(), openPage(), toast(), saveParity(), queueOperation(),
 *   dateOnly(), empty(), pill(), state
 *
 * DESIGN SOURCE: ~/workspace/your_files/owner-ease-rebuild-design.md §3.1
 * RULES:
 *   - Manual mode always works; Kit is an optional reviewer (AI assists, never gates).
 *   - "This does NOT send money" is stated plainly before finalize.
 *   - Nothing auto-sends messages: "Send reminder" only creates an internal task;
 *     "Download Stubs" / "Export" are owner-triggered downloads.
 * ============================================================================ */
(function () {
  'use strict';

  /* ---------------- local state ---------------- */
  var h38GP = {
    step: 1,
    payDate: new Date().toISOString().slice(0, 10), // ISO date
    periodStart: '',
    periodEnd: '',
    lines: [],          // computed payroll lines per employee
    overrides: {},      // employeeId -> {regular, overtime} manual adjustments
    fixMode: false,     // "Fix hours" edit inputs visible
    kitAdvice: '',      // optional AI advisory text (non-blocking)
    remindersSent: {},  // employeeId -> true
    manualEntryFor: '', // employeeId with the "Enter manually" form open
    runLines: null,     // stored lines of the Draft run built at finalize (WS3)
    runHeader: null     // header of that Draft run
  };

  /* ---------------- small helpers ---------------- */

  function h38GPWithin(value, start, end) {
    if (!value) return false;
    var day = String(value).slice(0, 10);
    return (!start || day >= start) && (!end || day <= end);
  }

  function h38GPPeriodRange() {
    var end = h38GP.payDate;
    var d = new Date(end + 'T12:00:00');
    d.setDate(d.getDate() - 13); // 14-day biweekly window ending on pay date
    var start = d.toISOString().slice(0, 10);
    return { start: start, end: end };
  }

  function h38GPDownload(filename, content, mimeType) {
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

  /* ---------------- data: compute payroll lines ---------------- */

  function h38GPComputeLines() {
    var range = h38GPPeriodRange();
    h38GP.periodStart = range.start;
    h38GP.periodEnd = range.end;
    var employees = (records('employees') || []).filter(function (row) {
      return String(v(row, 'Status')).toUpperCase() !== 'INACTIVE';
    });
    var time = records('timeEntries') || [];
    var lines = employees.map(function (emp) {
      var empId = rowId(emp, 'Employee ID');
      var userId = String(v(emp, 'User ID') || '');
      var payType = String(v(emp, 'Pay Type') || 'Hourly');
      var rate = num(v(emp, 'Hourly Rate'));
      var multiplier = num(v(emp, 'Overtime Multiplier')) || 1.5;
      var entries = time.filter(function (row) {
        var match = String(v(row, 'Employee ID')) === empId ||
          (userId && String(v(row, 'User ID')) === userId);
        return match && h38GPWithin(v(row, 'Date', 'Start Time'), range.start, range.end);
      });
      /* Entry-level OT split (WS3): overtime follows the approved entry
       * splits — the same rule payrollPreparation() uses. The old weekly-40
       * recomputation is retired (single source of truth). */
      var regular = 0, overtime = 0;
      entries.forEach(function (row) {
        var hasSplit = row['Regular Hours'] != null || row['Overtime Hours'] != null;
        var hrs = num(v(row, 'Hours', 'Duration Hours')) || (num(v(row, 'Regular Hours')) + num(v(row, 'Overtime Hours')));
        if (hasSplit) { regular += num(v(row, 'Regular Hours')); overtime += num(v(row, 'Overtime Hours')); }
        else if (/overtime/i.test(String(v(row, 'Type') || ''))) { overtime += hrs; }
        else { regular += hrs; }
      });
      var unapproved = entries.filter(function (row) {
        return String(v(row, 'Approval Status', 'Status')).toUpperCase() !== 'APPROVED';
      }).length;
      // Owner manual overrides (from "Fix hours") win over computed hours.
      var ov = h38GP.overrides[empId];
      if (ov) { regular = num(ov.regular); overtime = num(ov.overtime); }
      var regularPay = 0, overtimePay = 0, salaryPay = 0;
      if (payType.toLowerCase() === 'salary') {
        salaryPay = num(v(emp, 'Salary Rate'));
      } else {
        regularPay = regular * rate;
        overtimePay = overtime * rate * multiplier;
      }
      var gross = Math.round((regularPay + overtimePay + salaryPay) * 100) / 100;
      return {
        employeeId: empId,
        name: String(v(emp, 'Display Name') || 'Unnamed'),
        payType: payType,
        rate: rate,
        multiplier: multiplier,
        regularHours: Math.round(regular * 100) / 100,
        overtimeHours: Math.round(overtime * 100) / 100,
        salaryPay: Math.round(salaryPay * 100) / 100,
        regularPay: Math.round(regularPay * 100) / 100,
        overtimePay: Math.round(overtimePay * 100) / 100,
        gross: gross,
        entryCount: entries.length,
        unapprovedCount: unapproved,
        missing: entries.length === 0 && payType.toLowerCase() !== 'salary',
        adjusted: !!ov
      };
    });
    h38GP.lines = lines;
    return lines;
  }

  /* ---------------- AI assist (optional, never gates) ---------------- */

  async function h38GPAskKit() {
    var btn = $('h38GPAskKit');
    if (btn) { btn.disabled = true; btn.textContent = 'Hank is reviewing…'; }
    try {
      if (!window.H38_AI_HANDOFF || typeof window.H38_AI_HANDOFF.runTask !== 'function')
        throw new Error('Hank review is not available right now.');
      var summary = h38GP.lines.map(function (l) {
        return { name: l.name, regularHours: l.regularHours, overtimeHours: l.overtimeHours, gross: l.gross, payType: l.payType };
      });
      var result = await window.H38_AI_HANDOFF.runTask('payroll_review', {
        businessId: state.businessId,
        periodStart: h38GP.periodStart,
        periodEnd: h38GP.periodEnd,
        lines: summary
      });
      var text = (result && (result.advice || result.summary || result.review)) || '';
      h38GP.kitAdvice = String(text).trim() || 'Hank reviewed the hours and found nothing unusual.';
    } catch (e) {
      h38GP.kitAdvice = 'Hank could not review this time (' + (e && e.message || e) + '). Your hours are still fine to continue — nothing is blocked.';
    }
    h38GPRenderStep1();
  }

  /* ---------------- Step 1: REVIEW ---------------- */

  function h38GPLineRow(l) {
    var name = esc(l.name);
    if (h38GP.manualEntryFor === l.employeeId) return ''; // replaced by form below
    var detail;
    if (l.payType.toLowerCase() === 'salary') {
      detail = 'Salary · ' + money(l.salaryPay) + ' this period';
    } else {
      detail = l.regularHours.toFixed(2) + ' hrs' +
        (l.overtimeHours > 0 ? ' · <strong class="ot-flag">⚠️ ' + l.overtimeHours.toFixed(2) + ' hrs overtime</strong>' : '') +
        ' · ' + money(l.gross);
    }
    var warn = '';
    if (l.missing) warn = '<div class="notice warn" style="margin-top:8px"><strong>' + name + ' has no hours entered for this period.</strong>' +
      '<div class="row-actions" style="margin-top:8px">' +
      '<button type="button" class="secondary" data-h38gp-remind="' + esc(l.employeeId) + '"' + (h38GP.remindersSent[l.employeeId] ? ' disabled' : '') + '>' + (h38GP.remindersSent[l.employeeId] ? '✓ Reminder sent' : 'Send reminder') + '</button>' +
      '<button type="button" class="secondary" data-h38gp-manual="' + esc(l.employeeId) + '">Enter manually</button>' +
      '</div></div>';
    var unapproved = l.unapprovedCount > 0
      ? '<div><small class="muted">' + l.unapprovedCount + ' entr' + (l.unapprovedCount === 1 ? 'y' : 'ies') + ' not yet approved — included below, review before finalizing.</small></div>'
      : '';
    var fixInputs = '';
    if (h38GP.fixMode && l.payType.toLowerCase() !== 'salary') {
      fixInputs = '<div class="two" style="margin-top:8px"><div><label>Regular hrs</label>' +
        '<input type="number" step="0.25" min="0" data-h38gp-reg="' + esc(l.employeeId) + '" value="' + l.regularHours.toFixed(2) + '"></div>' +
        '<div><label>Overtime hrs</label>' +
        '<input type="number" step="0.25" min="0" data-h38gp-ot="' + esc(l.employeeId) + '" value="' + l.overtimeHours.toFixed(2) + '"></div></div>' +
        (l.adjusted ? '<small class="muted">Owner-adjusted hours.</small>' : '');
    }
    return '<div class="row"><div class="row-top"><strong>' + name + '</strong>' + pill(l.payType) + '</div>' +
      '<small>' + detail + '</small>' + unapproved + fixInputs + warn + '</div>';
  }

  function h38GPManualEntryForm(l) {
    return '<div class="row"><div class="row-top"><strong>' + esc(l.name) + '</strong></div>' +
      '<p class="muted small">Enter the hours they worked this period. This creates a time entry on their record.</p>' +
      '<div class="two"><div><label>Regular hours</label><input type="number" step="0.25" min="0" id="h38GPManualReg" value="0"></div>' +
      '<div><label>Overtime hours</label><input type="number" step="0.25" min="0" id="h38GPManualOt" value="0"></div></div>' +
      '<div class="row-actions"><button type="button" id="h38GPManualSave">Save hours</button>' +
      '<button type="button" class="secondary" id="h38GPManualCancel">Cancel</button></div></div>';
  }

  function h38GPRenderStep1() {
    var lines = h38GPComputeLines();
    var totals = lines.reduce(function (s, l) {
      return { hours: s.hours + l.regularHours + l.overtimeHours, gross: s.gross + l.gross };
    }, { hours: 0, gross: 0 });
    var otCount = lines.filter(function (l) { return l.overtimeHours > 0; }).length;
    var periodLabel = dateOnly(h38GP.periodStart) + ' – ' + dateOnly(h38GP.periodEnd);
    var rows = lines.length ? lines.map(function (l) {
      return h38GP.manualEntryFor === l.employeeId ? h38GPManualEntryForm(l) : h38GPLineRow(l);
    }).join('') : empty('No active employees found.', { page: 'people', label: 'Add employees first' });
    var advice = h38GP.kitAdvice
      ? '<div class="notice"><strong>Hank’s review:</strong> ' + esc(h38GP.kitAdvice) + '</div>' : '';
    $('mainContent').innerHTML = '<div class="h38-flow-view">' + pageHead('Run Payroll — Review', 'Hours are pre-filled from time entries. Review, fix anything, then continue.',
      '<button class="secondary" id="h38GPAskKit">Ask Hank to review</button>') +
      '<div class="grid"><section class="card span8"><h2>Payroll — ' + esc(periodLabel) + '</h2>' +
      advice +
      '<div class="list">' + rows + '</div>' +
      '<div class="stats" style="margin-top:12px"><div class="stat"><strong>' + totals.hours.toFixed(2) + '</strong><span>Total hours</span></div>' +
      '<div class="stat"><strong>' + money(totals.gross) + '</strong><span>Gross total</span></div>' +
      '<div class="stat"><strong>' + otCount + '</strong><span>With overtime</span></div></div>' +
      '<div class="actions" style="margin-top:12px">' +
      '<button id="h38GPContinue">' + (h38GP.fixMode ? 'Save hours & continue →' : 'Looks good, continue →') + '</button>' +
      '<button type="button" class="secondary" id="h38GPFix">' + (h38GP.fixMode ? 'Cancel fix' : '← Fix hours') + '</button>' +
      '<button type="button" class="secondary" data-open-page="payroll">Full payroll page</button>' +
      '</div></section>' +
      '<section class="card span4"><h2>Pay date</h2><input type="date" id="h38GPPayDate" value="' + esc(h38GP.payDate) + '">' +
      '<p class="muted small">The pay period is the 14 days ending on the pay date. Tax figures are not estimated here — use the full Payroll page for tax worksheets.</p>' +
      '<div class="actions"><button type="button" class="secondary" data-open-page="today">Cancel</button></div></section></div>' + '</div>';
    var ask = $('h38GPAskKit'); if (ask) ask.onclick = h38GPAskKit;
    var pd = $('h38GPPayDate');
    if (pd) pd.onchange = function () { h38GP.payDate = pd.value || h38GP.payDate; h38GPRenderStep1(); };
    $('h38GPContinue').onclick = function () {
      if (h38GP.fixMode) {
        // Collect owner edits as overrides.
        document.querySelectorAll('[data-h38gp-reg]').forEach(function (input) {
          var id = input.getAttribute('data-h38gp-reg');
          var otEl = document.querySelector('[data-h38gp-ot="' + id.replace(/"/g, '\\"') + '"]');
          h38GP.overrides[id] = { regular: num(input.value), overtime: otEl ? num(otEl.value) : 0 };
        });
        h38GP.fixMode = false;
      }
      h38GP.step = 2; h38GPRenderStep2();
    };
    $('h38GPFix').onclick = function () { h38GP.fixMode = !h38GP.fixMode; h38GPRenderStep1(); };
    // Missing-hours actions
    document.querySelectorAll('[data-h38gp-remind]').forEach(function (btn) {
      btn.onclick = function () { h38GPSendReminder(btn.getAttribute('data-h38gp-remind')); };
    });
    document.querySelectorAll('[data-h38gp-manual]').forEach(function (btn) {
      btn.onclick = function () { h38GP.manualEntryFor = btn.getAttribute('data-h38gp-manual'); h38GPRenderStep1(); };
    });
    var ms = $('h38GPManualSave');
    if (ms) ms.onclick = h38GPManualSave;
    var mc = $('h38GPManualCancel');
    if (mc) mc.onclick = function () { h38GP.manualEntryFor = ''; h38GPRenderStep1(); };
  }

  async function h38GPSendReminder(employeeId) {
    try {
      var emp = (records('employees') || []).find(function (r) { return rowId(r, 'Employee ID') === employeeId; });
      var id = newId('TASK');
      var title = 'Submit your hours for ' + dateOnly(h38GP.periodStart) + ' – ' + dateOnly(h38GP.periodEnd);
      var record = {
        'Task ID': id, 'Business ID': state.businessId, 'Job ID': '',
        'Task Title': title,
        'Assigned User ID': emp ? String(v(emp, 'User ID') || '') : '',
        'Status': 'Open', 'Priority': 'Normal',
        'Notes': 'Created from the guided Run Payroll flow. No message was sent automatically.',
        'Created Time': now(), 'Updated Time': now(), 'Record Version': 1
      };
      await queueOperation('SAVE_TASK', 'Task', id, { entity: 'tasks', record: record },
        { collection: 'tasks', record: record, idKeys: ['Task ID'] });
      h38GP.remindersSent[employeeId] = true;
      toast('Reminder task created for ' + (emp ? v(emp, 'Display Name') : 'the employee') + '. No message was sent automatically.');
      h38GPRenderStep1();
    } catch (e) { toast('Could not create the reminder: ' + (e && e.message || e), true); }
  }

  async function h38GPManualSave() {
    try {
      var empId = h38GP.manualEntryFor;
      var emp = (records('employees') || []).find(function (r) { return rowId(r, 'Employee ID') === empId; });
      if (!emp) throw new Error('Employee not found.');
      var reg = num(($('h38GPManualReg') || {}).value), ot = num(($('h38GPManualOt') || {}).value);
      if (reg <= 0 && ot <= 0) throw new Error('Enter at least some hours.');
      var id = newId('TIME');
      var record = {
        'Time Entry ID': id, 'Business ID': state.businessId,
        'User ID': String(v(emp, 'User ID') || ''), 'Employee ID': empId, 'Job ID': '',
        'Date': h38GP.payDate, 'Start Time': '', 'End Time': '',
        'Regular Hours': reg, 'Overtime Hours': ot, 'Hours': reg + ot,
        'Status': 'Recorded', 'Approval Status': 'Recorded',
        'Notes': 'Owner-entered from the guided Run Payroll flow (' + dateOnly(h38GP.periodStart) + ' – ' + dateOnly(h38GP.periodEnd) + ').',
        'Created Time': now(), 'Updated Time': now(), 'Record Version': 1
      };
      await queueOperation('RECORD_TIME', 'Time Entry', id, { timeEntryId: id, record: record },
        { collection: 'timeEntries', record: record, idKeys: ['Time Entry ID'] });
      delete h38GP.overrides[empId]; // real entry now, no override needed
      h38GP.manualEntryFor = '';
      toast('Hours saved for ' + v(emp, 'Display Name') + '.');
      h38GPRenderStep1();
    } catch (e) { toast(e && e.message || e, true); }
  }

  /* ---------------- Step 2: CONFIRM ---------------- */

  function h38GPRenderStep2() {
    var lines = h38GPComputeLines();
    var totals = lines.reduce(function (s, l) {
      return { hours: s.hours + l.regularHours + l.overtimeHours, gross: s.gross + l.gross, count: s.count + 1 };
    }, { hours: 0, gross: 0, count: 0 });
    $('mainContent').innerHTML = '<div class="h38-flow-view">' + pageHead('Run Payroll — Confirm', 'Last check before the stubs are created.') +
      '<div class="grid"><section class="card span8"><h2>Ready to finalize?</h2>' +
      '<div class="stats"><div class="stat"><strong>' + totals.count + '</strong><span>Paychecks</span></div>' +
      '<div class="stat"><strong>' + money(totals.gross) + '</strong><span>Gross total</span></div>' +
      '<div class="stat"><strong>' + dateOnly(h38GP.payDate) + '</strong><span>Pay date</span></div></div>' +
      '<div class="notice warn"><strong>This creates a pay run. It does NOT send money</strong> — you pay your team as usual. The run is built by the same builder as the full Payroll page (approved-time selection + tax estimates) and saved as a <strong>Draft</strong> — review and finalize it on the Payroll page to stamp time, unlock export, and post to the books.</div>' +
      '<div class="list">' + lines.map(function (l) {
        return '<div class="row"><div class="row-top"><strong>' + esc(l.name) + '</strong><span>' + money(l.gross) + '</span></div>' +
          '<small>' + (l.payType.toLowerCase() === 'salary' ? 'Salary' : l.regularHours.toFixed(2) + ' reg · ' + l.overtimeHours.toFixed(2) + ' OT') +
          (l.adjusted ? ' · owner-adjusted' : '') + '</small></div>';
      }).join('') + '</div>' +
      '<div class="actions" style="margin-top:12px"><button id="h38GPFinalize">✓ Finalize Payroll</button>' +
      '<button type="button" class="secondary" id="h38GPBack">← Back</button>' +
      '<button type="button" class="secondary" data-open-page="today">Cancel</button></div></section>' +
      '<section class="card span4"><h2>What happens next</h2>' +
      '<p class="muted small">Finalizing saves one payroll period and one line per person. Nothing moves money, nothing is sent, and your full Payroll page can still export everything for your accountant.</p></section></div>' + '</div>';
    $('h38GPBack').onclick = function () { h38GP.step = 1; h38GPRenderStep1(); };
    $('h38GPFinalize').onclick = h38GPFinalize;
  }

  /* WS3: finalize delegates to the canonical run builder (payroll-run.js) —
   * same approved-time selection, same tax estimates as the full Payroll
   * page. The guided flow saves a DRAFT run; review/finalize/post happen on
   * the Payroll page. Owner hour overrides are applied to the Draft lines
   * (Draft adjustment, noted on the line) and re-run through payroll-calc. */
  async function h38GPFinalize() {
    var lines = h38GPComputeLines();
    if (!lines.length) { toast('No employees to finalize.', true); return; }
    var confirmed = confirm('Build the pay run for ' + lines.length + ' people, ' + money(lines.reduce(function (s, l) { return s + l.gross; }, 0)) + ' gross? It is saved as a Draft with tax estimates for your review on the Payroll page. It does NOT send money.');
    if (!confirmed) return;
    try {
      if (!window.H38_PAYROLL_RUN && window.H38ScriptLoader) await window.H38ScriptLoader.loadPageScripts('payroll');
      if (!window.H38_PAYROLL_RUN || !window.H38_PAYROLL_CALC) throw new Error('Payroll modules could not be loaded. Open the Payroll page once, then try again.');
      var built = await window.H38_PAYROLL_RUN.buildRun({ start: h38GP.periodStart, end: h38GP.periodEnd, payDate: h38GP.payDate, source: 'guided' });
      if (!built.lines.length) throw new Error(built.unlinkedCount > 0 ? built.unlinkedCount + ' time entries couldn\'t be matched to an employee — check People & Employees and link each employee to their sign-in user.' : 'No approved time or salaried employees were selected for this period — check time approvals and the period dates on the Payroll page.');
      await window.H38_PAYROLL_RUN.saveDraft(built);
      var runId = built.header['Payroll Period ID'];
      var finalLines = built.lines;
      if (Object.keys(h38GP.overrides).length) finalLines = await h38GPApplyOverrides(runId, built);
      h38GP.periodId = runId;
      h38GP.runLines = finalLines;
      h38GP.runHeader = built.header;
      h38GP.step = 3; h38GPRenderStep3();
      toast('Pay run saved as a Draft with tax estimates. Review & finalize it on the Payroll page.');
    } catch (e) { toast('Could not build the pay run: ' + (e && e.message || e), true); }
  }

  /* Apply guided "Fix hours" overrides to Draft lines and recompute the
   * affected lines through payroll-calc.js, then refresh header totals. */
  async function h38GPApplyOverrides(runId, built) {
    var C = window.H38_PAYROLL_CALC, R = window.H38_PAYROLL_RUN;
    var employees = records('employees') || [];
    var allLines = (records('payrollLines') || []).filter(function (l) { return v(l, 'Payroll Period ID') !== runId; });
    var out = [];
    for (var i = 0; i < built.lines.length; i++) {
      var line = built.lines[i];
      var ov = h38GP.overrides[v(line, 'Employee ID')];
      var emp = employees.find(function (e) { return rowId(e, 'Employee ID') === v(line, 'Employee ID'); }) || {};
      if (!ov || String(v(emp, 'Pay Type') || '').toLowerCase() === 'salary') { out.push(line); continue; }
      var rate = num(v(emp, 'Hourly Rate'));
      var otRate = v(emp, 'Overtime Rate') != null && v(emp, 'Overtime Rate') !== '' ? num(v(emp, 'Overtime Rate')) : rate * (num(v(emp, 'Overtime Multiplier')) || 1.5);
      var regularPay = Math.round(num(ov.regular) * rate * 100) / 100;
      var overtimePay = Math.round(num(ov.overtime) * otRate * 100) / 100;
      var gross = Math.round((regularPay + overtimePay) * 100) / 100;
      var calc = C.calculateLine({ grossPay: gross, reimbursements: num(v(line, 'Reimbursements')), frequency: v(line, 'Pay Frequency') || 'Biweekly',
        employee: emp, deductions: R.employeeDeductions(emp), contractor: R.isContractor(emp),
        ytd: { gross: R.ytdWagesBefore(allLines, v(line, 'Employee ID'), h38GP.payDate, runId) } }, R.loadConfig());
      var wh = calc.withholdings, et = calc.employerTaxes;
      var updated = Object.assign({}, line, {
        'Regular Hours': num(ov.regular), 'Overtime Hours': num(ov.overtime),
        'Regular Pay': regularPay, 'Overtime Pay': overtimePay, 'Gross Pay': gross,
        'Federal Withholding': wh.federal, 'Social Security': wh.ficaSS, 'Medicare': wh.ficaMed,
        'Additional Medicare': wh.additionalMedicare, 'State Withholding': wh.state, 'Other Withholding': wh.other,
        'Total Deductions': calc.totalWithholdings + calc.totalDeductions, 'Deductions': calc.totalWithholdings + calc.totalDeductions,
        'Net Pay': calc.net, 'Prepared Net Amount': calc.net,
        'Deductions Detail': calc.deductions,
        'Pre-Tax Deductions': calc.deductions.filter(function (d) { return d.kind === 'pre-tax'; }),
        'Post-Tax Deductions': calc.deductions.filter(function (d) { return d.kind === 'post-tax'; }),
        'Employer SS': et.ss, 'Employer Medicare': et.medicare, 'FUTA': et.futa, 'SUTA': et.suta, 'Employer State Tax': et.stateOther,
        'Employer Tax Estimate': calc.employerTaxTotal, 'Employer Cost Estimate': calc.employerCost,
        'Calc Trace': calc.trace,
        'Notes': (v(line, 'Notes') || '') + ' Owner-adjusted hours in the guided flow.',
        'Updated Time': now(), 'Record Version': num(v(line, 'Record Version')) + 1
      });
      await saveParity('payrollLines', 'Payroll Line', v(line, 'Payroll Line ID'), updated, 'payrollLines', ['Payroll Line ID']);
      out.push(updated);
    }
    var sumF = function (k) { return Math.round(out.reduce(function (s, l) { return s + num(v(l, k)); }, 0) * 100) / 100; };
    var header = Object.assign({}, built.header, {
      'Gross Pay': sumF('Gross Pay'), 'Deductions': sumF('Total Deductions'),
      'Net Pay': sumF('Net Pay'), 'Prepared Net Amount': sumF('Net Pay'),
      'Withholding Totals': { federal: sumF('Federal Withholding'), ficaSS: sumF('Social Security'), ficaMed: sumF('Medicare'), additionalMedicare: sumF('Additional Medicare'), state: sumF('State Withholding'), other: sumF('Other Withholding') },
      'Employer Taxes': { ss: sumF('Employer SS'), medicare: sumF('Employer Medicare'), futa: sumF('FUTA'), suta: sumF('SUTA'), stateOther: sumF('Employer State Tax') },
      'Employer Tax Estimate': sumF('Employer Tax Estimate'), 'Employer Cost Estimate': sumF('Employer Cost Estimate'),
      'Updated Time': now(), 'Record Version': num(v(built.header, 'Record Version')) + 1
    });
    await saveParity('payrollPeriods', 'Payroll Period', runId, header, 'payrollPeriods', ['Payroll Period ID']);
    h38GP.runHeader = header;
    try { await sync(false); } catch (e) {}
    return out;
  }

  /* ---------------- Step 3: DONE ---------------- */

  function h38GPRenderStep3() {
    var lines = h38GP.runLines || h38GP.lines;
    $('mainContent').innerHTML = '<div class="h38-flow-view">' + pageHead('Run Payroll — Done', 'Pay run saved as a Draft.') +
      '<div class="grid"><section class="card span8"><h2>✅ Pay run saved (Draft)</h2>' +
      '<p>' + lines.length + ' pay line' + (lines.length === 1 ? '' : 's') + ' built for ' +
      dateOnly(h38GP.periodStart) + ' – ' + dateOnly(h38GP.periodEnd) + ', pay date ' + dateOnly(h38GP.payDate) + ', with tax estimates from the same tables as the full Payroll page.</p>' +
      '<p class="muted">Next: open the <strong>Payroll</strong> page to review the estimates, finalize (stamps time + unlocks export), and post the run to the books. Nothing has been paid or sent.</p>' +
      '<div class="actions"><button id="h38GPStubs">Download Stubs</button>' +
      '<button class="secondary" id="h38GPExport">Export for accountant</button>' +
      '<button class="secondary" data-open-page="payroll">Open Payroll page →</button></div>' +
      '<div class="actions" style="margin-top:10px"><button class="secondary" id="h38GPDone">Done → Home</button></div>' +
      '</section></div>' + '</div>';
    $('h38GPStubs').onclick = h38GPDownloadStubs;
    $('h38GPExport').onclick = h38GPExportCSV;
    $('h38GPDone').onclick = function () { openPage('today'); };
    document.querySelectorAll('[data-open-page]').forEach(function (b) { b.onclick = function () { openPage(b.getAttribute('data-open-page')); }; });
  }

  function h38GPDownloadStubs() {
    var biz = (state.snapshot && state.snapshot.business) || {};
    var bizName = esc(String(v(biz, 'Name', 'Business Name') || 'Business'));
    var lines = h38GP.lines;
    // Prefer the built Draft run's stored lines (tax estimates included).
    if (h38GP.runLines && typeof h38PayStubHTML === 'function') {
      var employees = records('employees') || [];
      var period = h38GP.runHeader || { 'Period Start': h38GP.periodStart, 'Period End': h38GP.periodEnd, 'Pay Date': h38GP.payDate };
      var html2 = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pay Stubs — ' + esc(dateOnly(h38GP.payDate)) + '</title>' +
        '<link rel="stylesheet" href="./payroll-print.css"></head><body>' +
        h38GP.runLines.map(function (l) {
          var emp = employees.find(function (e) { return rowId(e, 'Employee ID') === v(l, 'Employee ID'); }) || {};
          return h38PayStubHTML(biz, emp, period, l);
        }).join('') + '</body></html>';
      h38GPDownload('pay-stubs-' + h38GP.payDate + '.html', html2, 'text/html');
      toast('Stubs downloaded. Open the file and print to PDF.');
      return;
    }
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pay Stubs — ' +
      esc(dateOnly(h38GP.payDate)) + '</title>' +
      '<style>body{font-family:Arial,sans-serif;margin:40px;color:#222}h1{font-size:22px}.stub{border:1px solid #999;padding:20px;margin:24px 0;page-break-inside:avoid}table{width:100%;border-collapse:collapse;margin-top:12px}td{padding:6px 0;border-bottom:1px dotted #ccc}.tot{font-weight:bold;border-bottom:none}.note{color:#666;font-size:12px;margin-top:12px}</style></head><body>' +
      '<h1>' + bizName + ' — Pay Stubs</h1>' +
      '<p>Period: ' + esc(dateOnly(h38GP.periodStart)) + ' – ' + esc(dateOnly(h38GP.periodEnd)) + ' · Pay date: ' + esc(dateOnly(h38GP.payDate)) + '</p>' +
      lines.map(function (l) {
        var rows = l.payType.toLowerCase() === 'salary'
          ? '<tr><td>Salary</td><td style="text-align:right">' + esc(money(l.salaryPay)) + '</td></tr>'
          : '<tr><td>Regular (' + l.regularHours.toFixed(2) + ' hrs @ ' + esc(money(l.rate)) + ')</td><td style="text-align:right">' + esc(money(l.regularPay)) + '</td></tr>' +
          '<tr><td>Overtime (' + l.overtimeHours.toFixed(2) + ' hrs @ ' + esc(money(l.rate)) + ' × ' + esc(String(l.multiplier)) + ')</td><td style="text-align:right">' + esc(money(l.overtimePay)) + '</td></tr>';
        return '<div class="stub"><h2>' + esc(l.name) + '</h2><table>' + rows +
          '<tr class="tot"><td>Gross pay</td><td style="text-align:right">' + esc(money(l.gross)) + '</td></tr></table>' +
          '<p class="note">Record of payroll preparation from the H38 Office. This stub does not move money. Tax figures are estimates handled in the full Payroll page.</p></div>';
      }).join('') + '</body></html>';
    h38GPDownload('pay-stubs-' + h38GP.payDate + '.html', html, 'text/html');
    toast('Stubs downloaded. Open the file and print to PDF.');
  }

  function h38GPExportCSV() {
    if (h38GP.runLines && typeof h38PayrollCSV === 'function') {
      var period = h38GP.runHeader || { 'Pay Date': h38GP.payDate };
      h38GPDownload('payroll-export-' + h38GP.payDate + '.csv', h38PayrollCSV(period, h38GP.runLines, records('employees') || []), 'text/csv');
      toast('Payroll export downloaded for your accountant.');
      return;
    }
    var lines = h38GP.lines;
    var csv = ['Employee,Pay Type,Regular Hours,Overtime Hours,Hourly Rate,Regular Pay,Overtime Pay,Salary Pay,Gross Pay,Period Start,Period End,Pay Date']
      .concat(lines.map(function (l) {
        return [l.name, l.payType, l.regularHours.toFixed(2), l.overtimeHours.toFixed(2),
          l.rate.toFixed(2), l.regularPay.toFixed(2), l.overtimePay.toFixed(2),
          l.salaryPay.toFixed(2), l.gross.toFixed(2), h38GP.periodStart, h38GP.periodEnd, h38GP.payDate]
          .map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
      })).join('\n');
    h38GPDownload('payroll-export-' + h38GP.payDate + '.csv', csv, 'text/csv');
    toast('Payroll export downloaded for your accountant.');
  }

  /* ---------------- public entry ---------------- */

  function h38GPStart() {
    if (!state.businessId) { toast('Open a business first.', true); return; }
    h38GP.step = 1;
    h38GP.overrides = {};
    h38GP.fixMode = false;
    h38GP.kitAdvice = '';
    h38GP.remindersSent = {};
    h38GP.manualEntryFor = '';
    h38GP.runLines = null;
    h38GP.runHeader = null;
    h38GP.payDate = new Date().toISOString().slice(0, 10);
    h38GPRenderStep1();
  }

  window.H38GuidedPayroll = { start: h38GPStart };
})();
