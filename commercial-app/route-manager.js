/* ============================================================================
 * H38 Route Manager — Route planning, crew check-ins, proof of service
 * ----------------------------------------------------------------------------
 * Routes with ordered stops for any trade (plow routes, service routes,
 * delivery runs). Works WITHOUT GPS hardware:
 *
 *   1. Owner builds routes: ordered customer stops, assigned to crew
 *   2. Crew checks in per stop: Arrived -> Done (photo + timestamp)
 *   3. Owner sees green/yellow/red completion across all routes
 *   4. Proof of service: per-stop timestamps, photos, notes, shareable link
 *   5. Bouncie: if connected, live vehicle positions overlay on the route map
 *
 * POSITIONING (do not contradict in UI):
 *   - Live phone tracking is "Coming soon" — never imply it works.
 *   - Routes, check-ins, and proof-of-service are the core offering.
 *   - Bouncie integration is the live vehicle path.
 *
 * Owner Controls: id-guarded registration of 'route_management' (default OFF).
 * Data: business_records collections 'routes' and 'routeStops' via queueOperation.
 * Map: Leaflet + OpenStreetMap, loaded on demand (same pattern as gps-dispatch).
 * ========================================================================== */
(function() {
'use strict';
if (typeof window === 'undefined') return;

var BUILD = '20261011-route-manager-1';
var ROUTES_COLLECTION = 'routes';
var STOPS_COLLECTION = 'routeStops';
var FEATURE_ID = 'route_management';

var w = window;

/* ---------- helpers ---------- */
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
function nowIso() {
  if (typeof w.now === 'function') return w.now();
  return new Date().toISOString();
}
function toast(msg, bad) {
  if (typeof w.toast === 'function') w.toast(msg, bad);
  else if (bad) console.warn('[RouteManager]', msg); else console.log('[RouteManager]', msg);
}
function newId(prefix) {
  if (typeof w.newId === 'function') return w.newId(prefix);
  return prefix + '-' + Math.random().toString(36).slice(2, 10).toUpperCase() + Date.now().toString(36).toUpperCase();
}
function records(name) {
  if (typeof w.records === 'function') return w.records(name) || [];
  var s = w.state || {};
  return (s.snapshot && s.snapshot[name]) || [];
}
function businessId() { return text((w.state && w.state.businessId) || ''); }
function currentUser() {
  var s = w.state || {}, u = (s.snapshot && s.snapshot.user) || {};
  return u;
}
function currentUserId() {
  var u = currentUser();
  return text(v(u, 'User ID', 'userId') || u.id || '');
}
function currentUserName() {
  var u = currentUser();
  return text(v(u, 'Name', 'Full Name', 'Display Name', 'userName') || u.name || u.email || 'Crew');
}
function isOwner() {
  try {
    var u = currentUser();
    var role = text(v(u, 'Role', 'role') || '').toLowerCase();
    return role === 'owner' || role === 'administrator' || role === 'admin';
  } catch (_) { return false; }
}

/* ---------- Owner Controls registration (id-guarded; never edit owner-controls.js) ---------- */
var FEATURE_DEF = {
  id: FEATURE_ID,
  title: 'Route management',
  desc: 'Plow/service routes with ordered stops, crew check-ins, and proof of service. Live phone tracking is coming soon — Bouncie vehicles show live when connected.',
  icon: '🗺️',
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
function ocEnabled(id) {
  var oc = w.H38OwnerControls;
  try { if (oc && typeof oc.isEnabled === 'function') return oc.isEnabled(id) === true; } catch (_) {}
  return false;
}
function enabled() { return registerFeature() && ocEnabled(FEATURE_ID) && !!businessId(); }

/* ---------- styles ---------- */
var styleInjected = false;
function ensureStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  var css = [
    '.h38-route-card{margin-bottom:16px}',
    '.h38-route-list{display:grid;gap:10px}',
    '.h38-route-item{border:1px solid var(--border,#e2e2e2);border-radius:12px;padding:14px;background:var(--card,#fff)}',
    '.h38-route-item .row-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}',
    '.h38-route-progress{height:8px;border-radius:4px;background:#eee;margin-top:8px;overflow:hidden}',
    '.h38-route-progress>div{height:100%;border-radius:4px;background:#2e7d32;transition:width .3s}',
    '.h38-route-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
    '.h38-route-actions button{min-height:44px;padding:10px 14px;font-size:1em;border-radius:10px}',
    '.h38-route-map{height:340px;border-radius:12px;border:1px solid var(--border,#e2e2e2);background:#eef2f5;margin:12px 0}',
    '.h38-stop{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--border,#e2e2e2);border-radius:12px;padding:12px;margin-bottom:8px;background:var(--card,#fff)}',
    '.h38-stop-dot{flex:none;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:.9em}',
    '.h38-stop-dot.pending{background:#9e9e9e}',
    '.h38-stop-dot.arrived{background:#f9a825}',
    '.h38-stop-dot.done{background:#2e7d32}',
    '.h38-stop-dot.missed{background:#c62828}',
    '.h38-stop-body{flex:1;min-width:0}',
    '.h38-stop-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}',
    '.h38-stop-actions button{min-height:48px;padding:12px 18px;font-size:1.05em;border-radius:10px;font-weight:600}',
    '.h38-stop-checkin{background:#2e7d32;color:#fff;border:none}',
    '.h38-stop-arrived{background:#f9a825;color:#000;border:none}',
    '.h38-route-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto}',
    '.h38-route-modal{background:#fff;border-radius:14px;padding:18px;max-width:520px;width:100%;margin:20px 0;max-height:90vh;overflow-y:auto}',
    '.h38-route-modal label{display:block;margin:10px 0 4px;font-weight:600}',
    '.h38-route-modal input,.h38-route-modal select,.h38-route-modal textarea{width:100%;min-height:44px;font-size:1em;border-radius:8px;border:1px solid #ccc;padding:8px 10px;box-sizing:border-box}',
    '.h38-route-modal .actions{display:flex;gap:8px;margin-top:16px}',
    '.h38-route-modal .actions button{min-height:48px;flex:1;font-size:1em;border-radius:10px}',
    '.h38-route-note{font-size:.9em;color:#666;margin-top:6px}',
    '.h38-stop-picker{max-height:220px;overflow-y:auto;border:1px solid #ddd;border-radius:8px;padding:6px}',
    '.h38-stop-picker label{display:flex!important;align-items:center;gap:8px;margin:4px 0!important;font-weight:400!important;min-height:44px;cursor:pointer}',
    '.h38-route-proof{background:#f5f5f5;border-radius:12px;padding:16px;margin:12px 0}',
    '.h38-route-proof h3{margin:0 0 8px}',
    '.h38-proof-link{display:flex;gap:8px;margin-top:8px}',
    '.h38-proof-link input{flex:1;min-height:44px;font-size:.9em}',
    '.h38-coming-soon-note{background:#fff8e1;border:1px solid #ffe082;border-radius:10px;padding:10px 12px;font-size:.9em;margin:12px 0}'
  ].join('\n');
  var el = document.createElement('style');
  el.setAttribute('data-h38-route-manager', '1');
  el.textContent = css;
  document.head.appendChild(el);
}

/* ---------- data layer ---------- */
function allRoutes() {
  return records(ROUTES_COLLECTION).filter(function(r) {
    return !/^(deleted|void|cancelled)$/i.test(text(v(r, 'Status')));
  });
}
function routeById(id) {
  return allRoutes().find(function(r) { return text(v(r, 'Route ID', 'id')) === text(id); }) || null;
}
function stopsForRoute(routeId) {
  return records(STOPS_COLLECTION)
    .filter(function(r) { return text(v(r, 'Route ID')) === text(routeId); })
    .sort(function(a, b) { return num(v(a, 'Stop Order', 'Order')) - num(v(b, 'Stop Order', 'Order')); });
}
function stopStatus(stop) {
  return text(v(stop, 'Status') || 'pending').toLowerCase();
}
function routeProgress(routeId) {
  var stops = stopsForRoute(routeId);
  var done = stops.filter(function(s) { return stopStatus(s) === 'done'; }).length;
  return { total: stops.length, done: done, pct: stops.length ? Math.round(done / stops.length * 100) : 0 };
}
function myRoutes() {
  var uid = currentUserId();
  var all = allRoutes();
  if (isOwner()) return all;
  return all.filter(function(r) {
    return text(v(r, 'Assigned User ID')) === uid || !text(v(r, 'Assigned User ID'));
  });
}

async function saveRoute(data) {
  var id = data.id || newId('ROUTE');
  var stamp = nowIso();
  var record = {
    'Route ID': id,
    'Business ID': businessId(),
    'Route Name': data.name,
    'Route Date': data.date || '',
    'Assigned User ID': data.assignedUserId || '',
    'Assigned Crew Name': data.assignedCrewName || '',
    'Status': data.status || 'planned',
    'Notes': data.notes || '',
    'Proof Token': data.proofToken || ('proof-' + Math.random().toString(36).slice(2, 14)),
    'Created Time': data.createdTime || stamp,
    'Record Version': 1
  };
  await w.queueOperation('SAVE_ROUTE', 'Route', id, {
    routeId: id, name: data.name, date: data.date, assignedUserId: data.assignedUserId,
    status: record['Status'], proofToken: record['Proof Token']
  }, { collection: ROUTES_COLLECTION, record: record, idKeys: ['Route ID'] });
  return id;
}

async function saveStop(routeId, data, order) {
  var id = data.id || newId('RSTOP');
  var stamp = nowIso();
  var record = {
    'Stop ID': id,
    'Business ID': businessId(),
    'Route ID': routeId,
    'Stop Order': order,
    'Customer ID': data.customerId || '',
    'Customer Name': data.customerName || '',
    'Address': data.address || '',
    'Lat': data.lat != null ? data.lat : '',
    'Lng': data.lng != null ? data.lng : '',
    'Status': data.status || 'pending',
    'Arrived At': data.arrivedAt || '',
    'Completed At': data.completedAt || '',
    'Photo': data.photo || '',
    'Checkin Lat': data.checkinLat != null ? data.checkinLat : '',
    'Checkin Lng': data.checkinLng != null ? data.checkinLng : '',
    'Notes': data.notes || '',
    'Created Time': stamp,
    'Record Version': 1
  };
  await w.queueOperation('SAVE_ROUTE_STOP', 'Route Stop', id, {
    stopId: id, routeId: routeId, order: order, status: record['Status']
  }, { collection: STOPS_COLLECTION, record: record, idKeys: ['Stop ID'] });
  return id;
}

async function updateStopStatus(stopRow, status, extra) {
  var id = text(v(stopRow, 'Stop ID'));
  var stamp = nowIso();
  var record = Object.assign({}, stopRow, { 'Status': status, 'Record Version': 1 });
  if (extra) {
    if (extra.arrivedAt) record['Arrived At'] = extra.arrivedAt;
    if (extra.completedAt) record['Completed At'] = extra.completedAt;
    if (extra.photo) record['Photo'] = extra.photo;
    if (extra.notes != null) record['Notes'] = extra.notes;
    if (extra.checkinLat != null) record['Checkin Lat'] = extra.checkinLat;
    if (extra.checkinLng != null) record['Checkin Lng'] = extra.checkinLng;
  }
  await w.queueOperation('SAVE_ROUTE_STOP', 'Route Stop', id, {
    stopId: id, status: status, at: stamp
  }, { collection: STOPS_COLLECTION, record: record, idKeys: ['Stop ID'] });
}

/* ---------- geocoding (best-effort, Nominatim, no key) ---------- */
var geoCache = {};
async function geocode(address) {
  var q = text(address);
  if (!q) return null;
  if (geoCache[q]) return geoCache[q];
  try {
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q);
    var resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) return null;
    var data = await resp.json();
    if (data && data[0]) {
      var c = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      if (Number.isFinite(c.lat) && Number.isFinite(c.lng)) { geoCache[q] = c; return c; }
    }
  } catch (_) {}
  return null;
}

/* ---------- customers / crew lookups ---------- */
function allCustomers() {
  return records('customers').filter(function(c) {
    return !/^(deleted|void|archived)$/i.test(text(v(c, 'Status')));
  });
}
function customerAddress(c) {
  var parts = [
    v(c, 'Address', 'Street', 'Address Line 1'),
    v(c, 'City'), v(c, 'State'), v(c, 'ZIP', 'Zip', 'Postal Code')
  ].map(text).filter(Boolean);
  return parts.join(', ');
}
function customerName(c) {
  return text(v(c, 'Customer Name', 'Name', 'Full Name', 'Business Name')) || 'Customer';
}
function customerIdOf(c) {
  return text(v(c, 'Customer ID', 'customerId', 'id'));
}
function allCrew() {
  var users = records('users');
  if (users.length) return users;
  return records('team').concat(records('employees'));
}
function crewName(u) {
  return text(v(u, 'Name', 'Full Name', 'Display Name')) || text(v(u, 'Email', 'email')) || 'Crew';
}
function crewIdOf(u) {
  return text(v(u, 'User ID', 'userId', 'Employee ID', 'id'));
}

/* ---------- Bouncie vehicles ---------- */
function bouncieVehicles() {
  var out = [];
  records('fleetVehicles').forEach(function(veh) {
    var lat = num(v(veh, 'Latitude', 'latitude', 'Lat', 'lat'));
    var lng = num(v(veh, 'Longitude', 'longitude', 'Lng', 'lng'));
    if (lat && lng) {
      out.push({
        label: text(v(veh, 'Nickname', 'Name', 'Vehicle Name')) ||
               [v(veh, 'Year'), v(veh, 'Make'), v(veh, 'Model')].map(text).filter(Boolean).join(' ') ||
               'Vehicle',
        lat: lat, lng: lng,
        at: text(v(veh, 'Last Known At', 'last_known_at', 'Updated At'))
      });
    }
  });
  return out;
}
function hasBouncie() { return bouncieVehicles().length > 0; }

/* ---------- Leaflet (on demand) ---------- */
var leafletPromise = null;
function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise(function(resolve, reject) {
    if (w.L && w.L.map) { resolve(w.L); return; }
    if (typeof document === 'undefined') { reject(new Error('No document')); return; }
    var css = document.querySelector('link[data-h38-route-leaflet]');
    if (!css) {
      css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      css.setAttribute('data-h38-route-leaflet', '1');
      document.head.appendChild(css);
    }
    var s = document.querySelector('script[data-h38-route-leaflet]');
    if (s) {
      s.addEventListener('load', function() { w.L && w.L.map ? resolve(w.L) : reject(new Error('Leaflet failed')); }, { once: true });
      s.addEventListener('error', function() { reject(new Error('Leaflet failed')); }, { once: true });
      return;
    }
    s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.setAttribute('data-h38-route-leaflet', '1');
    s.onload = function() { w.L && w.L.map ? resolve(w.L) : reject(new Error('Leaflet failed')); };
    s.onerror = function() { reject(new Error('Leaflet failed')); };
    document.head.appendChild(s);
  });
  return leafletPromise;
}

var activeMap = null;
async function renderRouteMap(nodeId, routeId) {
  var node = document.getElementById(nodeId);
  if (!node) return 'no-node';
  var stops = stopsForRoute(routeId);
  var points = stops.map(function(s, i) {
    var lat = num(v(s, 'Lat')), lng = num(v(s, 'Lng'));
    return (lat && lng) ? { stop: s, idx: i, lat: lat, lng: lng } : null;
  }).filter(Boolean);
  var vehicles = bouncieVehicles();
  if (!points.length && !vehicles.length) {
    node.innerHTML = '<div class="h38-route-note" style="padding:16px">No map positions yet. Stops appear here once addresses are geocoded; Bouncie vehicles appear when connected.</div>';
    return 'empty';
  }
  var L;
  try { L = await loadLeaflet(); }
  catch (err) {
    node.innerHTML = '<div class="h38-route-note" style="padding:16px">Map could not load (offline or blocked). The stop list below still works.</div>';
    return 'unavailable';
  }
  if (!node.isConnected) return 'detached';
  try {
    if (activeMap) { try { activeMap.remove(); } catch (_) {} activeMap = null; }
    node.innerHTML = '';
    var map = L.map(node, { zoomControl: true });
    activeMap = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    var bounds = [];
    var statusColor = { pending: '#9e9e9e', arrived: '#f9a825', done: '#2e7d32', missed: '#c62828' };
    points.forEach(function(p) {
      var st = stopStatus(p.stop);
      var color = statusColor[st] || '#9e9e9e';
      var icon = L.divIcon({
        className: '',
        html: '<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:' + color + ';border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);color:#fff;font-weight:700;font-size:12px">' + (p.idx + 1) + '</span>',
        iconSize: [26, 26], iconAnchor: [13, 13]
      });
      L.marker([p.lat, p.lng], { icon: icon }).addTo(map)
        .bindPopup('<strong>Stop ' + (p.idx + 1) + ': ' + esc(text(v(p.stop, 'Customer Name'))) + '</strong><br>' + esc(text(v(p.stop, 'Address'))) + '<br>Status: ' + esc(st));
      bounds.push([p.lat, p.lng]);
    });
    // Connect stops with a route line
    if (points.length > 1) {
      L.polyline(points.map(function(p) { return [p.lat, p.lng]; }), { weight: 3, opacity: 0.6, color: '#1976d2' }).addTo(map);
    }
    // Bouncie vehicles (live, when connected)
    vehicles.forEach(function(veh) {
      var icon = L.divIcon({
        className: '',
        html: '<span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:#1565c0;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>',
        iconSize: [20, 20], iconAnchor: [10, 10]
      });
      L.marker([veh.lat, veh.lng], { icon: icon }).addTo(map)
        .bindPopup('<strong>🚚 ' + esc(veh.label) + '</strong><br>Live vehicle' + (veh.at ? '<br><small>' + esc(veh.at) + '</small>' : ''));
      bounds.push([veh.lat, veh.lng]);
    });
    if (bounds.length === 1) map.setView(bounds[0], 14);
    else map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    return 'ok';
  } catch (err) {
    node.innerHTML = '<div class="h38-route-note" style="padding:16px">Map failed to render. The stop list below still works.</div>';
    return 'error';
  }
}

/* ---------- UI state ---------- */
var ui = { openRouteId: null, tab: 'routes' };

function fmtTime(iso) {
  var d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function fmtDate(iso) {
  var s = text(iso).slice(0, 10);
  if (!s) return '—';
  var d = new Date(s + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
function statusPill(st) {
  var map = { pending: 'Pending', arrived: 'On site', done: 'Done', missed: 'Missed', planned: 'Planned', active: 'Active', completed: 'Completed' };
  return '<span class="pill">' + esc(map[st] || st) + '</span>';
}

/* ---------- fleet page entry ---------- */
function fleetHook() {
  if (typeof document === 'undefined') return;
  var onFleet = text(w.state && w.state.page) === 'fleet';
  var card = document.getElementById('h38RouteManagerEntry');
  if (!onFleet || !enabled()) { if (card) card.remove(); return; }
  ensureStyle();
  var main = document.getElementById('mainContent');
  if (!main) return;
  if (!card) {
    card = document.createElement('section');
    card.className = 'card h38-route-card';
    card.id = 'h38RouteManagerEntry';
    main.prepend(card);
  }
  renderCard(card);
}

function renderCard(card) {
  var routes = myRoutes().sort(function(a, b) {
    return text(v(a, 'Route Date')).localeCompare(text(v(b, 'Route Date')));
  });
  var bouncie = hasBouncie();
  var html = '<div><span class="muted small">ROUTES</span>' +
    '<h2 style="margin:4px 0">Route management</h2>' +
    '<p class="muted">Ordered stops, crew check-ins, proof of service.' +
    (bouncie ? ' 🚚 Live Bouncie vehicles shown on maps.' : '') + '</p></div>';

  if (!bouncie) {
    html += '<div class="h38-coming-soon-note">📍 <strong>Live phone tracking — coming soon.</strong> ' +
      'Connect a tracking device like Bouncie for live vehicle positions on the map.</div>';
  }

  html += '<div class="h38-route-actions" style="margin-bottom:12px">' +
    (isOwner() ? '<button type="button" data-route-new>＋ New route</button>' : '') +
    '</div>';

  if (!routes.length) {
    html += '<p class="muted">No routes yet.' + (isOwner() ? ' Create one to get started.' : ' Your assigned routes will appear here.') + '</p>';
  } else {
    html += '<div class="h38-route-list">' + routes.map(function(r) {
      var id = text(v(r, 'Route ID'));
      var prog = routeProgress(id);
      var st = text(v(r, 'Status') || 'planned').toLowerCase();
      return '<div class="h38-route-item"><div class="row-top"><div>' +
        '<strong>' + esc(text(v(r, 'Route Name')) || 'Route') + '</strong><br>' +
        '<small class="muted">' + esc(fmtDate(v(r, 'Route Date'))) +
        (text(v(r, 'Assigned Crew Name')) ? ' · ' + esc(text(v(r, 'Assigned Crew Name'))) : '') + '</small>' +
        '</div><div>' + statusPill(st) + '</div></div>' +
        '<div class="h38-route-progress"><div style="width:' + prog.pct + '%"></div></div>' +
        '<small class="muted">' + prog.done + '/' + prog.total + ' stops done</small>' +
        '<div class="h38-route-actions">' +
        '<button type="button" data-route-open="' + esc(id) + '">Open</button>' +
        (isOwner() ? '<button type="button" data-route-proof="' + esc(id) + '">Proof link</button>' : '') +
        '</div></div>';
    }).join('') + '</div>';
  }

  card.innerHTML = html;
  bindCard(card);
}

function bindCard(card) {
  card.querySelectorAll('[data-route-new]').forEach(function(b) {
    b.addEventListener('click', function() { openRouteBuilder(null); });
  });
  card.querySelectorAll('[data-route-open]').forEach(function(b) {
    b.addEventListener('click', function() { openRouteDetail(b.getAttribute('data-route-open')); });
  });
  card.querySelectorAll('[data-route-proof]').forEach(function(b) {
    b.addEventListener('click', function() { openProofView(b.getAttribute('data-route-proof')); });
  });
}

/* ---------- route builder (owner) ---------- */
var builderStops = [];
function openRouteBuilder(routeId) {
  if (!isOwner()) { toast('Only owners can create routes.', true); return; }
  ensureStyle();
  builderStops = [];
  var existing = routeId ? routeById(routeId) : null;
  if (existing) {
    builderStops = stopsForRoute(text(v(existing, 'Route ID'))).map(function(s) {
      return {
        customerId: text(v(s, 'Customer ID')), customerName: text(v(s, 'Customer Name')),
        address: text(v(s, 'Address')), lat: num(v(s, 'Lat')) || null, lng: num(v(s, 'Lng')) || null
      };
    });
  }
  var crew = allCrew();
  var overlay = document.createElement('div');
  overlay.className = 'h38-route-overlay';
  overlay.id = 'h38RouteBuilderOverlay';
  overlay.innerHTML =
    '<div class="h38-route-modal" role="dialog" aria-label="Route builder">' +
    '<h2 style="margin-top:0">' + (existing ? 'Edit route' : 'New route') + '</h2>' +
    '<label>Route name</label><input id="rbName" value="' + esc(existing ? text(v(existing, 'Route Name')) : '') + '" placeholder="e.g. Tuesday plow route — North side">' +
    '<label>Date</label><input id="rbDate" type="date" value="' + esc(existing ? text(v(existing, 'Route Date')).slice(0, 10) : new Date().toISOString().slice(0, 10)) + '">' +
    '<label>Assign to crew</label><select id="rbCrew"><option value="">Unassigned</option>' +
    crew.map(function(u) {
      var sel = existing && text(v(existing, 'Assigned User ID')) === crewIdOf(u) ? ' selected' : '';
      return '<option value="' + esc(crewIdOf(u)) + '"' + sel + '>' + esc(crewName(u)) + '</option>';
    }).join('') + '</select>' +
    '<label>Add stops (pick customers in visit order)</label>' +
    '<div class="h38-stop-picker" id="rbPicker">' +
    allCustomers().map(function(c) {
      return '<label><input type="checkbox" data-cust="' + esc(customerIdOf(c)) + '"> ' +
        '<span><strong>' + esc(customerName(c)) + '</strong><br><small class="muted">' + esc(customerAddress(c)) + '</small></span></label>';
    }).join('') + '</div>' +
    '<div id="rbStopList" style="margin-top:8px"></div>' +
    '<div class="actions"><button type="button" data-rb-save style="background:#2e7d32;color:#fff;border:none">Save route</button>' +
    '<button type="button" data-rb-cancel class="secondary">Cancel</button></div>' +
    '<p class="h38-route-note">Stops are geocoded automatically for the map. Crew checks in with one tap per stop — no GPS hardware needed.</p>' +
    '</div>';
  document.body.appendChild(overlay);
  renderBuilderStops();

  overlay.querySelectorAll('[data-cust]').forEach(function(cb) {
    cb.addEventListener('change', function() {
      var c = allCustomers().find(function(x) { return customerIdOf(x) === cb.getAttribute('data-cust'); });
      if (!c) return;
      if (cb.checked) {
        builderStops.push({
          customerId: customerIdOf(c), customerName: customerName(c),
          address: customerAddress(c), lat: null, lng: null
        });
      } else {
        builderStops = builderStops.filter(function(s) { return s.customerId !== customerIdOf(c); });
      }
      renderBuilderStops();
    });
  });
  overlay.querySelector('[data-rb-cancel]').addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('[data-rb-save]').addEventListener('click', function() { saveBuilderRoute(overlay, existing); });
  // Stop reorder buttons (event delegation)
  overlay.querySelector('#rbStopList').addEventListener('click', function(e) {
    var btn = e.target.closest('[data-stop-move],[data-stop-del]');
    if (!btn) return;
    var i = num(btn.getAttribute('data-idx'));
    if (btn.hasAttribute('data-stop-del')) { builderStops.splice(i, 1); }
    else {
      var dir = num(btn.getAttribute('data-stop-move'));
      var j = i + dir;
      if (j < 0 || j >= builderStops.length) return;
      var tmp = builderStops[i]; builderStops[i] = builderStops[j]; builderStops[j] = tmp;
    }
    renderBuilderStops();
  });
}

function renderBuilderStops() {
  var node = document.getElementById('rbStopList');
  if (!node) return;
  if (!builderStops.length) { node.innerHTML = '<p class="muted small">No stops yet — pick customers above.</p>'; return; }
  node.innerHTML = '<strong>Stops in order (' + builderStops.length + '):</strong>' +
    builderStops.map(function(s, i) {
      return '<div class="h38-stop" style="margin-top:6px"><div class="h38-stop-dot pending">' + (i + 1) + '</div>' +
        '<div class="h38-stop-body"><strong>' + esc(s.customerName) + '</strong><br><small class="muted">' + esc(s.address) + '</small></div>' +
        '<div style="display:flex;flex-direction:column;gap:4px">' +
        '<button type="button" data-stop-move="-1" data-idx="' + i + '" style="min-height:36px">▲</button>' +
        '<button type="button" data-stop-move="1" data-idx="' + i + '" style="min-height:36px">▼</button>' +
        '<button type="button" data-stop-del data-idx="' + i + '" style="min-height:36px">✕</button>' +
        '</div></div>';
    }).join('');
}

async function saveBuilderRoute(overlay, existing) {
  var name = text(overlay.querySelector('#rbName').value);
  var date = text(overlay.querySelector('#rbDate').value);
  var crewSel = overlay.querySelector('#rbCrew');
  var crewId = text(crewSel.value);
  var crewLabel = crewSel.selectedIndex > 0 ? text(crewSel.options[crewSel.selectedIndex].text) : '';
  if (!name) { toast('Give the route a name.', true); return; }
  if (!builderStops.length) { toast('Add at least one stop.', true); return; }
  try {
    toast('Saving route…');
    // Geocode stops (best effort, don't block)
    for (var i = 0; i < builderStops.length; i++) {
      var s = builderStops[i];
      if (s.lat == null && s.address) {
        var c = await geocode(s.address);
        if (c) { s.lat = c.lat; s.lng = c.lng; }
      }
    }
    var routeId;
    if (existing) {
      routeId = text(v(existing, 'Route ID'));
      await saveRoute({
        id: routeId, name: name, date: date, assignedUserId: crewId, assignedCrewName: crewLabel,
        status: text(v(existing, 'Status')) || 'planned',
        notes: text(v(existing, 'Notes')),
        proofToken: text(v(existing, 'Proof Token')),
        createdTime: text(v(existing, 'Created Time'))
      });
      // Replace stops (simplest correct approach for v1)
      var old = stopsForRoute(routeId);
      for (var k = 0; k < old.length; k++) {
        var oid = text(v(old[k], 'Stop ID'));
        await w.queueOperation('SAVE_ROUTE_STOP', 'Route Stop', oid, { stopId: oid, deleted: true }, {
          collection: STOPS_COLLECTION,
          record: Object.assign({}, old[k], { 'Status': 'deleted', 'Record Version': 1 }),
          idKeys: ['Stop ID']
        });
      }
    } else {
      routeId = await saveRoute({ name: name, date: date, assignedUserId: crewId, assignedCrewName: crewLabel, status: 'planned' });
    }
    for (var j = 0; j < builderStops.length; j++) {
      await saveStop(routeId, builderStops[j], j + 1);
    }
    toast('Route saved: ' + name);
    overlay.remove();
    fleetHook();
  } catch (err) {
    toast('Could not save route: ' + text(err && err.message || err), true);
  }
}

/* ---------- route detail ---------- */
function openRouteDetail(routeId) {
  var route = routeById(routeId);
  if (!route) { toast('Route not found.', true); return; }
  ensureStyle();
  var overlay = document.createElement('div');
  overlay.className = 'h38-route-overlay';
  overlay.innerHTML = '<div class="h38-route-modal" role="dialog" aria-label="Route detail" style="max-width:640px">' +
    '<div id="h38RouteDetailBody"></div>' +
    '<div class="actions"><button type="button" data-rd-close class="secondary">Close</button></div></div>';
  document.body.appendChild(overlay);
  overlay.querySelector('[data-rd-close]').addEventListener('click', function() {
    if (activeMap) { try { activeMap.remove(); } catch (_) {} activeMap = null; }
    overlay.remove(); fleetHook();
  });
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      if (activeMap) { try { activeMap.remove(); } catch (_) {} activeMap = null; }
      overlay.remove(); fleetHook();
    }
  });
  renderRouteDetailBody(overlay, route);
}

function renderRouteDetailBody(overlay, route) {
  var body = overlay.querySelector('#h38RouteDetailBody');
  if (!body) return;
  var routeId = text(v(route, 'Route ID'));
  var stops = stopsForRoute(routeId);
  var prog = routeProgress(routeId);
  var bouncie = hasBouncie();
  var isCrewView = !isOwner();

  var html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
    '<div><h2 style="margin:0">' + esc(text(v(route, 'Route Name')) || 'Route') + '</h2>' +
    '<small class="muted">' + esc(fmtDate(v(route, 'Route Date'))) +
    (text(v(route, 'Assigned Crew Name')) ? ' · ' + esc(text(v(route, 'Assigned Crew Name'))) : '') + '</small></div>' +
    statusPill(text(v(route, 'Status') || 'planned').toLowerCase()) + '</div>' +
    '<div class="h38-route-progress"><div style="width:' + prog.pct + '%"></div></div>' +
    '<small class="muted">' + prog.done + '/' + prog.total + ' stops done</small>' +
    '<div id="h38RouteMap" class="h38-route-map"><div class="h38-route-note" style="padding:16px">Loading map…</div></div>';

  if (bouncie) {
    html += '<p class="h38-route-note">🚚 Live Bouncie vehicle positions shown on the map.</p>';
  } else if (isOwner()) {
    html += '<div class="h38-coming-soon-note">📍 <strong>Live phone tracking — coming soon.</strong> Connect Bouncie for live vehicle positions.</div>';
  }

  html += '<div style="margin-top:8px">' + stops.map(function(s, i) {
    return renderStopRow(s, i, isCrewView);
  }).join('') + '</div>';

  if (isOwner() && stops.length) {
    html += '<div class="h38-route-actions"><button type="button" data-rd-edit>✏️ Edit route</button>' +
      '<button type="button" data-rd-proof>🔗 Proof link</button></div>';
  }

  body.innerHTML = html;
  renderRouteMap('h38RouteMap', routeId);

  // Wire check-in buttons
  body.querySelectorAll('[data-stop-arrived],[data-stop-done],[data-stop-missed]').forEach(function(btn) {
    btn.addEventListener('click', function() { handleCheckin(btn, overlay, route); });
  });
  var editBtn = body.querySelector('[data-rd-edit]');
  if (editBtn) editBtn.addEventListener('click', function() {
    if (activeMap) { try { activeMap.remove(); } catch (_) {} activeMap = null; }
    overlay.remove(); openRouteBuilder(routeId);
  });
  var proofBtn = body.querySelector('[data-rd-proof]');
  if (proofBtn) proofBtn.addEventListener('click', function() { openProofView(routeId); });
}

function renderStopRow(s, i, isCrewView) {
  var st = stopStatus(s);
  var stopId = esc(text(v(s, 'Stop ID')));
  var html = '<div class="h38-stop"><div class="h38-stop-dot ' + st + '">' + (i + 1) + '</div>' +
    '<div class="h38-stop-body"><strong>' + esc(text(v(s, 'Customer Name'))) + '</strong><br>' +
    '<small class="muted">' + esc(text(v(s, 'Address'))) + '</small>';
  if (st === 'arrived') html += '<br><small>🟡 Arrived ' + esc(fmtTime(v(s, 'Arrived At'))) + '</small>';
  if (st === 'done') {
    html += '<br><small>✅ Done ' + esc(fmtTime(v(s, 'Completed At'))) + '</small>';
    if (text(v(s, 'Notes'))) html += '<br><small>📝 ' + esc(text(v(s, 'Notes'))) + '</small>';
  }
  if (st === 'missed') html += '<br><small>❌ Marked missed</small>';
  html += '</div>';
  // Check-in buttons (crew) — owner can also check in
  if (st === 'pending') {
    html += '<div class="h38-stop-actions"><button type="button" class="h38-stop-arrived" data-stop-arrived="' + stopId + '">Arrived</button></div>';
  } else if (st === 'arrived') {
    html += '<div class="h38-stop-actions"><button type="button" class="h38-stop-checkin" data-stop-done="' + stopId + '">✓ Done</button>' +
      '<button type="button" data-stop-missed="' + stopId + '" class="secondary">Missed</button></div>';
  }
  html += '</div>';
  return html;
}

async function handleCheckin(btn, overlay, route) {
  var stopId = btn.getAttribute('data-stop-arrived') || btn.getAttribute('data-stop-done') || btn.getAttribute('data-stop-missed');
  var stop = records(STOPS_COLLECTION).find(function(r) { return text(v(r, 'Stop ID')) === text(stopId); });
  if (!stop) { toast('Stop not found.', true); return; }
  btn.disabled = true;
  try {
    if (btn.hasAttribute('data-stop-arrived')) {
      // GPS stamp (best effort — works without hardware, just records nothing extra)
      var gps = await gpsStamp();
      await updateStopStatus(stop, 'arrived', {
        arrivedAt: nowIso(),
        checkinLat: gps ? gps.lat : null, checkinLng: gps ? gps.lng : null
      });
      toast('Checked in at stop.' + (gps ? ' Location stamped.' : ''));
    } else if (btn.hasAttribute('data-stop-done')) {
      var photo = await askPhoto();
      var notes = '';
      // Quick notes prompt (non-blocking style)
      var wantNotes = confirm('Add a note for this stop? (OK = add note, Cancel = skip)');
      if (wantNotes) notes = prompt('Stop note:') || '';
      var gps2 = await gpsStamp();
      await updateStopStatus(stop, 'done', {
        completedAt: nowIso(), photo: photo,
        notes: notes,
        checkinLat: gps2 ? gps2.lat : null, checkinLng: gps2 ? gps2.lng : null
      });
      toast('Stop done.' + (photo ? ' Photo attached.' : ''));
      // If all stops done, mark route completed
      var prog = routeProgress(text(v(route, 'Route ID')));
      if (prog.done === prog.total && prog.total > 0) {
        await saveRoute({
          id: text(v(route, 'Route ID')), name: text(v(route, 'Route Name')),
          date: text(v(route, 'Route Date')), assignedUserId: text(v(route, 'Assigned User ID')),
          assignedCrewName: text(v(route, 'Assigned Crew Name')), status: 'completed',
          notes: text(v(route, 'Notes')), proofToken: text(v(route, 'Proof Token')),
          createdTime: text(v(route, 'Created Time'))
        });
        toast('🎉 Route complete!');
      }
    } else if (btn.hasAttribute('data-stop-missed')) {
      if (!confirm('Mark this stop as missed?')) { btn.disabled = false; return; }
      await updateStopStatus(stop, 'missed', { completedAt: nowIso() });
      toast('Stop marked missed.');
    }
    renderRouteDetailBody(overlay, routeById(text(v(route, 'Route ID'))));
  } catch (err) {
    toast('Check-in failed: ' + text(err && err.message || err), true);
    btn.disabled = false;
  }
}

function gpsStamp() {
  return new Promise(function(resolve) {
    try {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(function(pos) {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }, function() { resolve(null); }, { timeout: 8000, maximumAge: 60000 });
    } catch (_) { resolve(null); }
  });
}

function askPhoto() {
  return new Promise(function(resolve) {
    var want = confirm('Add a completion photo for proof of service?');
    if (!want) return resolve(null);
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    var done = false;
    input.onchange = function() {
      var f = input.files && input.files[0];
      if (!f) { if (!done) { done = true; resolve(null); } return; }
      var reader = new FileReader();
      reader.onload = function() { if (!done) { done = true; resolve(String(reader.result).slice(0, 200000)); } };
      reader.onerror = function() { if (!done) { done = true; resolve(null); } };
      reader.readAsDataURL(f);
    };
    input.click();
    setTimeout(function() { if (!done) { done = true; resolve(null); } }, 60000);
  });
}

/* ---------- proof of service ---------- */
function proofUrl(route) {
  var token = text(v(route, 'Proof Token'));
  var base = w.location.origin + w.location.pathname;
  return base + '?businessKey=' + encodeURIComponent(text((w.state && w.state.businessKey) || '')) + '&routeProof=' + encodeURIComponent(token);
}

function openProofView(routeId) {
  var route = typeof routeId === 'string' ? routeById(routeId) : routeId;
  if (!route) { toast('Route not found.', true); return; }
  ensureStyle();
  var overlay = document.createElement('div');
  overlay.className = 'h38-route-overlay';
  var stops = stopsForRoute(text(v(route, 'Route ID')));
  var doneStops = stops.filter(function(s) { return stopStatus(s) === 'done'; });
  overlay.innerHTML = '<div class="h38-route-modal" role="dialog" aria-label="Proof of service" style="max-width:640px">' +
    '<div class="h38-route-proof">' +
    '<h3>✅ Proof of service</h3>' +
    '<p><strong>' + esc(text(v(route, 'Route Name'))) + '</strong><br>' +
    '<small class="muted">' + esc(fmtDate(v(route, 'Route Date'))) +
    (text(v(route, 'Assigned Crew Name')) ? ' · Crew: ' + esc(text(v(route, 'Assigned Crew Name'))) : '') + '</small></p>' +
    '<p>' + doneStops.length + ' of ' + stops.length + ' stops completed.</p>' +
    stops.map(function(s, i) {
      var st = stopStatus(s);
      var icon = st === 'done' ? '✅' : st === 'arrived' ? '🟡' : st === 'missed' ? '❌' : '⚪';
      var line = '<div style="margin:8px 0">' + icon + ' <strong>Stop ' + (i + 1) + ': ' + esc(text(v(s, 'Customer Name'))) + '</strong><br>' +
        '<small class="muted">' + esc(text(v(s, 'Address'))) + '</small>';
      if (st === 'done') {
        line += '<br><small>Arrived ' + esc(fmtTime(v(s, 'Arrived At'))) + ' → Done ' + esc(fmtTime(v(s, 'Completed At'))) + '</small>';
        if (text(v(s, 'Notes'))) line += '<br><small>📝 ' + esc(text(v(s, 'Notes'))) + '</small>';
        if (text(v(s, 'Photo'))) line += '<br><img src="' + text(v(s, 'Photo')) + '" style="max-width:100%;border-radius:8px;margin-top:6px" alt="Proof photo">';
      }
      return line + '</div>';
    }).join('') +
    '<div class="proof-link-row" style="margin-top:12px"><label><strong>Shareable proof link</strong></label>' +
    '<div class="h38-proof-link"><input id="h38ProofLinkInput" readonly value="' + esc(proofUrl(route)) + '">' +
    '<button type="button" data-proof-copy style="min-height:44px">Copy</button></div>' +
    '<p class="h38-route-note">Anyone with this link can view the completion summary. ' +
    'Tip: print this page (Ctrl/Cmd+P) for a paper copy.</p></div>' +
    '</div>' +
    '<div class="actions"><button type="button" data-proof-close class="secondary">Close</button>' +
    '<button type="button" data-proof-print>🖨️ Print</button></div></div>';
  document.body.appendChild(overlay);
  overlay.querySelector('[data-proof-close]').addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('[data-proof-copy]').addEventListener('click', function() {
    var input = overlay.querySelector('#h38ProofLinkInput');
    input.select();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(input.value).then(function() { toast('Proof link copied.'); });
      } else { document.execCommand('copy'); toast('Proof link copied.'); }
    } catch (_) { toast('Copy the link manually.', true); }
  });
  overlay.querySelector('[data-proof-print]').addEventListener('click', function() { w.print(); });
}

/* ---------- ?routeProof= deep link ---------- */
function checkProofDeepLink() {
  try {
    var params = new URLSearchParams(w.location.search);
    var token = params.get('routeProof');
    if (!token) return false;
    var route = allRoutes().find(function(r) { return text(v(r, 'Proof Token')) === text(token); });
    if (!route || !enabled()) return false;
    // Render proof view once the app shell is ready
    var iv = setInterval(function() {
      if (!document.getElementById('mainContent')) return;
      clearInterval(iv);
      setTimeout(function() { openProofView(text(v(route, 'Route ID'))); }, 800);
    }, 500);
    setTimeout(function() { clearInterval(iv); }, 15000);
    return true;
  } catch (_) { return false; }
}

/* ---------- boot ---------- */
var booted = false;
function start() {
  if (booted) return;
  booted = true;
  registerFeature();
  // Watch for fleet page renders
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(function() { fleetHook(); })
      .observe(document.documentElement, { childList: true, subtree: true });
  }
  fleetHook();
  // Deep link (after data loads)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(checkProofDeepLink, 2500); }, { once: true });
  } else {
    setTimeout(checkProofDeepLink, 2500);
  }
  w.H38RouteManager = Object.freeze({
    build: BUILD,
    enabled: enabled,
    openRouteDetail: openRouteDetail,
    openRouteBuilder: openRouteBuilder,
    openProofView: openProofView,
    allRoutes: allRoutes,
    stopsForRoute: stopsForRoute,
    routeProgress: routeProgress,
    hasBouncie: hasBouncie,
    FEATURE: FEATURE_DEF
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
})();
