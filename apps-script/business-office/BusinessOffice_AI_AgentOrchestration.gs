/** H38 AI agent orchestration — specialist routing, automatic backend progress, owner takeover blocks, and natural owner-command authorization. */
var H38_AI_AGENT_SYSTEM_VERSION = '2026-07-26-agent-orchestration-v1';
var H38_AI_AUTOMATION_MODE_PROPERTY = 'H38_AI_AUTOMATION_MODE';
var H38_AI_AUTOMATION_TRIGGER_HANDLER = 'boAiAutomationScheduledRun';

function boAiAgentCatalog_() {
  return [
    {
      key: 'intake_requirements',
      name: 'Intake and Requirements Agent',
      purpose: 'Turn requests, emails, texts, photos, notes, and conversations into a complete project intake without inventing facts.',
      owns: ['customer identity', 'site and project context', 'requested outcome', 'constraints', 'missing questions', 'source references'],
      inputs: ['Requests', 'Customers', 'Messages', 'Email', 'Documents', 'Photos', 'Quotes'],
      outputs: ['intake summary', 'known facts', 'missing facts', 'customer questions', 'recommended quote level', 'handoff package'],
      stopWhen: ['customer intent is unclear', 'site or contact cannot be identified', 'a promise or commitment is required'],
      handoffTo: ['quote_architect', 'measurement_quantity', 'business_setup']
    },
    {
      key: 'quote_architect',
      name: 'Quote Architect Agent',
      purpose: 'Choose the correct quote structure and organize one project into the right areas, phases, trades, options, alternates, and approvals.',
      owns: ['quote level', 'project structure', 'subquotes', 'options', 'allowances', 'milestones', 'dependencies'],
      inputs: ['Intake', 'Customers', 'Quotes', 'Quote Lines', 'Documents', 'Approvals'],
      outputs: ['quote architecture', 'section plan', 'subquote plan', 'pricing handoffs', 'review sequence'],
      stopWhen: ['scope boundaries conflict', 'the requested commitment exceeds approved business rules', 'the customer must choose an option'],
      handoffTo: ['measurement_quantity', 'pricing_costing', 'scope_instruction', 'drawing']
    },
    {
      key: 'measurement_quantity',
      name: 'Measurement and Quantity Agent',
      purpose: 'Convert verified dimensions and source evidence into traceable quantities and calculations.',
      owns: ['measurement register', 'quantity sources', 'formulas', 'waste inputs', 'confidence', 'verification flags'],
      inputs: ['Photos', 'Documents', 'Drawings', 'Measurements', 'Quotes', 'Quote Lines'],
      outputs: ['verified quantities', 'calculation records', 'measurement questions', 'confidence and warnings'],
      stopWhen: ['a required dimension has no reliable source', 'photo scale is unsafe', 'field verification is required'],
      handoffTo: ['pricing_costing', 'scope_instruction', 'drawing']
    },
    {
      key: 'pricing_costing',
      name: 'Pricing and Costing Agent',
      purpose: 'Apply approved price-book records and deterministic methods while preserving cost, margin, source, and override controls.',
      owns: ['pricing method', 'approved rates', 'cost basis', 'markup', 'margin', 'minimum charges', 'allowances', 'warnings'],
      inputs: ['Price Book', 'Quote Lines', 'Measurements', 'Vendor Bids', 'Labor and Equipment Rates'],
      outputs: ['calculated line prices', 'cost and margin review', 'missing-rate block', 'authorized override request'],
      stopWhen: ['an official rate is missing', 'margin falls outside approved rules', 'a manual override requires authorization'],
      handoffTo: ['scope_instruction', 'quote_review']
    },
    {
      key: 'scope_instruction',
      name: 'Scope and Instruction Agent',
      purpose: 'Write clear customer scope and protected internal work instructions from the same approved project facts.',
      owns: ['included work', 'exclusions', 'assumptions', 'internal instructions', 'quality checks', 'evidence', 'completion criteria'],
      inputs: ['Intake', 'Quote Architecture', 'Measurements', 'Pricing', 'Documents', 'Work Orders'],
      outputs: ['customer scope', 'internal instructions', 'quality and proof requirements', 'change conditions'],
      stopWhen: ['a scope decision changes price or schedule', 'licensed or professional review is required', 'the owner must choose a business position'],
      handoffTo: ['drawing', 'quote_review']
    },
    {
      key: 'drawing',
      name: 'Drawing Agent',
      purpose: 'Prepare and classify concept, estimating, field-layout, bidding, construction, permit, and approved-final drawing work without overstating authority.',
      owns: ['drawing register', 'classification', 'revision', 'scale', 'assumptions', 'quantity and scope impact', 'professional-review flag'],
      inputs: ['Photos', 'Measurements', 'Scope', 'Documents', 'Quotes'],
      outputs: ['drawing plan', 'classification', 'revision requirements', 'review warnings', 'quantity and scope impact'],
      stopWhen: ['a field measurement is missing', 'permit or licensed-professional review is required', 'a drawing change affects approved price or scope'],
      handoffTo: ['measurement_quantity', 'scope_instruction', 'quote_review']
    },
    {
      key: 'quote_review',
      name: 'Quote Review Agent',
      purpose: 'Perform the final completeness, consistency, commercial, risk, and customer-readiness review before owner approval or sending.',
      owns: ['scope gaps', 'math and source checks', 'revision consistency', 'customer clarity', 'approval readiness', 'send readiness'],
      inputs: ['Quote', 'Quote Lines', 'Measurements', 'Calculations', 'Scopes', 'Drawings', 'Documents', 'Approvals'],
      outputs: ['ready or blocked decision', 'blocking issues', 'recommended fixes', 'owner decision block', 'send recommendation'],
      stopWhen: ['any material fact is missing', 'the recipient or approved revision is uncertain', 'risk requires owner judgment'],
      handoffTo: ['intake_requirements', 'pricing_costing', 'scope_instruction', 'drawing']
    },
    {
      key: 'business_setup',
      name: 'Business Setup Agent',
      purpose: 'Turn approved business knowledge into reusable price books, templates, rules, questions, roles, and operating defaults.',
      owns: ['business profile', 'service catalog', 'price book', 'templates', 'approval rules', 'minimums', 'standard assumptions and exclusions'],
      inputs: ['Setup', 'Price Book', 'Templates', 'Documents', 'Actuals', 'Owner Decisions'],
      outputs: ['proposed setup changes', 'impact summary', 'activation checklist', 'optimization recommendations'],
      stopWhen: ['a rule changes pricing or authority', 'source evidence is missing', 'activation requires owner approval'],
      handoffTo: ['intake_requirements', 'pricing_costing', 'quote_review']
    }
  ];
}

function boAiAgentCatalogForClient_() {
  return boAiAgentCatalog_().map(function (agent) {
    return {
      key: agent.key,
      name: agent.name,
      purpose: agent.purpose,
      outputs: agent.outputs,
      stopWhen: agent.stopWhen,
      handoffTo: agent.handoffTo,
      mode: ['Automatic preparation', 'Owner command', 'Manual hold'],
      mayExecuteExternalActions: false
    };
  });
}

function boAiAutomationMode_() {
  var mode = String(boGetProperties_().getProperty(H38_AI_AUTOMATION_MODE_PROPERTY) || 'automatic').toLowerCase();
  return ['automatic', 'owner-command', 'manual-hold'].indexOf(mode) >= 0 ? mode : 'automatic';
}

function boAiSetAutomationMode_(mode) {
  boRequireOwner_();
  mode = String(mode || '').toLowerCase();
  boAssert_(['automatic', 'owner-command', 'manual-hold'].indexOf(mode) >= 0, 'Unsupported H38 automation mode.');
  boGetProperties_().setProperty(H38_AI_AUTOMATION_MODE_PROPERTY, mode);
  boProof_('H38 AI AUTOMATION MODE', 'System', boGetBusinessId_(), 'PASS', mode, Session.getActiveUser().getEmail());
  return { status: 'PASS', mode: mode };
}

function boAiAutomationBootstrap_() {
  var base = boAiBootstrap_();
  var takeovers = boAiTakeoverQueue_({ limit: 20, quiet: true });
  var provider = typeof h38TmProviderStatus_ === 'function' ? h38TmProviderStatus_() : { provider: 'unavailable' };
  return Object.assign({}, base, {
    orchestrationVersion: H38_AI_AGENT_SYSTEM_VERSION,
    agents: boAiAgentCatalogForClient_(),
    automation: {
      mode: boAiAutomationMode_(),
      ownerCommandExecutesWithoutSecondConfirmation: true,
      ambiguousCommandsCreateTakeoverBlocks: true,
      openTakeoverCount: takeovers.count || 0,
      scheduledTriggerInstalled: boAiAutomationTriggerInstalled_()
    },
    messaging: provider
  });
}

function boAiAgentByKey_(key) {
  return boAiAgentCatalog_().find(function (agent) { return agent.key === key; }) || null;
}

function boAiRouteAgentKey_(message, context) {
  var text = String(message || '').toLowerCase();
  var module = String(context && context.module || '').toLowerCase();
  if (/\b(intake|requirement|customer question|missing information|scope gather|request)\b/.test(text)) return 'intake_requirements';
  if (/\b(measure|measurement|dimension|quantity|takeoff|area|volume|linear feet|square feet)\b/.test(text)) return 'measurement_quantity';
  if (/\b(price|pricing|cost|margin|markup|rate|allowance|contingency)\b/.test(text)) return 'pricing_costing';
  if (/\b(drawing|layout|sketch|cad|revision|permit|field layout)\b/.test(text)) return 'drawing';
  if (/\b(scope|instruction|included|exclude|assumption|completion criteria|quality check)\b/.test(text)) return 'scope_instruction';
  if (/\b(review quote|check quote|ready to send|final review|scope gap)\b/.test(text)) return 'quote_review';
  if (/\b(setup|price book|template|business rule|standard operation)\b/.test(text)) return 'business_setup';
  if (/\b(quote structure|quote level|alternate|option|subquote|phase|trade)\b/.test(text) || module.indexOf('quote') >= 0) return 'quote_architect';
  return '';
}

function boAiRecordAgentRun_(agent, context, request, result) {
  try {
    if (typeof boUniversalStoreReady_ !== 'function' || typeof boUniversalAppend_ !== 'function' || !boUniversalStoreReady_()) return null;
    var user = boGetCurrentUser_();
    var record = boUniversalAppend_('AGENT_RUNS', {
      'Agent Run ID': boId_('AGENT'),
      'Project ID': context && context.recordType === 'Project' ? context.recordId : '',
      'Subquote ID': '',
      'Starting User': user.Email,
      'Agent Key': agent.key,
      'Agent Name': agent.name,
      'Source Records JSON': JSON.stringify({ recordType: context.recordType || '', recordId: context.recordId || '' }),
      'Inputs JSON': JSON.stringify({ request: request, context: context }),
      'Instructions Version': H38_AI_AGENT_SYSTEM_VERSION,
      'Knowledge Version': '',
      'Output JSON': JSON.stringify(result),
      Confidence: String(result.confidence == null ? '' : result.confidence),
      'Warnings JSON': JSON.stringify(result.warnings || []),
      'Proposed Actions JSON': JSON.stringify(result.proposedActions || []),
      'Approved Actions JSON': '[]',
      'Rejected Actions JSON': '[]',
      Model: PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || 'gpt-5-mini',
      'Usage JSON': '{}',
      'Approval Status': result.requiresOwner ? 'Owner Review Required' : 'Prepared',
      'Proof Reference': '',
      'Error Reference': '',
      Status: result.requiresOwner ? 'Waiting' : 'Prepared',
      'Created Time': boNow_(),
      'Is Voided': 'No'
    });
    return record['Agent Run ID'];
  } catch (error) {
    return null;
  }
}

function boAiRunSpecialist_(agentKey, request, context) {
  var agent = boAiAgentByKey_(agentKey);
  boAssert_(agent, 'Unknown H38 specialist agent.');
  context = boAiSafeContext_(context || {});
  var instructions = [
    'You are the ' + agent.name + ' inside Highway 38 Business Office.',
    agent.purpose,
    'Use only supplied records and context. Never invent customer facts, dimensions, prices, rates, recipients, dates, technical requirements, approvals, or commitments.',
    'Safe internal preparation may continue automatically. External communication, final approval, pricing overrides, commitments, and professional-review decisions require the Owner.',
    'Return ONLY one JSON object with this shape:',
    '{"summary":"text","completed":["text"],"missing":["text"],"recommendation":"text","requiresOwner":true,"ownerQuestion":"text","commands":["text"],"handoffTo":["agent_key"],"warnings":["text"],"proposedActions":[{"type":"text","description":"text"}],"confidence":0.0}',
    'Set requiresOwner true only when work cannot safely continue without a business decision, missing fact, commitment, or customer contact.',
    'Agent ownership: ' + JSON.stringify({ owns: agent.owns, inputs: agent.inputs, outputs: agent.outputs, stopWhen: agent.stopWhen, handoffTo: agent.handoffTo })
  ].join(' ');
  var response = boAiOpenAi_(instructions, JSON.stringify({ request: request, context: context }));
  var result = boAiParseJsonObject_(response.text) || {
    summary: response.text,
    completed: [],
    missing: [],
    recommendation: '',
    requiresOwner: false,
    ownerQuestion: '',
    commands: [],
    handoffTo: [],
    warnings: [],
    proposedActions: [],
    confidence: 0
  };
  result.agentKey = agent.key;
  result.agentName = agent.name;
  result.completed = Array.isArray(result.completed) ? result.completed : [];
  result.missing = Array.isArray(result.missing) ? result.missing : [];
  result.commands = Array.isArray(result.commands) ? result.commands : [];
  result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
  result.proposedActions = Array.isArray(result.proposedActions) ? result.proposedActions : [];
  result.handoffTo = Array.isArray(result.handoffTo) ? result.handoffTo : [];
  result.runId = boAiRecordAgentRun_(agent, context, request, result);
  boAiRecordEvent_({ type: 'agent_run', module: agent.key, outcome: result.requiresOwner ? 'owner_takeover' : 'prepared', durationMs: response.durationMs || 0 });
  if (result.requiresOwner) {
    var takeover = boAiCreateTakeoverBlock_({
      title: agent.name.replace(/ Agent$/, '') + ' decision needed',
      blocker: result.ownerQuestion || result.missing.join('; ') || 'Owner judgment is required.',
      completed: result.completed,
      needed: result.missing,
      recommendation: result.recommendation,
      commands: result.commands,
      agentKey: agent.key,
      linkedRecordType: context.recordType || '',
      linkedRecordId: context.recordId || '',
      priority: 'High',
      source: 'agent-run:' + (result.runId || agent.key)
    });
    return { kind: 'takeover', answer: result.summary || takeover.title, takeover: takeover, agent: result, spoken: true };
  }
  return {
    kind: 'message',
    answer: [result.summary, result.recommendation ? 'Recommended next step: ' + result.recommendation : ''].filter(Boolean).join('\n\n'),
    agent: result,
    spoken: true
  };
}

function boAiTakeoverDuplicateKey_(spec) {
  return ['H38-TAKEOVER', boGetBusinessId_(), spec.agentKey || 'general', spec.linkedRecordType || '', spec.linkedRecordId || '', spec.source || spec.title || ''].join('|').slice(0, 500);
}

function boAiFormatTakeover_(row) {
  var notes = boAiJson_(row.Notes, {});
  return {
    taskId: row['Task ID'],
    title: row['Task Title'],
    blocker: row['Blocking Issue'] || notes.blocker || '',
    completed: notes.completed || [],
    needed: notes.needed || [],
    recommendation: notes.recommendation || '',
    commands: notes.commands || [],
    agentKey: notes.agentKey || '',
    linkedRecordType: row['Linked Record Type'] || '',
    linkedRecordId: row['Linked Record ID'] || '',
    priority: row.Priority || 'High',
    status: row.Status || 'Waiting',
    createdTime: row['Created Time'] || ''
  };
}

function boAiCreateTakeoverBlock_(spec) {
  spec = spec || {};
  if (typeof h38TmEnsureSchema_ !== 'function') {
    return {
      taskId: '', title: spec.title || 'Owner decision needed', blocker: spec.blocker || '', completed: spec.completed || [], needed: spec.needed || [], recommendation: spec.recommendation || '', commands: spec.commands || [], agentKey: spec.agentKey || '', linkedRecordType: spec.linkedRecordType || '', linkedRecordId: spec.linkedRecordId || '', priority: spec.priority || 'High', status: 'Waiting'
    };
  }
  h38TmEnsureSchema_();
  var duplicateKey = boAiTakeoverDuplicateKey_(spec);
  var existing = h38TmRead_('TASKS', { includeVoided: true }).find(function (row) {
    return row['Duplicate Key'] === duplicateKey && ['Completed', 'Cancelled', 'Voided'].indexOf(row.Status) < 0;
  });
  if (existing) return boAiFormatTakeover_(existing);
  var notes = { blocker: spec.blocker || '', completed: spec.completed || [], needed: spec.needed || [], recommendation: spec.recommendation || '', commands: spec.commands || [], agentKey: spec.agentKey || '', source: spec.source || '' };
  var task = h38TmAppend_('TASKS', {
    'Task Title': spec.title || 'Owner decision needed', 'Task Type': 'Owner Takeover', 'Assigned User ID': '', 'Assigned Role': 'Owner', 'Assigned By User ID': boGetCurrentUser_()['User ID'], Priority: spec.priority || 'High', Status: 'Waiting', 'Waiting Reason': 'Owner decision required', 'Blocking Issue': spec.blocker || '',
    Instructions: [spec.recommendation ? 'Recommended: ' + spec.recommendation : '', (spec.commands || []).length ? 'Commands: ' + spec.commands.join(' | ') : ''].filter(Boolean).join('\n'),
    Notes: JSON.stringify(notes), 'Linked Record Type': spec.linkedRecordType || '', 'Linked Record ID': spec.linkedRecordId || '', 'Customer ID': spec.customerId || '', 'Request ID': spec.requestId || '', 'Quote ID': spec.quoteId || (spec.linkedRecordType === 'Quote' ? spec.linkedRecordId : ''), 'Work Order ID': spec.workOrderId || '', 'Job ID': spec.jobId || '', 'Invoice ID': spec.invoiceId || '', 'Document ID': spec.documentId || '', 'Duplicate Key': duplicateKey, 'Created Time': h38TmNow_(), 'Updated Time': h38TmNow_(), 'Is Voided': 'No'
  });
  boProof_('H38 OWNER TAKEOVER', 'Task', task['Task ID'], 'PASS', task['Task Title'], boGetCurrentUser_().Email);
  return boAiFormatTakeover_(task);
}

function boAiTakeoverQueue_(options) {
  options = options || {};
  if (typeof h38TmRead_ !== 'function') return { status: 'PASS', count: 0, takeovers: [] };
  try {
    var limit = Math.max(1, Math.min(Number(options.limit) || 20, 100));
    var rows = h38TmRead_('TASKS', { includeVoided: false }).filter(function (row) {
      return row['Task Type'] === 'Owner Takeover' && ['Completed', 'Cancelled', 'Voided'].indexOf(row.Status) < 0;
    }).sort(function (a, b) { return String(b['Created Time'] || '').localeCompare(String(a['Created Time'] || '')); }).slice(0, limit);
    return { status: 'PASS', count: rows.length, takeovers: rows.map(boAiFormatTakeover_) };
  } catch (error) {
    if (options.quiet) return { status: 'PASS', count: 0, takeovers: [], unavailable: true };
    throw error;
  }
}

function boAiResolveTakeover_(payload) {
  payload = payload || {};
  var owner = boRequireOwner_();
  var taskId = String(payload.taskId || '').trim();
  var answer = String(payload.answer || '').trim();
  boAssert_(taskId, 'Owner takeover task ID is required.');
  boAssert_(answer, 'Owner answer is required.');
  var task = h38TmFind_('TASKS', taskId);
  boAssert_(task['Task Type'] === 'Owner Takeover', 'The selected task is not an H38 owner takeover block.');
  var notes = boAiJson_(task.Notes, {});
  notes.ownerAnswer = answer; notes.resolvedBy = owner.Email; notes.resolvedTime = h38TmNow_();
  var saved = h38TmUpdate_('TASKS', taskId, { Status: 'Completed', 'Completed Time': h38TmNow_(), Notes: JSON.stringify(notes), 'Blocking Issue': '', 'Waiting Reason': '' });
  boProof_('H38 OWNER TAKEOVER RESOLVED', 'Task', taskId, 'PASS', answer, owner.Email);
  var context = { module: 'owner_takeover', recordType: saved['Linked Record Type'] || '', recordId: saved['Linked Record ID'] || '', task: 'Resume work after owner answer', recordSummary: JSON.stringify({ takeover: boAiFormatTakeover_(saved), ownerAnswer: answer }) };
  var agentKey = notes.agentKey || boAiRouteAgentKey_(answer, context) || 'quote_architect';
  var resumed = boAiRunSpecialist_(agentKey, 'The Owner answered the takeover block: ' + answer + '. Resume safe internal preparation and identify the next concrete step.', context);
  resumed.resolvedTaskId = taskId;
  return resumed;
}

function boAiExplicitOwnerCommand_(message) {
  var text = String(message || '').trim();
  if (!text || /^(can|could|would|should|how|what|why|is|are|do you)\b/i.test(text) || /\b(do not|don't|hold off|wait)\b/i.test(text)) return false;
  return /^(approve|reject|send|share|email|reply|text|sms|convert|create|issue|post|export|finalize|release|record|schedule|cancel)\b/i.test(text) || (/\bapprove\b/i.test(text) && /\bsend\b/i.test(text));
}

function boAiCompletionMessage_(completed) {
  var result = completed && completed.result || {};
  if (completed.actionId === 'email.send') return 'Email sent to ' + (result.to || 'the approved recipient') + '.';
  if (completed.actionId === 'email.reply') return 'Reply sent to ' + (result.to || 'the approved recipient') + '.';
  if (completed.actionId === 'record.approve') return 'Record approved.';
  if (completed.actionId === 'record.reject') return 'Record rejected.';
  if (completed.actionId === 'quote.convert') return 'Approved quote converted to a job and work order.';
  if (completed.actionId === 'job.invoice') return 'Draft invoice created from the job.';
  if (completed.actionId === 'journal.post') return 'Approved journal entry posted.';
  if (completed.actionId === 'payroll.export') return 'Approved payroll export created.';
  if (completed.actionId === 'tax.finalize') return 'Approved tax-preparation report finalized.';
  return (completed.label || 'Owner command') + ' completed.';
}

function boAiExecuteAuthorizedPlan_(plan, message, context) {
  var owner = boRequireOwner_();
  var action = boAiPrepareAction_({ actionId: plan.actionId, arguments: plan.arguments || {}, context: context || {} });
  var completed = boAiConfirmAction_({ actionToken: action.actionToken, confirmation: action.confirmation });
  var answer = boAiCompletionMessage_(completed);
  boProof_('H38 OWNER COMMAND', 'AI Action', completed.actionToken || action.actionToken, 'PASS', message, owner.Email);
  return { kind: 'completed', answer: answer, completed: completed, ownerCommand: true, secondConfirmationRequired: false, spoken: true };
}

function boAiOwnerCommandTakeover_(message, context, reason, agentKey) {
  var takeover = boAiCreateTakeoverBlock_({ title: 'Owner command needs one detail', blocker: reason || 'The command is missing a required record, recipient, or business fact.', completed: ['H38 recognized the requested owner action.', 'No external action was performed.'], needed: [reason || 'Required command detail'], recommendation: 'Open the correct record or include the missing ID, recipient, or decision in one command.', commands: ['Use this record and continue.', 'Send it to [recipient].', 'Hold this project.'], agentKey: agentKey || 'intake_requirements', linkedRecordType: context && context.recordType || '', linkedRecordId: context && context.recordId || '', priority: 'High', source: 'owner-command:' + String(message || '').slice(0, 120) });
  return { kind: 'takeover', answer: 'I stopped before acting because one required detail is missing.', takeover: takeover, spoken: true };
}

function boAiSmsPlan_(message, context) {
  var instructions = ['Extract an explicit Owner SMS command. Return ONLY JSON.', 'Never invent a phone number, customer ID, linked record, or message body.', 'Use the current record context only when it clearly supplies the missing value.', 'Shape: {"phone":"","body":"","customerId":"","linkedRecordType":"","linkedRecordId":""}.'].join(' ');
  var response = boAiOpenAi_(instructions, JSON.stringify({ command: message, context: context }));
  return boAiParseJsonObject_(response.text) || {};
}

function boAiExecuteOwnerSmsCommand_(message, context) {
  var owner = boRequireOwner_();
  boAssert_(typeof h38TmSaveMessage_ === 'function' && typeof h38TmSendMessage_ === 'function', 'Business Office SMS is not installed.');
  var plan = boAiSmsPlan_(message, context || {});
  if (!plan.phone || !plan.body) return boAiOwnerCommandTakeover_(message, context, !plan.phone ? 'A verified customer mobile number is required.' : 'The text message body is required.', 'intake_requirements');
  var provider = h38TmProviderStatus_();
  if (!provider.credentialsConfigured || !provider.fromNumberConfigured || !provider.businessRegistrationApproved || !provider.outboundReleased) return boAiOwnerCommandTakeover_(message, context, 'SMS sending is not fully released. Provider credentials, approved number, A2P approval, and outbound release must all be active.', 'business_setup');
  var normalized = h38TmNormalizePhone_(plan.phone);
  var consent = h38TmConsentForPhone_(normalized);
  if (!consent || consent['Consent Status'] !== 'Consented') return boAiOwnerCommandTakeover_(message, context, 'Documented SMS consent is required for ' + normalized + '.', 'intake_requirements');
  var draft = h38TmSaveMessage_('', { Direction: 'Outbound', 'Phone Number': normalized, 'Message Body': plan.body, 'Customer ID': plan.customerId || '', 'Linked Record Type': plan.linkedRecordType || context.recordType || '', 'Linked Record ID': plan.linkedRecordId || context.recordId || '', Notes: 'Prepared and authorized by explicit H38 Owner command.' });
  h38TmApproveMessage_(draft['Message ID'], 'Approve', 'Explicit H38 Owner command: ' + message);
  var sent = h38TmSendMessage_(draft['Message ID']);
  boProof_('H38 OWNER SMS COMMAND', 'Message', draft['Message ID'], 'PASS', normalized, owner.Email);
  return { kind: 'completed', answer: 'Text sent to ' + normalized + '.', completed: { actionId: 'sms.send', messageId: draft['Message ID'], result: sent }, ownerCommand: true, secondConfirmationRequired: false, spoken: true };
}

function boAiQuoteIdFromCommand_(message, context) {
  if (context && String(context.recordType || '').toLowerCase() === 'quote' && context.recordId) return String(context.recordId);
  var match = String(message || '').match(/\b(?:quote\s*)?([A-Z]{1,6}-[A-Z0-9-]{3,}|Q[A-Z0-9-]{3,})\b/i);
  return match ? match[1] : '';
}

function boAiQuoteReadiness_(quote, state, customer) {
  var blockers = [];
  if (!quote['Customer ID']) blockers.push('The quote is not linked to a customer.');
  if (!customer || !(customer.Email || customer['Email Address'])) blockers.push('A verified customer email address is missing.');
  if (!(quote.Scope || quote['Project Title'])) blockers.push('Customer-facing scope or project title is missing.');
  if (!(Number(quote.Total || 0) > 0)) blockers.push('The quote total must be greater than zero.');
  if (state && state.share && state.share.revoked) blockers.push('The previous controlled share link is revoked.');
  return blockers;
}

function boAiApproveAndSendQuote_(message, context) {
  var owner = boRequireOwner_();
  var quoteId = boAiQuoteIdFromCommand_(message, context || {});
  if (!quoteId) return boAiOwnerCommandTakeover_(message, context, 'Open the quote or include its Quote ID.', 'quote_review');
  var quote = boQuoteCommercialQuote_(quoteId), customer = boQuoteCommercialCustomer_(quote['Customer ID']), state = boQuoteCommercialState_(quoteId), blockers = boAiQuoteReadiness_(quote, state, customer);
  if (blockers.length) {
    var takeover = boAiCreateTakeoverBlock_({ title: 'Final quote approval blocked', blocker: blockers.join(' '), completed: ['Loaded quote ' + quoteId + '.', 'Checked customer, scope, total, revision, and recipient readiness.'], needed: blockers, recommendation: 'Correct the missing quote information, then say “Approve and send quote ' + quoteId + '.”', commands: ['Fix the missing information and continue.', 'Hold this quote.', 'Open quote ' + quoteId + '.'], agentKey: 'quote_review', linkedRecordType: 'Quote', linkedRecordId: quoteId, quoteId: quoteId, priority: 'High', source: 'quote-send-readiness' });
    return { kind: 'takeover', answer: 'Quote ' + quoteId + ' is not ready to send.', takeover: takeover, spoken: true };
  }
  var review = boAiRunSpecialist_('quote_review', 'Perform the final send-readiness review for quote ' + quoteId + '. Do not request owner review for items already explicitly authorized by this command unless a material fact is missing.', { module: 'quotes', screen: 'H38 owner command', recordType: 'Quote', recordId: quoteId, recordSummary: JSON.stringify({ quote: quote, customer: customer, commercialState: state }).slice(0, 6000), task: 'Approve and send final quote' });
  if (review.kind === 'takeover') return review;
  state = boQuoteCommercialState_(quoteId);
  if (state.lifecycleStatus === 'Draft') { boQuoteCommercialTransition_({ quoteId: quoteId, status: 'Internal Review', notes: 'H38 final review prepared by explicit Owner command.' }); state = boQuoteCommercialState_(quoteId); }
  if (state.lifecycleStatus === 'Revised') { boQuoteCommercialTransition_({ quoteId: quoteId, status: 'Internal Review', notes: 'Revised quote returned to final review by explicit Owner command.' }); state = boQuoteCommercialState_(quoteId); }
  if (state.lifecycleStatus === 'Internal Review') { boQuoteCommercialTransition_({ quoteId: quoteId, status: 'Approved to Share', notes: 'Explicit H38 Owner command approved this exact quote revision.' }); state = boQuoteCommercialState_(quoteId); }
  boAssert_(state.lifecycleStatus === 'Approved to Share', 'Quote must be in Draft, Revised, Internal Review, or Approved to Share before sending.');
  var recipient = customer.Email || customer['Email Address'];
  var share = boQuoteCommercialPrepareShare_({ quoteId: quoteId, channel: 'Email', recipient: recipient });
  var branding = boBranding_();
  var subject = 'Quote ' + (quote['Quote Number'] || quoteId) + ' from ' + (branding.publicName || branding.businessName || 'Highway 38 Solutions');
  var body = ['Hello ' + (customer['Display Name'] || customer.Name || 'there') + ',', '', 'Your quote is ready to review:', share.url, '', 'You can review the scope, options, terms, and respond through the secure proposal link.', '', 'Thank you,', branding.publicName || branding.businessName || 'Highway 38 Solutions'].join('\n');
  var prepared = boAiPrepareAction_({ actionId: 'email.send', arguments: { to: recipient, subject: subject, body: body }, context: { module: 'quotes', recordType: 'Quote', recordId: quoteId } });
  var sent = boAiConfirmAction_({ actionToken: prepared.actionToken, confirmation: prepared.confirmation });
  boQuoteCommercialTransition_({ quoteId: quoteId, status: 'Shared', notes: 'Sent by explicit H38 Owner command to ' + recipient + '.' });
  boProof_('H38 APPROVE AND SEND QUOTE', 'Quote', quoteId, 'PASS', 'Sent to ' + recipient, owner.Email);
  return { kind: 'completed', answer: 'Quote ' + quoteId + ' was approved and sent to ' + recipient + '.', completed: sent, quoteId: quoteId, proposalUrl: share.url, ownerCommand: true, secondConfirmationRequired: false, spoken: true };
}

function boAiAutomationRun_(payload) {
  payload = payload || {};
  var owner = boRequireOwner_(), mode = boAiAutomationMode_();
  if (mode === 'manual-hold' && payload.force !== true) return { kind: 'message', answer: 'H38 backend automation is on Manual Hold. Say “set H38 automation to automatic” to release it.', spoken: true };
  var summary = { email: null, sms: null, scanned: {}, createdTakeovers: [], agentRuns: [] };
  try { summary.email = boAiEmailBrief_({ limit: Math.max(1, Math.min(Number(payload.emailLimit) || 10, 10)) }); } catch (error) { summary.email = { error: error.message }; }
  try { var provider = typeof h38TmProviderStatus_ === 'function' ? h38TmProviderStatus_() : {}; summary.sms = provider; if (provider.inboundSyncReleased && typeof h38TmSyncInbound_ === 'function') summary.sms.sync = h38TmSyncInbound_(); } catch (error2) { summary.sms = { error: error2.message }; }
  try {
    var requests = boQuoteBuilderSnapshot_(H38_BO_SHEETS.REQUESTS, { includeVoided: false }).rows.slice(0, 100); summary.scanned.requests = requests.length;
    requests.filter(function (row) { var status = String(row.Status || '').toLowerCase(); return status && ['closed', 'converted', 'cancelled', 'voided'].indexOf(status) < 0; }).slice(0, 10).forEach(function (row) {
      var id = row['Request ID'] || '';
      var result = boAiRunSpecialist_('intake_requirements', 'Prepare this open request as far as possible. Identify the minimum missing questions needed to create a reliable quote.', { module: 'requests', recordType: 'Request', recordId: id, recordSummary: JSON.stringify(row).slice(0, 6000), task: 'Automatic request preparation' });
      summary.agentRuns.push({ recordType: 'Request', recordId: id, kind: result.kind, agent: 'intake_requirements' }); if (result.takeover) summary.createdTakeovers.push(result.takeover);
    });
  } catch (error3) { summary.scanned.requestsError = error3.message; }
  try {
    var quotes = boQuoteBuilderSnapshot_(H38_BO_SHEETS.QUOTES, { includeVoided: false }).rows.slice(0, 100); summary.scanned.quotes = quotes.length;
    quotes.filter(function (row) { return ['Internal Review', 'Revised', 'Approved to Share'].indexOf(String(row.Status || '')) >= 0; }).slice(0, 10).forEach(function (row) {
      var quoteId = row['Quote ID'] || '';
      var result = boAiRunSpecialist_('quote_review', 'Review this quote and prepare it up to the point where only an Owner decision or customer contact remains.', { module: 'quotes', recordType: 'Quote', recordId: quoteId, recordSummary: JSON.stringify(row).slice(0, 6000), task: 'Automatic quote readiness review' });
      summary.agentRuns.push({ recordType: 'Quote', recordId: quoteId, kind: result.kind, agent: 'quote_review' }); if (result.takeover) summary.createdTakeovers.push(result.takeover);
    });
  } catch (error4) { summary.scanned.quotesError = error4.message; }
  var queue = boAiTakeoverQueue_({ limit: 100, quiet: true });
  boProof_('H38 BACK OFFICE AUTOMATION', 'System', boGetBusinessId_(), 'PASS', 'Scanned backend; open owner blocks=' + queue.count, owner.Email);
  return { kind: 'automation', answer: 'Back-office pass completed. ' + summary.agentRuns.length + ' agent runs were prepared and ' + queue.count + ' owner takeover block' + (queue.count === 1 ? ' is' : 's are') + ' open.', summary: summary, takeovers: queue.takeovers, openTakeoverCount: queue.count, spoken: true };
}

function boAiAutomationTriggerInstalled_() {
  try { return ScriptApp.getProjectTriggers().some(function (trigger) { return trigger.getHandlerFunction() === H38_AI_AUTOMATION_TRIGGER_HANDLER; }); } catch (error) { return false; }
}
function boAiInstallAutomationTrigger_() { var owner = boRequireOwner_(); if (!boAiAutomationTriggerInstalled_()) ScriptApp.newTrigger(H38_AI_AUTOMATION_TRIGGER_HANDLER).timeBased().everyMinutes(15).create(); boProof_('H38 AUTOMATION TRIGGER', 'System', boGetBusinessId_(), 'PASS', '15-minute backend trigger installed.', owner.Email); return { status: 'PASS', installed: true, everyMinutes: 15 }; }
function boAiRemoveAutomationTrigger_() { var owner = boRequireOwner_(), removed = 0; ScriptApp.getProjectTriggers().forEach(function (trigger) { if (trigger.getHandlerFunction() === H38_AI_AUTOMATION_TRIGGER_HANDLER) { ScriptApp.deleteTrigger(trigger); removed++; } }); boProof_('H38 AUTOMATION TRIGGER', 'System', boGetBusinessId_(), 'PASS', 'Removed ' + removed + ' trigger(s).', owner.Email); return { status: 'PASS', removed: removed }; }
function boAiAutomationScheduledRun() { return boAiAutomationRun_({ scheduled: true }); }

function boAiCommandRouter_(payload) {
  payload = payload || {};
  var message = String(payload.message || '').trim();
  boAssert_(message, 'AI command is required.');
  var context = boAiSafeContext_(payload.context || {}), normalized = message.toLowerCase();
  if (/\b(show|list|read|open)\b.*\b(owner blocks|takeover blocks|decisions needed|owner decisions)\b/.test(normalized)) {
    var queue = boAiTakeoverQueue_({ limit: 25 });
    return { kind: 'takeover_list', answer: queue.count ? queue.count + ' owner takeover block' + (queue.count === 1 ? ' needs' : 's need') + ' attention.' : 'There are no open owner takeover blocks.', takeovers: queue.takeovers, spoken: true };
  }
  if (/\b(run|start|process|work)\b.*\b(back office|backend|automation)\b/.test(normalized) || normalized === 'run back office') return boAiAutomationRun_(payload);
  if (/^set h38 automation to (automatic|owner-command|manual-hold)$/i.test(message)) { var mode = message.match(/^set h38 automation to (automatic|owner-command|manual-hold)$/i)[1]; return { kind: 'message', answer: 'H38 automation mode is now ' + boAiSetAutomationMode_(mode).mode + '.', spoken: true }; }
  if (/^resolve takeover\b/i.test(message)) { var taskMatch = message.match(/\b(TASK-[A-Z0-9-]+)\b/i); return boAiResolveTakeover_({ taskId: taskMatch ? taskMatch[1] : '', answer: message.replace(/^resolve takeover\b/i, '').replace(taskMatch ? taskMatch[0] : '', '').trim() }); }
  if (boAiExplicitOwnerCommand_(message)) {
    if (/^(text|sms)\b/i.test(message)) return boAiExecuteOwnerSmsCommand_(message, context);
    if (/\bquote\b/i.test(message) && /\bapprove\b/i.test(message) && /\b(send|share|email)\b/i.test(message)) return boAiApproveAndSendQuote_(message, context);
    var plan = boAiPlanCommandWithModel_(message, context);
    if (plan.kind === 'action') return boAiExecuteAuthorizedPlan_(plan, message, context);
    return boAiOwnerCommandTakeover_(message, context, plan.answer || 'The command needs a record ID, recipient, or required business detail.', boAiRouteAgentKey_(message, context));
  }
  var agentKey = boAiRouteAgentKey_(message, context);
  if (agentKey) return boAiRunSpecialist_(agentKey, message, context);
  return boAiCommand_(payload);
}
