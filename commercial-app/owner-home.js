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
        items: open.slice(0, 3).map(t => {
          const rawTitle = v(t, 'Task Title') || v(t, 'Title') || 'Task';
          const title = window.H38_HUMAN_NUMBERS ? window.H38_HUMAN_NUMBERS.scrubText(rawTitle, t) : rawTitle;
          /* P0 (2026-10-31): a Quote Review task row opens the actual
             persisted quote — the home summary is where the owner sees
             these tasks daily, so the deep link lives here, not only on
             the standalone Tasks page. */
          const qid = String(v(t, 'Quote ID') || v(t, 'Linked Record ID') || '');
          const isQuoteTask = !!qid && /quote/i.test(String(v(t, 'Task Type') || '') + ' ' + String(v(t, 'Task Domain') || '') + ' ' + title);
          return {
            title: title,
            assignee: v(t, 'Assigned To') || v(t, 'Assignee') || '',
            quoteId: isQuoteTask ? qid : ''
          };
        })
      };
    } catch (e) { return { count: 0, items: [] }; }
  }

  function getTodaySchedule() {
    try {
      const events = records('scheduleEvents') || [];
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      // Same start-time fields and status exclusions as the other Today
      // components (customer-readiness-polish, phone-first-office), so the
      // hero count reads the same booked calls from the same data on every
      // view. Reading only 'Start Time' missed events stored under the
      // variant field names and counted cancelled/completed events.
      const startOf = e => v(e, 'Start Time', 'startTime', 'Scheduled Time', 'scheduledAt');
      return events
        .filter(e => {
          if (/CANCEL|VOID|COMPLETE/.test(String(v(e, 'Status', 'status') || '').toUpperCase())) return false;
          const d = new Date(startOf(e) || 0);
          return d >= today && d < tomorrow;
        })
        .sort((a, b) => new Date(startOf(a)) - new Date(startOf(b)))
        .slice(0, 5)
        .map(e => ({
          time: new Date(startOf(e)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          title: v(e, 'Title') || v(e, 'Customer Name') || 'Event'
        }));
    } catch (e) { return []; }
  }

  /* ================= Contractor collectors ================= */

  function getTodaysJobs() {
    try {
      const jobs = records('jobs') || [];
      /* Schedule truth (C3): "today's jobs" are jobs dated today plus
       * in-progress jobs (H38ScheduleTruth.todayWork) — dateless
       * Scheduled/Approved jobs are needs-a-date work, not today's. */
      const ST = window.H38ScheduleTruth;
      const active = ST
        ? ST.todayWork(records('scheduleEvents') || [], jobs).todaysJobs.filter(j =>
            /IN[ _-]?PROGRESS|SCHEDULED|APPROVED/.test(String(v(j, 'Status') || '').toUpperCase()))
        : jobs.filter(j => {
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
      if (key === 'mileage') {
        /* 2026-11-03 startup bounce fix: this used to require the
         * mileage module (window.H38Mileage) to already be in the page —
         * the same loader race the platform frame below was fixed for.
         * mileage.js loads with the Today script group, so on the new
         * immediate first render the slot was skipped, then appeared at
         * its reserved 403px on the next render and shoved everything
         * below it down. Decide from the same DATA mileage.js enabled()
         * reads, all of it present at render: the snapshot's
         * mileage_tracking module row, and the mileage_tracking_enabled
         * feature toggle (server FeatureToggles win over this device's
         * localStorage copy, per owner-controls getToggles(); default
         * ON per mileage.js FEATURE_DEF). If the card still never comes,
         * the render's backstop releases the empty reservation. */
        const mods = (state.snapshot && state.snapshot.moduleSettings) || [];
        const pilot = mods.some(row => String((row && (row.moduleKey || row.module_key)) || '').trim() === 'mileage_tracking' && row.enabled === true);
        if (!pilot) return false;
        let toggle;
        try {
          const rows = (state.snapshot && state.snapshot.FeatureToggles) || [];
          const bid = String(state.businessId || '');
          const mine = rows.filter(row => String((row && (row['Business ID'] || row.businessId)) || '').trim() === bid);
          mine.sort((a, b) => String((b && (b['Updated Time'] || b.updatedAt)) || '').localeCompare(String((a && (a['Updated Time'] || a.updatedAt)) || '')));
          const server = mine[0] && (mine[0].Toggles || mine[0].toggles);
          if (server && typeof server === 'object' && server.mileage_tracking_enabled !== undefined) toggle = server.mileage_tracking_enabled;
          if (toggle === undefined) {
            const raw = localStorage.getItem('h38-feature-toggles-' + bid);
            const local = raw ? JSON.parse(raw) : null;
            if (local && local.mileage_tracking_enabled !== undefined) toggle = local.mileage_tracking_enabled;
          }
        } catch (e) { /* toggle unreadable: fall through to the default */ }
        return toggle === undefined ? true : toggle === true;
      }
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
    build: '20261103-bouncefix-2',
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
          // height NOW, synchronously. The platform modules are core
          // script tags and renderOwnerHome renders the stack inside its
          // own task (see the synchronous platform render below), so this
          // lock lands before the browser can paint the home: the frame's
          // first painted height is its final height. The previous
          // double-rAF deferral assumed the fill itself happened before
          // first paint — true only while the modules were already in
          // the page; when they arrived late (dynamic loader, network
          // first), the deferred lock fired seconds after paint and
          // everything below the frame visibly jumped.
          window.H38FirstScreen.lockPlatform();
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

  /* ================= Front door (gap8, 2026-11-07) =================
   * Item 8 of the competitor-gap build program: a chat-front-door home
   * screen + persistent setup checklist (Swivl pattern), rendered HERE,
   * synchronously, inside the owner home's own first paint — not inserted
   * after paint the way today-command-setup.js used to (a late insertion
   * at the TOP of Today would shove every painted block below it, the
   * exact opening-bounce defect class the first-screen frames exist to
   * kill). Everything below renders from the already-loaded snapshot:
   * 0 new server reads, 0 new RPCs, no observers, no timers.
   *
   * Part A — front door:
   * - A plain-English question box ("Ask anything") that submits into
   *   the EXISTING Kit owner chat: today-command-setup.js owns the
   *   routing (H38_TODAY_COMMAND_SETUP.openChat → H38_OWNER_CHAT.send,
   *   the ai_handoff_tasks 'owner_chat' pipeline); the answer comes
   *   back through the existing chat surface on the 'ai' page. No
   *   second chat, no second AI path. When the routing module has not
   *   loaded yet, frontAskFallback() opens the chat page and polls for
   *   its own form — send via the owner chat when it is available,
   *   otherwise prefill, exactly the legacy fallback behavior.
   * - A KPI strip computed from snapshot records only (see
   *   computeFrontDoorKpis for the exact rules; every number is
   *   reproducible from SQL over the same stores the snapshot merges).
   *
   * Part B — persistent setup checklist:
   * - Steps complete ONLY from real state (computeSetupSteps). The card
   *   renders on every Today open until every determinable step is
   *   done, then it does not render at all. Settings keeps its own
   *   "Business setup & onboarding" section, named in the card footer,
   *   so a finished business can still find setup again.
   * - The Oct-30 step list's logo and AI-answering steps are REMOVED:
   *   both are optional add-ons, not setup. A business with the H38
   *   default logo and the AI receptionist off by choice is fully set
   *   up, and the old list nagged exactly those businesses forever
   *   (verified on Rick's H38 tenant: brandConfig has no custom logo
   *   and ai_receptionist is off, while every core milestone below is
   *   genuinely complete). In their place: first quote, first job,
   *   and the portal/deposit settings reviews the task names.
   * - A step whose state the snapshot cannot confirm (done === null —
   *   the businessProfile collection is absent from this snapshot,
   *   e.g. crowded out of the broad first page on a high-churn tenant)
   *   is shown as "Check" and excluded from the count, never counted
   *   as done or as missing. The exclusion is stated on the card.
   *
   * Module intake (MODULE_PERFORMANCE_STANDARD): route 'today'
   * (existing, Today-critical, read-only). Canonical owner: this
   * renderer (owner-home.js); today-command-setup.js is the routing /
   * refresh companion and delegates here when this front door exists.
   * Server owners: none new — snapshot only. Cache: none (TTL 0),
   * recomputed on each Today render; H38OwnerHome.refreshFrontDoor()
   * re-renders only the KPI + checklist sub-blocks (never the ask
   * form, so typed text survives a snapshot refresh). Writes: none.
   * Failure: any front-door computation is try/caught to an empty
   * block — the rest of Today renders exactly as before. */

  const FRONT_DOOR_BUILD = '20261110-onboarding-polish-1';

  function frontRecords(name) {
    try { const r = records(name); return Array.isArray(r) ? r : []; } catch (e) { return []; }
  }
  function frontText(x) { return String(x == null ? '' : x).trim(); }
  function frontIsExample(row) {
    const hay = ['Quote Number', 'Job Number', 'Invoice Number', 'Project Title', 'Status']
      .map(k => v(row, k)).join(' ');
    // Internal-only rows (e.g. the provisioned GENERIC-QUOTE-CUSTOMER
    // placeholder) are not the business's real records — never count
    // them toward setup progress (found 2026-11-10: a fresh trial
    // tenant's Customers step read done before the owner added anyone).
    return /\bDEMO\b|\bEX-/i.test(hay) || (row && row['Example Data'] === true) ||
      (row && row['Internal Only'] === true);
  }
  function frontCanFinancial() {
    try {
      if (typeof window.can === 'function') return !!(window.can('manageFinancial') || window.can('viewFinancial') || window.can('manageSettings'));
      const u = (state.snapshot && state.snapshot.user) || {};
      return !!(u.owner === true || (u.permissions && (u.permissions.all === true || u.permissions.manageFinancial === true || u.permissions.viewFinancial === true || u.permissions.manageSettings === true)));
    } catch (e) { return false; }
  }
  function frontSetupAllowed() {
    try {
      const u = (state.snapshot && state.snapshot.user) || {};
      return u.owner === true || !!(u.permissions && (u.permissions.all === true || u.permissions.manageSettings === true || u.permissions.manageUsers === true));
    } catch (e) { return false; }
  }
  function frontMoney(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  /* First finite numeric field among keys, else null. A stored 0 is a
   * real answer (nothing owed on that invoice), not a missing field. */
  function frontNumField(row, keys) {
    for (const k of keys) {
      const raw = row ? row[k] : undefined;
      if (raw === undefined || raw === null || raw === '') continue;
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  /* KPI rules (each is a pure function of the snapshot):
   * - Money owed: invoices whose status is not paid/closed/void/
   *   cancelled/draft, summed by the first stored balance field
   *   ('Balance Due' → 'Amount Due' → 'Open Balance' → 'Balance'),
   *   else Total − Amount Paid, floored at 0 per invoice. This is the
   *   customer-readiness invoiceBalance rule plus the 'Balance' field
   *   the portal invoice rows carry (their only balance field).
   * - Jobs today: scheduleEvents starting today (local), excluding
   *   cancelled/void/completed — the same rule getTodaySchedule uses.
   * - Open quotes: quotes in draft/sent/presented state (example rows
   *   excluded, the attention collectors' filter).
   * - Jobs done this week: jobs in a complete status whose completion
   *   stamp ('Completed Time'/'Completed Date', else 'Updated Time')
   *   falls in this Mon–Sun week (local). */
  function computeFrontDoorKpis() {
    const out = { moneyOwed: 0, moneyOwedCount: 0, todayJobs: 0, openQuotes: 0, jobsDoneWeek: 0 };
    try {
      frontRecords('invoices').forEach(inv => {
        const status = String(v(inv, 'Status', 'status') || '').toUpperCase();
        if (/PAID|CLOSED|VOID|CANCEL|DRAFT/.test(status)) return;
        let bal = frontNumField(inv, ['Balance Due', 'Amount Due', 'Open Balance', 'Balance']);
        if (bal === null) {
          const total = frontNumField(inv, ['Total', 'total', 'Amount', 'amount']) || 0;
          const paid = frontNumField(inv, ['Amount Paid', 'amountPaid', 'Paid', 'paid']) || 0;
          bal = Math.max(0, total - paid);
        }
        if (bal > 0.005) { out.moneyOwed += bal; out.moneyOwedCount++; }
      });
      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const startOf = e => v(e, 'Start Time', 'startTime', 'Scheduled Time', 'scheduledAt');
      out.todayJobs = frontRecords('scheduleEvents').filter(e => {
        if (/CANCEL|VOID|COMPLETE/.test(String(v(e, 'Status', 'status') || '').toUpperCase())) return false;
        const d = new Date(startOf(e) || 0);
        return d >= dayStart && d < dayEnd;
      }).length;
      out.openQuotes = frontRecords('quotes').filter(q => {
        if (frontIsExample(q)) return false;
        return /DRAFT|SENT|PRESENT/.test(String(v(q, 'Status', 'status') || '').toUpperCase());
      }).length;
      const monday = new Date(dayStart.getTime() - ((dayStart.getDay() + 6) % 7) * 24 * 60 * 60 * 1000);
      const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
      out.jobsDoneWeek = frontRecords('jobs').filter(j => {
        if (!/COMPLETE|COMPLETED/.test(String(v(j, 'Status', 'status') || '').toUpperCase())) return false;
        const stamp = v(j, 'Completed Time', 'Completed Date', 'completedAt') || v(j, 'Updated Time', 'updatedAt');
        const d = new Date(stamp || 0);
        return Number.isFinite(d.getTime()) && d >= monday && d < nextMonday;
      }).length;
    } catch (e) { /* KPIs are decoration on real data; Today must render without them */ }
    return out;
  }

  function frontKpiTilesHtml(kpis) {
    const tiles = [];
    if (frontCanFinancial()) tiles.push({ page: 'money', value: frontMoney(kpis.moneyOwed), label: 'Money owed to you', sub: kpis.moneyOwedCount + (kpis.moneyOwedCount === 1 ? ' open invoice' : ' open invoices') });
    tiles.push({ page: 'schedule', value: String(kpis.todayJobs), label: 'Jobs today', sub: 'On today\u2019s schedule' });
    tiles.push({ page: 'quotes', value: String(kpis.openQuotes), label: 'Open quotes', sub: 'Draft, sent or presented' });
    tiles.push({ page: 'work', value: String(kpis.jobsDoneWeek), label: 'Jobs done this week', sub: 'Completed Mon\u2013Sun' });
    return tiles.map(t => `
      <button type="button" class="h38-kpi-tile" data-front-kpi-page="${esc(t.page)}">
        <strong>${esc(t.value)}</strong><span>${esc(t.label)}</span><small>${esc(t.sub)}</small>
      </button>`).join('');
  }

  /* Setup steps: the SAME computation renders the card and counts it.
   * done: true = genuinely complete from real state; false = provably
   * not done; null = the snapshot cannot confirm it (excluded from
   * both the done count and the total, and the card says so). */
  function computeSetupSteps() {
    const snap = (state && state.snapshot) || {};
    const steps = [];
    /* 1. Business profile — two genuine sources: the guided-setup
     * record (ai-onboarding.js saves collection 'businessProfile')
     * and the provisioning record every tenant starts with
     * (collection 'businessProfiles', written by signup with the
     * business's legal/display name and the owner's email). Reading
     * only the first left this step permanently "couldn't confirm"
     * on a fresh trial tenant even though a real profile exists
     * (found 2026-11-10). Complete = a row with a name and at least
     * one contact field. Neither collection in the snapshot = unknown. */
    const profiles = Array.isArray(snap.businessProfile) ? snap.businessProfile
      : (Array.isArray(snap.businessProfiles) ? snap.businessProfiles : null);
    if (!profiles) {
      steps.push({ id: 'profile', title: 'Business profile', detail: 'Name, phone, email and address', page: 'settings', done: null });
    } else {
      const prof = profiles[0] || {};
      const done = !!frontText(v(prof, 'Business Name', 'businessName', 'Legal Name', 'Display Name')) &&
        !!(frontText(v(prof, 'Phone', 'phone')) || frontText(v(prof, 'Email', 'email', 'Owner Email')) || frontText(v(prof, 'Address', 'address')));
      steps.push({ id: 'profile', title: 'Business profile', detail: 'Name, phone, email and address', page: 'settings', done: done });
    }
    /* 2. Services & pricing — ≥1 price-book item (snapshot.priceBook,
     * the relational price_book_items the Quote Builder reads). */
    const priceCount = frontRecords('priceBook').length;
    steps.push({ id: 'services', title: 'Services & pricing', detail: priceCount + (priceCount === 1 ? ' price-book item' : ' price-book items'), page: 'quotes', done: priceCount >= 1 });
    /* 3. Customers — ≥1 real customer (example rows excluded). */
    const custCount = frontRecords('customers').filter(r => !frontIsExample(r)).length;
    steps.push({ id: 'customers', title: 'Customers', detail: custCount + (custCount === 1 ? ' customer' : ' customers'), page: 'customers', done: custCount >= 1 });
    /* 4. First quote — ≥1 quote record exists. */
    const quoteCount = frontRecords('quotes').length;
    steps.push({ id: 'quote', title: 'First quote', detail: quoteCount + (quoteCount === 1 ? ' quote' : ' quotes'), page: 'quotes', done: quoteCount >= 1 });
    /* 5. First job — ≥1 job record exists. (Not "a job on the
     * schedule": scheduleEvents is a separate, legitimately empty
     * collection for businesses that work from the jobs list — H38
     * itself has jobs and no schedule events — so the honest setup
     * milestone is the job record.) */
    const jobCount = frontRecords('jobs').length;
    steps.push({ id: 'job', title: 'First job', detail: jobCount + (jobCount === 1 ? ' job' : ' jobs'), page: 'work', done: jobCount >= 1 });
    /* 6. Team — ≥1 member beyond the owner (snapshot.users is the
     * membership list). Absent collection = unknown. */
    const users = snap.users;
    if (!Array.isArray(users)) {
      steps.push({ id: 'team', title: 'Team', detail: 'Add someone besides the owner', page: 'people', done: null });
    } else {
      const teamCount = Math.max(0, users.length - 1);
      steps.push({ id: 'team', title: 'Team', detail: teamCount + (teamCount === 1 ? ' team member beyond the owner' : ' team members beyond the owner'), page: 'people', done: users.length >= 2 });
    }
    /* 7+8. Portal / deposit settings reviewed — a moduleSettings row
     * whose config carries updatedAt. Provisioning creates both rows
     * with an empty config, so mere existence proves nothing; the
     * updatedAt stamp is written only by the Owner Controls saves
     * (owner-controls.js setCustomerPortal / setSignedDepositEnabled),
     * i.e. a person actually reviewed and saved the setting. */
    const settings = Array.isArray(snap.moduleSettings) ? snap.moduleSettings : [];
    const settingRow = key => settings.find(r => frontText((r && (r.moduleKey || r.module_key)) || '') === key) || null;
    /* A save stamped BEFORE this business existed cannot be this
     * business's review: trial provisioning clones module settings
     * (including another tenant's updatedAt/updatedBy) into the new
     * tenant, which made both steps read done on day one (found
     * 2026-11-10). Compare against the provisioning profile's
     * creation time when it is known. */
    const bizCreatedMs = profiles && profiles[0] ? Date.parse(frontText(v(profiles[0], 'Created Time', 'Trial Start')) || '') : NaN;
    const reviewed = row => {
      if (!(row && row.config && frontText(row.config.updatedAt))) return false;
      const stampMs = Date.parse(frontText(row.config.updatedAt) || '');
      if (Number.isFinite(bizCreatedMs) && Number.isFinite(stampMs) && stampMs < bizCreatedMs) return false;
      return true;
    };
    const portalRow = settingRow('customer_portal');
    steps.push({ id: 'portal', title: 'Customer portal', detail: portalRow ? (reviewed(portalRow) ? 'Settings saved — portal is ' + (portalRow.enabled === true ? 'on' : 'off') : 'Portal is ' + (portalRow.enabled === true ? 'on' : 'off') + ' — review & save the setting') : 'Portal setting not saved yet', page: 'settings', done: reviewed(portalRow) });
    const depositRow = settingRow('signed_deposit_acceptance');
    const depositPct = depositRow && depositRow.config && Number.isFinite(Number(depositRow.config.depositPercent)) ? Number(depositRow.config.depositPercent) : null;
    steps.push({ id: 'deposit', title: 'Deposit settings', detail: depositRow ? (reviewed(depositRow) ? 'Settings saved' + (depositPct !== null ? ' — default deposit ' + depositPct + '%' : '') : 'Review & save your deposit setting') : 'Deposit setting not saved yet', page: 'settings', done: reviewed(depositRow) });
    return steps;
  }

  function frontChecklistHtml() {
    const steps = computeSetupSteps();
    const determinable = steps.filter(s => s.done !== null);
    const done = determinable.filter(s => s.done === true).length;
    if (!determinable.length || done === determinable.length) return '';
    const rowsHtml = steps.map(step => {
      const stateName = step.done === null ? 'check' : (step.done ? 'done' : 'todo');
      const mark = step.done === null ? '?' : (step.done ? '✓' : '○');
      return `<button type="button" class="h38-setup-step h38-setup-step--${stateName}" data-front-setup-page="${esc(step.page)}">
        <span class="h38-setup-mark" aria-hidden="true">${mark}</span>
        <span class="h38-setup-text"><strong>${esc(step.title)}</strong><small>${esc(step.detail)}${step.done === null ? ' — couldn\u2019t confirm from your records' : ''}</small></span>
        <span class="h38-setup-go" aria-hidden="true">→</span></button>`;
    }).join('');
    const unknown = steps.filter(s => s.done === null).length;
    return `<section class="card h38-setup-card" id="h38TodaySetupChecklist" aria-label="Finish setting up">
      <h2>🧭 Finish setting up</h2>
      <p class="h38-setup-progress"><strong>${done} of ${determinable.length} set up</strong>${unknown ? ' · ' + unknown + ' step' + (unknown === 1 ? '' : 's') + ' couldn\u2019t be confirmed from your records and isn\u2019t counted' : ''}</p>
      <div class="h38-setup-list">${rowsHtml}</div>
      <p class="muted small">Tap a step to go where it\u2019s finished. This card disappears once every step above is set up — you can find setup again any time in Settings, under \u201cBusiness setup &amp; onboarding\u201d.</p>
      <p class="muted small">New here? <button type="button" class="secondary" data-h38-tour>🎓 Take the office tour</button> <button type="button" class="secondary" data-h38-guide="first-launch">🚀 Walk through your first steps</button></p></section>`;
  }

  function buildFrontDoorHtml() {
    try {
      const chatAllowed = (typeof window.H38ModuleVisible !== 'function' || window.H38ModuleVisible('ownerChat') !== false);
      const askHtml = chatAllowed ? `
      <section class="card h38-front-ask" aria-label="Ask your Office">
        <h2>✨ Ask anything</h2>
        <p class="muted">Ask in plain English and Kit answers from your real records — the answer lands in your saved chat thread, on your phone or at your desk.</p>
        <form id="h38FrontAskForm" class="h38-command-form">
          <input type="text" id="h38FrontAskInput" name="question" placeholder="Ask anything — who owes me money? what\u2019s today?" aria-label="Ask Kit a question" autocomplete="off">
          <button type="submit" class="primary">Ask Kit →</button>
        </form>
        <div class="h38-command-chips" role="group" aria-label="Try asking">
          <button type="button" data-front-chip="Who owes me money?">Who owes me money?</button>
          <button type="button" data-front-chip="What\u2019s on the schedule today?">What\u2019s on the schedule today?</button>
          <button type="button" data-front-chip="Who hasn\u2019t answered their quote?">Who hasn\u2019t answered their quote?</button>
        </div>
      </section>` : '';
      const kpis = computeFrontDoorKpis();
      return `<div id="h38TodayCommandSetup" class="h38-today-command-setup h38-front-door">
        ${askHtml}
        <section class="h38-kpi-strip" id="h38FrontKpis" aria-label="Your numbers">${frontKpiTilesHtml(kpis)}</section>
        <div id="h38TodaySetupSlot">${frontSetupAllowed() ? frontChecklistHtml() : ''}</div>
      </div>`;
    } catch (e) { return ''; }
  }

  /* Chat routing: the routing module (today-command-setup.js, in the
   * Today page group) owns openChat; use it whenever it is present.
   * The fallback below only opens the existing chat page and polls for
   * its own form — it sends through the same H38_OWNER_CHAT API when
   * that is available, otherwise it prefills the form for the legacy
   * Ask Hank path. No second chat is built in either path. */
  function frontAskFallback(question) {
    openPage('ai');
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      const chatApi = window.H38_OWNER_CHAT;
      if (chatApi && typeof chatApi.send === 'function' && typeof chatApi.handlesWorkspaceChat === 'function' && chatApi.handlesWorkspaceChat()) {
        clearInterval(timer);
        chatApi.send(question);
        return;
      }
      const input = document.querySelector('#kwAiForm textarea, #kwAiForm input[name="question"]');
      if (input) {
        clearInterval(timer);
        input.value = question;
        try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
        if (input.scrollIntoView) input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (tries >= 25) clearInterval(timer);
    }, 200);
  }
  function frontAsk(question) {
    const q = String(question || '').trim();
    if (!q) return;
    const router = window.H38_TODAY_COMMAND_SETUP;
    if (router && typeof router.openChat === 'function') { router.openChat(q, true); return; }
    frontAskFallback(q);
  }

  function bindFrontDoor() {
    const root = document.getElementById('h38TodayCommandSetup');
    if (!root || root.dataset.h38FrontBound === '1') return;
    root.dataset.h38FrontBound = '1';
    const form = root.querySelector('#h38FrontAskForm');
    if (form) form.addEventListener('submit', event => {
      event.preventDefault();
      const input = root.querySelector('#h38FrontAskInput');
      frontAsk(input ? input.value : '');
    });
    root.querySelectorAll('[data-front-chip]').forEach(btn => {
      btn.addEventListener('click', () => frontAsk(btn.getAttribute('data-front-chip')));
    });
    bindFrontDoorDynamic(root);
  }
  /* KPI tiles + checklist steps are the parts refreshFrontDoor()
   * rewrites, so their binding lives apart from the ask form's. */
  function bindFrontDoorDynamic(root) {
    root.querySelectorAll('[data-front-kpi-page]').forEach(btn => {
      btn.onclick = () => openPage(btn.getAttribute('data-front-kpi-page'));
    });
    root.querySelectorAll('[data-front-setup-page]').forEach(btn => {
      btn.onclick = () => openPage(btn.getAttribute('data-front-setup-page'));
    });
  }

  /* Snapshot-refresh path (called by today-command-setup.js on
   * h38:business-snapshot-updated): rewrite ONLY the KPI strip and the
   * checklist slot. The ask form — including anything the owner has
   * typed into it — is never touched. */
  function refreshFrontDoor() {
    try {
      const root = document.getElementById('h38TodayCommandSetup');
      if (!root || !root.classList.contains('h38-front-door')) return false;
      const kpiEl = root.querySelector('#h38FrontKpis');
      if (kpiEl) kpiEl.innerHTML = frontKpiTilesHtml(computeFrontDoorKpis());
      const slot = root.querySelector('#h38TodaySetupSlot');
      if (slot) slot.innerHTML = frontSetupAllowed() ? frontChecklistHtml() : '';
      bindFrontDoorDynamic(root);
      return true;
    } catch (e) { return false; }
  }


  /* ================= Main renderer ================= */

  function renderOwnerHome() {
    actionHandlers.length = 0;
    // Each home render builds a fresh platform frame; the fill/lock state
    // belongs to that frame, so it starts empty for every render. Before
    // nobounce-4 the state survived across renders, so a second Today view
    // in the same session got a frame that could never lock.
    platformFillState.cards = {};
    platformFillState.lockQueued = false;
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
        ${tasks.items.length ? tasks.items.map(t => t.quoteId ? `
          <button type="button" class="h38-task-row" data-home-open-quote="${esc(t.quoteId)}" style="width:100%;text-align:left;background:none;border:none;cursor:pointer;padding:0;font:inherit">
            <span class="h38-task-check" aria-hidden="true"></span>
            <div><strong>${esc(t.title)}</strong>${t.assignee ? `<small>→ ${esc(t.assignee)}</small>` : ''}<small> · Open quote →</small></div>
          </button>` : `
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
      /* Schedule truth (C3): the bare "Nothing scheduled today" claim is
       * only truthful when nothing is timed today, nothing is in
       * progress, and no active job is waiting for a date. */
      const twHome = window.H38ScheduleTruth
        ? window.H38ScheduleTruth.todayWork(records('scheduleEvents') || [], records('jobs') || [])
        : null;
      const schedEmpty = schedule.length ? '' : (twHome && twHome.inProgress.length
        ? `<p class="muted" style="margin:0">Nothing timed on the calendar today — in progress now:</p>` + twHome.inProgress.slice(0, 5).map(j => `
            <div class="h38-sched-row">
              <span class="h38-sched-time">In progress</span>
              <span class="h38-sched-title">${esc(v(j, 'Project Title') || 'Job')}</span>
            </div>`).join('')
        : (twHome && twHome.needsDateJobs.length
          ? `<p class="muted" style="margin:0">No timed work today — ${twHome.needsDateJobs.length} active job${twHome.needsDateJobs.length === 1 ? '' : 's'} still need${twHome.needsDateJobs.length === 1 ? 's' : ''} a date. See Schedule to give ${twHome.needsDateJobs.length === 1 ? 'it' : 'them'} one.</p>`
          : '<p class="muted" style="margin:0">Nothing scheduled today.</p>'));
      scheduleHtml = `
        <section class="h38-schedule-card">
          <h2>📅 Today</h2>
          ${schedule.length ? schedule.map(s => `
            <div class="h38-sched-row">
              <span class="h38-sched-time">${esc(s.time)}</span>
              <span class="h38-sched-title">${esc(s.title)}</span>
            </div>`).join('') : schedEmpty}
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

    /* ---- Front door (gap8): computed from the same snapshot, in
     * this render — see the Front door section above. ---- */
    const frontDoorHtml = buildFrontDoorHtml();

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
    $('mainContent').innerHTML = headerHtml + frontDoorHtml + trioFramesHtml + todayFirstHtml + mileageSlotHtml + platformSlotHtml + firstSlotsBelow + `
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
          ['h38TimeFrame', 'h38AccessFrame'].forEach(id => {
            const frame = document.getElementById(id);
            if (frame && !frame.classList.contains('is-filled')) frame.classList.add('is-released');
          });
        } catch (e) { /* frames already gone with a re-render */ }
      }, 4000);
      /* 2026-11-03 startup bounce fix: the ready workspace is core Today
       * content whose module arrives through the background preload chain;
       * on a cold profile it can land after the generic 4s grace, and the
       * old single timer collapsed its tall reservation first — the whole
       * screen rode up by the frame's height (~720px measured on desktop),
       * then back down when the card landed. The ready frame gets a longer
       * grace, in line with the platform frame's 6s backstop. */
      setTimeout(() => {
        try {
          const frame = document.getElementById('h38ReadyFrame');
          if (frame && !frame.classList.contains('is-filled')) frame.classList.add('is-released');
        } catch (e) { /* frame already gone with a re-render */ }
      }, 8000);
    }
    if (mileageSlotHtml) {
      /* Same backstop pattern as the platform frame below: if the
       * mileage card never comes (module load failure, toggle changed),
       * collapse the empty reservation instead of leaving a permanent
       * hole. A filled slot never collapses — release() refuses — so
       * this can only settle an empty frame in a degraded load. */
      setTimeout(() => {
        try { window.H38FirstScreen.release('mileage'); } catch (e) { /* slot already gone with a re-render */ }
      }, 6000);
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

    /* ---- Platform owner stack (Owner Command Center + Owner operating
     * cockpit): render it NOW, inside this render task. platform-next.js
     * and platform-deepen.js are core deferred script tags in index.html,
     * so both modules are always loaded before any home render can run;
     * rendering the stack synchronously here — and locking its frame
     * synchronously in fill() — means the frame's first painted height
     * is its final height on every open. Before nobounce-4 the modules
     * arrived through a two-step dynamic loader (network-first), seconds
     * after the home painted on a phone, and the frame then grew to fit
     * the stack (or shrank at the lock), jumping everything below it —
     * on owner sessions only, which is why test profiles never saw it.
     * The modules' event-driven renders remain the refresh path for
     * later snapshot updates. ---- */
    try {
      if (platformSlotHtml) {
        if (window.H38_PLATFORM_NEXT && typeof window.H38_PLATFORM_NEXT.renderToday === 'function') window.H38_PLATFORM_NEXT.renderToday();
        if (window.H38_PLATFORM_DEEPEN && typeof window.H38_PLATFORM_DEEPEN.renderToday === 'function') window.H38_PLATFORM_DEEPEN.renderToday();
      }
    } catch (e) { console.warn('[H38 platform stack]', e && e.message ? e.message : e); }

    /* ---- Customer-ready workspace (Next Action / Up Next / Today's
     * Work): same treatment as the platform stack. When
     * customer-readiness-polish.js has already loaded (it rides the
     * loader's background preload chain), fill the ready frame NOW,
     * inside this render task, so the frame's first painted height is
     * its final height. Before this, the module filled the frame from
     * later snapshot events — on the phone the frame was 0px tall until
     * then, so everything below jumped by the card's full height
     * (~740-780px) when it landed. When the module has not loaded yet,
     * the reserved frame height holds the space and the module's
     * event-driven fill remains the refresh path. ---- */
    try {
      if (window.H38_CUSTOMER_READINESS && typeof window.H38_CUSTOMER_READINESS.enhanceToday === 'function') window.H38_CUSTOMER_READINESS.enhanceToday();
    } catch (e) { console.warn('[H38 customer ready]', e && e.message ? e.message : e); }

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
    document.querySelectorAll('[data-home-open-quote]').forEach(btn => {
      btn.onclick = () => {
        const quoteId = btn.getAttribute('data-home-open-quote');
        Promise.resolve(openPage('quotes')).then(() => {
          if (typeof window.openQuote === 'function') window.openQuote(quoteId);
          else if (typeof window.toast === 'function') window.toast('That quote could not be opened from here.', true);
        });
      };
    });
    bindFrontDoor();
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
    build: '20261110-onboarding-polish-1',
    detectBusinessType: detectBusinessType,
    computeSetupSteps: computeSetupSteps,
    computeFrontDoorKpis: computeFrontDoorKpis,
    refreshFrontDoor: refreshFrontDoor
  });

})();
