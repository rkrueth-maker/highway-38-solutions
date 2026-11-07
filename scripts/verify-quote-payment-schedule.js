/* Quote payment schedule (gap2) — contract verifier.
 * Pins the invariants of the feature:
 *  - the signed-deposit path is untouched (one deposit invoice, same
 *    Source + dedupe) and stays the fallback when there is no schedule;
 *  - a valid schedule's acceptance entry IS that deposit, and the
 *    remaining entries generate deduped scheduled invoices at signing;
 *  - schedule math is validated server-side (parts must sum to total);
 *  - the Office editor + portal display + loader pins are wired. */
const fs = require('fs');
const edge = fs.readFileSync('supabase/functions/h38-customer-portal/index.ts', 'utf8');
const editor = fs.readFileSync('commercial-app/quote-payment-schedule.js', 'utf8');
const loader = fs.readFileSync('commercial-app/h38-script-loader.js', 'utf8');
const portal = fs.readFileSync('commercial-app/customer-portal.html', 'utf8');
const signedPanel = fs.readFileSync('commercial-app/quote-signed-acceptance.js', 'utf8');
const version = fs.readFileSync('commercial-app/version.json', 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

// Server: deposit invariant preserved.
check(edge.includes('const DEPOSIT_INVOICE_SOURCE = "Deposit on signed quote acceptance";'), 'deposit invoice source constant changed');
check(edge.includes('const SCHEDULE_INVOICE_SOURCE = "Payment schedule on signed quote acceptance";'), 'schedule invoice source constant missing');
check(edge.includes('clean(pick(p, "Source", "source"), 80) === DEPOSIT_INVOICE_SOURCE'), 'deposit dedupe lookup must still key on the deposit source');
check(edge.includes('"Deposit For Revision": currentRevision'), 'deposit invoice must still record the signed revision');
// Server: schedule resolution + validation.
check(edge.includes('function resolvePaymentSchedule('), 'server schedule resolver missing');
check(edge.includes('deposits.length !== 1'), 'server must require exactly one acceptance (deposit) entry');
check(edge.includes('The scheduled payments add up to'), 'server must refuse a schedule whose parts do not sum to the quote total');
check(edge.includes('Math.abs(remainder) <= 0.05'), 'server rounding-remainder absorption missing');
// Server: signing uses the signed version's schedule, generates deduped invoices.
check(edge.includes('const schedule = resolvePaymentSchedule(q, acceptedTotal);'), 'signing must resolve the schedule from the signed quote payload');
check(edge.includes('validSchedule.deposit.amount'), 'schedule deposit must flow through the single deposit invoice amount');
check(edge.includes('"Schedule For Revision": currentRevision'), 'schedule invoices must be keyed to the signed revision');
check(edge.includes('"Schedule Entry Index": entry.index'), 'schedule invoice dedupe must be keyed per entry index');
check(edge.includes('clean(pick(p, "Source", "source"), 80) === SCHEDULE_INVOICE_SOURCE'), 'schedule dedupe lookup must key on the schedule source');
check(edge.includes('"Payment Schedule Status"'), 'quote must record the schedule generation status at signing');
check(edge.includes('paymentSchedule: (() => {'), 'portal bundle must expose the resolved schedule for display');
// Editor: contained Quotes-group module with reconciling math.
check(editor.includes("var BUILD = '20261107-gap2-payschedule-1';"), 'editor build stamp missing');
check(editor.includes("'Payment Schedule'"), 'editor must store the schedule on the quote payload');
check(editor.includes('left to schedule'), 'editor must show the unallocated remainder while editing');
check(editor.includes('res.valid && ui.dirty'), 'editor save must be gated on a reconciled schedule');
check(editor.includes("payload['Deposit Percent']"), 'editor must keep the quote deposit percent in step with the schedule deposit');
check(editor.includes("payload['Revision']"), 'editor must bump the revision when a presented quote schedule changes');
check(editor.includes('locked to the signed version'), 'signed quotes must show the schedule as locked');
// Wiring: loader pins + version stamp.
check(loader.includes("'./quote-payment-schedule.js?build=20261107-gap2-payschedule-1'"), 'loader must load the schedule editor in the Quotes group');
check(loader.includes("'./quote-signed-acceptance.js?build=20261107-gap2-payschedule-1'"), 'loader pin for the signed-acceptance panel must be bumped');
check(version.includes('"version": "20261107-polish-a3-tax-1"'), 'version.json stamp must be bumped');
// Portal display.
check(portal.includes('signSchedule'), 'portal sign panel must list the payment schedule');
check(portal.includes('Payment schedule'), 'portal quote card must show the payment schedule');
check(portal.includes('q.paymentSchedule'), 'portal must render the schedule from the bundle');
// Office signed panel lists the generated schedule invoices.
check(signedPanel.includes('Payment Schedule Invoice IDs'), 'signed-acceptance panel must list schedule invoices');
check(signedPanel.includes('Schedule Label'), 'signed-acceptance panel must label schedule invoices');

if (failures.length) { console.error(failures.map(x => 'FAIL: ' + x).join('\n')); process.exit(1); }
console.log('Quote payment schedule contract verified.');
