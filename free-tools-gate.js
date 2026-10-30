/* Free Tools download email gate (free-tools.html only).
   Workbook downloads ask for an email address first (format check only, by
   design). The address is recorded as a lead in the same public intake the
   Start a Request form uses — it lands in the Business Office "BO Requests"
   list for owner review — then the download starts right away. Browser tools
   are never gated. Once an email is given in this browser, it is remembered
   (localStorage) and later downloads start without asking again. */
(function () {
  'use strict';
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbzsSyZValIpFzJK-TH92OM_xWyXt8BPfWzOBXIwK9Y0w99MRRV3NxpdLpg2PXvGeXyPjQ/exec';
  var STORAGE_KEY = 'h38-free-tools-email';
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var gateCount = 0;
  var openGate = null;

  function savedEmail() {
    try { return window.localStorage.getItem(STORAGE_KEY) || ''; } catch (error) { return ''; }
  }
  function saveEmail(email) {
    try { window.localStorage.setItem(STORAGE_KEY, email); } catch (error) { /* private mode: gate still works per download */ }
  }
  function fileName(url) {
    var parts = String(url).split('/');
    return parts[parts.length - 1] || String(url);
  }
  function startDownload(url) {
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.setAttribute('download', '');
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  /* Same hidden-form + iframe transport as request-flow.js (the Start a
     Request form): the POST is what writes the record in the intake. The
     endpoint also confirms by postMessage with a requestId in browsers where
     that channel completes; the download never waits on it. A "h38-ft-lead"
     event reports the send immediately (with the idempotency key) and the
     confirmation if one arrives. */
  function recordLead(email, url) {
    var file = fileName(url);
    var idempotencyKey = 'FT-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    var payload = {
      idempotencyKey: idempotencyKey,
      source: 'free-tools-download',
      website: '',
      name: 'Free Tools download',
      email: email,
      phone: '',
      preferredContact: 'Email',
      desiredOutcome: 'Free Tools workbook download',
      catalogId: 'FREE-TOOLS',
      problem: 'Free Tools download: ' + file,
      finishedResult: 'Workbook downloaded from the Free Tools page: ' + file,
      filesOrLinks: url,
      details: 'Source page: free-tools.html',
      budget: '',
      timing: ''
    };
    var nonce = 'FTGATE-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    var frame = document.createElement('iframe');
    frame.name = 'h38-ft-gate-' + nonce;
    frame.hidden = true;
    frame.setAttribute('title', 'Download lead record');
    var post = document.createElement('form');
    post.method = 'post';
    post.action = ENDPOINT;
    post.target = frame.name;
    post.hidden = true;
    var payloadInput = document.createElement('input');
    payloadInput.name = 'payload';
    payloadInput.value = JSON.stringify(payload);
    var nonceInput = document.createElement('input');
    nonceInput.name = 'nonce';
    nonceInput.value = nonce;
    post.append(payloadInput, nonceInput);
    document.body.append(frame, post);
    var finished = false;
    var timer = setTimeout(function () { finish(); }, 45000);
    function finish(data) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      setTimeout(function () { frame.remove(); post.remove(); }, 0);
      if (data) {
        document.dispatchEvent(new CustomEvent('h38-ft-lead', {
          detail: { file: file, email: email, idempotencyKey: idempotencyKey, sent: true, confirmed: true, ok: Boolean(data.ok), requestId: data.requestId || '' }
        }));
      }
    }
    function receive(event) {
      var message = event.data;
      if (!message || message.type !== 'h38-public-intake' || message.nonce !== nonce) return;
      finish(message.payload || {});
    }
    window.addEventListener('message', receive);
    post.submit();
    document.dispatchEvent(new CustomEvent('h38-ft-lead', {
      detail: { file: file, email: email, idempotencyKey: idempotencyKey, sent: true, confirmed: false, ok: null, requestId: '' }
    }));
  }

  function closeGate() {
    if (openGate) { openGate.remove(); openGate = null; }
  }

  function showGate(link) {
    closeGate();
    var card = link.closest('.pi-card');
    var body = (card && card.querySelector('.pi-card-body')) || link.parentElement;
    gateCount += 1;
    var inputId = 'ft-gate-email-' + gateCount;
    var form = document.createElement('form');
    form.className = 'ft-gate';
    form.setAttribute('novalidate', '');
    form.innerHTML =
      '<p><strong>One quick step.</strong> Enter your email and your download starts right away.</p>' +
      '<label for="' + inputId + '">Email address</label>' +
      '<input id="' + inputId + '" type="email" name="email" autocomplete="email" placeholder="you@company.com">' +
      '<p class="ft-gate-error" role="alert" hidden></p>' +
      '<div class="ft-gate-actions"><button type="submit" class="pi-btn primary">Download workbook ↓</button>' +
      '<button type="button" class="ft-gate-cancel">Cancel</button></div>' +
      '<p class="pi-note">Highway 38 keeps your email so we can follow up about the tools. No spam.</p>';
    body.appendChild(form);
    openGate = form;
    var input = form.querySelector('input');
    var error = form.querySelector('.ft-gate-error');
    form.querySelector('.ft-gate-cancel').addEventListener('click', function () { closeGate(); link.focus(); });
    form.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { closeGate(); link.focus(); }
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var email = String(input.value || '').trim();
      if (!EMAIL_RE.test(email)) {
        error.textContent = 'That email does not look right — check it and try again.';
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      saveEmail(email.toLowerCase());
      recordLead(email.toLowerCase(), link.href);
      closeGate();
      startDownload(link.href);
    });
    input.focus();
  }

  var links = Array.prototype.slice.call(document.querySelectorAll('a[download][href*="free-tools/downloads/"]'));
  links.forEach(function (link) {
    link.addEventListener('click', function (event) {
      var email = savedEmail();
      if (email) {
        /* Email already given in this browser: record the download and let
           the link's normal download proceed without asking again. */
        recordLead(email, link.href);
        return;
      }
      event.preventDefault();
      showGate(link);
    });
  });
})();
