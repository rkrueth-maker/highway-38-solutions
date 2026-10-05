/* Deal alerts for the H38 Business Office — watch-rule engine.
 *
 * Owners define watch rules; check passes scan real business records and raise
 * Open alerts via recordAlert() (24h dedupe per Alert Type + Title). Open alerts
 * surface on the Today page. Other modules can raise alerts directly through
 * window.H38DealAlerts.recordAlert().
 *
 * Collections:
 *   alertRules: 'Rule ID','Business ID','Rule Name','Rule Type'
 *               ('price_drop'|'quote_aging'|'low_stock'),'Threshold Percent',
 *               'Status' ('Active'|'Paused'),'Created By','Created Time',
 *               'Record Version'
 *   alerts:     'Alert ID','Business ID','Rule ID','Alert Type','Title','Detail',
 *               'Severity' ('info'|'warn'|'urgent'),
 *               'Status' ('Open'|'Acknowledged'|'Dismissed'),
 *               'Created Time','Record Version'
 *
 * Rule types:
 *   price_drop  — newest vs previous selling price per item in priceHistory;
 *                 alerts when the drop is >= 'Threshold Percent' (default 10).
 *                 No priceHistory rows yet -> the check is a silent no-op.
 *   quote_aging — quotes with Status containing DRAFT or SENT older than
 *                 'Threshold Percent' days (default 7), dated by 'Created Time'
 *                 with 'Updated Time' fallback. Quotes without a usable date
 *                 are skipped, never alerted.
 *   low_stock   — priceBook items whose on-hand (from inventoryTransactions)
 *                 is at or under 'Reorder Point'. Threshold is not used.
 *
 * BUILD 20261004-deal-alerts-1
 */

// Owner Controls toggle registration. Runs at load; deal-alerts.js is included
// AFTER owner-controls.js in index.html. Registered without editing
// owner-controls.js — Owner Controls renders FEATURES entries from the array.
try {
  var __daOc = window.H38OwnerControls;
  var __daToggle = { id: 'deal_alerts', title: 'Deal alerts', desc: 'Watch rules for price drops and deal conditions; open alerts surface on the Today page.', icon: '🎯', default: true, category: 'Money' };
  if (__daOc && __daOc.FEATURES && !__daOc.FEATURES.some(function (f) { return f && f.id === __daToggle.id; })) __daOc.FEATURES.push(__daToggle);
} catch (e) {}

const DEAL_ALERT_RULE_TYPES = { price_drop: 'Price drop', quote_aging: 'Quote aging', low_stock: 'Low stock' };
const DEAL_ALERT_SEVERITIES = ['info', 'warn', 'urgent'];
const DEAL_ALERT_AUTOCHECK_KEY = 'h38-deal-alerts-lastcheck';
const DEAL_ALERT_AUTOCHECK_MS = 3600000; // at most one silent auto-check per hour per business

function dealAlertsEnabled() {
  try { return !!(window.H38OwnerControls && window.H38OwnerControls.isEnabled('deal_alerts')); }
  catch (e) { return false; }
}

function activeAlertRules(ruleType) {
  return records('alertRules').filter(function (row) {
    if (isTestRecord(row)) return false;
    if (String(v(row, 'Status')).toUpperCase() !== 'ACTIVE') return false;
    if (ruleType && String(v(row, 'Rule Type')) !== ruleType) return false;
    return true;
  });
}

function ruleThreshold(row, fallback) {
  const t = num(v(row, 'Threshold Percent'));
  return t > 0 ? t : fallback;
}

// ---------------------------------------------------------------------------
// recordAlert — deduped alert writer, exposed for other modules.
// Skips when an Open alert with the same Alert Type + Title was created in the
// last 24 hours. Returns the written record, or null when deduped.
// ---------------------------------------------------------------------------
async function recordAlert(input) {
  const args = input || {};
  const type = String(args.type || '').trim();
  const title = String(args.title || '').trim();
  if (!type || !title) throw new Error('Alert type and title are required.');
  const severity = DEAL_ALERT_SEVERITIES.includes(args.severity) ? args.severity : 'info';
  const detail = String(args.detail || '');
  const ruleId = String(args.ruleId || '');
  const since = Date.now() - 24 * 3600000;
  const dup = records('alerts').some(function (row) {
    return String(v(row, 'Status')).toUpperCase() === 'OPEN'
      && String(v(row, 'Alert Type')) === type
      && String(v(row, 'Title')) === title
      && new Date(v(row, 'Created Time')).getTime() >= since;
  });
  if (dup) return null;
  const id = newId('ALERT');
  const record = {
    'Alert ID': id,
    'Business ID': state.businessId,
    'Rule ID': ruleId,
    'Alert Type': type,
    'Title': title,
    'Detail': detail,
    'Severity': severity,
    'Status': 'Open',
    'Created Time': now(),
    'Record Version': 1
  };
  await queueOperation('RECORD_ALERT', 'Alert', id,
    { alertId: id, ruleId: ruleId, type: type, title: title, detail: detail, severity: severity },
    { collection: 'alerts', record: record, idKeys: ['Alert ID'] });
  return record;
}

// ---------------------------------------------------------------------------
// Price-drop check — real priceHistory rows (written by the price-history
// feature). Newest entry per item vs the previous entry; alert at >= threshold.
// ---------------------------------------------------------------------------
function priceHistoryTime(row) {
  const ms = new Date(v(row, 'Created Time', 'Recorded Time', 'Time', 'Timestamp', 'timestamp', 'createdTime')).getTime();
  return isNaN(ms) ? 0 : ms;
}
function priceHistoryItemId(row) {
  return String(v(row, 'Item ID', 'ItemID', 'itemId', 'SKU', 'sku') || '').trim();
}
function priceHistoryPrice(row) {
  return num(v(row, 'Selling Price', 'Price', 'price', 'sellingPrice'));
}
function priceBookById() {
  const map = {};
  records('priceBook').forEach(function (row) {
    const id = String(v(row, 'Item ID') || '').trim();
    if (id && !map[id]) map[id] = row;
  });
  return map;
}

async function checkPriceDropAlerts() {
  const rules = activeAlertRules('price_drop');
  const history = records('priceHistory');
  if (!rules.length || !history.length) return { checked: 0, raised: 0 };
  const byItem = {};
  history.forEach(function (row) {
    const itemId = priceHistoryItemId(row);
    if (!itemId) return;
    (byItem[itemId] = byItem[itemId] || []).push(row);
  });
  const book = priceBookById();
  let raised = 0;
  for (const rule of rules) {
    const threshold = ruleThreshold(rule, 10);
    const ruleName = v(rule, 'Rule Name') || 'Price drop rule';
    for (const itemId of Object.keys(byItem)) {
      const rows = byItem[itemId].slice().sort(function (a, b) { return priceHistoryTime(b) - priceHistoryTime(a); });
      if (rows.length < 2) continue;
      const oldPrice = priceHistoryPrice(rows[1]);
      const newPrice = priceHistoryPrice(rows[0]);
      if (!(oldPrice > 0) || newPrice < 0) continue;
      const dropPct = (oldPrice - newPrice) / oldPrice * 100;
      if (dropPct < threshold) continue;
      const item = book[itemId] || {};
      const itemName = v(rows[0], 'Description', 'Item Name', 'description') || v(item, 'Description') || v(item, 'SKU') || itemId;
      const severity = dropPct >= Math.max(2 * threshold, 20) ? 'urgent' : 'warn';
      const rec = await recordAlert({
        type: 'price_drop',
        title: 'Price drop: ' + itemName,
        detail: itemName + ' selling price fell ' + dropPct.toFixed(1) + '% (' + money(oldPrice) + ' → ' + money(newPrice) + '). Rule "' + ruleName + '" watches drops of ' + threshold + '% or more.',
        severity: severity,
        ruleId: rowId(rule, 'Rule ID')
      });
      if (rec) raised++;
    }
  }
  return { checked: Object.keys(byItem).length, raised: raised };
}

// ---------------------------------------------------------------------------
// Quote-aging check — real quote records. Status containing DRAFT or SENT,
// aged by 'Created Time' ('Updated Time' fallback), older than threshold days.
// ---------------------------------------------------------------------------
function customersById() {
  const map = {};
  records('customers').forEach(function (row) {
    const id = String(v(row, 'Customer ID') || '').trim();
    if (id && !map[id]) map[id] = row;
  });
  return map;
}

async function checkQuoteAgingAlerts() {
  const rules = activeAlertRules('quote_aging');
  if (!rules.length) return { checked: 0, raised: 0 };
  const quotes = records('quotes');
  const customers = customersById();
  let raised = 0, checked = 0;
  for (const rule of rules) {
    const thresholdDays = ruleThreshold(rule, 7);
    const ruleName = v(rule, 'Rule Name') || 'Quote aging rule';
    for (const quote of quotes) {
      if (isTestRecord(quote)) continue;
      const status = String(v(quote, 'Status')).toUpperCase();
      if (status.indexOf('DRAFT') < 0 && status.indexOf('SENT') < 0) continue;
      const createdMs = new Date(v(quote, 'Created Time', 'Updated Time')).getTime();
      if (isNaN(createdMs)) continue; // no usable date — skip, never alert
      checked++;
      const ageDays = (Date.now() - createdMs) / 86400000;
      if (ageDays < thresholdDays) continue;
      const title = v(quote, 'Project Title', 'projectTitle') || 'Untitled quote';
      const cust = customers[String(v(quote, 'Customer ID')) || ''];
      const custName = cust ? v(cust, 'Customer Name') : '';
      const rec = await recordAlert({
        type: 'quote_aging',
        title: 'Stale quote: ' + title,
        detail: 'Quote "' + title + '" (' + (v(quote, 'Quote Number', 'quoteNumber') || 'no number') + (custName ? ', ' + custName : '') + ', ' + money(v(quote, 'Total', 'total')) + ') has been ' + (v(quote, 'Status') || 'open') + ' for ' + Math.floor(ageDays) + ' days. Rule "' + ruleName + '" flags quotes older than ' + thresholdDays + ' days.',
        severity: 'info',
        ruleId: rowId(rule, 'Rule ID')
      });
      if (rec) raised++;
    }
  }
  return { checked: checked, raised: raised };
}

// ---------------------------------------------------------------------------
// Low-stock check — real inventory records. priceBook items whose on-hand
// quantity (from append-only inventoryTransactions) is at/under 'Reorder Point'.
// ---------------------------------------------------------------------------
async function checkLowStockAlerts() {
  const rules = activeAlertRules('low_stock');
  if (!rules.length) return { checked: 0, raised: 0 };
  const stock = new Map();
  records('inventoryTransactions').forEach(function (row) {
    const id = String(v(row, 'Item ID') || '').trim();
    if (!id) return;
    const qty = Math.abs(num(v(row, 'Quantity')));
    const dir = String(v(row, 'Direction')).toUpperCase();
    stock.set(id, (stock.get(id) || 0) + (dir === 'OUT' ? -qty : qty));
  });
  let raised = 0, checked = 0;
  for (const rule of rules) {
    const ruleName = v(rule, 'Rule Name') || 'Low stock rule';
    const items = records('priceBook');
    for (const item of items) {
      if (isTestRecord(item)) continue;
      const reorder = num(v(item, 'Reorder Point'));
      if (!(reorder > 0)) continue;
      const itemId = String(v(item, 'Item ID') || '').trim();
      const onHand = stock.get(itemId) || 0;
      checked++;
      if (onHand > reorder) continue;
      const name = v(item, 'Description') || v(item, 'SKU') || itemId || 'Unnamed item';
      const severity = onHand <= 0 ? 'urgent' : 'warn';
      const rec = await recordAlert({
        type: 'low_stock',
        title: (onHand <= 0 ? 'Out of stock: ' : 'Low stock: ') + name,
        detail: name + ' (' + (v(item, 'SKU') || 'no SKU') + ') has ' + onHand + ' ' + (v(item, 'Unit of Measure') || 'units') + ' on hand; reorder point is ' + reorder + '. Rule "' + ruleName + '".',
        severity: severity,
        ruleId: rowId(rule, 'Rule ID')
      });
      if (rec) raised++;
    }
  }
  return { checked: checked, raised: raised };
}

// ---------------------------------------------------------------------------
// Check passes + UI actions
// ---------------------------------------------------------------------------
async function runDealAlertChecks() {
  const price = await checkPriceDropAlerts();
  const aging = await checkQuoteAgingAlerts();
  const stock = await checkLowStockAlerts();
  return {
    raised: (price.raised || 0) + (aging.raised || 0) + (stock.raised || 0),
    checked: (price.checked || 0) + (aging.checked || 0) + (stock.checked || 0)
  };
}

async function checkDealAlertsNow() {
  if (!dealAlertsEnabled()) { toast('Deal alerts are off. Enable them in Settings → Owner Controls.', true); return; }
  try {
    const result = await runDealAlertChecks();
    toast(result.raised ? result.raised + ' new deal alert' + (result.raised === 1 ? '' : 's') + ' raised.' : 'Deal alert check complete — no new alerts.');
    if (typeof renderToday === 'function') renderToday();
  } catch (error) {
    toast('Deal alert check failed: ' + (error && error.message || error), true);
  }
}

// Silent background pass: runs at most once per hour per business when the
// Today card renders, so open alerts surface without a manual "Check now".
async function autoCheckDealAlerts() {
  if (!dealAlertsEnabled()) return;
  try {
    const key = DEAL_ALERT_AUTOCHECK_KEY + '-' + (state.businessId || 'nobiz');
    let last = 0;
    try { last = Number(localStorage.getItem(key) || 0); } catch (e) {}
    if (Date.now() - last < DEAL_ALERT_AUTOCHECK_MS) return;
    try { localStorage.setItem(key, String(Date.now())); } catch (e) {}
    const result = await runDealAlertChecks();
    if (result.raised > 0 && typeof renderToday === 'function' && state.page === 'today') renderToday();
  } catch (e) { /* silent: alerts are advisory, never fatal */ }
}

async function setAlertStatus(alertId, status) {
  const row = records('alerts').find(function (r) { return rowId(r, 'Alert ID') === String(alertId); });
  if (!row) { toast('Alert not found.', true); return; }
  const record = Object.assign({}, row, { 'Status': status, 'Record Version': num(v(row, 'Record Version')) + 1 });
  await queueOperation('UPDATE_ALERT', 'Alert', String(alertId),
    { alertId: String(alertId), status: status },
    { collection: 'alerts', record: record, idKeys: ['Alert ID'] });
  toast('Alert ' + status.toLowerCase() + '.');
  if (typeof renderToday === 'function') renderToday();
}

async function setAlertRuleStatus(ruleId, status) {
  const row = records('alertRules').find(function (r) { return rowId(r, 'Rule ID') === String(ruleId); });
  if (!row) { toast('Watch rule not found.', true); return; }
  const record = Object.assign({}, row, { 'Status': status, 'Record Version': num(v(row, 'Record Version')) + 1 });
  await queueOperation('UPDATE_ALERT_RULE', 'Alert Rule', String(ruleId),
    { ruleId: String(ruleId), status: status },
    { collection: 'alertRules', record: record, idKeys: ['Rule ID'] });
  toast('Watch rule ' + status.toLowerCase() + '.');
  if (typeof renderToday === 'function') renderToday();
}

async function addAlertRule(event) {
  if (event && event.preventDefault) event.preventDefault();
  const form = event && event.target;
  const data = form ? formObject(form) : {};
  const name = String(data.ruleName || '').trim();
  if (!name) { toast('Rule name is required.', true); return false; }
  const ruleType = (data.ruleType === 'quote_aging' || data.ruleType === 'low_stock') ? data.ruleType : 'price_drop';
  const threshold = ruleType === 'low_stock' ? 0 : ruleThreshold({ 'Threshold Percent': data.threshold }, ruleType === 'quote_aging' ? 7 : 10);
  const id = newId('ALERTRULE');
  const record = {
    'Rule ID': id,
    'Business ID': state.businessId,
    'Rule Name': name,
    'Rule Type': ruleType,
    'Threshold Percent': threshold,
    'Status': 'Active',
    'Created By': (state.snapshot && state.snapshot.user && state.snapshot.user.userId) || '',
    'Created Time': now(),
    'Record Version': 1
  };
  await queueOperation('SAVE_ALERT_RULE', 'Alert Rule', id,
    { ruleId: id, ruleName: name, ruleType: ruleType, thresholdPercent: threshold },
    { collection: 'alertRules', record: record, idKeys: ['Rule ID'] });
  toast('Watch rule added.');
  if (typeof renderToday === 'function') renderToday();
  return false;
}

async function deleteAlertRule(ruleId) {
  const id = String(ruleId);
  if (typeof confirm === 'function' && !confirm('Delete this watch rule? Existing alerts stay.')) return;
  await queueOperation('DELETE_ALERT_RULE', 'Alert Rule', id, { ruleId: id, deleted: true }, null);
  const col = (state.snapshot && state.snapshot.alertRules) || [];
  const index = col.findIndex(function (r) { return rowId(r, 'Rule ID') === id; });
  if (index >= 0) col.splice(index, 1);
  try {
    if (typeof put === 'function' && state.snapshot) await put('snapshots', Object.assign({}, state.snapshot, { id: 'business:' + state.businessId, cachedAt: state.snapshot.cachedAt || now() }));
  } catch (e) {}
  toast('Watch rule deleted.');
  if (typeof renderToday === 'function') renderToday();
}

// ---------------------------------------------------------------------------
// Today card
// ---------------------------------------------------------------------------
function openDealAlerts() {
  return records('alerts')
    .filter(function (row) { return String(v(row, 'Status')).toUpperCase() === 'OPEN'; })
    .sort(function (a, b) { return new Date(v(b, 'Created Time')).getTime() - new Date(v(a, 'Created Time')).getTime(); });
}

function alertSeverityPill(severity) {
  const s = String(severity || 'info');
  return pill(s, s === 'urgent' ? 'bad' : s === 'warn' ? 'pending' : 'neutral');
}

function dealAlertRow(row) {
  const id = esc(rowId(row, 'Alert ID'));
  return '<div class="row"><div class="row-top"><strong>' + esc(v(row, 'Title')) + '</strong>' + alertSeverityPill(v(row, 'Severity')) + '</div>'
    + '<small>' + esc(v(row, 'Detail')) + '</small>'
    + '<small class="muted">' + dateTime(v(row, 'Created Time')) + '</small>'
    + '<div class="row-actions"><button class="secondary" onclick="H38DealAlerts.ack(\'' + id + '\')">Acknowledge</button>'
    + '<button class="secondary" onclick="H38DealAlerts.dismiss(\'' + id + '\')">Dismiss</button></div></div>';
}

function alertRuleRow(row) {
  const id = esc(rowId(row, 'Rule ID'));
  const type = String(v(row, 'Rule Type'));
  const paused = String(v(row, 'Status')).toUpperCase() === 'PAUSED';
  const thresholdText = type === 'low_stock' ? 'at/under reorder point'
    : type === 'quote_aging' ? 'older than ' + v(row, 'Threshold Percent') + ' days'
    : 'drop of ' + v(row, 'Threshold Percent') + '% or more';
  return '<div class="row"><div class="row-top"><strong>' + esc(v(row, 'Rule Name')) + '</strong>' + pill(paused ? 'Paused' : 'Active', paused ? 'pending' : 'good') + '</div>'
    + '<small>' + esc(DEAL_ALERT_RULE_TYPES[type] || type) + ' · ' + esc(thresholdText) + '</small>'
    + '<div class="row-actions">'
    + (paused
      ? '<button class="secondary" onclick="H38DealAlerts.resumeRule(\'' + id + '\')">Resume</button>'
      : '<button class="secondary" onclick="H38DealAlerts.pauseRule(\'' + id + '\')">Pause</button>')
    + '<button class="danger" onclick="H38DealAlerts.deleteRule(\'' + id + '\')">Delete</button></div></div>';
}

function alertsCard() {
  const open = openDealAlerts().slice(0, 10);
  const rules = records('alertRules').slice(0, 20);
  // Throttled background check so fresh conditions surface as alerts on Today.
  try { autoCheckDealAlerts(); } catch (e) {}
  return '<section class="card span5"><h2>🎯 Deal alerts</h2>'
    + '<div class="actions"><button class="secondary" onclick="H38DealAlerts.checkNow()">Check now</button></div>'
    + '<div class="list">' + (open.length ? open.map(dealAlertRow).join('') : empty('No open deal alerts. Add a watch rule below or tap Check now.')) + '</div>'
    + '<h3>Watch rules</h3>'
    + '<form onsubmit="return H38DealAlerts.addRule(event)"><div class="two">'
    + '<div><label>Rule name</label><input name="ruleName" required maxlength="80" placeholder="e.g. Big price drops"></div>'
    + '<div><label>Rule type</label><select name="ruleType"><option value="price_drop">Price drop</option><option value="quote_aging">Quote aging</option><option value="low_stock">Low stock</option></select></div>'
    + '</div><label>Threshold <small class="muted">(percent for price drops · days for quote aging · not used for low stock)</small></label>'
    + '<input name="threshold" type="number" min="0" step="any" placeholder="10">'
    + '<div class="actions"><button>Add rule</button></div></form>'
    + '<div class="list">' + (rules.length ? rules.map(alertRuleRow).join('') : empty('No watch rules yet.')) + '</div>'
    + '</section>';
}

window.H38DealAlerts = {
  recordAlert: recordAlert,
  checkPriceDropAlerts: checkPriceDropAlerts,
  checkQuoteAgingAlerts: checkQuoteAgingAlerts,
  checkLowStockAlerts: checkLowStockAlerts,
  runChecks: runDealAlertChecks,
  checkNow: checkDealAlertsNow,
  autoCheck: autoCheckDealAlerts,
  ack: function (id) { return setAlertStatus(id, 'Acknowledged'); },
  dismiss: function (id) { return setAlertStatus(id, 'Dismissed'); },
  addRule: addAlertRule,
  pauseRule: function (id) { return setAlertRuleStatus(id, 'Paused'); },
  resumeRule: function (id) { return setAlertRuleStatus(id, 'Active'); },
  deleteRule: deleteAlertRule,
  alertsCard: alertsCard,
  BUILD: '20261004-deal-alerts-1'
};
