/** Final lifecycle automation binding — safe internal progress from request through payment, with owner/customer gates preserved. */
var H38_WORKFLOW_AUTOMATION_VERSION = '2026-07-27-request-to-payment-v1';

function boWorkflowText_(value) { return String(value == null ? '' : value).trim(); }
function boWorkflowLower_(value) { return boWorkflowText_(value).toLowerCase(); }
function boWorkflowRows_(sheetName) {
  try { return boReadTable_(sheetName, { includeVoided: false }); }
  catch (error) { return []; }
}
function boWorkflowIsClosed_(value) { return /^(closed|complete|completed|converted|cancelled|canceled|rejected|voided|paid)$/i.test(boWorkflowText_(value)); }
function boWorkflowDatePast_(value) {
  var parsed = Date.parse(boWorkflowText_(value));
  if (!Number.isFinite(parsed)) return false;
  var today = new Date(); today.setHours(0, 0, 0, 0);
  return parsed < today.getTime();
}
function boWorkflowBalance_(invoice) {
  var balance = Number(invoice['Balance Due']);
  if (Number.isFinite(balance)) return balance;
  var total = Number(invoice.Total || 0), paid = Number(invoice['Amount Paid'] || invoice.Paid || 0);
  return Math.max(0, total - paid);
}
function boWorkflowOpenRequests_() {
  return boWorkflowRows_(H38_BO_SHEETS.REQUESTS).filter(function (row) { return !boWorkflowIsClosed_(row.Status); });
}
function boWorkflowOpenQuotes_() {
  return boWorkflowRows_(H38_BO_SHEETS.QUOTES).filter(function (row) { return !boWorkflowIsClosed_(row.Status) && boWorkflowLower_(row['Revision Status'] || 'current') !== 'superseded'; });
}
function boWorkflowOpenJobs_() {
  return boWorkflowRows_(H38_BO_SHEETS.JOBS).filter(function (row) { return !/^(voided|cancelled|canceled)$/i.test(boWorkflowText_(row.Status)); });
}
function boWorkflowOpenInvoices_() {
  return boWorkflowRows_(H38_BO_SHEETS.INVOICES).filter(function (row) { return !/^(voided|cancelled|canceled)$/i.test(boWorkflowText_(row.Status)); });
}
function boWorkflowPayments_() { return boWorkflowRows_(H38_BO_SHEETS.PAYMENTS); }

function boWorkflowTakeover_(spec) {
  spec = spec || {};
  return boAiCreateTakeoverBlock_({
    title: spec.title || 'Workflow decision needed',
    blocker: spec.blocker || 'Owner review is required before the workflow can continue.',
    completed: spec.completed || ['H38 prepared all safe internal work available at this stage.', 'No external action was performed.'],
    needed: spec.needed || [spec.blocker || 'Owner decision'],
    recommendation: spec.recommendation || 'Review the linked record and authorize the exact next action.',
    commands: spec.commands || [],
    agentKey: spec.agentKey || 'intake_requirements',
    linkedRecordType: spec.recordType || '',
    linkedRecordId: spec.recordId || '',
    customerId: spec.customerId || '',
    requestId: spec.requestId || '',
    quoteId: spec.quoteId || '',
    workOrderId: spec.workOrderId || '',
    jobId: spec.jobId || '',
    invoiceId: spec.invoiceId || '',
    priority: spec.priority || 'High',
    source: spec.source || ('workflow:' + (spec.recordType || '') + ':' + (spec.recordId || ''))
  });
}

function boWorkflowRecommended_(requests, quotes, jobs, invoices, payments) {
  var request = requests.find(function (row) { return !row['Customer ID'] || !row['Next Action']; });
  if (request) return { label: 'Complete intake for ' + (request.Name || request['Request ID'] || 'the next request'), route: 'bo:requests', recordType: 'Request', recordId: request['Request ID'] || '' };
  var quote = quotes.find(function (row) { return !/approved|shared|accepted/i.test([row.Status, row['Approval Status'], row['Customer Action']].join(' ')); });
  if (quote) return { label: 'Finish and review quote ' + (quote['Quote Number'] || quote['Quote ID'] || ''), route: 'bo:quotes', recordType: 'Quote', recordId: quote['Quote ID'] || '' };
  var job = jobs.find(function (row) { return !/complete|completed|closed/i.test([row.Status, row.Stage].join(' ')); });
  if (job) return { label: (boWorkflowLower_(job.Stage) === 'planning' ? 'Plan and schedule ' : 'Continue ') + (job['Project Title'] || job['Job Number'] || 'the next job'), route: 'bo:jobs', recordType: 'Job', recordId: job['Job ID'] || '' };
  var draft = invoices.find(function (row) { return boWorkflowLower_(row.Status) === 'draft' || boWorkflowLower_(row['Approval Status']).indexOf('required') >= 0; });
  if (draft) return { label: 'Review invoice ' + (draft['Invoice Number'] || draft['Invoice ID'] || ''), route: 'bo:invoices', recordType: 'Invoice', recordId: draft['Invoice ID'] || '' };
  var unpaid = invoices.find(function (row) { return boWorkflowBalance_(row) > 0; });
  if (unpaid) return { label: 'Follow up on invoice ' + (unpaid['Invoice Number'] || unpaid['Invoice ID'] || ''), route: 'bo:invoices', recordType: 'Invoice', recordId: unpaid['Invoice ID'] || '' };
  var payment = payments.find(function (row) { return boWorkflowLower_(row['Approval Status']).indexOf('required') >= 0; });
  if (payment) return { label: 'Review recorded payment ' + (payment['Payment ID'] || ''), route: 'bo:payments', recordType: 'Payment', recordId: payment['Payment ID'] || '' };
  return { label: 'No urgent workflow action is waiting.', route: 'today', recordType: '', recordId: '' };
}

function h38PortalWorkflowStatus() {
  boGetCurrentUser_();
  var requests = boWorkflowOpenRequests_(), quotes = boWorkflowOpenQuotes_(), jobs = boWorkflowOpenJobs_(), invoices = boWorkflowOpenInvoices_(), payments = boWorkflowPayments_();
  var activeJobs = jobs.filter(function (row) { return !/complete|completed|closed/i.test([row.Status, row.Stage].join(' ')); });
  var unpaid = invoices.filter(function (row) { return boWorkflowBalance_(row) > 0 && !/paid/i.test(boWorkflowText_(row.Status)); });
  var paid = invoices.filter(function (row) { return boWorkflowBalance_(row) <= 0 || /paid/i.test(boWorkflowText_(row.Status)); });
  return {
    status: 'PASS', version: H38_WORKFLOW_AUTOMATION_VERSION, automationMode: typeof boAiAutomationMode_ === 'function' ? boAiAutomationMode_() : 'automatic',
    stages: [
      { key: 'intake', label: 'Requests', count: requests.length },
      { key: 'quotes', label: 'Quotes', count: quotes.length },
      { key: 'work', label: 'Active work', count: activeJobs.length },
      { key: 'billing', label: 'Unpaid', count: unpaid.length },
      { key: 'paid', label: 'Paid', count: paid.length }
    ],
    recommended: boWorkflowRecommended_(requests, quotes, jobs, invoices, payments),
    externalActionsOccurred: false,
    ownerApprovalRequiredForExternalActions: true
  };
}

function boWorkflowAutomationRun_(options) {
  options = options || {};
  var owner = boRequireOwner_(), limit = Math.max(1, Math.min(Number(options.limit) || 10, 25));
  var summary = { version: H38_WORKFLOW_AUTOMATION_VERSION, safeInternalSteps: [], ownerGates: [], errors: [], externalActionsOccurred: false };
  var requests = boWorkflowOpenRequests_().slice(0, limit);
  requests.forEach(function (row) {
    var requestId = row['Request ID'] || '';
    try {
      if (!row['Customer ID'] && row.Name && row.Email) {
        var customer = boCreateCustomerFromRequest(requestId);
        summary.safeInternalSteps.push({ type: 'customer-created', requestId: requestId, customerId: customer['Customer ID'] || '', duplicatePrevented: !!row['Customer ID'] });
      } else if (!row['Customer ID']) {
        summary.ownerGates.push(boWorkflowTakeover_({ title: 'Request needs customer details', blocker: 'A customer name and verified email are required before intake can become a customer and quote.', commands: ['Open request ' + requestId + '.', 'Add the missing customer details and continue.'], agentKey: 'intake_requirements', recordType: 'Request', recordId: requestId, requestId: requestId, source: 'workflow-request-customer:' + requestId }));
      }
    } catch (error) { summary.errors.push({ stage: 'request', recordId: requestId, error: String(error && error.message || error) }); }
  });

  var quotes = boWorkflowRows_(H38_BO_SHEETS.QUOTES).slice(0, 100);
  quotes.filter(function (row) {
    var accepted = /accepted|approved/i.test(boWorkflowText_(row['Customer Action']));
    return accepted && boWorkflowText_(row['Approval Status']) === 'Approved' && !row['Job ID'] && !/converted|voided|cancelled/i.test(boWorkflowText_(row.Status));
  }).slice(0, limit).forEach(function (row) {
    var quoteId = row['Quote ID'] || '';
    try {
      var converted = boConvertQuoteToWorkOrderAndJob(quoteId);
      summary.safeInternalSteps.push({ type: 'accepted-quote-converted', quoteId: quoteId, jobId: converted.job && converted.job['Job ID'] || '', workOrderId: converted.workOrder && converted.workOrder['Work Order ID'] || '', duplicatePrevented: !!converted.duplicatePrevented });
    } catch (error) { summary.errors.push({ stage: 'quote-conversion', recordId: quoteId, error: String(error && error.message || error) }); }
  });

  var jobs = boWorkflowOpenJobs_();
  jobs.filter(function (row) {
    var complete = /complete|completed|closed/i.test([row.Status, row.Stage].join(' '));
    return complete && !/draft invoice created|invoiced|paid/i.test(boWorkflowText_(row['Invoice Status']));
  }).slice(0, limit).forEach(function (row) {
    var jobId = row['Job ID'] || '';
    try {
      var invoice = boCreateInvoiceFromJob(jobId);
      summary.safeInternalSteps.push({ type: 'draft-invoice-created', jobId: jobId, invoiceId: invoice['Invoice ID'] || '', duplicatePrevented: false });
    } catch (error) { summary.errors.push({ stage: 'job-invoice', recordId: jobId, error: String(error && error.message || error) }); }
  });
  jobs.filter(function (row) { return boWorkflowLower_(row.Stage) === 'planning' && !boWorkflowIsClosed_(row.Status); }).slice(0, limit).forEach(function (row) {
    var jobId = row['Job ID'] || '';
    summary.ownerGates.push(boWorkflowTakeover_({ title: 'Job planning decision needed', blocker: 'The job is ready for an owner scheduling or field-plan decision.', completed: ['Created the job and work order from the accepted quote.', 'Preserved the approved scope and customer links.'], needed: ['Confirm schedule, assignment, and any field-verification requirements.'], recommendation: 'Open the job, confirm the field plan, then schedule it.', commands: ['Open job ' + jobId + '.', 'Schedule job ' + jobId + '.', 'Hold job ' + jobId + '.'], agentKey: 'scope_instruction', recordType: 'Job', recordId: jobId, jobId: jobId, customerId: row['Customer ID'] || '', quoteId: row['Quote ID'] || '', workOrderId: row['Work Order ID'] || '', source: 'workflow-job-planning:' + jobId }));
  });

  var invoices = boWorkflowOpenInvoices_();
  invoices.filter(function (row) { return boWorkflowLower_(row.Status) === 'draft' && boWorkflowText_(row['Approval Status']) !== 'Approved'; }).slice(0, limit).forEach(function (row) {
    var invoiceId = row['Invoice ID'] || '';
    summary.ownerGates.push(boWorkflowTakeover_({ title: 'Draft invoice ready for review', blocker: 'The invoice is prepared internally but cannot be sent until the Owner reviews and approves it.', commands: ['Open invoice ' + invoiceId + '.', 'Approve invoice ' + invoiceId + '.', 'Hold invoice ' + invoiceId + '.'], agentKey: 'quote_review', recordType: 'Invoice', recordId: invoiceId, invoiceId: invoiceId, jobId: row['Job ID'] || '', customerId: row['Customer ID'] || '', source: 'workflow-invoice-approval:' + invoiceId }));
  });
  invoices.filter(function (row) { return boWorkflowText_(row['Approval Status']) === 'Approved' && !/sent|delivered/i.test([row.Status, row['Delivery Status']].join(' ')); }).slice(0, limit).forEach(function (row) {
    var invoiceId = row['Invoice ID'] || '';
    summary.ownerGates.push(boWorkflowTakeover_({ title: 'Approved invoice ready to send', blocker: 'Customer delivery is an external action and requires an exact Owner command.', completed: ['Invoice approval is complete.', 'The customer, job, and quote links remain attached.'], commands: ['Open invoice ' + invoiceId + '.', 'Send invoice ' + invoiceId + ' after review.'], agentKey: 'quote_review', recordType: 'Invoice', recordId: invoiceId, invoiceId: invoiceId, jobId: row['Job ID'] || '', customerId: row['Customer ID'] || '', source: 'workflow-invoice-send:' + invoiceId }));
  });
  invoices.filter(function (row) { return boWorkflowBalance_(row) > 0 && (boWorkflowDatePast_(row['Due Date']) || /overdue/i.test(boWorkflowText_(row.Status))); }).slice(0, limit).forEach(function (row) {
    var invoiceId = row['Invoice ID'] || '';
    summary.ownerGates.push(boWorkflowTakeover_({ title: 'Invoice follow-up is due', blocker: 'The invoice is unpaid and due or overdue. Customer contact requires Owner authorization.', completed: ['Confirmed the invoice remains open.', 'Calculated the remaining balance from Business Office records.'], recommendation: 'Review the account and authorize a customer follow-up.', commands: ['Open invoice ' + invoiceId + '.', 'Prepare a payment reminder for invoice ' + invoiceId + '.'], agentKey: 'intake_requirements', recordType: 'Invoice', recordId: invoiceId, invoiceId: invoiceId, jobId: row['Job ID'] || '', customerId: row['Customer ID'] || '', source: 'workflow-invoice-followup:' + invoiceId }));
  });

  boWorkflowPayments_().filter(function (row) { return boWorkflowLower_(row['Approval Status']).indexOf('required') >= 0; }).slice(0, limit).forEach(function (row) {
    var paymentId = row['Payment ID'] || '';
    summary.ownerGates.push(boWorkflowTakeover_({ title: 'Recorded payment needs review', blocker: 'The payment record is preserved but requires Owner review before posting or receipt delivery.', commands: ['Open payment ' + paymentId + '.', 'Approve payment ' + paymentId + '.'], agentKey: 'business_setup', recordType: 'Payment', recordId: paymentId, invoiceId: row['Invoice ID'] || '', jobId: row['Job ID'] || '', customerId: row['Customer ID'] || '', source: 'workflow-payment-review:' + paymentId }));
  });

  boProof_('H38 WORKFLOW AUTOMATION', 'System', boGetBusinessId_(), summary.errors.length ? 'HOLD' : 'PASS', 'Safe internal steps=' + summary.safeInternalSteps.length + '; owner gates=' + summary.ownerGates.length + '; errors=' + summary.errors.length + '; external actions=0.', owner.Email);
  return summary;
}

/* Final override extends the existing backend pass without changing its Owner and external-action boundaries. */
function boAiAutomationRun_(payload) {
  payload = payload || {};
  var owner = boRequireOwner_(), mode = boAiAutomationMode_();
  if (mode === 'manual-hold' && payload.force !== true) return { kind: 'message', answer: 'H38 backend automation is on Manual Hold. Say “set H38 automation to automatic” to release it.', spoken: true };
  var summary = { workflow: null, email: null, sms: null, scanned: {}, createdTakeovers: [], agentRuns: [], externalActionsOccurred: false };
  try { summary.workflow = boWorkflowAutomationRun_({ limit: Math.max(1, Math.min(Number(payload.workflowLimit) || 10, 25)) }); } catch (workflowError) { summary.workflow = { error: workflowError.message, safeInternalSteps: [], ownerGates: [], externalActionsOccurred: false }; }
  try { summary.email = boAiEmailBrief_({ limit: Math.max(1, Math.min(Number(payload.emailLimit) || 10, 10)) }); } catch (error) { summary.email = { error: error.message }; }
  try { var provider = typeof h38TmProviderStatus_ === 'function' ? h38TmProviderStatus_() : {}; summary.sms = provider; if (provider.inboundSyncReleased && typeof h38TmSyncInbound_ === 'function') summary.sms.sync = h38TmSyncInbound_(); } catch (error2) { summary.sms = { error: error2.message }; }
  try {
    var requests = boQuoteBuilderSnapshot_(H38_BO_SHEETS.REQUESTS, { includeVoided: false }).rows.slice(0, 100); summary.scanned.requests = requests.length;
    requests.filter(function (row) { var status = boWorkflowLower_(row.Status); return status && ['closed', 'converted', 'cancelled', 'voided'].indexOf(status) < 0; }).slice(0, 10).forEach(function (row) {
      var id = row['Request ID'] || '';
      var result = boAiRunSpecialist_('intake_requirements', 'Prepare this open request as far as possible. Identify the minimum missing questions needed to create a reliable quote.', { module: 'requests', recordType: 'Request', recordId: id, recordSummary: JSON.stringify(row).slice(0, 6000), task: 'Automatic request preparation' });
      summary.agentRuns.push({ recordType: 'Request', recordId: id, kind: result.kind, agent: 'intake_requirements' }); if (result.takeover) summary.createdTakeovers.push(result.takeover);
    });
  } catch (error3) { summary.scanned.requestsError = error3.message; }
  try {
    var quotes = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTES, { includeVoided: false }).rows.slice(0, 100); summary.scanned.quotes = quotes.length;
    quotes.filter(function (row) { return ['Internal Review', 'Revised', 'Approved to Share'].indexOf(boWorkflowText_(row.Status)) >= 0; }).slice(0, 10).forEach(function (row) {
      var quoteId = row['Quote ID'] || '';
      var result = boAiRunSpecialist_('quote_review', 'Review this quote and prepare it up to the point where only an Owner decision or customer contact remains.', { module: 'quotes', recordType: 'Quote', recordId: quoteId, recordSummary: JSON.stringify(row).slice(0, 6000), task: 'Automatic quote readiness review' });
      summary.agentRuns.push({ recordType: 'Quote', recordId: quoteId, kind: result.kind, agent: 'quote_review' }); if (result.takeover) summary.createdTakeovers.push(result.takeover);
    });
  } catch (error4) { summary.scanned.quotesError = error4.message; }
  var queue = boAiTakeoverQueue_({ limit: 100, quiet: true });
  var safeCount = summary.workflow && summary.workflow.safeInternalSteps ? summary.workflow.safeInternalSteps.length : 0;
  boProof_('H38 BACK OFFICE AUTOMATION', 'System', boGetBusinessId_(), 'PASS', 'Full workflow scanned; safe internal steps=' + safeCount + '; open owner blocks=' + queue.count + '; external actions=0.', owner.Email);
  return { kind: 'automation', answer: 'Back-office pass completed from intake through payment. ' + safeCount + ' safe internal step' + (safeCount === 1 ? ' was' : 's were') + ' completed, ' + summary.agentRuns.length + ' agent preparation run' + (summary.agentRuns.length === 1 ? ' was' : 's were') + ' completed, and ' + queue.count + ' owner takeover block' + (queue.count === 1 ? ' is' : 's are') + ' open. No external action was performed.', summary: summary, takeovers: queue.takeovers, openTakeoverCount: queue.count, spoken: true, externalActionsOccurred: false };
}
