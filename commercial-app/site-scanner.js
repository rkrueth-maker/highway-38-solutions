(function () {
  'use strict';

  const BUILD = '20260806-0344';
  const FUNCTION_NAME = 'h38-site-scanner';
  const STORAGE_BUCKET = 'business-office-files';
  const SESSION_COLLECTION = 'siteCaptureSessions';
  const ENTITY_COLLECTION = 'siteSpatialEntities';
  const MEASUREMENT_COLLECTION = 'siteMeasurements';
  const OUTPUT_COLLECTION = 'siteGeometryOutputs';
  const REVIEW_COLLECTION = 'siteAiReviews';
  const SOURCE_VALUES = [
    'MANUAL_ENTRY','MANUAL_LASER','BLUETOOTH_LASER','ARCORE_DEPTH',
    'ARCORE_POINT_TO_POINT','LIDAR_ROOM','LIDAR_MESH','CALCULATED',
    'IMPORTED','CAMERA_ESTIMATE'
  ];
  const VERIFICATION_VALUES = [
    'UNVERIFIED','DEVICE_CAPTURED','FIELD_MEASURED','FIELD_MEASURED_AND_CHECKED',
    'CALCULATED_FROM_VERIFIED','CONFLICT_REVIEW_REQUIRED','NEEDS_REMEASUREMENT'
  ];
  const LOCKED_QUOTE_STATES = ['PRESENTED','ACCEPTED','CONVERTED','VOIDED','DECLINED','EXPIRED'];
  const PROJECT_TYPES = [
    'Interior room','Garage or shop','Exterior wall','Yard or landscape area',
    'Patio or concrete','Fence or linear run','Building exterior','Custom work area'
  ];

  const scanner = {
    activeSessionId: '',
    returnPage: 'measure',
    projectType: 'Custom work area',
    captureMode: 'CAMERA_GUIDED',
    transcript: '',
    mediaRecorder: null,
    mediaStream: null,
    mediaChunks: [],
    speechRecognition: null,
    referenceUrl: '',
    selectedPoints: [],
    geometry: null,
    aiReview: null,
    generated: {},
    nativeCapabilities: null
  };

  const text = value => String(value == null ? '' : value);
  const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const timestamp = () => new Date().toISOString();
  const id = prefix => typeof window.newId === 'function'
    ? window.newId(prefix)
    : `${prefix}-${crypto.randomUUID()}`;
  const html = value => typeof window.esc === 'function'
    ? window.esc(value)
    : text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const byId = value => document.getElementById(value);
  const rows = collection => Array.isArray(window.state?.snapshot?.[collection])
    ? window.state.snapshot[collection]
    : [];
  const value = (row, ...keys) => {
    for (const key of keys) {
      if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    return '';
  };
  const recordId = (row, ...keys) => text(value(row, ...keys));
  const currentQuote = () => {
    const quoteId = text(window.state?.quote?.quoteId);
    return rows('quotes').find(row => recordId(row, 'Quote ID', 'quoteId') === quoteId) || {};
  };
  const currentCustomerId = () => text(
    window.state?.quote?.customerId || value(currentQuote(), 'Customer ID', 'customerId')
  );
  const currentProjectTitle = () => text(
    window.state?.quote?.projectTitle || value(currentQuote(), 'Project Title', 'projectTitle') || 'Site capture'
  );
  const currentUserId = () => text(
    window.H38_SUPABASE_AUTH?.getState?.().userId || window.state?.snapshot?.user?.userId
  );

  function safeToast(message, bad) {
    if (typeof window.toast === 'function') window.toast(message, !!bad);
    else console[bad ? 'error' : 'log'](message);
  }

  function quoteLocked(row = currentQuote()) {
    const status = text(value(row, 'Status', 'status')).toUpperCase();
    return LOCKED_QUOTE_STATES.some(item => status.includes(item));
  }

  function sessionRows() {
    const quoteId = text(window.state?.quote?.quoteId);
    return rows(SESSION_COLLECTION)
      .filter(row => !quoteId || text(value(row, 'Quote ID', 'quoteId')) === quoteId)
      .sort((a,b) => text(value(b,'Updated Time','updatedAt')).localeCompare(text(value(a,'Updated Time','updatedAt'))));
  }
  function measurementRows(sessionId = scanner.activeSessionId) {
    return rows(MEASUREMENT_COLLECTION)
      .filter(row => text(value(row,'Capture Session ID','captureSessionId')) === text(sessionId))
      .sort((a,b) => number(value(a,'Sequence','sequence')) - number(value(b,'Sequence','sequence')));
  }
  function entityRows(sessionId = scanner.activeSessionId) {
    return rows(ENTITY_COLLECTION)
      .filter(row => text(value(row,'Capture Session ID','captureSessionId')) === text(sessionId));
  }
  function reviewRows(sessionId = scanner.activeSessionId) {
    return rows(REVIEW_COLLECTION)
      .filter(row => text(value(row,'Capture Session ID','captureSessionId')) === text(sessionId))
      .sort((a,b) => text(value(b,'Created Time','createdAt')).localeCompare(text(value(a,'Created Time','createdAt'))));
  }

  async function saveRecord(collection, type, key, record, idKeys) {
    if (!window.state?.businessId) throw new Error('Open an active business before saving scanner data.');
    if (typeof window.queueOperation !== 'function') throw new Error('The secure Supabase save queue is unavailable.');
    const optimistic = { collection, record, idKeys };
    await window.queueOperation(
      'SAVE_ENTITY',
      type,
      key,
      { entity: collection, record },
      optimistic,
      false
    );
    if (window.state?.snapshot) {
      if (!Array.isArray(window.state.snapshot[collection])) window.state.snapshot[collection] = [];
      const index = window.state.snapshot[collection].findIndex(row => idKeys.some(k => text(row?.[k]) === text(key)));
      if (index >= 0) window.state.snapshot[collection][index] = record;
      else window.state.snapshot[collection].unshift(record);
    }
    if (typeof window.sync === 'function' && navigator.onLine) {
      try { await window.sync(false); } catch (_) {}
    }
    return record;
  }

  function detectedCaptureMode() {
    const native = window.H38NativeScanner;
    const ua = navigator.userAgent || '';
    if (native && typeof native.getCapabilities === 'function') {
      try {
        const capabilities = native.getCapabilities();
        scanner.nativeCapabilities = capabilities;
        if (capabilities?.lidar || capabilities?.roomPlan) return 'LIDAR_PRECISION';
        if (capabilities?.arcore || capabilities?.depth) return 'ANDROID_DEPTH';
      } catch (_) {}
    }
    if (/iPhone|iPad|iPod/i.test(ua)) return 'CAMERA_GUIDED';
    if (/Android/i.test(ua)) return 'CAMERA_GUIDED';
    return 'CAMERA_GUIDED';
  }

  function captureModeLabel(mode) {
    return ({
      LIDAR_PRECISION:'LiDAR Precision Scan',
      ANDROID_DEPTH:'Android Depth Scan',
      CAMERA_GUIDED:'Camera-Guided Measure',
      GUIDED_LASER:'Guided Laser Measure'
    })[mode] || 'Camera-Guided Measure';
  }

  function sourceDefaultVerification(source) {
    if (source === 'MANUAL_LASER' || source === 'BLUETOOTH_LASER') return 'FIELD_MEASURED';
    if (source.startsWith('ARCORE_') || source.startsWith('LIDAR_')) return 'DEVICE_CAPTURED';
    if (source === 'CALCULATED') return 'UNVERIFIED';
    return 'UNVERIFIED';
  }

  function normalizeVerification(source, verification) {
    let result = VERIFICATION_VALUES.includes(verification) ? verification : sourceDefaultVerification(source);
    if ((source.startsWith('ARCORE_') || source.startsWith('LIDAR_') || source === 'CAMERA_ESTIMATE') &&
        ['FIELD_MEASURED','FIELD_MEASURED_AND_CHECKED'].includes(result)) {
      result = 'DEVICE_CAPTURED';
    }
    if (source === 'CALCULATED' && result === 'FIELD_MEASURED') result = 'UNVERIFIED';
    return result;
  }

  function sessionRecord(sessionId, changes = {}) {
    const existing = rows(SESSION_COLLECTION).find(row => recordId(row,'Capture Session ID','captureSessionId') === sessionId) || {};
    const now = timestamp();
    return Object.assign({
      'Capture Session ID': sessionId,
      'Business ID': window.state.businessId,
      'Customer ID': currentCustomerId(),
      'Quote ID': text(window.state.quote?.quoteId),
      'Quote Revision': number(value(currentQuote(),'Revision','revision') || window.state.quote?.revision || 1),
      'User ID': currentUserId(),
      'Project Type': scanner.projectType,
      'Project Title': currentProjectTitle(),
      'Capture Mode': scanner.captureMode,
      'Device Details': {
        userAgent: navigator.userAgent,
        platform: navigator.platform || '',
        nativeCapabilities: scanner.nativeCapabilities || null
      },
      'Started Time': now,
      'Completed Time': '',
      'Status': 'IN_PROGRESS',
      'Processing Status': 'NOT_STARTED',
      'Review Status': 'DRAFT_INTERNAL_ONLY',
      'Transcript': scanner.transcript,
      'Source Confidence Rule': 'Every measurement retains source, confidence, and verification status.',
      'Automatic Approval': false,
      'Automatic Customer Sending': false,
      'Created Time': now,
      'Updated Time': now,
      'Record Version': 1
    }, existing, changes, {'Updated Time': now});
  }

  async function createSession() {
    const quoteId = text(window.state?.quote?.quoteId);
    if (!quoteId) throw new Error('Save or open a quote before starting H38 Site Scanner.');
    if (quoteLocked()) throw new Error('This quote revision is locked. Duplicate or revise it before creating new scanner outputs.');
    scanner.projectType = byId('scannerProjectType')?.value || scanner.projectType;
    scanner.captureMode = byId('scannerCaptureMode')?.value || detectedCaptureMode();
    const sessionId = id('SCAN');
    scanner.activeSessionId = sessionId;
    const record = sessionRecord(sessionId);
    await saveRecord(SESSION_COLLECTION,'Site Capture Session',sessionId,record,['Capture Session ID','captureSessionId']);
    safeToast('Site Scanner session started. Nothing is approved or sent.');
    renderScanner();
  }

  async function resumeSession(sessionId) {
    const row = rows(SESSION_COLLECTION).find(item => recordId(item,'Capture Session ID','captureSessionId') === sessionId);
    if (!row) return;
    scanner.activeSessionId = sessionId;
    scanner.projectType = text(value(row,'Project Type','projectType')) || 'Custom work area';
    scanner.captureMode = text(value(row,'Capture Mode','captureMode')) || detectedCaptureMode();
    scanner.transcript = text(value(row,'Transcript','transcript'));
    scanner.aiReview = reviewRows(sessionId)[0] || null;
    scanner.geometry = buildGeometry(measurementRows(sessionId));
    renderScanner();
  }

  function openScanner(returnPage) {
    scanner.returnPage = returnPage || window.state?.page || 'measure';
    scanner.captureMode = detectedCaptureMode();
    scanner.activeSessionId = sessionRows()[0] ? recordId(sessionRows()[0],'Capture Session ID','captureSessionId') : '';
    if (scanner.activeSessionId) {
      const active = sessionRows()[0];
      scanner.projectType = text(value(active,'Project Type','projectType')) || scanner.projectType;
      scanner.captureMode = text(value(active,'Capture Mode','captureMode')) || scanner.captureMode;
      scanner.transcript = text(value(active,'Transcript','transcript'));
      scanner.aiReview = reviewRows(scanner.activeSessionId)[0] || null;
      scanner.geometry = buildGeometry(measurementRows(scanner.activeSessionId));
    }
    renderScanner();
  }

  function pageHeader() {
    const backTarget = scanner.returnPage === 'quotes' ? 'Quote Builder' : 'Measure';
    return `<section class="page-head"><div><h1>H38 Site Scanner</h1><p>Capture the project once, confirm important measurements, and create quote-ready drawings without claiming false certainty.</p></div><div class="page-tools"><button id="scannerBack" class="secondary" type="button">← ${html(backTarget)}</button></div></section>`;
  }

  function modeOptions() {
    const modes = ['LIDAR_PRECISION','ANDROID_DEPTH','CAMERA_GUIDED','GUIDED_LASER'];
    return modes.map(mode => `<option value="${mode}" ${mode===scanner.captureMode?'selected':''}>${captureModeLabel(mode)}</option>`).join('');
  }

  function projectOptions() {
    return PROJECT_TYPES.map(item => `<option ${item===scanner.projectType?'selected':''}>${html(item)}</option>`).join('');
  }

  function sessionListMarkup() {
    const list = sessionRows().slice(0,20);
    return list.length ? list.map(row => {
      const sessionId = recordId(row,'Capture Session ID','captureSessionId');
      return `<button type="button" class="scanner-session-row ${sessionId===scanner.activeSessionId?'active':''}" data-session-id="${html(sessionId)}">
        <strong>${html(value(row,'Project Type','projectType'))}</strong>
        <span>${html(captureModeLabel(text(value(row,'Capture Mode','captureMode'))))}</span>
        <small>${html(text(value(row,'Status','status')))} · ${html(text(value(row,'Started Time','startedAt')).slice(0,16).replace('T',' '))}</small>
      </button>`;
    }).join('') : '<div class="empty">No scanner sessions for this quote yet.</div>';
  }

  function measurementMarkup() {
    const list = measurementRows();
    if (!list.length) return '<div class="empty">No measurements yet. Tap two image points or enter coordinates and a field dimension.</div>';
    return list.map(row => {
      const source = text(value(row,'Source','source'));
      const verify = text(value(row,'Verification Status','verificationStatus'));
      const warning = ['CONFLICT_REVIEW_REQUIRED','NEEDS_REMEASUREMENT','UNVERIFIED'].includes(verify);
      return `<div class="scanner-measure-row ${warning?'warning':''}">
        <div><strong>${html(value(row,'Label','label'))}</strong><small>${html(value(row,'Value','value'))} ${html(value(row,'Unit','unit'))} · ${html(source)}</small></div>
        <div><span class="pill">${html(verify)}</span><small>${Math.round(number(value(row,'Confidence','confidence'))*100)}% confidence</small></div>
      </div>`;
    }).join('');
  }

  function aiMarkup() {
    const review = scanner.aiReview || reviewRows()[0];
    if (!review) return '<div class="empty">Run AI site review after adding photos, narration, and measurements.</div>';
    const objects = value(review,'Detected Objects','detectedObjects') || [];
    const work = value(review,'Work Areas','workAreas') || [];
    const missing = value(review,'Missing Measurements','missingMeasurements') || [];
    const assumptions = value(review,'Assumptions','assumptions') || [];
    return `<div class="scanner-ai-result">
      <h3>Detected site context</h3>
      <ul>${objects.map(item=>`<li>${html(typeof item==='string'?item:item.label||item.type||JSON.stringify(item))}</li>`).join('') || '<li>No objects returned.</li>'}</ul>
      <h3>Work areas</h3>
      <ul>${work.map(item=>`<li>${html(typeof item==='string'?item:item.label||item.description||JSON.stringify(item))}</li>`).join('') || '<li>No work areas returned.</li>'}</ul>
      <h3>Targeted follow-up</h3>
      <ul>${missing.map(item=>`<li>${html(typeof item==='string'?item:item.request||item.label||JSON.stringify(item))}</li>`).join('') || '<li>No additional measurement request returned.</li>'}</ul>
      ${assumptions.length?`<div class="notice warn"><strong>Assumptions:</strong> ${assumptions.map(item=>html(item)).join('; ')}</div>`:''}
    </div>`;
  }

  function geometryMarkup() {
    const geometry = scanner.geometry || buildGeometry(measurementRows());
    if (!geometry || !geometry.segments.length) return '<div class="empty">Add coordinate-linked measurements to create deterministic geometry.</div>';
    const conflicts = geometry.conflicts.length;
    return `<div class="scanner-geometry-summary">
      <div><strong>${geometry.segments.length}</strong><span>segments</span></div>
      <div><strong>${formatNumber(geometry.perimeter)}</strong><span>perimeter units</span></div>
      <div><strong>${formatNumber(geometry.area)}</strong><span>square units</span></div>
      <div class="${conflicts?'bad':''}"><strong>${conflicts}</strong><span>conflicts</span></div>
    </div>
    ${geometry.closed?'<div class="notice">Boundary closes within tolerance.</div>':'<div class="notice warn">Boundary is open or lacks enough coordinate-linked segments.</div>'}
    ${geometry.conflicts.map(item=>`<div class="notice warn">${html(item)}</div>`).join('')}
    <div class="scanner-svg-preview">${geometry.svg}</div>`;
  }

  function renderScanner() {
    const main = byId('mainContent');
    if (!main) return;
    const hasSession = !!scanner.activeSessionId;
    main.innerHTML = pageHeader() + `<div class="scanner-layout">
      <aside class="card scanner-sidebar">
        <h2>Quote context</h2>
        <div class="scanner-context"><strong>${html(currentProjectTitle())}</strong><small>${html(text(value(currentQuote(),'Quote Number','quoteNumber')||window.state?.quote?.quoteNumber||window.state?.quote?.quoteId))}</small></div>
        <label>Project type</label>
        <select id="scannerProjectType">${projectOptions()}</select>
        <label>Best capture method</label>
        <select id="scannerCaptureMode">${modeOptions()}</select>
        <div class="actions"><button id="scannerNewSession" type="button">Start Scan</button></div>
        <h2>Sessions</h2>
        <div class="scanner-session-list">${sessionListMarkup()}</div>
      </aside>
      <section class="scanner-main">
        ${hasSession ? activeSessionMarkup() : `<section class="card"><h2>Start a site capture</h2><p>Choose the project type. The scanner will use a native AR/LiDAR bridge when installed, otherwise it provides camera-guided and laser-assisted measuring.</p><div class="notice">Scanner outputs remain private internal drafts until you explicitly attach reviewed results to the quote.</div></section>`}
      </section>
    </div>`;
    bindScanner();
  }

  function activeSessionMarkup() {
    const row = rows(SESSION_COLLECTION).find(item=>recordId(item,'Capture Session ID','captureSessionId')===scanner.activeSessionId) || {};
    return `<section class="card scanner-status-card">
      <div><h2>${html(value(row,'Project Type','projectType'))}</h2><p>${html(captureModeLabel(text(value(row,'Capture Mode','captureMode'))))}</p></div>
      <div><span class="pill">${html(value(row,'Status','status'))}</span><small>${html(scanner.activeSessionId)}</small></div>
    </section>
    <section class="card">
      <h2>1. Capture photos and narrated walkthrough</h2>
      <div class="scanner-capture-actions">
        <button id="scannerNativeCapture" type="button">📐 Start Best Device Scan</button>
        <button id="scannerPhotoButton" class="secondary" type="button">📷 Add Site Photo</button>
        <button id="scannerVideoButton" class="secondary" type="button">🎥 Record Walkthrough</button>
        <input id="scannerPhotoInput" class="hidden" type="file" accept="image/*" capture="environment" multiple>
      </div>
      <div id="scannerVideoStatus" class="muted">Video and narration have not started.</div>
      <label>Narration / field notes</label>
      <textarea id="scannerTranscript" placeholder="Describe walls, openings, removals, customer requests, obstacles, clearances, and work areas.">${html(scanner.transcript)}</textarea>
      <div class="actions"><button id="scannerSaveTranscript" class="secondary" type="button">Save narration</button></div>
      <div id="scannerReferenceWrap" class="scanner-reference ${scanner.referenceUrl?'':'hidden'}">
        <img id="scannerReferenceImage" src="${html(scanner.referenceUrl)}" alt="Selected site reference">
        <svg id="scannerPointOverlay" viewBox="0 0 1000 1000" preserveAspectRatio="none"></svg>
        <small>Tap two points to assign endpoints for the next measurement.</small>
      </div>
    </section>
    <section class="card">
      <h2>2. Add or verify measurements</h2>
      <form id="scannerMeasurementForm">
        <div class="three">
          <div><label>Label</label><input name="label" required placeholder="North wall"></div>
          <div><label>Value</label><input name="measurementValue" type="number" min="0.0001" step="0.0001" required></div>
          <div><label>Unit</label><select name="unit"><option>ft</option><option>in</option><option>m</option><option>cm</option><option>yd</option></select></div>
        </div>
        <div class="three">
          <div><label>Source</label><select name="source">${SOURCE_VALUES.map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div><label>Verification</label><select name="verification">${VERIFICATION_VALUES.map(s=>`<option>${s}</option>`).join('')}</select></div>
          <div><label>Confidence (0–1)</label><input name="confidence" type="number" min="0" max="1" step="0.01" value="1"></div>
        </div>
        <div class="four">
          <div><label>Start X</label><input name="startX" type="number" step="0.001"></div>
          <div><label>Start Y</label><input name="startY" type="number" step="0.001"></div>
          <div><label>End X</label><input name="endX" type="number" step="0.001"></div>
          <div><label>End Y</label><input name="endY" type="number" step="0.001"></div>
        </div>
        <label>Notes</label><input name="notes" placeholder="Laser endpoints, frame, assumption, or reason for check">
        <div class="actions"><button type="submit">Save Measurement</button><button id="scannerLaserMode" class="secondary" type="button">Guided Laser</button></div>
      </form>
      <div class="scanner-measure-list">${measurementMarkup()}</div>
    </section>
    <section class="card">
      <h2>3. AI site review</h2>
      <p class="muted">AI analyzes private site photos, narration, and measurements through the authenticated server function. It may identify objects and missing information but may not invent exact dimensions.</p>
      <div class="actions"><button id="scannerAiReview" type="button">✨ Run AI Site Review</button></div>
      <div id="scannerAiResults">${aiMarkup()}</div>
    </section>
    <section class="card">
      <h2>4. Deterministic geometry and drawings</h2>
      <div class="actions"><button id="scannerGenerate" type="button">Generate Drawing</button><button id="scannerExportSvg" class="secondary" type="button">Attach SVG</button><button id="scannerExportPng" class="secondary" type="button">Attach PNG</button><button id="scannerExportPdf" class="secondary" type="button">Attach PDF</button></div>
      <div id="scannerGeometry">${geometryMarkup()}</div>
    </section>
    <section class="card">
      <h2>5. Review and attach to quote</h2>
      <div class="notice warn">No scan, AI result, quantity, drawing, or visualization is automatically approved, presented, or sent. Locked quotes remain read-only.</div>
      <div class="actions"><button id="scannerComplete" class="secondary" type="button">Mark Capture Complete</button><button id="scannerAttachQuote" type="button">Attach Reviewed Outputs to Draft Quote</button></div>
    </section>`;
  }

  function bindScanner() {
    byId('scannerBack')?.addEventListener('click', () => {
      if (scanner.returnPage === 'quotes' && typeof window.renderQuotes === 'function') window.renderQuotes();
      else if (typeof window.renderMeasure === 'function') window.renderMeasure();
    });
    byId('scannerNewSession')?.addEventListener('click', () => createSession().catch(error=>safeToast(error.message,true)));
    document.querySelectorAll('[data-session-id]').forEach(button => button.addEventListener('click',()=>resumeSession(button.dataset.sessionId)));
    byId('scannerProjectType')?.addEventListener('change', event => { scanner.projectType = event.target.value; });
    byId('scannerCaptureMode')?.addEventListener('change', event => { scanner.captureMode = event.target.value; });
    byId('scannerPhotoButton')?.addEventListener('click',()=>byId('scannerPhotoInput')?.click());
    byId('scannerPhotoInput')?.addEventListener('change',handlePhotos);
    byId('scannerVideoButton')?.addEventListener('click',toggleVideoRecording);
    byId('scannerSaveTranscript')?.addEventListener('click',saveTranscript);
    byId('scannerNativeCapture')?.addEventListener('click',startNativeCapture);
    byId('scannerMeasurementForm')?.addEventListener('submit',saveMeasurement);
    byId('scannerLaserMode')?.addEventListener('click',guidedLaser);
    byId('scannerAiReview')?.addEventListener('click',runAiReview);
    byId('scannerGenerate')?.addEventListener('click',generateDrawing);
    byId('scannerExportSvg')?.addEventListener('click',()=>attachDrawing('svg'));
    byId('scannerExportPng')?.addEventListener('click',()=>attachDrawing('png'));
    byId('scannerExportPdf')?.addEventListener('click',()=>attachDrawing('pdf'));
    byId('scannerComplete')?.addEventListener('click',completeSession);
    byId('scannerAttachQuote')?.addEventListener('click',attachReviewedOutputs);
    const image = byId('scannerReferenceImage');
    image?.addEventListener('click',selectReferencePoint);
    const source = document.querySelector('#scannerMeasurementForm [name="source"]');
    source?.addEventListener('change',event=>{
      const verification=document.querySelector('#scannerMeasurementForm [name="verification"]');
      if(verification) verification.value=sourceDefaultVerification(event.target.value);
    });
  }

  async function handlePhotos(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const first = files.find(file=>file.type.startsWith('image/'));
    if (first) {
      if (scanner.referenceUrl) URL.revokeObjectURL(scanner.referenceUrl);
      scanner.referenceUrl = URL.createObjectURL(first);
      scanner.selectedPoints = [];
    }
    if (typeof window.handleAttachmentFiles !== 'function') throw new Error('Private attachment upload is unavailable.');
    await window.handleAttachmentFiles(files,'Site Capture',scanner.activeSessionId,'Internal');
    safeToast(`${files.length} private site file${files.length===1?'':'s'} queued.`);
    renderScanner();
  }

  function selectReferencePoint(event) {
    const image = event.currentTarget;
    const rect = image.getBoundingClientRect();
    const point = {
      x: Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),
      y: Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))
    };
    if (scanner.selectedPoints.length >= 2) scanner.selectedPoints = [];
    scanner.selectedPoints.push(point);
    const form = byId('scannerMeasurementForm');
    if (form && scanner.selectedPoints.length) {
      form.elements.startX.value = (scanner.selectedPoints[0].x*100).toFixed(3);
      form.elements.startY.value = (scanner.selectedPoints[0].y*100).toFixed(3);
      if (scanner.selectedPoints[1]) {
        form.elements.endX.value = (scanner.selectedPoints[1].x*100).toFixed(3);
        form.elements.endY.value = (scanner.selectedPoints[1].y*100).toFixed(3);
      }
    }
    const overlay = byId('scannerPointOverlay');
    if (overlay) overlay.innerHTML = scanner.selectedPoints.map((p,i)=>`<circle cx="${p.x*1000}" cy="${p.y*1000}" r="18"></circle><text x="${p.x*1000+24}" y="${p.y*1000-24}">${i+1}</text>`).join('') +
      (scanner.selectedPoints.length===2?`<line x1="${scanner.selectedPoints[0].x*1000}" y1="${scanner.selectedPoints[0].y*1000}" x2="${scanner.selectedPoints[1].x*1000}" y2="${scanner.selectedPoints[1].y*1000}"></line>`:'');
  }

  async function toggleVideoRecording() {
    if (scanner.mediaRecorder && scanner.mediaRecorder.state === 'recording') {
      scanner.mediaRecorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      safeToast('This browser cannot record narrated video. Add a video file or use field notes instead.',true);
      return;
    }
    try {
      scanner.mediaStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:true});
      scanner.mediaChunks = [];
      scanner.mediaRecorder = new MediaRecorder(scanner.mediaStream, {mimeType: supportedVideoMime()});
      scanner.mediaRecorder.ondataavailable = event => { if (event.data?.size) scanner.mediaChunks.push(event.data); };
      scanner.mediaRecorder.onstop = finishVideoRecording;
      scanner.mediaRecorder.start(1000);
      startSpeechRecognition();
      const button=byId('scannerVideoButton'); if(button) button.textContent='⏹ Stop Walkthrough';
      const status=byId('scannerVideoStatus'); if(status) status.textContent='Recording narrated walkthrough…';
    } catch (error) {
      safeToast(`Camera/microphone could not start: ${error.message}`,true);
    }
  }

  function supportedVideoMime() {
    const choices=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'];
    return choices.find(type=>MediaRecorder.isTypeSupported(type)) || '';
  }

  function startSpeechRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    try {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = event => {
        for (let i=event.resultIndex;i<event.results.length;i++) {
          if (event.results[i].isFinal) scanner.transcript += `${scanner.transcript?' ':''}${event.results[i][0].transcript.trim()}`;
        }
        const field=byId('scannerTranscript'); if(field) field.value=scanner.transcript;
      };
      recognition.start();
      scanner.speechRecognition=recognition;
    } catch (_) {}
  }

  async function finishVideoRecording() {
    try { scanner.speechRecognition?.stop(); } catch (_) {}
    scanner.mediaStream?.getTracks().forEach(track=>track.stop());
    const mime = scanner.mediaRecorder?.mimeType || 'video/webm';
    const extension = mime.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(scanner.mediaChunks,{type:mime});
    const file = new File([blob],`site-walkthrough-${scanner.activeSessionId}.${extension}`,{type:mime,lastModified:Date.now()});
    if (blob.size && typeof window.handleAttachmentFiles === 'function') {
      await window.handleAttachmentFiles([file],'Site Capture',scanner.activeSessionId,'Internal');
      await saveTranscript();
      safeToast('Narrated walkthrough saved privately.');
    }
    scanner.mediaRecorder=null; scanner.mediaStream=null; scanner.mediaChunks=[];
    renderScanner();
  }

  async function saveTranscript() {
    scanner.transcript = text(byId('scannerTranscript')?.value).trim();
    const record = sessionRecord(scanner.activeSessionId,{'Transcript':scanner.transcript});
    await saveRecord(SESSION_COLLECTION,'Site Capture Session',scanner.activeSessionId,record,['Capture Session ID','captureSessionId']);
    safeToast('Narration saved to the scanner session.');
  }

  async function saveMeasurement(event) {
    event.preventDefault();
    const form=event.currentTarget;
    const data=new FormData(form);
    const source=text(data.get('source'));
    const measurementId=id('SITE-MEASURE');
    const sequence=measurementRows().length+1;
    const record={
      'Site Measurement ID':measurementId,
      'Capture Session ID':scanner.activeSessionId,
      'Business ID':window.state.businessId,
      'Customer ID':currentCustomerId(),
      'Quote ID':text(window.state.quote?.quoteId),
      'Sequence':sequence,
      'Label':text(data.get('label')).trim(),
      'Measurement Type':'Length',
      'Value':number(data.get('measurementValue')),
      'Unit':text(data.get('unit')),
      'Source':SOURCE_VALUES.includes(source)?source:'MANUAL_ENTRY',
      'Confidence':Math.max(0,Math.min(1,number(data.get('confidence')))),
      'Verification Status':normalizeVerification(source,text(data.get('verification'))),
      'Start Point':{x:number(data.get('startX')),y:number(data.get('startY')),coordinateSystem:'SESSION_2D'},
      'End Point':{x:number(data.get('endX')),y:number(data.get('endY')),coordinateSystem:'SESSION_2D'},
      'Linked Frame':'',
      'Linked Device Reading':'',
      'Confirmed By':currentUserId(),
      'Notes':text(data.get('notes')).trim(),
      'Created Time':timestamp(),
      'Updated Time':timestamp(),
      'Record Version':1
    };
    if (!record.Label || record.Value <= 0) throw new Error('Measurement label and positive value are required.');
    await saveRecord(MEASUREMENT_COLLECTION,'Site Measurement',measurementId,record,['Site Measurement ID','measurementId']);
    scanner.selectedPoints=[];
    scanner.geometry=buildGeometry(measurementRows());
    safeToast('Measurement saved with source and confidence.');
    renderScanner();
  }

  function guidedLaser() {
    const form=byId('scannerMeasurementForm');
    if(!form)return;
    form.elements.source.value='MANUAL_LASER';
    form.elements.verification.value='FIELD_MEASURED';
    form.elements.confidence.value='1';
    form.elements.notes.focus();
    safeToast('Select or enter endpoints, take the laser reading, then enter the value.');
  }

  async function startNativeCapture() {
    const native=window.H38NativeScanner;
    if (!native || typeof native.start !== 'function') {
      scanner.captureMode = 'CAMERA_GUIDED';
      const mode=byId('scannerCaptureMode'); if(mode) mode.value='CAMERA_GUIDED';
      safeToast('No signed native AR/LiDAR bridge is installed on this device. Camera-guided capture remains available.',true);
      return;
    }
    try {
      const result=await native.start({
        version:'h38-site-scanner-v1',
        businessId:window.state.businessId,
        customerId:currentCustomerId(),
        quoteId:text(window.state.quote?.quoteId),
        captureSessionId:scanner.activeSessionId,
        projectType:scanner.projectType,
        allowedSources:SOURCE_VALUES
      });
      if (result) await ingestNativeResult(result);
    } catch(error) {
      await logScannerError('NATIVE_CAPTURE_FAILED',error.message,{sessionId:scanner.activeSessionId});
      safeToast(`Native scan failed: ${error.message}`,true);
    }
  }

  async function ingestNativeResult(raw) {
    const result=typeof raw==='string'?JSON.parse(raw):raw;
    if (!result || text(result.captureSessionId)!==scanner.activeSessionId) throw new Error('Native scan returned the wrong capture session.');
    for (const item of Array.isArray(result.entities)?result.entities:[]) {
      const entityId=text(item.id)||id('SPATIAL');
      const record={
        'Spatial Entity ID':entityId,'Capture Session ID':scanner.activeSessionId,'Business ID':window.state.businessId,
        'Quote ID':text(window.state.quote?.quoteId),'Entity Type':text(item.type||'area'),'Label':text(item.label||item.type||'Captured entity'),
        'Geometry':item.geometry||{},'Source':text(item.source||'IMPORTED'),'Confidence':Math.max(0,Math.min(1,number(item.confidence))),
        'Manually Adjusted':false,'Created Time':timestamp(),'Updated Time':timestamp(),'Record Version':1
      };
      await saveRecord(ENTITY_COLLECTION,'Site Spatial Entity',entityId,record,['Spatial Entity ID','spatialEntityId']);
    }
    for (const item of Array.isArray(result.measurements)?result.measurements:[]) {
      const source=SOURCE_VALUES.includes(item.source)?item.source:'IMPORTED';
      const measurementId=text(item.id)||id('SITE-MEASURE');
      const record={
        'Site Measurement ID':measurementId,'Capture Session ID':scanner.activeSessionId,'Business ID':window.state.businessId,
        'Quote ID':text(window.state.quote?.quoteId),'Sequence':measurementRows().length+1,'Label':text(item.label||'Native measurement'),
        'Measurement Type':text(item.type||'Length'),'Value':number(item.value),'Unit':text(item.unit||'m'),
        'Source':source,'Confidence':Math.max(0,Math.min(1,number(item.confidence))),
        'Verification Status':normalizeVerification(source,text(item.verificationStatus||'DEVICE_CAPTURED')),
        'Start Point':item.startPoint||{},'End Point':item.endPoint||{},'Linked Frame':text(item.linkedFrame),
        'Linked Device Reading':text(item.deviceReading),'Confirmed By':currentUserId(),'Notes':text(item.notes),
        'Created Time':timestamp(),'Updated Time':timestamp(),'Record Version':1
      };
      await saveRecord(MEASUREMENT_COLLECTION,'Site Measurement',measurementId,record,['Site Measurement ID','measurementId']);
    }
    const record=sessionRecord(scanner.activeSessionId,{
      'Capture Mode':text(result.captureMode||scanner.captureMode),
      'Device Details':result.device||{},
      'Status':'CAPTURED',
      'Processing Status':'READY_FOR_REVIEW'
    });
    await saveRecord(SESSION_COLLECTION,'Site Capture Session',scanner.activeSessionId,record,['Capture Session ID','captureSessionId']);
    scanner.geometry=buildGeometry(measurementRows());
    safeToast('Native measurements synchronized. Device-captured values still require review.');
    renderScanner();
  }

  function unitScale(unit) {
    return ({in:1/12,ft:1,yd:3,cm:0.0328084,m:3.28084})[text(unit).toLowerCase()] || 1;
  }

  function buildGeometry(measurements) {
    const segments=(measurements||[]).map(row=>{
      const start=value(row,'Start Point','startPoint')||{};
      const end=value(row,'End Point','endPoint')||{};
      return {
        id:recordId(row,'Site Measurement ID','measurementId'),
        label:text(value(row,'Label','label')),
        value:number(value(row,'Value','value')),
        unit:text(value(row,'Unit','unit')||'ft'),
        source:text(value(row,'Source','source')),
        verification:text(value(row,'Verification Status','verificationStatus')),
        confidence:number(value(row,'Confidence','confidence')),
        start:{x:number(start.x),y:number(start.y)},
        end:{x:number(end.x),y:number(end.y)}
      };
    }).filter(segment=>segment.value>0);

    const coordinateSegments=segments.filter(s=>Number.isFinite(s.start.x)&&Number.isFinite(s.start.y)&&Number.isFinite(s.end.x)&&Number.isFinite(s.end.y)&&
      !(s.start.x===0&&s.start.y===0&&s.end.x===0&&s.end.y===0));
    const points=[];
    coordinateSegments.forEach((segment,index)=>{
      if(index===0)points.push(segment.start);
      points.push(segment.end);
    });
    const closed=points.length>=4 && distance(points[0],points[points.length-1])<=Math.max(0.05,averageLength(coordinateSegments)*0.03);
    const polygon=closed?points.slice(0,-1):points;
    const area=closed?shoelace(polygon):0;
    const perimeter=segments.reduce((sum,s)=>sum+s.value*unitScale(s.unit),0);
    const conflicts=detectConflicts(segments);
    return {segments,coordinateSegments,points,closed,area,perimeter,conflicts,svg:svgFromGeometry(coordinateSegments,closed,conflicts)};
  }

  function distance(a,b){return Math.hypot(number(b.x)-number(a.x),number(b.y)-number(a.y));}
  function averageLength(segments){return segments.length?segments.reduce((s,x)=>s+distance(x.start,x.end),0)/segments.length:0;}
  function shoelace(points){
    if(points.length<3)return 0;
    let sum=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];sum+=a.x*b.y-b.x*a.y;}
    return Math.abs(sum)/2;
  }
  function normalizeLabel(label){return text(label).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
  function detectConflicts(segments){
    const groups=new Map();
    segments.forEach(s=>{const key=normalizeLabel(s.label);if(!key)return;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);});
    const conflicts=[];
    groups.forEach((items,label)=>{
      const direct=items.filter(s=>['MANUAL_LASER','BLUETOOTH_LASER','MANUAL_ENTRY'].includes(s.source)&&['FIELD_MEASURED','FIELD_MEASURED_AND_CHECKED'].includes(s.verification));
      if(direct.length<2)return;
      const feet=direct.map(s=>s.value*unitScale(s.unit)),min=Math.min(...feet),max=Math.max(...feet);
      if(max-min>Math.max(0.125,max*0.02))conflicts.push(`${label}: verified readings differ by ${formatNumber(max-min)} ft. Remeasure or make an explicit owner decision.`);
    });
    return conflicts;
  }
  function formatNumber(value){return Number.isFinite(value)?Math.round(value*100)/100:0;}

  function svgFromGeometry(segments,closed,conflicts) {
    if(!segments.length)return '<svg viewBox="0 0 800 500" role="img" aria-label="Empty measured drawing"><text x="40" y="70">No coordinate-linked geometry</text></svg>';
    const all=segments.flatMap(s=>[s.start,s.end]),xs=all.map(p=>p.x),ys=all.map(p=>p.y);
    const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
    const width=Math.max(1,maxX-minX),height=Math.max(1,maxY-minY),scale=Math.min(650/width,350/height),offsetX=75,offsetY=70;
    const map=p=>({x:offsetX+(p.x-minX)*scale,y:offsetY+(maxY-p.y)*scale});
    const lines=segments.map((s,index)=>{
      const a=map(s.start),b=map(s.end),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
      const dash=['UNVERIFIED','DEVICE_CAPTURED'].includes(s.verification)?' stroke-dasharray="8 6"':'';
      return `<g><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"${dash}/><text x="${mx+6}" y="${my-7}">${html(s.label)} — ${html(formatNumber(s.value))} ${html(s.unit)}</text><circle cx="${a.x}" cy="${a.y}" r="4"/><circle cx="${b.x}" cy="${b.y}" r="4"/></g>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" role="img" aria-label="H38 measured site drawing">
      <style>line{stroke:#17354c;stroke-width:3;fill:none}circle{fill:#17354c}text{font:14px Arial,sans-serif;fill:#102b3f}.title{font:bold 22px Arial}.legend{font:12px Arial}.warn{fill:#8a2c1c}</style>
      <text class="title" x="40" y="35">${html(currentProjectTitle())}</text>
      ${lines}
      <text class="legend" x="40" y="440">Solid = field verified where status says so. Dashed = unverified/device captured. Sources remain attached to each measurement.</text>
      <text class="legend" x="40" y="462">Boundary: ${closed?'closed':'open'} · Concept/estimating drawing only; not survey, engineering, fabrication, or permit authority.</text>
      ${conflicts.length?`<text class="warn" x="40" y="486">CONFLICT REVIEW REQUIRED — ${html(conflicts.length)} unresolved conflict(s)</text>`:''}
    </svg>`;
  }

  async function generateDrawing() {
    scanner.geometry=buildGeometry(measurementRows());
    const outputId=id('SITE-OUTPUT');
    const record={
      'Geometry Output ID':outputId,'Capture Session ID':scanner.activeSessionId,'Business ID':window.state.businessId,
      'Customer ID':currentCustomerId(),'Quote ID':text(window.state.quote?.quoteId),'Output Type':'SCALED_SVG_DRAWING',
      'Title':`${currentProjectTitle()} — measured plan`,'SVG':scanner.geometry.svg,'Area':scanner.geometry.area,
      'Perimeter':scanner.geometry.perimeter,'Closed':scanner.geometry.closed,'Conflict Count':scanner.geometry.conflicts.length,
      'Measurement Count':scanner.geometry.segments.length,'Review Status':scanner.geometry.conflicts.length?'BLOCKED_CONFLICT_REVIEW':'DRAFT_INTERNAL_ONLY',
      'Concept Disclaimer':'Estimating concept only. Final dimensions and professional review may be required.',
      'Created By':currentUserId(),'Created Time':timestamp(),'Updated Time':timestamp(),'Record Version':1
    };
    await saveRecord(OUTPUT_COLLECTION,'Site Geometry Output',outputId,record,['Geometry Output ID','geometryOutputId']);
    scanner.generated.svg=record.SVG;
    safeToast(scanner.geometry.conflicts.length?'Drawing generated but blocked by measurement conflicts.':'Scaled drawing generated as an internal draft.',!!scanner.geometry.conflicts.length);
    renderScanner();
  }

  function svgBlob() {
    const geometry=scanner.geometry||buildGeometry(measurementRows());
    return new Blob([geometry.svg],{type:'image/svg+xml'});
  }
  async function pngBlob() {
    const svg=svgBlob(),url=URL.createObjectURL(svg);
    try{
      const image=new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
      const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
      return await new Promise(resolve=>canvas.toBlob(resolve,'image/png',0.92));
    } finally {URL.revokeObjectURL(url);}
  }
  function pdfBlob() {
    const geometry=scanner.geometry||buildGeometry(measurementRows());
    const lines=[
      'H38 Site Scanner - Measured Quote Plan',
      currentProjectTitle(),
      `Quote: ${text(value(currentQuote(),'Quote Number','quoteNumber')||window.state.quote?.quoteId)}`,
      `Session: ${scanner.activeSessionId}`,
      `Boundary: ${geometry.closed?'Closed':'Open'} | Area: ${formatNumber(geometry.area)} | Perimeter: ${formatNumber(geometry.perimeter)} ft`,
      ...geometry.segments.slice(0,30).map(s=>`${s.label}: ${formatNumber(s.value)} ${s.unit} | ${s.source} | ${s.verification} | ${Math.round(s.confidence*100)}%`),
      ...(geometry.conflicts.length?['CONFLICT REVIEW REQUIRED',...geometry.conflicts]:[]),
      'Estimating concept only. Not survey-grade, engineering-grade, fabrication-grade, or permit-ready.'
    ];
    const escaped=lines.map(line=>text(line).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)'));
    const content=['BT','/F1 12 Tf','50 750 Td',...escaped.flatMap((line,i)=>[i?'0 -18 Td':'',`(${line.slice(0,110)}) Tj`]).filter(Boolean),'ET'].join('\n');
    const objects=[
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ];
    let pdf='%PDF-1.4\n',offsets=[0];
    objects.forEach((obj,i)=>{offsets[i+1]=pdf.length;pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
    const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
    for(let i=1;i<=objects.length;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
    pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf],{type:'application/pdf'});
  }

  async function attachDrawing(format) {
    if (!scanner.geometry?.segments?.length) await generateDrawing();
    if (scanner.geometry?.conflicts?.length) {
      safeToast('Resolve measurement conflicts before attaching a drawing.',true);return;
    }
    let blob,mime,extension;
    if(format==='png'){blob=await pngBlob();mime='image/png';extension='png';}
    else if(format==='pdf'){blob=pdfBlob();mime='application/pdf';extension='pdf';}
    else{blob=svgBlob();mime='image/svg+xml';extension='svg';}
    const file=new File([blob],`h38-site-plan-${scanner.activeSessionId}.${extension}`,{type:mime,lastModified:Date.now()});
    await window.handleAttachmentFiles([file],'Site Capture',scanner.activeSessionId,'Internal');
    scanner.generated[format]=true;
    safeToast(`${format.toUpperCase()} drawing attached privately to the scanner session.`);
  }

  async function directSupabaseClient() {
    const config=window.H38_BUSINESS_OFFICE_SUPABASE||{};
    if(!window.supabase||!config.url||!config.publishableKey)throw new Error('Supabase client configuration is unavailable.');
    if(!scanner._client)scanner._client=window.supabase.createClient(config.url,config.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'},
      global:{headers:{'x-client-info':'h38-site-scanner-web-v1'}}
    });
    const {data,error}=await scanner._client.auth.getSession();
    if(error||!data.session)throw error||new Error('Supabase Auth session is required.');
    return {client:scanner._client,session:data.session,config};
  }

  async function runAiReview() {
    const button=byId('scannerAiReview');if(button){button.disabled=true;button.textContent='Reviewing…';}
    try{
      await saveTranscript();
      const {session,config}=await directSupabaseClient();
      const response=await fetch(`${config.url}/functions/v1/${FUNCTION_NAME}`,{
        method:'POST',
        headers:{authorization:`Bearer ${session.access_token}`,apikey:config.publishableKey,'content-type':'application/json'},
        body:JSON.stringify({
          businessId:window.state.businessId,customerId:currentCustomerId(),quoteId:text(window.state.quote?.quoteId),
          captureSessionId:scanner.activeSessionId,projectType:scanner.projectType,projectTitle:currentProjectTitle(),
          transcript:scanner.transcript,measurements:measurementRows().map(row=>({
            id:recordId(row,'Site Measurement ID','measurementId'),label:value(row,'Label','label'),value:value(row,'Value','value'),
            unit:value(row,'Unit','unit'),source:value(row,'Source','source'),verificationStatus:value(row,'Verification Status','verificationStatus'),
            confidence:value(row,'Confidence','confidence')
          }))
        })
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok||payload.status!=='PASS')throw new Error(payload.message||`AI site review failed (${response.status}).`);
      const reviewId=id('SITE-AI');
      const review=Object.assign({
        'AI Review ID':reviewId,'Capture Session ID':scanner.activeSessionId,'Business ID':window.state.businessId,
        'Customer ID':currentCustomerId(),'Quote ID':text(window.state.quote?.quoteId),'Provider':payload.provider||'OpenAI Responses API',
        'Model':payload.model||'server configured','Review Status':'DRAFT_INTERNAL_ONLY','Owner Review Required':true,
        'Automatic Approval':false,'Automatic Customer Sending':false,'Created By':currentUserId(),'Created Time':timestamp(),
        'Updated Time':timestamp(),'Record Version':1
      },{
        'Detected Objects':payload.review?.detectedObjects||[],'Work Areas':payload.review?.workAreas||[],
        'Surfaces And Openings':payload.review?.surfacesAndOpenings||[],'Visible Conditions':payload.review?.visibleConditions||[],
        'Missing Measurements':payload.review?.missingMeasurements||[],'Risks And Clearances':payload.review?.risksAndClearances||[],
        'Scope Draft':payload.review?.scopeDraft||'','Assumptions':payload.review?.assumptions||[],
        'Confidence':payload.review?.confidence||'low'
      });
      await saveRecord(REVIEW_COLLECTION,'Site AI Review',reviewId,review,['AI Review ID','aiReviewId']);
      const sessionRecordUpdated=sessionRecord(scanner.activeSessionId,{'Processing Status':'AI_REVIEW_COMPLETE','Review Status':'OWNER_REVIEW_REQUIRED'});
      await saveRecord(SESSION_COLLECTION,'Site Capture Session',scanner.activeSessionId,sessionRecordUpdated,['Capture Session ID','captureSessionId']);
      scanner.aiReview=review;
      safeToast('AI site review completed. All results remain owner-review required.');
      renderScanner();
    }catch(error){
      await logScannerError('AI_SITE_REVIEW_FAILED',error.message,{sessionId:scanner.activeSessionId});
      safeToast(error.message,true);
    }finally{if(button){button.disabled=false;button.textContent='✨ Run AI Site Review';}}
  }

  async function logScannerError(code,message,context) {
    try{
      const {client}=await directSupabaseClient();
      await client.from('business_error_log').insert({
        business_id:window.state.businessId,actor_user_id:currentUserId(),source:'commercial-app/site-scanner.js',
        error_code:code,message:text(message).slice(0,4000),severity:'error',status:'open',context:context||{}
      });
    }catch(_){}
  }

  async function completeSession() {
    const geometry=scanner.geometry||buildGeometry(measurementRows());
    const status=geometry.conflicts.length?'CONFLICT_REVIEW_REQUIRED':'CAPTURE_COMPLETE';
    const record=sessionRecord(scanner.activeSessionId,{
      'Completed Time':timestamp(),'Status':status,'Processing Status':scanner.aiReview?'AI_REVIEW_COMPLETE':'READY_FOR_REVIEW',
      'Review Status':geometry.conflicts.length?'BLOCKED_CONFLICT_REVIEW':'OWNER_REVIEW_REQUIRED'
    });
    await saveRecord(SESSION_COLLECTION,'Site Capture Session',scanner.activeSessionId,record,['Capture Session ID','captureSessionId']);
    safeToast(geometry.conflicts.length?'Capture marked complete but quote attachment remains blocked by conflicts.':'Capture complete and ready for owner review.',!!geometry.conflicts.length);
    renderScanner();
  }

  async function attachReviewedOutputs() {
    const quote=currentQuote();
    if(!text(window.state?.quote?.quoteId)){safeToast('A saved quote is required.',true);return;}
    if(quoteLocked(quote)){safeToast('Presented or otherwise locked quotes cannot be edited. Duplicate or revise the quote.',true);return;}
    const geometry=scanner.geometry||buildGeometry(measurementRows());
    if(geometry.conflicts.length){safeToast('Resolve measurement conflicts before attaching outputs to the quote.',true);return;}
    const verified=geometry.segments.filter(s=>['FIELD_MEASURED','FIELD_MEASURED_AND_CHECKED','CALCULATED_FROM_VERIFIED'].includes(s.verification));
    const device=geometry.segments.filter(s=>s.verification==='DEVICE_CAPTURED');
    const review=scanner.aiReview||reviewRows()[0]||{};
    const summary=[
      `H38 Site Scanner session: ${scanner.activeSessionId}`,
      `Project type: ${scanner.projectType}`,
      `Field-verified measurements: ${verified.map(s=>`${s.label} ${formatNumber(s.value)} ${s.unit}`).join('; ')||'none'}`,
      `Device-captured/unverified measurements: ${device.map(s=>`${s.label} ${formatNumber(s.value)} ${s.unit} (${s.source})`).join('; ')||'none'}`,
      `Calculated area: ${geometry.closed?formatNumber(geometry.area):'not available — boundary open'}`,
      `Calculated perimeter: ${formatNumber(geometry.perimeter)} ft`,
      value(review,'Scope Draft','scopeDraft')?`AI scope draft (owner review required): ${value(review,'Scope Draft','scopeDraft')}`:'',
      'Scanner outputs are estimating drafts. Verify critical dimensions before ordering, permits, fabrication, or construction.'
    ].filter(Boolean).join('\n');
    const quoteId=text(window.state.quote.quoteId);
    const existingNotes=text(value(quote,'Measurement Notes','measurementNotes')||window.state.quote?.measurementNotes);
    const updated=Object.assign({},quote,{
      'Quote ID':quoteId,'Business ID':window.state.businessId,
      'Measurement Notes':[existingNotes,summary].filter(Boolean).join('\n\n'),
      'Site Scanner Session ID':scanner.activeSessionId,
      'Site Scanner Review Status':'OWNER_REVIEWED_FOR_DRAFT_ATTACHMENT',
      'Updated Time':timestamp(),
      'Record Version':number(value(quote,'Record Version','recordVersion')||1)+1
    });
    await saveRecord('quotes','Quote',quoteId,updated,['Quote ID','quoteId']);
    if(window.state.quote)window.state.quote.measurementNotes=updated['Measurement Notes'];
    const session=sessionRecord(scanner.activeSessionId,{'Review Status':'ATTACHED_TO_DRAFT_QUOTE','Status':'REVIEWED_INTERNAL'});
    await saveRecord(SESSION_COLLECTION,'Site Capture Session',scanner.activeSessionId,session,['Capture Session ID','captureSessionId']);
    safeToast('Reviewed scanner summary attached to the editable draft quote. Nothing was approved or sent.');
    scanner.returnPage='quotes';
    if(typeof window.renderQuotes==='function')window.renderQuotes();
  }

  function addQuoteScannerButton() {
    const tools=document.querySelector('#mainContent .page-tools');
    if(!tools||byId('h38SiteScannerButton'))return;
    const button=document.createElement('button');
    button.id='h38SiteScannerButton';button.type='button';button.className='secondary';button.textContent='📐 Scan Project';
    button.onclick=()=>openScanner('quotes');
    tools.appendChild(button);
  }

  function addMeasureScannerPanel() {
    const main=byId('mainContent');
    if(!main||byId('h38SiteScannerPanel'))return;
    const panel=document.createElement('section');
    panel.id='h38SiteScannerPanel';panel.className='card scanner-launch-card';
    panel.innerHTML=`<div><h2>H38 Site Scanner</h2><p>Use the best capture method supported by this device, then confirm critical dimensions and generate quote-ready drawings.</p></div><button id="h38OpenSiteScanner" type="button">Open Site Scanner</button>`;
    main.prepend(panel);
    byId('h38OpenSiteScanner').onclick=()=>openScanner('measure');
  }

  const baseRenderQuotes=window.renderQuotes;
  if(typeof baseRenderQuotes==='function'){
    window.renderQuotes=function(){baseRenderQuotes.apply(this,arguments);addQuoteScannerButton();};
    try{renderQuotes=window.renderQuotes;}catch(_){}
  }
  const baseRenderMeasure=window.renderMeasure;
  if(typeof baseRenderMeasure==='function'){
    window.renderMeasure=function(){baseRenderMeasure.apply(this,arguments);addMeasureScannerPanel();};
    try{renderMeasure=window.renderMeasure;}catch(_){}
  }

  window.addEventListener('h38:native-scan-result',event=>{
    ingestNativeResult(event.detail).catch(error=>{logScannerError('NATIVE_RESULT_REJECTED',error.message,{});safeToast(error.message,true);});
  });
  window.H38_SITE_SCANNER={
    build:BUILD,open:openScanner,ingestNativeResult,buildGeometry,
    sources:SOURCE_VALUES.slice(),verificationStatuses:VERIFICATION_VALUES.slice(),
    product:'H38 Site Scanner',databaseAuthority:'existing Supabase Business Office'
  };
  try { if (PAGE_DEFS && PAGE_DEFS.measure) PAGE_DEFS.measure=['📐','Site Scanner']; } catch (_) {}
})();