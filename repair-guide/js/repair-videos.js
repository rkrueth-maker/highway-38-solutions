(function(){
'use strict';

/*
 * H38 Repair Guide — Repair Videos
 * ---------------------------------
 * Standalone how-to video library for the Repair Guide app.
 *
 * - localStorage only (library: `h38-repair-videos-library`, toggle:
 *   `h38-repair-videos-enabled`). No Office dependencies, no backend calls.
 * - Supports YouTube (watch / youtu.be / embed / shorts links) embedded via
 *   youtube-nocookie.com, and direct .mp4 URLs played in a <video> element.
 * - Home screen entry point ("📹 Repair Videos" card) + a "Related videos"
 *   block that is appended to diagnosis results when the library holds a
 *   relevant match (keyword match on system tags / symptoms / vehicle text).
 * - The video library toggle defaults ON. This is an internal staff tool, so
 *   no Owner Controls screen exists here; the toggle lives in the library UI.
 *   When the Repair Guide is wired into the Office as a module, this toggle
 *   should be moved to Office → Settings → Owner Controls.
 *
 * Diagnosis integration notes:
 *   app.js renders diagnosis results in its own IIFE, so renderResult() cannot
 *   be patched from here. The hook is a MutationObserver on #diagnosisResult
 *   (see hookDiagnosisResults): when results render, we read the latest entry
 *   from the repair log ('h38-repair-guide-log') plus the rendered result text
 *   and append a Related videos block via relatedVideosFor(). The observer
 *   ignores mutations inside the block itself so inline playback is not
 *   interrupted. If a cleaner hook is wanted later, expose a callback from
 *   app.js's renderResult() and call window.H38RepairVideos.relatedVideosFor().
 */

var LIBRARY_KEY = 'h38-repair-videos-library';
var ENABLED_KEY = 'h38-repair-videos-enabled';
var LOG_KEY = 'h38-repair-guide-log'; // read-only: repair log written by app.js

var PRESET_TAGS = ['engine','brakes','electrical','transmission','hvac','suspension',
                   'fuel','cooling','tires','body','appliance','small-engine','atv','general'];

// ---------- utilities ----------

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function loadJSON(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) { return fallback; }
}

function makeId() {
  try {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) {}
  return 'vid-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e9).toString(36);
}

function splitList(v) {
  // "Engine, brakes / electrical" -> ['engine','brakes','electrical']
  return String(v || '').split(/[,\/;]+/).map(function(s){ return s.trim().toLowerCase(); })
    .filter(function(s){ return s.length > 0; });
}

function dedupe(arr) {
  var seen = {}, out = [];
  arr.forEach(function(v){ if (!seen[v]) { seen[v] = true; out.push(v); } });
  return out;
}

// ---------- storage ----------

function getLibrary() {
  var v = loadJSON(LIBRARY_KEY, []);
  return Array.isArray(v) ? v : [];
}

function saveLibrary(list) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(list));
}

function isVideosEnabled() {
  try {
    var v = localStorage.getItem(ENABLED_KEY);
    return v === null ? true : v !== 'false'; // default true when never set
  } catch (e) { return true; }
}

function setVideosEnabled(on) {
  localStorage.setItem(ENABLED_KEY, on ? 'true' : 'false');
}

// ---------- URL parsing / validation ----------

// Returns { embedKind:'youtube', embedId } or { embedKind:'mp4', src }.
// Throws a plain-language Error when the URL is not usable.
function parseVideoUrl(url) {
  url = String(url || '').trim();
  if (!url) throw new Error('Enter a video URL.');

  // YouTube: watch?v=, youtu.be/, /embed/, /shorts/, /v/, youtube-nocookie embeds
  var m = url.match(/(?:youtube\.com\/(?:watch\?[^#]*?v=|embed\/|shorts\/|v\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{6,})/);
  if (m) return { embedKind: 'youtube', embedId: m[1] };

  // Direct .mp4 file (query strings allowed)
  var path;
  try {
    path = new URL(url).pathname;
  } catch (e) {
    throw new Error('That URL does not look valid. Paste a full YouTube link or a direct .mp4 link.');
  }
  if (/\.mp4$/i.test(path)) return { embedKind: 'mp4', src: url };

  throw new Error('Only YouTube links and direct .mp4 video files are supported. That URL is neither.');
}

// ---------- library CRUD ----------

// addVideo({title, url, tags, vehicleTypes, durationMin, notes, addedBy})
//   tags: array or comma-separated string; vehicleTypes likewise.
// Throws on invalid input; returns the stored entry on success.
function addVideo(input) {
  input = input || {};
  var title = String(input.title || '').trim();
  var url = String(input.url || '').trim();
  if (!title) throw new Error('Give the video a title.');
  if (title.length > 120) throw new Error('Keep the title under 120 characters.');
  if (!url) throw new Error('Enter a video URL.');

  var parsed = parseVideoUrl(url); // throws with a clear message on bad URLs

  var tags = Array.isArray(input.tags) ? input.tags.slice() : splitList(input.tags);
  tags = dedupe(tags.map(function(t){ return String(t).trim().toLowerCase(); })
    .filter(function(t){ return t.length > 0; })).slice(0, 8);

  // Vehicle types keep their display casing; search is case-insensitive anyway.
  var rawVT = Array.isArray(input.vehicleTypes) ? input.vehicleTypes.join(',') : input.vehicleTypes;
  var seenVT = {}, vehicleTypes = [];
  String(rawVT || '').split(/[,\/;]+/).forEach(function(t){
    t = t.trim();
    var k = t.toLowerCase();
    if (t.length > 0 && !seenVT[k]) { seenVT[k] = true; vehicleTypes.push(t); }
  });
  vehicleTypes = vehicleTypes.slice(0, 8);

  var durationMin = 0;
  if (input.durationMin !== undefined && input.durationMin !== null && String(input.durationMin).trim() !== '') {
    durationMin = Number(input.durationMin);
    if (!isFinite(durationMin) || durationMin < 0 || durationMin > 1440)
      throw new Error('Duration must be a number of minutes between 0 and 1440.');
  }

  var entry = {
    id: makeId(),
    title: title,
    url: url,
    embedKind: parsed.embedKind,
    embedId: parsed.embedId || null,
    src: parsed.src || null,
    tags: tags,
    vehicleTypes: vehicleTypes,
    durationMin: Math.round(durationMin),
    notes: String(input.notes || '').trim().slice(0, 500),
    addedBy: String(input.addedBy || '').trim().slice(0, 60),
    addedAt: new Date().toISOString()
  };

  var lib = getLibrary();
  lib.unshift(entry);
  saveLibrary(lib);
  return entry;
}

// deleteVideo(id) — throws if not found; returns the removed entry.
function deleteVideo(id) {
  var lib = getLibrary();
  var idx = lib.findIndex(function(v){ return v.id === id; });
  if (idx === -1) throw new Error('That video is not in the library.');
  var removed = lib.splice(idx, 1)[0];
  saveLibrary(lib);
  return removed;
}

// searchVideos(query, tagFilter)
//   Matches on title / notes / tags / vehicle types, case-insensitive,
//   all query words must appear (AND). tagFilter is an exact tag match.
function searchVideos(query, tagFilter) {
  var q = String(query || '').trim().toLowerCase();
  return getLibrary().filter(function(v){
    var tags = v.tags || [];
    if (tagFilter && tags.indexOf(tagFilter) === -1) return false;
    if (!q) return true;
    var hay = [v.title, v.notes, tags.join(' '), (v.vehicleTypes || []).join(' ')]
      .join(' ').toLowerCase();
    return q.split(/\s+/).every(function(w){ return hay.indexOf(w) !== -1; });
  });
}

// ---------- diagnosis linking ----------

// relatedVideosFor(diagnosis)
//   diagnosis: { category, symptoms, unitInfo, topIssue, resultText } or a plain string.
//   Scores each library video: +3 per system tag found in the diagnosis text,
//   +2 when one of the video's vehicle types appears in the diagnosis text,
//   +1 per long title word found. Only videos with a direct keyword match are
//   returned, sorted best first. Category is informational only — it does not
//   by itself surface unrelated videos.
function relatedVideosFor(diagnosis) {
  var text = '';
  if (typeof diagnosis === 'string') {
    text = diagnosis;
  } else if (diagnosis && typeof diagnosis === 'object') {
    text = [diagnosis.symptoms, diagnosis.unitInfo, diagnosis.topIssue, diagnosis.resultText]
      .filter(Boolean).join(' ');
  }
  text = String(text || '').toLowerCase();
  if (!text.trim()) return [];

  return getLibrary().map(function(v){
    var score = 0;
    (v.tags || []).forEach(function(t){
      var spaced = t.replace(/-/g, ' ');
      if (text.indexOf(t) !== -1 || text.indexOf(spaced) !== -1) score += 3;
    });
    (v.vehicleTypes || []).forEach(function(vt){
      var w = String(vt).toLowerCase().trim();
      if (w.length >= 3 && text.indexOf(w) !== -1) score += 2;
    });
    String(v.title || '').toLowerCase().split(/[^a-z0-9]+/).forEach(function(w){
      if (w.length >= 4 && text.indexOf(w) !== -1) score += 1;
    });
    return { video: v, score: score };
  })
  .filter(function(x){ return x.score > 0; })
  .sort(function(a, b){ return b.score - a.score; })
  .map(function(x){ return x.video; });
}

// ---------- rendering ----------

function tagChips(tags) {
  return (tags || []).map(function(t){ return '<span class="rv-chip">' + esc(t) + '</span>'; }).join('');
}

function embedHtml(v) {
  if (v.embedKind === 'youtube') {
    return '<iframe width="100%" height="220" src="https://www.youtube-nocookie.com/embed/' + esc(v.embedId) + '"' +
      ' title="' + esc(v.title) + '" frameborder="0" loading="lazy"' +
      ' allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
  }
  return '<video controls preload="none" src="' + esc(v.src) + '" style="width:100%;max-height:260px"></video>';
}

function videoCard(v, opts) {
  opts = opts || {};
  var dur = (v.durationMin && v.durationMin > 0) ? ' · ' + v.durationMin + ' min' : '';
  var vt = (v.vehicleTypes && v.vehicleTypes.length) ? ' · ' + esc(v.vehicleTypes.join(', ')) : '';
  return '<div class="rv-video-card" data-video-id="' + esc(v.id) + '">' +
    '<div class="part-name">' + esc(v.title) + '</div>' +
    '<div class="small" style="margin:4px 0">' + tagChips(v.tags) + vt + dur + '</div>' +
    (v.notes ? '<div class="small">' + esc(v.notes) + '</div>' : '') +
    '<div class="rv-card-actions">' +
      '<button class="secondary-btn" data-video-play="' + esc(v.id) + '">▶ Play</button>' +
      (opts.showDelete === false ? '' : '<button class="secondary-btn" data-video-del="' + esc(v.id) + '">Delete</button>') +
    '</div>' +
    '<div class="rv-embed" data-video-embed="' + esc(v.id) + '" hidden></div>' +
  '</div>';
}

var searchState = { query: '', tag: '' };

function renderVideoList() {
  var box = document.getElementById('rvList');
  if (!box) return;
  var results = searchVideos(searchState.query, searchState.tag);
  if (!results.length) {
    box.innerHTML = getLibrary().length
      ? '<p class="muted">No videos match that search.</p>'
      : '<p class="muted">No videos yet. Add the first one above — paste a YouTube link or an .mp4 URL.</p>';
    return;
  }
  box.innerHTML = '<p class="small muted">' + results.length + ' video' + (results.length === 1 ? '' : 's') + '</p>' +
    results.map(function(v){ return videoCard(v); }).join('');
}

function renderVideoLibrary() {
  var host = document.getElementById('videosContainer');
  if (!host) return;
  var chips = [''].concat(PRESET_TAGS).map(function(t){
    return '<button class="rv-tag ' + (searchState.tag === t ? 'rv-tag-on' : '') + '" data-rv-tag="' + esc(t) + '">' +
      esc(t === '' ? 'All' : t) + '</button>';
  }).join('');
  var tagChecks = PRESET_TAGS.map(function(t){
    return '<label class="rv-tag rv-tag-check"><input type="checkbox" class="rv-tag-input" value="' + esc(t) + '"> ' + esc(t) + '</label>';
  }).join('');
  host.innerHTML =
    '<label class="rv-toggle"><input type="checkbox" id="rvEnabled" ' + (isVideosEnabled() ? 'checked' : '') + '> ' +
    'Video library enabled</label>' +
    '<div class="input-group"><label>Search videos</label>' +
    '<input type="text" id="rvSearch" placeholder="Search title, notes, tags, vehicles…" value="' + esc(searchState.query) + '"></div>' +
    '<div class="rv-tags">' + chips + '</div>' +
    '<h3>Add video</h3>' +
    '<div class="input-group"><label>Title</label>' +
    '<input type="text" id="rvTitle" placeholder="e.g. Replace front brake pads — Silverado" maxlength="120"></div>' +
    '<div class="input-group"><label>Video URL</label>' +
    '<input type="url" id="rvUrl" placeholder="YouTube link or direct .mp4 link"></div>' +
    '<div class="input-group"><label>Systems (check any)</label>' +
    '<div class="rv-tags">' + tagChecks + '</div></div>' +
    '<div class="input-group"><label>Vehicles <small>(optional — comma separated)</small></label>' +
    '<input type="text" id="rvVehicles" placeholder="e.g. Chevy Silverado, Ford F-150"></div>' +
    '<div class="input-group"><label>Duration (minutes, optional)</label>' +
    '<input type="number" id="rvDuration" min="0" max="1440" placeholder="e.g. 12"></div>' +
    '<div class="input-group"><label>Notes <small>(optional)</small></label>' +
    '<textarea id="rvNotes" rows="2" placeholder="Anything useful — tools needed, gotchas…"></textarea></div>' +
    '<p id="rvFormError" class="error" hidden></p>' +
    '<button id="rvAddBtn" class="primary-btn">Add Video</button>' +
    '<h3>Library</h3>' +
    '<div id="rvList"></div>';

  // Search (re-render list only so typing keeps focus)
  document.getElementById('rvSearch').addEventListener('input', function(e){
    searchState.query = e.target.value;
    renderVideoList();
  });

  // Tag filter chips
  host.querySelectorAll('[data-rv-tag]').forEach(function(btn){
    btn.addEventListener('click', function(){
      searchState.tag = btn.getAttribute('data-rv-tag');
      host.querySelectorAll('[data-rv-tag]').forEach(function(b){
        b.classList.toggle('rv-tag-on', b.getAttribute('data-rv-tag') === searchState.tag);
      });
      renderVideoList();
    });
  });

  // Enable/disable toggle
  document.getElementById('rvEnabled').addEventListener('change', function(e){
    setVideosEnabled(e.target.checked);
    refreshHomeCardVisibility();
    maybeInjectRelated();
  });

  // Add video
  document.getElementById('rvAddBtn').addEventListener('click', function(){
    var errBox = document.getElementById('rvFormError');
    errBox.hidden = true;
    var tags = [];
    host.querySelectorAll('.rv-tag-input:checked').forEach(function(cb){ tags.push(cb.value); });
    try {
      addVideo({
        title: document.getElementById('rvTitle').value,
        url: document.getElementById('rvUrl').value,
        tags: tags,
        vehicleTypes: document.getElementById('rvVehicles').value,
        durationMin: document.getElementById('rvDuration').value,
        notes: document.getElementById('rvNotes').value
      });
      document.getElementById('rvTitle').value = '';
      document.getElementById('rvUrl').value = '';
      document.getElementById('rvVehicles').value = '';
      document.getElementById('rvDuration').value = '';
      document.getElementById('rvNotes').value = '';
      host.querySelectorAll('.rv-tag-input:checked').forEach(function(cb){ cb.checked = false; });
      searchState.query = '';
      searchState.tag = '';
      renderVideoLibrary();
    } catch (err) {
      errBox.textContent = err && err.message ? err.message : String(err);
      errBox.hidden = false;
    }
  });

  // Play / Delete (delegated so list re-renders keep working;
  // wired once — the container element itself survives re-renders)
  if (!host.dataset.rvListWired) {
    host.dataset.rvListWired = '1';
    host.addEventListener('click', function(e){
      var playBtn = e.target.closest('[data-video-play]');
      var delBtn = e.target.closest('[data-video-del]');
      if (playBtn) {
        var id = playBtn.getAttribute('data-video-play');
        var lib = getLibrary();
        var v = null;
        for (var i = 0; i < lib.length; i++) { if (lib[i].id === id) { v = lib[i]; break; } }
        var embedBox = host.querySelector('[data-video-embed="' + id + '"]');
        if (v && embedBox) {
          if (embedBox.hidden) {
            embedBox.innerHTML = embedHtml(v);
            embedBox.hidden = false;
            playBtn.textContent = '⏸ Hide';
          } else {
            embedBox.innerHTML = '';
            embedBox.hidden = true;
            playBtn.textContent = '▶ Play';
          }
        }
        return;
      }
      if (delBtn) {
        var delId = delBtn.getAttribute('data-video-del');
        var lib2 = getLibrary();
        var v2 = null;
        for (var j = 0; j < lib2.length; j++) { if (lib2[j].id === delId) { v2 = lib2[j]; break; } }
        if (v2 && confirm('Delete "' + v2.title + '" from the video library?')) {
          deleteVideo(delId);
          renderVideoLibrary();
        }
      }
    });
  }

  renderVideoList();
}

// ---------- home screen entry + video screen ----------

function localShowScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function refreshHomeCardVisibility() {
  var card = document.getElementById('goVideos');
  if (card) card.style.display = isVideosEnabled() ? '' : 'none';
}

function addVideosScreen() {
  var main = document.getElementById('main');
  if (!main) return;

  // Preferred: the screen + home card are static markup in index.html
  // (real wiring into the app's navigation structure). Fallback: inject them
  // here so the module still works if the markup is missing (portability).
  if (!document.getElementById('videosScreen')) {
    var screen = document.createElement('section');
    screen.id = 'videosScreen';
    screen.className = 'screen';
    screen.innerHTML = '<button class="back-btn" id="backToHomeFromVideos">← Home</button>' +
      '<h2>📹 Repair Videos</h2>' +
      '<p class="muted">How-to videos you can link to diagnoses. Stored on this phone.</p>' +
      '<div id="videosContainer"></div>';
    main.appendChild(screen);
  }

  var grid = document.querySelector('#homeScreen .category-grid');
  if (grid && !document.getElementById('goVideos')) {
    var btn = document.createElement('button');
    btn.className = 'category-card';
    btn.id = 'goVideos';
    btn.innerHTML = '<span class="cat-icon">📹</span><span class="cat-label">Repair Videos</span>' +
      '<small>How-to video library</small>';
    grid.appendChild(btn);
  }

  var backBtn = document.getElementById('backToHomeFromVideos');
  var goBtn = document.getElementById('goVideos');
  if (backBtn && !backBtn.dataset.rvWired) {
    backBtn.dataset.rvWired = '1';
    backBtn.addEventListener('click', function(){ localShowScreen('homeScreen'); });
  }
  if (goBtn && !goBtn.dataset.rvWired) {
    goBtn.dataset.rvWired = '1';
    goBtn.addEventListener('click', function(){
      renderVideoLibrary();
      localShowScreen('videosScreen');
    });
  }
  refreshHomeCardVisibility();
}

// ---------- diagnosis result hook ----------

function getLatestLogEntry() {
  var log = loadJSON(LOG_KEY, []);
  return (Array.isArray(log) && log.length) ? log[0] : null;
}

function removeRelatedBlock() {
  var b = document.getElementById('relatedVideosBlock');
  if (b && b.parentNode) b.parentNode.removeChild(b);
}

function maybeInjectRelated() {
  removeRelatedBlock();
  if (!isVideosEnabled()) return;
  var target = document.getElementById('diagnosisResult');
  if (!target || target.hidden || !target.innerHTML.trim()) return;

  var entry = getLatestLogEntry();
  var renderedText = '';
  ['issuesList', 'checksList', 'fixPlan'].forEach(function(id){
    var el = document.getElementById(id);
    if (el && el.textContent) renderedText += ' ' + el.textContent;
  });

  var matches = relatedVideosFor({
    category: entry && entry.category,
    symptoms: entry && entry.symptoms,
    unitInfo: entry && entry.unitInfo,
    topIssue: entry && entry.topIssue,
    resultText: renderedText
  });
  if (!matches.length) return;

  var block = document.createElement('div');
  block.id = 'relatedVideosBlock';
  block.innerHTML = '<h2>Related Videos</h2>' +
    matches.slice(0, 5).map(function(v){ return videoCard(v, { showDelete: false }); }).join('');

  block.addEventListener('click', function(e){
    var playBtn = e.target.closest('[data-video-play]');
    if (!playBtn) return;
    var id = playBtn.getAttribute('data-video-play');
    var lib = getLibrary();
    var v = null;
    for (var i = 0; i < lib.length; i++) { if (lib[i].id === id) { v = lib[i]; break; } }
    var embedBox = block.querySelector('[data-video-embed="' + id + '"]');
    if (v && embedBox) {
      if (embedBox.hidden) {
        embedBox.innerHTML = embedHtml(v);
        embedBox.hidden = false;
        playBtn.textContent = '⏸ Hide';
      } else {
        embedBox.innerHTML = '';
        embedBox.hidden = true;
        playBtn.textContent = '▶ Play';
      }
    }
  });

  var anchor = document.getElementById('newDiagnosisBtn');
  target.insertBefore(block, anchor || null);
}

function hookDiagnosisResults() {
  var target = document.getElementById('diagnosisResult');
  if (!target || !window.MutationObserver) return;
  var pending = false;
  var obs = new MutationObserver(function(muts){
    // Ignore our own block's mutations (play/pause expands embeds there);
    // only react to real diagnosis renders by app.js.
    var external = muts.some(function(m){
      var t = m.target;
      return !(t && t.closest && t.closest('#relatedVideosBlock'));
    });
    if (!external || pending) return;
    pending = true;
    setTimeout(function(){
      pending = false;
      maybeInjectRelated();
    }, 50);
  });
  obs.observe(target, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
}

// ---------- minimal styles (keep small; main app css owns the rest) ----------

function injectStyles() {
  if (document.getElementById('rvStyles')) return;
  var st = document.createElement('style');
  st.id = 'rvStyles';
  st.textContent = [
    '.rv-video-card{background:#1a3a24;border-radius:8px;padding:12px;margin-bottom:8px}',
    '.rv-card-actions{display:flex;gap:8px;margin-top:8px}',
    '.rv-chip{display:inline-block;background:#0f2f18;border:1px solid #2e7d32;border-radius:999px;padding:2px 10px;font-size:.8rem;margin:2px 4px 2px 0;color:#a5d6a7}',
    '.rv-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}',
    '.rv-tag{background:#0f2f18;border:1px solid #2e7d32;border-radius:999px;padding:6px 12px;font-size:.85rem;color:#fff;cursor:pointer}',
    '.rv-tag-on{background:#2e7d32;border-color:#81c784}',
    '.rv-tag-check{cursor:pointer}',
    '.rv-tag-check input{margin-right:4px;accent-color:#2e7d32}',
    '.rv-embed{margin-top:8px}',
    '.rv-embed iframe{border-radius:8px;border:none}',
    '.rv-toggle{display:flex;align-items:center;gap:8px;margin-bottom:16px;cursor:pointer}',
    '.rv-toggle input{width:20px;height:20px;accent-color:#2e7d32}',
    '#relatedVideosBlock{margin-top:20px}'
  ].join('\n');
  document.head.appendChild(st);
}

// ---------- init ----------

function init() {
  injectStyles();
  addVideosScreen();
  hookDiagnosisResults();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ---------- public API ----------
window.H38RepairVideos = {
  BUILD: '20261004-repair-videos-1',
  getLibrary: getLibrary,
  saveLibrary: saveLibrary,
  addVideo: addVideo,
  deleteVideo: deleteVideo,
  searchVideos: searchVideos,
  relatedVideosFor: relatedVideosFor,
  parseVideoUrl: parseVideoUrl,
  isVideosEnabled: isVideosEnabled,
  setVideosEnabled: setVideosEnabled,
  renderVideoLibrary: renderVideoLibrary,
  PRESET_TAGS: PRESET_TAGS
};

})();
