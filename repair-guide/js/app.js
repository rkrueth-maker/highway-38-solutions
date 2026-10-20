(function(){
'use strict';

// Repair Guide App - frontend
// Submits diagnosis requests to Kit via Supabase ai_handoff_tasks

const SUPABASE_URL = 'https://jqukmwtsgcsaruucnqja.supabase.co';
const SUPABASE_KEY = 'sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1';
// Note: Using H38 business ID for now - Repair Guide is standalone but
// uses the shared backend for Kit processing
const BUSINESS_ID = '10b85a89-5834-436d-95b0-c6ee2eb335ad';
const SESSION_KEY = 'h38-repair-guide-session';

// --- H38 Office login (same Supabase auth as the Business Office) ---
function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }
function sessionExpired(s) {
  return !s || !s.access_token || (s.expires_at && Date.now() >= s.expires_at * 1000 - 60000);
}
async function refreshSession() {
  const s = getSession();
  if (!s || !s.refresh_token) { clearSession(); return null; }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!res.ok) { clearSession(); return null; }
  const data = await res.json();
  const next = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || s.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: data.user || s.user,
  };
  saveSession(next);
  return next;
}
async function getAccessToken() {
  let s = getSession();
  if (sessionExpired(s)) s = await refreshSession();
  return s ? s.access_token : null;
}
async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.includes('Invalid login credentials') ? 'Wrong email or password.' : 'Sign in failed. Check your connection and try again.');
  }
  const data = await res.json();
  saveSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
    user: data.user,
  });
  return data.user;
}
function logout() {
  clearSession();
  $('logoutBtn').hidden = true;
  showScreen('loginScreen');
}

const state = {
  category: null,
  photo: null,
};

// Photo scan (identify-from-photo) state
const scanState = { photo: null, category: '' };

const $ = id => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0, 0);
}

function friendlyError(err) {
  const msg = String((err && err.message) || err || '');
  if (/42501|row-level security|permission denied/i.test(msg))
    return "Your account doesn't have access yet. Make sure you're signed in with your H38 login, then try again.";
  if (/401|unauthorized|invalid.*token|jwt/i.test(msg))
    return "Your sign-in expired. Please sign out and sign back in.";
  if (/timeout|timed out|network|fetch failed|failed to fetch/i.test(msg))
    return "Couldn't reach the server. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

// Login form
$('loginBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const errBox = $('loginError');
  errBox.hidden = true;
  if (!email || !password) {
    errBox.textContent = 'Enter your email and password.';
    errBox.hidden = false;
    return;
  }
  $('loginBtn').disabled = true;
  $('loginBtn').textContent = 'Signing in…';
  try {
    await login(email, password);
    $('loginPassword').value = '';
    $('logoutBtn').hidden = false;
    showScreen('homeScreen');
  } catch (err) {
    errBox.textContent = friendlyError(err);
    errBox.hidden = false;
  } finally {
    $('loginBtn').disabled = false;
    $('loginBtn').textContent = 'Sign In →';
  }
});
$('loginPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('loginBtn').click();
});
$('logoutBtn').addEventListener('click', logout);

// Startup: require H38 login before anything else
(async function init() {
  const token = await getAccessToken();
  if (token) {
    $('logoutBtn').hidden = false;
    showScreen('homeScreen');
  } else {
    showScreen('loginScreen');
  }
})();

// Parts lookup
async function decodeVIN(vin) {
  vin = String(vin || '').trim().toUpperCase();
  if (vin.length !== 17) throw new Error('VIN must be 17 characters.');
  const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${encodeURIComponent(vin)}?format=json`);
  if (!res.ok) throw new Error('VIN lookup failed.');
  const data = await res.json();
  const get = (name) => {
    const row = (data.Results || []).find(r => r.Variable === name);
    const v = row && String(row.Value || '').trim();
    return v && v !== 'Not Applicable' ? v : '';
  };
  return {
    year: get('Model Year'),
    make: get('Make'),
    model: get('Model'),
    trim: get('Trim'),
    engine: get('Engine Model') || get('Displacement (L)'),
    vehicleType: get('Vehicle Type'),
    error: get('Error Text'),
  };
}

async function checkRecalls(make, model, year) {
  if (!make || !model || !year) return [];
  const res = await fetch(`https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).slice(0, 10).map(r => ({
    component: r.Component || '',
    summary: r.Summary || '',
    consequence: r.Consequence || '',
  }));
}

$('vinDecodeBtn').addEventListener('click', async () => {
  const vinEl = $('vinInput'), outEl = $('vinResult'), recallEl = $('recallResult');
  outEl.textContent = 'Decoding…';
  recallEl.innerHTML = '';
  try {
    const info = await decodeVIN(vinEl.value);
    if (info.error && !info.make) throw new Error(info.error);
    const vehicle = [info.year, info.make, info.model, info.trim].filter(Boolean).join(' ');
    if (vehicle) {
      $('partsVehicle').value = vehicle;
      outEl.textContent = `✓ ${vehicle}${info.engine ? ' — ' + info.engine : ''}${info.error ? ' (note: ' + info.error + ')' : ''}`;
    } else {
      outEl.textContent = 'Could not decode this VIN.' + (info.error ? ' ' + info.error : '');
      return;
    }
    recallEl.innerHTML = '<p class="small muted">Checking recalls…</p>';
    const recalls = await checkRecalls(info.make, info.model, info.year);
    if (recalls.length) {
      recallEl.innerHTML = `<div class="notice warn"><strong>⚠ ${recalls.length} open recall${recalls.length === 1 ? '' : 's'} found</strong>` +
        recalls.map(r => `<div class="small" style="margin-top:6px"><strong>${escapeHtml(r.component)}</strong><br>${escapeHtml(r.summary.slice(0, 200))}</div>`).join('') +
        `<div class="small muted" style="margin-top:6px">Check with a dealer — recall repairs are free.</div></div>`;
    } else {
      recallEl.innerHTML = '<p class="small muted">✓ No open recalls found for this vehicle.</p>';
    }
  } catch (err) {
    outEl.textContent = 'VIN lookup failed: ' + (err.message || err);
  }
});

$('findPartsBtn').addEventListener('click', async () => {
  const vehicle = $('partsVehicle').value.trim();
  const needed = $('partsNeeded').value.trim();
  if (!vehicle || !needed) {
    alert('Enter the vehicle and the parts you need.');
    return;
  }

  showScreen('partsResultScreen');
  $('partsLoading').hidden = false;
  $('partsResult').hidden = true;
  $('partsLoading').innerHTML = '<div class="spinner"></div><p>Cody is looking up parts...<br><small>This usually takes under a minute</small></p>';

  try {
    const result = await requestParts({ vehicle, needed });
    // Stash for the optional Office bridge (dormant without ?office_business=).
    window.H38_LAST_PARTS={input:{vehicle:vehicle,needed:needed},result:result};
    renderParts(result);
    saveRepair({ category: 'parts', symptoms: needed, unitInfo: vehicle, kind: 'parts', result,
      topIssue: result && result.summary ? result.summary : '' });
  } catch (err) {
    $('partsLoading').innerHTML = `<p style="color:#ef9a9a">${friendlyError(err)}</p>`;
  }
});

async function requestParts(data) {
  const tasks = await supabaseFetch('ai_handoff_tasks', {
    method: 'POST',
    body: JSON.stringify({
      business_id: BUSINESS_ID,
      task_type: 'parts_lookup',
      status: 'pending',
      payload: {
        businessId: BUSINESS_ID,
        vehicle: data.vehicle,
        needed: data.needed,
        mode: data.mode || 'full',
      },
    }),
  });

  if (!tasks || !tasks.length) throw new Error('Failed to create parts lookup task');
  const taskId = tasks[0].id;

  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const rows = await supabaseFetch(`ai_handoff_tasks?id=eq.${taskId}&select=status,result,last_error`);
    if (!rows || !rows.length) continue;
    const task = rows[0];
    if (task.status === 'done' && task.result) return task.result;
    if (task.status === 'failed') throw new Error(task.last_error || 'Parts lookup failed');
  }
  throw new Error('Timed out waiting for parts. Try again.');
}

function renderParts(result) {
  $('partsLoading').hidden = true;
  $('partsResult').hidden = false;
  const opts = $('partsOptions'), time = $('partsTime'), howto = $('partsHowTo'),
        stores = $('partsStores'), notes = $('partsNotes'), priceCmp = $('partsPriceCompare');
  const list = result.options || result.parts || [];
  opts.innerHTML = list.length
    ? list.map(p => `<div class="part"><div class="part-name">${escapeHtml(p.name || p.title || '')}</div>
        ${p.detail ? `<div>${escapeHtml(p.detail)}</div>` : ''}
        ${p.price ? `<div class="part-price">${escapeHtml(p.price)}</div>` : ''}</div>`).join('')
    : '<p class="muted">No specific options returned.</p>';
  const pc = result.price_comparison;
  priceCmp.innerHTML = pc
    ? `<div class="price-compare">
        ${pc.local ? `<div class="price-row"><span class="price-source">🏪 Local stores</span><span class="part-price">${escapeHtml(pc.local)}</span>${pc.local_note ? `<div class="small muted">${escapeHtml(pc.local_note)}</div>` : ''}</div>` : ''}
        ${pc.amazon ? `<div class="price-row"><span class="price-source">📦 Amazon</span><span class="part-price">${escapeHtml(pc.amazon)}</span>${pc.amazon_note ? `<div class="small muted">${escapeHtml(pc.amazon_note)}</div>` : ''}</div>` : ''}
        ${pc.rockauto ? `<div class="price-row"><span class="price-source">🔧 RockAuto</span><span class="part-price">${escapeHtml(pc.rockauto)}</span><div class="small muted">+ shipping — RockAuto does NOT offer free shipping${pc.rockauto_note ? ' · ' + escapeHtml(pc.rockauto_note) : ''}</div></div>` : ''}
        ${pc.best_value ? `<div class="notice good" style="margin-top:8px"><strong>Best value:</strong> ${escapeHtml(pc.best_value)}</div>` : ''}
      </div>`
    : '<p class="muted">No price comparison returned.</p>';
  time.innerHTML = result.time_estimate
    ? `<p>${escapeHtml(result.time_estimate)}</p>`
    : '<p class="muted">—</p>';
  const steps = result.how_to || result.instructions || result.steps || [];
  howto.innerHTML = steps.length
    ? `<ol>${steps.map(s => `<li>${escapeHtml(typeof s === 'string' ? s : (s.text || s.step || ''))}</li>`).join('')}</ol>`
    : (result.how_to_text ? `<p>${escapeHtml(result.how_to_text)}</p>` : '<p class="muted">—</p>');
  const buyList = result.stores || result.where_to_buy || [];
  stores.innerHTML = buyList.length
    ? buyList.map(s => `<div class="part"><div class="part-name">${escapeHtml(typeof s === 'string' ? s : (s.name || ''))}</div>
        ${typeof s === 'object' && s.detail ? `<div>${escapeHtml(s.detail)}</div>` : ''}</div>`).join('')
    : '<p class="muted">No store suggestions returned.</p>';
  notes.innerHTML = result.notes
    ? `<p>${escapeHtml(result.notes)}</p>`
    : (result.summary ? `<p>${escapeHtml(result.summary)}</p>` : '<p class="muted">—</p>');
}
$('goDiagnose').addEventListener('click', () => showScreen('categoryScreen'));
$('goPhotoScan').addEventListener('click', () => showScreen('photoScanScreen'));
$('backToHomeFromPhotoScan').addEventListener('click', () => showScreen('homeScreen'));
$('goParts').addEventListener('click', () => showScreen('partsScreen'));
$('goRepairs').addEventListener('click', () => { renderRepairs(); showScreen('repairsScreen'); });
$('backToHome').addEventListener('click', () => showScreen('homeScreen'));
$('backToHomeFromCategory').addEventListener('click', () => showScreen('homeScreen'));
$('backToHomeFromParts').addEventListener('click', () => showScreen('homeScreen'));
$('backToParts').addEventListener('click', () => showScreen('partsScreen'));
$('newPartsBtn').addEventListener('click', () => {
  $('partsVehicle').value = '';
  $('partsNeeded').value = '';
  showScreen('homeScreen');
});

// Quick parts sourcing: just prices, no job guide
$('goSource').addEventListener('click', () => showScreen('sourceScreen'));
$('backToHomeFromSource').addEventListener('click', () => showScreen('homeScreen'));
$('backToSource').addEventListener('click', () => showScreen('sourceScreen'));
$('newSourceBtn').addEventListener('click', () => {
  $('sourceNeeded').value = ''; $('sourceVehicle').value = '';
  showScreen('homeScreen');
});
$('sourceBtn').addEventListener('click', async () => {
  const needed = $('sourceNeeded').value.trim();
  if (!needed) { alert('Tell me what part you need.'); return; }
  const vehicle = $('sourceVehicle').value.trim();
  showScreen('sourceResultScreen');
  $('sourceLoading').hidden = false;
  $('sourceResult').hidden = true;
  $('sourceLoading').innerHTML = '<div class="spinner"></div><p>Cody is checking prices...<br><small>This usually takes under a minute</small></p>';
  try {
    const result = await requestParts({ vehicle: vehicle || 'Not specified', needed, mode: 'sourcing' });
    renderSourcing(result);
    saveRepair({ category: 'parts', symptoms: needed, unitInfo: vehicle, kind: 'sourcing', result,
      topIssue: result && result.summary ? result.summary : '' });
  } catch (err) {
    $('sourceLoading').innerHTML = `<p style="color:#ef9a9a">${friendlyError(err)}</p>`;
  }
});
function renderSourcing(result) {
  $('sourceLoading').hidden = true;
  $('sourceResult').hidden = false;
  const pc = result.price_comparison;
  $('sourcePriceCompare').innerHTML = pc
    ? `<div class="price-compare">
        ${pc.local ? `<div class="price-row"><span class="price-source">🏪 Local stores</span><span class="part-price">${escapeHtml(pc.local)}</span>${pc.local_note ? `<div class="small muted">${escapeHtml(pc.local_note)}</div>` : ''}</div>` : ''}
        ${pc.amazon ? `<div class="price-row"><span class="price-source">📦 Amazon</span><span class="part-price">${escapeHtml(pc.amazon)}</span>${pc.amazon_note ? `<div class="small muted">${escapeHtml(pc.amazon_note)}</div>` : ''}</div>` : ''}
        ${pc.rockauto ? `<div class="price-row"><span class="price-source">🔧 RockAuto</span><span class="part-price">${escapeHtml(pc.rockauto)}</span><div class="small muted">+ shipping — RockAuto does NOT offer free shipping${pc.rockauto_note ? ' · ' + escapeHtml(pc.rockauto_note) : ''}</div></div>` : ''}
        ${pc.best_value ? `<div class="notice good" style="margin-top:8px"><strong>Best value:</strong> ${escapeHtml(pc.best_value)}</div>` : ''}
      </div>`
    : '<p class="muted">No price comparison returned.</p>';
  const list = result.options || [];
  $('sourceOptions').innerHTML = list.length
    ? list.map(p => `<div class="part"><div class="part-name">${escapeHtml(p.name || p.title || '')}</div>
        ${p.detail ? `<div>${escapeHtml(p.detail)}</div>` : ''}
        ${p.price ? `<div class="part-price">${escapeHtml(p.price)}</div>` : ''}</div>`).join('')
    : '<p class="muted">No options returned.</p>';
  const buyList = result.stores || [];
  $('sourceStores').innerHTML = buyList.length
    ? buyList.map(s => `<div class="part"><div class="part-name">${escapeHtml(typeof s === 'string' ? s : (s.name || ''))}</div>
        ${typeof s === 'object' && s.detail ? `<div>${escapeHtml(s.detail)}</div>` : ''}</div>`).join('')
    : '<p class="muted">No store suggestions returned.</p>';
}

// ===== Maintenance — run by Cody (H38's AI repair guide) =====
// Cody is the agent here, not a mascot: the board, the due math and the
// guidance are presented as his work, in his voice. Data stays on this
// phone (localStorage), same as the garage always worked. The due rule is
// the H38 equipment rule: whichever trigger lands first — meter or date.
const GARAGE_KEY = 'h38-repair-guide-garage';
function getGarage() {
  try { return JSON.parse(localStorage.getItem(GARAGE_KEY) || '[]'); }
  catch { return []; }
}
function saveGarage(list) {
  localStorage.setItem(GARAGE_KEY, JSON.stringify(list));
}

// Interval catalogs by machine type. The car catalog is the original
// MAINTENANCE_ITEMS set, verbatim. ATV / small-engine meter in hours;
// appliances are date-only. `involves` = Cody's plain checklist line.
const MAINT_CATALOGS = {
  car: { label: 'Car / Truck', icon: '🚗', unit: 'mi', unitLabel: 'miles', items: [
    { name: 'Oil change', miles: 5000, months: 6, involves: 'Drain and refill the oil, new filter, top off the fluids, quick look for leaks.' },
    { name: 'Tire rotation', miles: 7500, months: 6, involves: 'Rotate per the pattern for your drive type; check tread depth and pressures while they are off.' },
    { name: 'Air filter', miles: 15000, months: 12, involves: 'Inspect the engine air filter — replace it if it is dark or clogged. Cabin filter too, if it has one.' },
    { name: 'Brake inspection', miles: 12000, months: 12, involves: 'Pad and rotor thickness, fluid level and condition, lines and hoses. Brakes are not a guess-and-see item.' },
    { name: 'Coolant flush', miles: 30000, months: 24, involves: 'Drain, flush, refill at the right mix. Inspect hoses, clamps and the radiator cap.' },
    { name: 'Transmission service', miles: 30000, months: 24, involves: 'Fluid and filter where serviceable, per the maker spec. Note shift quality before and after.' },
  ]},
  atv: { label: 'ATV / UTV', icon: '🏍️', unit: 'hrs', unitLabel: 'hours', items: [
    { name: 'Engine oil', hours: 100, months: 6, involves: 'Oil and filter. Check the old oil for metal glitter — that is Cody wanting to know more, early.' },
    { name: 'Air filter', hours: 50, months: 6, involves: 'Foam filter: wash, dry, re-oil. Paper: replace. Dusty riding eats these fast.' },
    { name: 'Brake inspection', hours: 50, months: 6, involves: 'Pad wear, rotor condition, fluid. Mud hides wear — clean before you judge.' },
    { name: 'Spark plug', hours: 100, months: 12, involves: 'Pull, read the color, replace if fouled or worn. The plug tells you how the engine is really running.' },
    { name: 'Drive belt inspection', hours: 100, months: 12, involves: 'Belt width and glazing, clutch faces clean and dry. A belt lets go far from the truck if you ignore it.' },
    { name: 'Coolant', months: 24, involves: 'Drain and refill at the right mix; pressure-test the cap if it has been running warm.' },
  ]},
  'small-engine': { label: 'Small Engine', icon: '⚙️', unit: 'hrs', unitLabel: 'hours', items: [
    { name: 'Engine oil', hours: 50, months: 12, involves: 'Drain warm, refill to the mark. Small engines live or die on this one.' },
    { name: 'Air filter', hours: 100, months: 12, involves: 'Foam: wash and re-oil. Paper: tap it out; replace if it stays dark.' },
    { name: 'Spark plug', hours: 100, months: 12, involves: 'Gap and replace. A fresh plug fixes more no-starts than any other single part.' },
    { name: 'Fuel filter', hours: 200, months: 24, involves: 'Inline filter swap; look at what it caught — rust flakes mean the tank needs attention.' },
    { name: 'Blade care', months: 6, involves: 'Sharpen or replace, balance check, scrape the deck. A dull blade tears grass and invites disease.' },
    { name: 'Fuel system check', months: 12, involves: 'Fresh fuel, stabilizer for storage, lines and primer bulb for cracks. Ethanol is hard on all of it.' },
  ]},
  appliance: { label: 'Appliance', icon: '🧺', unit: null, unitLabel: '', items: [
    { name: 'HVAC filter', months: 3, involves: 'Swap or wash the filter. The cheapest efficiency fix there is.' },
    { name: 'Fridge coils', months: 6, involves: 'Vacuum the condenser coils and check the door seals with a dollar bill.' },
    { name: 'Dishwasher filter clean', months: 6, involves: 'Pull the bottom filter, rinse the mesh, check the spray arms spin free.' },
    { name: 'Water filter', months: 6, involves: 'Replace the cartridge; write the date on the new one so the next swap is not a guessing game.' },
    { name: 'Dryer vent clean-out', months: 12, involves: 'Full vent run, not just the lint trap. This one is a fire-safety item, not cosmetics.' },
    { name: 'Washer hoses & screens', months: 24, involves: 'Inspect supply hoses for bulges, clean the inlet screens. A burst hose is a flood, not a drip.' },
  ]},
};
// Kept for compatibility with anything that referenced the old name.
const MAINTENANCE_ITEMS = MAINT_CATALOGS.car.items;

function maintTypeOf(v) {
  return v && v.type && MAINT_CATALOGS[v.type] ? v.type : 'car';
}
function maintCatalog(v) { return MAINT_CATALOGS[maintTypeOf(v)]; }
function maintMeterOf(v) {
  const cat = maintCatalog(v);
  if (!cat.unit) return { value: null, unit: null };
  const raw = cat.unit === 'hrs' ? (v.hours != null ? v.hours : 0) : (v.miles || 0);
  return { value: Number(raw) || 0, unit: cat.unit };
}
function maintItemsFor(v) {
  return maintCatalog(v).items.concat(Array.isArray(v.customItems) ? v.customItems : []);
}
function maintLastDone(v, itemName) {
  let best = null;
  (Array.isArray(v.serviceLog) ? v.serviceLog : []).forEach(e => {
    if (e && e.item === itemName && (!best || String(e.date) > String(best.date))) {
      best = { date: e.date, meter: e.meter != null ? e.meter : null };
    }
  });
  if (best) return best;
  const ls = v.lastService && v.lastService[itemName];
  if (ls) return { date: ls.date || null, meter: ls.miles != null ? ls.miles : null };
  return null;
}
function maintAddMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
// Dual-trigger due math (H38 equipment rule): due at last + interval on
// the meter OR last + interval on the calendar — whichever lands first.
function maintStatus(v, item, nowMs) {
  const now = nowMs || Date.now();
  const meter = maintMeterOf(v);
  const last = maintLastDone(v, item.name);
  if (!last) return { state: 'baseline', last: null, dueMeter: null, dueDate: null, remainMeter: null, remainDays: null, unit: meter.unit };
  const ivMeter = meter.unit ? (meter.unit === 'hrs' ? item.hours : item.miles) : null;
  let dueMeter = null, remainMeter = null;
  if (ivMeter && last.meter != null && meter.value != null) {
    dueMeter = last.meter + ivMeter;
    remainMeter = dueMeter - meter.value;
  }
  let dueDate = null, remainDays = null;
  if (item.months && last.date) {
    dueDate = maintAddMonths(new Date(last.date), item.months);
    remainDays = Math.round((dueDate.getTime() - now) / 86400000);
  }
  const soonMeter = meter.unit === 'hrs' ? 25 : 500;
  let state = 'ok';
  if ((remainMeter != null && remainMeter <= 0) || (remainDays != null && remainDays <= 0)) state = 'overdue';
  else if ((remainMeter != null && remainMeter <= soonMeter) || (remainDays != null && remainDays <= 30)) state = 'soon';
  return { state, last, dueMeter, dueDate, remainMeter, remainDays, unit: meter.unit };
}
function maintCounts(list) {
  const counts = { overdue: 0, soon: 0, baseline: 0, ok: 0 };
  (list || []).forEach(v => maintItemsFor(v).forEach(item => { counts[maintStatus(v, item).state]++; }));
  return counts;
}
function maintMostUrgent(list) {
  let best = null;
  (list || []).forEach((v, vi) => maintItemsFor(v).forEach(item => {
    const s = maintStatus(v, item);
    if (s.state !== 'overdue' && s.state !== 'soon') return;
    const score = s.state === 'overdue' ? 0 : 1;
    const slack = Math.min(s.remainMeter != null ? s.remainMeter : Infinity, s.remainDays != null ? s.remainDays * 100 : Infinity);
    if (!best || score < best.score || (score === best.score && slack < best.slack)) {
      best = { v, vi, item, s, score, slack };
    }
  }));
  return best;
}
function fmtNum(n) { return Number(n).toLocaleString(); }
function fmtDate(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt) ? '' : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function maintDueText(s) {
  const parts = [];
  if (s.dueMeter != null) {
    parts.push(s.remainMeter > 0
      ? `due at ${fmtNum(s.dueMeter)} ${s.unit} (~${fmtNum(s.remainMeter)} ${s.unit} left)`
      : `due at ${fmtNum(s.dueMeter)} ${s.unit} — ${fmtNum(Math.abs(s.remainMeter))} ${s.unit} past`);
  }
  if (s.dueDate) {
    parts.push(s.remainDays > 0
      ? `due ${fmtDate(s.dueDate)} (${s.remainDays} day${s.remainDays === 1 ? '' : 's'} left)`
      : `due ${fmtDate(s.dueDate)} — ${Math.abs(s.remainDays)} day${Math.abs(s.remainDays) === 1 ? '' : 's'} past`);
  }
  return parts.join(' · ');
}
// Cody's sentence for one vehicle — ranked, plain, honest about baselines.
function codyVehicleLine(v) {
  const rows = maintItemsFor(v).map(item => ({ item, s: maintStatus(v, item) }));
  const over = rows.filter(r => r.s.state === 'overdue');
  const soon = rows.filter(r => r.s.state === 'soon');
  const base = rows.filter(r => r.s.state === 'baseline');
  const name = v.name || v.vehicle || 'This one';
  if (!rows.length) return 'Nothing on the schedule for this one yet.';
  if (over.length) {
    const first = over[0];
    const past = first.s.remainMeter != null && first.s.remainMeter <= 0
      ? `${fmtNum(Math.abs(first.s.remainMeter))} ${first.s.unit} past due`
      : `${Math.abs(first.s.remainDays)} days past due`;
    let line = `${first.item.name} on ${name} is overdue — ${past}.`;
    if (over.length > 1) line += ` ${over.length - 1} more item${over.length === 2 ? '' : 's'} overdue too.`;
    if (soon.length) line += ` ${soon[0].item.name} is right behind it.`;
    return line;
  }
  if (soon.length) {
    const first = soon[0];
    const slack = first.s.remainMeter != null && (first.s.remainDays == null || first.s.remainMeter <= first.s.remainDays * 100)
      ? `about ${fmtNum(first.s.remainMeter)} ${first.s.unit} of slack`
      : `about ${first.s.remainDays} days of slack`;
    return `Nothing overdue on ${name}. ${first.item.name} is coming up — ${slack}.`;
  }
  if (base.length === rows.length) {
    return `No service history on ${name} yet. Log the last service — or the next one you do — and I'll start the clock.`;
  }
  if (base.length) {
    return `${name} is on schedule for what I have. ${base.length} item${base.length === 1 ? ' has' : 's have'} no baseline yet — log a service and I'll track ${base.length === 1 ? 'it' : 'them'} too.`;
  }
  const next = rows.slice().sort((a, b) => {
    const sa = Math.min(a.s.remainMeter != null ? a.s.remainMeter : Infinity, a.s.remainDays != null ? a.s.remainDays * 100 : Infinity);
    const sb = Math.min(b.s.remainMeter != null ? b.s.remainMeter : Infinity, b.s.remainDays != null ? b.s.remainDays * 100 : Infinity);
    return sa - sb;
  })[0];
  return `Everything on ${name} is on schedule. Next up: ${next.item.name}${next.s.dueDate ? ', around ' + fmtDate(next.s.dueDate) : ''}.`;
}
// One-time, careful migration of pre-v7 garage records: default the type,
// seed the append-only serviceLog from the old lastService map (kept too).
function maintMigrate() {
  const list = getGarage();
  let changed = false;
  list.forEach(v => {
    if (!v.type) { v.type = 'car'; changed = true; }
    if (!Array.isArray(v.serviceLog)) {
      v.serviceLog = Object.keys(v.lastService || {}).map(name => {
        const ls = v.lastService[name] || {};
        return { item: name, date: ls.date || v.addedAt || new Date().toISOString(), meter: ls.miles != null ? ls.miles : null, cost: null, notes: '', source: 'prior record' };
      });
      changed = true;
    }
    if (!Array.isArray(v.customItems)) { v.customItems = []; changed = true; }
    if (v.hours == null) { v.hours = 0; changed = true; }
  });
  if (changed) saveGarage(list);
}
maintMigrate();

const STATUS_CHIP = {
  overdue: '<span class="status-chip status-overdue">🔴 Overdue</span>',
  soon: '<span class="status-chip status-soon">🟡 Due soon</span>',
  ok: '<span class="status-chip status-ok">🟢 On track</span>',
  baseline: '<span class="status-chip status-baseline">⚪ No baseline</span>',
};
function maintChip(state) { return STATUS_CHIP[state] || STATUS_CHIP.ok; }
function maintRowHtml(v, item, detailed) {
  const s = maintStatus(v, item);
  const lastLine = s.last
    ? `Last done ${fmtDate(s.last.date)}${s.last.meter != null && s.unit ? ' at ' + fmtNum(s.last.meter) + ' ' + s.unit : ''}`
    : 'Never logged';
  const dueLine = s.state === 'baseline' ? 'Log a service and Cody starts the clock' : maintDueText(s);
  return `<div class="maint-row">${maintChip(s.state)}<span class="maint-name">${escapeHtml(item.name)}</span><span class="maint-due">${escapeHtml(dueLine)}</span></div>
    ${detailed ? `<div class="maint-reason">${escapeHtml(lastLine)}.${s.state !== 'baseline' ? ` Cody calls it due at ${escapeHtml([s.dueMeter != null ? fmtNum(s.dueMeter) + ' ' + s.unit : '', s.dueDate ? fmtDate(s.dueDate) : ''].filter(Boolean).join(' or '))} — whichever lands first.` : ' No baseline yet — Cody does not guess one; log the last service and he will track it from there.'}</div>
    ${item.involves ? `<div class="maint-involves"><strong>What it involves:</strong> ${escapeHtml(item.involves)}</div>` : ''}
    <div style="margin-bottom:10px"><button class="secondary-btn" data-maint-log-item="${escapeHtml(item.name)}">Log ${escapeHtml(item.name)}</button></div>` : ''}`;
}
function renderGarage() {
  const list = getGarage();
  const board = $('codyBoard');
  const el = $('garageList');
  const counts = maintCounts(list);
  const urgent = maintMostUrgent(list);
  if (!list.length) {
    board.innerHTML = `<strong>🧑‍🔧 Cody's board</strong><div style="margin-top:4px">Your garage is empty. Add your first vehicle or machine below and I'll keep its upkeep schedule — oil, filters, inspections, the works — so small stuff doesn't turn into big stuff.</div>`;
    el.innerHTML = '';
    return;
  }
  board.innerHTML = `<strong>🧑‍🔧 Cody's board</strong>
    <div style="margin-top:4px">${counts.overdue ? `${counts.overdue} item${counts.overdue === 1 ? '' : 's'} overdue. ` : ''}${counts.soon ? `${counts.soon} coming due. ` : ''}${!counts.overdue && !counts.soon ? 'Nothing needs you right now. ' : ''}${urgent ? `Start with ${escapeHtml(urgent.item.name)} on ${escapeHtml(urgent.v.name || urgent.v.vehicle || '')} — that's the one I'd do first.` : 'Everything else is on schedule.'}</div>
    <div class="small" style="color:#a5d6a7;margin-top:4px">${list.length} in your garage · ${counts.ok} on track · ${counts.baseline} waiting on a first log</div>`;
  el.innerHTML = list.map((v, i) => {
    const cat = maintCatalog(v);
    const meter = maintMeterOf(v);
    const rows = maintItemsFor(v)
      .map(item => ({ item, s: maintStatus(v, item) }))
      .filter(r => r.s.state !== 'ok')
      .map(r => maintRowHtml(v, r.item, false)).join('');
    return `<div class="garage-card">
      <div class="garage-card-head"><span class="garage-card-name">${cat.icon} ${escapeHtml(v.name || v.vehicle || 'Vehicle')}</span><span class="small muted">${meter.value != null ? fmtNum(meter.value) + ' ' + meter.unit : ''}</span></div>
      <div class="small muted">${escapeHtml(v.vehicle || '')} · ${cat.label}</div>
      <p class="maint-reason" style="margin-top:6px"><strong>Cody:</strong> ${escapeHtml(codyVehicleLine(v))}</p>
      ${rows || '<div class="small" style="margin-top:4px">🟢 Everything on schedule.</div>'}
      <div class="actions-row">
        <button class="secondary-btn" data-maint-detail="${i}">Full board</button>
        <button class="secondary-btn" data-maint-log="${i}">Log service</button>
        <button class="secondary-btn" data-maint-del="${i}">Remove</button>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('[data-maint-detail]').forEach(b => b.onclick = () => { maintCurrent = Number(b.dataset.maintDetail); renderMaintDetail(); showScreen('maintDetailScreen'); });
  el.querySelectorAll('[data-maint-log]').forEach(b => b.onclick = () => openMaintLog(Number(b.dataset.maintLog), ''));
  el.querySelectorAll('[data-maint-del]').forEach(b => b.onclick = () => {
    const l = getGarage();
    const v = l[Number(b.dataset.maintDel)];
    if (!confirm(`Remove ${v.name || v.vehicle || 'this vehicle'} from your garage? Its service history goes with it.`)) return;
    l.splice(Number(b.dataset.maintDel), 1); saveGarage(l); renderGarage(); renderCodyHome();
  });
}

let maintCurrent = 0;
let maintLogFrom = 'detail';
function renderMaintDetail() {
  const list = getGarage();
  const v = list[maintCurrent];
  if (!v) { showScreen('garageScreen'); return; }
  const cat = maintCatalog(v);
  const meter = maintMeterOf(v);
  $('maintDetailTitle').textContent = `${cat.icon} ${v.name || v.vehicle || 'Vehicle'}`;
  const items = maintItemsFor(v).map(item => maintRowHtml(v, item, true)).join('');
  $('maintDetailBody').innerHTML = `
    <div class="small muted">${escapeHtml(v.vehicle || '')} · ${cat.label}</div>
    <p class="maint-reason" style="margin-top:6px"><strong>Cody:</strong> ${escapeHtml(codyVehicleLine(v))}</p>
    ${meter.unit ? `<div class="obd2-row"><div><strong>Current reading</strong><div class="small muted">Cody's due math runs off this — keep it honest.</div></div><strong>${fmtNum(meter.value)} ${meter.unit}</strong></div>
    <div class="input-group"><label>Update reading (${meter.unit})</label>
      <div style="display:flex;gap:8px"><input type="number" id="readingInput" min="0" placeholder="${fmtNum(meter.value)}" style="flex:1"><button class="secondary-btn" id="readingSaveBtn" type="button">Save</button></div>
    </div>` : ''}
    <h3>Upkeep schedule</h3>
    ${items}
    <h3>Add your own item</h3>
    <div class="input-group"><label>Item name</label><input type="text" id="customName" placeholder="e.g. Grease the trailer bearings"></div>
    ${meter.unit ? `<div class="input-group"><label>Every how many ${meter.unit}? <small>(optional)</small></label><input type="number" id="customMeter" min="0"></div>` : ''}
    <div class="input-group"><label>Every how many months? <small>(optional)</small></label><input type="number" id="customMonths" min="0"></div>
    <button class="secondary-btn" id="customAddBtn">Add item</button>
    <div class="actions-row" style="margin-top:16px">
      <button class="primary-btn" id="detailLogBtn">Log a service</button>
      <button class="secondary-btn" id="detailHistoryBtn">History</button>
    </div>`;
  const saveReading = $('readingSaveBtn');
  if (saveReading) saveReading.onclick = () => {
    const val = Number($('readingInput').value);
    if (isNaN(val) || val < 0) { alert('Enter the current reading.'); return; }
    const l = getGarage(); const veh = l[maintCurrent];
    if (maintCatalog(veh).unit === 'hrs') veh.hours = val; else veh.miles = val;
    saveGarage(l); renderMaintDetail(); renderCodyHome();
  };
  $('customAddBtn').onclick = () => {
    const itemName = $('customName').value.trim();
    if (!itemName) { alert('Name the item first.'); return; }
    const l = getGarage(); const veh = l[maintCurrent];
    const item = { name: itemName, involves: 'Your own upkeep item — Cody tracks it on the interval you set.' };
    const unit = maintCatalog(veh).unit;
    const mv = $('customMeter') ? Number($('customMeter').value) : 0;
    const mo = Number($('customMonths').value);
    if (unit && mv > 0) item[unit] = mv;
    if (mo > 0) item.months = mo;
    if (!item[unit] && !item.months) { alert('Give it an interval — miles/hours or months — so Cody knows when to call it due.'); return; }
    veh.customItems = Array.isArray(veh.customItems) ? veh.customItems : [];
    veh.customItems.push(item);
    saveGarage(l); renderMaintDetail();
  };
  $('detailLogBtn').onclick = () => openMaintLog(maintCurrent, '');
  $('detailHistoryBtn').onclick = () => { renderMaintHistory(); showScreen('maintHistoryScreen'); };
  $('maintDetailBody').querySelectorAll('[data-maint-log-item]').forEach(b => b.onclick = () => openMaintLog(maintCurrent, b.dataset.maintLogItem));
}
function renderMaintHistory() {
  const list = getGarage();
  const v = list[maintCurrent];
  if (!v) { showScreen('garageScreen'); return; }
  $('maintHistoryTitle').textContent = `History — ${v.name || v.vehicle || ''}`;
  const entries = (Array.isArray(v.serviceLog) ? v.serviceLog.slice() : [])
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map(e => `<div class="history-entry">
      <div class="history-head"><strong>${escapeHtml(e.item || 'Service')}</strong><span class="repair-date">${fmtDate(e.date)}</span></div>
      <div class="small muted">${e.meter != null ? 'at ' + fmtNum(e.meter) + ' ' + (maintCatalog(v).unit || '') + ' · ' : ''}${e.cost != null && e.cost !== '' ? '$' + escapeHtml(String(e.cost)) + ' · ' : ''}${e.source === 'prior record' ? 'logged before Cody kept the book' : 'logged in the app'}</div>
      ${e.notes ? `<div>${escapeHtml(e.notes)}</div>` : ''}
    </div>`);
  const unitNames = [v.vehicle, v.name].filter(Boolean).map(s => String(s).toLowerCase());
  const diags = getRepairs().filter(r => r.unitInfo && unitNames.some(u => String(r.unitInfo).toLowerCase().includes(u) || u.includes(String(r.unitInfo).toLowerCase())))
    .map(r => `<div class="history-entry diag">
      <div class="history-head"><strong>🧑‍🔧 Cody's diagnosis</strong><span class="repair-date">${fmtDate(r.when)}</span></div>
      <div>${escapeHtml(r.symptoms || '')}</div>
      ${r.topIssue ? `<div class="repair-issue">→ ${escapeHtml(r.topIssue)}</div>` : ''}
    </div>`);
  const all = entries.concat(diags);
  $('maintHistoryList').innerHTML = all.length
    ? all.join('')
    : '<p class="muted">Nothing here yet. Log a service and it lands on this timeline — that history is worth money when you sell, and it is how Cody learns your machine.</p>';
}
function openMaintLog(idx, presetItem) {
  maintCurrent = idx;
  maintLogFrom = document.querySelector('.screen.active') && document.querySelector('.screen.active').id === 'maintDetailScreen' ? 'detail' : 'board';
  const list = getGarage();
  const v = list[idx];
  if (!v) return;
  const cat = maintCatalog(v);
  $('logForLine').textContent = `For ${v.name || v.vehicle || ''} — tell Cody what got done and he moves the next due.`;
  const names = maintItemsFor(v).map(i => i.name);
  $('logItemSelect').innerHTML = names.map(n => `<option value="${escapeHtml(n)}"${n === presetItem ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('') + '<option value="__other">Other / a repair…</option>';
  $('logItemOtherWrap').hidden = true;
  const now = new Date();
  $('logDate').value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const meter = maintMeterOf(v);
  $('logMeterWrap').hidden = !meter.unit;
  if (meter.unit) {
    $('logMeterLabel').textContent = meter.unit === 'hrs' ? 'Hours at service' : 'Odometer at service';
    $('logMeter').value = meter.value || '';
  }
  $('logCost').value = '';
  $('logNotes').value = '';
  $('logError').hidden = true;
  $('logDone').hidden = true;
  showScreen('maintLogScreen');
}
$('logItemSelect').addEventListener('change', () => {
  $('logItemOtherWrap').hidden = $('logItemSelect').value !== '__other';
});
$('logSaveBtn').addEventListener('click', () => {
  const list = getGarage();
  const v = list[maintCurrent];
  if (!v) return;
  const errBox = $('logError');
  errBox.hidden = true;
  let itemName = $('logItemSelect').value;
  if (itemName === '__other') itemName = $('logItemOther').value.trim();
  if (!itemName) {
    errBox.textContent = 'Pick what got done — or type it under "Other".';
    errBox.hidden = false;
    return;
  }
  const dateVal = $('logDate').value;
  if (!dateVal) {
    errBox.textContent = 'Give it a date so Cody can do the math.';
    errBox.hidden = false;
    return;
  }
  const meterUnit = maintCatalog(v).unit;
  const meterVal = meterUnit && $('logMeter').value !== '' ? Number($('logMeter').value) : null;
  const entry = {
    item: itemName,
    date: new Date(dateVal + 'T12:00:00').toISOString(),
    meter: meterVal,
    cost: $('logCost').value !== '' ? Number($('logCost').value) : null,
    notes: $('logNotes').value.trim(),
    source: 'log',
  };
  v.serviceLog = Array.isArray(v.serviceLog) ? v.serviceLog : [];
  v.serviceLog.push(entry);
  v.lastService = v.lastService || {};
  v.lastService[itemName] = { date: entry.date, miles: meterVal != null ? meterVal : (maintMeterOf(v).value || 0) };
  if (meterVal != null) {
    const cur = maintMeterOf(v).value || 0;
    if (meterVal > cur) { if (meterUnit === 'hrs') v.hours = meterVal; else v.miles = meterVal; }
  }
  saveGarage(list);
  const item = maintItemsFor(v).find(i => i.name === itemName) || { name: itemName };
  const s = maintStatus(v, item);
  const done = $('logDone');
  done.innerHTML = `<strong>Logged.</strong> ${escapeHtml(itemName)} on ${escapeHtml(v.name || v.vehicle || '')} — ${fmtDate(entry.date)}${entry.meter != null ? ' at ' + fmtNum(entry.meter) + ' ' + meterUnit : ''}. ${s.dueMeter != null || s.dueDate ? `Cody's next call: ${escapeHtml(maintDueText(s))}.` : 'Cody has the baseline now and will track it from here.'}`;
  done.hidden = false;
  renderCodyHome();
});
$('backFromLog').addEventListener('click', () => {
  if (maintLogFrom === 'detail') { renderMaintDetail(); showScreen('maintDetailScreen'); }
  else { renderGarage(); showScreen('garageScreen'); }
});
$('backToGarageFromDetail').addEventListener('click', () => { renderGarage(); showScreen('garageScreen'); });
$('backFromHistory').addEventListener('click', () => { renderMaintDetail(); showScreen('maintDetailScreen'); });
$('goGarage').addEventListener('click', () => { renderGarage(); showScreen('garageScreen'); });
$('codyGoMaint').addEventListener('click', () => { renderGarage(); showScreen('garageScreen'); });
$('backToHomeFromGarage').addEventListener('click', () => showScreen('homeScreen'));
function maintSyncAddForm() {
  const t = $('garageType').value;
  const cat = MAINT_CATALOGS[t];
  $('garageMilesWrap').hidden = !cat.unit;
  if (cat.unit) $('garageMilesLabel').innerHTML = cat.unit === 'hrs' ? 'Current hours <small>(optional)</small>' : 'Current mileage <small>(optional)</small>';
}
$('garageType').addEventListener('change', maintSyncAddForm);
$('garageAddBtn').addEventListener('click', () => {
  const vehicle = $('garageVehicle').value.trim();
  if (!vehicle) { alert('Enter what it is.'); return; }
  const type = $('garageType').value;
  const cat = MAINT_CATALOGS[type];
  const reading = $('garageMiles').value ? Number($('garageMiles').value) : 0;
  const list = getGarage();
  list.push({
    name: $('garageName').value.trim(),
    vehicle,
    type,
    miles: cat.unit === 'mi' ? reading : 0,
    hours: cat.unit === 'hrs' ? reading : 0,
    lastService: {},
    serviceLog: [],
    customItems: [],
    addedAt: new Date().toISOString(),
  });
  saveGarage(list);
  $('garageName').value = ''; $('garageVehicle').value = ''; $('garageMiles').value = '';
  renderGarage();
  renderCodyHome();
});
function renderCodyHome() {
  const box = $('codyDueSummary');
  if (!box) return;
  const list = getGarage();
  if (!list.length) {
    box.innerHTML = 'No garage yet — add a vehicle or machine under <strong>Maintenance</strong> and Cody will watch its upkeep schedule for you.';
    return;
  }
  const counts = maintCounts(list);
  const urgent = maintMostUrgent(list);
  if (counts.overdue) {
    box.innerHTML = `⚠️ <strong>${counts.overdue} item${counts.overdue === 1 ? '' : 's'} overdue</strong> across your garage.${urgent ? ` First up: ${escapeHtml(urgent.item.name)} on ${escapeHtml(urgent.v.name || urgent.v.vehicle || '')}.` : ''}`;
  } else if (counts.soon) {
    box.innerHTML = `🟡 ${counts.soon} item${counts.soon === 1 ? '' : 's'} coming due in your garage.${urgent ? ` Closest: ${escapeHtml(urgent.item.name)} on ${escapeHtml(urgent.v.name || urgent.v.vehicle || '')}.` : ''}`;
  } else {
    box.innerHTML = `🟢 Your garage is on schedule — nothing overdue, nothing due soon. Cody will flag it here when that changes.`;
  }
}

// ===== Cody, resident agent: "what's next" help on every screen =====
// The safety net under the 6-second rule: wherever the operator is,
// Cody can say what this screen is for and what to do next — in his
// voice, from live state (the same due engine, never invented).
let codyCurrentScreen = 'homeScreen';
const CODY_WHERE = {
  homeScreen: "You're home. Everything in the Repair Guide starts here — diagnose something that's acting up, or check the upkeep board.",
  garageScreen: "This is your maintenance board — everything in your garage and what needs you first, ranked the way I'd rank it.",
  maintDetailScreen: "One machine, full picture: every upkeep item, when it was last done, and when I call it due — meter or date, whichever lands first.",
  maintLogScreen: "Tell me what got done. I'll write it in the book and move the next due — that's the whole job on this screen.",
  maintHistoryScreen: "Everything that's been done to this one, newest first: services you logged and diagnoses I ran.",
  categoryScreen: "Pick what you're working on. Closer you get on the category, sharper my ranking gets.",
  symptomScreen: "Describe it like you'd tell a mechanic at the counter — what it does, when it does it, what changed. Stated facts steer me, so don't hold back.",
  photoScanScreen: "One clear photo beats a paragraph. Get the whole machine or part in frame if you can.",
  resultScreen: "That's my read — most likely first, cheapest checks first. Anything marked stop means stop; hands-on confirmation settles anything serious.",
  partsScreen: "Tell me the vehicle and the parts. A VIN gets you exact fitment and a recall check for free.",
  partsResultScreen: "Options, prices and the how-to. If a price looks off, it can be — check the part number before you order.",
  sourceScreen: "Just prices, no lecture: local, Amazon and RockAuto side by side.",
  sourceResultScreen: "Cheapest isn't always the best buy — RockAuto adds shipping, local has it today. Your call; the numbers are here.",
  repairsScreen: "Every diagnosis I've run on this phone. Tap one to reopen the full result, exactly as it was shown.",
  videosScreen: "How-to videos saved on this phone, ready to link to a diagnosis.",
  obd2Screen: "Live data and fault codes off a Bluetooth dongle. Simulated mode lets you learn the screens without one — it's labeled, never passed off as real.",
};
function codyNextLine() {
  const list = getGarage();
  const counts = maintCounts(list);
  const urgent = maintMostUrgent(list);
  if (codyCurrentScreen === 'garageScreen' || codyCurrentScreen === 'maintDetailScreen' || codyCurrentScreen === 'maintLogScreen' || codyCurrentScreen === 'maintHistoryScreen') {
    if (!list.length) return "Next step: add your first vehicle or machine below. Thirty seconds now saves you a breakdown later.";
    if (urgent) return `Next step: ${urgent.item.name} on ${urgent.v.name || urgent.v.vehicle || 'your vehicle'} — ${urgent.s.state === 'overdue' ? "that's the one I'd do first; it's overdue" : "that's the closest thing on the clock"}. Log it when it's done and I'll re-rank the rest.`;
    return "Next step: nothing's due. If you just did a service, log it while it's fresh — future-you says thanks.";
  }
  if (codyCurrentScreen === 'resultScreen') {
    return "Next step: work the checks in order — they're ranked cheapest and easiest first. Still unclear after that? Add a detail at the bottom and re-check; I refine, I don't restart.";
  }
  if (counts.overdue) return `Heads-up from your garage: ${counts.overdue} upkeep item${counts.overdue === 1 ? '' : 's'} overdue. When you're done here, the Maintenance board has the ranking.`;
  if (counts.soon) return `Heads-up from your garage: ${counts.soon} upkeep item${counts.soon === 1 ? '' : 's'} coming due soon. The Maintenance board has the details.`;
  return "Next step: pick what you're working on. If something's broken, Diagnose gets me ranking causes; if it's upkeep, the Maintenance board is my other desk.";
}
function codyPanelActions() {
  const acts = [];
  const list = getGarage();
  if (codyCurrentScreen !== 'garageScreen') acts.push({ label: '🛠️ Maintenance board', run: () => { renderGarage(); showScreen('garageScreen'); } });
  if (list.length && codyCurrentScreen !== 'maintLogScreen') acts.push({ label: '✓ Log a service', run: () => openMaintLog(maintMostUrgent(list) ? maintMostUrgent(list).vi : 0, maintMostUrgent(list) ? maintMostUrgent(list).item.name : '') });
  if (codyCurrentScreen !== 'categoryScreen') acts.push({ label: '🔧 Diagnose a problem', run: () => showScreen('categoryScreen') });
  if (codyCurrentScreen === 'resultScreen') acts.push({ label: '✏️ Add detail & re-check', run: () => { const r = $('refineInput'); if (r) r.focus(); } });
  return acts;
}
function openCodyPanel() {
  $('codyPanelWhere').textContent = CODY_WHERE[codyCurrentScreen] || "You're in the Repair Guide. I can point you at the next step from here.";
  $('codyPanelNext').textContent = codyNextLine();
  const box = $('codyPanelActions');
  box.innerHTML = '';
  codyPanelActions().forEach(a => {
    const b = document.createElement('button');
    b.className = 'secondary-btn';
    b.textContent = a.label;
    b.onclick = () => { $('codyPanel').hidden = true; a.run(); };
    box.appendChild(b);
  });
  $('codyPanel').hidden = false;
}
$('codyHelpBtn').addEventListener('click', openCodyPanel);
$('codyPanelClose').addEventListener('click', () => { $('codyPanel').hidden = true; });
function codyOnScreen(id) {
  codyCurrentScreen = id;
  const signedIn = !!getSession();
  $('codyHelpBtn').hidden = !signedIn || id === 'loginScreen';
  if (id === 'loginScreen') $('codyPanel').hidden = true;
  if (id === 'homeScreen') renderCodyHome();
}
// Single navigation hook: Cody's chrome follows the operator.
const _showScreenBase = showScreen;
showScreen = function(id) {
  _showScreenBase(id);
  try { codyOnScreen(id); } catch (e) {}
};

// Repair log (stored on this phone)
const REPAIRS_KEY = 'h38-repair-guide-log';
function getRepairs() {
  try { return JSON.parse(localStorage.getItem(REPAIRS_KEY) || '[]'); }
  catch { return []; }
}
function saveRepair(entry) {
  const log = getRepairs();
  log.unshift({ ...entry, when: new Date().toISOString() });
  localStorage.setItem(REPAIRS_KEY, JSON.stringify(log.slice(0, 100)));
}
function renderRepairs() {
  const log = getRepairs();
  const box = $('repairsList');
  if (!log.length) {
    box.innerHTML = '<p class="muted">No repairs logged yet. Run a diagnosis and it will show up here.</p>';
    return;
  }
  const labels = {car:'Car / Truck', atv:'ATV / UTV', 'small-engine':'Small Engine', appliance:'Appliance', photo:'📷 Photo Scan'};
  box.innerHTML = log.map((r, i) => `
    <div class="repair-entry" data-i="${i}"${r.result ? ' role="button" tabindex="0"' : ''}>
      <div class="repair-head"><strong>${labels[r.category] || r.category}</strong>
      <span class="repair-date">${new Date(r.when).toLocaleDateString()}</span></div>
      <div class="repair-symptoms">${escapeHtml(r.symptoms)}</div>
      ${r.unitInfo ? `<div class="repair-unit">${escapeHtml(r.unitInfo)}</div>` : ''}
      ${r.topIssue ? `<div class="repair-issue">→ ${escapeHtml(r.topIssue)}</div>` : ''}
      ${r.result ? `<div class="repair-view">Tap to view the full result →</div>` : ''}
    </div>`).join('');
  box.querySelectorAll('.repair-entry[data-i]').forEach(el => {
    const entry = log[Number(el.dataset.i)];
    if (!entry || !entry.result) return;
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => reopenRepair(entry));
  });
}
// Reopen a saved result exactly as it was shown the first time.
function reopenRepair(entry) {
  if (entry.kind === 'parts') {
    renderParts(entry.result);
    showScreen('partsResultScreen');
    return;
  }
  if (entry.kind === 'sourcing') {
    renderSourcing(entry.result);
    showScreen('sourceResultScreen');
    return;
  }
  currentDiagnosis = { category: entry.category, symptoms: entry.symptoms, unitInfo: entry.unitInfo || '', result: entry.result };
  showScreen('resultScreen');
  renderResult(entry.result);
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
document.querySelectorAll('#categoryScreen .category-card').forEach(card => {
  card.addEventListener('click', () => {
    state.category = card.dataset.category;
    const labels = {car:'Car / Truck', atv:'ATV / UTV', 'small-engine':'Small Engine', appliance:'Appliance'};
    $('symptomTitle').textContent = labels[state.category] + ' — describe the problem';
    renderSymptomChips(state.category);
    renderGarageChips();
    showScreen('symptomScreen');
  });
});

// Common-problem starter chips: the first screen should never be a blank
// box (every leading AI-mechanic app offers tap-to-start symptoms).
const SYMPTOM_CHIPS = {
  car: ["Won't start — just clicks", "Won't start — cranks but won't catch", "Check engine light is on", "Grinding or squealing noise", "Overheating", "Battery keeps dying", "Brakes grind or feel soft", "Vibrates at highway speed"],
  atv: ["No spark", "Won't start", "Starts then dies", "Won't idle", "Losing power", "Won't go into gear", "Battery keeps dying", "Smokes a lot"],
  'small-engine': ["Won't start", "Starts then dies after a few seconds", "Runs rough / surges", "No spark", "Dies under load", "Smokes a lot", "Pull cord stuck or broken", "Leaks fuel"],
  appliance: ["Washer won't drain", "Washer won't spin", "Dryer not heating", "Fridge not cooling", "Freezer cold but fridge warm", "Making a loud noise", "Leaking water", "Won't turn on at all"],
};
function renderSymptomChips(category) {
  const wrap = $('symptomChipsWrap'), box = $('symptomChips');
  const chips = SYMPTOM_CHIPS[category] || [];
  if (!chips.length) { wrap.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = chips.map(c => `<button type="button" class="chip">${escapeHtml(c)}</button>`).join('');
  wrap.hidden = false;
  box.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    const cur = $('symptomInput').value.trim();
    $('symptomInput').value = cur ? cur + ' ' + chip.textContent : chip.textContent;
    $('symptomInput').focus();
  }));
}
function renderGarageChips() {
  const wrap = $('garageChipsWrap'), box = $('garageChips');
  const list = getGarage();
  if (!list.length) { wrap.hidden = true; box.innerHTML = ''; return; }
  box.innerHTML = list.map((v, i) => `<button type="button" class="chip" data-gi="${i}">🚗 ${escapeHtml(v.vehicle || v.name || '')}</button>`).join('');
  wrap.hidden = false;
  box.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    const v = getGarage()[Number(chip.dataset.gi)];
    if (v) $('unitInfo').value = v.vehicle || v.name || '';
  }));
}

$('backToCategory').addEventListener('click', () => showScreen('categoryScreen'));
$('backToSymptom').addEventListener('click', () => showScreen('symptomScreen'));
$('newDiagnosisBtn').addEventListener('click', () => {
  $('symptomInput').value = '';
  $('unitInfo').value = '';
  $('photoPreview').innerHTML = '';
  state.photo = null;
  scanState.photo = null;
  scanState.category = '';
  $('scanPhotoPreview').innerHTML = '';
  $('scanNote').value = '';
  document.querySelectorAll('#scanCategoryChips .chip').forEach(c => c.classList.toggle('active', !c.dataset.cat));
  showScreen('homeScreen');
});

// --- Photo helpers (shared by Diagnose + Photo Scan) ---
// Downscale phone photos before upload: max 1280px on the long edge,
// JPEG q0.82 — a multi-MB camera shot becomes ~150–350 KB.
const PHOTO_MAX_EDGE = 1280;
function readPhotoFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo.')); };
    img.src = url;
  });
}

function dataUrlToBlob(dataUrl) {
  const comma = dataUrl.indexOf(',');
  const head = dataUrl.slice(0, comma);
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bytes = atob(dataUrl.slice(comma + 1));
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Upload the compressed photo to the shared private storage bucket. Only
// the storage ref (never the bytes) rides in the task payload, so the
// diagnosis worker can fetch the picture and actually look at it.
async function uploadRepairPhoto(dataUrl) {
  const token = await getAccessToken();
  if (!token) { logout(); throw new Error('Please sign in first.'); }
  const blob = dataUrlToBlob(dataUrl);
  const id = (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  const path = `${BUSINESS_ID}/RepairGuide/${id}/photo.jpg`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/business-office-files/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'image/jpeg',
      'x-upsert': 'true',
    },
    body: blob,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Photo upload failed (${res.status})${text ? ': ' + text.substring(0, 120) : ''}`);
  }
  return { bucket: 'business-office-files', path, mimeType: 'image/jpeg', fileName: 'photo.jpg', sizeBytes: blob.size };
}

// Photo handling (symptom screen)
$('photoBtn').addEventListener('click', () => $('photoInput').click());
$('photoInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    state.photo = await readPhotoFile(file);
    $('photoPreview').innerHTML = `<img src="${state.photo}" alt="Problem photo">`;
  } catch (err) {
    alert(friendlyError(err));
  }
});

// Photo scan screen
$('scanPhotoBtn').addEventListener('click', () => $('scanPhotoInput').click());
$('scanPhotoInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    scanState.photo = await readPhotoFile(file);
    $('scanPhotoPreview').innerHTML = `<img src="${scanState.photo}" alt="Photo to identify">`;
    $('scanError').hidden = true;
  } catch (err) {
    const eb = $('scanError');
    eb.textContent = friendlyError(err);
    eb.hidden = false;
  }
});
document.querySelectorAll('#scanCategoryChips .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#scanCategoryChips .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    scanState.category = chip.dataset.cat || '';
  });
});

// Rotating loading messages: a real diagnosis takes ~1 minute (the poller
// runs every minute) — keep the user informed instead of a frozen spinner.
let loadingTimer = null;
function setLoading(el, messages) {
  if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null; }
  let i = 0;
  el.innerHTML = `<div class="spinner"></div><p class="loading-msg">${escapeHtml(messages[0])}</p><p><small>Real mechanic reasoning — this usually takes about a minute</small></p>`;
  if (messages.length > 1) {
    loadingTimer = setInterval(() => {
      i = (i + 1) % messages.length;
      const p = el.querySelector('.loading-msg');
      if (p) p.textContent = messages[i];
    }, 7000);
  }
}
function clearLoading() {
  if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null; }
}
const DIAGNOSIS_LOADING_MSGS = [
  'Cody is reading your symptoms...',
  'Cody is ranking the likely causes, cheapest check first...',
  'Still working — a careful answer beats a fast guess...',
  'Cody is putting together your check plan and estimate...',
];

// Diagnosis
$('diagnoseBtn').addEventListener('click', async () => {
  const symptoms = $('symptomInput').value.trim();
  if (!symptoms) {
    alert('Please describe the problem first.');
    return;
  }
  
  showScreen('resultScreen');
  $('diagnosisLoading').hidden = false;
  $('diagnosisResult').hidden = true;
  setLoading($('diagnosisLoading'), DIAGNOSIS_LOADING_MSGS);

  try {
    const result = await requestDiagnosis({
      category: state.category,
      symptoms,
      unitInfo: $('unitInfo').value.trim(),
      photo: state.photo,
    });
    clearLoading();
    const diagTop = result && (result.diagnosis || result);
    currentDiagnosis = { category: state.category, symptoms, unitInfo: $('unitInfo').value.trim(), result };
    saveRepair({
      category: state.category,
      symptoms,
      unitInfo: $('unitInfo').value.trim(),
      kind: 'diagnosis',
      result,
      topIssue: diagTop && diagTop.likelyIssues && diagTop.likelyIssues[0]
        ? (diagTop.likelyIssues[0].issue || '')
        : '',
    });
    // Stash for the optional Office bridge (dormant without ?office_business=).
    window.H38_LAST_DIAGNOSIS={input:{category:state.category,symptoms:symptoms,unitInfo:$('unitInfo').value.trim()},result:result};
    renderResult(result);
  } catch (err) {
    clearLoading();
    $('diagnosisLoading').innerHTML = `<p style="color:#ef9a9a">${friendlyError(err)}</p>`;
  }
});

// Photo scan submit: identify what's in the picture + likely issues
$('scanDiagnoseBtn').addEventListener('click', async () => {
  const errBox = $('scanError');
  errBox.hidden = true;
  if (!scanState.photo) {
    errBox.textContent = 'Take or upload a photo first.';
    errBox.hidden = false;
    return;
  }
  const note = $('scanNote').value.trim();
  const symptoms = note
    ? `Photo scan: ${note}`
    : 'Photo scan: identify what this is and what issues it likely has.';

  showScreen('resultScreen');
  $('diagnosisLoading').hidden = false;
  $('diagnosisResult').hidden = true;
  setLoading($('diagnosisLoading'), ['Cody is looking at your photo...', 'Cody is identifying what this is...', 'Cody is checking what usually goes wrong with it...']);

  try {
    const result = await requestDiagnosis({
      category: scanState.category || 'unknown',
      symptoms,
      unitInfo: '',
      photo: scanState.photo,
      source: 'repair-guide-photo-scan',
    });
    clearLoading();
    const diagTop = result && (result.diagnosis || result);
    currentDiagnosis = { category: scanState.category || 'photo', symptoms, unitInfo: '', result };
    saveRepair({
      category: scanState.category || 'photo',
      symptoms: note || 'Photo scan',
      unitInfo: (diagTop && diagTop.identifiedItem && diagTop.identifiedItem.name) || '',
      kind: 'diagnosis',
      result,
      topIssue: diagTop && diagTop.likelyIssues && diagTop.likelyIssues[0]
        ? (diagTop.likelyIssues[0].issue || '')
        : '',
    });
    window.H38_LAST_DIAGNOSIS = { input: { category: scanState.category, symptoms, unitInfo: '', photoScan: true }, result };
    renderResult(result);
  } catch (err) {
    clearLoading();
    $('diagnosisLoading').innerHTML = `<p style="color:#ef9a9a">${friendlyError(err)}</p>`;
  }
});

async function supabaseFetch(path, options = {}) {
  const token = await getAccessToken();
  if (!token) {
    logout();
    throw new Error('Please sign in first.');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) { logout(); }
    throw new Error(`Supabase error ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

async function requestDiagnosis(data) {
  // 0. If a photo is attached, upload it first — only the storage ref
  // rides in the task payload; the worker fetches and views the picture.
  let photoRef = null;
  if (data.photo) {
    $('diagnosisLoading').innerHTML = '<div class="spinner"></div><p>Sending photo to Cody...</p>';
    photoRef = await uploadRepairPhoto(data.photo);
    setLoading($('diagnosisLoading'), DIAGNOSIS_LOADING_MSGS);
  }

  // 1. Insert task into ai_handoff_tasks
  const tasks = await supabaseFetch('ai_handoff_tasks', {
    method: 'POST',
    body: JSON.stringify({
      business_id: BUSINESS_ID,
      task_type: 'repair_diagnosis',
      status: 'pending',
      payload: {
        category: data.category,
        symptoms: data.symptoms,
        unitInfo: data.unitInfo || null,
        photo: photoRef,
        hasPhoto: !!photoRef,
        source: data.source || 'repair-guide-diagnose',
        priorDiagnosis: data.priorDiagnosis || null,
      },
    }),
  });
  
  if (!tasks || !tasks.length) throw new Error('Failed to create diagnosis task');
  const taskId = tasks[0].id;
  
  // 2. Poll for result (Kit's poller runs every 1 min)
  if (!data.photo) setLoading($('diagnosisLoading'), DIAGNOSIS_LOADING_MSGS);

  const maxAttempts = 48; // 8 minutes max — agent answers can take a few poller cycles
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 10000)); // wait 10s
    
    const rows = await supabaseFetch(`ai_handoff_tasks?id=eq.${taskId}&select=status,result,last_error`);
    if (!rows || !rows.length) continue;
    
    const task = rows[0];
    if (task.status === 'done' && task.result) {
      return task.result;
    }
    if (task.status === 'failed') {
      throw new Error(task.last_error || 'Diagnosis failed');
    }
    // still pending/claimed, keep waiting
  }
  
  throw new Error('Timed out waiting for diagnosis. Please try again.');
}

// The diagnosis currently on screen — the refine flow builds on it.
let currentDiagnosis = null;

function renderResult(result) {
  clearLoading();
  $('diagnosisLoading').hidden = true;
  $('diagnosisResult').hidden = false;

  const d = result.diagnosis || result;

  // Photo identification (present when the diagnosis came from a photo)
  const ident = d.identifiedItem || d.identification || null;
  const idBox = $('identifiedBox');
  if (ident) {
    const idName = typeof ident === 'string' ? ident : (ident.name || ident.item || '');
    const idConf = typeof ident === 'object' ? (ident.confidence || '') : '';
    const idDesc = typeof ident === 'object' ? (ident.description || ident.details || '') : '';
    $('identifiedItem').innerHTML =
      `${idName ? `<div class="id-name">${escapeHtml(idName)}</div>` : ''}
       ${idConf ? `<div class="id-conf">Confidence: ${escapeHtml(idConf)}</div>` : ''}
       ${idDesc ? `<p>${escapeHtml(idDesc)}</p>` : ''}`;
    idBox.hidden = false;
  } else {
    idBox.hidden = true;
    $('identifiedItem').innerHTML = '';
  }

  // Safety verdict — the first thing a competitor app tells you:
  // is it safe to keep using this thing?
  const sev = d.severity || null;
  const sevBox = $('severityBox');
  if (sev && sev.headline) {
    const level = ['stop', 'soon', 'monitor'].includes(sev.level) ? sev.level : 'monitor';
    const icon = level === 'stop' ? '🛑' : (level === 'soon' ? '⚠️' : '👀');
    sevBox.className = 'severity ' + level;
    sevBox.innerHTML = `<div class="severity-head">${icon} ${escapeHtml(sev.headline)}</div>` +
      (sev.detail ? `<div class="severity-detail">${escapeHtml(sev.detail)}</div>` : '');
    sevBox.hidden = false;
  } else {
    sevBox.hidden = true;
    sevBox.innerHTML = '';
  }

  // DIY vs shop guidance
  const diff = d.difficulty || null;
  const diffBox = $('difficultyBox');
  if (diff && (diff.level || diff.note)) {
    const label = diff.level === 'easy-diy' ? '🟢 Easy DIY'
      : diff.level === 'diy' ? '🟡 Doable DIY'
      : diff.level === 'shop' ? '🔧 Best left to a shop' : '';
    diffBox.innerHTML = (label ? `<strong>${label}</strong>` : '') +
      (diff.note ? `<span>${label ? ' — ' : ''}${escapeHtml(diff.note)}</span>` : '');
    diffBox.hidden = false;
  } else {
    diffBox.hidden = true;
    diffBox.innerHTML = '';
  }

  // Likely issues
  const issuesHtml = (d.likelyIssues || []).map((item, i) => `
    <div class="issue">
      <div class="issue-rank">${i === 0 ? 'MOST LIKELY' : '#' + (i + 1)} • ${item.probability || ''}</div>
      <strong>${escapeHtml(item.issue || '')}</strong>
      <p>${escapeHtml(item.explanation || '')}</p>
    </div>
  `).join('');
  $('issuesList').innerHTML = issuesHtml || '<p>No specific issues identified.</p>';
  
  // Check plan
  const checksHtml = (d.checkPlan || []).map((step, i) => `
    <div class="check"><strong>${i + 1}.</strong> ${escapeHtml(step)}</div>
  `).join('');
  $('checksList').innerHTML = checksHtml || '<p>No check steps provided.</p>';
  
  // Fix plan
  const fixHtml = (d.fixPlan || []).map((step, i) => `
    <div class="step"><strong>Step ${i + 1}:</strong> ${escapeHtml(step)}</div>
  `).join('');
  $('fixPlan').innerHTML = fixHtml || '<p>No fix plan provided.</p>';
  
  // Estimate
  const partsRows = (d.partsEstimate || []).map(p => `
    <div class="estimate-row"><span>${escapeHtml(p.part || '')}</span><span>${escapeHtml(p.estimatedCost || '')}</span></div>
  `).join('');
  $('estimateBox').innerHTML = `
    <div class="estimate-row"><span><strong>Time:</strong></span><span>${escapeHtml(d.timeEstimate || 'TBD')}</span></div>
    ${partsRows}
    <div class="estimate-row estimate-total"><span>Total estimate:</span><span>${escapeHtml(d.totalEstimate || 'TBD')}</span></div>
    ${(d.serviceBulletins && d.serviceBulletins.length) ? `<div style="margin-top:12px"><strong>Service bulletins:</strong><ul>${d.serviceBulletins.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul></div>` : ''}
  `;
  
  // Parts links
  const partsLinksHtml = (d.partsEstimate || []).map(p => {
    const query = encodeURIComponent(p.part || '');
    return `
    <div class="part">
      <div class="part-name">${escapeHtml(p.part || '')} — ${escapeHtml(p.estimatedCost || '')}</div>
      <div class="part-links">
        <a href="https://www.amazon.com/s?k=${query}" target="_blank" rel="noopener">Amazon</a>
        <a href="https://www.rockauto.com/en/catalog/" target="_blank" rel="noopener">RockAuto</a>
      </div>
    </div>`;
  }).join('');
  $('partsList').innerHTML = partsLinksHtml || '<p>No parts listed.</p>';

  // Follow-up questions + refine: a good mechanic asks questions back.
  // Answering one re-runs the diagnosis with the added detail.
  const questions = Array.isArray(d.followUpQuestions) ? d.followUpQuestions.filter(Boolean) : [];
  const fuBox = $('followUpBox');
  if (currentDiagnosis) {
    $('followUpQuestions').innerHTML = questions.length
      ? `<p class="muted" style="margin-top:0">Cody wants to know:</p>` +
        questions.map(q => `<div class="followup-q">❓ ${escapeHtml(q)}</div>`).join('')
      : '';
    $('refineInput').value = '';
    $('refineError').hidden = true;
    fuBox.hidden = false;
  } else {
    fuBox.hidden = true;
  }
}

// "Add detail & re-check": send the follow-up detail back with the
// original context so Kit refines instead of starting over.
$('refineBtn').addEventListener('click', async () => {
  const errBox = $('refineError');
  errBox.hidden = true;
  if (!currentDiagnosis) return;
  const extra = $('refineInput').value.trim();
  if (!extra) {
    errBox.textContent = 'Add a detail first — an answer to a question above, or anything else you noticed.';
    errBox.hidden = false;
    return;
  }
  const prev = currentDiagnosis;
  const prevDiag = prev.result && (prev.result.diagnosis || prev.result);
  const combinedSymptoms = prev.symptoms + ' Follow-up detail: ' + extra;
  $('diagnosisResult').hidden = true;
  $('diagnosisLoading').hidden = false;
  setLoading($('diagnosisLoading'), DIAGNOSIS_LOADING_MSGS);
  window.scrollTo(0, 0);
  try {
    const result = await requestDiagnosis({
      category: prev.category,
      symptoms: combinedSymptoms,
      unitInfo: prev.unitInfo,
      photo: null,
      priorDiagnosis: prevDiag ? {
        topIssue: prevDiag.likelyIssues && prevDiag.likelyIssues[0] ? prevDiag.likelyIssues[0].issue : '',
        severity: prevDiag.severity ? prevDiag.severity.headline : '',
      } : null,
    });
    clearLoading();
    const diagTop = result && (result.diagnosis || result);
    currentDiagnosis = { category: prev.category, symptoms: combinedSymptoms, unitInfo: prev.unitInfo, result };
    saveRepair({
      category: prev.category,
      symptoms: combinedSymptoms,
      unitInfo: prev.unitInfo,
      kind: 'diagnosis',
      result,
      topIssue: diagTop && diagTop.likelyIssues && diagTop.likelyIssues[0]
        ? (diagTop.likelyIssues[0].issue || '')
        : '',
    });
    renderResult(result);
  } catch (err) {
    clearLoading();
    $('diagnosisLoading').hidden = true;
    $('diagnosisResult').hidden = false;
    errBox.textContent = friendlyError(err);
    errBox.hidden = false;
  }
});

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

})();
