/* ============================================================================
 * H38 Plow Flow — Complete snow plowing operations (2026-10-11)
 * ----------------------------------------------------------------------------
 * The killer demo for selling to plow businesses. Complete flow:
 *
 *   1. Weather trigger  — snowfall forecast → "Snow incoming, activate?"
 *   2. Route building   — auto-build optimized routes from customer list
 *   3. Crew dispatch    — text crew their routes, track status
 *   4. Proof of service — photo + timestamp + GPS per stop
 *   5. Auto invoicing   — per-push invoices after route completion
 *
 * Design: Minimal Clean (Ricky picked Direction 3). Whitespace, subtle
 * borders, small icons. The dark action button is the ONLY colored element.
 *
 * Tenant awareness: activates ONLY for lawn-snow home type businesses.
 * A bathroom remodeler never sees plowing UI.
 *
 * Safety: crew texts go through the SMS approval queue (owner reviews
 * before anything sends). Invoices use the existing invoice flow.
 * ========================================================================== */
(function() {
'use strict';

const BUILD = '20261011-plow-flow-1';
const STORM_KEY_PREFIX = 'h38-plow-storm-';
const SNOW_THRESHOLD_INCHES = 2;

/* ---------- Helpers ---------- */
const text = v => String(v == null ? '' : v).trim();
const esc = v => text(v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const state = () => window.state || {};
const snapshot = () => state().snapshot || {};
const rows = n => Array.isArray(snapshot()[n]) ? snapshot()[n] : [];
const businessId = () => text(state().businessId);
const now = () => new Date().toISOString();
const uid = p => `${p}-${(globalThis.crypto?.randomUUID?.() || Date.now() + '-' + Math.random().toString(16).slice(2)).toUpperCase().slice(0, 13)}`;
const val = (row, ...keys) => { for (const k of keys) { if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k]; } return ''; };
const customerId = row => text(val(row, 'Customer ID', 'customerId'));

function toast(msg, bad) {
  if (typeof window.toast === 'function') window.toast(msg, bad);
  else (bad ? console.warn : console.log)('[PlowFlow]', msg);
}

/* ---------- Tenant gate: lawn-snow only ---------- */
function isLawnSnow() {
  try {
    if (window.H38OwnerHome && typeof window.H38OwnerHome.detectBusinessType === 'function') {
      return window.H38OwnerHome.detectBusinessType() === 'lawn-snow';
    }
  } catch (_) {}
  // Fallback: check business key / industry packs directly
  try {
    const b = snapshot().business || {};
    const key = text(b.businessKey || state().businessKey).toLowerCase();
    const packs = [].concat(b.industryPacks || [], (b.brandConfig && b.brandConfig.industryPacks) || []).join(' ').toLowerCase();
    return /northern-lakes|lawn|snow|plow|mow/.test(key + ' ' + packs);
  } catch (_) { return false; }
}

/* ---------- Business location (for weather) ---------- */
function businessCoords() {
  const b = snapshot().business || {};
  const lat = parseFloat(val(b, 'Latitude', 'latitude', 'lat'));
  const lng = parseFloat(val(b, 'Longitude', 'longitude', 'lng'));
  if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
    return { lat, lng };
  }
  // Default: Grand Rapids, MN (H38 home base)
  return { lat: 47.2372, lng: -93.5302 };
}

/* ---------- 1. WEATHER TRIGGER (Open-Meteo, free, no key) ---------- */
let weatherCache = null;
let weatherCacheAt = 0;

async function checkSnowfall(force) {
  const nowMs = Date.now();
  if (!force && weatherCache && (nowMs - weatherCacheAt) < 30 * 60 * 1000) return weatherCache;
  const { lat, lng } = businessCoords();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=snowfall_sum&timezone=auto&forecast_days=3&temperature_unit=fahrenheit`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Weather API error ' + resp.status);
    const data = await resp.json();
    const daily = data.daily || {};
    const dates = daily.time || [];
    const snowfall = daily.snowfall_sum || [];
    // Open-Meteo returns cm; convert to inches
    const days = dates.map((date, i) => ({
      date,
      inches: Math.round((Number(snowfall[i] || 0) / 2.54) * 10) / 10
    }));
    const next24h = days.slice(0, 2).reduce((sum, d) => sum + d.inches, 0);
    const result = {
      ok: true,
      days,
      next24h: Math.round(next24h * 10) / 10,
      alert: next24h >= SNOW_THRESHOLD_INCHES,
      checkedAt: now()
    };
    weatherCache = result;
    weatherCacheAt = nowMs;
    return result;
  } catch (err) {
    return { ok: false, error: err.message || String(err), alert: false, days: [], next24h: 0 };
  }
}

/* ---------- 2. STORM STATE ---------- */
function stormKey() { return STORM_KEY_PREFIX + (businessId() || 'none'); }

function getStorm() {
  try {
    const raw = localStorage.getItem(stormKey());
    if (!raw) return null;
    const storm = JSON.parse(raw);
    // Stale storms (>48h old) are archived, not active
    if (storm && storm.createdAt && (Date.now() - new Date(storm.createdAt).getTime()) > 48 * 3600 * 1000) {
      storm.status = 'archived';
    }
    return storm;
  } catch (_) { return null; }
}

function saveStorm(storm) {
  try { localStorage.setItem(stormKey(), JSON.stringify(storm)); } catch (_) {}
}

function clearStorm() {
  try { localStorage.removeItem(stormKey()); } catch (_) {}
}

/* Get customers set up for automatic plowing */
function autoPlowCustomers() {
  return rows('customers').filter(row => {
    if (!customerId(row)) return false;
    const rate = text(val(row, 'Plowing Rate'));
    if (!rate) return false;
    const auto = val(row, 'Automatic Plowing', 'Automatic Snow Plowing', 'automaticPlowing');
    return auto === true || ['true', '1', 'yes', 'on', 'automatic'].includes(text(auto).toLowerCase());
  });
}

/* Build route order: use existing optimizer if available, else address order */
function buildRouteOrder(customers) {
  // Try the existing route optimizer
  try {
    if (window.H38RouteOptimization && typeof window.H38RouteOptimization.optimize === 'function') {
      const stops = customers.map(c => ({
        id: customerId(c),
        name: text(val(c, 'Customer Name', 'name')),
        address: text(val(c, 'Address', 'address', 'Street', 'street')),
        lat: parseFloat(val(c, 'Latitude', 'latitude')),
        lng: parseFloat(val(c, 'Longitude', 'longitude'))
      }));
      const result = window.H38RouteOptimization.optimize(stops);
      if (result && Array.isArray(result.order)) {
        const byId = {};
        customers.forEach(c => { byId[customerId(c)] = c; });
        return result.order.map(i => stops[i]).filter(s => s && byId[s.id]).map(s => byId[s.id]);
      }
    }
  } catch (_) {}
  // Fallback: alphabetical by address (stable, predictable)
  return customers.slice().sort((a, b) =>
    text(val(a, 'Address', 'address')).localeCompare(text(val(b, 'Address', 'address')))
  );
}

/* Activate a storm: create storm record + plow jobs */
async function activateStorm(opts) {
  opts = opts || {};
  const customers = autoPlowCustomers();
  if (!customers.length) {
    toast('No customers are set to automatic plowing yet. Add plowing rates first.', true);
    return null;
  }
  const ordered = buildRouteOrder(customers);
  const stormId = uid('STORM');
  const stops = ordered.map((c, i) => ({
    stopNumber: i + 1,
    customerId: customerId(c),
    customerName: text(val(c, 'Customer Name', 'name')),
    address: text(val(c, 'Address', 'address', 'Street', 'street')),
    phone: text(val(c, 'Phone', 'phone', 'Mobile Phone', 'mobilePhone')),
    rate: text(val(c, 'Plowing Rate')),
    status: 'pending', // pending → enroute → done
    proofPhoto: null,
    completedAt: null,
    jobId: null
  }));

  // Create a plow job per stop via the existing queue
  for (const stop of stops) {
    try {
      const jobId = uid('JOB');
      const record = {
        'Job ID': jobId,
        'Business ID': businessId(),
        'Customer ID': stop.customerId,
        'Project Title': `Snow plowing — ${stop.customerName}`,
        'Service Type': 'Snow plowing',
        'Service Date': new Date().toISOString().slice(0, 10),
        'Storm ID': stormId,
        'Status': 'Scheduled',
        'Billing Method': 'Per visit',
        'Service Rate': stop.rate,
        'Created Time': now(),
        'Updated Time': now(),
        'Record Version': 1
      };
      if (typeof window.queueOperation === 'function') {
        await window.queueOperation('SAVE_ENTITY', 'Job', jobId,
          { entity: 'jobs', record }, { collection: 'jobs', record, idKeys: ['Job ID'] }, true);
      }
      stop.jobId = jobId;
    } catch (err) {
      console.warn('[PlowFlow] Job creation failed for', stop.customerName, err);
    }
  }

  const storm = {
    id: stormId,
    businessId: businessId(),
    status: 'active', // active → dispatching → in-progress → complete
    createdAt: now(),
    snowfallInches: opts.snowfallInches || null,
    triggeredBy: opts.triggeredBy || 'manual',
    stops,
    crew: [], // {name, phone, routeAssigned:[stopNumbers], status}
    dispatchLog: []
  };
  saveStorm(storm);

  // Log to proof log so "While You Were Away" shows it
  try {
    if (typeof window.queueOperation === 'function') {
      const proofId = uid('PROOF');
      await window.queueOperation('SAVE_ENTITY', 'ProofLog', proofId, {
        entity: 'business_proof_log',
        record: {
          'id': proofId,
          'business_id': businessId(),
          'action': 'storm_activated',
          'description': `Storm response activated: ${stops.length} stops, ${opts.snowfallInches ? opts.snowfallInches + '" snow' : 'manual trigger'}`,
          'actor': '[ai:kit] Plow Flow',
          'created_at': now(),
          'metadata': JSON.stringify({ stormId, stopCount: stops.length })
        }
      }, { collection: 'business_proof_log', idKeys: ['id'] }, true);
    }
  } catch (_) {}

  return storm;
}

/* ---------- 3. CREW DISPATCH ---------- */
function getCrew() {
  // Staff/field users from the team
  const users = rows('users').concat(rows('teamMembers'), rows('employees'));
  return users
    .filter(u => {
      const role = text(val(u, 'Role', 'role', 'roleName', 'Title', 'title')).toLowerCase();
      const name = text(val(u, 'Name', 'name', 'Display Name', 'displayName'));
      return name && !/owner|admin/i.test(role);
    })
    .map(u => ({
      id: text(val(u, 'User ID', 'userId', 'id', 'Email', 'email')),
      name: text(val(u, 'Name', 'name', 'Display Name', 'displayName')),
      phone: text(val(u, 'Phone', 'phone', 'Mobile Phone', 'mobilePhone')),
      role: text(val(u, 'Role', 'role', 'Title', 'title'))
    }));
}

/* Draft a dispatch text for owner approval (never auto-sends) */
async function draftDispatchText(crewMember, assignedStops) {
  const stopList = assignedStops.map(s => `${s.stopNumber}. ${s.customerName} — ${s.address}`).join('\n');
  const body = `Plow route ready: ${assignedStops.length} stops.\n${stopList}\nReply DONE when finished.`;
  // Queue for owner approval via the SMS approval flow
  try {
    if (window.H38SmsApproval && typeof window.H38SmsApproval.queueForApproval === 'function') {
      await window.H38SmsApproval.queueForApproval({
        to: crewMember.phone,
        body: body.slice(0, 500),
        purpose: `Plow dispatch to ${crewMember.name}`,
        category: 'operational'
      });
      return { queued: true };
    }
  } catch (_) {}
  // Fallback: log it as a dispatch entry
  return { queued: false, body };
}

/* ---------- 4. PROOF OF SERVICE ---------- */
async function completeStop(stormId, stopNumber, proof) {
  const storm = getStorm();
  if (!storm || storm.id !== stormId) return null;
  const stop = storm.stops.find(s => s.stopNumber === stopNumber);
  if (!stop) return null;
  stop.status = 'done';
  stop.completedAt = now();
  if (proof) {
    stop.proofPhoto = proof.photo || null;
    stop.proofNote = proof.note || '';
    stop.proofGps = proof.gps || null;
  }
  // Update the job record
  if (stop.jobId && typeof window.queueOperation === 'function') {
    try {
      await window.queueOperation('SAVE_ENTITY', 'Job', stop.jobId, {
        entity: 'jobs',
        record: { 'Job ID': stop.jobId, 'Status': 'Completed', 'Completed Time': now(), 'Updated Time': now() }
      }, { collection: 'jobs', idKeys: ['Job ID'] }, true);
    } catch (_) {}
  }
  saveStorm(storm);

  // Check if all stops done → storm complete
  if (storm.stops.every(s => s.status === 'done')) {
    storm.status = 'complete';
    storm.completedAt = now();
    saveStorm(storm);
  }
  return storm;
}

/* ---------- 5. AUTO INVOICING ---------- */
async function generateStormInvoices(stormId) {
  const storm = getStorm();
  if (!storm || storm.id !== stormId) return { created: 0 };
  let created = 0;
  for (const stop of storm.stops) {
    if (stop.status !== 'done' || stop.invoiced) continue;
    try {
      const invId = uid('INV');
      const amount = parseFloat(String(stop.rate).replace(/[^0-9.]/g, '')) || 0;
      const record = {
        'Invoice ID': invId,
        'Business ID': businessId(),
        'Customer ID': stop.customerId,
        'Job ID': stop.jobId || '',
        'Storm ID': stormId,
        'Invoice Date': new Date().toISOString().slice(0, 10),
        'Due Date': new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        'Line Items': JSON.stringify([{ description: `Snow plowing — ${stop.completedAt ? new Date(stop.completedAt).toLocaleDateString() : 'storm visit'}`, amount }]),
        'Total': amount,
        'Amount Due': amount,
        'Status': 'Draft',
        'Created Time': now(),
        'Record Version': 1
      };
      if (typeof window.queueOperation === 'function') {
        await window.queueOperation('SAVE_ENTITY', 'Invoice', invId,
          { entity: 'invoices', record }, { collection: 'invoices', record, idKeys: ['Invoice ID'] }, true);
      }
      stop.invoiced = true;
      stop.invoiceId = invId;
      created++;
    } catch (err) {
      console.warn('[PlowFlow] Invoice failed for', stop.customerName, err);
    }
  }
  storm.invoicesGenerated = (storm.invoicesGenerated || 0) + created;
  saveStorm(storm);
  return { created };
}

/* ============================================================================
 * STORM CENTER UI — full-screen overlay, Minimal Clean design
 * ========================================================================== */
const OVERLAY_ID = 'h38PlowStormCenter';
const STYLE_ID = 'h38PlowFlowStyle';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
/* Plow Flow — Minimal Clean. Only the action button carries color. */
#${OVERLAY_ID} { position: fixed; inset: 0; z-index: 9990; background: #fff; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.h38-storm-wrap { max-width: 720px; margin: 0 auto; padding: 20px 16px 64px; display: flex; flex-direction: column; gap: 24px; }
.h38-storm-top { display: flex; align-items: center; gap: 12px; padding: 4px 0; }
.h38-storm-back { border: 1px solid #e5e7eb; background: #fff; border-radius: 10px; min-height: 44px; padding: 0 16px; font-size: .9rem; color: #374151; cursor: pointer; }
.h38-storm-title { margin: 0; font-size: 1.35rem; font-weight: 700; letter-spacing: -.02em; color: #1a1a1a; }
.h38-storm-sub { margin: 2px 0 0; color: #6b7280; font-size: .88rem; }
.h38-storm-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; background: #fff; }
.h38-storm-card h3 { margin: 0 0 4px; font-size: 1rem; font-weight: 650; color: #1a1a1a; display: flex; align-items: center; gap: 8px; }
.h38-storm-card .h38-storm-desc { margin: 0 0 16px; color: #6b7280; font-size: .88rem; line-height: 1.5; }
.h38-storm-btn { display: block; width: 100%; min-height: 52px; border: none; border-radius: 10px; background: #1a1a1a; color: #fff; font-size: .95rem; font-weight: 600; cursor: pointer; }
.h38-storm-btn:hover { background: #333; }
.h38-storm-btn:disabled { background: #d1d5db; cursor: not-allowed; }
.h38-storm-btn-quiet { display: block; width: 100%; min-height: 48px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; color: #374151; font-size: .9rem; font-weight: 500; cursor: pointer; margin-top: 8px; }
.h38-stop-row { display: flex; align-items: flex-start; gap: 12px; padding: 14px 0; border-top: 1px solid #f3f4f6; }
.h38-stop-row:first-of-type { border-top: none; padding-top: 0; }
.h38-stop-num { flex: none; width: 32px; height: 32px; border-radius: 50%; border: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: .8rem; font-weight: 600; color: #6b7280; }
.h38-stop-row[data-status="done"] .h38-stop-num { background: #1a1a1a; border-color: #1a1a1a; color: #fff; }
.h38-stop-row[data-status="enroute"] .h38-stop-num { border-color: #1a1a1a; color: #1a1a1a; }
.h38-stop-main { flex: 1; min-width: 0; }
.h38-stop-main strong { display: block; font-size: .92rem; color: #1a1a1a; }
.h38-stop-main small { display: block; color: #6b7280; font-size: .82rem; margin-top: 2px; }
.h38-stop-status { font-size: .72rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: #9ca3af; }
.h38-stop-row[data-status="done"] .h38-stop-status { color: #1a1a1a; }
.h38-stop-actions { display: flex; gap: 8px; margin-top: 10px; }
.h38-stop-actions button { flex: 1; min-height: 44px; border-radius: 8px; font-size: .85rem; font-weight: 600; cursor: pointer; }
.h38-stop-go { border: none; background: #1a1a1a; color: #fff; }
.h38-stop-done { border: 1px solid #e5e7eb; background: #fff; color: #374151; }
.h38-storm-empty { text-align: center; padding: 32px 16px; color: #6b7280; }
.h38-storm-empty p { margin: 8px 0 16px; font-size: .9rem; line-height: 1.5; }
.h38-weather-row { display: flex; gap: 12px; align-items: center; }
.h38-weather-big { font-size: 2rem; font-weight: 700; color: #1a1a1a; letter-spacing: -.02em; }
.h38-weather-meta { color: #6b7280; font-size: .85rem; line-height: 1.5; }
.h38-crew-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid #f3f4f6; }
.h38-crew-row:first-of-type { border-top: none; }
.h38-crew-row .h38-crew-info { flex: 1; }
.h38-crew-row strong { display: block; font-size: .9rem; color: #1a1a1a; }
.h38-crew-row small { color: #6b7280; font-size: .8rem; }
.h38-progress-line { height: 6px; background: #f3f4f6; border-radius: 3px; overflow: hidden; margin-top: 12px; }
.h38-progress-fill { height: 100%; background: #1a1a1a; border-radius: 3px; transition: width .3s; }
`;
  document.head.appendChild(el);
}

function stopStatusLabel(status) {
  return status === 'done' ? 'Done' : status === 'enroute' ? 'En route' : 'Waiting';
}

function renderStormCenter() {
  injectStyles();
  // Remove existing
  document.getElementById(OVERLAY_ID)?.remove();

  const storm = getStorm();
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Storm Center');

  if (!storm || storm.status === 'archived') {
    overlay.innerHTML = `
      <div class="h38-storm-wrap">
        <div class="h38-storm-top">
          <button type="button" class="h38-storm-back" data-storm-close>← Back</button>
          <div><h2 class="h38-storm-title">Storm Center</h2><p class="h38-storm-sub">Snow operations for your plow routes</p></div>
        </div>
        <div class="h38-storm-card" id="h38StormWeather"></div>
        <div class="h38-storm-card">
          <h3>❄️ No active storm</h3>
          <p class="h38-storm-desc">When snow is forecast, activate a storm to build routes, dispatch crew, and track every stop.</p>
          <button type="button" class="h38-storm-btn" data-storm-activate>Activate storm response</button>
          <button type="button" class="h38-storm-btn-quiet" data-storm-check-weather>Check snowfall forecast</button>
        </div>
      </div>`;
  } else {
    const done = storm.stops.filter(s => s.status === 'done').length;
    const total = storm.stops.length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const isComplete = storm.status === 'complete';

    overlay.innerHTML = `
      <div class="h38-storm-wrap">
        <div class="h38-storm-top">
          <button type="button" class="h38-storm-back" data-storm-close>← Back</button>
          <div><h2 class="h38-storm-title">Storm Center</h2><p class="h38-storm-sub">${isComplete ? 'Storm complete' : 'Storm in progress'} · ${done} of ${total} stops</p></div>
        </div>
        <div class="h38-storm-card">
          <h3>📍 Route progress</h3>
          <p class="h38-storm-desc">${isComplete ? 'Every stop is done. Invoices are ready to review.' : 'Work through each stop. Tap En route when heading out, Done with a photo when finished.'}</p>
          <div class="h38-progress-line"><div class="h38-progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="h38-storm-card">
          <h3>🗺️ Stops</h3>
          <p class="h38-storm-desc">${total} customers on automatic plowing, in route order.</p>
          ${storm.stops.map(s => `
            <div class="h38-stop-row" data-status="${s.status}">
              <div class="h38-stop-num">${s.status === 'done' ? '✓' : s.stopNumber}</div>
              <div class="h38-stop-main">
                <strong>${esc(s.customerName)}</strong>
                <small>${esc(s.address)}${s.rate ? ` · ${esc(s.rate)}/visit` : ''}</small>
                ${s.completedAt ? `<small>Done ${esc(new Date(s.completedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}))}</small>` : ''}
                <div class="h38-stop-actions">
                  ${s.status === 'pending' ? `<button type="button" class="h38-stop-go" data-stop-enroute="${s.stopNumber}">En route →</button>` : ''}
                  ${s.status !== 'done' ? `<button type="button" class="h38-stop-done" data-stop-done="${s.stopNumber}">✓ Mark done</button>` : `<span class="h38-stop-status">Done</span>`}
                </div>
              </div>
            </div>`).join('')}
        </div>
        <div class="h38-storm-card">
          <h3>👷 Crew dispatch</h3>
          <p class="h38-storm-desc">Texts go to your approval queue first. Nothing sends without your OK.</p>
          <div id="h38StormCrew"></div>
          <button type="button" class="h38-storm-btn-quiet" data-storm-dispatch>Draft dispatch texts</button>
        </div>
        ${isComplete ? `
        <div class="h38-storm-card">
          <h3>🧾 Invoicing</h3>
          <p class="h38-storm-desc">${storm.invoicesGenerated || 0} invoices generated. Review them in Money before sending.</p>
          <button type="button" class="h38-storm-btn" data-storm-invoice>Generate invoices (${total - (storm.invoicesGenerated || 0)} remaining)</button>
        </div>` : ''}
        ${!isComplete ? `
        <div class="h38-storm-card">
          <h3>🏁 Finish</h3>
          <p class="h38-storm-desc">End the storm when all routes are done. You can still generate invoices after.</p>
          <button type="button" class="h38-storm-btn-quiet" data-storm-end>End storm</button>
        </div>` : `
        <div class="h38-storm-card">
          <div class="h38-storm-empty">
            <div style="font-size:2rem">❄️</div>
            <p>Storm complete. All ${total} stops serviced.</p>
            <button type="button" class="h38-storm-btn-quiet" data-storm-archive>Archive storm</button>
          </div>
        </div>`}
      </div>`;
  }

  document.body.appendChild(overlay);
  wireStormCenter(overlay);
  // Load weather into the card if present
  const weatherEl = overlay.querySelector('#h38StormWeather');
  if (weatherEl) renderWeatherCard(weatherEl);
  // Load crew list
  const crewEl = overlay.querySelector('#h38StormCrew');
  if (crewEl) renderCrewList(crewEl);
  // Lock body scroll
  document.body.style.overflow = 'hidden';
}

function closeStormCenter() {
  document.getElementById(OVERLAY_ID)?.remove();
  document.body.style.overflow = '';
}

async function renderWeatherCard(el) {
  el.innerHTML = `<h3>🌨️ Snowfall forecast</h3><p class="h38-storm-desc">Checking…</p>`;
  const w = await checkSnowfall();
  if (!w.ok) {
    el.innerHTML = `<h3>🌨️ Snowfall forecast</h3><p class="h38-storm-desc">Couldn't reach the weather service. You can still activate manually.</p>`;
    return;
  }
  const daysHtml = w.days.map(d =>
    `<div><strong>${esc(d.date.slice(5))}</strong><small> ${d.inches}" snow</small></div>`
  ).join('');
  el.innerHTML = `
    <h3>🌨️ Snowfall forecast</h3>
    <div class="h38-weather-row">
      <div class="h38-weather-big">${w.next24h}"</div>
      <div class="h38-weather-meta">expected in the<br>next 48 hours${w.alert ? '<br><strong>Above plow threshold.</strong>' : ''}</div>
    </div>
    <div style="display:flex;gap:16px;margin-top:12px;color:#6b7280;font-size:.82rem;">${daysHtml}</div>`;
}

function renderCrewList(el) {
  const crew = getCrew();
  if (!crew.length) {
    el.innerHTML = `<p class="h38-storm-desc" style="margin:0">No crew members found. Add your team under Settings → Team first.</p>`;
    return;
  }
  el.innerHTML = crew.map((c, i) => `
    <div class="h38-crew-row">
      <div class="h38-crew-info"><strong>${esc(c.name)}</strong><small>${esc(c.phone || 'No phone on file')}${c.role ? ' · ' + esc(c.role) : ''}</small></div>
    </div>`).join('');
}

function wireStormCenter(overlay) {
  overlay.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-storm-close],[data-storm-activate],[data-storm-check-weather],[data-storm-dispatch],[data-storm-invoice],[data-storm-end],[data-storm-archive],[data-stop-enroute],[data-stop-done]');
    if (!t) return;

    if (t.hasAttribute('data-storm-close')) { closeStormCenter(); return; }

    if (t.hasAttribute('data-storm-check-weather')) {
      const el = overlay.querySelector('#h38StormWeather');
      if (el) await renderWeatherCard(el);
      return;
    }

    if (t.hasAttribute('data-storm-activate')) {
      t.disabled = true;
      t.textContent = 'Building routes…';
      try {
        const w = await checkSnowfall();
        const storm = await activateStorm({ snowfallInches: w.ok ? w.next24h : null, triggeredBy: 'manual' });
        if (storm) {
          toast(`Storm activated: ${storm.stops.length} stops routed.`);
          renderStormCenter(); // re-render with active storm
        } else {
          t.disabled = false;
          t.textContent = 'Activate storm response';
        }
      } catch (err) {
        toast(err.message || String(err), true);
        t.disabled = false;
        t.textContent = 'Activate storm response';
      }
      return;
    }

    if (t.hasAttribute('data-stop-enroute')) {
      const storm = getStorm();
      const stop = storm?.stops.find(s => s.stopNumber === Number(t.dataset.stopEnroute));
      if (stop) { stop.status = 'enroute'; saveStorm(storm); renderStormCenter(); }
      return;
    }

    if (t.hasAttribute('data-stop-done')) {
      const storm = getStorm();
      if (!storm) return;
      t.disabled = true;
      // Ask for a quick photo (optional — don't block)
      const wantPhoto = confirm('Add a completion photo for proof of service?');
      let photoData = null;
      if (wantPhoto) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        photoData = await new Promise(resolve => {
          input.onchange = () => {
            const f = input.files?.[0];
            if (!f) return resolve(null);
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).slice(0, 200000)); // cap size
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(f);
          };
          input.click();
          // If user cancels, resolve null after a moment
          setTimeout(() => resolve(null), 60000);
        });
      }
      // GPS stamp (best effort)
      let gps = null;
      try {
        const pos = await new Promise((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error('no gps'));
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 60000 });
        });
        gps = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      } catch (_) {}
      await completeStop(storm.id, Number(t.dataset.stopDone), { photo: photoData, gps });
      const updated = getStorm();
      const doneCount = updated.stops.filter(s => s.status === 'done').length;
      toast(`Stop ${t.dataset.stopDone} done (${doneCount}/${updated.stops.length}).${gps ? ' GPS stamped.' : ''}`);
      renderStormCenter();
      return;
    }

    if (t.hasAttribute('data-storm-dispatch')) {
      const storm = getStorm();
      const crew = getCrew();
      if (!storm || !crew.length) { toast('Need an active storm and crew members with phone numbers.', true); return; }
      t.disabled = true;
      t.textContent = 'Drafting…';
      let queued = 0;
      // Split stops evenly across crew with phones
      const withPhones = crew.filter(c => c.phone);
      if (!withPhones.length) { toast('No crew phone numbers on file.', true); t.disabled = false; t.textContent = 'Draft dispatch texts'; return; }
      const perCrew = Math.ceil(storm.stops.length / withPhones.length);
      for (let i = 0; i < withPhones.length; i++) {
        const assigned = storm.stops.slice(i * perCrew, (i + 1) * perCrew);
        if (!assigned.length) continue;
        const result = await draftDispatchText(withPhones[i], assigned);
        storm.dispatchLog.push({ crew: withPhones[i].name, stops: assigned.length, at: now(), queued: result.queued });
        if (result.queued) queued++;
      }
      storm.status = 'dispatching';
      saveStorm(storm);
      toast(queued ? `${queued} dispatch text(s) queued for your approval.` : 'Dispatch drafted. Check Messages to send.');
      t.disabled = false;
      t.textContent = 'Draft dispatch texts';
      return;
    }

    if (t.hasAttribute('data-storm-invoice')) {
      const storm = getStorm();
      if (!storm) return;
      t.disabled = true;
      t.textContent = 'Generating…';
      const { created } = await generateStormInvoices(storm.id);
      toast(created ? `${created} draft invoice(s) created. Review in Money.` : 'All stops already invoiced.');
      renderStormCenter();
      return;
    }

    if (t.hasAttribute('data-storm-end')) {
      const storm = getStorm();
      if (storm && confirm('End this storm? Unfinished stops stay as-is.')) {
        storm.status = 'complete';
        storm.completedAt = now();
        saveStorm(storm);
        renderStormCenter();
      }
      return;
    }

    if (t.hasAttribute('data-storm-archive')) {
      if (confirm('Archive this storm?')) { clearStorm(); closeStormCenter(); }
      return;
    }
  });

  // Escape closes
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeStormCenter();
  });
}

/* ============================================================================
 * OWNER HOME INTEGRATION — snow alert + active storm cards (lawn-snow only)
 * ========================================================================== */
let homePatchScheduled = false;

function patchOwnerHome() {
  if (homePatchScheduled) return;
  homePatchScheduled = true;
  requestAnimationFrame(() => {
    homePatchScheduled = false;
    try { doPatchOwnerHome(); } catch (_) {}
  });
}

function doPatchOwnerHome() {
  if (!isLawnSnow()) return;
  if (state().page !== 'today') return;
  const home = document.querySelector('.h38-owner-home');
  if (!home || home.querySelector('[data-h38-plow-flow]')) return;

  const storm = getStorm();
  const activeStorm = storm && storm.status !== 'archived' ? storm : null;

  const card = document.createElement('section');
  card.className = 'h38-action-card';
  card.dataset.h38PlowFlow = '1';

  if (activeStorm) {
    const done = activeStorm.stops.filter(s => s.status === 'done').length;
    const total = activeStorm.stops.length;
    card.innerHTML = `
      <div class="h38-action-top">
        <span class="h38-action-icon" aria-hidden="true">❄️</span>
        <div class="h38-action-text">
          <strong>Storm in progress <span class="h38-urgent-dot" aria-label="active"></span></strong>
          <small>${done} of ${total} stops done</small>
        </div>
      </div>
      <div class="h38-action-buttons">
        <button type="button" class="h38-action-main" data-plow-open>Open Storm Center →</button>
      </div>`;
  } else {
    // Check weather async, then fill in
    card.innerHTML = `
      <div class="h38-action-top">
        <span class="h38-action-icon" aria-hidden="true">❄️</span>
        <div class="h38-action-text">
          <strong>Storm Center</strong>
          <small>Checking snowfall forecast…</small>
        </div>
      </div>
      <div class="h38-action-buttons">
        <button type="button" class="h38-action-main" data-plow-open>Open Storm Center →</button>
      </div>`;
    checkSnowfall().then(w => {
      const small = card.querySelector('.h38-action-text small');
      const strong = card.querySelector('.h38-action-text strong');
      if (!small || !document.contains(card)) return;
      if (w.ok && w.alert) {
        strong.innerHTML = `Snow incoming <span class="h38-urgent-dot" aria-label="alert"></span>`;
        small.textContent = `${w.next24h}" expected. Activate your plow routes?`;
      } else if (w.ok) {
        small.textContent = `No significant snow in the forecast (${w.next24h}" expected).`;
      } else {
        small.textContent = 'Snow operations: routes, dispatch, proof, invoicing.';
      }
    }).catch(() => {});
  }

  card.querySelector('[data-plow-open]').addEventListener('click', () => renderStormCenter());

  // Insert after the route hero if present, else at top of cards
  const routeHero = home.querySelector('.h38-route-hero');
  if (routeHero?.nextSibling) routeHero.parentNode.insertBefore(card, routeHero.nextSibling);
  else if (routeHero) routeHero.parentNode.appendChild(card);
  else home.prepend(card);
}

/* ---------- Boot ---------- */
function start() {
  if (window.H38PlowFlow) return;
  // Observe for Owner Home renders (lawn-snow card injection)
  new MutationObserver(patchOwnerHome).observe(document.documentElement, { childList: true, subtree: true });
  patchOwnerHome();
  // Proactive weather check in background (non-blocking, cached)
  if (isLawnSnow()) setTimeout(() => checkSnowfall().catch(() => {}), 5000);

  window.H38PlowFlow = Object.freeze({
    build: BUILD,
    isLawnSnow,
    checkSnowfall,
    getStorm,
    activateStorm,
    completeStop,
    generateStormInvoices,
    openStormCenter: renderStormCenter,
    closeStormCenter
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
})();
