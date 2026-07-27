/** Business Office — resumable phases for the controlled full approved demonstration. */

function boFullDemoApproveTakeover_(takeover, agentKey) {
  if (!takeover || !takeover.taskId || typeof h38TmFind_ !== 'function' || typeof h38TmUpdate_ !== 'function') return '';
  try {
    var owner = boRequireOwner_();
    var task = h38TmFind_('TASKS', takeover.taskId);
    var notes = boAiJson_(task.Notes, {});
    notes.ownerAnswer = 'Approved for this controlled internal demonstration only. Continue with supplied facts, keep missing field verification as a warning, and make no external commitment.';
    notes.resolvedBy = owner.Email;
    notes.resolvedTime = h38TmNow_();
    notes.demoMarker = H38_FULL_DEMO_MARKER;
    h38TmUpdate_('TASKS', takeover.taskId, {
      Status: 'Completed',
      'Completed Time': h38TmNow_(),
      Notes: JSON.stringify(notes),
      'Blocking Issue': '',
      'Waiting Reason': ''
    });
    boProof_('H38 DEMO TAKEOVER APPROVED', 'Task', takeover.taskId, 'PASS', agentKey + ' controlled-demo approval', owner.Email);
    return takeover.taskId;
  } catch (error) {
    return '';
  }
}

function boFullDemoRunApprovedAgent_(agentKey, request, context) {
  var activityId = H38_FULL_DEMO_MARKER + '-AGENT-' + String(agentKey).toUpperCase();
  var existing = boFullDemoFind_(H38_BO_SHEETS.ACTIVITY, activityId);
  if (existing && existing.Status === 'Complete Demo') {
    return { agentKey: agentKey, status: 'PASS', duplicatePrevented: true, activityId: activityId };
  }
  var result = boAiRunSpecialist_(agentKey, request, context || {});
  var takeoverTaskId = result && result.kind === 'takeover' ? boFullDemoApproveTakeover_(result.takeover, agentKey) : '';
  boFullDemoUpsert_(H38_BO_SHEETS.ACTIVITY, activityId, {
    'Activity Type': 'H38 Agent Demo Run',
    'Record Type': context && context.recordType || 'System',
    'Record ID': context && context.recordId || H38_FULL_DEMO_MARKER,
    Status: 'Complete Demo',
    Summary: agentKey + ' completed controlled hypothetical',
    Details: JSON.stringify({
      request: request,
      context: context || {},
      result: result,
      ownerTakeoverApproved: !!takeoverTaskId,
      takeoverTaskId: takeoverTaskId,
      approvalBoundary: 'Internal demonstration only; no external commitment.'
    }),
    'Created By': boGetCurrentUser_()['User ID'],
    'Created Time': boNow_()
  }, 'Full approved demo agent run');
  return {
    agentKey: agentKey,
    status: 'PASS',
    duplicatePrevented: false,
    activityId: activityId,
    ownerTakeoverApproved: !!takeoverTaskId,
    takeoverTaskId: takeoverTaskId
  };
}

function boFullDemoMasterRecords_(intakeEmail) {
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
  return { customerId: masterCustomerId, requestId: masterRequestId };
}

function boPrepareFullApprovedBusinessOfficeDemo() {
  return boSafeExecute_('Prepare full approved Business Office demo', function () {
    var owner = boRequireOwner_();
    boAssert_(boFullDemoText_(owner.Email).toLowerCase() === H38_FULL_DEMO_OWNER_EMAIL, 'This controlled demo is authorized only for Rick Krueth.');
    var completed = boFullDemoFind_(H38_BO_SHEETS.ACTIVITY, H38_FULL_DEMO_MARKER + '-COMPLETE');
    if (completed && completed.Status === 'Complete Demo') {
      return { status: 'PASS', marker: H38_FULL_DEMO_MARKER, alreadyComplete: true, projectCount: 7 };
    }
    boAiSetAutomationMode_('automatic');
    var intakeEmail = boFullDemoFindIntakeEmail_();
    boAssert_(intakeEmail.found, 'The controlled intake email was not found in the authorized Gmail account.');
    var master = boFullDemoMasterRecords_(intakeEmail);
    var seed = boSeedUnifiedSevenDemoSystem();
    boAssert_(seed && seed.status === 'PASS' && seed.projectCount === 7, 'Seven-project Business Office demo seeding failed.');
    boFullDemoActivity_('PREPARED', {
      Status: 'Complete Demo',
      Summary: 'Controlled intake verified and seven hypothetical projects prepared.',
      Details: JSON.stringify({ intakeEmail: intakeEmail, master: master, seed: seed })
    });
    return {
      status: 'PASS',
      marker: H38_FULL_DEMO_MARKER,
      alreadyComplete: false,
      intakeVerified: true,
      projectCount: seed.projectCount,
      rootFolderId: seed.rootFolderId,
      rootFolderUrl: seed.rootFolderUrl,
      externalActionsPerformed: false
    };
  }, 'System', H38_FULL_DEMO_MARKER);
}

function boFullDemoAgentSpecs_() {
  var deck = boFullDemoProjectContext_('DECK');
  var irrigation = boFullDemoProjectContext_('IRR');
  var kitchen = boFullDemoProjectContext_('KIT');
  var flower = boFullDemoProjectContext_('FLOWER');
  var masterRequestId = H38_FULL_DEMO_MARKER + '-REQUEST';
  return [
    {
      key: 'intake_requirements',
      request: 'Build a complete intake from the controlled email. Customer, sender, seven requested project types, internal-only approval, and external-action boundaries are verified. Produce a complete handoff without inventing facts. Any field verification remains a warning, not an external commitment.',
      context: { module: 'requests', screen: 'Full Business Office Demo', task: 'Complete controlled intake', recordType: 'Request', recordId: masterRequestId, recordSummary: JSON.stringify({ customerId: H38_FULL_DEMO_MARKER + '-CUSTOMER', projectCount: 7, ownerApproval: 'Complete internal demo approved' }) }
    },
    {
      key: 'quote_architect',
      request: 'Organize the seven approved hypothetical projects into clear standalone quote structures with phases, options, approvals, and handoffs. Use the seeded project records and make no external customer commitment.',
      context: { module: 'quotes', screen: 'Full Business Office Demo', task: 'Architect demo quote system', recordType: 'Quote', recordId: deck.quoteId, recordSummary: JSON.stringify(boUnifiedDemoProjects_()) }
    },
    {
      key: 'measurement_quantity',
      request: 'Verify the deck demonstration quantities using the supplied 8 by 12 deck dimensions, six frost-depth footings, and seeded scope. Mark unverified field conditions for confirmation; do not infer hidden dimensions. The Owner approves completion of the internal analysis with those warnings.',
      context: { module: 'quotes', screen: 'Full Business Office Demo', task: 'Verify measurements and quantities', recordType: 'Quote', recordId: deck.quoteId, recordSummary: JSON.stringify(deck.project) }
    },
    {
      key: 'pricing_costing',
      request: 'Review the four-zone irrigation demonstration pricing against the seeded line items and approved demonstration total. Preserve source, cost, margin, allowances, and warnings; do not override the approved demonstration total.',
      context: { module: 'quotes', screen: 'Full Business Office Demo', task: 'Review pricing and costing', recordType: 'Quote', recordId: irrigation.quoteId, recordSummary: JSON.stringify(irrigation.project) }
    },
    {
      key: 'scope_instruction',
      request: 'Create aligned customer scope and protected internal instructions for the kitchen remodel demonstration using only the seeded scope and task sequence. Keep permits, licensed trades, concealed conditions, and change conditions explicit. This is internal demonstration preparation only.',
      context: { module: 'jobs', screen: 'Full Business Office Demo', task: 'Prepare scope and instructions', recordType: 'Job', recordId: kitchen.jobId, recordSummary: JSON.stringify(kitchen.project) }
    },
    {
      key: 'drawing',
      request: 'Prepare the drawing classification and revision plan for the 8 by 12 deck demonstration. Classify it as estimating and field-layout support unless permit or licensed review is separately verified. Do not represent it as an approved permit drawing.',
      context: { module: 'documents', screen: 'Full Business Office Demo', task: 'Prepare drawing plan', recordType: 'Project', recordId: deck.projectId, recordSummary: JSON.stringify(deck.project) }
    },
    {
      key: 'quote_review',
      request: 'Perform final completeness, consistency, math, scope, revision, risk, and customer-readiness review for the flower garden demonstration. This is an approved internal demo; the only recipient is highway38solutions@gmail.com. Preserve warnings but do not invent missing facts.',
      context: { module: 'quotes', screen: 'Full Business Office Demo', task: 'Final quote review', recordType: 'Quote', recordId: flower.quoteId, recordSummary: JSON.stringify(flower.project) }
    },
    {
      key: 'business_setup',
      request: 'Review the seven-project demonstration as reusable Business Office setup knowledge. Recommend price-book, template, question, approval-rule, and operating-default improvements without activating pricing or authority changes.',
      context: { module: 'setup', screen: 'Full Business Office Demo', task: 'Review reusable setup', recordType: 'System', recordId: H38_FULL_DEMO_MARKER, recordSummary: JSON.stringify({ projects: boUnifiedDemoProjects_(), agents: boAiAgentCatalogForClient_() }) }
    }
  ];
}

function boRunFullApprovedBusinessOfficeDemoAgentBatch(start, limit) {
  return boSafeExecute_('Run full approved demo agent batch', function () {
    boRequireOwner_();
    start = Math.max(0, Number(start) || 0);
    limit = Math.max(1, Math.min(Number(limit) || 2, 3));
    var specs = boFullDemoAgentSpecs_();
    var results = specs.slice(start, start + limit).map(function (spec) {
      return boFullDemoRunApprovedAgent_(spec.key, spec.request, spec.context);
    });
    return {
      status: 'PASS',
      marker: H38_FULL_DEMO_MARKER,
      start: start,
      processed: results.length,
      totalAgents: specs.length,
      completedAgentCount: boFullDemoCompletedAgentCount_(),
      results: results
    };
  }, 'System', H38_FULL_DEMO_MARKER);
}

function boFullDemoCompletedAgentCount_() {
  return boFullDemoAgentSpecs_().filter(function (spec) {
    var row = boFullDemoFind_(H38_BO_SHEETS.ACTIVITY, H38_FULL_DEMO_MARKER + '-AGENT-' + spec.key.toUpperCase());
    return row && row.Status === 'Complete Demo';
  }).length;
}

function boFullDemoProjectEmailSpec_(project) {
  var context = boFullDemoProjectContext_(project.key);
  var folder = boUnifiedDemoProjectFolder_(boUnifiedDemoRoot_(), project);
  var subject = 'H38 BUSINESS OFFICE DEMO — ' + project.title + ' — APPROVED INTERNAL TEST';
  var body = [
    'CONTROLLED INTERNAL BUSINESS OFFICE DEMO',
    '',
    'Project: ' + project.title,
    'Project ID: ' + context.projectId,
    'Quote ID: ' + context.quoteId,
    'Job ID: ' + context.jobId,
    'Invoice ID: ' + context.invoiceId,
    'Approved demonstration total: $' + Number(project.total).toFixed(2),
    'Status: Completed Demo',
    'Project folder: ' + folder.getUrl(),
    '',
    'This email was prepared, owner-approved, and sent through the Business Office AI action engine.',
    'No real customer commitment, purchase, payment movement, payroll funding, tax filing, permit booking, inspection booking, supplier order, or public publishing occurred.',
    '',
    'Marker: ' + H38_FULL_DEMO_MARKER
  ].join('\n');
  return { suffix: project.key, to: H38_FULL_DEMO_BUSINESS_EMAIL, subject: subject, body: body, context: { module: 'quotes', recordType: 'Quote', recordId: context.quoteId } };
}

function boFullDemoEmailSpecs_() {
  var specs = boUnifiedDemoProjects_().map(boFullDemoProjectEmailSpec_);
  var total = boUnifiedDemoProjects_().reduce(function (sum, project) { return sum + Number(project.total || 0); }, 0);
  var root = boUnifiedDemoRoot_();
  specs.push({
    suffix: 'OWNER-SUMMARY',
    to: H38_FULL_DEMO_OWNER_EMAIL,
    subject: 'H38 FULL BUSINESS OFFICE DEMO — COMPLETE AND APPROVED',
    body: [
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
      'Seven-project output root: ' + root.getUrl()
    ].join('\n'),
    context: { module: 'dashboard', recordType: 'System', recordId: H38_FULL_DEMO_MARKER }
  });
  return specs;
}

function boFullDemoSentEmailCount_() {
  return boFullDemoEmailSpecs_().filter(function (spec) {
    var row = boFullDemoFind_(H38_BO_SHEETS.ACTIVITY, H38_FULL_DEMO_MARKER + '-EMAIL-' + spec.suffix);
    return row && row.Status === 'Sent Demo';
  }).length;
}

function boRunFullApprovedBusinessOfficeDemoEmailBatch(start, limit) {
  return boSafeExecute_('Run full approved demo email batch', function () {
    boRequireOwner_();
    start = Math.max(0, Number(start) || 0);
    limit = Math.max(1, Math.min(Number(limit) || 2, 3));
    var specs = boFullDemoEmailSpecs_();
    var results = specs.slice(start, start + limit).map(function (spec) {
      if (spec.suffix === 'OWNER-SUMMARY') {
        boAssert_(boFullDemoCompletedAgentCount_() === 8, 'All eight H38 agents must complete before the owner summary is sent.');
        boAssert_(boFullDemoSentEmailCount_() >= 7, 'All seven project emails must be sent before the owner summary.');
      }
      return boFullDemoSendApprovedEmail_(spec.suffix, spec.to, spec.subject, spec.body, spec.context);
    });
    return {
      status: 'PASS',
      marker: H38_FULL_DEMO_MARKER,
      start: start,
      processed: results.length,
      totalEmails: specs.length,
      sentEmailCount: boFullDemoSentEmailCount_(),
      results: results
    };
  }, 'System', H38_FULL_DEMO_MARKER);
}

function boFinalizeFullApprovedBusinessOfficeDemo() {
  return boSafeExecute_('Finalize full approved Business Office demo', function () {
    var owner = boRequireOwner_();
    var agentCount = boFullDemoCompletedAgentCount_();
    var emailCount = boFullDemoSentEmailCount_();
    boAssert_(agentCount === 8, 'All eight H38 agent demonstrations must be complete.');
    boAssert_(emailCount === 8, 'All eight approved internal demo emails must be complete.');
    var total = boUnifiedDemoProjects_().reduce(function (sum, project) { return sum + Number(project.total || 0); }, 0);
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
      Details: JSON.stringify({ projectCount: 7, agentCount: agentCount, approvedEmailCount: emailCount, totalHypotheticalValue: total })
    });
    boProof_('FULL APPROVED BUSINESS OFFICE DEMO', 'System', H38_FULL_DEMO_MARKER, 'PASS', '7 projects; 8 agents; 8 approved internal emails; no financial external action.', owner.Email);
    return {
      status: 'PASS',
      marker: H38_FULL_DEMO_MARKER,
      alreadyComplete: false,
      projectCount: 7,
      agentCount: agentCount,
      approvedEmailCount: emailCount,
      approvedRecipients: [H38_FULL_DEMO_BUSINESS_EMAIL, H38_FULL_DEMO_OWNER_EMAIL],
      rootFolderId: boUnifiedDemoRoot_().getId(),
      rootFolderUrl: boUnifiedDemoRoot_().getUrl(),
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

function boGetFullApprovedBusinessOfficeDemoStatus() {
  boRequireOwner_();
  var complete = boFullDemoFind_(H38_BO_SHEETS.ACTIVITY, H38_FULL_DEMO_MARKER + '-COMPLETE');
  return {
    status: complete && complete.Status === 'Complete Demo' ? 'PASS' : 'IN_PROGRESS',
    marker: H38_FULL_DEMO_MARKER,
    projectCount: boUnifiedDemoProjects_().filter(function (project) { return !!boFullDemoFind_(H38_BO_SHEETS.QUOTES, boUnifiedDemoId_(project, 'QUOTE')); }).length,
    agentCount: boFullDemoCompletedAgentCount_(),
    approvedEmailCount: boFullDemoSentEmailCount_(),
    complete: !!(complete && complete.Status === 'Complete Demo')
  };
}
