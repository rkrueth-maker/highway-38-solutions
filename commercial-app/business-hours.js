/* ============================================================================
 * H38 Business Hours — SINGLE SOURCE OF TRUTH (Fix Round 2, workstream F)
 * ----------------------------------------------------------------------------
 * Exactly one structured definition of a business's hours exists:
 *
 *   Storage: Supabase `business_module_settings`, one row per business with
 *   module_key = 'business_hours' (the same settings store Settings already
 *   uses for every other per-business config — sms_sender, ai_receptionist,
 *   repair_guide, owner toggles — fetched into snapshot.moduleSettings by
 *   supabase-data.js). config = {
 *     version: 1,
 *     timeZone: 'America/Chicago',           // business timezone (defaults
 *                                            // from snapshot.business)
 *     days: { mon:{closed:false,open:'08:00',close:'17:00'}, ... sun:{...} }
 *   }
 *
 * Consumers (all read from this module; none keeps its own hours):
 *   - Settings → Business hours card: the ONLY editor (mountSettingsSection).
 *   - AI receptionist (communications-native-receptionist.js): derives its
 *     display text from here and passes a DETERMINISTIC isOpenNow /
 *     isAfterHours flag, computed from these hours + the business timezone,
 *     in the profile it sends the AI. Its legacy free-text field
 *     config.businessHours is kept only as a derived display string.
 *   - Schedule → Service requests inbox (portal-requests.js): shows the
 *     hours note from here and flags requests that arrived outside hours.
 *     It never blocks a request.
 *   - Guided Schedule step 3 (guided-schedule.js): notes when the picked
 *     time falls outside these hours. It never blocks scheduling.
 *
 * Migration / fallback (backward-compatible, idempotent, no data loss):
 *   1. If a 'business_hours' row with a valid structured config exists, it
 *      wins — source 'settings'.
 *   2. Else, if the tenant's receptionist config carries the legacy
 *      free-text businessHours, it is parsed into structured hours —
 *      source 'receptionist-text'. The tenant keeps working unchanged;
 *      the first time the owner saves in Settings → Business hours, the
 *      structured row is written (seeded from that parse) and the
 *      receptionist's text field is rewritten as the derived display.
 *   3. Else the long-standing default Mon–Fri 8:00 AM–5:00 PM applies —
 *      source 'default'.
 *
 * Module intake (MODULE_PERFORMANCE_STANDARD):
 *   - Route/module: existing Settings workspace ('settings'), existing
 *     Messages receptionist tab, existing Schedule workspace. No new
 *     module, route, or contract entry; 'business_hours' is a settings
 *     key in the existing business_module_settings store, like sms_sender.
 *   - Today-critical or on-demand: on-demand. Nothing is added to startup:
 *     this file must be registered in the Settings page group (and loaded
 *     before first use by Messages/Schedule consumers, which resolve it
 *     lazily at call time and degrade to prior behavior without it).
 *   - Data: snapshot.moduleSettings only — zero new server reads. The one
 *     write is the canonical business_module_settings upsert the
 *     receptionist and SMS setup already use.
 *   - Cache: snapshot.moduleSettings is the cache; saveHours updates it in
 *     place, so every consumer re-reads the same object. TTL n/a (server
 *     snapshot refresh is the invalidation event).
 *   - External-action impact: none. No sends, no telephony changes.
 * ========================================================================== */
(function (root) {
  'use strict';

  var MODULE_KEY = 'business_hours';
  var RECEPTIONIST_KEY = 'ai_receptionist';
  var BUILD = '20261030-r2-business-hours-1';
  var DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var DAY_LABELS = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
  var DAY_SHORT = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
  // Display/grouping order starts Monday, like the legacy default text.
  var ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  function text(v) { return String(v == null ? '' : v).trim(); }
  function pad(n) { return String(n).padStart(2, '0'); }

  /* ---------- pure core (no window/document — node-testable) ---------- */

  function minutesOf(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(text(hhmm));
    if (!m) return null;
    var mins = Number(m[1]) * 60 + Number(m[2]);
    return (mins >= 0 && mins <= 1440) ? mins : null;
  }
  function defaultHours(timeZone) {
    var days = {};
    DAY_KEYS.forEach(function (k) {
      var weekend = (k === 'sat' || k === 'sun');
      days[k] = { closed: weekend, open: '08:00', close: '17:00' };
    });
    return { version: 1, timeZone: text(timeZone) || 'America/Chicago', days: days };
  }

  function normalizeHours(input, fallbackTz) {
    if (!input || typeof input !== 'object') return null;
    var srcDays = input.days;
    if (!srcDays || typeof srcDays !== 'object') return null;
    var out = defaultHours(text(input.timeZone) || fallbackTz);
    var seen = 0;
    DAY_KEYS.forEach(function (k) {
      var d = srcDays[k];
      if (!d || typeof d !== 'object') return;
      seen++;
      var open = text(d.open), close = text(d.close);
      out.days[k] = {
        closed: d.closed === true,
        open: minutesOf(open) !== null ? open : '08:00',
        close: minutesOf(close) !== null ? close : '17:00'
      };
    });
    return seen ? out : null;
  }

  function formatTime(hhmm) {
    var mins = minutesOf(hhmm);
    if (mins === null) return text(hhmm);
    if (mins === 1440) return 'midnight';
    var h24 = Math.floor(mins / 60), mm = mins % 60;
    var ap = h24 >= 12 ? 'PM' : 'AM';
    var h12 = h24 % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + pad(mm) + ' ' + ap;
  }

  // "Monday–Friday · 8:00 AM–5:00 PM; Saturday–Sunday · Closed"
  function formatHours(hours) {
    var h = normalizeHours(hours) || defaultHours();
    var groups = [];
    var i = 0;
    while (i < ORDER.length) {
      var key = ORDER[i], d = h.days[key];
      var sig = d.closed ? 'closed' : d.open + '-' + d.close;
      var j = i;
      while (j + 1 < ORDER.length) {
        var nd = h.days[ORDER[j + 1]];
        var nsig = nd.closed ? 'closed' : nd.open + '-' + nd.close;
        if (nsig !== sig) break;
        j++;
      }
      var label = i === j ? DAY_LABELS[key] : DAY_LABELS[key] + '–' + DAY_LABELS[ORDER[j]];
      groups.push(label + ' · ' + (d.closed ? 'Closed' : formatTime(d.open) + '–' + formatTime(d.close)));
      i = j + 1;
    }
    return groups.join('; ');
  }

  function parseClock(token) {
    var m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(text(token));
    if (!m) return null;
    var hh = Number(m[1]), mm = Number(m[2] || 0);
    var ap = m[3] ? m[3].toLowerCase() : '';
    if (ap === 'pm' && hh < 12) hh += 12;
    if (ap === 'am' && hh === 12) hh = 0;
    return { hh: hh, mm: mm, ap: ap, mins: hh * 60 + mm };
  }

  var DAY_TOKEN = { sun: 'sun', sunday: 'sun', mon: 'mon', monday: 'mon', tue: 'tue', tues: 'tue', tuesday: 'tue', wed: 'wed', wednesday: 'wed', thu: 'thu', thur: 'thu', thurs: 'thu', thursday: 'thu', fri: 'fri', friday: 'fri', sat: 'sat', saturday: 'sat' };

  // Conservative parser for the legacy free-text field. Returns structured
  // hours or null (caller falls back to the default). Handles the shapes
  // tenants actually write: "Monday–Friday, 8:00 AM–5:00 PM",
  // "Mon-Fri 8am-5pm", "Monday - Friday 8:00 AM - 5:00 PM", "Daily 9-5",
  // "24/7". Anything more exotic returns null rather than guessing wrong.
  function parseFreeText(value, timeZone) {
    var raw = text(value);
    if (!raw) return null;
    var tz = text(timeZone) || 'America/Chicago';
    if (/24\s*\/\s*7|24\s*hours/i.test(raw)) {
      var all = defaultHours(tz);
      DAY_KEYS.forEach(function (k) { all.days[k] = { closed: false, open: '00:00', close: '24:00' }; });
      return all;
    }
    // Split "days part" from "time range part": the time range is the last
    // "X - Y" / "X–Y" whose both sides parse as clocks with at least one
    // meridiem or colon between them.
    var norm = raw.replace(/[–—]/g, '-');
    var timeRe = /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*$/i;
    var tm = timeRe.exec(norm);
    if (!tm) return null;
    var start = parseClock(tm[1]), end = parseClock(tm[2]);
    if (!start || !end) return null;
    if (!start.ap && end.ap === 'pm' && start.hh < 12 && start.hh >= end.hh - 12) { /* 8-5pm: start is AM */ }
    if (!start.ap && !end.ap) {
      // "8-5" with no meridiems: read as AM start, PM end when end <= start.
      if (end.mins <= start.mins) end = { hh: end.hh + 12, mm: end.mm, ap: 'pm', mins: end.mins + 720 };
    } else if (!start.ap && end.ap === 'pm' && start.mins >= end.mins) {
      return null; // ambiguous — don't guess
    } else if (!end.ap && start.ap === 'pm') {
      return null;
    }
    if (end.mins <= start.mins) return null; // overnight free-text not guessed
    var open = pad(start.hh) + ':' + pad(start.mm);
    var close = pad(end.hh) + ':' + pad(end.mm);
    var daysPart = norm.slice(0, tm.index).trim().replace(/[,;]+$/, '').trim().toLowerCase();
    var openDays = null;
    if (!daysPart || /^(daily|every ?day|all week)$/.test(daysPart)) {
      openDays = DAY_KEYS.slice();
    } else {
      var range = /^([a-z]+)\s*-\s*([a-z]+)$/.exec(daysPart);
      if (range && DAY_TOKEN[range[1]] && DAY_TOKEN[range[2]]) {
        openDays = [];
        var a = DAY_KEYS.indexOf(DAY_TOKEN[range[1]]), b = DAY_KEYS.indexOf(DAY_TOKEN[range[2]]);
        if (a <= b) { for (var x = a; x <= b; x++) openDays.push(DAY_KEYS[x]); }
      } else {
        var parts = daysPart.split(/[,&]|\band\b/).map(function (s) { return s.trim(); }).filter(Boolean);
        var list = [];
        var okList = parts.length > 0;
        parts.forEach(function (p) { if (DAY_TOKEN[p]) list.push(DAY_TOKEN[p]); else okList = false; });
        if (okList) openDays = list;
      }
    }
    if (!openDays || !openDays.length) return null;
    var hours = defaultHours(tz);
    DAY_KEYS.forEach(function (k) { hours.days[k] = { closed: openDays.indexOf(k) < 0, open: open, close: close }; });
    return hours;
  }

  // Open/closed for a weekday index (0=Sun..6=Sat, in the business tz) at
  // minutes-of-day. Handles overnight spans (close <= open closes next day)
  // and a 24:00 close.
  function isOpenAtDayTime(hours, dayIndex, minuteOfDay) {
    var h = normalizeHours(hours);
    if (!h) return false;
    var today = h.days[DAY_KEYS[dayIndex]];
    if (today && !today.closed) {
      var o = minutesOf(today.open), c = minutesOf(today.close);
      if (o !== null && c !== null) {
        if (c > o) { if (minuteOfDay >= o && minuteOfDay < c) return true; }
        else if (minuteOfDay >= o) return true; // overnight: today's part
      }
    }
    var prev = h.days[DAY_KEYS[(dayIndex + 6) % 7]];
    if (prev && !prev.closed) {
      var po = minutesOf(prev.open), pc = minutesOf(prev.close);
      if (po !== null && pc !== null && pc <= po && minuteOfDay < pc) return true;
    }
    return false;
  }

  function zonedParts(date, timeZone) {
    var fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'America/Chicago', weekday: 'short',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    var parts = {};
    fmt.formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    var wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
    return { dayIndex: wd, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
  }

  function isOpenAt(hours, date) {
    var h = normalizeHours(hours);
    if (!h) return false;
    var zp = zonedParts(date instanceof Date ? date : new Date(date), h.timeZone);
    if (zp.dayIndex === undefined) return false;
    return isOpenAtDayTime(h, zp.dayIndex, zp.minutes);
  }

  function evaluate(hours, date) {
    var h = normalizeHours(hours) || defaultHours();
    var when = date instanceof Date ? date : (date ? new Date(date) : new Date());
    var open = isOpenAt(h, when);
    var local = '';
    try {
      local = new Intl.DateTimeFormat('en-US', { timeZone: h.timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(when);
    } catch (e) { local = when.toISOString(); }
    return {
      isOpen: open, isOpenNow: open, isAfterHours: !open,
      timeZone: h.timeZone, localTime: local,
      hoursText: formatHours(h), hours: h
    };
  }

  /* ---------- snapshot integration (browser) ---------- */

  function snapshotOf(snap) {
    if (snap && typeof snap === 'object') return snap;
    return (root.state && root.state.snapshot) || {};
  }
  function moduleRow(snap, key) {
    var list = Array.isArray(snap.moduleSettings) ? snap.moduleSettings : [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i] || {};
      if (text(r.moduleKey || r.module_key) === key) return r;
    }
    return null;
  }
  function businessTimeZone(snap) {
    var b = (snap && snap.business) || {};
    return text(b.timeZone || b.timezone) ||
      (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '') ||
      'America/Chicago';
  }

  // The resolution chain every consumer uses. Returns
  // { hours, source: 'settings'|'receptionist-text'|'default', timeZone }.
  function resolveHours(snapInput) {
    var snap = snapshotOf(snapInput);
    var tz = businessTimeZone(snap);
    var row = moduleRow(snap, MODULE_KEY);
    var structured = row ? normalizeHours(row.config, tz) : null;
    if (structured) {
      if (!text(row.config && row.config.timeZone)) structured.timeZone = tz;
      return { hours: structured, source: 'settings', timeZone: structured.timeZone };
    }
    var rec = moduleRow(snap, RECEPTIONIST_KEY);
    var legacyText = rec && rec.config ? text(rec.config.businessHours) : '';
    if (legacyText) {
      var parsed = parseFreeText(legacyText, tz);
      if (parsed) return { hours: parsed, source: 'receptionist-text', timeZone: tz };
      // Unparseable legacy text: keep the tenant working on the default
      // schedule for the flag, while the raw text still displays as-is
      // (receptionist falls back to it when source is 'default' + legacy).
      return { hours: defaultHours(tz), source: 'default', timeZone: tz, legacyText: legacyText };
    }
    return { hours: defaultHours(tz), source: 'default', timeZone: tz };
  }

  function derivedText(snapInput) {
    var resolved = resolveHours(snapInput);
    if (resolved.source === 'default' && resolved.legacyText) return resolved.legacyText;
    return formatHours(resolved.hours);
  }

  function evaluateNow(snapInput, date) {
    var resolved = resolveHours(snapInput);
    var ev = evaluate(resolved.hours, date);
    ev.source = resolved.source;
    if (resolved.source === 'default' && resolved.legacyText) ev.hoursText = resolved.legacyText;
    return ev;
  }

  /* ---------- save (browser, owner/admin — same gate as receptionist) ---------- */

  function canManage(snap) {
    var role = text(snap && snap.user && snap.user.roleName).toLowerCase();
    return role === 'owner' || role === 'administrator';
  }

  async function saveHours(hoursInput) {
    var snap = snapshotOf();
    if (!canManage(snap)) throw new Error('Only a business owner or administrator can change business hours.');
    var hours = normalizeHours(hoursInput, businessTimeZone(snap));
    if (!hours) throw new Error('Business hours are incomplete.');
    var api = root.H38_SUPABASE_SHARED_CLIENT && root.H38_SUPABASE_SHARED_CLIENT.ensure ? root.H38_SUPABASE_SHARED_CLIENT.ensure() : null;
    if (!api) throw new Error('Secure settings connection is unavailable.');
    var session = await api.auth.getSession();
    if (session.error) throw session.error;
    if (!session.data || !session.data.session || !session.data.session.user) throw new Error('Sign in again before saving settings.');
    var businessId = text(root.state && root.state.businessId);
    if (!businessId) throw new Error('Open a business first.');
    var nowIso = new Date().toISOString();
    var result = await api.from('business_module_settings').upsert(
      { business_id: businessId, module_key: MODULE_KEY, enabled: true, config: hours, updated_at: nowIso },
      { onConflict: 'business_id,module_key' });
    if (result.error) throw result.error;
    if (!Array.isArray(snap.moduleSettings)) snap.moduleSettings = [];
    var list = snap.moduleSettings;
    var i = list.findIndex(function (r) { return text(r.moduleKey || r.module_key) === MODULE_KEY; });
    var rowOut = { business_id: businessId, module_key: MODULE_KEY, moduleKey: MODULE_KEY, enabled: true, config: hours };
    if (i >= 0) list[i] = rowOut; else list.push(rowOut);
    // Keep the receptionist's legacy text field as a DERIVED display of the
    // single source (the live voice path reads that text). It is never an
    // independent value again: rewrite it from the structured hours, in the
    // snapshot and — when a receptionist row already exists — on the server.
    var derived = formatHours(hours);
    var recRow = moduleRow(snap, RECEPTIONIST_KEY);
    if (recRow && recRow.config) {
      recRow.config = Object.assign({}, recRow.config, { businessHours: derived });
      try {
        await api.from('business_module_settings').upsert(
          { business_id: businessId, module_key: RECEPTIONIST_KEY, enabled: recRow.enabled === true, config: recRow.config, updated_at: nowIso },
          { onConflict: 'business_id,module_key' });
      } catch (e) { /* derived text resyncs on the next receptionist save too */ }
    }
    return { hours: hours, derivedText: derived };
  }

  /* ---------- Settings UI (the one editor) ---------- */

  function esc(s) {
    if (typeof root.esc === 'function') return root.esc(s);
    return text(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var COMMON_ZONES = ['America/Chicago', 'America/New_York', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC'];

  function editorHtml(resolved) {
    var hours = resolved.hours;
    var zones = COMMON_ZONES.slice();
    if (zones.indexOf(hours.timeZone) < 0) zones.unshift(hours.timeZone);
    var rowsHtml = ORDER.map(function (k) {
      var d = hours.days[k];
      return '<div class="h38-bh-row" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0">' +
        '<strong style="min-width:92px">' + DAY_LABELS[k] + '</strong>' +
        '<label><input type="checkbox" data-bh-closed="' + k + '"' + (d.closed ? ' checked' : '') + '> Closed</label>' +
        '<label>Open <input type="time" data-bh-open="' + k + '" value="' + esc(d.open) + '"' + (d.closed ? ' disabled' : '') + '></label>' +
        '<label>Close <input type="time" data-bh-close="' + k + '" value="' + esc(d.close === '24:00' ? '23:59' : d.close) + '"' + (d.closed ? ' disabled' : '') + '></label></div>';
    }).join('');
    var sourceNote = resolved.source === 'receptionist-text'
      ? '<p class="muted small">These hours were read from your receptionist\u2019s hours text. Saving here makes them the one structured source every part of the Office uses.</p>'
      : resolved.source === 'default'
        ? '<p class="muted small">Showing the standard Monday\u2013Friday schedule — nothing was saved yet. Saving here sets the one source every part of the Office uses.</p>'
        : '<p class="muted small">This is the one source for business hours: the AI receptionist, booking and the schedule all read from here.</p>';
    var ev = evaluate(hours);
    return sourceNote +
      '<p><strong>' + esc(formatHours(hours)) + '</strong><br><span class="muted small" data-bh-status>Right now in ' + esc(hours.timeZone) + ': ' + (ev.isOpen ? 'Open' : 'After hours') + ' (' + esc(ev.localTime) + ')</span></p>' +
      '<form id="businessHoursForm">' + rowsHtml +
      '<label>Timezone</label><select data-bh-tz>' + zones.map(function (z) { return '<option value="' + esc(z) + '"' + (z === hours.timeZone ? ' selected' : '') + '>' + esc(z) + '</option>'; }).join('') + '</select>' +
      '<div class="actions"><button>Save business hours</button></div>' +
      '<p class="muted small">The AI receptionist shows these hours and uses the open/after-hours result from them. Requests and bookings are never blocked by hours — ones that arrive outside hours are flagged for you.</p></form>';
  }

  function mountSettingsSection() {
    if (typeof document === 'undefined') return false;
    var mount = document.getElementById('businessHoursSection');
    if (!mount) return false;
    var resolved = resolveHours();
    mount.innerHTML = editorHtml(resolved);
    mount.querySelectorAll('[data-bh-closed]').forEach(function (box) {
      box.onchange = function () {
        var k = box.getAttribute('data-bh-closed');
        var open = mount.querySelector('[data-bh-open="' + k + '"]');
        var close = mount.querySelector('[data-bh-close="' + k + '"]');
        if (open) open.disabled = box.checked;
        if (close) close.disabled = box.checked;
      };
    });
    var form = document.getElementById('businessHoursForm');
    if (form) form.onsubmit = function (e) {
      e.preventDefault();
      var days = {};
      ORDER.forEach(function (k) {
        var closed = mount.querySelector('[data-bh-closed="' + k + '"]').checked;
        var open = mount.querySelector('[data-bh-open="' + k + '"]').value || '08:00';
        var close = mount.querySelector('[data-bh-close="' + k + '"]').value || '17:00';
        days[k] = { closed: closed, open: open, close: close };
      });
      var tzSel = mount.querySelector('[data-bh-tz]');
      saveHours({ version: 1, timeZone: tzSel ? tzSel.value : resolved.hours.timeZone, days: days })
        .then(function () {
          if (typeof root.toast === 'function') root.toast('Business hours saved — the receptionist, booking and schedule now read from this one source.');
          mountSettingsSection();
        })
        .catch(function (err) { if (typeof root.toast === 'function') root.toast(err.message || String(err), true); });
    };
    return true;
  }

  var api = {
    build: BUILD, MODULE_KEY: MODULE_KEY,
    DAY_KEYS: DAY_KEYS, DAY_LABELS: DAY_LABELS, DAY_SHORT: DAY_SHORT,
    defaultHours: defaultHours, normalizeHours: normalizeHours,
    formatHours: formatHours, formatTime: formatTime, parseFreeText: parseFreeText,
    isOpenAtDayTime: isOpenAtDayTime, isOpenAt: isOpenAt, evaluate: evaluate,
    resolveHours: resolveHours, derivedText: derivedText, evaluateNow: evaluateNow,
    businessTimeZone: businessTimeZone, saveHours: saveHours,
    editorHtml: editorHtml, mountSettingsSection: mountSettingsSection
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.H38_BUSINESS_HOURS = Object.freeze(api);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
