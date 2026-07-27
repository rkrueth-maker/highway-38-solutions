/** Business Office — one controlled, idempotent, fully approved internal demonstration run. */
var H38_FULL_DEMO_MARKER = 'H38-FULL-DEMO-20260726-001';
var H38_FULL_DEMO_OWNER_EMAIL = 'rkrueth@gmail.com';
var H38_FULL_DEMO_BUSINESS_EMAIL = 'highway38solutions@gmail.com';
var H38_FULL_DEMO_INTAKE_SUBJECT = 'H38 FULL BUSINESS OFFICE DEMO — Controlled Intake 2026-07-26';

function boFullDemoText_(value) { return String(value == null ? '' : value).trim(); }

function boFullDemoFind_(sheetName, stableId) {
  var headers = boHeaders_(sheetName);
  var key = boPrimaryKeyHeader_(headers);
  return boReadTable_(sheetName, { includeVoided: true }).find(function (row) {
    return row[key] === stableId;
  }) || null;
}

function boFullDemoUpsert_(sheetName, stableId, values, reason) {
  var headers = boHeaders_(sheetName);
  var key = boPrimaryKeyHeader_(headers);
  var payload = Object.assign({}, values || {});
  payload[key] = stableId;
  if (headers.indexOf('Business ID') >= 0) payload['Business ID'] = boGetBusinessId_();
  if (headers.indexOf('Duplicate Key') >= 0) payload['Duplicate Key'] = stableId;
  if (headers.indexOf('Demo Data') >= 0) payload['Demo Data'] = 'Yes';
  if (headers.indexOf('Notes') >= 0) payload.Notes = [payload.Notes, H38_FULL_DEMO_MARKER, 'Controlled internal demonstration only.'].filter(Boolean).join(' | ');
  var existing = boFullDemoFind_(sheetName, stableId);
  return existing
    ? boUpdateRecord_(sheetName, stableId, payload, reason || 'Full approved demo reload')
    : boAppendRecord_(sheetName, payload, reason || 'Full approved demo seed');
}

function boFullDemoActivity_(suffix, values) {
  return boFullDemoUpsert_(H38_BO_SHEETS.ACTIVITY, H38_FULL_DEMO_MARKER + '-' + suffix, Object.assign({
    'Activity Type': 'Full Approved Business Office Demo',
    'Record Type': 'System',
    'Record ID': H38_FULL_DEMO_MARKER,
    Status: 'Complete Demo',
    Summary: suffix,
    Details: '{}',
    'Created By': boGetCurrentUser_()['User ID'],
    'Created Time': boNow_()
  }, values || {}), 'Full approved demo activity');
}

function boFullDemoFindIntakeEmail_() {
  var query = 'subject:"' + H38_FULL_DEMO_INTAKE_SUBJECT.replace(/"/g, '') + '" newer_than:14d';
  var threads = GmailApp.search(query, 0, 10);
  if (!threads.length) return { found: false, query: query };
  var thread = threads[0];
  var messages = thread.getMessages();
  var message = messages[messages.length - 1];
  return {
    found: true,
    query: query,
    threadId: thread.getId(),
    messageId: message.getId(),
    from: message.getFrom(),
    to: message.getTo(),
    subject: message.getSubject(),
    receivedTime: Utilities.formatDate(message.getDate(), boTimeZone_(), 'yyyy-MM-dd HH:mm:ss')
  };
}

function boFullDemoRunAgent_(agentKey, request, context) {
  var activityId = H38_FULL_DEMO_MARKER + '-AGENT-' + agentKey.toUpperCase();
  var existing = boFullDemoFind_(H38_BO_SHEETS.ACTIVITY, activityId);
  if (existing && existing.Status === 'Complete Demo') {
    return { agentKey: agentKey, status: 'PASS', duplicatePrevented: true, activityId: activityId };
  }
  var result = boAiRunSpecialist_(agentKey, request, context || {});
  boAssert_(result && result.kind !== 'takeover', 'Demo agent ' + agentKey + ' stopped for owner takeover: ' + JSON.stringify(result || {}));
  boFullDemoUpsert_(H38_BO_SHEETS.ACTIVITY, activityId, {
    'Activity Type': 'H38 Agent Demo Run',
    'Record Type': context && context.recordType || 'System',
    'Record ID': context && context.recordId || H38_FULL_DEMO_MARKER,
    Status: 'Complete Demo',
    Summary: agentKey + ' completed controlled hypothetical',
    Details: JSON.stringify({ request: request, context: context || {}, result: result }),
    'Created By': boGetCurrentUser_()['User ID'],
    'Created Time': boNow_()
  }, 'Full approved demo agent run');
  return { agentKey: agentKey, status: 'PASS', duplicatePrevented: false, activityId: activityId, result: result };
}

function boFullDemoSendApprovedEmail_(suffix, to, subject, body, context) {
  var activityId = H38_FULL_DEMO_MARKER + '-EMAIL-' + suffix;
  var existing = boFullDemoFind_(H38_BO_SHEETS.ACTIVITY, activityId);
  if (existing && existing.Status === 'Sent Demo') {
    return { status: 'PASS', sent: true, duplicatePrevented: true, to: to, subject: subject, activityId: activityId };
  }
  boAssert_([H38_FULL_DEMO_OWNER_EMAIL, H38_FULL_DEMO_BUSINESS_EMAIL].indexOf(String(to).toLowerCase()) >= 0, 'Full demo email recipient is outside the approved internal addresses.');
  var prepared = boAiPrepareAction_({ actionId: 'email.send', arguments: { to: to, subject: subject, body: body }, context: context || { module: 'demo', recordType: 'System', recordId: H38_FULL_DEMO_MARKER } });
  var completed = boAiConfirmAction_({ actionToken: prepared.actionToken, confirmation: prepared.confirmation });
  boFullDemoUpsert_(H38_BO_SHEETS.ACTIVITY, activityId, {
    'Activity Type': 'Approved Internal Demo Email',
    'Record Type': context && context.recordType || 'System',
    'Record ID': context && context.recordId || H38_FULL_DEMO_MARKER,
    Status: 'Sent Demo',
    Summary: subject,
    Details: JSON.stringify({ to: to, subject: subject, completed: completed, ownerApproved: true, internalOnly: true }),
    'Created By': boGetCurrentUser_()['User ID'],
    'Created Time': boNow_()
  }, 'Full approved demo email proof');
  return { status: 'PASS', sent: true, duplicatePrevented: false, to: to, subject: subject, activityId: activityId, completed: completed };
}

function boFullDemoProjectContext_(projectKey) {
  var project = boUnifiedDemoProjects_().find(function (item) { return item.key === projectKey; });
  boAssert_(project, 'Unknown full demo project key: ' + projectKey);
  return {
    project: project,
    projectId: boUnifiedDemoId_(project, 'PROJECT'),
    requestId: boUnifiedDemoId_(project, 'REQUEST'),
    customerId: boUnifiedDemoId_(project, 'CUSTOMER'),
    quoteId: boUnifiedDemoId_(project, 'QUOTE'),
    jobId: boUnifiedDemoId_(project, 'JOB'),
    invoiceId: boUnifiedDemoId_(project, 'INVOICE')
  };
}

function boRunFullApprovedBusinessOfficeDemo() {
  return boSafeExecute_('Run full approved Business Office demo', function () {
    var owner = boRequireOwner_();
    boAssert_(boFullDemoText_(owner.Email).toLowerCase() === H38_FULL_DEMO_OWNER_EMAIL, 'This controlled demo is authorized only for Rick Krueth.');

    var completion = boFullDemoFind_(H38_BO_SHEETS.ACTIVITY, H38_FULL_DEMO_MARKER + '-COMPLETE');
    if (completion && completion.Status === 'Complete Demo') {
      return { status: 'PASS', marker: H38_FULL_DEMO_MARKER, alreadyComplete: true, projectCount: 7, agentCount: 8, approvedEmailCount: 8, approvedRecipients: [H38_FULL_DEMO_BUSINESS_EMAIL, H38_FULL_DEMO_OWNER_EMAIL], financialExternalActions: false, moneyMoved: false, payrollFunded: false, taxesFiled: false };
    }

    boAiSetAutomationMode_('automatic');
    var intakeEmail = boFullDemoFindIntakeEmail_();
    boAssert_(intakeEmail.found, 'The controlled intake email was not found in the authorized Gmail account.');

    var masterCustomerId = H38_FULL_DEMO_MARKER + '-CUSTOMER';
    var masterRequestId = H38_FULL_DEMO_MARKER + '-REQUEST';
    boFullDemoUpsert_(H38_BO_SHEETS.CUSTOMERS, masterCustomerId, {
      'Customer Number': 'DEMO-H38-001',
      'Display Name': 'Highway 38 Solutions Internal Demo',
      Name: 'Highway 38 Solutions Internal Demo',
      Email: H38_FULL_DEMO_BUSINESS_EMAIL,
      Phone: '218-555-0138',
      'Customer Type': 'Controlled Internal Demo',
      Status: 'Active Demo',
      'Attention Status': 'None'
    }, 'Full approved demo customer');
    boFullDemoUpsert_(H38_BO_SHEETS.CONTACTS, H38_FULL_DEMO_MARKER + '-CONTACT', {
      'Customer ID': masterCustomerId,
      Name: 'Highway 38 Solutions Demo Contact',
      Email: H38_FULL_DEMO_BUSINESS_EMAIL,
      Phone: '218-555-0138',
      Status: 'Active Demo'
    }, 'Full approved demo contact');
    boFullDemoUpsert_(H38_BO_SHEETS.REQUESTS, masterRequestId, {
      'Customer ID': masterCustomerId,
      'Received Time': intakeEmail.receivedTime,
      Source: 'Email',
      Status: 'Qualified Demo',
      'Approval Status': 'Owner Approved',
      Name: 'Highway 38 Solutions Internal Demo',
      Email: H38_FULL_DEMO_BUSINESS_EMAIL,
      Phone: '218-555-0138',
      'Desired Outcome': 'Run seven complete hypothetical projects through every Business Office stage and all eight H38 agents.',
      'Next Action': 'Execute complete approved demo',
      Description: 'Deck, irrigation, flower garden, driveway, pond, lot clearing, and kitchen remodel controlled hypotheticals.',
      'Email Thread ID': intakeEmail.threadId,
      'Email Message ID': intakeEmail.messageId
    }, 'Full approved demo intake request');

    var seed = boSeedUnifiedSevenDemoSystem();
    boAssert_(seed && seed.status === 'PASS' && seed.projectCount === 7, 'Seven-project Business Office demo seeding failed.');

    var deck = boFullDemoProjectContext_('DECK');
    var irrigation = boFullDemoProjectContext_('IRR');
    var kitchen = boFullDemoProjectContext_('KIT');
    var flower = boFullDemoProjectContext_('FLOWER');
    var agents = [];
    agents.push(boFullDemoRunAgent_('intake_requirements', 'Build a complete intake from the controlled email. Customer, sender, seven requested project types, internal-only approval, and external-action boundaries are verified. Produce a complete handoff without inventing facts.', { module: 'requests', screen: 'Full Business Office Demo', task: 'Complete controlled intake', recordType: 'Request', recordId: masterRequestId, recordSummary: JSON.stringify({ intakeEmail: intakeEmail, customerId: masterCustomerId, projectCount: 7 }) }));
    agents.push(boFullDemoRunAgent_('quote_architect', 'Organize the seven approved hypothetical projects into clear standalone quote structures with phases, options, approvals, and handoffs. Use the existing seeded project records and do not create new customer commitments.', { module: 'quotes', screen: 'Full Business Office Demo', task: 'Architect demo quote system', recordType: 'Quote', recordId: deck.quoteId, recordSummary: JSON.stringify(seed.projects) }));
    agents.push(boFullDemoRunAgent_('measurement_quantity', 'Verify the deck demonstration quantities using the supplied 8 × 12 deck dimensions, six frost-depth footings, and seeded scope. Mark all unverified field conditions for field confirmation; do not infer hidden dimensions.', { module: 'quotes', screen: 'Full Business Office Demo', task: 'Verify measurements and quantities', recordType: 'Quote', recordId: deck.quoteId, recordSummary: JSON.stringify(deck.project) }));
    agents.push(boFullDemoRunAgent_('pricing_costing', 'Review the four-zone irrigation demonstration pricing against the seeded line items and approved total. Preserve source, cost, margin, allowances, and warnings; do not override the approved demonstration total.', { module: 'quotes', screen: 'Full Business Office Demo', task: 'Review pricing and costing', recordType: 'Quote', recordId: irrigation.quoteId, recordSummary: JSON.stringify(irrigation.project) }));
    agents.push(boFullDemoRunAgent_('scope_instruction', 'Create aligned customer scope and protected internal instructions for the kitchen remodel demonstration using only the seeded scope and task sequence. Keep permits, licensed trades, concealed conditions, and change conditions explicit.', { module: 'jobs', screen: 'Full Business Office Demo', task: 'Prepare scope and instructions', recordType: 'Job', recordId: kitchen.jobId, recordSummary: JSON.stringify(kitchen.project) }));
    agents.push(boFullDemoRunAgent_('drawing', 'Prepare the drawing classification and revision plan for the 8 × 12 deck demonstration. Classify it as estimating and field-layout support unless permit or licensed review is separately verified. Do not represent it as an approved permit drawing.', { module: 'documents', screen: 'Full Business Office Demo', task: 'Prepare drawing plan', recordType: 'Project', recordId: deck.projectId, recordSummary: JSON.stringify(deck.project) }));
    agents.push(boFullDemoRunAgent_('quote_review', 'Perform final completeness, consistency, math, scope, revision, risk, and customer-readiness review for the flower garden demonstration. This is an internal approved demo and the only email recipient is highway38solutions@gmail.com.', { module: 'quotes', screen: 'Full Business Office Demo', task: 'Final quote review', recordType: 'Quote', recordId: flower.quoteId, recordSummary: JSON.stringify(flower.project) }));
    agents.push(boFullDemoRunAgent_('business_setup', 'Review the seven-project demonstration as reusable Business Office setup knowledge. Recommend price-book, template, question, approval-rule, and operating-default improvements without activating pricing or authority changes.', { module: 'setup', screen: 'Full Business Office Demo', task: 'Review reusable setup', recordType: 'System', recordId: H38_FULL_DEMO_MARKER, recordSummary: JSON.stringify({ projects: seed.projects, agents: boAiAgentCatalogForClient_() }) }));

    var emails = [];
    seed.projects.forEach(function (projectResult, index) {
      var project = boUnifiedDemoProjects_()[index];
      var body = [
        'CONTROLLED INTERNAL BUSINESS OFFICE DEMO',
        '',
        'Project: ' + project.title,
        'Project ID: ' + projectResult.projectId,
        'Quote ID: ' + projectResult.quoteId,
        'Job ID: ' + projectResult.jobId,
        'Invoice ID: ' + projectResult.invoiceId,
        'Approved demonstration total: $' + Number(project.total).toFixed(2),
        'Status: Completed Demo',
        'Project folder: ' + projectResult.folderUrl,
        '',
        'This email was prepared, owner-approved, and sent through the Business Office AI action engine.',
        'No real customer commitment, purchase, payment movement, payroll funding, tax filing, permit booking, inspection booking, or public publishing occurred.',
        '',
        'Marker: ' + H38_FULL_DEMO_MARKER
      ].join('\n');
      emails.push(boFullDemoSendApprovedEmail_(project.key, H38_FULL_DEMO_BUSINESS_EMAIL, 'H38 BUSINESS OFFICE DEMO — ' + project.title + ' — APPROVED INTERNAL TEST', body, { module: 'quotes', recordType: 'Quote', recordId: projectResult.quoteId }));
    });

    var total = boUnifiedDemoProjects_().reduce(function (sum, project) { return sum + Number(project.total || 0); }, 0);
    var ownerBody = [
      'H38 FULL BUSINESS OFFICE DEMO COMPLETE',
      '',
      'Marker: ' + H38_FULL_DEMO_MARKER,
      'Controlled intake email: verified',
      'Hypothetical projects completed: 7',
      'H38 specialist agents completed: 8',
      'Approved internal project emails sent to ' + H38_FULL_DEMO_BUSINESS_EMAIL + ': 7',
      'Combined hypothetical project value: $' + total.toFixed(2),
      '',
      'Records include requests, customers, contacts, addresses, quotes, quote lines, approvals, jobs, work orders, vendors, purchase orders, expenses, invoices, payments, time, documents, proof, activity, error, backup, payroll-preparation boundaries, and tax-preparation boundaries.',
      '',
      'No real money moved. No payroll was funded. No taxes were filed. No supplier order, permit, inspection, scheduling commitment, customer promise, or public publication occurred.',
      '',
      'Seven-project output root: ' + seed.rootFolderUrl
    ].join('\n');
    emails.push(boFullDemoSendApprovedEmail_('OWNER-SUMMARY', H38_FULL_DEMO_OWNER_EMAIL, 'H38 FULL BUSINESS OFFICE DEMO — COMPLETE AND APPROVED', ownerBody, { module: 'dashboard', recordType: 'System', recordId: H38_FULL_DEMO_MARKER }));

    boFullDemoUpsert_(H38_BO_SHEETS.APPROVALS, H38_FULL_DEMO_MARKER + '-MASTER-APPROVAL', {
      'Record Type': 'System',
      'Record ID': H38_FULL_DEMO_MARKER,
      'Approval Type': 'Full internal demonstration and approved email delivery',
      'Required Role': 'Owner',
      Status: 'Complete',
      Decision: 'Approved',
      'Decision By': owner['User ID'],
      'Decision Time': boNow_(),
      'Allowed Flag': 'Yes',
      Notes: 'Rick approved the full controlled run and internal emails between ' + H38_FULL_DEMO_OWNER_EMAIL + ' and ' + H38_FULL_DEMO_BUSINESS_EMAIL + '.'
    }, 'Full approved demo master approval');

    boFullDemoActivity_('COMPLETE', {
      Status: 'Complete Demo',
      Summary: 'Seven projects, eight agents, and eight approved internal emails completed.',
      Details: JSON.stringify({ intakeEmail: intakeEmail, seed: seed, agents: agents.map(function (item) { return { agentKey: item.agentKey, status: item.status, duplicatePrevented: item.duplicatePrevented }; }), emails: emails.map(function (item) { return { to: item.to, subject: item.subject, duplicatePrevented: item.duplicatePrevented }; }) })
    });
    boProof_('FULL APPROVED BUSINESS OFFICE DEMO', 'System', H38_FULL_DEMO_MARKER, 'PASS', '7 projects; 8 agents; 8 approved internal emails; no financial external action.', owner.Email);

    return {
      status: 'PASS',
      marker: H38_FULL_DEMO_MARKER,
      alreadyComplete: false,
      projectCount: seed.projectCount,
      agentCount: agents.length,
      approvedEmailCount: emails.length,
      approvedRecipients: [H38_FULL_DEMO_BUSINESS_EMAIL, H38_FULL_DEMO_OWNER_EMAIL],
      rootFolderId: seed.rootFolderId,
      rootFolderUrl: seed.rootFolderUrl,
      totalHypotheticalValue: total,
      financialExternalActions: false,
      moneyMoved: false,
      payrollFunded: false,
      taxesFiled: false,
      supplierOrdersTransmitted: false,
      publicPublishingPerformed: false
    };
  }, 'System', H38_FULL_DEMO_MARKER);
}
