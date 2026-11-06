'use strict';
/* Payroll calc verifier — hand-computed fixtures. Federal figures are
 * hand-computed from IRS Publication 15-T (2026), p. 11 (Percentage Method
 * Tables for Automated Payroll Systems) + Worksheet 1A; Minnesota figures
 * from the MN Dept. of Revenue 2026 booklet, Computer Formula (p. 34).
 * Both PDFs were fetched from irs.gov / revenue.state.mn.us and the table
 * data in payroll-tax-tables-2026.js was transcribed from them. */
const assert = require('assert');
const C = require('../commercial-app/payroll-calc.js');

let passed = 0, skipped = 0;
function ok(name, fn) { try { fn(); passed++; console.log('PASS', name); } catch (e) { console.error('FAIL', name, e.message); throw e; } }
function skip(name, why) { skipped++; console.log('SKIP', name, '—', why); }

const cfg = C.createConfig();

ok('VERSION stamp present', () => assert.equal(C.VERSION, '20261106-payroll-calc-2'));
ok('year tables: 2026 loaded from the year module; 2027 stops hard', () => {
  assert.ok(C.availableYears().includes(2026));
  assert.equal(C.tablesForYear(2026).federal.builtInMFJ, 12900);
  assert.throws(() => C.tablesForYear(2027), /2027 tax tables not loaded/);
  assert.throws(() => C.configForYear(2027), /2027 tax tables not loaded/);
  assert.throws(
    () => C.calculateLine({ grossPay: 1000, payDate: '2027-01-15', employee: { 'Filing Status': 'Single' } }, cfg),
    /2027 tax tables not loaded/);
});
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

/* Fixture 5 — MN is VERIFIED against the official booklet (Computer
 * Formula, p. 34) and ships enabled. Single, 1 allowance, biweekly $2,000:
 * 52,000 − 5,300 = 46,700 → 1,782.09 + 6.8% × 8,690 = 2,373.01/yr → $91.27.
 * (The booklet permits rounding the per-period result to the nearest
 * dollar; the engine rounds half-up to cents instead — $91.27 here.) */
ok('fixture 5: MN Single 1 allowance biweekly $2,000 = $91.27 (default config)', () => {
  assert.equal(C.stateWithholding({ grossWages: 2000, frequency: 'Biweekly', filingStatus: 'Single', mnAllowances: 1 }, cfg), 91.27);
  const line = C.calculateLine({ grossPay: 2000, frequency: 'Biweekly', employee: { 'Filing Status': 'Single', 'MN Allowances': 1 } }, cfg);
  assert.equal(line.withholdings.state, 91.27);
  assert.equal(line.trace.state.reviewFlag, '');
});
/* Reference case (MN booklet): Married, 2 allowances, biweekly $3,000:
 * 78,000 − 10,600 = 67,400 → 2,605.45 + 6.8% × 4,000 = 2,877.45/yr → $110.67 */
ok('reference MN-2: MN Married 2 allowances biweekly $3,000 = $110.67', () => {
  assert.equal(C.stateWithholding({ grossWages: 3000, frequency: 'Biweekly', filingStatus: 'Married Filing Jointly', mnAllowances: 2 }, cfg), 110.67);
});
/* Reference case (Pub. 15-T Step 2 schedule): MFJ Step-2 checked, biweekly
 * $4,000, Step 3 credits $2,000/yr: annualized 104,000 − 0 built-in →
 * 5,800 + 22% × 37,500 = 14,050/yr → tentative 540.38 − credits 76.92 →
 * $463.46 */
ok('reference FED-4: MFJ Step-2 biweekly $4,000 with $2,000 Step 3 = $463.46', () => {
  assert.equal(C.federalWithholding({ grossWages: 4000, frequency: 'Biweekly', filingStatus: 'Married Filing Jointly', step2Checked: true, step3CreditsAnnual: 2000 }, cfg), 463.46);
});
/* Reference case (zero withholding): Single biweekly $500 with $4,000
 * Step 3 credits: 13,000 − 8,600 = 4,400 → 0% bracket → $0. And MN zero:
 * biweekly $150 → annualized 3,900 < 4,700 first threshold → $0. */
ok('reference ZERO: zero federal and zero MN withholding cases', () => {
  assert.equal(C.federalWithholding({ grossWages: 500, frequency: 'Biweekly', filingStatus: 'Single', step3CreditsAnnual: 4000 }, cfg), 0);
  assert.equal(C.stateWithholding({ grossWages: 150, frequency: 'Biweekly', filingStatus: 'Single', mnAllowances: 0 }, cfg), 0);
});
/* Reference case (non-MN work state): state $0 with the unavailable flag;
 * federal + FICA still calculate. */
ok('reference STATE: work state WI → state $0 flagged, federal still computes', () => {
  const line = C.calculateLine({ grossPay: 2000, frequency: 'Biweekly', employee: { 'Filing Status': 'Single', 'Work State': 'WI' } }, cfg);
  assert.equal(line.withholdings.state, 0);
  assert.ok(line.trace.state.reviewFlag.includes('unavailable for WI'));
  assert.ok(line.withholdings.federal > 0 && line.withholdings.ficaSS > 0);
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
  // Default config: FUTA is verified (IRS 0.6% / $7,000) and ON → $9.00.
  // SUTA has NO default rate — $0 with the "not included" flag, never invented.
  assert.equal(off.futa, 9.00); assert.equal(off.suta, 0);
  const line = C.calculateLine({ grossPay: 1500, frequency: 'Biweekly', employee: { 'Filing Status': 'Single' } }, cfg);
  assert.ok(line.trace.reviewFlags.some(f => f.includes('SUTA not included')));
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
  assert.ok(line.trace.reviewFlags.length >= 1); // SUTA-not-included flag surfaces
});

console.log(`\nPayroll calc acceptance complete: ${passed} passed, ${skipped} skipped (flagged).`);
