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
    showScreen('categoryScreen');
  } catch (err) {
    errBox.textContent = err.message;
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
    showScreen('categoryScreen');
  } else {
    showScreen('loginScreen');
  }
})();
document.querySelectorAll('.category-card').forEach(card => {
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
  showScreen('categoryScreen');
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
    renderResult(result);
  } catch (err) {
    $('diagnosisLoading').innerHTML = `<p style="color:#ef9a9a">Couldn't get a diagnosis: ${err.message}<br><br>Check your connection and try again.</p>`;
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
