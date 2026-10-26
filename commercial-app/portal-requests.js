/* ============================================================================
 * H38 Service Requests inbox — work the customer requests that land as
 * booking_requests rows (customer portal "Request service" + public online
 * booking page) from the Schedule page: schedule one onto the calendar with
 * a date/time the office person picks, or dismiss it.
 * ----------------------------------------------------------------------------
 * Why Schedule: converting a request produces a scheduleEvents entry, and
 * the Schedule page is where the office person runs the day — the inbox
 * sits at the top of that page, above Upcoming, so a new request is worked
 * in the same place its appointment will appear. New requests also count
 * in the owner home's "Needs you now" (owner-home.js getNewServiceRequests)
 * and fire the h38-owner-notify owner notification, whose link lands here.
 *
 * Module intake (MODULE_PERFORMANCE_STANDARD):
 *   - Canonical route: the existing Schedule workspace ('schedule'); this
 *     module is a secondary, on-demand surface loaded only with the
 *     Schedule script group (h38-script-loader PAGE_SCHEDULE). Nothing is
 *     added to startup or to Today.
 *   - Data sources: the already-hydrated snapshot only (booking_requests —
 *     now explicitly fetched in supabase-data.js so the broad query's cap
 *     can never crowd a request out — plus scheduleEvents, customers).
 *     Zero new server reads at render.
 *   - Bounds: at most 50 requests rendered (newest first); dismissed rows
 *     show at most 5.
 *   - Writes: the canonical queueOperation('SAVE_ENTITY', ...) path with a
 *     full-payload optimistic record — the same write the AI onboarding
 *     uses. Converting writes ONE scheduleEvents record (Event Type
 *     'Service Request', Related Record Type 'Booking Request', Related
 *     Record ID = the Booking ID, Customer ID carried) and updates the
 *     request to Status 'Scheduled' with the event's ID stamped on it.
 *     The stamp is the duplicate guard: a request that already carries a
 *     Schedule Event ID (or already has a linked event) never converts
 *     twice. Dismiss writes Status 'Dismissed' and never touches the
 *     schedule.
 *   - Failure behavior: a failed write toasts the error and leaves the
 *     request in its prior state; the convert form stays open with the
 *     picked date/time intact.
 *   - Visibility: the card renders when this business takes online
 *     requests (customer_portal or online_booking module on) or when any
 *     request rows exist. Nothing sends to anyone from here — scheduling
 *     and dismissing are internal record writes only.
 * ========================================================================== */
(function() {
'use strict';
if (typeof window === 'undefined') return;

var BUILD = '20261026-portal-requests-1';
var w = window;

/* ---------- helpers (same fallbacks as route-planner) ---------- */
function text(v) { return String(v == null ? '' : v).trim(); }
function esc(s) {
  if (typeof w.esc === 'function') return w.esc(s);
  return text(s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function v(row) {
  var keys = Array.prototype.slice.call(arguments, 1);
  if (typeof w.v === 'function') return w.v.apply(w, [row].concat(keys));
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return '';
}
function num(x) {
  if (typeof w.num === 'function') return w.num(x);
  var n = Number(x); return Number.isFinite(n) ? n : 0;
}
function toast(msg, bad) {
  if (typeof w.toast === 'function') w.toast(msg, bad);
  else if (bad) console.warn('[PortalRequests]', msg); else console.log('[PortalRequests]', msg);
}
function records(name) {
  if (typeof w.records === 'function') return w.records(name) || [];
  var s = w.state || {};
  return (s.snapshot && s.snapshot[name]) || [];
}
function businessId() { return text((w.state && w.state.businessId) || ''); }
function nowIso() { return typeof w.now === 'function' ? w.now() : new Date().toISOString(); }
function fmtWhen(iso) {
  if (typeof w.dateTime === 'function') { try { return w.dateTime(iso); } catch (e) {} }
  var d = new Date(iso);
  return Number.isNaN(d.getTime()) ? text(iso) : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/* ---------- data ---------- */
function bookingIdOf(r) { return text(v(r, 'Booking ID', 'bookingId')); }
function bucketOf(r) {
  var s = text(v(r, 'Status', 'status'));
  if (/^scheduled/i.test(s)) return 'scheduled';
  if (/dismiss/i.test(s)) return 'dismissed';
  return 'new'; // 'New — needs owner review' and anything unrecognized needs eyes
}
function allRequests() {
  return records('booking_requests').slice().sort(function(a, b) {
    return String(v(b, 'Created Time', 'createdTime') || '').localeCompare(String(v(a, 'Created Time', 'createdTime') || ''));
  });
}
function findRequest(bookingId) {
  var list = records('booking_requests');
  for (var i = 0; i < list.length; i++) if (bookingIdOf(list[i]) === bookingId) return list[i];
  return null;
}
function linkedEvent(req) {
  var events = records('scheduleEvents');
  var stamped = text(v(req, 'Schedule Event ID', 'scheduleEventId'));
  var bid = bookingIdOf(req);
  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    if (stamped && text(v(ev, 'Schedule Event ID', 'scheduleEventId')) === stamped) return ev;
    if (bid && text(v(ev, 'Related Record ID', 'relatedRecordId')) === bid &&
        /booking/i.test(text(v(ev, 'Related Record Type', 'relatedRecordType')))) return ev;
  }
  return null;
}
function moduleOn(key) {
  var snapshot = (w.state && w.state.snapshot) || {};
  var list = Array.isArray(snapshot.moduleSettings) ? snapshot.moduleSettings : [];
  for (var i = 0; i < list.length; i++) {
    var row = list[i] || {};
    if (text(row.moduleKey || row.module_key) === key) return row.enabled === true;
  }
  return false;
}
function takesRequests() {
  return moduleOn('customer_portal') || moduleOn('online_booking') || records('booking_requests').length > 0;
}
function customerLocation(customerId) {
  if (!customerId) return '';
  var customers = records('customers');
  for (var i = 0; i < customers.length; i++) {
    if (text(v(customers[i], 'Customer ID', 'customerId')) === customerId) {
      return text(v(customers[i], 'Service Address', 'serviceAddress')) || text(v(customers[i], 'Address', 'address'));
    }
  }
  return '';
}

/* ---------- convert-form defaults ----------
 * The date/time come from the office person in this step — never invented.
 * The customer's own Preferred Date/Time (their words on the request) are
 * offered as the starting value, shown and editable; with no preference on
 * the request the fields start empty and must be picked. */
function prefStartValue(req) {
  var date = text(v(req, 'Preferred Date', 'preferredDate'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  var when = text(v(req, 'Preferred Time', 'preferredTime')).toLowerCase();
  var clock = '09:00';
  if (/afternoon/.test(when)) clock = '13:00';
  else if (/evening/.test(when)) clock = '17:00';
  else if (/^([01]\d|2[0-3]):[0-5]\d/.test(when)) clock = when.slice(0, 5);
  return date + 'T' + clock;
}
function plusOneHour(localValue) {
  var d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return '';
  d.setHours(d.getHours() + 1);
  function pad(n) { return String(n).padStart(2, '0'); }
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/* ---------- styles ---------- */
var styleInjected = false;
function ensureStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  var css = [
    '.h38-pr-card{margin-bottom:16px}',
    '.h38-pr-note{font-size:.9em;color:#666;margin:4px 0 8px}',
    '.h38-pr-list{display:grid;gap:8px;margin:10px 0;padding:0;list-style:none}',
    '.h38-pr-row{border:1px solid var(--border,#e2e2e2);border-radius:12px;padding:10px 12px;background:var(--card,#fff)}',
    '.h38-pr-row-top{display:flex;gap:8px;align-items:flex-start;justify-content:space-between}',
    '.h38-pr-row-body{flex:1;min-width:0}',
    '.h38-pr-meta{font-size:.9em;color:#555;margin-top:2px}',
    '.h38-pr-pill{flex:none;font-size:.78em;font-weight:700;padding:3px 9px;border-radius:999px;background:#fdf3e0;color:#8a5b00}',
    '.h38-pr-pill.scheduled{background:#e8f7ee;color:#126132}',
    '.h38-pr-pill.dismissed{background:#eceff1;color:#607d8b}',
    '.h38-pr-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}',
    '.h38-pr-actions button{min-height:44px;padding:10px 16px;font-size:1em;border-radius:10px}',
    '.h38-pr-form{border-top:1px solid var(--border,#e2e2e2);margin-top:10px;padding-top:10px}',
    '.h38-pr-form label{display:block;margin:8px 0 4px;font-weight:600}',
    '.h38-pr-form input{width:100%;min-height:44px;font-size:1em;border-radius:8px;border:1px solid #ccc;padding:8px 10px;box-sizing:border-box}',
    '.h38-pr-form .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '@media(max-width:560px){.h38-pr-form .two{grid-template-columns:1fr}}',
    '.h38-pr-dim{opacity:.75}'
  ].join('\n');
  var el = document.createElement('style');
  el.setAttribute('data-h38-portal-requests', '1');
  el.textContent = css;
  document.head.appendChild(el);
}

/* ---------- render ---------- */
var ui = { sig: '', openFormFor: '', saving: false };

function requestRowHtml(req) {
  var bid = bookingIdOf(req);
  var bucket = bucketOf(req);
  var name = text(v(req, 'Customer Name', 'customerName')) || 'A customer';
  var svc = text(v(req, 'Service', 'service')) || 'Service request';
  var phone = text(v(req, 'Phone', 'phone'));
  var email = text(v(req, 'Email', 'email'));
  var created = text(v(req, 'Created Time', 'createdTime'));
  var prefDate = text(v(req, 'Preferred Date', 'preferredDate'));
  var prefTime = text(v(req, 'Preferred Time', 'preferredTime'));
  var notes = text(v(req, 'Notes', 'notes'));
  var source = text(v(req, 'Source', 'source'));
  var pillLabel = bucket === 'new' ? 'New' : bucket === 'scheduled' ? 'Scheduled' : 'Dismissed';
  var meta = [];
  if (created) meta.push('Came in ' + esc(fmtWhen(created)));
  if (prefDate || prefTime) meta.push('Asked for ' + esc([prefDate, prefTime].filter(Boolean).join(' ')));
  if (phone) meta.push(esc(phone));
  if (email) meta.push(esc(email));
  if (source) meta.push('via ' + esc(source));
  var html = '<li class="h38-pr-row' + (bucket === 'dismissed' ? ' h38-pr-dim' : '') + '" data-h38pr-row="' + esc(bid) + '">' +
    '<div class="h38-pr-row-top"><div class="h38-pr-row-body">' +
    '<strong>' + esc(svc) + ' — ' + esc(name) + '</strong>' +
    '<div class="h38-pr-meta">' + meta.join(' · ') + '</div>' +
    (notes ? '<div class="h38-pr-meta">“' + esc(notes) + '”</div>' : '') +
    '</div><span class="h38-pr-pill ' + bucket + '">' + pillLabel + '</span></div>';
  if (bucket === 'scheduled') {
    var ev = linkedEvent(req);
    html += '<div class="h38-pr-meta">On the schedule: ' +
      (ev ? esc(text(v(ev, 'Title', 'title')) || 'Appointment') + ' · ' + esc(fmtWhen(text(v(ev, 'Start Time', 'startTime'))))
          : 'marked scheduled') + '</div>';
  }
  if (bucket === 'new') {
    if (ui.openFormFor === bid) {
      var startVal = prefStartValue(req);
      html += '<div class="h38-pr-form">' +
        '<label>Title</label><input data-h38pr-title value="' + esc(svc + ' — ' + name) + '">' +
        '<div class="two"><div><label>Start</label><input type="datetime-local" data-h38pr-start value="' + esc(startVal) + '"></div>' +
        '<div><label>End</label><input type="datetime-local" data-h38pr-end value="' + esc(startVal ? plusOneHour(startVal) : '') + '"></div></div>' +
        '<label>Location</label><input data-h38pr-location value="' + esc(customerLocation(text(v(req, 'Customer ID', 'customerId')))) + '" placeholder="Where the work happens">' +
        ((prefDate || prefTime) ? '<p class="h38-pr-note">Customer asked for: ' + esc([prefDate, prefTime].filter(Boolean).join(' ')) + ' — adjust if you agreed on something else.</p>' : '<p class="h38-pr-note">The customer gave no preferred time — pick the date and time you agreed on.</p>') +
        '<div class="h38-pr-actions">' +
        '<button type="button" data-h38pr-action="convert" data-h38pr-id="' + esc(bid) + '"' + (ui.saving ? ' disabled' : '') + '>Put on schedule</button>' +
        '<button type="button" class="secondary" data-h38pr-action="cancel" data-h38pr-id="' + esc(bid) + '"' + (ui.saving ? ' disabled' : '') + '>Cancel</button>' +
        '</div></div>';
    } else {
      html += '<div class="h38-pr-actions">' +
        '<button type="button" data-h38pr-action="open" data-h38pr-id="' + esc(bid) + '">Schedule it</button>' +
        '<button type="button" class="secondary" data-h38pr-action="dismiss" data-h38pr-id="' + esc(bid) + '">Dismiss</button>' +
        '</div>';
    }
  }
  return html + '</li>';
}

function cardHtml() {
  var list = allRequests();
  var fresh = list.filter(function(r) { return bucketOf(r) === 'new'; });
  var scheduled = list.filter(function(r) { return bucketOf(r) === 'scheduled'; });
  var dismissed = list.filter(function(r) { return bucketOf(r) === 'dismissed'; }).slice(0, 5);
  var shown = fresh.concat(scheduled).slice(0, 50);
  var head = '<h3 style="margin:0 0 6px">📥 Service requests' +
    (fresh.length ? ' <span class="h38-pr-pill">' + fresh.length + ' new</span>' : '') + '</h3>';
  if (!list.length) {
    return head + '<p class="h38-pr-note">No requests yet. When a customer sends a request from your customer portal or booking page, it lands here — schedule it onto the calendar or dismiss it. Nothing is scheduled until you do.</p>';
  }
  var body = shown.map(requestRowHtml).join('');
  if (dismissed.length) {
    body += dismissed.map(requestRowHtml).join('');
  }
  return head +
    '<p class="h38-pr-note">Requests customers sent from the portal or booking page. Scheduling one puts it on the calendar below; dismissing one just closes it here.</p>' +
    '<ul class="h38-pr-list">' + body + '</ul>';
}

function signature() {
  var parts = [businessId(), takesRequests() ? 'on' : 'off', ui.openFormFor, ui.saving ? 'saving' : ''];
  allRequests().slice(0, 60).forEach(function(r) {
    parts.push(bookingIdOf(r) + ':' + text(v(r, 'Status', 'status')) + ':' + text(v(r, 'Schedule Event ID', 'scheduleEventId')));
  });
  parts.push('ev' + records('scheduleEvents').length);
  return parts.join('|');
}

/* ---------- actions ---------- */
function requireQueue() {
  if (typeof w.queueOperation !== 'function') throw new Error('Saving is unavailable right now.');
}
async function dismissRequest(bid) {
  var req = findRequest(bid);
  if (!req || bucketOf(req) !== 'new') return;
  if (typeof w.confirm === 'function' && !w.confirm('Dismiss this request? It stays listed as Dismissed; nothing is scheduled.')) return;
  requireQueue();
  var updated = Object.assign({}, req);
  delete updated.__localPending;
  updated['Status'] = 'Dismissed';
  updated['Updated Time'] = nowIso();
  updated['Record Version'] = num(v(req, 'Record Version', 'recordVersion')) + 1;
  await w.queueOperation('SAVE_ENTITY', 'Booking Request', bid,
    { entity: 'booking_requests', record: updated },
    { collection: 'booking_requests', record: updated, idKeys: ['Booking ID', 'bookingId'] });
  toast('Request dismissed.');
}

async function convertRequest(bid, card) {
  var req = findRequest(bid);
  if (!req || ui.saving) return;
  if (bucketOf(req) === 'scheduled' || text(v(req, 'Schedule Event ID', 'scheduleEventId')) || linkedEvent(req)) {
    toast('That request is already on the schedule.');
    ui.openFormFor = '';
    hook(true);
    return;
  }
  var titleEl = card.querySelector('[data-h38pr-title]');
  var startEl = card.querySelector('[data-h38pr-start]');
  var endEl = card.querySelector('[data-h38pr-end]');
  var locEl = card.querySelector('[data-h38pr-location]');
  var title = titleEl ? text(titleEl.value) : '';
  var start = startEl ? text(startEl.value) : '';
  var end = endEl ? text(endEl.value) : '';
  var location = locEl ? text(locEl.value) : '';
  if (!title) { toast('Give the appointment a title first.', true); return; }
  if (!start) { toast('Pick the date and time first — the customer\u2019s preference is a starting point, the schedule time is yours to set.', true); return; }
  requireQueue();
  ui.saving = true;
  hook(true);
  try {
    var eventId = typeof w.newId === 'function' ? w.newId('SCHEDULE') : 'SCHEDULE-' + Date.now().toString(36).toUpperCase();
    var ts = nowIso();
    var svc = text(v(req, 'Service', 'service'));
    var notes = text(v(req, 'Notes', 'notes'));
    var event = {
      'Schedule Event ID': eventId,
      'Business ID': businessId(),
      'Event Type': 'Service Request',
      'Title': title,
      'Related Record Type': 'Booking Request',
      'Related Record ID': bid,
      'Customer ID': text(v(req, 'Customer ID', 'customerId')),
      'Assigned User ID': '',
      'Start Time': start,
      'End Time': end,
      'Location': location,
      'Status': 'Scheduled',
      'Notes': ('From a customer service request (' + bid + ')' + (svc ? ' for ' + svc : '') + (notes ? '. Customer said: ' + notes : '')),
      'Created Time': ts,
      'Updated Time': ts,
      'Record Version': 1
    };
    await w.queueOperation('SAVE_ENTITY', 'Schedule Event', eventId,
      { entity: 'scheduleEvents', record: event },
      { collection: 'scheduleEvents', record: event, idKeys: ['Schedule Event ID', 'scheduleEventId'] });
    var updated = Object.assign({}, req);
    delete updated.__localPending;
    updated['Status'] = 'Scheduled';
    updated['Schedule Event ID'] = eventId;
    updated['Scheduled Start'] = start;
    updated['Updated Time'] = ts;
    updated['Record Version'] = num(v(req, 'Record Version', 'recordVersion')) + 1;
    await w.queueOperation('SAVE_ENTITY', 'Booking Request', bid,
      { entity: 'booking_requests', record: updated },
      { collection: 'booking_requests', record: updated, idKeys: ['Booking ID', 'bookingId'] });
    ui.openFormFor = '';
    toast('Request scheduled — it\u2019s on the calendar below.');
    if (typeof w.renderSchedule === 'function') { try { w.renderSchedule(); } catch (e) {} }
  } catch (e) {
    toast('Could not schedule that request: ' + (e && e.message ? e.message : e), true);
  } finally {
    ui.saving = false;
    hook(true);
  }
}

var clickBound = false;
function bindClicks() {
  if (clickBound || typeof document === 'undefined') return;
  clickBound = true;
  document.addEventListener('click', function(e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-h38pr-action]') : null;
    if (!btn) return;
    var card = btn.closest('#h38PortalRequests');
    if (!card) return;
    var bid = btn.getAttribute('data-h38pr-id') || '';
    var action = btn.getAttribute('data-h38pr-action');
    if (action === 'open') { ui.openFormFor = bid; hook(true); }
    else if (action === 'cancel') { ui.openFormFor = ''; hook(true); }
    else if (action === 'dismiss') { dismissRequest(bid).then(function() { hook(true); }).catch(function(err) { toast('Could not dismiss: ' + (err && err.message ? err.message : err), true); }); }
    else if (action === 'convert') { convertRequest(bid, card); }
  });
}

/* ---------- page hook ---------- */
function hook(force) {
  if (typeof document === 'undefined') return;
  var page = text(w.state && w.state.page);
  var card = document.getElementById('h38PortalRequests');
  if (page !== 'schedule' || !takesRequests()) {
    if (card) card.remove();
    ui.sig = '';
    return;
  }
  var main = document.getElementById('mainContent');
  if (!main) return;
  ensureStyle();
  bindClicks();
  var sig = signature();
  if (!card) {
    card = document.createElement('section');
    card.className = 'card h38-pr-card';
    card.id = 'h38PortalRequests';
    main.prepend(card);
    card.innerHTML = cardHtml();
    ui.sig = sig;
    return;
  }
  if (force || sig !== ui.sig) {
    // Never repaint over an open convert form on a background refresh —
    // the office person's picked date/time must survive snapshot updates.
    if (ui.openFormFor && !force) return;
    card.innerHTML = cardHtml();
    ui.sig = sig;
  }
}

/* ---------- boot ---------- */
var booted = false;
function start() {
  if (booted) return;
  booted = true;
  if (typeof MutationObserver !== 'undefined') {
    var raf = false;
    new MutationObserver(function() {
      if (raf) return;
      raf = true;
      requestAnimationFrame(function() { raf = false; try { hook(false); } catch (e) {} });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  try { w.addEventListener('h38:business-snapshot-updated', function() { try { hook(false); } catch (e) {} }); } catch (e) {}
  hook(false);
  w.H38PortalRequests = Object.freeze({ build: BUILD, refresh: function() { hook(true); } });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
})();
