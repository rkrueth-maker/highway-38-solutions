'use strict';
/* WS3 payroll run verifier — selection reuse, run-aware double-pay exclusion,
 * state machine, GL posting balance + idempotency, liability summary.
 * Uses the REAL payrollPreparation() (pinned) for selection. */
const assert = require('assert');
const OPS = require('../commercial-app/accounting-operations.js');
const ENGINE = require('../commercial-app/accounting-engine.js');
const RUN = require('../commercial-app/payroll-run.js');

let passed = 0;
function ok(name, fn) { try { fn(); passed++; console.log('PASS', name); } catch (e) { console.error('FAIL', name, e.message); throw e; } }

const businessId = 'TEST-BIZ';
const employees = [
  { 'Employee ID': 'E1', 'Display Name': 'Wanda Wrench', 'User ID': 'U1', 'Pay Type': 'Hourly', 'Hourly Rate': 25, 'Overtime Multiplier': 1.5, 'Pay Frequency': 'Biweekly', 'Filing Status': 'Single', 'Status': 'Active' },
  { 'Employee ID': 'E2', 'Display Name': 'Carl Contractor', 'User ID': 'U2', 'Pay Type': 'Contract', 'Employment Type': 'Contractor', 'Hourly Rate': 40, 'Pay Frequency': 'Biweekly', 'Status': 'Active' },
  { 'Employee ID': 'E3', 'Display Name': 'Sally Salary', 'User ID': 'U3', 'Pay Type': 'Salary', 'Salary Rate': 3000, 'Pay Frequency': 'Biweekly', 'Filing Status': 'Married Filing Jointly', 'Status': 'Active' }
];
const timeEntries = [
  { 'Time Entry ID': 'T1', 'Business ID': businessId, 'Employee ID': 'E1', 'Date': '2026-10-05', 'Hours': 8, 'Regular Hours': 8, 'Overtime Hours': 0, 'Approval Status': 'Approved', 'Job ID': 'J1' },
  { 'Time Entry ID': 'T2', 'Business ID': businessId, 'Employee ID': 'E1', 'Date': '2026-10-06', 'Hours': 10, 'Regular Hours': 8, 'Overtime Hours': 2, 'Approval Status': 'Approved', 'Job ID': 'J1' },
  { 'Time Entry ID': 'T3', 'Business ID': businessId, 'Employee ID': 'E2', 'Date': '2026-10-05', 'Hours': 5, 'Approval Status': 'Approved' },
  { 'Time Entry ID': 'T4', 'Business ID': businessId, 'Employee ID': 'E1', 'Date': '2026-10-07', 'Hours': 8, 'Approval Status': 'Pending' }
];
const prep = OPS.payrollPreparation({ businessId, periodId: 'RUN-1', startDate: '2026-10-01', endDate: '2026-10-14', employees, timeEntries, reimbursements: [], mileage: [] });

ok('selection reuses payrollPreparation: approved in-period entries only, entry-level OT split', () => {
  const e1 = prep.Items.find(i => i.employeeId === 'E1');
  assert.equal(e1.regularHours, 16); assert.equal(e1.overtimeHours, 2);
  assert.equal(e1.grossPay, 16 * 25 + 2 * 37.5);
  assert.ok(prep['Excluded Sources'].some(x => x.id === 'T4' && /approval/i.test(x.reason)));
  assert.deepEqual(e1.sourceIds.filter(s => s.kind === 'time').map(s => s.id), ['T1', 'T2']);
});

const built = RUN.buildRunRecords({ businessId, runId: 'RUN-1', periodStart: '2026-10-01', periodEnd: '2026-10-14', payDate: '2026-10-16', preparation: prep, employees, existingLines: [], existingRuns: [], nowIso: '2026-10-16T00:00:00.000Z' });

ok('run builder: Draft header with totals, config snapshot, honest stamping field', () => {
  assert.equal(built.header.Status, 'Draft');
  assert.equal(built.header['Export Allowed'], 'No');
  assert.equal(built.header['Time Entry Stamping'], RUN.STAMP_PENDING);
  assert.ok(built.header['Tax Config Snapshot']);
  assert.ok(built.header['OT Migration Note'].includes('approved entry splits'));
  const l1 = built.lines.find(l => l['Employee ID'] === 'E1');
  assert.deepEqual(l1['Time Entry IDs'], ['T1', 'T2']);
  const sumC = (rows, k) => Math.round(rows.reduce((s, l) => s + l[k], 0) * 100) / 100;
  assert.equal(built.header['Gross Pay'], sumC(built.lines, 'Gross Pay'));
  assert.equal(built.header['Net Pay'], sumC(built.lines, 'Net Pay'));
});

ok('run builder: salaried employee gets a Salary Rate line with no time', () => {
  const l3 = built.lines.find(l => l['Employee ID'] === 'E3');
  assert.ok(l3); assert.equal(l3['Gross Pay'], 3000); assert.equal(l3['Salary Pay'], 3000);
});

ok('run builder: contractor line is gross-to-net with 1099 label, no withholding', () => {
  const l2 = built.lines.find(l => l['Employee ID'] === 'E2');
  assert.equal(l2['Gross Pay'], 200); assert.equal(l2['Net Pay'], 200);
  assert.equal(l2['Federal Withholding'], 0); assert.equal(l2['Social Security'], 0);
  assert.ok(l2['Contractor Label'].includes('1099'));
});

ok('double-pay prevention: entries on a Finalized run are excluded from the next build', () => {
  const finalizedHeader = { ...built.header, Status: 'Finalized' };
  const used = RUN.runsContainingEntries([finalizedHeader], built.lines);
  assert.equal(used.get('T1'), 'RUN-1'); assert.equal(used.get('T2'), 'RUN-1');
  const prep2 = OPS.payrollPreparation({ businessId, periodId: 'RUN-2', startDate: '2026-10-01', endDate: '2026-10-14', employees, timeEntries, reimbursements: [], mileage: [] });
  const built2 = RUN.buildRunRecords({ businessId, runId: 'RUN-2', periodStart: '2026-10-01', periodEnd: '2026-10-14', payDate: '2026-10-30', preparation: prep2, employees, existingLines: built.lines, existingRuns: [finalizedHeader] });
  const l1 = built2.lines.find(l => l['Employee ID'] === 'E1');
  assert.ok(!l1 || l1['Gross Pay'] === 0, 'E1 must not be paid twice for T1/T2');
  assert.ok(built2.header['Excluded Sources'].some(x => x.id === 'T1' && /finalized\/posted run/i.test(x.reason)));
  // A Draft run does NOT block re-selection.
  const usedDraft = RUN.runsContainingEntries([built.header], built.lines);
  assert.equal(usedDraft.size, 0);
});

ok('state machine: Draft → Reviewed → Finalized → Posted only, estimates gate enforced', () => {
  assert.throws(() => RUN.transition(built.header, 'Finalized'), /cannot move/);
  assert.throws(() => RUN.transition(built.header, 'Posted'), /cannot move/);
  const reviewed = RUN.applyTransition(built.header, 'Reviewed', { by: 'owner' });
  assert.equal(reviewed['Reviewed By'], 'owner');
  assert.throws(() => RUN.applyTransition(reviewed, 'Finalized', { by: 'owner' }), /estimates gate/);
  const fin = RUN.applyTransition(reviewed, 'Finalized', { by: 'owner', estimatesConfirmed: true });
  assert.equal(fin['Approval Status'], 'Approved'); assert.equal(fin['Export Allowed'], 'Yes');
  assert.equal(fin['Estimates Confirmed By'], 'owner');
  const posted = RUN.applyTransition(fin, 'Posted', { by: 'owner' });
  assert.equal(posted['Ledger Transaction ID'], 'GL-PAYROLL-RUN-1');
  assert.throws(() => RUN.transition(posted, 'Void'), /cannot move/);
  const voided = RUN.applyTransition(reviewed, 'Void', {});
  assert.equal(voided['Export Allowed'], 'No');
});

ok('GL posting: balanced, deterministic id, direct-labor share splits gross', () => {
  const fin = RUN.applyTransition(RUN.applyTransition(built.header, 'Reviewed', { by: 'o' }), 'Finalized', { by: 'o', estimatesConfirmed: true });
  const tx = RUN.postingForRun(fin, built.lines);
  assert.equal(tx.id, 'GL-PAYROLL-RUN-1');
  assert.equal(tx.balanced, true);
  assert.equal(ENGINE.validateTransaction(tx).balanced, true);
  const dr5100 = tx.lines.find(l => l.accountId === 'ACCT-5100');
  const dr6800 = tx.lines.find(l => l.accountId === 'ACCT-6800');
  assert.equal(dr5100.debit, 675); // Σ jobAllocations.cost per spec §3.5 (E1 475 + E2 200)
  assert.equal(dr6800.debit, fin['Gross Pay'] - 675);
  const cr2440 = tx.lines.find(l => l.accountId === 'ACCT-2440');
  assert.equal(cr2440.credit, fin['Net Pay']);
  const again = RUN.postingForRun(fin, built.lines);
  assert.equal(again.id, tx.id); // idempotent: same id on retry → bridge-style dedupe
  assert.deepEqual(again.lines, tx.lines);
});

ok('GL posting: new payroll accounts exist in the default chart', () => {
  const ids = new Set(ENGINE.chart().map(a => a.id));
  for (const id of ['ACCT-2400', 'ACCT-2410', 'ACCT-2420', 'ACCT-2430', 'ACCT-2440', 'ACCT-2450', 'ACCT-6800', 'ACCT-6900']) assert.ok(ids.has(id), id);
});

ok('liability summary: posted runs accrue; balances read from the ledger', () => {
  const fin = RUN.applyTransition(RUN.applyTransition(built.header, 'Reviewed', { by: 'o' }), 'Finalized', { by: 'o', estimatesConfirmed: true });
  const postedHeader = RUN.applyTransition(fin, 'Posted', { by: 'o' });
  const tx = RUN.postingForRun(postedHeader, built.lines);
  const s = RUN.liabilitySummary({ runs: [postedHeader], lines: built.lines, transactions: [tx], accounts: [] });
  assert.equal(s.accrued.netPay, postedHeader['Net Pay']);
  assert.equal(s.balances['ACCT-2440'], postedHeader['Net Pay']);
  assert.equal(s.accrued.federal, postedHeader['Withholding Totals'].federal);
  const draftOnly = RUN.liabilitySummary({ runs: [built.header], lines: built.lines, transactions: [], accounts: [] });
  assert.equal(draftOnly.accrued.netPay, 0); // Draft runs never accrue
});

console.log(`\nPayroll run acceptance complete: ${passed} passed.`);
