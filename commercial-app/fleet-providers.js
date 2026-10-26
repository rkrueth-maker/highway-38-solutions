/* ============================================================================
 * H38 Fleet Providers — connect vehicle trackers (Bouncie, Samsara, Geotab,
 * Linxup) to the Office. Business-generic: any Office business whose owner
 * turns the module on gets the provider panel on the Fleet workspace.
 * ----------------------------------------------------------------------------
 * Module intake (MODULE_PERFORMANCE_STANDARD):
 *   - Canonical route: the existing Fleet workspace ('fleet'); secondary,
 *     on-demand surface loaded only with the Fleet script group
 *     (h38-script-loader PAGE_FLEET). Nothing added to startup or Today.
 *   - Server owner: edge function 'fleet-providers' (registry + sync);
 *     Bouncie delegates to the existing 'nl-bouncie-fleet' function.
 *   - Data sources: one 'providers' invoke on first Fleet render for an
 *     owner/administrator (registry + this business's connection states),
 *     then user-driven connect/sync/disconnect invokes. No polling.
 *   - Bounds: providers <= 8; vehicles/trips bounded server-side.
 *   - Cache: none client-side beyond the rendered card (TTL 0); connection
 *     state re-read on every Fleet open and after every action.
 *   - Failure behavior: a rejected credential shows the provider's own
 *     error and stores nothing; sync errors surface in the card, never a
 *     dead end.
 *   - Northern Lakes keeps its dedicated fleet screen (northern-bouncie-
 *     fleet.js) exactly as before — this panel does not render there.
 *
 * Owner Controls: id-guarded registration of 'fleet_providers' (default
 * OFF). Tenant switch is server-backed: a business_module_settings row for
 * 'fleet_providers' wins over the per-browser Owner Controls toggle.
 * Credentials go straight to the edge function over the owner's session;
 * the server validates them with the provider, then stores secrets
 * AES-GCM-encrypted in fleet_provider_secrets. Nothing secret is ever
 * written to business_records or kept in this client.
 * ========================================================================== */
(function() {
'use strict';
var BUILD = '20261026-fleet-providers-5';
var FEATURE_ID = 'fleet_providers';
var ENDPOINT = 'fleet-providers';
var BOUNCIE_ENDPOINT = 'nl-bouncie-fleet';
var w = typeof window !== 'undefined' ? window : globalThis;

function text(v) { return String(v == null ? '' : v).trim(); }
function esc(v) { return typeof w.esc === 'function' ? w.esc(v) : text(v).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function toast(msg, bad) { if (typeof w.toast === 'function') w.toast(msg, bad); else if (bad) console.warn(msg); else console.log(msg); }
function businessId() { return text((w.state && w.state.businessId) || (w.H38_SUPABASE_AUTH && w.H38_SUPABASE_AUTH.getState && w.H38_SUPABASE_AUTH.getState().selectedBusinessId) || ''); }
function businessKey() {
  try { var q = new URLSearchParams(location.search).get('businessKey'); if (q) return text(q).toLowerCase(); } catch (_) {}
  var s = w.state || {}, b = (s.snapshot && s.snapshot.business) || {};
  return text(s.businessKey || b.businessKey || b['Business Key']).toLowerCase();
}
function role() {
  var u = (w.state && w.state.snapshot && w.state.snapshot.user) || {};
  return text(u.roleId || u.roleName || u.role).toLowerCase();
}
function ownerAdmin() { return ['owner', 'administrator'].includes(role()); }
function client() { return w.H38_SUPABASE_SHARED_CLIENT && w.H38_SUPABASE_SHARED_CLIENT.ensure ? w.H38_SUPABASE_SHARED_CLIENT.ensure() : null; }

/* ---------- feature registration + enablement ---------- */
var FEATURE_DEF = {
  id: FEATURE_ID,
  title: 'Vehicle tracker connections',
  desc: 'Connect Bouncie, Samsara, Geotab, or Linxup trackers so vehicle positions land on the dispatch map and recorded stops.',
  icon: '📡',
  default: false,
  category: 'Fleet'
};
function registerFeature() {
  var oc = w.H38OwnerControls;
  if (!oc || !Array.isArray(oc.FEATURES)) return false;
  var exists = oc.FEATURES.some(function(f) { return f && f.id === FEATURE_ID; });
  if (!exists) oc.FEATURES.push(FEATURE_DEF);
  return true;
}
function serverSetting() {
  var snapshot = (w.state && w.state.snapshot) || {};
  var list = Array.isArray(snapshot.moduleSettings) ? snapshot.moduleSettings : [];
  for (var i = 0; i < list.length; i++) {
    var row = list[i] || {};
    if (text(row.moduleKey || row.module_key) === FEATURE_ID) return row;
  }
  return null;
}
function enabled() {
  if (!registerFeature() || !businessId()) return false;
  var row = serverSetting();
  if (row) return row.enabled === true;
  var oc = w.H38OwnerControls;
  try { if (oc && typeof oc.isEnabled === 'function') return oc.isEnabled(FEATURE_ID) === true; } catch (_) {}
  return false;
}
function visible() {
  return enabled() && ownerAdmin() && businessKey() !== 'northern-lakes';
}

/* ---------- styles ---------- */
var styleInjected = false;
function ensureStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  var css = [
    '.h38-fp-card{margin-bottom:16px}',
    '.h38-fp-row{border-top:1px solid var(--border,#e2e2e2);padding:12px 0}',
    '.h38-fp-row:first-of-type{border-top:none}',
    '.h38-fp-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap}',
    '.h38-fp-name{font-weight:700;font-size:1.05em}',
    '.h38-fp-note{font-size:.9em;color:#666;margin:4px 0 8px}',
    '.h38-fp-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}',
    '.h38-fp-actions button{min-height:44px;padding:10px 14px;font-size:1em;border-radius:10px}',
    '.h38-fp-form label{display:block;margin:8px 0 4px;font-weight:600}',
    '.h38-fp-form input{width:100%;min-height:44px;font-size:1em}',
    '.h38-fp-msg{font-size:.92em;margin-top:8px}',
    '.h38-fp-badge{display:inline-block;border:1px solid #d9a441;color:#7a5a12;border-radius:999px;padding:1px 8px;font-size:.8em;margin-left:6px;vertical-align:middle}'
  ].join('\n');
  var el = document.createElement('style');
  el.setAttribute('data-h38-fleet-providers', '1');
  el.textContent = css;
  document.head.appendChild(el);
}

/* ---------- session + invoke (same pattern as northern-bouncie-fleet) ---------- */
var SIGN_IN_AGAIN = 'Your sign-in session has expired. Please sign in again, then retry.';
function sessionExpired() { try { w.H38_SUPABASE_SESSION_RECOVERY && w.H38_SUPABASE_SESSION_RECOVERY.validate && w.H38_SUPABASE_SESSION_RECOVERY.validate(); } catch (_) {} return new Error(SIGN_IN_AGAIN); }
async function validSession(forceRefresh) {
  var db = client(); if (!db) throw new Error('Supabase client unavailable.');
  var result = await db.auth.getSession(); if (result.error) throw result.error;
  var session = result.data && result.data.session; if (!session) throw sessionExpired();
  var expiring = Number(session.expires_at || 0) * 1000 <= Date.now() + 120000;
  if (forceRefresh || expiring) {
    var refreshed = await db.auth.refreshSession();
    if (refreshed.error || !refreshed.data || !refreshed.data.session) throw sessionExpired();
    session = refreshed.data.session;
  }
  var verified = await db.auth.getUser(session.access_token);
  if (verified.error || !verified.data || !verified.data.user) { if (!forceRefresh) return validSession(true); throw sessionExpired(); }
  return session;
}
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise(function(_, reject) { setTimeout(function() { reject(new Error(label + ' took too long. Check your connection and retry.')); }, ms); })
  ]);
}
async function invoke(endpoint, action, body) {
  return withTimeout(invokeInner(endpoint, action, body), 25000, 'The tracker service');
}
async function invokeInner(endpoint, action, body) {
  var db = client(); if (!db) throw new Error('Supabase client unavailable.');
  var session = await validSession();
  var token = session.access_token; if (!token) throw sessionExpired();
  /* Plain fetch, NOT db.functions.invoke: in this app the invoke path
   * delivers a doubled Authorization header ("Bearer <t> Bearer <t>") to
   * the function, which the Auth API rejects as malformed (proven live
   * 2026-10-26: same token via fetch passes, via invoke fails). */
  var base = text(db.supabaseUrl || ''); var apiKey = text(db.supabaseKey || '');
  if (!base) throw new Error('Supabase client unavailable.');
  var response = await fetch(base + '/functions/v1/' + endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: apiKey, authorization: 'Bearer ' + token, 'x-client-info': 'fleet-providers-v1' },
    body: JSON.stringify(Object.assign({ action: action, businessId: businessId() }, body || {}))
  });
  var data = null;
  try { data = await response.json(); } catch (_) { data = null; }
  if (!response.ok && !data) throw new Error('Fleet provider request failed (' + response.status + ').');
  if (!data || data.status !== 'PASS') {
    var message = text((data && data.message) || 'Fleet provider request failed.');
    if (/auth session is invalid|session is invalid or expired/i.test(message)) throw sessionExpired();
    throw new Error(message);
  }
  return data;
}

/* ---------- rendering ---------- */
var runtime = { providers: [], loading: false, loaded: false, attempted: false, businessId: '', error: '', openForm: '', busy: '', renderedSig: '' };
function currentCard() { return typeof document !== 'undefined' ? document.getElementById('h38FleetProvidersEntry') : null; }
/* The app re-renders #mainContent as snapshots update, which replaces the
 * card element. Rendering therefore always targets the LIVE element by id
 * and re-renders whenever the live element is empty or the state changed
 * (the route-planner pattern) — a captured element goes stale silently. */
function renderState() {
  var card = currentCard(); if (!card) return;
  var sig = [runtime.businessId, runtime.loading ? 1 : 0, runtime.loaded ? 1 : 0, runtime.error, runtime.openForm, runtime.busy,
    runtime.providers.map(function(p) { return p.id + ':' + (p.connection ? p.connection.status : '-'); }).join(',')].join('|');
  if (sig === runtime.renderedSig && card.innerHTML) return;
  runtime.renderedSig = sig;
  render(card);
}
function statusPill(conn) {
  if (!conn) return '<span class="pill">not connected</span>';
  var s = text(conn.status);
  return '<span class="pill">' + esc(s.replaceAll('_', ' ')) + '</span>';
}
function providerRow(p) {
  var conn = p.connection;
  var connected = !!(conn && conn.status === 'connected');
  var html = '<div class="h38-fp-row" data-h38fp-row="' + esc(p.id) + '">';
  html += '<div class="h38-fp-head"><span class="h38-fp-name">' + esc(p.name) +
    (p.provisional ? '<span class="h38-fp-badge">provisional</span>' : '') + '</span>' + statusPill(conn) + '</div>';
  html += '<p class="h38-fp-note">' + esc(p.blurb) + '</p>';
  if (p.provisional) html += '<p class="h38-fp-note">New connection — being proven against real accounts now. Connect with care and check the first sync.</p>';
  if (connected && conn.lastSyncAt) html += '<p class="h38-fp-note">Last synced: ' + esc(new Date(conn.lastSyncAt).toLocaleString()) + '</p>';
  html += '<div class="h38-fp-actions">';
  if (connected) {
    html += '<button type="button" data-h38fp-sync="' + esc(p.id) + '"' + (runtime.busy ? ' disabled' : '') + '>Sync now</button>';
    html += '<button type="button" class="secondary" data-h38fp-disconnect="' + esc(p.id) + '"' + (runtime.busy ? ' disabled' : '') + '>Disconnect</button>';
  } else if (p.authModel === 'oauth2') {
    html += '<button type="button" data-h38fp-oauth="' + esc(p.id) + '"' + (runtime.busy ? ' disabled' : '') + '>Connect ' + esc(p.name) + '</button>';
  } else {
    html += '<button type="button" data-h38fp-open="' + esc(p.id) + '"' + (runtime.busy ? ' disabled' : '') + '>Connect ' + esc(p.name) + '</button>';
  }
  html += '</div>';
  if (!connected && p.authModel !== 'oauth2' && runtime.openForm === p.id) {
    html += '<form class="h38-fp-form" data-h38fp-form="' + esc(p.id) + '">';
    (p.credentialFields || []).forEach(function(f) {
      html += '<label for="h38fp-' + esc(p.id) + '-' + esc(f.key) + '">' + esc(f.label) + '</label>' +
        '<input id="h38fp-' + esc(p.id) + '-' + esc(f.key) + '" name="' + esc(f.key) + '" type="' + (f.secret ? 'password' : 'text') + '" autocomplete="off"' +
        (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '>' +
        (f.help ? '<p class="h38-fp-note">' + esc(f.help) + '</p>' : '');
    });
    html += '<div class="h38-fp-actions"><button type="submit"' + (runtime.busy ? ' disabled' : '') + '>Save &amp; connect</button>' +
      '<button type="button" class="secondary" data-h38fp-cancel>Cancel</button></div></form>';
  }
  html += '<div class="h38-fp-msg" data-h38fp-msg="' + esc(p.id) + '"></div></div>';
  return html;
}
function render(card) {
  var body = '';
  if (runtime.loading && !runtime.loaded) body = '<p class="h38-fp-note">Loading tracker connections…</p>';
  else if (runtime.error && !runtime.providers.length) body = '<p class="h38-fp-note">' + esc(runtime.error) + '</p><div class="h38-fp-actions"><button type="button" data-h38fp-retry>Retry</button></div>';
  else body = runtime.providers.map(providerRow).join('');
  card.innerHTML = '<h2>📡 Vehicle trackers</h2>' +
    '<p class="h38-fp-note">Connect a tracker account and vehicle positions show on the dispatch map and in recorded stops — next to phone crews, same screens. Credentials are checked with the provider first, then stored encrypted on the server. Nothing is stored if the provider rejects them.</p>' + body;
  bind(card);
}
function setMsg(providerId, msg, bad) {
  var card = currentCard(); if (!card) return;
  var node = card.querySelector('[data-h38fp-msg="' + providerId + '"]');
  if (node) { node.textContent = msg; node.style.color = bad ? '#b3261e' : '#2e7d32'; }
}
function bind(card) {
  var retry = card.querySelector('[data-h38fp-retry]');
  if (retry) retry.onclick = function() { runtime.attempted = false; load(true); };
  card.querySelectorAll('[data-h38fp-open]').forEach(function(btn) {
    btn.onclick = function() { runtime.openForm = btn.getAttribute('data-h38fp-open'); renderState(); };
  });
  card.querySelectorAll('[data-h38fp-cancel]').forEach(function(btn) {
    btn.onclick = function() { runtime.openForm = ''; renderState(); };
  });
  card.querySelectorAll('[data-h38fp-form]').forEach(function(form) {
    form.onsubmit = async function(ev) {
      ev.preventDefault();
      var providerId = form.getAttribute('data-h38fp-form');
      var creds = {};
      new FormData(form).forEach(function(v, k) { creds[k] = text(v); });
      runtime.busy = providerId; renderState();
      try {
        await invoke(ENDPOINT, 'connect', { provider: providerId, credentials: creds });
        runtime.openForm = '';
        toast('Connected. Run Sync now to pull vehicles and positions.');
        await load(true);
      } catch (err) { runtime.busy = ''; renderState(); setMsg(providerId, text(err && err.message || err), true); }
      runtime.busy = '';
    };
  });
  card.querySelectorAll('[data-h38fp-oauth]').forEach(function(btn) {
    btn.onclick = async function() {
      var providerId = btn.getAttribute('data-h38fp-oauth');
      runtime.busy = providerId; renderState();
      try {
        var result = await invoke(BOUNCIE_ENDPOINT, 'oauth-start', { returnUrl: location.href });
        if (result.authUrl) { location.href = result.authUrl; return; }
        throw new Error('The provider did not return a sign-in link.');
      } catch (err) { runtime.busy = ''; renderState(); setMsg(providerId, text(err && err.message || err), true); }
    };
  });
  card.querySelectorAll('[data-h38fp-sync]').forEach(function(btn) {
    btn.onclick = async function() {
      var providerId = btn.getAttribute('data-h38fp-sync');
      var provider = runtime.providers.find(function(p) { return p.id === providerId; });
      runtime.busy = providerId; renderState();
      try {
        var endpoint = provider && provider.delegatedFunction ? provider.delegatedFunction : ENDPOINT;
        var result = await invoke(endpoint, 'sync', { provider: providerId });
        var extra = result.provisional ? ' (provisional mapper — check the vehicles look right)' : '';
        toast('Synced ' + (result.vehicles != null ? result.vehicles : '—') + ' vehicle(s)' + (result.trips ? ', ' + result.trips + ' trip(s)' : '') + extra + '.');
        await load(true);
      } catch (err) { runtime.busy = ''; renderState(); setMsg(providerId, text(err && err.message || err), true); }
      runtime.busy = '';
    };
  });
  card.querySelectorAll('[data-h38fp-disconnect]').forEach(function(btn) {
    btn.onclick = async function() {
      var providerId = btn.getAttribute('data-h38fp-disconnect');
      if (!confirm('Disconnect this tracker? Saved credentials are removed. Vehicles already pulled stay in Fleet.')) return;
      runtime.busy = providerId; renderState();
      try {
        await invoke(ENDPOINT, 'disconnect', { provider: providerId });
        toast('Disconnected.');
        await load(true);
      } catch (err) { runtime.busy = ''; renderState(); setMsg(providerId, text(err && err.message || err), true); }
      runtime.busy = '';
    };
  });
}
async function load(force) {
  /* Network fetch happens once per business (auto) — re-entering after a
   * failure waits for Retry, so a render-triggered hook cannot loop.
   * Rendering is separate: renderState() paints the current state into
   * whatever card element is live, so app re-renders never strand a
   * blank replacement card. */
  if (runtime.loading) { renderState(); return; }
  if ((runtime.loaded || runtime.attempted) && !force) { renderState(); return; }
  runtime.attempted = true;
  runtime.loading = true; runtime.error = '';
  renderState();
  try {
    var result = await invoke(ENDPOINT, 'providers', {});
    runtime.providers = Array.isArray(result.providers) ? result.providers : [];
    runtime.loaded = true;
  } catch (err) { runtime.error = text(err && err.message || err); }
  runtime.loading = false;
  renderState();
}

/* ---------- page hook ---------- */
function fleetHook() {
  if (typeof document === 'undefined') return;
  var card = document.getElementById('h38FleetProvidersEntry');
  if (!visible() || text(w.state && w.state.page) !== 'fleet') {
    if (card) { card.remove(); runtime.loaded = false; runtime.attempted = false; runtime.providers = []; }
    return;
  }
  var bidNow = businessId();
  if (runtime.businessId && runtime.businessId !== bidNow) { runtime.loaded = false; runtime.attempted = false; runtime.providers = []; }
  runtime.businessId = bidNow;
  ensureStyle();
  var main = document.getElementById('mainContent');
  if (!main) return;
  if (!card) {
    card = document.createElement('section');
    card.className = 'card h38-fp-card';
    card.id = 'h38FleetProvidersEntry';
    var planner = document.getElementById('h38RoutePlannerEntry');
    if (planner && planner.parentNode === main) planner.insertAdjacentElement('afterend', card);
    else main.prepend(card);
    try {
      if (new URLSearchParams(location.search).get('bouncie') === 'connected') toast('Bouncie connected. Run Sync now to pull vehicles and trips.');
    } catch (_) {}
    load(false);
    return;
  }
  load(false);
}

/* ---------- boot ---------- */
var booted = false;
function start() {
  if (booted) return;
  booted = true;
  registerFeature();
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    var raf = false;
    new MutationObserver(function() {
      if (raf) return;
      raf = true;
      requestAnimationFrame(function() { raf = false; try { fleetHook(); } catch (e) {} });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  try { w.addEventListener('h38:business-snapshot-updated', function() { try { fleetHook(); } catch (e) {} }); } catch (e) {}
  fleetHook();
  w.H38FleetProviders = Object.freeze({ build: BUILD, enabled: enabled, feature: FEATURE_DEF });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
})();
