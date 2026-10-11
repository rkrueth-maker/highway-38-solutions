/* ---- H38 Owner Home (2026-10-11) ----
 * Phase 1 of the Owner Ease rebuild.
 * Replaces the stats-based Today page with an action center.
 *
 * Philosophy: "The owner doesn't have a learning curve."
 * - Every card has ONE clear action with a verb
 * - Plain language, no jargon
 * - If you need to explain it, redesign it
 * - 10-second test: could someone new figure it out?
 *
 * Build-Test-Polish-Test cycle applied.
 *
 * Integration:
 * - Script tag: <script src="./owner-home.js?build=20261011-owner-home-1"></script>
 * - Called from renderToday() in app-03.js
 * - Action cards link to existing pages OR Phase 2/3/4 guided flows (when available)
 */

(function() {
  'use strict';

  /* ---------- Data collectors ---------- */
  /* Each returns {count, items, summary} or null if nothing needs attention */

  function getPayrollStatus() {
    try {
      // Check for unprocessed time entries in the current pay period
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
        summary: `${empCount} employee${empCount === 1 ? '' : 's'} · ${Math.round(totalHours)} hours`,
        action: 'Review & Run →',
        actionFn: () => {
          if (window.H38GuidedPayroll && typeof window.H38GuidedPayroll.start === 'function') {
            window.H38GuidedPayroll.start();
          } else {
            openPage('payroll');
          }
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
        // Due within 7 days or overdue
        return dueDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      });
      if (!due.length) return null;

      const overdue = due.filter(b => new Date(v(b, 'Due Date') || 0) < now).length;
      const total = due.reduce((s, b) => s + num(v(b, 'Total') || v(b, 'Amount') || 0), 0);

      return {
        count: due.length,
        summary: `${due.length} bill${due.length === 1 ? '' : 's'} · $${total.toFixed(0)} total${overdue ? ` · ${overdue} overdue` : ''}`,
        urgent: overdue > 0,
        action: 'Review & Pay →',
        actionFn: () => {
          if (window.H38PayBills && typeof window.H38PayBills.start === 'function') {
            window.H38PayBills.start();
          } else {
            openPage('accounting');
          }
        },
        aiPrompt: 'Which bills should I pay first?'
      };
    } catch (e) { return null; }
  }

  function getLowStock() {
    try {
      // Use the same logic as inventory-checker.js
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
          if (window.H38OrderInventory && typeof window.H38OrderInventory.start === 'function') {
            window.H38OrderInventory.start();
          } else {
            openPage('inventory');
          }
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
          if (window.H38OverdueNudge && typeof window.H38OverdueNudge.start === 'function') {
            window.H38OverdueNudge.start();
          } else {
            openPage('money');
          }
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
      if (!open.length) return null;

      return {
        count: open.length,
        items: open.slice(0, 3).map(t => ({
          title: v(t, 'Task Title') || v(t, 'Title') || 'Task',
          assignee: v(t, 'Assigned To') || v(t, 'Assignee') || ''
        })),
        action: 'View Tasks →',
        actionFn: () => {
          if (window.H38TasksPage && typeof window.H38TasksPage.render === 'function') {
            window.H38TasksPage.render();
          } else {
            openPage('work');
          }
        }
      };
    } catch (e) { return null; }
  }

  function getTodaySchedule() {
    try {
      const events = records('scheduleEvents') || [];
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const todays = events
        .filter(e => {
          const d = new Date(v(e, 'Start Time') || 0);
          return d >= today && d < tomorrow;
        })
        .sort((a, b) => new Date(v(a, 'Start Time')) - new Date(v(b, 'Start Time')))
        .slice(0, 3);
      return todays.map(e => ({
        time: new Date(v(e, 'Start Time')).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        title: v(e, 'Title') || 'Event'
      }));
    } catch (e) { return []; }
  }

  /* ---------- Card renderers ---------- */

  function actionCard(icon, title, data, actionIdx) {
    const urgentClass = data.urgent ? ' h38-action-urgent' : '';
    const aiButton = data.aiPrompt ? `
      <button type="button" class="h38-action-ai" data-ai-prompt="${esc(data.aiPrompt)}" aria-label="Ask Kit about this">
        <span aria-hidden="true">🤖</span> Ask Kit
      </button>` : '';

    return `
      <section class="card h38-action-card${urgentClass}">
        <div class="h38-action-head">
          <span class="h38-action-icon" aria-hidden="true">${icon}</span>
          <div class="h38-action-text">
            <strong>${esc(title)}</strong>
            <small>${esc(data.summary)}</small>
          </div>
        </div>
        <div class="h38-action-buttons">
          <button type="button" class="primary h38-action-main" data-action-idx="${actionIdx}">
            ${esc(data.action)}
          </button>
          ${aiButton}
        </div>
      </section>`;
  }
  const actionHandlers = [];

  function registerAction(fn) {
    const idx = actionHandlers.length;
    actionHandlers[idx] = fn;
    return idx;
  }

  /* ---------- Main renderer ---------- */

  function renderOwnerHome() {
    // Reset handlers for this render
    actionHandlers.length = 0;

    // Collect action cards (most urgent first)
    const cards = [];

    const overdue = getOverdueInvoices();
    if (overdue) {
      const idx = registerAction(overdue.actionFn);
      cards.push({ urgent: true, html: actionCard('💵', `${overdue.count} invoice${overdue.count === 1 ? '' : 's'} overdue`, overdue, idx) });
    }

    const bills = getBillsDue();
    if (bills) {
      const idx = registerAction(bills.actionFn);
      cards.push({ urgent: bills.urgent, html: actionCard('💸', `${bills.count} bill${bills.count === 1 ? '' : 's'} due`, bills, idx) });
    }

    const payroll = getPayrollStatus();
    if (payroll) {
      const idx = registerAction(payroll.actionFn);
      cards.push({ urgent: false, html: actionCard('💰', 'Payroll ready to run', payroll, idx) });
    }

    const stock = getLowStock();
    if (stock) {
      const idx = registerAction(stock.actionFn);
      cards.push({ urgent: false, html: actionCard('📦', `Low stock: ${stock.count} item${stock.count === 1 ? '' : 's'}`, stock, idx) });
    }

    const quotes = getQuotesWaiting();
    if (quotes) {
      const idx = registerAction(quotes.actionFn);
      cards.push({ urgent: false, html: actionCard('🧾', `${quotes.count} quote${quotes.count === 1 ? '' : 's'} waiting`, quotes, idx) });
    }

    // Sort: urgent first
    cards.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));

    // Tasks section
    const tasks = getMyTasks();
    const tasksHtml = tasks ? `
      <section class="card h38-tasks-summary">
        <div class="h38-section-head">
          <h2>📋 My Tasks (${tasks.count})</h2>
          <button type="button" class="secondary small" id="h38ViewAllTasks">View all →</button>
        </div>
        <div class="list">
          ${tasks.items.map(t => `
            <div class="row">
              <div class="row-top"><strong>${esc(t.title)}</strong></div>
              ${t.assignee ? `<small>→ ${esc(t.assignee)}</small>` : ''}
            </div>`).join('')}
        </div>
      </section>` : '';

    // Schedule snapshot
    const schedule = getTodaySchedule();
    const scheduleHtml = `
      <section class="card">
        <h2>📅 Today</h2>
        <div class="list">
          ${schedule.length ? schedule.map(s => `
            <div class="row">
              <div class="row-top"><strong>${esc(s.time)}</strong></div>
              <small>${esc(s.title)}</small>
            </div>`).join('') : '<p class="muted">Nothing scheduled today.</p>'}
        </div>
      </section>`;

    // Quick actions
    const quickHtml = `
      <section class="card">
        <h2>⚡ Quick Actions</h2>
        <div class="h38-quick-grid">
          <button type="button" data-quick="quotes"><span aria-hidden="true">🧾</span>New Quote</button>
          <button type="button" data-quick="customers"><span aria-hidden="true">👤</span>New Customer</button>
          <button type="button" data-quick="sendtask"><span aria-hidden="true">📋</span>Send Task</button>
          <button type="button" data-quick="schedule"><span aria-hidden="true">🗓</span>Schedule</button>
        </div>
      </section>`;

    // Greeting
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const businessName = state.snapshot?.business?.businessName || 'Your Business';
    const userName = state.snapshot?.user?.name || state.snapshot?.user?.email || '';

    const needsAttention = cards.length;
    const headerHtml = `
      <header class="page-head h38-owner-head">
        <div>
          <h1>${esc(greeting)}${userName ? ', ' + esc(userName.split(' ')[0]) : ''}</h1>
          <p>${esc(businessName)}</p>
        </div>
      </header>`;

    const cardsHtml = cards.length ? `
      <div class="h38-section-label">
        <span class="h38-urgent-dot" aria-hidden="true">🔴</span>
        NEEDS YOU NOW (${needsAttention})
      </div>
      ${cards.map(c => c.html).join('')}` : `
      <section class="card h38-all-clear">
        <div class="h38-all-clear-inner">
          <span aria-hidden="true" style="font-size:2em">✅</span>
          <strong>All clear!</strong>
          <p class="muted">Nothing needs your attention right now.</p>
        </div>
      </section>`;

    // Assemble
    $('mainContent').innerHTML = headerHtml + `
      <div class="h38-owner-home">
        ${cardsHtml}
        ${tasksHtml}
        ${scheduleHtml}
        ${quickHtml}
      </div>`;

    // Wire action buttons
    document.querySelectorAll('.h38-action-main').forEach(btn => {
      const idx = parseInt(btn.dataset.actionIdx, 10);
      if (actionHandlers[idx]) {
        btn.onclick = actionHandlers[idx];
      }
    });

    // Wire AI buttons
    document.querySelectorAll('.h38-action-ai').forEach(btn => {
      btn.onclick = () => {
        const prompt = btn.dataset.aiPrompt;
        if (window.H38_AI_HANDOFF && typeof window.H38_AI_HANDOFF.runTask === 'function') {
          // Open AI page with the prompt
          openPage('ai');
          setTimeout(() => {
            const input = document.querySelector('#aiForm textarea, #aiForm input[name="question"]');
            if (input) {
              input.value = prompt;
              input.focus();
            }
          }, 300);
        } else {
          toast('AI helper is not available right now.', true);
        }
      };
    });

    // Wire tasks "View all"
    const viewAllTasks = $('h38ViewAllTasks');
    if (viewAllTasks) {
      viewAllTasks.onclick = () => {
        if (window.H38TasksPage && typeof window.H38TasksPage.render === 'function') {
          window.H38TasksPage.render();
        } else {
          openPage('work');
        }
      };
    }

    // Wire quick actions
    document.querySelectorAll('[data-quick]').forEach(btn => {
      btn.onclick = () => {
        const action = btn.dataset.quick;
        switch (action) {
          case 'quotes': openPage('quotes'); break;
          case 'customers': openPage('customers'); break;
          case 'schedule': openPage('schedule'); break;
          case 'sendtask':
            if (window.H38SendTask && typeof window.H38SendTask.start === 'function') {
              window.H38SendTask.start();
            } else {
              toast('Send Task is coming soon. Use the Work page for now.', true);
              openPage('work');
            }
            break;
        }
      };
    });
  }

  // Expose globally
  window.H38OwnerHome = Object.freeze({
    render: renderOwnerHome,
    build: '20261011-owner-home-1'
  });

})();
