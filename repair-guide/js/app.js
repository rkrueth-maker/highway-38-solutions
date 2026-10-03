(function(){
'use strict';

// Repair Guide App - frontend
// Sends diagnosis requests to Kit via the handoff API

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

// Category selection
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
  
  try {
    // For now, this calls a backend endpoint that routes to Kit
    // TODO: wire up to actual backend (Supabase edge function or direct API)
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

async function requestDiagnosis(data) {
  // Placeholder - will connect to Kit backend
  // For now, return a structured empty to show the UI works
  // In production, this POSTs to the diagnosis endpoint
  throw new Error('Backend not connected yet. The app shell is ready — Kit integration coming next.');
}

function renderResult(result) {
  $('diagnosisLoading').hidden = true;
  $('diagnosisResult').hidden = false;
  // TODO: render actual diagnosis data
}

})();
