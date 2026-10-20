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

/* Phase D fix (D3): the REAL server-canonicalized shape. A probe save
 * carrying 'Date' and 'Employee ID' came back from the server with both
 * stripped (phase-d payroll_probe4); persisted timeEntries carry only
 * {Time Entry ID, User ID (recorder), Start Time, End Time, Hours,
 * Approval Status, …} and employees link via their 'User ID' (the People
 * page "Linked user" field). Selection must work from THIS shape. */
const canonEmployees = [
  { 'Employee ID': 'CE1', 'Display Name': 'Canonical Carla', 'User ID': 'AUTH-UUID-1', 'Pay Type': 'Hourly', 'Hourly Rate': 30, 'Overtime Multiplier': 1.5, 'Pay Frequency': 'Biweekly', 'Filing Status': 'Single', 'Status': 'Active' },
  { 'Employee ID': 'CE2', 'Display Name': 'Legacy Larry', 'Pay Type': 'Hourly', 'Hourly Rate': 20, 'Pay Frequency': 'Biweekly', 'Status': 'Active' }
];
const canonEntries = [
  { 'Time Entry ID': 'CT1', 'Business ID': businessId, 'User ID': 'AUTH-UUID-1', 'Start Time': '2026-10-12T08:00:00.000Z', 'End Time': '2026-10-12T16:00:00.000Z', 'Hours': 8, 'Approval Status': 'Approved', 'Status': 'Recorded', 'Job ID': 'J9' },
  { 'Time Entry ID': 'CT2', 'Business ID': businessId, 'User ID': 'AUTH-UUID-1', 'Start Time': '2026-10-13T08:00:00.000Z', 'End Time': '2026-10-13T16:00:00.000Z', 'Hours': 8, 'Approval Status': 'Approved', 'Status': 'Recorded' },
  { 'Time Entry ID': 'CT3', 'Business ID': businessId, 'Display Name': 'Legacy Larry', 'Start Time': '2026-10-12T07:00:00.000Z', 'End Time': '2026-10-12T12:00:00.000Z', 'Hours': 5, 'Approval Status': 'Approved', 'Status': 'Recorded' },
  { 'Time Entry ID': 'CT4', 'Business ID': businessId, 'User ID': 'AUTH-UUID-UNKNOWN', 'Start Time': '2026-10-12T08:00:00.000Z', 'End Time': '2026-10-12T16:00:00.000Z', 'Hours': 8, 'Approval Status': 'Approved', 'Status': 'Recorded' }
];

ok('D3 normalization: Date derived from Start Time; Employee ID supplied via User ID link', () => {
  const norm = RUN.normalizeTimeEntries(canonEntries, canonEmployees);
  assert.equal(norm[0].Date, '2026-10-12');
  assert.equal(norm[0]['Employee ID'], 'CE1');
  assert.equal(norm[0].__h38PayrollLink, 'User ID');
  assert.equal(norm[2]['Employee ID'], 'CE2'); // legacy name-carrying row links by exact unique name
  assert.equal(norm[2].__h38PayrollLink, 'Display Name');
  assert.equal(norm[3].__h38PayrollUnlinked, true);
  assert.ok(!('Date' in canonEntries[0]) && !('Employee ID' in canonEntries[0]), 'inputs must not be mutated');
});

ok('D3 selection: canonical-shape approved time now selects (2 x 8h @ $30 = $480 for CE1)', () => {
  const sel = RUN.prepareSelection({ businessId, periodId: 'RUN-CANON', startDate: '2026-10-01', endDate: '2026-10-14', employees: canonEmployees, timeEntries: canonEntries, reimbursements: [], mileage: [] });
  const ce1 = sel.preparation.Items.find(i => i.employeeId === 'CE1');
  assert.ok(ce1); assert.equal(ce1.regularHours, 16); assert.equal(ce1.grossPay, 480);
  const ce2 = sel.preparation.Items.find(i => i.employeeId === 'CE2');
  assert.ok(ce2); assert.equal(ce2.grossPay, 100);
  const builtCanon = RUN.buildRunRecords({ businessId, runId: 'RUN-CANON', periodStart: '2026-10-01', periodEnd: '2026-10-14', payDate: '2026-10-16', preparation: sel.preparation, employees: canonEmployees, existingLines: [], existingRuns: [] });
  const line = builtCanon.lines.find(l => l['Employee ID'] === 'CE1');
  assert.ok(line); assert.deepEqual(line['Time Entry IDs'], ['CT1', 'CT2']);
  assert.equal(line['Gross Pay'], 480);
});

ok('D3 unlinked entry: excluded with the honest reason, never silently dropped or guessed', () => {
  const sel = RUN.prepareSelection({ businessId, periodId: 'RUN-CANON', startDate: '2026-10-01', endDate: '2026-10-14', employees: canonEmployees, timeEntries: canonEntries, reimbursements: [], mileage: [] });
  assert.equal(sel.unlinkedCount, 1);
  assert.deepEqual(sel.unlinkedIds, ['CT4']);
  const ex = sel.preparation['Excluded Sources'].find(x => x.id === 'CT4');
  assert.ok(ex, 'CT4 must appear in Excluded Sources');
  assert.equal(ex.reason, 'Not linked to an employee record');
  assert.ok(!sel.preparation.Items.some(i => (i.sourceIds || []).some(x => x.id === 'CT4')), 'CT4 must not be attached to any employee');
});

console.log(`\nPayroll run acceptance complete: ${passed} passed.`);

/* ================= D10 save-path simulation =================
 * The gap that let D10 through: the cases above exercise pure functions,
 * but the real defect lived in the SAVE PATH — buildRunRecords put the
 * module FUNCTION `ytdWagesBefore` (shorthand) into each line's
 * 'Calc Inputs' instead of the numeric local `ytdBefore`. A function in
 * the record makes IndexedDB's structured clone throw DataCloneError
 * inside queueOperation's put(), so in the browser saveDraft rejected on
 * the first line, no payrollLines op was ever queued, and only the header
 * persisted. This section runs build → saveDraft → finalize → post
 * EXACTLY as the UI wiring calls them (app-19 saveParity →
 * queueOperation SAVE_PARITY_ENTITY with an optimistic {collection,
 * record, idKeys}), behind a recording mock queueOperation whose put
 * applies the same structuredClone gate IndexedDB applies, plus a
 * snapshot harness the module reads back through snapRows(). */
const CALC = require('../commercial-app/payroll-calc.js');
let savePassed = 0;
async function okAsync(name, fn) {
  try { await fn(); savePassed++; console.log('PASS', name); }
  catch (e) { console.error('FAIL', name, e.message); throw e; }
}

(async () => {
  await okAsync('D10 root cause: built records are cloneable plain data (no function in Calc Inputs; header not self-referential)', () => {
    for (const line of built.lines) {
      structuredClone(line); // throws DataCloneError on the pre-fix shape
      assert.equal(typeof line['Calc Inputs'].ytdWagesBefore, 'number');
    }
    structuredClone(built.header);
    assert.ok(!('Source Preparation ID' in built.header), 'unseeded header must omit Source Preparation ID');
  });

  // Fresh module instance bound to the mock browser environment.
  delete require.cache[require.resolve('../commercial-app/payroll-run.js')];
  const snapshot = {
    employees: structuredClone(employees),
    timeEntries: structuredClone(timeEntries),
    payrollPeriods: [], payrollLines: [], accountingTransactions: []
  };
  const savedOps = [];
  global.document = {};
  global.window = {
    state: { businessId, snapshot },
    H38_ACCOUNTING_ENGINE: ENGINE, H38_ACCOUNTING_OPERATIONS: OPS, H38_PAYROLL_CALC: CALC,
    newId: prefix => `${prefix}-MOCK`,
    sync: async () => {},
    queueOperation: async (action, recordType, recordId, payload, optimistic, autoSync) => {
      // IndexedDB put() gate: the whole operation must structured-clone.
      structuredClone({ action, recordType, recordId, payload, optimistic });
      savedOps.push({ action, recordType, recordId, payload: structuredClone(payload), optimistic: optimistic ? structuredClone(optimistic) : optimistic });
      if (optimistic && optimistic.collection && optimistic.record) {
        const rows = snapshot[optimistic.collection] || (snapshot[optimistic.collection] = []);
        const keys = optimistic.idKeys && optimistic.idKeys.length ? optimistic.idKeys : ['id'];
        const idVal = keys.map(k => optimistic.record[k]).find(v => v !== undefined && v !== null && String(v).trim() !== '');
        const ix = idVal === undefined ? -1 : rows.findIndex(r => keys.some(k => String(r[k]) === String(idVal)));
        if (ix >= 0) rows[ix] = structuredClone(optimistic.record); else rows.push(structuredClone(optimistic.record));
      }
      return { id: `OP-MOCK-${savedOps.length}` };
    },
    // app-19.js saveParity, verbatim shape.
    saveParity: async (entityKey, recordType, id, record, collection, idKeys) =>
      global.window.queueOperation('SAVE_PARITY_ENTITY', recordType, id, { entityKey, record }, { collection, record, idKeys }, false)
  };
  const RUN2 = require('../commercial-app/payroll-run.js');
  const savesFor = collection => savedOps.filter(o => o.action === 'SAVE_PARITY_ENTITY' && o.optimistic && o.optimistic.collection === collection);
  const sumL = (rows, k) => Math.round(rows.reduce((s, l) => s + Number(l[k] || 0), 0) * 100) / 100;

  const builtRun = RUN2.buildRunRecords({ businessId, runId: 'RUN-1', periodStart: '2026-10-01', periodEnd: '2026-10-14', payDate: '2026-10-16', preparation: prep, employees, existingLines: [], existingRuns: [], nowIso: '2026-10-16T00:00:00.000Z' });

  await okAsync('D10 save path: saveDraft persists the header AND exactly one payrollLines save per line, full WS3 shape', async () => {
    await RUN2.saveDraft(builtRun);
    const headerSaves = savesFor('payrollPeriods');
    assert.equal(headerSaves.length, 1);
    assert.equal(headerSaves[0].payload.entityKey, 'payrollPeriods');
    const lineSaves = savesFor('payrollLines');
    assert.equal(lineSaves.length, builtRun.lines.length);
    for (const op of lineSaves) {
      assert.equal(op.payload.entityKey, 'payrollLines');
      assert.deepEqual(op.optimistic.idKeys, ['Payroll Line ID']);
      const rec = op.payload.record;
      assert.equal(rec['Payroll Period ID'], 'RUN-1');
      assert.ok(Array.isArray(rec['Time Entry IDs']));
      assert.ok(Array.isArray(rec['Job Allocations']));
      assert.ok(rec['Calc Inputs'] && typeof rec['Calc Inputs'] === 'object');
      assert.equal(typeof rec['Calc Inputs'].ytdWagesBefore, 'number');
    }
    const e1 = lineSaves.map(o => o.payload.record).find(r => r['Employee ID'] === 'E1');
    assert.deepEqual(e1['Time Entry IDs'], ['T1', 'T2']);
    assert.equal(snapshot.payrollLines.length, builtRun.lines.length);
    assert.equal(snapshot.payrollPeriods.length, 1);
  });

  await okAsync('D10 save path: re-saving the same draft is idempotent (same line ids, no duplicates)', async () => {
    const idsBefore = snapshot.payrollLines.map(l => l['Payroll Line ID']).sort();
    await RUN2.saveDraft(builtRun);
    assert.equal(snapshot.payrollLines.length, builtRun.lines.length);
    assert.deepEqual(snapshot.payrollLines.map(l => l['Payroll Line ID']).sort(), idsBefore);
    assert.equal(snapshot.payrollPeriods.length, 1);
  });

  await okAsync('D10 reopen: lines reload from the snapshot by Payroll Period ID with build-time totals', () => {
    const reopened = snapshot.payrollLines.filter(l => l['Payroll Period ID'] === 'RUN-1');
    assert.equal(reopened.length, builtRun.lines.length);
    const header = snapshot.payrollPeriods.find(r => r['Payroll Period ID'] === 'RUN-1');
    assert.equal(sumL(reopened, 'Gross Pay'), header['Gross Pay']);
    assert.equal(sumL(reopened, 'Net Pay'), header['Net Pay']);
  });

  await okAsync('D10 finalize: stamping label is the honest pending label when the entries carry no stamp', async () => {
    await RUN2.markReviewed('RUN-1', 'owner');
    const header = await RUN2.finalizeRun('RUN-1', { by: 'owner', estimatesConfirmed: true });
    assert.equal(header.Status, 'Finalized');
    assert.equal(header['Time Entry Stamping'], RUN2.STAMP_PENDING);
    const stored = snapshot.payrollPeriods.find(r => r['Payroll Period ID'] === 'RUN-1');
    assert.equal(stored['Time Entry Stamping'], RUN2.STAMP_PENDING);
    assert.ok(snapshot.payrollLines.filter(l => l['Payroll Period ID'] === 'RUN-1').every(l => l['Approval Status'] === 'Approved'));
  });

  await okAsync('D10 post: exactly one balanced GL save whose totals equal the header; header Posted only after it', async () => {
    const out = await RUN2.postRun('RUN-1', { by: 'owner' });
    const glSaves = savesFor('accountingTransactions');
    assert.equal(glSaves.length, 1);
    const rec = glSaves[0].payload.record;
    assert.equal(rec.id, 'GL-PAYROLL-RUN-1');
    assert.equal(glSaves[0].payload.entityKey, 'accountingTransactions');
    const debits = sumL(rec.Lines.map(l => ({ v: l.debit })), 'v');
    const credits = sumL(rec.Lines.map(l => ({ v: l.credit })), 'v');
    assert.equal(debits, credits);
    const header = snapshot.payrollPeriods.find(r => r['Payroll Period ID'] === 'RUN-1');
    assert.equal(rec.Lines.filter(l => l.accountId === 'ACCT-2440').reduce((s, l) => s + l.credit, 0), header['Net Pay']);
    assert.equal(rec.Lines.filter(l => ['ACCT-5100', 'ACCT-6800'].includes(l.accountId)).reduce((s, l) => s + l.debit, 0), header['Gross Pay']);
    assert.equal(header.Status, 'Posted');
    assert.equal(header['Ledger Transaction ID'], 'GL-PAYROLL-RUN-1');
    assert.equal(out.transaction.id, 'GL-PAYROLL-RUN-1');
    assert.equal(out.alreadyPosted, false);
  });

  await okAsync('D10 post guard: lines/header mismatch fails loudly, run stays Finalized, no GL written', async () => {
    const prep2 = OPS.payrollPreparation({ businessId, periodId: 'RUN-2', startDate: '2026-10-01', endDate: '2026-10-14', employees: canonEmployees, timeEntries: canonEntries, reimbursements: [], mileage: [] });
    const built2 = RUN2.buildRunRecords({ businessId, runId: 'RUN-2', periodStart: '2026-10-01', periodEnd: '2026-10-14', payDate: '2026-10-16', preparation: prep2, employees: canonEmployees, existingLines: [], existingRuns: [], nowIso: '2026-10-16T00:00:00.000Z' });
    await RUN2.saveDraft(built2);
    await RUN2.markReviewed('RUN-2', 'owner');
    await RUN2.finalizeRun('RUN-2', { by: 'owner', estimatesConfirmed: true });
    // Simulate the D10 world: one line never landed, so the stored lines
    // no longer add up to the header.
    snapshot.payrollLines = snapshot.payrollLines.filter(l => !(l['Payroll Period ID'] === 'RUN-2' && l['Employee ID'] === 'CE1'));
    const glBefore = savesFor('accountingTransactions').length;
    await assert.rejects(() => RUN2.postRun('RUN-2', { by: 'owner' }), /Nothing was posted/);
    const header2 = snapshot.payrollPeriods.find(r => r['Payroll Period ID'] === 'RUN-2');
    assert.equal(header2.Status, 'Finalized');
    assert.equal(header2['Ledger Transaction ID'], '');
    assert.equal(savesFor('accountingTransactions').length, glBefore);
  });

  await okAsync('D10 double-pay: a second build for the same period excludes the posted run\'s entry ids', () => {
    const prepAgain = OPS.payrollPreparation({ businessId, periodId: 'RUN-9', startDate: '2026-10-01', endDate: '2026-10-14', employees, timeEntries, reimbursements: [], mileage: [] });
    const rebuilt = RUN2.buildRunRecords({ businessId, runId: 'RUN-9', periodStart: '2026-10-01', periodEnd: '2026-10-14', payDate: '2026-10-30', preparation: prepAgain, employees, existingLines: snapshot.payrollLines, existingRuns: snapshot.payrollPeriods });
    const e1 = rebuilt.lines.find(l => l['Employee ID'] === 'E1');
    assert.ok(!e1 || e1['Gross Pay'] === 0, 'E1 time on the Posted RUN-1 must not re-select');
    assert.ok(rebuilt.header['Excluded Sources'].some(x => x.id === 'T1' && /finalized\/posted run/i.test(x.reason)));
    assert.ok(rebuilt.header['Excluded Sources'].some(x => x.id === 'T2' && /finalized\/posted run/i.test(x.reason)));
  });

  console.log(`\nPayroll save-path simulation complete: ${savePassed} passed.`);
})().catch(e => { console.error(e); process.exit(1); });
