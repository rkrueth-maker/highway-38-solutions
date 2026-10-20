'use strict';
/* WS3 payroll calc verifier — hand-computed fixtures from
 * spec-ws3-payroll-reports.md §6.3 against payroll-tax-tables-2026.md. */
const assert = require('assert');
const C = require('../commercial-app/payroll-calc.js');

let passed = 0, skipped = 0;
function ok(name, fn) { try { fn(); passed++; console.log('PASS', name); } catch (e) { console.error('FAIL', name, e.message); throw e; } }
function skip(name, why) { skipped++; console.log('SKIP', name, '—', why); }

const cfg = C.createConfig();

ok('VERSION stamp present', () => assert.equal(C.VERSION, '20261020-payroll-calc-1'));
ok('periodsPerYear covers the Pub. 15-T Table 3 set', () => {
  assert.equal(C.periodsPerYear('Weekly'), 52);
  assert.equal(C.periodsPerYear('Biweekly'), 26);
  assert.equal(C.periodsPerYear('Semimonthly'), 24);
  assert.equal(C.periodsPerYear('Monthly'), 12);
  assert.equal(C.periodsPerYear('Quarterly'), 4);
  assert.equal(C.periodsPerYear('Semiannually'), 2);
  assert.equal(C.periodsPerYear('Daily'), 260);
});

/* Fixture 1 — Federal, Single/Standard, biweekly $2,000, no W-4 adjustments:
 * 52,000 − 8,600 = 43,400 → 1,240 + 12% × 23,500 = 4,060/yr → $156.15 */
ok('fixture 1: federal Single/Standard biweekly $2,000 = $156.15', () => {
  assert.equal(C.federalWithholding({ grossWages: 2000, frequency: 'Biweekly', filingStatus: 'Single' }, cfg), 156.15);
  const d = C.federalDetail({ grossWages: 2000, frequency: 'Biweekly', filingStatus: 'Single' }, cfg);
  assert.equal(d.trace.adjustedAnnualWage, 43400);
  assert.equal(d.trace.annualTentativeTax, 4060);
  assert.equal(d.trace.bracketRow.baseTax, 1240);
});

/* Fixture 2 — Federal, MFJ/Standard, biweekly $3,000:
 * 78,000 − 12,900 = 65,100 → 2,480 + 12% × 21,000 = 5,000/yr → $192.31 */
ok('fixture 2: federal MFJ/Standard biweekly $3,000 = $192.31', () => {
  assert.equal(C.federalWithholding({ grossWages: 3000, frequency: 'Biweekly', filingStatus: 'Married Filing Jointly' }, cfg), 192.31);
});

/* Fixture 3 — Federal Step-2-checked Single, weekly $1,000:
 * 52,000 − 0 = 52,000 → 2,900 + 22% × 18,750 = 7,025/yr → $135.10 */
ok('fixture 3: federal Step-2 Single weekly $1,000 = $135.10', () => {
  assert.equal(C.federalWithholding({ grossWages: 1000, frequency: 'Weekly', filingStatus: 'Single', step2Checked: true }, cfg), 135.10);
});

/* Fixture 4 — FICA wage-base cap + Additional Medicare crossing */
ok('fixture 4: FICA cap crossing and Additional Medicare', () => {
  const a = C.fica({ grossWages: 1500, ytdWagesBefore: 184000 }, cfg);
  assert.equal(a.ss, 31.00); assert.equal(a.medicare, 21.75); assert.equal(a.additionalMedicare, 0);
  const b = C.fica({ grossWages: 1500, ytdWagesBefore: 184500 }, cfg);
  assert.equal(b.ss, 0);
  const c = C.fica({ grossWages: 1500, ytdWagesBefore: 199500 }, cfg);
  assert.equal(c.additionalMedicare, 9.00);
  assert.equal(c.employerSS, c.ss); // employer mirrors, no Additional match
});

/* Fixture 5 — MN: SKIPPED/FLAGGED per spec §6.3 until owner confirmation
 * exists. The math is still asserted against a confirmed-config object so a
 * future confirmation only flips the flag, never the numbers:
 * Single, 1 allowance, biweekly $2,000 → 52,000 − 5,300 = 46,700 →
 * 1,782 + 6.8% × 8,690 = 2,372.92/yr → $91.27 */
skip('fixture 5: MN withholding ships disabled until owner confirmation (spec §4.5/§6.3)',
  'default config computes $0 with a review flag; confirmed-config math asserted below');
ok('fixture 5 (math, confirmed config only): MN Single 1 allowance biweekly $2,000 = $91.27', () => {
  assert.equal(C.stateWithholding({ grossWages: 2000, frequency: 'Biweekly', filingStatus: 'Single', mnAllowances: 1 }, cfg), 0);
  const line = C.calculateLine({ grossPay: 2000, frequency: 'Biweekly', employee: { 'Filing Status': 'Single' } }, cfg);
  assert.ok(line.trace.state.reviewFlag.includes('MN withholding is OFF'));
  const mnCfg = C.createConfig({ minnesota: { enabled: true, confirmed: true } });
  assert.equal(C.stateWithholding({ grossWages: 2000, frequency: 'Biweekly', filingStatus: 'Single', mnAllowances: 1 }, mnCfg), 91.27);
});

/* Fixture 6 — Rounding: half-up once per component; net identity to the cent */
ok('fixture 6: rounding half-up once; net identity holds to the cent', () => {
  assert.equal(C.roundCents(0.125), 0.13);
  assert.equal(C.roundCents(2.675), 2.68);
  assert.equal(C.roundCents(91.2661538), 91.27);
  const line = C.calculateLine({
    grossPay: 1234.56, reimbursements: 25.10, frequency: 'Biweekly',
    employee: { 'Filing Status': 'Single', 'W-4 Step 3 Credits': 500 },
    deductions: [{ name: 'HSA', kind: 'pre-tax', amount: 50, ficaExempt: true }, { name: 'Uniform', kind: 'post-tax', amount: 12.34 }],
    ytd: { gross: 30000 }
  }, cfg);
  const wh = Object.values(line.withholdings).reduce((s, x) => Math.round((s + x) * 100) / 100, 0);
  assert.equal(line.totalWithholdings, wh);
  const net = Math.round((line.grossPay + line.reimbursements - line.totalWithholdings - line.totalDeductions) * 100) / 100;
  assert.equal(line.net, net);
  // Pre-tax HSA (ficaExempt) reduces both income-tax and FICA wages.
  assert.equal(line.trace.incomeTaxWages, 1184.56);
  assert.equal(line.trace.ficaWages, 1184.56);
});

/* Fixture 7 — Employer FUTA/SUTA cap-crossing (owner-confirmed config) */
ok('fixture 7: employer FUTA/SUTA cap crossing mirrors fixture 4', () => {
  const empCfg = C.createConfig({ employer: { futaEnabled: true, futaRate: 0.006, futaWageBase: 7000, sutaEnabled: true, sutaRate: 0.02, sutaWageBase: 43000 } });
  const a = C.employerTaxes({ grossWages: 1500, ytdWagesBefore: 6500 }, empCfg);
  assert.equal(a.futa, 3.00);  // only $500 of base remains
  assert.equal(a.suta, 30.00); // full $1,500 under the SUTA base
  const b = C.employerTaxes({ grossWages: 1500, ytdWagesBefore: 7000 }, empCfg);
  assert.equal(b.futa, 0);
  const off = C.employerTaxes({ grossWages: 1500, ytdWagesBefore: 0 }, cfg);
  assert.equal(off.futa, 0); assert.equal(off.suta, 0); // disabled by default — never guessed
});

/* Extra contract checks */
ok('pre-2020 W-4 bridge path runs for legacy allowance-only employees', () => {
  const line = C.calculateLine({ grossPay: 2000, frequency: 'Biweekly', employee: { 'Filing Status': 'Single', 'Withholding Allowances': 2 } }, cfg);
  assert.equal(line.trace.federal.path, 'pre-2020 W-4 (allowances)');
  assert.equal(line.trace.federal.allowanceDeduction, 8600); // 2 × $4,300
});
ok('contractor line: gross to net, no withholding lines (coordinator decision 3)', () => {
  const line = C.calculateLine({ grossPay: 2000, contractor: true }, cfg);
  assert.deepEqual(line.withholdings, { federal: 0, ficaSS: 0, ficaMed: 0, additionalMedicare: 0, state: 0, other: 0 });
  assert.equal(line.net, 2000);
  assert.equal(line.employerTaxTotal, 0);
});
ok('stored-record config shape (payrollTaxConfigs) maps into createConfig', () => {
  const fromRecord = C.createConfig({ 'Tax Year': 2026, 'FICA': { ssRate: 0.062 }, 'Minnesota': { allowanceValue: 5300 }, 'Minnesota Confirmed': true });
  assert.equal(fromRecord.minnesota.enabled, true);
  assert.equal(fromRecord.fica.ssWageBase, 184500); // untouched defaults survive
});
ok('trace explains every number (annualized wage, bracket row, per-tax math)', () => {
  const line = C.calculateLine({ grossPay: 2000, frequency: 'Biweekly', employee: { 'Filing Status': 'Single' } }, cfg);
  assert.equal(line.trace.federal.annualizedWages, 52000);
  assert.ok(line.trace.federal.bracketRow);
  assert.ok(line.trace.reviewFlags.length >= 1); // MN/FUTA/SUTA disabled flags surface
});

console.log(`\nPayroll calc acceptance complete: ${passed} passed, ${skipped} skipped (flagged).`);
