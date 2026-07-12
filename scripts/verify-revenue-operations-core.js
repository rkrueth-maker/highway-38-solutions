#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  validateConfig,
  assertNoRawCardData,
  transition,
  prepareExternalAction,
  createQuote,
  createInvoice,
  recordPayment,
  recordRefund,
  createContract,
  recordContractUsage,
  createCommunicationDraft,
  createSocialDraft,
  createWebsiteChange,
  accountingRows,
  accountingCsv,
  profitability,
  attribution,
  integrationHealth,
  proofEntry,
  errorEntry,
  sha256
} = require('../core-engine/revenue-operations/lib/revenue-operations-core');

const ROOT = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'core-engine', 'revenue-operations', 'config', 'revenue-operations.default.json'), 'utf8'));
const EVIDENCE_DIR = path.join(ROOT, 'launch-control', 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
const passes = [];
const failures = [];
const now = Date.UTC(2026, 6, 12, 15, 0, 0);

function check(name, condition, detail = '') { (condition ? passes : failures).push({ name, detail }); }
function expectThrow(name, fn, expected) {
  try { fn(); failures.push({ name, detail: 'Expected an error but none was thrown.' }); }
  catch (error) { check(name, !expected || String(error.message).includes(expected), error.message); }
}

check('configuration validates', validateConfig(config).length === 0, validateConfig(config).join(' '));
check('selected-record only', config.controls.selectedRecordOnly === true && config.controls.bulkExecution === false);
check('automatic retry disabled', config.controls.automaticRetry === false);
check('all external actions disabled', Object.values(config.externalActions).every(value => value === false));
check('all providers non-live', Object.values(config.providers).every(provider => provider.liveExecution === false));
check('hosted payments only', config.payment.hostedProviderOnly === true && config.payment.rawCardDataAllowed === false);

const quote = createQuote({ tenantKey: 'highway-38', customerId: 'CUST-001', productId: 'H38-P001', description: 'Synthetic Problem Snapshot', amount: 99, expiresAt: now + 14 * 86400000, now });
check('quote starts draft', quote.status === 'DRAFT' && quote.totalCents === 9900);
const quoteApproved = transition('quote', quote, 'OWNER_APPROVED', { actor: 'owner', ownerEmail: 'rkrueth@example.invalid', now });
const quoteReady = transition('quote', quoteApproved, 'READY_TO_SEND', { actor: 'owner', now });
check('quote owner approval recorded', Boolean(quoteApproved.ownerApproval) && quoteReady.status === 'READY_TO_SEND');
expectThrow('non-owner quote approval blocked', () => transition('quote', quote, 'OWNER_APPROVED', { actor: 'operator', now }), 'Only the owner');
expectThrow('invalid quote transition blocked', () => transition('quote', quote, 'SENT', { actor: 'owner', now }), 'Invalid');

const duplicateLocks = new Set();
const preparedQuote = prepareExternalAction({ config, action: 'sendQuote', record: quoteReady, providerSlot: 'email', duplicateLocks, now });
check('quote send only prepared', preparedQuote.status === 'PREPARED_NOT_EXECUTED' && preparedQuote.externalActionOccurred === false);
check('quote action blocked by provider', preparedQuote.blocker === 'PROVIDER_NOT_LIVE');
expectThrow('duplicate quote send blocked', () => prepareExternalAction({ config, action: 'sendQuote', record: quoteReady, providerSlot: 'email', duplicateLocks, now }), 'Duplicate');
expectThrow('array selection blocked', () => prepareExternalAction({ config, action: 'sendQuote', record: [quoteReady], providerSlot: 'email', duplicateLocks: new Set(), now }), 'Exactly one');
expectThrow('unapproved record action blocked', () => prepareExternalAction({ config, action: 'sendQuote', record: quote, providerSlot: 'email', duplicateLocks: new Set(), now }), 'Owner approval');

const invoice = createInvoice({ tenantKey: 'highway-38', customerId: 'CUST-001', sourceId: quote.id, lineItems: [{ description: 'Problem Snapshot', quantity: 1, unitPrice: 99, productId: 'H38-P001' }], dueAt: now + 7 * 86400000, now });
const invoiceApproved = transition('invoice', invoice, 'OWNER_APPROVED', { actor: 'owner', ownerEmail: 'rkrueth@example.invalid', now });
const invoiceReady = transition('invoice', invoiceApproved, 'READY_TO_SEND', { actor: 'owner', now });
const invoiceSent = transition('invoice', invoiceReady, 'SENT', { actor: 'provider-result', reason: 'Synthetic confirmed send result', now });
check('invoice total correct', invoice.totalCents === 9900 && invoice.balanceCents === 9900);
const preparedInvoice = prepareExternalAction({ config, action: 'sendInvoice', record: invoiceReady, providerSlot: 'email', duplicateLocks: new Set(), now });
check('invoice external send remains locked', preparedInvoice.externalActionOccurred === false && preparedInvoice.automaticRetry === false);

const partial = recordPayment({ invoice: invoiceSent, amount: 40, providerReference: 'sandbox-payment-001', receivedAt: now });
check('partial payment updates balance', partial.invoice.status === 'PARTIALLY_PAID' && partial.invoice.balanceCents === 5900);
check('receipt remains draft', partial.receipt.status === 'DRAFT_PENDING_OWNER_REVIEW');
const finalPayment = recordPayment({ invoice: partial.invoice, amount: 59, providerReference: 'sandbox-payment-002', receivedAt: now + 1000 });
check('final payment closes invoice', finalPayment.invoice.status === 'PAID' && finalPayment.invoice.balanceCents === 0);
check('payment stores no raw card data', partial.payment.rawCardDataStored === false && finalPayment.payment.rawCardDataStored === false);
expectThrow('payment over balance blocked', () => recordPayment({ invoice: invoiceSent, amount: 100, providerReference: 'sandbox-over', receivedAt: now }), 'exceeds');
expectThrow('payment without provider reference blocked', () => recordPayment({ invoice: invoiceSent, amount: 10, providerReference: '', receivedAt: now }), 'reference');
const syntheticCardDigits = ['4111', '1111', '1111', '1111'].join('');
const syntheticCardSpaced = ['4111', '1111', '1111', '1111'].join(' ');
expectThrow('raw card field blocked', () => assertNoRawCardData({ cardNumber: syntheticCardDigits }), 'forbidden');
expectThrow('Luhn card string blocked', () => assertNoRawCardData({ note: `test ${syntheticCardSpaced}` }), 'forbidden');

const refund = recordRefund({ invoice: finalPayment.invoice, paymentId: finalPayment.payment.id, amount: 59, providerReference: 'sandbox-refund-001', now });
check('refund record created without execution', refund.refund.externalActionOccurred === false && refund.refund.rawCardDataStored === false);
check('partial refund retains paid state', refund.invoice.status === 'PAID' && refund.invoice.refundedCents === 5900);
expectThrow('refund above paid amount blocked', () => recordRefund({ invoice: finalPayment.invoice, paymentId: finalPayment.payment.id, amount: 100, providerReference: 'bad', now }), 'exceeds');

const contract = createContract({ tenantKey: 'highway-38', customerId: 'CUST-001', name: 'Synthetic monthly support', recurringAmount: 199, billingInterval: 'monthly', includedUsage: 4, startsAt: now, now });
const contractApproved = transition('contract', contract, 'OWNER_APPROVED', { actor: 'owner', ownerEmail: 'rkrueth@example.invalid', now });
const contractActive = transition('contract', contractApproved, 'ACTIVE', { actor: 'owner', now });
const usage = recordContractUsage(contractActive, 5, now);
check('contract usage and overage tracked', usage.usedThisPeriod === 5 && usage.overageUnits === 1 && usage.includedRemaining === 0);
expectThrow('inactive contract usage blocked', () => recordContractUsage(contract, 1, now), 'active');
expectThrow('invalid billing interval blocked', () => createContract({ tenantKey: 'highway-38', customerId: 'CUST-001', name: 'Bad', recurringAmount: 1, billingInterval: 'weekly', includedUsage: 0, startsAt: now, now }), 'invalid');

const communication = createCommunicationDraft({ tenantKey: 'highway-38', customerId: 'CUST-001', recordId: invoice.id, channel: 'email', subject: 'Invoice draft', body: 'Your invoice is ready for owner review.', now });
const communicationApproved = transition('communication', communication, 'OWNER_APPROVED', { actor: 'owner', ownerEmail: 'rkrueth@example.invalid', now });
const communicationReady = transition('communication', communicationApproved, 'READY_TO_SEND', { actor: 'owner', now });
const preparedCommunication = prepareExternalAction({ config, action: 'sendEmail', record: communicationReady, providerSlot: 'email', duplicateLocks: new Set(), now });
check('communication records draft without send', communication.externalActionOccurred === false && preparedCommunication.externalActionOccurred === false);

const social = createSocialDraft({ tenantKey: 'highway-38', platform: 'facebook', content: 'Synthetic owner-reviewed Highway 38 planning tip.', scheduledFor: now + 86400000, campaignId: 'CAMPAIGN-001', now });
const socialApproved = transition('social', social, 'OWNER_APPROVED', { actor: 'owner', ownerEmail: 'rkrueth@example.invalid', now });
const socialReady = transition('social', socialApproved, 'READY_TO_SCHEDULE', { actor: 'owner', now });
const preparedSocial = prepareExternalAction({ config, action: 'publishSocial', record: socialReady, providerSlot: 'social', duplicateLocks: new Set(), now });
check('social publishing remains internal-only', preparedSocial.externalActionOccurred === false && preparedSocial.blocker === 'PROVIDER_NOT_LIVE');
expectThrow('unapproved social platform blocked', () => createSocialDraft({ tenantKey: 'highway-38', platform: 'x', content: 'Synthetic content long enough.', scheduledFor: now, now }), 'not approved');

const website = createWebsiteChange({ tenantKey: 'highway-38', title: 'Synthetic homepage update', files: ['index.html', 'ecosystem.css'], rollbackRef: '4318aa3', description: 'Synthetic controlled update', now });
const websiteApproved = transition('website', website, 'OWNER_APPROVED', { actor: 'owner', ownerEmail: 'rkrueth@example.invalid', now });
const websiteReady = transition('website', websiteApproved, 'READY_TO_DEPLOY', { actor: 'owner', now });
const preparedWebsite = prepareExternalAction({ config, action: 'deployWebsite', record: websiteReady, providerSlot: 'website', duplicateLocks: new Set(), now });
check('website deployment has rollback and remains locked', website.rollbackRef === '4318aa3' && preparedWebsite.externalActionOccurred === false);
expectThrow('unsafe website path blocked', () => createWebsiteChange({ tenantKey: 'highway-38', title: 'Bad', files: ['../secret'], rollbackRef: '4318aa3', description: 'Bad', now }), 'invalid');

const expense = { id: 'EXP-001', date: new Date(now).toISOString(), amount: 25, account: 'Software', customerId: 'CUST-001' };
const rows = accountingRows({ invoices: [invoice], payments: [partial.payment, finalPayment.payment], refunds: [refund.refund], expenses: [expense] });
const csv = accountingCsv({ invoices: [invoice], payments: [partial.payment, finalPayment.payment], refunds: [refund.refund], expenses: [expense] });
check('accounting rows complete', rows.length === 5, String(rows.length));
check('accounting CSV has header and references', csv.startsWith('date,type,reference') && csv.includes(invoice.id) && csv.includes(partial.payment.id));
check('accounting export does not execute external sync', config.providers.accounting.liveExecution === false);

const profit = profitability({ revenue: 1000, directCosts: 300, laborHours: 5, loadedLaborRate: 50, adSpend: 100 });
check('profitability calculation correct', profit.profitCents === 35000 && profit.marginPercent === 35, JSON.stringify(profit));
const attributionRows = attribution({
  leads: [{ id: 'LEAD-001', source: 'website', campaignId: 'CAMPAIGN-001' }],
  quotes: [{ id: quote.id, leadId: 'LEAD-001' }],
  invoices: [{ id: invoice.id, leadId: 'LEAD-001' }],
  payments: [{ ...partial.payment, leadId: 'LEAD-001' }, { ...finalPayment.payment, leadId: 'LEAD-001' }]
});
check('lead and campaign attribution calculated', attributionRows[0].quotes === 1 && attributionRows[0].invoices === 1 && attributionRows[0].cashReceivedCents === 9900);

const health = integrationHealth(config);
check('integration health reports all provider slots', health.length === 5);
check('no integration falsely reports live', health.every(item => item.liveExecution === false && !item.status.includes('UNEXPECTED')));
check('credential blockers explicit', health.filter(item => item.status === 'BLOCKED_BY_CREDENTIALS').length === 4);

const proof = proofEntry('PAYMENT_RECORDED', 'PASS', { tenantKey: 'highway-38', recordId: finalPayment.payment.id, providerReference: finalPayment.payment.providerReference, externalActionOccurred: false }, now);
const error = errorEntry('EMAIL_SEND_PREPARE', new Error('Synthetic provider unavailable'), { tenantKey: 'highway-38', recordId: communication.id, externalActionOccurred: false }, now);
check('proof records provider result without claiming send', proof.externalActionOccurred === false && proof.providerReference === 'sandbox-payment-002');
check('error disables retry', error.automaticRetry === false && error.externalActionOccurred === false);

const source = fs.readFileSync(path.join(ROOT, 'core-engine', 'revenue-operations', 'lib', 'revenue-operations-core.js'), 'utf8');
check('source contains no live provider secrets', !/(sk_live_|gh[pousr]_|-----BEGIN .*PRIVATE KEY-----)/.test(source));

const samplePackage = {
  status: 'OWNER_REVIEW_REQUIRED',
  generatedAt: new Date(now).toISOString(),
  externalActionsOccurred: false,
  records: {
    quote: quoteReady,
    invoice: invoiceReady,
    payments: [partial.payment, finalPayment.payment],
    receiptDrafts: [partial.receipt, finalPayment.receipt],
    refundRecord: refund.refund,
    contract: usage,
    communication: communicationReady,
    social: socialReady,
    websiteChange: websiteReady,
    preparedActions: [preparedQuote, preparedInvoice, preparedCommunication, preparedSocial, preparedWebsite],
    integrationHealth: health,
    profitability: profit,
    attribution: attributionRows
  },
  createdTasks: [
    { id: 'REV-T001', title: 'Select and approve production email provider', status: 'Blocked by credentials' },
    { id: 'REV-T002', title: 'Select provider-hosted payment service and connect credentials', status: 'Blocked by credentials' },
    { id: 'REV-T003', title: 'Approve accounting export mapping or API provider', status: 'Needs owner review' },
    { id: 'REV-T004', title: 'Connect approved social scheduler and test one selected record', status: 'Blocked by credentials' },
    { id: 'REV-T005', title: 'Approve website deployment provider and rollback workflow', status: 'Needs owner review' },
    { id: 'REV-T006', title: 'Run provider sandbox and duplicate-result tests', status: 'Required before activation' },
    { id: 'REV-T007', title: 'Approve each external action feature flag separately', status: 'Needs owner review' }
  ],
  blockers: [
    'Production email provider and credentials',
    'Provider-hosted payment provider and credentials',
    'Accounting provider or approved CSV account mapping',
    'Social scheduling provider credentials and platform account approvals',
    'Website deployment credential and rollback authorization',
    'Provider sandbox, duplicate-result, failed-result, and uncertain-result tests',
    'Rick approval for each live external action'
  ]
};
fs.writeFileSync(path.join(EVIDENCE_DIR, 'revenue-operations-sample-package.json'), JSON.stringify(samplePackage, null, 2) + '\n');

const evidence = {
  status: failures.length ? 'HOLD' : 'PASS',
  generatedAt: new Date().toISOString(),
  release: config.release,
  passed: passes.length,
  failed: failures.length,
  externalActionsOccurred: false,
  controls: {
    selectedRecordOnly: true,
    bulkExecution: false,
    automaticRetry: false,
    duplicateProtection: true,
    ownerApproval: true,
    hostedPaymentOnly: true,
    rawCardDataStored: false,
    proofAndErrorLogs: true,
    providerTruthState: true,
    accountingExport: true,
    contractUsage: true,
    profitability: true,
    attribution: true
  },
  digest: sha256({ passes, failures }),
  passes,
  failures
};
fs.writeFileSync(path.join(EVIDENCE_DIR, 'revenue-operations-core-verification.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
process.exit(failures.length ? 1 : 0);
