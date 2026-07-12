'use strict';

const crypto = require('crypto');

const ACTION_TYPES = new Set([
  'QUOTE_SEND',
  'INVOICE_SEND',
  'PAYMENT_REQUEST',
  'RECEIPT_SEND',
  'CREDIT_REFUND',
  'FINAL_DELIVERY',
  'CUSTOMER_FOLLOW_UP',
  'SOCIAL_PUBLISH',
  'ADVERTISING_LAUNCH',
  'WEBSITE_DEPLOY',
  'ACCOUNTING_SYNC'
]);

const ACTION_FLAG_MAP = {
  QUOTE_SEND: 'quoteSend',
  INVOICE_SEND: 'invoiceSend',
  PAYMENT_REQUEST: 'paymentRequest',
  RECEIPT_SEND: 'receiptSend',
  CREDIT_REFUND: 'creditRefund',
  FINAL_DELIVERY: 'finalDelivery',
  CUSTOMER_FOLLOW_UP: 'customerFollowUp',
  SOCIAL_PUBLISH: 'socialPublishing',
  ADVERTISING_LAUNCH: 'advertisingLaunch',
  WEBSITE_DEPLOY: 'websiteDeployment',
  ACCOUNTING_SYNC: 'accountingApiSync'
};

const TRANSACTION_TYPES = new Set(['invoice', 'payment', 'expense', 'credit', 'refund']);
const REVENUE_CLASSES = new Set(['product', 'bundle', 'add-on', 'contract', 'subscription']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
}

function normalizeId(value, label = 'ID') {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,99}$/.test(text) || text.includes('..')) throw new Error(`${label} is invalid.`);
  return text;
}

function normalizeText(value, label, min = 1, max = 4000) {
  const text = String(value || '').trim();
  if (text.length < min || text.length > max) throw new Error(`${label} must contain ${min}–${max} characters.`);
  return text;
}

function normalizeMoney(value, label = 'Amount') {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a non-negative number.`);
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function normalizeDate(value, label = 'Date') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid.`);
  return date.toISOString();
}

function validateConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') return ['Configuration must be an object.'];
  if (config.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
  if (config.module?.status !== 'CONTROLLED_NOT_CONNECTED') errors.push('Default module status must be CONTROLLED_NOT_CONNECTED.');
  if (config.controls?.selectedRecordOnly !== true) errors.push('Selected-record execution is required.');
  if (config.controls?.bulkExecution !== false) errors.push('Bulk execution must remain disabled.');
  if (config.controls?.automaticRetry !== false) errors.push('Automatic retry must remain disabled.');
  if (config.controls?.duplicateProtectionRequired !== true) errors.push('Duplicate protection is required.');
  if (config.controls?.ownerApprovalRequired !== true) errors.push('Owner approval is required.');
  if (config.controls?.proofLogRequired !== true || config.controls?.errorLogRequired !== true) errors.push('Proof and Error Logs are required.');
  if (config.controls?.externalActionsEnabled !== false) errors.push('External actions must default to disabled.');
  if (Object.values(config.workflows || {}).some(value => value !== false)) errors.push('All workflow execution flags must default to false.');
  if (config.payments?.providerHostedOnly !== true || config.payments?.rawCardDataAllowed !== false) errors.push('Payments must remain provider-hosted and raw card data must be forbidden.');
  if (config.communications?.outboundSendEnabled !== false || config.communications?.draftOnly !== true) errors.push('Communications must default to draft-only.');
  if (config.publishing?.socialPublishingEnabled !== false || config.publishing?.websiteDeploymentEnabled !== false || config.publishing?.advertisingSpendEnabled !== false) errors.push('Publishing and advertising must default to disabled.');
  if (config.accounting?.apiSyncEnabled !== false) errors.push('Accounting API sync must default to disabled.');
  return errors;
}

function selectedRecordGuard(record, selectedRecordId) {
  if (!record || typeof record !== 'object') throw new Error('Record is required.');
  const recordId = normalizeId(record.id, 'Record ID');
  const selected = normalizeId(selectedRecordId, 'Selected record ID');
  if (recordId !== selected) throw new Error('Selected-record mismatch.');
  return recordId;
}

function createContract(input, config, now = Date.now()) {
  const errors = validateConfig(config);
  if (errors.length) throw new Error(errors.join(' '));
  const cadence = String(input.cadence || '').trim();
  if (!config.contracts.supportedCadences.includes(cadence)) throw new Error('Contract cadence is not supported.');
  const includedUsage = Number(input.includedUsage || 0);
  if (!Number.isFinite(includedUsage) || includedUsage < 0) throw new Error('Included usage is invalid.');
  const startsAt = normalizeDate(input.startsAt || now, 'Contract start date');
  const renewsAt = input.renewsAt ? normalizeDate(input.renewsAt, 'Contract renewal date') : null;
  if (renewsAt && new Date(renewsAt).getTime() <= new Date(startsAt).getTime()) throw new Error('Contract renewal must occur after the start date.');
  return {
    id: normalizeId(input.id || `CONTRACT-${crypto.randomUUID()}`, 'Contract ID'),
    customerId: normalizeId(input.customerId, 'Customer ID'),
    name: normalizeText(input.name, 'Contract name', 2, 160),
    cadence,
    amount: normalizeMoney(input.amount),
    includedUsage,
    usedUsage: 0,
    overageRate: normalizeMoney(input.overageRate || 0, 'Overage rate'),
    startsAt,
    renewsAt,
    status: 'OWNER_REVIEW',
    cancellationRequestedAt: null,
    createdAt: new Date(now).toISOString(),
    externalActionOccurred: false
  };
}

function activateContract(contract, selectedRecordId, ownerApproval, now = Date.now()) {
  selectedRecordGuard(contract, selectedRecordId);
  if (contract.status !== 'OWNER_REVIEW' && contract.status !== 'PAUSED') throw new Error('Contract is not eligible for activation.');
  if (!ownerApproval || ownerApproval.approved !== true) throw new Error('Owner approval is required.');
  return {
    ...clone(contract),
    status: 'ACTIVE',
    activatedAt: new Date(now).toISOString(),
    ownerApprovalId: normalizeId(ownerApproval.id, 'Owner approval ID'),
    externalActionOccurred: false
  };
}

function recordContractUsage(contract, selectedRecordId, units, referenceId, now = Date.now()) {
  selectedRecordGuard(contract, selectedRecordId);
  if (contract.status !== 'ACTIVE') throw new Error('Usage can only be recorded against an active contract.');
  const quantity = Number(units);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Usage units must be greater than zero.');
  const usedUsage = Number(contract.usedUsage || 0) + quantity;
  const overageUnits = Math.max(0, usedUsage - Number(contract.includedUsage || 0));
  return {
    contract: { ...clone(contract), usedUsage },
    usageEntry: {
      id: `USAGE-${crypto.randomUUID()}`,
      contractId: contract.id,
      customerId: contract.customerId,
      units: quantity,
      referenceId: normalizeId(referenceId, 'Usage reference ID'),
      recordedAt: new Date(now).toISOString(),
      overageUnits,
      overageAmount: normalizeMoney(overageUnits * Number(contract.overageRate || 0)),
      status: overageUnits > 0 ? 'OVERAGE_NEEDS_OWNER_REVIEW' : 'RECORDED',
      externalActionOccurred: false
    }
  };
}

function requestContractCancellation(contract, selectedRecordId, reason, now = Date.now()) {
  selectedRecordGuard(contract, selectedRecordId);
  if (!['ACTIVE', 'PAUSED'].includes(contract.status)) throw new Error('Contract is not eligible for cancellation.');
  return {
    ...clone(contract),
    status: 'CANCEL_PENDING',
    cancellationReason: normalizeText(reason, 'Cancellation reason', 5, 1000),
    cancellationRequestedAt: new Date(now).toISOString(),
    externalActionOccurred: false,
    nextAction: 'Owner reviews contract terms, included usage, outstanding balance, and cancellation effective date.'
  };
}

function prepareControlledAction({ config, actionType, record, selectedRecordId, payload = {}, preparedBy = 'system', now = Date.now() }) {
  const errors = validateConfig(config);
  if (errors.length) throw new Error(errors.join(' '));
  if (!ACTION_TYPES.has(actionType)) throw new Error('Action type is not supported.');
  const recordId = selectedRecordGuard(record, selectedRecordId);
  const actionFlag = ACTION_FLAG_MAP[actionType];
  if (config.workflows[actionFlag] !== false) throw new Error('Default workflow lock is not intact.');
  const payloadDigest = sha256(payload);
  const duplicateLock = sha256(`${actionType}|${recordId}|${record.version || 1}|${payloadDigest}`);
  return {
    id: `ACTION-${crypto.randomUUID()}`,
    actionType,
    recordType: normalizeText(record.type || 'record', 'Record type', 2, 80),
    recordId,
    customerId: record.customerId ? normalizeId(record.customerId, 'Customer ID') : null,
    status: 'NEEDS_OWNER_APPROVAL',
    payload: clone(payload),
    payloadDigest,
    duplicateLock,
    preparedBy: normalizeText(preparedBy, 'Prepared by', 2, 120),
    preparedAt: new Date(now).toISOString(),
    approvedAt: null,
    executedAt: null,
    providerReference: null,
    automaticRetry: false,
    externalActionOccurred: false
  };
}

function approveControlledAction(action, selectedActionId, approval, duplicateLocks = new Set(), now = Date.now()) {
  selectedRecordGuard(action, selectedActionId);
  if (action.status !== 'NEEDS_OWNER_APPROVAL') throw new Error('Action is not awaiting owner approval.');
  if (!approval || approval.approved !== true) throw new Error('Owner approval is required.');
  const approvalId = normalizeId(approval.id, 'Owner approval ID');
  if (duplicateLocks.has(action.duplicateLock)) throw new Error('Duplicate controlled action blocked.');
  duplicateLocks.add(action.duplicateLock);
  return {
    ...clone(action),
    status: 'APPROVED_LOCKED_NO_PROVIDER_EXECUTION',
    ownerApprovalId: approvalId,
    approvedAt: new Date(now).toISOString(),
    automaticRetry: false,
    externalActionOccurred: false
  };
}

function activationBlockers(config, action, providerStatus = {}) {
  const blockers = [];
  const flag = ACTION_FLAG_MAP[action.actionType];
  if (config.controls.externalActionsEnabled !== true) blockers.push('Global external-actions switch is disabled.');
  if (config.workflows[flag] !== true) blockers.push(`Workflow ${flag} is disabled.`);
  if (action.status !== 'APPROVED_LOCKED_NO_PROVIDER_EXECUTION') blockers.push('Action lacks a current owner approval.');
  if (providerStatus.connected !== true) blockers.push('Provider is not connected.');
  if (providerStatus.credentialsPresent !== true) blockers.push('Provider credentials are missing.');
  if (providerStatus.regressionTestsPassed !== true) blockers.push('Provider regression tests have not passed.');
  if (providerStatus.rollbackReady !== true) blockers.push('Rollback protection is not ready.');
  if (providerStatus.proofLogReady !== true || providerStatus.errorLogReady !== true) blockers.push('Proof/Error logging is not ready.');
  return blockers;
}

function recordProviderResult({ config, action, providerResult, resultLocks = new Set(), now = Date.now() }) {
  if (!action || !providerResult) throw new Error('Action and provider result are required.');
  if (!config.controls.providerReferenceRequiredForExternalResults) throw new Error('Provider-reference control is not enabled.');
  const providerReference = normalizeId(providerResult.providerReference, 'Provider reference');
  const resultLock = sha256(`${action.id}|${providerReference}|${providerResult.status}`);
  if (resultLocks.has(resultLock)) throw new Error('Duplicate provider result blocked.');
  resultLocks.add(resultLock);
  const allowedStatuses = ['SUCCEEDED', 'FAILED', 'UNKNOWN'];
  if (!allowedStatuses.includes(providerResult.status)) throw new Error('Provider result status is invalid.');
  return {
    ...clone(action),
    status: providerResult.status === 'SUCCEEDED' ? 'PROVIDER_CONFIRMED' : providerResult.status === 'FAILED' ? 'PROVIDER_FAILED_NO_RETRY' : 'PROVIDER_UNKNOWN_HOLD',
    providerReference,
    providerName: normalizeText(providerResult.providerName, 'Provider name', 2, 120),
    providerStatus: providerResult.status,
    providerMessage: normalizeText(providerResult.message || providerResult.status, 'Provider message', 2, 1000),
    providerRecordedAt: new Date(now).toISOString(),
    resultLock,
    automaticRetry: false,
    externalActionOccurred: providerResult.status === 'SUCCEEDED'
  };
}

function validateHostedPaymentLink(config, invoice, urlValue, provider) {
  if (config.payments.providerHostedOnly !== true || config.payments.rawCardDataAllowed !== false) throw new Error('Hosted payment controls are not intact.');
  if (!config.payments.approvedProviders.includes(provider)) throw new Error('Payment provider is not approved.');
  let url;
  try { url = new URL(urlValue); } catch (_) { throw new Error('Hosted payment URL is invalid.'); }
  if (!config.payments.allowedUrlSchemes.includes(url.protocol)) throw new Error('Hosted payment URL scheme is not allowed.');
  if (url.username || url.password) throw new Error('Hosted payment URL may not contain credentials.');
  if (normalizeMoney(invoice.balanceDue, 'Invoice balance') <= 0) throw new Error('Invoice has no payable balance.');
  return {
    invoiceId: normalizeId(invoice.id, 'Invoice ID'),
    customerId: normalizeId(invoice.customerId, 'Customer ID'),
    provider,
    hostedUrl: url.toString(),
    balanceDue: normalizeMoney(invoice.balanceDue),
    rawCardDataStored: false,
    externalActionOccurred: false
  };
}

function recordTransaction(input, now = Date.now()) {
  const type = String(input.type || '').trim().toLowerCase();
  if (!TRANSACTION_TYPES.has(type)) throw new Error('Transaction type is not supported.');
  const revenueClass = input.revenueClass ? String(input.revenueClass).trim().toLowerCase() : null;
  if (revenueClass && !REVENUE_CLASSES.has(revenueClass)) throw new Error('Revenue class is not supported.');
  if (input.rawCardData || input.cardNumber || input.cvv || input.cvc) throw new Error('Raw card data is forbidden.');
  const amount = normalizeMoney(input.amount);
  const sign = ['expense', 'credit', 'refund'].includes(type) ? -1 : 1;
  return {
    id: normalizeId(input.id || `TXN-${crypto.randomUUID()}`, 'Transaction ID'),
    type,
    customerId: input.customerId ? normalizeId(input.customerId, 'Customer ID') : null,
    jobId: input.jobId ? normalizeId(input.jobId, 'Job ID') : null,
    productId: input.productId ? normalizeId(input.productId, 'Product ID') : null,
    campaignId: input.campaignId ? normalizeId(input.campaignId, 'Campaign ID') : null,
    revenueClass,
    amount,
    signedAmount: normalizeMoney(amount) * sign,
    currency: String(input.currency || 'USD').toUpperCase(),
    providerReference: input.providerReference ? normalizeId(input.providerReference, 'Provider reference') : null,
    occurredAt: normalizeDate(input.occurredAt || now),
    externalActionOccurred: false
  };
}

function profitabilityReport(transactions) {
  const groups = new Map();
  for (const transaction of transactions) {
    const key = transaction.productId || transaction.revenueClass || 'unclassified';
    const current = groups.get(key) || { key, revenue: 0, expenses: 0, creditsRefunds: 0, net: 0, transactions: 0 };
    current.transactions += 1;
    if (['invoice', 'payment'].includes(transaction.type)) current.revenue += transaction.amount;
    else if (transaction.type === 'expense') current.expenses += transaction.amount;
    else current.creditsRefunds += transaction.amount;
    current.net = Math.round((current.revenue - current.expenses - current.creditsRefunds + Number.EPSILON) * 100) / 100;
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function outstandingBalances(invoices, transactions) {
  const paidByInvoice = new Map();
  for (const transaction of transactions) {
    if (!transaction.invoiceId) continue;
    const current = paidByInvoice.get(transaction.invoiceId) || 0;
    if (transaction.type === 'payment') paidByInvoice.set(transaction.invoiceId, current + transaction.amount);
    if (transaction.type === 'refund') paidByInvoice.set(transaction.invoiceId, current - transaction.amount);
  }
  return invoices.map(invoice => {
    const amount = normalizeMoney(invoice.amount);
    const paid = Math.max(0, paidByInvoice.get(invoice.id) || 0);
    return {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      amount,
      paid: Math.round(paid * 100) / 100,
      balance: Math.round(Math.max(0, amount - paid) * 100) / 100,
      dueAt: invoice.dueAt || null,
      overdue: Boolean(invoice.dueAt && new Date(invoice.dueAt).getTime() < Date.now() && amount > paid)
    };
  });
}

function accountingCsv(transactions) {
  const header = ['transaction_id','type','occurred_at','customer_id','job_id','product_id','revenue_class','amount','signed_amount','currency','provider_reference','campaign_id'];
  const escape = value => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = transactions.map(transaction => [
    transaction.id,
    transaction.type,
    transaction.occurredAt,
    transaction.customerId,
    transaction.jobId,
    transaction.productId,
    transaction.revenueClass,
    transaction.amount.toFixed(2),
    transaction.signedAmount.toFixed(2),
    transaction.currency,
    transaction.providerReference,
    transaction.campaignId
  ].map(escape).join(','));
  return [header.join(','), ...rows].join('\n') + '\n';
}

function attributionReport(transactions) {
  const campaigns = new Map();
  for (const transaction of transactions) {
    if (!transaction.campaignId) continue;
    const item = campaigns.get(transaction.campaignId) || { campaignId: transaction.campaignId, revenue: 0, cost: 0, net: 0, transactions: 0 };
    item.transactions += 1;
    if (['invoice', 'payment'].includes(transaction.type)) item.revenue += transaction.amount;
    if (transaction.type === 'expense') item.cost += transaction.amount;
    item.net = Math.round((item.revenue - item.cost + Number.EPSILON) * 100) / 100;
    campaigns.set(transaction.campaignId, item);
  }
  return [...campaigns.values()].sort((a, b) => b.net - a.net);
}

function createCommunicationDraft({ record, selectedRecordId, channel, subject, body, now = Date.now() }) {
  selectedRecordGuard(record, selectedRecordId);
  return {
    id: `COMM-${crypto.randomUUID()}`,
    recordId: record.id,
    customerId: record.customerId ? normalizeId(record.customerId, 'Customer ID') : null,
    channel: normalizeText(channel, 'Channel', 2, 40),
    subject: normalizeText(subject, 'Subject', 2, 200),
    body: normalizeText(body, 'Body', 2, 10000),
    status: 'DRAFT_NEEDS_OWNER_APPROVAL',
    createdAt: new Date(now).toISOString(),
    externalActionOccurred: false
  };
}

function createSocialDraft({ platform, caption, assetReference, campaignId, publishAt, now = Date.now() }) {
  return {
    id: `SOCIAL-${crypto.randomUUID()}`,
    platform: normalizeText(platform, 'Platform', 2, 80),
    caption: normalizeText(caption, 'Caption', 2, 5000),
    assetReference: normalizeId(assetReference, 'Asset reference'),
    campaignId: normalizeId(campaignId, 'Campaign ID'),
    publishAt: normalizeDate(publishAt, 'Publish date'),
    status: 'DRAFT_NEEDS_OWNER_APPROVAL',
    createdAt: new Date(now).toISOString(),
    externalActionOccurred: false
  };
}

function createWebsiteChange({ id, path, summary, rollbackReference, now = Date.now() }) {
  const route = String(path || '').trim();
  if (!route.startsWith('/') || route.includes('..')) throw new Error('Website path is invalid.');
  return {
    id: normalizeId(id || `WEB-${crypto.randomUUID()}`, 'Website change ID'),
    path: route,
    summary: normalizeText(summary, 'Website change summary', 5, 2000),
    rollbackReference: normalizeId(rollbackReference, 'Rollback reference'),
    status: 'REVIEW_REQUIRED_NOT_DEPLOYED',
    createdAt: new Date(now).toISOString(),
    externalActionOccurred: false
  };
}

function proofEntry(action, result, context = {}, now = Date.now()) {
  return {
    id: `PROOF-${crypto.randomUUID()}`,
    timestamp: new Date(now).toISOString(),
    action,
    result,
    recordId: context.recordId || null,
    customerId: context.customerId || null,
    providerReference: context.providerReference || null,
    externalActionOccurred: Boolean(context.externalActionOccurred),
    digest: sha256({ action, result, context })
  };
}

function errorEntry(action, error, context = {}, now = Date.now()) {
  return {
    id: `ERROR-${crypto.randomUUID()}`,
    timestamp: new Date(now).toISOString(),
    action,
    message: String(error?.message || error),
    recordId: context.recordId || null,
    customerId: context.customerId || null,
    providerReference: context.providerReference || null,
    automaticRetry: false,
    externalActionOccurred: Boolean(context.externalActionOccurred)
  };
}

module.exports = {
  ACTION_TYPES,
  ACTION_FLAG_MAP,
  validateConfig,
  selectedRecordGuard,
  createContract,
  activateContract,
  recordContractUsage,
  requestContractCancellation,
  prepareControlledAction,
  approveControlledAction,
  activationBlockers,
  recordProviderResult,
  validateHostedPaymentLink,
  recordTransaction,
  profitabilityReport,
  outstandingBalances,
  accountingCsv,
  attributionReport,
  createCommunicationDraft,
  createSocialDraft,
  createWebsiteChange,
  proofEntry,
  errorEntry,
  sha256,
  normalizeMoney
};
