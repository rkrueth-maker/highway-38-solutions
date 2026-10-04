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
  $('partsLoading').innerHTML = '<div class="spinner"></div><p>Kit is looking up parts...<br><small>This usually takes under a minute</small></p>';

  try {
    const result = await requestParts({ vehicle, needed });
    renderParts(result);
    saveRepair({ category: 'parts', symptoms: needed, unitInfo: vehicle,
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
        vehicle: data.vehicle,
        needed: data.needed,
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
        stores = $('partsStores'), notes = $('partsNotes');
  const list = result.options || result.parts || [];
  opts.innerHTML = list.length
    ? list.map(p => `<div class="part"><div class="part-name">${escapeHtml(p.name || p.title || '')}</div>
        ${p.detail ? `<div>${escapeHtml(p.detail)}</div>` : ''}
        ${p.price ? `<div class="part-price">${escapeHtml(p.price)}</div>` : ''}</div>`).join('')
    : '<p class="muted">No specific options returned.</p>';
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
  const labels = {car:'Car / Truck', atv:'ATV / UTV', 'small-engine':'Small Engine', appliance:'Appliance'};
  box.innerHTML = log.map((r, i) => `
    <div class="repair-entry" data-i="${i}">
      <div class="repair-head"><strong>${labels[r.category] || r.category}</strong>
      <span class="repair-date">${new Date(r.when).toLocaleDateString()}</span></div>
      <div class="repair-symptoms">${escapeHtml(r.symptoms)}</div>
      ${r.unitInfo ? `<div class="repair-unit">${escapeHtml(r.unitInfo)}</div>` : ''}
      ${r.topIssue ? `<div class="repair-issue">→ ${escapeHtml(r.topIssue)}</div>` : ''}
    </div>`).join('');
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
document.querySelectorAll('#categoryScreen .category-card').forEach(card => {
  card.addEventListener('click', () => {
    state.category = card.dataset.category;
    const labels = {car:'Car / Truck', atv:'ATV / UTV', 'small-engine':'Small Engine', appliance:'Appliance'};
    $('symptomTitle').textContent = labels[state.category] + ' — describe the problem';
    showScreen('symptomScreen');
  });
});

$('backToCategory').addEventListener('click', () => showScreen('categoryScreen'));
$('backToSymptom').addEventListener('click', () => showScreen('symptomScreen'));
$('newDiagnosisBtn').addEventListener('click', () => {
  $('symptomInput').value = '';
  $('unitInfo').value = '';
  $('photoPreview').innerHTML = '';
  state.photo = null;
  showScreen('homeScreen');
});

// Photo handling
$('photoBtn').addEventListener('click', () => $('photoInput').click());
$('photoInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    state.photo = ev.target.result;
    $('photoPreview').innerHTML = `<img src="${state.photo}" alt="Problem photo">`;
  };
  reader.readAsDataURL(file);
});

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
  $('diagnosisLoading').innerHTML = '<div class="spinner"></div><p>Kit is analyzing...</p>';
  
  try {
    const result = await requestDiagnosis({
      category: state.category,
      symptoms,
      unitInfo: $('unitInfo').value.trim(),
      photo: state.photo,
    });
    saveRepair({
      category: state.category,
      symptoms,
      unitInfo: $('unitInfo').value.trim(),
      topIssue: result && result.issues && result.issues[0]
        ? (result.issues[0].title || result.issues[0].name || '')
        : '',
    });
    renderResult(result);
  } catch (err) {
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
        // Note: photo as data URL is too large for the payload
        // For now, we note if a photo was provided
        hasPhoto: !!data.photo,
      },
    }),
  });
  
  if (!tasks || !tasks.length) throw new Error('Failed to create diagnosis task');
  const taskId = tasks[0].id;
  
  // 2. Poll for result (Kit's poller runs every 1 min)
  $('diagnosisLoading').innerHTML = '<div class="spinner"></div><p>Kit is analyzing...<br><small>This usually takes under a minute</small></p>';
  
  const maxAttempts = 30; // 5 minutes max
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

function renderResult(result) {
  $('diagnosisLoading').hidden = true;
  $('diagnosisResult').hidden = false;
  
  const d = result.diagnosis || result;
  
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
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

})();
