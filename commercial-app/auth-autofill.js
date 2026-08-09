(function () {
  'use strict';
  const BUILD = '20260809-login-invite-final';
  let scheduled = false;
  let invitationTimer = 0;

  function nativeBridge() {
    return window.AndroidH38Native || null;
  }

  function isAndroidApp() {
    const bridge = nativeBridge();
    return !!bridge && typeof bridge.requestAutofill === 'function';
  }

  function requestAutofill(email) {
    const bridge = nativeBridge();
    if (!bridge || typeof bridge.requestAutofill !== 'function') return;
    try {
      if (email) {
        email.focus({preventScroll:true});
        if (typeof email.setSelectionRange === 'function') {
          const n = String(email.value || '').length;
          email.setSelectionRange(n, n);
        }
      }
    } catch (_) {
      try { email?.focus?.(); } catch (_) {}
    }
    setTimeout(() => {
      try { bridge.requestAutofill(); } catch (_) {}
    }, 60);
  }

  function rememberLogin(email,password) {
    const bridge = nativeBridge();
    if (!bridge || typeof bridge.rememberLogin !== 'function') return;
    const username = String(email?.value || '').trim();
    const secret = String(password?.value || '');
    if (!username || !secret) return;
    try { bridge.rememberLogin(username, secret); } catch (_) {}
  }

  function invitationPending() {
    try { return new URLSearchParams(location.search).get('invitation') === '1'; }
    catch (_) { return false; }
  }

  function clearInvitationFlag() {
    try {
      const url = new URL(location.href);
      url.searchParams.delete('invitation');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    } catch (_) {}
  }

  function watchInvitationCompletion() {
    const notice = document.getElementById('h38AuthNotice');
    if (!notice || notice.dataset.invitationWatch === BUILD) return;
    notice.dataset.invitationWatch = BUILD;
    const finishIfDone = () => {
      const text = String(notice.textContent || '');
      if (/Password updated\. Opening the Business Office/i.test(text)) clearInvitationFlag();
    };
    new MutationObserver(finishIfDone).observe(notice, {childList:true,subtree:true,characterData:true});
    finishIfDone();
  }

  function enforceInvitationPasswordSetup() {
    if (!invitationPending()) {
      if (invitationTimer) {
        clearInterval(invitationTimer);
        invitationTimer = 0;
      }
      return;
    }
    const auth = window.H38_SUPABASE_AUTH;
    if (!auth || typeof auth.getState !== 'function' || typeof auth.render !== 'function') return;
    let state = {};
    try { state = auth.getState() || {}; } catch (_) { return; }
    if (!state.userId) return;
    if (!document.getElementById('h38RecoveryForm')) {
      auth.render('recovery');
    }
    watchInvitationCompletion();
  }

  function enhance() {
    scheduled = false;
    enforceInvitationPasswordSetup();

    const form = document.getElementById('h38AuthForm');
    if (!form || form.dataset.autofillReady === BUILD) return;
    form.dataset.autofillReady = BUILD;
    form.setAttribute('autocomplete','on');

    const email = document.getElementById('h38AuthEmail');
    const password = document.getElementById('h38AuthPassword');
    if (email) {
      email.name = 'username';
      email.autocomplete = 'username';
      email.inputMode = 'email';
      email.setAttribute('autocapitalize','none');
      email.setAttribute('spellcheck','false');
      email.setAttribute('enterkeyhint','next');
    }
    if (password) {
      password.name = 'password';
      password.autocomplete = 'current-password';
      password.setAttribute('enterkeyhint','go');
    }

    form.addEventListener('submit', () => rememberLogin(email,password), {once:true});

    let button = document.getElementById('h38UseSavedLogin');
    if (isAndroidApp() && !button) {
      button = document.createElement('button');
      button.id = 'h38UseSavedLogin';
      button.type = 'button';
      button.className = 'secondary h38-saved-login';
      button.textContent = '🔐 Use saved username and password';
      button.addEventListener('click', () => requestAutofill(email));
      const actions = form.querySelector('.welcome-actions');
      if (actions) actions.appendChild(button);
      else form.appendChild(button);
    } else if (!isAndroidApp() && button) {
      button.remove();
      button = null;
    }

    let help = document.getElementById('h38AutofillHelp');
    if (!help) {
      help = document.createElement('p');
      help.id = 'h38AutofillHelp';
      help.className = 'muted h38-autofill-help';
      form.appendChild(help);
    }
    help.textContent = isAndroidApp()
      ? 'Tap Use saved username and password to ask Android for the saved Highway 38 login, or type normally.'
      : 'Enter your email and password, then tap Sign in.';

    window.addEventListener('h38:saved-login-filled', () => {
      if (help) help.textContent = 'Saved username and password filled. Tap Sign in.';
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(enhance);
  }

  function start() {
    const main = document.getElementById('mainContent');
    if (main) new MutationObserver(schedule).observe(main,{childList:true,subtree:true});
    if (invitationPending() && !invitationTimer) invitationTimer = setInterval(enforceInvitationPasswordSetup, 150);
    schedule();
  }

  window.H38_AUTH_AUTOFILL = {build:BUILD,request:requestAutofill};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();