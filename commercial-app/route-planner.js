/* ============================================================================
 * H38 Route Planner & Dispatch Map — build a route from typed addresses,
 * see the day's recorded stops with calculated mileage, and see today's
 * work + crew on a dispatch map. Business-generic: any Office business can
 * run crews with it; nothing here is H38-specific.
 * ----------------------------------------------------------------------------
 * Module intake (MODULE_PERFORMANCE_STANDARD):
 *   - Canonical route: the existing Fleet workspace ('fleet'); this module
 *     is a secondary, on-demand surface loaded only with the Fleet script
 *     group (h38-script-loader PAGE_FLEET + a slim Schedule entry card).
 *     Nothing is added to startup or to Today.
 *   - Data sources: the already-hydrated snapshot only (jobs,
 *     scheduleEvents, customers, properties, crewPositions,
 *     crewLocationStamps, mileageDays). Zero new server reads at render.
 *   - Bounds: planner stops <= 6 + start; dispatch events <= 50 (same cap
 *     as gps-dispatch); recorded stamps <= 200/day.
 *   - Cache: geocode results are cached in memory per session, keyed by
 *     the exact address string (addresses are static text; TTL = session,
 *     invalidation = none needed). OSRM responses live only for the
 *     current render. In-flight geocode requests are deduped by address.
 *   - Failure behavior: a bad address is named and fixable; if the route
 *     service is unreachable the entered stops still show, in order,
 *     labeled as entered order (never a dead end, never a spinner forever).
 *   - Recorded mileage honesty: road miles come from OSRM over the
 *     recorded coordinates; if OSRM is unreachable the figure is labeled
 *     "straight-line" — never presented as road miles.
 *
 * Owner Controls: id-guarded registration of 'route_planner' (default
 * OFF). Tenant switch is server-backed like route_management: a
 * business_module_settings row for 'route_planner' wins over the
 * per-browser Owner Controls toggle.
 * Map: Leaflet + OpenStreetMap, loaded on demand (same pattern as
 * route-manager / gps-dispatch). Geocoding: Nominatim. Routing: OSRM
 * public server (/trip for optimized order, /route for recorded order).
 * No API keys, no paid services.
 * ========================================================================== */
(function() {
'use strict';

/* ---------- pure core (no DOM, no app globals; exported for node tests) ---------- */
var EARTH_M = 6371000, MILE_M = 1609.344;
function haversineM(aLat, aLng, bLat, bLng) {
  var toRad = function(d) { return d * Math.PI / 180; };
  var dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_M * Math.asin(Math.sqrt(s));
}
function fmtMiles(meters) {
  var mi = meters / MILE_M;
  return (Math.round(mi * 10) / 10).toFixed(1) + ' mi';
}
function fmtDuration(seconds) {
  var min = Math.round(seconds / 60);
  if (min < 60) return min + ' min';
  return Math.floor(min / 60) + ' h ' + (min % 60) + ' min';
}
/* OSRM /trip response -> ordered stops with per-leg figures.
 * inputs: [{label, address, lat, lng}] in entered order, inputs[0] = start.
 * Returns null when the response carries no usable trip. */
function parseTrip(data, inputs) {
  if (!data || data.code !== 'Ok' || !Array.isArray(data.trips) || !data.trips[0]) return null;
  var trip = data.trips[0];
  var wps = Array.isArray(data.waypoints) ? data.waypoints : [];
  var ordered = inputs.map(function(input, i) {
    var wp = wps[i] || {};
    return { input: input, order: typeof wp.waypoint_index === 'number' ? wp.waypoint_index : i };
  }).sort(function(a, b) { return a.order - b.order; });
  var legs = Array.isArray(trip.legs) ? trip.legs : [];
  var stops = ordered.map(function(entry, k) {
    var leg = k > 0 ? (legs[k - 1] || {}) : null;
    return {
      label: entry.input.label, address: entry.input.address,
      lat: entry.input.lat, lng: entry.input.lng,
      legDistanceM: leg ? (leg.distance || 0) : 0,
      legDurationS: leg ? (leg.duration || 0) : 0
    };
  });
  var geometry = [];
  if (trip.geometry && Array.isArray(trip.geometry.coordinates)) {
    geometry = trip.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
  }
  return { stops: stops, totalDistanceM: trip.distance || 0, totalDurationS: trip.duration || 0, geometry: geometry };
}
/* Recorded-points line: collapse consecutive points closer than 25 m
 * (a place, not a move), then sum straight-line segment meters. */
function recordedLine(points) {
  var line = [];
  (points || []).forEach(function(p) {
    if (!p || !isFinite(p.lat) || !isFinite(p.lng) || (!p.lat && !p.lng)) return;
    if (line.length && haversineM(line[line.length - 1].lat, line[line.length - 1].lng, p.lat, p.lng) < 25) return;
    line.push({ lat: p.lat, lng: p.lng });
  });
  var meters = 0;
  for (var i = 0; i + 1 < line.length; i++) meters += haversineM(line[i].lat, line[i].lng, line[i + 1].lat, line[i + 1].lng);
  return { points: line, meters: meters };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { haversineM: haversineM, fmtMiles: fmtMiles, fmtDuration: fmtDuration, parseTrip: parseTrip, recordedLine: recordedLine };
}
if (typeof window === 'undefined') return;

var BUILD = '20261026-route-maps-1';
var FEATURE_ID = 'route_planner';
var OSRM_URL = 'https://router.project-osrm.org';
var MAX_STOPS = 6;
var w = window;

/* ---------- helpers (same fallbacks as route-manager) ---------- */
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
  else if (bad) console.warn('[RoutePlanner]', msg); else console.log('[RoutePlanner]', msg);
}
function records(name) {
  if (typeof w.records === 'function') return w.records(name) || [];
  var s = w.state || {};
  return (s.snapshot && s.snapshot[name]) || [];
}
function businessId() { return text((w.state && w.state.businessId) || ''); }
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dayKeyOf(iso) {
  var d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtTime(iso) {
  var d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/* ---------- feature registration + enablement ---------- */
var FEATURE_DEF = {
  id: FEATURE_ID,
  title: 'Route planner & dispatch map',
  desc: 'Build a route from a few addresses (best order, map, miles, drive time), see the day\u2019s recorded stops with calculated mileage, and see today\u2019s jobs and crew on a dispatch map.',
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

/* ---------- styles ---------- */
var styleInjected = false;
function ensureStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  var css = [
    '.h38-rp-card{margin-bottom:16px}',
    '.h38-rp-block{border-top:1px solid var(--border,#e2e2e2);padding-top:12px;margin-top:14px}',
    '.h38-rp-block:first-of-type{border-top:none;padding-top:0;margin-top:6px}',
    '.h38-rp-block h3{margin:0 0 6px}',
    '.h38-rp-note{font-size:.9em;color:#666;margin:4px 0 8px}',
    '.h38-rp-card label{display:block;margin:8px 0 4px;font-weight:600}',
    '.h38-rp-card input,.h38-rp-card select{width:100%;min-height:44px;font-size:1em;border-radius:8px;border:1px solid #ccc;padding:8px 10px;box-sizing:border-box}',
    '.h38-rp-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
    '.h38-rp-actions button{min-height:44px;padding:10px 16px;font-size:1em;border-radius:10px}',
    '.h38-rp-map{height:320px;border-radius:12px;border:1px solid var(--border,#e2e2e2);background:#eef2f5;margin:12px 0}',
    '.h38-rp-list{display:grid;gap:8px;margin:10px 0;padding:0;list-style:none}',
    '.h38-rp-stop{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--border,#e2e2e2);border-radius:12px;padding:10px 12px;background:var(--card,#fff)}',
    '.h38-rp-dot{flex:none;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:.85em;background:#1976d2}',
    '.h38-rp-dot.crew{background:#2e7d32}',
    '.h38-rp-dot.start{background:#37474f}',
    '.h38-rp-stop-body{flex:1;min-width:0}',
    '.h38-rp-msg{margin-top:10px}',
    '.h38-rp-msg.bad{color:#b71c1c}',
    '.h38-rp-total{font-weight:700;margin-top:8px}',
    '.h38-rp-inline{display:flex;gap:8px;align-items:flex-end}',
    '.h38-rp-inline>div{flex:1}',
    '.h38-rp-inline button{min-height:44px;padding:10px 14px;border-radius:10px}'
  ].join('\n');
  var el = document.createElement('style');
  el.setAttribute('data-h38-route-planner', '1');
  el.textContent = css;
  document.head.appendChild(el);
}

/* ---------- Leaflet (on demand; shared with the other map modules) ---------- */
var leafletPromise = null;
function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise(function(resolve, reject) {
    if (w.L && w.L.map) { resolve(w.L); return; }
    if (typeof document === 'undefined') { reject(new Error('No document')); return; }
    var css = document.querySelector('link[data-h38-route-planner-leaflet]');
    if (!css) {
      css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      css.setAttribute('data-h38-route-planner-leaflet', '1');
      document.head.appendChild(css);
    }
    var existing = document.querySelector('script[data-h38-route-leaflet],script[data-h38-dispatch-leaflet],script[data-h38-route-planner-leaflet]');
    if (existing) {
      existing.addEventListener('load', function() { w.L && w.L.map ? resolve(w.L) : reject(new Error('Leaflet failed to load')); }, { once: true });
      existing.addEventListener('error', function() { reject(new Error('Leaflet failed to load')); }, { once: true });
      return;
    }
    var s = document.createElement('script');
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.setAttribute('data-h38-route-planner-leaflet', '1');
    s.onload = function() { w.L && w.L.map ? resolve(w.L) : reject(new Error('Leaflet failed to load')); };
    s.onerror = function() { reject(new Error('Leaflet failed to load')); };
    document.head.appendChild(s);
  });
  return leafletPromise;
}
function numberedIcon(L, label, color) {
  return L.divIcon({
    className: '',
    html: '<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:' + color + ';border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);color:#fff;font-weight:700;font-size:12px">' + esc(label) + '</span>',
    iconSize: [26, 26], iconAnchor: [13, 13]
  });
}
var liveMaps = {};
async function drawMap(nodeId, markers, lineLatLngs) {
  var node = document.getElementById(nodeId);
  if (!node) return 'no-node';
  if (!markers.length && !(lineLatLngs && lineLatLngs.length)) {
    node.hidden = true;
    return 'empty';
  }
  var L;
  try { L = await loadLeaflet(); }
  catch (err) {
    node.hidden = false;
    node.innerHTML = '<div class="h38-rp-note" style="padding:16px">Map could not load (offline or blocked). The list below still works.</div>';
    return 'unavailable';
  }
  if (!node.isConnected) return 'detached';
  try {
    if (liveMaps[nodeId]) { try { liveMaps[nodeId].remove(); } catch (_) {} delete liveMaps[nodeId]; }
    node.hidden = false;
    node.innerHTML = '';
    var map = L.map(node, { zoomControl: true });
    liveMaps[nodeId] = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    var bounds = [];
    markers.forEach(function(m) {
      L.marker([m.lat, m.lng], { icon: numberedIcon(L, m.label, m.color || '#1976d2') }).addTo(map)
        .bindPopup('<strong>' + esc(m.title) + '</strong>' + (m.sub ? '<br>' + esc(m.sub) : ''));
      bounds.push([m.lat, m.lng]);
    });
    if (lineLatLngs && lineLatLngs.length > 1) {
      L.polyline(lineLatLngs, { weight: 4, opacity: 0.75, color: '#1976d2' }).addTo(map);
      lineLatLngs.forEach(function(p) { bounds.push(p); });
    }
    if (bounds.length === 1) map.setView(bounds[0], 14);
    else if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    setTimeout(function() { try { map.invalidateSize(); } catch (_) {} }, 60);
    return 'ok';
  } catch (err) {
    node.innerHTML = '<div class="h38-rp-note" style="padding:16px">Map failed to render. The list below still works.</div>';
    return 'error';
  }
}

/* ---------- geocoding (Nominatim, session cache, in-flight dedupe) ---------- */
var geoCache = {};
var geoInflight = {};
var lastGeoAt = 0;
function geocode(address) {
  var key = text(address);
  if (!key) return Promise.resolve(null);
  if (Object.prototype.hasOwnProperty.call(geoCache, key)) return Promise.resolve(geoCache[key]);
  if (geoInflight[key]) return geoInflight[key];
  geoInflight[key] = (async function() {
    try {
      // Nominatim fair use: space uncached lookups out.
      var wait = Math.max(0, 260 - (Date.now() - lastGeoAt));
      if (wait) await new Promise(function(r) { setTimeout(r, wait); });
      lastGeoAt = Date.now();
      var res = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(key), {
        headers: { 'Accept': 'application/json' }
      });
      var data = await res.json();
      var hit = Array.isArray(data) && data[0] ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;
      if (hit && (!Number.isFinite(hit.lat) || !Number.isFinite(hit.lng))) hit = null;
      geoCache[key] = hit;
      return hit;
    } catch (e) {
      geoCache[key] = null;
      return null;
    } finally {
      delete geoInflight[key];
    }
  })();
  return geoInflight[key];
}

/* ---------- OSRM ---------- */
function osrmCoords(points) {
  return points.map(function(p) { return p.lng + ',' + p.lat; }).join(';');
}
async function osrmTrip(points) {
  var url = OSRM_URL + '/trip/v1/driving/' + osrmCoords(points) +
    '?source=first&roundtrip=false&geometries=geojson&overview=full&steps=false';
  var res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  var data = await res.json();
  var parsed = parseTrip(data, points);
  if (!parsed) throw new Error('Route service could not build a route for these addresses.');
  return parsed;
}
async function osrmRoute(points) {
  var url = OSRM_URL + '/route/v1/driving/' + osrmCoords(points) +
    '?geometries=geojson&overview=full&steps=false';
  var res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  var data = await res.json();
  if (!data || data.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes[0]) {
    throw new Error('Route service could not price this route.');
  }
  var route = data.routes[0];
  var geometry = [];
  if (route.geometry && Array.isArray(route.geometry.coordinates)) {
    geometry = route.geometry.coordinates.map(function(c) { return [c[1], c[0]]; });
  }
  return {
    totalDistanceM: route.distance || 0,
    totalDurationS: route.duration || 0,
    legs: (route.legs || []).map(function(l) { return { distanceM: l.distance || 0, durationS: l.duration || 0 }; }),
    geometry: geometry
  };
}

/* ---------- addresses on file (properties + customers) ---------- */
function fullAddress(row) {
  var street = text(v(row, 'Service Address', 'Address', 'Street Address'));
  if (!street) return '';
  var city = text(v(row, 'City')), state = text(v(row, 'State')), zip = text(v(row, 'ZIP', 'Zip', 'Postal Code'));
  var tail = [city, state].filter(Boolean).join(', ');
  if (zip) tail = (tail ? tail + ' ' : '') + zip;
  if (!tail) return street;
  // Seeded addresses sometimes already embed the city/state — don't double it.
  if (street.toLowerCase().indexOf(city.toLowerCase()) >= 0 && city) return street;
  return street + ', ' + tail;
}
function addressesOnFile() {
  var seen = {}, out = [];
  function add(label, address) {
    var a = text(address);
    if (!a) return;
    var key = a.toLowerCase();
    if (seen[key]) return;
    seen[key] = 1;
    out.push({ label: label || a, address: a });
  }
  records('properties').forEach(function(p) {
    var cust = records('customers').find(function(c) {
      return text(v(c, 'Customer ID')) === text(v(p, 'Customer ID')) && text(v(p, 'Customer ID'));
    });
    add(text(v(cust, 'Customer Name')) || text(v(p, 'Property Name')), fullAddress(p));
  });
  records('customers').forEach(function(c) {
    add(text(v(c, 'Customer Name')), fullAddress(c));
  });
  return out.slice(0, 200);
}

/* ---------- today's jobs (dispatch join, mirrors gps-dispatch) ---------- */
function isCancelled(status) { return /cancel|void|delete/i.test(text(status)); }
function jobAddress(event, job) {
  var direct = text(v(event, 'Address', 'Location')) || text(v(job, 'Service Address', 'Job Address', 'Address'));
  if (direct) return direct;
  var custId = text(v(event, 'Customer ID') || (job && v(job, 'Customer ID')));
  var cust = records('customers').find(function(c) { return text(v(c, 'Customer ID')) === custId && custId; });
  if (cust) {
    var ca = fullAddress(cust);
    if (ca) return ca;
  }
  var prop = records('properties').find(function(p) { return text(v(p, 'Customer ID')) === custId && custId; });
  if (prop) return fullAddress(prop);
  return '';
}
function dayEvents(dateStr) {
  var events = records('scheduleEvents').filter(function(e) {
    return dayKeyOf(v(e, 'Start Time')) === dateStr && !isCancelled(v(e, 'Status'));
  });
  var jobs = records('jobs');
  return events.slice(0, 50).map(function(e) {
    var jn = text(v(e, 'Job Number'));
    var job = jobs.find(function(j) { return jn && text(v(j, 'Job Number')) === jn; }) ||
      jobs.find(function(j) { return text(v(j, 'Job ID')) === text(v(e, 'Job ID', 'Related Record ID')); }) || null;
    var custId = text(v(e, 'Customer ID') || (job && v(job, 'Customer ID')));
    var cust = records('customers').find(function(c) { return text(v(c, 'Customer ID')) === custId && custId; }) || null;
    return {
      event: e, job: job, customer: cust,
      title: text(v(e, 'Title')) || text(v(job, 'Project Title', 'Job Number')) || 'Job',
      customerName: text(v(cust, 'Customer Name')) || text(v(e, 'Customer Name')) || '',
      address: jobAddress(e, job),
      start: text(v(e, 'Start Time'))
    };
  }).sort(function(a, b) { return String(a.start).localeCompare(String(b.start)); });
}

/* ---------- crew positions (latest per person) ---------- */
function latestCrewPositions() {
  var byUser = {};
  records('crewPositions').forEach(function(r) {
    var uid = text(v(r, 'User ID', 'userId'));
    if (!uid) return;
    var ts = String(v(r, 'Timestamp', 'timestamp') || '');
    if (!byUser[uid] || ts > String(v(byUser[uid], 'Timestamp', 'timestamp') || '')) byUser[uid] = r;
  });
  return Object.keys(byUser).map(function(uid) {
    var r = byUser[uid];
    var name = text(v(r, 'User Name', 'userName'));
    if (!name) {
      var u = records('users').find(function(x) { return text(v(x, 'User ID', 'userId')) === uid; });
      name = text(v(u, 'Display Name', 'displayName', 'Name', 'Email')) || 'Crew';
    }
    return { userId: uid, name: name, lat: num(v(r, 'Lat', 'lat')), lng: num(v(r, 'Lng', 'lng')), at: text(v(r, 'Timestamp', 'timestamp')) };
  }).filter(function(p) { return p.lat && p.lng; });
}

/* ---------- recorded stops for a day ---------- */
function recordedData(dateStr) {
  var days = records('mileageDays').filter(function(r) { return text(v(r, 'Date', 'date')) === dateStr; });
  var stamps = records('crewLocationStamps').filter(function(r) {
    if (dayKeyOf(v(r, 'Timestamp', 'timestamp')) !== dateStr) return false;
    var status = text(v(r, 'Location Status'));
    if (status && status !== 'gps') return false;
    var lat = num(v(r, 'Lat', 'lat')), lng = num(v(r, 'Lng', 'lng'));
    return !!(lat && lng);
  }).sort(function(a, b) {
    return String(v(a, 'Timestamp')).localeCompare(String(v(b, 'Timestamp')));
  }).slice(0, 200);
  var byUser = {};
  stamps.forEach(function(s) {
    var uid = text(v(s, 'User ID', 'userId')) || 'unknown';
    if (!byUser[uid]) byUser[uid] = { userId: uid, name: text(v(s, 'User Name', 'userName')) || 'Crew', stamps: [] };
    byUser[uid].stamps.push(s);
  });
  return { days: days, byUser: byUser, stampCount: stamps.length };
}
function jobTitleFor(jobId) {
  if (!jobId) return '';
  var job = records('jobs').find(function(j) { return text(v(j, 'Job ID')) === text(jobId); });
  return job ? (text(v(job, 'Project Title')) || text(v(job, 'Job Number')) || '') : '';
}

/* ---------- UI state ---------- */
var ui = { stopCount: 3, building: false, sectionSig: '', recToken: 0, dispatchToken: 0, built: false };

function plannerFormHtml() {
  var stops = '';
  for (var i = 0; i < ui.stopCount; i++) {
    stops += '<label>Stop ' + (i + 1) + '</label><input data-h38rp-stop="' + i + '" type="text" autocomplete="street-address" placeholder="Street address, city, state">';
  }
  var file = addressesOnFile();
  var picker = '';
  if (file.length) {
    picker = '<label>Or use an address on file</label><div class="h38-rp-inline"><div><select data-h38rp-picker>' +
      file.map(function(f) { return '<option value="' + esc(f.address) + '">' + esc(f.label + ' — ' + f.address) + '</option>'; }).join('') +
      '</select></div><button type="button" data-h38rp-pick-add>Add to stops</button></div>';
  }
  return '<div class="h38-rp-block"><h3>Plan a route</h3>' +
    '<p class="h38-rp-note">Type a start and a few stops. You get the best order to drive them, a map, and the miles and drive time for each leg.</p>' +
    '<label>Start address</label><input data-h38rp-start type="text" autocomplete="street-address" placeholder="Street address, city, state">' +
    '<div data-h38rp-stops>' + stops + '</div>' +
    '<div class="h38-rp-actions"><button type="button" data-h38rp-add-stop>+ Add stop</button></div>' +
    picker +
    '<div class="h38-rp-actions"><button type="button" data-h38rp-build>Build route</button></div>' +
    '<div class="h38-rp-msg" data-h38rp-msg></div>' +
    '<div id="h38rpPlanMap" class="h38-rp-map" hidden></div>' +
    '<div data-h38rp-results></div></div>';
}
function recordedHtml() {
  return '<div class="h38-rp-block"><h3>Recorded stops &amp; mileage</h3>' +
    '<p class="h38-rp-note">The day\u2019s frame: Start Day \u2192 the stops recorded when the app was opened at each place \u2192 Stop Day, with the mileage calculated from the recorded positions.</p>' +
    '<label>Date</label><input type="date" data-h38rp-rec-date value="' + todayStr() + '">' +
    '<div data-h38rp-rec-body><p class="h38-rp-note">Loading\u2026</p></div>' +
    '<div id="h38rpRecMap" class="h38-rp-map" hidden></div></div>';
}
function dispatchHtml() {
  return '<div class="h38-rp-block"><h3>Dispatch map \u2014 today</h3>' +
    '<div data-h38rp-dispatch-body><p class="h38-rp-note">Loading\u2026</p></div>' +
    '<div id="h38rpDispatchMap" class="h38-rp-map" hidden></div></div>';
}
function buildCard(card) {
  card.innerHTML = '<h2>\uD83D\uDDFA\uFE0F Routes &amp; dispatch</h2>' + plannerFormHtml() + recordedHtml() + dispatchHtml();
  var addBtn = card.querySelector('[data-h38rp-add-stop]');
  if (addBtn) addBtn.onclick = function() {
    if (ui.stopCount >= MAX_STOPS) { toast('Up to ' + MAX_STOPS + ' stops in one route.', true); return; }
    // Preserve what's typed before the form re-renders.
    var start = card.querySelector('[data-h38rp-start]');
    var startVal = start ? start.value : '';
    var vals = Array.prototype.map.call(card.querySelectorAll('[data-h38rp-stop]'), function(i) { return i.value; });
    ui.stopCount++;
    var block = card.querySelector('[data-h38rp-stops]');
    var html = '';
    for (var i = 0; i < ui.stopCount; i++) {
      html += '<label>Stop ' + (i + 1) + '</label><input data-h38rp-stop="' + i + '" type="text" autocomplete="street-address" placeholder="Street address, city, state" value="' + esc(vals[i] || '') + '">';
    }
    block.innerHTML = html;
    if (start) start.value = startVal;
  };
  var pickAdd = card.querySelector('[data-h38rp-pick-add]');
  if (pickAdd) pickAdd.onclick = function() {
    var sel = card.querySelector('[data-h38rp-picker]');
    if (!sel || !sel.value) return;
    var inputs = card.querySelectorAll('[data-h38rp-stop]');
    for (var i = 0; i < inputs.length; i++) {
      if (!text(inputs[i].value)) { inputs[i].value = sel.value; inputs[i].focus(); return; }
    }
    toast('All stop boxes are filled — add another stop first.', true);
  };
  var buildBtn = card.querySelector('[data-h38rp-build]');
  if (buildBtn) buildBtn.onclick = function() { buildRoute(card); };
  var recDate = card.querySelector('[data-h38rp-rec-date]');
  if (recDate) recDate.onchange = function() { renderRecorded(card); };
  ui.built = true;
}

/* ---------- piece 1: address-entry route builder ---------- */
async function buildRoute(card) {
  if (ui.building) return;
  var msg = card.querySelector('[data-h38rp-msg]');
  var results = card.querySelector('[data-h38rp-results]');
  var mapNode = document.getElementById('h38rpPlanMap');
  function say(html, bad) {
    if (msg) { msg.innerHTML = html; msg.className = 'h38-rp-msg' + (bad ? ' bad' : ''); }
  }
  var startVal = text((card.querySelector('[data-h38rp-start]') || {}).value);
  var stopVals = Array.prototype.map.call(card.querySelectorAll('[data-h38rp-stop]'), function(i) { return text(i.value); }).filter(Boolean);
  if (!startVal) { say('Enter a start address first.', true); return; }
  if (!stopVals.length) { say('Enter at least one stop address.', true); return; }
  ui.building = true;
  var btn = card.querySelector('[data-h38rp-build]');
  if (btn) { btn.disabled = true; btn.textContent = 'Building route\u2026'; }
  say('Finding the addresses\u2026');
  if (results) results.innerHTML = '';
  try {
    var entered = [{ label: 'Start', address: startVal }].concat(stopVals.map(function(s, i) { return { label: 'Stop ' + (i + 1), address: s }; }));
    var points = [], missing = [];
    for (var i = 0; i < entered.length; i++) {
      var hit = await geocode(entered[i].address);
      if (hit) points.push({ label: entered[i].label, address: entered[i].address, lat: hit.lat, lng: hit.lng });
      else missing.push(entered[i]);
    }
    if (missing.length) {
      say('Couldn\u2019t find ' + missing.map(function(m) { return '&ldquo;' + esc(m.address) + '&rdquo;'; }).join(', ') +
        '. Check the spelling or add the city and state, then build again.', true);
      if (mapNode) mapNode.hidden = true;
      return;
    }
    var trip = null, routeError = '';
    try { trip = await osrmTrip(points); } catch (e) { routeError = text(e && e.message || e); }
    if (!trip) {
      // Routing service unreachable: still show the stops, in entered order.
      say('The route service didn\u2019t answer' + (routeError ? ' (' + esc(routeError) + ')' : '') +
        ', so here are your stops in the order you entered them \u2014 no best-order or road miles this time.', true);
      if (results) results.innerHTML = '<ul class="h38-rp-list">' + points.map(function(p, k) {
        return '<li class="h38-rp-stop"><span class="h38-rp-dot' + (k === 0 ? ' start' : '') + '">' + (k === 0 ? 'S' : k) + '</span>' +
          '<div class="h38-rp-stop-body"><strong>' + esc(p.label) + '</strong><br><small>' + esc(p.address) + '</small></div></li>';
      }).join('') + '</ul>';
      await drawMap('h38rpPlanMap', points.map(function(p, k) {
        return { lat: p.lat, lng: p.lng, label: k === 0 ? 'S' : String(k), color: k === 0 ? '#37474f' : '#1976d2', title: p.label + ': ' + p.address, sub: '' };
      }), points.map(function(p) { return [p.lat, p.lng]; }));
      return;
    }
    say('');
    if (results) results.innerHTML = '<ul class="h38-rp-list">' + trip.stops.map(function(s, k) {
      var leg = k > 0 ? '<br><small>Leg: ' + fmtMiles(s.legDistanceM) + ' \u00B7 ' + fmtDuration(s.legDurationS) + ' drive</small>' : '';
      return '<li class="h38-rp-stop"><span class="h38-rp-dot' + (k === 0 ? ' start' : '') + '">' + (k === 0 ? 'S' : k) + '</span>' +
        '<div class="h38-rp-stop-body"><strong>' + esc(k === 0 ? 'Start' : 'Stop ' + k) + ' \u2014 ' + esc(s.address) + '</strong>' + leg + '</div></li>';
    }).join('') + '</ul>' +
      '<p class="h38-rp-total">Total: ' + fmtMiles(trip.totalDistanceM) + ' \u00B7 ' + fmtDuration(trip.totalDurationS) + ' driving</p>' +
      '<p class="h38-rp-note">Order picked to cut drive time. Road miles and times from OpenStreetMap routing.</p>';
    await drawMap('h38rpPlanMap', trip.stops.map(function(s, k) {
      return { lat: s.lat, lng: s.lng, label: k === 0 ? 'S' : String(k), color: k === 0 ? '#37474f' : '#1976d2', title: (k === 0 ? 'Start' : 'Stop ' + k) + ': ' + s.address, sub: '' };
    }), trip.geometry.length ? trip.geometry : trip.stops.map(function(s) { return [s.lat, s.lng]; }));
  } finally {
    ui.building = false;
    var b2 = card.querySelector('[data-h38rp-build]');
    if (b2) { b2.disabled = false; b2.textContent = 'Build route'; }
  }
}

/* ---------- piece 2: recorded stops & mileage ---------- */
async function renderRecorded(card) {
  var body = card.querySelector('[data-h38rp-rec-body]');
  if (!body) return;
  var dateInput = card.querySelector('[data-h38rp-rec-date]');
  var dateStr = dateInput && dateInput.value ? dateInput.value : todayStr();
  var token = ++ui.recToken;
  var data = recordedData(dateStr);
  var html = '';
  data.days.forEach(function(d) {
    var name = text(v(d, 'User Name', 'userName')) || 'Crew';
    var started = text(v(d, 'Started At')), ended = text(v(d, 'Ended At'));
    var miles = v(d, 'Miles'), milesSource = text(v(d, 'Miles Source'));
    html += '<p><strong>' + esc(name) + '</strong> \u2014 day ' +
      (started ? 'started ' + fmtTime(started) : 'not started') +
      (ended ? ' \u00B7 ended ' + fmtTime(ended) : (started ? ' \u00B7 still open' : '')) +
      (miles !== '' && miles !== null && miles !== undefined ? ' \u00B7 <strong>' + esc(String(miles)) + ' mi</strong>' + (milesSource ? ' (' + esc(milesSource) + ')' : '') : '') +
      '</p>';
  });
  var mapMarkers = [], mapLine = null, firstUser = null;
  var userIds = Object.keys(data.byUser);
  userIds.forEach(function(uid) {
    var group = data.byUser[uid];
    html += '<p style="margin-top:10px"><strong>' + esc(group.name) + '</strong> \u2014 ' + group.stamps.length + ' recorded stop' + (group.stamps.length === 1 ? '' : 's') + '</p>' +
      '<ul class="h38-rp-list">' + group.stamps.map(function(s, i) {
        var jobTitle = jobTitleFor(text(v(s, 'Job ID')));
        var kind = text(v(s, 'Stamp Type')) || 'recorded';
        return '<li class="h38-rp-stop"><span class="h38-rp-dot">' + (i + 1) + '</span><div class="h38-rp-stop-body">' +
          '<strong>' + esc(fmtTime(v(s, 'Timestamp'))) + ' \u00B7 ' + esc(kind) + '</strong>' +
          (jobTitle ? '<br><small>' + esc(jobTitle) + '</small>' : '') +
          '<br><small>' + esc(num(v(s, 'Lat')).toFixed(5)) + ', ' + esc(num(v(s, 'Lng')).toFixed(5)) + '</small></div></li>';
      }).join('') + '</ul><p class="h38-rp-note" data-h38rp-rec-miles="' + esc(uid) + '"></p>';
    if (!firstUser) firstUser = group;
  });
  if (!data.days.length && !data.stampCount) {
    if (dateStr === todayStr()) {
      var positions = latestCrewPositions();
      if (positions.length) {
        html += '<p class="h38-rp-note">Last reported position: ' + positions.map(function(p) {
          return esc(p.name) + ' at ' + esc(fmtTime(p.at));
        }).join('; ') + '. Not enough recorded stops today to draw a route yet \u2014 stops land here when the app is opened at a place with location recorded.</p>';
      } else {
        html += '<p class="h38-rp-note">No recorded stops yet today. When the app is opened at a place and location is recorded (Start Day, crew arrival stamps), the stops land here and the day\u2019s mileage is calculated from them. The route planner above works right now \u2014 type in a few addresses.</p>';
      }
    } else {
      html += '<p class="h38-rp-note">No recorded stops for this date.</p>';
    }
  }
  body.innerHTML = html;
  // Map + road mileage for the first person with >= 2 distinct recorded points.
  if (firstUser) {
    var pts = firstUser.stamps.map(function(s) { return { lat: num(v(s, 'Lat')), lng: num(v(s, 'Lng')) }; });
    var line = recordedLine(pts);
    if (line.points.length >= 2) {
      mapMarkers = line.points.map(function(p, i) {
        return { lat: p.lat, lng: p.lng, label: String(i + 1), color: '#1976d2', title: 'Recorded stop ' + (i + 1), sub: '' };
      });
      mapLine = line.points.map(function(p) { return [p.lat, p.lng]; });
      var milesNode = body.querySelector('[data-h38rp-rec-miles="' + firstUser.userId.replace(/"/g, '') + '"]');
      try {
        var route = await osrmRoute(line.points);
        if (token !== ui.recToken) return;
        if (milesNode) milesNode.textContent = 'Road distance between recorded stops: ' + fmtMiles(route.totalDistanceM) + ' \u00B7 ' + fmtDuration(route.totalDurationS) + ' driving.';
        mapLine = route.geometry.length ? route.geometry : mapLine;
      } catch (e) {
        if (token !== ui.recToken) return;
        if (milesNode) milesNode.textContent = 'Distance between recorded stops: ' + fmtMiles(line.meters) + ' (straight-line \u2014 the route service didn\u2019t answer).';
      }
    }
  }
  await drawMap('h38rpRecMap', mapMarkers, mapLine);
}

/* ---------- piece 3: dispatch map ---------- */
async function renderDispatch(card) {
  var body = card.querySelector('[data-h38rp-dispatch-body]');
  if (!body) return;
  var token = ++ui.dispatchToken;
  var stops = dayEvents(todayStr());
  var withAddr = stops.filter(function(s) { return !!s.address; });
  var noAddr = stops.filter(function(s) { return !s.address; });
  var crews = latestCrewPositions();
  var html = '';
  if (!stops.length) {
    html += '<p class="h38-rp-note">No jobs scheduled today.</p>';
  } else {
    html += '<ul class="h38-rp-list">' + stops.map(function(s, i) {
      return '<li class="h38-rp-stop"><span class="h38-rp-dot">' + (i + 1) + '</span><div class="h38-rp-stop-body">' +
        '<strong>' + esc(s.start ? fmtTime(s.start) + ' \u00B7 ' : '') + esc(s.title) + '</strong>' +
        (s.customerName ? '<br><small>' + esc(s.customerName) + '</small>' : '') +
        '<br><small>' + (s.address ? esc(s.address) : 'No address on file \u2014 this stop can\u2019t be mapped yet.') + '</small></div></li>';
    }).join('') + '</ul>';
  }
  if (!crews.length) {
    html += '<p class="h38-rp-note">No crew positions reported yet. Positions appear here after a phone reports one (the app open at a place, with location on).</p>';
  } else {
    html += '<p class="h38-rp-note">Crew last reported: ' + crews.map(function(c) {
      return esc(c.name) + ' \u00B7 ' + esc(fmtTime(c.at));
    }).join('; ') + '</p>';
  }
  body.innerHTML = html;
  var markers = [], line = null;
  for (var i = 0; i < withAddr.length; i++) {
    var hit = await geocode(withAddr[i].address);
    if (token !== ui.dispatchToken) return;
    if (hit) {
      markers.push({
        lat: hit.lat, lng: hit.lng, label: String(markers.length + 1), color: '#1976d2',
        title: withAddr[i].title + (withAddr[i].customerName ? ' \u2014 ' + withAddr[i].customerName : ''), sub: withAddr[i].address
      });
    }
  }
  crews.forEach(function(c) {
    markers.push({ lat: c.lat, lng: c.lng, label: '\u2605', color: '#2e7d32', title: c.name + ' (crew)', sub: 'Last reported ' + fmtTime(c.at) });
  });
  await drawMap('h38rpDispatchMap', markers, line);
}

/* ---------- page hooks ---------- */
function sectionSignature() {
  var pos = records('crewPositions').map(function(r) { return String(v(r, 'Timestamp') || ''); }).join(',');
  return [businessId(), records('jobs').length, records('scheduleEvents').length,
    records('crewLocationStamps').length, records('mileageDays').length, pos].join('|');
}
function fleetHook() {
  if (typeof document === 'undefined') return;
  var page = text(w.state && w.state.page);
  var card = document.getElementById('h38RoutePlannerEntry');
  var banner = document.getElementById('h38RoutePlannerBanner');
  if (!enabled()) {
    if (card) card.remove();
    if (banner) banner.remove();
    ui.built = false;
    return;
  }
  ensureStyle();
  if (page === 'schedule') {
    var mainS = document.getElementById('mainContent');
    if (mainS && !banner) {
      banner = document.createElement('section');
      banner.className = 'card h38-rp-card';
      banner.id = 'h38RoutePlannerBanner';
      banner.innerHTML = '<h3 style="margin:0 0 6px">\uD83D\uDDFA\uFE0F Routes &amp; dispatch</h3>' +
        '<p class="h38-rp-note">Build a route from a few addresses, see recorded stops and mileage, and check today\u2019s dispatch map.</p>' +
        '<div class="h38-rp-actions"><button type="button" data-h38rp-open>Open routes &amp; dispatch</button></div>';
      mainS.prepend(banner);
      banner.querySelector('[data-h38rp-open]').onclick = function() {
        if (typeof w.openPage === 'function') w.openPage('fleet');
      };
    }
  }
  if (page !== 'fleet') return;
  var main = document.getElementById('mainContent');
  if (!main) return;
  if (!card) {
    card = document.createElement('section');
    card.className = 'card h38-rp-card';
    card.id = 'h38RoutePlannerEntry';
    main.prepend(card);
    buildCard(card);
    ui.sectionSig = sectionSignature();
    renderRecorded(card);
    renderDispatch(card);
    return;
  }
  var sig = sectionSignature();
  if (sig !== ui.sectionSig) {
    ui.sectionSig = sig;
    renderRecorded(card);
    renderDispatch(card);
  }
}

/* ---------- boot ---------- */
var booted = false;
function start() {
  if (booted) return;
  booted = true;
  registerFeature();
  if (typeof MutationObserver !== 'undefined') {
    var raf = false;
    new MutationObserver(function() {
      if (raf) return;
      raf = true;
      requestAnimationFrame(function() { raf = false; try { fleetHook(); } catch (e) {} });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  try { w.addEventListener('h38:business-snapshot-updated', function() { try { fleetHook(); } catch (e) {} }); } catch (e) {}
  fleetHook();
  w.H38RoutePlanner = Object.freeze({
    build: BUILD,
    enabled: enabled,
    feature: FEATURE_DEF,
    core: { haversineM: haversineM, fmtMiles: fmtMiles, fmtDuration: fmtDuration, parseTrip: parseTrip, recordedLine: recordedLine }
  });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
})();
