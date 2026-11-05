// Trial signup page controller (trial-signup.html).
// Password mode: POSTs to the h38-trial-signup edge function, then signs in
// on this device so the Office opens already authenticated.
// Google mode: OAuth first; on return, the session turns the form into the
// business-details step and the same endpoint provisions onto that identity.
(function () {
  'use strict';

  var SUPABASE_URL = 'https://jqukmwtsgcsaruucnqja.supabase.co';
  var PUBLISHABLE_KEY = 'sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1';
  var SIGNUP_ENDPOINT = SUPABASE_URL + '/functions/v1/h38-trial-signup';
  var client = window.supabase.createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }
  });
  var form = document.getElementById('trial-form');
  var errorBox = document.getElementById('trial-error');
  var okBox = document.getElementById('trial-ok');
  var submitBtn = document.getElementById('trial-submit');
  var googleBtn = document.getElementById('google-start');
  var googleSession = null;

  function showError(message) { errorBox.textContent = message; errorBox.style.display = 'block'; okBox.style.display = 'none'; }
  function showOk(message) { okBox.textContent = message; okBox.style.display = 'block'; errorBox.style.display = 'none'; }
  function setBusy(busy) {
    submitBtn.disabled = busy; googleBtn.disabled = busy;
    submitBtn.textContent = busy ? 'Setting up your Office…' : (googleSession ? 'Create my trial Office' : 'Start my free trial');
  }

  function officeUrl(businessKey) {
    var url = new URL('commercial-app/index.html', location.href);
    if (businessKey) url.searchParams.set('businessKey', businessKey);
    return url.toString();
  }

  // Coming back from Google: a session exists, so the form becomes the
  // business-details step for that signed-in identity.
  client.auth.getSession().then(function (result) {
    var session = result && result.data && result.data.session;
    if (session && session.user) {
      googleSession = session;
      document.getElementById('password-fields').style.display = 'none';
      document.getElementById('email').removeAttribute('required');
      document.getElementById('password').removeAttribute('required');
      document.getElementById('email').value = session.user.email || '';
      submitBtn.textContent = 'Create my trial Office';
      showOk('Signed in with Google as ' + (session.user.email || 'your account') + '. Add your business name and your trial starts.');
    }
  });

  googleBtn.addEventListener('click', function () {
    client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href.split('#')[0] } });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var businessName = document.getElementById('businessName').value.trim();
    var ownerName = document.getElementById('ownerName').value.trim();
    var timezone = document.getElementById('timezone').value;
    var website = document.getElementById('website').value;
    if (businessName.length < 2) { showError('Enter your business name.'); return; }
    if (ownerName.length < 2) { showError('Enter your name.'); return; }
    setBusy(true); errorBox.style.display = 'none';

    var payload = { businessName: businessName, ownerName: ownerName, timezone: timezone, website: website };
    var headers = { 'Content-Type': 'application/json' };

    function finish(data) {
      showOk('Your Office is ready — 30 days free, no card on file. Taking you in…');
      setTimeout(function () { location.href = officeUrl(data.businessKey); }, 900);
    }
    function fail(data) {
      setBusy(false);
      showError((data && data.message) || 'Signup could not be completed. Please try again.');
    }
    function unreachable() {
      setBusy(false);
      showError('Signup could not be reached. Check your connection and try again.');
    }
    function postSignup() {
      return fetch(SIGNUP_ENDPOINT, { method: 'POST', headers: headers, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); });
    }

    if (googleSession) {
      headers['Authorization'] = 'Bearer ' + googleSession.access_token;
      postSignup().then(function (res) {
        if (res.data && res.data.ok) finish(res.data); else fail(res.data);
      }).catch(unreachable);
      return;
    }

    var email = document.getElementById('email').value.trim();
    var password = document.getElementById('password').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setBusy(false); showError('Enter a valid email address.'); return; }
    if (password.length < 8) { setBusy(false); showError('Password must be at least 8 characters.'); return; }
    payload.email = email; payload.password = password;

    postSignup().then(function (res) {
      if (res.data && res.data.ok) {
        // Sign in on this device so the Office opens already authenticated.
        client.auth.signInWithPassword({ email: email, password: password }).then(function () { finish(res.data); });
      } else {
        fail(res.data);
      }
    }).catch(unreachable);
  });
})();
