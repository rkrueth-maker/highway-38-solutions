/* OBD2 unit + load-order smoke tests. Run: node js/obd2.test.js
 * Tests the pure-logic parts (ELM327 parsing, DTC parsing, simulator ranges,
 * code DB, sessions, toggle) and a browser-globals smoke test that loads
 * app.js + obd2.js like index.html does.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- fake localStorage for the pure-logic tests ---
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

const OBD2 = require('./obd2.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { pass++; console.log('  ok  ' + name); })
        .catch(e => { fail++; console.log('  FAIL ' + name + ' :: ' + e.message); });
    }
    pass++; console.log('  ok  ' + name);
  } catch (e) { fail++; console.log('  FAIL ' + name + ' :: ' + e.message); }
  return Promise.resolve();
}
function eq(a, b, why) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${why || 'mismatch'}: got ${ja}, want ${jb}`);
}
function inRange(v, lo, hi, why) {
  if (!(v >= lo && v <= hi)) throw new Error(`${why || 'range'}: ${v} not in [${lo},${hi}]`);
}
function truthy(v, why) { if (!v) throw new Error(why || 'expected truthy, got ' + v); }

async function main() {
  console.log('== OBD2 unit tests ==');

  await t('parseElmLine strips prompt + whitespace', () =>
    eq(OBD2.parseElmLine('41 0C 1A F8\r\r>'), '410C1AF8'));
  await t('parseElmLine strips command echo', () =>
    eq(OBD2.parseElmLine('010C\r41 0C 1A F8\r\r>', '010C'), '410C1AF8'));
  await t('parseElmLine handles multiline + SEARCHING', () =>
    eq(OBD2.parseElmLine('SEARCHING...\r41 0D 3C\r\r>'), 'SEARCHING...410D3C'));

  await t('RPM 41 0C 1A F8 -> 1726', () => eq(OBD2.parsePidResponse('0C', '410C1AF8'), 1726));
  await t('Speed 41 0D 3C -> 60', () => eq(OBD2.parsePidResponse('0D', '410D3C'), 60));
  await t('Coolant 41 05 5A -> 50C', () => eq(OBD2.parsePidResponse('05', '41055A'), 50));
  await t('Coolant 41 05 28 -> 0C', () => eq(OBD2.parsePidResponse('05', '410528'), 0));
  await t('Intake 41 0F 46 -> 30C', () => eq(OBD2.parsePidResponse('0F', '410F46'), 30));
  await t('Throttle 41 11 FF -> 100%', () => eq(OBD2.parsePidResponse('11', '4111FF'), 100));
  await t('Throttle 41 11 80 ~= 50.2%', () => inRange(OBD2.parsePidResponse('11', '411180'), 50, 51, 'throttle'));
  await t('PID 0100 bitmask parses', () => {
    const pids = OBD2.parsePidResponse('00', '4100BE1FA813');
    truthy(Array.isArray(pids) && pids.includes('010C') && pids.includes('010D'), 'missing PIDs');
  });
  await t('NO DATA -> null', () => eq(OBD2.parsePidResponse('0C', 'NODATA'), null));
  await t('7F error frame -> null', () => eq(OBD2.parsePidResponse('0C', '7F010C11'), null));
  await t('wrong mode byte -> null', () => eq(OBD2.parsePidResponse('0C', '410D3C'), null));

  await t('dtcBytesToCode(0x01,0x33) -> P0133', () => eq(OBD2.dtcBytesToCode(0x01, 0x33), 'P0133'));
  await t('dtcBytesToCode(0x03,0x00) -> P0300', () => eq(OBD2.dtcBytesToCode(0x03, 0x00), 'P0300'));
  await t('dtcBytesToCode(0x04,0x20) -> P0420', () => eq(OBD2.dtcBytesToCode(0x04, 0x20), 'P0420'));
  await t('dtcBytesToCode(0x43,0x21) -> C0321', () => eq(OBD2.dtcBytesToCode(0x43, 0x21), 'C0321'));
  await t('dtcBytesToCode(0x80,0x15) -> B0015', () => eq(OBD2.dtcBytesToCode(0x80, 0x15), 'B0015'));
  await t('dtcBytesToCode(0xC0,0x00) -> U0000', () => eq(OBD2.dtcBytesToCode(0xC0, 0x00), 'U0000'));

  await t('DTC frame 43 01 33 00 00 00 00 -> [P0133]', () =>
    eq(OBD2.parseDtcFrame('43 01 33 00 00 00 00'), ['P0133']));
  await t('DTC frame two codes -> [P0300,P0420]', () =>
    eq(OBD2.parseDtcFrame('43 03 00 04 20 00 00'), ['P0300', 'P0420']));
  await t('DTC frame zero codes -> []', () => eq(OBD2.parseDtcFrame('43 00 00 00 00 00 00'), []));
  await t('DTC frame skips 00 00 padding', () =>
    eq(OBD2.parseDtcFrame('43 03 00 00 00 00 00'), ['P0300']));

  await t('code DB covers required codes', () => {
    const need = ['P0300', 'P0171', 'P0174', 'P0420', 'P0430', 'P0442', 'P0455', 'P0128', 'P0401', 'P0133'];
    for (let c = 1; c <= 12; c++) need.push('P03' + String(c).padStart(2, '0'));
    for (const c of need) {
      const d = OBD2.getDTCInfo(c);
      truthy(d.title && d.desc && d.checks && d.checks.length >= 3, c + ' missing fields');
    }
  });
  await t('unknown P code -> generic Powertrain note', () => {
    const d = OBD2.getDTCInfo('P9999');
    truthy(d.generic && /Powertrain/.test(d.desc), 'no generic note');
  });
  await t('unknown C code -> Chassis note', () =>
    truthy(/Chassis/.test(OBD2.getDTCInfo('C1234').desc), 'no chassis note'));
  await t('unknown B code -> Body note', () =>
    truthy(/Body/.test(OBD2.getDTCInfo('B1000').desc), 'no body note'));
  await t('unknown U code -> Network note', () =>
    truthy(/Network/.test(OBD2.getDTCInfo('U0100').desc), 'no network note'));

  await t('toggle defaults OFF', () => {
    delete store['h38-obd2-enabled'];
    eq(OBD2.isEnabled(), false);
  });
  await t('toggle on/off round-trips', () => {
    OBD2.setEnabled(true); eq(OBD2.isEnabled(), true);
    OBD2.setEnabled(false); eq(OBD2.isEnabled(), false);
  });

  await t('simulator PIDs sane', async () => {
    OBD2.simulate(true);
    const p = await OBD2.readPids();
    inRange(p.rpm, 700, 800, 'sim rpm');
    inRange(p.coolantC, 20, 90, 'sim coolant');
    eq(p.speedKph, 0);
    inRange(p.throttlePct, 0, 100, 'sim throttle');
    OBD2.simulate(false);
  });
  await t('simulator yields sample DTCs P0300+P0420', async () => {
    OBD2.simulate(true);
    const list = await OBD2.readDTCs();
    eq(list.map(d => d.code), ['P0300', 'P0420']);
    truthy(list[0].title && list[0].checks.length, 'missing guidance');
  });
  await t('simulator clearDTCs empties list', async () => {
    eq(await OBD2.clearDTCs(), true);
    eq((await OBD2.readDTCs()).length, 0);
    OBD2.simulate(false);
  });
  await t('readPids disconnected -> null', async () => {
    eq(await OBD2.readPids(), null);
  });

  await t('session save/load round-trip', () => {
    delete store['h38-obd2-sessions'];
    OBD2.startSession('Test Truck');
    const cur = OBD2.getCurrentSession();
    truthy(cur && cur.vehicle === 'Test Truck' && cur.startedAt && !cur.endedAt, 'bad session');
    OBD2.endSession();
    const list = OBD2.getSessions();
    truthy(list.length === 1 && list[0].vehicle === 'Test Truck' && list[0].endedAt, 'bad persisted session');
    delete store['h38-obd2-sessions'];
  });

  await t('vehicle save/get round-trip (garage list)', () => {
    const before = OBD2.getVehicles().length;
    OBD2.saveVehicleToGarage('1999 Test Pickup');
    const after = OBD2.getVehicles();
    truthy(after.length === before + 1 && after.some(v => v.vehicle === '1999 Test Pickup'), 'not saved');
    const raw = JSON.parse(store['h38-repair-guide-garage']);
    raw.pop(); store['h38-repair-guide-garage'] = JSON.stringify(raw); // cleanup
  });

  await t('onDtcRead listener fires', async () => {
    let got = null;
    OBD2.onDtcRead(d => { got = d; });
    OBD2.simulate(true);
    await OBD2.readDTCs();
    truthy(got && got.codes.includes('P0300'), 'listener not fired');
    OBD2.simulate(false);
  });

  console.log('== load-order smoke test (app.js + obd2.js in stubbed browser) ==');
  await t('scripts load without exceptions; window.H38OBD2 API present', () => {
    function fakeEl() {
      return {
        hidden: false, value: '', textContent: '', innerHTML: '', disabled: false,
        dataset: {}, style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {}, removeEventListener() {},
        click() {}, querySelectorAll() { return []; }, appendChild() {},
      };
    }
    const listeners = {};
    const sandbox = {
      console,
      setTimeout, clearTimeout, setInterval, clearInterval,
      TextEncoder, TextDecoder, URL,
      fetch: async () => { throw new Error('no network in smoke test'); },
      alert() {}, prompt() { return null; },
      navigator: {},
      localStorage: {
        _s: {},
        getItem(k) { return k in this._s ? this._s[k] : null; },
        setItem(k, v) { this._s[k] = String(v); },
        removeItem(k) { delete this._s[k]; },
      },
      document: {
        readyState: 'complete',
        getElementById: () => fakeEl(),
        querySelectorAll: () => [],
        querySelector: () => fakeEl(),
        createElement: () => fakeEl(),
        addEventListener: (n, fn) => { listeners[n] = fn; },
      },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const dir = __dirname;
    vm.runInContext(fs.readFileSync(path.join(dir, 'app.js'), 'utf8'), sandbox, { filename: 'app.js' });
    vm.runInContext(fs.readFileSync(path.join(dir, 'obd2.js'), 'utf8'), sandbox, { filename: 'obd2.js' });
    const api = sandbox.H38OBD2;
    truthy(api, 'window.H38OBD2 missing');
    for (const k of ['connect', 'disconnect', 'simulate', 'isConnected', 'isSimulated',
      'isSupported', 'isEnabled', 'setEnabled', 'readPids', 'readDTCs', 'clearDTCs',
      'getDTCInfo', 'parseDtcFrame', 'parsePidResponse', 'startSession', 'endSession',
      'getSessions', 'getVehicles', 'onDtcRead', 'refreshUI', 'applyToggle']) {
      truthy(typeof api[k] === 'function', 'missing API: ' + k);
    }
    eq(api.isEnabled(), false, 'toggle should default OFF in fresh browser');
    eq(api.isSupported(), false, 'no bluetooth in stub -> unsupported');
    eq(api.status().mode, 'disconnected', 'initial mode');
  });

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
