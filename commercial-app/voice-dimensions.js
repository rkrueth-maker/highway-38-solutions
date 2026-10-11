/* H38 voice-recorded critical dimensions.
 * User taps the button, speaks dimensions aloud ("30 inch wide sink base,
 * 108 inch long countertop"), audio goes to Whisper via the
 * h38-walkthrough-transcription Edge Function (transcribe_dimensions_audio
 * action), transcript is parsed with regex, user reviews/edits, saves.
 *
 * Per Ricky: spoken dimensions ARE field-measured — the speaker is reading
 * off a tape on site. Saved with Source VOICE_RECORDED,
 * Verification Status FIELD_MEASURED, Confidence 1. The quote builder
 * does not re-ask for them (isVerified() treats FIELD_MEASURED as verified).
 *
 * Exposes: window.H38VoiceDimensions = { record() }
 */
(function(){
'use strict';

var C = window.H38_FIELD_VISIT_CORE;
if(!C) return;

function toast(m, isErr){
  if(typeof C.toast === 'function') C.toast(m, isErr);
  else if(typeof window.toast === 'function') window.toast(m, isErr);
}
function t(v){ return String(v == null ? '' : v); }
function n(v){ var x = parseFloat(v); return isNaN(x) ? 0 : x; }
function esc(v){
  if(typeof C.esc === 'function') return C.esc(v);
  return t(v).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

/* ---------- dimension parsing ---------- */

var DIM_WORDS = {
  'wide': 'width', 'width': 'width',
  'long': 'length', 'length': 'length',
  'tall': 'height', 'height': 'height', 'high': 'height',
  'deep': 'depth', 'depth': 'depth'
};
var UNIT_MAP = {
  'inch': 'in', 'inches': 'in', 'in': 'in', '"': 'in',
  'foot': 'ft', 'feet': 'ft', 'ft': 'ft', "'": 'ft'
};

function toInches(value, unit){
  if(unit === 'ft') return value * 12;
  return value; // 'in'
}

// Split transcript into candidate phrases
function splitPhrases(transcript){
  return t(transcript)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(/[,;.]|\band then\b|\bthen\b|\band\b|\bokay\b|\bok\b/)
    .map(function(s){ return s.trim(); })
    .filter(function(s){ return s.length > 0; });
}

// Parse one phrase like "30 inch wide sink base" or "5 feet 6 inches tall refrigerator"
function parsePhrase(phrase){
  var results = [];
  // Match feet+inches combo first: "5 feet 6 inches" or "5' 6\""
  var combo = phrase.match(/(\d+(?:\.\d+)?)\s*(?:feet|foot|ft|')\s*(\d+(?:\.\d+)?)?\s*(?:inch(?:es)?|in|")?/);
  var rest = phrase, totalInches = 0, matched = false;

  if(combo){
    totalInches = n(combo[1]) * 12 + (combo[2] ? n(combo[2]) : 0);
    rest = phrase.slice(phrase.indexOf(combo[0]) + combo[0].length).trim();
    matched = totalInches > 0;
  } else {
    // Single number + unit: "30 inch", "108\"", "36 in"
    var single = phrase.match(/(\d+(?:\.\d+)?)\s*(inch(?:es)?|in\b|"|feet|foot|ft\b|')/);
    if(single){
      totalInches = toInches(n(single[1]), UNIT_MAP[single[2].replace(/"/g,'"')] || 'in');
      // Fix: unit key lookup — handle " and ' literally
      var ukey = single[2];
      if(ukey === '"') totalInches = n(single[1]);
      else if(ukey === "'") totalInches = n(single[1]) * 12;
      else totalInches = toInches(n(single[1]), UNIT_MAP[ukey] || 'in');
      rest = phrase.slice(phrase.indexOf(single[0]) + single[0].length).trim();
      matched = totalInches > 0;
    }
  }

  if(!matched) return results;

  // Find dimension word in the remainder (or before the number)
  var dimType = '';
  var dimMatch = rest.match(/^(wide|width|long|length|tall|height|high|deep|depth)\b/);
  if(dimMatch){
    dimType = DIM_WORDS[dimMatch[1]];
    rest = rest.slice(dimMatch[0].length).trim();
  } else {
    // Check before the number too: "wide 30 inch sink base" (rare)
    var before = phrase.match(/(wide|width|long|length|tall|height|high|deep|depth)\s+\d/);
    if(before) dimType = DIM_WORDS[before[1]];
  }

  // Clean up label: remove filler words
  var label = rest
    .replace(/^(a|an|the|for|of)\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Capitalize first letter for display
  if(label) label = label.charAt(0).toUpperCase() + label.slice(1);
  if(dimType && label && label.toLowerCase().indexOf(dimType) === -1){
    label = label + ' ' + dimType;
  } else if(dimType && !label){
    label = dimType.charAt(0).toUpperCase() + dimType.slice(1);
  }

  results.push({
    label: label || 'Measurement',
    value: Math.round(totalInches * 8) / 8, // nearest 1/8"
    unit: 'in',
    dimType: dimType,
    raw: phrase
  });
  return results;
}

function parseDimensions(transcript){
  var out = [];
  var phrases = splitPhrases(transcript);
  for(var i = 0; i < phrases.length; i++){
    var parsed = parsePhrase(phrases[i]);
    for(var j = 0; j < parsed.length; j++) out.push(parsed[j]);
  }
  // Dedupe identical label+value
  var seen = {}, deduped = [];
  for(var k = 0; k < out.length; k++){
    var key = out[k].label.toLowerCase() + '|' + out[k].value;
    if(!seen[key]){ seen[key] = true; deduped.push(out[k]); }
  }
  return deduped;
}

/* ---------- audio recording ---------- */
/* (Recording is implemented inline in the Start button handler below
 * so start/stop can share the MediaRecorder instance.) */

/* ---------- transcription via Edge Function ---------- */

function cfg(){
  return window.H38_BUSINESS_OFFICE_SUPABASE || {};
}

function blobToBase64(blob){
  return new Promise(function(resolve, reject){
    var r = new FileReader();
    r.onload = function(){
      var s = t(r.result).split(',')[1] || '';
      resolve(s);
    };
    r.onerror = function(){ reject(r.error || new Error('Audio could not be read.')); };
    r.readAsDataURL(blob);
  });
}

async function transcribe(blob, mimeType){
  var config = cfg();
  if(!config.enabled || !window.supabase) throw new Error('Office connection is not available.');
  var api = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
  });
  var sessRes = await api.auth.getSession();
  var sess = sessRes.data && sessRes.data.session;
  if(!sess) throw new Error('Sign in again before recording dimensions.');
  var b64 = await blobToBase64(blob);
  if(!b64) throw new Error('Recorded audio was empty.');
  var businessId = (C.state.visit && C.state.visit.businessId) || window.state && window.state.businessId;
  var resp = await fetch(config.url + '/functions/v1/h38-walkthrough-transcription', {
    method: 'POST', mode: 'cors', cache: 'no-store', credentials: 'omit',
    headers: {
      authorization: 'Bearer ' + sess.access_token,
      apikey: config.publishableKey,
      'content-type': 'application/json',
      'x-client-info': 'h38-voice-dimensions-v1'
    },
    body: JSON.stringify({
      action: 'transcribe_dimensions_audio',
      businessId: businessId,
      audioBase64: b64,
      mimeType: mimeType || 'audio/webm'
    })
  });
  var payload = await resp.json().catch(function(){ return {}; });
  if(!resp.ok || payload.status !== 'PASS'){
    throw new Error(payload.message || ('Transcription failed (' + resp.status + ').'));
  }
  return t(payload.transcript || '');
}

/* ---------- overlay UI ---------- */

function makeOverlay(){
  var el = document.createElement('div');
  el.id = 'h38VoiceDimsOverlay';
  el.innerHTML =
    '<div class="h38vd-card">' +
      '<div class="h38vd-title"><span>🎤</span><div><strong>Record Critical Dimensions</strong>' +
      '<small>Speak each dimension clearly, e.g. "30 inch wide sink base, 108 inch long countertop"</small></div></div>' +
      '<div class="h38vd-status" id="h38vdStatus">Tap <strong>Start</strong>, then speak.</div>' +
      '<div class="h38vd-rec" id="h38vdRec" hidden><span class="h38vd-dot"></span><span id="h38vdTimer">0:00</span></div>' +
      '<div class="h38vd-bar">' +
        '<button type="button" class="h38vd-btn h38vd-start" id="h38vdStart">● Start</button>' +
        '<button type="button" class="h38vd-btn h38vd-stop" id="h38vdStop" hidden>■ Stop</button>' +
        '<button type="button" class="h38vd-btn" id="h38vdCancel">Cancel</button>' +
      '</div>' +
      '<div class="h38vd-results" id="h38vdResults" hidden></div>' +
    '</div>';
  var style = document.createElement('style');
  style.textContent =
    '#h38VoiceDimsOverlay{position:fixed;inset:0;z-index:10000;background:rgba(4,12,20,.72);display:flex;align-items:flex-end;justify-content:center;font-family:inherit}' +
    '#h38VoiceDimsOverlay .h38vd-card{background:#fff;border-radius:18px 18px 0 0;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;padding:18px 16px calc(env(safe-area-inset-bottom,0px) + 18px)}' +
    '#h38VoiceDimsOverlay .h38vd-title{display:flex;gap:10px;align-items:flex-start;margin-bottom:12px}' +
    '#h38VoiceDimsOverlay .h38vd-title span{font-size:1.6rem}' +
    '#h38VoiceDimsOverlay .h38vd-title small{display:block;color:#5b6b7c;font-weight:400;margin-top:2px}' +
    '#h38VoiceDimsOverlay .h38vd-status{background:#f1f5f9;border-radius:10px;padding:10px 12px;font-size:.9rem;margin-bottom:12px;color:#334155}' +
    '#h38VoiceDimsOverlay .h38vd-rec{display:flex;align-items:center;gap:10px;justify-content:center;font-size:1.3rem;font-weight:800;margin-bottom:12px;color:#b91c1c}' +
    '#h38VoiceDimsOverlay .h38vd-dot{width:14px;height:14px;border-radius:50%;background:#dc2626;animation:h38vdPulse 1.1s infinite}' +
    '@keyframes h38vdPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}' +
    '#h38VoiceDimsOverlay .h38vd-bar{display:flex;gap:10px;margin-bottom:6px}' +
    '#h38VoiceDimsOverlay .h38vd-btn{flex:1;min-height:54px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;font-weight:800;font-size:1rem;color:#0b2438}' +
    '#h38VoiceDimsOverlay .h38vd-start{background:#1d7a3a;border-color:#1d7a3a;color:#fff}' +
    '#h38VoiceDimsOverlay .h38vd-stop{background:#b91c1c;border-color:#b91c1c;color:#fff}' +
    '#h38VoiceDimsOverlay .h38vd-results{margin-top:12px}' +
    '#h38VoiceDimsOverlay .h38vd-row{display:flex;gap:8px;align-items:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px;margin-bottom:8px}' +
    '#h38VoiceDimsOverlay .h38vd-row input{border:1px solid #cbd5e1;border-radius:8px;padding:10px 8px;font-size:1rem;min-height:44px}' +
    '#h38VoiceDimsOverlay .h38vd-label{flex:2;min-width:0}' +
    '#h38VoiceDimsOverlay .h38vd-val{flex:1;max-width:90px}' +
    '#h38VoiceDimsOverlay .h38vd-del{flex:0 0 44px;min-height:44px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:8px;font-size:1.1rem}' +
    '#h38VoiceDimsOverlay .h38vd-transcript{background:#f1f5f9;border-radius:10px;padding:10px 12px;font-size:.85rem;color:#475569;margin-bottom:10px}' +
    '#h38VoiceDimsOverlay .h38vd-save{width:100%;min-height:54px;border:0;border-radius:12px;background:#0b7ac2;color:#fff;font-weight:900;font-size:1.05rem;margin-top:6px}';
  document.head.appendChild(style);
  document.body.appendChild(el);
  return el;
}

function fmtTimer(sec){
  var m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

/* ---------- main flow ---------- */

async function record(){
  var overlay = makeOverlay();
  var statusEl = overlay.querySelector('#h38vdStatus');
  var recEl = overlay.querySelector('#h38vdRec');
  var timerEl = overlay.querySelector('#h38vdTimer');
  var startBtn = overlay.querySelector('#h38vdStart');
  var stopBtn = overlay.querySelector('#h38vdStop');
  var cancelBtn = overlay.querySelector('#h38vdCancel');
  var resultsEl = overlay.querySelector('#h38vdResults');
  var say = function(html){ statusEl.innerHTML = html; };

  var recorder = null, stopFn = null, timerInt = 0, elapsed = 0;
  var done = false;

  function cleanup(){
    done = true;
    clearInterval(timerInt);
    try{ overlay.remove(); }catch(_){}
  }

  cancelBtn.onclick = function(){
    try{ if(stopFn) stopFn(); }catch(_){}
    cleanup();
  };

  // NOTE: recording is implemented inline in the Start handler below
  // so start/stop share one MediaRecorder instance.
  startBtn.onclick = async function(){
    startBtn.hidden = true;
    say('Requesting microphone…');
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      say('Microphone is not available in this browser.');
      startBtn.hidden = false;
      return;
    }
    var stream;
    try{
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }catch(e){
      say('Microphone blocked: ' + esc(e.message || 'permission denied'));
      startBtn.hidden = false;
      return;
    }
    var mimeType = 'audio/webm';
    if(!window.MediaRecorder || (window.MediaRecorder.isTypeSupported && !MediaRecorder.isTypeSupported(mimeType))){
      mimeType = '';
    }
    var rec;
    try{
      rec = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);
    }catch(e){
      stream.getTracks().forEach(function(tr){ tr.stop(); });
      say('Recording failed to start: ' + esc(e.message || e));
      startBtn.hidden = false;
      return;
    }
    var chunks = [];
    rec.ondataavailable = function(e){ if(e.data && e.data.size) chunks.push(e.data); };
    rec.start();
    recorder = rec;
    stopFn = function(){ if(rec.state !== 'inactive') rec.stop(); };

    // UI: recording state
    recEl.hidden = false;
    stopBtn.hidden = false;
    elapsed = 0;
    timerEl.textContent = '0:00';
    say('<strong style="color:#b91c1c">● Listening…</strong> Speak each dimension clearly, then tap <strong>Stop</strong>.');
    timerInt = setInterval(function(){
      elapsed++;
      timerEl.textContent = fmtTimer(elapsed);
      if(elapsed >= 120){ stopBtn.click(); } // 2 min cap
    }, 1000);

    rec.onstop = async function(){
      clearInterval(timerInt);
      stream.getTracks().forEach(function(tr){ tr.stop(); });
      recEl.hidden = true;
      stopBtn.hidden = true;
      if(done) return;
      var type = rec.mimeType || 'audio/webm';
      var blob = new Blob(chunks, { type: type });
      if(!blob.size){
        say('No audio captured. Tap <strong>Start</strong> to try again.');
        startBtn.hidden = false;
        return;
      }
      say('Transcribing…');
      try{
        var transcript = await transcribe(blob, type);
        if(!transcript){
          say('Nothing was heard. Tap <strong>Start</strong> to try again.');
          startBtn.hidden = false;
          return;
        }
        var dims = parseDimensions(transcript);
        showReview(transcript, dims);
      }catch(e){
        say('Transcription failed: ' + esc(e.message || e));
        startBtn.hidden = false;
      }
    };

    stopBtn.onclick = function(){
      say('Processing…');
      try{ stopFn(); }catch(_){}
    };
  };

  function showReview(transcript, dims){
    resultsEl.hidden = false;
    if(!dims.length){
      say('Heard you, but found no dimensions. Speak like: <em>"30 inch wide sink base"</em>.');
      resultsEl.innerHTML =
        '<div class="h38vd-transcript"><strong>Heard:</strong> ' + esc(transcript) + '</div>' +
        '<button type="button" class="h38vd-btn h38vd-start" id="h38vdRetry" style="width:100%">● Record Again</button>';
      resultsEl.querySelector('#h38vdRetry').onclick = function(){
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
        startBtn.hidden = false;
        say('Tap <strong>Start</strong>, then speak.');
      };
      return;
    }
    say('<strong>' + dims.length + '</strong> dimension' + (dims.length === 1 ? '' : 's') + ' found. Review, edit, then save.');
    var html = '<div class="h38vd-transcript"><strong>Heard:</strong> ' + esc(transcript) + '</div>';
    dims.forEach(function(d, i){
      html +=
        '<div class="h38vd-row" data-idx="' + i + '">' +
          '<input class="h38vd-label" data-f="label" value="' + esc(d.label) + '" aria-label="What was measured">' +
          '<input class="h38vd-val" data-f="value" type="number" step="0.125" min="0" value="' + esc(String(d.value)) + '" aria-label="Inches">' +
          '<span style="font-weight:700;color:#64748b">in</span>' +
          '<button type="button" class="h38vd-del" data-del="' + i + '" aria-label="Remove">✕</button>' +
        '</div>';
    });
    html += '<button type="button" class="h38vd-save" id="h38vdSave">Save ' + dims.length + ' Measurement' + (dims.length === 1 ? '' : 's') + '</button>';
    html += '<button type="button" class="h38vd-btn" id="h38vdAgain" style="width:100%;margin-top:8px">● Record More</button>';
    resultsEl.innerHTML = html;

    resultsEl.querySelectorAll('[data-del]').forEach(function(btn){
      btn.onclick = function(){
        var row = btn.closest('.h38vd-row');
        if(row) row.remove();
        updateSaveBtn();
      };
    });
    function updateSaveBtn(){
      var rows = resultsEl.querySelectorAll('.h38vd-row');
      var saveBtn = resultsEl.querySelector('#h38vdSave');
      if(saveBtn) saveBtn.textContent = 'Save ' + rows.length + ' Measurement' + (rows.length === 1 ? '' : 's');
      if(!rows.length && saveBtn) saveBtn.hidden = true;
    }
    resultsEl.querySelector('#h38vdAgain').onclick = function(){
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      startBtn.hidden = false;
      say('Tap <strong>Start</strong>, then speak.');
    };
    resultsEl.querySelector('#h38vdSave').onclick = async function(){
      var rows = resultsEl.querySelectorAll('.h38vd-row');
      var measurements = [];
      rows.forEach(function(row){
        var label = row.querySelector('[data-f="label"]').value.trim();
        var value = parseFloat(row.querySelector('[data-f="value"]').value) || 0;
        if(value > 0){
          measurements.push({
            label: label || 'Voice-recorded measurement',
            type: 'Length',
            value: value,
            unit: 'in',
            source: 'VOICE_RECORDED',
            confidence: 1,
            verificationStatus: 'FIELD_MEASURED',
            notes: 'Spoken on site — read from tape measure. Treated as field-measured per owner.'
          });
        }
      });
      if(!measurements.length){
        toast('No valid measurements to save.', true);
        return;
      }
      try{
        await C.session();
        await C.ingest({
          captureSessionId: C.state.visit.sessionId,
          measurements: measurements
        });
        cleanup();
      }catch(e){
        toast(e.message || e, true);
      }
    };
  }
}

window.H38VoiceDimensions = { record: record, parseDimensions: parseDimensions, BUILD: '20261011-voice-dims-1' };
})();
