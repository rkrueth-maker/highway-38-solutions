(function () {
  'use strict';
  const BUILD = '20260809-local-login-button-truthful';
  let scheduled = false;

  function nativeBridge() {
    return window.AndroidH38Native || null;
  }

  function hasLocalSavedLogin() {
    const bridge = nativeBridge();
    if (!bridge || typeof bridge.getCapabilities !== 'function') return false;
    try {
      const caps = JSON.parse(bridge.getCapabilities() || '{}');
      return caps.localSavedLogin === true;
    } catch (_) {
      return false;
    }
  }

  function requestAutofill() {
    const bridge = nativeBridge();
    if (!bridge || typeof bridge.requestAutofill !== 'function') return;
    try { bridge.requestAutofill(); } catch (_) {}
  }

  function rememberLogin(email,password) {
    const bridge = nativeBridge();
    if (!bridge || typeof bridge.rememberLogin !== 'function') return;
    const username = String(email?.value || '').trim();
    const secret = String(password?.value || '');
    if (!username || !secret) return;
    try { bridge.rememberLogin(username, secret); } catch (_) {}
  }

  function enhance() {
    scheduled = false;
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
    const localSaved = hasLocalSavedLogin();
    if (localSaved && !button) {
      button = document.createElement('button');
      button.id = 'h38UseSavedLogin';
      button.type = 'button';
      button.className = 'secondary h38-saved-login';
      button.textContent = '🔐 Use saved username and password';
      button.addEventListener('click', requestAutofill);
      const actions = form.querySelector('.welcome-actions');
      if (actions) actions.appendChild(button);
      else form.appendChild(button);
    } else if (!localSaved && button) {
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
    help.textContent = localSaved
      ? 'Saved login is available on this phone. Tap the saved-login button to fill both fields, then tap Sign in.'
      : 'Enter your email and password, then tap Sign in. After a successful sign-in this phone can remember the login for next time.';

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
    schedule();
  }

  window.H38_AUTH_AUTOFILL = {build:BUILD,request:requestAutofill};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();