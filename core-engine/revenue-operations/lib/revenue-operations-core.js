'use strict';

const crypto = require('crypto');

const TRANSITIONS = {
  quote: {
    DRAFT: ['OWNER_APPROVED', 'VOID'],
    OWNER_APPROVED: ['READY_TO_SEND', 'VOID'],
    READY_TO_SEND: ['SENT', 'VOID'],
    SENT: ['ACCEPTED', 'DECLINED', 'EXPIRED', 'VOID'],
    ACCEPTED: [], DECLINED: [], EXPIRED: [], VOID: []
  },
  invoice: {
    DRAFT: ['OWNER_APPROVED', 'VOID'],
    OWNER_APPROVED: ['READY_TO_SEND', 'VOID'],
    READY_TO_SEND: ['SENT', 'VOID'],
    SENT: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'],
    PARTIALLY_PAID: ['PAID', 'OVERDUE', 'VOID', 'REFUNDED'],
    PAID: ['REFUNDED'], OVERDUE: ['PARTIALLY_PAID', 'PAID', 'VOID'], VOID: [], REFUNDED: []
  },
  paymentRequest: {
    DRAFT: ['OWNER_APPROVED', 'CANCELLED'],
    OWNER_APPROVED: ['READY_TO_CREATE', 'CANCELLED'],
    READY_TO_CREATE: ['CREATED', 'CANCELLED'],
    CREATED: ['PAID', 'EXPIRED', 'CANCELLED'],
    PAID: [], EXPIRED: [], CANCELLED: []
  },
  contract: {
    DRAFT: ['OWNER_APPROVED', 'CANCELLED'],
    OWNER_APPROVED: ['ACTIVE', 'CANCELLED'],
    ACTIVE: ['PAUSED', 'CANCEL_PENDING', 'EXPIRED'],
    PAUSED: ['ACTIVE', 'CANCEL_PENDING', 'EXPIRED'],
    CANCEL_PENDING: ['CANCELLED', 'ACTIVE'],
    CANCELLED: [], EXPIRED: []
  },
  communication: {
    DRAFT: ['OWNER_APPROVED', 'CANCELLED'],
    OWNER_APPROVED: ['READY_TO_SEND', 'CANCELLED'],
    READY_TO_SEND: ['SENT', 'FAILED', 'CANCELLED'],
    SENT: [], FAILED: [], CANCELLED: []
  },
  social: {
    DRAFT: ['OWNER_APPROVED', 'CANCELLED'],
    OWNER_APPROVED: ['READY_TO_SCHEDULE', 'CANCELLED'],
    READY_TO_SCHEDULE: ['SCHEDULED', 'FAILED', 'CANCELLED'],
    SCHEDULED: ['PUBLISHED', 'FAILED', 'CANCELLED'],
    PUBLISHED: [], FAILED: [], CANCELLED: []
  },
  website: {
    DRAFT: ['OWNER_APPROVED', 'CANCELLED'],
    OWNER_APPROVED: ['READY_TO_DEPLOY', 'CANCELLED'],
    READY_TO_DEPLOY: ['DEPLOYED', 'FAILED', 'CANCELLED'],
    DEPLOYED: ['ROLLED_BACK'],
    ROLLED_BACK: [], FAILED: [], CANCELLED: []
  }
};

const EXTERNAL_ACTIONS = new Set([
  'sendEmail', 'sendQuote', 'sendInvoice', 'createPaymentRequest', 'processPayment',
  'issueRefund', 'publishSocial', 'deployWebsite', 'finalDelivery'
]);

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function iso(now = Date.now()) { return new Date(now).toISOString(); }
function sha256(value) { return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex'); }

function normalizeId(value, label = 'ID') {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(text) || text.includes('..')) throw new Error(`${label} is invalid.`);
  return text;
}

function cents(value, label = 'Amount') {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative number.`);
  return Math.round(number * 100);
}

function dollars(valueCents) { return Math.round(Number(valueCents)) / 100; }

function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') return ['Configuration must be an object.'];
  if (config.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  const controls = config.controls || {};
  if (controls.selectedRecordOnly !== true) errors.push('Selected-record execution is required.');
  if (controls.bulkExecution !== false) errors.push('Bulk execution must remain disabled.');
  if (controls.automaticRetry !== false) errors.push('Automatic retry must remain disabled.');
  if (controls.duplicateProtectionRequired !== true) errors.push('Duplicate protection is required.');
  if (controls.ownerApprovalRequired !== true) errors.push('Owner approval is required.');
  if (controls.proofLogRequired !== true || controls.errorLogRequired !== true) errors.push('Proof and Error logs are required.');
  if (controls.externalActionsEnabled !== false) errors.push('External actions must default to disabled.');
  if (config.payment?.hostedProviderOnly !== true || config.payment?.rawCardDataAllowed !== false) errors.push('Hosted payment entry is required and raw card data is forbidden.');
  if (Object.values(config.externalActions || {}).some(value => value !== false)) errors.push('Every external action must default to false.');
  return errors;
}

function luhnValid(digits) {
  let sum = 0;
  let alternate = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]);
    if (alternate) { value *= 2; if (value > 9) value -= 9; }
    sum += value;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function assertNoRawCardData(value) {
  const forbiddenKeys = /^(?:cardnumber|pan|cvv|cvc|securitycode|trackdata|magstripe)$/i;
  function scan(input, key = '') {
    if (forbiddenKeys.test(key)) throw new Error('Raw payment-card data is forbidden.');
    if (Array.isArray(input)) return input.forEach(item => scan(item));
    if (input && typeof input === 'object') return Object.entries(input).forEach(([name, item]) => scan(item, name));
    if (typeof input === 'string') {
      const matches = input.match(/(?:\d[ -]?){13,19}/g) || [];
      for (const match of matches) {
        const digits = match.replace(/\D/g, '');
        if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) throw new Error('Raw payment-card data is forbidden.');
      }
    }
  }
  scan(value);
  return true;
}

function transition(entityType, record, nextState, context = {}) {
  const type = String(entityType || '');
  const current = String(record?.status || '');
  const allowed = TRANSITIONS[type]?.[current] || [];
  if (!allowed.includes(nextState)) throw new Error(`Invalid ${type} transition: ${current} -> ${nextState}.`);
  const result = {
    ...clone(record),
    status: nextState,
    updatedAt: iso(context.now),
    lastTransition: { from: current, to: nextState, actor: context.actor || 'system', reason: context.reason || '' }
  };
  if (nextState === 'OWNER_APPROVED') {
    if (context.actor !== 'owner') throw new Error('Only the owner may approve this record.');
    result.ownerApproval = { approvedBy: context.ownerEmail || 'owner', approvedAt: iso(context.now), recordDigest: sha256(record) };
  }
  return result;
}

function duplicateLock(action, record, version = 1) {
  return sha256(`${action}|${normalizeId(record.tenantKey, 'Tenant key')}|${normalizeId(record.id)}|${Number(version)}`);
}

function prepareExternalAction({ config, action, record, providerSlot, duplicateLocks = new Set(), now = Date.now() }) {
  const errors = validateConfig(config);
  if (errors.length) throw new Error(errors.join(' '));
  if (!EXTERNAL_ACTIONS.has(action)) throw new Error('External action is unknown.');
  if (!record || Array.isArray(record)) throw new Error('Exactly one selected record is required.');
  if (!record.ownerApproval) throw new Error('Owner approval is required before preparing an external action.');
  if (config.controls.externalActionsEnabled !== false || config.externalActions[action] !== false) throw new Error('Safety configuration is inconsistent.');
  const provider = config.providers?.[providerSlot];
  if (!provider) throw new Error(`Provider slot ${providerSlot} is missing.`);
  const lock = duplicateLock(action, record, record.version || 1);
  if (duplicateLocks.has(lock)) throw new Error('Duplicate external action blocked.');
  duplicateLocks.add(lock);
  return {
    id: id('ACTION'),
    action,
    recordType: record.type || null,
    recordId: record.id,
    tenantKey: record.tenantKey,
    providerSlot,
    providerMode: provider.mode,
    providerStatus: provider.status,
    duplicateLock: lock,
    status: 'PREPARED_NOT_EXECUTED',
    preparedAt: iso(now),
    externalActionOccurred: false,
    automaticRetry: false,
    blocker: provider.liveExecution ? 'GLOBAL_EXTERNAL_ACTION_LOCK' : 'PROVIDER_NOT_LIVE'
  };
}

function createQuote({ tenantKey, customerId, productId, description, amount, expiresAt, version = 1, now = Date.now() }) {
  const totalCents = cents(amount, 'Quote amount');
  if (!description || String(description).trim().length < 5) throw new Error('Quote description is required.');
  return {
    id: id('QUOTE'), type: 'quote', tenantKey: normalizeId(tenantKey, 'Tenant key'), customerId: normalizeId(customerId, 'Customer ID'),
    productId: normalizeId(productId, 'Product ID'), description: String(description).trim(), subtotalCents: totalCents,
    taxCents: 0, totalCents, currency: 'USD', version: Number(version), status: 'DRAFT', expiresAt: new Date(expiresAt).toISOString(),
    createdAt: iso(now), updatedAt: iso(now), externalActionOccurred: false
  };
}

function createInvoice({ tenantKey, customerId, sourceId, sourceType = 'quote', lineItems, dueAt, now = Date.now() }) {
  if (!Array.isArray(lineItems) || !lineItems.length) throw new Error('Invoice requires at least one line item.');
  const normalized = lineItems.map((item, index) => {
    const quantity = Number(item.quantity || 1);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Line ${index + 1} quantity is invalid.`);
    const unitCents = cents(item.unitPrice, `Line ${index + 1} unit price`);
    return { description: String(item.description || '').trim(), quantity, unitCents, totalCents: Math.round(quantity * unitCents), productId: item.productId || null };
  });
  if (normalized.some(item => item.description.length < 2)) throw new Error('Every invoice line requires a description.');
  const subtotalCents = normalized.reduce((sum, item) => sum + item.totalCents, 0);
  return {
    id: id('INV'), type: 'invoice', tenantKey: normalizeId(tenantKey, 'Tenant key'), customerId: normalizeId(customerId, 'Customer ID'),
    sourceId: normalizeId(sourceId, 'Source ID'), sourceType, lineItems: normalized, subtotalCents, taxCents: 0, totalCents: subtotalCents,
    paidCents: 0, refundedCents: 0, balanceCents: subtotalCents, currency: 'USD', status: 'DRAFT', version: 1,
    dueAt: new Date(dueAt).toISOString(), createdAt: iso(now), updatedAt: iso(now), externalActionOccurred: false
  };
}

function recordPayment({ invoice, amount, providerReference, method = 'hosted-provider', receivedAt = Date.now() }) {
  assertNoRawCardData({ amount, providerReference, method });
  if (!['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status)) throw new Error('Invoice is not payable in its current state.');
  const amountCents = cents(amount, 'Payment amount');
  if (amountCents <= 0 || amountCents > invoice.balanceCents) throw new Error('Payment amount exceeds the invoice balance or is zero.');
  if (!providerReference || String(providerReference).length < 3) throw new Error('Provider reference is required.');
  const paidCents = invoice.paidCents + amountCents;
  const balanceCents = invoice.totalCents - paidCents;
  return {
    invoice: { ...clone(invoice), paidCents, balanceCents, status: balanceCents === 0 ? 'PAID' : 'PARTIALLY_PAID', updatedAt: iso(receivedAt) },
    payment: {
      id: id('PAY'), tenantKey: invoice.tenantKey, customerId: invoice.customerId, invoiceId: invoice.id, amountCents,
      providerReference: String(providerReference), method, receivedAt: iso(receivedAt), rawCardDataStored: false, externalActionOccurred: false
    },
    receipt: {
      id: id('RCPT'), invoiceId: invoice.id, paymentAmountCents: amountCents, status: 'DRAFT_PENDING_OWNER_REVIEW', externalActionOccurred: false
    }
  };
}

function recordRefund({ invoice, paymentId, amount, providerReference, now = Date.now() }) {
  assertNoRawCardData({ paymentId, amount, providerReference });
  if (!['PAID', 'PARTIALLY_PAID'].includes(invoice.status)) throw new Error('Invoice is not eligible for a refund record.');
  const amountCents = cents(amount, 'Refund amount');
  if (amountCents <= 0 || amountCents > invoice.paidCents - invoice.refundedCents) throw new Error('Refund exceeds available paid amount or is zero.');
  if (!providerReference) throw new Error('Provider refund reference is required.');
  const refundedCents = invoice.refundedCents + amountCents;
  return {
    invoice: { ...clone(invoice), refundedCents, status: refundedCents === invoice.paidCents ? 'REFUNDED' : invoice.status, updatedAt: iso(now) },
    refund: { id: id('REFUND'), invoiceId: invoice.id, paymentId: normalizeId(paymentId, 'Payment ID'), amountCents, providerReference: String(providerReference), recordedAt: iso(now), rawCardDataStored: false, externalActionOccurred: false }
  };
}

function createContract({ tenantKey, customerId, name, recurringAmount, billingInterval, includedUsage, startsAt, endsAt = null, now = Date.now() }) {
  const allowedIntervals = ['monthly', 'quarterly', 'annual', 'manual'];
  if (!allowedIntervals.includes(billingInterval)) throw new Error('Billing interval is invalid.');
  return {
    id: id('CONTRACT'), type: 'contract', tenantKey: normalizeId(tenantKey, 'Tenant key'), customerId: normalizeId(customerId, 'Customer ID'),
    name: String(name || '').trim(), recurringAmountCents: cents(recurringAmount, 'Recurring amount'), billingInterval,
    includedUsage: Number(includedUsage || 0), usedThisPeriod: 0, status: 'DRAFT', version: 1,
    startsAt: new Date(startsAt).toISOString(), endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    createdAt: iso(now), updatedAt: iso(now), externalActionOccurred: false
  };
}

function recordContractUsage(contract, units, now = Date.now()) {
  if (contract.status !== 'ACTIVE') throw new Error('Contract must be active to record usage.');
  const quantity = Number(units);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Usage must be positive.');
  const usedThisPeriod = Number(contract.usedThisPeriod || 0) + quantity;
  return {
    ...clone(contract), usedThisPeriod, includedRemaining: Math.max(0, Number(contract.includedUsage || 0) - usedThisPeriod),
    overageUnits: Math.max(0, usedThisPeriod - Number(contract.includedUsage || 0)), updatedAt: iso(now)
  };
}

function createCommunicationDraft({ tenantKey, customerId, recordId, channel, subject, body, now = Date.now() }) {
  if (!['email', 'portal', 'sms-draft'].includes(channel)) throw new Error('Communication channel is invalid.');
  if (!body || String(body).trim().length < 2) throw new Error('Communication body is required.');
  return {
    id: id('COMM'), type: 'communication', tenantKey: normalizeId(tenantKey, 'Tenant key'), customerId: normalizeId(customerId, 'Customer ID'),
    recordId: normalizeId(recordId, 'Record ID'), channel, subject: String(subject || '').trim(), body: String(body).trim(),
    status: 'DRAFT', version: 1, createdAt: iso(now), updatedAt: iso(now), externalActionOccurred: false
  };
}

function createSocialDraft({ tenantKey, platform, content, scheduledFor, campaignId = null, now = Date.now() }) {
  if (!['facebook', 'instagram', 'linkedin', 'google-business-profile', 'youtube'].includes(platform)) throw new Error('Social platform is not approved.');
  if (!content || String(content).trim().length < 10) throw new Error('Social content is too short.');
  return {
    id: id('SOCIAL'), type: 'social', tenantKey: normalizeId(tenantKey, 'Tenant key'), platform, content: String(content).trim(),
    scheduledFor: new Date(scheduledFor).toISOString(), campaignId, status: 'DRAFT', version: 1,
    createdAt: iso(now), updatedAt: iso(now), externalActionOccurred: false
  };
}

function createWebsiteChange({ tenantKey, title, files, rollbackRef, description, now = Date.now() }) {
  if (!Array.isArray(files) || !files.length || files.some(file => typeof file !== 'string' || file.includes('..'))) throw new Error('Website change files are invalid.');
  if (!rollbackRef || String(rollbackRef).length < 7) throw new Error('Rollback reference is required.');
  return {
    id: id('WEB'), type: 'website', tenantKey: normalizeId(tenantKey, 'Tenant key'), title: String(title || '').trim(), files: [...files],
    rollbackRef: String(rollbackRef), description: String(description || '').trim(), status: 'DRAFT', version: 1,
    createdAt: iso(now), updatedAt: iso(now), externalActionOccurred: false
  };
}

function accountingRows({ invoices = [], payments = [], refunds = [], expenses = [] }) {
  const rows = [];
  for (const invoice of invoices) rows.push({ date: invoice.createdAt, type: 'invoice', reference: invoice.id, customerId: invoice.customerId, debitCents: invoice.totalCents, creditCents: 0, account: 'Accounts Receivable' });
  for (const payment of payments) rows.push({ date: payment.receivedAt, type: 'payment', reference: payment.id, customerId: payment.customerId, debitCents: 0, creditCents: payment.amountCents, account: 'Revenue/Cash Receipt' });
  for (const refund of refunds) rows.push({ date: refund.recordedAt, type: 'refund', reference: refund.id, customerId: null, debitCents: refund.amountCents, creditCents: 0, account: 'Refunds and Allowances' });
  for (const expense of expenses) rows.push({ date: expense.date, type: 'expense', reference: expense.id, customerId: expense.customerId || null, debitCents: cents(expense.amount, 'Expense amount'), creditCents: 0, account: expense.account || 'Operating Expense' });
  return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function accountingCsv(input) {
  const rows = accountingRows(input);
  const header = ['date', 'type', 'reference', 'customerId', 'debit', 'credit', 'account'];
  const lines = [header.join(',')];
  for (const row of rows) lines.push([row.date, row.type, row.reference, row.customerId || '', dollars(row.debitCents).toFixed(2), dollars(row.creditCents).toFixed(2), row.account].map(csvEscape).join(','));
  return `${lines.join('\n')}\n`;
}

function profitability({ revenue, directCosts, laborHours = 0, loadedLaborRate = 0, adSpend = 0 }) {
  const revenueCents = cents(revenue, 'Revenue');
  const directCostCents = cents(directCosts, 'Direct costs');
  const laborCents = cents(Number(laborHours) * Number(loadedLaborRate), 'Labor cost');
  const adSpendCents = cents(adSpend, 'Ad spend');
  const totalCostCents = directCostCents + laborCents + adSpendCents;
  const profitCents = revenueCents - totalCostCents;
  return { revenueCents, directCostCents, laborCents, adSpendCents, totalCostCents, profitCents, marginPercent: revenueCents ? Math.round((profitCents / revenueCents) * 10000) / 100 : 0 };
}

function attribution({ leads = [], quotes = [], invoices = [], payments = [] }) {
  const map = new Map();
  for (const lead of leads) map.set(lead.id, { leadId: lead.id, source: lead.source || 'unknown', campaignId: lead.campaignId || null, quotes: 0, invoices: 0, cashReceivedCents: 0 });
  for (const quote of quotes) if (map.has(quote.leadId)) map.get(quote.leadId).quotes += 1;
  for (const invoice of invoices) if (map.has(invoice.leadId)) map.get(invoice.leadId).invoices += 1;
  for (const payment of payments) if (map.has(payment.leadId)) map.get(payment.leadId).cashReceivedCents += Number(payment.amountCents || 0);
  return [...map.values()];
}

function integrationHealth(config) {
  return Object.entries(config.providers || {}).map(([slot, provider]) => ({
    slot, mode: provider.mode, configured: !['NOT_CONFIGURED'].includes(provider.status), liveExecution: provider.liveExecution === true,
    status: provider.liveExecution === true ? 'HOLD_UNEXPECTED_LIVE_STATE' : (provider.status === 'NOT_CONFIGURED' ? 'BLOCKED_BY_CREDENTIALS' : 'SAFE_INTERNAL_MODE')
  }));
}

function proofEntry(action, result, context = {}, now = Date.now()) {
  return {
    id: id('PROOF'), timestamp: iso(now), action, result, tenantKey: context.tenantKey || null,
    recordId: context.recordId || null, providerReference: context.providerReference || null,
    duplicateLock: context.duplicateLock || null, externalActionOccurred: Boolean(context.externalActionOccurred), digest: sha256({ action, result, context })
  };
}

function errorEntry(action, error, context = {}, now = Date.now()) {
  return {
    id: id('ERROR'), timestamp: iso(now), action, message: String(error?.message || error), tenantKey: context.tenantKey || null,
    recordId: context.recordId || null, providerReference: context.providerReference || null,
    automaticRetry: false, externalActionOccurred: Boolean(context.externalActionOccurred)
  };
}

module.exports = {
  TRANSITIONS, EXTERNAL_ACTIONS, validateConfig, assertNoRawCardData, transition, duplicateLock, prepareExternalAction,
  createQuote, createInvoice, recordPayment, recordRefund, createContract, recordContractUsage,
  createCommunicationDraft, createSocialDraft, createWebsiteChange, accountingRows, accountingCsv,
  profitability, attribution, integrationHealth, proofEntry, errorEntry, cents, dollars, sha256
};
