/* ---- H38 Owner Home (2026-10-11, visual refresh + tenant-aware) ----
 * Replaces the stats-based Today page with a tenant-aware action center.
 *
 * TENANT TYPES (detected from businessKey + industry packs):
 * - service:    today's schedule first, quick quotes, dispatch unscheduled jobs
 * - project:    active projects with milestones first, materials, quotes
 * - lawn-snow:  today's route, plow/mow triggers, jobs progress, seasonal
 * - shop:       jobs in progress + due dates, quotes awaiting approval, parts
 * - rental:     legacy alias of project (project-like businesses)
 * - contractor: legacy alias of service (kept for backward compatibility)
 * - default:    generic action cards
 *
 * Philosophy: "The owner doesn't have a learning curve."
 * - Every card has ONE clear action with a verb
 * - Plain language, no jargon
 * - 10-second test: could someone new figure it out?
 */

(function() {
  'use strict';

  /* ================= Tenant type detection ================= */

  function detectBusinessType() {
    try {
      const b = (state.snapshot && state.snapshot.business) || {};
      let key = String(b.businessKey || state.businessKey || '').toLowerCase();
      // Fallback: check URL ?businessKey= parameter (for deep links / testing)
      if (!key) {
        try {
          const m = window.location.href.match(/[?&]businessKey=([^&]+)/);
          if (m) key = decodeURIComponent(m[1]).toLowerCase();
        } catch (e) {}
      }
      const packs = []
        .concat(b.industryPacks || [])
        .concat((b.brandConfig && b.brandConfig.industryPacks) || [])
        .join(' ')
        .toLowerCase();
      const hay = key + ' ' + packs;
      if (/northern-lakes|lawn|snow|plow|mow/.test(hay)) return 'lawn-snow';
      if (/machine|auto|repair|appliance/.test(hay)) return 'shop';
      if (/gutter|hvac|plumb|electric/.test(hay)) return 'service';
      if (/rental|landscape|bathroom|kitchen|deck|drainage|clean/.test(hay)) return 'project';
      return 'service';
    } catch (e) { return 'service'; }
  }

  const TYPE_LABEL = {
    'service': '⚡ Service',
    'project': '🏗️ Project',
    'lawn-snow': '🌿 Lawn & Snow',
    'shop': '🔧 Shop',
    'rental': '🏠 Rental',
    'contractor': '🔨 Contractor',
    'default': '🏢 Business'
  };

  /* ================= Shared data collectors ================= */

  function getPayrollStatus() {
    try {
      const entries = records('timeEntries') || [];
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEntries = entries.filter(e => {
        const d = new Date(v(e, 'Date') || v(e, 'date') || 0);
        return d >= periodStart && !v(e, 'Payroll Processed');
      });
      if (!periodEntries.length) return null;
      const employees = {};
      periodEntries.forEach(e => {
        const name = v(e, 'Employee') || v(e, 'Employee Name') || 'Unknown';
        employees[name] = (employees[name] || 0) + num(v(e, 'Hours') || 0);
      });
      const empCount = Object.keys(employees).length;
      const totalHours = Object.values(employees).reduce((s, h) => s + h, 0);
      return {
        count: empCount,
        summary: `${Math.round(totalHours)} hours this period`,
        action: 'Review & Run →',
        actionFn: () => {
          if (window.H38GuidedPayroll && typeof window.H38GuidedPayroll.start === 'function') window.H38GuidedPayroll.start();
          else openPage('payroll');
        },
        aiPrompt: 'Help me review payroll for this period'
      };
    } catch (e) { return null; }
  }

  function getBillsDue() {
    try {
      const bills = records('vendorBills') || [];
      const now = new Date();
      const due = bills.filter(b => {
        const status = String(v(b, 'Status') || '').toUpperCase();
        if (['PAID', 'CANCELLED'].includes(status)) return false;
        const dueDate = new Date(v(b, 'Due Date') || v(b, 'dueDate') || 0);
        return dueDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      });
      if (!due.length) return null;
      const overdue = due.filter(b => new Date(v(b, 'Due Date') || 0) < now).length;
      const total = due.reduce((s, b) => s + num(v(b, 'Total') || v(b, 'Amount') || 0), 0);
      return {
        count: due.length,
        summary: `$${total.toFixed(0)} total${overdue ? ` · ${overdue} overdue` : ''}`,
        urgent: overdue > 0,
        action: 'Review & Pay →',
        actionFn: () => {
          if (window.H38PayBills && typeof window.H38PayBills.start === 'function') window.H38PayBills.start();
          else openPage('accounting');
        },
        aiPrompt: 'Which bills should I pay first?'
      };
    } catch (e) { return null; }
  }

  function getLowStock() {
    try {
      const items = records('inventoryItems') || records('inventory') || [];
      const stock = {};
      (records('inventoryStock') || []).forEach(s => {
        stock[v(s, 'Item ID')] = num(v(s, 'Quantity') || v(s, 'On Hand') || 0);
      });
      const low = items
        .map(item => ({
          item: item,
          onHand: stock[v(item, 'Item ID')] || num(v(item, 'On Hand') || v(item, 'Quantity') || 0),
          reorderPoint: num(v(item, 'Reorder Point') || 0)
        }))
        .filter(x => x.reorderPoint > 0 && x.onHand <= x.reorderPoint);
      if (!low.length) return null;
      const names = low.slice(0, 2).map(x => v(x.item, 'Item Name') || v(x.item, 'Name') || 'Item').join(', ');
      const more = low.length > 2 ? ` +${low.length - 2} more` : '';
      return {
        count: low.length,
        summary: `${names}${more}`,
        action: 'Review Order →',
        actionFn: () => {
          if (window.H38OrderInventory && typeof window.H38OrderInventory.start === 'function') window.H38OrderInventory.start();
          else openPage('inventory');
        },
        aiPrompt: 'What should I reorder?'
      };
    } catch (e) { return null; }
  }

  function getQuotesWaiting() {
    try {
      const quotes = records('quotes') || [];
      const waiting = quotes.filter(q => {
        const status = String(v(q, 'Status') || '').toUpperCase();
        return status.includes('DRAFT') || status.includes('SENT');
      });
      if (!waiting.length) return null;
      const total = waiting.reduce((s, q) => s + num(v(q, 'Total') || 0), 0);
      const first = waiting[0];
      const custName = v(first, 'Customer Name') || 'Customer';
      return {
        count: waiting.length,
        summary: `${custName}${waiting.length > 1 ? ` +${waiting.length - 1} more` : ''} · $${total.toFixed(0)} total`,
        action: 'Review →',
        actionFn: () => openPage('quotes'),
        aiPrompt: 'Which quotes need follow-up?'
      };
    } catch (e) { return null; }
  }

  function getOverdueInvoices() {
    try {
      const invoices = records('invoices') || [];
      const now = new Date();
      const overdue = invoices.filter(inv => {
        const status = String(v(inv, 'Status') || '').toUpperCase();
        if (['PAID', 'CANCELLED', 'VOID'].includes(status)) return false;
        const dueDate = new Date(v(inv, 'Due Date') || 0);
        return dueDate < now;
      });
      if (!overdue.length) return null;
      const total = overdue.reduce((s, inv) => s + num(v(inv, 'Total') || v(inv, 'Amount Due') || 0), 0);
      return {
        count: overdue.length,
        summary: `$${total.toFixed(0)} outstanding`,
        urgent: true,
        action: 'Send Reminders →',
        actionFn: () => {
          if (window.H38OverdueNudge && typeof window.H38OverdueNudge.start === 'function') window.H38OverdueNudge.start();
          else openPage('money');
        },
        aiPrompt: 'Draft a payment reminder'
      };
    } catch (e) { return null; }
  }

  function getMyTasks() {
    try {
      const tasks = records('tasks') || [];
      const open = tasks.filter(t => {
        const status = String(v(t, 'Status') || '').toUpperCase();
        return !['DONE', 'COMPLETE', 'CANCELLED'].includes(status);
      });
      return {
        count: open.length,
        items: open.slice(0, 3).map(t => ({
          title: v(t, 'Task Title') || v(t, 'Title') || 'Task',
          assignee: v(t, 'Assigned To') || v(t, 'Assignee') || ''
        }))
      };
    } catch (e) { return { count: 0, items: [] }; }
  }

  function getTodaySchedule() {
    try {
      const events = records('scheduleEvents') || [];
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      return events
        .filter(e => {
          const d = new Date(v(e, 'Start Time') || 0);
          return d >= today && d < tomorrow;
        })
        .sort((a, b) => new Date(v(a, 'Start Time')) - new Date(v(b, 'Start Time')))
        .slice(0, 5)
        .map(e => ({
          time: new Date(v(e, 'Start Time')).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          title: v(e, 'Title') || v(e, 'Customer Name') || 'Event'
        }));
    } catch (e) { return []; }
  }

  /* ================= Contractor collectors ================= */

  function getTodaysJobs() {
    try {
      const jobs = records('jobs') || [];
      const active = jobs.filter(j => {
        const s = String(v(j, 'Status') || '').toUpperCase();
        return ['IN PROGRESS', 'SCHEDULED', 'APPROVED'].includes(s);
      });
      if (!active.length) return null;
      const first = active[0];
      return {
        count: active.length,
        summary: `${v(first, 'Project Title') || 'Job'}${active.length > 1 ? ` +${active.length - 1} more` : ''}`,
        action: 'View Jobs →',
        actionFn: () => openPage('work'),
        aiPrompt: "What's the priority on today's jobs?"
      };
    } catch (e) { return null; }
  }

  function getNewLeads() {
    try {
      const requests = records('requests') || [];
      const fresh = requests.filter(r => {
        const s = String(v(r, 'Status') || '').toUpperCase();
        return s === 'NEW' || s === '';
      });
      if (!fresh.length) return null;
      const first = fresh[0];
      return {
        count: fresh.length,
        summary: `${v(first, 'Subject') || 'New request'}${fresh.length > 1 ? ` +${fresh.length - 1} more` : ''}`,
        action: 'Review Leads →',
        actionFn: () => openPage('work'),
        aiPrompt: 'Help me prioritize these new leads'
      };
    } catch (e) { return null; }
  }

  /* ================= Service collectors (quick jobs) ================= */

  function getUnscheduledJobs() {
    try {
      const jobs = records('jobs') || [];
      const pending = jobs.filter(j =>
        ['LEAD', 'QUOTED', 'APPROVED', 'NEW'].includes(String(v(j, 'Status') || '').toUpperCase()));
      if (!pending.length) return null;
      const first = pending[0];
      return {
        count: pending.length,
        summary: `${v(first, 'Project Title') || 'Job'}${pending.length > 1 ? ` +${pending.length - 1} more` : ''} not yet dispatched`,
        action: 'Dispatch →',
        actionFn: () => openPage('schedule'),
        aiPrompt: 'Which unscheduled jobs should I dispatch first?'
      };
    } catch (e) { return null; }
  }

  /* ================= Platform attention collectors =================
   * The Owner Command Center (platform-next.js, ownerIntelligence) lists
   * attention items the needs-you-now cards never checked — slipping jobs,
   * overdue follow-ups, recurring visits due, dispatch conflicts — so this
   * section could paint "All clear!" on the same home where the Command
   * Center listed real work (spotted on Rick's H38 tenant 2026-10-25:
   * "Review 3 slipping jobs" / "Close 42 overdue follow-ups" above an
   * "All clear!"). These collectors mirror ownerIntelligence()'s rules
   * exactly — same snapshot rows, same example-row filter, same active
   * test, same thresholds — so the two blocks always agree, and the
   * all-clear state only renders when the attention list is genuinely
   * empty. Keep the rules in step with platform-next.js. */

  function intelText(x) { return String(x == null ? '' : x).trim(); }
  function intelValue(row, keys) {
    for (const k of keys) {
      if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    }
    return '';
  }
  function intelDate(x) { const d = new Date(x); return Number.isFinite(d.getTime()) ? d : null; }
  function intelActive(status) {
    return !/(paid|closed|complete|completed|cancel|void|deleted|archived)/i.test(intelText(status));
  }
  function intelIsExample(row) {
    const hay = ['Quote Number', 'Job Number', 'Invoice Number', 'Project Title', 'Status']
      .map(k => intelValue(row, [k])).join(' ');
    return /\bDEMO\b|\bEX-/i.test(hay) || (row && row['Example Data'] === true);
  }
  function intelRows(name) {
    const list = records(name) || [];
    return list.filter(r => !intelIsExample(r));
  }

  function getSlippingJobs() {
    try {
      const jobs = intelRows('jobs').filter(r => intelActive(intelValue(r, ['Status', 'status'])));
      const slipping = jobs.filter(r => {
        if (intelText(intelValue(r, ['Blockers', 'blockers', 'Next Action', 'nextAction']))) return true;
        const d = intelDate(intelValue(r, ['Updated Time', 'updatedTime', 'Created Time', 'createdTime']));
        return d && (Date.now() - d.getTime() > 7 * 86400000);
      });
      if (!slipping.length) return null;
      return {
        count: slipping.length,
        summary: 'Active work has blockers or has not been updated in at least 7 days.',
        urgent: true,
        action: 'Review →',
        actionFn: () => openPage('work'),
        aiPrompt: 'Which jobs are slipping, and what should I do first?'
      };
    } catch (e) { return null; }
  }

  function getOverdueFollowups() {
    try {
      const tasks = intelRows('tasks').filter(r => intelActive(intelValue(r, ['Status', 'status'])));
      const overdue = tasks.filter(r => {
        const d = intelDate(intelValue(r, ['Due Time', 'dueTime', 'Due Date', 'dueDate']));
        return d && d.getTime() < Date.now();
      });
      if (!overdue.length) return null;
      return {
        count: overdue.length,
        summary: 'Open task due dates have passed.',
        urgent: true,
        action: 'Review →',
        actionFn: () => openPage('work'),
        aiPrompt: 'Which overdue follow-ups should I close first?'
      };
    } catch (e) { return null; }
  }

  function getRecurringDue() {
    try {
      const plans = intelRows('recurringPlans').concat(intelRows('recurringServicePlans'))
        .filter(r => intelActive(intelValue(r, ['Status', 'status'])));
      const due = plans.filter(r => {
        const d = intelDate(intelValue(r, ['Next Service Date', 'nextServiceDate', 'Next Due', 'nextDue']));
        return d && d.getTime() <= Date.now() + 2 * 86400000;
      });
      if (!due.length) return null;
      return {
        count: due.length,
        summary: 'Recurring work is due now or within two days.',
        action: 'Plan →',
        actionFn: () => openPage('work'),
        aiPrompt: 'Which recurring visits should I plan first?'
      };
    } catch (e) { return null; }
  }

  function getDispatchConflicts() {
    try {
      const raw = intelRows('scheduleEvents').concat(intelRows('schedule'), intelRows('scheduleItems'), intelRows('appointments'));
      const events = raw.map(r => ({
        userId: intelText(intelValue(r, ['Assigned User ID', 'assignedUserId', 'User ID', 'userId'])),
        assetIds: Array.isArray(intelValue(r, ['Assigned Asset IDs', 'assignedAssetIds']))
          ? intelValue(r, ['Assigned Asset IDs', 'assignedAssetIds'])
          : intelText(intelValue(r, ['Assigned Asset IDs', 'assignedAssetIds', 'Asset ID', 'assetId'])).split(',').map(s => s.trim()).filter(Boolean),
        start: intelDate(intelValue(r, ['Start Time', 'startTime', 'Start', 'start'])),
        end: intelDate(intelValue(r, ['End Time', 'endTime', 'End', 'end']))
      })).filter(x => x.start && x.end && x.end > x.start);
      let conflicts = 0;
      for (let i = 0; i < events.length; i++) {
        for (let j = i + 1; j < events.length; j++) {
          const a = events[i], b = events[j];
          if (!(a.start < b.end && b.start < a.end)) continue;
          if (a.userId && a.userId === b.userId) conflicts++;
          if (a.assetIds.find(id => b.assetIds.includes(id))) conflicts++;
        }
      }
      if (!conflicts) return null;
      return {
        count: conflicts,
        summary: 'A person or piece of equipment is double-booked.',
        urgent: true,
        action: 'Resolve →',
        actionFn: () => openPage('schedule'),
        aiPrompt: 'Which dispatch conflicts should I resolve first?'
      };
    } catch (e) { return null; }
  }

  /* New customer service requests (booking_requests, written by the customer
   * portal and the online booking page). Rick's rule: the Office notifies the
   * owner on any customer activity — a request that lands must count here,
   * so "All clear!" can never paint over an unworked request. The list
   * itself is worked from the Service Requests inbox on the Schedule page
   * (portal-requests.js), where it can be scheduled or dismissed. */
  function getNewServiceRequests() {
    try {
      const requests = intelRows('booking_requests')
        .filter(r => /^new/i.test(intelText(intelValue(r, ['Status', 'status']))));
      if (!requests.length) return null;
      const newest = requests.slice().sort((a, b) =>
        String(intelValue(b, ['Created Time', 'createdTime'])).localeCompare(String(intelValue(a, ['Created Time', 'createdTime']))))[0];
      const who = intelText(intelValue(newest, ['Customer Name', 'customerName'])) || 'A customer';
      const svc = intelText(intelValue(newest, ['Service', 'service']));
      return {
        count: requests.length,
        summary: 'Newest: ' + who + (svc ? ' — ' + svc : '') + '. Work them from the Schedule page.',
        urgent: true,
        action: 'Open requests →',
        actionFn: () => openPage('schedule'),
        aiPrompt: 'What new service requests came in, and which should I schedule first?'
      };
    } catch (e) { return null; }
  }

  /* ================= Project collectors (multi-day work) ================= */

  function getActiveProjects() {
    try {
      const jobs = records('jobs') || [];
      const active = jobs.filter(j =>
        ['IN PROGRESS', 'SCHEDULED', 'APPROVED'].includes(String(v(j, 'Status') || '').toUpperCase())
      ).slice(0, 4);
      if (!active.length) return null;
      const reqs = records('materialRequests') || [];
      const openReqs = {};
      reqs.forEach(r => {
        if (String(v(r, 'Status') || '').toUpperCase() !== 'CLOSED') {
          const jid = v(r, 'Job ID');
          openReqs[jid] = (openReqs[jid] || 0) + 1;
        }
      });
      return active.map(j => {
        const jid = v(j, 'Job ID');
        const due = v(j, 'Due Date') || v(j, 'Due');
        return {
          title: v(j, 'Project Title') || 'Project',
          status: v(j, 'Status') || 'Active',
          due: due ? String(due).slice(0, 10) : '',
          materialsOpen: openReqs[jid] || 0
        };
      });
    } catch (e) { return null; }
  }

  /* ================= Lawn/Snow collectors ================= */

  function getRouteSummary() {
    try {
      const stops = getTodaySchedule();
      if (!stops.length) return null;
      return {
        count: stops.length,
        stops: stops,
        summary: `${stops.length} stop${stops.length === 1 ? '' : 's'} today`,
        action: 'Open Route →',
        actionFn: () => openPage('schedule')
      };
    } catch (e) { return null; }
  }

  function getPlowInfo() {
    try {
      const customers = records('customers') || [];
      const auto = customers.filter(c => {
        const rate = v(c, 'Plowing Rate') || v(c, 'Mowing Rate');
        return rate && String(v(c, 'Auto Plow') || v(c, 'Automatic') || '').toLowerCase() !== 'false';
      });
      const withRate = customers.filter(c => v(c, 'Plowing Rate') || v(c, 'Mowing Rate'));
      return { autoCount: auto.length, withRateCount: withRate.length };
    } catch (e) { return { autoCount: 0, withRateCount: 0 }; }
  }

  function getJobsProgress() {
    try {
      const jobs = records('jobs') || [];
      const done = jobs.filter(j => String(v(j, 'Status') || '').toUpperCase() === 'COMPLETE').length;
      const open = jobs.filter(j => !['COMPLETE', 'CLOSED', 'CANCELLED'].includes(String(v(j, 'Status') || '').toUpperCase())).length;
      const total = done + open;
      if (!total) return null;
      return { done: done, open: open, total: total, pct: Math.round((done / total) * 100) };
    } catch (e) { return null; }
  }

  function getSeasonalPrompt() {
    const month = new Date().getMonth(); // 0-11
    if (month >= 10 || month <= 2) {
      return {
        icon: '❄️',
        title: 'Snow season is here',
        body: 'Make sure every plow customer has a rate set and automatic triggers on.'
      };
    }
    if (month === 3) {
      return {
        icon: '🌱',
        title: 'Spring cleanup season',
        body: 'Reach out to winter customers about spring cleanup visits.'
      };
    }
    if (month >= 4 && month <= 8) {
      return {
        icon: '🌿',
        title: 'Mowing season',
        body: 'Check that recurring mow customers are on schedule.'
      };
    }
    return {
      icon: '🍂',
      title: 'Fall cleanup season',
      body: 'Leaf cleanup is coming — line up your fall customers now.'
    };
  }

  /* ================= Shop collectors ================= */

  function getJobsInProgress() {
    try {
      const jobs = records('jobs') || [];
      const open = jobs.filter(j => {
        const s = String(v(j, 'Status') || '').toUpperCase();
        return ['IN PROGRESS', 'SCHEDULED', 'APPROVED', 'QUOTED'].includes(s);
      });
      if (!open.length) return null;
      const withDue = open.filter(j => v(j, 'Due Date') || v(j, 'Due'));
      const first = withDue[0] || open[0];
      const due = v(first, 'Due Date') || v(first, 'Due');
      return {
        count: open.length,
        summary: `${v(first, 'Project Title') || 'Job'}${due ? ' · due ' + due.slice(0, 10) : ''}${open.length > 1 ? ` +${open.length - 1} more` : ''}`,
        action: 'View Jobs →',
        actionFn: () => openPage('work'),
        aiPrompt: 'Which jobs are at risk of missing their due dates?'
      };
    } catch (e) { return null; }
  }

  function getQuotesAwaitingApproval() {
    try {
      const quotes = records('quotes') || [];
      const waiting = quotes.filter(q => {
        const approval = String(v(q, 'Approval Status') || '').toUpperCase();
        const status = String(v(q, 'Status') || '').toUpperCase();
        return (approval === '' || approval === 'PENDING') && status.includes('SENT');
      });
      if (!waiting.length) return null;
      const total = waiting.reduce((s, q) => s + num(v(q, 'Total') || 0), 0);
      return {
        count: waiting.length,
        summary: `$${total.toFixed(0)} waiting on customer`,
        action: 'Follow Up →',
        actionFn: () => openPage('quotes'),
        aiPrompt: 'Draft follow-ups for quotes awaiting approval'
      };
    } catch (e) { return null; }
  }

  /* ================= Card renderer ================= */

  const actionHandlers = [];
  function registerAction(fn) {
    const idx = actionHandlers.length;
    actionHandlers[idx] = fn;
    return idx;
  }

  function actionCard(icon, title, data, actionIdx) {
    const urgentClass = data.urgent ? ' h38-action-urgent' : '';
    const aiButton = data.aiPrompt ? `
      <button type="button" class="h38-action-ai" data-ai-prompt="${esc(data.aiPrompt)}" aria-label="Ask Hank about this">
        <span aria-hidden="true">✨</span> Ask Hank
      </button>` : '';
    /* Bold Numbers: the count dominates. Minimal text below it. */
    const bigNum = (data.count !== undefined && data.count !== null)
      ? `<div class="h38-action-number" aria-label="${esc(String(data.count))}">${esc(String(data.count))}</div>` : '';
    return `
      <section class="card h38-action-card${urgentClass}">
        <div class="h38-action-head">
          <span class="h38-action-icon" aria-hidden="true">${icon}</span>
          <div class="h38-action-text">
            <strong>${esc(title)}</strong>
          </div>
        </div>
        ${bigNum}
        <p class="h38-action-sub">${esc(data.summary)}</p>
        <div class="h38-action-buttons">
          <button type="button" class="h38-action-main" data-action-idx="${actionIdx}">
            ${esc(data.action)}
          </button>
          ${aiButton}
        </div>
      </section>`;
  }

  function pushCard(cards, icon, title, data) {
    if (!data) return;
    const idx = registerAction(data.actionFn);
    cards.push({ urgent: !!data.urgent, html: actionCard(icon, title, data, idx), actionLabel: data.action || '', actionIdx: idx });
  }

  /* ================= Type-specific quick actions ================= */

  function quickActionsFor(type) {
    const all = {
      quote: { icon: '🧾', label: 'New Quote', fn: () => openPage('quotes') },
      customer: { icon: '👤', label: 'New Customer', fn: () => openPage('customers') },
      sendtask: {
        icon: '📋', label: 'Send Task',
        fn: () => {
          if (window.H38SendTask && typeof window.H38SendTask.start === 'function') window.H38SendTask.start();
          else { toast('Send Task is loading. Try again in a moment.', true); }
        }
      },
      schedule: { icon: '🗓️', label: 'Schedule', fn: () => openPage('schedule') },
      route: { icon: '🗺️', label: "Today's Route", fn: () => openPage('schedule') },
      trigger: {
        icon: '❄️', label: 'Trigger Jobs',
        fn: () => {
          if (window.H38PlowTrigger && typeof window.H38PlowTrigger.triggerAll === 'function') window.H38PlowTrigger.triggerAll();
          else openPage('customers');
        }
      },
      job: { icon: '🔨', label: 'New Job', fn: () => openPage('work') },
      parts: { icon: '📦', label: 'Order Parts', fn: () => {
        if (window.H38OrderInventory && typeof window.H38OrderInventory.start === 'function') window.H38OrderInventory.start();
        else openPage('inventory');
      } },
      servicecall: { icon: '📞', label: 'New Service Call', fn: () => openPage('work') },
      todaysschedule: { icon: '🗓️', label: "Today's Schedule", fn: () => openPage('schedule') },
      quickquote: { icon: '⚡', label: 'Quick Quote', fn: () => openPage('quotes') },
      dispatch: { icon: '🚚', label: 'Dispatch', fn: () => openPage('schedule') },
      newproject: { icon: '🏗️', label: 'New Project', fn: () => openPage('work') },
      timeline: { icon: '📊', label: 'Project Timeline', fn: () => openPage('schedule') },
      materials: { icon: '📦', label: 'Order Materials', fn: () => {
        if (window.H38OrderInventory && typeof window.H38OrderInventory.start === 'function') window.H38OrderInventory.start();
        else openPage('inventory');
      } },
      milestones: { icon: '🎯', label: 'Milestones', fn: () => openPage('work') },
      quickstart: { icon: '⚡', label: 'Photo→Quote', fn: () => launchQuickStart() }
    };
    switch (type) {
      case 'lawn-snow': return [all.trigger, all.route, all.sendtask, all.customer];
      case 'shop': return [all.job, all.quote, all.parts, all.sendtask];
      case 'service': return [all.servicecall, all.todaysschedule, all.quickquote, all.dispatch];
      case 'project': return [all.newproject, all.timeline, all.materials, all.milestones];
      case 'contractor': return [all.quote, all.customer, all.sendtask, all.schedule];
      default: return [all.quote, all.customer, all.sendtask, all.schedule];
    }
  }

  /* ---- Quick Start launcher (H38QuickStart loads separately; degrade gracefully) ---- */
  function launchQuickStart() {
    if (window.H38QuickStart && typeof window.H38QuickStart.start === 'function') window.H38QuickStart.start();
    else toast('Quick Start is loading. Try again in a moment.', true);
  }

  /* ================= First-screen frames (opening-bounce fix v2, 2026-10-26) =================
   * The owner home paints ONCE, in its final layout. Every card that feature
   * modules attach after the first render lands in a frame whose height is
   * reserved from the first frame (owner-home.css carries the per-slot,
   * per-breakpoint heights) and NEVER shrinks while this view lives: filling
   * a frame swaps its skeleton for the card inside the same reserved box, so
   * nothing below the frame can move when its data lands.
   * v1 (2026-10-25) reserved the height this device last settled at
   * (localStorage) and dropped the reservation the moment a card filled.
   * Both halves bounced: a learned height encodes a PREVIOUS day's content
   * (a taller digest yesterday reserved 1333px for a 412px digest today, and
   * the whole home rode up ~900px when it collapsed), and dropping the
   * reservation on fill moved everything below whenever the fresh card's
   * height differed from the guess. Heights are structural now — each is
   * the card's own layout budget, from its CSS, at that breakpoint — never
   * learned, never dropped. Taller content may still grow a frame (the
   * reservation is a floor); shorter content leaves the difference as
   * space inside the frame, never as movement.
   * The platform stack is the one genuinely data-shaped frame. When both
   * platform cards have filled it, fill() locks the frame to the stack's
   * actual height a double-rAF later (same settle window as the fill), so
   * a quiet tenant does not keep a tall empty reservation; the render's
   * 6-second backstop locks or releases a frame whose cards never came.
   * Modules fill their frame through window.H38FirstScreen.fill(); when no
   * frame exists they keep their legacy insert path. See owner-home.css
   * (.h38-first-slot, .h38-home-frame). */
  const FIRST_SLOT_IDS = { mileage: 'h38MileageSlot', phoneToday: 'h38PhoneTodaySlot', profitability: 'h38ProfitabilitySlot', platform: 'h38PlatformSlot' };
  function firstSlotHtml(key) {
    return '<div class="h38-first-slot h38-first-slot--' + key + '" id="' + FIRST_SLOT_IDS[key] + '" data-h38-first-slot="' + key + '" aria-hidden="true"></div>';
  }
  function firstSlotExpected(key) {
    try {
      if (key === 'mileage') return !!(window.H38Mileage && typeof window.H38Mileage.enabled === 'function' && window.H38Mileage.enabled());
      if (key === 'phoneToday') return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
      if (key === 'profitability') {
        if (typeof window.can === 'function') return !!(window.can('manageFinancial') || window.can('viewFinancial') || window.can('manageSettings'));
        const u = (state.snapshot && state.snapshot.user) || {};
        return !!(u.owner === true || (u.permissions && (u.permissions.all === true || u.permissions.manageFinancial === true || u.permissions.viewFinancial === true || u.permissions.manageSettings === true)));
      }
      if (key === 'platform') {
        /* The platform owner stack (Owner Command Center + Owner operating
         * cockpit, platform-next.js / platform-deepen.js) renders only for
         * owners. The decision uses ONLY snapshot data present at render —
         * the same owner test the platform modules apply. v1 also required
         * the platform scripts to already be in the page, but those scripts
         * load late, so the answer raced the loader: some opens reserved
         * the frame, others didn't, and on the unreserved opens the cards
         * prepended themselves above the screen header or landed in a
         * frame that appeared later — a different composition per open.
         * The frame now exists on every owner open; the render's backstop
         * timer releases it if the platform modules never load. (The demo
         * tenant's user is an administrator, not an owner, so demo homes
         * never reserve it and never render these cards.) */
        const u = (state.snapshot && state.snapshot.user) || {};
        return !!(u.owner === true || /\bowner\b/i.test(String(u.roleName || u.role || '')));
      }
    } catch (e) { return false; }
    return false;
  }
  const platformFillState = { cards: {}, lockQueued: false };
  window.H38FirstScreen = Object.freeze({
    build: '20261026-nobounce-2',
    slotId: function (key) { return FIRST_SLOT_IDS[key] || ''; },
    /* Move node into its reserved frame. The frame's reserved height does
     * NOT change: the card replaces the skeleton inside the same box, so
     * nothing below the frame moves. Returns false when no frame exists so
     * callers can fall back. */
    fill: function (key, node) {
      const slot = document.getElementById(FIRST_SLOT_IDS[key] || '');
      if (!slot || !node) return false;
      if (node.parentElement !== slot) slot.appendChild(node);
      slot.classList.add('is-filled');
      slot.removeAttribute('aria-hidden');
      if (key === 'platform' && node.id) {
        platformFillState.cards[node.id] = true;
        if (platformFillState.cards['h38OwnerCommandCenter'] && platformFillState.cards['h38OwnerProfitabilityDeepening'] && !platformFillState.lockQueued) {
          platformFillState.lockQueued = true;
          // Both stack cards are in. Lock the frame to the stack's real
          // height two frames out — the cards' own render pass has fully
          // landed by then, and the lock lands in the same settle window
          // as the fill, never as a later surprise.
          requestAnimationFrame(function () { requestAnimationFrame(function () { window.H38FirstScreen.lockPlatform(); }); });
        }
      }
      return true;
    },
    /* Platform only: shrink the frame's reservation to the stack's actual
     * height. Runs at most once per view (fill path or the render's 6s
     * backstop); afterwards the reservation is a floor at the real height
     * and re-renders inside the frame cannot move anything below it. */
    lockPlatform: function () {
      const slot = document.getElementById(FIRST_SLOT_IDS.platform);
      if (!slot || slot.dataset.h38Locked) return false;
      const h = slot.scrollHeight;
      if (!(h > 0)) return false;
      slot.dataset.h38Locked = '1';
      slot.style.minHeight = h + 'px';
      return true;
    },
    /* The card for this frame is not coming (feature off, module absent):
     * collapse the reservation — but only while the frame is still empty.
     * A filled frame NEVER collapses during the view: collapsing under
     * painted content is exactly the bounce this system exists to kill. */
    release: function (key) {
      const slot = document.getElementById(FIRST_SLOT_IDS[key] || '');
      if (!slot) return false;
      if (slot.classList.contains('is-filled')) return false;
      slot.classList.add('is-released');
      return true;
    }
  });

  /* ================= Main renderer ================= */

  function renderOwnerHome() {
    actionHandlers.length = 0;
    const type = detectBusinessType();
    const cards = [];

    /* ---- Quick Start: new business = zero quotes AND zero customers ---- */
    let isNewBusiness = false;
    try {
      isNewBusiness = ((records('quotes') || []).length === 0) && ((records('customers') || []).length === 0);
    } catch (e) { isNewBusiness = false; }

    /* ---- Shared money cards (all types) ---- */
    pushCard(cards, '💵', 'Invoices overdue', getOverdueInvoices());
    pushCard(cards, '💸', 'Bills due', getBillsDue());
    pushCard(cards, '💰', 'Payroll ready', getPayrollStatus());

    /* ---- Platform attention cards (all types): the same items the Owner
     * Command Center lists, so "Needs you now" and the Command Center can
     * never disagree — and "All clear!" only paints when both are empty. ---- */
    pushCard(cards, '📥', 'Service requests', getNewServiceRequests());
    pushCard(cards, '🧭', 'Slipping jobs', getSlippingJobs());
    pushCard(cards, '📞', 'Follow-ups overdue', getOverdueFollowups());
    pushCard(cards, '🔁', 'Recurring visits due', getRecurringDue());
    pushCard(cards, '🚚', 'Dispatch conflicts', getDispatchConflicts());

    /* ---- Type-specific cards ---- */
    let routeHtml = '';
    let heroHtml = '';
    let extraHtml = '';

    if (type === 'service') {
      // Service hero: today's schedule FIRST
      const sched = getTodaySchedule();
      const sidx = registerAction(() => openPage('schedule'));
      heroHtml = `
        <section class="h38-schedule-hero">
          <div class="h38-schedule-top">
            <span class="h38-schedule-icon" aria-hidden="true">🛠️</span>
            <div><strong>Today's Schedule</strong><small>${sched.length ? `${sched.length} call${sched.length === 1 ? '' : 's'} booked` : 'No calls booked yet'}</small></div>
            <span class="h38-hero-number" aria-label="${sched.length} calls">${sched.length}</span>
          </div>
          ${sched.length ? `
          <div class="h38-schedule-stops">
            ${sched.map(s => `<div class="h38-stop"><b>${esc(s.time)}</b><span>${esc(s.title)}</span></div>`).join('')}
          </div>` : ''}
          <div class="h38-schedule-actions">
            <button type="button" class="h38-schedule-go" data-action-idx="${sidx}">View Schedule →</button>
          </div>
        </section>`;
      pushCard(cards, '🧾', 'Quotes waiting', getQuotesWaiting());
      pushCard(cards, '🚚', 'Dispatch needed', getUnscheduledJobs());
    } else if (type === 'project') {
      // Project hero: active projects with milestones FIRST
      const projects = getActiveProjects();
      if (projects) {
        const pidx = registerAction(() => openPage('work'));
        heroHtml = `
          <section class="h38-project-hero">
            <div class="h38-project-top">
              <span class="h38-project-icon" aria-hidden="true">🏗️</span>
              <div><strong>Active Projects</strong><small>${projects.length} project${projects.length === 1 ? '' : 's'} in the pipeline</small></div>
              <span class="h38-hero-number" aria-label="${projects.length} projects">${projects.length}</span>
            </div>
            <div class="h38-project-list">
              ${projects.map(p => `
                <div class="h38-project-row">
                  <div class="h38-project-main">
                    <b>${esc(p.title)}</b>
                    <span class="h38-project-status">${esc(p.status)}${p.due ? ` · due ${esc(p.due)}` : ''}</span>
                  </div>
                  ${p.materialsOpen ? `<span class="h38-project-materials">📦 ${p.materialsOpen} material${p.materialsOpen === 1 ? '' : 's'} open</span>` : ''}
                </div>`).join('')}
            </div>
            <div class="h38-project-actions">
              <button type="button" class="h38-project-go" data-action-idx="${pidx}">Open Projects →</button>
            </div>
          </section>`;
      }
      const low = getLowStock();
      if (low) {
        low.summary = 'Materials: ' + low.summary;
        pushCard(cards, '📦', 'Materials low', low);
      }
      pushCard(cards, '🧾', 'Quotes waiting', getQuotesWaiting());
    } else if (type === 'lawn-snow') {
      // Route hero
      const route = getRouteSummary();
      if (route) {
        const ridx = registerAction(route.actionFn);
        routeHtml = `
          <section class="h38-route-hero">
            <div class="h38-route-top">
              <span class="h38-route-icon" aria-hidden="true">🗺️</span>
              <div><strong>Today's Route</strong><small>${esc(route.summary)}</small></div>
              <span class="h38-hero-number" aria-label="${route.count} stops">${route.count}</span>
            </div>
            <div class="h38-route-stops">
              ${route.stops.map(s => `<div class="h38-stop"><b>${esc(s.time)}</b><span>${esc(s.title)}</span></div>`).join('')}
            </div>
            <div class="h38-route-actions">
              <button type="button" class="h38-route-go" data-action-idx="${ridx}">Open Route →</button>
              <button type="button" class="h38-route-opt" data-route-opt="1">⚡ Optimize</button>
            </div>
          </section>`;
      }
      // Seasonal banner
      const season = getSeasonalPrompt();
      const plow = getPlowInfo();
      extraHtml += `
        <section class="h38-season-banner">
          <span class="h38-season-icon" aria-hidden="true">${season.icon}</span>
          <div><strong>${esc(season.title)}</strong><small>${esc(season.body)}${plow.autoCount ? ` ${plow.autoCount} on automatic.` : ''}</small></div>
        </section>`;
      // Jobs progress
      const prog = getJobsProgress();
      if (prog) {
        extraHtml += `
          <section class="card">
            <h2>📊 Jobs</h2>
            <div class="h38-progress-wrap">
              <div class="h38-progress-meta"><span>${prog.done} done</span><span>${prog.open} open</span></div>
              <div class="h38-progress-bar"><div class="h38-progress-fill" style="width:${prog.pct}%"></div></div>
            </div>
          </section>`;
      }
      pushCard(cards, '📦', 'Low stock', getLowStock());
    } else if (type === 'shop') {
      pushCard(cards, '🔨', 'Jobs in progress', getJobsInProgress());
      pushCard(cards, '📝', 'Quotes awaiting approval', getQuotesAwaitingApproval());
      const parts = getLowStock();
      if (parts) {
        parts.summary = 'Parts: ' + parts.summary;
        pushCard(cards, '⚙️', 'Parts low', parts);
      }
    } else {
      // default (legacy contractor/rental fall here if ever returned)
      pushCard(cards, '🧾', 'Quotes waiting', getQuotesWaiting());
      pushCard(cards, '🔨', "Today's jobs", getTodaysJobs());
      pushCard(cards, '📥', 'New leads', getNewLeads());
      pushCard(cards, '📦', 'Low stock', getLowStock());
    }

    // Urgent first
    cards.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));

    /* ---- Tasks ---- */
    const tasks = getMyTasks();
    const tasksHtml = `
      <section class="h38-tasks-summary">
        <div class="h38-section-head">
          <h2>📋 My Tasks <span class="h38-tasks-count" aria-label="${tasks.count} tasks">${tasks.count}</span></h2>
          <button type="button" class="secondary small" id="h38ViewAllTasks" style="min-height:44px">View all →</button>
        </div>
        ${tasks.items.length ? tasks.items.map(t => `
          <div class="h38-task-row">
            <span class="h38-task-check" aria-hidden="true"></span>
            <div><strong>${esc(t.title)}</strong>${t.assignee ? `<small>→ ${esc(t.assignee)}</small>` : ''}</div>
          </div>`).join('') : '<p class="muted" style="margin:0">Nothing assigned. Send a task to get something off your plate.</p>'}
      </section>`;

    /* ---- Schedule (project/shop/default) ----
     * Service gets the schedule hero instead (see above); lawn-snow gets the route hero. */
    let scheduleHtml = '';
    if (type === 'project' || type === 'shop' || type === 'default' || type === 'contractor') {
      const schedule = getTodaySchedule();
      scheduleHtml = `
        <section class="h38-schedule-card">
          <h2>📅 Today</h2>
          ${schedule.length ? schedule.map(s => `
            <div class="h38-sched-row">
              <span class="h38-sched-time">${esc(s.time)}</span>
              <span class="h38-sched-title">${esc(s.title)}</span>
            </div>`).join('') : '<p class="muted" style="margin:0">Nothing scheduled today.</p>'}
        </section>`;
    }

    /* ---- Quick actions (PROMINENT, near top) ---- */
    const quicks = quickActionsFor(type);
    if (!isNewBusiness) quicks.push({ icon: '⚡', label: 'Photo→Quote', fn: () => launchQuickStart() });
    const quickIdx = quicks.map(q => registerAction(q.fn));
    const quickHtml = `
      <section class="h38-quick-hero">
        <strong>⚡ Quick actions</strong>
        <div class="h38-quick-grid">
          ${quicks.map((q, i) => `
            <button type="button" data-action-idx="${quickIdx[i]}">
              <span aria-hidden="true">${q.icon}</span>${esc(q.label)}
            </button>`).join('')}
        </div>
      </section>`;

    /* ---- Header (WS4 §5.1): standard screen header; the primary action
     * is the top (urgent-first) action card's own action, falling back to
     * New quote when nothing needs the owner. ---- */
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const businessName = state.snapshot?.business?.businessName || 'Your Business';
    const userName = state.snapshot?.user?.name || state.snapshot?.user?.email || '';
    const topCard = cards[0] || null;
    const headerOpts = {
      page: 'today', title: 'Today',
      purpose: 'See what needs you today, and do the most important thing first.',
      status: { label: TYPE_LABEL[type] || TYPE_LABEL.default, kind: '' },
      primary: topCard
        ? { label: String(topCard.actionLabel || 'Open').replace(/\s*→\s*$/, ''), handler: () => { const fn = actionHandlers[topCard.actionIdx]; if (fn) fn(); } }
        : { label: '＋ New quote', handler: () => openPage('quotes') },
      secondary: [{ label: '＋ New job', handler: () => openPage('work') }],
      more: [
        { label: 'Read my day', handler: () => { if (typeof window.readMyDay === 'function') window.readMyDay(); else document.getElementById('readDayButton')?.click(); } },
        { label: 'Daily digest settings', handler: () => openPage('settings') }
      ]
    };
    const headerHtml = window.H38Flow ? window.H38Flow.screenHeader(headerOpts) : `
      <header class="page-head h38-owner-head">
        <h1>${esc(greeting)}${userName ? ', ' + esc(String(userName).split(' ')[0]) : ''}</h1>
        <p>${esc(businessName)}</p>
        <span class="h38-type-tag">${TYPE_LABEL[type] || TYPE_LABEL.default}</span>
      </header>`;

    /* ---- Cards section ---- */
    const cardsHtml = cards.length ? `
      <div class="h38-section-label">
        <span class="h38-urgent-dot" aria-hidden="true"></span>
        Needs you now <span class="h38-count">${cards.length}</span>
      </div>
      ${cards.map(c => c.html).join('')}` : `
      <section class="h38-all-clear">
        <div class="h38-all-clear-inner">
          <span class="h38-all-clear-check" aria-hidden="true">✅</span>
          <strong>All clear!</strong>
          <p>Nothing needs your attention right now.<br>Start something below.</p>
          <button type="button" class="h38-all-clear-cta" data-action-idx="${registerAction(quicks[0].fn)}">
            ${esc(quicks[0].icon)} ${esc(quicks[0].label)}
          </button>
        </div>
      </section>`;

    /* ---- Kit AI activity feed ("While You Were Away") ----
     * The feed renders into this box right after the home paints (and its
     * module can land after first paint), so the box carries a reserved
     * height in owner-home.css: the feed fills space that already exists
     * instead of growing the home body under the quick actions. */
    const kitFeedSlotHtml = '<div id="h38KitFeedSlot" class="h38-kit-feed-slot"></div>';

    /* ---- Late top cards: the time clock (erp-foundation.js), the
     * customer-ready workspace (customer-readiness-polish.js) and the
     * access context strip (office-access-completion.js) all attach AFTER
     * the home paints, anchored under the screen header — measured on the
     * H38 tenant they shoved the whole desktop screen down ~707px about a
     * second after first paint. Their frames are reserved here, in their
     * settled order, and each module fills its frame instead of inserting
     * into the flow. The frames exist at phone widths too: there they are
     * zero-height and clipped (owner-home.css), because on mobile these
     * modules otherwise anchor after the phone digest — landing INSIDE the
     * digest's frame at full height until the phone layer's hiding rules
     * catch up, a race that bounced the phone home by ~1000px on the
     * opens it lost. Inside a clipped frame the cards can arrive in any
     * order at any time and move nothing; the digest's "Show full Office
     * details" toggle expands the frames with the rest of the details.
     * A frame whose card never arrives is collapsed by the backstop timer
     * below, so a missing module leaves no permanent hole. ---- */
    const trioFramesHtml = `
      <div class="h38-home-frame h38-home-frame--time" id="h38TimeFrame" aria-hidden="true"></div>
      <div class="h38-home-frame h38-home-frame--ready" id="h38ReadyFrame" aria-hidden="true"></div>
      <div class="h38-home-frame h38-home-frame--access" id="h38AccessFrame" aria-hidden="true"></div>`;

    /* ---- Owner chat entry: the persistent Kit thread on the Hank page.
     * Shown unless the business has the owner_chat module turned off. ---- */
    const ownerChatEntryHtml = (typeof window.H38ModuleVisible !== 'function' || window.H38ModuleVisible('ownerChat') !== false) ? `
      <section class="card h38-owner-chat-entry">
        <div class="row-top">
          <div><h2>💬 Chat with your Office</h2>
          <p class="muted">Ask Kit about jobs, the schedule, customers or money — or give an instruction and Kit carries it out and confirms in the thread. Start on your phone, finish at your desk; the thread is saved.</p></div>
          <button type="button" data-action-idx="${registerAction(() => { openPage('ai'); setTimeout(() => { const ta = document.querySelector('#kwAiForm textarea'); if (ta) { ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); try { ta.focus({ preventScroll: true }); } catch (e) {} } }, 500); })}">Open chat</button>
        </div>
      </section>` : '';

    /* ---- Quick Start hero banner (new businesses: first value in 60 seconds) ---- */
    const qsHero = isNewBusiness ? `
      <section class="h38-qs-hero">
        <button type="button" class="h38-qs-btn" data-action-idx="${registerAction(() => launchQuickStart())}">
          <span class="h38-qs-emoji" aria-hidden="true">⚡</span>
          <span class="h38-qs-text"><strong>Quick Start: Photo → Quote</strong><small>Your first quote in 60 seconds. No setup needed.</small></span>
          <span class="h38-qs-arrow" aria-hidden="true">→</span>
        </button>
      </section>` : '';

    /* ---- Assemble: header → TODAY section → mileage slot → platform slot → phone/profit slots → quick actions → needs-you-now → kit feed → type extras → tasks ----
     * The Today block is the first content on the screen (2026-10-25
     * follow-on): the mileage slot moves below it, still reserved at its
     * settled height so the late-arriving mileage card fills space that
     * already exists instead of shoving anything down. The phone-digest /
     * profitability slots stay below the header, matching where those
     * cards settle today; reserving them here is what keeps the first
     * paint settled. The platform slot (owner Command Center stack) sits
     * below the Today block so those cards land below Today on every
     * composition. */
    const mileageSlotHtml = firstSlotExpected('mileage') ? firstSlotHtml('mileage') : '';
    const platformSlotHtml = firstSlotExpected('platform') ? firstSlotHtml('platform') : '';
    const firstSlotsBelow = (firstSlotExpected('phoneToday') ? firstSlotHtml('phoneToday') : '') + (firstSlotExpected('profitability') ? firstSlotHtml('profitability') : '');
    /* ---- Today first (2026-10-25): the Today section is the opening view.
     * Whichever block carries today's schedule for this tenant type — the
     * schedule hero (service), the route hero (lawn-snow), or the "📅 Today"
     * card (project/shop/default/contractor) — leads the screen directly
     * under the header, ahead of quick actions, the needs-you-now cards,
     * the kit feed, tasks, and the below-header card slots. It is the same
     * block moved up, not a copy; the body keeps the remaining blocks. ---- */
    const todayFirstHtml = type === 'service' ? heroHtml : (type === 'lawn-snow' ? routeHtml : scheduleHtml);
    const heroInBody = type === 'service' ? '' : heroHtml;
    const routeInBody = type === 'lawn-snow' ? '' : routeHtml;
    const scheduleInBody = (type === 'service' || type === 'lawn-snow') ? scheduleHtml : '';
    $('mainContent').innerHTML = headerHtml + trioFramesHtml + todayFirstHtml + mileageSlotHtml + platformSlotHtml + firstSlotsBelow + `
      <div class="h38-owner-home h38-type-${type}">
        ${qsHero}
        ${quickHtml}
        ${heroInBody}
        ${routeInBody}
        ${cardsHtml}
        ${kitFeedSlotHtml}
        ${ownerChatEntryHtml}
        ${extraHtml}
        ${tasksHtml}
        ${scheduleInBody}
      </div>`;

    if (window.H38Flow) window.H38Flow.bindScreenHeader($('mainContent'), headerOpts);

    /* ---- Frame backstops: a reservation must never become a permanent
     * hole when its card is not coming. Trio frames whose module never
     * delivered collapse after a grace period; the platform frame locks to
     * whatever stack height it reached, or releases when the platform
     * modules are absent entirely. A FILLED frame is never collapsed —
     * release() refuses — so these timers can only ever settle an empty
     * reservation, in a degraded load, never move painted content. ---- */
    if (trioFramesHtml) {
      setTimeout(() => {
        try {
          ['h38TimeFrame', 'h38ReadyFrame', 'h38AccessFrame'].forEach(id => {
            const frame = document.getElementById(id);
            if (frame && !frame.classList.contains('is-filled')) frame.classList.add('is-released');
          });
        } catch (e) { /* frames already gone with a re-render */ }
      }, 4000);
    }
    if (platformSlotHtml) {
      setTimeout(() => {
        try {
          const slot = document.getElementById('h38PlatformSlot');
          if (!slot) return;
          if (slot.classList.contains('is-filled')) window.H38FirstScreen.lockPlatform();
          else if (!window.H38_PLATFORM_NEXT && !window.H38_PLATFORM_DEEPEN) window.H38FirstScreen.release('platform');
        } catch (e) { /* slot already gone with a re-render */ }
      }, 6000);
    }

    /* ---- While You Were Away feed (reads real state.snapshot.proofLog) ---- */
    try {
      const kitSlot = document.getElementById('h38KitFeedSlot');
      if (kitSlot && window.H38KitFeed && typeof window.H38KitFeed.render === 'function') {
        window.H38KitFeed.render(kitSlot);
      }
    } catch (e) { console.warn('[H38 kit feed]', e && e.message ? e.message : e); }

    /* ---- Wire buttons (the Today block now sits above .h38-owner-home, so
     * wire every owner-home action button under #mainContent) ---- */
    document.querySelectorAll('#mainContent [data-action-idx]').forEach(btn => {
      const idx = parseInt(btn.dataset.actionIdx, 10);
      if (actionHandlers[idx]) btn.onclick = actionHandlers[idx];
    });
    document.querySelectorAll('.h38-action-ai').forEach(btn => {
      btn.onclick = () => {
        const prompt = btn.dataset.aiPrompt;
        openPage('ai');
        setTimeout(() => {
          const input = document.querySelector('#aiForm textarea, #aiForm input[name="question"]');
          if (input) { input.value = prompt; input.focus(); }
        }, 300);
      };
    });
    const viewAllTasks = document.getElementById('h38ViewAllTasks');
    if (viewAllTasks) {
      viewAllTasks.onclick = () => {
        if (window.H38TasksPage && typeof window.H38TasksPage.render === 'function') window.H38TasksPage.render();
        else openPage('work');
      };
    }
    const routeOpt = document.querySelector('[data-route-opt]');
    if (routeOpt) {
      routeOpt.onclick = () => {
        if (window.H38Route && typeof window.H38Route.optimize === 'function') window.H38Route.optimize();
        else openPage('schedule');
      };
    }
  }

  window.H38OwnerHome = Object.freeze({
    render: renderOwnerHome,
    build: '20261026-nobounce-2',
    detectBusinessType: detectBusinessType
  });

})();
