/* H38OBD2 — ELM327 OBD2 diagnostics over Web Bluetooth (Repair Guide)
 *
 * Full stack: real BLE ELM327 dongle support + clearly-labeled SIMULATOR mode
 * so the entire UI/data flow is testable with zero hardware.
 *
 * Public API: window.H38OBD2
 *
 * OFFICE INTEGRATION POINT (commercial-app fleet module, future — NOT wired here):
 *   H38OBD2.onDtcRead(({ vehicle, codes, at }) => { ... })
 * pushes a completed scan to whoever subscribes, and H38OBD2.readDTCs() /
 * H38OBD2.readPids() are callable directly. The Office fleet module can
 * subscribe or call these without touching this file's internals.
 * This change touches zero commercial-app/ files.
 *
 * Toggle: localStorage 'h38-obd2-enabled' — DEFAULT OFF (hardware-dependent).
 */
(function (root, factory) {
  var api = factory();
  root.H38OBD2 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  var ENABLE_KEY = 'h38-obd2-enabled';      // 'on' | anything-else(=off)
  var SESSION_KEY = 'h38-obd2-sessions';
  var GARAGE_KEY = 'h38-repair-guide-garage'; // shared with My Garage (canonical list)
  var REPAIR_LOG_KEY = 'h38-repair-guide-log'; // shared with My Repairs (canonical list)

  // BLE profiles for ELM327 clones, tried in order.
  //  - FFE0/FFE1: HM-10/HM-11 UART clones — the most common cheap BLE ELM327
  //    dongles (e.g. no-name "BLE OBD2", older Veepeak BLE, KONNWEI KW903 BLE).
  //  - Nordic UART Service (NUS): some newer adapters.
  //  - FFF0/FFF1/FFF2: another common clone profile.
  var BLE_PROFILES = [
    { name: 'FFE0 (HM-10 clones)',
      service: 0xFFE0, write: 0xFFE1, notify: 0xFFE1, singleChar: true },
    { name: 'Nordic UART',
      service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
      write:   '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
      notify:  '6e400003-b5a3-f393-e0a9-e50e24dcca9e' },
    { name: 'FFF0 profile',
      service: '0000fff0-0000-1000-8000-00805f9b34fb',
      write:   '0000fff2-0000-1000-8000-00805f9b34fb',
      notify:  '0000fff1-0000-1000-8000-00805f9b34fb' },
  ];

  var CMD_TIMEOUT_MS = 2500;
  var POLL_MS = 2000;

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(id) {
    return (typeof document !== 'undefined') ? document.getElementById(id) : null;
  }
  function lsGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* full/blocked */ }
  }
  function plainBtError(err) {
    var msg = String((err && err.message) || err || '');
    if (/user cancelled|cancelled|No device|not found|NotFoundError/i.test(msg))
      return 'No dongle chosen. Tap "Connect Dongle" again when ready — or try the simulator below.';
    if (/not supported|not implemented|Bluetooth adapter not available|NotSupportedError/i.test(msg))
      return "This browser can't do Bluetooth. Use Chrome on Android (or Chrome/Edge on a computer with Bluetooth) — or use the simulator, which needs no dongle at all.";
    if (/gatt|disconnected|NetworkError|connection/i.test(msg))
      return 'Lost the Bluetooth connection to the dongle. Make sure it\'s plugged in and paired, then tap Connect again.';
    if (/timed out|timeout/i.test(msg))
      return "The dongle didn't answer. Make sure the car's ignition is ON (engine can be off) and the dongle is plugged into the OBD2 port under the dash.";
    return 'Bluetooth hiccup: ' + (msg || 'unknown error') + '. Try tapping Connect again.';
  }

  // ---------------------------------------------------------------------------
  // DTC code database (plain-language, built in — works fully offline)
  // ---------------------------------------------------------------------------
  var DTC_DB = {
    P0300: { title: 'Random / multiple cylinder misfire',
      desc: 'The engine computer saw misfires jumping between cylinders. The engine may shake, idle rough, or lack power.',
      checks: ['Pull the spark plugs — look for worn, fouled, or oil-covered plugs', 'Swap ignition coils between cylinders to see if the misfire moves', 'Check for vacuum leaks (hissing, cracked hoses, loose intake)', 'Check fuel pressure — weak pump or clogged filter causes lean misfires', 'Compression test if plugs/coils/fuel check out'] },
    P0171: { title: 'System too lean (Bank 1)',
      desc: 'Bank 1 is getting too much air or too little fuel. Often a vacuum leak.',
      checks: ['Inspect vacuum hoses and intake boot for cracks or looseness', 'Clean the mass airflow (MAF) sensor with MAF cleaner', 'Check fuel pressure at the rail', 'Look at short-term fuel trims with live data — high positive trims confirm lean'] },
    P0174: { title: 'System too lean (Bank 2)',
      desc: 'Bank 2 is getting too much air or too little fuel — same causes as P0171, on the other bank.',
      checks: ['Inspect vacuum hoses and intake boot for cracks or looseness', 'Clean the mass airflow (MAF) sensor with MAF cleaner', 'Check fuel pressure at the rail', 'Compare fuel trims bank-to-bank in live data'] },
    P0420: { title: 'Catalyst efficiency below threshold (Bank 1)',
      desc: 'The catalytic converter on bank 1 isn\'t cleaning exhaust like it should. The check-engine light stays on until fixed.',
      checks: ['Check for exhaust leaks ahead of the converter (they fake this code)', 'Watch the downstream O2 sensor in live data — a lazy or mirroring sensor means a dead cat', 'Rule out misfires or rich running that poisoned the converter', 'Replace the catalytic converter if sensors and exhaust check out'] },
    P0430: { title: 'Catalyst efficiency below threshold (Bank 2)',
      desc: 'Same as P0420, on bank 2.',
      checks: ['Check for exhaust leaks ahead of the converter', 'Watch the downstream O2 sensor in live data', 'Rule out misfires or rich running', 'Replace the catalytic converter if sensors and exhaust check out'] },
    P0442: { title: 'EVAP system — small leak detected',
      desc: 'The fuel-vapor system has a small leak. Usually the gas cap, and usually harmless to drive on.',
      checks: ['Tighten or replace the gas cap (cheapest fix — try this first)', 'Inspect EVAP hoses and the charcoal canister for cracks', 'Test the purge and vent solenoids', 'A smoke test finds small leaks fast'] },
    P0455: { title: 'EVAP system — large leak detected',
      desc: 'The fuel-vapor system has a big leak — often the gas cap left off or a hose disconnected.',
      checks: ['Check the gas cap is present and clicks tight', 'Look for disconnected or split EVAP hoses', 'Inspect the charcoal canister for damage', 'A smoke test pinpoints the leak'] },
    P0128: { title: 'Coolant thermostat below regulating temperature',
      desc: 'The engine isn\'t warming up properly — usually a thermostat stuck open. Fuel economy and heater suffer.',
      checks: ['Feel the upper radiator hose — if it warms up immediately with a cold engine, the thermostat is stuck open', 'Check coolant level (low coolant can set this too)', 'Replace the thermostat — it\'s the fix 9 times out of 10', 'Verify the coolant temp sensor reads sanely in live data'] },
    P0401: { title: 'Exhaust gas recirculation (EGR) — insufficient flow',
      desc: 'Not enough exhaust gas is being recirculated. Carbon buildup is the usual suspect.',
      checks: ['Remove and clean the EGR valve and passages (carbon is the #1 cause)', 'Check the EGR vacuum lines and solenoid', 'Test the DPFE/EGR position sensor if equipped', 'Clear the code after cleaning and road-test'] },
    P0133: { title: 'O2 sensor slow response (Bank 1, Sensor 1)',
      desc: 'The upstream oxygen sensor is reacting too slowly — it\'s aging out.',
      checks: ['Watch the sensor in live data — a good one flips rich/lean several times per second', 'Check for exhaust leaks near the sensor', 'Inspect the sensor wiring and connector', 'Replace the sensor if it\'s lazy or over ~100k miles'] },
  };
  // P0301–P0312: cylinder-specific misfires, generated from the P0300 entry.
  for (var cyl = 1; cyl <= 12; cyl++) {
    (function (n) {
      var code = 'P03' + (n < 10 ? '0' + n : n);
      var base = DTC_DB.P0300;
      DTC_DB[code] = {
        title: 'Cylinder ' + n + ' misfire detected',
        desc: 'The engine computer saw misfires specifically on cylinder ' + n + '. The engine may shake or idle rough.',
        checks: [
          'Swap the cylinder ' + n + ' coil and plug to another cylinder — if the misfire moves, you found it',
          'Inspect the cylinder ' + n + ' spark plug (worn, fouled, cracked)',
          'Check the injector and wiring for cylinder ' + n,
          'Compression test cylinder ' + n + ' if plug/coil/injector check out',
        ],
      };
    })(cyl);
  }
  var LETTER_MEANING = {
    P: 'Powertrain — engine, transmission, or emissions',
    C: 'Chassis — ABS, steering, or suspension',
    B: 'Body — airbags, climate control, lighting, or accessories',
    U: 'Network — the car\'s computers aren\'t talking to each other properly',
  };
  function getDTCInfo(code) {
    code = String(code || '').toUpperCase().trim();
    if (DTC_DB[code]) return Object.assign({ code: code }, DTC_DB[code]);
    var letter = code.charAt(0);
    var meaning = LETTER_MEANING[letter] || 'vehicle system';
    return {
      code: code,
      title: 'Fault code ' + code,
      desc: 'This code isn\'t in the built-in list, but the first letter tells you the system: ' + meaning + '.',
      checks: [
        'Write the code down exactly and search it with your year/make/model',
        'Note when the light comes on (cold start? highway? idling?) — that narrows it down',
        'Check the basics first: fuses, connectors, and fluid levels for that system',
        'Run the Repair Guide diagnosis below with this code filled in',
      ],
      generic: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Pure ELM327 parsing (no DOM, no Bluetooth — unit-testable)
  // ---------------------------------------------------------------------------
  // Normalize a raw ELM327 reply: strip echo of the sent command, whitespace,
  // line breaks, and the '>' prompt. Returns a compact hex string.
  function parseElmLine(raw, cmd) {
    var s = String(raw == null ? '' : raw);
    s = s.replace(/\r/g, ' ').replace(/\n/g, ' ');
    if (cmd) {
      var echo = String(cmd).replace(/\s+/g, '').toUpperCase();
      var compact = s.replace(/\s+/g, '').toUpperCase();
      if (compact.indexOf(echo) === 0) {
        // remove only the first (echo) occurrence
        s = s.replace(echo, '').replace(/^\s+/, '');
      }
    }
    s = s.replace(/\s+/g, '').replace(/>.*$/, '').toUpperCase();
    return s;
  }

  // Parse a mode-01 PID reply. `hex` is the compact hex from parseElmLine,
  // e.g. '410C1AF8'. Returns the value, or null on error/NO DATA.
  function parsePidResponse(pid, hex) {
    pid = String(pid).toUpperCase();
    hex = String(hex || '').toUpperCase();
    if (!hex || hex.indexOf('7F') === 0 || /NODATA|ERROR/i.test(hex)) return null;
    var want = '41' + pid;
    if (hex.indexOf(want) !== 0) return null;
    var data = hex.slice(want.length);
    function b(i) { return parseInt(data.substr(i * 2, 2), 16); }
    if (data.length < 2 || isNaN(b(0))) return null;
    switch (pid) {
      case '0C': // RPM: ((A*256)+B)/4
        if (data.length < 4 || isNaN(b(1))) return null;
        return (b(0) * 256 + b(1)) / 4;
      case '0D': // Vehicle speed, km/h
        return b(0);
      case '05': // Coolant temp, °C = A-40
        return b(0) - 40;
      case '0F': // Intake air temp, °C = A-40
        return b(0) - 40;
      case '11': // Throttle position, % = A*100/255
        return (b(0) * 100) / 255;
      case '00': { // Supported PIDs 01-20 bitmask
        var out = [];
        for (var i = 0; i < data.length / 2 && i < 4; i++) {
          var byte = b(i);
          for (var bit = 0; bit < 8; bit++) {
            if (byte & (0x80 >> bit)) out.push('01' + (i * 8 + bit + 1).toString(16).toUpperCase().padStart(2, '0'));
          }
        }
        return out;
      }
      default:
        return data;
    }
  }

  // Convert two DTC bytes to a code string, e.g. (0x01,0x33) -> 'P0133'.
  function dtcBytesToCode(a, b) {
    var letters = ['P', 'C', 'B', 'U'];
    function hx(n) { return n.toString(16).toUpperCase(); }
    return letters[(a >> 6) & 3] + String((a >> 4) & 3) + hx(a & 15) + hx((b >> 4) & 15) + hx(b & 15);
  }

  // Parse a mode-03 reply (raw text, e.g. '43 01 33 00 00 00 00') -> ['P0133'].
  // ELM327 frame layout: '43' header followed by 2-byte code pairs; 00 00
  // pairs are padding. (Cheap clones — the ones this app targets — do NOT
  // send the J1979 count byte; the ELM327 datasheet's own mode-03 example
  // '43 01 33 00 00 00 00' decodes to P0133 this way.)
  function parseDtcFrame(raw) {
    var hex = parseElmLine(raw, '03');
    if (!hex || hex.indexOf('43') !== 0) return [];
    var body = hex.slice(2);
    var codes = [];
    for (var i = 0; i + 3 < body.length; i += 4) {
      var a = parseInt(body.substr(i, 2), 16);
      var b = parseInt(body.substr(i + 2, 2), 16);
      if (isNaN(a) || isNaN(b)) break;
      if (a === 0 && b === 0) continue; // padding
      codes.push(dtcBytesToCode(a, b));
    }
    return codes;
  }

  // ---------------------------------------------------------------------------
  // Toggle (DEFAULT OFF — hardware-dependent feature)
  // ---------------------------------------------------------------------------
  function isEnabled() {
    try { return localStorage.getItem(ENABLE_KEY) === 'on'; }
    catch (e) { return false; }
  }
  function setEnabled(on) {
    try { localStorage.setItem(ENABLE_KEY, on ? 'on' : 'off'); } catch (e) {}
    if (!on) disconnect('silent');
    applyToggle();
  }
  function isSupported() {
    return (typeof navigator !== 'undefined') &&
      !!navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function';
  }

  // ---------------------------------------------------------------------------
  // Connection state + real BLE transport
  // ---------------------------------------------------------------------------
  var conn = {
    mode: 'disconnected', // disconnected | connecting | connected | simulated
    device: null,
    server: null,
    writeChar: null,
    notifyChar: null,
    rxBuf: '',
    rxWaiters: [],
    profile: null,
    pollTimer: null,
    lastPids: null,
    lastCodes: [],
    session: null,
    error: null,
  };
  var sim = { on: false, startedAt: 0, dtcs: ['P0300', 'P0420'] };
  var dtcListeners = [];

  function setMode(m, err) {
    conn.mode = m;
    conn.error = err || null;
    updateStatusUI();
  }
  function isConnected() { return conn.mode === 'connected'; }
  function isSimulated() { return sim.on; }

  function onRxText(text) {
    conn.rxBuf += text;
    var idx = conn.rxBuf.indexOf('>');
    while (idx !== -1) {
      var chunk = conn.rxBuf.slice(0, idx + 1);
      conn.rxBuf = conn.rxBuf.slice(idx + 1);
      var waiter = conn.rxWaiters.shift();
      if (waiter) { clearTimeout(waiter.timer); waiter.resolve(chunk); }
      idx = conn.rxBuf.indexOf('>');
    }
  }
  function sendCommand(cmd, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!conn.writeChar) return reject(new Error('Not connected to a dongle.'));
      var timer = setTimeout(function () {
        var i = conn.rxWaiters.findIndex(function (w) { return w.resolve === resolve; });
        if (i !== -1) conn.rxWaiters.splice(i, 1);
        reject(new Error('Timed out waiting for the dongle.'));
      }, timeoutMs || CMD_TIMEOUT_MS);
      conn.rxWaiters.push({ resolve: resolve, timer: timer });
      var bytes = new TextEncoder().encode(cmd + '\r');
      conn.writeChar.writeValue(bytes).catch(function (err) {
        clearTimeout(timer);
        reject(err);
      });
    }).then(function (raw) { return parseElmLine(raw, cmd); });
  }
  function elmQuery(cmd, timeoutMs) {
    // small pacing gap — cheap clones drop commands sent back-to-back
    return new Promise(function (r) { setTimeout(r, 60); })
      .then(function () { return sendCommand(cmd, timeoutMs); });
  }

  async function connect() {
    if (!isEnabled()) throw new Error('OBD2 is turned off. Flip the switch on the OBD2 screen first.');
    if (conn.mode === 'connected' || conn.mode === 'connecting') return;
    if (sim.on) { endSimSession(); }
    if (!isSupported()) {
      throw new Error(plainBtError(new Error('NotSupportedError')));
    }
    setMode('connecting');
    try {
      var filters = BLE_PROFILES.map(function (p) { return { services: [p.service] }; });
      var optional = BLE_PROFILES.map(function (p) { return p.service; });
      var device = await navigator.bluetooth.requestDevice({ filters: filters, optionalServices: optional });
      conn.device = device;
      device.addEventListener('gattserverdisconnected', function () {
        if (conn.mode === 'connected') { stopPolling(); endSession(); setMode('disconnected'); }
      });
      var server = await device.gatt.connect();
      conn.server = server;
      var profile = null, writeChar = null, notifyChar = null;
      for (var i = 0; i < BLE_PROFILES.length && !profile; i++) {
        var p = BLE_PROFILES[i];
        try {
          var svc = await server.getPrimaryService(p.service);
          var wc = await svc.getCharacteristic(p.write);
          var nc = p.singleChar ? wc : await svc.getCharacteristic(p.notify);
          profile = p; writeChar = wc; notifyChar = nc;
        } catch (e) { /* try next profile */ }
      }
      if (!profile) throw new Error('Connected, but this dongle doesn\'t speak any known ELM327 Bluetooth profile.');
      conn.profile = profile; conn.writeChar = writeChar; conn.notifyChar = notifyChar;
      await notifyChar.startNotifications();
      notifyChar.addEventListener('characteristicvaluechanged', function (ev) {
        onRxText(new TextDecoder().decode(ev.target.value));
      });
      // ELM327 init sequence
      await elmQuery('ATZ', 4000);
      await elmQuery('ATE0');
      await elmQuery('ATL0');
      await elmQuery('ATSP0');
      var pid00 = await elmQuery('0100');
      if (parsePidResponse('00', pid00) === null && pid00.indexOf('4100') !== 0) {
        throw new Error("The dongle answered, but the car's computer isn't talking. Turn the ignition ON (engine can be off) and tap Connect again.");
      }
      var vehicle = currentVehicleLabel();
      startSession(vehicle);
      setMode('connected');
      startPolling();
    } catch (err) {
      try { if (conn.server) conn.server.disconnect(); } catch (e) {}
      conn.device = null; conn.server = null; conn.writeChar = null; conn.notifyChar = null;
      setMode('disconnected');
      throw new Error(plainBtError(err));
    }
  }

  function disconnect(silent) {
    stopPolling();
    if (conn.mode === 'connected' || conn.mode === 'connecting') {
      try { if (conn.device && conn.device.gatt.connected) conn.device.gatt.disconnect(); } catch (e) {}
    }
    if (sim.on) endSimSession();
    else endSession();
    conn.device = null; conn.server = null; conn.writeChar = null;
    conn.notifyChar = null; conn.profile = null; conn.rxBuf = ''; conn.rxWaiters = [];
    setMode('disconnected');
    if (!silent) updateStatusUI();
  }

  // ---------------------------------------------------------------------------
  // Simulator — clearly labeled, zero hardware needed
  // ---------------------------------------------------------------------------
  function simulate(on) {
    if (on) {
      if (conn.mode === 'connected') disconnect('silent');
      sim.on = true;
      sim.startedAt = Date.now();
      sim.dtcs = ['P0300', 'P0420'];
      startSession(currentVehicleLabel() || 'Simulator vehicle');
      setMode('simulated');
      startPolling();
    } else {
      endSimSession();
      setMode('disconnected');
    }
    updateStatusUI();
  }
  function endSimSession() {
    if (sim.on) { sim.on = false; stopPolling(); endSession(); }
  }
  function simPids() {
    var t = (Date.now() - sim.startedAt) / 1000;
    var rpm = Math.round(750 + Math.sin(t * 1.7) * 30 + Math.sin(t * 4.3) * 15); // ~750±50 idle
    var coolantC = Math.min(90, 20 + t * 0.35); // warms 20→90°C over ~3 min
    return {
      rpm: rpm,
      speedKph: 0,
      coolantC: Math.round(coolantC * 10) / 10,
      intakeC: Math.round((18 + Math.sin(t) * 2) * 10) / 10,
      throttlePct: Math.round((8 + Math.sin(t * 2.2) * 3) * 10) / 10,
      at: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Live data
  // ---------------------------------------------------------------------------
  async function readPids() {
    if (sim.on) { conn.lastPids = simPids(); return conn.lastPids; }
    if (conn.mode !== 'connected') return null;
    try {
      var rpmHex = await elmQuery('010C');
      var spdHex = await elmQuery('010D');
      var coolHex = await elmQuery('0105');
      var intHex = await elmQuery('010F');
      var thrHex = await elmQuery('0111');
      var pids = {
        rpm: parsePidResponse('0C', rpmHex),
        speedKph: parsePidResponse('0D', spdHex),
        coolantC: parsePidResponse('05', coolHex),
        intakeC: parsePidResponse('0F', intHex),
        throttlePct: parsePidResponse('11', thrHex),
        at: new Date().toISOString(),
      };
      conn.lastPids = pids;
      if (conn.session) conn.session.pidSnapshot = pids;
      return pids;
    } catch (err) {
      stopPolling();
      setMode('disconnected', plainBtError(err));
      throw err;
    }
  }

  function startPolling() {
    stopPolling();
    var tick = async function () {
      try {
        var pids = await readPids();
        if (pids) renderGauges(pids);
      } catch (e) { /* status UI already updated */ }
    };
    tick();
    conn.pollTimer = setInterval(tick, POLL_MS);
  }
  function stopPolling() {
    if (conn.pollTimer) { clearInterval(conn.pollTimer); conn.pollTimer = null; }
  }

  // ---------------------------------------------------------------------------
  // DTCs
  // ---------------------------------------------------------------------------
  async function readDTCs() {
    var codes;
    if (sim.on) {
      codes = sim.dtcs.slice();
    } else {
      if (conn.mode !== 'connected') throw new Error('Connect the dongle (or start the simulator) first.');
      var raw = await elmQuery('03', 6000);
      codes = parseDtcFrame(raw);
    }
    conn.lastCodes = codes;
    var detailed = codes.map(function (c) { return getDTCInfo(c); });
    if (conn.session) conn.session.dtcs = detailed.map(function (d) { return { code: d.code, title: d.title }; });
    persistSessions();
    logScanToRepairLog(codes, detailed);
    dtcListeners.forEach(function (cb) {
      try { cb({ vehicle: currentVehicleLabel(), codes: codes, at: new Date().toISOString() }); } catch (e) {}
    });
    return detailed;
  }

  async function clearDTCs() {
    if (sim.on) {
      sim.dtcs = [];
      conn.lastCodes = [];
      if (conn.session) conn.session.dtcs = [];
      persistSessions();
      return true;
    }
    if (conn.mode !== 'connected') throw new Error('Connect the dongle first.');
    var hex = await elmQuery('04', 6000);
    var ok = hex.indexOf('44') === 0;
    if (ok) {
      conn.lastCodes = [];
      if (conn.session) conn.session.dtcs = [];
      persistSessions();
    }
    return ok;
  }

  function onDtcRead(cb) {
    if (typeof cb === 'function') dtcListeners.push(cb);
  }

  function logScanToRepairLog(codes, detailed) {
    var log = lsGet(REPAIR_LOG_KEY, []);
    var symptoms = codes.length
      ? 'OBD2 scan: ' + codes.join(', ')
      : 'OBD2 scan — no fault codes found';
    log.unshift({
      category: 'car',
      symptoms: symptoms,
      unitInfo: currentVehicleLabel(),
      topIssue: detailed.length ? detailed[0].code + ' — ' + detailed[0].title : 'No fault codes',
      when: new Date().toISOString(),
    });
    lsSet(REPAIR_LOG_KEY, log.slice(0, 100));
  }

  // ---------------------------------------------------------------------------
  // Vehicles — reuses the My Garage list (canonical, no second list)
  // ---------------------------------------------------------------------------
  function getVehicles() {
    var list = lsGet(GARAGE_KEY, []);
    return list.map(function (v) {
      return { name: v.name || '', vehicle: v.vehicle || '', miles: v.miles || 0 };
    }).filter(function (v) { return v.vehicle; });
  }
  function saveVehicleToGarage(label) {
    label = String(label || '').trim();
    if (!label) return false;
    var list = lsGet(GARAGE_KEY, []);
    if (list.some(function (v) { return (v.vehicle || '').toLowerCase() === label.toLowerCase(); })) return true;
    list.push({ name: '', vehicle: label, miles: 0, lastService: {}, addedAt: new Date().toISOString() });
    lsSet(GARAGE_KEY, list);
    return true;
  }
  function currentVehicleLabel() {
    var sel = $('obd2VehicleSelect');
    var txt = $('obd2VehicleText');
    var fromText = txt ? txt.value.trim() : '';
    if (fromText) return fromText;
    if (sel && sel.value) return sel.value;
    var v = getVehicles();
    return v.length ? (v[0].name ? v[0].name + ' — ' + v[0].vehicle : v[0].vehicle) : '';
  }

  // ---------------------------------------------------------------------------
  // Sessions — localStorage 'h38-obd2-sessions'
  // ---------------------------------------------------------------------------
  function startSession(vehicle) {
    conn.session = {
      id: 'obd2-' + Date.now(),
      vehicle: vehicle || '',
      startedAt: new Date().toISOString(),
      endedAt: null,
      dtcs: [],
      pidSnapshot: null,
    };
    persistSessions();
  }
  function endSession() {
    if (!conn.session) return;
    conn.session.endedAt = new Date().toISOString();
    if (conn.lastPids) conn.session.pidSnapshot = conn.lastPids;
    var done = conn.session;
    conn.session = null;
    persistSessions(done);
  }
  function persistSessions(sessionToSave) {
    var list = getSessions();
    var s = sessionToSave || conn.session;
    if (s) {
      var i = list.findIndex(function (x) { return x.id === s.id; });
      if (i === -1) list.unshift(s); // newest first
      else list[i] = s;
    }
    lsSet(SESSION_KEY, list.slice(0, 50));
  }
  function getSessions() { return lsGet(SESSION_KEY, []); }
  function getCurrentSession() { return conn.session; }

  // ---------------------------------------------------------------------------
  // UI — wired into the app's real screens (no app.js internals needed)
  // ---------------------------------------------------------------------------
  function showObd2Screen(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    var el = $(id);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
  }
  function setError(msg) {
    var el = $('obd2Error');
    if (!el) return;
    if (msg) { el.textContent = msg; el.hidden = false; }
    else { el.hidden = true; el.textContent = ''; }
  }
  function statusText() {
    switch (conn.mode) {
      case 'connected': return '✅ Connected' + (conn.profile ? ' (' + esc(conn.profile.name) + ')' : '') + ' — reading live data.';
      case 'simulated': return '🧪 SIMULATED — no dongle. Live data below is made up for testing.';
      case 'connecting': return 'Connecting… put the dongle in pairing mode if it asks.';
      default: return 'Not connected.';
    }
  }
  function updateStatusUI() {
    var st = $('obd2Status');
    if (st) st.innerHTML = statusText();
    if (conn.error) setError(conn.error); else if (conn.mode !== 'connecting') setError(null);
    var banner = $('obd2SimBanner');
    if (banner) banner.hidden = conn.mode !== 'simulated';
    var connBtn = $('obd2ConnectBtn'), disBtn = $('obd2DisconnectBtn'),
        simBtn = $('obd2SimBtn'), live = $('obd2Live');
    var active = conn.mode === 'connected' || conn.mode === 'simulated';
    if (connBtn) connBtn.hidden = active;
    if (simBtn) simBtn.hidden = active;
    if (disBtn) disBtn.hidden = !active;
    if (live) live.hidden = !active;
  }
  function renderGauges(p) {
    function set(id, v) { var el = $(id); if (el) el.textContent = v; }
    set('gaugeRpm', p.rpm == null ? '—' : Math.round(p.rpm).toLocaleString());
    set('gaugeSpeed', p.speedKph == null ? '—' : Math.round(p.speedKph * 0.621371));
    set('gaugeCoolant', p.coolantC == null ? '—' : Math.round(p.coolantC * 9 / 5 + 32));
    set('gaugeThrottle', p.throttlePct == null ? '—' : (Math.round(p.throttlePct * 10) / 10) + '');
  }
  function renderDTCs(list) {
    var box = $('obd2DtcList');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<div class="notice good"><strong>✓ No fault codes.</strong> The computer isn\'t reporting any problems right now.</div>';
      return;
    }
    box.innerHTML = list.map(function (d, i) {
      return '<div class="dtc-card">' +
        '<div class="dtc-code">' + esc(d.code) + '</div>' +
        '<div class="dtc-title">' + esc(d.title) + '</div>' +
        '<p>' + esc(d.desc) + '</p>' +
        '<strong>What to check:</strong><ol class="dtc-checks">' +
          d.checks.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') +
        '</ol>' +
        '<button class="secondary-btn" data-dtc-guide="' + i + '">Open in Repair Guide →</button>' +
      '</div>';
    }).join('');
    box.querySelectorAll('[data-dtc-guide]').forEach(function (b) {
      b.onclick = function () { openDiagnosisForCode(list[Number(b.dataset.dtcGuide)]); };
    });
  }
  // End-to-end: prefill the Repair Guide's real diagnosis flow with the code.
  function openDiagnosisForCode(info) {
    var vehicle = currentVehicleLabel();
    var card = document.querySelector('#categoryScreen .category-card[data-category="car"]');
    if (card) card.click(); // app.js handles category + navigates to symptomScreen
    else showObd2Screen('symptomScreen');
    var symptom = $('symptomInput'), unit = $('unitInfo');
    if (symptom) {
      symptom.value = 'Check engine light is on. OBD2 code ' + info.code + ': ' + info.title + '. ' +
        info.desc + ' Likely checks: ' + info.checks.slice(0, 3).join('; ') + '.';
    }
    if (unit && vehicle) unit.value = vehicle;
  }
  function renderSessions() {
    var box = $('obd2Sessions');
    if (!box) return;
    var list = getSessions();
    if (!list.length) {
      box.innerHTML = '<p class="muted">No sessions yet. Connect or run the simulator to start one.</p>';
      return;
    }
    box.innerHTML = list.slice(0, 20).map(function (s) {
      var when = '';
      try { when = new Date(s.startedAt).toLocaleString(); } catch (e) {}
      var dur = '';
      if (s.startedAt && s.endedAt) {
        var mins = Math.round((new Date(s.endedAt) - new Date(s.startedAt)) / 60000);
        dur = ' · ' + mins + ' min';
      }
      var codes = (s.dtcs || []).map(function (d) { return esc(d.code); }).join(', ') || 'no codes';
      var snap = '';
      if (s.pidSnapshot) {
        var p = s.pidSnapshot;
        snap = '<div class="small muted">' +
          (p.rpm != null ? Math.round(p.rpm).toLocaleString() + ' rpm' : '') +
          (p.coolantC != null ? ' · ' + Math.round(p.coolantC * 9 / 5 + 32) + '°F coolant' : '') +
          '</div>';
      }
      return '<div class="session-card"><div class="repair-head"><strong>' + esc(s.vehicle || 'Unknown vehicle') + '</strong>' +
        '<span class="repair-date">' + esc(when) + dur + '</span></div>' +
        '<div class="small">Codes: ' + codes + '</div>' + snap + '</div>';
    }).join('');
  }
  function refreshVehicleSelect() {
    var sel = $('obd2VehicleSelect');
    if (!sel) return;
    var vs = getVehicles();
    sel.innerHTML = vs.length
      ? vs.map(function (v) {
          var label = v.name ? v.name + ' — ' + v.vehicle : v.vehicle;
          return '<option value="' + esc(label) + '">' + esc(label) + '</option>';
        }).join('')
      : '<option value="">No vehicles in My Garage yet</option>';
  }
  function applyToggle() {
    var on = isEnabled();
    var card = $('goObd2'), note = $('obd2OffNote'), tgl = $('obd2Toggle'),
        main = $('obd2Main'), disNote = $('obd2DisabledNote');
    if (card) card.hidden = !on;
    if (note) note.hidden = on;
    if (tgl) tgl.checked = on;
    if (main) main.hidden = !on;
    if (disNote) disNote.hidden = on;
  }
  function refreshUI() {
    applyToggle();
    refreshVehicleSelect();
    renderSessions();
    updateStatusUI();
    if (conn.lastPids) renderGauges(conn.lastPids);
  }

  function wireUI() {
    var go = $('goObd2');
    if (go) go.addEventListener('click', function () { refreshUI(); showObd2Screen('obd2Screen'); });
    var link = $('obd2EnableLink');
    if (link) link.addEventListener('click', function () { showObd2Screen('obd2Screen'); });
    var back = $('backToHomeFromObd2');
    if (back) back.addEventListener('click', function () { showObd2Screen('homeScreen'); });
    var tgl = $('obd2Toggle');
    if (tgl) tgl.addEventListener('change', function () { setEnabled(tgl.checked); });
    var saveV = $('obd2SaveVehicleBtn');
    if (saveV) saveV.addEventListener('click', function () {
      var txt = $('obd2VehicleText');
      var label = txt ? txt.value.trim() : '';
      if (!label) { alert('Type the vehicle first, then save it.'); return; }
      saveVehicleToGarage(label);
      refreshVehicleSelect();
      var sel = $('obd2VehicleSelect');
      if (sel) sel.value = label;
      alert('Saved to My Garage.');
    });
    var connBtn = $('obd2ConnectBtn');
    if (connBtn) connBtn.addEventListener('click', async function () {
      setError(null);
      connBtn.disabled = true; connBtn.textContent = 'Connecting…';
      try { await connect(); }
      catch (err) { setError(String((err && err.message) || err)); }
      finally { connBtn.disabled = false; connBtn.textContent = 'Connect Dongle →'; }
    });
    var disBtn = $('obd2DisconnectBtn');
    if (disBtn) disBtn.addEventListener('click', function () { disconnect(); refreshUI(); });
    var simBtn = $('obd2SimBtn');
    if (simBtn) simBtn.addEventListener('click', function () { simulate(true); refreshUI(); });
    var readBtn = $('obd2ReadBtn');
    if (readBtn) readBtn.addEventListener('click', async function () {
      setError(null);
      readBtn.disabled = true; readBtn.textContent = 'Reading…';
      try {
        var list = await readDTCs();
        renderDTCs(list);
        renderSessions();
      } catch (err) { setError(String((err && err.message) || err)); }
      finally { readBtn.disabled = false; readBtn.textContent = 'Read Codes'; }
    });
    var clearBtn = $('obd2ClearBtn');
    var clearConfirm = $('obd2ClearConfirm');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      if (clearConfirm) { clearConfirm.hidden = false; }
      var t = $('obd2ClearText');
      if (t) t.focus();
    });
    var clearGo = $('obd2ClearGo');
    if (clearGo) clearGo.addEventListener('click', async function () {
      var t = $('obd2ClearText');
      if (!t || t.value.trim().toUpperCase() !== 'CLEAR') {
        alert('Type CLEAR in the box to confirm.');
        return;
      }
      setError(null);
      try {
        var ok = await clearDTCs();
        if (clearConfirm) clearConfirm.hidden = true;
        if (t) t.value = '';
        renderDTCs([]);
        renderSessions();
        setError(null);
        var box = $('obd2DtcList');
        if (box) box.innerHTML = '<div class="notice good"><strong>✓ Codes cleared.</strong>' +
          (sim.on ? ' (simulated)' : ' If the check-engine light comes back, the problem is still there — fix it, don\'t just clear it.') + '</div>';
        if (!ok && !sim.on) setError('The dongle didn\'t confirm the clear. Try again with the ignition ON.');
      } catch (err) { setError(String((err && err.message) || err)); }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { wireUI(); applyToggle(); });
    } else {
      wireUI(); applyToggle();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    // capability & toggle
    isSupported: isSupported,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    // connection
    connect: connect,
    disconnect: disconnect,
    simulate: simulate,
    isConnected: isConnected,
    isSimulated: isSimulated,
    status: function () {
      return { mode: conn.mode, enabled: isEnabled(), supported: isSupported(),
               profile: conn.profile ? conn.profile.name : null, error: conn.error };
    },
    // live data
    readPids: readPids,
    readDTCs: readDTCs,
    clearDTCs: clearDTCs,
    // pure parsing (unit-testable)
    parseElmLine: parseElmLine,
    parsePidResponse: parsePidResponse,
    parseDtcFrame: parseDtcFrame,
    dtcBytesToCode: dtcBytesToCode,
    // code database
    getDTCInfo: getDTCInfo,
    // vehicles (shares My Garage)
    getVehicles: getVehicles,
    saveVehicleToGarage: saveVehicleToGarage,
    // sessions
    startSession: startSession,
    endSession: endSession,
    getSessions: getSessions,
    getCurrentSession: getCurrentSession,
    // Office integration seam (commercial-app fleet, future)
    onDtcRead: onDtcRead,
    // UI
    refreshUI: refreshUI,
    applyToggle: applyToggle,
    showScreen: function () { if (typeof document !== 'undefined') showObd2Screen('obd2Screen'); },
  };
});
